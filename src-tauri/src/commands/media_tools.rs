use log::{debug, warn};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::{
    process::{Command, CommandChild, CommandEvent, Output},
    ShellExt,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FfmpegStatus {
    pub available: bool,
    pub source: String,
    pub platform: String,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub version: Option<String>,
    pub hardware_encoder: Option<String>,
    pub hardware_vendor: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Copy, Debug)]
enum BinaryKind {
    Ffmpeg,
    Ffprobe,
}

#[derive(Clone, Debug)]
enum ResolvedProgram {
    Sidecar(&'static str),
    System(String),
}

#[derive(Clone, Debug)]
struct ResolvedBinary {
    source: &'static str,
    path: String,
    program: ResolvedProgram,
}

#[derive(Clone, Debug)]
pub struct VideoEncoderSelection {
    pub name: String,
    pub source: &'static str,
    pub path: String,
    pub hardware: bool,
    pub vendor: Option<&'static str>,
    pub device: Option<String>,
    binary: ResolvedBinary,
}

const WINDOWS_HARDWARE_ENCODERS: &[(&str, &str)] = &[
    ("h264_amf", "amd"),
    ("h264_nvenc", "nvidia"),
    ("h264_qsv", "intel"),
];
const LINUX_HARDWARE_ENCODERS: &[(&str, &str)] = &[
    ("h264_vaapi", "amd"),
    ("h264_nvenc", "nvidia"),
    ("h264_qsv", "intel"),
];
const MACOS_HARDWARE_ENCODERS: &[(&str, &str)] = &[("h264_videotoolbox", "apple")];

impl BinaryKind {
    fn label(self) -> &'static str {
        match self {
            Self::Ffmpeg => "ffmpeg",
            Self::Ffprobe => "ffprobe",
        }
    }

    fn sidecar_name(self) -> &'static str {
        match self {
            Self::Ffmpeg => "binaries/ffmpeg",
            Self::Ffprobe => "binaries/ffprobe",
        }
    }
}

#[tauri::command]
pub async fn check_ffmpeg(app: AppHandle) -> FfmpegStatus {
    inspect_ffmpeg_runtime(&app).await
}

pub async fn inspect_ffmpeg_runtime<R: Runtime>(app: &AppHandle<R>) -> FfmpegStatus {
    let platform = current_platform().to_string();

    match resolve_binary(app, BinaryKind::Ffmpeg).await {
        Ok(ffmpeg) => {
            let ffprobe = match resolve_binary(app, BinaryKind::Ffprobe).await {
                Ok(binary) => binary,
                Err(error) => {
                    return FfmpegStatus {
                        available: false,
                        source: "missing".to_string(),
                        platform,
                        ffmpeg_path: Some(ffmpeg.path),
                        ffprobe_path: None,
                        version: None,
                        hardware_encoder: None,
                        hardware_vendor: None,
                        error: Some(error),
                    }
                }
            };

            let selection = select_video_encoder(app, true).await.ok();
            let version = command_output(app, &ffmpeg, vec!["-version".into()])
                .await
                .ok()
                .and_then(|output| first_non_empty_line(&output.stdout));

            FfmpegStatus {
                available: true,
                source: selection
                    .as_ref()
                    .map(|encoder| encoder.source)
                    .unwrap_or(ffmpeg.source)
                    .to_string(),
                platform,
                ffmpeg_path: Some(
                    selection
                        .as_ref()
                        .map(|encoder| encoder.path.clone())
                        .unwrap_or(ffmpeg.path),
                ),
                ffprobe_path: Some(ffprobe.path),
                version,
                hardware_encoder: selection
                    .as_ref()
                    .filter(|encoder| encoder.hardware)
                    .map(|encoder| encoder.name.clone()),
                hardware_vendor: selection
                    .as_ref()
                    .filter(|encoder| encoder.hardware)
                    .and_then(|encoder| encoder.vendor.map(str::to_string)),
                error: None,
            }
        }
        Err(error) => FfmpegStatus {
            available: false,
            source: "missing".to_string(),
            platform,
            ffmpeg_path: None,
            ffprobe_path: None,
            version: None,
            hardware_encoder: None,
            hardware_vendor: None,
            error: Some(error),
        },
    }
}

pub async fn ffmpeg_output<R: Runtime>(
    app: &AppHandle<R>,
    args: Vec<String>,
) -> Result<Output, String> {
    let binary = resolve_binary(app, BinaryKind::Ffmpeg).await?;
    command_output(app, &binary, args).await
}

pub async fn ffprobe_output<R: Runtime>(
    app: &AppHandle<R>,
    args: Vec<String>,
) -> Result<Output, String> {
    let binary = resolve_binary(app, BinaryKind::Ffprobe).await?;
    command_output(app, &binary, args).await
}

pub async fn ffmpeg_spawn<R: Runtime>(
    app: &AppHandle<R>,
    args: Vec<String>,
) -> Result<(ResolvedSpawn, CommandChild), String> {
    let binary = resolve_binary(app, BinaryKind::Ffmpeg).await?;
    spawn_with_binary(app, &binary, args)
}

pub async fn ffmpeg_spawn_with_encoder<R: Runtime>(
    app: &AppHandle<R>,
    encoder: &VideoEncoderSelection,
    args: Vec<String>,
) -> Result<(ResolvedSpawn, CommandChild), String> {
    spawn_with_binary(app, &encoder.binary, args)
}

fn spawn_with_binary<R: Runtime>(
    app: &AppHandle<R>,
    binary: &ResolvedBinary,
    args: Vec<String>,
) -> Result<(ResolvedSpawn, CommandChild), String> {
    let command = build_command(app, binary, args)?;
    let (rx, child) = command
        .spawn()
        .map_err(|error| format!("Failed to start FFmpeg: {}", error))?;

    Ok((ResolvedSpawn { receiver: rx }, child))
}

pub struct ResolvedSpawn {
    pub receiver: tokio::sync::mpsc::Receiver<CommandEvent>,
}

pub async fn select_video_encoder<R: Runtime>(
    app: &AppHandle<R>,
    use_hardware: bool,
) -> Result<VideoEncoderSelection, String> {
    let hardware_candidates = hardware_encoder_candidates();

    if use_hardware {
        if let Ok(binary) = probe_sidecar(app, BinaryKind::Ffmpeg).await {
            for (name, vendor) in
                find_supported_hardware_encoders(app, &binary, hardware_candidates).await
            {
                let (device, detected_vendor) = vaapi_device_info(name);
                if (name != "h264_vaapi" || device.is_some())
                    && probe_hardware_encoder(app, &binary, name, device.as_deref()).await
                {
                    return Ok(VideoEncoderSelection {
                        name: name.to_string(),
                        source: binary.source,
                        path: binary.path.clone(),
                        hardware: true,
                        vendor: detected_vendor.or(Some(vendor)),
                        device,
                        binary,
                    });
                }
            }
        }

        if let Ok(binary) = probe_system(app, BinaryKind::Ffmpeg).await {
            for (name, vendor) in
                find_supported_hardware_encoders(app, &binary, hardware_candidates).await
            {
                let (device, detected_vendor) = vaapi_device_info(name);
                if (name != "h264_vaapi" || device.is_some())
                    && probe_hardware_encoder(app, &binary, name, device.as_deref()).await
                {
                    return Ok(VideoEncoderSelection {
                        name: name.to_string(),
                        source: binary.source,
                        path: binary.path.clone(),
                        hardware: true,
                        vendor: detected_vendor.or(Some(vendor)),
                        device,
                        binary,
                    });
                }
            }
        }
    }

    let binary = resolve_binary(app, BinaryKind::Ffmpeg).await?;
    Ok(VideoEncoderSelection {
        name: "libx264".to_string(),
        source: binary.source,
        path: binary.path.clone(),
        hardware: false,
        vendor: None,
        device: None,
        binary,
    })
}

async fn find_supported_hardware_encoders<R: Runtime>(
    app: &AppHandle<R>,
    binary: &ResolvedBinary,
    candidates: &'static [(&'static str, &'static str)],
) -> Vec<(&'static str, &'static str)> {
    let Ok(output) =
        command_output(app, binary, vec!["-hide_banner".into(), "-encoders".into()]).await
    else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&output.stdout);
    candidates
        .iter()
        .filter(|(name, _)| {
            text.lines()
                .any(|line| line.split_whitespace().any(|token| token == *name))
        })
        .copied()
        .collect()
}

fn hardware_encoder_candidates() -> &'static [(&'static str, &'static str)] {
    if cfg!(target_os = "windows") {
        WINDOWS_HARDWARE_ENCODERS
    } else if cfg!(target_os = "macos") {
        MACOS_HARDWARE_ENCODERS
    } else {
        LINUX_HARDWARE_ENCODERS
    }
}

fn vaapi_device_info(encoder: &str) -> (Option<String>, Option<&'static str>) {
    if encoder != "h264_vaapi" || !cfg!(target_os = "linux") {
        return (None, None);
    }

    let Some(path) = std::fs::read_dir("/dev/dri").ok().and_then(|entries| {
        entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("renderD"))
            })
    }) else {
        return (None, None);
    };

    let vendor = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| {
            std::fs::read_to_string(format!("/sys/class/drm/{name}/device/vendor")).ok()
        })
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "0x1002" => Some("amd"),
            "0x10de" => Some("nvidia"),
            "0x8086" => Some("intel"),
            _ => None,
        });

    (Some(path.to_string_lossy().into_owned()), vendor)
}

async fn probe_hardware_encoder<R: Runtime>(
    app: &AppHandle<R>,
    binary: &ResolvedBinary,
    encoder: &str,
    device: Option<&str>,
) -> bool {
    let mut args = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
    if let Some(device) = device {
        args.extend(["-vaapi_device".into(), device.into()]);
    }
    args.extend([
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        // 128x128 is the minimum frame size required by AMD VAAPI encoders.
        // The previous 16x16 probe failed on AMD GPUs; do not reduce this.
        "color=c=black:s=128x128:d=0.1".into(),
        "-frames:v".into(),
        "1".into(),
        "-an".into(),
    ]);
    if encoder == "h264_vaapi" {
        args.extend(["-vf".into(), "format=nv12,hwupload".into()]);
    }
    args.extend([
        "-c:v".into(),
        encoder.into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);

    command_output(app, binary, args)
        .await
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn resolve_binary<R: Runtime>(
    app: &AppHandle<R>,
    kind: BinaryKind,
) -> Result<ResolvedBinary, String> {
    if prefers_sidecar() {
        if let Ok(binary) = probe_sidecar(app, kind).await {
            return Ok(binary);
        }
    }

    if let Ok(binary) = probe_system(app, kind).await {
        return Ok(binary);
    }

    if !prefers_sidecar() {
        if let Ok(binary) = probe_sidecar(app, kind).await {
            return Ok(binary);
        }
    }

    Err(missing_binary_message(kind))
}

fn prefers_sidecar() -> bool {
    cfg!(not(debug_assertions)) || cfg!(target_os = "windows") || cfg!(target_os = "macos")
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

async fn probe_sidecar<R: Runtime>(
    app: &AppHandle<R>,
    kind: BinaryKind,
) -> Result<ResolvedBinary, String> {
    let command = app
        .shell()
        .sidecar(kind.sidecar_name())
        .map_err(|error| error.to_string())?;

    let output = command
        .args(["-version"])
        .output()
        .await
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    debug!(
        "[{}] Using bundled sidecar {}",
        kind.label(),
        kind.sidecar_name()
    );

    Ok(ResolvedBinary {
        source: "bundled",
        path: kind.sidecar_name().to_string(),
        program: ResolvedProgram::Sidecar(kind.sidecar_name()),
    })
}

async fn probe_system<R: Runtime>(
    app: &AppHandle<R>,
    kind: BinaryKind,
) -> Result<ResolvedBinary, String> {
    let path = which::which(kind.label()).map_err(|error| error.to_string())?;
    let program = path.to_string_lossy().to_string();
    let output = app
        .shell()
        .command(program.clone())
        .args(["-version"])
        .output()
        .await
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    debug!("[{}] Using system binary {}", kind.label(), program);

    Ok(ResolvedBinary {
        source: "system",
        path: program.clone(),
        program: ResolvedProgram::System(program),
    })
}

fn build_command<R: Runtime>(
    app: &AppHandle<R>,
    binary: &ResolvedBinary,
    args: Vec<String>,
) -> Result<Command, String> {
    let mut command = match &binary.program {
        ResolvedProgram::Sidecar(name) => app
            .shell()
            .sidecar(name)
            .map_err(|error| format!("Failed to prepare sidecar {}: {}", name, error))?,
        ResolvedProgram::System(program) => app.shell().command(program.clone()),
    };
    command = command.args(args);
    Ok(command)
}

async fn command_output<R: Runtime>(
    app: &AppHandle<R>,
    binary: &ResolvedBinary,
    args: Vec<String>,
) -> Result<Output, String> {
    let command = build_command(app, binary, args)?;
    command
        .output()
        .await
        .map_err(|error| format!("Failed to execute {}: {}", binary.path, error))
}

fn first_non_empty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}

fn missing_binary_message(kind: BinaryKind) -> String {
    let tool = kind.label();
    if cfg!(target_os = "windows") {
        return format!("{} was not found in this Windows installation.", tool);
    }

    if cfg!(target_os = "macos") {
        return format!("{} was not found in this macOS installation.", tool);
    }

    warn!("[{}] Missing runtime dependency", tool);
    format!("{} was not found in this Linux installation.", tool)
}

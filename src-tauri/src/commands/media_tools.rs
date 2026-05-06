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
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub version: Option<String>,
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
    match resolve_binary(app, BinaryKind::Ffmpeg).await {
        Ok(ffmpeg) => {
            let ffprobe = match resolve_binary(app, BinaryKind::Ffprobe).await {
                Ok(binary) => binary,
                Err(error) => {
                    return FfmpegStatus {
                        available: false,
                        source: "missing".to_string(),
                        ffmpeg_path: Some(ffmpeg.path),
                        ffprobe_path: None,
                        version: None,
                        error: Some(error),
                    }
                }
            };

            let version = command_output(app, &ffmpeg, vec!["-version".into()])
                .await
                .ok()
                .and_then(|output| first_non_empty_line(&output.stdout));

            FfmpegStatus {
                available: true,
                source: ffmpeg.source.to_string(),
                ffmpeg_path: Some(ffmpeg.path),
                ffprobe_path: Some(ffprobe.path),
                version,
                error: None,
            }
        }
        Err(error) => FfmpegStatus {
            available: false,
            source: "missing".to_string(),
            ffmpeg_path: None,
            ffprobe_path: None,
            version: None,
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
    let command = build_command(app, &binary, args)?;
    let (rx, child) = command
        .spawn()
        .map_err(|error| format!("No se pudo iniciar FFmpeg: {}", error))?;

    Ok((
        ResolvedSpawn {
            receiver: rx,
        },
        child,
    ))
}

pub struct ResolvedSpawn {
    pub receiver: tokio::sync::mpsc::Receiver<CommandEvent>,
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
    cfg!(target_os = "windows") || cfg!(target_os = "macos")
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
            .map_err(|error| format!("No se pudo preparar el sidecar {}: {}", name, error))?,
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
        .map_err(|error| format!("No se pudo ejecutar {}: {}", binary.path, error))
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
        return format!(
            "No se encontro {}. Si instalaste Cliprithm con el instalador oficial, reinstala o actualiza la app para recuperar los binarios empaquetados. Si estas ejecutando el proyecto desde codigo fuente, instala FFmpeg y agrega sus binarios al PATH de Windows.",
            tool
        );
    }

    if cfg!(target_os = "macos") {
        return format!(
            "No se encontro {}. Si usas la app empaquetada, reinstalala o actualizala para recuperar los binarios incluidos. Si ejecutas desde codigo fuente, instala FFmpeg con Homebrew (`brew install ffmpeg`) y vuelve a abrir Cliprithm.",
            tool
        );
    }

    warn!("[{}] Missing runtime dependency", tool);
    format!(
        "No se encontro {}. Instala FFmpeg/FFprobe desde tu gestor de paquetes y vuelve a abrir Cliprithm. Ejemplos: `sudo pacman -S ffmpeg`, `sudo apt install ffmpeg` o `sudo dnf install ffmpeg`.",
        tool
    )
}

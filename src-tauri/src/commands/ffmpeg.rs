use log::{debug, error, info, warn};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager, Window};
use tauri_plugin_shell::process::CommandEvent;

use crate::commands::media_tools::{
    ffmpeg_output, ffmpeg_spawn, ffmpeg_spawn_with_encoder, ffprobe_output, select_video_encoder,
    VideoEncoderSelection,
};

static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(1);
static JOBS: OnceLock<Mutex<JobRegistry>> = OnceLock::new();

const MAX_ACTIVE_JOBS: usize = 32;
const MAX_JOB_ID_LENGTH: usize = 128;
const MAX_RENDER_PATH_LENGTH: usize = 32_768;
const PROJECT_PREVIEW_THREADS: &str = "2";

#[derive(Default)]
struct JobRegistry {
    active: HashSet<String>,
    cancelled: HashSet<String>,
    project_jobs: HashMap<String, String>,
    job_projects: HashMap<String, String>,
}

fn jobs() -> &'static Mutex<JobRegistry> {
    JOBS.get_or_init(|| Mutex::new(JobRegistry::default()))
}

fn estimated_analysis_output_duration(analysis_duration: f64, total_silence_duration: f64) -> f64 {
    (analysis_duration - total_silence_duration).max(0.0)
}

fn new_job_id(prefix: &str) -> String {
    format!("{}-{}", prefix, NEXT_JOB_ID.fetch_add(1, Ordering::Relaxed))
}

fn validate_job_id(job_id: &str) -> Result<(), String> {
    if job_id.trim().is_empty() || job_id.len() > MAX_JOB_ID_LENGTH {
        return Err("Invalid render job ID.".to_string());
    }
    Ok(())
}

fn validate_project_id(project_id: &str) -> Result<(), String> {
    if project_id.trim().is_empty() || project_id.len() > MAX_JOB_ID_LENGTH {
        return Err("Invalid render project ID.".to_string());
    }
    Ok(())
}

fn begin_job(job_id: &str, project_id: Option<&str>) -> Result<(), String> {
    validate_job_id(job_id)?;
    if let Some(project_id) = project_id {
        validate_project_id(project_id)?;
    }

    let mut registry = jobs()
        .lock()
        .map_err(|_| "Render job state is unavailable.".to_string())?;
    if registry.active.contains(job_id) {
        return Err("A render job with this ID is already active.".to_string());
    }
    if let Some(project_id) = project_id {
        if registry.project_jobs.contains_key(project_id) {
            return Err("A render job is already active for this project.".to_string());
        }
    }
    if registry.active.len() >= MAX_ACTIVE_JOBS {
        return Err("Too many render jobs are already running.".to_string());
    }

    registry.active.insert(job_id.to_string());
    registry.cancelled.remove(job_id);
    if let Some(project_id) = project_id {
        registry
            .project_jobs
            .insert(project_id.to_string(), job_id.to_string());
        registry
            .job_projects
            .insert(job_id.to_string(), project_id.to_string());
    }
    Ok(())
}

fn finish_job(job_id: &str) {
    if let Ok(mut registry) = jobs().lock() {
        registry.active.remove(job_id);
        registry.cancelled.remove(job_id);
        if let Some(project_id) = registry.job_projects.remove(job_id) {
            if registry
                .project_jobs
                .get(&project_id)
                .is_some_and(|active_job| active_job == job_id)
            {
                registry.project_jobs.remove(&project_id);
            }
        }
    }
}

fn is_job_cancelled(job_id: &str) -> bool {
    jobs()
        .lock()
        .map(|registry| registry.cancelled.contains(job_id))
        .unwrap_or(false)
}

struct JobGuard(String);

impl JobGuard {
    fn new(job_id: String, project_id: Option<&str>) -> Result<Self, String> {
        begin_job(&job_id, project_id)?;
        Ok(Self(job_id))
    }
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        finish_job(&self.0);
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub file_size: u64,
    pub has_audio: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SilenceSegment {
    pub start: f64,
    pub end: f64,
    pub duration: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectionResult {
    pub segments: Vec<SilenceSegment>,
    pub total_silence_duration: f64,
    pub original_duration: f64,
    pub estimated_output_duration: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessingProgress {
    pub percent: f64,
    pub stage: String,
    pub message: String,
    #[serde(rename = "jobId")]
    pub job_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub input_path: String,
    pub output_path: String,
    pub segments_to_keep: Vec<(f64, f64)>,
    pub resolution: Option<String>,
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub sizing_mode: Option<String>,
    pub resize_mode: Option<String>,
    pub profile: Option<String>,
    pub fps: Option<u32>,
    pub mode: String,
    pub speed_multiplier: Option<f64>,
    pub playback_rate: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PreviewSegment {
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPreviewClip {
    pub input_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub speed: f64,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
    pub has_audio: bool,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct CachedPreviewSource {
    path: String,
    source_start: f64,
    source_end: f64,
    speed: f64,
    size: u64,
    modified_ns: u128,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExportResizeMode {
    Original,
    Fit,
    Crop,
    Stretch,
}

#[tauri::command]
pub async fn get_video_metadata(
    window: Window,
    file_path: String,
) -> Result<VideoMetadata, String> {
    info!("[ffprobe] Getting metadata for: {}", file_path);
    let output = ffprobe_output(
        window.app_handle(),
        vec![
            "-v".into(),
            "quiet".into(),
            "-print_format".into(),
            "json".into(),
            "-show_format".into(),
            "-show_streams".into(),
            file_path.clone(),
        ],
    )
    .await
    .map_err(|e| {
        error!("[ffprobe] Failed to run ffprobe: {}", e);
        e
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[ffprobe] ffprobe exited with error: {}", stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(|e| {
        error!("[ffprobe] Failed to parse JSON output: {}", e);
        format!("Failed to parse ffprobe output: {}", e)
    })?;

    let streams = json["streams"].as_array().ok_or("No streams found")?;

    let video_stream = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No video stream found")?;

    let has_audio = streams
        .iter()
        .any(|s| s["codec_type"].as_str() == Some("audio"));

    let format = &json["format"];

    let duration = format["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let mut width = video_stream["width"].as_u64().unwrap_or(0) as u32;
    let mut height = video_stream["height"].as_u64().unwrap_or(0) as u32;

    // Check for rotation in metadata (tags.rotate or side_data_list)
    let mut rotation = 0;

    // Check tags.rotate first
    if let Some(rotate_str) = video_stream
        .pointer("/tags/rotate")
        .and_then(|v| v.as_str())
    {
        rotation = rotate_str.parse::<i32>().unwrap_or(0);
    } else if let Some(side_data) = video_stream["side_data_list"].as_array() {
        // Fallback to side_data_list if tags.rotate is not present
        for data in side_data {
            if let Some(rot) = data["rotation"].as_i64() {
                rotation = rot as i32;
                break;
            }
        }
    }

    // Normalize rotation
    rotation %= 360;
    if rotation < 0 {
        rotation += 360;
    }

    // Swap width and height if rotated 90 or 270 degrees
    if rotation == 90 || rotation == 270 {
        std::mem::swap(&mut width, &mut height);
    }

    let fps_str = video_stream["r_frame_rate"].as_str().unwrap_or("30/1");
    let fps = parse_frame_rate(fps_str);

    let codec = video_stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let file_size = format["size"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    if !has_audio {
        warn!("[ffprobe] Video has no audio stream: {}", file_path);
    }

    info!(
        "[ffprobe] OK — {}x{} | {:.2}fps | {:.1}s | codec:{} | audio:{}",
        width, height, fps, duration, codec, has_audio
    );

    Ok(VideoMetadata {
        duration,
        width,
        height,
        fps,
        codec,
        file_size,
        has_audio,
    })
}

#[tauri::command]
pub async fn detect_silence(
    window: Window,
    file_path: String,
    noise_threshold: f64,
    min_duration: f64,
    source_start: Option<f64>,
    source_end: Option<f64>,
) -> Result<DetectionResult, String> {
    info!(
        "[silence] Starting — file={} threshold={}dB min_dur={}s",
        file_path, noise_threshold, min_duration
    );

    if !noise_threshold.is_finite() || !min_duration.is_finite() || min_duration <= 0.0 {
        return Err("Invalid silence detection settings.".to_string());
    }
    let analysis_start = source_start.unwrap_or(0.0);
    let analysis_end = source_end;
    if !analysis_start.is_finite()
        || analysis_start < 0.0
        || analysis_end.is_some_and(|end| !end.is_finite() || end <= analysis_start)
    {
        return Err("Invalid silence detection range.".to_string());
    }

    let threshold_str = format!("{}dB", noise_threshold);
    let duration_str = format!("{}", min_duration);

    let metadata = get_video_metadata(window.clone(), file_path.clone()).await?;
    let analysis_duration = analysis_end
        .unwrap_or(metadata.duration)
        .min(metadata.duration)
        - analysis_start;
    if analysis_duration <= 0.0 {
        return Err("Silence detection range is outside the source duration.".to_string());
    }
    emit_progress(&window, 12.0, "analyzing", "");

    let mut segments = run_silence_detection_with_progress(
        &window,
        &file_path,
        &threshold_str,
        &duration_str,
        analysis_duration,
        Some(analysis_start),
        analysis_end.map(|end| end.min(metadata.duration)),
    )
    .await?;
    for segment in &mut segments {
        segment.start += analysis_start;
        segment.end += analysis_start;
    }

    emit_progress(&window, 97.0, "analyzing", "");

    let total_silence: f64 = segments.iter().map(|s| s.duration).sum();
    let estimated_output = estimated_analysis_output_duration(analysis_duration, total_silence);

    info!(
        "[silence] Done — {} segments | silence:{:.1}s | output~{:.1}s",
        segments.len(),
        total_silence,
        estimated_output
    );
    for (i, seg) in segments.iter().enumerate() {
        debug!(
            "[silence]   [{}] {:.3}s → {:.3}s ({:.3}s)",
            i, seg.start, seg.end, seg.duration
        );
    }

    emit_progress(&window, 100.0, "complete", "");

    Ok(DetectionResult {
        segments,
        total_silence_duration: total_silence,
        original_duration: metadata.duration,
        estimated_output_duration: estimated_output,
    })
}

async fn run_silence_detection_with_progress(
    window: &Window,
    file_path: &str,
    threshold_str: &str,
    duration_str: &str,
    expected_duration: f64,
    analysis_start: Option<f64>,
    analysis_end: Option<f64>,
) -> Result<Vec<SilenceSegment>, String> {
    let mut args = Vec::new();
    if let Some(start) = analysis_start {
        args.extend(["-ss".into(), start.to_string()]);
    }
    if let Some(end) = analysis_end {
        let start = analysis_start.unwrap_or(0.0);
        if end <= start {
            return Err("Invalid silence detection range.".to_string());
        }
        args.extend(["-t".into(), (end - start).to_string()]);
    }
    args.extend([
        "-i".into(),
        file_path.to_string(),
        "-af".into(),
        format!("silencedetect=noise={}:d={}", threshold_str, duration_str),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);
    let (mut spawn, child) = ffmpeg_spawn(window.app_handle(), args).await.map_err(|e| {
        error!("[silence] Failed to run FFmpeg: {}", e);
        e
    })?;

    let time_re = Regex::new(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap();
    let start_re = Regex::new(r"silence_start:\s*(-?[\d.]+)").unwrap();
    let end_re =
        Regex::new(r"silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*(-?[\d.]+)").unwrap();
    let progress_step = if expected_duration > 0.0 && expected_duration < 5.0 {
        6.0
    } else {
        1.0
    };
    let mut last_percent = 12.0;
    let mut stderr_lines: Vec<String> = Vec::new();
    let mut pending_start: Option<f64> = None;
    let mut segments: Vec<SilenceSegment> = Vec::new();

    while let Some(event) = spawn.receiver.recv().await {
        match event {
            CommandEvent::Stderr(line) | CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line).trim().to_string();
                if line.is_empty() {
                    continue;
                }

                debug!("[silence] {}", line);
                stderr_lines.push(line.clone());
                if stderr_lines.len() > 300 {
                    stderr_lines.remove(0);
                }

                parse_silence_line(&line, &start_re, &end_re, &mut pending_start, &mut segments);

                if let Some(current_seconds) = parse_ffmpeg_progress_seconds(&time_re, &line) {
                    let progress = if expected_duration > 0.0 {
                        12.0 + ((current_seconds / expected_duration) * 83.0)
                    } else {
                        50.0
                    };

                    if progress - last_percent >= progress_step {
                        let clamped = progress.clamp(12.0, 95.0);
                        emit_progress(window, clamped, "analyzing", "");
                        last_percent = clamped;
                    }
                }
            }
            CommandEvent::Error(error_message) => stderr_lines.push(error_message),
            CommandEvent::Terminated(payload) if payload.code != Some(0) => {
                let stderr_tail = stderr_lines.join("\n");
                error!("[silence] FFmpeg failed:\n{}", stderr_tail);
                return Err(format!("Silence detection failed: {}", stderr_tail));
            }
            _ => {}
        }
    }

    let _child = child;
    Ok(segments)
}

#[tauri::command]
pub async fn cut_silence(
    window: Window,
    file_path: String,
    segments_to_remove: Vec<SilenceSegment>,
    output_path: String,
    mode: String,
    speed_multiplier: Option<f64>,
) -> Result<String, String> {
    info!(
        "[cut] Starting — mode={} segments={} output={}",
        mode,
        segments_to_remove.len(),
        output_path
    );

    let metadata = get_video_metadata(window.clone(), file_path.clone()).await?;
    let total_duration = metadata.duration;

    if mode == "speed" {
        let speed = speed_multiplier.unwrap_or(2.0);
        info!("[cut] Time-warp mode — {}x", speed);
        return cut_with_speed(
            &window,
            &file_path,
            &segments_to_remove,
            &output_path,
            speed,
            total_duration,
        )
        .await;
    }

    let segments_to_keep = invert_segments(&segments_to_remove, total_duration);

    if segments_to_keep.is_empty() {
        error!("[cut] No non-silent segments found");
        return Err("No non-silent segments found".to_string());
    }

    info!("[cut] Keeping {} segments", segments_to_keep.len());
    for (i, (s, e)) in segments_to_keep.iter().enumerate() {
        debug!("[cut]   keep[{}] {:.3}s → {:.3}s", i, s, e);
    }

    emit_progress(&window, 10.0, "cutting", "");

    let mut filter_parts: Vec<String> = Vec::new();
    let num_segments = segments_to_keep.len();

    for (i, (start, end)) in segments_to_keep.iter().enumerate() {
        filter_parts.push(format!(
            "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{}];[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
            start, end, i, start, end, i
        ));
    }

    let concat_inputs: String = (0..num_segments)
        .map(|i| format!("[v{}][a{}]", i, i))
        .collect::<Vec<_>>()
        .join("");

    let filter = format!(
        "{};{}concat=n={}:v=1:a=1[outv][outa]",
        filter_parts.join(";"),
        concat_inputs,
        num_segments
    );

    debug!("[cut] Filter complex: {} chars", filter.len());
    emit_progress(&window, 30.0, "cutting", "");

    info!("[cut] Running FFmpeg...");
    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            file_path.clone(),
            "-filter_complex".into(),
            filter,
            "-map".into(),
            "[outv]".into(),
            "-map".into(),
            "[outa]".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "18".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| {
        error!("[cut] FFmpeg error: {}", e);
        e
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[cut] FFmpeg failed:\n{}", stderr);
        return Err(format!("FFmpeg cut failed: {}", stderr));
    }

    info!("[cut] Done — {}", output_path);
    emit_progress(&window, 100.0, "complete", "");
    Ok(output_path)
}

#[tauri::command]
pub async fn export_video(
    window: Window,
    options: ExportOptions,
    job_id: Option<String>,
    project_id: Option<String>,
) -> Result<String, String> {
    let job_id = job_id.unwrap_or_else(|| new_job_id("export"));
    let _job_guard = JobGuard::new(job_id.clone(), project_id.as_deref())?;
    info!(
        "[export] Starting — input={} output={} res={:?} fps={:?}",
        options.input_path, options.output_path, options.resolution, options.fps
    );

    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        5.0,
        "exporting",
        "",
    );

    validate_render_output_path(&options.output_path, &["mp4", "mov", "mkv", "webm"])?;
    if paths_match(&options.input_path, &options.output_path) {
        return Err("Export output must be different from the input video.".to_string());
    }

    if let Some(fps) = options.fps {
        if !(1..=240).contains(&fps) {
            return Err("Export FPS must be between 1 and 240.".to_string());
        }
    }
    if let Some(rate) = options.playback_rate {
        if !rate.is_finite() || rate <= 0.0 || rate > 100.0 {
            return Err("Export playback rate must be greater than 0 and at most 100.".to_string());
        }
    }

    let metadata = get_video_metadata(window.clone(), options.input_path.clone()).await?;
    let segments_to_keep = validate_export_segments(&options.segments_to_keep, metadata.duration)?;

    let raw_duration: f64 = segments_to_keep
        .iter()
        .map(|(start, end)| end - start)
        .sum();
    let expected_duration = match options.playback_rate {
        Some(rate) if rate > 0.01 => raw_duration / rate,
        Some(_) => raw_duration,
        None => raw_duration,
    };
    if !expected_duration.is_finite() || expected_duration <= 0.0 {
        return Err("Invalid export playback rate.".to_string());
    }

    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        12.0,
        "exporting",
        "",
    );

    let (base_filter, base_video_output_label) = build_export_filter(
        &segments_to_keep,
        metadata.width,
        metadata.height,
        options.target_width,
        options.target_height,
        options.resolution.as_deref(),
        options.resize_mode.as_deref(),
        options.fps,
        options.playback_rate,
        metadata.has_audio,
    );

    let use_hardware = options
        .profile
        .as_deref()
        .map(|profile| profile != "quality")
        .unwrap_or(false);
    let mut encoder = select_video_encoder(window.app_handle(), use_hardware).await?;
    let (filter, video_output_label) = prepare_video_filter(
        &base_filter,
        &base_video_output_label,
        &encoder.name,
    );
    let mut args = vec!["-y".into()];
    if let Some(device) = &encoder.device {
        args.extend(["-vaapi_device".into(), device.clone()]);
    }
    for (start, end) in &segments_to_keep {
        args.extend([
            "-ss".into(),
            format!("{:.6}", start),
            "-t".into(),
            format!("{:.6}", end - start),
            "-i".into(),
            options.input_path.clone(),
        ]);
    }
    args.extend([
        "-filter_complex".into(),
        filter,
        "-map".into(),
        video_output_label,
        "-map".into(),
        "[aout]".into(),
    ]);
    append_video_encoder_args(&mut args, &encoder, options.profile.as_deref());
    if encoder.name != "h264_vaapi" {
        args.extend(["-pix_fmt".into(), "yuv420p".into()]);
    }
    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        options.output_path.clone(),
    ]);

    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        20.0,
        "encoding",
        "",
    );

    info!(
        "[export] Running FFmpeg ({} args) with {} from {}...",
        args.len(),
        encoder.name,
        encoder.source
    );
    if let Err(error) = run_ffmpeg_with_progress(
        &window,
        "export-progress",
        "encoding",
        &args,
        expected_duration,
        &job_id,
        &encoder,
    )
    .await
    {
        cleanup_partial_output(&options.output_path);
        if encoder.hardware {
            warn!(
                "[export] Hardware encoder failed; retrying with CPU fallback: {}",
                error
            );
            encoder = select_video_encoder(window.app_handle(), false).await?;
            replace_video_encoder_args(&mut args, &encoder, options.profile.as_deref());
            let (fallback_filter, fallback_video_output_label) = prepare_video_filter(
                &base_filter,
                &base_video_output_label,
                &encoder.name,
            );
            replace_video_filter_args(
                &mut args,
                &fallback_filter,
                &fallback_video_output_label,
            );
            run_ffmpeg_with_progress(
                &window,
                "export-progress",
                "encoding",
                &args,
                expected_duration,
                &job_id,
                &encoder,
            )
            .await
            .inspect_err(|_| cleanup_partial_output(&options.output_path))?;
        } else {
            return Err(error);
        }
    }

    info!("[export] Done — {}", options.output_path);
    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        100.0,
        "complete",
        "",
    );
    Ok(options.output_path)
}

#[tauri::command]
pub async fn generate_export_preview(
    window: Window,
    input_path: String,
    output_path: String,
    segments_to_keep: Vec<PreviewSegment>,
    target_width: Option<u32>,
    target_height: Option<u32>,
    resize_mode: Option<String>,
) -> Result<String, String> {
    validate_render_output_path(&output_path, &["jpg", "jpeg", "png"])?;
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export preview directory: {}", e))?;
    }

    let metadata = get_video_metadata(window.clone(), input_path.clone()).await?;
    let frame_time = choose_preview_frame_time(&segments_to_keep, metadata.duration);
    let video_filter = build_still_preview_filter(
        metadata.width,
        metadata.height,
        target_width,
        target_height,
        resize_mode.as_deref(),
    )?;

    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            input_path,
            "-ss".into(),
            format!("{:.3}", frame_time),
            "-vframes".into(),
            "1".into(),
            "-vf".into(),
            video_filter,
            "-q:v".into(),
            "5".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| format!("FFmpeg export preview error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Export preview generation failed: {}", stderr));
    }

    Ok(output_path)
}

#[tauri::command]
pub async fn generate_sequence_preview(
    window: Window,
    input_path: String,
    output_path: String,
    segments_to_keep: Vec<PreviewSegment>,
) -> Result<String, String> {
    info!(
        "[preview-sequence] Starting — input={} clips={} output={}",
        input_path,
        segments_to_keep.len(),
        output_path
    );

    if segments_to_keep.is_empty() {
        return Err("No active clips available to build the edited preview.".to_string());
    }

    validate_render_output_path(&output_path, &["mp4", "mov", "mkv", "webm"])?;
    if paths_match(&input_path, &output_path) {
        return Err("Edited preview output must be different from the input video.".to_string());
    }

    let metadata = get_video_metadata(window.clone(), input_path.clone()).await?;
    let requested_ranges = segments_to_keep
        .iter()
        .map(|segment| (segment.start, segment.end))
        .collect::<Vec<_>>();
    let keep_ranges = validate_export_segments(&requested_ranges, metadata.duration)?;

    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create edited preview directory: {}", e))?;
    }

    let transforms = vec![
        "scale=-2:720".to_string(),
        "format=yuv420p".to_string(),
        "setsar=1".to_string(),
    ];
    let (filter, video_output_label) =
        build_concat_filter(&keep_ranges, &transforms, None, false, metadata.has_audio);

    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            input_path.clone(),
            "-filter_complex".into(),
            filter,
            "-map".into(),
            video_output_label,
            "-map".into(),
            "[aout]".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "veryfast".into(),
            "-crf".into(),
            "24".into(),
            "-profile:v".into(),
            "baseline".into(),
            "-level".into(),
            "4.0".into(),
            "-g".into(),
            "15".into(),
            "-keyint_min".into(),
            "15".into(),
            "-sc_threshold".into(),
            "0".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-tune".into(),
            "fastdecode".into(),
            "-c:a".into(),
            "aac".into(),
            "-ac".into(),
            "2".into(),
            "-ar".into(),
            "48000".into(),
            "-b:a".into(),
            "160k".into(),
            "-movflags".into(),
            "+faststart".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| {
        error!("[preview-sequence] FFmpeg error: {}", e);
        e
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[preview-sequence] FFmpeg failed:\n{}", stderr);
        return Err(format!("Edited preview generation failed: {}", stderr));
    }

    info!("[preview-sequence] Done — {}", output_path);
    Ok(output_path)
}

#[tauri::command]
pub fn cancel_project_render(job_id: String) -> Result<(), String> {
    validate_job_id(&job_id)?;
    let mut registry = jobs()
        .lock()
        .map_err(|_| "Render job state is unavailable.".to_string())?;
    if !registry.active.contains(&job_id) {
        return Err("Render job is not active.".to_string());
    }
    registry.cancelled.insert(job_id);
    Ok(())
}

#[tauri::command]
pub async fn wait_for_project_idle(
    project_id: String,
    timeout_ms: Option<u64>,
) -> Result<(), String> {
    validate_project_id(&project_id)?;
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(15_000));
    let start = std::time::Instant::now();
    loop {
        {
            let registry = jobs()
                .lock()
                .map_err(|_| "Render job state is unavailable.".to_string())?;
            if !registry.project_jobs.contains_key(&project_id) {
                return Ok(());
            }
        }
        if start.elapsed() >= timeout {
            return Err("Timed out waiting for previous render job to finish.".to_string());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn export_project(
    window: Window,
    output_path: String,
    clips: Vec<ProjectPreviewClip>,
    target_width: u32,
    target_height: u32,
    resize_mode: Option<String>,
    fps: Option<u32>,
    profile: Option<String>,
    job_id: Option<String>,
    project_id: Option<String>,
) -> Result<String, String> {
    render_project_video(
        window,
        output_path,
        clips,
        target_width,
        target_height,
        resize_mode.as_deref(),
        fps,
        profile.as_deref(),
        false,
        job_id,
        project_id,
    )
    .await
}

#[tauri::command]
pub async fn generate_project_preview(
    window: Window,
    output_path: String,
    clips: Vec<ProjectPreviewClip>,
    target_width: u32,
    target_height: u32,
    job_id: Option<String>,
    project_id: Option<String>,
) -> Result<String, String> {
    render_project_video(
        window,
        output_path,
        clips,
        target_width,
        target_height,
        Some("fit"),
        None,
        Some("fast"),
        true,
        job_id,
        project_id,
    )
    .await
}

#[tauri::command]
pub async fn generate_project_preview_frame(
    window: Window,
    output_path: String,
    clips: Vec<ProjectPreviewClip>,
    target_width: u32,
    target_height: u32,
    resize_mode: Option<String>,
    frame_offset: Option<f64>,
) -> Result<String, String> {
    validate_render_output_path(&output_path, &["jpg", "jpeg", "png"])?;
    if clips.is_empty() {
        return Err("No clips available for project preview frame.".to_string());
    }
    if target_width == 0 || target_height == 0 || target_width > 4096 || target_height > 4096 {
        return Err("Project preview frame dimensions must be between 1 and 4096 pixels.".to_string());
    }
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export preview directory: {}", e))?;
    }

    let offset = frame_offset.unwrap_or(2.0).max(0.0);
    let clip = clips
        .iter()
        .find(|clip| (clip.source_end - clip.source_start) / clip.speed.max(0.01) > offset)
        .or_else(|| clips.first())
        .ok_or_else(|| "No suitable clip for preview frame.".to_string())?;

    let clip_duration = (clip.source_end - clip.source_start).max(0.0);
    let seek_time = (clip.source_start + offset.min(clip_duration - 0.1).max(0.0))
        .max(0.0)
        .min(clip.source_end.max(0.0));

    let video_filter = build_still_preview_filter(
        clip.width,
        clip.height,
        Some(target_width),
        Some(target_height),
        resize_mode.as_deref(),
    )?;

    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-ss".into(),
            format!("{:.3}", seek_time),
            "-i".into(),
            clip.input_path.clone(),
            "-frames:v".into(),
            "1".into(),
            "-vf".into(),
            video_filter,
            "-q:v".into(),
            "5".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| format!("FFmpeg project preview frame error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Project preview frame generation failed: {}", stderr));
    }

    Ok(output_path)
}

#[allow(clippy::too_many_arguments)]
async fn render_project_video(
    window: Window,
    output_path: String,
    clips: Vec<ProjectPreviewClip>,
    target_width: u32,
    target_height: u32,
    resize_mode: Option<&str>,
    fps: Option<u32>,
    profile: Option<&str>,
    preview: bool,
    job_id: Option<String>,
    project_id: Option<String>,
) -> Result<String, String> {
    let job_id = job_id.unwrap_or_else(|| new_job_id(if preview { "preview" } else { "export" }));
    let _job_guard = JobGuard::new(job_id.clone(), project_id.as_deref())?;
    if clips.is_empty() {
        return Err("No clips available for project preview.".to_string());
    }
    if clips
        .iter()
        .any(|clip| paths_match(&clip.input_path, &output_path))
    {
        return Err("Project output must be different from every source video.".to_string());
    }
    if target_width == 0 || target_height == 0 || target_width > 4096 || target_height > 4096 {
        return Err("Project preview dimensions must be between 1 and 4096 pixels.".to_string());
    }
    if clips.len() > 10_000 {
        return Err("Project render contains too many clips.".to_string());
    }
    if let Some(rate) = fps {
        if !(1..=240).contains(&rate) {
            return Err("Project render FPS must be between 1 and 240.".to_string());
        }
    }

    let mut source_durations = HashMap::new();
    for clip in &clips {
        let duration = if let Some(duration) = source_durations.get(&clip.input_path) {
            *duration
        } else {
            let metadata = get_video_metadata(window.clone(), clip.input_path.clone()).await?;
            if !metadata.duration.is_finite() || metadata.duration <= 0.0 {
                return Err("Project render source has an invalid duration.".to_string());
            }
            source_durations.insert(clip.input_path.clone(), metadata.duration);
            metadata.duration
        };
        if clip.source_end > duration {
            return Err("Project render contains a range outside a source video.".to_string());
        }
    }

    validate_render_output_path(&output_path, &["mp4", "mov", "mkv", "webm"])?;
    if let Some(parent) = std::path::Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create project preview directory: {}", error))?;
    }

    let resize_mode = resize_mode.unwrap_or("fit");
    if !matches!(resize_mode, "original" | "fit" | "crop" | "stretch") {
        return Err("Project render contains an invalid resize mode.".to_string());
    }

    let (width, height) = if preview {
        preview_dimensions(target_width, target_height)
    } else {
        (target_width.max(2) / 2 * 2, target_height.max(2) / 2 * 2)
    };
    let common_fps = if preview {
        30
    } else {
        fps.unwrap_or_else(|| clips[0].fps.round().clamp(1.0, 240.0) as u32)
    };
    let (base_filter, base_video_label, audio_label) =
        build_project_preview_filter(&clips, width, height, resize_mode, common_fps, true)?;

    if preview && cached_preview_is_current(&output_path, &clips) {
        info!("[preview-project] Reusing cached preview: {}", output_path);
        return Ok(output_path);
    }

    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        20.0,
        if preview { "preview" } else { "encoding" },
        "",
    );
    let use_hardware = profile.map(|value| value != "quality").unwrap_or(preview);
    let mut encoder = select_video_encoder(window.app_handle(), use_hardware).await?;
    let (filter, video_label) =
        prepare_video_filter(&base_filter, &base_video_label, &encoder.name);
    let mut args = vec!["-y".to_string()];
    if preview {
        args.extend(["-threads".to_string(), PROJECT_PREVIEW_THREADS.to_string()]);
    }
    if let Some(device) = &encoder.device {
        args.extend(["-vaapi_device".to_string(), device.clone()]);
    }
    for clip in &clips {
        args.extend([
            "-ss".to_string(),
            format!("{:.6}", clip.source_start),
            "-t".to_string(),
            format!("{:.6}", clip.source_end - clip.source_start),
            "-i".to_string(),
            clip.input_path.clone(),
        ]);
    }
    args.extend([
        "-filter_complex".to_string(),
        filter,
        "-map".to_string(),
        video_label,
        "-map".to_string(),
        audio_label,
    ]);
    append_video_encoder_args(
        &mut args,
        &encoder,
        profile.or(if preview { Some("fast") } else { None }),
    );
    if encoder.name != "h264_vaapi" {
        args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
    }
    args.extend([
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        if preview { "128k" } else { "192k" }.to_string(),
    ]);
    if let Some(rate) = fps {
        args.extend(["-r".to_string(), rate.to_string()]);
    }
    args.extend([
        "-movflags".to_string(),
        "+faststart".to_string(),
        output_path.clone(),
    ]);

    let expected_duration: f64 = clips
        .iter()
        .map(|clip| (clip.source_end - clip.source_start) / clip.speed)
        .sum();
    if let Err(error) = run_ffmpeg_with_progress(
        &window,
        "export-progress",
        if preview { "preview" } else { "encoding" },
        &args,
        expected_duration,
        &job_id,
        &encoder,
    )
    .await
    {
        cleanup_partial_output(&output_path);
        if encoder.hardware {
            warn!(
                "[project-render] Hardware encoder failed; retrying with CPU fallback: {}",
                error
            );
            encoder = select_video_encoder(window.app_handle(), false).await?;
            replace_video_encoder_args(
                &mut args,
                &encoder,
                profile.or(if preview { Some("fast") } else { None }),
            );
            let (fallback_filter, fallback_video_label) =
                prepare_video_filter(&base_filter, &base_video_label, &encoder.name);
            replace_video_filter_args(&mut args, &fallback_filter, &fallback_video_label);
            run_ffmpeg_with_progress(
                &window,
                "export-progress",
                if preview { "preview" } else { "encoding" },
                &args,
                expected_duration,
                &job_id,
                &encoder,
            )
            .await
            .inspect_err(|_| cleanup_partial_output(&output_path))
            .map_err(|error| format!("Project preview FFmpeg error: {}", error))?;
        } else {
            return Err(format!("Project preview FFmpeg error: {}", error));
        }
    }

    if preview {
        write_preview_manifest(&output_path, &clips);
    }

    emit_job_progress(
        &window,
        "export-progress",
        Some(&job_id),
        100.0,
        "complete",
        "",
    );
    Ok(output_path)
}

// --- Internal helpers ---

fn preview_manifest_path(output_path: &str) -> PathBuf {
    PathBuf::from(format!("{}.manifest.json", output_path))
}

fn preview_sources(clips: &[ProjectPreviewClip]) -> Option<Vec<CachedPreviewSource>> {
    clips
        .iter()
        .map(|clip| {
            let metadata = std::fs::metadata(&clip.input_path).ok()?;
            let modified_ns = metadata
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_nanos();
            let path = std::fs::canonicalize(&clip.input_path)
                .ok()?
                .to_string_lossy()
                .into_owned();
            Some(CachedPreviewSource {
                path,
                source_start: clip.source_start,
                source_end: clip.source_end,
                speed: clip.speed,
                size: metadata.len(),
                modified_ns,
            })
        })
        .collect()
}

fn cached_preview_is_current(output_path: &str, clips: &[ProjectPreviewClip]) -> bool {
    let output_is_valid = std::fs::metadata(output_path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false);
    if !output_is_valid {
        return false;
    }

    let Some(expected_sources) = preview_sources(clips) else {
        return false;
    };
    let Ok(manifest) = std::fs::read_to_string(preview_manifest_path(output_path)) else {
        return false;
    };
    serde_json::from_str::<Vec<CachedPreviewSource>>(&manifest)
        .map(|sources| sources == expected_sources)
        .unwrap_or(false)
}

fn write_preview_manifest(output_path: &str, clips: &[ProjectPreviewClip]) {
    let Some(sources) = preview_sources(clips) else {
        warn!("[preview-project] Failed to fingerprint preview sources");
        return;
    };
    match serde_json::to_vec(&sources).and_then(|data| {
        std::fs::write(preview_manifest_path(output_path), data).map_err(serde_json::Error::io)
    }) {
        Ok(()) => {}
        Err(error) => warn!(
            "[preview-project] Failed to write cache manifest: {}",
            error
        ),
    }
}

fn preview_dimensions(target_width: u32, target_height: u32) -> (u32, u32) {
    let scale = (480.0 / f64::from(target_width.max(target_height))).min(1.0);
    (
        (f64::from(target_width) * scale).round().max(2.0) as u32 / 2 * 2,
        (f64::from(target_height) * scale).round().max(2.0) as u32 / 2 * 2,
    )
}

fn validate_export_segments(
    segments: &[(f64, f64)],
    total_duration: f64,
) -> Result<Vec<(f64, f64)>, String> {
    if !total_duration.is_finite() || total_duration <= 0.0 {
        return Err("The source video has an invalid duration.".to_string());
    }

    let input_segments = if segments.is_empty() {
        vec![(0.0, total_duration)]
    } else {
        segments.to_vec()
    };

    let mut valid_segments = Vec::with_capacity(input_segments.len());
    for (start, end) in input_segments {
        if !start.is_finite() || !end.is_finite() || start < 0.0 || end > total_duration {
            return Err("Export contains a range outside the source video.".to_string());
        }
        if end <= start {
            return Err("Export contains an invalid source range.".to_string());
        }
        if end - start >= 0.08 {
            valid_segments.push((start, end));
        }
    }

    if valid_segments.is_empty() {
        return Err("No active clips available to export.".to_string());
    }
    Ok(valid_segments)
}

fn validate_render_output_path(output_path: &str, extensions: &[&str]) -> Result<(), String> {
    if output_path.is_empty() || output_path.len() > MAX_RENDER_PATH_LENGTH {
        return Err("Invalid render output path.".to_string());
    }
    let path = Path::new(output_path);
    if !path.is_absolute() {
        return Err("Render output must be an absolute path.".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Render output must have a supported file extension.".to_string())?;
    if !extensions.iter().any(|allowed| *allowed == extension) {
        return Err("Render output has an unsupported file extension.".to_string());
    }
    if let Ok(metadata) = std::fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Render output must be a regular file path.".to_string());
        }
    }
    if let Some(parent) = path.parent() {
        if parent.exists() && !parent.is_dir() {
            return Err("Render output parent is not a directory.".to_string());
        }
    }
    Ok(())
}

fn normalize_path_for_comparison(path: &str) -> Option<PathBuf> {
    let input = Path::new(path);
    let absolute = if input.is_absolute() {
        input.to_path_buf()
    } else {
        std::env::current_dir().ok()?.join(input)
    };
    let mut lexical = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                lexical.pop();
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                lexical.push(component.as_os_str());
            }
        }
    }

    if let Ok(canonical) = std::fs::canonicalize(&lexical) {
        return Some(canonical);
    }

    let mut missing_components = Vec::new();
    let mut existing = lexical.as_path();
    while !existing.exists() {
        missing_components.push(existing.file_name()?.to_os_string());
        existing = existing.parent()?;
    }

    let mut normalized = std::fs::canonicalize(existing).ok()?;
    for component in missing_components.iter().rev() {
        normalized.push(component);
    }
    Some(normalized)
}

fn paths_match(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }

    let (Some(left), Some(right)) = (
        normalize_path_for_comparison(left),
        normalize_path_for_comparison(right),
    ) else {
        return false;
    };

    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn cleanup_partial_output(output_path: &str) {
    match std::fs::remove_file(output_path) {
        Ok(()) => info!("[export] Removed partial output: {}", output_path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => warn!(
            "[export] Failed to remove partial output {}: {}",
            output_path, error
        ),
    }
    let _ = std::fs::remove_file(preview_manifest_path(output_path));
}

fn emit_progress(window: &Window, percent: f64, stage: &str, message: &str) {
    emit_named_progress(window, "processing-progress", percent, stage, message);
}

fn emit_named_progress(
    window: &Window,
    event_name: &str,
    percent: f64,
    stage: &str,
    message: &str,
) {
    emit_job_progress(window, event_name, None, percent, stage, message);
}

fn emit_job_progress(
    window: &Window,
    event_name: &str,
    job_id: Option<&str>,
    percent: f64,
    stage: &str,
    message: &str,
) {
    debug!("[progress] {:.0}% [{}] {}", percent, stage, message);
    window
        .emit(
            event_name,
            ProcessingProgress {
                percent,
                stage: stage.to_string(),
                message: message.to_string(),
                job_id: job_id.map(str::to_string),
            },
        )
        .ok();
}

#[allow(clippy::too_many_arguments)]
fn build_export_filter(
    segments_to_keep: &[(f64, f64)],
    source_width: u32,
    source_height: u32,
    target_width: Option<u32>,
    target_height: Option<u32>,
    resolution: Option<&str>,
    resize_mode: Option<&str>,
    fps: Option<u32>,
    playback_rate: Option<f64>,
    source_has_audio: bool,
) -> (String, String) {
    let (legacy_width, legacy_height) =
        legacy_target_dimensions(resolution, source_width, source_height);
    let resolved_width = target_width.or(legacy_width);
    let resolved_height = target_height.or(legacy_height);
    let mut transforms = build_video_transforms(
        source_width,
        source_height,
        resolved_width,
        resolved_height,
        resize_mode,
    );

    if let Some(fps) = fps {
        transforms.push(format!("fps={}", fps));
    }

    build_concat_filter(
        segments_to_keep,
        &transforms,
        playback_rate,
        true,
        source_has_audio,
    )
}

fn build_still_preview_filter(
    source_width: u32,
    source_height: u32,
    target_width: Option<u32>,
    target_height: Option<u32>,
    resize_mode: Option<&str>,
) -> Result<String, String> {
    let mut transforms = build_video_transforms(
        source_width,
        source_height,
        target_width,
        target_height,
        resize_mode,
    );

    if transforms.is_empty() {
        transforms.push("setsar=1".to_string());
    }

    Ok(transforms.join(","))
}

fn build_video_transforms(
    source_width: u32,
    source_height: u32,
    target_width: Option<u32>,
    target_height: Option<u32>,
    resize_mode: Option<&str>,
) -> Vec<String> {
    let mut transforms = Vec::new();
    let resize_mode = parse_resize_mode(resize_mode);

    let Some(width) = target_width.filter(|value| *value > 0) else {
        return transforms;
    };
    let Some(height) = target_height.filter(|value| *value > 0) else {
        return transforms;
    };

    if resize_mode == ExportResizeMode::Original
        || (width == source_width && height == source_height)
    {
        transforms.push("setsar=1".to_string());
        return transforms;
    }

    let target_width = width;
    let target_height = height;

    let resize_filter = match resize_mode {
        ExportResizeMode::Fit => format!(
            "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black",
            target_width, target_height, target_width, target_height
        ),
        ExportResizeMode::Crop => format!(
            "scale={}:{}:force_original_aspect_ratio=increase,crop={}:{}",
            target_width, target_height, target_width, target_height
        ),
        ExportResizeMode::Stretch => format!("scale={}:{}", target_width, target_height),
        ExportResizeMode::Original => "setsar=1".to_string(),
    };

    transforms.push(resize_filter);
    transforms.push("setsar=1".to_string());
    transforms
}

fn legacy_target_dimensions(
    resolution: Option<&str>,
    source_width: u32,
    source_height: u32,
) -> (Option<u32>, Option<u32>) {
    match resolution {
        Some("1080p") => {
            if source_height >= source_width {
                (Some(1080), Some(1920))
            } else {
                (Some(1920), Some(1080))
            }
        }
        Some("4k") => {
            if source_height >= source_width {
                (Some(2160), Some(3840))
            } else {
                (Some(3840), Some(2160))
            }
        }
        _ => (None, None),
    }
}

fn parse_resize_mode(value: Option<&str>) -> ExportResizeMode {
    match value {
        Some("original") => ExportResizeMode::Original,
        Some("crop") => ExportResizeMode::Crop,
        Some("stretch") => ExportResizeMode::Stretch,
        _ => ExportResizeMode::Fit,
    }
}

fn choose_preview_frame_time(segments_to_keep: &[PreviewSegment], total_duration: f64) -> f64 {
    let fallback = (total_duration * 0.2).clamp(0.5, total_duration.max(0.5));

    let Some(first_clip) = segments_to_keep
        .iter()
        .find(|segment| segment.end - segment.start >= 0.25)
    else {
        return fallback;
    };

    let clip_duration = (first_clip.end - first_clip.start).max(0.0);
    for offset in [2.0_f64, 5.0_f64] {
        if clip_duration > offset {
            return first_clip.start + offset;
        }
    }

    (first_clip.start + (clip_duration / 2.0)).clamp(0.0, total_duration.max(0.0))
}

fn build_project_preview_filter(
    clips: &[ProjectPreviewClip],
    width: u32,
    height: u32,
    resize_mode: &str,
    common_fps: u32,
    seeked_inputs: bool,
) -> Result<(String, String, String), String> {
    let mut parts = Vec::new();
    let mut concat_inputs = String::new();

    for (index, clip) in clips.iter().enumerate() {
        if clip.input_path.is_empty() || clip.input_path.len() > 32_768 {
            return Err("Project preview contains an invalid input path.".to_string());
        }
        if !clip.source_start.is_finite()
            || !clip.source_end.is_finite()
            || clip.source_start < 0.0
            || clip.source_end <= clip.source_start
        {
            return Err("Project preview contains an invalid source range.".to_string());
        }
        let duration = clip.source_end - clip.source_start;
        if duration < 0.08 {
            return Err("Project preview contains a clip shorter than 0.08 seconds.".to_string());
        }
        if !clip.speed.is_finite() || !(0.25..=32.0).contains(&clip.speed) {
            return Err("Project preview contains an invalid clip speed.".to_string());
        }
        if !clip.fps.is_finite() || !(1.0..=240.0).contains(&clip.fps) {
            return Err("Project preview contains an invalid clip FPS.".to_string());
        }
        if clip.width == 0 || clip.height == 0 || clip.width > 16_384 || clip.height > 16_384 {
            return Err("Project preview contains invalid source dimensions.".to_string());
        }

        let resize_filter = match resize_mode {
            "original" if clip.width == width && clip.height == height => "setsar=1".to_string(),
            "original" | "fit" => format!(
                "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black",
                width, height, width, height
            ),
            "crop" => format!(
                "scale={}:{}:force_original_aspect_ratio=increase,crop={}:{}",
                width, height, width, height
            ),
            "stretch" => format!("scale={}:{}", width, height),
            _ => return Err("Project preview contains an invalid resize mode.".to_string()),
        };
        let video_input = if seeked_inputs {
            format!("[{}:v]setpts=PTS-STARTPTS", index)
        } else {
            format!(
                "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS",
                index, clip.source_start, clip.source_end
            )
        };
        parts.push(format!(
            "{},setpts=PTS/{},fps={},{},setsar=1,format=yuv420p[v{}]",
            video_input, clip.speed, common_fps, resize_filter, index
        ));

        let audio = if clip.has_audio {
            let audio_input = if seeked_inputs {
                format!("[{}:a]asetpts=PTS-STARTPTS", index)
            } else {
                format!(
                    "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS",
                    index, clip.source_start, clip.source_end
                )
            };
            format!(
                "{},{},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a{}]",
                audio_input,
                build_atempo_chain(clip.speed),
                index
            )
        } else {
            format!(
                "anullsrc=r=48000:cl=stereo,atrim=duration={},asetpts=PTS-STARTPTS[a{}]",
                duration / clip.speed,
                index
            )
        };
        parts.push(audio);
        concat_inputs.push_str(&format!("[v{}][a{}]", index, index));
    }

    parts.push(format!(
        "{}concat=n={}:v=1:a=1[vout][aout]",
        concat_inputs,
        clips.len()
    ));
    Ok((parts.join(";"), "[vout]".to_string(), "[aout]".to_string()))
}

fn build_atempo_chain(speed: f64) -> String {
    let mut remaining = speed;
    let mut filters = Vec::new();
    while remaining > 2.0 {
        filters.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        filters.push("atempo=0.5".to_string());
        remaining /= 0.5;
    }
    filters.push(format!("atempo={:.6}", remaining));
    filters.join(",")
}

fn build_concat_filter(
    segments_to_keep: &[(f64, f64)],
    transforms: &[String],
    playback_rate: Option<f64>,
    seeked_inputs: bool,
    source_has_audio: bool,
) -> (String, String) {
    let mut filter_parts: Vec<String> = Vec::new();

    for (index, (start, end)) in segments_to_keep.iter().enumerate() {
        let video_filter = if seeked_inputs {
            format!("[{}:v]setpts=PTS-STARTPTS[v{}]", index, index)
        } else {
            format!(
                "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{}]",
                start, end, index
            )
        };
        let audio_filter = if source_has_audio {
            if seeked_inputs {
                format!("[{}:a]asetpts=PTS-STARTPTS[a{}]", index, index)
            } else {
                format!(
                    "[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
                    start, end, index
                )
            }
        } else {
            let duration = end - start;
            format!(
                "anullsrc=r=48000:cl=stereo,atrim=duration={:.6},asetpts=PTS-STARTPTS[a{}]",
                duration, index
            )
        };
        filter_parts.push(format!("{};{}", video_filter, audio_filter));
    }

    let concat_inputs = (0..segments_to_keep.len())
        .map(|index| format!("[v{}][a{}]", index, index))
        .collect::<Vec<_>>()
        .join("");

    filter_parts.push(format!(
        "{}concat=n={}:v=1:a=1[vcat][acat]",
        concat_inputs,
        segments_to_keep.len()
    ));

    let mut video_label = "[vcat]".to_string();
    let mut audio_label = "[acat]".to_string();

    // Apply global playback rate if set (≠ 1.0)
    if let Some(rate) = playback_rate {
        if (rate - 1.0).abs() > 0.01 {
            // Video: setpts divides by rate (faster = smaller PTS)
            filter_parts.push(format!("{}setpts=PTS/{}[vrate]", video_label, rate));
            video_label = "[vrate]".to_string();

            // Audio: atempo only supports 0.5–100.0 range,
            // chain multiple filters for extreme values
            let mut audio_chain = Vec::new();
            let mut remaining = rate;
            while remaining > 2.0 {
                audio_chain.push("atempo=2.0".to_string());
                remaining /= 2.0;
            }
            while remaining < 0.5 {
                audio_chain.push("atempo=0.5".to_string());
                remaining /= 0.5;
            }
            audio_chain.push(format!("atempo={:.4}", remaining));

            filter_parts.push(format!("{}{}[arate]", audio_label, audio_chain.join(",")));
            audio_label = "[arate]".to_string();
        }
    }

    // Apply video transforms (resolution, fps) after speed adjustment
    if !transforms.is_empty() {
        filter_parts.push(format!("{}{}[vout]", video_label, transforms.join(",")));
        video_label = "[vout]".to_string();
    }

    // Rename final audio label to [aout]
    if audio_label != "[aout]" {
        filter_parts.push(format!("{}anull[aout]", audio_label));
    }

    (filter_parts.join(";"), video_label)
}

fn prepare_video_filter(
    base_filter: &str,
    base_video_label: &str,
    encoder_name: &str,
) -> (String, String) {
    if encoder_name != "h264_vaapi" {
        return (base_filter.to_string(), base_video_label.to_string());
    }

    (
        format!(
            "{};{}format=nv12,hwupload[vhw]",
            base_filter, base_video_label
        ),
        "[vhw]".to_string(),
    )
}

fn replace_video_filter_args(args: &mut [String], filter: &str, video_label: &str) {
    let Some(filter_index) = args.iter().position(|argument| argument == "-filter_complex")
    else {
        return;
    };
    if let Some(filter_value) = args.get_mut(filter_index + 1) {
        *filter_value = filter.to_string();
    }
    if let Some(video_map_index) = args
        .iter()
        .enumerate()
        .skip(filter_index + 2)
        .find_map(|(index, argument)| (argument == "-map").then_some(index))
    {
        if let Some(video_map) = args.get_mut(video_map_index + 1) {
            *video_map = video_label.to_string();
        }
    }
}

fn append_video_encoder_args(
    args: &mut Vec<String>,
    encoder: &VideoEncoderSelection,
    profile: Option<&str>,
) {
    if !encoder.hardware {
        let (preset, crf) = match profile {
            Some("fast") => ("veryfast", "23"),
            Some("balanced") => ("fast", "21"),
            _ => ("medium", "18"),
        };
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            preset.into(),
            "-crf".into(),
            crf.into(),
        ]);
        return;
    }

    args.extend(["-c:v".into(), encoder.name.clone()]);
    match encoder.name.as_str() {
        "h264_nvenc" => args.extend([
            "-preset".into(),
            if profile == Some("fast") { "p2" } else { "p4" }.into(),
            "-rc".into(),
            "vbr".into(),
            "-cq".into(),
            if profile == Some("fast") { "28" } else { "23" }.into(),
            "-b:v".into(),
            "0".into(),
        ]),
        "h264_vaapi" => args.extend([
            "-rc_mode".into(),
            "CQP".into(),
            "-qp".into(),
            if profile == Some("fast") { "28" } else { "23" }.into(),
        ]),
        "h264_qsv" => args.extend([
            "-preset".into(),
            if profile == Some("fast") {
                "veryfast"
            } else {
                "faster"
            }
            .into(),
            "-global_quality".into(),
            if profile == Some("fast") { "28" } else { "23" }.into(),
        ]),
        "h264_amf" => args.extend([
            "-quality".into(),
            if profile == Some("fast") {
                "speed"
            } else {
                "balanced"
            }
            .into(),
            "-rc".into(),
            "cqp".into(),
            "-qp_i".into(),
            if profile == Some("fast") { "28" } else { "23" }.into(),
            "-qp_p".into(),
            if profile == Some("fast") { "28" } else { "23" }.into(),
        ]),
        "h264_videotoolbox" => args.extend([
            "-q:v".into(),
            if profile == Some("fast") { "70" } else { "55" }.into(),
        ]),
        _ => {}
    }
}

fn replace_video_encoder_args(
    args: &mut Vec<String>,
    encoder: &VideoEncoderSelection,
    profile: Option<&str>,
) {
    if let Some(device_index) = args.iter().position(|argument| argument == "-vaapi_device") {
        args.drain(device_index..=device_index + 1);
    }
    if let Some(device) = &encoder.device {
        args.splice(1..1, ["-vaapi_device".into(), device.clone()]);
    }
    let Some(video_index) = args.iter().position(|argument| argument == "-c:v") else {
        return;
    };
    let Some(audio_index) = args.iter().position(|argument| argument == "-c:a") else {
        return;
    };
    let mut replacement = Vec::new();
    append_video_encoder_args(&mut replacement, encoder, profile);
    args.splice(video_index..audio_index, replacement);
}

async fn run_ffmpeg_with_progress(
    window: &Window,
    event_name: &str,
    stage: &str,
    args: &[String],
    expected_duration: f64,
    job_id: &str,
    encoder: &VideoEncoderSelection,
) -> Result<(), String> {
    let (mut spawn, child) = ffmpeg_spawn_with_encoder(window.app_handle(), encoder, args.to_vec())
        .await
        .map_err(|e| {
            error!("[export] FFmpeg error: {}", e);
            e
        })?;
    let time_re = Regex::new(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap();
    let mut last_percent = 20.0;
    let mut stderr_lines: Vec<String> = Vec::new();

    while let Some(event) = spawn.receiver.recv().await {
        if is_job_cancelled(job_id) {
            child
                .kill()
                .map_err(|error| format!("Failed to cancel render job: {}", error))?;
            return Err("Render cancelled.".to_string());
        }
        match event {
            CommandEvent::Stderr(line) | CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line).trim().to_string();
                if line.is_empty() {
                    continue;
                }

                debug!("[export] {}", line);
                stderr_lines.push(line.clone());
                if stderr_lines.len() > 300 {
                    stderr_lines.remove(0);
                }

                if let Some(current_seconds) = parse_ffmpeg_progress_seconds(&time_re, &line) {
                    let progress = if expected_duration > 0.0 {
                        20.0 + ((current_seconds / expected_duration) * 75.0)
                    } else {
                        50.0
                    };

                    if progress - last_percent >= 1.0 {
                        let clamped = progress.clamp(20.0, 95.0);
                        emit_job_progress(window, event_name, Some(job_id), clamped, stage, "");
                        last_percent = clamped;
                    }
                }
            }
            CommandEvent::Error(error_message) => stderr_lines.push(error_message),
            CommandEvent::Terminated(payload) if payload.code != Some(0) => {
                let stderr_tail = stderr_lines.join("\n");
                error!("[export] FFmpeg failed:\n{}", stderr_tail);
                return Err(format!("Export failed: {}", stderr_tail));
            }
            _ => {}
        }
    }

    let _child = child;
    Ok(())
}

fn parse_ffmpeg_progress_seconds(regex: &Regex, line: &str) -> Option<f64> {
    let captures = regex.captures(line)?;
    let hours = captures.get(1)?.as_str().parse::<f64>().ok()?;
    let minutes = captures.get(2)?.as_str().parse::<f64>().ok()?;
    let seconds = captures.get(3)?.as_str().parse::<f64>().ok()?;
    Some((hours * 3600.0) + (minutes * 60.0) + seconds)
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::{
        begin_job, build_atempo_chain, build_concat_filter, build_project_preview_filter,
        cached_preview_is_current, estimated_analysis_output_duration, finish_job, paths_match,
        prepare_video_filter,
        preview_dimensions, validate_export_segments, validate_render_output_path,
        write_preview_manifest, ProjectPreviewClip,
    };
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    fn clip(fps: f64) -> ProjectPreviewClip {
        ProjectPreviewClip {
            input_path: "source.mp4".to_string(),
            source_start: 0.0,
            source_end: 2.0,
            speed: 1.0,
            fps,
            width: 1280,
            height: 720,
            has_audio: false,
        }
    }

    #[test]
    fn cache_manifest_invalidates_when_source_changes() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("source.mp4");
        let output = directory.path().join("preview.mp4");
        let mut source_file = File::create(&source).unwrap();
        source_file.write_all(b"source-v1").unwrap();
        File::create(&output)
            .unwrap()
            .write_all(b"preview")
            .unwrap();

        let mut source_clip = clip(30.0);
        source_clip.input_path = source.to_string_lossy().into_owned();
        write_preview_manifest(output.to_str().unwrap(), &[source_clip.clone()]);
        assert!(cached_preview_is_current(
            output.to_str().unwrap(),
            &[source_clip.clone()]
        ));

        source_file.write_all(b"-source-v2").unwrap();
        assert!(!cached_preview_is_current(
            output.to_str().unwrap(),
            &[source_clip]
        ));
    }

    #[test]
    fn only_one_render_job_can_run_per_project() {
        let project_id = "test-project-exclusive";
        let first_job = "test-job-first";
        let second_job = "test-job-second";

        begin_job(first_job, Some(project_id)).unwrap();
        assert!(begin_job(second_job, Some(project_id)).is_err());
        finish_job(first_job);
        begin_job(second_job, Some(project_id)).unwrap();
        finish_job(second_job);
    }

    #[test]
    fn unrelated_projects_can_render_concurrently() {
        let first_job = "test-job-project-a";
        let second_job = "test-job-project-b";

        begin_job(first_job, Some("test-project-a")).unwrap();
        begin_job(second_job, Some("test-project-b")).unwrap();
        finish_job(first_job);
        finish_job(second_job);
    }

    #[test]
    fn unscoped_jobs_remain_independent() {
        let first_job = "test-job-unscoped-a";
        let second_job = "test-job-unscoped-b";

        begin_job(first_job, None).unwrap();
        begin_job(second_job, None).unwrap();
        finish_job(first_job);
        finish_job(second_job);
    }

    #[test]
    fn vaapi_upload_is_part_of_the_complex_filter_and_cpu_has_no_upload() {
        let (hardware_filter, hardware_label) =
            prepare_video_filter("[vout]", "[vout]", "h264_vaapi");
        assert!(hardware_filter.ends_with("[vout];[vout]format=nv12,hwupload[vhw]"));
        assert_eq!(hardware_label, "[vhw]");

        let (cpu_filter, cpu_label) = prepare_video_filter("[vout]", "[vout]", "libx264");
        assert_eq!(cpu_filter, "[vout]");
        assert_eq!(cpu_label, "[vout]");
    }

    #[test]
    fn preview_dimensions_are_lightweight_and_preserve_aspect_ratio() {
        assert_eq!(preview_dimensions(1920, 1080), (480, 270));
        assert_eq!(preview_dimensions(320, 240), (320, 240));
    }

    #[test]
    fn project_filter_normalizes_all_clips_to_common_fps() {
        let clips = vec![clip(24.0), clip(60.0)];
        let (filter, _, _) =
            build_project_preview_filter(&clips, 1280, 720, "fit", 30, false).unwrap();
        assert_eq!(filter.matches("fps=30").count(), 2);
        assert!(!filter.contains("fps=24"));
        assert!(!filter.contains("fps=60"));
    }

    #[test]
    fn project_filter_supports_each_resize_mode() {
        let clips = vec![clip(30.0)];
        let (original, _, _) =
            build_project_preview_filter(&clips, 1280, 720, "original", 30, false).unwrap();
        let (fit, _, _) =
            build_project_preview_filter(&clips, 1280, 720, "fit", 30, false).unwrap();
        let (crop, _, _) =
            build_project_preview_filter(&clips, 1280, 720, "crop", 30, false).unwrap();
        let (stretch, _, _) =
            build_project_preview_filter(&clips, 1280, 720, "stretch", 30, false).unwrap();
        assert!(original.contains("setsar=1"));
        assert!(!original.contains("force_original_aspect_ratio"));
        assert!(fit.contains("force_original_aspect_ratio=decrease"));
        assert!(crop.contains("force_original_aspect_ratio=increase"));
        assert!(stretch.contains("scale=1280:720"));
    }

    #[test]
    fn rejects_same_input_and_output_path() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("source.mp4");
        File::create(&source).unwrap();
        let equivalent = directory
            .path()
            .join("nested")
            .join("..")
            .join("source.mp4");

        assert!(paths_match(
            source.to_str().unwrap(),
            equivalent.to_str().unwrap()
        ));
        assert!(!paths_match(
            source.to_str().unwrap(),
            directory.path().join("output.mp4").to_str().unwrap()
        ));
    }

    #[test]
    fn deserializes_project_clips_from_frontend_field_names() {
        let value = serde_json::json!({
            "inputPath": "source.mp4",
            "sourceStart": 0.0,
            "sourceEnd": 2.0,
            "speed": 1.0,
            "fps": 30.0,
            "width": 1280,
            "height": 720,
            "hasAudio": false
        });
        let parsed: ProjectPreviewClip = serde_json::from_value(value).unwrap();
        assert_eq!(parsed.input_path, "source.mp4");
        assert!(!parsed.has_audio);
    }

    #[test]
    fn partial_analysis_estimate_uses_only_the_analyzed_range() {
        assert_eq!(estimated_analysis_output_duration(10.0, 2.5), 7.5);
        assert_eq!(estimated_analysis_output_duration(10.0, 12.0), 0.0);
    }

    #[test]
    fn atempo_chain_stays_within_ffmpeg_supported_range() {
        let chain = build_atempo_chain(32.0);
        assert_eq!(chain.matches("atempo=").count(), 5);
        assert!(chain.contains("atempo=2.000000"));
    }

    #[test]
    fn export_segments_reject_non_finite_and_out_of_bounds_ranges() {
        assert!(validate_export_segments(&[(0.0, f64::NAN)], 10.0).is_err());
        assert!(validate_export_segments(&[(-1.0, 2.0)], 10.0).is_err());
        assert!(validate_export_segments(&[(2.0, 11.0)], 10.0).is_err());
        assert!(validate_export_segments(&[(4.0, 3.0)], 10.0).is_err());
    }

    #[test]
    fn export_segments_use_full_source_when_no_ranges_are_supplied() {
        assert_eq!(
            validate_export_segments(&[], 10.0).unwrap(),
            vec![(0.0, 10.0)]
        );
        assert!(validate_export_segments(&[(0.0, 0.05)], 10.0).is_err());
    }

    #[test]
    fn concat_filter_synthesizes_audio_for_video_only_sources() {
        let (filter, _) = build_concat_filter(&[(0.0, 2.0)], &[], None, true, false);
        assert!(filter.contains("anullsrc=r=48000:cl=stereo"));
        assert!(!filter.contains("[0:a]"));
    }

    #[test]
    fn render_output_validation_rejects_unsafe_extensions_and_symlinks() {
        let directory = tempdir().unwrap();
        let output = directory.path().join("render.mp4");
        assert!(validate_render_output_path(output.to_str().unwrap(), &["mp4"]).is_ok());
        assert!(validate_render_output_path(
            directory.path().join("render.txt").to_str().unwrap(),
            &["mp4"]
        )
        .is_err());

        let existing = directory.path().join("existing.mp4");
        File::create(&existing).unwrap();
        #[cfg(unix)]
        {
            let link = directory.path().join("link.mp4");
            std::os::unix::fs::symlink(&existing, &link).unwrap();
            assert!(validate_render_output_path(link.to_str().unwrap(), &["mp4"]).is_err());
        }
    }
}

async fn cut_with_speed(
    window: &Window,
    file_path: &str,
    silence_segments: &[SilenceSegment],
    output_path: &str,
    speed: f64,
    total_duration: f64,
) -> Result<String, String> {
    let segments = build_speed_segments(silence_segments, total_duration);
    let num_segments = segments.len();
    info!("[timewarp] {} segments at {}x", num_segments, speed);

    let mut filter_parts: Vec<String> = Vec::new();

    for (i, (start, end, is_silence)) in segments.iter().enumerate() {
        if *is_silence {
            let atempo = if speed <= 2.0 {
                format!("atempo={}", speed)
            } else {
                let mut chain = Vec::new();
                let mut remaining = speed;
                while remaining > 2.0 {
                    chain.push("atempo=2.0".to_string());
                    remaining /= 2.0;
                }
                chain.push(format!("atempo={:.4}", remaining));
                chain.join(",")
            };
            let setpts = format!("PTS-STARTPTS,setpts=PTS/{}", speed);
            debug!(
                "[timewarp]   silence[{}] {:.3}→{:.3}s | atempo={}",
                i, start, end, atempo
            );
            filter_parts.push(format!(
                "[0:v]trim=start={}:end={},setpts={} [v{}];[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS,{} [a{}]",
                start, end, setpts, i, start, end, atempo, i
            ));
        } else {
            debug!("[timewarp]   speech[{}] {:.3}→{:.3}s", i, start, end);
            filter_parts.push(format!(
                "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{}];[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
                start, end, i, start, end, i
            ));
        }
    }

    let concat_inputs: String = (0..num_segments)
        .map(|i| format!("[v{}][a{}]", i, i))
        .collect::<Vec<_>>()
        .join("");

    let filter = format!(
        "{};{}concat=n={}:v=1:a=1[outv][outa]",
        filter_parts.join(";"),
        concat_inputs,
        num_segments
    );

    emit_progress(window, 30.0, "timewarp", "");

    info!("[timewarp] Running FFmpeg...");
    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            file_path.to_string(),
            "-filter_complex".into(),
            filter,
            "-map".into(),
            "[outv]".into(),
            "-map".into(),
            "[outa]".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "18".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "192k".into(),
            output_path.to_string(),
        ],
    )
    .await
    .map_err(|e| {
        error!("[timewarp] FFmpeg error: {}", e);
        e
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[timewarp] FFmpeg failed:\n{}", stderr);
        return Err(format!("Time-warp failed: {}", stderr));
    }

    info!("[timewarp] Done — {}", output_path);
    emit_progress(window, 100.0, "complete", "");
    Ok(output_path.to_string())
}

fn build_speed_segments(
    silence_segments: &[SilenceSegment],
    total_duration: f64,
) -> Vec<(f64, f64, bool)> {
    let mut result: Vec<(f64, f64, bool)> = Vec::new();
    let mut current_pos = 0.0;

    for seg in silence_segments {
        if seg.start > current_pos {
            result.push((current_pos, seg.start, false));
        }
        result.push((seg.start, seg.end, true));
        current_pos = seg.end;
    }

    if current_pos < total_duration {
        result.push((current_pos, total_duration, false));
    }

    result
}

fn parse_silence_line(
    line: &str,
    start_re: &Regex,
    end_re: &Regex,
    pending_start: &mut Option<f64>,
    segments: &mut Vec<SilenceSegment>,
) {
    if let Some(captures) = start_re.captures(line) {
        if let Ok(start) = captures[1].parse::<f64>() {
            *pending_start = Some(start);
        }
    }

    if let Some(captures) = end_re.captures(line) {
        if let (Ok(end), Ok(duration)) = (captures[1].parse::<f64>(), captures[2].parse::<f64>()) {
            let start = pending_start.take().unwrap_or(end - duration);
            segments.push(SilenceSegment {
                start,
                end,
                duration,
            });
        }
    }
}

fn invert_segments(silence: &[SilenceSegment], total_duration: f64) -> Vec<(f64, f64)> {
    let mut keep: Vec<(f64, f64)> = Vec::new();
    let mut current = 0.0;

    for seg in silence {
        if seg.start > current {
            keep.push((current, seg.start));
        }
        current = seg.end;
    }

    if current < total_duration {
        keep.push((current, total_duration));
    }

    keep
}

fn parse_frame_rate(fps_str: &str) -> f64 {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<f64>().unwrap_or(30.0);
        let den = parts[1].parse::<f64>().unwrap_or(1.0);
        if den > 0.0 {
            num / den
        } else {
            30.0
        }
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    }
}

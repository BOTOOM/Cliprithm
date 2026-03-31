use log::{debug, error, info, warn};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use tauri::{Emitter, Window};

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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub input_path: String,
    pub output_path: String,
    pub segments_to_keep: Vec<(f64, f64)>,
    pub resolution: Option<String>,
    pub fps: Option<u32>,
    pub mode: String,
    pub speed_multiplier: Option<f64>,
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    debug!("[ffmpeg] Checking FFmpeg availability...");
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|e| {
            error!("[ffmpeg] FFmpeg not found: {}", e);
            format!("FFmpeg not found: {}", e)
        })?;

    let version = String::from_utf8_lossy(&output.stdout);
    let first_line = version.lines().next().unwrap_or("unknown").to_string();
    info!("[ffmpeg] FFmpeg found: {}", first_line);
    Ok(first_line)
}

#[tauri::command]
pub fn get_video_metadata(file_path: String) -> Result<VideoMetadata, String> {
    info!("[ffprobe] Getting metadata for: {}", file_path);
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &file_path,
        ])
        .output()
        .map_err(|e| {
            error!("[ffprobe] Failed to run ffprobe: {}", e);
            format!("ffprobe error: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[ffprobe] ffprobe exited with error: {}", stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| {
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

    let width = video_stream["width"].as_u64().unwrap_or(0) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(0) as u32;

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

    Ok(VideoMetadata { duration, width, height, fps, codec, file_size, has_audio })
}

#[tauri::command]
pub async fn detect_silence(
    window: Window,
    file_path: String,
    noise_threshold: f64,
    min_duration: f64,
) -> Result<DetectionResult, String> {
    info!(
        "[silence] Starting — file={} threshold={}dB min_dur={}s",
        file_path, noise_threshold, min_duration
    );

    let threshold_str = format!("{}dB", noise_threshold);
    let duration_str = format!("{}", min_duration);

    emit_progress(&window, 0.0, "analyzing", "Iniciando detección de silencios...");

    let output = Command::new("ffmpeg")
        .args([
            "-i", &file_path,
            "-af", &format!("silencedetect=noise={}:d={}", threshold_str, duration_str),
            "-f", "null",
            "-",
        ])
        .output()
        .map_err(|e| {
            error!("[silence] Failed to run FFmpeg: {}", e);
            format!("FFmpeg error: {}", e)
        })?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let preview_start = stderr.len().saturating_sub(500);
    debug!("[silence] FFmpeg stderr tail: ...{}", &stderr[preview_start..]);

    emit_progress(&window, 50.0, "analyzing", "Analizando output de FFmpeg...");

    let segments = parse_silence_output(&stderr);
    let metadata = get_video_metadata(file_path.clone())?;
    let total_silence: f64 = segments.iter().map(|s| s.duration).sum();
    let estimated_output = metadata.duration - total_silence;

    info!(
        "[silence] Done — {} segments | silence:{:.1}s | output~{:.1}s",
        segments.len(), total_silence, estimated_output
    );
    for (i, seg) in segments.iter().enumerate() {
        debug!("[silence]   [{}] {:.3}s → {:.3}s ({:.3}s)", i, seg.start, seg.end, seg.duration);
    }

    emit_progress(&window, 100.0, "complete",
        &format!("Encontrados {} segmentos de silencio", segments.len()));

    Ok(DetectionResult {
        segments,
        total_silence_duration: total_silence,
        original_duration: metadata.duration,
        estimated_output_duration: estimated_output,
    })
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
        mode, segments_to_remove.len(), output_path
    );

    let metadata = get_video_metadata(file_path.clone())?;
    let total_duration = metadata.duration;

    if mode == "speed" {
        let speed = speed_multiplier.unwrap_or(2.0);
        info!("[cut] Time-warp mode — {}x", speed);
        return cut_with_speed(&window, &file_path, &segments_to_remove, &output_path, speed, total_duration);
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

    emit_progress(&window, 10.0, "cutting", "Preparando segmentos...");

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
        filter_parts.join(";"), concat_inputs, num_segments
    );

    debug!("[cut] Filter complex: {} chars", filter.len());
    emit_progress(&window, 30.0, "cutting", "Cortando y uniendo segmentos...");

    info!("[cut] Running FFmpeg...");
    let output = Command::new("ffmpeg")
        .args(["-y", "-i", &file_path, "-filter_complex", &filter,
               "-map", "[outv]", "-map", "[outa]",
               "-c:v", "libx264", "-preset", "fast", "-crf", "18",
               "-c:a", "aac", "-b:a", "192k", &output_path])
        .output()
        .map_err(|e| { error!("[cut] FFmpeg error: {}", e); format!("FFmpeg cut error: {}", e) })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[cut] FFmpeg failed:\n{}", stderr);
        return Err(format!("FFmpeg cut failed: {}", stderr));
    }

    info!("[cut] Done — {}", output_path);
    emit_progress(&window, 100.0, "complete", "¡Procesamiento completo!");
    Ok(output_path)
}

#[tauri::command]
pub async fn export_video(window: Window, options: ExportOptions) -> Result<String, String> {
    info!(
        "[export] Starting — input={} output={} res={:?} fps={:?}",
        options.input_path, options.output_path, options.resolution, options.fps
    );

    emit_named_progress(&window, "export-progress", 5.0, "exporting", "Preparando exportación...");

    let metadata = get_video_metadata(options.input_path.clone())?;
    let mut segments_to_keep = options.segments_to_keep.clone();
    if segments_to_keep.is_empty() {
        segments_to_keep.push((0.0, metadata.duration));
    }
    segments_to_keep.retain(|(start, end)| end - start >= 0.08);

    if segments_to_keep.is_empty() {
        return Err("No hay clips activos para exportar.".to_string());
    }

    let expected_duration: f64 = segments_to_keep
        .iter()
        .map(|(start, end)| end - start)
        .sum();

    emit_named_progress(
        &window,
        "export-progress",
        12.0,
        "exporting",
        "Construyendo timeline final...",
    );

    let (filter, video_output_label) = build_export_filter(
        &segments_to_keep,
        options.resolution.as_deref(),
        options.fps,
    );

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        options.input_path.clone(),
        "-filter_complex".into(),
        filter,
        "-map".into(),
        video_output_label,
        "-map".into(),
        "[aout]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "medium".into(),
        "-crf".into(),
        "18".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "192k".into(),
        options.output_path.clone(),
    ];

    emit_named_progress(
        &window,
        "export-progress",
        20.0,
        "encoding",
        "Iniciando FFmpeg...",
    );

    info!("[export] Running FFmpeg ({} args)...", args.len());
    run_ffmpeg_with_progress(
        &window,
        "export-progress",
        "encoding",
        &mut args,
        expected_duration,
    )?;

    info!("[export] Done — {}", options.output_path);
    emit_named_progress(&window, "export-progress", 100.0, "complete", "¡Exportación completa!");
    Ok(options.output_path)
}

// --- Internal helpers ---

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
    debug!("[progress] {:.0}% [{}] {}", percent, stage, message);
    window.emit(event_name, ProcessingProgress {
        percent,
        stage: stage.to_string(),
        message: message.to_string(),
    }).ok();
}

fn build_export_filter(
    segments_to_keep: &[(f64, f64)],
    resolution: Option<&str>,
    fps: Option<u32>,
) -> (String, String) {
    let mut filter_parts: Vec<String> = Vec::new();

    for (index, (start, end)) in segments_to_keep.iter().enumerate() {
        filter_parts.push(format!(
            "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{}];[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
            start, end, index, start, end, index
        ));
    }

    let concat_inputs = (0..segments_to_keep.len())
        .map(|index| format!("[v{}][a{}]", index, index))
        .collect::<Vec<_>>()
        .join("");

    filter_parts.push(format!(
        "{}concat=n={}:v=1:a=1[vcat][aout]",
        concat_inputs,
        segments_to_keep.len()
    ));

    let mut video_output_label = "[vcat]".to_string();
    let mut transforms: Vec<String> = Vec::new();

    if let Some(resolution) = resolution {
        transforms.push(match resolution {
            "1080p" => "scale=-2:1080".to_string(),
            "4k" => "scale=-2:2160".to_string(),
            _ => "scale=-2:1080".to_string(),
        });
    }

    if let Some(fps) = fps {
        transforms.push(format!("fps={}", fps));
    }

    if !transforms.is_empty() {
        filter_parts.push(format!(
            "[vcat]{}[vout]",
            transforms.join(",")
        ));
        video_output_label = "[vout]".to_string();
    }

    (filter_parts.join(";"), video_output_label)
}

fn run_ffmpeg_with_progress(
    window: &Window,
    event_name: &str,
    stage: &str,
    args: &[String],
    expected_duration: f64,
) -> Result<(), String> {
    let mut child = Command::new("ffmpeg")
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            error!("[export] FFmpeg error: {}", e);
            format!("FFmpeg export error: {}", e)
        })?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "No se pudo capturar el stderr de FFmpeg".to_string())?;

    let reader = BufReader::new(stderr);
    let time_re = Regex::new(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)").unwrap();
    let mut last_percent = 20.0;
    let mut stderr_lines: Vec<String> = Vec::new();

    for line in reader.lines() {
        let line = line.unwrap_or_default();
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
                emit_named_progress(
                    window,
                    event_name,
                    clamped,
                    stage,
                    &format!("Codificando video... {:.0}%", clamped),
                );
                last_percent = clamped;
            }
        }
    }

    let status = child.wait().map_err(|e| format!("FFmpeg wait error: {}", e))?;
    if !status.success() {
        let stderr_tail = stderr_lines.join("\n");
        error!("[export] FFmpeg failed:\n{}", stderr_tail);
        return Err(format!("Export failed: {}", stderr_tail));
    }

    Ok(())
}

fn parse_ffmpeg_progress_seconds(regex: &Regex, line: &str) -> Option<f64> {
    let captures = regex.captures(line)?;
    let hours = captures.get(1)?.as_str().parse::<f64>().ok()?;
    let minutes = captures.get(2)?.as_str().parse::<f64>().ok()?;
    let seconds = captures.get(3)?.as_str().parse::<f64>().ok()?;
    Some((hours * 3600.0) + (minutes * 60.0) + seconds)
}

fn cut_with_speed(
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
            debug!("[timewarp]   silence[{}] {:.3}→{:.3}s | atempo={}", i, start, end, atempo);
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
        filter_parts.join(";"), concat_inputs, num_segments
    );

    emit_progress(window, 30.0, "time-warp",
        &format!("Aplicando {}x de velocidad a los silencios...", speed));

    info!("[timewarp] Running FFmpeg...");
    let output = Command::new("ffmpeg")
        .args(["-y", "-i", file_path, "-filter_complex", &filter,
               "-map", "[outv]", "-map", "[outa]",
               "-c:v", "libx264", "-preset", "fast", "-crf", "18",
               "-c:a", "aac", "-b:a", "192k", output_path])
        .output()
        .map_err(|e| { error!("[timewarp] FFmpeg error: {}", e); format!("FFmpeg time-warp error: {}", e) })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("[timewarp] FFmpeg failed:\n{}", stderr);
        return Err(format!("Time-warp failed: {}", stderr));
    }

    info!("[timewarp] Done — {}", output_path);
    emit_progress(window, 100.0, "complete", "¡Time-warp completo!");
    Ok(output_path.to_string())
}

fn build_speed_segments(silence_segments: &[SilenceSegment], total_duration: f64) -> Vec<(f64, f64, bool)> {
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

fn parse_silence_output(stderr: &str) -> Vec<SilenceSegment> {
    let start_re = Regex::new(r"silence_start:\s*(-?[\d.]+)").unwrap();
    let end_re = Regex::new(r"silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*(-?[\d.]+)").unwrap();

    let starts: Vec<f64> = start_re
        .captures_iter(stderr)
        .filter_map(|cap| cap[1].parse().ok())
        .collect();

    debug!("[parse] {} silence_start markers", starts.len());

    let mut segments: Vec<SilenceSegment> = Vec::new();

    for (i, cap) in end_re.captures_iter(stderr).enumerate() {
        if let (Ok(end), Ok(duration)) = (cap[1].parse::<f64>(), cap[2].parse::<f64>()) {
            let start = if i < starts.len() { starts[i] } else { end - duration };
            segments.push(SilenceSegment { start, end, duration });
        }
    }

    debug!("[parse] {} complete segments", segments.len());
    segments
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
        if den > 0.0 { num / den } else { 30.0 }
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    }
}

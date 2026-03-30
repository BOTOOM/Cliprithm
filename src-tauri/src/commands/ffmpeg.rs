use regex::Regex;
use serde::{Deserialize, Serialize};
use std::process::Command;
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
    pub mode: String, // "cut" or "speed"
    pub speed_multiplier: Option<f64>,
}

#[tauri::command]
pub fn check_ffmpeg() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|e| format!("FFmpeg not found: {}", e))?;

    let version = String::from_utf8_lossy(&output.stdout);
    let first_line = version.lines().next().unwrap_or("unknown").to_string();
    Ok(first_line)
}

#[tauri::command]
pub fn get_video_metadata(file_path: String) -> Result<VideoMetadata, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &file_path,
        ])
        .output()
        .map_err(|e| format!("ffprobe error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

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

    let fps_str = video_stream["r_frame_rate"]
        .as_str()
        .unwrap_or("30/1");
    let fps = parse_frame_rate(fps_str);

    let codec = video_stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let file_size = format["size"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

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
) -> Result<DetectionResult, String> {
    let threshold_str = format!("{}dB", noise_threshold);
    let duration_str = format!("{}", min_duration);

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 0.0,
                stage: "analyzing".to_string(),
                message: "Starting silence detection...".to_string(),
            },
        )
        .ok();

    let output = Command::new("ffmpeg")
        .args([
            "-i", &file_path,
            "-af",
            &format!("silencedetect=noise={}:d={}", threshold_str, duration_str),
            "-f", "null",
            "-",
        ])
        .output()
        .map_err(|e| format!("FFmpeg error: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let segments = parse_silence_output(&stderr);

    // Get total duration
    let metadata = get_video_metadata(file_path.clone())?;
    let total_silence: f64 = segments.iter().map(|s| s.duration).sum();
    let estimated_output = metadata.duration - total_silence;

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 100.0,
                stage: "complete".to_string(),
                message: format!("Found {} silent segments", segments.len()),
            },
        )
        .ok();

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
    let metadata = get_video_metadata(file_path.clone())?;
    let total_duration = metadata.duration;

    if mode == "speed" {
        return cut_with_speed(
            &window,
            &file_path,
            &segments_to_remove,
            &output_path,
            speed_multiplier.unwrap_or(2.0),
            total_duration,
        );
    }

    // Build segments to keep (inverse of silence segments)
    let segments_to_keep = invert_segments(&segments_to_remove, total_duration);

    if segments_to_keep.is_empty() {
        return Err("No non-silent segments found".to_string());
    }

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 10.0,
                stage: "cutting".to_string(),
                message: "Preparing segments...".to_string(),
            },
        )
        .ok();

    // Create a complex filter for concatenation
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

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 30.0,
                stage: "cutting".to_string(),
                message: "Cutting and stitching segments...".to_string(),
            },
        )
        .ok();

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &file_path,
            "-filter_complex", &filter,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("FFmpeg cut error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg cut failed: {}", stderr));
    }

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 100.0,
                stage: "complete".to_string(),
                message: "Video processing complete!".to_string(),
            },
        )
        .ok();

    Ok(output_path)
}

#[tauri::command]
pub async fn export_video(
    window: Window,
    options: ExportOptions,
) -> Result<String, String> {
    window
        .emit(
            "export-progress",
            ProcessingProgress {
                percent: 0.0,
                stage: "exporting".to_string(),
                message: "Starting export...".to_string(),
            },
        )
        .ok();

    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(),
        options.input_path.clone(),
    ];

    // Apply resolution if specified
    if let Some(ref resolution) = options.resolution {
        let scale = match resolution.as_str() {
            "1080p" => "scale=-2:1080",
            "4k" => "scale=-2:2160",
            _ => "scale=-2:1080",
        };
        args.extend_from_slice(&["-vf".to_string(), scale.to_string()]);
    }

    // Apply FPS if specified
    if let Some(fps) = options.fps {
        args.extend_from_slice(&["-r".to_string(), fps.to_string()]);
    }

    args.extend_from_slice(&[
        "-c:v".to_string(), "libx264".to_string(),
        "-preset".to_string(), "medium".to_string(),
        "-crf".to_string(), "18".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        "-b:a".to_string(), "192k".to_string(),
        options.output_path.clone(),
    ]);

    window
        .emit(
            "export-progress",
            ProcessingProgress {
                percent: 50.0,
                stage: "encoding".to_string(),
                message: "Encoding video...".to_string(),
            },
        )
        .ok();

    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("FFmpeg export error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Export failed: {}", stderr));
    }

    window
        .emit(
            "export-progress",
            ProcessingProgress {
                percent: 100.0,
                stage: "complete".to_string(),
                message: "Export complete!".to_string(),
            },
        )
        .ok();

    Ok(options.output_path)
}

// --- Internal helpers ---

fn cut_with_speed(
    window: &Window,
    file_path: &str,
    silence_segments: &[SilenceSegment],
    output_path: &str,
    speed: f64,
    total_duration: f64,
) -> Result<String, String> {
    // Build a complex filter that speeds up silent parts
    let segments = build_speed_segments(silence_segments, total_duration);
    let num_segments = segments.len();

    let mut filter_parts: Vec<String> = Vec::new();

    for (i, (start, end, is_silence)) in segments.iter().enumerate() {
        if *is_silence {
            let atempo = if speed <= 2.0 {
                format!("atempo={}", speed)
            } else {
                // Chain multiple atempo filters for speeds > 2x
                let mut chain = Vec::new();
                let mut remaining = speed;
                while remaining > 2.0 {
                    chain.push("atempo=2.0".to_string());
                    remaining /= 2.0;
                }
                chain.push(format!("atempo={}", remaining));
                chain.join(",")
            };
            let setpts = format!("PTS-STARTPTS,setpts=PTS/{}", speed);
            filter_parts.push(format!(
                "[0:v]trim=start={}:end={},setpts={} [v{}];[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS,{} [a{}]",
                start, end, setpts, i, start, end, atempo, i
            ));
        } else {
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

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 30.0,
                stage: "time-warp".to_string(),
                message: format!("Applying {}x speed to silent segments...", speed),
            },
        )
        .ok();

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", file_path,
            "-filter_complex", &filter,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            output_path,
        ])
        .output()
        .map_err(|e| format!("FFmpeg time-warp error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Time-warp failed: {}", stderr));
    }

    window
        .emit(
            "processing-progress",
            ProcessingProgress {
                percent: 100.0,
                stage: "complete".to_string(),
                message: "Time-warp processing complete!".to_string(),
            },
        )
        .ok();

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

fn parse_silence_output(stderr: &str) -> Vec<SilenceSegment> {
    let start_re =
        Regex::new(r"silence_start:\s*(-?[\d.]+)").unwrap();
    let end_re =
        Regex::new(r"silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*(-?[\d.]+)").unwrap();

    let starts: Vec<f64> = start_re
        .captures_iter(stderr)
        .filter_map(|cap| cap[1].parse().ok())
        .collect();

    let mut segments: Vec<SilenceSegment> = Vec::new();

    for (i, cap) in end_re.captures_iter(stderr).enumerate() {
        if let (Ok(end), Ok(duration)) = (cap[1].parse::<f64>(), cap[2].parse::<f64>()) {
            let start = if i < starts.len() { starts[i] } else { end - duration };
            segments.push(SilenceSegment {
                start,
                end,
                duration,
            });
        }
    }

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

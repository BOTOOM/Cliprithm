use std::process::Command;
use std::path::Path;

#[tauri::command]
pub fn generate_thumbnail(
    video_path: String,
    output_path: String,
    timestamp: Option<f64>,
) -> Result<String, String> {
    let time = timestamp.unwrap_or(1.0);

    // Ensure output directory exists
    if let Some(parent) = Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create thumbnail directory: {}", e))?;
    }

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-ss", &format!("{}", time),
            "-vframes", "1",
            "-vf", "scale=320:-1",
            "-q:v", "5",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("FFmpeg thumbnail error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Thumbnail generation failed: {}", stderr));
    }

    Ok(output_path)
}

#[tauri::command]
pub fn generate_preview_proxy(
    video_path: String,
    output_path: String,
) -> Result<String, String> {
    if let Some(parent) = Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create preview directory: {}", e))?;
    }

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-map", "0:v:0",
            "-map", "0:a?",
            "-vf", "scale=-2:720,format=yuv420p,setsar=1",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-profile:v", "baseline",
            "-level", "4.0",
            "-g", "15",
            "-keyint_min", "15",
            "-sc_threshold", "0",
            "-pix_fmt", "yuv420p",
            "-tune", "fastdecode",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("FFmpeg preview proxy error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Preview proxy generation failed: {}", stderr));
    }

    Ok(output_path)
}

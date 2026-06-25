use std::path::Path;
use tauri::{Manager, Window};

use crate::commands::media_tools::ffmpeg_output;

#[tauri::command]
pub async fn generate_thumbnail(
    window: Window,
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

    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            video_path.clone(),
            "-ss".into(),
            format!("{}", time),
            "-vframes".into(),
            "1".into(),
            "-vf".into(),
            "scale=320:-1".into(),
            "-q:v".into(),
            "5".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| format!("FFmpeg thumbnail error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Thumbnail generation failed: {}", stderr));
    }

    Ok(output_path)
}

#[tauri::command]
pub async fn generate_preview_proxy(
    window: Window,
    video_path: String,
    output_path: String,
) -> Result<String, String> {
    if let Some(parent) = Path::new(&output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create preview directory: {}", e))?;
    }

    let output = ffmpeg_output(
        window.app_handle(),
        vec![
            "-y".into(),
            "-i".into(),
            video_path.clone(),
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a?".into(),
            "-vf".into(),
            "scale=-2:720,format=yuv420p,setsar=1".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "ultrafast".into(),
            "-crf".into(),
            "28".into(),
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
            "-b:a".into(),
            "128k".into(),
            "-movflags".into(),
            "+faststart".into(),
            output_path.clone(),
        ],
    )
    .await
    .map_err(|e| format!("FFmpeg preview proxy error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Preview proxy generation failed: {}", stderr));
    }

    Ok(output_path)
}

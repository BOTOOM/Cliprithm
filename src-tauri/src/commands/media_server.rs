use std::io::SeekFrom;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CHUNK_SIZE: u64 = 512 * 1024; // 512KB chunks

/// Start a local HTTP server for streaming video files with Range request support.
/// Returns the port number. The server runs in the background on the tokio runtime.
pub fn start() -> u16 {
    let std_listener =
        std::net::TcpListener::bind("127.0.0.1:0").expect("Failed to bind media server");
    let port = std_listener.local_addr().unwrap().port();
    std_listener
        .set_nonblocking(true)
        .expect("Failed to set nonblocking");

    log::info!("[media-server] Starting on http://127.0.0.1:{}", port);

    tauri::async_runtime::spawn(async move {
        let listener = TcpListener::from_std(std_listener)
            .expect("Failed to convert to tokio TcpListener");

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tokio::spawn(handle_connection(stream));
                }
                Err(e) => {
                    log::error!("[media-server] Accept error: {}", e);
                }
            }
        }
    });

    port
}

async fn handle_connection(mut stream: tokio::net::TcpStream) {
    let mut buf = vec![0u8; 8192];
    let n = match stream.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    let first_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        send_error(&mut stream, 400, "Bad Request").await;
        return;
    }

    let method = parts[0];
    let url = parts[1];

    // Handle CORS preflight
    if method == "OPTIONS" {
        send_cors_preflight(&mut stream).await;
        return;
    }

    if method != "GET" && method != "HEAD" {
        send_error(&mut stream, 405, "Method Not Allowed").await;
        return;
    }

    let is_head = method == "HEAD";

    let query_params = parse_query_string(url);
    let file_path = match query_params.get("path") {
        Some(p) => percent_decode(p),
        None => {
            send_error(&mut stream, 400, "Missing path parameter").await;
            return;
        }
    };

    let path = PathBuf::from(&file_path);
    if !path.exists() || !path.is_file() {
        log::warn!("[media-server] File not found: {}", file_path);
        send_error(&mut stream, 404, "File not found").await;
        return;
    }

    let file_size = match tokio::fs::metadata(&path).await {
        Ok(m) => m.len(),
        Err(_) => {
            send_error(&mut stream, 500, "Cannot read file metadata").await;
            return;
        }
    };

    let range = request
        .lines()
        .find(|line| line.to_lowercase().starts_with("range:"))
        .and_then(|line| parse_range_header(line, file_size));

    let content_type = mime_type_for(&file_path);

    match range {
        Some((start, end)) => {
            serve_range(&mut stream, &path, start, end, file_size, &content_type, is_head).await;
        }
        None => {
            serve_full(&mut stream, &path, file_size, &content_type, is_head).await;
        }
    }
}

async fn serve_range(
    stream: &mut tokio::net::TcpStream,
    path: &PathBuf,
    start: u64,
    end: u64,
    total: u64,
    content_type: &str,
    head_only: bool,
) {
    let content_length = end - start + 1;
    let header = format!(
        "HTTP/1.1 206 Partial Content\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Content-Range: bytes {}-{}/{}\r\n\
         Accept-Ranges: bytes\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Cache-Control: no-cache\r\n\
         Connection: close\r\n\
         \r\n",
        content_type, content_length, start, end, total
    );

    if stream.write_all(header.as_bytes()).await.is_err() {
        return;
    }

    if head_only {
        return;
    }

    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return,
    };

    if file.seek(SeekFrom::Start(start)).await.is_err() {
        return;
    }

    let mut remaining = content_length;
    let mut buf = vec![0u8; CHUNK_SIZE.min(remaining) as usize];
    while remaining > 0 {
        let to_read = CHUNK_SIZE.min(remaining) as usize;
        buf.resize(to_read, 0);
        match file.read(&mut buf[..to_read]).await {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buf[..n]).await.is_err() {
                    return;
                }
                remaining -= n as u64;
            }
            Err(_) => break,
        }
    }
}

async fn serve_full(
    stream: &mut tokio::net::TcpStream,
    path: &PathBuf,
    file_size: u64,
    content_type: &str,
    head_only: bool,
) {
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Accept-Ranges: bytes\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n\
         Cache-Control: no-cache\r\n\
         Connection: close\r\n\
         \r\n",
        content_type, file_size
    );

    if stream.write_all(header.as_bytes()).await.is_err() {
        return;
    }

    if head_only {
        return;
    }

    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return,
    };

    let mut buf = vec![0u8; CHUNK_SIZE as usize];
    loop {
        match file.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buf[..n]).await.is_err() {
                    return;
                }
            }
            Err(_) => break,
        }
    }
}

async fn send_cors_preflight(stream: &mut tokio::net::TcpStream) {
    let response = "HTTP/1.1 204 No Content\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, OPTIONS\r\n\
         Access-Control-Allow-Headers: Range\r\n\
         Access-Control-Max-Age: 86400\r\n\
         Connection: close\r\n\
         \r\n";
    let _ = stream.write_all(response.as_bytes()).await;
}

async fn send_error(stream: &mut tokio::net::TcpStream, code: u16, message: &str) {
    let body = format!("{} {}", code, message);
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: text/plain\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         \r\n\
         {}",
        code,
        message,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
}

fn parse_query_string(url: &str) -> std::collections::HashMap<String, String> {
    let mut params = std::collections::HashMap::new();
    if let Some(query) = url.split('?').nth(1) {
        for pair in query.split('&') {
            let parts: Vec<&str> = pair.splitn(2, '=').collect();
            if parts.len() == 2 {
                params.insert(parts[0].to_string(), parts[1].to_string());
            }
        }
    }
    params
}

fn parse_range_header(line: &str, file_size: u64) -> Option<(u64, u64)> {
    let value = line.split(':').nth(1)?.trim();
    let range = value.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }

    if parts[0].is_empty() {
        // Suffix range: bytes=-500 (last 500 bytes)
        let suffix: u64 = parts[1].parse().ok()?;
        let start = file_size.saturating_sub(suffix);
        return Some((start, file_size - 1));
    }

    let start: u64 = parts[0].parse().ok()?;
    let end: u64 = if parts[1].is_empty() {
        file_size - 1
    } else {
        parts[1].parse().ok()?
    };

    if start > end || start >= file_size {
        return None;
    }

    Some((start, end.min(file_size - 1)))
}

fn percent_decode(s: &str) -> String {
    let mut result = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &String::from_utf8_lossy(&bytes[i + 1..i + 3]),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            result.push(b' ');
        } else {
            result.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn mime_type_for(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".mp4") || lower.ends_with(".m4v") {
        "video/mp4"
    } else if lower.ends_with(".webm") {
        "video/webm"
    } else if lower.ends_with(".mkv") {
        "video/x-matroska"
    } else if lower.ends_with(".avi") {
        "video/x-msvideo"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else if lower.ends_with(".ts") {
        "video/mp2t"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".aac") {
        "audio/aac"
    } else {
        "application/octet-stream"
    }
}

#[tauri::command]
pub fn get_media_server_port(state: tauri::State<'_, MediaServerPort>) -> u16 {
    state.0
}

pub struct MediaServerPort(pub u16);

use rand::{distributions::Alphanumeric, Rng};
use std::collections::HashMap;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CHUNK_SIZE: u64 = 512 * 1024; // 512KB chunks
const TOKEN_QUERY_PARAMETER: &str = "token";
const MAX_AUTHORIZED_PATHS: usize = 256;
const AUTHORIZATION_TTL: Duration = Duration::from_secs(15 * 60);

pub type AuthorizedPaths = HashMap<PathBuf, Instant>;

pub struct MediaServerState {
    pub port: u16,
    pub token: String,
    pub allowed_paths: Arc<Mutex<AuthorizedPaths>>,
}

/// Start a local HTTP server for streaming video files with Range request support.
/// The server requires a per-process bearer token for every media request.
pub fn start() -> MediaServerState {
    let std_listener =
        std::net::TcpListener::bind("127.0.0.1:0").expect("Failed to bind media server");
    let port = std_listener.local_addr().unwrap().port();
    std_listener
        .set_nonblocking(true)
        .expect("Failed to set nonblocking");
    let token: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();
    let server_token = Arc::new(token.clone());
    let allowed_paths = Arc::new(Mutex::new(AuthorizedPaths::new()));
    let server_allowed_paths = Arc::clone(&allowed_paths);

    log::info!("[media-server] Starting on http://127.0.0.1:{}", port);

    tauri::async_runtime::spawn(async move {
        let listener =
            TcpListener::from_std(std_listener).expect("Failed to convert to tokio TcpListener");

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    tokio::spawn(handle_connection(
                        stream,
                        Arc::clone(&server_token),
                        Arc::clone(&server_allowed_paths),
                    ));
                }
                Err(e) => {
                    log::error!("[media-server] Accept error: {}", e);
                }
            }
        }
    });

    MediaServerState {
        port,
        token,
        allowed_paths,
    }
}

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    expected_token: Arc<String>,
    allowed_paths: Arc<Mutex<AuthorizedPaths>>,
) {
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

    // Handle CORS preflight without exposing file data.
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
    let request_token = query_params
        .get(TOKEN_QUERY_PARAMETER)
        .map(|value| percent_decode(value));
    if request_token.as_deref() != Some(expected_token.as_str()) {
        send_error(&mut stream, 403, "Forbidden").await;
        return;
    }

    let file_path = match query_params.get("path") {
        Some(p) => percent_decode(p),
        None => {
            send_error(&mut stream, 400, "Missing path parameter").await;
            return;
        }
    };

    let requested_path = Path::new(&file_path);
    let path = match std::fs::canonicalize(requested_path) {
        Ok(path) if path.is_file() => path,
        _ => {
            log::warn!("[media-server] File not found: {}", file_path);
            send_error(&mut stream, 404, "File not found").await;
            return;
        }
    };
    let is_allowed = allowed_paths
        .lock()
        .map(|mut paths| refresh_authorization(&mut paths, &path))
        .unwrap_or(false);
    if !is_allowed {
        send_error(&mut stream, 403, "File is not authorized").await;
        return;
    }

    let file_size = match tokio::fs::metadata(&path).await {
        Ok(m) => m.len(),
        Err(_) => {
            send_error(&mut stream, 500, "Cannot read file metadata").await;
            return;
        }
    };

    let range_header = request
        .lines()
        .find(|line| line.to_ascii_lowercase().starts_with("range:"));
    let range = range_header.and_then(|line| parse_range_header(line, file_size));

    let content_type = mime_type_for(&file_path);

    match (range_header.is_some(), range) {
        (true, Some((start, end))) => {
            serve_range(
                &mut stream,
                &path,
                start,
                end,
                file_size,
                content_type,
                is_head,
            )
            .await;
        }
        (true, None) => {
            send_range_not_satisfiable(&mut stream, file_size).await;
        }
        (false, Some((start, end))) => {
            serve_range(
                &mut stream,
                &path,
                start,
                end,
                file_size,
                content_type,
                is_head,
            )
            .await;
        }
        (false, None) => {
            serve_full(&mut stream, &path, file_size, content_type, is_head).await;
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

async fn send_range_not_satisfiable(stream: &mut tokio::net::TcpStream, file_size: u64) {
    let response = format!(
        "HTTP/1.1 416 Range Not Satisfiable\r\n\
         Content-Range: bytes */{}\r\n\
         Content-Length: 0\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         \r\n",
        file_size
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
    if file_size == 0 {
        return None;
    }

    let value = line.split_once(':')?.1.trim();
    let range = value.strip_prefix("bytes=")?;
    let parts: Vec<&str> = range.splitn(2, '-').collect();
    if parts.len() != 2 {
        return None;
    }

    if parts[0].is_empty() {
        // Suffix range: bytes=-500 (last 500 bytes)
        let suffix: u64 = parts[1].parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = file_size.saturating_sub(suffix);
        return Some((start, file_size - 1));
    }

    let start: u64 = parts[0].parse().ok()?;
    let end: u64 = if parts[1].is_empty() {
        file_size - 1
    } else {
        parts[1].parse().ok()?
    };

    if start >= file_size || end < start {
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
            if let Ok(byte) = u8::from_str_radix(&String::from_utf8_lossy(&bytes[i + 1..i + 3]), 16)
            {
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
pub fn get_media_server_port(state: tauri::State<'_, MediaServerState>) -> u16 {
    state.port
}

#[tauri::command]
pub fn get_media_server_token(state: tauri::State<'_, MediaServerState>) -> String {
    state.token.clone()
}

fn refresh_authorization(paths: &mut AuthorizedPaths, path: &Path) -> bool {
    let now = Instant::now();
    paths.retain(|_, authorized_at| now.duration_since(*authorized_at) <= AUTHORIZATION_TTL);
    if paths.contains_key(path) {
        paths.insert(path.to_path_buf(), now);
        true
    } else {
        false
    }
}

fn authorize_path(paths: &mut AuthorizedPaths, path: PathBuf) {
    let now = Instant::now();
    paths.retain(|_, authorized_at| now.duration_since(*authorized_at) <= AUTHORIZATION_TTL);
    if paths.len() >= MAX_AUTHORIZED_PATHS && !paths.contains_key(&path) {
        if let Some(oldest_path) = paths
            .iter()
            .min_by_key(|(_, authorized_at)| *authorized_at)
            .map(|(path, _)| path.clone())
        {
            paths.remove(&oldest_path);
        }
    }
    paths.insert(path, now);
}

#[tauri::command]
pub fn authorize_media_path(
    state: tauri::State<'_, MediaServerState>,
    file_path: String,
) -> Result<(), String> {
    if file_path.is_empty() || file_path.len() > 32_768 {
        return Err("Invalid media path.".to_string());
    }
    let path =
        std::fs::canonicalize(&file_path).map_err(|_| "Media file does not exist.".to_string())?;
    if !path.is_file() {
        return Err("Media path is not a file.".to_string());
    }
    let mut allowed_paths = state
        .allowed_paths
        .lock()
        .map_err(|_| "Media server state is unavailable.")?;
    authorize_path(&mut allowed_paths, path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{authorize_path, parse_range_header, refresh_authorization, AuthorizedPaths};
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    #[test]
    fn rejects_ranges_for_empty_files() {
        assert_eq!(parse_range_header("Range: bytes=0-", 0), None);
        assert_eq!(parse_range_header("Range: bytes=-1", 0), None);
    }

    #[test]
    fn rejects_zero_suffix_and_out_of_bounds_ranges() {
        assert_eq!(parse_range_header("Range: bytes=-0", 100), None);
        assert_eq!(parse_range_header("Range: bytes=100-", 100), None);
        assert_eq!(parse_range_header("Range: bytes=20-10", 100), None);
    }

    #[test]
    fn clamps_valid_ranges_to_file_size() {
        assert_eq!(
            parse_range_header("Range: bytes=10-200", 100),
            Some((10, 99))
        );
        assert_eq!(parse_range_header("Range: bytes=-20", 100), Some((80, 99)));
    }

    #[test]
    fn authorization_is_bounded_and_evicts_oldest_path() {
        let mut paths = AuthorizedPaths::new();
        for index in 0..=super::MAX_AUTHORIZED_PATHS {
            authorize_path(&mut paths, PathBuf::from(format!("/video-{index}.mp4")));
        }

        assert_eq!(paths.len(), super::MAX_AUTHORIZED_PATHS);
        assert!(!paths.contains_key(&PathBuf::from("/video-0.mp4")));
        assert!(paths.contains_key(&PathBuf::from(format!(
            "/video-{}.mp4",
            super::MAX_AUTHORIZED_PATHS
        ))));
    }

    #[test]
    fn expired_authorizations_are_removed_and_active_paths_are_refreshed() {
        let mut paths = AuthorizedPaths::new();
        let expired = PathBuf::from("/expired.mp4");
        let active = PathBuf::from("/active.mp4");
        paths.insert(
            expired.clone(),
            Instant::now() - Duration::from_secs(16 * 60),
        );
        paths.insert(active.clone(), Instant::now());

        assert!(!refresh_authorization(&mut paths, &expired));
        assert!(refresh_authorization(&mut paths, &active));
        assert!(!paths.contains_key(&expired));
        assert_eq!(paths.len(), 1);
    }
}

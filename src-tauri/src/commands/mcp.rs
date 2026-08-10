use axum::{
    body::Body,
    extract::State as AxumState,
    http::{Request, StatusCode},
    middleware::{from_fn_with_state, Next},
    response::{IntoResponse, Response},
    Router,
};
use rmcp::{
    handler::server::ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, Implementation, ListToolsResult,
        PaginatedRequestParams, ServerCapabilities, ServerInfo, Tool, ToolAnnotations,
    },
    service::RequestContext,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, tower::StreamableHttpService,
        StreamableHttpServerConfig,
    },
    RoleServer,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{sync::oneshot, time::timeout};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[cfg(unix)]
use std::{
    ffi::CString,
    os::fd::{AsRawFd, FromRawFd, OwnedFd},
    os::unix::ffi::OsStrExt,
};
#[cfg(windows)]
use std::{
    fs::{File, OpenOptions},
    mem::size_of,
    os::windows::{
        ffi::OsStrExt,
        fs::OpenOptionsExt,
        io::{AsRawHandle, RawHandle},
    },
    ptr,
};
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{FileRenameInfo, SetFileInformationByHandle};

const DEFAULT_PORT: u16 = 47_831;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_CATALOG_TOOLS: usize = 256;
const MAX_PENDING_REQUESTS: usize = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolDefinition {
    pub name: String,
    pub title: Option<String>,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
    pub read_only_hint: bool,
    pub destructive_hint: bool,
    pub idempotent_hint: bool,
    pub open_world_hint: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpBridgeRequest {
    request_id: String,
    kind: &'static str,
    name: String,
    arguments: Value,
}

type PendingResponse = Result<Value, String>;

#[derive(Clone)]
struct McpBridge {
    app: Arc<Mutex<Option<AppHandle>>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<PendingResponse>>>>,
    catalog: Arc<RwLock<Vec<McpToolDefinition>>>,
}

impl std::fmt::Debug for McpBridge {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("McpBridge")
            .field(
                "pending",
                &self
                    .pending
                    .lock()
                    .map(|pending| pending.len())
                    .unwrap_or(0),
            )
            .field(
                "catalog",
                &self
                    .catalog
                    .read()
                    .map(|catalog| catalog.len())
                    .unwrap_or(0),
            )
            .finish()
    }
}

impl Default for McpBridge {
    fn default() -> Self {
        Self {
            app: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            catalog: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl McpBridge {
    fn set_app(&self, app: AppHandle) -> Result<(), String> {
        let mut current = self
            .app
            .lock()
            .map_err(|_| "MCP bridge state is unavailable.".to_string())?;
        *current = Some(app);
        Ok(())
    }

    fn register_catalog(&self, catalog: Vec<McpToolDefinition>) -> Result<(), String> {
        if catalog.len() > MAX_CATALOG_TOOLS {
            return Err("MCP catalog exceeds the supported tool limit.".to_string());
        }
        let mut names = std::collections::HashSet::new();
        for tool in &catalog {
            if tool.name.trim().is_empty() || tool.name.len() > 128 || !names.insert(&tool.name) {
                return Err("MCP catalog contains an invalid or duplicate tool name.".to_string());
            }
            if !tool.input_schema.is_object() {
                return Err(format!(
                    "MCP tool '{}' has an invalid input JSON schema.",
                    tool.name
                ));
            }
            match tool.output_schema.as_ref() {
                Some(schema) if schema.is_object() => {}
                _ => {
                    return Err(format!(
                        "MCP tool '{}' must define an output JSON schema.",
                        tool.name
                    ));
                }
            }
        }
        let mut current = self
            .catalog
            .write()
            .map_err(|_| "MCP catalog state is unavailable.".to_string())?;
        *current = catalog;
        Ok(())
    }

    fn catalog(&self) -> Vec<McpToolDefinition> {
        self.catalog
            .read()
            .map(|catalog| catalog.clone())
            .unwrap_or_default()
    }

    fn remove_pending(&self, request_id: &str) {
        self.pending
            .lock()
            .ok()
            .map(|mut pending| pending.remove(request_id));
    }

    async fn dispatch(&self, name: String, arguments: Value) -> PendingResponse {
        let request_id = Uuid::new_v4().to_string();
        let (sender, receiver) = oneshot::channel();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "MCP bridge state is unavailable.".to_string())?;
            if pending.len() >= MAX_PENDING_REQUESTS {
                return Err("Too many MCP requests are already pending.".to_string());
            }
            pending.insert(request_id.clone(), sender);
        }

        let app = match self.app.lock() {
            Ok(app) => app
                .clone()
                .ok_or_else(|| "Cliprithm is not ready to execute MCP actions.".to_string()),
            Err(_) => Err("MCP bridge state is unavailable.".to_string()),
        };
        if let Err(error) = app.and_then(|app| {
            app.emit(
                "mcp-request",
                McpBridgeRequest {
                    request_id: request_id.clone(),
                    kind: "tool",
                    name,
                    arguments,
                },
            )
            .map_err(|error| format!("Could not send MCP request to Cliprithm: {error}"))
        }) {
            self.remove_pending(&request_id);
            return Err(error);
        }

        let response = match timeout(REQUEST_TIMEOUT, receiver).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => {
                self.remove_pending(&request_id);
                return Err("Cliprithm closed the MCP request before responding.".to_string());
            }
            Err(_) => {
                self.remove_pending(&request_id);
                return Err("Cliprithm did not respond to the MCP request in time.".to_string());
            }
        };
        self.remove_pending(&request_id);
        response
    }

    fn resolve(&self, request_id: String, result: PendingResponse) -> Result<(), String> {
        let sender = self
            .pending
            .lock()
            .map_err(|_| "MCP bridge state is unavailable.".to_string())?
            .remove(&request_id)
            .ok_or_else(|| "MCP request is unknown or already completed.".to_string())?;
        sender
            .send(result)
            .map_err(|_| "MCP request receiver is no longer available.".to_string())
    }

    fn fail_pending(&self, error: String) {
        if let Ok(mut pending) = self.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err(error.clone()));
            }
        }
    }
}

#[derive(Debug)]
struct McpRuntime {
    port: u16,
    cancellation: CancellationToken,
    finished: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

#[derive(Clone, Debug)]
pub struct McpState {
    bridge: Arc<McpBridge>,
    runtime: Arc<Mutex<Option<McpRuntime>>>,
    lifecycle: Arc<tokio::sync::Mutex<()>>,
    token: Arc<Mutex<String>>,
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            bridge: Arc::new(McpBridge::default()),
            runtime: Arc::new(Mutex::new(None)),
            lifecycle: Arc::new(tokio::sync::Mutex::new(())),
            token: Arc::new(Mutex::new(format!("mcp-{}", Uuid::new_v4()))),
        }
    }
}

impl McpState {
    fn current_token(&self) -> Result<String, String> {
        self.token
            .lock()
            .map(|token| token.clone())
            .map_err(|_| "MCP server token state is unavailable.".to_string())
    }

    fn rotate_token(&self) -> Result<String, String> {
        let mut token = self
            .token
            .lock()
            .map_err(|_| "MCP server token state is unavailable.".to_string())?;
        *token = format!("mcp-{}", Uuid::new_v4());
        Ok(token.clone())
    }
}

#[derive(Clone, Debug)]
struct CliprithmMcpServer {
    bridge: Arc<McpBridge>,
}

impl ServerHandler for CliprithmMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("cliprithm-mcp-server", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "Use Cliprithm project and editor tools. Read project context before mutating and pass the current revision when required.",
            )
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListToolsResult, rmcp::ErrorData>> + Send + '_
    {
        let tools = self
            .bridge
            .catalog()
            .into_iter()
            .filter_map(|definition| tool_from_definition(definition).ok())
            .collect();
        std::future::ready(Ok(ListToolsResult::with_all_items(tools)))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.bridge
            .catalog()
            .into_iter()
            .find(|definition| definition.name == name)
            .and_then(|definition| tool_from_definition(definition).ok())
    }

    fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<CallToolResponse, rmcp::ErrorData>> + Send + '_
    {
        let bridge = self.bridge.clone();
        async move {
            let name = request.name.to_string();
            if !bridge
                .catalog()
                .iter()
                .any(|definition| definition.name == name)
            {
                return Ok(CallToolResponse::Complete(
                    CallToolResult::structured_error(serde_json::json!({
                        "errorCode": "TOOL_NOT_FOUND",
                        "message": format!("MCP tool '{}' is not registered.", name),
                        "retryable": false
                    })),
                ));
            }
            let arguments = Value::Object(request.arguments.unwrap_or_default());
            match bridge.dispatch(name, arguments).await {
                Ok(value) => Ok(CallToolResponse::Complete(CallToolResult::structured(
                    value,
                ))),
                Err(error) => Ok(CallToolResponse::Complete(
                    CallToolResult::structured_error(serde_json::json!({
                        "errorCode": "MCP_BRIDGE_ERROR",
                        "message": error,
                        "retryable": true
                    })),
                )),
            }
        }
    }
}

fn tool_from_definition(definition: McpToolDefinition) -> Result<Tool, String> {
    let input_schema = definition
        .input_schema
        .as_object()
        .cloned()
        .ok_or_else(|| "Tool input schema must be an object.".to_string())?;
    let mut tool = Tool::new(
        definition.name,
        definition.description,
        Arc::new(input_schema),
    );
    if let Some(title) = definition.title {
        tool = tool.with_title(title);
    }
    if let Some(output_schema) = definition.output_schema {
        let schema = output_schema
            .as_object()
            .cloned()
            .ok_or_else(|| "Tool output schema must be an object.".to_string())?;
        tool = tool.with_raw_output_schema(Arc::new(schema));
    }
    tool = tool.with_annotations(
        ToolAnnotations::new()
            .read_only(definition.read_only_hint)
            .destructive(definition.destructive_hint)
            .idempotent(definition.idempotent_hint)
            .open_world(definition.open_world_hint),
    );
    Ok(tool)
}

fn running_status(runtime: &Option<McpRuntime>, token: &str) -> McpServerStatus {
    let Some(runtime) = runtime else {
        return McpServerStatus {
            running: false,
            port: None,
            url: None,
            token: None,
            error: None,
        };
    };

    if !runtime.finished.load(Ordering::Acquire) {
        return McpServerStatus {
            running: true,
            port: Some(runtime.port),
            url: Some(format!("http://127.0.0.1:{}/mcp", runtime.port)),
            token: Some(token.to_string()),
            error: None,
        };
    }

    McpServerStatus {
        running: false,
        port: None,
        url: None,
        token: None,
        error: runtime.error.lock().ok().and_then(|error| error.clone()),
    }
}

fn has_valid_bearer_token(request: &Request<Body>, token: &str) -> bool {
    request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|provided| provided == token)
}

async fn authorize_mcp_request(
    AxumState(token): AxumState<Arc<String>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if !has_valid_bearer_token(&request, token.as_str()) {
        return (StatusCode::UNAUTHORIZED, "MCP authorization required.").into_response();
    }

    next.run(request).await
}

#[tauri::command]
pub fn get_mcp_server_status(state: State<'_, McpState>) -> Result<McpServerStatus, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "MCP server state is unavailable.".to_string())?;
    Ok(running_status(&runtime, &state.current_token()?))
}

#[tauri::command]
pub fn register_mcp_catalog(
    state: State<'_, McpState>,
    catalog: Vec<McpToolDefinition>,
) -> Result<(), String> {
    state.bridge.register_catalog(catalog)
}

#[tauri::command]
pub fn resolve_mcp_request(
    state: State<'_, McpState>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    let response = match error {
        Some(error) => Err(error),
        None => Ok(result.unwrap_or_else(|| Value::Object(Map::new()))),
    };
    state.bridge.resolve(request_id, response)
}

fn mcp_path_is_within(root: &Path, path: &Path) -> bool {
    #[cfg(windows)]
    {
        let root = root
            .to_string_lossy()
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_ascii_lowercase();
        let path = path
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();
        path == root || path.starts_with(&format!("{root}/"))
    }
    #[cfg(not(windows))]
    {
        path.starts_with(root)
    }
}

fn mcp_paths_equal(left: &Path, right: &Path) -> bool {
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

fn ensure_regular_directory(path: &Path, description: &str) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(format!("{description} must be a regular directory."));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(path)
                .map_err(|error| format!("Could not create {description}: {error}"))?;
            let metadata = std::fs::symlink_metadata(path)
                .map_err(|error| format!("Could not inspect {description}: {error}"))?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(format!("{description} must be a regular directory."));
            }
        }
        Err(error) => {
            return Err(format!("Could not inspect {description}: {error}"));
        }
    }
    Ok(())
}

fn ensure_mcp_output_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the MCP output directory: {error}"))?;

    if let Err(error) = std::fs::symlink_metadata(&app_data_dir) {
        if error.kind() == std::io::ErrorKind::NotFound {
            std::fs::create_dir_all(&app_data_dir).map_err(|error| {
                format!("Could not create the application data directory: {error}")
            })?;
        } else {
            return Err(format!(
                "Could not inspect the application data directory: {error}"
            ));
        }
    }
    ensure_regular_directory(&app_data_dir, "The application data directory")?;

    let output_root = app_data_dir.join("mcp-outputs");
    ensure_regular_directory(&output_root, "The MCP output directory")?;
    Ok(output_root)
}

fn mcp_relative_components(root: &Path, path: &Path) -> Result<Vec<PathBuf>, String> {
    let normalized_root = root
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string();
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    let comparison_root = if cfg!(windows) {
        normalized_root.to_ascii_lowercase()
    } else {
        normalized_root.clone()
    };
    let comparison_path = if cfg!(windows) {
        normalized_path.to_ascii_lowercase()
    } else {
        normalized_path.clone()
    };

    if comparison_path == comparison_root {
        return Ok(Vec::new());
    }
    let prefix = format!("{comparison_root}/");
    if !comparison_path.starts_with(&prefix) {
        return Err("MCP output path escaped its output directory.".to_string());
    }

    let suffix_start = normalized_root.len() + 1;
    normalized_path[suffix_start..]
        .split('/')
        .map(|component| {
            if component.is_empty() || component == "." || component == ".." {
                return Err("MCP output path contains an invalid directory component.".to_string());
            }
            Ok(PathBuf::from(component))
        })
        .collect()
}

fn ensure_mcp_output_parent(output_root: &Path, parent: &Path) -> Result<(), String> {
    let components = mcp_relative_components(output_root, parent)?;
    let mut current = output_root.to_path_buf();
    for component in components {
        current.push(component);
        ensure_regular_directory(&current, "The MCP output parent")?;
    }
    Ok(())
}

fn validate_mcp_output_file(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if !requested.is_absolute() {
        return Err("MCP output paths must be absolute.".to_string());
    }

    let output_root = ensure_mcp_output_directory(app)?;

    let parent = requested
        .parent()
        .ok_or_else(|| "MCP output path has no parent directory.".to_string())?;
    if !mcp_path_is_within(&output_root, parent) {
        return Err("MCP output path must remain inside the MCP output directory.".to_string());
    }
    ensure_mcp_output_parent(&output_root, parent)?;

    let mut ancestor = parent;
    loop {
        let metadata = std::fs::symlink_metadata(ancestor)
            .map_err(|error| format!("Could not inspect MCP output path: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(
                "MCP output paths cannot pass through symbolic links or non-directories."
                    .to_string(),
            );
        }
        if mcp_paths_equal(ancestor, &output_root) {
            break;
        }
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "MCP output path escaped its output directory.".to_string())?;
    }

    let canonical_root = std::fs::canonicalize(&output_root)
        .map_err(|error| format!("Could not resolve the MCP output directory: {error}"))?;
    let canonical_parent = std::fs::canonicalize(parent)
        .map_err(|error| format!("Could not resolve the MCP output path: {error}"))?;
    if !mcp_path_is_within(&canonical_root, &canonical_parent) {
        return Err("MCP output path must remain inside the MCP output directory.".to_string());
    }

    let target = canonical_parent.join(
        requested
            .file_name()
            .ok_or_else(|| "MCP output path must name a file.".to_string())?,
    );
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("MCP output must be a regular file path.".to_string());
        }
    }
    Ok(target)
}

#[cfg(unix)]
fn open_mcp_directory(root: &Path, path: &Path) -> Result<OwnedFd, String> {
    let root_name = CString::new(root.as_os_str().as_bytes())
        .map_err(|_| "MCP output directory contains an invalid path.".to_string())?;
    let root_fd = unsafe {
        libc::open(
            root_name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if root_fd < 0 {
        return Err(format!(
            "Could not open the MCP output directory: {}",
            std::io::Error::last_os_error()
        ));
    }

    let mut directory = unsafe { OwnedFd::from_raw_fd(root_fd) };
    for component in mcp_relative_components(root, path)? {
        let name = CString::new(component.as_os_str().as_bytes())
            .map_err(|_| "MCP output path contains an invalid component.".to_string())?;
        let next_fd = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if next_fd < 0 {
            return Err(format!(
                "Could not open the MCP output parent: {}",
                std::io::Error::last_os_error()
            ));
        }
        directory = unsafe { OwnedFd::from_raw_fd(next_fd) };
    }
    Ok(directory)
}

#[cfg(unix)]
fn mcp_file_name(path: &Path) -> Result<CString, String> {
    let name = path
        .file_name()
        .ok_or_else(|| "MCP output path must name a file.".to_string())?;
    CString::new(name.as_bytes())
        .map_err(|_| "MCP output path contains an invalid file name.".to_string())
}

#[cfg(unix)]
fn replace_mcp_output_files(
    root: &Path,
    temporary: &Path,
    output: &Path,
    allow_existing: bool,
) -> Result<(), String> {
    let temporary_parent = temporary
        .parent()
        .ok_or_else(|| "MCP temporary output has no parent directory.".to_string())?;
    let output_parent = output
        .parent()
        .ok_or_else(|| "MCP output has no parent directory.".to_string())?;
    let temporary_directory = open_mcp_directory(root, temporary_parent)?;
    let output_directory = open_mcp_directory(root, output_parent)?;
    let temporary_name = mcp_file_name(temporary)?;
    let output_name = mcp_file_name(output)?;

    let source_fd = unsafe {
        libc::openat(
            temporary_directory.as_raw_fd(),
            temporary_name.as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if source_fd < 0 {
        return Err(format!(
            "Could not open the MCP temporary output: {}",
            std::io::Error::last_os_error()
        ));
    }
    let source_file = unsafe { std::fs::File::from_raw_fd(source_fd) };
    if !source_file
        .metadata()
        .map_err(|error| format!("Could not inspect the MCP temporary output: {error}"))?
        .is_file()
    {
        return Err("MCP temporary output must be a regular file.".to_string());
    }

    let result = if allow_existing {
        unsafe {
            libc::renameat(
                temporary_directory.as_raw_fd(),
                temporary_name.as_ptr(),
                output_directory.as_raw_fd(),
                output_name.as_ptr(),
            )
        }
    } else {
        let linked = unsafe {
            libc::linkat(
                temporary_directory.as_raw_fd(),
                temporary_name.as_ptr(),
                output_directory.as_raw_fd(),
                output_name.as_ptr(),
                0,
            )
        };
        if linked == 0 {
            let removed = unsafe {
                libc::unlinkat(temporary_directory.as_raw_fd(), temporary_name.as_ptr(), 0)
            };
            if removed != 0 {
                return Err(format!(
                    "MCP output was created but its temporary file could not be removed: {}",
                    std::io::Error::last_os_error()
                ));
            }
        }
        linked
    };
    if result != 0 {
        return Err(format!(
            "Could not atomically replace MCP output: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(windows)]
#[repr(C)]
struct WindowsFileRenameInfo {
    replace_if_exists: u32,
    root_directory: RawHandle,
    file_name_length: u32,
    file_name: [u16; 1],
}

#[cfg(windows)]
fn open_windows_directory(path: &Path) -> Result<File, String> {
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

    OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|error| format!("Could not lock the MCP output directory: {error}"))
}

#[cfg(windows)]
fn lock_windows_directory_chain(
    root: &Path,
    path: &Path,
    locks: &mut Vec<(PathBuf, File)>,
) -> Result<usize, String> {
    let mut current = root.to_path_buf();
    let mut paths = vec![current.clone()];
    paths.extend(
        mcp_relative_components(root, path)?
            .into_iter()
            .map(|component| {
                current.push(component);
                current.clone()
            }),
    );

    let mut last_index = 0;
    for path in paths {
        if let Some((index, _)) = locks
            .iter()
            .enumerate()
            .find(|(_, (locked, _))| mcp_paths_equal(locked, &path))
        {
            last_index = index;
            continue;
        }
        let file = open_windows_directory(&path)?;
        locks.push((path, file));
        last_index = locks.len() - 1;
    }
    Ok(last_index)
}

#[cfg(windows)]
fn replace_mcp_output_files(
    root: &Path,
    temporary: &Path,
    output: &Path,
    allow_existing: bool,
) -> Result<(), String> {
    const DELETE_ACCESS: u32 = 0x0001_0000;
    const FILE_READ_ATTRIBUTES: u32 = 0x0000_0080;
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    const FILE_SHARE_DELETE: u32 = 0x0000_0004;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

    let temporary_parent = temporary
        .parent()
        .ok_or_else(|| "MCP temporary output has no parent directory.".to_string())?;
    let output_parent = output
        .parent()
        .ok_or_else(|| "MCP output has no parent directory.".to_string())?;
    let mut locks = Vec::new();
    let _ = lock_windows_directory_chain(root, temporary_parent, &mut locks)?;
    let output_parent_index = lock_windows_directory_chain(root, output_parent, &mut locks)?;
    let output_name = output
        .file_name()
        .ok_or_else(|| "MCP output must name a file.".to_string())?;
    let source = OpenOptions::new()
        .access_mode(DELETE_ACCESS | FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(temporary)
        .map_err(|error| format!("Could not open the MCP temporary output: {error}"))?;
    if !source
        .metadata()
        .map_err(|error| format!("Could not inspect the MCP temporary output: {error}"))?
        .is_file()
    {
        return Err("MCP temporary output must be a regular file.".to_string());
    }

    let output_name = output_name.encode_wide().collect::<Vec<_>>();
    let header_size = size_of::<WindowsFileRenameInfo>() - size_of::<u16>();
    let buffer_size = header_size
        .checked_add(
            output_name
                .len()
                .checked_mul(size_of::<u16>())
                .ok_or_else(|| "MCP output file name is too long.".to_string())?,
        )
        .ok_or_else(|| "MCP output file name is too long.".to_string())?;
    let mut buffer = vec![0_u8; buffer_size];
    let info = buffer.as_mut_ptr() as *mut WindowsFileRenameInfo;
    unsafe {
        (*info).replace_if_exists = u32::from(allow_existing);
        (*info).root_directory = locks[output_parent_index].1.as_raw_handle();
        (*info).file_name_length = (output_name.len() * size_of::<u16>()) as u32;
        ptr::copy_nonoverlapping(
            output_name.as_ptr(),
            (*info).file_name.as_mut_ptr(),
            output_name.len(),
        );
    }

    let renamed = unsafe {
        SetFileInformationByHandle(
            source.as_raw_handle() as _,
            FileRenameInfo,
            buffer.as_ptr().cast(),
            buffer.len() as u32,
        )
    };
    if renamed == 0 {
        return Err(format!(
            "Could not atomically replace MCP output: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn replace_mcp_output(
    app: AppHandle,
    temporary_path: String,
    output_path: String,
    allow_existing: bool,
) -> Result<(), String> {
    let output_root = ensure_mcp_output_directory(&app)?;
    let temporary = validate_mcp_output_file(&app, &temporary_path)?;
    let output = validate_mcp_output_file(&app, &output_path)?;
    if temporary == output {
        return Err("MCP temporary and final output paths must differ.".to_string());
    }
    if !temporary.is_file() {
        return Err("MCP temporary output does not exist.".to_string());
    }
    let canonical_root = std::fs::canonicalize(&output_root)
        .map_err(|error| format!("Could not resolve the MCP output directory: {error}"))?;
    replace_mcp_output_files(&canonical_root, &temporary, &output, allow_existing)
}

#[tauri::command]
pub async fn start_mcp_server(
    app: AppHandle,
    state: State<'_, McpState>,
    port: Option<u16>,
) -> Result<McpServerStatus, String> {
    let _lifecycle = state.lifecycle.lock().await;
    let port = port.unwrap_or(DEFAULT_PORT);
    if port == 0 {
        return Err("MCP port must be greater than zero.".to_string());
    }
    ensure_mcp_output_directory(&app)?;
    state.bridge.set_app(app)?;

    {
        let runtime = state
            .runtime
            .lock()
            .map_err(|_| "MCP server state is unavailable.".to_string())?;
        if runtime.as_ref().is_some_and(|current| {
            !current.finished.load(Ordering::Acquire) && current.port == port
        }) {
            return Ok(running_status(&runtime, &state.current_token()?));
        }
    }

    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|error| format!("Could not bind MCP server to 127.0.0.1:{port}: {error}"))?;

    let previous_runtime = state
        .runtime
        .lock()
        .map_err(|_| "MCP server state is unavailable.")?
        .take();
    if let Some(previous_runtime) = previous_runtime {
        previous_runtime.cancellation.cancel();
        state
            .bridge
            .fail_pending("MCP server restarted.".to_string());
        let _ = previous_runtime.task.await;
    }
    let token = state.rotate_token()?;
    let auth_token = Arc::new(token.clone());
    let cancellation = CancellationToken::new();
    let service_bridge = state.bridge.clone();
    let service_config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(true)
        .with_json_response(true)
        .with_allowed_hosts([format!("127.0.0.1:{port}"), format!("localhost:{port}")])
        .with_allowed_origins([
            format!("http://127.0.0.1:{port}"),
            format!("http://localhost:{port}"),
        ])
        .with_cancellation_token(cancellation.child_token());
    let service: StreamableHttpService<CliprithmMcpServer, LocalSessionManager> =
        StreamableHttpService::new(
            move || {
                Ok(CliprithmMcpServer {
                    bridge: service_bridge.clone(),
                })
            },
            Default::default(),
            service_config,
        );
    let router = Router::new()
        .nest_service("/mcp", service)
        .layer(from_fn_with_state(auth_token, authorize_mcp_request));
    let shutdown = cancellation.clone();
    let task_bridge = state.bridge.clone();
    let finished = Arc::new(AtomicBool::new(false));
    let server_error = Arc::new(Mutex::new(None));
    let finished_task = finished.clone();
    let error_task = server_error.clone();
    let task = tauri::async_runtime::spawn(async move {
        let stop_result = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown.cancelled_owned())
            .await;
        let stop_error = stop_result
            .err()
            .map(|error| format!("MCP server stopped with error: {error}"));
        if let Some(message) = &stop_error {
            log::error!("[mcp] {}", message);
            if let Ok(mut server_error) = error_task.lock() {
                *server_error = Some(message.clone());
            }
        }
        task_bridge.fail_pending(stop_error.unwrap_or_else(|| "MCP server stopped.".to_string()));
        finished_task.store(true, Ordering::Release);
    });
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "MCP server state is unavailable.")?;
    *runtime = Some(McpRuntime {
        port,
        cancellation,
        finished,
        error: server_error,
        task,
    });
    log::info!("[mcp] Server started on http://127.0.0.1:{port}/mcp");
    Ok(running_status(&runtime, &token))
}

#[tauri::command]
pub async fn stop_mcp_server(state: State<'_, McpState>) -> Result<McpServerStatus, String> {
    let _lifecycle = state.lifecycle.lock().await;
    let current = state
        .runtime
        .lock()
        .map_err(|_| "MCP server state is unavailable.")?
        .take();
    if let Some(runtime) = current {
        runtime.cancellation.cancel();
        state
            .bridge
            .fail_pending("MCP server is disabled.".to_string());
        let _ = runtime.task.await;
    }
    Ok(McpServerStatus {
        running: false,
        port: None,
        url: None,
        token: None,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_mcp_output_parent, ensure_regular_directory, has_valid_bearer_token,
        replace_mcp_output_files,
    };
    use axum::{body::Body, http::Request};

    #[test]
    fn creates_and_reuses_a_regular_directory() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let output_directory = temporary.path().join("mcp-outputs");

        ensure_regular_directory(&output_directory, "MCP output directory")
            .expect("missing output directory should be created");
        ensure_regular_directory(&output_directory, "MCP output directory")
            .expect("existing output directory should be reusable");
        assert!(output_directory.is_dir());
    }

    #[test]
    fn creates_nested_output_directories_without_following_parent_components() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let output_root = temporary.path().join("mcp-outputs");
        let nested_parent = output_root.join("previews").join("session");
        ensure_regular_directory(&output_root, "MCP output directory")
            .expect("output root should be created");

        ensure_mcp_output_parent(&output_root, &nested_parent)
            .expect("nested output parent should be created");

        assert!(nested_parent.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symbolic_link_instead_of_following_it() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let target = temporary.path().join("target");
        let link = temporary.path().join("mcp-outputs");
        std::fs::create_dir(&target).expect("target directory should be created");
        std::os::unix::fs::symlink(&target, &link).expect("symbolic link should be created");

        let error = ensure_regular_directory(&link, "MCP output directory")
            .expect_err("symbolic links must be rejected");
        assert!(error.contains("regular directory"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symbolic_link_in_a_nested_output_parent() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let output_root = temporary.path().join("mcp-outputs");
        let target = temporary.path().join("outside");
        let link = output_root.join("previews");
        std::fs::create_dir(&output_root).expect("output root should be created");
        std::fs::create_dir(&target).expect("target directory should be created");
        std::os::unix::fs::symlink(&target, &link).expect("symbolic link should be created");

        let error = ensure_mcp_output_parent(&output_root, &link.join("session"))
            .expect_err("nested symbolic links must be rejected");
        assert!(error.contains("regular directory"));
        assert!(!target.join("session").exists());
    }

    #[cfg(unix)]
    #[test]
    fn replaces_outputs_relative_to_the_validated_directory() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let root = temporary.path().join("mcp-outputs");
        let nested = root.join("previews");
        std::fs::create_dir_all(&nested).expect("output directory should be created");
        let temporary_path = nested.join(".preview.mp4.tmp.mp4");
        let output_path = nested.join("preview.mp4");
        std::fs::write(&temporary_path, b"new").expect("temporary output should be written");
        std::fs::write(&output_path, b"old").expect("existing output should be written");

        replace_mcp_output_files(&root, &temporary_path, &output_path, true)
            .expect("output should be replaced");

        assert_eq!(
            std::fs::read(&output_path).expect("output should exist"),
            b"new"
        );
        assert!(!temporary_path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn does_not_replace_an_output_that_appeared_during_rendering() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let root = temporary.path().join("mcp-outputs");
        let nested = root.join("previews");
        let temporary_path = nested.join(".preview.mp4.tmp.mp4");
        let output_path = nested.join("preview.mp4");
        std::fs::create_dir_all(&nested).expect("output directory should be created");
        std::fs::write(&temporary_path, b"new").expect("temporary output should be written");
        std::fs::write(&output_path, b"appeared").expect("output should be written");

        let error = replace_mcp_output_files(&root, &temporary_path, &output_path, false)
            .expect_err("an output that appeared after validation must not be replaced");

        assert!(error.contains("File exists"));
        assert_eq!(
            std::fs::read(&output_path).expect("output should exist"),
            b"appeared"
        );
        assert_eq!(
            std::fs::read(&temporary_path).expect("temporary output should remain for cleanup"),
            b"new"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symbolic_link_as_the_temporary_output() {
        let temporary = tempfile::tempdir().expect("temporary directory should be created");
        let root = temporary.path().join("mcp-outputs");
        let outside = temporary.path().join("outside.mp4");
        let nested = root.join("previews");
        let temporary_path = nested.join(".preview.mp4.tmp.mp4");
        let output_path = nested.join("preview.mp4");
        std::fs::create_dir_all(&nested).expect("output directory should be created");
        std::fs::write(&outside, b"outside").expect("outside file should be written");
        std::os::unix::fs::symlink(&outside, &temporary_path)
            .expect("temporary output symlink should be created");

        let error = replace_mcp_output_files(&root, &temporary_path, &output_path, true)
            .expect_err("symbolic link temporary output must be rejected");

        assert!(error.contains("temporary output"));
        assert!(outside.exists());
        assert!(!output_path.exists());
    }

    #[test]
    fn requires_the_exact_bearer_token() {
        let missing = Request::new(Body::empty());
        assert!(!has_valid_bearer_token(&missing, "secret"));

        let wrong = Request::builder()
            .header("Authorization", "Bearer wrong")
            .body(Body::empty())
            .expect("request should build");
        assert!(!has_valid_bearer_token(&wrong, "secret"));

        let valid = Request::builder()
            .header("Authorization", "Bearer secret")
            .body(Body::empty())
            .expect("request should build");
        assert!(has_valid_bearer_token(&valid, "secret"));
    }
}

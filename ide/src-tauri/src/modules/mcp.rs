use std::path::Path;
use std::sync::Mutex;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Read and atomically clear the MCP command queue.
/// External tools (Python MCP server, REST API) write commands to
/// ROOT/.mcp-queue.json; the frontend drains this whenever it gets an
/// `atlas:mcp-cmd` event from the file watcher, plus on startup and a slow
/// (3s) polling fallback for safety.
#[tauri::command]
pub async fn mcp_dequeue(root: String) -> Vec<serde_json::Value> {
    let queue = Path::new(&root).join(".mcp-queue.json");
    if !queue.exists() {
        return vec![];
    }
    let content = match std::fs::read_to_string(&queue) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    let _ = std::fs::remove_file(&queue);
    serde_json::from_str::<Vec<serde_json::Value>>(&content).unwrap_or_default()
}

/// Write the current canvas state snapshot to ROOT/.ide-state.json so the
/// MCP server and REST API can read the live canvas layout.
#[tauri::command]
pub async fn mcp_export_state(root: String, state: String) -> Result<(), String> {
    let path = Path::new(&root).join(".ide-state.json");
    std::fs::write(&path, state.as_bytes()).map_err(|e| e.to_string())
}

// Single watcher per app lifetime. `mcp_watch_start` is idempotent — calling
// it again after the watcher is already running is a no-op.
static WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

/// Start a filesystem watcher on ROOT/.mcp-queue.json. When the queue file
/// is created or modified by an external tool, emit `atlas:mcp-cmd` on the
/// app event bus so the frontend can drain the queue immediately instead of
/// waiting for the next polling tick.
#[tauri::command]
pub fn mcp_watch_start(app: AppHandle, root: String) -> Result<(), String> {
    let mut guard = WATCHER.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(()); // already watching
    }
    let queue_path = Path::new(&root).join(".mcp-queue.json");
    let parent = queue_path
        .parent()
        .ok_or_else(|| "invalid workspace root".to_string())?
        .to_path_buf();
    if !parent.exists() {
        return Err(format!("workspace root does not exist: {}", parent.display()));
    }
    let queue_name = queue_path
        .file_name()
        .ok_or_else(|| "invalid queue path".to_string())?
        .to_owned();
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        // Fire on create + modify; ignore the metadata-only and access events.
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
            return;
        }
        if event
            .paths
            .iter()
            .any(|p| p.file_name() == Some(queue_name.as_os_str()))
        {
            let _ = app_handle.emit("atlas:mcp-cmd", ());
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

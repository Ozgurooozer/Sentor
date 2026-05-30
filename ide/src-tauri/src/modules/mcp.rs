use std::path::Path;
use std::sync::Mutex;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct McpState(pub Mutex<Option<RecommendedWatcher>>);

/// Read and atomically clear the MCP command queue.
/// External tools (Python MCP server, REST API) write commands to
/// ROOT/.mcp-queue.json; the frontend drains this whenever it gets an
/// `atlas:mcp-cmd` event from the file watcher, plus on startup and a slow
/// (30s) polling fallback for safety.
#[tauri::command]
pub async fn mcp_dequeue(root: String) -> Vec<serde_json::Value> {
    let queue = Path::new(&root).join(".mcp-queue.json");
    if !queue.exists() {
        return vec![];
    }
    // Rename atomically before reading — concurrent calls each get their own snapshot.
    let tmp = queue.with_extension("json.draining");
    if std::fs::rename(&queue, &tmp).is_err() {
        return vec![]; // another call claimed it first
    }
    let content = match std::fs::read_to_string(&tmp) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("mcp_dequeue: read error: {e}");
            let _ = std::fs::remove_file(&tmp);
            return vec![];
        }
    };
    let _ = std::fs::remove_file(&tmp);
    match serde_json::from_str::<Vec<serde_json::Value>>(&content) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("mcp_dequeue: malformed queue JSON: {e}");
            vec![]
        }
    }
}

/// Write the current canvas state snapshot to ROOT/.ide-state.json so the
/// MCP server and REST API can read the live canvas layout.
#[tauri::command]
pub async fn mcp_export_state(root: String, state: String) -> Result<(), String> {
    let path = Path::new(&root).join(".ide-state.json");
    std::fs::write(&path, state.as_bytes()).map_err(|e| e.to_string())
}

/// Start a filesystem watcher on ROOT/.mcp-queue.json. When the queue file
/// is created or modified by an external tool, emit `atlas:mcp-cmd` on the
/// app event bus so the frontend can drain the queue immediately instead of
/// waiting for the next polling tick.
///
/// Idempotent — calling again while a watcher is already running is a no-op.
#[tauri::command]
pub fn mcp_watch_start(
    app: AppHandle,
    state: tauri::State<McpState>,
    root: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
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

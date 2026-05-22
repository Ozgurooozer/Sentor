use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use super::repo_root;

const DEBOUNCE: Duration = Duration::from_secs(5);

#[derive(serde::Serialize, Clone)]
struct ReindexedPayload {
    changed: Vec<String>,
    full: bool,
}

/// Start the vault file watcher in a background thread.
/// Watches `vault/` for any write/create/remove; debounces 5 s; spawns
/// `python tools/indexer.py --changed-files <paths>` then emits `vault:reindexed`.
pub fn start_vault_watcher(app: AppHandle) {
    let root = repo_root();
    let vault_dir = root.join("vault");
    if !vault_dir.is_dir() {
        log::warn!("[watcher] vault dir not found: {}", vault_dir.display());
        return;
    }

    std::thread::spawn(move || {
        if let Err(e) = run_watcher(app, root, vault_dir) {
            log::error!("[watcher] fatal: {e}");
        }
    });
}

fn run_watcher(app: AppHandle, root: PathBuf, vault_dir: PathBuf) -> Result<(), String> {
    // Pending changed paths + timestamp of last change.
    let pending: Arc<Mutex<(HashSet<PathBuf>, Option<Instant>)>> =
        Arc::new(Mutex::new((HashSet::new(), None)));

    let pending_tx = Arc::clone(&pending);
    let (tx, rx) = std::sync::mpsc::channel::<Result<Event, notify::Error>>();

    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |ev| { let _ = tx.send(ev); })
            .map_err(|e| format!("create watcher: {e}"))?;

    watcher
        .watch(&vault_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("watch vault: {e}"))?;

    log::info!("[watcher] watching {}", vault_dir.display());

    loop {
        // Poll with a 500 ms timeout so we can check the debounce window.
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(ev)) => {
                if is_interesting(&ev) {
                    let mut lock = pending_tx.lock().unwrap();
                    for path in &ev.paths {
                        lock.0.insert(path.clone());
                    }
                    lock.1 = Some(Instant::now());
                }
            }
            Ok(Err(e)) => log::warn!("[watcher] notify error: {e}"),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        // Check if debounce window has elapsed.
        let fire = {
            let lock = pending.lock().unwrap();
            match lock.1 {
                Some(t) if t.elapsed() >= DEBOUNCE && !lock.0.is_empty() => true,
                _ => false,
            }
        };

        if fire {
            let paths = {
                let mut lock = pending.lock().unwrap();
                let ps: Vec<PathBuf> = lock.0.drain().collect();
                lock.1 = None;
                ps
            };
            trigger_reindex(&app, &root, paths);
        }
    }

    Ok(())
}

fn is_interesting(ev: &Event) -> bool {
    matches!(
        ev.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    ) && ev.paths.iter().any(|p| {
        p.extension()
            .map(|e| e == "html" || e == "md")
            .unwrap_or(false)
    })
}

fn trigger_reindex(app: &AppHandle, root: &Path, paths: Vec<PathBuf>) {
    // Build comma-separated list of repo-relative paths.
    let rel_paths: Vec<String> = paths
        .iter()
        .filter_map(|p| {
            p.strip_prefix(root)
                .ok()
                .map(|r| r.to_string_lossy().replace('\\', "/"))
        })
        .collect();

    log::info!("[watcher] reindex triggered for {} file(s)", rel_paths.len());

    let changed_arg = rel_paths.join(",");
    let root = root.to_path_buf();
    let app = app.clone();

    std::thread::spawn(move || {
        let py = find_python(&root);
        if py.is_empty() {
            log::warn!("[watcher] python not found; skipping reindex");
            return;
        }

        let cmd = if changed_arg.is_empty() {
            format!("{py} tools/indexer.py")
        } else {
            format!("{py} tools/indexer.py --changed-files {changed_arg}")
        };

        let status = std::process::Command::new(if cfg!(windows) { "cmd" } else { "sh" })
            .args(if cfg!(windows) {
                vec!["/C", &cmd]
            } else {
                vec!["-c", &cmd]
            })
            .current_dir(&root)
            .status();

        let ok = status.map(|s| s.success()).unwrap_or(false);
        log::info!("[watcher] indexer exit ok={ok}");

        let payload = ReindexedPayload {
            changed: if changed_arg.is_empty() {
                vec![]
            } else {
                changed_arg.split(',').map(String::from).collect()
            },
            full: changed_arg.is_empty(),
        };

        if let Err(e) = app.emit("vault:reindexed", payload) {
            log::warn!("[watcher] emit vault:reindexed failed: {e}");
        }
    });
}

fn find_python(root: &Path) -> String {
    for candidate in &["py", "python3", "python"] {
        let status = std::process::Command::new(candidate)
            .arg("--version")
            .current_dir(root)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        if status.map(|s| s.success()).unwrap_or(false) {
            return candidate.to_string();
        }
    }
    String::new()
}

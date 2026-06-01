pub mod agent;
pub mod guard;
pub mod index_lookup;
pub mod watcher;

use std::path::PathBuf;
use std::sync::OnceLock;

/// Minimal YAML parser shared by agent.rs and index_lookup.rs.
/// Top-level `key: value` and dash-prefixed list items only.
pub fn parse_yaml_lite(block: &str) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    let mut current_list_key: Option<String> = None;
    for line in block.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        if let Some(rest) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("  - "))
        {
            if let Some(k) = &current_list_key {
                if let Some(serde_json::Value::Array(arr)) = obj.get_mut(k) {
                    let v = rest.trim().trim_matches(|c| c == '"' || c == '\'');
                    arr.push(serde_json::Value::String(v.to_string()));
                }
            }
            continue;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_string();
            let val = v.trim();
            if val.is_empty() {
                current_list_key = Some(key.clone());
                obj.insert(key, serde_json::Value::Array(vec![]));
            } else if val.starts_with('[') && val.ends_with(']') {
                let inner = &val[1..val.len() - 1];
                let arr: Vec<serde_json::Value> = inner
                    .split(',')
                    .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\''))
                    .filter(|s| !s.is_empty())
                    .map(|s| serde_json::Value::String(s.to_string()))
                    .collect();
                obj.insert(key, serde_json::Value::Array(arr));
                current_list_key = None;
            } else {
                let cleaned = val.trim_matches(|c| c == '"' || c == '\'').to_string();
                obj.insert(key, serde_json::Value::String(cleaned));
                current_list_key = None;
            }
        }
    }
    serde_json::Value::Object(obj)
}

/// Returns the vault root for the running Tauri app.
/// Resolution order:
///   1. SENTOR_VAULT env var
///   2. <current_exe_dir>/../../../vault  (dev mode: ide/src-tauri/target/debug/sentor.exe → repo)
///   3. <cwd>/vault                       (running from repo root)
pub fn vault_root() -> PathBuf {
    static CACHE: OnceLock<PathBuf> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            if let Ok(env) = std::env::var("SENTOR_VAULT") {
                let p = PathBuf::from(env);
                if p.is_dir() {
                    return p;
                }
            }
            if let Ok(exe) = std::env::current_exe() {
                let candidate = exe
                    .parent() // target/debug
                    .and_then(|p| p.parent()) // target
                    .and_then(|p| p.parent()) // src-tauri
                    .and_then(|p| p.parent()) // ide
                    .and_then(|p| p.parent()) // repo
                    .map(|p| p.join("vault"));
                if let Some(c) = candidate {
                    if c.is_dir() {
                        return c;
                    }
                }
            }
            std::env::current_dir().unwrap_or_default().join("vault")
        })
        .clone()
}

pub fn repo_root() -> PathBuf {
    vault_root()
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

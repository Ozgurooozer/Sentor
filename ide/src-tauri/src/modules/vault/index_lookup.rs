use std::fs;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use super::repo_root;

fn index_path() -> std::path::PathBuf {
    repo_root().join(".index").join("pages.json")
}

fn embed_path() -> std::path::PathBuf {
    repo_root().join(".index").join("embeddings.json")
}

#[derive(Default)]
struct Cache {
    pages: Vec<serde_json::Value>,
    mtime: Option<SystemTime>,
    embeddings: Vec<serde_json::Value>,
    embed_mtime: Option<SystemTime>,
}

fn cache() -> &'static Mutex<Cache> {
    static C: OnceLock<Mutex<Cache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Cache::default()))
}

fn load_pages() -> Vec<serde_json::Value> {
    let p = index_path();
    let mut c = cache().lock().expect("cache poisoned");
    let cur = fs::metadata(&p).and_then(|m| m.modified()).ok();
    if cur != c.mtime {
        c.pages = fs::read_to_string(&p)
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("pages").cloned())
            .and_then(|p| p.as_array().cloned())
            .unwrap_or_default();
        c.mtime = cur;
    }
    c.pages.clone()
}

fn load_embeddings() -> Vec<serde_json::Value> {
    let p = embed_path();
    let mut c = cache().lock().expect("cache poisoned");
    let cur = fs::metadata(&p).and_then(|m| m.modified()).ok();
    if cur != c.embed_mtime {
        c.embeddings = fs::read_to_string(&p)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(&s).ok())
            .unwrap_or_default();
        c.embed_mtime = cur;
    }
    c.embeddings.clone()
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na.sqrt() * nb.sqrt())
    }
}

#[tauri::command]
pub async fn vault_get_note_titles(query: String) -> Result<Vec<String>, String> {
    let q = query.to_lowercase();
    let pages = load_pages();
    let mut hits: Vec<(String, i32)> = pages
        .iter()
        .filter_map(|p| {
            let title = p.get("title")?.as_str()?.to_string();
            if q.is_empty() || title.to_lowercase().contains(&q) {
                Some((
                    title.clone(),
                    if title.to_lowercase() == q { 100 } else { 1 },
                ))
            } else {
                None
            }
        })
        .collect();
    hits.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(hits.into_iter().take(50).map(|(t, _)| t).collect())
}

#[tauri::command]
pub async fn vault_get_backlinks(note_id: String) -> Result<Vec<serde_json::Value>, String> {
    let pages = load_pages();
    let page = pages
        .iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&note_id));
    let Some(page) = page else {
        return Ok(vec![]);
    };
    let bl_ids: Vec<String> = page
        .get("backlinks")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let mut out = Vec::new();
    for id in bl_ids {
        if let Some(p) = pages
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id))
        {
            out.push(serde_json::json!({
                "id":    id,
                "title": p.get("title").cloned().unwrap_or(serde_json::Value::Null),
                "type":  p.get("type").cloned().unwrap_or(serde_json::Value::Null),
                "url":   p.get("url").cloned().unwrap_or(serde_json::Value::Null),
            }));
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn vault_get_similar_notes(
    note_id: String,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, String> {
    let embeddings = load_embeddings();
    let pages = load_pages();
    let target = embeddings
        .iter()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(&note_id));
    let Some(target) = target else {
        return Ok(vec![]);
    };
    let target_vec: Vec<f32> = target
        .get("embedding")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_f64().map(|f| f as f32))
                .collect()
        })
        .unwrap_or_default();
    if target_vec.is_empty() {
        return Ok(vec![]);
    }
    let mut scored: Vec<(String, f32)> = embeddings
        .iter()
        .filter_map(|e| {
            let id = e.get("id")?.as_str()?;
            if id == note_id {
                return None;
            }
            let vec: Vec<f32> = e
                .get("embedding")?
                .as_array()?
                .iter()
                .filter_map(|x| x.as_f64().map(|f| f as f32))
                .collect();
            Some((id.to_string(), cosine(&target_vec, &vec)))
        })
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let n = limit.unwrap_or(5).min(20);
    let mut out = Vec::new();
    for (id, score) in scored.into_iter().take(n) {
        if let Some(p) = pages
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id))
        {
            out.push(serde_json::json!({
                "id":    id,
                "title": p.get("title").cloned().unwrap_or(serde_json::Value::Null),
                "type":  p.get("type").cloned().unwrap_or(serde_json::Value::Null),
                "url":   p.get("url").cloned().unwrap_or(serde_json::Value::Null),
                "score": score,
            }));
        }
    }
    Ok(out)
}

/// Snapshot endpoint mirror (matches /api/agent/{slug} shape).
#[tauri::command]
pub async fn vault_agent_snapshot(slug: String) -> Result<serde_json::Value, String> {
    let dir = super::vault_root().join("agents").join(&slug);
    if !dir.is_dir() {
        return Err(format!("agent office not found: {slug}"));
    }
    let state_md = dir.join("state.md");
    let mut frontmatter = serde_json::json!({});
    if state_md.exists() {
        let raw = fs::read_to_string(&state_md).unwrap_or_default();
        let re = regex::Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n").unwrap();
        if let Some(c) = re.captures(&raw) {
            frontmatter = super::parse_yaml_lite(c.get(1).map(|x| x.as_str()).unwrap_or(""));
        }
    }
    let log_md = dir.join("log.md");
    let recent_log: Vec<String> = if log_md.exists() {
        let raw = fs::read_to_string(&log_md).unwrap_or_default();
        raw.lines()
            .filter(|l| !l.trim().is_empty())
            .rev()
            .take(20)
            .map(|s| s.to_string())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    } else {
        vec![]
    };
    let projects_dir = dir.join("projects");
    let open_projects: Vec<String> = if projects_dir.is_dir() {
        fs::read_dir(&projects_dir)
            .ok()
            .map(|it| {
                it.filter_map(|e| {
                    let e = e.ok()?;
                    if e.file_type().ok()?.is_dir() {
                        e.file_name().to_str().map(String::from)
                    } else {
                        None
                    }
                })
                .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };
    Ok(serde_json::json!({
        "agent":         slug,
        "state":         frontmatter,
        "recent_log":    recent_log,
        "open_projects": open_projects,
    }))
}

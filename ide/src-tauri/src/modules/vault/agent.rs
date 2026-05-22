use chrono::Local;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use super::guard::{check_no_secrets, check_writable_path};
use super::{parse_yaml_lite, vault_root};

/// Per-agent mutex registry — serializes log/decisions writes per slug.
fn locks() -> &'static Mutex<std::collections::HashMap<String, std::sync::Arc<Mutex<()>>>> {
    static M: OnceLock<Mutex<std::collections::HashMap<String, std::sync::Arc<Mutex<()>>>>> =
        OnceLock::new();
    M.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

fn lock_for(slug: &str) -> std::sync::Arc<Mutex<()>> {
    let mut map = locks().lock().expect("agent lock map poisoned");
    map.entry(slug.to_string())
        .or_insert_with(|| std::sync::Arc::new(Mutex::new(())))
        .clone()
}

fn agent_dir(slug: &str) -> PathBuf {
    vault_root().join("agents").join(slug)
}

fn ensure_agent_dir(slug: &str) -> Result<PathBuf, String> {
    let dir = agent_dir(slug);
    if !dir.is_dir() {
        return Err(format!("agent office not found: {slug}"));
    }
    Ok(dir)
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

// ── log append ──────────────────────────────────────────────────────────────

/// Append a single line to vault/agents/{slug}/log.md.
/// Format: "{ISO8601} [{event}] {msg}\n"
/// If event == "decision", also append a structured block to decisions.md (K16).
#[tauri::command]
pub async fn vault_agent_log(slug: String, event: String, msg: String) -> Result<(), String> {
    if slug.is_empty() || event.is_empty() {
        return Err("slug and event are required".into());
    }
    check_no_secrets(&msg)?;

    let lock = lock_for(&slug);
    let _g = lock.lock().expect("agent lock poisoned");

    let dir = ensure_agent_dir(&slug)?;
    let log_path = dir.join("log.md");
    let line = format!("{} [{}] {}\n", now_iso(), event, msg);

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("open log.md: {e}"))?;
    f.write_all(line.as_bytes())
        .map_err(|e| format!("write log.md: {e}"))?;

    if event == "decision" {
        append_decision(&dir, &msg)?;
    }
    Ok(())
}

// ── decision append (K16) ───────────────────────────────────────────────────

fn next_decision_number(content: &str) -> u32 {
    let re = Regex::new(r"(?m)^##\s+D(\d+)\s+—").unwrap();
    re.captures_iter(content)
        .filter_map(|c| c.get(1).and_then(|m| m.as_str().parse::<u32>().ok()))
        .max()
        .map(|n| n + 1)
        .unwrap_or(1)
}

fn append_decision(dir: &PathBuf, msg: &str) -> Result<(), String> {
    let path = dir.join("decisions.md");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let n = next_decision_number(&existing);

    // Split message on the first period or newline to get title vs body.
    let (title, body) = match msg.split_once(['.', '\n']) {
        Some((t, rest)) => (t.trim().to_string(), rest.trim().to_string()),
        None => (msg.trim().to_string(), String::new()),
    };

    let date = Local::now().format("%Y-%m-%d");
    let mut block = format!(
        "\n## D{} — {}\n**Tarih:** {}\n**Status:** proposed\n**Decision:** {}\n",
        n, title, date, title
    );
    if !body.is_empty() {
        block.push_str(&format!("**Detail:** {}\n", body));
    }
    block.push_str("**Reason:** (eklenecek)\n**Alternatives:** (eklenecek)\n**Impact:** (eklenecek)\n");

    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open decisions.md: {e}"))?;
    if !existing.ends_with('\n') && !existing.is_empty() {
        f.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    f.write_all(block.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

// ── state read/update ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AgentState {
    pub agent: String,
    pub frontmatter: serde_json::Value,
    pub body: String,
}

#[tauri::command]
pub async fn vault_agent_state_read(slug: String) -> Result<AgentState, String> {
    let dir = ensure_agent_dir(&slug)?;
    let path = dir.join("state.md");
    if !path.exists() {
        return Ok(AgentState {
            agent: slug,
            frontmatter: serde_json::json!({}),
            body: String::new(),
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let (fm, body) = split_frontmatter(&raw);
    Ok(AgentState {
        agent: slug,
        frontmatter: parse_yaml_lite(&fm),
        body,
    })
}

#[derive(Deserialize, Default)]
pub struct StatePatch {
    /// Top-level frontmatter keys to merge (overrides existing).
    pub frontmatter: Option<serde_json::Map<String, serde_json::Value>>,
    /// New content for the <!-- agent:start -->..<!-- agent:end --> block.
    pub block: Option<String>,
}

#[tauri::command]
pub async fn vault_agent_state_update(slug: String, patch: StatePatch) -> Result<(), String> {
    let lock = lock_for(&slug);
    let _g = lock.lock().expect("agent lock poisoned");

    let dir = ensure_agent_dir(&slug)?;
    let path = dir.join("state.md");

    let raw = fs::read_to_string(&path).unwrap_or_default();
    let (fm_text, body) = split_frontmatter(&raw);
    let mut fm_obj = parse_yaml_lite(&fm_text);

    if let Some(p) = patch.frontmatter {
        for (k, v) in p {
            if let serde_json::Value::Object(obj) = &mut fm_obj {
                obj.insert(k, v);
            }
        }
    }
    // Always bump updated
    if let serde_json::Value::Object(obj) = &mut fm_obj {
        obj.insert(
            "updated".to_string(),
            serde_json::Value::String(now_iso()),
        );
    }

    let mut new_body = body;
    if let Some(new_block) = patch.block {
        check_no_secrets(&new_block)?;
        new_body = replace_agent_block(&new_body, &new_block);
    }

    let combined = format!(
        "---\n{}---\n{}",
        serialize_yaml_lite(&fm_obj),
        new_body
    );
    check_no_secrets(&combined)?;
    let rel = format!("agents/{}/state.md", slug);
    check_writable_path(&rel)?;
    fs::write(&path, combined).map_err(|e| e.to_string())?;
    Ok(())
}

// ── helpers ────────────────────────────────────────────────────────────────

fn split_frontmatter(raw: &str) -> (String, String) {
    let re = Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n").unwrap();
    if let Some(m) = re.captures(raw) {
        let fm = m.get(1).map(|x| x.as_str().to_string()).unwrap_or_default();
        let rest = &raw[m.get(0).unwrap().end()..];
        (fm, rest.to_string())
    } else {
        (String::new(), raw.to_string())
    }
}

fn serialize_yaml_lite(v: &serde_json::Value) -> String {
    let mut out = String::new();
    if let serde_json::Value::Object(obj) = v {
        for (k, val) in obj {
            match val {
                serde_json::Value::Array(arr) => {
                    if arr.is_empty() {
                        out.push_str(&format!("{k}: []\n"));
                    } else {
                        out.push_str(&format!("{k}:\n"));
                        for item in arr {
                            let s = match item {
                                serde_json::Value::String(s) => s.clone(),
                                other => other.to_string(),
                            };
                            out.push_str(&format!("  - {s}\n"));
                        }
                    }
                }
                serde_json::Value::String(s) => {
                    out.push_str(&format!("{k}: {s}\n"));
                }
                serde_json::Value::Null => {
                    out.push_str(&format!("{k}:\n"));
                }
                other => {
                    out.push_str(&format!("{k}: {other}\n"));
                }
            }
        }
    }
    out
}

fn replace_agent_block(body: &str, new_inner: &str) -> String {
    let re = Regex::new(
        r"(?s)(<!--\s*agent:start\s*-->)(.*?)(<!--\s*agent:end\s*-->)",
    )
    .unwrap();
    if re.is_match(body) {
        re.replace(body, |caps: &regex::Captures| {
            format!("{}\n{}\n{}", &caps[1], new_inner.trim(), &caps[3])
        })
        .to_string()
    } else {
        // No markers — append one
        format!(
            "{}\n\n<!-- agent:start -->\n{}\n<!-- agent:end -->\n",
            body.trim_end(),
            new_inner.trim()
        )
    }
}

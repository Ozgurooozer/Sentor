use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;

fn secret_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        vec![
            Regex::new(r"sk-[A-Za-z0-9]{20,}").unwrap(),
            Regex::new(r"ghp_[A-Za-z0-9]{36}").unwrap(),
            Regex::new(r"xox[abp]-[A-Za-z0-9-]+").unwrap(),
            Regex::new(r"-----BEGIN [A-Z ]+PRIVATE KEY-----").unwrap(),
            Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
        ]
    })
}

pub fn check_no_secrets(content: &str) -> Result<(), String> {
    for re in secret_patterns() {
        if re.is_match(content) {
            return Err(format!("blocked: secret pattern matched ({})", re.as_str()));
        }
    }
    Ok(())
}

/// Path prefixes (relative to vault/) that are read-only from agent calls.
const DENIED_PREFIXES: &[&str] = &["archive/", "templates/"];

fn is_profile_md(rel: &str) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    parts.len() == 3 && parts[0] == "agents" && parts[2] == "profile.md"
}

pub fn check_writable_path(rel_path: &str) -> Result<(), String> {
    let norm = rel_path.replace('\\', "/");
    for p in DENIED_PREFIXES {
        if norm.starts_with(p) {
            return Err(format!("blocked: path under read-only prefix '{p}'"));
        }
    }
    if is_profile_md(&norm) {
        return Err("blocked: profile.md is managed by sync_profiles.py".into());
    }
    Ok(())
}

#[allow(dead_code)]
pub fn rel_from_vault(absolute: &Path, vault_root: &Path) -> Result<String, String> {
    absolute
        .strip_prefix(vault_root)
        .map_err(|e| e.to_string())
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

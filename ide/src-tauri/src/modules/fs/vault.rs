use std::fs;
use std::path::{Path, PathBuf};
use regex::Regex;
use crate::modules::fs::to_canon;

pub struct Vault {
    pub root: PathBuf,
}

impl Vault {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Bir dosyadaki wiki-linkleri bulur: [[Link Adı]]
    pub fn extract_links(&self, content: &str) -> Vec<String> {
        let re = Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
        re.captures_iter(content)
            .map(|cap| cap[1].trim().to_string())
            .collect()
    }

    /// Bir notun adı değiştiğinde, tüm vault içindeki referansları günceller (Rename Propagation)
    pub fn propagate_rename(&self, old_title: &str, new_title: &str) -> std::io::Result<()> {
        let old_link = format!("[[{}]]", old_title);
        let new_link = format!("[[{}]]", new_title);

        self.walk_and_replace(&old_link, &new_link)
    }

    fn walk_and_replace(&self, old_text: &str, new_text: &str) -> std::io::Result<()> {
        for entry in walkdir::WalkDir::new(&self.root)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
                let content = fs::read_to_string(entry.path())?;
                if content.contains(old_text) {
                    let new_content = content.replace(old_text, new_text);
                    fs::write(entry.path(), new_content)?;
                }
            }
        }
        Ok(())
    }
}

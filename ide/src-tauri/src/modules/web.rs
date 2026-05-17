use reqwest::Client;
use scraper::{Html, Selector};
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize)]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Serialize)]
pub struct FetchResult {
    pub url: String,
    pub title: Option<String>,
    pub text: String,
    pub html_len: usize,
}

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (compatible; AtlasOS/1.0)")
        .build()
        .map_err(|e| e.to_string())
}

/// Search via SearXNG JSON API. `searxng_url` is the instance root
/// (e.g. "https://searx.be" or "http://localhost:8080").
#[tauri::command]
pub async fn web_search(
    query: String,
    limit: Option<usize>,
    searxng_url: Option<String>,
) -> Result<Vec<SearchHit>, String> {
    let cap = limit.unwrap_or(8).min(20);
    let base = searxng_url
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://searx.be".to_string());
    let url = format!(
        "{}/search?q={}&format=json&categories=general",
        base.trim_end_matches('/'),
        urlencoding::encode(&query)
    );
    let client = make_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("web_search request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SearXNG returned HTTP {}", resp.status()));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("web_search parse error: {e}"))?;
    let results = body["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .take(cap)
                .map(|r| SearchHit {
                    title: r["title"].as_str().unwrap_or("").to_string(),
                    url: r["url"].as_str().unwrap_or("").to_string(),
                    snippet: r["content"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(results)
}

/// Fetch a URL and return stripped readable text (max 50 KB).
#[tauri::command]
pub async fn web_fetch(url: String) -> Result<FetchResult, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are allowed".to_string());
    }
    let client = make_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("web_fetch request failed: {e}"))?;
    let final_url = resp.url().to_string();
    let html_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("web_fetch read error: {e}"))?;
    let html_len = html_bytes.len();
    let raw = String::from_utf8_lossy(&html_bytes);
    let document = Html::parse_document(&raw);

    let title_sel = Selector::parse("title").unwrap();
    let title = document
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string());

    let strip_sel =
        Selector::parse("script,style,nav,footer,header,aside,noscript").unwrap();
    let body_sel = Selector::parse("body").unwrap();
    let mut text = String::new();
    if let Some(body) = document.select(&body_sel).next() {
        for node in body.descendants() {
            if let Some(el) = scraper::ElementRef::wrap(node) {
                if strip_sel.matches(&el) {
                    continue;
                }
            }
            if let Some(t) = node.value().as_text() {
                let s = t.trim();
                if !s.is_empty() {
                    text.push_str(s);
                    text.push(' ');
                }
            }
        }
    }
    let text: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    const MAX: usize = 50_000;
    let text = if text.len() > MAX {
        format!("{}…", &text[..MAX])
    } else {
        text
    };
    Ok(FetchResult { url: final_url, title, text, html_len })
}

use reqwest::Client;
use std::time::Duration;

const SENTOR_BASE: &str = "http://127.0.0.1:3000";

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

/// Proxy an HTTP call to the local Sentor (Flowise) REST API.
/// `method` is "GET" or "POST"; `path` starts with "/api/v1/...".
/// Returns the raw JSON response body as a string.
#[tauri::command]
pub async fn sentor_api(
    method: String,
    path: String,
    body: Option<String>,
) -> Result<String, String> {
    let url = format!("{}{}", SENTOR_BASE, path);
    let client = make_client()?;
    let req = match method.to_uppercase().as_str() {
        "POST" => client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body.unwrap_or_default()),
        _ => client.get(&url),
    };
    let resp = req.send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

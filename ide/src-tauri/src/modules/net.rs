use std::time::Duration;

#[tauri::command]
pub async fn http_ping(url: String) -> Result<u16, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    client
        .get(&url)
        .send()
        .await
        .map(|r| r.status().as_u16())
        .map_err(|e| e.to_string())
}

/// Fetch a URL with an optional Bearer token and return the response body as JSON string.
/// Used by the frontend to fetch model lists from provider APIs.
#[tauri::command]
pub async fn http_get_json(url: String, bearer: Option<String>) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are allowed".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(&url).header("Accept", "application/json");
    if let Some(token) = bearer {
        if !token.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if status >= 400 {
        return Err(format!("HTTP {}: {}", status, body.chars().take(200).collect::<String>()));
    }
    Ok(body)
}

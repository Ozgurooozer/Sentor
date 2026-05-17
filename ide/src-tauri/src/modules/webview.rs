use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    webview::WebviewBuilder, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url,
    WebviewUrl,
};

/// Active child-webview labels we created. Used to gate close/navigate/etc.
/// (Tauri's `get_webview` would also return labels of static webviews in the
/// config, so we keep our own set.)
#[derive(Default)]
pub struct WebState {
    labels: Mutex<std::collections::HashSet<String>>,
}

#[derive(Serialize, Clone)]
struct NavChanged {
    label: String,
    url: String,
}

fn parse_url(url: &str) -> Result<Url, String> {
    Url::parse(url).map_err(|e| format!("invalid url '{url}': {e}"))
}

#[tauri::command]
pub async fn web_open(
    app: AppHandle,
    state: tauri::State<'_, WebState>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Idempotent: re-opening an existing label just navigates + repositions.
    if state.labels.lock().unwrap().contains(&label) {
        web_set_bounds(app.clone(), label.clone(), x, y, width, height).await?;
        if !url.is_empty() {
            web_navigate(app, label, url).await?;
        }
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "main window missing".to_string())?;

    let target = if url.is_empty() {
        WebviewUrl::External(parse_url("about:blank")?)
    } else {
        WebviewUrl::External(parse_url(&url)?)
    };

    let app_for_nav = app.clone();
    let label_for_nav = label.clone();
    let builder = WebviewBuilder::new(&label, target)
        .auto_resize()
        .on_navigation(move |new_url| {
            let _ = app_for_nav.emit(
                "web://nav-changed",
                NavChanged {
                    label: label_for_nav.clone(),
                    url: new_url.to_string(),
                },
            );
            true
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width.max(1.0), height.max(1.0)),
        )
        .map_err(|e| e.to_string())?;

    state.labels.lock().unwrap().insert(label);
    Ok(())
}

#[tauri::command]
pub async fn web_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview '{label}' not found"))?;
    wv.navigate(parse_url(&url)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn web_set_bounds(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview '{label}' not found"))?;
    wv.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn web_set_visible(
    app: AppHandle,
    label: String,
    visible: bool,
) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview '{label}' not found"))?;
    if visible {
        wv.show().map_err(|e| e.to_string())
    } else {
        wv.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn web_close(
    app: AppHandle,
    state: tauri::State<'_, WebState>,
    label: String,
) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    state.labels.lock().unwrap().remove(&label);
    Ok(())
}

#[tauri::command]
pub async fn web_go(app: AppHandle, label: String, delta: i32) -> Result<(), String> {
    let wv = app
        .get_webview(&label)
        .ok_or_else(|| format!("webview '{label}' not found"))?;
    let js = if delta < 0 {
        "history.back()"
    } else {
        "history.forward()"
    };
    wv.eval(js).map_err(|e| e.to_string())
}

mod modules;

use modules::{fs, input, mcp, net, pty, secrets, sentor, shell, vault, web, webview};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_window_state::StateFlags;

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

// V3 floating window dimensions (logical pixels, scale-factor-independent)
const V3_BAR_H: f64 = 52.0;
const V3_BAR_W_MIN: f64 = 480.0;
const V3_BAR_W_MAX: f64 = 620.0;
const V3_LAUNCHER_W: f64 = 460.0;
const V3_LAUNCHER_H: f64 = 380.0;
const V3_OUT_W: f64 = 520.0;
const V3_OUT_H_MIN: f64 = 320.0;
const V3_OUT_H_MAX: f64 = 480.0;

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    let url_path = match tab.as_deref() {
        Some(t) if !t.is_empty() => format!("settings.html?tab={}", t),
        _ => "settings.html".to_string(),
    };

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        if let Some(t) = tab.as_deref().filter(|s| !s.is_empty()) {
            let _ = window.emit("atlas:settings-tab", t);
        }
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url_path.into()))
        .title("Settings")
        .inner_size(720.0, 520.0)
        .min_inner_size(720.0, 520.0)
        .max_inner_size(720.0, 520.0)
        .resizable(false)
        .visible(false)
        .always_on_top(false);

    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(any(target_os = "linux", target_os = "windows"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_decorations(false);
    }
    let _ = window;
    Ok(())
}

/// Opens the native OS folder-picker dialog and returns the chosen path,
/// or null if the user cancelled.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    rx.await.ok().flatten().map(|p| p.to_string())
}

/// Restricts window hit-testing to interactive regions only (click-through elsewhere).
/// On Windows: SetWindowRgn defines which areas the OS renders AND delivers mouse events to.
/// Areas outside the region are fully transparent to the user (invisible + click-through).
/// Passing enabled=false restores full-window hit-testing (NULL region = whole window).
///
/// `regions` — extra interactive areas [x, y, w, h] in physical pixels (chat balloon,
/// pinned canvas panels, etc.). The bottom bar is always included automatically.
#[tauri::command]
async fn set_click_through(
    _window: tauri::WebviewWindow,
    _enabled: bool,
    _screen_w: i32,
    _screen_h: i32,
    _bar_h: i32,
    _regions: Vec<Vec<i32>>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        extern "system" {
            fn CreateRectRgn(
                nLeftRect: i32,
                nTopRect: i32,
                nRightRect: i32,
                nBottomRect: i32,
            ) -> isize;
            fn SetWindowRgn(hWnd: isize, hRgn: isize, bRedraw: i32) -> i32;
            fn CombineRgn(
                hrgnDst: isize,
                hrgnSrc1: isize,
                hrgnSrc2: isize,
                fnCombineMode: i32,
            ) -> i32;
            fn DeleteObject(ho: isize) -> i32;
        }

        let raw = _window.window_handle().map_err(|e| e.to_string())?;
        let hwnd = match raw.as_raw() {
            RawWindowHandle::Win32(h) => h.hwnd.get(),
            _ => return Err("not a Win32 window".into()),
        };

        unsafe {
            if _enabled {
                let bar_rgn = CreateRectRgn(0, _screen_h - _bar_h, _screen_w, _screen_h);
                if bar_rgn == 0 {
                    return Err("CreateRectRgn failed for bar region".into());
                }
                let mut combined = bar_rgn;

                for r in &_regions {
                    if r.len() < 4 {
                        continue;
                    }
                    let (rx, ry, rw, rh) = (r[0], r[1], r[2], r[3]);
                    if rw <= 0 || rh <= 0 {
                        continue;
                    }
                    let extra = CreateRectRgn(rx, ry, rx + rw, ry + rh);
                    if extra == 0 {
                        continue;
                    } // allocation failure — skip region
                    let dest = CreateRectRgn(0, 0, 1, 1); // scratch; overwritten by CombineRgn
                    if dest == 0 {
                        DeleteObject(extra);
                        continue;
                    }
                    CombineRgn(dest, combined, extra, 2); // RGN_OR = 2
                    DeleteObject(combined);
                    DeleteObject(extra);
                    combined = dest;
                }

                // SetWindowRgn takes ownership of `combined` — must NOT DeleteObject it.
                SetWindowRgn(hwnd, combined, 1);
            } else {
                // NULL region → entire window is hit-testable and fully visible
                SetWindowRgn(hwnd, 0, 1);
            }
        }
    }
    Ok(())
}

/// System tray icon — provides quick access to the main window when the app
/// is running invisibly in focused overlay mode. Emits events the frontend
/// listens for via `atlas://tray-*` channels.
fn init_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray.show", "Show window", true, None::<&str>)?;
    let toggle_focused = MenuItem::with_id(
        app,
        "tray.toggle-focused",
        "Toggle focused mode",
        true,
        None::<&str>,
    )?;
    let toggle_click_through = MenuItem::with_id(
        app,
        "tray.toggle-click-through",
        "Toggle click-through",
        true,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray.quit", "Quit Atlas", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &toggle_focused, &toggle_click_through, &sep, &quit],
    )?;

    let _tray = TrayIconBuilder::with_id("atlas-tray")
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?,
        )
        .tooltip("Atlas — click to show window")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "tray.show" => show_main(app),
                "tray.toggle-focused" => {
                    let _ = app.emit("atlas://tray-toggle-focused", ());
                    show_main(app);
                }
                "tray.toggle-click-through" => {
                    let _ = app.emit("atlas://tray-toggle-click-through", ());
                }
                "tray.quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click on the tray icon itself → bring the window forward.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg(target_os = "linux")]
fn apply_wayland_webkit_workaround() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    if std::env::var("XDG_SESSION_TYPE").as_deref() != Ok("wayland") {
        return;
    }
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_lowercase();
    let affected = [
        "hyprland", "niri", "sway", "river", "wayfire", "labwc", "dwl",
    ]
    .iter()
    .any(|c| desktop.contains(c));
    if !affected {
        return;
    }
    unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
}

/// Show/hide the v3-output window from the input bar.
#[tauri::command]
fn v3_show_output(app: tauri::AppHandle, visible: bool) {
    if let Some(win) = app.get_webview_window("v3-output") {
        if visible {
            let _ = win.show();
            let _ = win.set_focus();
        } else {
            let _ = win.hide();
        }
    }
}

/// Show the v3-input bar. Creates it lazily if it was destroyed.
#[tauri::command]
fn v3_show_input(app: tauri::AppHandle) {
    if let Some(bar) = app.get_webview_window("v3-input") {
        let _ = bar.show();
        let _ = bar.set_always_on_top(true);
        let _ = bar.set_focus();
        return;
    }

    // Lazy-create: window was closed somehow — recreate at calculated position.
    let (wa_x, wa_y, wa_w, wa_h) = app
        .get_webview_window("main")
        .and_then(|w| w.primary_monitor().ok().flatten())
        .map(|m| {
            let sf = m.scale_factor();
            let wa = m.work_area();
            (
                wa.position.x as f64 / sf,
                wa.position.y as f64 / sf,
                wa.size.width as f64 / sf,
                wa.size.height as f64 / sf,
            )
        })
        .unwrap_or((0.0, 0.0, 1920.0, 1032.0));

    let bar_w = (wa_w * 0.40).clamp(V3_BAR_W_MIN, V3_BAR_W_MAX);
    let bar_x = wa_x + (wa_w - bar_w) / 2.0;
    let bar_y = wa_y + wa_h - V3_BAR_H - 8.0;

    let result = WebviewWindowBuilder::new(&app, "v3-input", v3_url("v3-input"))
        .title("Atlas")
        .inner_size(bar_w, V3_BAR_H)
        .position(bar_x, bar_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build();

    if let Ok(bar) = result {
        #[cfg(target_os = "windows")]
        if let Err(e) = apply_mica(&bar, Some(true)) {
            log::warn!("apply_mica(v3-input lazy): {e}");
        }
        let _ = bar.set_focus();
        register_input_close_handler(bar);
    }
}

fn register_input_close_handler(win: tauri::WebviewWindow) {
    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });
}

/// Called by the launcher after project selection: hide launcher, show canvas + input bar.
#[tauri::command]
fn v3_launcher_done(app: tauri::AppHandle) {
    if let Some(launcher) = app.get_webview_window("v3-launcher") {
        let _ = launcher.hide();
    }
    // Show main canvas window (no focus — v3-input takes focus)
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
    }
    // v3-input is always_on_top so it sits above the canvas
    if let Some(bar) = app.get_webview_window("v3-input") {
        let _ = bar.show();
        let _ = bar.set_focus();
    }
}

fn v3_url(hash: &str) -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(format!("http://localhost:1420/#{hash}").parse().unwrap())
    } else {
        tauri::WebviewUrl::App(format!("index.html#{hash}").into())
    }
}

fn setup_v3_windows(app: &tauri::App) -> tauri::Result<()> {
    let app_handle = app.handle().clone();

    let (wa_x, wa_y, wa_w, wa_h) = app
        .get_webview_window("main")
        .and_then(|w| w.primary_monitor().ok().flatten())
        .map(|m| {
            let sf = m.scale_factor();
            let wa = m.work_area();
            (
                wa.position.x as f64 / sf,
                wa.position.y as f64 / sf,
                wa.size.width as f64 / sf,
                wa.size.height as f64 / sf,
            )
        })
        .unwrap_or((0.0, 0.0, 1920.0, 1032.0));

    let bar_w = (wa_w * 0.40).clamp(V3_BAR_W_MIN, V3_BAR_W_MAX);
    let bar_x = wa_x + (wa_w - bar_w) / 2.0;
    let bar_y = wa_y + wa_h - V3_BAR_H - 8.0;

    let out_h = (wa_h * 0.45).clamp(V3_OUT_H_MIN, V3_OUT_H_MAX);
    let out_x = wa_x + (wa_w - V3_OUT_W) / 2.0;
    let out_y = (bar_y - out_h - 12.0).max(wa_y + 8.0);

    let launcher_x = wa_x + (wa_w - V3_LAUNCHER_W) / 2.0;
    let launcher_y = wa_y + (wa_h - V3_LAUNCHER_H) / 2.0;

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }

    let v3_launcher = WebviewWindowBuilder::new(&app_handle, "v3-launcher", v3_url("v3-launcher"))
        .title("Atlas OS")
        .inner_size(V3_LAUNCHER_W, V3_LAUNCHER_H)
        .position(launcher_x, launcher_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .resizable(false)
        .visible(true)
        .build()?;
    #[cfg(target_os = "windows")]
    if let Err(e) = apply_mica(&v3_launcher, Some(true)) {
        log::warn!("apply_mica(v3-launcher): {e}");
    }
    let _ = v3_launcher.set_focus();

    let v3_input = WebviewWindowBuilder::new(&app_handle, "v3-input", v3_url("v3-input"))
        .title("Atlas")
        .inner_size(bar_w, V3_BAR_H)
        .position(bar_x, bar_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build()?;
    #[cfg(target_os = "windows")]
    if let Err(e) = apply_mica(&v3_input, Some(true)) {
        log::warn!("apply_mica(v3-input): {e}");
    }
    register_input_close_handler(v3_input);

    let v3_output = WebviewWindowBuilder::new(&app_handle, "v3-output", v3_url("v3-output"))
        .title("Atlas — Yanıt")
        .inner_size(V3_OUT_W, out_h)
        .position(out_x, out_y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .build()?;
    #[cfg(target_os = "windows")]
    if let Err(e) = apply_mica(&v3_output, Some(true)) {
        log::warn!("apply_mica(v3-output): {e}");
    }

    // Hide instead of destroy on close so chat history is preserved
    let win_clone = v3_output.clone();
    v3_output.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_wayland_webkit_workaround();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                // V3 floating windows always open at calculated position — never restore saved state
                .skip_initial_state("v3-input")
                .skip_initial_state("v3-output")
                .skip_initial_state("v3-launcher")
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(secrets::SecretsState::default())
        .manage(webview::WebState::default())
        .manage(input::InputState::default())
        .manage(mcp::McpState::default())
        .setup(|app| {
            if let Err(e) = input::init_input(&app.handle()) {
                log::warn!("input::init_input failed: {e}");
            }
            if let Err(e) = init_tray(&app.handle()) {
                log::warn!("init_tray failed: {e}");
            }
            vault::watcher::start_vault_watcher(app.handle().clone());

            if std::env::var("V3_MODE").is_ok() {
                setup_v3_windows(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::search::fs_search,
            fs::grep::fs_grep,
            fs::grep::fs_glob,
            shell::shell_run_command,
            shell::shell_session_open,
            shell::shell_session_run,
            shell::shell_session_close,
            shell::shell_bg_spawn,
            shell::shell_bg_logs,
            shell::shell_bg_kill,
            shell::shell_bg_list,
            open_settings_window,
            v3_show_output,
            v3_show_input,
            v3_launcher_done,
            secrets::secrets_get,
            secrets::secrets_set,
            secrets::secrets_delete,
            secrets::secrets_get_all,
            net::http_ping,
            net::http_get_json,
            web::web_search,
            web::web_fetch,
            webview::web_open,
            webview::web_navigate,
            webview::web_set_bounds,
            webview::web_set_visible,
            webview::web_close,
            webview::web_go,
            pick_folder,
            set_click_through,
            input::commands::update_hit_bitmap,
            input::commands::clear_hit_bitmap,
            input::commands::set_input_active,
            sentor::sentor_api,
            vault::index_lookup::vault_get_note_titles,
            vault::index_lookup::vault_get_backlinks,
            vault::index_lookup::vault_get_similar_notes,
            vault::index_lookup::vault_agent_snapshot,
            vault::agent::vault_agent_log,
            vault::agent::vault_agent_state_read,
            vault::agent::vault_agent_state_update,
            mcp::mcp_dequeue,
            mcp::mcp_export_state,
            mcp::mcp_watch_start,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

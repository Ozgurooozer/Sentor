//! Native Input Core — the lowest layer of the Atlas focused-mode runtime.
//!
//! Public surface:
//!   • [`InputState`] — Tauri-managed state holding the hit-bitmap.
//!   • [`update_hit_bitmap`] / [`clear_hit_bitmap`] — Tauri commands.
//!   • [`init_input`] — call once during app setup to wire up the WindowProc
//!     subclass on the main window.
//!
//! The module is fully self-contained: it does not import from `canvas`,
//! `webview`, or any other module. Other layers consume it strictly through
//! Tauri commands (TypeScript side) or through the public `InputState`
//! handle.

pub mod bitmap;
pub mod commands;
pub mod state;
pub mod subclass;
pub mod zone_type;

pub use state::InputState;

use tauri::{AppHandle, Manager};

/// Install the WindowProc subclass on the main window and publish the bitmap
/// handle so the subclass can read it. Idempotent — safe to call more than
/// once but only the first call actually swaps the WindowProc.
pub fn init_input(app: &AppHandle) -> Result<(), String> {
    // Publish the bitmap + active handles so the WindowProc subclass (a
    // global `extern "system" fn`) can read them without touching Tauri
    // state.
    let state = app.state::<InputState>();
    state::install_bitmap_handle(state.bitmap.clone());
    state::install_active_handle(state.active.clone());

    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        let raw = window.window_handle().map_err(|e| e.to_string())?;
        let hwnd = match raw.as_raw() {
            RawWindowHandle::Win32(h) => h.hwnd.get(),
            _ => return Err("not a Win32 window".into()),
        };
        subclass::install_subclass(hwnd)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Other platforms get a working bitmap state and Tauri commands, but
        // no native input routing — passthrough behaviour will be a no-op
        // until we add the platform-specific equivalent.
        let _ = app;
    }

    Ok(())
}

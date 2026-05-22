//! Tauri commands exposed by the input module.

use std::sync::atomic::Ordering;

use tauri::State;

use super::bitmap::HitBitmap;
use super::state::InputState;

/// Push a fresh hit-bitmap from the frontend.
///
/// `data` must contain `width * height` bytes; each byte is a `ZoneType` enum
/// variant. `screen_w` / `screen_h` are the physical-pixel dimensions of the
/// screen this bitmap maps onto.
#[tauri::command]
pub fn update_hit_bitmap(
    state: State<'_, InputState>,
    width: u32,
    height: u32,
    screen_w: u32,
    screen_h: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| "width * height overflow".to_string())?;
    if data.len() != expected {
        return Err(format!(
            "data length {} does not match width*height {}",
            data.len(),
            expected
        ));
    }
    let next = HitBitmap {
        width,
        height,
        screen_w,
        screen_h,
        data,
    };
    let mut guard = state
        .bitmap
        .write()
        .map_err(|_| "bitmap lock poisoned".to_string())?;
    *guard = next;
    Ok(())
}

/// Reset the bitmap to the safe `Passthrough` default. Called when leaving
/// focused mode so the IDE returns to normal click behaviour. Pair with
/// `set_input_active(false)` — the active flag is what actually disables
/// interception; clearing the bitmap is just hygiene.
#[tauri::command]
pub fn clear_hit_bitmap(state: State<'_, InputState>) -> Result<(), String> {
    let mut guard = state
        .bitmap
        .write()
        .map_err(|_| "bitmap lock poisoned".to_string())?;
    *guard = HitBitmap::empty();
    Ok(())
}

/// Enable or disable WM_NCHITTEST interception. When disabled the WindowProc
/// subclass becomes a no-op and the window behaves as a normal opaque client
/// area — required for classic (non-focused) IDE mode.
#[tauri::command]
pub fn set_input_active(state: State<'_, InputState>, active: bool) {
    state.active.store(active, Ordering::Relaxed);
}

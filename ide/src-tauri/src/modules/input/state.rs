//! Tauri-managed state for the input module.
//!
//! The bitmap lives behind an `Arc<RwLock<>>` so that:
//!   • Tauri commands can replace it under a write lock without touching the
//!     hot path,
//!   • the WindowProc subclass (which is a `extern "system" fn` and therefore
//!     can't carry app state through its arguments) can grab a clone of the
//!     `Arc` from a module-level `OnceLock` and read-lock it on every
//!     `WM_NCHITTEST`.

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, OnceLock, RwLock};

use super::bitmap::HitBitmap;

#[derive(Debug)]
pub struct InputState {
    pub bitmap: Arc<RwLock<HitBitmap>>,
    /// When false, the WindowProc subclass behaves as a no-op: every
    /// WM_NCHITTEST falls through to the original WindowProc, so the window
    /// behaves like a normal opaque client area. The frontend flips this on
    /// when entering focused overlay mode and off when leaving.
    pub active: Arc<AtomicBool>,
}

impl InputState {
    pub fn new() -> Self {
        Self {
            bitmap: Arc::new(RwLock::new(HitBitmap::empty())),
            active: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl Default for InputState {
    fn default() -> Self {
        Self::new()
    }
}

/// Module-level handle on the bitmap. Populated once when `init_input` runs,
/// then read by the WindowProc subclass for the lifetime of the process.
static BITMAP_HANDLE: OnceLock<Arc<RwLock<HitBitmap>>> = OnceLock::new();
static ACTIVE_HANDLE: OnceLock<Arc<AtomicBool>> = OnceLock::new();

pub fn install_bitmap_handle(handle: Arc<RwLock<HitBitmap>>) {
    let _ = BITMAP_HANDLE.set(handle);
}

pub fn bitmap_handle() -> Option<&'static Arc<RwLock<HitBitmap>>> {
    BITMAP_HANDLE.get()
}

pub fn install_active_handle(handle: Arc<AtomicBool>) {
    let _ = ACTIVE_HANDLE.set(handle);
}

pub fn active_handle() -> Option<&'static Arc<AtomicBool>> {
    ACTIVE_HANDLE.get()
}

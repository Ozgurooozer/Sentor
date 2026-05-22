//! Win32 WindowProc subclass that intercepts `WM_NCHITTEST`.
//!
//! This is the heart of the Native Input Core: every mouse-position probe the
//! OS makes against our window first goes through `subclassed_wnd_proc`. We
//! sample the in-memory hit-bitmap and reply with either:
//!   • `HTTRANSPARENT` — the click belongs to whatever is behind our window
//!     (typically the desktop / another app window), or
//!   • whatever the original WindowProc would have returned (usually
//!     `HTCLIENT`), so the event is delivered to our WebView normally.
//!
//! Only compiled on Windows. The module is a no-op stub elsewhere.

#[cfg(target_os = "windows")]
pub use windows_impl::install_subclass;

#[cfg(not(target_os = "windows"))]
pub fn install_subclass(_hwnd: isize) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::sync::atomic::Ordering;
    use std::sync::OnceLock;

    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWLP_WNDPROC, HTTRANSPARENT, WM_NCHITTEST, WNDPROC,
    };

    use crate::modules::input::state::{active_handle, bitmap_handle};

    /// Original WindowProc address, stored as `isize` so it survives across
    /// the `extern "system"` boundary. Set once the first time the subclass
    /// is installed and never changed afterwards.
    static ORIGINAL_PROC: OnceLock<isize> = OnceLock::new();

    /// Install the WindowProc subclass on the given HWND.
    /// Safe to call multiple times — only the first call actually swaps.
    pub fn install_subclass(hwnd: isize) -> Result<(), String> {
        if hwnd == 0 {
            return Err("invalid HWND".into());
        }
        if ORIGINAL_PROC.get().is_some() {
            return Ok(());
        }
        unsafe {
            let prev = GetWindowLongPtrW(hwnd as HWND, GWLP_WNDPROC);
            if prev == 0 {
                return Err("GetWindowLongPtrW returned 0".into());
            }
            let _ = ORIGINAL_PROC.set(prev);
            let new_ptr = subclassed_wnd_proc as *const () as usize as isize;
            let res = SetWindowLongPtrW(hwnd as HWND, GWLP_WNDPROC, new_ptr);
            if res == 0 {
                return Err("SetWindowLongPtrW returned 0".into());
            }
        }
        Ok(())
    }

    /// The replacement WindowProc.
    unsafe extern "system" fn subclassed_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_NCHITTEST {
            // Fast lock-free check: skip the entire bitmap path when the
            // frontend has not entered focused overlay mode. This is the
            // common case in classic IDE mode and must be zero-overhead.
            let active = active_handle()
                .map(|h| h.load(Ordering::Relaxed))
                .unwrap_or(false);
            if active {
                if let Some(handle) = bitmap_handle() {
                    // Decode screen coordinates from lParam: low word = x,
                    // high word = y, both signed 16-bit.
                    let lparam_i32 = lparam as i32;
                    let screen_x = (lparam_i32 & 0xFFFF) as i16 as i32;
                    let screen_y = ((lparam_i32 >> 16) & 0xFFFF) as i16 as i32;
                    if let Ok(bitmap) = handle.read() {
                        let zone = bitmap.sample(screen_x, screen_y);
                        if !zone.claims_input() {
                            return HTTRANSPARENT as LRESULT;
                        }
                    }
                }
            }
            // Fall through to the original proc so the WebView gets a normal
            // HTCLIENT response (or whatever it computes).
        }

        match ORIGINAL_PROC.get() {
            Some(prev) => {
                let proc: WNDPROC = std::mem::transmute(*prev);
                match proc {
                    Some(f) => f(hwnd, msg, wparam, lparam),
                    None => 0,
                }
            }
            None => 0,
        }
    }
}

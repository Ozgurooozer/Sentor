//! Zone classification for the hit-bitmap.
//!
//! Each pixel of the hit-bitmap holds a single byte whose value is one of
//! these zone types. The Win32 `WM_NCHITTEST` interceptor maps the value to
//! either `HTTRANSPARENT` (passthrough → desktop) or `HTCLIENT` (claim →
//! delivered to our window's client area).
//!
//! Keep this enum in sync with `ide/src/modules/input/types.ts`.

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoneType {
    /// Click should pass through to whatever lies behind our window.
    Passthrough = 0,
    /// Generic interactive surface — claimed by our window.
    Interactive = 1,
    /// Canvas substrate (pan/zoom catcher). Claims the click for our window.
    Canvas = 2,
    /// FocusedBar.
    Bar = 3,
    /// A canvas panel (terminal, editor, …).
    Panel = 4,
    /// Sub canvas viewport area — claims input, has its own pan/zoom.
    SubCanvas = 5,
    /// Pinned panel — fixed screen-space position, outside pan/zoom.
    PinnedPanel = 6,
}

impl ZoneType {
    pub fn from_byte(b: u8) -> Self {
        match b {
            0 => Self::Passthrough,
            1 => Self::Interactive,
            2 => Self::Canvas,
            3 => Self::Bar,
            4 => Self::Panel,
            5 => Self::SubCanvas,
            6 => Self::PinnedPanel,
            // Unknown bytes fall back to Passthrough so a partially-written
            // bitmap can't accidentally trap the user inside the overlay.
            _ => Self::Passthrough,
        }
    }

    /// True when the OS should deliver the event to our window's client area.
    /// False means we want `HTTRANSPARENT` so the click reaches the desktop.
    pub fn claims_input(self) -> bool {
        !matches!(self, Self::Passthrough)
    }
}

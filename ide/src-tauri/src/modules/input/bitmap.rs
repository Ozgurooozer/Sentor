//! In-memory hit-bitmap. Each cell holds one `ZoneType` byte.
//!
//! The bitmap is a low-resolution (typically 256×144) image whose dimensions
//! cover the entire virtual screen. The frontend paints zone rectangles into
//! it and uploads the bytes via the `update_hit_bitmap` Tauri command. The
//! WindowProc subclass samples this on every `WM_NCHITTEST`.

use super::zone_type::ZoneType;

#[derive(Debug, Clone)]
pub struct HitBitmap {
    /// Width of the bitmap in cells.
    pub width: u32,
    /// Height of the bitmap in cells.
    pub height: u32,
    /// Width of the screen the bitmap represents, in physical pixels.
    pub screen_w: u32,
    /// Height of the screen the bitmap represents, in physical pixels.
    pub screen_h: u32,
    /// Row-major `width * height` cells of `ZoneType`.
    pub data: Vec<u8>,
}

impl HitBitmap {
    /// Empty bitmap that classifies every pixel as `Passthrough`.
    /// Acts as a safe default until the frontend pushes a real bitmap.
    pub fn empty() -> Self {
        Self {
            width: 1,
            height: 1,
            screen_w: 1,
            screen_h: 1,
            data: vec![ZoneType::Passthrough as u8],
        }
    }

    /// Sample the zone at a physical-pixel screen coordinate.
    /// Out-of-bounds samples return `Passthrough` so the user can never get
    /// stuck inside a transparent overlay.
    pub fn sample(&self, screen_x: i32, screen_y: i32) -> ZoneType {
        if screen_x < 0 || screen_y < 0 {
            return ZoneType::Passthrough;
        }
        if self.screen_w == 0 || self.screen_h == 0 {
            return ZoneType::Passthrough;
        }
        let sx = screen_x as u32;
        let sy = screen_y as u32;
        if sx >= self.screen_w || sy >= self.screen_h {
            return ZoneType::Passthrough;
        }
        // Map screen coord → bitmap cell using nearest-neighbour.
        let bx = (sx as u64 * self.width as u64 / self.screen_w as u64) as u32;
        let by = (sy as u64 * self.height as u64 / self.screen_h as u64) as u32;
        let idx = (by * self.width + bx) as usize;
        match self.data.get(idx) {
            Some(b) => ZoneType::from_byte(*b),
            None => ZoneType::Passthrough,
        }
    }
}

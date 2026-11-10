// ============================================================
// DESK COMPANION - UNIFIED DISPLAY CONSTANTS
// Single source of truth shared by canvas renderer + firmware reference
//
// Physical display: 2.8" ILI9341 TFT, 240x320 portrait
// Font: Adafruit GFX fixed bitmap font (monospace, no anti-aliasing)
//   Size 1 → 6px wide × 8px tall per glyph
//   Size 2 → 12×16, Size 3 → 18×24, Size 4 → 24×32
// ============================================================

export const DISPLAY_W = 240;
export const DISPLAY_H = 320;

// Adafruit GFX fixed font glyph dimensions per text size
export const FONT_W = [0, 6, 12, 18, 24] as const;   // width per char at size N
export const FONT_H = [0, 8, 16, 24, 32] as const;   // height per char at size N

// RGB565 named colors (matching ILI9341 defines and firmware)
export const C_BLACK       = 0x0000;
export const C_WHITE       = 0xFFFF;
export const C_GREEN       = 0x07E0;
export const C_RED         = 0xF800;
export const C_BLUE        = 0x001F;
export const C_CYAN        = 0x07FF;
export const C_YELLOW      = 0xFFE0;
export const C_ORANGE      = 0xFD20;
export const C_LIGHTGREY   = 0xC618;
export const C_DARKGREY    = 0x7BEF;  // 0x7BEF == neutral-500 on ILI9341
export const C_MID_GREY    = 0x8410;  // neutral-600 approximate
export const C_DARK_CARD   = 0x10A2;  // very dark navy card background
export const C_CARD_BORDER = 0x2965;  // subtle dark border
export const C_BAR_FILL    = 0x2104;  // dark progress track background
export const C_STATUS_LINE = 0x18C3;  // status bar bottom border line
export const C_NOTIF_BG    = 0x18C3;  // notification toast background
export const C_MENU_BG     = 0x0841;  // menu background dark
export const C_PORTAL_HDR  = 0x0841;  // provisioning header
export const C_ACCENT_DEF  = 0x15D0;  // default emerald-ish accent (RGB16)
export const C_ARTIST_GREY = 0xAD55;  // artist name muted

// Convert 24-bit RGB → RGB565 (same math as firmware parseColorToRGB565)
export function rgb24to565(r: number, g: number, b: number): number {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// Parse a hex string "#RRGGBB" or "rgb(r,g,b)" → RGB565
export function hexTo565(hex: string): number {
  const s = hex.trim();
  if (s.startsWith('#') && s.length >= 7) {
    const val = parseInt(s.slice(1), 16);
    const r = (val >> 16) & 0xFF;
    const g = (val >> 8)  & 0xFF;
    const b =  val        & 0xFF;
    return rgb24to565(r, g, b);
  }
  if (s.startsWith('rgb')) {
    const m = s.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (m) return rgb24to565(+m[1], +m[2], +m[3]);
  }
  return C_ACCENT_DEF; // default emerald
}

// Convert RGB565 → CSS color string for canvas rendering
export function rgb565toCss(c: number): string {
  const r = ((c >> 11) & 0x1F) << 3;
  const g = ((c >>  5) & 0x3F) << 2;
  const b =  (c        & 0x1F) << 3;
  return `rgb(${r},${g},${b})`;
}

// Layout constants (pixels, portrait 240×320)
export const STATUSBAR_H   = 16;   // status bar height
export const HEADER_TOP    = 16;   // below status bar
export const HEADER_H      = 40;   // track/artist header height
export const FOOTER_H      = 34;   // progress bar footer
export const FOOTER_TOP    = DISPLAY_H - FOOTER_H;  // = 286

// Lyrics view vertical zones
export const LYRICS_TOP    = 58;   // below header (16+40=56, then 2px gap)
export const LYRICS_BOTTOM = FOOTER_TOP;  // = 286
export const LYRICS_H      = LYRICS_BOTTOM - LYRICS_TOP;  // = 228

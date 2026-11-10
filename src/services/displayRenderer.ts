// ============================================================
// DESK COMPANION - UNIFIED DISPLAY RENDERER
//
// ONE function per screen. BOTH the canvas mockup AND the ESP32 firmware
// draw from the EXACT same coordinate math here.
//
// Rule: if the firmware can't do it → it's NOT in this file.
//   • No CSS gradients  • No anti-aliasing  • No vector fonts
//   • Only Size 1-4 Adafruit GFX fixed bitmap font
//   • 240×320 coordinate space (portrait)
//   • RGB565 colors everywhere
// ============================================================

import {
  DISPLAY_W, DISPLAY_H,
  FONT_W, FONT_H,
  STATUSBAR_H, HEADER_TOP, HEADER_H, FOOTER_H, FOOTER_TOP,
  LYRICS_TOP, LYRICS_H,
  C_BLACK, C_WHITE, C_CYAN, C_RED, C_ORANGE,
  C_DARK_CARD,
  C_STATUS_LINE,
  C_ARTIST_GREY,
  hexTo565, rgb565toCss,
} from './displayConstants';
import { GFX_FONT } from './gfxFont';

// ── Draw Command Types ────────────────────────────────────────
export type DrawCommand =
  | { type: 'fill_rect';       x: number; y: number; w: number; h: number; color: number }
  | { type: 'draw_hline';      x: number; y: number; len: number; color: number }
  | { type: 'draw_vline';      x: number; y: number; len: number; color: number }
  | { type: 'fill_round_rect'; x: number; y: number; w: number; h: number; r: number; color: number }
  | { type: 'draw_round_rect'; x: number; y: number; w: number; h: number; r: number; color: number }
  | { type: 'fill_circle';     cx: number; cy: number; r: number; color: number }
  | { type: 'draw_circle';     cx: number; cy: number; r: number; color: number }
  | { type: 'draw_pixel';      x: number; y: number; color: number }
  | { type: 'draw_line';       x0: number; y0: number; x1: number; y1: number; color: number }
  | { type: 'text';            x: number; y: number; text: string; size: 1|2|3|4; color: number; bg: number }
  | { type: 'rgb565_bitmap';   x: number; y: number; w: number; h: number; data: Uint16Array };

// ── Application State passed to scene builders ─────────────────
export interface DisplayState {
  screenMode:    'lyrics' | 'now_playing' | 'clock' | 'weather';
  trackName:     string;
  artistName:    string;
  isPlaying:     boolean;
  progressMs:    number;
  durationMs:    number;
  accentHex:     string;   // "#RRGGBB" or "rgb(r,g,b)" - will be converted to RGB565
  currentLyric:  string;
  prevLyric:     string;
  nextLyric:     string;
  hasLyrics:     boolean;
  timeStr:       string;   // "12:29 am"
  dateStr:       string;   // "MON, 10 NOV"
  weatherTemp:   number;
  weatherCond:   string;
  weatherCity:   string;
  weatherHigh:   number;
  weatherLow:    number;
  weatherHum:    number;
  weatherValid:  boolean;
  dhtTemp:       number;
  dhtHum:        number;
  dhtValid:      boolean;
  wifiRssi:      number;   // -120..0 dBm
  clientConnected: boolean;
  albumBitmap?:  Uint16Array | null;  // 32×32 RGB565 pixels
  notifTitle?:   string;
  notifBody?:    string;
  notifActive?:  boolean;
}

// ── Helpers (mirror firmware helpers exactly) ──────────────────

/** Measure text width in pixels (Adafruit GFX fixed font) */
function textW(str: string, size: 1|2|3|4): number {
  return str.length * FONT_W[size];
}

/** Build centered text draw command */
function centeredText(
  str: string, y: number,
  size: 1|2|3|4,
  color: number, bg: number
): DrawCommand {
  const tw = textW(str, size);
  const x = Math.max(4, Math.floor((DISPLAY_W - tw) / 2));
  return { type: 'text', x, y, text: str, size, color, bg };
}

/** Truncate string to max chars, appending ".." if needed */
function trunc(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 2) + '..' : s;
}

/** Format ms → "M:SS" (matches firmware formatTime) */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// ── Status Bar (identical layout to firmware drawStatusBar) ────
export function buildStatusBar(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const barH = STATUSBAR_H;
  const accent = hexTo565(state.accentHex);

  // Background + bottom divider
  cmds.push({ type: 'fill_rect', x: 0, y: 0, w, h: barH, color: C_BLACK });
  cmds.push({ type: 'draw_hline', x: 0, y: barH - 1, len: w, color: C_STATUS_LINE });

  // Extract HH:MM from timeStr (strip am/pm and seconds)
  let shortTime = '12:00';
  if (state.timeStr.length > 0) {
    let t = state.timeStr;
    const sp = t.indexOf(' ');
    if (sp > 0) t = t.substring(0, sp); // remove " am"/"pm"
    // remove extra seconds field if any
    const col2 = t.lastIndexOf(':');
    if (col2 > 2 && col2 !== t.indexOf(':')) t = t.substring(0, col2);
    shortTime = t;
  }

  // Connection mode: 2 = app connected, 1 = WiFi only, 0 = offline
  const connMode = state.clientConnected ? 2 : (state.wifiRssi > -120 ? 1 : 0);

  // Status dot at (8,7) r=2
  const dotCol = connMode === 2 ? 0x15D0 : (connMode === 1 ? C_CYAN : C_RED);
  cmds.push({ type: 'fill_circle', cx: 8, cy: 7, r: 2, color: dotCol });

  // Time text at (14,4)
  cmds.push({ type: 'text', x: 14, y: 4, text: shortTime, size: 1, color: C_WHITE, bg: C_BLACK });

  // Wi-Fi bars at wifiX = w - 18
  const rssi = state.wifiRssi;
  let bars = 0;
  if (state.wifiRssi > -120) {
    if (rssi > -60) bars = 4;
    else if (rssi > -70) bars = 3;
    else if (rssi > -80) bars = 2;
    else bars = 1;
  }
  const wifiX = w - 18;
  if (bars === 0) {
    cmds.push({ type: 'draw_line', x0: wifiX, y0: 4, x1: wifiX + 8, y1: 12, color: C_RED });
    cmds.push({ type: 'draw_line', x0: wifiX + 8, y0: 4, x1: wifiX, y1: 12, color: C_RED });
  } else {
    for (let i = 0; i < 4; i++) {
      const bh = 3 + i * 2;
      const bx = wifiX + i * 3;
      const by = 13 - bh;
      const bCol = bars > i ? accent : 0x2104;
      cmds.push({ type: 'fill_rect', x: bx, y: by, w: 2, h: bh, color: bCol });
    }
  }

  // Weather text at (w-60, 4)
  let weatherTxt = '24C';
  if (state.weatherValid) {
    weatherTxt = `${state.weatherTemp}C`;
  } else if (state.dhtValid) {
    weatherTxt = `${Math.round(state.dhtTemp)}C`;
  }

  // Mini sun icon at (w-68, 7)
  cmds.push({ type: 'fill_circle', cx: w - 68, cy: 7, r: 2, color: C_ORANGE });
  cmds.push({ type: 'draw_pixel',  x: w - 68, y: 4,  color: C_ORANGE });
  cmds.push({ type: 'draw_pixel',  x: w - 68, y: 10, color: C_ORANGE });
  cmds.push({ type: 'draw_pixel',  x: w - 71, y: 7,  color: C_ORANGE });
  cmds.push({ type: 'draw_pixel',  x: w - 65, y: 7,  color: C_ORANGE });
  cmds.push({ type: 'text', x: w - 60, y: 4, text: weatherTxt, size: 1, color: 0xCE79, bg: C_BLACK });

  return cmds;
}

// ── Shared Header (track + album art thumbnail) ──────────────
// Used by: lyrics view and now_playing view (via drawHeader firmware)
export function buildHeader(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const accent = hexTo565(state.accentHex);
  const headerTop = HEADER_TOP;

  // Clear header area
  cmds.push({ type: 'fill_rect', x: 0, y: headerTop, w, h: HEADER_H, color: C_BLACK });

  // Album art thumbnail 32×32 at (7,20)
  if (state.albumBitmap) {
    cmds.push({ type: 'rgb565_bitmap', x: 7, y: 20, w: 32, h: 32, data: state.albumBitmap });
    cmds.push({ type: 'draw_round_rect', x: 6, y: 19, w: 34, h: 34, r: 4, color: accent });
  } else {
    // Stylized vinyl placeholder
    cmds.push({ type: 'fill_round_rect', x: 6, y: 19, w: 34, h: 34, r: 4, color: 0x10A2 });
    cmds.push({ type: 'draw_round_rect', x: 6, y: 19, w: 34, h: 34, r: 4, color: accent });
    cmds.push({ type: 'fill_circle', cx: 23, cy: 36, r: 10, color: 0x2104 });
    cmds.push({ type: 'draw_circle', cx: 23, cy: 36, r: 7,  color: 0x39E7 });
    cmds.push({ type: 'fill_circle', cx: 23, cy: 36, r: 3,  color: accent });
  }

  // Track title at (46, 21) or (46, 22)
  const trackRaw = trunc(state.trackName || 'No Track', 24);
  const trackSize: 1|2 = trackRaw.length <= 11 ? 2 : 1;
  const trackY = trackSize === 2 ? 21 : 22;
  cmds.push({ type: 'text', x: 46, y: trackY, text: trunc(state.trackName || 'No Track', trackSize === 2 ? 12 : 24), size: trackSize, color: C_WHITE, bg: C_BLACK });

  // Artist name at (46, 38) size 1
  const artistStr = trunc(state.artistName || 'Desk Companion', 22);
  cmds.push({ type: 'text', x: 46, y: 38, text: artistStr, size: 1, color: C_ARTIST_GREY, bg: C_BLACK });

  // LRC badge (top-right)
  const badgeW = 28; const badgeH = 14;
  const badgeX = w - badgeW - 7; const badgeY = 20;
  const lrcColor = state.hasLyrics ? accent : 0x4208;
  cmds.push({ type: 'draw_round_rect', x: badgeX, y: badgeY, w: badgeW, h: badgeH, r: 3, color: lrcColor });
  cmds.push({ type: 'text', x: badgeX + 6, y: badgeY + 3, text: 'LRC', size: 1, color: lrcColor, bg: C_BLACK });

  // Play/pause dot at (w-14, 41) r=3
  cmds.push({ type: 'fill_circle', cx: w - 14, cy: 41, r: 3, color: state.isPlaying ? accent : 0x632C });

  // Divider line
  cmds.push({ type: 'draw_hline', x: 6, y: headerTop + HEADER_H - 1, len: w - 12, color: 0x2965 });

  return cmds;
}

// ── Footer (progress bar) ─────────────────────────────────────
export function buildFooter(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const accent = hexTo565(state.accentHex);
  const footerY = FOOTER_TOP;

  cmds.push({ type: 'fill_rect', x: 0, y: footerY, w, h: FOOTER_H, color: C_BLACK });
  cmds.push({ type: 'draw_hline', x: 6, y: footerY, len: w - 12, color: 0x2965 });

  const barX = 14; const barY = footerY + 8;
  const barW = w - 28; const barH = 3;

  const ratio = state.durationMs > 0 ? Math.min(1, state.progressMs / state.durationMs) : 0;
  const fillW = Math.floor(ratio * barW);

  cmds.push({ type: 'fill_round_rect', x: barX, y: barY, w: barW, h: barH, r: 1, color: 0x2104 });
  if (fillW > 0) {
    cmds.push({ type: 'fill_round_rect', x: barX, y: barY, w: fillW, h: barH, r: 1, color: accent });
  }

  const elapsed = formatTime(state.progressMs);
  const total   = state.durationMs > 1000 ? formatTime(state.durationMs) : 'LIVE';
  cmds.push({ type: 'text', x: barX, y: footerY + 16, text: elapsed, size: 1, color: 0xAD55, bg: C_BLACK });
  const totalX = barX + barW - textW(total, 1);
  cmds.push({ type: 'text', x: totalX, y: footerY + 16, text: total, size: 1, color: 0x7BEF, bg: C_BLACK });

  return cmds;
}

// ── LYRICS VIEW ───────────────────────────────────────────────
export function buildLyricsScene(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const accent = hexTo565(state.accentHex);
  const lyricsTop    = LYRICS_TOP;
  const lyricsHeight = LYRICS_H;
  const centerY      = lyricsTop + Math.floor(lyricsHeight / 2);

  // Clear lyrics zone
  cmds.push({ type: 'fill_rect', x: 0, y: lyricsTop, w, h: lyricsHeight, color: C_BLACK });

  if (!state.hasLyrics || (!state.currentLyric && !state.prevLyric && !state.nextLyric)) {
    cmds.push(centeredText('No Synced Lyrics', lyricsTop + Math.floor(lyricsHeight / 2) - 10, 2, 0x7BEF, C_BLACK));
    cmds.push(centeredText('Enjoy the music on Spotify', lyricsTop + Math.floor(lyricsHeight / 2) + 14, 1, 0x52AA, C_BLACK));
  } else {
    // Past line (prev) at centerY - 42
    if (state.prevLyric) {
      const past = trunc(state.prevLyric, 26);
      const pastY = centerY - 42;
      cmds.push(centeredText(past, pastY, 1, 0x7BEF, C_BLACK));
    }

    // Active lyric card
    const cur = state.currentLyric || '';
    const maxLineChars = 18;
    if (cur.length > 0) {
      const isMultiLine = cur.length > maxLineChars;
      const cardH = isMultiLine ? 46 : 36;
      const cardX = 10;
      const cardW = w - 20;
      const cardY = centerY - Math.floor(cardH / 2);

      cmds.push({ type: 'fill_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: C_DARK_CARD });
      cmds.push({ type: 'draw_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: accent });

      if (!isMultiLine) {
        cmds.push(centeredText(cur, cardY + Math.floor((cardH - FONT_H[2]) / 2), 2, accent, C_DARK_CARD));
      } else {
        // Split at last space before maxLineChars
        let split = cur.lastIndexOf(' ', maxLineChars);
        if (split === -1 || split < 6) split = maxLineChars;
        const line1 = cur.substring(0, split).trim();
        const line2 = cur.substring(split + 1).trim();
        const lyricSize: 1|2 = (line1.length <= maxLineChars && line2.length <= maxLineChars) ? 2 : 1;
        const y1 = lyricSize === 2 ? cardY + 6  : cardY + 10;
        const y2 = lyricSize === 2 ? cardY + 24 : cardY + 24;
        cmds.push(centeredText(line1, y1, lyricSize, accent, C_DARK_CARD));
        cmds.push(centeredText(line2, y2, lyricSize, accent, C_DARK_CARD));
      }
    }

    // Next line at centerY + 38
    if (state.nextLyric) {
      const next = trunc(state.nextLyric, 26);
      cmds.push(centeredText(next, centerY + 38, 1, 0x7BEF, C_BLACK));
    }
  }

  return cmds;
}

// ── NOW PLAYING VIEW ──────────────────────────────────────────
export function buildNowPlayingScene(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const accent = hexTo565(state.accentHex);
  const bodyTop = HEADER_TOP + HEADER_H;  // 56

  // Clear content area
  cmds.push({ type: 'fill_rect', x: 0, y: bodyTop, w, h: FOOTER_TOP - bodyTop, color: C_BLACK });

  // Large album art centered (128×128) → nearest multiple of 32 → scale=4
  const artSize = 128;
  const artX = Math.floor((w - artSize) / 2);
  const artY = 30;

  // Art border
  cmds.push({ type: 'draw_round_rect', x: artX - 3, y: artY - 3, w: artSize + 6, h: artSize + 6, r: 8, color: accent });

  if (state.albumBitmap) {
    // Scale 32×32 → 128×128 (4× pixel replication, mirroring firmware drawLargeAlbumArt)
    const scale = 4;
    const scaled = new Uint16Array(artSize * artSize);
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const col = state.albumBitmap[py * 32 + px];
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            scaled[(py * scale + sy) * artSize + (px * scale + sx)] = col;
          }
        }
      }
    }
    cmds.push({ type: 'rgb565_bitmap', x: artX, y: artY, w: artSize, h: artSize, data: scaled });
  } else {
    // Vinyl placeholder (mirrors firmware)
    cmds.push({ type: 'fill_round_rect', x: artX, y: artY, w: artSize, h: artSize, r: 8, color: 0x10A2 });
    cmds.push({ type: 'fill_circle', cx: artX + artSize/2, cy: artY + artSize/2, r: artSize/4, color: 0x2104 });
    cmds.push({ type: 'draw_circle', cx: artX + artSize/2, cy: artY + artSize/2, r: Math.floor(artSize/6), color: 0x39E7 });
    cmds.push({ type: 'fill_circle', cx: artX + artSize/2, cy: artY + artSize/2, r: Math.floor(artSize/10), color: accent });
  }

  // Track title centered below art
  const titleY = artY + artSize + 18;
  const trackDisplay = trunc(state.trackName || 'No Track', 24);
  const titleSize: 1|2 = trackDisplay.length <= 12 ? 2 : 1;
  cmds.push(centeredText(trunc(state.trackName || 'No Track', titleSize === 2 ? 14 : 24), titleY, titleSize, C_WHITE, C_BLACK));

  // Artist name centered below title
  const artistY = titleY + (titleSize === 2 ? 22 : 16);
  cmds.push(centeredText(trunc(state.artistName || 'Desk Companion', 26), artistY, 1, C_ARTIST_GREY, C_BLACK));

  return cmds;
}

// ── CLOCK VIEW ────────────────────────────────────────────────
export function buildClockScene(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const h = DISPLAY_H;
  const accent = hexTo565(state.accentHex);
  const bodyTop = HEADER_TOP;

  // Clear body
  cmds.push({ type: 'fill_rect', x: 0, y: bodyTop, w, h: FOOTER_TOP - bodyTop, color: C_BLACK });

  const tStr  = state.timeStr || '12:00 am';
  const timeY = 66;

  // Large clock time — split main digits from am/pm suffix
  // e.g. "12:29 am" → main="12:29" (size 4) + suffix="am" (size 2)
  const ampmIdx = (() => {
    for (const sfx of ['am','pm','AM','PM']) {
      const i = tStr.indexOf(sfx);
      if (i !== -1) return i;
    }
    return -1;
  })();

  if (ampmIdx !== -1) {
    const mainTime = tStr.substring(0, ampmIdx).trim();
    const suffix   = tStr.substring(ampmIdx).trim();
    // Firmware math: mainW = mainTime.length * 24, suffW = suffix.length * 12, gap = 8
    const mainWpx = mainTime.length * 24; // size 4 char width
    const gap = 8;
    const suffWpx = suffix.length * 12; // size 2
    const totalW = mainWpx + gap + suffWpx;
    const startX = Math.max(4, Math.floor((w - totalW) / 2));
    cmds.push({ type: 'text', x: startX, y: timeY, text: mainTime, size: 4, color: C_WHITE, bg: C_BLACK });
    cmds.push({ type: 'text', x: startX + mainWpx + gap, y: timeY + 14, text: suffix, size: 2, color: C_WHITE, bg: C_BLACK });
  } else {
    cmds.push(centeredText(tStr, timeY, 4, C_WHITE, C_BLACK));
  }

  // Date string below time
  const dStr  = state.dateStr || 'DESK COMPANION';
  const dateY = timeY + 44;
  cmds.push(centeredText(dStr, dateY, 1, 0x8410, C_BLACK));

  // Mini "now playing" card at bottom (mirrors firmware)
  const cardW = w - 24;
  const cardH = 48;
  const cardX = 12;
  const cardY = h - cardH - 24;

  cmds.push({ type: 'fill_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: 0x10A2 });
  cmds.push({ type: 'draw_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: 0x2965 });

  // Musical note icon at (cardX+12, cardY+16) — mirrors firmware pixel art
  const nx = cardX + 12;
  const ny = cardY + 16;
  cmds.push({ type: 'fill_circle', cx: nx, cy: ny + 9, r: 3, color: accent });
  cmds.push({ type: 'fill_rect', x: nx + 2, y: ny,     w: 2, h: 10, color: accent });
  cmds.push({ type: 'fill_rect', x: nx + 2, y: ny,     w: 5, h:  3, color: accent });

  // Track and artist text in card
  const trk = trunc(state.trackName || 'Idle', 18);
  const art = trunc(state.artistName || '', 20);
  cmds.push({ type: 'text', x: cardX + 26, y: cardY + 13, text: trk, size: 1, color: C_WHITE, bg: 0x10A2 });
  cmds.push({ type: 'text', x: cardX + 26, y: cardY + 28, text: art, size: 1, color: 0x8410, bg: 0x10A2 });

  return cmds;
}

// ── WEATHER VIEW ──────────────────────────────────────────────
export function buildWeatherScene(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const h = DISPLAY_H;
  const accent = hexTo565(state.accentHex);
  const bodyTop = HEADER_TOP;

  // Clear content area
  cmds.push({ type: 'fill_rect', x: 0, y: bodyTop, w, h: FOOTER_TOP - bodyTop, color: C_BLACK });

  const topY = 42;

  // City/location
  const city = trunc(state.weatherCity || 'Local Area', 26);
  cmds.push(centeredText(city, topY, 1, 0x8410, C_BLACK));

  // Large outdoor temperature (size 4)
  const tempY = topY + 18;
  const tempStr = `${state.weatherTemp} C`;
  cmds.push(centeredText(tempStr, tempY, 4, C_WHITE, C_BLACK));

  // Condition text
  const condY = tempY + 38;
  const cond = trunc(state.weatherCond || 'Partly Cloudy', 26);
  cmds.push(centeredText(cond, condY, 1, accent, C_BLACK));

  // Stats: H, L, Humidity
  const statsY = condY + 18;
  const statsStr = `H:${state.weatherHigh}  L:${state.weatherLow}  RH:${state.weatherHum}%`;
  cmds.push(centeredText(statsStr, statsY, 1, 0x7BEF, C_BLACK));

  // Indoor DHT sensor card
  const cardW = w - 24;
  const cardH = 58;
  const cardX = 12;
  const cardY = h - cardH - 24;

  cmds.push({ type: 'fill_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: 0x10A2 });
  cmds.push({ type: 'draw_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: 0x2965 });

  cmds.push({ type: 'text', x: cardX + 12, y: cardY + 10, text: 'INDOOR SENSOR (DHT-8)', size: 1, color: C_CYAN, bg: 0x10A2 });

  if (state.dhtValid) {
    const dhtLine = `Temp: ${state.dhtTemp.toFixed(1)} C  RH: ${Math.round(state.dhtHum)}%`;
    cmds.push({ type: 'text', x: cardX + 12, y: cardY + 26, text: dhtLine, size: 1, color: C_WHITE, bg: 0x10A2 });
  } else {
    cmds.push({ type: 'text', x: cardX + 12, y: cardY + 26, text: 'DHT Sensor: Ready (GPIO 8)', size: 1, color: C_WHITE, bg: 0x10A2 });
  }

  cmds.push({ type: 'text', x: cardX + 12, y: cardY + 42, text: 'Ambient Room Climate', size: 1, color: 0x7BEF, bg: 0x10A2 });

  return cmds;
}

// ── Notification Toast Overlay ────────────────────────────────
export function buildNotification(state: DisplayState): DrawCommand[] {
  if (!state.notifActive || !state.notifTitle) return [];
  const cmds: DrawCommand[] = [];
  const w = DISPLAY_W;
  const accent = hexTo565(state.accentHex);
  const cardW = w - 16;
  const cardH = 46;
  const cardX = 8;
  const cardY = 8;

  cmds.push({ type: 'fill_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: 0x18C3 });
  cmds.push({ type: 'draw_round_rect', x: cardX, y: cardY, w: cardW, h: cardH, r: 8, color: accent });
  cmds.push({ type: 'fill_circle', cx: cardX + 14, cy: cardY + 15, r: 3, color: accent });

  const title = trunc(state.notifTitle || '', 22);
  cmds.push({ type: 'text', x: cardX + 24, y: cardY + 11, text: title, size: 1, color: C_WHITE, bg: 0x18C3 });

  const body = trunc(state.notifBody || '', 26);
  cmds.push({ type: 'text', x: cardX + 24, y: cardY + 26, text: body, size: 1, color: 0x8410, bg: 0x18C3 });

  return cmds;
}

// ── Master scene builder ───────────────────────────────────────
export function buildScene(state: DisplayState): DrawCommand[] {
  const cmds: DrawCommand[] = [];

  // Status bar is universal (all screens)
  cmds.push(...buildStatusBar(state));

  // Per-screen content
  switch (state.screenMode) {
    case 'lyrics':
      cmds.push(...buildHeader(state));
      cmds.push(...buildLyricsScene(state));
      cmds.push(...buildFooter(state));
      break;
    case 'now_playing':
      cmds.push(...buildHeader(state));
      cmds.push(...buildNowPlayingScene(state));
      cmds.push(...buildFooter(state));
      break;
    case 'clock':
      cmds.push(...buildClockScene(state));
      break;
    case 'weather':
      cmds.push(...buildWeatherScene(state));
      break;
  }

  // Notification toast on top (if active)
  if (state.notifActive) {
    cmds.push(...buildNotification(state));
  }

  return cmds;
}

// ══════════════════════════════════════════════════════════════
// CANVAS RENDERER
// Renders DrawCommand[] onto an HTML <canvas> at 1 CSS px = 1 display px
// Canvas must be 240×320 internally.
// ══════════════════════════════════════════════════════════════

/** Render single Adafruit GFX 5x7 character with 100% hardware parity */
function drawCharGFX(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  c: number,
  size: 1|2|3|4,
  color: string, bg: string
) {
  if (c >= 176) c++; // Matches Adafruit GFX CP437 behavior
  for (let i = 0; i < 5; i++) {
    let line = GFX_FONT[c * 5 + i] || 0;
    for (let j = 0; j < 8; j++, line >>= 1) {
      if (line & 1) {
        ctx.fillStyle = color;
        ctx.fillRect(x + i * size, y + j * size, size, size);
      } else if (bg !== color) {
        ctx.fillStyle = bg;
        ctx.fillRect(x + i * size, y + j * size, size, size);
      }
    }
  }
  // 6th column spacing (1px * size)
  if (bg !== color) {
    ctx.fillStyle = bg;
    ctx.fillRect(x + 5 * size, y, size, 8 * size);
  }
}

/** Render text using Adafruit GFX fixed 5x7 bitmap font with 100% pixel parity to physical ILI9341 */
function renderGFXText(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  text: string,
  size: 1|2|3|4,
  color: string, bg: string
) {
  const cw = 6 * size;
  for (let idx = 0; idx < text.length; idx++) {
    const code = text.charCodeAt(idx);
    drawCharGFX(ctx, x + idx * cw, y, code, size, color, bg);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function renderToCanvas(cmds: DrawCommand[], canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Ensure canvas internal resolution is 240×320
  if (canvas.width !== DISPLAY_W)  canvas.width  = DISPLAY_W;
  if (canvas.height !== DISPLAY_H) canvas.height = DISPLAY_H;

  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'fill_rect': {
        ctx.fillStyle = rgb565toCss(cmd.color);
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
        break;
      }
      case 'draw_hline': {
        ctx.strokeStyle = rgb565toCss(cmd.color);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cmd.x, cmd.y + 0.5);
        ctx.lineTo(cmd.x + cmd.len, cmd.y + 0.5);
        ctx.stroke();
        break;
      }
      case 'draw_vline': {
        ctx.strokeStyle = rgb565toCss(cmd.color);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cmd.x + 0.5, cmd.y);
        ctx.lineTo(cmd.x + 0.5, cmd.y + cmd.len);
        ctx.stroke();
        break;
      }
      case 'fill_round_rect': {
        ctx.fillStyle = rgb565toCss(cmd.color);
        roundRect(ctx, cmd.x, cmd.y, cmd.w, cmd.h, cmd.r);
        ctx.fill();
        break;
      }
      case 'draw_round_rect': {
        ctx.strokeStyle = rgb565toCss(cmd.color);
        ctx.lineWidth = 1;
        roundRect(ctx, cmd.x + 0.5, cmd.y + 0.5, cmd.w - 1, cmd.h - 1, cmd.r);
        ctx.stroke();
        break;
      }
      case 'fill_circle': {
        ctx.fillStyle = rgb565toCss(cmd.color);
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'draw_circle': {
        ctx.strokeStyle = rgb565toCss(cmd.color);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'draw_pixel': {
        ctx.fillStyle = rgb565toCss(cmd.color);
        ctx.fillRect(cmd.x, cmd.y, 1, 1);
        break;
      }
      case 'draw_line': {
        ctx.strokeStyle = rgb565toCss(cmd.color);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cmd.x0 + 0.5, cmd.y0 + 0.5);
        ctx.lineTo(cmd.x1 + 0.5, cmd.y1 + 0.5);
        ctx.stroke();
        break;
      }
      case 'text': {
        renderGFXText(ctx, cmd.x, cmd.y, cmd.text, cmd.size, rgb565toCss(cmd.color), rgb565toCss(cmd.bg));
        break;
      }
      case 'rgb565_bitmap': {
        const imgData = ctx.createImageData(cmd.w, cmd.h);
        const pix = imgData.data;
        for (let i = 0; i < cmd.w * cmd.h; i++) {
          const c = cmd.data[i];
          const r = ((c >> 11) & 0x1F) << 3;
          const g = ((c >>  5) & 0x3F) << 2;
          const b =  (c        & 0x1F) << 3;
          pix[i * 4]     = r;
          pix[i * 4 + 1] = g;
          pix[i * 4 + 2] = b;
          pix[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, cmd.x, cmd.y);
        break;
      }
    }
  }
}

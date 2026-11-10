import { LyricLine } from '../types/models';

export function parseLrcLyrics(lrcText: string): LyricLine[] {
  if (!lrcText || !lrcText.trim()) return [];

  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];

  // Parse global offset tag [offset:+/-ms]
  let globalOffsetMs = 0;
  const offsetRegex = /\[offset:\s*([+-]?\d+)\s*\]/i;
  for (const rawLine of lines) {
    const match = rawLine.match(offsetRegex);
    if (match) {
      globalOffsetMs = parseInt(match[1], 10) || 0;
      break;
    }
  }

  // Match [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip metadata tags like [ar:Artist], [ti:Title], [offset:...]
    if (/^\[(ar|ti|al|by|offset|length):/i.test(line)) continue;

    const matches = [...line.matchAll(timeRegex)];
    if (matches.length === 0) continue;

    // Extract the lyric text after all timestamp tags
    const text = line.replace(timeRegex, '').trim();

    // Skip empty filler lines so lyrics flow naturally without random blank lines
    if (!text) continue;

    for (const match of matches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let ms = 0;

      if (match[3]) {
        if (match[3].length === 1) {
          ms = parseInt(match[3], 10) * 100;
        } else if (match[3].length === 2) {
          ms = parseInt(match[3], 10) * 10;
        } else {
          ms = parseInt(match[3], 10);
        }
      }

      const totalTimeMs = Math.max(0, minutes * 60000 + seconds * 1000 + ms + globalOffsetMs);
      result.push({
        timeMs: totalTimeMs,
        text,
      });
    }
  }

  // Sort chronologically
  result.sort((a, b) => a.timeMs - b.timeMs);
  return result;
}

export function parsePlainLyrics(plainText: string): LyricLine[] {
  if (!plainText || !plainText.trim()) return [];
  return plainText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text, index) => ({
      timeMs: index * 4000,
      text,
    }));
}

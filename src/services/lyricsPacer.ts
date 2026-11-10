import { LyricLine } from '../types/models';

export interface PacedLyricLine extends LyricLine {
  isSubChunk?: boolean;
  parentLineIndex?: number;
  subChunkIndex?: number;
  totalSubChunks?: number;
}

/**
 * Heuristic syllable counter for English and phonetic words.
 * Handles silent 'e', common contractions, and vowel clusters.
 */
export function countWordSyllables(word: string): number {
  const clean = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  const prefixExceptions: Record<string, number> = {
    im: 1,
    ive: 1,
    youre: 1,
    cant: 1,
    wont: 1,
    dont: 1,
    didnt: 2,
    couldnt: 2,
    wouldnt: 2,
    shouldnt: 2,
  };
  if (prefixExceptions[clean]) return prefixExceptions[clean];

  let text = clean;
  // Silent terminal 'e'
  if (text.endsWith('e') && !text.endsWith('le')) {
    text = text.slice(0, -1);
  }

  const matches = text.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;

  // Words ending in -ed where e is silent
  if (clean.endsWith('ed') && !clean.endsWith('ted') && !clean.endsWith('ded') && count > 1) {
    count -= 1;
  }

  return Math.max(1, count);
}

/**
 * Calculates linguistic weight for a sub-chunk based on syllables,
 * character count, and trailing punctuation (breath/caesura pause).
 */
export function calculateChunkWeight(chunk: string): number {
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let totalWeight = 0;
  for (const w of words) {
    const syllables = countWordSyllables(w);
    const chars = w.length;
    totalWeight += syllables * 1.4 + chars * 0.18;
  }

  // Bonus for caesura / trailing breath punctuation (?, !, ,, ;, --)
  const lastWord = words[words.length - 1];
  if (/[?!;—]/.test(lastWord)) {
    totalWeight += 2.2;
  } else if (/[,.]/.test(lastWord)) {
    totalWeight += 1.4;
  }

  return Math.max(1, totalWeight);
}

/**
 * Splits a long line into balanced, grammatically natural sub-chunks
 * that fit within the display character budget (e.g. 18 chars for 240px portrait).
 */
export function splitLineIntoChunks(text: string, maxChars: number = 18): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  // Step 1: Pre-split at sentence-level punctuation (?, !, ;, —, or comma followed by space)
  const punctRegex = /([?!;—]+(?:\s+|$)|,\s+)/;
  const parts = trimmed.split(punctRegex).filter(Boolean);

  let clauses: string[] = [];
  if (parts.length > 1) {
    let currentClause = '';
    for (let i = 0; i < parts.length; i++) {
      currentClause += parts[i];
      if (/[?!;—,]/.test(parts[i]) || i === parts.length - 1) {
        if (currentClause.trim().length > 0) {
          clauses.push(currentClause.trim());
          currentClause = '';
        }
      }
    }
  } else {
    clauses = [trimmed];
  }

  const chunks: string[] = [];
  const conjunctions = new Set([
    'and', 'but', 'or', 'so', 'yet', 'for', 'nor',
    'with', 'that', 'to', 'in', 'on', 'at', 'by', 'from',
    'when', 'where', 'while', 'because', 'then', 'as', 'if'
  ]);

  for (const clause of clauses) {
    if (clause.length <= maxChars) {
      chunks.push(clause);
      continue;
    }

    const words = clause.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      chunks.push(clause);
      continue;
    }

    // Determine how many sub-chunks this clause needs
    const numSubChunks = Math.ceil(clause.length / maxChars);
    const targetLength = Math.ceil(clause.length / numSubChunks);

    let startIndex = 0;
    while (startIndex < words.length) {
      let bestSplit = startIndex + 1;
      let minDiff = 9999;
      let curLen = 0;

      for (let i = startIndex; i < words.length; i++) {
        curLen += (i === startIndex ? 0 : 1) + words[i].length;

        // Don't exceed maxChars unless single word
        if (curLen > maxChars && i > startIndex) break;

        // How close is this to ideal balanced targetLength?
        let diff = Math.abs(curLen - targetLength);

        // Prefer breaking before a conjunction
        if (i + 1 < words.length && conjunctions.has(words[i + 1].toLowerCase().replace(/[^a-z]/g, ''))) {
          diff -= 3;
        }

        if (diff < minDiff) {
          minDiff = diff;
          bestSplit = i + 1;
        }
      }

      chunks.push(words.slice(startIndex, bestSplit).join(' '));
      startIndex = bestSplit;
    }
  }

  // Merge any tiny orphan chunks (<= 5 chars) into previous if within maxChars
  for (let k = chunks.length - 1; k >= 1; k--) {
    if (chunks[k].length <= 5 && (chunks[k - 1].length + chunks[k].length + 1) <= maxChars) {
      chunks[k - 1] = `${chunks[k - 1]} ${chunks[k]}`;
      chunks.splice(k, 1);
    }
  }

  return chunks;
}

/**
 * Expands line-level LRC lyrics into micro-timed sub-chunks based on
 * syllable counts, linguistic boundaries, and acoustic breath weighting.
 */
export function expandAndPaceLyrics(
  lines: LyricLine[],
  maxCharsPerChunk: number = 18,
  totalTrackDurationMs: number = 240000
): PacedLyricLine[] {
  if (!lines || lines.length === 0) return [];

  const pacedLines: PacedLyricLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1];

    let lineDurationMs: number;
    if (nextLine && nextLine.timeMs > currentLine.timeMs) {
      lineDurationMs = nextLine.timeMs - currentLine.timeMs;
      // Cap at 9 seconds so vocal-less gaps don't hold the sub-chunk indefinitely
      lineDurationMs = Math.min(lineDurationMs, 9000);
    } else {
      const remainingMs = totalTrackDurationMs - currentLine.timeMs;
      lineDurationMs = Math.max(3000, Math.min(remainingMs > 0 ? remainingMs : 4500, 7000));
    }

    const subChunks = splitLineIntoChunks(currentLine.text, maxCharsPerChunk);

    if (subChunks.length <= 1) {
      pacedLines.push({
        timeMs: currentLine.timeMs,
        text: currentLine.text,
        isSubChunk: false,
        parentLineIndex: i,
        subChunkIndex: 0,
        totalSubChunks: 1,
      });
      continue;
    }

    const weights = subChunks.map((chunk) => calculateChunkWeight(chunk));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let accumulatedTimeMs = currentLine.timeMs;
    const minChunkDurationMs = 800;

    for (let c = 0; c < subChunks.length; c++) {
      const chunkText = subChunks[c];
      const chunkRatio = weights[c] / totalWeight;
      const rawChunkDuration = Math.round(lineDurationMs * chunkRatio);
      const chunkDuration = Math.max(minChunkDurationMs, rawChunkDuration);

      pacedLines.push({
        timeMs: accumulatedTimeMs,
        text: chunkText,
        isSubChunk: true,
        parentLineIndex: i,
        subChunkIndex: c,
        totalSubChunks: subChunks.length,
      });

      accumulatedTimeMs += chunkDuration;
    }
  }

  // Maintain strictly non-decreasing timestamps
  for (let k = 1; k < pacedLines.length; k++) {
    if (pacedLines[k].timeMs <= pacedLines[k - 1].timeMs) {
      pacedLines[k].timeMs = pacedLines[k - 1].timeMs + 400;
    }
  }

  return pacedLines;
}

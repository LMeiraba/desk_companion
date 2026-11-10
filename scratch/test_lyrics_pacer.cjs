function countWordSyllables(word) {
  const clean = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  const prefixExceptions = {
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
  if (text.endsWith('e') && !text.endsWith('le')) {
    text = text.slice(0, -1);
  }

  const matches = text.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;

  if (clean.endsWith('ed') && !clean.endsWith('ted') && !clean.endsWith('ded') && count > 1) {
    count -= 1;
  }

  return Math.max(1, count);
}

function calculateChunkWeight(chunk) {
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  let totalWeight = 0;
  for (const w of words) {
    const syllables = countWordSyllables(w);
    const chars = w.length;
    totalWeight += syllables * 1.4 + chars * 0.18;
  }

  const lastWord = words[words.length - 1];
  if (/[?!;—]/.test(lastWord)) {
    totalWeight += 2.2;
  } else if (/[,.]/.test(lastWord)) {
    totalWeight += 1.4;
  }

  return Math.max(1, totalWeight);
}

function splitLineIntoChunks(text, maxChars = 18) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return [trimmed];
  }

  const chunks = [];
  let currentWords = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = [...currentWords, word].join(' ');

    if (candidate.length <= maxChars) {
      currentWords.push(word);
      continue;
    }

    if (currentWords.length === 0) {
      chunks.push(word);
      continue;
    }

    chunks.push(currentWords.join(' '));
    currentWords = [word];
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '));
  }

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    if (last.length <= 6 && (prev.length + last.length + 1) <= (maxChars + 4)) {
      chunks[chunks.length - 2] = `${prev} ${last}`;
      chunks.pop();
    }
  }

  return chunks;
}

function expandAndPaceLyrics(lines, maxCharsPerChunk = 18, totalTrackDurationMs = 240000) {
  if (!lines || lines.length === 0) return [];

  const pacedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1];

    let lineDurationMs;
    if (nextLine && nextLine.timeMs > currentLine.timeMs) {
      lineDurationMs = nextLine.timeMs - currentLine.timeMs;
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

  for (let k = 1; k < pacedLines.length; k++) {
    if (pacedLines[k].timeMs <= pacedLines[k - 1].timeMs) {
      pacedLines[k].timeMs = pacedLines[k - 1].timeMs + 500;
    }
  }

  return pacedLines;
}

// TEST CASES
const testLines = [
  { timeMs: 14000, text: "I think my sanity is screwed" }, // 28 chars
  { timeMs: 18000, text: "Feel like I'm drifting alone in space" }, // 37 chars
  { timeMs: 23000, text: "I've been falling faster" }, // 24 chars
  { timeMs: 27000, text: "Where'd you wanna go? How much you wanna risk?" }, // 46 chars
  { timeMs: 32000, text: "I want something just like this" }, // 31 chars
];

console.log("=== RAW LINES VS PACED SUB-CHUNKS ===");
const paced = expandAndPaceLyrics(testLines, 18);
for (const p of paced) {
  const timeStr = `${Math.floor(p.timeMs / 1000)}.${String(p.timeMs % 1000).padStart(3, '0')}s`;
  console.log(`[${timeStr}] (${p.text.length} chars) "${p.text}" ${p.isSubChunk ? `[chunk ${p.subChunkIndex + 1}/${p.totalSubChunks}]` : ''}`);
}

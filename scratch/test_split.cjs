function splitLineIntoChunks(text, maxChars = 18) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  // Step 1: Check if there's natural sentence-level punctuation (?, !, ;, —)
  // that can cleanly divide the line first
  const punctRegex = /([?!;—]+(?:\s+|$)|,\s+)/;
  const parts = trimmed.split(punctRegex).filter(Boolean);

  let clauses = [];
  if (parts.length > 1) {
    let currentClause = '';
    for (let i = 0; i < parts.length; i++) {
      currentClause += parts[i];
      // If part ended in punctuation, finish this clause
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

  const chunks = [];
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

        // If this single chunk exceeds maxChars, stop unless it's only 1 word
        if (curLen > maxChars && i > startIndex) break;

        // How close is this to the ideal balanced targetLength?
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

  // Merge any tiny orphan chunks (< 6 chars) into previous if within maxChars
  for (let k = chunks.length - 1; k >= 1; k--) {
    if (chunks[k].length <= 5 && (chunks[k - 1].length + chunks[k].length + 1) <= maxChars) {
      chunks[k - 1] = `${chunks[k - 1]} ${chunks[k]}`;
      chunks.splice(k, 1);
    }
  }

  return chunks;
}

const testLines = [
  "I think my sanity is screwed",
  "Feel like I'm drifting alone in space",
  "I've been falling faster",
  "Where'd you wanna go? How much you wanna risk?",
  "I want something just like this",
  "She said, 'Where'd you wanna go? How much you wanna risk?'",
  "I'm not looking for somebody with some superhuman gifts",
];

console.log("=== BALANCED CLAUSE-AWARE NLP SPLITTING ===");
for (const line of testLines) {
  const parts = splitLineIntoChunks(line, 18);
  console.log(`Original: "${line}" (${line.length} chars)`);
  parts.forEach((p, idx) => console.log(`   [${idx + 1}] (${p.length} chars) "${p}"`));
}

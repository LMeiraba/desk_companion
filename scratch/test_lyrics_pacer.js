// Direct verification test for lyrics sub-chunking & syllable pacing

const {
  countWordSyllables,
  calculateChunkWeight,
  splitLineIntoChunks,
  expandAndPaceLyrics,
} = require('../src/services/lyricsPacer.ts');

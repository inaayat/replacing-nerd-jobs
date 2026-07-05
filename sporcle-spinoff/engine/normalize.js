// Shared answer-normalization utilities for typed-answer quiz types
// (text-entry, image, map). Keep all fuzzy-match logic here so every
// template checks answers the same way.

// Lowercase, strip accents, collapse punctuation/whitespace.
export function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' ')                      // punctuation -> space
    .trim();
}

// Does `input` match any string in `acceptList`? Returns the matched
// canonical accept string, or null. Comparison is normalized on both sides.
export function matchAccept(input, acceptList) {
  const n = normalize(input);
  if (!n) return null;
  for (const a of acceptList || []) {
    if (normalize(a) === n) return a;
  }
  return null;
}

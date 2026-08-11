import { watchesApi } from './api.js';
import { escapeHtml } from './format.js';

const AMC_THEATERS_URL = './data/amc-theaters.json';
const SUGGEST_LIMIT = 50;

function isRealTheater(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  return n.toLowerCase() !== 'not in theaters';
}

/** Unique theater names from watches, most-visited first. */
export function theatersFromWatches(watches = []) {
  const counts = new Map();
  for (const w of watches) {
    if (w?.in_theaters === false) continue;
    const name = String(w?.location || '').trim();
    if (!isRealTheater(name)) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

export async function loadUserTheaters(token) {
  if (!token) return [];
  try {
    const { watches } = await watchesApi.list(token);
    return theatersFromWatches(watches);
  } catch {
    return [];
  }
}

let amcTheatersPromise = null;

/** Full AMC theater catalog (names only), fetched once per page load. */
export function loadAmcTheaters() {
  if (!amcTheatersPromise) {
    amcTheatersPromise = fetch(AMC_THEATERS_URL)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => []);
  }
  return amcTheatersPromise;
}

/**
 * Merge user history with the AMC catalog for autocomplete.
 * Empty query shows only past theaters; typed queries search both (user first).
 */
export function filterTheaterSuggestions(userTheaters = [], amcTheaters = [], query = '', limit = SUGGEST_LIMIT) {
  const needle = String(query || '').trim().toLowerCase();
  const user = userTheaters.filter(Boolean);
  const amc = amcTheaters.filter(Boolean);

  if (!needle) return user.slice(0, limit);

  const seen = new Set();
  const matches = [];

  const add = (name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(name);
  };

  for (const name of user) {
    if (name.toLowerCase().includes(needle)) add(name);
    if (matches.length >= limit) return matches;
  }

  for (const name of amc) {
    if (name.toLowerCase().includes(needle)) add(name);
    if (matches.length >= limit) return matches;
  }

  return matches;
}

/**
 * Wire a text input + results panel as a theater autocomplete.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} resultsEl
 * @param {{ getTheaters: () => string[], onSelect?: (name: string) => void }} opts
 */
export function wireTheaterSuggest(input, resultsEl, { getTheaters, onSelect } = {}) {
  if (!input || !resultsEl || typeof getTheaters !== 'function') return;

  let amcTheaters = [];

  loadAmcTheaters().then((list) => {
    amcTheaters = list;
    if (document.activeElement === input) render(input.value);
  });

  const render = (q = '') => {
    const matches = filterTheaterSuggestions(getTheaters(), amcTheaters, q);

    if (!matches.length) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }

    resultsEl.hidden = false;
    resultsEl.innerHTML = matches.map((t) => `
      <button type="button" data-theater="${escapeHtml(t)}">${escapeHtml(t)}</button>
    `).join('');

    resultsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        // mousedown so selection happens before input blur
        e.preventDefault();
        input.value = btn.dataset.theater || '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        onSelect?.(input.value);
      });
    });
  };

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  });

  document.addEventListener('click', (e) => {
    const wrap = input.closest('.al-search-wrap');
    if (!wrap || !wrap.contains(e.target)) resultsEl.hidden = true;
  });
}

/** Remember a newly typed theater in an in-memory list (most recent first). */
export function rememberTheater(list, name) {
  const trimmed = String(name || '').trim();
  if (!isRealTheater(trimmed)) return list;
  return [trimmed, ...list.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())];
}

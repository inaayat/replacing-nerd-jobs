import { watchesApi } from './api.js';
import { escapeHtml } from './format.js';

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

/**
 * Wire a text input + results panel as a theater autocomplete.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} resultsEl
 * @param {{ getTheaters: () => string[], onSelect?: (name: string) => void }} opts
 */
export function wireTheaterSuggest(input, resultsEl, { getTheaters, onSelect } = {}) {
  if (!input || !resultsEl || typeof getTheaters !== 'function') return;

  const render = (q = '') => {
    const needle = q.trim().toLowerCase();
    const theaters = getTheaters().filter(Boolean);
    const matches = needle
      ? theaters.filter((t) => t.toLowerCase().includes(needle))
      : theaters;

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

import { escapeHtml } from './format.js';

export const THEATER_DEFAULTS = [
  'AMC Lincoln Square 13',
  'AMC Empire 25',
  'N/A - India',
];

/** Unique theater names from watch history, most-used first. */
export function theatersFromWatches(watches = []) {
  const counts = new Map();
  for (const watch of watches) {
    if (watch.in_theaters === false) continue;
    const loc = String(watch.location || '').trim();
    if (!loc || loc === 'Not in theaters') continue;
    counts.set(loc, (counts.get(loc) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([loc]) => loc);
}

export function mergeTheaterLists(fromWatches = [], defaults = THEATER_DEFAULTS) {
  const seen = new Set();
  const merged = [];
  for (const name of [...fromWatches, ...defaults]) {
    const loc = String(name || '').trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(loc);
  }
  return merged;
}

export function filterTheaters(theaters, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  const list = q
    ? theaters.filter((t) => t.toLowerCase().includes(q))
    : theaters;
  return list.slice(0, limit);
}

export function rememberTheater(theaters, location) {
  const loc = String(location || '').trim();
  if (!loc || loc === 'Not in theaters') return theaters;
  const key = loc.toLowerCase();
  if (theaters.some((t) => t.toLowerCase() === key)) return theaters;
  return [loc, ...theaters];
}

export function wireTheaterAutocomplete({
  input,
  resultsEl,
  getTheaters,
  wrapEl = input?.closest('.al-search-wrap'),
}) {
  if (!input || !resultsEl || !getTheaters) return;

  const render = () => {
    const matches = filterTheaters(getTheaters(), input.value);
    if (!matches.length) {
      resultsEl.hidden = true;
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = matches.map((name) => `
      <button type="button" data-theater="${escapeHtml(name)}">${escapeHtml(name)}</button>
    `).join('');
    resultsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.theater;
        resultsEl.hidden = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);

  const dismiss = (e) => {
    if (wrapEl?.contains(e.target)) return;
    resultsEl.hidden = true;
  };

  document.addEventListener('click', dismiss);
}

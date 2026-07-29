export function money(cents) {
  if (cents == null || Number.isNaN(cents)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function monthLabel(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function ratingLabel(watch) {
  if (watch.dnf) return 'DNF';
  if (watch.rating == null) return '—';
  return `${watch.rating}★`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

export function posterUrl(posterPath, size = 'w92') {
  if (!posterPath) return null;
  return `${TMDB_IMG_BASE}/${size}${posterPath}`;
}

export function posterHtml(watch, { size = 'w92', width = 28, height = 42, className = 'al-poster' } = {}) {
  const url = posterUrl(watch.poster_path, size);
  if (url) {
    return `<img class="${className}" src="${url}" alt="" width="${width}" height="${height}" loading="lazy">`;
  }
  return `<span class="${className} al-poster--empty" style="width:${width}px;height:${height}px" aria-hidden="true"></span>`;
}

export function parseMoneyInput(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

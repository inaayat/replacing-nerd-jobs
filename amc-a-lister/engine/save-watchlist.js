import { escapeHtml } from './format.js';

const BOOKMARK = '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1z"/>';

/**
 * Hover overlay on a poster. Hidden until the pointer is over the poster;
 * the click adds that film to the viewer's Want to watch list.
 */
export function saveWatchlistOverlayHtml(item, saved) {
  const tmdb = item?.tmdb_id != null && item.tmdb_id !== '' ? String(item.tmdb_id) : '';
  const label = saved ? 'On your list' : 'Want to watch';
  return `
    <button type="button" class="al-poster-save${saved ? ' is-saved' : ''}"
      data-save-watchlist
      data-tmdb-id="${escapeHtml(tmdb)}"
      data-title="${escapeHtml(item?.title || '')}"
      aria-label="${escapeHtml(label)}"
      ${saved ? 'disabled' : ''}>
      <svg class="al-poster-save-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${BOOKMARK}</svg>
      <span class="al-poster-save-label">${escapeHtml(label)}</span>
    </button>
  `;
}

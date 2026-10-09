import { escapeHtml, posterHtml } from './format.js';

function actionIcon(name) {
  const paths = {
    rerank: '<path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1"/><path d="M19.4 4.2v4.2h-4.2"/>',
    remove: '<path d="M5.2 7.6h13.6"/><path d="M9.2 7.5V5.8h5.6v1.7"/><path d="M7.4 7.6l.8 11.2h7.6l.8-11.2"/><path d="M10.4 10.6v5.2M13.6 10.6v5.2"/>',
  };
  return `<svg class="al-watchlist-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function iconButton(attrs, label, icon) {
  const name = escapeHtml(label);
  return `<button type="button" class="al-link-btn al-watchlist-icon-btn" ${attrs} aria-label="${name}" title="${name}">${actionIcon(icon)}</button>`;
}

function posterBlock(item, badge) {
  return `
    <div class="al-rank-tile-poster">
      ${posterHtml(item, { size: 'w342', className: 'al-poster al-poster--grid', fluid: true })}
      ${badge || ''}
    </div>
  `;
}

export function unrankedTileHtml(item) {
  const year = item.year ? `<span class="al-rank-tile-year">${escapeHtml(item.year)}</span>` : '';
  return `
    <button type="button" class="al-rank-tile" data-add-logged="${item.tmdb_id}">
      ${posterBlock(item)}
      <span class="al-rank-tile-title">${escapeHtml(item.title)}</span>
      ${year}
    </button>
  `;
}

export function rankedTileHtml(item, position) {
  const year = item.year ? `<span class="al-rank-tile-year">${escapeHtml(item.year)}</span>` : '';
  return `
    <article class="al-rank-tile">
      ${posterBlock(item, `<span class="al-rank-tile-num">${position}</span>`)}
      <h3 class="al-rank-tile-title">${escapeHtml(item.title)}</h3>
      ${year}
      <div class="al-row-actions al-watchlist-card-actions">
        ${iconButton(`data-rerank="${item.tmdb_id}"`, 'Re-rank', 'rerank')}
        ${iconButton(`data-unrank="${item.tmdb_id}"`, 'Remove', 'remove')}
      </div>
    </article>
  `;
}

/** Every unranked title, not a short sample. */
export function unrankedGridHtml(items) {
  if (!items?.length) return '';
  return `<div class="al-rank-grid al-rank-grid--unranked">${items.map(unrankedTileHtml).join('')}</div>`;
}

export function rankStackHtml(ranks) {
  if (!ranks?.length) return '<p class="al-empty">Nothing ranked yet.</p>';
  return `<div class="al-rank-grid">${ranks.map((item, i) => rankedTileHtml(item, i + 1)).join('')}</div>`;
}

/**
 * Rank-unranked control sits above the ranked grid. Hidden when nothing is unranked.
 * Individual unranked posters stay below the stack so they don't push #1 off screen.
 */
export function rankStackWithUnrankedHtml(ranks, unranked, { buttonLabel, unrankedLabel } = {}) {
  const items = unranked || [];
  const bar = items.length
    ? `<div class="al-rank-unranked-bar">
        <button type="button" class="al-btn al-btn-primary" id="rank-unranked">${escapeHtml(buttonLabel || '')}</button>
      </div>`
    : '';
  const below = items.length
    ? `<div class="al-rank-unranked">
        <p class="al-rank-unranked-label">${escapeHtml(unrankedLabel || 'Not ranked yet')} · ${items.length}</p>
        ${unrankedGridHtml(items)}
      </div>`
    : '';
  return `${bar}<div id="rank-list">${rankStackHtml(ranks)}</div>${below}`;
}

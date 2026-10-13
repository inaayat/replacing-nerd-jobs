import { escapeHtml, posterHtml } from './format.js';

/** Poster-strip comparison used on the leaderboard and on a member log. */
export function renderCompareResults(comparison, { youName, themName } = {}) {
  if (!comparison) return '';
  const you = youName || comparison.you?.displayName || 'You';
  const them = themName || comparison.them?.displayName || 'Them';
  const bothWant = Array.isArray(comparison.bothWant) ? comparison.bothWant : [];

  return `
    <p class="al-muted al-compare-status">
      ${escapeHtml(you)} vs ${escapeHtml(them)} ·
      ${comparison.bothSeen.length} shared ·
      ${comparison.onlyYou.length} only ${escapeHtml(you)} ·
      ${comparison.onlyThem.length} only ${escapeHtml(them)}
      ${bothWant.length ? ` · ${bothWant.length} both want` : ''}
    </p>
    <div class="al-compare-results">
    ${renderCompareSection('Both seen', comparison.bothSeen, {
      hint: 'Movies both members have logged at least once.',
      labelFn: (movie) => compareRatingLabel(movie, you, them),
    })}
    ${renderCompareSection('You both want to watch', bothWant, {
      hint: 'Titles on both want lists.',
      labelFn: () => 'Wanted by both',
    })}
    ${renderCompareSection(`Only ${you}`, comparison.onlyYou, {
      hint: `Movies in ${you}'s log that ${them} has not seen.`,
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection(`Only ${them}`, comparison.onlyThem, {
      hint: `Movies in ${them}'s log that ${you} has not seen.`,
      labelFn: (movie) => singleRatingLabel(movie.rating),
    })}
    ${renderCompareSection('Disagreed (1★+ apart)', comparison.disagreed, {
      hint: 'Shared movies where ratings differ by at least one star.',
      labelFn: (movie) => `${formatRating(movie.yourRating)} vs ${formatRating(movie.theirRating)}`,
    })}
    ${renderCompareSection('Both loved (4★+)', comparison.bothLoved, {
      hint: 'Shared movies both rated 4 stars or higher.',
      labelFn: (movie) => `${formatRating(movie.yourRating)} · ${formatRating(movie.theirRating)}`,
    })}
    </div>
  `;
}

export function renderCompareSection(title, movies, { hint, labelFn }) {
  return `
    <section class="al-compare-section">
      <div class="al-compare-section-head">
        <h3 class="serif">${escapeHtml(title)}</h3>
        <span class="al-compare-count">${movies.length}</span>
      </div>
      <p class="al-muted">${escapeHtml(hint)}</p>
      ${movies.length
    ? `<div class="al-poster-strip">${movies.map((movie) => renderPosterItem(movie, labelFn(movie))).join('')}</div>`
    : '<div class="al-empty">Nothing here yet.</div>'}
    </section>
  `;
}

function renderPosterItem(movie, label) {
  return `
    <div class="al-poster-strip-item">
      ${posterHtml(movie, { size: 'w154', width: 72, height: 108, className: 'al-poster al-poster--strip' })}
      <span class="al-poster-strip-label" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</span>
      <span class="al-poster-strip-meta">${escapeHtml(label)}</span>
    </div>
  `;
}

function compareRatingLabel(movie, youName, themName) {
  const yours = formatRating(movie.yourRating);
  const theirs = formatRating(movie.theirRating);
  if (yours === '—' && theirs === '—') return 'No ratings';
  return `${youName} ${yours} · ${themName} ${theirs}`;
}

function singleRatingLabel(rating) {
  return rating != null ? formatRating(rating) : 'No rating';
}

function formatRating(rating) {
  if (rating == null) return '—';
  return `${rating}★`;
}

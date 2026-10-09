import { escapeHtml, posterHtml, shortDate } from './format.js';
import { ratingStarsHtml } from './watch-log-grid.js';

function actionIcon(name) {
  const paths = {
    edit: '<path d="M13.6 5.6 18.4 10.4"/><path d="M4.6 19.4 5.8 15 15 5.8a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L9 18.2l-4.4 1.2z"/>',
    remove: '<path d="M5.2 7.6h13.6"/><path d="M9.2 7.5V5.8h5.6v1.7"/><path d="M7.4 7.6l.8 11.2h7.6l.8-11.2"/><path d="M10.4 10.6v5.2M13.6 10.6v5.2"/>',
  };
  return `<svg class="al-watchlist-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function iconButton(attrs, label, icon) {
  const name = escapeHtml(label);
  return `<button type="button" class="al-link-btn al-watchlist-icon-btn" ${attrs} aria-label="${name}" title="${name}">${actionIcon(icon)}</button>`;
}

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

export function episodeLabel(watch) {
  if (watch.season != null && watch.episode != null) return `S${watch.season}E${watch.episode}`;
  if (watch.season != null) return `Season ${watch.season}`;
  return '—';
}

function fact(label, value) {
  return `<div class="al-watch-card-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function cachedShow(state, watch) {
  const cache = state.detailsCache;
  if (!cache) return null;
  return cache.get(watch.id) || cache.get(String(watch.id)) || null;
}

function showDetailsHtml(watch, state) {
  if (!watch.tmdb_id) {
    return '<p class="al-muted al-watch-more-note">No TMDB match for this title. Use Edit and pick the show from search to load details.</p>';
  }
  if (state.detailsLoading != null && sameId(state.detailsLoading, watch.id)) {
    return '<p class="al-muted al-watch-more-note">Loading show details…</p>';
  }
  if (state.detailsError && sameId(state.expandedId, watch.id)) {
    return `<p class="al-error al-watch-more-note">${escapeHtml(state.detailsError)}</p>`;
  }
  const show = cachedShow(state, watch);
  if (!show) {
    return '<p class="al-muted al-watch-more-note">Loading show details…</p>';
  }
  const genres = show.genres?.length ? show.genres.join(', ') : '—';
  const seasons = show.number_of_seasons != null
    ? `${show.number_of_seasons} season${Number(show.number_of_seasons) === 1 ? '' : 's'}`
    : '—';
  const episodes = show.number_of_episodes != null ? `${show.number_of_episodes} episodes` : '—';
  const cast = show.cast?.length ? show.cast.join(', ') : '—';
  return `
    <dl class="al-watch-more-facts">
      ${fact('Seasons', seasons)}
      ${fact('Episodes', episodes)}
      ${fact('Genre', genres)}
      ${fact('Creator', show.creator || '—')}
      ${fact('Cast', cast)}
      ${fact('Status', show.status || '—')}
    </dl>
    <section class="al-log-detail-overview-wrap">
      <h4 class="al-log-detail-subhead">Overview</h4>
      ${show.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(show.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
    </section>
  `;
}

function moreHtml(watch, state) {
  const notes = watch.notes
    ? `<dl class="al-watch-more-facts">${fact('Notes', watch.notes)}</dl>`
    : '';
  return `<div class="al-watch-card-more">${notes}${showDetailsHtml(watch, state)}</div>`;
}

function viewCardHtml(watch, state) {
  const expanded = sameId(watch.id, state.expandedId);
  return `
    <div class="al-log-entry al-watch-grid-item${expanded ? ' is-expanded' : ''}" data-entry-id="${escapeHtml(watch.id)}" data-tv-id="${escapeHtml(watch.id)}">
      <article class="al-watch-card al-log-row--clickable${expanded ? ' is-expanded' : ''}" data-expand-row tabindex="0" aria-expanded="${expanded}" aria-label="Toggle details">
        <div class="al-watch-card-poster">
          ${posterHtml(watch, { size: 'w342', className: 'al-poster al-poster--grid', fluid: true })}
        </div>
        <h3 class="al-watch-card-title" title="${escapeHtml(watch.title)}">${escapeHtml(watch.title)}</h3>
        <dl class="al-watch-card-facts al-watch-card-facts--tv">
          ${fact('Date', shortDate(watch.watched_on))}
          ${fact('Episode', episodeLabel(watch))}
          <div class="al-watch-card-fact al-watch-card-fact--rating"><dt>Rating</dt><dd>${ratingStarsHtml(watch)}</dd></div>
        </dl>
        <div class="al-row-actions al-watchlist-card-actions">
          ${iconButton(`data-tv-edit="${escapeHtml(watch.id)}"`, 'Edit', 'edit')}
          ${iconButton(`data-tv-delete="${escapeHtml(watch.id)}"`, 'Delete', 'remove')}
        </div>
      </article>
      ${expanded ? moreHtml(watch, state) : ''}
    </div>
  `;
}

function editCardHtml(watch) {
  const ratingVal = watch.dnf ? 'dnf' : (watch.rating != null ? String(watch.rating) : '');
  return `
    <div class="al-log-entry al-watch-grid-item al-watch-grid-item--editing" data-entry-id="${escapeHtml(watch.id)}" data-tv-id="${escapeHtml(watch.id)}">
      <article class="al-watch-card-edit">
        <form class="al-tv-edit-form" data-tv-edit-form="${escapeHtml(watch.id)}">
          <div class="al-tv-add-row">
            <input class="al-input" name="title" type="text" value="${escapeHtml(watch.title)}" required />
            <input class="al-input al-tv-add-date" name="watched_on" type="date" value="${escapeHtml(watch.watched_on)}" required aria-label="Date watched" />
            <input class="al-input al-tv-add-season" name="season" type="number" min="1" placeholder="S" value="${watch.season ?? ''}" inputmode="numeric" aria-label="Season" />
            <input class="al-input al-tv-add-episode" name="episode" type="number" min="1" placeholder="E" value="${watch.episode ?? ''}" inputmode="numeric" aria-label="Episode" />
            <select class="al-select al-tv-add-rating" name="rating" aria-label="Rating">
              <option value="">Rating</option>
              <option value="5" ${ratingVal === '5' ? 'selected' : ''}>5★</option>
              <option value="4" ${ratingVal === '4' ? 'selected' : ''}>4★</option>
              <option value="3" ${ratingVal === '3' ? 'selected' : ''}>3★</option>
              <option value="2" ${ratingVal === '2' ? 'selected' : ''}>2★</option>
              <option value="1" ${ratingVal === '1' ? 'selected' : ''}>1★</option>
              <option value="dnf" ${ratingVal === 'dnf' ? 'selected' : ''}>DNF</option>
            </select>
            <button class="al-btn al-btn-primary" type="submit">Save</button>
            <button class="al-btn" type="button" data-tv-cancel="${escapeHtml(watch.id)}">Cancel</button>
          </div>
          <input type="hidden" name="tmdb_id" value="${watch.tmdb_id ?? ''}" />
        </form>
      </article>
    </div>
  `;
}

export function tvWatchListHtml(state) {
  const watches = state.watches || [];
  if (!watches.length) {
    return '<div class="al-empty">No shows logged yet. Add one above.</div>';
  }
  return `
    <div class="al-watch-grid">
      ${watches.map((watch) => (
        sameId(watch.id, state.watchedEditingId) ? editCardHtml(watch) : viewCardHtml(watch, state)
      )).join('')}
    </div>
  `;
}

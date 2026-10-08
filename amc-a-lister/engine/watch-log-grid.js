import { escapeHtml, money, posterHtml, shortDate } from './format.js';
import { renderWatchEditForm } from './watch-form.js';

const STAR_PATH = 'M12 2.7 14.7 8.2l6.1.9-4.4 4.3 1 6.1L12 16.6 6.6 19.5l1-6.1L3.2 9.1l6.1-.9L12 2.7z';

function starGlyph(kind) {
  return `<svg class="al-star-glyph is-${kind}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${STAR_PATH}"/></svg>`;
}

/** Nearest half-step from 0 to 5, as an integer count of half stars (0–10). */
export function ratingHalfSteps(rating) {
  if (rating == null || rating === '') return null;
  const n = Number(rating);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n * 2)));
}

export function ratingStarsHtml(watch) {
  if (watch?.dnf) {
    return '<span class="al-stars al-stars--dnf" role="img" aria-label="Did not finish">DNF</span>';
  }
  const halves = ratingHalfSteps(watch?.rating);
  if (halves == null) {
    const empty = Array.from({ length: 5 }, () => (
      `<span class="al-star is-empty">${starGlyph('outline')}</span>`
    )).join('');
    return `<span class="al-stars" role="img" aria-label="Not rated">${empty}</span>`;
  }
  const shown = halves / 2;
  const label = `Rated ${Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)} out of 5`;
  const stars = [];
  for (let i = 0; i < 5; i += 1) {
    const left = halves - i * 2;
    if (left >= 2) stars.push(`<span class="al-star is-full">${starGlyph('fill')}</span>`);
    else if (left === 1) stars.push(`<span class="al-star is-half">${starGlyph('outline')}${starGlyph('fill')}</span>`);
    else stars.push(`<span class="al-star is-empty">${starGlyph('outline')}</span>`);
  }
  return `<span class="al-stars" role="img" aria-label="${label}">${stars.join('')}</span>`;
}

function actionIcon(name) {
  const paths = {
    person: '<path d="M12 12.2a3.1 3.1 0 1 0-3.1-3.1 3.1 3.1 0 0 0 3.1 3.1z"/><path d="M5.5 19.4v-.6a4.2 4.2 0 0 1 4.2-4.2h4.6a4.2 4.2 0 0 1 4.2 4.2v.6"/>',
    edit: '<path d="M13.6 5.6 18.4 10.4"/><path d="M4.6 19.4 5.8 15 15 5.8a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L9 18.2l-4.4 1.2z"/>',
    remove: '<path d="M5.2 7.6h13.6"/><path d="M9.2 7.5V5.8h5.6v1.7"/><path d="M7.4 7.6l.8 11.2h7.6l.8-11.2"/><path d="M10.4 10.6v5.2M13.6 10.6v5.2"/>',
  };
  return `<svg class="al-watchlist-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function iconButton(attrs, label, icon) {
  const name = escapeHtml(label);
  return `<button type="button" class="al-link-btn al-watchlist-icon-btn" ${attrs} aria-label="${name}" title="${name}">${actionIcon(icon)}</button>`;
}

function theaterLabel(watch) {
  if (watch.in_theaters === false) return 'At home';
  return watch.location || '—';
}

function costLabel(watch) {
  if (watch.in_theaters === false) return '—';
  return money(watch.ticket_cents);
}

function withLabel(watch) {
  if (watch.in_theaters === false) return '—';
  const names = (watch.companions || []).map((c) => c.username).filter(Boolean);
  if (names.length) return names.join(', ');
  if (watch.saw_alone) return 'Alone';
  return '—';
}

function fact(label, value) {
  return `<div class="al-watch-card-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function screeningMoreHtml(watch) {
  const format = watch.in_theaters === false ? '—' : (watch.format || 'Standard');
  const seat = watch.in_theaters === false
    ? '—'
    : ([watch.auditorium, watch.seat].filter(Boolean).join(' · ') || '—');
  const notes = watch.notes
    ? fact('Notes', watch.notes)
    : '';
  return `
    <dl class="al-watch-more-facts">
      ${fact('Format', format)}
      ${fact('Seat', seat)}
      ${fact('With', withLabel(watch))}
      ${notes}
    </dl>
  `;
}

function movieDetailsHtml(watch, state) {
  if (!watch.tmdb_id) {
    return '<p class="al-muted al-watch-more-note">No TMDB match for this title. Use Edit and pick the movie from search to load details.</p>';
  }
  if (state.detailsLoading === watch.id) {
    return '<p class="al-muted al-watch-more-note">Loading movie details…</p>';
  }
  if (state.detailsError && state.expandedId === watch.id) {
    return `<p class="al-error al-watch-more-note">${escapeHtml(state.detailsError)}</p>`;
  }
  const movie = state.detailsCache?.get(watch.id);
  if (!movie) {
    return '<p class="al-muted al-watch-more-note">Loading movie details…</p>';
  }
  const genres = movie.genres?.length ? movie.genres.join(', ') : '—';
  const runtime = movie.runtime_min ? `${movie.runtime_min} min` : '—';
  const director = movie.director || '—';
  const cast = movie.cast?.length ? movie.cast.join(', ') : '—';
  return `
    <dl class="al-watch-more-facts">
      ${fact('Runtime', runtime)}
      ${fact('Genre', genres)}
      ${fact('Director', director)}
      ${fact('Cast', cast)}
    </dl>
    <section class="al-log-detail-overview-wrap">
      <h4 class="al-log-detail-subhead">Overview</h4>
      ${movie.overview
    ? `<p class="al-log-detail-overview">${escapeHtml(movie.overview)}</p>`
    : '<p class="al-muted">No overview available.</p>'}
    </section>
  `;
}

function addViewerFormHtml(watch) {
  return `
    <div class="al-add-viewer" data-add-viewer-panel="${watch.id}">
      <form class="al-add-viewer-form" data-add-viewer-form="${watch.id}">
        <label class="al-add-viewer-label" for="add-viewer-${watch.id}">
          Add someone to <strong>${escapeHtml(watch.title)}</strong>
          at ${escapeHtml(watch.location || 'this theater')}
        </label>
        <div class="al-add-viewer-row">
          <div class="al-search-wrap al-add-viewer-search">
            <input class="al-input" id="add-viewer-${watch.id}" name="username" type="text"
                   placeholder="Search username…" autocomplete="off" required maxlength="24" />
            <div class="al-search-results" id="add-viewer-results-${watch.id}" hidden></div>
          </div>
          <button class="al-btn al-btn-primary" type="submit">Send</button>
          <button class="al-btn" type="button" data-cancel-add-viewer>Cancel</button>
        </div>
        <p class="al-muted al-add-viewer-hint">
          If they already logged the same movie on ${shortDate(watch.watched_on)},
          both entries are tagged as watched together (no duplicate). Otherwise they
          get an invite with movie, theater, and ticket cost (${money(watch.ticket_cents)})
          to accept or deny.
        </p>
      </form>
    </div>
  `;
}

function viewCardHtml(watch, state) {
  const expanded = watch.id === state.expandedId;
  const adding = watch.id === state.addingId;
  const canAdd = watch.in_theaters !== false;
  const more = expanded || adding
    ? `<div class="al-watch-card-more">${adding ? addViewerFormHtml(watch) : `${screeningMoreHtml(watch)}${movieDetailsHtml(watch, state)}`}</div>`
    : '';
  return `
    <div class="al-log-entry al-watch-grid-item${expanded ? ' is-expanded' : ''}${adding ? ' is-adding' : ''}" data-entry-id="${watch.id}">
      <article class="al-watch-card al-log-row--clickable${expanded ? ' is-expanded' : ''}" data-expand-row tabindex="0" aria-expanded="${expanded}" aria-label="Toggle details">
        <div class="al-watch-card-poster">
          ${posterHtml(watch, { size: 'w342', className: 'al-poster al-poster--grid', fluid: true })}
        </div>
        <h3 class="al-watch-card-title" title="${escapeHtml(watch.title)}">${escapeHtml(watch.title)}</h3>
        <dl class="al-watch-card-facts">
          ${fact('Date', shortDate(watch.watched_on))}
          ${fact('Theater', theaterLabel(watch))}
          ${fact('Cost', costLabel(watch))}
          <div class="al-watch-card-fact al-watch-card-fact--rating"><dt>Rating</dt><dd>${ratingStarsHtml(watch)}</dd></div>
        </dl>
        <div class="al-row-actions al-watchlist-card-actions">
          ${canAdd ? iconButton(`data-add-viewer="${watch.id}"`, 'Add someone', 'person') : ''}
          ${iconButton(`data-edit="${watch.id}"`, 'Edit', 'edit')}
          ${iconButton(`data-delete="${watch.id}"`, 'Delete', 'remove')}
        </div>
      </article>
      ${more}
    </div>
  `;
}

function editCardHtml(watch) {
  return `
    <div class="al-log-entry al-watch-grid-item al-watch-grid-item--editing" data-entry-id="${watch.id}">
      <article class="al-watch-card-edit" data-id="${watch.id}">
        ${renderWatchEditForm(watch, `edit-${watch.id}`)}
      </article>
    </div>
  `;
}

export function watchLogListHtml(state) {
  const filtered = state.filtered || [];
  if (!state.watches?.length) {
    return `
      <div class="al-empty al-empty--first-run">
        <p><strong>No screenings yet.</strong></p>
        <p class="al-muted">
          Use the bar above to log one — a title and a date is enough, and the
          rest of the fields appear once you start typing.
        </p>
        <p class="al-muted">
          Already have a spreadsheet? <a href="/amc-a-lister/settings.html">Import it from Settings</a>.
        </p>
      </div>
    `;
  }
  if (!filtered.length) return '<div class="al-empty">No matches.</div>';
  return `
    <div class="al-watch-grid">
      ${filtered.map((watch) => (
        watch.id === state.editingId ? editCardHtml(watch) : viewCardHtml(watch, state)
      )).join('')}
    </div>
  `;
}

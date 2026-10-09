/**
 * Watched TV poster grid: date, episode, and stars on the card.
 * Run: node scripts/test-alist-tv-watch-grid.mjs
 */
import { readFileSync } from 'node:fs';
import { episodeLabel, tvWatchListHtml } from '../amc-a-lister/engine/tv-watch-grid.js';
import { shortDate } from '../amc-a-lister/engine/format.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  }
}

const show = {
  id: 'tv1',
  title: 'The Pitt',
  watched_on: '2026-04-02',
  season: 1,
  episode: 8,
  rating: 4.5,
  dnf: false,
  notes: 'Night shift',
  tmdb_id: 42,
  poster_path: '/pitt.jpg',
};

function state(extra = {}) {
  return {
    watches: [show],
    watchedEditingId: null,
    expandedId: null,
    detailsCache: new Map(),
    detailsLoading: null,
    detailsError: null,
    ...extra,
  };
}

function article(html) {
  const start = html.indexOf('<article');
  const end = html.indexOf('</article>');
  return html.slice(start, end);
}

assert(episodeLabel(show) === 'S1E8', 'season and episode read as S#E#');
assert(episodeLabel({ season: 2, episode: null }) === 'Season 2', 'a season without an episode names the season');
assert(episodeLabel({ season: null, episode: null }) === '—', 'a show with no episode mark uses a dash');

const collapsed = tvWatchListHtml(state());
assert(collapsed.includes('class="al-watch-grid"'), 'watched TV is the same poster grid');
assert(!collapsed.includes('al-log-head'), 'the watched grid has no table header');
assert(!collapsed.includes('al-log-list'), 'watched TV no longer uses the table list');
assert(!collapsed.includes('al-log-row--tv'), 'watched cards are not table rows');
const card = article(collapsed);
assert(card.includes('data-expand-row'), 'the poster card toggles details');
assert(card.includes('aria-label="Toggle details"'), 'the card keeps the expand label');
assert(card.includes(shortDate('2026-04-02')), 'the card shows the date watched');
assert(card.includes('<dt>Episode</dt><dd>S1E8</dd>'), 'the card shows the episode');
assert(card.includes('aria-label="Rated 4.5 out of 5"'), 'the card shows the star rating');
assert(card.includes('al-star is-half'), 'a half rating draws a half star');
assert(!card.includes('<dt>Notes</dt>'), 'notes stay off the card until it opens');
assert(!card.includes('<dt>Seasons</dt>'), 'show details stay off the card until it opens');
assert(card.includes('aria-label="Edit"'), 'edit stays an icon button');
assert(card.includes('aria-label="Delete"'), 'delete stays an icon button');
assert(card.includes('data-tv-edit="tv1"'), 'edit keeps the watched-row action');
assert(card.includes('data-tv-delete="tv1"'), 'delete keeps the watched-row action');
assert(card.includes('al-watchlist-icon-btn'), 'watched actions use the tight icon buttons');
assert(!card.includes('data-add-viewer'), 'watched TV does not offer add-someone');
assert(!collapsed.includes('al-watch-card-more'), 'a closed card does not render the extra details');

const seasonOnly = { ...show, id: 'season', episode: null, rating: null, dnf: false, notes: '' };
const seasonHtml = article(tvWatchListHtml({ ...state(), watches: [seasonOnly] }));
assert(seasonHtml.includes('<dt>Episode</dt><dd>Season 1</dd>'), 'a season without an episode is the episode fact');
assert(seasonHtml.includes('aria-label="Not rated"'), 'a missing rating shows empty stars');

const dnf = { ...show, id: 'dnf', dnf: true, rating: null };
const dnfHtml = article(tvWatchListHtml({ ...state(), watches: [dnf] }));
assert(dnfHtml.includes('Did not finish') && !dnfHtml.includes('al-star is-'), 'DNF replaces the stars');

const expanded = tvWatchListHtml(state({
  expandedId: 'tv1',
  detailsCache: new Map([['tv1', {
    title: 'The Pitt',
    year: 2025,
    number_of_seasons: 1,
    number_of_episodes: 15,
    genres: ['Drama'],
    creator: 'R. Scott Gemmill',
    cast: ['Noah Wyle'],
    status: 'Returning Series',
    overview: 'One shift in a Pittsburgh ER.',
  }]]),
}));
assert(expanded.includes('is-expanded'), 'opening a card marks it expanded');
const openCard = article(expanded);
assert(!openCard.includes('<dt>Notes</dt>'), 'opening does not move notes onto the poster face');
assert(expanded.includes('<dt>Notes</dt><dd>Night shift</dd>'), 'the open card shows notes');
assert(expanded.includes('<dt>Seasons</dt><dd>1 season</dd>'), 'the open card shows season count');
assert(expanded.includes('<dt>Episodes</dt><dd>15 episodes</dd>'), 'the open card shows episode count');
assert(expanded.includes('<dt>Creator</dt><dd>R. Scott Gemmill</dd>'), 'the open card shows the creator');
assert(expanded.includes('One shift in a Pittsburgh ER.'), 'the open card shows the overview');
assert(expanded.includes('al-watch-card-more'), 'details open inside the same grid card');
const more = expanded.slice(expanded.indexOf('al-watch-card-more'));
assert(!more.includes('al-poster'), 'the open details do not repeat the poster');

const manySeasons = tvWatchListHtml(state({
  expandedId: 'tv1',
  detailsCache: new Map([['tv1', { number_of_seasons: 3, number_of_episodes: 22, genres: [], cast: [] }]]),
}));
assert(manySeasons.includes('<dt>Seasons</dt><dd>3 seasons</dd>'), 'more than one season is plural');

const unmatched = { ...show, id: 'plain', tmdb_id: null, notes: '' };
const plain = tvWatchListHtml({
  ...state(),
  watches: [unmatched],
  expandedId: 'plain',
});
assert(plain.includes('No TMDB match'), 'a title without a match still opens');
assert(!plain.includes('<dt>Notes</dt>'), 'an entry without notes does not invent a notes row');

const loading = tvWatchListHtml(state({ expandedId: 'tv1', detailsLoading: 'tv1' }));
assert(loading.includes('Loading show details'), 'an open card waits for show details');

const errored = tvWatchListHtml(state({ expandedId: 'tv1', detailsError: 'Could not load show details.' }));
assert(errored.includes('Could not load show details.'), 'a failed detail load stays on the card');

const editing = tvWatchListHtml(state({ watchedEditingId: 'tv1' }));
assert(editing.includes('al-watch-grid-item--editing'), 'edit spans the grid');
assert(editing.includes('data-tv-edit-form="tv1"'), 'edit keeps the watched form');
assert(editing.includes('data-tv-cancel="tv1"'), 'edit can cancel');
assert(editing.includes('value="4.5"') === false, 'a half rating is not forced into the integer dropdown');
assert(editing.includes('>Save<'), 'edit still saves');
assert(!editing.includes('data-expand-row'), 'the edit form is not an expandable poster');

const dnfEdit = tvWatchListHtml(state({
  watchedEditingId: 'dnf',
  watches: [dnf],
}));
assert(dnfEdit.includes('value="dnf" selected'), 'edit keeps a did-not-finish rating');

assert(tvWatchListHtml({ watches: [] }).includes('No shows logged yet'), 'an empty watched list keeps its note');

const css = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
const gridCss = css.slice(css.indexOf('/* Watch log:'), css.indexOf('.al-tv-airing-segment'));
assert(gridCss.includes('.al-watch-card-facts--tv'), 'episode labels get room on the TV card');
assert(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(gridCss.slice(0, gridCss.indexOf('@media (min-width: 768px)'))), 'phones show watched TV two across');

const tvSource = readFileSync(new URL('../amc-a-lister/engine/tv.js', import.meta.url), 'utf8');
assert(tvSource.includes('tvWatchListHtml'), 'the TV page renders the poster grid');
assert(!tvSource.includes('al-log-list--tv'), 'the TV page no longer builds the watched table');
assert(tvSource.includes('loadTvWatchDetails'), 'opening a card loads show details');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

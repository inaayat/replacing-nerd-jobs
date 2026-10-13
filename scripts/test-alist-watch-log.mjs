/**
 * Watch log poster grid: key facts on the card, the rest opens in place.
 * Run: node scripts/test-alist-watch-log.mjs
 */
import { readFileSync } from 'node:fs';
import {
  watchLogListHtml,
  ratingStarsHtml,
  ratingHalfSteps,
  watchVtName,
  castChipsHtml,
} from '../amc-a-lister/engine/watch-log-grid.js';
import { money, shortDate } from '../amc-a-lister/engine/format.js';
import {
  memberProfilePage,
  memberProfileUrl,
  flipMemberPage,
  memberPageIndex,
  memberPageLabel,
} from '../amc-a-lister/engine/member-pages.js';

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

const screening = {
  id: 'w1',
  title: 'The Brutalist',
  watched_on: '2026-03-14',
  location: 'Lincoln Square',
  format: 'IMAX',
  auditorium: '5',
  seat: 'F12',
  ticket_cents: 1250,
  rating: 4.5,
  dnf: false,
  in_theaters: true,
  notes: 'Front row',
  companions: [{ username: 'sam' }],
  tmdb_id: 99,
  poster_path: '/poster.jpg',
};

function state(extra = {}) {
  return {
    watches: [screening],
    filtered: [screening],
    editingId: null,
    expandedId: null,
    addingId: null,
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

assert(ratingHalfSteps(4.5) === 9, '4.5 is nine half-steps');
assert(ratingHalfSteps(5) === 10, '5 is ten half-steps');
assert(ratingHalfSteps(0.5) === 1, '0.5 is one half-step');
assert(ratingHalfSteps(4.499) === 9, 'a near 4.5 still draws a half star');
assert(ratingHalfSteps(null) == null, 'a missing rating has no half-steps');

function starCounts(html) {
  return {
    full: (html.match(/al-star is-full/g) || []).length,
    half: (html.match(/al-star is-half/g) || []).length,
    empty: (html.match(/al-star is-empty/g) || []).length,
  };
}

const fourHalf = ratingStarsHtml({ rating: 4.5 });
assert(starCounts(fourHalf).full === 4 && starCounts(fourHalf).half === 1 && starCounts(fourHalf).empty === 0, '4.5 is four full stars and one half star');
assert(fourHalf.includes('aria-label="Rated 4.5 out of 5"'), '4.5 announces the half star');
assert(fourHalf.includes('clip-path') === false, 'the half star is marked up for CSS to clip');

const five = starCounts(ratingStarsHtml({ rating: 5 }));
assert(five.full === 5 && five.half === 0 && five.empty === 0, '5 is five full stars');

const half = starCounts(ratingStarsHtml({ rating: 0.5 }));
assert(half.full === 0 && half.half === 1 && half.empty === 4, '0.5 is one half star and four empty stars');

const three = starCounts(ratingStarsHtml({ rating: 3 }));
assert(three.full === 3 && three.half === 0 && three.empty === 2, '3 leaves two empty stars');

const unrated = ratingStarsHtml({ rating: null });
assert(unrated.includes('aria-label="Not rated"'), 'an unrated screening says so');
assert(starCounts(unrated).empty === 5 && starCounts(unrated).full === 0, 'unrated shows five empty stars');

const dnf = ratingStarsHtml({ dnf: true, rating: 4 });
assert(dnf.includes('Did not finish') && !dnf.includes('al-star is-'), 'DNF replaces the stars');

const collapsed = watchLogListHtml(state());
assert(collapsed.includes('class="al-watch-grid"'), 'the watch log is a poster grid');
assert(!collapsed.includes('al-log-head'), 'the watch log grid has no table header');
assert(!collapsed.includes('al-log-list"'), 'the watch log no longer uses the table list');
const card = article(collapsed);
assert(card.includes('data-expand-row'), 'the poster card toggles details');
assert(card.includes('aria-label="Toggle details"'), 'the card keeps the expand label');
assert(card.includes(shortDate('2026-03-14')), 'the card shows the screening date');
assert(card.includes('<dt>Theater</dt><dd>Lincoln Square</dd>'), 'the card shows the theater');
assert(card.includes(`<dt>Cost</dt><dd>${money(1250)}</dd>`), 'the card shows the ticket cost');
assert(card.includes('aria-label="Rated 4.5 out of 5"'), 'the card shows the star rating');
assert(card.includes('al-star is-half'), 'the card draws the half star');
assert(!card.includes('<dt>Format</dt>'), 'format stays off the card until it opens');
assert(!card.includes('<dt>Seat</dt>'), 'seat stays off the card until it opens');
assert(!card.includes('>sam<'), 'companions stay off the card until it opens');
assert(card.includes('aria-label="Add someone"'), 'add is a person icon with a name');
assert(card.includes('a3.1 3.1'), 'add uses the person glyph');
assert(card.includes('aria-label="Edit"'), 'edit stays an icon button');
assert(card.includes('aria-label="Delete"'), 'delete stays an icon button');
assert(card.includes('al-watchlist-icon-btn'), 'watch log actions use the tight icon buttons');
assert(!collapsed.includes('al-watch-card-more'), 'a closed card does not render the extra details');

const home = {
  ...screening,
  id: 'home',
  in_theaters: false,
  location: null,
  ticket_cents: null,
  format: null,
  rating: null,
  dnf: false,
  companions: [],
};
const homeHtml = article(watchLogListHtml({ ...state(), watches: [home], filtered: [home] }));
assert(homeHtml.includes('<dt>Theater</dt><dd>At home</dd>'), 'a home screening says At home');
assert(homeHtml.includes('<dt>Cost</dt><dd>—</dd>'), 'a home screening has no ticket cost');
assert(!homeHtml.includes('data-add-viewer'), 'home screenings do not offer add-someone');
assert(homeHtml.includes('aria-label="Not rated"'), 'a home screening can be unrated');

const expanded = watchLogListHtml(state({
  expandedId: 'w1',
  detailsCache: new Map([['w1', {
    title: 'The Brutalist',
    runtime_min: 215,
    genres: ['Drama'],
    director: 'Brady Corbet',
    cast: ['Adrien Brody'],
    overview: 'A long concrete movie.',
  }]]),
}));
assert(expanded.includes('is-expanded'), 'opening a card marks it expanded');
assert((expanded.match(/is-expanded/g) || []).length >= 2, 'the entry and the card both mark the open state');
const openCard = article(expanded);
assert(!openCard.includes('<dt>Format</dt>'), 'opening does not move format onto the poster face');
assert(expanded.includes('<dt>Format</dt><dd>IMAX</dd>'), 'the open card shows format');
assert(expanded.includes('<dt>Seat</dt><dd>5 · F12</dd>'), 'the open card shows auditorium and seat');
assert(expanded.includes('<dt>With</dt><dd>sam</dd>'), 'the open card shows who you went with');
assert(expanded.includes('<dt>Notes</dt><dd>Front row</dd>'), 'the open card shows notes');
assert(expanded.includes('215 min'), 'the open card shows runtime');
assert(expanded.includes('A long concrete movie.'), 'the open card shows the overview');
assert(expanded.includes('al-watch-card-more'), 'details open inside the same grid card');
assert(expanded.includes('al-watch-detail-groups'), 'open details split screening and film');
assert(expanded.includes('>Screening<'), 'screening facts are grouped');
assert(expanded.includes('>Film<'), 'film facts are grouped');
assert(expanded.includes('al-watch-cast-chip'), 'cast is a set of chips');
assert(expanded.includes('Adrien Brody'), 'cast chips keep the names');
assert(expanded.includes('data-collapse-card'), 'the open card has a close control');
assert(expanded.includes('aria-label="Close details"'), 'close is named for assistive tech');
assert(expanded.includes('aria-label="Add someone"'), 'actions stay on the open card');
assert(expanded.includes(`view-transition-name:${watchVtName('w1')}`), 'cards have a view-transition name for FLIP');
assert(expanded.includes('grid-column') === false, 'span is CSS, not inline');
const more = expanded.slice(expanded.indexOf('al-watch-card-more'));
assert(!more.includes('al-poster'), 'the open details do not repeat the poster');
assert(castChipsHtml(['A', 'B']).includes('al-watch-cast-chip'), 'castChipsHtml paints chips');
assert(watchVtName('a b/c') === 'wa_b_c', 'view-transition names strip unsafe characters');

const adding = watchLogListHtml(state({ addingId: 'w1' }));
assert(adding.includes('data-add-viewer-form="w1"'), 'the person icon opens the add-someone form on the card');
assert(adding.includes('is-adding'), 'the card marks the add form open');
assert(!adding.includes('<dt>Format</dt>'), 'the add form replaces the detail panel');

const editing = watchLogListHtml(state({ editingId: 'w1' }));
assert(editing.includes('al-watch-grid-item--editing'), 'edit spans the grid');
assert(editing.includes('data-watch-edit="w1"'), 'edit keeps the screening form');

const alone = {
  ...screening,
  id: 'alone',
  companions: [],
  saw_alone: true,
  notes: '',
  tmdb_id: null,
};
const aloneHtml = watchLogListHtml({
  ...state(),
  watches: [alone],
  filtered: [alone],
  expandedId: 'alone',
});
assert(aloneHtml.includes('<dt>With</dt><dd>Alone</dd>'), 'saw alone reads as Alone once opened');
assert(aloneHtml.includes('No TMDB match'), 'a title without a match still opens');

assert(watchLogListHtml({ watches: [], filtered: [] }).includes('No screenings yet'), 'an empty log keeps the first-run note');
assert(watchLogListHtml({ watches: [screening], filtered: [] }).includes('No matches'), 'a filtered-out log says no matches');

const css = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
const gridCss = css.slice(css.indexOf('/* Watch log:'), css.indexOf('.al-tv-airing-segment'));
const phoneCss = gridCss.slice(0, gridCss.indexOf('@media (min-width: 768px)'));
assert(/repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(phoneCss), 'phones show the watch log two across');
assert(gridCss.includes('repeat(auto-fill, minmax(180px, 1fr))'), 'wider screens fill the watch log row');
assert(phoneCss.includes('clip-path: inset(0 50% 0 0)'), 'half stars clip the filled glyph');
assert(phoneCss.includes('.al-watch-card-more'), 'opened details stay attached to the card');
assert(gridCss.includes('grid-column: 1 / -1'), 'an open card spans the full grid row');
assert(gridCss.includes('al-watch-detail-groups'), 'the open card uses a two-group detail layout');
assert(gridCss.includes('prefers-reduced-motion'), 'the expand animation respects reduced motion');
assert(gridCss.includes('al-watch-cast-chip'), 'cast chips are styled');

const logSource = readFileSync(new URL('../amc-a-lister/engine/log.js', import.meta.url), 'utf8');
assert(logSource.includes('watchLogListHtml'), 'the watch log page renders the poster grid');
assert(logSource.includes('withWatchGridTransition'), 'expand and collapse animate through the grid');
assert(logSource.includes('data-collapse-card'), 'the close control is wired');

const readonlyCollapsed = watchLogListHtml(state(), { readonly: true });
assert(readonlyCollapsed.includes('class="al-watch-grid al-watch-grid--readonly"'), 'public logs use the readonly poster grid');
assert(!readonlyCollapsed.includes('aria-label="Edit"'), 'readonly cards hide edit');
assert(!readonlyCollapsed.includes('aria-label="Delete"'), 'readonly cards hide delete');
assert(!readonlyCollapsed.includes('aria-label="Add someone"'), 'readonly cards hide add-someone');
assert(!readonlyCollapsed.includes('Want to watch'), 'a public log hides want-to-watch until the viewer can save');
assert(readonlyCollapsed.includes('data-expand-row'), 'readonly cards still expand');

const saveHtml = watchLogListHtml(state(), { readonly: true, saveWatchlist: true, isSaved: () => false });
assert(saveHtml.includes('aria-label="Want to watch"'), 'another member’s log can save a film to want to watch');
assert(saveHtml.includes('data-save-watchlist'), 'the save control is marked for the profile page');
assert(!saveHtml.includes('aria-label="Edit"'), 'saving from a profile does not expose edit');
const savedHtml = watchLogListHtml(state(), { readonly: true, saveWatchlist: true, isSaved: () => true });
assert(savedHtml.includes('aria-label="On your list"'), 'a film already on the list is labeled that way');
assert(savedHtml.includes('disabled'), 'a film already on the list cannot be added again');
const posterChunk = saveHtml.slice(saveHtml.indexOf('al-watch-card-poster'), saveHtml.indexOf('al-watch-card-title'));
assert(posterChunk.includes('al-poster-save'), 'want to watch is an overlay on the poster');
assert(!saveHtml.slice(saveHtml.indexOf('al-watch-card-title')).includes('data-save-watchlist'), 'the poster overlay is the only save control');

const readonlyExpanded = watchLogListHtml(state({
  expandedId: 'w1',
  detailsCache: new Map([['w1', {
    title: 'The Brutalist',
    runtime_min: 215,
    genres: ['Drama'],
    director: 'Brady Corbet',
    cast: ['Adrien Brody'],
    overview: 'A long concrete movie.',
  }]]),
}), { readonly: true });
assert(readonlyExpanded.includes('data-collapse-card'), 'readonly open cards can close');
assert(readonlyExpanded.includes('A long concrete movie.'), 'readonly open cards still show the overview');
assert(!readonlyExpanded.includes('aria-label="Edit"'), 'readonly open cards keep edit hidden');

assert(
  watchLogListHtml({ watches: [], filtered: [] }, { readonly: true }).includes('No screenings logged yet'),
  'an empty public log uses a short empty note',
);

const aloneReadonly = watchLogListHtml({
  ...state(),
  watches: [alone],
  filtered: [alone],
  expandedId: 'alone',
}, { readonly: true });
assert(aloneReadonly.includes('No TMDB match for this title.'), 'readonly TMDB miss skips the Edit hint');
assert(!aloneReadonly.includes('Use Edit'), 'readonly TMDB miss does not mention Edit');

const memberSource = readFileSync(new URL('../amc-a-lister/engine/member.js', import.meta.url), 'utf8');
assert(memberSource.includes('watchLogListHtml'), 'member profiles render the poster grid');
assert(memberSource.includes('readonly: true'), 'member profiles render the grid read-only');
assert(memberSource.includes('withWatchGridTransition'), 'member profiles animate expand like the log');
assert(!memberSource.includes('al-log-list--readonly'), 'member profiles no longer use the table list');
assert(memberSource.includes('al-member-book'), 'member rank and log live in a page book');
assert(memberSource.includes('data-member-page="rank"'), 'Rank is a flip page');
assert(memberSource.includes('data-member-page="log"'), 'Log is a flip page');
assert(memberSource.includes('data-member-flip="next"'), 'the book has a next-page control');
assert(memberSource.includes('data-member-flip="prev"'), 'the book has a previous-page control');
assert(css.includes('.al-member-book'), 'member book layout is styled');
assert(css.includes('al-member-page-in-next'), 'flipping forward animates the incoming page');
assert(css.includes('al-member-page-out-prev'), 'flipping back animates the outgoing page');

assert(memberProfilePage('') === 'log', 'a profile URL with no page opens the watch log');
assert(memberProfilePage('user=abc') === 'log', 'user-only query opens the watch log');
assert(memberProfilePage('?user=abc&page=rank') === 'rank', 'page=rank opens the rank page');
assert(memberProfilePage('page=nope') === 'log', 'an unknown page falls back to the log');
assert(memberProfileUrl('abc', 'log') === '/amc-a-lister/member.html?user=abc', 'log URLs omit the page param');
assert(memberProfileUrl('abc', 'rank').includes('page=rank'), 'rank URLs keep page=rank');
assert(flipMemberPage('log', 'prev') === 'rank', 'previous from the log is rank');
assert(flipMemberPage('rank', 'next') === 'log', 'next from rank is the log');
assert(flipMemberPage('log', 'next') === 'rank', 'two pages wrap');
assert(memberPageIndex('rank') === 1 && memberPageIndex('log') === 2, 'folio is 1/2 then 2/2');
assert(memberPageLabel('rank') === 'Rank' && memberPageLabel('log') === 'Log', 'page labels');

const apiSource = readFileSync(new URL('../api/alist.js', import.meta.url), 'utf8');
const movieDetailsFn = apiSource.slice(
  apiSource.indexOf('async function handleMovieDetails'),
  apiSource.indexOf('async function handleMovieLookup'),
);
assert(
  movieDetailsFn.includes('Public member profiles'),
  'movie details stay available without a session for public profile expands',
);
assert(
  !movieDetailsFn.includes('Not signed in'),
  'movie details no longer 401 anonymous viewers',
);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/**
 * Letterboxd RSS → A-Lister watch drafts (browser + API).
 * Keep this file dependency-free — imported by the client and by api/alist.js.
 *
 * Letterboxd sends no CORS header on /<user>/rss/, so the server fetches the
 * feed; everything that interprets it lives here so it can be tested offline.
 */

const USERNAME_RE = /^[a-z0-9_]{1,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POSTER_HOST = /^https:\/\/a\.ltrbxd\.com\//;
const AUTO_WATCH_NOTE = /^Watched on \w+,? \w+ \d{1,2},? \d{4}\.?$/i;

/** Days either side of a Letterboxd date that still count as the same screening. */
export const SAME_WATCH_WINDOW_DAYS = 1;

/** Re-fetch the feed at most this often unless the user asks. */
export const LETTERBOXD_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Accepts `name`, `@name`, or a pasted profile/RSS URL.
 * @returns {{ username: string|null } | { error: string }}
 */
export function normalizeLetterboxdUsername(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { username: null };
  const fromUrl = s.match(/letterboxd\.com\/([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, '').toLowerCase();
  if (!USERNAME_RE.test(s)) {
    return { error: 'Letterboxd usernames are letters, numbers and underscores.' };
  }
  return { username: s };
}

export function letterboxdRssUrl(username) {
  return `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
}

export function letterboxdProfileUrl(username) {
  return `https://letterboxd.com/${encodeURIComponent(username)}/`;
}

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, code) => {
    const c = code.toLowerCase();
    if (c === 'amp') return '&';
    if (c === 'lt') return '<';
    if (c === 'gt') return '>';
    if (c === 'quot') return '"';
    if (c === 'apos') return "'";
    if (c === 'nbsp') return ' ';
    const n = c.startsWith('#x') ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

function unwrapCdata(s) {
  const m = String(s).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : null;
}

function tagText(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`));
  if (!m) return null;
  const cdata = unwrapCdata(m[1]);
  return cdata != null ? cdata : decodeEntities(m[1]).trim();
}

/** The review paragraph(s) without the poster image or Letterboxd's auto "Watched on …" line. */
export function reviewFromDescription(html) {
  const text = decodeEntities(
    String(html ?? '')
      .replace(/<img\b[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text || AUTO_WATCH_NOTE.test(text)) return null;
  return text;
}

function posterFromDescription(html) {
  const m = String(html ?? '').match(/<img\b[^>]*\bsrc="([^"]+)"/i);
  const url = m ? decodeEntities(m[1]) : null;
  return url && POSTER_HOST.test(url) ? url : null;
}

/**
 * Letterboxd allows ½★; the A-Lister rating column starts at 1★.
 * Returns the rating a draft should start with (still editable).
 */
export function alistRatingFromLetterboxd(rating) {
  if (rating == null || !Number.isFinite(Number(rating))) return null;
  const n = Number(rating);
  if (n <= 0) return null;
  return Math.min(5, Math.max(1, Math.round(n * 2) / 2));
}

/**
 * Parse a Letterboxd member RSS feed. Only diary entries (items with a watched
 * date) are returned; list updates and anything without a film are dropped.
 */
export function parseLetterboxdRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(String(xml ?? '')))) {
    const block = m[1];
    const watchedOn = tagText(block, 'letterboxd:watchedDate');
    const title = tagText(block, 'letterboxd:filmTitle');
    const guid = tagText(block, 'guid');
    if (!guid || !title || !watchedOn || !ISO_DATE.test(watchedOn)) continue;

    const tmdbRaw = tagText(block, 'tmdb:movieId');
    const tmdbId = tmdbRaw && /^\d+$/.test(tmdbRaw) ? Number(tmdbRaw) : null;
    const yearRaw = tagText(block, 'letterboxd:filmYear');
    const ratingRaw = tagText(block, 'letterboxd:memberRating');
    const rating = ratingRaw != null && ratingRaw !== '' && Number.isFinite(Number(ratingRaw))
      ? Number(ratingRaw)
      : null;
    const description = tagText(block, 'description') || '';

    items.push({
      guid,
      title,
      film_year: yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null,
      tmdb_id: tmdbId,
      watched_on: watchedOn,
      rating,
      rewatch: tagText(block, 'letterboxd:rewatch') === 'Yes',
      liked: tagText(block, 'letterboxd:memberLike') === 'Yes',
      review: reviewFromDescription(description),
      poster_url: posterFromDescription(description),
      link: tagText(block, 'link'),
    });
  }
  return items;
}

function normalizeTitle(s) {
  return String(s || '').trim().toLowerCase();
}

function daysBetween(a, b) {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Same film: TMDB id when both sides have one, otherwise case-insensitive title. */
export function sameMovie(item, watch) {
  if (item?.tmdb_id != null && watch?.tmdb_id != null) {
    return Number(item.tmdb_id) === Number(watch.tmdb_id);
  }
  const t = normalizeTitle(item?.title);
  return Boolean(t && t === normalizeTitle(watch?.title));
}

/**
 * Decide what to do with one feed entry against the user's log.
 *
 * - `duplicate`: that screening is already logged (same film within ±1 day).
 * - `already-logged`: the film is in the log and Letterboxd does not call this a rewatch.
 * - `rewatch`: the film is in the log on another date and Letterboxd marks it a rewatch.
 * - `new`: nothing in the log yet.
 *
 * @returns {'new'|'rewatch'|'duplicate'|'already-logged'}
 */
export function classifyLetterboxdItem(item, watches = []) {
  const matches = watches.filter((w) => sameMovie(item, w));
  if (!matches.length) return 'new';
  const sameScreening = matches.some((w) => (
    w.watched_on && daysBetween(String(w.watched_on).slice(0, 10), item.watched_on) <= SAME_WATCH_WINDOW_DAYS
  ));
  if (sameScreening) return 'duplicate';
  return item.rewatch ? 'rewatch' : 'already-logged';
}

/** Statuses that keep an entry in the review inbox. */
export function isReviewable(classification) {
  return classification === 'new' || classification === 'rewatch';
}

/**
 * Starting values for the review form. Everything here is editable before it
 * is saved; `mode` is 'theater' or 'home'.
 */
export function draftWatchFromItem(item, { mode = 'home', includeReview = true } = {}) {
  const inTheaters = mode === 'theater';
  return {
    watched_on: item.watched_on,
    title: item.title,
    tmdb_id: item.tmdb_id ?? null,
    rating: alistRatingFromLetterboxd(item.rating),
    dnf: false,
    notes: includeReview && item.review ? item.review.slice(0, 2000) : null,
    in_theaters: inTheaters,
    location: inTheaters ? null : 'Not in theaters',
    format: '',
    ticket_cents: null,
    seen_with: [],
    saw_alone: inTheaters,
  };
}

/**
 * Default ticket price for a theater: the most recent price paid there,
 * otherwise the most recent theater price anywhere.
 */
export function defaultTicketCents(watches = [], theater = '') {
  const priced = watches
    .filter((w) => w.in_theaters !== false && w.ticket_cents != null && w.ticket_cents > 0)
    .sort((a, b) => String(b.watched_on).localeCompare(String(a.watched_on)));
  const name = normalizeTitle(theater);
  const atTheater = name ? priced.find((w) => normalizeTitle(w.location) === name) : null;
  return (atTheater || priced[0])?.ticket_cents ?? null;
}

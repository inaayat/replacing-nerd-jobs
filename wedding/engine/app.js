/**
 * Wedding board UI. Semantics live in ./model.js and ./routes.js.
 */
import {
  initAuth,
  wireAuthLink,
  refreshToken,
  renderWeddingSignIn,
} from './auth.js';
import { loadBoard, saveBoard, debounceSave, unfurlUrl } from './store.js';
import {
  defaultView,
  viewHash,
  parseViewHash,
  viewTitle,
  viewCopy,
  usesCollage,
} from './routes.js';
import {
  SUGGESTED_BUCKETS,
  emptyBoard,
  normalizeBoard,
  urlDomain,
  linkKind,
  linkKindLabel,
  extractPastedUrl,
  clipDisplayLabel,
  addBucket,
  renameBucket,
  removeBucket,
  moveBucket,
  addClip,
  updateClip,
  removeClip,
  toggleClipTag,
  toggleClipFavorite,
  setClipStatus,
  filterClips,
  homeSummary,
  inboxCount,
  bucketCount,
  bucketById,
  seedSuggestedBuckets,
  mediaPreview,
  previewHref,
  previewPresentation,
  previewPaint,
  clipNeedsUnfurl,
  clipHasVisual,
  CLIP_STATUSES,
  addTask,
  updateTask,
  removeTask,
  addDecision,
  updateDecision,
  removeDecision,
  tasksIn,
  taskById,
  decisionById,
} from './model.js';

const STORAGE_KEY = 'wedding:board';
const SORT_KEY = 'wedding-sort-v1';
const MEDIA_KEY = 'wedding-media-v1';
const root = document.getElementById('app-root');
const toastEl = document.getElementById('toast');
const statusEl = document.getElementById('wd-status');
const localMode = new URLSearchParams(location.search).has('local');

let auth = null;
let board = emptyBoard();
let view = defaultView();
let query = '';
let sort = readSort();
let mediaFilter = readMedia();
let composerExpanded = false;
let composerTags = new Set();
const previewTried = new Set();
let inspectId = null;

const persist = debounceSave(async (next, opts) => {
  if (localMode || !auth?.token) {
    writeLocal(next);
    setStatus('Saved on this device');
    return;
  }
  try {
    const data = await saveBoard(auth.token, next, opts);
    board = normalizeBoard(data.board);
    writeLocal(board);
    setStatus('Saved');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Could not save');
    showToast(err.message || 'Could not save');
  }
}, 650);

const PLAY_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="rgba(42,34,30,0.72)"/><path d="M11 8.5v11l9-5.5-9-5.5z" fill="#fbf6ef"/></svg>`;
const HEART_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.35-10.2-8.8C-1.1 8.6 1.6 4 6 4c2.4 0 3.9 1.4 4.8 2.6.9-1.2 2.4-2.6 4.8-2.6 4.4 0 7.1 4.6 4.2 8.2C19.5 16.65 12 21 12 21z" fill="currentColor"/></svg>`;

const RING_ART = `
<svg class="wd-gate-art" viewBox="0 0 120 92" width="132" height="101" role="img" aria-label="Two rings">
  <ellipse cx="60" cy="84" rx="34" ry="5" fill="#2a221e" opacity="0.07"/>
  <circle cx="46" cy="46" r="26" fill="none" stroke="#c97b7b" stroke-width="5"/>
  <circle cx="74" cy="46" r="26" fill="none" stroke="#b08d57" stroke-width="5"/>
  <circle cx="46" cy="46" r="26" fill="none" stroke="#2a221e" stroke-width="1.4" opacity="0.35"/>
  <circle cx="74" cy="46" r="26" fill="none" stroke="#2a221e" stroke-width="1.4" opacity="0.35"/>
</svg>`;

const STATUS_LABELS = {
  saved: 'Saved',
  shortlist: 'Shortlist',
  chosen: 'Chosen',
  archived: 'Archived',
};

function readSort() {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === 'oldest' || v === 'updated' || v === 'newest') return v;
  } catch { /* */ }
  return 'newest';
}

function readMedia() {
  try {
    const v = localStorage.getItem(MEDIA_KEY);
    if (v === 'visual' || v === 'notes' || v === 'all') return v;
  } catch { /* */ }
  return 'all';
}

function writeLocal(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* quota */ }
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeBoard(JSON.parse(raw));
  } catch {
    return null;
  }
}

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.hidden = !text;
}

function showToast(message, { undo } = {}) {
  if (!toastEl) return;
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = message;
  toastEl.appendChild(span);
  if (undo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wd-toast-undo';
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => {
      undo();
      toastEl.classList.remove('show');
    });
    toastEl.appendChild(btn);
  }
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 4200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tagIdsOnBoard() {
  return board.buckets.map((b) => b.id);
}

function syncView() {
  view = parseViewHash(location.hash, { tagIds: tagIdsOnBoard() });
}

function setHash(next) {
  const hash = viewHash(next);
  if (location.hash !== hash) history.replaceState(null, '', hash);
  view = next;
}

function commit(next, { instant = false } = {}) {
  board = normalizeBoard(next);
  writeLocal(board);
  render();
  persist(board);
  if (instant) persist.flush();
}

function filterViewArg() {
  if (view.kind === 'tag') return { kind: 'tag', id: view.id };
  if (view.kind === 'home' || view.kind === 'plan') return 'all';
  return view.kind;
}

function visibleClips() {
  return filterClips(board, {
    view: filterViewArg(),
    query,
    sort,
    media: mediaFilter,
  });
}

function playPreview(card, clip) {
  const wrap = card.querySelector('.wd-preview');
  if (!wrap) {
    if (clip.url) window.open(clip.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const media = mediaPreview(previewHref(clip)) || mediaPreview(clip.url);
  if (media?.kind === 'video' && clip.url) {
    wrap.innerHTML = `<video class="wd-preview-frame" src="${escapeHtml(clip.url)}" controls autoplay playsinline></video>`;
    return;
  }
  if (media?.embedUrl) {
    wrap.innerHTML = `<iframe class="wd-preview-frame" src="${escapeHtml(media.embedUrl)}" allow="encrypted-media; fullscreen; picture-in-picture; autoplay" allowfullscreen loading="lazy" title="Preview" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    return;
  }
  if (clip.url) window.open(clip.url, '_blank', 'noopener,noreferrer');
}

async function requestPreview(clip) {
  if (!clipNeedsUnfurl(clip)) return;
  if (localMode || !auth?.token) return;
  const key = `v2:${clip.id}:${clip.url}`;
  if (previewTried.has(key)) return;
  previewTried.add(key);
  try {
    const data = await unfurlUrl(auth.token, clip.url);
    const current = board.clips.find((row) => row.id === clip.id);
    if (!current || current.url !== clip.url) return;
    if (data?.thumbnail || data?.title || data?.canonical) {
      commit(updateClip(board, clip.id, { preview: data }));
    }
  } catch { /* embed still works */ }
}

function fillPreviews() {
  for (const clip of visibleClips()) requestPreview(clip);
}

function defaultComposerTags() {
  if (view.kind === 'tag') return new Set([view.id]);
  return new Set();
}

function tagPills({ selected, nav, act, includeInbox = false, multi = false }) {
  const selectedSet = selected instanceof Set ? selected : new Set(selected ? [selected] : []);
  const pill = (id, label, on, extra) => `
    <button type="button" class="wd-tag${on ? ' is-on' : ''}" ${extra} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
  const rows = [];
  if (includeInbox && !multi) {
    const on = selectedSet.has('inbox') || selectedSet.size === 0;
    const extra = nav ? `data-nav="inbox"` : `data-act="${act}" data-id="inbox"`;
    rows.push(pill('inbox', 'Inbox', on, extra));
  }
  for (const bucket of board.buckets) {
    const on = selectedSet.has(bucket.id);
    const extra = nav
      ? `data-nav="tag" data-id="${escapeHtml(bucket.id)}"`
      : `data-act="${act}" data-id="${escapeHtml(bucket.id)}"`;
    rows.push(pill(bucket.id, bucket.name, on, extra));
  }
  return rows.join('');
}

function newTagForm() {
  return `
    <form class="wd-new-tag" data-act="new-bucket">
      <input class="wd-tag-input" name="name" type="text" maxlength="48" placeholder="New tag" aria-label="New tag" autocomplete="off">
    </form>`;
}

function kindChip(url) {
  const kind = linkKind(url);
  if (!kind) return '';
  return `<span class="wd-kind wd-kind-${kind}">${escapeHtml(linkKindLabel(kind))}</span>`;
}

function previewBlock(clip) {
  const shown = previewPresentation(clip);
  const href = escapeHtml(clip.url);
  if (shown.mode === 'image') {
    return `<a class="wd-card-image" href="${href}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(shown.src)}" alt="" referrerpolicy="no-referrer" loading="lazy"></a>`;
  }
  if (shown.mode === 'embed' || (shown.mode === 'play' && shown.embedUrl && !shown.poster && shown.kind !== 'video')) {
    return `
      <div class="wd-preview wd-preview-still" data-kind="${escapeHtml(shown.kind)}">
        <iframe class="wd-preview-frame" src="${escapeHtml(shown.embedUrl)}" allow="encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Preview" referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>`;
  }
  if (shown.mode === 'placeholder') {
    return `<a class="wd-card-image" href="${href}" target="_blank" rel="noopener noreferrer"><span class="wd-preview-ph wd-kind-${escapeHtml(shown.kind)}">${escapeHtml(linkKindLabel(shown.kind))}</span></a>`;
  }
  if (shown.mode === 'play') {
    if (shown.kind === 'video') {
      return `
      <div class="wd-preview" data-kind="video">
        <button type="button" class="wd-preview-play" data-act="play" aria-label="Play video">
          <span class="wd-preview-ph">Video</span>
          <span class="wd-preview-btn">${PLAY_SVG}</span>
        </button>
      </div>`;
    }
    const poster = shown.poster
      ? `<img class="wd-preview-img" src="${escapeHtml(shown.poster)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
      : `<span class="wd-preview-ph wd-kind-${escapeHtml(shown.kind)}">${escapeHtml(linkKindLabel(shown.kind))}</span>`;
    return `
      <div class="wd-preview" data-kind="${escapeHtml(shown.kind)}">
        <button type="button" class="wd-preview-play" data-act="play" aria-label="Play preview">
          ${poster}
          <span class="wd-preview-btn">${PLAY_SVG}</span>
        </button>
      </div>`;
  }
  return '';
}

function collageShape(clip) {
  const shown = previewPresentation(clip);
  if (shown.kind === 'youtube' || shown.kind === 'video') return 'wide';
  if (shown.kind === 'tiktok' || shown.kind === 'instagram') return 'tall';
  let n = 0;
  for (const ch of String(clip.id || '')) n += ch.charCodeAt(0);
  return ['port', 'tall', 'sq'][n % 3];
}

function collageMedia(clip) {
  const painted = previewPaint(clip);
  const kind = painted.kind || 'link';
  if (painted.paint === 'image') {
    const img = `<img src="${escapeHtml(painted.src)}" alt="" referrerpolicy="no-referrer" loading="lazy">`;
    if (!painted.play) return img;
    return `<span class="wd-collage-play">${img}<span class="wd-preview-btn">${PLAY_SVG}</span></span>`;
  }
  if (painted.paint === 'embed') {
    return `<span class="wd-collage-frame" data-kind="${escapeHtml(kind)}"><iframe src="${escapeHtml(painted.embedUrl)}" loading="lazy" tabindex="-1" title="" referrerpolicy="strict-origin-when-cross-origin"></iframe></span>`;
  }
  const ph = `<span class="wd-collage-ph wd-kind-${escapeHtml(kind)}">${escapeHtml(linkKindLabel(kind))}</span>`;
  if (painted.play) {
    return `<span class="wd-collage-play">${ph}<span class="wd-preview-btn">${PLAY_SVG}</span></span>`;
  }
  return ph;
}

function collageTile(clip) {
  const label = clipDisplayLabel(clip);
  const open = inspectId === clip.id ? ' is-open' : '';
  return `
    <div class="wd-collage-tile${open}${clip.favorite ? ' is-fav' : ''}" role="button" tabindex="0" data-clip="${escapeHtml(clip.id)}" data-act="inspect" data-shape="${collageShape(clip)}" aria-pressed="${inspectId === clip.id ? 'true' : 'false'}" aria-label="${escapeHtml(label || 'Saved preview')}">
      ${collageMedia(clip)}
      ${label ? `<span class="wd-collage-cap">${escapeHtml(label)}</span>` : ''}
    </div>`;
}

function statusBar(clip) {
  return `
    <div class="wd-status-bar" role="group" aria-label="Status">
      ${CLIP_STATUSES.map((s) => `
        <button type="button" class="wd-status-pill${clip.status === s ? ' is-on' : ''}" data-act="status" data-status="${s}">${STATUS_LABELS[s]}</button>`).join('')}
    </div>`;
}

function clipCard(clip) {
  const label = clipDisplayLabel(clip);
  const domain = urlDomain(clip.url);
  const href = clip.url ? escapeHtml(clip.url) : '';
  const tags = new Set(clip.tagIds || []);
  return `
    <article class="wd-card${clip.favorite ? ' is-fav' : ''}" data-clip="${escapeHtml(clip.id)}">
      <div class="wd-card-top">
        <button type="button" class="wd-fav-btn${clip.favorite ? ' is-on' : ''}" data-act="favorite" aria-label="${clip.favorite ? 'Unfavorite' : 'Favorite'}" aria-pressed="${clip.favorite ? 'true' : 'false'}">${HEART_SVG}</button>
        <button type="button" class="wd-icon-btn" data-act="delete" aria-label="Remove">×</button>
      </div>
      ${previewBlock(clip)}
      ${clip.url ? `
        <a class="wd-card-link" href="${href}" target="_blank" rel="noopener noreferrer">
          ${kindChip(clip.url)}
          <span class="wd-card-link-text">${escapeHtml(label)}</span>
          <span class="wd-card-link-host">${escapeHtml(domain)}</span>
        </a>` : ''}
      <textarea class="wd-card-body" data-act="body" rows="${clip.body.trim() ? 2 : 1}" aria-label="Note" placeholder="${clip.url ? 'Add a note' : 'A loose note…'}">${escapeHtml(clip.body)}</textarea>
      ${clip.url ? `
        <label class="wd-card-label-row">Link text
          <input class="wd-input" data-act="label" type="text" maxlength="120" value="${escapeHtml(clip.urlLabel)}" placeholder="${escapeHtml(label)}">
        </label>` : ''}
      ${statusBar(clip)}
      <div class="wd-card-bar">
        <div class="wd-tags" role="group" aria-label="Tags">
          ${tagPills({ selected: tags, act: 'tag-toggle', includeInbox: false, multi: true })}
        </div>
      </div>
      <div class="wd-card-actions">
        <button type="button" class="wd-btn wd-btn-ghost" data-act="make-decision">Turn into decision</button>
        <button type="button" class="wd-btn wd-btn-ghost" data-act="make-task">Add next step</button>
      </div>
    </article>
  `;
}

function feedHtml(clips) {
  if (!clips.length) return `<section class="wd-feed">${emptyStateHtml()}</section>`;
  const collageOn = usesCollage(view, { query }) && view.kind !== 'home';
  if (!collageOn) {
    return `<section class="wd-feed">${clips.map(clipCard).join('')}</section>`;
  }
  const visual = clips.filter(clipHasVisual);
  const notes = clips.filter((clip) => !clipHasVisual(clip));
  const inspect = inspectId ? clips.find((clip) => clip.id === inspectId) : null;
  if (inspectId && !inspect) inspectId = null;
  return `
    ${inspect ? `
      <section class="wd-inspect" aria-label="Selected clip">
        ${clipCard(inspect)}
        <button type="button" class="wd-btn wd-btn-ghost" data-act="close-inspect">Done</button>
      </section>` : ''}
    ${visual.length ? `<section class="wd-collage" aria-label="Previews">${visual.map(collageTile).join('')}</section>` : ''}
    ${notes.length ? `
      <h2 class="wd-notes-h">${visual.length ? 'Notes' : 'Notes & links'}</h2>
      <section class="wd-feed wd-feed-notes">${notes.map(clipCard).join('')}</section>` : ''}
  `;
}

function railItem(href, label, count, active, nav) {
  return `
    <a class="wd-rail-item${active ? ' is-active' : ''}" href="${href}" data-nav="${nav}">
      <span class="wd-rail-name">${escapeHtml(label)}</span>
      ${count == null ? '' : `<span class="wd-rail-count">${count}</span>`}
    </a>`;
}

function railHtml() {
  const summary = homeSummary(board);
  const nextCount = tasksIn(board, 'next').length;
  const somedayCount = tasksIn(board, 'someday').length;
  const doneCount = tasksIn(board, 'done').length;
  const archivedCount = board.clips.filter((c) => c.status === 'archived').length;
  const tagRows = board.buckets.map((b) => railItem(
    `#tag/${encodeURIComponent(b.id)}`,
    b.name,
    bucketCount(board, b.id),
    view.kind === 'tag' && view.id === b.id && !query,
    'tag',
  )).join('');
  return `
    <nav class="wd-rail" aria-label="Views">
      ${railItem('#home', 'Home', null, view.kind === 'home' && !query, 'home')}
      <p class="wd-rail-label">Inspiration</p>
      ${railItem('#inbox', 'Inbox', summary.inbox, view.kind === 'inbox' && !query, 'inbox')}
      ${railItem('#all', 'Everything', board.clips.filter((c) => c.status !== 'archived').length, view.kind === 'all' && !query, 'all')}
      ${railItem('#favorites', 'Favorites', summary.favorites, view.kind === 'favorites' && !query, 'favorites')}
      ${railItem('#shortlist', 'Shortlist', summary.shortlist, view.kind === 'shortlist' && !query, 'shortlist')}
      ${railItem('#chosen', 'Chosen', board.clips.filter((c) => c.status === 'chosen').length, view.kind === 'chosen' && !query, 'chosen')}
      ${tagRows || '<p class="wd-rail-empty">Tags appear as you create them.</p>'}
      ${archivedCount ? railItem('#archived', 'Archived', archivedCount, view.kind === 'archived' && !query, 'archived') : ''}
      <p class="wd-rail-label">Plan</p>
      ${railItem('#plan/next', 'Next up', nextCount, view.kind === 'plan' && view.section === 'next' && !query, 'plan-next')}
      ${railItem('#plan/someday', 'Someday', somedayCount, view.kind === 'plan' && view.section === 'someday' && !query, 'plan-someday')}
      ${railItem('#plan/decisions', 'Decisions', summary.openDecisions, view.kind === 'plan' && view.section === 'decisions' && !query, 'plan-decisions')}
      ${railItem('#plan/done', 'Done', doneCount, view.kind === 'plan' && view.section === 'done' && !query, 'plan-done')}
    </nav>
  `;
}

function mobileNavHtml() {
  const section = view.kind === 'plan' ? 'plan' : (view.kind === 'home' ? 'home' : 'inspiration');
  return `
    <nav class="wd-tabbar" aria-label="Sections">
      <a class="wd-tab${section === 'home' ? ' is-active' : ''}" href="#home" data-nav="home">Home</a>
      <a class="wd-tab${section === 'inspiration' ? ' is-active' : ''}" href="#inbox" data-nav="inbox">Inspiration</a>
      <a class="wd-tab${section === 'plan' ? ' is-active' : ''}" href="#plan/next" data-nav="plan-next">Plan</a>
    </nav>`;
}

function chipsHtml() {
  if (view.kind === 'home') return '';
  if (view.kind === 'plan') {
    const chip = (section, label) => `
      <a class="wd-chip${view.section === section ? ' is-active' : ''}" href="#plan/${section}" data-nav="plan-${section}">${escapeHtml(label)}</a>`;
    return `
      <div class="wd-chips" aria-label="Plan">
        ${chip('next', 'Next')}
        ${chip('someday', 'Someday')}
        ${chip('decisions', 'Decisions')}
        ${chip('done', 'Done')}
      </div>`;
  }
  const chip = (href, label, active, count, nav) => `
    <a class="wd-chip${active ? ' is-active' : ''}" href="${href}" data-nav="${nav}">${escapeHtml(label)} <em>${count}</em></a>`;
  const summary = homeSummary(board);
  return `
    <div class="wd-chips" aria-label="Inspiration">
      ${chip('#inbox', 'Inbox', view.kind === 'inbox' && !query, summary.inbox, 'inbox')}
      ${chip('#all', 'All', view.kind === 'all' && !query, board.clips.filter((c) => c.status !== 'archived').length, 'all')}
      ${chip('#favorites', '♥', view.kind === 'favorites' && !query, summary.favorites, 'favorites')}
      ${chip('#shortlist', 'Shortlist', view.kind === 'shortlist' && !query, summary.shortlist, 'shortlist')}
    </div>`;
}

function filterBarHtml() {
  if (view.kind === 'home' || view.kind === 'plan') return '';
  return `
    <div class="wd-filters">
      <label class="wd-filter">Sort
        <select class="wd-input wd-select" data-act="sort">
          <option value="newest"${sort === 'newest' ? ' selected' : ''}>Newest</option>
          <option value="oldest"${sort === 'oldest' ? ' selected' : ''}>Oldest</option>
          <option value="updated"${sort === 'updated' ? ' selected' : ''}>Recently edited</option>
        </select>
      </label>
      <label class="wd-filter">Show
        <select class="wd-input wd-select" data-act="media">
          <option value="all"${mediaFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="visual"${mediaFilter === 'visual' ? ' selected' : ''}>Previews only</option>
          <option value="notes"${mediaFilter === 'notes' ? ' selected' : ''}>Notes only</option>
        </select>
      </label>
    </div>`;
}

function tagBarHtml() {
  if (view.kind === 'home' || view.kind === 'plan') return '';
  return `
    <div class="wd-tagbar">
      <div class="wd-tags" role="navigation" aria-label="Tags">
        ${tagPills({ selected: view.kind === 'tag' ? view.id : '', nav: true, includeInbox: false })}
        ${newTagForm()}
      </div>
    </div>`;
}

function composerHtml() {
  if (view.kind === 'plan') return planComposerHtml();
  const expanded = composerExpanded ? ' is-open' : '';
  const tags = composerTags.size ? composerTags : defaultComposerTags();
  return `
    <form class="wd-composer${expanded}" id="wd-composer">
      <textarea class="wd-composer-body" id="wd-body" rows="${composerExpanded ? 3 : 2}" placeholder="Paste a link or write a thought…"></textarea>
      <div class="wd-composer-more"${composerExpanded ? '' : ' hidden'}>
        <div class="wd-composer-link">
          <label>Link
            <input class="wd-input" id="wd-url" type="text" inputmode="url" autocomplete="off" placeholder="https:// — TikTok, Reel, image, anything">
          </label>
          <label>Link text
            <input class="wd-input" id="wd-label" type="text" maxlength="120" placeholder="What this is">
          </label>
        </div>
        <div class="wd-composer-tags">
          <span class="wd-composer-tags-label">Tags</span>
          <div class="wd-tags" role="group" aria-label="Tag this">
            ${tagPills({ selected: tags, act: 'composer-tag', includeInbox: false, multi: true })}
          </div>
        </div>
      </div>
      <div class="wd-composer-bar">
        <button type="button" class="wd-btn wd-btn-ghost" data-act="composer-toggle">${composerExpanded ? 'Less' : 'Link & tags'}</button>
        <button type="submit" class="wd-btn wd-btn-keep">Keep</button>
      </div>
    </form>
  `;
}

function planComposerHtml() {
  if (view.section === 'decisions') {
    return `
      <form class="wd-plan-form" data-act="add-decision">
        <input class="wd-input" name="title" type="text" maxlength="120" placeholder="A decision you are weighing…" aria-label="Decision title" required>
        <textarea class="wd-input wd-plan-notes" name="notes" rows="2" placeholder="Notes (optional)" aria-label="Decision notes"></textarea>
        <button type="submit" class="wd-btn wd-btn-keep">Add decision</button>
      </form>`;
  }
  const status = view.section === 'done' ? 'done' : (view.section === 'next' ? 'next' : 'someday');
  return `
    <form class="wd-plan-form" data-act="add-task">
      <input type="hidden" name="status" value="${status}">
      <input class="wd-input" name="title" type="text" maxlength="120" placeholder="${status === 'next' ? 'Something to do soon…' : 'Something for later…'}" aria-label="Task title" required>
      <textarea class="wd-input wd-plan-notes" name="notes" rows="2" placeholder="Notes (optional)" aria-label="Task notes"></textarea>
      <button type="submit" class="wd-btn wd-btn-keep">Add task</button>
    </form>`;
}

function homeHtml() {
  const summary = homeSummary(board);
  const stat = (href, label, count, copy) => `
    <a class="wd-stat" href="${href}">
      <span class="wd-stat-n">${count}</span>
      <span class="wd-stat-label">${escapeHtml(label)}</span>
      <span class="wd-stat-copy">${escapeHtml(copy)}</span>
    </a>`;
  const recent = summary.recent.length
    ? `<section class="wd-feed wd-feed-home">${summary.recent.map(clipCard).join('')}</section>`
    : `<p class="wd-empty">Nothing saved yet. Paste a link above, or open Inbox to start.</p>`;
  const tasks = summary.nextTasks.length
    ? `<ul class="wd-task-list">${summary.nextTasks.map(taskRow).join('')}</ul>`
    : `<p class="wd-empty-inline">No next steps yet — add one under <a href="#plan/next">Plan → Next up</a>.</p>`;
  return `
    <div class="wd-home">
      <div class="wd-stats">
        ${stat('#inbox', 'Inbox', summary.inbox, 'Untagged clips waiting for a home')}
        ${stat('#favorites', 'Favorites', summary.favorites, 'Ones you have hearted')}
        ${stat('#shortlist', 'Shortlist', summary.shortlist, 'Strong contenders')}
        ${stat('#plan/decisions', 'Decisions', summary.openDecisions, 'Still exploring')}
      </div>
      <section class="wd-home-block">
        <h2 class="wd-home-h">Recent inspiration</h2>
        ${recent}
      </section>
      <section class="wd-home-block">
        <h2 class="wd-home-h">Next up <a class="wd-home-link" href="#plan/next">See all</a></h2>
        ${tasks}
      </section>
    </div>`;
}

function taskRow(task) {
  const next = task.status === 'next';
  const done = task.status === 'done';
  return `
    <li class="wd-task${done ? ' is-done' : ''}" data-task="${escapeHtml(task.id)}">
      <label class="wd-task-check">
        <input type="checkbox" data-act="task-done" ${done ? 'checked' : ''}>
        <span>${escapeHtml(task.title)}</span>
      </label>
      ${next ? `<button type="button" class="wd-btn wd-btn-ghost" data-act="task-someday">Later</button>` : ''}
      ${!done && task.status === 'someday' ? `<button type="button" class="wd-btn wd-btn-ghost" data-act="task-next">Next</button>` : ''}
      <button type="button" class="wd-icon-btn" data-act="task-delete" aria-label="Remove">×</button>
    </li>`;
}

function decisionRow(decision) {
  const decided = decision.status === 'decided';
  const linked = (decision.clipIds || [])
    .map((id) => board.clips.find((c) => c.id === id))
    .filter(Boolean);
  return `
    <article class="wd-decision${decided ? ' is-decided' : ''}" data-decision="${escapeHtml(decision.id)}">
      <div class="wd-decision-head">
        <h3 class="wd-decision-title">${escapeHtml(decision.title)}</h3>
        <div class="wd-decision-actions">
          ${decided
    ? `<button type="button" class="wd-btn wd-btn-ghost" data-act="decision-explore">Reopen</button>`
    : `<button type="button" class="wd-btn wd-btn-ghost" data-act="decision-decide">Decided</button>`}
          <button type="button" class="wd-icon-btn" data-act="decision-delete" aria-label="Remove">×</button>
        </div>
      </div>
      ${decision.notes.trim() ? `<p class="wd-decision-notes">${escapeHtml(decision.notes)}</p>` : ''}
      ${linked.length ? `
        <div class="wd-decision-clips">
          ${linked.slice(0, 4).map((clip) => `<a href="#all" data-nav="all" class="wd-decision-clip">${escapeHtml(clipDisplayLabel(clip) || 'Linked clip')}</a>`).join('')}
        </div>` : ''}
    </article>`;
}

function planHtml() {
  if (view.section === 'decisions') {
    const rows = board.decisions || [];
    return `
      <section class="wd-plan-list">
        ${rows.length ? rows.map(decisionRow).join('') : `<p class="wd-empty">No decisions yet. Name one above — link inspiration from a clip when you are ready.</p>`}
      </section>`;
  }
  const status = view.section === 'done' ? 'done' : (view.section === 'next' ? 'next' : 'someday');
  const rows = tasksIn(board, status);
  return `
    <ul class="wd-task-list wd-plan-list">
      ${rows.length ? rows.map(taskRow).join('') : `<p class="wd-empty">Nothing here yet.</p>`}
    </ul>`;
}

function emptyStateHtml() {
  if (query.trim()) return `<p class="wd-empty">Nothing matches that yet.</p>`;
  if (view.kind === 'tag') {
    return `<p class="wd-empty">Nothing with this tag yet. Keep a note or a link above, or retag something from Inbox.</p>`;
  }
  if (view.kind === 'inbox' && inboxCount(board) === 0) return emptyInboxHtml();
  if (view.kind === 'all' && board.clips.length === 0) return emptyInboxHtml();
  if (view.kind === 'favorites') return `<p class="wd-empty">Heart a clip to collect favorites here.</p>`;
  if (view.kind === 'shortlist') return `<p class="wd-empty">Move clips to Shortlist when they are strong contenders.</p>`;
  if (view.kind === 'chosen') return `<p class="wd-empty">Mark clips as Chosen when you have locked them in.</p>`;
  if (view.kind === 'archived') return `<p class="wd-empty">Archived clips sit out of the way here.</p>`;
  return '';
}

function emptyInboxHtml() {
  const suggestions = board.buckets.length
    ? ''
    : `
      <div class="wd-suggest">
        <p>Start with a few tags, or skip and stay in Inbox.</p>
        <div class="wd-suggest-row">
          ${SUGGESTED_BUCKETS.map((b) => `<button type="button" class="wd-chip-btn" data-act="suggest" data-name="${escapeHtml(b.name)}">${escapeHtml(b.name)}</button>`).join('')}
        </div>
        <button type="button" class="wd-btn wd-btn-ghost" data-act="seed">Add all six</button>
      </div>`;
  return `
    <div class="wd-empty-card">
      <p class="wd-empty-lead">Inbox is the catch-all.</p>
      <p>Paste a TikTok, a Reel, a photo URL, or just a sentence. Tag it when a theme is actually a theme — no rush.</p>
      ${suggestions}
    </div>`;
}

function bucketToolsHtml() {
  if (view.kind !== 'tag' || query.trim()) return '';
  const i = board.buckets.findIndex((b) => b.id === view.id);
  if (i < 0) return '';
  return `
    <div class="wd-bucket-tools">
      <button type="button" class="wd-btn wd-btn-ghost" data-act="rename">Rename</button>
      <button type="button" class="wd-btn wd-btn-ghost" data-act="up" ${i === 0 ? 'disabled' : ''}>Up</button>
      <button type="button" class="wd-btn wd-btn-ghost" data-act="down" ${i === board.buckets.length - 1 ? 'disabled' : ''}>Down</button>
      <button type="button" class="wd-btn wd-btn-ghost wd-danger" data-act="remove-bucket">Remove</button>
    </div>`;
}

function mainContentHtml() {
  if (view.kind === 'home') return homeHtml();
  if (view.kind === 'plan') return planHtml();
  return feedHtml(visibleClips());
}

function renderApp() {
  const snap = {
    body: document.getElementById('wd-body')?.value || '',
    url: document.getElementById('wd-url')?.value || '',
    label: document.getElementById('wd-label')?.value || '',
  };
  root.innerHTML = `
    <div class="wd-shell">
      ${railHtml()}
      <main class="wd-main">
        ${mobileNavHtml()}
        ${chipsHtml()}
        <header class="wd-head">
          <div>
            <p class="wd-kicker">Wedding</p>
            <h1 class="wd-title">${escapeHtml(viewTitle(view, board, { query }))}</h1>
            <p class="wd-copy">${escapeHtml(viewCopy(view, { query }))}</p>
          </div>
          ${bucketToolsHtml()}
        </header>
        ${filterBarHtml()}
        ${tagBarHtml()}
        ${view.kind === 'plan' || view.kind === 'home' ? '' : composerHtml()}
        ${view.kind === 'plan' ? composerHtml() : ''}
        ${view.kind === 'home' ? composerHtml() : ''}
        ${mainContentHtml()}
      </main>
    </div>
  `;
  wireApp();
  const body = document.getElementById('wd-body');
  const url = document.getElementById('wd-url');
  const label = document.getElementById('wd-label');
  if (body) body.value = snap.body;
  if (url) url.value = snap.url;
  if (label) label.value = snap.label;
  if (composerExpanded) {
    document.getElementById('wd-composer')?.classList.add('is-open');
    const more = document.querySelector('.wd-composer-more');
    if (more) more.hidden = false;
  }
  fillPreviews();
}

function navFromEl(el) {
  const nav = el.getAttribute('data-nav');
  if (nav === 'home') return defaultView();
  if (nav === 'inbox') return { kind: 'inbox' };
  if (nav === 'all') return { kind: 'all' };
  if (nav === 'favorites') return { kind: 'favorites' };
  if (nav === 'shortlist') return { kind: 'shortlist' };
  if (nav === 'chosen') return { kind: 'chosen' };
  if (nav === 'archived') return { kind: 'archived' };
  if (nav === 'tag') return { kind: 'tag', id: el.getAttribute('data-id') };
  if (nav === 'plan-next') return { kind: 'plan', section: 'next' };
  if (nav === 'plan-someday') return { kind: 'plan', section: 'someday' };
  if (nav === 'plan-decisions') return { kind: 'plan', section: 'decisions' };
  if (nav === 'plan-done') return { kind: 'plan', section: 'done' };
  return defaultView();
}

function wireApp() {
  const composer = document.getElementById('wd-composer');
  const body = document.getElementById('wd-body');
  const url = document.getElementById('wd-url');
  const label = document.getElementById('wd-label');

  composer?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const tags = [...composerTags];
      board = addClip(board, {
        body: body.value,
        url: url?.value || '',
        urlLabel: label?.value || '',
        tagIds: tags,
      });
      body.value = '';
      if (url) url.value = '';
      if (label) label.value = '';
      composerTags = defaultComposerTags();
      composerExpanded = false;
      commit(board, { instant: true });
    } catch (err) {
      showToast(err.message);
    }
  });

  root.querySelector('[data-act="composer-toggle"]')?.addEventListener('click', () => {
    composerExpanded = !composerExpanded;
    render();
    document.getElementById('wd-body')?.focus();
  });

  body?.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    const peeled = extractPastedUrl(text);
    if (!peeled.url) return;
    if (body.value.trim() && !extractPastedUrl(body.value + '\n' + text).url) return;
    window.setTimeout(() => {
      const next = extractPastedUrl(body.value);
      if (!next.url) return;
      body.value = next.body;
      composerExpanded = true;
      if (url && !url.value) url.value = next.url;
      render();
      label?.focus();
    }, 0);
  });

  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      query = '';
      const search = document.getElementById('wd-search');
      if (search) search.value = '';
      const next = navFromEl(el);
      inspectId = null;
      setHash(next);
      render();
    });
  });

  root.querySelector('[data-act="sort"]')?.addEventListener('change', (e) => {
    sort = e.target.value;
    try { localStorage.setItem(SORT_KEY, sort); } catch { /* */ }
    render();
  });

  root.querySelector('[data-act="media"]')?.addEventListener('change', (e) => {
    mediaFilter = e.target.value;
    try { localStorage.setItem(MEDIA_KEY, mediaFilter); } catch { /* */ }
    render();
  });

  root.querySelectorAll('[data-act="composer-tag"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (composerTags.has(id)) composerTags.delete(id);
      else composerTags.add(id);
      render();
      document.getElementById('wd-body')?.focus();
    });
  });

  root.querySelectorAll('.wd-new-tag').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.currentTarget.querySelector('input');
      try {
        const next = addBucket(board, input.value);
        const created = next.buckets.find((b) => !board.buckets.some((row) => row.id === b.id));
        if (created) composerTags.add(created.id);
        input.value = '';
        commit(next, { instant: true });
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  root.querySelectorAll('[data-act="suggest"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        commit(addBucket(board, btn.getAttribute('data-name')), { instant: true });
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  root.querySelector('[data-act="seed"]')?.addEventListener('click', () => {
    commit(seedSuggestedBuckets(board), { instant: true });
  });

  root.querySelector('[data-act="rename"]')?.addEventListener('click', () => {
    const current = bucketById(board, view.id);
    const name = window.prompt('Rename this tag', current?.name || '');
    if (name == null) return;
    try {
      commit(renameBucket(board, view.id, name), { instant: true });
    } catch (err) {
      showToast(err.message);
    }
  });

  root.querySelector('[data-act="up"]')?.addEventListener('click', () => {
    commit(moveBucket(board, view.id, 'up'), { instant: true });
  });
  root.querySelector('[data-act="down"]')?.addEventListener('click', () => {
    commit(moveBucket(board, view.id, 'down'), { instant: true });
  });
  root.querySelector('[data-act="remove-bucket"]')?.addEventListener('click', () => {
    const current = bucketById(board, view.id);
    if (!window.confirm(`Remove “${current?.name || 'this tag'}”? Clips lose this tag only.`)) return;
    commit(removeBucket(board, view.id), { instant: true });
    setHash({ kind: 'inbox' });
    render();
  });

  root.querySelectorAll('.wd-card, .wd-collage-tile').forEach((card) => {
    const id = card.getAttribute('data-clip');
    if (!id) return;

    card.querySelector('[data-act="body"]')?.addEventListener('change', (e) => {
      try {
        commit(updateClip(board, id, { body: e.target.value }));
      } catch (err) {
        showToast(err.message);
        render();
      }
    });
    card.querySelector('[data-act="label"]')?.addEventListener('change', (e) => {
      commit(updateClip(board, id, { urlLabel: e.target.value }));
    });
    card.querySelectorAll('[data-act="tag-toggle"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          commit(toggleClipTag(board, id, btn.getAttribute('data-id')), { instant: true });
        } catch (err) {
          showToast(err.message);
        }
      });
    });
    card.querySelector('[data-act="favorite"]')?.addEventListener('click', () => {
      try {
        commit(toggleClipFavorite(board, id), { instant: true });
      } catch (err) {
        showToast(err.message);
      }
    });
    card.querySelectorAll('[data-act="status"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          commit(setClipStatus(board, id, btn.getAttribute('data-status')), { instant: true });
        } catch (err) {
          showToast(err.message);
        }
      });
    });
    card.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      const clip = board.clips.find((c) => c.id === id);
      if (inspectId === id) inspectId = null;
      commit(removeClip(board, id), { instant: true });
      showToast('Removed', {
        undo: () => {
          const next = normalizeBoard(board);
          next.clips.unshift(clip);
          commit(next, { instant: true });
        },
      });
    });
    card.querySelector('[data-act="play"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      const clip = board.clips.find((c) => c.id === id);
      if (clip) playPreview(card, clip);
    });
    card.querySelector('[data-act="make-decision"]')?.addEventListener('click', () => {
      const clip = board.clips.find((c) => c.id === id);
      const title = clipDisplayLabel(clip) || clip.body.trim().slice(0, 80) || 'New decision';
      try {
        commit(addDecision(board, { title, clipIds: [id] }), { instant: true });
        setHash({ kind: 'plan', section: 'decisions' });
        showToast('Added to Decisions');
        render();
      } catch (err) {
        showToast(err.message);
      }
    });
    card.querySelector('[data-act="make-task"]')?.addEventListener('click', () => {
      const clip = board.clips.find((c) => c.id === id);
      const title = clipDisplayLabel(clip) || clip.body.trim().slice(0, 80) || 'Follow up';
      try {
        commit(addTask(board, { title, status: 'next', clipIds: [id] }), { instant: true });
        setHash({ kind: 'plan', section: 'next' });
        showToast('Added to Next up');
        render();
      } catch (err) {
        showToast(err.message);
      }
    });
    card.querySelectorAll('.wd-card-image img, .wd-preview-img, .wd-collage-tile img').forEach((img) => {
      img.addEventListener('error', () => {
        const photo = img.closest('.wd-card-image');
        if (photo) photo.hidden = true;
        const preview = img.closest('.wd-preview');
        if (preview && img.parentElement) {
          const kind = preview.getAttribute('data-kind') || 'link';
          img.replaceWith(Object.assign(document.createElement('span'), {
            className: `wd-preview-ph wd-kind-${kind}`,
            textContent: linkKindLabel(kind),
          }));
        }
        const tile = img.closest('.wd-collage-tile');
        if (tile) {
          const kind = linkKind(board.clips.find((c) => c.id === tile.getAttribute('data-clip'))?.url) || 'link';
          img.replaceWith(Object.assign(document.createElement('span'), {
            className: `wd-collage-ph wd-kind-${kind}`,
            textContent: linkKindLabel(kind),
          }));
        }
      });
    });
  });

  root.querySelector('[data-act="close-inspect"]')?.addEventListener('click', () => {
    inspectId = null;
    render();
  });

  root.querySelectorAll('.wd-collage-tile[data-act="inspect"]').forEach((tile) => {
    const open = () => {
      const id = tile.getAttribute('data-clip');
      inspectId = inspectId === id ? null : id;
      render();
      if (inspectId) {
        root.querySelector('.wd-inspect')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    tile.addEventListener('click', open);
    tile.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      open();
    });
  });

  root.querySelectorAll('[data-act="add-task"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        commit(addTask(board, {
          title: fd.get('title'),
          notes: fd.get('notes'),
          status: fd.get('status') || 'someday',
        }), { instant: true });
        form.reset();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  root.querySelectorAll('[data-act="add-decision"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        commit(addDecision(board, {
          title: fd.get('title'),
          notes: fd.get('notes'),
        }), { instant: true });
        form.reset();
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  root.querySelectorAll('.wd-task').forEach((row) => {
    const id = row.getAttribute('data-task');
    row.querySelector('[data-act="task-done"]')?.addEventListener('change', (e) => {
      try {
        commit(updateTask(board, id, { status: e.target.checked ? 'done' : 'next' }), { instant: true });
      } catch (err) {
        showToast(err.message);
      }
    });
    row.querySelector('[data-act="task-next"]')?.addEventListener('click', () => {
      commit(updateTask(board, id, { status: 'next' }), { instant: true });
    });
    row.querySelector('[data-act="task-someday"]')?.addEventListener('click', () => {
      commit(updateTask(board, id, { status: 'someday' }), { instant: true });
    });
    row.querySelector('[data-act="task-delete"]')?.addEventListener('click', () => {
      const task = taskById(board, id);
      commit(removeTask(board, id), { instant: true });
      showToast('Removed', {
        undo: () => {
          const next = normalizeBoard(board);
          next.tasks.unshift(task);
          commit(next, { instant: true });
        },
      });
    });
  });

  root.querySelectorAll('.wd-decision').forEach((row) => {
    const id = row.getAttribute('data-decision');
    row.querySelector('[data-act="decision-decide"]')?.addEventListener('click', () => {
      commit(updateDecision(board, id, { status: 'decided' }), { instant: true });
    });
    row.querySelector('[data-act="decision-explore"]')?.addEventListener('click', () => {
      commit(updateDecision(board, id, { status: 'exploring' }), { instant: true });
    });
    row.querySelector('[data-act="decision-delete"]')?.addEventListener('click', () => {
      const decision = decisionById(board, id);
      commit(removeDecision(board, id), { instant: true });
      showToast('Removed', {
        undo: () => {
          const next = normalizeBoard(board);
          next.decisions.unshift(decision);
          commit(next, { instant: true });
        },
      });
    });
  });
}

function onSearchInput(e) {
  query = e.target.value;
  renderApp();
}

function render() {
  syncView();
  composerTags = composerTags.size ? composerTags : defaultComposerTags();
  renderApp();
}

function renderSignInGate() {
  const note = !auth?.configured
    ? '<p class="wd-gate-error">Sign-in isn’t configured on this deployment yet.</p>'
    : (auth?.needsReauth ? '<p class="wd-gate-error">Your session expired. Sign in again to pick up where you left off.</p>' : '');
  renderWeddingSignIn(root, {
    art: RING_ART,
    title: 'Wedding',
    copy: 'A private place for the ideas, links, and loose notes that will eventually become a wedding.',
    note,
    onSuccess: () => location.reload(),
  });
  if (!auth?.configured) {
    const form = root.querySelector('#wd-auth');
    if (form) form.hidden = true;
  }
  wireAuthLink(auth || { configured: true, signedIn: false });
}

function wireSearch() {
  const search = document.getElementById('wd-search');
  if (!search) return;
  search.hidden = false;
  search.value = query;
  search.addEventListener('input', onSearchInput);
}

window.addEventListener('hashchange', () => {
  query = '';
  inspectId = null;
  const search = document.getElementById('wd-search');
  if (search) search.value = '';
  render();
});

window.addEventListener('pagehide', () => {
  persist.flush({ keepalive: true });
});

async function boot() {
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    document.documentElement.classList.add('wd-standalone');
  }

  if (localMode) {
    auth = { configured: true, signedIn: true, token: null, local: true };
    board = readLocal() || emptyBoard();
    wireAuthLink({ configured: false, signedIn: false });
    const link = document.getElementById('nav-auth-link');
    if (link) {
      link.textContent = 'Local';
      link.href = '/wedding/';
    }
    wireSearch();
    if (!location.hash || location.hash === '#inbox') setHash(defaultView());
    render();
    setStatus('This device only');
    return;
  }

  auth = await initAuth();
  if (auth.configured && auth.user && !auth.token) {
    await refreshToken(auth);
  }
  wireAuthLink(auth);

  if (!auth.configured || !auth.signedIn || !auth.token) {
    renderSignInGate();
    return;
  }

  wireSearch();
  const cached = readLocal();
  if (cached) {
    board = cached;
    if (!location.hash || location.hash === '#inbox') setHash(defaultView());
    render();
    setStatus('…');
  }

  try {
    const data = await loadBoard(auth.token);
    board = normalizeBoard(data.board);
    writeLocal(board);
    if (!location.hash || location.hash === '#inbox') setHash(defaultView());
    render();
    setStatus(data.created ? 'New board' : 'Saved');
  } catch (err) {
    console.error(err);
    if (err.status === 401) {
      auth.needsReauth = true;
      auth.signedIn = false;
      renderSignInGate();
      return;
    }
    if (!cached) {
      root.innerHTML = `<p class="wd-boot">Could not load Wedding: ${escapeHtml(err.message)}</p>`;
    } else {
      showToast('Cloud copy unavailable — showing this device.');
    }
  }
}

boot();

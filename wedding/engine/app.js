/**
 * Wedding board UI. All board semantics live in ./model.js (tested by
 * scripts/test-wedding.mjs); this file is fetch + DOM only.
 */
import {
  initAuth,
  wireAuthLink,
  refreshToken,
  renderWeddingSignIn,
} from './auth.js';
import { loadBoard, saveBoard, debounceSave, unfurlUrl } from './store.js';
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
  moveClip,
  clipsIn,
  inboxCount,
  searchClips,
  bucketById,
  seedSuggestedBuckets,
  mediaPreview,
  previewHref,
  previewPresentation,
  previewPaint,
  clipNeedsUnfurl,
  clipHasVisual,
} from './model.js';

const STORAGE_KEY = 'wedding:board';
const root = document.getElementById('app-root');
const toastEl = document.getElementById('toast');
const statusEl = document.getElementById('wd-status');
const localMode = new URLSearchParams(location.search).has('local');

let auth = null;
let board = emptyBoard();
let view = { kind: 'inbox' };
let query = '';
let composerOpen = false;
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

const RING_ART = `
<svg class="wd-gate-art" viewBox="0 0 120 92" width="132" height="101" role="img" aria-label="Two rings">
  <ellipse cx="60" cy="84" rx="34" ry="5" fill="#2a221e" opacity="0.07"/>
  <circle cx="46" cy="46" r="26" fill="none" stroke="#c97b7b" stroke-width="5"/>
  <circle cx="74" cy="46" r="26" fill="none" stroke="#b08d57" stroke-width="5"/>
  <circle cx="46" cy="46" r="26" fill="none" stroke="#2a221e" stroke-width="1.4" opacity="0.35"/>
  <circle cx="74" cy="46" r="26" fill="none" stroke="#2a221e" stroke-width="1.4" opacity="0.35"/>
</svg>`;

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

function parseHash() {
  const raw = (location.hash || '#inbox').replace(/^#/, '');
  if (raw === 'all') return { kind: 'all' };
  if (raw.startsWith('b/')) {
    const id = decodeURIComponent(raw.slice(2));
    if (bucketById(board, id)) return { kind: 'bucket', id };
  }
  return { kind: 'inbox' };
}

function setHash(next) {
  const hash = next.kind === 'all'
    ? '#all'
    : next.kind === 'bucket'
      ? `#b/${encodeURIComponent(next.id)}`
      : '#inbox';
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function commit(next, { instant = false } = {}) {
  board = normalizeBoard(next);
  writeLocal(board);
  render();
  persist(board);
  if (instant) persist.flush();
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
  } catch {
    /* still embed or branded placeholder still works */
  }
}

function fillPreviews() {
  for (const clip of visibleClips()) requestPreview(clip);
}

function destinationId() {
  if (view.kind === 'bucket') return view.id;
  return null;
}

function visibleClips() {
  const found = query.trim() ? searchClips(board, query) : board.clips.slice();
  if (query.trim()) return found;
  if (view.kind === 'all') return found;
  if (view.kind === 'bucket') return clipsIn(board, view.id);
  return clipsIn(board, null);
}

function viewTitle() {
  if (query.trim()) return 'Search';
  if (view.kind === 'all') return 'Everything';
  if (view.kind === 'bucket') return bucketById(board, view.id)?.name || 'Bucket';
  return 'Inbox';
}

function viewCopy() {
  if (query.trim()) return `Notes and links that match “${query.trim()}”.`;
  if (view.kind === 'all') return 'Every picture, pin, and clip in one collage. Notes without a picture sit underneath.';
  if (view.kind === 'bucket') return 'Everything tagged here. Tap another tag to switch, or Inbox / Everything to zoom out.';
  return 'Drop a thought or a link. Tag it when it belongs somewhere.';
}

function usesCollage() {
  return view.kind === 'all' || view.kind === 'bucket';
}

function composerDest(snapDest) {
  if (snapDest) return snapDest;
  if (view.kind === 'bucket') return view.id;
  return 'inbox';
}

function tagPills({ selected, nav, act, includeInbox = false }) {
  const pill = (id, label, on, extra) => `
    <button type="button" class="wd-tag${on ? ' is-on' : ''}" ${extra} aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
  const rows = [];
  if (includeInbox) {
    const on = !selected || selected === 'inbox';
    const extra = nav
      ? `data-nav="inbox"`
      : `data-act="${act}" data-id="inbox"`;
    rows.push(pill('inbox', 'Inbox', on, extra));
  }
  for (const bucket of board.buckets) {
    const on = selected === bucket.id;
    const extra = nav
      ? `data-nav="bucket" data-id="${escapeHtml(bucket.id)}"`
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
    <div class="wd-collage-tile${open}" role="button" tabindex="0" data-clip="${escapeHtml(clip.id)}" data-act="inspect" data-shape="${collageShape(clip)}" aria-pressed="${inspectId === clip.id ? 'true' : 'false'}" aria-label="${escapeHtml(label || 'Saved preview')}">
      ${collageMedia(clip)}
      ${label ? `<span class="wd-collage-cap">${escapeHtml(label)}</span>` : ''}
    </div>`;
}

function feedHtml(clips) {
  if (!clips.length) return `<section class="wd-feed">${emptyStateHtml()}</section>`;
  if (!usesCollage()) {
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

function clipCard(clip) {
  const label = clipDisplayLabel(clip);
  const domain = urlDomain(clip.url);
  const href = clip.url ? escapeHtml(clip.url) : '';
  return `
    <article class="wd-card" data-clip="${escapeHtml(clip.id)}">
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
      <div class="wd-card-bar">
        <div class="wd-tags" role="group" aria-label="Tag">
          ${tagPills({ selected: clip.bucketId || 'inbox', act: 'file', includeInbox: true })}
        </div>
        <button type="button" class="wd-icon-btn" data-act="delete" aria-label="Remove">×</button>
      </div>
    </article>
  `;
}

function railHtml() {
  const inbox = inboxCount(board);
  const all = board.clips.length;
  return `
    <nav class="wd-rail" aria-label="Views">
      <a class="wd-rail-item${view.kind === 'inbox' && !query ? ' is-active' : ''}" href="#inbox" data-nav="inbox">
        <span class="wd-rail-name">Inbox</span>
        <span class="wd-rail-count">${inbox}</span>
      </a>
      <a class="wd-rail-item${view.kind === 'all' && !query ? ' is-active' : ''}" href="#all" data-nav="all">
        <span class="wd-rail-name">Everything</span>
        <span class="wd-rail-count">${all}</span>
      </a>
    </nav>
  `;
}

function chipsHtml() {
  const chip = (href, label, active, count, nav) => `
    <a class="wd-chip${active ? ' is-active' : ''}" href="${href}" data-nav="${nav}">${escapeHtml(label)} <em>${count}</em></a>`;
  return `
    <div class="wd-chips" aria-label="Views">
      ${chip('#inbox', 'Inbox', view.kind === 'inbox' && !query, inboxCount(board), 'inbox')}
      ${chip('#all', 'All', view.kind === 'all' && !query, board.clips.length, 'all')}
    </div>
  `;
}

function tagBarHtml() {
  return `
    <div class="wd-tagbar">
      <div class="wd-tags" role="navigation" aria-label="Tags">
        ${tagPills({ selected: view.kind === 'bucket' ? view.id : '', nav: true, includeInbox: false })}
        ${newTagForm()}
      </div>
    </div>`;
}

function composerHtml(dest) {
  const selected = dest || 'inbox';
  return `
    <form class="wd-composer${composerOpen ? ' is-open' : ''}" id="wd-composer">
      <textarea class="wd-composer-body" id="wd-body" rows="3" placeholder="A thought, a maybe, a sentence you don’t want to lose…"></textarea>
      <div class="wd-composer-link">
        <label>Link
          <input class="wd-input" id="wd-url" type="text" inputmode="url" autocomplete="off" placeholder="https:// — TikTok, Reel, image, anything">
        </label>
        <label>Link text
          <input class="wd-input" id="wd-label" type="text" maxlength="120" placeholder="What this is">
        </label>
      </div>
      <div class="wd-composer-bar">
        <div class="wd-composer-tags">
          <input type="hidden" id="wd-dest" value="${escapeHtml(selected)}">
          <div class="wd-tags" role="group" aria-label="Tag this">
            ${tagPills({ selected, act: 'composer-tag', includeInbox: true })}
          </div>
        </div>
        <button type="submit" class="wd-btn wd-btn-keep">Keep</button>
      </div>
    </form>
  `;
}

function emptyStateHtml() {
  if (query.trim()) {
    return `<p class="wd-empty">Nothing matches that yet.</p>`;
  }
  if (view.kind === 'bucket') {
    return `<p class="wd-empty">Nothing with this tag yet. Keep a note or a link above, or retag something from Inbox.</p>`;
  }
  if (view.kind === 'all' && board.clips.length === 0) {
    return emptyInboxHtml();
  }
  if (view.kind === 'inbox' && inboxCount(board) === 0) {
    return emptyInboxHtml();
  }
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
      <p>Paste a TikTok, a Reel, a photo URL, or just a sentence. Give the link a name so you remember why you saved it. Tag it when a theme is actually a theme.</p>
      ${suggestions}
    </div>`;
}

function bucketToolsHtml() {
  if (view.kind !== 'bucket' || query.trim()) return '';
  const i = board.buckets.findIndex((b) => b.id === view.id);
  if (i < 0) return '';
  return `
    <div class="wd-bucket-tools">
      <button type="button" class="wd-btn wd-btn-ghost" data-act="rename">Rename</button>
      <button type="button" class="wd-btn wd-btn-ghost" data-act="up" ${i === 0 ? 'disabled' : ''}>Up</button>
      <button type="button" class="wd-btn wd-btn-ghost" data-act="down" ${i === board.buckets.length - 1 ? 'disabled' : ''}>Down</button>
      <button type="button" class="wd-btn wd-btn-ghost wd-danger" data-act="remove-bucket">Remove</button>
    </div>
  `;
}

function renderApp() {
  const snap = {
    body: document.getElementById('wd-body')?.value || '',
    url: document.getElementById('wd-url')?.value || '',
    label: document.getElementById('wd-label')?.value || '',
    dest: document.getElementById('wd-dest')?.value || '',
  };
  const clips = visibleClips();
  const dest = composerDest(snap.dest);
  root.innerHTML = `
    <div class="wd-shell">
      ${railHtml()}
      <main class="wd-main">
        ${chipsHtml()}
        <header class="wd-head">
          <div>
            <p class="wd-kicker">Wedding</p>
            <h1 class="wd-title">${escapeHtml(viewTitle())}</h1>
            <p class="wd-copy">${escapeHtml(viewCopy())}</p>
          </div>
          ${bucketToolsHtml()}
        </header>
        ${tagBarHtml()}
        ${composerHtml(dest)}
        ${feedHtml(clips)}
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
  if (snap.body || snap.url || snap.label) {
    composerOpen = true;
    document.getElementById('wd-composer')?.classList.add('is-open');
  }
  fillPreviews();
}

function wireApp() {
  const composer = document.getElementById('wd-composer');
  const body = document.getElementById('wd-body');
  const url = document.getElementById('wd-url');
  const label = document.getElementById('wd-label');

  composer?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const destEl = document.getElementById('wd-dest');
      const dest = destEl ? destEl.value : destinationId();
      board = addClip(board, {
        body: body.value,
        url: url.value,
        urlLabel: label.value,
        bucketId: dest,
      });
      body.value = '';
      url.value = '';
      label.value = '';
      composerOpen = false;
      commit(board, { instant: true });
    } catch (err) {
      showToast(err.message);
    }
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
      if (!url.value) url.value = next.url;
      composerOpen = true;
      composer.classList.add('is-open');
      label.focus();
    }, 0);
  });

  body?.addEventListener('focus', () => {
    composerOpen = true;
    composer.classList.add('is-open');
  });

  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      query = '';
      const search = document.getElementById('wd-search');
      if (search) search.value = '';
      const kind = el.getAttribute('data-nav');
      view = kind === 'bucket'
        ? { kind: 'bucket', id: el.getAttribute('data-id') }
        : { kind };
      inspectId = null;
      setHash(view);
      render();
    });
  });

  root.querySelectorAll('[data-act="composer-tag"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const destEl = document.getElementById('wd-dest');
      if (destEl) destEl.value = btn.getAttribute('data-id') || 'inbox';
      root.querySelectorAll('[data-act="composer-tag"]').forEach((el) => {
        const on = el === btn;
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  });

  root.querySelectorAll('.wd-new-tag').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = e.currentTarget.querySelector('input');
      try {
        const next = addBucket(board, input.value);
        const created = next.buckets.find((b) => !board.buckets.some((row) => row.id === b.id));
        const destEl = document.getElementById('wd-dest');
        if (destEl && created) destEl.value = created.id;
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
    if (!window.confirm(`Remove “${current?.name || 'this tag'}”? Items go back to Inbox.`)) return;
    commit(removeBucket(board, view.id), { instant: true });
    view = { kind: 'inbox' };
    setHash(view);
    render();
  });

  root.querySelectorAll('.wd-card').forEach((card) => {
    const id = card.getAttribute('data-clip');
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
    card.querySelectorAll('[data-act="file"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commit(moveClip(board, id, btn.getAttribute('data-id')), { instant: true });
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
    card.querySelectorAll('.wd-card-image img, .wd-preview-img').forEach((img) => {
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
    tile.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        const kind = linkKind(board.clips.find((c) => c.id === tile.getAttribute('data-clip'))?.url) || 'link';
        img.replaceWith(Object.assign(document.createElement('span'), {
          className: `wd-collage-ph wd-kind-${kind}`,
          textContent: linkKindLabel(kind),
        }));
      });
    });
  });
}

function onSearchInput(e) {
  query = e.target.value;
  renderApp();
}

function render() {
  view = parseHash();
  if (view.kind === 'bucket' && !bucketById(board, view.id)) {
    view = { kind: 'inbox' };
    setHash(view);
  }
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
    render();
    setStatus('…');
  }

  try {
    const data = await loadBoard(auth.token);
    board = normalizeBoard(data.board);
    writeLocal(board);
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

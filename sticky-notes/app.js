/**
 * Sticky Notes boot: auth → store → board + memory + chrome.
 *
 * Signing in is what saves a board, not what opens one: a signed-out visitor
 * gets the same app over a local-only store (sync.js `guest`), told plainly
 * that nothing here reaches an account, and offered the chance to keep those
 * notes the first time they do sign in.
 *
 * Layout has one breakpoint that matters. At ≥1100px memory is a permanent
 * right-hand sidebar and the Board/Memory tabs are pointless, so they go away;
 * below that memory is a tab and the board owns the whole canvas.
 */
import { initAuth, wireAuthLink, loginUrl } from './engine/auth.js';
import { clearGuestState, createStore, readGuestState } from './sync.js';
import { createBoard } from './board.js';
import { createMemory } from './memory.js';
import { createTable } from './table.js';
import { createWiki } from './wiki.js';
import { drainPendingImport } from './extension-bridge.js';
import {
  BOOK_SVG,
  BOLD_SVG,
  BULLET_LIST_SVG,
  LINK_SVG,
  MEDIA_SVG,
  PEN_SVG,
  PIN_SVG,
  TAG_SVG,
  TRASH_SVG,
  approach,
  BOARD_VIEW_KEY,
  BOARD_VIEW_KEY_V1,
  TAB_KEY,
  defaultBoardView,
  defaultTab,
  phoneBoardViewNeedsReset,
  KEYBOARD_INSET_TAU,
  keyboardLayout,
  stateIsEmpty,
  stateToOps,
} from './notes.js';

const CANVAS_VIEW_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="7" height="6" rx="1.2"/><rect x="13" y="5" width="7" height="6" rx="1.2"/><rect x="4" y="13" width="7" height="6" rx="1.2"/><rect x="13" y="13" width="7" height="6" rx="1.2"/></svg>';
const TABLE_VIEW_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v16"/></svg>';

const $ = (sel) => document.querySelector(sel);

const HINTS_KEY = 'sticky-notes-hints-v1';
const SIDEBAR_KEY = 'sticky-notes-sidebar';
const GUESTBAR_KEY = 'sticky-notes-guestbar';

// Set at boot; the guide and the empty state both have something extra to say
// when the board cannot be saved.
let guestMode = false;

// Home-screen install: iOS reports it on navigator, everyone else in CSS.
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
  document.documentElement.classList.add('sn-standalone');
}

const wide = window.matchMedia('(min-width: 1100px)');
const sheetMode = window.matchMedia('(max-width: 719px)');
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

function readLocal(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- toast

const toastEl = $('#toast');
const toastText = $('#toast-text');
const toastUndo = $('#toast-undo');
let toastTimer = null;
let undoAction = null;

function showToast(message, { undo = null, ms = undo ? 10000 : 2400 } = {}) {
  toastText.textContent = message;
  undoAction = undo;
  toastUndo.hidden = !undo;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), ms);
}

toastUndo.addEventListener('click', () => {
  if (undoAction) undoAction();
  undoAction = null;
  toastEl.classList.remove('is-visible');
});

// ---------------------------------------------------------------- overlays

const scrim = $('#scrim');
const guide = $('#guide');
const guideBody = $('#guide-body');
const helpBtn = $('#board-help');
const sheet = $('#sheet');
const sheetTitle = $('#sheet-title');
const sheetBody = $('#sheet-body');
const moreBtn = $('#more-btn');
const moreMenu = $('#more-menu');

function syncScrim() {
  scrim.hidden = sheet.hidden && (guide.hidden || !sheetMode.matches);
}

function closeGuide() {
  guide.hidden = true;
  helpBtn.setAttribute('aria-expanded', 'false');
  syncScrim();
}

function closeSheet() {
  sheet.hidden = true;
  syncScrim();
}

function closeMenu() {
  moreMenu.hidden = true;
  moreBtn.setAttribute('aria-expanded', 'false');
}

/** Anchor the guide under the ? button on web; on phones CSS makes it a sheet. */
function placeGuide() {
  if (sheetMode.matches) {
    guide.style.top = '';
    guide.style.left = '';
    return;
  }
  const r = helpBtn.getBoundingClientRect();
  guide.style.top = `${r.bottom + 8}px`;
  guide.style.left = `${Math.max(8, Math.min(r.right - guide.offsetWidth, window.innerWidth - guide.offsetWidth - 8))}px`;
}

/**
 * One bottom sheet, used for choices that would otherwise be a window.prompt.
 * `options` are one-tap picks; `input` adds a "make a new one" row.
 */
function openSheet({ title, hint = '', options = [], input = null }) {
  closeGuide();
  sheetTitle.textContent = title;
  sheetBody.innerHTML = '';
  if (hint) {
    const p = document.createElement('p');
    p.className = 'sn-mem-note';
    p.textContent = hint;
    sheetBody.appendChild(p);
  }
  for (const option of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sn-menu-item';
    b.textContent = option.label;
    if (option.selected) b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', () => {
      closeSheet();
      option.onSelect();
    });
    sheetBody.appendChild(b);
  }
  if (input) {
    const form = document.createElement('form');
    form.className = 'sn-sheet-form';
    const field = document.createElement('input');
    field.className = 'sn-mem-search';
    field.placeholder = input.placeholder || '';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'sn-btn sn-btn-primary';
    submit.textContent = input.submitLabel || 'Save';
    form.append(field, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = field.value.trim();
      if (!value) return;
      closeSheet();
      input.onSubmit(value);
    });
    sheetBody.appendChild(form);
  }
  sheet.hidden = false;
  syncScrim();
}

scrim.addEventListener('click', () => {
  closeSheet();
  closeGuide();
});
$('#sheet-close').addEventListener('click', closeSheet);
$('#guide-close').addEventListener('click', closeGuide);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!sheet.hidden) closeSheet();
  else if (!guide.hidden) closeGuide();
  else closeMenu();
});

// Popovers close when the press lands somewhere else.
document.addEventListener('pointerdown', (e) => {
  if (!moreMenu.hidden && !e.target.closest('.sn-more')) closeMenu();
  if (!guide.hidden && !sheetMode.matches && !e.target.closest('#guide, #board-help')) closeGuide();
}, true);

// ---------------------------------------------------------------- icon guide

function glyphNode(entry) {
  const span = document.createElement('span');
  span.className = 'sn-guide-glyph';
  if (entry.svg) span.innerHTML = entry.svg;
  else span.textContent = entry.glyph;
  return span;
}

function guideGroups() {
  const touch = coarse();
  return [
    {
      title: 'Toolbar',
      rows: [
        { glyph: '+', name: 'Add a note', text: 'Drops a blank note in the first free space and opens it for typing. In the table view it creates a row and focuses it.' },
        {
          glyph: '▦',
          name: 'Canvas or table',
          text: touch
            ? 'Same notes, as a list or as cards. The board is the default; switch to the list to scan, then back to move notes, write on the board, or zoom.'
            : 'The same board notes, as cards or as a list. Switching does not move or file anything.',
        },
        {
          svg: PEN_SVG,
          name: 'Write on the board',
          text: touch
            ? 'Then tap the board to write there. Board text is scaffolding — labels, headings, a word between two arrows. Wiping the board removes it; it never goes to memory.'
            : 'Then click the board to write there (or press T). Board text is scaffolding — labels, headings, a word between two arrows. Wiping the board removes it; it never goes to memory.',
        },
        touch
          ? { glyph: '⋯', name: 'More', text: 'Select every note, fit them all on screen, or wipe the board.' }
          : { glyph: '±', name: 'Zoom', text: 'Ctrl/⌘ + scroll does the same. The middle button fits every note on screen.' },
        touch
          ? null
          : {
              glyph: '⧉',
              name: 'Select all',
              text: 'Every note on the board at once (⌘/Ctrl+A). File them to memory, or Delete them for good.',
            },
        { glyph: '?', name: 'This guide', text: 'Also brings the board hint back.' },
      ].filter(Boolean),
    },
    {
      title: 'On the note you are editing',
      rows: [
        { svg: TRASH_SVG, name: 'Delete', text: 'Removes the note for good. You get ten seconds to undo.' },
        { svg: PIN_SVG, name: 'Pin', text: 'Pinned notes stay put when you wipe the board.' },
        { glyph: '●', name: 'Colour', text: 'Fills the whole note. Colours are yours to mean anything; rename them from the memory filters.' },
        { svg: TAG_SVG, name: 'Icon', text: 'Same idea as colour, in the corner of the note — and filterable in memory.' },
        {
          svg: BOLD_SVG,
          name: 'Bold',
          text: '⌘/Ctrl+B works too. Formatting is deliberately just this, plus the two list buttons.',
        },
        {
          svg: BULLET_LIST_SVG,
          name: 'Lists',
          text: 'Or type “* ” at the start of a line for bullets, “1. ” for numbers — the marker turns into the list.',
        },
        {
          svg: LINK_SVG,
          name: 'Link',
          text: '⌘/Ctrl+K, or paste a URL while editing — it becomes a pill. Display text starts as the domain and picks up the page title unless you rename it.',
        },
        {
          svg: MEDIA_SVG,
          name: 'Image or video',
          text: 'Adds one tidy preview below the note: direct images or video, Pinterest images, Instagram posts and Reels, TikToks, or YouTube.',
        },
        { glyph: '✓', name: 'Done', text: 'Closes the note. Clicking anywhere else saves it too.' },
      ],
    },
    {
      title: 'A collection page',
      rows: [
        {
          svg: BOOK_SVG,
          name: 'Page',
          text: 'Name notes as a collection (the board bar, or + New collection), then open Page. That is the wiki.',
        },
      ],
    },
    {
      title: 'A selection',
      rows: [
        {
          svg: TAG_SVG,
          name: 'Group notes under a name',
          text: 'Select a few notes, type a name in the bar at the bottom of the board, and they become a collection. File it and the whole group moves to memory together — nothing is deleted, and anything can come back.',
        },
        {
          svg: TRASH_SVG,
          name: 'Delete the selection',
          text: touch
            ? 'Delete on that bar throws the selected notes away for good — ten seconds to undo. File keeps them, in memory.'
            : 'Delete on that bar (or Shift+Delete) throws the selected notes away for good — ten seconds to undo. File keeps them, in memory.',
        },
      ],
    },
    {
      title: touch ? 'Touch' : 'Mouse and keyboard',
      rows: touch
        ? [
            { glyph: '⇢', name: 'Tap a note', text: 'Types into it. Drag past a small slop to move it.' },
            { glyph: '⇲', name: 'Drag a note or the board', text: 'A note moves; empty board pans. Pinch with two fingers to zoom.' },
            { glyph: '⏱', name: 'Long-press a note', text: 'Starts a selection — then tap notes to add, and tap the board when you are done.' },
            { glyph: '⊕', name: 'Double-tap the board', text: 'Makes a new note there.' },
          ]
        : [
            { glyph: '⇢', name: 'Click a note', text: 'Types into it, with the caret where you clicked. Drag instead to move it.' },
            { glyph: '⇲', name: 'Drag empty board', text: 'Rubber-band selects. Scroll to pan, hold Space to drag the canvas.' },
            { glyph: '○', name: 'Edge dots', text: 'Drag a dot from one note onto another to draw an arrow.' },
            {
              glyph: 'N',
              name: 'Keyboard',
              text: 'N makes a note, T writes on the board, P pins the selection, ⌘/Ctrl+A selects every note, Delete files the selection, Shift+Delete throws it away, Esc clears.',
            },
          ],
    },
    guestMode
      ? {
          title: 'Saving',
          rows: [
            {
              glyph: '⌂',
              name: 'This board is local',
              text: 'Everything you make stays in this browser and syncs nowhere. Create an account from the top of the page to save it and open it on your other devices — the notes you already made come with you.',
            },
          ],
        }
      : null,
  ].filter(Boolean);
}

function renderGuide() {
  guideBody.innerHTML = '';
  for (const group of guideGroups()) {
    const section = document.createElement('section');
    section.className = 'sn-guide-group';
    const h = document.createElement('p');
    h.className = 'sn-guide-grouptitle';
    h.textContent = group.title;
    section.appendChild(h);
    for (const row of group.rows) {
      const line = document.createElement('div');
      line.className = 'sn-guide-row';
      const text = document.createElement('div');
      text.className = 'sn-guide-text';
      const b = document.createElement('b');
      b.textContent = row.name;
      const s = document.createElement('span');
      s.textContent = row.text;
      text.append(b, s);
      line.append(glyphNode(row), text);
      section.appendChild(line);
    }
    guideBody.appendChild(section);
  }
}

function openGuide() {
  closeSheet();
  renderGuide();
  guide.hidden = false;
  helpBtn.setAttribute('aria-expanded', 'true');
  placeGuide();
  syncScrim();
}

helpBtn.addEventListener('click', () => {
  if (guide.hidden) openGuide();
  else closeGuide();
});
window.addEventListener('resize', () => {
  if (!guide.hidden) placeGuide();
});

// ---------------------------------------------------------------- first-use hint

const hintStrip = $('#hint-strip');
const hintText = $('#hint-text');

function hintCopy() {
  return coarse()
    ? 'Tap to type · drag to move · the list is a toggle, not the default'
    : 'Click a note to type · drag it to move · select a few and name them to make a collection';
}

function showHints() {
  hintText.textContent = hintCopy();
  hintStrip.hidden = false;
}

function dismissHints() {
  hintStrip.hidden = true;
  writeLocal(HINTS_KEY, 'dismissed');
}

$('#hint-dismiss').addEventListener('click', dismissHints);
$('#guide-hints').addEventListener('click', () => {
  writeLocal(HINTS_KEY, '');
  showHints();
  closeGuide();
});

// ---------------------------------------------------------------- guest strip

const guestbar = $('#guestbar');
const guestChip = $('#guest-chip');

/**
 * A signed-out board is honest about itself. The strip can be dismissed — it
 * sits above the canvas and would wear out its welcome — but the nav chip that
 * brings it back does not go away, so "local only" is always on screen.
 */
function showGuestNotice({ expired }) {
  guestChip.hidden = false;
  guestChip.textContent = expired ? 'Not saving' : 'Local only';
  $('#guestbar-text').textContent = expired
    ? 'Your session expired. Changes stay on this device until you sign in again.'
    : 'This board is only on this device. Nothing is saved to an account, and it is not synced anywhere.';
  const cta = $('#guestbar-cta');
  cta.textContent = expired ? 'Sign in' : 'Create an account or sign in';
  cta.href = loginUrl();
  const guest = $('#board-empty-guest');
  guest.hidden = false;
  guest.textContent = expired
    ? 'Sign in again to load and save your board.'
    : 'Local only — create an account to save what you write here.';
  if (readLocal(GUESTBAR_KEY) !== 'dismissed') guestbar.hidden = false;
}

$('#guestbar-close').addEventListener('click', () => {
  guestbar.hidden = true;
  writeLocal(GUESTBAR_KEY, 'dismissed');
});

guestChip.addEventListener('click', () => {
  const open = guestbar.hidden;
  guestbar.hidden = !open;
  writeLocal(GUESTBAR_KEY, open ? '' : 'dismissed');
});

/**
 * The first sign-in after a guest session. A local board is never adopted
 * behind the user's back and never thrown away without asking; either answer
 * clears it, so the question is asked once.
 */
function offerGuestNotes(store) {
  const guest = readGuestState();
  if (!guest || stateIsEmpty(guest)) {
    clearGuestState();
    return;
  }
  const count = guest.notes.length;
  const label = count === 1 ? '1 note' : `${count} notes`;
  openSheet({
    title: 'Keep the notes you made before signing in?',
    hint: `${label} were made on this device without an account, so they were never saved. Keeping them adds them to this board.`,
    options: [
      {
        label: `Keep ${label}`,
        onSelect: () => {
          store.dispatch(stateToOps(guest));
          clearGuestState();
          showToast(`${label} added to your board`);
        },
      },
      {
        label: 'Discard them',
        onSelect: () => {
          clearGuestState();
          showToast('Those local notes were discarded');
        },
      },
    ],
  });
}

// ---------------------------------------------------------------- boot

async function init() {
  // ?local=1 skips the auth round-trip for static-server dev (python3 -m
  // http.server). Signed out is the same path: a local-only store.
  const localMode = new URLSearchParams(location.search).has('local');
  const auth = localMode
    ? { configured: false, signedIn: false, token: null }
    : await initAuth();
  wireAuthLink(auth);

  // No token, nothing to sync. An expired session keeps its own mirror (and its
  // pending ops) so re-signing in picks up where it left off; everyone else
  // gets the guest board, which lives under a key of its own.
  const expired = Boolean(auth.needsReauth);
  guestMode = !auth.token;

  $('#app').hidden = false;

  $('#board-empty-sub').textContent = coarse()
    ? 'Tap + above, or double-tap the board. Then tap a note to type into it.'
    : 'Press N, double-click the board, or paste something. Then click a note to type into it.';

  const store = createStore({ token: auth.token, guest: guestMode && !expired });
  store.migrateLegacy();
  drainPendingImport();
  if (guestMode) showGuestNotice({ expired });

  function wikiIdFromHash() {
    const match = /^#wiki\/(.+)$/.exec(location.hash);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  function setWikiHash(id) {
    const next = id ? `#wiki/${encodeURIComponent(id)}` : '';
    if ((location.hash || '') === next) return;
    if (id) location.hash = next;
    else history.replaceState(null, '', `${location.pathname}${location.search}`);
  }

  const board = createBoard({
    store,
    showToast,
    onOpenWiki: (id) => openWiki(id),
    onEdit: (active) => {
      document.documentElement.classList.toggle('sn-editing', Boolean(active));
      if (active && !hintStrip.hidden) dismissHints();
    },
    els: {
      viewport: $('#viewport'),
      world: $('#world'),
      arrowLayer: $('#arrow-layer'),
      rubber: $('#rubber'),
      empty: $('#board-empty'),
      hintStrip,
      actionbar: $('#actionbar'),
      abCount: $('#ab-count'),
      abSwatches: $('#ab-swatches'),
      abIcon: $('#ab-icon'),
      abIconPop: $('#ab-iconpop'),
      abPin: $('#ab-pin'),
      abName: $('#ab-name'),
      abPage: $('#ab-page'),
      abFile: $('#ab-file'),
      abDelete: $('#ab-delete'),
      abHint: $('#ab-hint'),
      collectionNames: $('#collection-names'),
      zoomLabel: $('#zoom-fit'),
      addText: $('#add-text'),
      editbar: $('#editbar'),
      ebTrash: $('#eb-trash'),
      ebPin: $('#eb-pin'),
      ebColor: $('#eb-color'),
      ebIcon: $('#eb-icon'),
      ebBold: $('#eb-bold'),
      ebBullets: $('#eb-bullets'),
      ebNumbers: $('#eb-numbers'),
      ebLink: $('#eb-link'),
      ebLinkPop: $('#eb-linkpop'),
      ebMedia: $('#eb-media'),
      ebMediaPop: $('#eb-media-pop'),
      ebMediaUrl: $('#eb-media-url'),
      ebMediaSave: $('#eb-media-save'),
      ebMediaRemove: $('#eb-media-remove'),
      ebMediaError: $('#eb-media-error'),
      ebDone: $('#eb-done'),
      ebPalette: $('#eb-palette'),
      ebIconPop: $('#eb-iconpop'),
    },
  });

  const memory = createMemory({
    store,
    showToast,
    openSheet,
    onOpenWiki: (id) => openWiki(id),
    onRestore: (ids) => {
      closeWiki();
      if (!wide.matches) setTab('board');
      board.revealNotes(ids);
    },
    onRestoreDragBegin: () => {
      if (!wide.matches) setTab('board');
      if (boardView === 'table') setBoardView('canvas');
    },
    onRestoreDragHover: (clientX, clientY) => board.containsClientPoint(clientX, clientY),
    onRestoreDrop: (note, clientX, clientY) => {
      if (!board.containsClientPoint(clientX, clientY)) return false;
      const p = board.clientToWorld(clientX, clientY);
      const ts = new Date().toISOString();
      const x = p.x - (note.w || 220) / 2;
      const y = p.y - 24;
      store.dispatch([
        { op: 'restore', ids: [note.id], ts },
        { op: 'note.move', id: note.id, x, y, ts },
      ]);
      showToast('Restored to board');
      board.pulseNotes([note.id]);
      return true;
    },
    els: {
      pane: $('#memory-pane'),
      list: $('#mem-list'),
      search: $('#mem-search'),
      collectionSelect: $('#mem-collection'),
      more: $('#mem-more'),
      newCollection: $('#mem-new-col'),
      newCollectionHint: $('#mem-new-col-hint'),
      count: $('#memory-count'),
      sideCount: $('#sidebar-count'),
    },
  });

  // ------------------------------------------------------------ layout

  const tabBoard = $('#tab-board');
  const tabMemory = $('#tab-memory');
  const viewport = $('#viewport');
  const sidebar = $('#sidebar');
  const memoryPane = $('#memory-pane');
  const boardActions = $('#board-actions');
  const sidebarToggle = $('#sidebar-toggle');
  const tablePane = $('#table-pane');
  const wikiPane = $('#wiki-pane');
  const viewCanvas = $('#view-canvas');
  const viewTable = $('#view-table');

  const wiki = createWiki({
    store,
    showToast,
    onBack: () => closeWiki(),
    onJumpNote: (note) => {
      closeWiki();
      if (note.status === 'board') {
        if (!wide.matches) setTab('board');
        board.revealNotes([note.id]);
      } else if (!wide.matches) {
        setTab('memory');
      }
    },
    onRename: (col) => {
      const next = window.prompt('Rename collection:', col.name);
      if (next === null || !next.trim()) return;
      store.dispatch([{ op: 'collection.rename', id: col.id, name: next.trim(), ts: new Date().toISOString() }]);
    },
    els: {
      pane: wikiPane,
      back: $('#wiki-back'),
      title: $('#wiki-title'),
      notesToggle: $('#wiki-notes-toggle'),
      outline: $('#wiki-outline'),
      toc: $('#wiki-toc'),
      draft: $('#wiki-draft'),
      editor: $('#wiki-editor'),
      format: $('#wiki-format'),
      btnH1: $('#wiki-h1'),
      btnH2: $('#wiki-h2'),
      btnBold: $('#wiki-bold'),
      btnBullets: $('#wiki-bullets'),
      btnNumbers: $('#wiki-numbers'),
      btnLink: $('#wiki-link'),
      btnHr: $('#wiki-hr'),
      linkPop: $('#wiki-linkpop'),
    },
  });

  function openWiki(id) {
    if (!id) return;
    if (!(wiki.isOpen() && wiki.collectionId() === id)) wiki.open(id);
    setWikiHash(id);
    document.documentElement.classList.add('sn-wiki-open');
    applyLayout();
  }

  function closeWiki() {
    wiki.flush();
    wiki.close();
    setWikiHash('');
    document.documentElement.classList.remove('sn-wiki-open');
    applyLayout();
  }

  let tab = defaultTab(readLocal(TAB_KEY), { coarse: coarse(), width: window.innerWidth });
  let collapsed = readLocal(SIDEBAR_KEY) === 'collapsed';
  const boardViewOpts = {
    coarse: coarse(),
    width: window.innerWidth,
    legacy: readLocal(BOARD_VIEW_KEY_V1),
  };
  const storedBoardView = readLocal(BOARD_VIEW_KEY);
  let boardView = defaultBoardView(storedBoardView, boardViewOpts);
  if (phoneBoardViewNeedsReset(storedBoardView, boardViewOpts)) {
    writeLocal(BOARD_VIEW_KEY, 'canvas');
  }

  const table = createTable({
    store,
    showToast,
    onViewCanvas: () => setBoardView('canvas'),
    els: { root: $('#table-root') },
  });

  function applyBoardViewChrome() {
    const tableOn = boardView === 'table';
    document.documentElement.classList.toggle('sn-table-view', tableOn);
    viewCanvas.setAttribute('aria-pressed', String(!tableOn));
    viewTable.setAttribute('aria-pressed', String(tableOn));
  }

  function applyLayout() {
    const tableOn = boardView === 'table';
    const wikiOn = wiki.isOpen();
    applyBoardViewChrome();
    wikiPane.hidden = !wikiOn;
    document.documentElement.classList.toggle('sn-wiki-open', wikiOn);
    if (wikiOn) {
      viewport.hidden = true;
      tablePane.hidden = true;
      boardActions.hidden = true;
      if (wide.matches) {
        sidebar.hidden = false;
        sidebar.classList.toggle('is-collapsed', collapsed);
        memoryPane.hidden = collapsed;
        sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
        const label = collapsed ? 'Expand memory' : 'Collapse memory';
        sidebarToggle.setAttribute('aria-label', label);
        sidebarToggle.title = label;
      } else {
        sidebar.hidden = true;
        sidebar.classList.remove('is-collapsed');
        memoryPane.hidden = false;
      }
    } else if (wide.matches) {
      // Board and memory are both on screen; the tabs have nothing to do.
      viewport.hidden = tableOn;
      tablePane.hidden = !tableOn;
      sidebar.hidden = false;
      boardActions.hidden = false;
      sidebar.classList.toggle('is-collapsed', collapsed);
      memoryPane.hidden = collapsed;
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      const label = collapsed ? 'Expand memory' : 'Collapse memory';
      sidebarToggle.setAttribute('aria-label', label);
      sidebarToggle.title = label;
    } else {
      const onBoard = tab === 'board';
      viewport.hidden = !onBoard || tableOn;
      tablePane.hidden = !onBoard || !tableOn;
      sidebar.hidden = onBoard;
      sidebar.classList.remove('is-collapsed');
      memoryPane.hidden = false;
      boardActions.hidden = !onBoard;
      if (!onBoard) board.clearSelection();
    }
    tabBoard.setAttribute('aria-selected', String(tab === 'board'));
    tabMemory.setAttribute('aria-selected', String(tab === 'memory'));
    if (!memoryPane.hidden && !sidebar.hidden) memory.rerender();
    if (!tablePane.hidden) table.rerender();
    board.relayout();
  }

  function setBoardView(which) {
    boardView = which === 'table' ? 'table' : 'canvas';
    writeLocal(BOARD_VIEW_KEY, boardView);
    if (boardView === 'table') board.clearSelection();
    applyLayout();
  }

  function setTab(which) {
    tab = which === 'memory' ? 'memory' : 'board';
    writeLocal(TAB_KEY, tab);
    applyLayout();
  }

  tabBoard.addEventListener('click', () => setTab('board'));
  tabMemory.addEventListener('click', () => setTab('memory'));
  sidebarToggle.addEventListener('click', () => {
    collapsed = !collapsed;
    writeLocal(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open');
    applyLayout();
  });
  wide.addEventListener('change', applyLayout);

  // ------------------------------------------------------------ toolbar

  $('.sn-pen-glyph').innerHTML = PEN_SVG;
  viewCanvas.innerHTML = CANVAS_VIEW_SVG;
  viewTable.innerHTML = TABLE_VIEW_SVG;
  viewCanvas.addEventListener('click', () => setBoardView('canvas'));
  viewTable.addEventListener('click', () => setBoardView('table'));
  $('#add-note').addEventListener('click', () => {
    if (boardView === 'table') table.createNote();
    else board.createNote();
  });
  $('#add-text').addEventListener('click', () => board.startText());
  $('#select-all').addEventListener('click', () => board.selectAll());
  $('#wipe-board').addEventListener('click', () => board.wipe());
  $('#zoom-in').addEventListener('click', board.zoomIn);
  $('#zoom-out').addEventListener('click', board.zoomOut);
  $('#zoom-fit').addEventListener('click', board.zoomFit);

  moreBtn.addEventListener('click', () => {
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
  });
  $('#menu-select-all').addEventListener('click', () => {
    closeMenu();
    board.selectAll();
  });
  $('#menu-fit').addEventListener('click', () => {
    closeMenu();
    board.zoomFit();
  });
  $('#menu-wipe').addEventListener('click', () => {
    closeMenu();
    board.wipe();
  });

  window.addEventListener('sticky-notes-imported', () => {
    showToast('Notes from the extension were added to your board');
  });

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  let kbDisplay = null;
  let kbTarget = null;
  let kbRaf = 0;
  let kbLast = 0;
  let kbClosing = false;

  function writeKbVars(html, next) {
    html.style.setProperty('--sn-vv-height', `${next.height}px`);
    html.style.setProperty('--sn-vv-top', `${next.offsetTop}px`);
  }

  function clearKbInset(html) {
    html.classList.remove('sn-kb-inset');
    html.style.removeProperty('--sn-vv-height');
    html.style.removeProperty('--sn-vv-top');
    kbDisplay = null;
    kbTarget = null;
    kbClosing = false;
    board.relayout();
  }

  function tickKeyboardInset(ts) {
    const html = document.documentElement;
    if (!kbTarget || !kbDisplay) {
      kbRaf = 0;
      kbLast = 0;
      return;
    }
    const dt = kbLast ? Math.min(0.05, (ts - kbLast) / 1000) : 1 / 60;
    kbLast = ts;
    kbDisplay = {
      height: approach(kbDisplay.height, kbTarget.height, dt, KEYBOARD_INSET_TAU),
      offsetTop: approach(kbDisplay.offsetTop, kbTarget.offsetTop, dt, KEYBOARD_INSET_TAU),
    };
    writeKbVars(html, kbDisplay);
    board.relayout();
    const settled =
      Math.abs(kbTarget.height - kbDisplay.height) < 0.5
      && Math.abs(kbTarget.offsetTop - kbDisplay.offsetTop) < 0.5;
    if (!settled) {
      kbRaf = requestAnimationFrame(tickKeyboardInset);
      return;
    }
    writeKbVars(html, kbTarget);
    kbDisplay = { ...kbTarget };
    kbRaf = 0;
    kbLast = 0;
    if (kbClosing) clearKbInset(html);
    else board.relayout();
  }

  function applyKeyboardInset() {
    const html = document.documentElement;
    const onPhone = coarse() && window.innerWidth <= 720;
    const layout = keyboardLayout(window.visualViewport, window.innerHeight);
    if (!onPhone || !layout.active) {
      if (!html.classList.contains('sn-kb-inset') && !kbClosing) return;
      if (reducedMotion()) {
        if (kbRaf) cancelAnimationFrame(kbRaf);
        kbRaf = 0;
        kbLast = 0;
        clearKbInset(html);
        return;
      }
      kbClosing = true;
      kbTarget = { height: window.innerHeight, offsetTop: 0 };
      if (!kbDisplay) kbDisplay = { ...kbTarget };
      if (!kbRaf) kbRaf = requestAnimationFrame(tickKeyboardInset);
      return;
    }

    const next = { height: layout.height, offsetTop: layout.offsetTop };
    kbClosing = false;
    if (!html.classList.contains('sn-kb-inset')) {
      kbDisplay = { height: window.innerHeight, offsetTop: 0 };
      writeKbVars(html, kbDisplay);
      html.classList.add('sn-kb-inset');
    } else if (!kbDisplay) {
      kbDisplay = {
        height: parseFloat(html.style.getPropertyValue('--sn-vv-height')) || next.height,
        offsetTop: parseFloat(html.style.getPropertyValue('--sn-vv-top')) || 0,
      };
    }
    kbTarget = next;
    if (reducedMotion()) {
      if (kbRaf) cancelAnimationFrame(kbRaf);
      kbRaf = 0;
      kbLast = 0;
      kbDisplay = { ...next };
      writeKbVars(html, kbDisplay);
      board.relayout();
      return;
    }
    if (!kbRaf) kbRaf = requestAnimationFrame(tickKeyboardInset);
  }

  window.visualViewport?.addEventListener('resize', applyKeyboardInset);
  window.visualViewport?.addEventListener('scroll', applyKeyboardInset);
  window.addEventListener('resize', applyKeyboardInset);

  applyLayout();
  applyKeyboardInset();
  if (readLocal(HINTS_KEY) !== 'dismissed') showHints();

  window.addEventListener('hashchange', () => {
    const id = wikiIdFromHash();
    if (id) openWiki(id);
    else if (wiki.isOpen()) closeWiki();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !wiki.isOpen()) return;
    if (e.target.closest?.('#wiki-editor, .sn-linkpop, #wiki-format')) return;
    e.preventDefault();
    if (wiki.isDrawer()) wiki.setDrawer(false);
    else closeWiki();
  });

  await store.loadFromServer();
  // Signed in with a guest board still in the browser: ask before touching it.
  if (!guestMode) offerGuestNotes(store);

  const bootWiki = wikiIdFromHash();
  if (bootWiki) openWiki(bootWiki);
}

init();

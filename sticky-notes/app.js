/**
 * Sticky Notes boot: auth gate → store → board + memory + chrome.
 *
 * Layout has one breakpoint that matters. At ≥1100px memory is a permanent
 * right-hand sidebar and the Board/Memory tabs are pointless, so they go away;
 * below that memory is a tab and the board owns the whole canvas.
 */
import { initAuth, wireAuthLink, loginUrl } from './engine/auth.js';
import { createStore } from './sync.js';
import { createBoard } from './board.js';
import { createMemory } from './memory.js';
import { drainPendingImport } from './extension-bridge.js';
import { BOLD_SVG, BULLET_LIST_SVG, PEN_SVG, PIN_SVG, TAG_SVG, TRASH_SVG } from './notes.js';

const $ = (sel) => document.querySelector(sel);

const HINTS_KEY = 'sticky-notes-hints-v1';
const SIDEBAR_KEY = 'sticky-notes-sidebar';
const VIEW_KEY = 'sticky-notes-view';

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
        { glyph: '+', name: 'New note', text: 'Drops a note in the first free space and opens it for typing.' },
        {
          svg: PEN_SVG,
          name: 'Write on the board',
          text: touch
            ? 'Then tap the board to write there. Board text is scaffolding — labels, headings, a word between two arrows. Wiping the board removes it; it never goes to memory.'
            : 'Then click the board to write there (or press T). Board text is scaffolding — labels, headings, a word between two arrows. Wiping the board removes it; it never goes to memory.',
        },
        touch
          ? { glyph: '⋯', name: 'More', text: 'Fit every note on screen, or wipe the board.' }
          : { glyph: '±', name: 'Zoom', text: 'Ctrl/⌘ + scroll does the same. The middle button fits every note on screen.' },
        { glyph: '?', name: 'This guide', text: 'Also brings the board hint back.' },
      ],
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
        { glyph: '✓', name: 'Done', text: 'Closes the note. Clicking anywhere else saves it too.' },
      ],
    },
    {
      title: 'Collections',
      rows: [
        {
          svg: TAG_SVG,
          name: 'Group notes under a name',
          text: 'Select a few notes, type a name in the bar at the bottom of the board, and they become a collection. File it and the whole group moves to memory together — nothing is deleted, and anything can come back.',
        },
      ],
    },
    {
      title: touch ? 'Touch' : 'Mouse and keyboard',
      rows: touch
        ? [
            { glyph: '⇢', name: 'Tap a note', text: 'Types into it, right where you tapped.' },
            { glyph: '⇲', name: 'Drag the board', text: 'Pans. Pinch with two fingers to zoom.' },
            { glyph: '⏱', name: 'Long-press a note', text: 'Starts a selection — then tap notes to add, and tap the board when you are done.' },
            { glyph: '⊕', name: 'Double-tap the board', text: 'Makes a new note there.' },
          ]
        : [
            { glyph: '⇢', name: 'Click a note', text: 'Types into it, with the caret where you clicked. Drag instead to move it.' },
            { glyph: '⇲', name: 'Drag empty board', text: 'Rubber-band selects. Scroll to pan, hold Space to drag the canvas.' },
            { glyph: '○', name: 'Edge dots', text: 'Drag a dot from one note onto another to draw an arrow.' },
            { glyph: 'N', name: 'Keyboard', text: 'N makes a note, T writes on the board, P pins the selection, Delete files it, Esc clears.' },
          ],
    },
  ];
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
    ? 'Tap a note to type · drag the board to pan · pinch to zoom · long-press to select'
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

// ---------------------------------------------------------------- boot

async function init() {
  // ?local=1 skips auth for static-server dev (python3 -m http.server); the
  // store runs local-only (no token → the sync queue never flushes).
  const localMode = new URLSearchParams(location.search).has('local');
  const auth = localMode
    ? { configured: false, signedIn: true, token: null }
    : await initAuth();
  if (!localMode) wireAuthLink(auth);

  const gate = $('#gate');
  const app = $('#app');

  if (!auth.signedIn) {
    gate.hidden = false;
    if (auth.needsReauth) {
      const note = $('#gate-note');
      note.hidden = false;
      note.textContent = 'Your session expired — sign in again to load your board.';
      $('#gate-signin').href = loginUrl();
    }
    return;
  }

  gate.hidden = true;
  app.hidden = false;

  $('#board-empty-sub').textContent = coarse()
    ? 'Tap + above, or double-tap the board. Then tap a note to type into it.'
    : 'Press N, double-click the board, or paste something. Then click a note to type into it.';

  const store = createStore({ token: auth.token });
  store.migrateLegacy();
  drainPendingImport();

  const board = createBoard({
    store,
    showToast,
    onEdit: () => {
      if (!hintStrip.hidden) dismissHints();
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
      abFile: $('#ab-file'),
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
      ebDone: $('#eb-done'),
      ebPalette: $('#eb-palette'),
      ebIconPop: $('#eb-iconpop'),
    },
  });

  const memory = createMemory({
    store,
    showToast,
    openSheet,
    onRestore: (ids) => {
      if (!wide.matches) setTab('board');
      board.revealNotes(ids);
    },
    els: {
      pane: $('#memory-pane'),
      list: $('#mem-list'),
      search: $('#mem-search'),
      colorChips: $('#mem-color-chips'),
      iconChips: $('#mem-icon-chips'),
      collectionSelect: $('#mem-collection'),
      more: $('#mem-more'),
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

  let tab = readLocal(VIEW_KEY) === 'memory' ? 'memory' : 'board';
  let collapsed = readLocal(SIDEBAR_KEY) === 'collapsed';

  function applyLayout() {
    if (wide.matches) {
      // Board and memory are both on screen; the tabs have nothing to do.
      viewport.hidden = false;
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
      viewport.hidden = !onBoard;
      sidebar.hidden = onBoard;
      sidebar.classList.remove('is-collapsed');
      memoryPane.hidden = false;
      boardActions.hidden = !onBoard;
      if (!onBoard) board.clearSelection();
    }
    tabBoard.setAttribute('aria-selected', String(tab === 'board'));
    tabMemory.setAttribute('aria-selected', String(tab === 'memory'));
    if (!memoryPane.hidden && !sidebar.hidden) memory.rerender();
    board.relayout();
  }

  function setTab(which) {
    tab = which === 'memory' ? 'memory' : 'board';
    writeLocal(VIEW_KEY, tab);
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
  $('#add-note').addEventListener('click', () => board.createNote());
  $('#add-text').addEventListener('click', () => board.startText());
  $('#wipe-board').addEventListener('click', () => board.wipe());
  $('#zoom-in').addEventListener('click', board.zoomIn);
  $('#zoom-out').addEventListener('click', board.zoomOut);
  $('#zoom-fit').addEventListener('click', board.zoomFit);

  moreBtn.addEventListener('click', () => {
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
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

  applyLayout();
  if (readLocal(HINTS_KEY) !== 'dismissed') showHints();

  await store.loadFromServer();
}

init();

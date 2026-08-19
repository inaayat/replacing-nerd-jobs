/**
 * Sticky Notes boot: auth gate → store → board + memory panes + tabs + toast.
 */
import { initAuth, wireAuthLink, loginUrl } from './engine/auth.js';
import { createStore } from './sync.js';
import { createBoard } from './board.js';
import { createMemory } from './memory.js';
import { drainPendingImport } from './extension-bridge.js';

const $ = (sel) => document.querySelector(sel);

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

async function init() {
  const auth = await initAuth();
  wireAuthLink(auth);

  const gate = $('#gate');
  const app = $('#app');

  if (!auth.configured || !auth.signedIn) {
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

  const store = createStore({ token: auth.token });
  store.migrateLegacy();
  drainPendingImport();

  const board = createBoard({
    store,
    showToast,
    els: {
      viewport: $('#viewport'),
      world: $('#world'),
      arrowLayer: $('#arrow-layer'),
      rubber: $('#rubber'),
      empty: $('#board-empty'),
      actionbar: $('#actionbar'),
      abCount: $('#ab-count'),
      abSwatches: $('#ab-swatches'),
      abIcon: $('#ab-icon'),
      abIconPop: $('#ab-iconpop'),
      abPin: $('#ab-pin'),
      abName: $('#ab-name'),
      abFile: $('#ab-file'),
      collectionNames: $('#collection-names'),
      zoomLabel: $('#zoom-fit'),
    },
  });

  const memory = createMemory({
    store,
    showToast,
    els: {
      pane: $('#memory-pane'),
      list: $('#mem-list'),
      search: $('#mem-search'),
      colorChips: $('#mem-color-chips'),
      iconChips: $('#mem-icon-chips'),
      collectionSelect: $('#mem-collection'),
      more: $('#mem-more'),
      count: $('#memory-count'),
    },
  });

  // Tabs
  const tabBoard = $('#tab-board');
  const tabMemory = $('#tab-memory');
  const viewport = $('#viewport');
  const memoryPane = $('#memory-pane');
  const boardActions = $('#board-actions');

  function setTab(which) {
    const onBoard = which === 'board';
    tabBoard.setAttribute('aria-selected', String(onBoard));
    tabMemory.setAttribute('aria-selected', String(!onBoard));
    viewport.hidden = !onBoard;
    memoryPane.hidden = onBoard;
    boardActions.hidden = !onBoard;
    if (!onBoard) {
      board.clearSelection();
      memory.rerender();
    }
    try {
      localStorage.setItem('sticky-notes-view', which);
    } catch {
      /* ignore */
    }
  }
  tabBoard.addEventListener('click', () => setTab('board'));
  tabMemory.addEventListener('click', () => setTab('memory'));

  $('#add-note').addEventListener('click', () => board.createNote());
  $('#wipe-board').addEventListener('click', () => board.wipe());
  $('#zoom-in').addEventListener('click', board.zoomIn);
  $('#zoom-out').addEventListener('click', board.zoomOut);
  $('#zoom-fit').addEventListener('click', board.zoomFit);

  window.addEventListener('sticky-notes-imported', () => {
    showToast('Notes from the extension were added to your board');
  });

  let view = 'board';
  try {
    view = localStorage.getItem('sticky-notes-view') || 'board';
  } catch {
    /* ignore */
  }
  setTab(view === 'memory' ? 'memory' : 'board');

  await store.loadFromServer();
}

init();

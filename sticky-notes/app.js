import {
  NOTE_COLORS,
  createNote,
  deleteNote,
  loadFromLocalStorage,
  mergeStores,
  saveToLocalStorage,
  upsertNote,
} from './notes.js';

const $ = (sel, root = document) => root.querySelector(sel);

let store = loadFromLocalStorage();
let selectedColor = 'yellow';
let dragState = null;

const board = $('#board');
const emptyState = $('#empty-state');
const toast = $('#toast');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function noteColorButton(color) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = color;
  btn.setAttribute('aria-label', `${color} note`);
  btn.style.background = `var(--note-${color})`;
  btn.dataset.color = color;
  btn.setAttribute('aria-pressed', String(color === selectedColor));
  btn.addEventListener('click', () => {
    selectedColor = color;
    document.querySelectorAll('.sn-color-pick button').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.color === color));
    });
  });
  return btn;
}

function renderBoard() {
  board.querySelectorAll('.sn-note').forEach((el) => el.remove());
  const notes = store.notes;
  emptyState.hidden = notes.length > 0;
  for (const note of notes) {
    board.appendChild(renderNote(note));
  }
}

function renderNote(note) {
  const el = document.createElement('article');
  el.className = 'sn-note';
  el.dataset.id = note.id;
  el.dataset.color = note.color;
  el.style.left = `${note.x}px`;
  el.style.top = `${note.y}px`;
  el.style.width = `${note.width}px`;
  el.style.height = `${note.height}px`;
  el.style.transform = `rotate(${note.rotation}deg)`;

  const head = document.createElement('div');
  head.className = 'sn-note-head';

  const actions = document.createElement('div');
  actions.className = 'sn-note-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.title = 'Edit';
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditing(el, note);
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.title = 'Delete';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    store = deleteNote(store, note.id);
    persist();
    renderBoard();
    showToast('Note removed');
  });

  actions.append(editBtn, delBtn);
  head.append(actions);

  const body = document.createElement('div');
  body.className = 'sn-note-body';
  body.textContent = note.text;
  body.addEventListener('dblclick', () => startEditing(el, note));

  el.append(head, body);

  if (note.source?.url) {
    const source = document.createElement('div');
    source.className = 'sn-note-source';
    const link = document.createElement('a');
    link.href = note.source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = note.source.title || note.source.url;
    source.append(link);
    el.append(source);
  }

  wireDrag(el, note);
  wireResize(el, note);
  return el;
}

function startEditing(el, note) {
  const body = $('.sn-note-body', el);
  if (!body || el.classList.contains('is-editing')) return;
  el.classList.add('is-editing');
  body.contentEditable = 'true';
  body.focus();
  const range = document.createRange();
  range.selectNodeContents(body);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = () => {
    body.contentEditable = 'false';
    el.classList.remove('is-editing');
    const text = body.textContent.trim();
    if (!text) {
      store = deleteNote(store, note.id);
      persist();
      renderBoard();
      return;
    }
    store = upsertNote(store, { ...note, text });
    persist();
    body.removeEventListener('blur', finish);
    body.removeEventListener('keydown', onKey);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      body.textContent = note.text;
      finish();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish();
  };

  body.addEventListener('blur', finish);
  body.addEventListener('keydown', onKey);
}

function wireDrag(el, note) {
  const onPointerDown = (e) => {
    if (el.classList.contains('is-editing')) return;
    if (e.target.closest('button, a')) return;
    const rect = board.getBoundingClientRect();
    dragState = {
      id: note.id,
      el,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: note.x,
      originY: note.y,
      boardLeft: rect.left,
      boardTop: rect.top,
      moved: false,
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  };

  const onPointerMove = (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
    dragState.moved = true;
    const x = Math.max(8, dragState.originX + dx);
    const y = Math.max(8, dragState.originY + dy);
    dragState.el.style.left = `${x}px`;
    dragState.el.style.top = `${y}px`;
  };

  const onPointerUp = (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const { el: dragEl, id, moved, originX, originY, startX, startY } = dragState;
    dragEl.releasePointerCapture(e.pointerId);
    dragEl.classList.remove('is-dragging');
    dragState = null;
    if (!moved) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const current = store.notes.find((n) => n.id === id);
    if (!current) return;
    store = upsertNote(store, {
      ...current,
      x: Math.max(8, originX + dx),
      y: Math.max(8, originY + dy),
    });
    persist();
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
}

function wireResize(el, note) {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => {
    if (dragState?.el === el) return;
    const width = Math.round(el.offsetWidth);
    const height = Math.round(el.offsetHeight);
    const current = store.notes.find((n) => n.id === note.id);
    if (!current || (current.width === width && current.height === height)) return;
    store = upsertNote(store, { ...current, width, height });
    persist();
  });
  ro.observe(el);
}

function persist() {
  store = saveToLocalStorage(store);
}

function addNote(text = 'New note') {
  const rect = board.getBoundingClientRect();
  const note = createNote({
    text,
    color: selectedColor,
    x: 24 + Math.random() * Math.max(40, rect.width - 260),
    y: 24 + Math.random() * Math.max(40, rect.height - 220),
  });
  store = upsertNote(store, note);
  persist();
  renderBoard();
  const el = board.querySelector(`[data-id="${note.id}"]`);
  if (el) startEditing(el, note);
}

function importPendingExtensionNotes() {
  try {
    const raw = sessionStorage.getItem('sticky-notes-extension-import');
    if (!raw) return;
    sessionStorage.removeItem('sticky-notes-extension-import');
    store = mergeStores(store, JSON.parse(raw));
    persist();
    renderBoard();
    showToast('Notes from the extension were added to your board');
  } catch {
    /* ignore malformed import */
  }
}

function initToolbar() {
  const colorPick = $('#color-pick');
  NOTE_COLORS.forEach((color) => colorPick.append(noteColorButton(color)));

  $('#add-note')?.addEventListener('click', () => addNote());
  $('#clear-board')?.addEventListener('click', () => {
    if (!store.notes.length) return;
    if (!window.confirm('Clear every sticky note on this board?')) return;
    store = { version: 1, notes: [] };
    persist();
    renderBoard();
    showToast('Board cleared');
  });
}

function init() {
  initToolbar();
  importPendingExtensionNotes();
  renderBoard();
  window.addEventListener('sticky-notes-imported', () => {
    store = loadFromLocalStorage();
    renderBoard();
    showToast('Notes from the extension were added to your board');
  });

  if (window.location.hash === '#new') {
    history.replaceState(null, '', window.location.pathname);
    addNote();
  }
}

init();

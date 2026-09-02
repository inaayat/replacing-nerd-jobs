/**
 * Sticky Notes board-as-table view. Board-status notes only — no ink, no
 * arrows, no ops from merely looking. The canvas is still the source of
 * truth; switching back is the same store.
 *
 * Desktop (≥720px) is a real table. Below that it is a grouped list in the
 * memory-row grammar, because a squeezed five-column table is unreadable.
 */
import {
  COLOR_KEYS,
  DEFAULT_COLOR_KEY,
  PIN_SVG,
  blankNote,
  colorHex,
  findFreeSlot,
  legendLabel,
  noteBlocks,
  noteCreateSize,
  richToText,
} from './notes.js';
import { attachBodyEditor, renderBody, renderIcon, renderMediaThumb, renderTags } from './body.js';

const NARROW = '(max-width: 719px)';

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function colorRank(key) {
  const i = COLOR_KEYS.indexOf(key);
  return i === -1 ? COLOR_KEYS.length : i;
}

function collectionName(state, note) {
  if (!note.collectionId) return null;
  return state.collections.find((c) => c.id === note.collectionId)?.name || null;
}

export function sortBoardNotes(state, notes) {
  return [...notes].sort((a, b) => {
    const cr = colorRank(a.colorKey) - colorRank(b.colorKey);
    if (cr) return cr;
    const an = collectionName(state, a);
    const bn = collectionName(state, b);
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    if (an && bn) {
      const cmp = an.localeCompare(bn, undefined, { sensitivity: 'base' });
      if (cmp) return cmp;
    }
    return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
  });
}

function groupByColor(state, notes) {
  const groups = [];
  let current = null;
  for (const note of sortBoardNotes(state, notes)) {
    const key = COLOR_KEYS.includes(note.colorKey) ? note.colorKey : null;
    if (!current || current.key !== key) {
      current = { key, notes: [] };
      groups.push(current);
    }
    current.notes.push(note);
  }
  return groups;
}

function actionBtn(label, onClick, extra = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sn-mem-action ${extra}`.trim();
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function createTable({ store, els, showToast, onViewCanvas }) {
  const root = els.root;
  const coarse = () => window.matchMedia('(pointer: coarse)').matches;
  const narrow = () => window.matchMedia(NARROW).matches;
  let editingId = null;
  let editor = null;
  let focusId = null;

  function boardNotes() {
    return store.state.notes.filter((n) => n.status === 'board');
  }

  function noteById(id) {
    return store.state.notes.find((n) => n.id === id);
  }

  function stopEdit({ cancel = false } = {}) {
    if (!editor || !editingId) return;
    const id = editingId;
    const ed = editor;
    editor = null;
    editingId = null;
    const current = noteById(id);
    const stored = current ? noteBlocks(current) : null;
    const rich = cancel ? stored : ed.read();
    const projected = cancel ? current?.text || '' : richToText(rich || []);
    ed.detach();
    if (!current) return;
    if (projected !== current.text || JSON.stringify(rich) !== JSON.stringify(stored)) {
      store.dispatch([
        {
          op: 'note.upsert',
          note: { ...current, text: projected, rich, updatedAt: new Date().toISOString() },
        },
      ]);
    }
  }

  function startEdit(id, host, { selectAll = false } = {}) {
    if (editingId === id && editor) {
      host.focus();
      return;
    }
    if (editingId) stopEdit();
    const note = noteById(id);
    if (!note) return;
    editingId = id;
    host.classList.add('is-editing');
    editor = attachBodyEditor(host, {
      onCommit: () => {
        host.classList.remove('is-editing');
        stopEdit();
      },
      onCancel: () => {
        host.classList.remove('is-editing');
        stopEdit({ cancel: true });
      },
      onUnfurl: (url) => store.unfurl(url),
      shouldIgnoreBlur: (target) => Boolean(target && target.closest?.('.sn-linkpop, .sn-eb-linkpop')),
    });
    editor.host = host;
    host.focus();
    const range = document.createRange();
    range.selectNodeContents(host);
    if (!selectAll) range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function fileNote(note) {
    const ts = new Date().toISOString();
    store.dispatch([{ op: 'file', ids: [note.id], ts }]);
    showToast('1 note filed to memory', {
      undo: () => store.dispatch([{ op: 'restore', ids: [note.id] }]),
    });
  }

  function deleteNote(note) {
    if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;
    if (editingId === note.id) {
      editor?.detach();
      editor = null;
      editingId = null;
    }
    store.dispatch([{ op: 'note.delete', ids: [note.id] }]);
  }

  function pinNote(note) {
    store.dispatch([
      { op: 'note.pin', ids: [note.id], pinned: !note.pinned, ts: new Date().toISOString() },
    ]);
  }

  function rowActions(note) {
    const actions = document.createElement('span');
    actions.className = 'sn-mem-actions sn-tbl-actions';
    actions.append(
      actionBtn('Edit', () => {
        const host = root.querySelector(`[data-id="${note.id}"] .sn-tbl-body`);
        if (host) startEdit(note.id, host, { selectAll: true });
      }),
      actionBtn(note.pinned ? 'Unpin' : 'Pin', () => pinNote(note)),
      actionBtn('File', () => fileNote(note)),
      actionBtn('Delete', () => deleteNote(note), 'sn-mem-danger'),
    );
    return actions;
  }

  function paintPreviewCell(note) {
    const cell = document.createElement('td');
    cell.className = 'sn-tbl-preview';
    if (note.media && renderMediaThumb(cell, note.media)) return cell;
    cell.innerHTML = '<span class="sn-tbl-preview-empty" aria-hidden="true"></span>';
    return cell;
  }

  function paintPreviewChip(note) {
    const chip = document.createElement('span');
    chip.className = 'sn-tbl-preview';
    if (!note.media || !renderMediaThumb(chip, note.media)) chip.hidden = true;
    return chip;
  }

  function paintPreview(host, note) {
    renderBody(host, noteBlocks(note));
    const existing = host.previousElementSibling;
    if (existing?.classList.contains('sn-card-tags')) existing.remove();
    if (!note.tags?.length) return;
    const tags = document.createElement('div');
    tags.className = 'sn-card-tags';
    renderTags(tags, note.tags);
    host.before(tags);
  }

  function colorHeading(key) {
    const wrap = document.createElement('div');
    wrap.className = 'sn-tbl-group';
    const dot = document.createElement('span');
    dot.className = 'sn-mem-dot';
    if (key) {
      dot.style.background = colorHex(key);
      wrap.append(dot, document.createTextNode(legendLabel(store.state.legend, 'color', key)));
    } else {
      wrap.append(document.createTextNode('No colour'));
    }
    return wrap;
  }

  function renderDesktop(notes) {
    const table = document.createElement('table');
    table.className = 'sn-tbl';
    table.innerHTML =
      '<thead><tr>' +
      '<th class="sn-tbl-preview-head" aria-label="Preview"></th>' +
      '<th>Note</th><th>Collection</th><th>Icon</th><th>Pin</th><th>Updated</th><th></th>' +
      '</tr></thead>';
    const tbody = document.createElement('tbody');
    for (const group of groupByColor(store.state, notes)) {
      const head = document.createElement('tr');
      head.className = 'sn-tbl-grouprow';
      const cell = document.createElement('th');
      cell.scope = 'rowgroup';
      cell.colSpan = 7;
      cell.appendChild(colorHeading(group.key));
      head.appendChild(cell);
      tbody.appendChild(head);
      for (const note of group.notes) {
        const tr = document.createElement('tr');
        tr.className = 'sn-tbl-row';
        tr.dataset.id = note.id;
        tr.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');

        const noteTd = document.createElement('td');
        const body = document.createElement('div');
        body.className = 'sn-tbl-body';
        paintPreview(body, note);
        body.addEventListener('click', (e) => {
          if (e.target.closest('a.sn-pill') && editingId !== note.id) return;
          startEdit(note.id, body);
        });
        noteTd.appendChild(body);

        const colTd = document.createElement('td');
        colTd.className = 'sn-tbl-meta';
        colTd.textContent = collectionName(store.state, note) || '—';

        const iconTd = document.createElement('td');
        iconTd.className = 'sn-tbl-icon';
        renderIcon(iconTd, store.state.legend, note.iconKey);

        const pinTd = document.createElement('td');
        pinTd.className = 'sn-tbl-pin';
        if (note.pinned) {
          pinTd.innerHTML = PIN_SVG;
          pinTd.title = 'Pinned';
        }

        const dateTd = document.createElement('td');
        dateTd.className = 'sn-tbl-meta';
        dateTd.textContent = formatDate(note.updatedAt);

        const actTd = document.createElement('td');
        actTd.appendChild(rowActions(note));

        tr.append(paintPreviewCell(note), noteTd, colTd, iconTd, pinTd, dateTd, actTd);
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    root.appendChild(table);
  }

  function renderNarrow(notes) {
    const list = document.createElement('div');
    list.className = 'sn-tbl-list';
    for (const note of sortBoardNotes(store.state, notes)) {
      const row = document.createElement('div');
      row.className = 'sn-mem-row sn-tbl-row sn-tbl-card';
      row.dataset.id = note.id;
      row.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');
      const icon = document.createElement('span');
      icon.className = 'sn-mem-icon';
      renderIcon(icon, store.state.legend, note.iconKey);
      const lead = document.createElement('div');
      lead.className = 'sn-tbl-card-lead';
      const text = document.createElement('span');
      text.className = 'sn-mem-text sn-tbl-body';
      paintPreview(text, note);
      lead.append(icon, paintPreviewChip(note), text);
      const meta = document.createElement('span');
      meta.className = 'sn-mem-meta';
      const col = collectionName(store.state, note);
      meta.textContent = `${col || 'Loose'} · ${formatDate(note.updatedAt)}`;
      const actions = rowActions(note);
      row.append(lead, meta, actions);
      row.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        if (coarse()) row.classList.toggle('is-open');
      });
      text.addEventListener('click', (e) => {
        if (e.target.closest('a.sn-pill') && editingId !== note.id) return;
        e.stopPropagation();
        startEdit(note.id, text);
      });
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  function renderEmpty() {
    const empty = document.createElement('div');
    empty.className = 'sn-tbl-empty';
    const line = document.createElement('p');
    line.className = 'sn-empty-line';
    line.textContent = 'Nothing on the board yet';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'sn-btn';
    back.textContent = 'Back to the canvas';
    back.addEventListener('click', () => onViewCanvas?.());
    empty.append(line, back);
    root.appendChild(empty);
  }

  function rerender() {
    const keepId = editingId;
    if (editor) {
      stopEdit();
    }
    root.innerHTML = '';
    const notes = boardNotes();
    if (!notes.length) {
      renderEmpty();
      return;
    }
    if (narrow()) renderNarrow(notes);
    else renderDesktop(notes);
    if (focusId) {
      const host = root.querySelector(`[data-id="${focusId}"] .sn-tbl-body`);
      if (host) startEdit(focusId, host, { selectAll: true });
      focusId = null;
    } else if (keepId && noteById(keepId)) {
      /* committed; leave the row idle */
    }
  }

  function createNote() {
    const existing = boardNotes();
    const rects = existing.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
    const phone = window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 720;
    const size = noteCreateSize(phone);
    const spot = findFreeSlot({ x: 0, y: 0, w: 2400, h: 1600 }, rects, size.w + 16, size.h + 24);
    const note = blankNote({
      colorKey: DEFAULT_COLOR_KEY,
      x: spot.x,
      y: spot.y,
      w: size.w,
      h: size.h,
    });
    focusId = note.id;
    store.dispatch([{ op: 'note.upsert', note }]);
    if (editingId !== note.id) rerender();
  }

  store.subscribe(() => {
    if (root.hidden || root.closest('[hidden]')) return;
    if (editingId) return;
    rerender();
  });

  window.matchMedia(NARROW).addEventListener('change', () => {
    if (!root.hidden && !root.closest('[hidden]')) rerender();
  });

  return { rerender, createNote };
}

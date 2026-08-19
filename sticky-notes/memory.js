/**
 * Sticky Notes memory — the collapsed table view. Collections plus loose
 * notes, filters by color/icon/collection, client-side full-text search,
 * restore / move / delete actions. Renders at most PAGE rows at a time.
 */
import {
  COLOR_KEYS,
  ICON_KEYS,
  ICON_SVGS,
  colorHex,
  legendLabel,
  randomId,
} from './notes.js';

const PAGE = 200;

export function createMemory({ store, els, showToast }) {
  const filters = { search: '', color: null, icon: null, collection: '' };
  let limit = PAGE;
  let searchTimer = null;

  function memoryNotes() {
    return store.state.notes
      .filter((n) => n.status === 'memory')
      .sort((a, b) => (Date.parse(b.filedAt || b.updatedAt) || 0) - (Date.parse(a.filedAt || a.updatedAt) || 0));
  }

  function matches(note) {
    if (filters.color && note.colorKey !== filters.color) return false;
    if (filters.icon && note.iconKey !== filters.icon) return false;
    if (filters.collection === '__loose__') {
      if (note.collectionId) return false;
    } else if (filters.collection && note.collectionId !== filters.collection) {
      return false;
    }
    if (filters.search && !note.text.toLowerCase().includes(filters.search)) return false;
    return true;
  }

  // ---------------------------------------------------------------- filters UI

  function renderFilterChips() {
    els.colorChips.innerHTML = '';
    for (const key of COLOR_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-mem-chip';
      b.innerHTML = `<span class="sn-mem-dot" style="background:${colorHex(key)}"></span>${legendLabel(store.state.legend, 'color', key)}`;
      b.setAttribute('aria-pressed', String(filters.color === key));
      b.title = 'Click to filter · double-click to rename';
      b.addEventListener('click', () => {
        filters.color = filters.color === key ? null : key;
        rerender();
      });
      b.addEventListener('dblclick', () => renameLegend('color', key));
      els.colorChips.appendChild(b);
    }
    els.iconChips.innerHTML = '';
    for (const key of ICON_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-mem-chip';
      b.innerHTML = `<span class="sn-mem-icon">${ICON_SVGS[key]}</span>${legendLabel(store.state.legend, 'icon', key)}`;
      b.setAttribute('aria-pressed', String(filters.icon === key));
      b.title = 'Click to filter · double-click to rename';
      b.addEventListener('click', () => {
        filters.icon = filters.icon === key ? null : key;
        rerender();
      });
      b.addEventListener('dblclick', () => renameLegend('icon', key));
      els.iconChips.appendChild(b);
    }
    const current = filters.collection;
    els.collectionSelect.innerHTML = '<option value="">All collections</option><option value="__loose__">Loose notes</option>';
    for (const col of store.state.collections) {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = col.name;
      els.collectionSelect.appendChild(opt);
    }
    els.collectionSelect.value = current;
  }

  function renameLegend(kind, key) {
    const label = window.prompt(
      `Rename this ${kind} (applies everywhere):`,
      legendLabel(store.state.legend, kind, key),
    );
    if (label === null) return;
    store.saveLegendLabel(kind, key, label.trim());
  }

  // ---------------------------------------------------------------- rows

  function noteRow(note) {
    const row = document.createElement('div');
    row.className = 'sn-mem-row';
    const dot = document.createElement('span');
    dot.className = 'sn-mem-dot';
    dot.style.background = note.colorKey ? colorHex(note.colorKey) : 'transparent';
    dot.title = note.colorKey ? legendLabel(store.state.legend, 'color', note.colorKey) : '';
    const icon = document.createElement('span');
    icon.className = 'sn-mem-icon';
    icon.innerHTML = note.iconKey ? ICON_SVGS[note.iconKey] : '';
    const text = document.createElement('span');
    text.className = 'sn-mem-text';
    text.textContent = note.text;
    text.title = note.text;
    const meta = document.createElement('span');
    meta.className = 'sn-mem-meta';
    if (note.sourceUrl) {
      const a = document.createElement('a');
      a.href = note.sourceUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = note.sourceTitle || new URL(note.sourceUrl).hostname.replace(/^www\./, '');
      meta.appendChild(a);
      meta.append(' · ');
    }
    meta.append(formatDate(note.filedAt || note.updatedAt));

    const actions = document.createElement('span');
    actions.className = 'sn-mem-actions';
    actions.append(
      actionBtn('Restore', () => {
        store.dispatch([{ op: 'restore', ids: [note.id] }]);
        showToast('Restored to board');
      }),
      actionBtn('Move…', () => moveNote(note)),
      actionBtn('Delete', () => {
        if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;
        store.dispatch([{ op: 'note.delete', ids: [note.id] }]);
      }, 'sn-mem-danger'),
    );
    row.append(dot, icon, text, meta, actions);
    return row;
  }

  function moveNote(note) {
    const names = store.state.collections.map((c) => c.name);
    const answer = window.prompt(
      `Move to which collection? (blank = loose)\nExisting: ${names.join(', ') || '(none yet)'}`,
      '',
    );
    if (answer === null) return;
    const name = answer.trim();
    const ts = new Date().toISOString();
    if (!name) {
      store.dispatch([{ op: 'collection.assign', ids: [note.id], collectionId: null, ts }]);
      return;
    }
    let col = store.state.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const ops = [];
    if (!col) {
      col = { id: randomId(), name };
      ops.push({ op: 'collection.create', id: col.id, name, ts });
    }
    ops.push({ op: 'collection.assign', ids: [note.id], collectionId: col.id, ts });
    store.dispatch(ops);
  }

  function actionBtn(label, onClick, extra = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sn-mem-action ${extra}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function collectionHeader(col, count) {
    const head = document.createElement('div');
    head.className = 'sn-mem-colhead';
    const name = document.createElement('span');
    name.className = 'sn-mem-colname';
    name.textContent = col.name;
    const meta = document.createElement('span');
    meta.className = 'sn-mem-meta';
    meta.textContent = `${count} note${count === 1 ? '' : 's'}${col.filedAt ? ` · filed ${formatDate(col.filedAt)}` : ''}`;
    const actions = document.createElement('span');
    actions.className = 'sn-mem-actions';
    actions.append(
      actionBtn('Restore all', () => {
        store.dispatch([{ op: 'restore', collectionId: col.id }]);
        showToast(`"${col.name}" is back on the board`);
      }),
      actionBtn('Rename', () => {
        const next = window.prompt('Rename collection:', col.name);
        if (next === null || !next.trim()) return;
        store.dispatch([{ op: 'collection.rename', id: col.id, name: next.trim(), ts: new Date().toISOString() }]);
      }),
      actionBtn('Delete', () => {
        const deleteNotes = window.confirm(
          `Delete collection "${col.name}"?\n\nOK — delete the collection AND its notes (permanent)\nCancel — just ungroup (notes become loose)`,
        );
        if (deleteNotes && !window.confirm('Really delete the notes too? This cannot be undone.')) return;
        store.dispatch([{ op: 'collection.delete', id: col.id, deleteNotes }]);
      }, 'sn-mem-danger'),
    );
    head.append(name, meta, actions);
    return head;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---------------------------------------------------------------- render

  function rerender() {
    renderFilterChips();
    els.list.innerHTML = '';
    const notes = memoryNotes().filter(matches);
    const shown = notes.slice(0, limit);
    els.more.hidden = notes.length <= limit;

    const byCollection = new Map();
    const loose = [];
    for (const note of shown) {
      if (note.collectionId && store.state.collections.some((c) => c.id === note.collectionId)) {
        if (!byCollection.has(note.collectionId)) byCollection.set(note.collectionId, []);
        byCollection.get(note.collectionId).push(note);
      } else {
        loose.push(note);
      }
    }

    const cols = store.state.collections
      .filter((c) => byCollection.has(c.id))
      .sort((a, b) => (Date.parse(b.filedAt || b.updatedAt) || 0) - (Date.parse(a.filedAt || a.updatedAt) || 0));

    for (const col of cols) {
      const notesIn = byCollection.get(col.id);
      const section = document.createElement('section');
      section.className = 'sn-mem-collection';
      section.appendChild(collectionHeader(col, notesIn.length));
      for (const note of notesIn) section.appendChild(noteRow(note));
      els.list.appendChild(section);
    }

    if (loose.length) {
      const section = document.createElement('section');
      section.className = 'sn-mem-collection';
      const head = document.createElement('div');
      head.className = 'sn-mem-colhead sn-mem-loose';
      head.innerHTML = `<span class="sn-mem-colname">Loose notes</span><span class="sn-mem-meta">${loose.length} note${loose.length === 1 ? '' : 's'}</span>`;
      section.appendChild(head);
      for (const note of loose) section.appendChild(noteRow(note));
      els.list.appendChild(section);
    }

    if (!shown.length) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'sn-mem-empty';
      emptyEl.textContent = filters.search || filters.color || filters.icon || filters.collection
        ? 'Nothing in memory matches these filters.'
        : 'Memory is empty — file some notes from the board.';
      els.list.appendChild(emptyEl);
    }

    updateCount();
  }

  function updateCount() {
    const total = store.state.notes.filter((n) => n.status === 'memory').length;
    els.count.textContent = total ? String(total) : '';
  }

  // ---------------------------------------------------------------- wiring

  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filters.search = els.search.value.trim().toLowerCase();
      limit = PAGE;
      rerender();
    }, 150);
  });
  els.collectionSelect.addEventListener('change', () => {
    filters.collection = els.collectionSelect.value;
    limit = PAGE;
    rerender();
  });
  els.more.addEventListener('click', () => {
    limit += PAGE;
    rerender();
  });

  store.subscribe((kind) => {
    // Memory is not on the hot path — a coarse re-render on any change is fine
    // when the pane is visible; when hidden, just keep the tab count fresh.
    if (els.pane.hidden) updateCount();
    else rerender();
  });

  rerender();
  return { rerender };
}

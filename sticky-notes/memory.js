/**
 * Sticky Notes memory — the collapsed table view. Collections plus loose
 * notes, filters by color/icon/collection, client-side full-text search,
 * restore / move / delete actions. Renders at most PAGE rows at a time.
 *
 * Renders into the same element whether it is the right-hand sidebar (≥1100px)
 * or the Memory tab below that; only the surrounding chrome differs.
 */
import {
  COLOR_KEYS,
  ICON_KEYS,
  ICON_SVGS,
  colorHex,
  legendLabel,
  noteBlocks,
  randomId,
} from './notes.js';
import { renderBody } from './body.js';

const PAGE = 200;

export function createMemory({ store, els, showToast, openSheet, onRestore, onOpenWiki }) {
  const filters = { search: '', color: null, icon: null, collection: '' };
  let limit = PAGE;
  let searchTimer = null;
  let lastTotal = null;

  const coarse = () => window.matchMedia('(pointer: coarse)').matches;

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
    renderBody(text, noteBlocks(note));
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
        onRestore?.([note.id]);
      }),
      actionBtn('Move…', () => moveNote(note)),
      actionBtn('Delete', () => {
        if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;
        store.dispatch([{ op: 'note.delete', ids: [note.id] }]);
      }, 'sn-mem-danger'),
    );
    row.append(dot, icon, text, meta, actions);
    // No hover on a phone: tapping the row is what reveals its actions.
    row.addEventListener('click', (e) => {
      if (!coarse() || e.target.closest('button, a')) return;
      row.classList.toggle('is-open');
    });
    return row;
  }

  function assignCollection(noteId, collectionId) {
    store.dispatch([
      { op: 'collection.assign', ids: [noteId], collectionId, ts: new Date().toISOString() },
    ]);
  }

  function moveNote(note) {
    const options = store.state.collections.map((col) => ({
      label: col.name,
      selected: note.collectionId === col.id,
      onSelect: () => assignCollection(note.id, col.id),
    }));
    openSheet({
      title: 'Move to collection',
      hint: 'A collection is a named group of notes you can restore or file together.',
      options: [
        ...options,
        { label: 'Loose (no collection)', selected: !note.collectionId, onSelect: () => assignCollection(note.id, null) },
      ],
      input: {
        placeholder: 'New collection…',
        submitLabel: 'Create',
        onSubmit: (name) => {
          const ts = new Date().toISOString();
          const existing = store.state.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            assignCollection(note.id, existing.id);
            return;
          }
          const id = randomId();
          store.dispatch([
            { op: 'collection.create', id, name, ts },
            { op: 'collection.assign', ids: [note.id], collectionId: id, ts },
          ]);
        },
      },
    });
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
        const ids = store.state.notes.filter((n) => n.collectionId === col.id).map((n) => n.id);
        store.dispatch([{ op: 'restore', collectionId: col.id }]);
        showToast(`"${col.name}" is back on the board`);
        onRestore?.(ids);
      }),
      actionBtn('Rename', () => {
        const next = window.prompt('Rename collection:', col.name);
        if (next === null || !next.trim()) return;
        store.dispatch([{ op: 'collection.rename', id: col.id, name: next.trim(), ts: new Date().toISOString() }]);
      }),
      actionBtn('Page', () => onOpenWiki?.(col.id)),
      actionBtn('Delete', () => {
        const deleteNotes = window.confirm(
          `Delete collection "${col.name}" and its page?\n\nOK — delete the collection, its page, AND its notes (permanent)\nCancel — just ungroup (notes become loose; the page is still deleted)`,
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
      .filter((c) => {
        if (byCollection.has(c.id)) return true;
        if (c.status !== 'memory') return false;
        if (filters.color || filters.icon || filters.search) return false;
        if (filters.collection && filters.collection !== c.id) return false;
        return true;
      })
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

    if (!shown.length && !cols.length) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'sn-mem-empty';
      emptyEl.textContent = filters.search || filters.color || filters.icon || filters.collection
        ? 'Nothing in memory matches these filters.'
        : 'Memory is empty. Select notes on the board, name them to make a collection, then File — they land here and can always come back.';
      els.list.appendChild(emptyEl);
    }

    updateCount();
  }

  function updateCount() {
    const total = store.state.notes.filter((n) => n.status === 'memory').length;
    const text = total ? String(total) : '';
    const grew = lastTotal !== null && total > lastTotal;
    for (const el of [els.count, els.sideCount]) {
      if (!el) continue;
      el.textContent = text;
      // Memory is often off screen; a bump is the only signal a note landed.
      if (!grew) continue;
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
    }
    lastTotal = total;
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
  els.newCollection?.addEventListener('click', () => {
    openSheet({
      title: 'New collection',
      hint: 'A named group with its own page. It starts in memory so wiping the board will not file an empty shell.',
      input: {
        placeholder: 'Collection name…',
        submitLabel: 'Create',
        onSubmit: (name) => {
          const existing = store.state.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            onOpenWiki?.(existing.id);
            return;
          }
          const id = randomId();
          const ts = new Date().toISOString();
          store.dispatch([{ op: 'collection.create', id, name, status: 'memory', ts }]);
          onOpenWiki?.(id);
        },
      },
    });
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

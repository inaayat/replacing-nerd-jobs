/**
 * Sticky Notes collection wiki — one page per collection.
 *
 * Opening always works; the stored row is created on first edit. Two layers:
 * a live read-only outline of every note in the collection, and a user-authored
 * body edited with the house block editor (body.js). Pull copies blocks in
 * with noteId provenance; it is not a live embed.
 *
 * Browser-safe, dependency-free ESM. Lives here (not `/lib/`) so the page
 * can load it.
 */
import {
  BOLD_SVG,
  BULLET_LIST_SVG,
  LINK_SVG,
  NUMBER_LIST_SVG,
  RULE_SVG,
  colorHex,
  docIsEmpty,
  draftDocFromNotes,
  emptyDoc,
  noteBlocks,
} from './notes.js';
import { attachBodyEditor, readDoc, renderBody } from './body.js';

const SAVE_DEBOUNCE_MS = 1000;

function notePreview(note) {
  const line = String(note.text || '').split(/\r?\n/).find((part) => part.trim()) || 'Note';
  return line.trim().slice(0, 96);
}

function collectionNotes(state, collectionId) {
  const board = [];
  const memory = [];
  for (const note of state.notes) {
    if (note.collectionId !== collectionId) continue;
    if (note.status === 'memory') memory.push(note);
    else board.push(note);
  }
  board.sort((a, b) => a.y - b.y || a.x - b.x);
  memory.sort(
    (a, b) => (Date.parse(b.filedAt || b.updatedAt) || 0) - (Date.parse(a.filedAt || a.updatedAt) || 0),
  );
  return [...board, ...memory];
}

function wikiRow(state, collectionId) {
  return (state.wikis || []).find((w) => w.collectionId === collectionId) || null;
}

function headingText(block) {
  return (block.spans || []).map((span) => span.text).join('').trim();
}

export function createWiki({ store, els, showToast, onBack, onJumpNote, onRename }) {
  const {
    pane,
    back,
    title,
    notesToggle,
    outline,
    toc,
    draft,
    editor,
    format,
    btnH1,
    btnH2,
    btnBold,
    btnBullets,
    btnNumbers,
    btnLink,
    btnHr,
    linkPop,
  } = els;

  let openId = null;
  let session = null;
  let saveTimer = null;
  let pendingDoc = null;
  let drafted = false;
  let drawerOpen = false;

  const coarse = () => window.matchMedia('(pointer: coarse)').matches;

  function collection() {
    return store.state.collections.find((c) => c.id === openId) || null;
  }

  function liveNoteIds() {
    return new Set(store.state.notes.map((n) => n.id));
  }

  function currentDoc() {
    if (pendingDoc) return pendingDoc;
    if (session) return session.read();
    const row = openId ? wikiRow(store.state, openId) : null;
    return row ? row.doc : emptyDoc();
  }

  function flush() {
    if (!openId || !pendingDoc) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const doc = pendingDoc;
    pendingDoc = null;
    store.dispatch([{ op: 'wiki.set', collectionId: openId, doc, ts: new Date().toISOString() }]);
  }

  function scheduleSave(doc) {
    pendingDoc = doc;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  function liftFormat() {
    if (!format || format.hidden) return;
    const vv = window.visualViewport;
    if (!vv || !coarse()) {
      format.style.bottom = '';
      return;
    }
    const overlap = window.innerHeight - (vv.height + vv.offsetTop);
    format.style.bottom = `${Math.max(0, overlap)}px`;
  }

  function syncFormat() {
    if (!session || !format) return;
    btnBold?.setAttribute('aria-pressed', String(session.commandState('bold')));
    const list = session.caretListTag();
    btnBullets?.setAttribute('aria-pressed', String(list === 'UL'));
    btnNumbers?.setAttribute('aria-pressed', String(list === 'OL'));
    const heading = session.caretHeadingTag();
    btnH1?.setAttribute('aria-pressed', String(heading === 'h1'));
    btnH2?.setAttribute('aria-pressed', String(heading === 'h2'));
    btnLink?.setAttribute('aria-pressed', String(Boolean(session.linkAtCaret())));
  }

  function renderTitle() {
    const col = collection();
    title.textContent = col ? col.name : 'This collection is gone';
    title.disabled = !col;
  }

  function renderToc(doc) {
    const headings = (doc.blocks || []).filter(
      (block) => (block.type === 'h1' || block.type === 'h2') && headingText(block),
    );
    toc.innerHTML = '';
    if (headings.length < 3) {
      toc.hidden = true;
      return;
    }
    toc.hidden = false;
    const label = document.createElement('p');
    label.className = 'sn-wiki-toc-label';
    label.textContent = 'On this page';
    toc.appendChild(label);
    const list = document.createElement('ol');
    list.className = 'sn-wiki-toc-list';
    const nodes = [...editor.querySelectorAll('h1, h2')];
    headings.forEach((block, i) => {
      const item = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sn-wiki-toc-link is-${block.type}`;
      btn.textContent = headingText(block);
      btn.addEventListener('click', () => nodes[i]?.scrollIntoView({ block: 'start' }));
      item.appendChild(btn);
      list.appendChild(item);
    });
    toc.appendChild(list);
  }

  function renderDraft(doc, notes) {
    const empty = docIsEmpty(doc);
    draft.hidden = !empty || !notes.length || drafted;
  }

  function renderOutline() {
    const notes = openId ? collectionNotes(store.state, openId) : [];
    outline.innerHTML = '';
    const head = document.createElement('p');
    head.className = 'sn-wiki-outline-label';
    head.textContent = notes.length ? `Notes (${notes.length})` : 'Notes';
    outline.appendChild(head);
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'sn-wiki-outline-empty';
      empty.textContent = 'No notes in this collection yet.';
      outline.appendChild(empty);
    }
    for (const note of notes) {
      const row = document.createElement('div');
      row.className = 'sn-wiki-note';
      const swatch = document.createElement('span');
      swatch.className = 'sn-wiki-note-dot';
      swatch.style.background = note.colorKey ? colorHex(note.colorKey) : 'transparent';
      const body = document.createElement('div');
      body.className = 'sn-wiki-note-body';
      const text = document.createElement('p');
      text.className = 'sn-wiki-note-text';
      text.textContent = notePreview(note);
      const meta = document.createElement('p');
      meta.className = 'sn-wiki-note-meta';
      meta.textContent = note.status === 'memory' ? 'Filed' : 'On the board';
      body.append(text, meta);
      const actions = document.createElement('div');
      actions.className = 'sn-wiki-note-actions';
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'sn-wiki-note-btn';
      jump.textContent = 'Jump';
      jump.addEventListener('click', () => onJumpNote?.(note));
      const pull = document.createElement('button');
      pull.type = 'button';
      pull.className = 'sn-wiki-note-btn';
      pull.textContent = 'Pull into page';
      pull.addEventListener('click', () => pullNote(note));
      actions.append(jump, pull);
      row.append(swatch, body, actions);
      outline.appendChild(row);
    }
    if (notesToggle) {
      notesToggle.textContent = `Notes (${notes.length})`;
      notesToggle.hidden = false;
      notesToggle.setAttribute('aria-expanded', String(drawerOpen));
    }
    return notes;
  }

  function refreshChips() {
    const ids = liveNoteIds();
    for (const chip of editor.querySelectorAll('.sn-wiki-src')) {
      chip.hidden = !ids.has(chip.dataset.noteId);
    }
  }

  function paintEditor(doc) {
    const ids = liveNoteIds();
    if (session) {
      session.detach();
      session = null;
    }
    renderBody(editor, doc.blocks, { liveNoteIds: ids });
    session = attachBodyEditor(editor, {
      wiki: true,
      linkPop,
      onCommit: () => scheduleSave(readDoc(editor)),
      onCancel: () => onBack?.(),
      onFormatChange: () => {
        scheduleSave(readDoc(editor));
        syncFormat();
        renderToc(readDoc(editor));
        renderDraft(readDoc(editor), openId ? collectionNotes(store.state, openId) : []);
      },
      onUnfurl: (url) => store.unfurl(url),
      shouldIgnoreBlur: (el) => Boolean(el.closest?.('#wiki-format, #wiki-pane, .sn-linkpop')),
    });
    refreshChips();
  }

  function pullNote(note) {
    const extra = noteBlocks(note).map((block) => ({
      type: block.type,
      spans: block.spans,
      noteId: note.id,
    }));
    if (!extra.length) return;
    const doc = currentDoc();
    const next = { blocks: [...doc.blocks, ...extra] };
    pendingDoc = next;
    paintEditor(next);
    scheduleSave(next);
    drafted = true;
    renderChrome();
    showToast('Pulled into the page');
  }

  function seedDraft() {
    const notes = openId ? collectionNotes(store.state, openId) : [];
    const doc = draftDocFromNotes(notes, store.state.legend);
    pendingDoc = doc;
    drafted = true;
    paintEditor(doc);
    scheduleSave(doc);
    renderChrome();
  }

  function renderChrome() {
    const doc = currentDoc();
    const notes = renderOutline();
    renderTitle();
    renderToc(doc);
    renderDraft(doc, notes);
    refreshChips();
    syncFormat();
  }

  function setDrawer(open) {
    drawerOpen = open;
    pane.classList.toggle('is-drawer', drawerOpen);
    notesToggle?.setAttribute('aria-expanded', String(drawerOpen));
  }

  function open(collectionId) {
    if (openId && openId !== collectionId) flush();
    openId = collectionId;
    drafted = false;
    pendingDoc = null;
    clearTimeout(saveTimer);
    const row = wikiRow(store.state, collectionId);
    paintEditor(row ? row.doc : emptyDoc());
    pane.hidden = false;
    format.hidden = false;
    setDrawer(false);
    renderChrome();
    liftFormat();
    if (!coarse()) editor.focus();
  }

  function close() {
    flush();
    if (session) {
      session.detach();
      session = null;
    }
    openId = null;
    pendingDoc = null;
    drafted = false;
    setDrawer(false);
    pane.hidden = true;
    format.hidden = true;
    format.style.bottom = '';
  }

  back.addEventListener('click', () => onBack?.());
  title.addEventListener('click', () => {
    const col = collection();
    if (!col) return;
    onRename?.(col);
  });
  draft.addEventListener('click', seedDraft);
  notesToggle?.addEventListener('click', () => setDrawer(!drawerOpen));
  outline.addEventListener('click', (e) => {
    if (!coarse()) return;
    if (e.target.closest('button')) setDrawer(false);
  });

  const apply = (kind) => () => session?.applyFormat(kind);
  btnH1?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('h1')();
  });
  btnH2?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('h2')();
  });
  btnBold?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('bold')();
  });
  btnBullets?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('ul')();
  });
  btnNumbers?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('ol')();
  });
  btnLink?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    session?.openLink();
  });
  btnHr?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apply('hr')();
  });

  if (btnBold) btnBold.innerHTML = BOLD_SVG;
  if (btnBullets) btnBullets.innerHTML = BULLET_LIST_SVG;
  if (btnNumbers) btnNumbers.innerHTML = NUMBER_LIST_SVG;
  if (btnLink) btnLink.innerHTML = LINK_SVG;
  if (btnHr) btnHr.innerHTML = RULE_SVG;

  window.visualViewport?.addEventListener('resize', liftFormat);
  window.visualViewport?.addEventListener('scroll', liftFormat);

  store.subscribe((kind) => {
    if (!openId) return;
    if (kind === 'reset' && !pendingDoc) {
      const row = wikiRow(store.state, openId);
      paintEditor(row ? row.doc : emptyDoc());
    }
    if (!collection()) {
      renderTitle();
      return;
    }
    renderChrome();
  });

  return {
    open,
    close,
    flush,
    isOpen: () => Boolean(openId),
    collectionId: () => openId,
    isDrawer: () => drawerOpen,
    setDrawer,
  };
}

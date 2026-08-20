/**
 * Sticky Notes note body — render, read, and the in-place editor.
 *
 * Browser-safe, dependency-free ESM. Imported by the board, the memory table,
 * and the board-as-table view. Lives here (not `/lib/`) so the browser can
 * load it; middleware 404s everything under `/lib/`.
 *
 * A body is a list of lines (notes.js). It paints as `<div>` paragraphs and
 * `<ul>`/`<ol>` runs, built element by element — never from an HTML string —
 * so a note can hold formatting without anything having to be sanitized.
 * An `href` span is a pill: an `<a class="sn-pill">` atom the caret skips.
 */
import {
  HREF_MAX,
  ICON_SVGS,
  clamp,
  isLoneUrl,
  listTriggerFor,
  normalizeHref,
  normalizeRich,
  richFromNode,
  urlDomain,
} from './notes.js';

const LINE_TAGS = new Set(['DIV', 'P', 'LI']);

function exec(command, value = null) {
  try {
    document.execCommand(command, false, value);
  } catch {
    /* an unsupported command just does nothing */
  }
}

function commandState(command) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function caretToEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** The block element the caret sits in — one line of the body. */
export function caretLine(host) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  let node = range.startContainer;
  if (node === host) {
    const kids = [...host.children];
    if (!kids.length) return host;
    const kid = kids[clamp(range.startOffset, 0, kids.length - 1)];
    if (kid.tagName === 'UL' || kid.tagName === 'OL') return kid.lastElementChild || kid;
    return kid;
  }
  if (node.nodeType !== 1) node = node.parentNode;
  while (node && node !== host) {
    if (LINE_TAGS.has(node.tagName)) return node;
    node = node.parentNode;
  }
  return node === host ? host : null;
}

/** Text between the start of the caret's line and the caret. */
function caretLinePrefix(host) {
  const line = caretLine(host);
  if (!line) return null;
  const sel = window.getSelection();
  const caret = sel.getRangeAt(0);
  const before = document.createRange();
  before.selectNodeContents(line);
  try {
    before.setEnd(caret.startContainer, caret.startOffset);
  } catch {
    return null;
  }
  return before.toString();
}

/** Swallow the marker the user typed, so "* " leaves no asterisk behind. */
function dropLinePrefix(host) {
  const line = caretLine(host);
  if (!line) return;
  const sel = window.getSelection();
  const caret = sel.getRangeAt(0);
  const kill = document.createRange();
  kill.selectNodeContents(line);
  kill.setEnd(caret.startContainer, caret.startOffset);
  kill.deleteContents();
  sel.removeAllRanges();
  sel.addRange(kill);
}

function ensureLines(host) {
  let run = null;
  for (const node of [...host.childNodes]) {
    const tag = node.nodeType === 1 ? node.tagName : '';
    if (tag === 'UL' || tag === 'OL' || LINE_TAGS.has(tag)) {
      run = null;
      continue;
    }
    if (!run) {
      run = document.createElement('div');
      host.insertBefore(run, node);
    }
    run.appendChild(node);
  }
}

function lineElements(host) {
  const out = [];
  for (const child of host.children) {
    if (child.tagName === 'UL' || child.tagName === 'OL') out.push(...child.children);
    else out.push(child);
  }
  return out;
}

function selectedLines(host) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const hit = lineElements(host).filter((el) => range.intersectsNode(el));
  if (hit.length) return hit;
  const line = caretLine(host);
  return line && line !== host ? [line] : [];
}

function unlist(line) {
  const div = document.createElement('div');
  while (line.firstChild) div.appendChild(line.firstChild);
  if (line.tagName !== 'LI') {
    line.replaceWith(div);
    return div;
  }
  const list = line.parentNode;
  const items = [...list.children];
  const after = items.slice(items.indexOf(line) + 1);
  list.parentNode.insertBefore(div, list.nextSibling);
  if (after.length) {
    const tail = document.createElement(list.tagName.toLowerCase());
    for (const item of after) tail.appendChild(item);
    div.parentNode.insertBefore(tail, div.nextSibling);
  }
  line.remove();
  if (!list.children.length) list.remove();
  return div;
}

/**
 * Make one line a list item. Rolled by hand rather than through
 * `insertUnorderedList`: Chrome's version reaches into the list above the
 * caret and drags its last item into the new one, so typing "1. " under a
 * bullet list stole the bullet.
 */
function enlist(line, tag) {
  const from = line.tagName === 'LI' ? unlist(line) : line;
  const item = document.createElement('li');
  while (from.firstChild) item.appendChild(from.firstChild);
  const prev = from.previousElementSibling;
  if (prev && prev.tagName === tag) {
    prev.appendChild(item);
  } else {
    const list = document.createElement(tag.toLowerCase());
    list.appendChild(item);
    from.parentNode.insertBefore(list, from);
  }
  from.remove();
  return item;
}

export function toggleList(host, tag) {
  ensureLines(host);
  const lines = selectedLines(host);
  if (!lines.length) return;
  const already = lines.every((el) => el.tagName === 'LI' && el.parentNode.tagName === tag);
  let last = null;
  for (const line of lines) last = already ? unlist(line) : enlist(line, tag);
  if (last) caretToEnd(last);
}

/** 'UL' / 'OL' / null — what kind of line the caret is on. */
export function caretListTag(host) {
  const line = caretLine(host);
  if (!line || line.tagName !== 'LI') return null;
  return line.parentNode.tagName;
}

export function createPill(span) {
  const a = document.createElement('a');
  a.className = 'sn-pill';
  a.href = span.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.contentEditable = 'false';
  if (span.bold) a.style.fontWeight = '700';
  const icon = document.createElement('span');
  icon.className = 'sn-pill-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = ICON_SVGS.link;
  const label = document.createElement('span');
  label.className = 'sn-pill-text';
  label.textContent = span.text || urlDomain(span.href) || span.href;
  a.append(icon, label);
  return a;
}

export function appendSpans(host, spans) {
  for (const span of spans || []) {
    if (span.href) {
      host.appendChild(createPill(span));
      continue;
    }
    if (span.bold) {
      const b = document.createElement('b');
      b.textContent = span.text;
      host.appendChild(b);
    } else {
      host.appendChild(document.createTextNode(span.text));
    }
  }
}

export function renderBody(host, blocks) {
  host.innerHTML = '';
  let list = null;
  for (const block of blocks || []) {
    if (block.type === 'p') {
      list = null;
      const line = document.createElement('div');
      appendSpans(line, block.spans);
      if (!line.childNodes.length) line.appendChild(document.createElement('br'));
      host.appendChild(line);
      continue;
    }
    const tag = block.type === 'ul' ? 'UL' : 'OL';
    if (!list || list.tagName !== tag) {
      list = document.createElement(tag.toLowerCase());
      host.appendChild(list);
    }
    const item = document.createElement('li');
    appendSpans(item, block.spans);
    list.appendChild(item);
  }
  if (!host.childNodes.length) host.appendChild(document.createElement('div'));
}

/** Read the body back out of the DOM the browser has been editing. */
export function readBody(host) {
  return normalizeRich(richFromNode(host));
}

function pillLabel(pill) {
  return pill.querySelector('.sn-pill-text')?.textContent || pill.textContent || '';
}

function setPillLabel(pill, text) {
  const label = pill.querySelector('.sn-pill-text');
  if (label) label.textContent = text;
  else pill.textContent = text;
}

function pillNearCaret(host) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const fromNode = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const pill = el?.closest?.('a.sn-pill');
    return pill && host.contains(pill) ? pill : null;
  };
  const hit = fromNode(range.startContainer) || fromNode(sel.anchorNode);
  if (hit) return hit;
  if (range.startContainer.nodeType !== 1) return null;
  const kids = range.startContainer.childNodes;
  const at = kids[range.startOffset];
  const prev = kids[range.startOffset - 1];
  if (at?.classList?.contains('sn-pill') && host.contains(at)) return at;
  if (prev?.classList?.contains('sn-pill') && host.contains(prev)) return prev;
  return null;
}

function insertNodeAtCaret(host, node) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && host.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  const last = host.lastElementChild || host;
  last.appendChild(node);
}

function caretAfter(node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function buildLinkPopover() {
  const pop = document.createElement('div');
  pop.className = 'sn-linkpop';
  pop.hidden = true;
  pop.innerHTML =
    '<label class="sn-link-field"><span>URL</span><input class="sn-link-url" type="url" inputmode="url" autocomplete="off" placeholder="https://" /></label>' +
    '<label class="sn-link-field"><span>Text</span><input class="sn-link-text" type="text" autocomplete="off" placeholder="Display text" /></label>' +
    '<div class="sn-link-actions">' +
    '<button type="button" class="sn-btn sn-btn-primary sn-link-save">Save</button>' +
    '<button type="button" class="sn-btn sn-link-remove">Remove</button>' +
    '</div>';
  return pop;
}

function popoverFields(pop) {
  return {
    url: pop.querySelector('.sn-link-url, #eb-link-url'),
    text: pop.querySelector('.sn-link-text, #eb-link-text'),
    save: pop.querySelector('.sn-link-save, #eb-link-save'),
    remove: pop.querySelector('.sn-link-remove, #eb-link-remove'),
  };
}

/**
 * The list-trigger / bold / paste / blur editor used by the board card and
 * the table Note cell. `placePopover` is the existing bar placer when the
 * link popover lives on the edit bar; otherwise the popover sits near `host`.
 */
export function attachBodyEditor(host, options = {}) {
  const {
    onCommit,
    onCancel,
    shouldIgnoreBlur,
    onFormatChange,
    onUnfurl,
    placePopover,
    linkPop,
    extraKeydown,
  } = options;

  let linkOpen = false;
  let editingPill = null;
  const pop = linkPop || buildLinkPopover();
  if (!pop.parentElement) document.body.appendChild(pop);
  const fields = popoverFields(pop);

  host.contentEditable = 'true';
  try {
    document.execCommand('styleWithCSS', false, false);
  } catch {
    /* Firefox already writes <b> rather than a style attribute */
  }

  const applyFormat = (kind) => {
    host.focus();
    if (kind === 'bold') exec('bold');
    else if (kind === 'ul' || kind === 'ol') toggleList(host, kind === 'ul' ? 'UL' : 'OL');
    onFormatChange?.();
  };

  const closeLink = ({ restore = true } = {}) => {
    if (pop.hidden && !linkOpen) return;
    pop.hidden = true;
    linkOpen = false;
    editingPill = null;
    if (restore) host.focus();
  };

  const placeLink = () => {
    if (placePopover) {
      placePopover(pop);
      return;
    }
    pop.style.position = 'fixed';
    pop.style.transform = '';
    const box = (editingPill || host).getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;
    pop.style.left = `${Math.max(8, Math.min(box.left, vw - pop.offsetWidth - 8))}px`;
    const above = box.top - pop.offsetHeight - 8;
    pop.style.top = `${above >= 8 ? above : Math.min(box.bottom + 8, vh - pop.offsetHeight - 8)}px`;
  };

  const saveLink = () => {
    const href = normalizeHref(fields.url?.value || '');
    const text = (fields.text?.value || '').trim() || (href ? urlDomain(href) || href : '');
    if (!href) return;
    if (editingPill && host.contains(editingPill)) {
      editingPill.href = href;
      setPillLabel(editingPill, text);
      delete editingPill.dataset.autoTitle;
    } else {
      const pill = createPill({ href, text });
      insertNodeAtCaret(host, pill);
      caretAfter(pill);
    }
    closeLink();
    onFormatChange?.();
  };

  const removeLink = () => {
    if (editingPill && host.contains(editingPill)) {
      const text = document.createTextNode(pillLabel(editingPill));
      editingPill.replaceWith(text);
    }
    closeLink();
    onFormatChange?.();
  };

  const openLink = () => {
    const pill =
      editingPill && host.contains(editingPill) ? editingPill : pillNearCaret(host);
    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    editingPill = pill;
    if (fields.url) fields.url.value = pill ? pill.getAttribute('href') || '' : normalizeHref(selected) || '';
    if (fields.text) {
      fields.text.value = pill ? pillLabel(pill) : selected && !normalizeHref(selected) ? selected : '';
    }
    pop.hidden = false;
    linkOpen = true;
    placeLink();
    fields.url?.focus();
    fields.url?.select();
  };

  const insertUrlPill = (href) => {
    const pill = createPill({ href, text: urlDomain(href) || href });
    pill.dataset.autoTitle = '1';
    insertNodeAtCaret(host, pill);
    caretAfter(pill);
    onUnfurl?.(href).then((title) => {
      if (!title || !pill.isConnected || pill.dataset.autoTitle !== '1') return;
      setPillLabel(pill, title);
    });
    onFormatChange?.();
  };

  const onBlur = (e) => {
    if (linkOpen) return;
    if (e.relatedTarget && (shouldIgnoreBlur?.(e.relatedTarget) || pop.contains(e.relatedTarget))) return;
    onCommit?.();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (linkOpen) {
        closeLink();
        return;
      }
      onCancel?.();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onCommit?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      applyFormat('bold');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openLink();
      return;
    }
    extraKeydown?.(e);
  };

  const startList = (kind) => {
    dropLinePrefix(host);
    toggleList(host, kind === 'ul' ? 'UL' : 'OL');
    onFormatChange?.();
  };

  const onBeforeInput = (e) => {
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    const kind = listTriggerFor(caretLinePrefix(host));
    if (!kind) return;
    if (caretLine(host)?.tagName === 'LI') return;
    e.preventDefault();
    startList(kind);
  };

  const onInput = () => {
    if (caretLine(host)?.tagName === 'LI') return;
    const prefix = caretLinePrefix(host);
    if (!prefix || !/[ \u00a0]$/.test(prefix)) return;
    const kind = listTriggerFor(prefix.slice(0, -1));
    if (kind) startList(kind);
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined || text === null) return;
    e.preventDefault();
    e.stopPropagation();
    const trimmed = text.trim();
    if (trimmed.length <= HREF_MAX && isLoneUrl(trimmed)) {
      insertUrlPill(trimmed);
      return;
    }
    try {
      document.execCommand('insertText', false, text);
    } catch {
      /* the browser refused the insert */
    }
  };

  const onClick = (e) => {
    const pill = e.target.closest?.('a.sn-pill');
    if (!pill || !host.contains(pill)) return;
    e.preventDefault();
    e.stopPropagation();
    editingPill = pill;
    openLink();
    if (fields.url) fields.url.value = pill.getAttribute('href') || '';
    if (fields.text) fields.text.value = pillLabel(pill);
  };

  const onDocPointer = (e) => {
    if (!linkOpen) return;
    if (pop.contains(e.target) || host.contains(e.target)) return;
    closeLink({ restore: false });
  };

  const onSavePointer = (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveLink();
  };
  const onRemovePointer = (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeLink();
  };
  const onPopKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveLink();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLink();
    }
  };

  fields.save?.addEventListener('pointerdown', onSavePointer);
  fields.remove?.addEventListener('pointerdown', onRemovePointer);
  pop.addEventListener('keydown', onPopKey);
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  host.addEventListener('blur', onBlur);
  host.addEventListener('keydown', onKey);
  host.addEventListener('beforeinput', onBeforeInput);
  host.addEventListener('input', onInput);
  host.addEventListener('paste', onPaste);
  host.addEventListener('click', onClick);
  const onSel = () => onFormatChange?.();
  document.addEventListener('selectionchange', onSel);
  document.addEventListener('pointerdown', onDocPointer, true);

  const detach = () => {
    closeLink({ restore: false });
    host.contentEditable = 'false';
    host.removeEventListener('blur', onBlur);
    host.removeEventListener('keydown', onKey);
    host.removeEventListener('beforeinput', onBeforeInput);
    host.removeEventListener('input', onInput);
    host.removeEventListener('paste', onPaste);
    host.removeEventListener('click', onClick);
    document.removeEventListener('selectionchange', onSel);
    document.removeEventListener('pointerdown', onDocPointer, true);
    fields.save?.removeEventListener('pointerdown', onSavePointer);
    fields.remove?.removeEventListener('pointerdown', onRemovePointer);
    pop.removeEventListener('keydown', onPopKey);
    if (!linkPop && pop.parentElement) pop.remove();
  };

  return {
    detach,
    applyFormat,
    openLink,
    closeLink,
    commandState,
    caretListTag: () => caretListTag(host),
    linkAtCaret: () => pillNearCaret(host),
    read: () => readBody(host),
  };
}

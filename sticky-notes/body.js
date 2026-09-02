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
  headingTriggerFor,
  iconImageUrl,
  isLoneUrl,
  legendLabel,
  listTriggerFor,
  mediaAspectRatio,
  mediaKindLabel,
  mediaPresentation,
  mediaShape,
  normalizeDoc,
  normalizeHref,
  normalizeRich,
  richFromNode,
  urlDomain,
} from './notes.js';

const LINE_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2']);

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

function caretToStart(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function padIfEmpty(el) {
  if (el && !el.childNodes.length) el.appendChild(document.createElement('br'));
}

/**
 * An empty list item is one with no typed text and no link pill. A lone <br>
 * or nbsp (what contenteditable leaves behind) still counts as empty, so Enter
 * can exit the list instead of trapping the user on blank bullets.
 */
export function lineLooksEmpty(el) {
  if (!el) return true;
  if (typeof el.querySelector === 'function' && el.querySelector('a.sn-pill')) return false;
  const text = String(el.textContent || '').replace(/[\u00a0\u200b\ufeff]/g, '').trim();
  return !text;
}

/**
 * What Enter does on this line: keep the list (`split`), leave it (`exit`),
 * or let the browser handle a non-list line (`null`).
 */
export function listEnterAction(line) {
  if (!line || line.tagName !== 'LI') return null;
  return lineLooksEmpty(line) ? 'exit' : 'split';
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
  padIfEmpty(item);
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

/**
 * Enter in a list: a typed item stays in the list (new bullet / next number),
 * an empty item becomes a paragraph. Shift+Enter is left to the browser as a
 * soft break. Notes have no heading shortcut — `# ` is wiki-only — so this
 * never invents a heading.
 */
export function continueListEnter(host) {
  const line = caretLine(host);
  const action = listEnterAction(line);
  if (!action) return false;
  if (action === 'exit') {
    const div = unlist(line);
    padIfEmpty(div);
    caretToStart(div);
    return true;
  }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const caret = sel.getRangeAt(0);
  const rest = document.createRange();
  rest.selectNodeContents(line);
  try {
    rest.setStart(caret.startContainer, caret.startOffset);
  } catch {
    return false;
  }
  const extracted = rest.extractContents();
  const next = document.createElement('li');
  if (extracted.childNodes.length) next.appendChild(extracted);
  padIfEmpty(next);
  padIfEmpty(line);
  line.after(next);
  caretToStart(next);
  return true;
}

function setLineType(line, type) {
  let from = line.tagName === 'LI' ? unlist(line) : line;
  const tag = type === 'p' ? 'DIV' : type.toUpperCase();
  if (from.tagName === tag) return from;
  const next = document.createElement(tag.toLowerCase());
  while (from.firstChild) next.appendChild(from.firstChild);
  if (from.dataset.noteId) next.dataset.noteId = from.dataset.noteId;
  from.replaceWith(next);
  return next;
}

/** Wiki-only: turn the caret line into h1/h2, or back into a paragraph. */
export function toggleHeading(host, type, { force = false } = {}) {
  ensureLines(host);
  const lines = selectedLines(host);
  if (!lines.length) return;
  const tag = type.toUpperCase();
  const already = !force && lines.every((el) => el.tagName === tag);
  let last = null;
  for (const line of lines) last = setLineType(line, already ? 'p' : type);
  if (last) caretToEnd(last);
}

export function insertRule(host) {
  ensureLines(host);
  const hr = document.createElement('hr');
  const line = caretLine(host);
  if (line && line !== host) line.after(hr);
  else host.appendChild(hr);
  const next = document.createElement('div');
  next.appendChild(document.createElement('br'));
  hr.after(next);
  caretToEnd(next);
}

export function caretHeadingTag(host) {
  const line = caretLine(host);
  if (!line) return null;
  if (line.tagName === 'H1' || line.tagName === 'H2') return line.tagName.toLowerCase();
  return null;
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

/** Built-in SVG or user-defined image, rendered without injecting URL markup. */
export function renderIcon(host, legend, key) {
  host.innerHTML = '';
  host.title = key ? legendLabel(legend, 'icon', key) : '';
  if (!key) return;
  const imageUrl = iconImageUrl(legend, key);
  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'sn-custom-icon-image';
    img.src = imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove(), { once: true });
    host.appendChild(img);
    return;
  }
  host.innerHTML = ICON_SVGS[key] || '';
}

/** Compact hashtag pills extracted from the body on commit. */
export function renderTags(host, tags) {
  host.replaceChildren();
  const list = Array.isArray(tags) ? tags.filter(Boolean) : [];
  host.hidden = !list.length;
  for (const label of list) {
    const pill = document.createElement('span');
    pill.className = 'sn-tag-pill';
    pill.textContent = label;
    pill.title = label;
    host.appendChild(pill);
  }
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

function stampNoteId(el, block, liveNoteIds) {
  if (!block.noteId) return;
  el.dataset.noteId = block.noteId;
  if (liveNoteIds && liveNoteIds.has(block.noteId)) {
    const chip = document.createElement('span');
    chip.className = 'sn-wiki-src';
    chip.contentEditable = 'false';
    chip.textContent = 'from note';
    chip.dataset.noteId = block.noteId;
    el.appendChild(chip);
  }
}

export function renderBody(host, blocks, options = {}) {
  host.innerHTML = '';
  const liveNoteIds = options.liveNoteIds || null;
  let list = null;
  for (const block of blocks || []) {
    if (block.type === 'hr') {
      list = null;
      host.appendChild(document.createElement('hr'));
      continue;
    }
    if (block.type === 'h1' || block.type === 'h2') {
      list = null;
      const line = document.createElement(block.type);
      appendSpans(line, block.spans);
      if (!line.childNodes.length) line.appendChild(document.createElement('br'));
      stampNoteId(line, block, liveNoteIds);
      host.appendChild(line);
      continue;
    }
    if (block.type === 'p') {
      list = null;
      const line = document.createElement('div');
      appendSpans(line, block.spans);
      if (!line.childNodes.length) line.appendChild(document.createElement('br'));
      stampNoteId(line, block, liveNoteIds);
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
    stampNoteId(item, block, liveNoteIds);
    list.appendChild(item);
  }
  if (!host.childNodes.length) host.appendChild(document.createElement('div'));
}

function mediaFallback(frame, presentation, media) {
  frame.innerHTML = '';
  const label = document.createElement('span');
  label.className = `sn-media-placeholder sn-media-${presentation.kind || 'link'}`;
  label.textContent = mediaKindLabel(presentation.kind || media?.kind);
  frame.appendChild(label);
}

function fitMediaHostToImage(host, img, fallbackRatio) {
  if (fallbackRatio) host.style.aspectRatio = fallbackRatio;
  const apply = () => {
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth > 0 && naturalHeight > 0) {
      host.style.aspectRatio = `${naturalWidth} / ${naturalHeight}`;
      host.style.minHeight = '';
      host.dataset.natural = '1';
    }
  };
  if (img.complete) apply();
  else img.addEventListener('load', apply, { once: true });
}

function layoutMediaHost(host, media, presentation) {
  const kind = presentation.kind || media?.kind || 'link';
  const href = media?.canonical || media?.url || '';
  host.dataset.kind = kind;
  const shape = mediaShape(kind, href);
  if (shape) host.dataset.shape = shape;
  else delete host.dataset.shape;
  delete host.dataset.natural;
  host.style.aspectRatio = '';
  host.style.minHeight = '';

  const fallbackRatio = mediaAspectRatio(kind, href);

  if (presentation.mode === 'placeholder') {
    host.style.minHeight = '72px';
    return;
  }
  if (presentation.mode === 'embed') {
    host.style.aspectRatio = fallbackRatio || '2 / 3';
    return;
  }

  host.style.minHeight = '48px';
  if (fallbackRatio) host.style.aspectRatio = fallbackRatio;

  const img = host.querySelector('.sn-media-frame img');
  if (img) fitMediaHostToImage(host, img, fallbackRatio);
}

function mediaFrame(media, presentation) {
  const frame = document.createElement('span');
  frame.className = 'sn-media-frame';
  if (presentation.mode === 'image') {
    const img = document.createElement('img');
    img.src = presentation.src;
    img.alt = media.title || '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => mediaFallback(frame, presentation, media), { once: true });
    frame.appendChild(img);
  } else if (presentation.mode === 'embed' && presentation.embedUrl) {
    const iframe = document.createElement('iframe');
    iframe.src = presentation.embedUrl;
    iframe.loading = 'lazy';
    iframe.tabIndex = -1;
    iframe.title = media.title || `${mediaKindLabel(presentation.kind)} preview`;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.appendChild(iframe);
  } else {
    mediaFallback(frame, presentation, media);
  }
  return frame;
}

/** Paint one restrained visual attachment without expanding the rich-text model. */
export function renderMedia(host, media) {
  host.innerHTML = '';
  const presentation = mediaPresentation(media);
  if (!media || presentation.mode === 'none') {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const href = media.canonical || media.url;
  let visual = mediaFrame(media, presentation);

  if (presentation.playable) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'sn-media-play';
    play.setAttribute('aria-label', `Play ${mediaKindLabel(presentation.kind)} preview`);
    play.appendChild(visual);
    const glyph = document.createElement('span');
    glyph.className = 'sn-media-play-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    play.appendChild(glyph);
    play.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (presentation.directVideo) {
        const video = document.createElement('video');
        video.className = 'sn-media-player';
        video.src = presentation.directVideo;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        play.replaceWith(video);
        return;
      }
      if (presentation.embedUrl) {
        const iframe = document.createElement('iframe');
        iframe.className = 'sn-media-player';
        iframe.src = presentation.embedUrl;
        iframe.title = media.title || `${mediaKindLabel(presentation.kind)} preview`;
        iframe.loading = 'lazy';
        iframe.allow = 'encrypted-media; fullscreen; picture-in-picture; autoplay';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        play.replaceWith(iframe);
        return;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
    });
    visual = play;
  } else {
    const link = document.createElement('a');
    link.className = 'sn-media-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Open ${media.title || mediaKindLabel(presentation.kind)}`);
    link.appendChild(visual);
    visual = link;
  }

  host.appendChild(visual);
  const caption = document.createElement('span');
  caption.className = 'sn-media-caption';
  caption.textContent = media.title || mediaKindLabel(presentation.kind);
  host.appendChild(caption);
  layoutMediaHost(host, media, presentation);
}

function tableThumbPlaceholder(kind) {
  const el = document.createElement('span');
  el.className = `sn-tbl-thumb-ph sn-tbl-thumb-${kind || 'link'}`;
  el.textContent = mediaKindLabel(kind).slice(0, 1);
  el.title = mediaKindLabel(kind);
  return el;
}

/** Compact still for the board table — no caption, play, or layout chrome. */
export function renderMediaThumb(host, media) {
  host.replaceChildren();
  const presentation = mediaPresentation(media);
  if (!media || presentation.mode === 'none') return false;

  const href = media.canonical || media.url;
  if (presentation.mode === 'image' && presentation.src) {
    const link = document.createElement('a');
    link.className = 'sn-tbl-thumb-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', media.title || mediaKindLabel(presentation.kind));
    const img = document.createElement('img');
    img.className = 'sn-tbl-thumb-img';
    img.src = presentation.src;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      link.replaceWith(tableThumbPlaceholder(presentation.kind || media.kind));
    }, { once: true });
    link.appendChild(img);
    if (presentation.playable) {
      link.classList.add('is-playable');
      const play = document.createElement('span');
      play.className = 'sn-tbl-thumb-play';
      play.setAttribute('aria-hidden', 'true');
      link.appendChild(play);
    }
    host.appendChild(link);
    return true;
  }

  host.appendChild(tableThumbPlaceholder(presentation.kind || media.kind));
  return true;
}

/** Read the body back out of the DOM the browser has been editing. */
export function readBody(host) {
  return normalizeRich(richFromNode(host));
}

function spansFromLine(el) {
  const tmp = el.cloneNode(true);
  for (const chip of tmp.querySelectorAll('.sn-wiki-src')) chip.remove();
  const blocks = richFromNode(tmp);
  const spans = [];
  for (const block of blocks) spans.push(...(block.spans || []));
  return spans;
}

/** Wiki document read — headings, rules, and pull provenance survive. */
export function readDoc(host) {
  const blocks = [];
  for (const child of host.children) {
    if (child.tagName === 'HR') {
      blocks.push({ type: 'hr' });
      continue;
    }
    if (child.tagName === 'H1' || child.tagName === 'H2') {
      const block = { type: child.tagName.toLowerCase(), spans: spansFromLine(child) };
      if (child.dataset.noteId) block.noteId = child.dataset.noteId;
      blocks.push(block);
      continue;
    }
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      const type = child.tagName === 'UL' ? 'ul' : 'ol';
      for (const item of child.children) {
        if (item.tagName !== 'LI') continue;
        const block = { type, spans: spansFromLine(item) };
        if (item.dataset.noteId) block.noteId = item.dataset.noteId;
        blocks.push(block);
      }
      continue;
    }
    const block = { type: 'p', spans: spansFromLine(child) };
    if (child.dataset.noteId) block.noteId = child.dataset.noteId;
    blocks.push(block);
  }
  return normalizeDoc({ blocks });
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
    wiki = false,
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
    else if (kind === 'h1' || kind === 'h2') toggleHeading(host, kind);
    else if (kind === 'p') {
      const line = caretLine(host);
      if (line && line !== host) caretToEnd(setLineType(line, 'p'));
    }
    else if (kind === 'hr') insertRule(host);
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

  let listEnterLock = false;
  const handleListEnter = () => {
    if (listEnterLock) return true;
    if (!continueListEnter(host)) return false;
    listEnterLock = true;
    requestAnimationFrame(() => {
      listEnterLock = false;
    });
    onFormatChange?.();
    return true;
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
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (wiki) {
        const line = caretLine(host);
        if (line && (line.tagName === 'H1' || line.tagName === 'H2')) {
          e.preventDefault();
          const p = document.createElement('div');
          p.appendChild(document.createElement('br'));
          line.after(p);
          caretToEnd(p);
          onFormatChange?.();
          return;
        }
      }
      if (handleListEnter()) {
        e.preventDefault();
        return;
      }
    }
    extraKeydown?.(e);
  };

  const startList = (kind) => {
    dropLinePrefix(host);
    toggleList(host, kind === 'ul' ? 'UL' : 'OL');
    onFormatChange?.();
  };

  const startHeading = (kind) => {
    dropLinePrefix(host);
    toggleHeading(host, kind, { force: true });
    onFormatChange?.();
  };

  const onBeforeInput = (e) => {
    if (e.inputType === 'insertParagraph') {
      if (handleListEnter()) e.preventDefault();
      return;
    }
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    if (wiki) {
      const heading = headingTriggerFor(caretLinePrefix(host));
      if (heading) {
        e.preventDefault();
        startHeading(heading);
        return;
      }
    }
    const kind = listTriggerFor(caretLinePrefix(host));
    if (!kind) return;
    if (caretLine(host)?.tagName === 'LI') return;
    e.preventDefault();
    startList(kind);
  };

  const onInput = () => {
    if (wiki) {
      const prefix = caretLinePrefix(host);
      if (prefix && /[ \u00a0]$/.test(prefix)) {
        const heading = headingTriggerFor(prefix.slice(0, -1));
        if (heading) {
          startHeading(heading);
          return;
        }
      }
    }
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
    caretHeadingTag: () => caretHeadingTag(host),
    linkAtCaret: () => pillNearCaret(host),
    read: () => (wiki ? readDoc(host) : readBody(host)),
  };
}

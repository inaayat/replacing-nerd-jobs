/**
 * Sticky Notes v1 — pure model. Dependency-free ESM, no DOM, no node: imports.
 * Shared by the browser (board/memory/sync) and the server (api/sticky-notes.js
 * imports LEGEND_DEFAULTS and the normalizers for validation).
 *
 * All mutations — local or remote — are ops applied by applyOps(state, ops).
 * The server mirrors the same semantics in SQL (lib/sticky-notes.js).
 */

export const STORAGE_KEY = 'sticky-notes-v2';
export const OPLOG_KEY = 'sticky-notes-oplog-v2';
export const VIEWPORT_KEY = 'sticky-notes-viewport';
export const LEGACY_KEY = 'sticky-notes-v1';

/**
 * A signed-out visitor's board. It is a key of its own so a guest session and
 * an account's mirror can never read each other: logging out does not leave the
 * previous board on screen, and signing in hands the guest board over
 * deliberately (app.js) instead of silently adopting it.
 */
export const GUEST_STORAGE_KEY = 'sticky-notes-guest-v2';

export const NOTE_W_DEFAULT = 220;
export const NOTE_H_DEFAULT = 64;
/** Phone create size — a tap target, not a postage stamp. Desktop stays 220×64. */
export const NOTE_W_PHONE = 288;
export const NOTE_H_PHONE = 160;
export const NOTE_W_MIN = 160;
export const NOTE_W_MAX = 480;
export const NOTE_H_MIN = 48;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;
/** Coarse viewports this wide are a phone: leftover v1 `table` is reset once. */
export const PHONE_VIEW_MAX = 720;
/** Canvas | table toggle. v2 so a leftover #276 phone `table` can be ignored. */
export const BOARD_VIEW_KEY = 'sticky-notes-board-view-v2';
export const BOARD_VIEW_KEY_V1 = 'sticky-notes-board-view';
/** Board | Memory tab. Phone boot ignores a leftover `memory` pick. */
export const TAB_KEY = 'sticky-notes-view';

// Keys are stored on notes; labels are the renameable defaults. Insertion order
// is the order every palette and filter row shows, which is why the neutral a
// new note starts as comes first.
export const LEGEND_DEFAULTS = {
  colors: {
    c7: { label: 'Grey', hex: '#e5e2da' },
    c1: { label: 'Yellow', hex: '#ffea56' },
    c2: { label: 'Pink', hex: '#fe9ec6' },
    c3: { label: 'Blue', hex: '#9ed4ff' },
    c4: { label: 'Green', hex: '#b8f28a' },
    c5: { label: 'Purple', hex: '#d4b8ff' },
    c6: { label: 'Orange', hex: '#ffc48a' },
  },
  icons: {
    link: 'Link',
    idea: 'Idea',
    remember: 'Remember',
    errand: 'Errand',
    read: 'Read',
    food: 'Food',
    travel: 'Travel',
    money: 'Money',
    home: 'Home',
    work: 'Work',
    media: 'Media',
    star: 'Starred',
  },
};

const SVG_OPEN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

export const ICON_SVGS = {
  link: `${SVG_OPEN}<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.5-1.5"/></svg>`,
  idea: `${SVG_OPEN}<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>`,
  remember: `${SVG_OPEN}<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>`,
  errand: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`,
  read: `${SVG_OPEN}<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M19 17H6a2 2 0 0 0-2 2"/></svg>`,
  food: `${SVG_OPEN}<path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 3v18"/><path d="M17 3c-1.5 1.5-2 4-2 6v3h4V9c0-2-.5-4.5-2-6z"/><path d="M17 12v9"/></svg>`,
  travel: `${SVG_OPEN}<path d="M21 3L3 11l7 2 2 7z"/><path d="M21 3L10 13"/></svg>`,
  money: `${SVG_OPEN}<path d="M12 3v18"/><path d="M16.5 7.5c-.5-1.5-2-2.2-4.5-2.2s-4 1-4 3 1.5 2.7 4 3.2 4.5 1.3 4.5 3.3-2 3-4.5 3-4-.7-4.5-2.5"/></svg>`,
  home: `${SVG_OPEN}<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>`,
  work: `${SVG_OPEN}<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`,
  media: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z"/></svg>`,
  star: `${SVG_OPEN}<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/></svg>`,
};

export const PIN_SVG = `${SVG_OPEN}<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v6"/></svg>`;

export const TRASH_SVG = `${SVG_OPEN}<path d="M4 7h16"/><path d="M10 4h4"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>`;

export const TAG_SVG = `${SVG_OPEN}<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>`;

export const BOOK_SVG = `${SVG_OPEN}<path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 1 2 2z"/><path d="M12 3v18"/></svg>`;

export const RULE_SVG = `${SVG_OPEN}<path d="M4 12h16"/></svg>`;

// Formatting controls. Bold is drawn filled — a stroked "B" reads as an outline
// letter next to the stroked icons either side of it.
export const PEN_SVG = `${SVG_OPEN}<path d="M4 20l3.5-.8L19 7.7a2 2 0 0 0 0-2.8l-.9-.9a2 2 0 0 0-2.8 0L3.8 15.5z"/><path d="M14.5 6.5l3 3"/></svg>`;

export const BOLD_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.6h5.6c2.6 0 4.2 1.3 4.2 3.4 0 1.4-.7 2.5-2 3 1.7.4 2.7 1.6 2.7 3.3 0 2.4-1.8 3.9-4.7 3.9H7zm2.7 2.2v3.1h2.5c1.2 0 1.9-.6 1.9-1.6s-.7-1.5-1.9-1.5zm0 5.2v3.6h2.9c1.3 0 2.1-.7 2.1-1.8s-.8-1.8-2.1-1.8z"/></svg>';

export const LINK_SVG = ICON_SVGS.link;

export const BULLET_LIST_SVG = `${SVG_OPEN}<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>`;

export const NUMBER_LIST_SVG = `${SVG_OPEN}<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.4 4.6h1.2V9"/><path d="M3 10.9h2.2L3 14.1h2.4"/><path d="M3.1 16.2h2.1l-1.1 1.4h.2a1 1 0 1 1-1 1.1"/></svg>`;

export const COLOR_KEYS = Object.keys(LEGEND_DEFAULTS.colors);
export const ICON_KEYS = Object.keys(LEGEND_DEFAULTS.icons);

/** A note nobody has coloured yet is light grey, not white. */
export const DEFAULT_COLOR_KEY = 'c7';

function nowIso() {
  return new Date().toISOString();
}

export function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------
// Rich body
//
// A note body is a flat list of lines, because that is what a sticky note is:
//   { type: 'p' | 'ul' | 'ol', spans: [{ text, bold, href? }] }
// Consecutive `ul` / `ol` lines render as one list, so a run of them numbers
// from 1. The formatting model is deliberately this small — bold, bullets,
// numbers, and http(s) link pills — and it is stored as data rather than HTML,
// so nothing has to be sanitized on the way in or out.
//
// `note.text` stays the plain-text projection of the body: it is what memory
// search, the memory table, and the extension bridge read.

const BLOCK_TYPES = ['p', 'ul', 'ol'];
const RICH_MAX_BLOCKS = 400;
const RICH_MAX_SPANS = 120;
export const HREF_MAX = 2048;

// Wiki pages are a slightly larger document than a note: headings and a rule,
// plus a higher block cap. Notes still refuse those types (BLOCK_TYPES above).
export const DOC_BLOCK_TYPES = ['h1', 'h2', 'p', 'ul', 'ol', 'hr'];
export const DOC_MAX_BLOCKS = 600;

/** A bullet or number marker at the start of a line, in the plain projection. */
const BULLET_LINE = /^\s*[-*+•]\s+(.*)$/;
const NUMBER_LINE = /^\s*\d{1,3}[.)]\s+(.*)$/;

function spanText(raw) {
  const text = typeof raw === 'string' ? raw : String(raw?.text ?? '');
  // Each block is one line; a stray newline would silently swallow the rest.
  return text.replace(/[\r\n\t]+/g, ' ');
}

/** http(s) only, capped — the same lone-URL check paste-to-card uses. */
export function normalizeHref(raw) {
  const href = typeof raw === 'string' ? raw.trim() : '';
  if (!href || href.length > HREF_MAX) return null;
  return isLoneUrl(href) ? href : null;
}

function normalizeSpans(raw) {
  const out = [];
  for (const span of Array.isArray(raw) ? raw.slice(0, RICH_MAX_SPANS) : []) {
    const text = spanText(span);
    if (!text) continue;
    const bold = typeof span === 'object' && span !== null ? Boolean(span.bold) : false;
    const href = typeof span === 'object' && span !== null ? normalizeHref(span.href) : null;
    const last = out[out.length - 1];
    if (last && last.bold === bold && (last.href || null) === href) last.text += text;
    else out.push(href ? { text, bold, href } : { text, bold });
  }
  return out;
}

function blockText(block) {
  return (block?.spans || []).map((span) => span.text).join('');
}

/** Validate a body from storage, the server, or a DOM read. Empty → null. */
export function normalizeRich(raw) {
  if (!Array.isArray(raw)) return null;
  const blocks = [];
  for (const block of raw.slice(0, RICH_MAX_BLOCKS)) {
    if (!block || typeof block !== 'object') continue;
    blocks.push({
      type: BLOCK_TYPES.includes(block.type) ? block.type : 'p',
      spans: normalizeSpans(block.spans),
    });
  }
  // A contenteditable leaves trailing empties behind: a blank last line, or the
  // bullet somebody started and never typed into.
  while (blocks.length && !blockText(blocks[blocks.length - 1])) blocks.pop();
  return blocks.length ? blocks : null;
}

/** Plain projection: bullets as "• ", numbered lines renumbered per run. */
export function richToText(blocks) {
  const lines = [];
  let counter = 0;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const text = blockText(block);
    if (block.type === 'ul') {
      counter = 0;
      lines.push(`• ${text}`);
    } else if (block.type === 'ol') {
      counter += 1;
      lines.push(`${counter}. ${text}`);
    } else {
      counter = 0;
      lines.push(text);
    }
  }
  return lines.join('\n').trim();
}

/**
 * Read a plain-text body as a rich one. Every note written before formatting
 * existed comes through here, so a note somebody typed as "- milk" becomes a
 * real bullet rather than a line that only looks like one.
 */
export function textToRich(text) {
  const blocks = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      blocks.push({ type: 'ul', spans: [{ text: bullet[1], bold: false }] });
      continue;
    }
    const numbered = NUMBER_LINE.exec(line);
    if (numbered) {
      blocks.push({ type: 'ol', spans: [{ text: numbered[1], bold: false }] });
      continue;
    }
    blocks.push({ type: 'p', spans: [{ text: line, bold: false }] });
  }
  return normalizeRich(blocks) || [{ type: 'p', spans: [] }];
}

/** The body to render for a note, whether or not it has been edited since. */
export function noteBlocks(note) {
  return note?.rich || textToRich(note?.text);
}

export function emptyDoc() {
  return { blocks: [] };
}

/**
 * A collection wiki body. Headings and a rule are allowed here; they are not
 * allowed on a note (`normalizeRich`). `noteId` is provenance from a pull —
 * a copy, not a live embed — and is kept even after the note is deleted so
 * the renderer can hide the chip rather than rewrite the page.
 */
export function normalizeDoc(raw) {
  const source = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? raw.blocks : null;
  if (!Array.isArray(source)) return emptyDoc();
  const blocks = [];
  for (const block of source.slice(0, DOC_MAX_BLOCKS)) {
    if (!block || typeof block !== 'object') continue;
    const type = DOC_BLOCK_TYPES.includes(block.type) ? block.type : 'p';
    if (type === 'hr') {
      blocks.push({ type: 'hr' });
      continue;
    }
    const next = { type, spans: normalizeSpans(block.spans) };
    if (block.noteId) next.noteId = String(block.noteId);
    blocks.push(next);
  }
  return { blocks };
}

export function docIsEmpty(doc) {
  const blocks = normalizeDoc(doc).blocks;
  return !blocks.some((block) => {
    if (block.type === 'hr') return true;
    return (block.spans || []).some((span) => span.text);
  });
}

/** One heading per colour group, one bullet per note. Notes stay raw. */
export function draftDocFromNotes(notes, legend) {
  const groups = new Map();
  for (const key of COLOR_KEYS) groups.set(key, []);
  groups.set(null, []);
  for (const note of Array.isArray(notes) ? notes : []) {
    const key = COLOR_KEYS.includes(note.colorKey) ? note.colorKey : null;
    groups.get(key).push(note);
  }
  const blocks = [];
  for (const [key, list] of groups) {
    if (!list.length) continue;
    const label = key ? legendLabel(legend, 'color', key) : 'Uncoloured';
    blocks.push({ type: 'h2', spans: [{ text: label, bold: false }] });
    for (const note of list) {
      const text = String(note.text || '').replace(/[\r\n]+/g, ' ').trim() || 'Note';
      blocks.push({ type: 'ul', spans: [{ text, bold: false }], noteId: note.id });
    }
  }
  return normalizeDoc({ blocks });
}

export function normalizeWiki(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const collectionId = String(raw.collectionId || '');
  if (!collectionId) return null;
  const updatedAt = raw.updatedAt || nowIso();
  return { collectionId, doc: normalizeDoc(raw.doc), updatedAt };
}

// Tags that end the current line, and the ones that make their contents bold.
const LINE_TAGS = new Set([
  'DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION',
  'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'TR', 'TD', 'TH',
]);
const BOLD_TAGS = new Set(['B', 'STRONG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TH']);

function isBoldNode(node) {
  if (BOLD_TAGS.has(node.tagName)) return true;
  const weight = String(node.style?.fontWeight || '');
  return weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
}

/**
 * Read a rendered body back into blocks. Takes anything shaped like a DOM node
 * (`nodeType` / `nodeValue` / `tagName` / `childNodes`), so it stays pure and
 * testable — a contenteditable hands back whatever markup the browser felt like
 * writing, and this is the one place that gets normalized.
 */
export function richFromNode(root) {
  const out = [];
  let line = null; // spans of the line being read; null = no line open
  let lineType = 'p';

  const open = (type) => {
    if (line) return;
    line = [];
    lineType = type;
  };
  const close = () => {
    if (!line) return;
    out.push({ type: lineType, spans: line });
    line = null;
  };

  const nodeText = (node) => {
    if (typeof node.textContent === 'string') return node.textContent;
    let out = '';
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) out += child.nodeValue || '';
      else if (child.nodeType === 1) out += nodeText(child);
    }
    return out;
  };

  const walk = (node, bold, type) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) {
        if (!child.nodeValue) continue;
        open(type);
        line.push({ text: child.nodeValue, bold });
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.tagName === 'A') {
        const href = normalizeHref(child.getAttribute?.('href') || child.href || '');
        if (href) {
          open(type);
          line.push({ text: nodeText(child), bold: bold || isBoldNode(child), href });
          continue;
        }
      }
      if (child.classList?.contains?.('sn-wiki-src')) continue;
      if (child.tagName === 'BR') {
        open(type);
        close();
        continue;
      }
      if (child.tagName === 'HR') {
        close();
        out.push({ type: 'hr', spans: [] });
        continue;
      }
      if (child.tagName === 'UL' || child.tagName === 'OL') {
        close();
        const listType = child.tagName === 'UL' ? 'ul' : 'ol';
        for (const item of child.childNodes || []) {
          if (item.nodeType !== 1 || item.tagName !== 'LI') continue;
          walkLine(item, bold, listType);
        }
        continue;
      }
      if (LINE_TAGS.has(child.tagName)) {
        close();
        const heading = child.tagName === 'H1' ? 'h1' : child.tagName === 'H2' ? 'h2' : type;
        walkLine(child, bold, heading);
        continue;
      }
      walk(child, bold || isBoldNode(child), type);
    }
  };

  // A block element is one line, even when it is empty — that is a blank line.
  const walkLine = (node, bold, type) => {
    const before = out.length;
    walk(node, bold, type);
    if (line) close();
    else if (out.length === before) out.push({ type, spans: [] });
  };

  walk(root, false, 'p');
  close();
  return out;
}

/**
 * The list a line-start marker asks for once the space lands — the Apple Notes
 * / Notion gesture ("* " or "- " for bullets, "1. " for numbers). `prefix` is
 * the text between the start of the line and the caret.
 */
export function listTriggerFor(prefix) {
  const marker = String(prefix ?? '').trim();
  if (marker !== String(prefix ?? '')) return null; // the marker must be alone
  if (/^[-*+•]$/.test(marker)) return 'ul';
  if (/^\d{1,3}[.)]$/.test(marker)) return 'ol';
  return null;
}

/**
 * Wiki-only: "# " becomes a heading, "## " a subheading. Notes never call this
 * — their body whitelist has no headings.
 */
export function headingTriggerFor(prefix) {
  const marker = String(prefix ?? '').trim();
  if (marker !== String(prefix ?? '')) return null;
  if (marker === '#') return 'h1';
  if (marker === '##') return 'h2';
  return null;
}

// ---------------------------------------------------------------------------
// Normalizers

export function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // A rich body is authoritative when present; `text` is its projection, so the
  // two can never drift apart in the store.
  const rich = normalizeRich(raw.rich);
  const text = rich ? richToText(rich) : String(raw.text ?? '').trim();
  if (!text) return null;
  return noteShape(raw, text, rich);
}

/**
 * The blank card you are composing. A note with no text is nothing, so the
 * store refuses one (`normalizeNote` above) — this shape lives in the board
 * until the first character makes it real, carrying whatever colour, icon, or
 * pin was chosen in the meantime.
 */
export function blankNote(partial = {}) {
  return noteShape(partial || {}, '', null);
}

/** World-space size stamped on a new note. Phone cards are larger; desktop is not. */
export function noteCreateSize(phone) {
  return phone ? { w: NOTE_W_PHONE, h: NOTE_H_PHONE } : { w: NOTE_W_DEFAULT, h: NOTE_H_DEFAULT };
}

/**
 * Canvas | table preference. `stored` is the v2 key — a v2 pick always wins.
 * Unset opens the whiteboard, phone and desktop. On desktop only, a leftover
 * v1 pick is honored so a desktop table user is not forced back to the canvas.
 * On coarse/narrow (≤720), a leftover v1 `table` (#276's phone default) is
 * ignored; the first explicit toggle after that writes v2 and is honored.
 */
export function defaultBoardView(stored, { coarse = false, width = 1024, legacy = null } = {}) {
  if (stored === 'table' || stored === 'canvas') return stored;
  const phone = coarse && width <= PHONE_VIEW_MAX;
  if (!phone && (legacy === 'table' || legacy === 'canvas')) return legacy;
  return 'canvas';
}

/** True when a leftover phone `table` should be written to the v2 key as canvas. */
export function phoneBoardViewNeedsReset(stored, { coarse = false, width = 1024, legacy = null } = {}) {
  return (
    stored !== 'table' &&
    stored !== 'canvas' &&
    coarse &&
    width <= PHONE_VIEW_MAX &&
    legacy === 'table'
  );
}

/**
 * Board | Memory tab. Phone first paint is always the board — a leftover
 * `sticky-notes-view` of `memory` is ignored so a new session does not open
 * on Memory search. Desktop still honors a stored pick. Tapping Memory this
 * visit still writes the key; the next phone load ignores it again.
 *
 * Phone here is a coarse pointer and/or a viewport ≤ `PHONE_VIEW_MAX`.
 */
export function defaultTab(stored, { coarse = false, width = 1024 } = {}) {
  const phone = coarse || width <= PHONE_VIEW_MAX;
  if (phone) return 'board';
  return stored === 'memory' ? 'memory' : 'board';
}

function noteShape(raw, text, rich) {
  const created = raw.createdAt || nowIso();
  return {
    id: String(raw.id || randomId()),
    text,
    rich,
    colorKey: COLOR_KEYS.includes(raw.colorKey) ? raw.colorKey : null,
    iconKey: ICON_KEYS.includes(raw.iconKey) ? raw.iconKey : null,
    status: raw.status === 'memory' ? 'memory' : 'board',
    collectionId: raw.collectionId ? String(raw.collectionId) : null,
    x: num(raw.x, 24),
    y: num(raw.y, 24),
    w: clamp(num(raw.w, NOTE_W_DEFAULT), NOTE_W_MIN, NOTE_W_MAX),
    h: Math.max(NOTE_H_MIN, num(raw.h, NOTE_H_DEFAULT)),
    pinned: Boolean(raw.pinned),
    sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
    sourceTitle: raw.sourceTitle ? String(raw.sourceTitle) : null,
    createdAt: created,
    updatedAt: raw.updatedAt || created,
    filedAt: raw.filedAt || null,
  };
}

export function normalizeCollection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  if (!name) return null;
  const created = raw.createdAt || nowIso();
  return {
    id: String(raw.id || randomId()),
    name,
    status: raw.status === 'memory' ? 'memory' : 'board',
    createdAt: created,
    updatedAt: raw.updatedAt || created,
    filedAt: raw.filedAt || null,
  };
}

/**
 * Board ink — text written straight onto the board, not a note. It is working
 * scaffolding: labels over a cluster, a word between two arrows. It has no
 * status, so it can never be filed, and a wipe deletes it outright.
 */
export function normalizeInk(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? '').replace(/\r/g, '').trim();
  if (!text) return null;
  const created = raw.createdAt || nowIso();
  return {
    id: String(raw.id || randomId()),
    text,
    x: num(raw.x, 24),
    y: num(raw.y, 24),
    createdAt: created,
    updatedAt: raw.updatedAt || created,
  };
}

export function normalizeArrow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.fromId || !raw.toId || String(raw.fromId) === String(raw.toId)) return null;
  return {
    id: String(raw.id || randomId()),
    fromId: String(raw.fromId),
    toId: String(raw.toId),
    createdAt: raw.createdAt || nowIso(),
  };
}

export function normalizeLegend(raw) {
  const out = { colors: {}, icons: {} };
  if (raw && typeof raw === 'object') {
    for (const [key, label] of Object.entries(raw.colors || {})) {
      if (COLOR_KEYS.includes(key) && String(label).trim()) out.colors[key] = String(label).trim();
    }
    for (const [key, label] of Object.entries(raw.icons || {})) {
      if (ICON_KEYS.includes(key) && String(label).trim()) out.icons[key] = String(label).trim();
    }
  }
  return out;
}

export function emptyState() {
  return {
    version: 2,
    notes: [],
    collections: [],
    arrows: [],
    ink: [],
    wikis: [],
    legend: { colors: {}, icons: {} },
  };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  const notes = Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [];
  const collections = Array.isArray(raw.collections)
    ? raw.collections.map(normalizeCollection).filter(Boolean)
    : [];
  const noteIds = new Set(notes.map((n) => n.id));
  const arrows = Array.isArray(raw.arrows)
    ? raw.arrows
        .map(normalizeArrow)
        .filter(Boolean)
        .filter((a) => noteIds.has(a.fromId) && noteIds.has(a.toId))
    : [];
  const ink = Array.isArray(raw.ink) ? raw.ink.map(normalizeInk).filter(Boolean) : [];
  const colIds = new Set(collections.map((c) => c.id));
  const wikis = Array.isArray(raw.wikis)
    ? raw.wikis.map(normalizeWiki).filter(Boolean).filter((w) => colIds.has(w.collectionId))
    : [];
  return { version: 2, notes, collections, arrows, ink, wikis, legend: normalizeLegend(raw.legend) };
}

// ---------------------------------------------------------------------------
// Legend lookups

export function legendLabel(legend, kind, key) {
  if (!key) return '';
  const overrides = legend?.[kind === 'color' ? 'colors' : 'icons'] || {};
  if (overrides[key]) return overrides[key];
  if (kind === 'color') return LEGEND_DEFAULTS.colors[key]?.label || key;
  return LEGEND_DEFAULTS.icons[key] || key;
}

export function colorHex(key) {
  return LEGEND_DEFAULTS.colors[key]?.hex || 'transparent';
}

// ---------------------------------------------------------------------------
// v0 migration

const LEGACY_COLOR_MAP = { yellow: 'c1', pink: 'c2', blue: 'c3', green: 'c4', purple: 'c5' };

export function migrateLegacyStore(rawV0) {
  if (!rawV0 || !Array.isArray(rawV0.notes)) return [];
  const out = [];
  for (const old of rawV0.notes) {
    if (!old || typeof old !== 'object') continue;
    const note = normalizeNote({
      id: old.id,
      text: old.text,
      colorKey: LEGACY_COLOR_MAP[old.color] || null,
      x: old.x,
      y: old.y,
      w: old.width,
      h: old.height,
      pinned: old.pinned,
      sourceUrl: old.source?.url || null,
      sourceTitle: old.source?.title || null,
      createdAt: old.createdAt,
      updatedAt: old.updatedAt,
    });
    if (note) out.push(note);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merge (last-write-wins by updatedAt) — used when reconciling server state
// with the localStorage mirror.

function lww(list, incoming, key = 'id') {
  const byId = new Map(list.map((item) => [item[key], item]));
  for (const item of incoming) {
    const existing = byId.get(item[key]);
    if (!existing) {
      byId.set(item[key], item);
      continue;
    }
    const a = Date.parse(existing.updatedAt) || 0;
    const b = Date.parse(item.updatedAt) || 0;
    if (b >= a) byId.set(item[key], item);
  }
  return [...byId.values()];
}

export function mergeStates(base, incoming) {
  const a = normalizeState(base);
  const b = normalizeState(incoming);
  const arrowsById = new Map(a.arrows.map((ar) => [ar.id, ar]));
  for (const ar of b.arrows) arrowsById.set(ar.id, ar);
  return normalizeState({
    notes: lww(a.notes, b.notes),
    collections: lww(a.collections, b.collections),
    arrows: [...arrowsById.values()],
    ink: lww(a.ink, b.ink),
    wikis: lww(a.wikis, b.wikis, 'collectionId'),
    legend: {
      colors: { ...a.legend.colors, ...b.legend.colors },
      icons: { ...a.legend.icons, ...b.legend.icons },
    },
  });
}

/** True when a state holds nothing worth keeping — no notes, no ink. */
export function stateIsEmpty(state) {
  const s = normalizeState(state);
  return !s.notes.length && !(s.ink || []).length && !s.collections.length && !(s.wikis || []).length;
}

/**
 * Every row of a state as the ops that would recreate it. Used when a guest
 * signs in: their local board is replayed into the account's queue, so it lands
 * on the server the same way anything else does.
 */
export function stateToOps(state) {
  const s = normalizeState(state);
  const ops = [];
  for (const col of s.collections) {
    ops.push({
      op: 'collection.create',
      id: col.id,
      name: col.name,
      status: col.status,
      ts: col.createdAt,
    });
    if (col.status === 'memory') ops.push({ op: 'file', collectionId: col.id, ts: col.filedAt || col.updatedAt });
  }
  for (const note of s.notes) ops.push({ op: 'note.upsert', note });
  for (const arrow of s.arrows) {
    ops.push({ op: 'arrow.create', id: arrow.id, fromId: arrow.fromId, toId: arrow.toId, ts: arrow.createdAt });
  }
  for (const ink of s.ink || []) ops.push({ op: 'ink.upsert', ink });
  for (const kind of ['colors', 'icons']) {
    for (const [key, label] of Object.entries(s.legend[kind])) {
      ops.push({ op: 'legend.set', kind: kind === 'colors' ? 'color' : 'icon', key, label });
    }
  }
  for (const wiki of s.wikis || []) {
    ops.push({ op: 'wiki.set', collectionId: wiki.collectionId, doc: wiki.doc, ts: wiki.updatedAt });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Op reducer — the single source of mutation semantics.

function touch(note, ts) {
  return { ...note, updatedAt: ts || nowIso() };
}

export function applyOps(state, ops) {
  let next = {
    ...state,
    notes: [...state.notes],
    collections: [...state.collections],
    arrows: [...state.arrows],
    ink: [...(state.ink || [])],
    wikis: [...(state.wikis || [])],
    legend: { colors: { ...state.legend.colors }, icons: { ...state.legend.icons } },
  };
  for (const op of Array.isArray(ops) ? ops : []) {
    next = applyOp(next, op);
  }
  return next;
}

function mapNotes(state, ids, fn) {
  const set = new Set(ids);
  return { ...state, notes: state.notes.map((n) => (set.has(n.id) ? fn(n) : n)) };
}

function applyOp(state, op) {
  if (!op || typeof op !== 'object') return state;
  const ts = op.ts || nowIso();
  switch (op.op) {
    case 'note.upsert': {
      const note = normalizeNote(op.note);
      if (!note) return state;
      const idx = state.notes.findIndex((n) => n.id === note.id);
      if (idx === -1) return { ...state, notes: [...state.notes, note] };
      const existing = state.notes[idx];
      if ((Date.parse(note.updatedAt) || 0) < (Date.parse(existing.updatedAt) || 0)) return state;
      const notes = [...state.notes];
      notes[idx] = note;
      return { ...state, notes };
    }
    case 'note.move':
      return mapNotes(state, [op.id], (n) => touch({ ...n, x: num(op.x, n.x), y: num(op.y, n.y) }, ts));
    case 'note.resize':
      return mapNotes(state, [op.id], (n) =>
        touch(
          {
            ...n,
            w: clamp(num(op.w, n.w), NOTE_W_MIN, NOTE_W_MAX),
            h: Math.max(NOTE_H_MIN, num(op.h, n.h)),
          },
          ts,
        ),
      );
    case 'note.pin':
      return mapNotes(state, op.ids || [], (n) => touch({ ...n, pinned: Boolean(op.pinned) }, ts));
    case 'note.categorize':
      return mapNotes(state, op.ids || [], (n) => {
        const next = { ...n };
        if ('colorKey' in op) next.colorKey = COLOR_KEYS.includes(op.colorKey) ? op.colorKey : null;
        if ('iconKey' in op) next.iconKey = ICON_KEYS.includes(op.iconKey) ? op.iconKey : null;
        return touch(next, ts);
      });
    case 'note.delete': {
      const gone = new Set(op.ids || []);
      return {
        ...state,
        notes: state.notes.filter((n) => !gone.has(n.id)),
        arrows: state.arrows.filter((a) => !gone.has(a.fromId) && !gone.has(a.toId)),
      };
    }
    case 'ink.upsert': {
      const ink = normalizeInk(op.ink);
      if (!ink) return state;
      const list = state.ink || [];
      const idx = list.findIndex((i) => i.id === ink.id);
      if (idx === -1) return { ...state, ink: [...list, ink] };
      if ((Date.parse(ink.updatedAt) || 0) < (Date.parse(list[idx].updatedAt) || 0)) return state;
      const ink2 = [...list];
      ink2[idx] = ink;
      return { ...state, ink: ink2 };
    }
    case 'ink.move':
      return {
        ...state,
        ink: (state.ink || []).map((i) =>
          i.id === op.id ? { ...i, x: num(op.x, i.x), y: num(op.y, i.y), updatedAt: ts } : i,
        ),
      };
    case 'ink.delete': {
      const gone = new Set(op.ids || []);
      return { ...state, ink: (state.ink || []).filter((i) => !gone.has(i.id)) };
    }
    case 'arrow.create': {
      const arrow = normalizeArrow({ id: op.id, fromId: op.fromId, toId: op.toId, createdAt: ts });
      if (!arrow) return state;
      const ids = new Set(state.notes.map((n) => n.id));
      if (!ids.has(arrow.fromId) || !ids.has(arrow.toId)) return state;
      const dupe = state.arrows.some((a) => a.fromId === arrow.fromId && a.toId === arrow.toId);
      if (dupe) return state;
      return { ...state, arrows: [...state.arrows, arrow] };
    }
    case 'arrow.delete': {
      const gone = new Set(op.ids || []);
      return { ...state, arrows: state.arrows.filter((a) => !gone.has(a.id)) };
    }
    case 'collection.create': {
      const col = normalizeCollection({
        id: op.id,
        name: op.name,
        status: op.status,
        createdAt: ts,
        updatedAt: ts,
        filedAt: op.status === 'memory' ? ts : null,
      });
      if (!col) return state;
      if (state.collections.some((c) => c.id === col.id)) return state;
      return { ...state, collections: [...state.collections, col] };
    }
    case 'collection.rename': {
      const name = String(op.name ?? '').trim();
      if (!name) return state;
      return {
        ...state,
        collections: state.collections.map((c) =>
          c.id === op.id ? { ...c, name, updatedAt: ts } : c,
        ),
      };
    }
    case 'collection.assign':
      return mapNotes(state, op.ids || [], (n) =>
        touch({ ...n, collectionId: op.collectionId ? String(op.collectionId) : null }, ts),
      );
    case 'collection.delete': {
      const id = String(op.id || '');
      const memberIds = state.notes.filter((n) => n.collectionId === id).map((n) => n.id);
      let next = {
        ...state,
        collections: state.collections.filter((c) => c.id !== id),
        wikis: (state.wikis || []).filter((w) => w.collectionId !== id),
      };
      if (op.deleteNotes) {
        next = applyOp(next, { op: 'note.delete', ids: memberIds });
      } else {
        next = mapNotes(next, memberIds, (n) => touch({ ...n, collectionId: null }, ts));
      }
      return next;
    }
    case 'wiki.set': {
      const collectionId = String(op.collectionId || '');
      if (!collectionId) return state;
      if (!state.collections.some((c) => c.id === collectionId)) return state;
      const wiki = normalizeWiki({ collectionId, doc: op.doc, updatedAt: ts });
      if (!wiki) return state;
      const list = state.wikis || [];
      const idx = list.findIndex((w) => w.collectionId === collectionId);
      if (idx === -1) return { ...state, wikis: [...list, wiki] };
      if ((Date.parse(wiki.updatedAt) || 0) < (Date.parse(list[idx].updatedAt) || 0)) return state;
      const wikis = [...list];
      wikis[idx] = wiki;
      return { ...state, wikis };
    }
    case 'file':
      return transition(state, op, 'memory', ts);
    case 'restore':
      return transition(state, op, 'board', ts);
    case 'wipe': {
      const noteIds = state.notes
        .filter((n) => n.status === 'board' && !n.pinned)
        .map((n) => n.id);
      let next = mapNotes(state, noteIds, (n) => touch({ ...n, status: 'memory', filedAt: ts }, ts));
      const stillOnBoard = new Set(
        next.notes.filter((n) => n.status === 'board').map((n) => n.collectionId).filter(Boolean),
      );
      next = {
        ...next,
        collections: next.collections.map((c) =>
          c.status === 'board' && !stillOnBoard.has(c.id)
            ? { ...c, status: 'memory', filedAt: ts, updatedAt: ts }
            : c,
        ),
        // Board ink is scaffolding for the arrangement being wiped, so it goes
        // with it. It is never filed — memory holds notes, not annotations.
        ink: [],
      };
      return next;
    }
    case 'legend.set': {
      const kind = op.kind === 'color' ? 'colors' : op.kind === 'icon' ? 'icons' : null;
      if (!kind) return state;
      const valid = kind === 'colors' ? COLOR_KEYS : ICON_KEYS;
      if (!valid.includes(op.key)) return state;
      const label = String(op.label ?? '').trim();
      const legend = { colors: { ...state.legend.colors }, icons: { ...state.legend.icons } };
      if (label) legend[kind][op.key] = label;
      else delete legend[kind][op.key];
      return { ...state, legend };
    }
    default:
      return state;
  }
}

function transition(state, op, toStatus, ts) {
  let noteIds = [];
  let collectionIds = [];
  if (op.collectionId) {
    collectionIds = [String(op.collectionId)];
    noteIds = state.notes
      .filter((n) => n.collectionId === op.collectionId && n.status !== toStatus)
      .map((n) => n.id);
  }
  if (Array.isArray(op.ids)) noteIds = [...new Set([...noteIds, ...op.ids])];
  const filedAt = toStatus === 'memory' ? ts : null;
  let next = mapNotes(state, noteIds, (n) => touch({ ...n, status: toStatus, filedAt }, ts));
  if (collectionIds.length) {
    const set = new Set(collectionIds);
    next = {
      ...next,
      collections: next.collections.map((c) =>
        set.has(c.id) ? { ...c, status: toStatus, filedAt, updatedAt: ts } : c,
      ),
    };
  }
  return next;
}

/**
 * What a wipe would take — the client captures this before wiping for Undo.
 * Notes and collections are filed and can be restored; ink is deleted, so undo
 * re-upserts the rows themselves.
 */
export function wipeTargets(state) {
  const noteIds = state.notes.filter((n) => n.status === 'board' && !n.pinned).map((n) => n.id);
  const filing = new Set(noteIds);
  const keepsCollection = new Set(
    state.notes
      .filter((n) => n.status === 'board' && !filing.has(n.id))
      .map((n) => n.collectionId)
      .filter(Boolean),
  );
  const collectionIds = state.collections
    .filter((c) => c.status === 'board' && !keepsCollection.has(c.id))
    .map((c) => c.id);
  return { noteIds, collectionIds, ink: [...(state.ink || [])] };
}

// ---------------------------------------------------------------------------
// Geometry — canvas math and board helpers. All pure.

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Scale a viewport about a fixed screen point — the world coordinate under
 * `point` stays under `point`. Shared by Ctrl/Cmd+wheel, the ± buttons and
 * two-finger pinch so all three anchor identically.
 */
export function zoomAt(viewport, point, factor) {
  const zoom = clamp(viewport.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  return {
    panX: point.x - ((point.x - viewport.panX) / viewport.zoom) * zoom,
    panY: point.y - ((point.y - viewport.panY) / viewport.zoom) * zoom,
    zoom,
  };
}

/**
 * The slice of the layout viewport the user can actually see. A phone
 * keyboard shrinks `visualViewport.height` (and may shift `offsetTop`)
 * without changing `window.innerHeight`.
 */
export function visibleSlice(visual, innerHeight) {
  const fallback = Number.isFinite(innerHeight) ? innerHeight : 0;
  if (!visual || !Number.isFinite(visual.height)) {
    return { top: 0, bottom: fallback, height: fallback };
  }
  const top = Number.isFinite(visual.offsetTop) ? visual.offsetTop : 0;
  return { top, bottom: top + visual.height, height: visual.height };
}

/** How much of the layout viewport is hidden below the visual slice. */
export function keyboardInset(visual, innerHeight) {
  return Math.max(0, (Number.isFinite(innerHeight) ? innerHeight : 0) - visibleSlice(visual, innerHeight).bottom);
}

/**
 * Treat a phone keyboard as a layout inset. The remaining page is the
 * visual slice (`height` + `offsetTop`) — not a camera pan, and not a
 * document scroll. `active` when enough of the layout viewport is gone.
 */
export function keyboardLayout(visual, innerHeight) {
  const slice = visibleSlice(visual, innerHeight);
  const layoutH = Number.isFinite(innerHeight) ? innerHeight : slice.height;
  const inset = Math.max(0, layoutH - slice.bottom);
  return {
    height: slice.height,
    offsetTop: slice.top,
    inset,
    active: inset >= 48,
  };
}

/**
 * Time constant for the phone keyboard shell lerp. One tau closes ~63% of
 * the remaining gap; the canvas settles in about four taus (~220 ms).
 */
export const KEYBOARD_INSET_TAU = 0.055;

/** Exponential approach. `dt` and `tau` are seconds. */
export function approach(current, target, dt, tau = KEYBOARD_INSET_TAU) {
  if (!Number.isFinite(target)) return current;
  if (!Number.isFinite(current)) return target;
  if (!(tau > 0)) return target;
  if (!(dt > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/**
 * Visible slice used while the shell height is interpolating toward
 * visualViewport. When `displayed` has a finite height, that in-flight
 * size wins so the docked edit bar slides with the canvas.
 */
export function displayedKeyboardSlice(visual, innerHeight, displayed) {
  const slice = visibleSlice(visual, innerHeight);
  if (!displayed || !Number.isFinite(displayed.height)) return slice;
  const top = Number.isFinite(displayed.offsetTop) ? displayed.offsetTop : slice.top;
  return { top, bottom: top + displayed.height, height: displayed.height };
}

/**
 * Zoom a world-sized card up to a usable on-screen width on the phone.
 * Desktop callers should not use this — it never shrinks, only lifts a
 * postage-stamp card toward `minScreenW` without exceeding the viewport.
 */
export function phoneNoteZoom({ zoom, noteW, viewW, minScreenW = 260 } = {}) {
  const current = Number.isFinite(zoom) ? zoom : 1;
  const w = Number.isFinite(noteW) ? noteW : 0;
  const view = Number.isFinite(viewW) ? viewW : 0;
  const minW = Number.isFinite(minScreenW) ? minScreenW : 260;
  const screenW = w * current;
  if (!(w > 0 && view > 0) || screenW >= minW) {
    return { zoom: current, changed: false };
  }
  const needed = minW / w;
  const capped = (view - 24) / w;
  const next = clamp(Math.min(needed, capped), ZOOM_MIN, ZOOM_MAX);
  return { zoom: next, changed: next > current + 0.01 };
}

/**
 * Edit-bar position for the note (or ink) being typed.
 *
 * Phone / coarse: the keyboard is a layout inset, so the remaining canvas
 * is already the space above it. Do not pan (`dy` is 0). Dock the slim
 * bar at the bottom of that slice, just above the keyboard.
 * Desktop is the existing float-above / flip-below behaviour (`dy` may
 * nudge a card that sits under the floating bar).
 *
 * The document scale stays 1.
 */
export function planEditSession({ card, barW, barH, canvas, visible, phone }) {
  const width = Number.isFinite(barW) ? barW : 0;
  const height = Number.isFinite(barH) ? barH : 0;
  const clipTop = Math.max(canvas.top, visible.top);
  const clipBottom = Math.min(canvas.bottom, visible.bottom);
  const minLeft = canvas.left + 4;
  const maxLeft = Math.max(minLeft, canvas.right - width - 4);

  if (phone) {
    return {
      dy: 0,
      top: clipBottom - height - 4,
      left: minLeft,
      docked: true,
    };
  }

  const minTop = clipTop + 4;
  const maxTop = clipBottom - height - 4;
  const reserveTop = 44;
  const bandTop = clipTop + reserveTop;
  const bandBottom = clipBottom - 12;
  let dy = 0;
  if (!(card.top >= bandTop && card.bottom <= bandBottom)) {
    dy = card.bottom > bandBottom ? bandBottom - card.bottom : 0;
    if (card.top + dy < bandTop) dy = bandTop - card.top;
  }

  const nextTop = card.top + dy;
  const nextBottom = card.bottom + dy;
  const above = nextTop - height - 8;
  let top = above < minTop ? nextBottom + 8 : above;
  top = clamp(top, minTop, Math.max(minTop, maxTop));
  const left = clamp(card.left + (card.width || 0) / 2 - width / 2, minLeft, maxLeft);
  return { dy, top, left, docked: false };
}

/**
 * Edit-bar popover offsets (colour, icon, link) relative to the trigger wrap.
 *
 * The wrap is only as wide as the button, so callers must size the popover
 * themselves (`width: max-content`) — this helper only places a measured box.
 *
 * Desktop flips below the bar when there is no room above the canvas ceiling.
 * A docked phone bar sits on the remaining-canvas floor (just above the
 * keyboard): below it is off-screen, so `preferAbove` always opens upward
 * and, when the box is taller than the slice, caps `maxHeight` so it stays
 * in the remaining canvas instead of sliding under the keys.
 */
export function placeEditPopover({
  wrap,
  bar,
  pop,
  ceiling,
  viewW,
  preferAbove = false,
  gap = 8,
  margin = 6,
} = {}) {
  const wrapTop = Number.isFinite(wrap?.top) ? wrap.top : 0;
  const wrapBottom = Number.isFinite(wrap?.bottom) ? wrap.bottom : 0;
  const wrapLeft = Number.isFinite(wrap?.left) ? wrap.left : 0;
  const wrapRight = Number.isFinite(wrap?.right) ? wrap.right : 0;
  const barTop = Number.isFinite(bar?.top) ? bar.top : 0;
  const barBottom = Number.isFinite(bar?.bottom) ? bar.bottom : 0;
  const popH = Number.isFinite(pop?.height) ? pop.height : 0;
  const popW = Number.isFinite(pop?.width) ? pop.width : 0;
  const ceil = Number.isFinite(ceiling) ? ceiling : 0;
  const width = Number.isFinite(viewW) ? viewW : 0;
  const space = Number.isFinite(gap) ? gap : 8;
  const pad = Number.isFinite(margin) ? margin : 6;

  const availAbove = barTop - space - ceil;
  const maxHeight = preferAbove && popH > availAbove && availAbove > 0
    ? Math.floor(availAbove)
    : null;
  const openAbove = preferAbove || availAbove >= popH;

  let top = null;
  let bottom = null;
  if (openAbove) {
    bottom = Math.round(wrapBottom - barTop + space);
  } else {
    top = Math.round(barBottom - wrapTop + space);
  }

  const mid = (wrapLeft + wrapRight) / 2;
  const centeredLeft = mid - popW / 2;
  const shift = centeredLeft < pad
    ? pad - centeredLeft
    : Math.min(0, width - pad - (centeredLeft + popW));

  return {
    top,
    bottom,
    shift: Math.round(shift),
    above: openAbove,
    maxHeight,
  };
}

/** Rect intersection where touching edges count as a hit. */
export function rectsIntersect(a, b) {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/**
 * First free slot for a new note inside a world-space region, scanning a 24px
 * grid left-to-right / top-to-bottom; cascades from the region's top-left with
 * a 16px step when the region is full.
 */
export function findFreeSlot(region, rects, slotW = NOTE_W_DEFAULT + 16, slotH = 140) {
  const step = 24;
  const startX = Math.ceil((region.x + 16) / step) * step;
  const startY = Math.ceil((region.y + 16) / step) * step;
  for (let y = startY; y + slotH <= region.y + region.h; y += step) {
    for (let x = startX; x + slotW <= region.x + region.w; x += step) {
      const candidate = { x, y, w: slotW, h: slotH };
      if (!rects.some((r) => rectsIntersect(candidate, r))) return { x, y };
    }
  }
  const n = rects.length;
  return { x: region.x + 24 + (n % 12) * 16, y: region.y + 24 + (n % 12) * 16 };
}

/** Bounding box of a set of note rects (or null when empty). */
export function bbox(rects) {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Viewport that frames `rects` inside a viewportW×viewportH screen, padded. */
export function fitViewport(rects, viewportW, viewportH, pad = 48) {
  const box = bbox(rects);
  if (!box) return { panX: 0, panY: 0, zoom: 1 };
  const zoom = clamp(
    Math.min((viewportW - pad * 2) / Math.max(box.w, 1), (viewportH - pad * 2) / Math.max(box.h, 1)),
    ZOOM_MIN,
    ZOOM_MAX,
  );
  return {
    panX: (viewportW - box.w * zoom) / 2 - box.x * zoom,
    panY: (viewportH - box.h * zoom) / 2 - box.y * zoom,
    zoom,
  };
}

/**
 * Clip the segment between two rect centers to the rect borders, so arrows
 * run edge-to-edge. Returns { x1, y1, x2, y2 } or null for overlapping cards.
 */
export function arrowEndpoints(fromRect, toRect) {
  const c1 = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 };
  const c2 = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 };
  const p1 = clipToRect(c1, c2, fromRect);
  const p2 = clipToRect(c2, c1, toRect);
  if (!p1 || !p2) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

function clipToRect(inside, outside, rect) {
  const dx = outside.x - inside.x;
  const dy = outside.y - inside.y;
  if (dx === 0 && dy === 0) return null;
  let tMin = Infinity;
  if (dx > 0) tMin = Math.min(tMin, (rect.x + rect.w - inside.x) / dx);
  if (dx < 0) tMin = Math.min(tMin, (rect.x - inside.x) / dx);
  if (dy > 0) tMin = Math.min(tMin, (rect.y + rect.h - inside.y) / dy);
  if (dy < 0) tMin = Math.min(tMin, (rect.y - inside.y) / dy);
  if (!Number.isFinite(tMin) || tMin < 0) return null;
  const t = Math.min(tMin, 1);
  return { x: inside.x + dx * t, y: inside.y + dy * t };
}

/** True when `text` is a lone http(s) URL (paste-to-link-card detection). */
export function isLoneUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function urlDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

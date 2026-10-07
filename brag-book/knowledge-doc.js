/**
 * Knowledge page document. Browser-safe ESM. No innerHTML.
 * Blocks are paragraphs, h1–h3 headings, or bullets. Inline marks are bold and italic.
 * `body` stays the plain-text projection so search never sees markup.
 */

export const KNOWLEDGE_LIST_INDENT_MAX = 6;
const TEXT_MAX = 100000;
const BLOCK_MAX = 2000;
const HEADING_TYPES = new Set(['h1', 'h2', 'h3']);

function spanText(spans) {
  return (spans || []).map((span) => span.text).join('');
}

function mergeSpans(spans) {
  const out = [];
  for (const span of spans) {
    if (!span?.text) continue;
    const last = out[out.length - 1];
    if (last && last.bold === span.bold && last.italic === span.italic) last.text += span.text;
    else out.push({ text: span.text, bold: span.bold === true, italic: span.italic === true });
  }
  return out;
}

function cleanSpan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let text = String(raw.text ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (!text) return null;
  return { text, bold: raw.bold === true, italic: raw.italic === true };
}

function expandNewlines(type, indent, spans) {
  const pieces = [[]];
  for (const span of spans) {
    const parts = span.text.split('\n');
    parts.forEach((part, index) => {
      if (part) pieces[pieces.length - 1].push({ ...span, text: part });
      if (index < parts.length - 1) pieces.push([]);
    });
  }
  return pieces.map((piece) => ({ type, indent, spans: mergeSpans(piece) }));
}

export function normalizeKnowledgeDoc(value, { keepEmpty = false } = {}) {
  if (!Array.isArray(value)) return [];
  const out = [];
  let budget = TEXT_MAX;
  for (const raw of value) {
    if (out.length >= BLOCK_MAX || budget <= 0) break;
    if (!raw || typeof raw !== 'object') continue;
    if (raw.type !== 'p' && raw.type !== 'li' && !HEADING_TYPES.has(raw.type)) continue;
    const type = raw.type;
    const indent = type === 'li'
      ? Math.max(0, Math.min(KNOWLEDGE_LIST_INDENT_MAX, Number(raw.indent) || 0))
      : 0;
    const spans = [];
    for (const item of Array.isArray(raw.spans) ? raw.spans : []) {
      const span = cleanSpan(item);
      if (span) spans.push(span);
    }
    for (const block of expandNewlines(type, indent, spans)) {
      if (out.length >= BLOCK_MAX || budget <= 0) break;
      if (!block.spans.length) {
        if (keepEmpty) out.push({ type: block.type, indent: block.indent, spans: [] });
        continue;
      }
      const fitted = [];
      for (const span of block.spans) {
        if (budget <= 0) break;
        const text = span.text.length > budget ? span.text.slice(0, budget) : span.text;
        budget -= text.length;
        if (text) fitted.push({ ...span, text });
      }
      if (fitted.length) out.push({ type: block.type, indent: block.indent, spans: mergeSpans(fitted) });
    }
  }
  return out;
}

function parseBoldMarkers(text) {
  const raw = String(text || '');
  const spans = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(raw))) {
    if (match.index > last) spans.push({ text: raw.slice(last, match.index), bold: false, italic: false });
    spans.push({ text: match[1], bold: true, italic: false });
    last = match.index + match[0].length;
  }
  if (last < raw.length) spans.push({ text: raw.slice(last), bold: false, italic: false });
  return spans.length ? spans : [];
}

export function knowledgeDocFromLegacy(body, rich) {
  const source = Array.isArray(rich) && rich.some((span) => String(span?.text || '').length)
    ? rich.map((span) => ({
      text: span?.text,
      bold: span?.bold === true,
      italic: span?.italic === true,
    }))
    : parseBoldMarkers(body);
  if (!source.length) return [];
  return normalizeKnowledgeDoc([{ type: 'p', indent: 0, spans: source }]);
}

export function knowledgePlainText(doc) {
  return normalizeKnowledgeDoc(doc, { keepEmpty: true }).map((block) => spanText(block.spans)).join('\n');
}

export function knowledgeRichSpans(doc) {
  const blocks = normalizeKnowledgeDoc(doc);
  const spans = [];
  const push = (text, bold) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold) last.text += text;
    else spans.push({ text, bold });
  };
  blocks.forEach((block, index) => {
    if (index) push('\n', false);
    for (const span of block.spans) push(span.text, span.bold === true);
  });
  return spans;
}

export function knowledgeDocForEditor(doc) {
  const blocks = normalizeKnowledgeDoc(doc, { keepEmpty: true });
  return blocks.length ? blocks : [{ type: 'p', indent: 0, spans: [] }];
}

export function knowledgeSearchText(note) {
  if (Array.isArray(note?.doc)) return knowledgePlainText(note.doc);
  return String(note?.body || '').replace(/\*\*/g, '');
}

export function knowledgeEditEffects(eventType) {
  if (eventType === 'input' || eventType === 'keydown' || eventType === 'toolbar') {
    return { save: true, render: false };
  }
  return { save: false, render: false };
}

const KNOWLEDGE_MARK_KEYS = { b: 'bold', i: 'italic' };

export function knowledgeMarkShortcut(event) {
  if (!event || event.repeat || event.altKey || event.shiftKey) return null;
  if (Boolean(event.metaKey) === Boolean(event.ctrlKey)) return null;
  const command = KNOWLEDGE_MARK_KEYS[String(event.key || '').toLowerCase()];
  if (!command) return null;
  return { command, preventDefault: true };
}

function blockAt(doc, caret) {
  const blocks = normalizeKnowledgeDoc(doc, { keepEmpty: true });
  const index = Math.max(0, Math.min(blocks.length - 1, Number(caret?.index) || 0));
  return { blocks, index, block: blocks[index] };
}

function splitSpans(spans, offset) {
  const at = Math.max(0, offset || 0);
  const left = [];
  const right = [];
  let seen = 0;
  for (const span of spans) {
    const text = span.text || '';
    if (seen >= at) {
      right.push({ ...span });
      continue;
    }
    if (seen + text.length <= at) {
      left.push({ ...span });
      seen += text.length;
      continue;
    }
    const cut = at - seen;
    if (cut > 0) left.push({ ...span, text: text.slice(0, cut) });
    if (cut < text.length) right.push({ ...span, text: text.slice(cut) });
    seen = at;
  }
  return [mergeSpans(left), mergeSpans(right)];
}

export function applyKnowledgeListMarker(doc, caret) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block || block.type !== 'p') return { doc: blocks, caret, changed: false };
  const text = spanText(block.spans);
  const match = text.match(/^([*-]) /);
  if (!match) return { doc: blocks, caret, changed: false };
  const marker = match[0].length;
  if ((Number(caret?.offset) || 0) < marker) return { doc: blocks, caret, changed: false };
  const [, rest] = splitSpans(block.spans, marker);
  const next = blocks.slice();
  next[index] = { type: 'li', indent: 0, spans: rest };
  return {
    doc: next,
    caret: { index, offset: (Number(caret.offset) || 0) - marker },
    changed: true,
  };
}

export function applyKnowledgeHeadingMarker(doc, caret) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block || block.type !== 'p') return { doc: blocks, caret, changed: false };
  const text = spanText(block.spans);
  const match = text.match(/^(#{1,3}) /);
  if (!match) return { doc: blocks, caret, changed: false };
  const marker = match[0].length;
  if ((Number(caret?.offset) || 0) < marker) return { doc: blocks, caret, changed: false };
  const [, rest] = splitSpans(block.spans, marker);
  const next = blocks.slice();
  next[index] = { type: `h${match[1].length}`, indent: 0, spans: rest };
  return {
    doc: next,
    caret: { index, offset: (Number(caret.offset) || 0) - marker },
    changed: true,
  };
}

export function setKnowledgeHeading(doc, caret, level) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block) return { doc: blocks, caret, changed: false };
  const wanted = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'p';
  const type = block.type === wanted ? 'p' : wanted;
  if (type === block.type) return { doc: blocks, caret, changed: false };
  const next = blocks.slice();
  next[index] = { type, indent: 0, spans: block.spans };
  return { doc: next, caret, changed: true };
}

export function applyKnowledgeHeadingBreak(doc, caret) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block || !HEADING_TYPES.has(block.type)) return { doc: blocks, caret, changed: false };
  const [left, right] = splitSpans(block.spans, Math.max(0, Number(caret?.offset) || 0));
  const next = blocks.slice();
  next.splice(index, 1, { ...block, spans: left }, { type: 'p', indent: 0, spans: right });
  return { doc: next, caret: { index: index + 1, offset: 0 }, changed: true };
}

function isMdWord(ch) {
  return Boolean(ch) && /[\p{L}\p{N}]/u.test(ch);
}

function findInlineMarker(text, from, marker) {
  for (let i = from; i < text.length; i += 1) {
    if (text.startsWith('**', i)) {
      i += 1;
      continue;
    }
    if (text[i] !== marker) continue;
    const next = text[i + 1] || '';
    if (marker === '_' && isMdWord(next)) continue;
    return i;
  }
  return -1;
}

function parseInlineMarkdown(text) {
  const spans = [];
  const push = (value, bold, italic) => {
    if (!value) return;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold && last.italic === italic) last.text += value;
    else spans.push({ text: value, bold, italic });
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        for (const span of parseInlineMarkdown(text.slice(i + 2, end))) push(span.text, true, span.italic);
        i = end + 2;
        continue;
      }
    }
    const ch = text[i];
    if (ch === '*' || ch === '_') {
      const prev = text[i - 1] || '';
      const next = text[i + 1] || '';
      if (!isMdWord(prev) && next && next !== ' ' && next !== ch) {
        const end = findInlineMarker(text, i + 1, ch);
        if (end > i + 1) {
          for (const span of parseInlineMarkdown(text.slice(i + 1, end))) push(span.text, span.bold, true);
          i = end + 1;
          continue;
        }
      }
    }
    let j = i + 1;
    while (j < text.length && !text.startsWith('**', j) && text[j] !== '*' && text[j] !== '_') j += 1;
    push(text.slice(i, j), false, false);
    i = j;
  }
  return spans;
}

export function knowledgeDocFromMarkdown(value) {
  let text = String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  if (text.endsWith('\n')) text = text.slice(0, -1);
  if (!text) return [];
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      blocks.push({ type: 'p', indent: 0, spans: [] });
      continue;
    }
    const heading = /^(#{1,3})[ \t]+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: `h${heading[1].length}`, indent: 0, spans: parseInlineMarkdown(heading[2]) });
      continue;
    }
    const bullet = /^([ \t]*)([-*])[ \t]+(.*)$/.exec(line);
    if (bullet) {
      const width = bullet[1].replace(/\t/g, '  ').length;
      const indent = Math.min(KNOWLEDGE_LIST_INDENT_MAX, Math.floor(width / 2));
      blocks.push({ type: 'li', indent, spans: parseInlineMarkdown(bullet[3]) });
      continue;
    }
    blocks.push({ type: 'p', indent: 0, spans: parseInlineMarkdown(line) });
  }
  return normalizeKnowledgeDoc(blocks, { keepEmpty: true });
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
};

function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return all;
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return '';
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? all : named;
  });
}

function styleDecl(attrs, name) {
  const match = new RegExp(`${name}\\s*:\\s*([^;"']+)`, 'i').exec(attrs || '');
  return match ? match[1].trim().toLowerCase() : '';
}

function weightFlag(attrs) {
  const value = styleDecl(attrs, 'font-weight');
  if (!value) return null;
  if (value === 'bold' || Number(value) >= 600) return true;
  if (value === 'normal' || (Number(value) > 0 && Number(value) < 600)) return false;
  return null;
}

function italicFlag(attrs) {
  const value = styleDecl(attrs, 'font-style');
  if (value === 'italic' || value === 'oblique') return true;
  if (value === 'normal') return false;
  return null;
}

function htmlHasRealBold(html) {
  const re = /<(b|strong)\b([^>]*)>/gi;
  let match;
  while ((match = re.exec(html))) {
    const weight = weightFlag(match[2] || '');
    if (weight === false) continue;
    return true;
  }
  return false;
}

function htmlHasKnowledgeFormatting(html) {
  if (!html) return false;
  if (/<(h[1-3]|ul|ol|li|em|i)\b/i.test(html)) return true;
  if (/font-style\s*:\s*italic/i.test(html)) return true;
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(html)) return true;
  return htmlHasRealBold(html);
}

const HTML_SKIP = new Set(['script', 'style', 'iframe', 'object', 'noscript', 'svg', 'head']);

function knowledgeBlocksFromHtml(html) {
  const blocks = [];
  let block = null;
  const marks = [{ bold: false, italic: false }];
  const skip = [];
  let listDepth = 0;
  const mark = () => marks[marks.length - 1];
  const closeBlock = () => {
    if (!block) return;
    const spans = mergeSpans(block.spans);
    if (spans.length || block.type === 'li' || HEADING_TYPES.has(block.type)) {
      blocks.push({ type: block.type, indent: block.indent, spans });
    }
    block = null;
  };
  const ensure = (type, indent) => {
    if (!block) block = { type, indent, spans: [] };
  };
  const pushText = (text) => {
    let value = decodeHtmlEntities(text).replace(/\u00a0/g, ' ');
    if (/\n/.test(value)) value = value.replace(/\s+/g, ' ');
    if (block && !spanText(block.spans)) value = value.replace(/^\s+/, '');
    if (!value.trim()) {
      if (block && spanText(block.spans) && /\s/.test(value)) {
        const current = mark();
        block.spans.push({ text: ' ', bold: current.bold, italic: current.italic });
      }
      return;
    }
    ensure(listDepth ? 'li' : 'p', listDepth ? Math.max(0, listDepth - 1) : 0);
    const current = mark();
    block.spans.push({ text: value, bold: current.bold, italic: current.italic });
  };
  const tokens = String(html || '').match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[a-zA-Z][^>]*>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<![CDATA[')) continue;
    if (token[0] !== '<') {
      if (!skip.length) pushText(token);
      continue;
    }
    const parsed = /^<\s*(\/)?\s*([a-zA-Z0-9]+)/.exec(token);
    if (!parsed) continue;
    const closing = Boolean(parsed[1]);
    const name = parsed[2].toLowerCase();
    if (skip.length) {
      if (closing && name === skip[skip.length - 1]) skip.pop();
      else if (!closing && HTML_SKIP.has(name)) skip.push(name);
      continue;
    }
    if (!closing && HTML_SKIP.has(name)) {
      skip.push(name);
      continue;
    }
    if (name === 'br' || name === 'hr') {
      closeBlock();
      continue;
    }
    if (!closing && (name === 'ul' || name === 'ol')) {
      closeBlock();
      listDepth += 1;
      continue;
    }
    if (closing && (name === 'ul' || name === 'ol')) {
      closeBlock();
      listDepth = Math.max(0, listDepth - 1);
      continue;
    }
    if (!closing && name === 'li') {
      closeBlock();
      block = { type: 'li', indent: Math.max(0, listDepth - 1), spans: [] };
      continue;
    }
    if (closing && name === 'li') {
      closeBlock();
      continue;
    }
    if (!closing && HEADING_TYPES.has(name)) {
      closeBlock();
      block = { type: name, indent: 0, spans: [] };
      continue;
    }
    if (closing && HEADING_TYPES.has(name)) {
      closeBlock();
      continue;
    }
    if (!closing && (name === 'p' || name === 'div' || name === 'tr')) {
      closeBlock();
      continue;
    }
    if (closing && (name === 'p' || name === 'div' || name === 'tr')) {
      closeBlock();
      continue;
    }
    if (!closing && (name === 'b' || name === 'strong' || name === 'i' || name === 'em' || name === 'span' || name === 'font' || name === 'a')) {
      const current = mark();
      let bold = current.bold;
      let italic = current.italic;
      const weight = weightFlag(token);
      const slant = italicFlag(token);
      if (name === 'b' || name === 'strong') bold = weight === false ? false : true;
      else if (weight !== null) bold = weight;
      if (name === 'i' || name === 'em') italic = slant === false ? false : true;
      else if (slant !== null) italic = slant;
      marks.push({ bold, italic });
      continue;
    }
    if (closing && (name === 'b' || name === 'strong' || name === 'i' || name === 'em' || name === 'span' || name === 'font' || name === 'a')) {
      if (marks.length > 1) marks.pop();
    }
  }
  closeBlock();
  return normalizeKnowledgeDoc(blocks, { keepEmpty: true });
}

export function knowledgeDocFromHtml(html) {
  return knowledgeBlocksFromHtml(html);
}

export function knowledgePasteDoc(html, text) {
  if (htmlHasKnowledgeFormatting(html)) {
    const fromHtml = knowledgeDocFromHtml(html);
    if (fromHtml.length) return fromHtml;
  }
  return knowledgeDocFromMarkdown(text);
}

export function insertKnowledgeBlocks(doc, caret, pasted) {
  const incoming = normalizeKnowledgeDoc(pasted, { keepEmpty: true });
  const base = blockAt(doc, caret);
  if (!incoming.length) return { doc: base.blocks, caret, changed: false };
  const offset = Math.max(0, Number(caret?.offset) || 0);
  const block = base.block || { type: 'p', indent: 0, spans: [] };
  const [left, right] = splitSpans(block.spans, offset);
  const leftText = spanText(left);
  const rightText = spanText(right);
  const next = base.blocks.slice();
  if (!leftText && !rightText) {
    next.splice(base.index, 1, ...incoming);
    const last = incoming[incoming.length - 1];
    return {
      doc: next,
      caret: { index: base.index + incoming.length - 1, offset: spanText(last.spans).length },
      changed: true,
    };
  }
  const middle = incoming.map((item) => ({ ...item, spans: item.spans.slice() }));
  const first = middle[0];
  if (first.type === block.type && first.indent === (block.indent || 0)) {
    first.spans = mergeSpans([...left, ...first.spans]);
  } else if (leftText) {
    middle.unshift({ type: block.type, indent: block.indent || 0, spans: left });
  }
  const tail = middle[middle.length - 1];
  if (rightText && tail.type === 'p') tail.spans = mergeSpans([...tail.spans, ...right]);
  else if (rightText) middle.push({ type: 'p', indent: 0, spans: right });
  next.splice(base.index, 1, ...middle);
  const placed = middle[middle.length - 1];
  const tailOffset = spanText(placed.spans).length - (rightText && placed.type === 'p' ? rightText.length : 0);
  return {
    doc: next,
    caret: { index: base.index + middle.length - 1, offset: Math.max(0, tailOffset) },
    changed: true,
  };
}

export function applyKnowledgeEnter(doc, caret) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block || block.type !== 'li') return { doc: blocks, caret, changed: false };
  const offset = Math.max(0, Number(caret?.offset) || 0);
  if (!spanText(block.spans).trim()) {
    const next = blocks.slice();
    next[index] = { type: 'p', indent: 0, spans: [] };
    return { doc: next, caret: { index, offset: 0 }, changed: true };
  }
  const [left, right] = splitSpans(block.spans, offset);
  const next = blocks.slice();
  next.splice(index, 1, { ...block, spans: left }, { type: 'li', indent: block.indent, spans: right });
  return { doc: next, caret: { index: index + 1, offset: 0 }, changed: true };
}

export function applyKnowledgeTab(doc, caret, shift = false) {
  const { blocks, index, block } = blockAt(doc, caret);
  if (!block || block.type !== 'li') return { doc: blocks, caret, changed: false };
  const next = blocks.slice();
  if (shift) {
    if (block.indent <= 0) next[index] = { type: 'p', indent: 0, spans: block.spans };
    else next[index] = { ...block, indent: block.indent - 1 };
  } else if (block.indent >= KNOWLEDGE_LIST_INDENT_MAX) {
    return { doc: blocks, caret, changed: false };
  } else {
    next[index] = { ...block, indent: block.indent + 1 };
  }
  return { doc: next, caret: { index, offset: Number(caret?.offset) || 0 }, changed: true };
}

function mapRange(spans, start, end, fn) {
  const out = [];
  let seen = 0;
  for (const span of spans) {
    const text = span.text || '';
    const from = seen;
    const to = seen + text.length;
    seen = to;
    if (to <= start || from >= end) {
      out.push({ ...span });
      continue;
    }
    const left = Math.max(0, start - from);
    const right = Math.min(text.length, end - from);
    if (left > 0) out.push({ ...span, text: text.slice(0, left) });
    out.push(fn({ ...span, text: text.slice(left, right) }));
    if (right < text.length) out.push({ ...span, text: text.slice(right) });
  }
  return mergeSpans(out);
}

export function toggleKnowledgeMark(doc, range, mark) {
  if (mark !== 'bold' && mark !== 'italic') return { doc: normalizeKnowledgeDoc(doc, { keepEmpty: true }), changed: false };
  const { blocks, index, block } = blockAt(doc, range);
  if (!block) return { doc: blocks, changed: false };
  const start = Math.max(0, Number(range?.start) || 0);
  const end = Math.max(start, Number(range?.end) || 0);
  if (end <= start) return { doc: blocks, changed: false };
  const inside = [];
  let seen = 0;
  for (const span of block.spans) {
    const from = seen;
    const to = seen + span.text.length;
    seen = to;
    if (to <= start || from >= end) continue;
    inside.push(span);
  }
  const turnOn = inside.some((span) => span[mark] !== true);
  const next = blocks.slice();
  next[index] = {
    ...block,
    spans: mapRange(block.spans, start, end, (span) => ({ ...span, [mark]: turnOn })),
  };
  return { doc: next, changed: true };
}

export function groupKnowledgeBlocks(doc) {
  const blocks = normalizeKnowledgeDoc(doc, { keepEmpty: true }).map((block, index) => ({ ...block, index }));
  const out = [];
  let cursor = 0;
  const nest = (items, level) => {
    const nested = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i].indent < level ? { ...items[i], indent: level } : items[i];
      const children = [];
      let j = i + 1;
      while (j < items.length && items[j].indent > item.indent) {
        children.push(items[j]);
        j += 1;
      }
      const childLevel = children.length ? children[0].indent : item.indent + 1;
      nested.push({
        index: item.index,
        spans: item.spans,
        text: spanText(item.spans),
        children: children.length ? nest(children, childLevel) : [],
      });
      i = j;
    }
    return nested;
  };
  while (cursor < blocks.length) {
    const block = blocks[cursor];
    if (block.type !== 'li') {
      out.push({ kind: 'p', type: block.type, index: block.index, spans: block.spans, text: spanText(block.spans) });
      cursor += 1;
      continue;
    }
    let end = cursor + 1;
    while (end < blocks.length && blocks[end].type === 'li') end += 1;
    const items = blocks.slice(cursor, end);
    out.push({ kind: 'ul', items: nest(items, items[0].indent) });
    cursor = end;
  }
  return out;
}

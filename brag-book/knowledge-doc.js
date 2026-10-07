/**
 * Knowledge page document. Browser-safe ESM, no HTML parsing.
 * Blocks are paragraphs or bullets. Inline marks are bold and italic.
 * `body` stays the plain-text projection so search never sees markup.
 */

export const KNOWLEDGE_LIST_INDENT_MAX = 6;
const TEXT_MAX = 4000;
const BLOCK_MAX = 400;

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
    if (raw.type !== 'p' && raw.type !== 'li') continue;
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
  return normalizeKnowledgeDoc(doc).map((block) => spanText(block.spans)).join('\n');
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
      out.push({ kind: 'p', index: block.index, spans: block.spans, text: spanText(block.spans) });
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

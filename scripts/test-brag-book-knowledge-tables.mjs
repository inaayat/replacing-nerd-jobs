import assert from 'node:assert/strict';

import {
  applyKnowledgeMarkdownTables,
  inferKnowledgeTables,
  knowledgeDocFromMarkdown,
  knowledgePasteDoc,
  knowledgePlainText,
  normalizeKnowledgeDoc,
  parseGfmTableFromLines,
  splitGfmTableCells,
} from '../brag-book/knowledge-doc.js';
import {
  normalizeKnowledge,
  searchKnowledge,
  updateKnowledge,
} from '../brag-book/engine.js';

const clock = () => Date.parse('2026-10-05T12:00:00.000Z');

assert.deepEqual(splitGfmTableCells('a | b'), ['a ', ' b']);
assert.deepEqual(splitGfmTableCells('| a | b |'), [' a ', ' b ']);
assert.deepEqual(splitGfmTableCells('pipe \\| here | plain'), ['pipe | here ', ' plain']);

const aligned = parseGfmTableFromLines([
  '| Left | Center | Right |',
  '| :--- | :---: | ---: |',
  '| l | c | r |',
]);
assert.equal(aligned.type, 'table');
assert.deepEqual(aligned.align, ['left', 'center', 'right']);
assert.equal(aligned.rows[0].cells[0].spans.map((s) => s.text).join(''), 'Left');
assert.equal(aligned.rows[1].cells[2].spans.map((s) => s.text).join(''), 'r');

const inline = parseGfmTableFromLines([
  'Tool | Notes',
  '--- | ---',
  '**dbt** | _fast_ `sql`',
]);
assert.equal(inline.rows[1].cells[0].spans.some((s) => s.bold && s.text === 'dbt'), true);
assert.equal(inline.rows[1].cells[1].spans.some((s) => s.italic && s.text === 'fast'), true);
assert.equal(inline.rows[1].cells[1].spans.some((s) => s.code && s.text === 'sql'), true);

const ragged = parseGfmTableFromLines([
  '| a | b | c |',
  '| --- | --- | --- |',
  '| one | two |',
]);
assert.equal(ragged.rows[1].cells.length, 3);
assert.equal(ragged.rows[1].cells[2].spans.length, 0);

const markdownPaste = knowledgeDocFromMarkdown(
  '# Data Pipelines Built\n\n| Pipeline | Owner |\n| --- | --- |\n| ingest | me |\n',
);
assert.equal(markdownPaste[0].type, 'h1');
assert.equal(markdownPaste.find((block) => block.type === 'table')?.rows?.[1]?.cells?.[0]?.spans?.[0]?.text, 'ingest');
assert.match(knowledgePlainText(markdownPaste), /ingest/);

const legacyParagraphs = [
  { type: 'p', indent: 0, spans: [{ text: '| Pipeline | Owner |', bold: false, italic: false }] },
  { type: 'p', indent: 0, spans: [{ text: '| --- | --- |', bold: false, italic: false }] },
  { type: 'p', indent: 0, spans: [{ text: '| Data Pipelines Built | Inaayat |', bold: false, italic: false }] },
];
const legacyJson = JSON.stringify(legacyParagraphs);
const inferred = inferKnowledgeTables(legacyParagraphs);
assert.equal(inferred.length, 1);
assert.equal(inferred[0].type, 'table');
assert.equal(JSON.stringify(legacyParagraphs), legacyJson);
assert.match(
  knowledgePlainText(legacyParagraphs, { inferTables: true }),
  /Data Pipelines Built/,
);

const typed = applyKnowledgeMarkdownTables(legacyParagraphs);
assert.equal(typed.changed, true);
assert.equal(typed.doc[0].type, 'table');

const htmlTable = knowledgePasteDoc(
  '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
  '',
);
assert.equal(htmlTable[0].type, 'table');
assert.equal(htmlTable[0].rows[1].cells[0].spans[0].text, '1');

const saved = normalizeKnowledge({
  title: 'Pipelines',
  doc: markdownPaste.filter((block) => block.type === 'table'),
}, clock);
assert.equal(saved.doc[0].type, 'table');
assert.match(saved.body, /ingest/);

const roundTrip = updateKnowledge(
  { knowledge: [saved] },
  saved.id,
  { doc: saved.doc, body: saved.body, rich: saved.rich },
  clock,
);
const reloaded = normalizeKnowledge(roundTrip.knowledge[0], clock);
assert.equal(reloaded.doc[0].type, 'table');
assert.equal(reloaded.doc[0].rows[1].cells[0].spans[0].text, 'ingest');
assert.equal(
  normalizeKnowledgeDoc(reloaded.doc)[0].rows.length,
  reloaded.doc[0].rows.length,
);

assert.equal(
  searchKnowledge({ knowledge: [{ title: 'X', doc: legacyParagraphs }] }, 'pipelines').length,
  1,
);
assert.equal(
  searchKnowledge({ knowledge: [{ title: 'X', body: '| a | b |\n| --- | --- |\n| hide | no |' }] }, 'hide').length,
  1,
);

console.log('test-brag-book-knowledge-tables: ok');

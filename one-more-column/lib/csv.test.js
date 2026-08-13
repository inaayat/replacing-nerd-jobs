/**
 * Regression coverage for the CSV/TSV parser. The reported bug: pasting a
 * range copied out of a spreadsheet (tab-separated clipboard content) into
 * the comma-only parser collapsed every column into one compound header key,
 * so every row silently fell back to every default at once — titles read
 * "Imported row N", hours read 0, dates were blank, with no error at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCsv,
  coerceCustomFieldValue,
  matchCustomFieldHeaders,
  extractCustomAttributes,
  normalizeImportDate,
} from './csv.js';

test('parses standard comma-separated input', () => {
  const { headers, rows } = parseCsv(
    'title,work_hours,due_week,phase\nTask A,8,2026-01-12,Phase 1',
  );
  assert.deepEqual(headers, ['title', 'work_hours', 'due_week', 'phase']);
  assert.equal(rows[0].title, 'Task A');
  assert.equal(rows[0].work_hours, '8');
  assert.equal(rows[0].due_week, '2026-01-12');
});

test('detects and parses tab-separated input (spreadsheet paste)', () => {
  const tsv = 'title\twork_hours\tdue_week\tphase\nTask A\t8\t2026-01-12\tPhase 1';
  const { headers, rows } = parseCsv(tsv);
  // Before the fix: headers === ['title\twork_hours\tdue_week\tphase'] (one
  // compound key) and rows[0] held the entire line under that single key.
  assert.deepEqual(headers, ['title', 'work_hours', 'due_week', 'phase']);
  assert.equal(rows[0].title, 'Task A');
  assert.equal(rows[0].work_hours, '8');
  assert.equal(rows[0].due_week, '2026-01-12');
});

test('detects semicolon-separated input', () => {
  const { rows } = parseCsv('title;work_hours;due_week\nTask A;8;2026-01-12');
  assert.equal(rows[0].title, 'Task A');
  assert.equal(rows[0].work_hours, '8');
});

test('header lookups are case- and spacing-insensitive', () => {
  const { rows } = parseCsv('Title,Work Hours,Due Week\nTask A,8,2026-01-12');
  // Both the literal and a normalized ("workhours") key should resolve.
  assert.equal(rows[0]['Title'], 'Task A');
  assert.equal(rows[0]['workhours'], '8');
  assert.equal(rows[0]['dueweek'], '2026-01-12');
});

test('quoted commas inside a cell do not split the column, even with tab detection active', () => {
  const { rows } = parseCsv('title,phase\n"Task, with a comma",Phase 1');
  assert.equal(rows[0].title, 'Task, with a comma');
  assert.equal(rows[0].phase, 'Phase 1');
});

test('a single line with no data rows produces no rows', () => {
  const { rows } = parseCsv('title,work_hours,due_week');
  assert.deepEqual(rows, []);
});

/* ── Custom field coercion / matching ─────────────────────────────────── */

const CONTROL_FIELDS = [
  { id: 'f1', key: 'control_id', label: 'Control ID', field_type: 'text' },
  { id: 'f2', key: 'work_period', label: 'Work Period', field_type: 'text' },
  {
    id: 'f3',
    key: 'reliance',
    label: 'Reliance',
    field_type: 'select',
    options: ['High', 'Medium', 'Low'],
  },
  { id: 'f4', key: 'sampling', label: 'Sampling', field_type: 'text' },
  { id: 'f5', key: 'evidence_due', label: 'Evidence Due', field_type: 'date' },
  { id: 'f6', key: 'sample_size', label: 'Sample Size', field_type: 'number' },
];

test('coerceCustomFieldValue: text passes through', () => {
  const { value, warning } = coerceCustomFieldValue('CT-101', CONTROL_FIELDS[0]);
  assert.equal(value, 'CT-101');
  assert.equal(warning, null);
});

test('coerceCustomFieldValue: number coerces and rejects garbage', () => {
  assert.deepEqual(coerceCustomFieldValue('12.5', CONTROL_FIELDS[5]), {
    value: 12.5,
    warning: null,
  });
  const bad = coerceCustomFieldValue('n/a', CONTROL_FIELDS[5]);
  assert.equal(bad.value, null);
  assert.match(bad.warning, /not a number/);
});

test('coerceCustomFieldValue: date normalizes to YYYY-MM-DD', () => {
  assert.equal(normalizeImportDate('2026-03-15'), '2026-03-15');
  assert.equal(normalizeImportDate('2026/3/5'), '2026-03-05');
  const { value, warning } = coerceCustomFieldValue('2026-07-01', CONTROL_FIELDS[4]);
  assert.equal(value, '2026-07-01');
  assert.equal(warning, null);
  const bad = coerceCustomFieldValue('soon', CONTROL_FIELDS[4]);
  assert.equal(bad.value, null);
  assert.match(bad.warning, /not a date/);
});

test('coerceCustomFieldValue: select flags unmatched values instead of silently accepting', () => {
  const ok = coerceCustomFieldValue('High', CONTROL_FIELDS[2]);
  assert.equal(ok.value, 'High');
  assert.equal(ok.warning, null);

  const bad = coerceCustomFieldValue('Maybe', CONTROL_FIELDS[2]);
  assert.equal(bad.value, 'Maybe', 'value is kept so preview can show what was pasted');
  assert.match(bad.warning, /not in \[High, Medium, Low\]/);
});

test('coerceCustomFieldValue: empty required field warns', () => {
  const required = { ...CONTROL_FIELDS[0], required: true };
  const { value, warning } = coerceCustomFieldValue('  ', required);
  assert.equal(value, null);
  assert.match(warning, /required/);
});

test('matchCustomFieldHeaders matches by key or label and skips built-ins', () => {
  const headers = [
    'title',
    'work_hours',
    'Control ID',
    'reliance',
    'Sampling',
    'Mystery Col',
  ];
  const { matched, unmatchedHeaders, recognizedFields } = matchCustomFieldHeaders(
    headers,
    CONTROL_FIELDS,
  );
  assert.deepEqual(
    matched.map((m) => m.field.key),
    ['control_id', 'reliance', 'sampling'],
  );
  assert.deepEqual(
    recognizedFields.map((f) => f.label),
    ['Control ID', 'Reliance', 'Sampling'],
  );
  assert.deepEqual(unmatchedHeaders, ['Mystery Col']);
});

test('extractCustomAttributes writes coerced values and collects warnings', () => {
  const { rows } = parseCsv(
    'title,Control ID,Reliance,Sample Size,Evidence Due\n' +
      'Test,CT-9,Maybe,abc,2026-07-15',
  );
  const { matched } = matchCustomFieldHeaders(
    ['title', 'Control ID', 'Reliance', 'Sample Size', 'Evidence Due'],
    CONTROL_FIELDS,
  );
  const { attributes, warnings } = extractCustomAttributes(rows[0], matched);
  assert.equal(attributes.control_id, 'CT-9');
  assert.equal(attributes.reliance, 'Maybe');
  assert.equal(attributes.evidence_due, '2026-07-15');
  assert.equal(attributes.sample_size, undefined);
  assert.ok(warnings.some((w) => /Reliance/.test(w) && /Maybe/.test(w)));
  assert.ok(warnings.some((w) => /Sample Size/.test(w)));
});

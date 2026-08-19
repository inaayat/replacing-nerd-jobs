/**
 * Table Manners document model: one JSONB sheet, schema grows in the grid.
 */
import assert from 'node:assert/strict';
import {
  emptySheet,
  normalizeSheet,
  setCell,
  setColumnName,
  setTitle,
  addRow,
  addColumn,
  deleteRow,
  deleteColumn,
  rowFields,
  groupRows,
  groupLabelText,
  addRecord,
  rowIsEmpty,
  findColumn,
  neighborCell,
  firstCell,
  cellValue,
  colLetter,
  SHEET_LIMITS,
} from '../table-manners/engine/sheet.js';

assert.equal(colLetter(1), 'A');
assert.equal(colLetter(27), 'AA');

const blank = emptySheet();
assert.equal(blank.columns.length, 2);
assert.equal(blank.rows.length, 3);
assert.deepEqual(blank.views, []);
assert.deepEqual(blank.connectors, []);

const cleaned = normalizeSheet({
  title: '  Q3 close  ',
  columns: [
    { id: '!!bad', name: 'Owner', type: 'nope' },
    { id: 'c2', name: 'Amount', type: 'number' },
    { extra: true },
  ],
  rows: [
    { id: 'r1', leftover: 'drop me', c2: 12.5 },
    { id: 'r1', c2: 'dup id' },
    'nope',
  ],
});
assert.equal(cleaned.title, 'Q3 close');
assert.equal(cleaned.columns[0].type, 'text');
assert.equal(cleaned.columns[1].type, 'number');
assert.ok(cleaned.columns[0].id !== '!!bad');
assert.notEqual(cleaned.rows[0].id, cleaned.rows[1].id);
assert.equal(cleaned.rows[0].leftover, undefined);
assert.equal(cellValue(cleaned.rows[0], cleaned.columns[1].id), '12.5');

const named = setTitle(blank, 'Ops');
assert.equal(named.title, 'Ops');

const withCell = setCell(named, named.rows[0].id, named.columns[0].id, 'Acme');
assert.equal(cellValue(withCell.rows[0], withCell.columns[0].id), 'Acme');

const renamed = setColumnName(withCell, withCell.columns[1].id, 'Memo');
assert.equal(renamed.columns[1].name, 'Memo');

const plusRow = addRow(renamed, renamed.rows[0].id);
assert.equal(plusRow.rows.length, 4);
assert.equal(plusRow.rows[1].id.startsWith('r_'), true);

const plusCol = addColumn(plusRow, plusRow.columns[0].id);
assert.equal(plusCol.columns.length, 3);
assert.equal(plusCol.columns[1].name, 'Column');

const droppedCol = deleteColumn(plusCol, plusCol.columns[1].id);
assert.equal(droppedCol.columns.length, 2);
assert.ok(!droppedCol.rows[0][plusCol.columns[1].id]);

const droppedRow = deleteRow(droppedCol, droppedCol.rows[0].id);
assert.equal(droppedRow.rows.length, 3);

const lastCol = deleteColumn({ ...droppedRow, columns: [droppedRow.columns[0]] }, droppedRow.columns[0].id);
assert.equal(lastCol.columns.length, 1, 'never drop the last column');

const fields = rowFields(withCell.rows[0], withCell.columns);
assert.equal(fields.length, withCell.columns.length);
assert.equal(fields[0].value, 'Acme');
assert.equal(fields[1].name, 'Notes');

const start = firstCell(withCell);
assert.deepEqual(neighborCell(withCell, start, 0, 1), {
  rowId: withCell.rows[0].id,
  colId: withCell.columns[1].id,
});
assert.deepEqual(neighborCell(withCell, start, 1, 0), {
  rowId: withCell.rows[1].id,
  colId: withCell.columns[0].id,
});
assert.equal(neighborCell({ columns: [], rows: [] }, null, 1, 0), null);

// Group by is display-only: rows keep their own identity in every bucket.
let logged = setCell(emptySheet(), 'r1', 'c1', 'Dune');
logged = setCell(logged, 'r2', 'c1', 'dune');
logged = setCell(logged, 'r2', 'c2', 'rewatch');
logged = setCell(logged, 'r3', 'c1', '');

const ungrouped = groupRows(logged, '');
assert.equal(ungrouped.length, 1, 'no grouping is one bucket');
assert.equal(ungrouped[0].rows.length, 3);
assert.equal(groupLabelText(ungrouped[0]), 'All records');

const byName = groupRows(logged, 'c1');
assert.equal(byName.length, 2, 'same value buckets together, blanks are their own bucket');
assert.equal(byName[0].label, 'Dune');
assert.equal(byName[0].rows.length, 2, 'both rows still exist inside the bucket');
assert.equal(byName[1].rows.length, 1);
assert.equal(groupLabelText(byName[1]), 'No name', 'blank bucket names itself after the column');

const total = groupRows(logged, 'c1').reduce((n, b) => n + b.rows.length, 0);
assert.equal(total, logged.rows.length, 'grouping never drops or merges a row');

assert.equal(groupRows(logged, 'gone')[0].column, null, 'a deleted group column falls back');
assert.equal(findColumn(logged, 'c2').name, 'Notes');

const seeded = addRecord(logged, { c1: 'Dune' });
assert.equal(seeded.rows.length, 4);
assert.equal(cellValue(seeded.rows[3], 'c1'), 'Dune', 'new record joins the group it was added under');
assert.equal(rowIsEmpty(seeded.rows[3], seeded.columns), false);
assert.equal(rowIsEmpty(addRecord(logged).rows[3], logged.columns), true);

const huge = 'x'.repeat(SHEET_LIMITS.cell + 20);
const clipped = setCell(blank, blank.rows[0].id, blank.columns[0].id, huge);
assert.equal(cellValue(clipped.rows[0], clipped.columns[0].id).length, SHEET_LIMITS.cell);

console.log('table-manners sheet tests passed');

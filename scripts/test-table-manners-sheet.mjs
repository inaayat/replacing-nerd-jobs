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
  cardsFromSheet,
  neighborCell,
  firstCell,
  cellValue,
  SHEET_LIMITS,
} from '../table-manners/engine/sheet.js';

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

const cards = cardsFromSheet(withCell);
assert.equal(cards.length, withCell.rows.length);
assert.equal(cards[0].fields[0].value, 'Acme');
assert.equal(cards[0].fields[1].name, 'Notes');

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

const huge = 'x'.repeat(SHEET_LIMITS.cell + 20);
const clipped = setCell(blank, blank.rows[0].id, blank.columns[0].id, huge);
assert.equal(cellValue(clipped.rows[0], clipped.columns[0].id).length, SHEET_LIMITS.cell);

console.log('table-manners sheet tests passed');

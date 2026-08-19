/**
 * Table Manners Excel download: one-tab OOXML snapshot of the current sheet.
 */
import assert from 'node:assert/strict';
import { emptySheet, setCell, setTitle } from '../table-manners/engine/sheet.js';
import {
  buildWorkbook,
  workbookFilename,
  sheetTabName,
  colLetter,
  zipStore,
} from '../table-manners/engine/workbook.js';

assert.equal(colLetter(1), 'A');
assert.equal(colLetter(26), 'Z');
assert.equal(colLetter(27), 'AA');
assert.equal(sheetTabName('Q3: close?*'), 'Q3  close');
assert.equal(workbookFilename('Q3 Close'), 'q3-close.xlsx');
assert.equal(workbookFilename('***'), 'table-manners.xlsx');

let sheet = setTitle(emptySheet(), 'Pipeline');
sheet = setCell(sheet, sheet.rows[0].id, sheet.columns[0].id, 'Acme <Inc>');
sheet = setCell(sheet, sheet.rows[0].id, sheet.columns[1].id, '12.5');

const bytes = buildWorkbook(sheet);
assert.ok(bytes instanceof Uint8Array);
assert.equal(bytes[0], 0x50);
assert.equal(bytes[1], 0x4b);
assert.equal(bytes[2], 0x03);
assert.equal(bytes[3], 0x04);

function unzipStored(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(buf.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    assert.equal(method, 0, `${name} must be STORED`);
    files.set(name, new TextDecoder().decode(buf.subarray(start, start + compSize)));
    offset = start + compSize;
  }
  return files;
}

const zip = unzipStored(bytes);
for (const part of [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
]) {
  assert.ok(zip.has(part), `xlsx is missing ${part}`);
}

const types = zip.get('[Content_Types].xml');
assert.match(types, /spreadsheetml\.sheet\.main\+xml/);
assert.match(types, /spreadsheetml\.worksheet\+xml/);
assert.ok(!/vnd\.ms-excel/.test(types));

const book = zip.get('xl/workbook.xml');
assert.match(book, /fullCalcOnLoad="1"/);
assert.match(book, /<sheet name="Pipeline"/);

const xml = zip.get('xl/worksheets/sheet1.xml');
assert.match(xml, /<t>Name<\/t>/);
assert.match(xml, /<t>Notes<\/t>/);
assert.match(xml, /Acme &lt;Inc&gt;/);
assert.match(xml, /<v>12.5<\/v>/);
assert.ok(!xml.includes('undefined'));
assert.ok(!xml.includes('NaN'));

const packed = zipStore([{ name: 'hello.txt', data: 'hi' }]);
assert.equal(packed[0], 0x50);

console.log('table-manners workbook tests passed');

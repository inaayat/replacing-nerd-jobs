/**
 * Takeout Excel download: multi-tab OOXML plus a Sources sheet.
 */
import assert from 'node:assert/strict';
import {
  buildWorkbook,
  workbookFilename,
  sheetTabName,
  uniqueSheetNames,
  colLetter,
  zipStore,
} from '../takeout/workbook.js';

assert.equal(colLetter(1), 'A');
assert.equal(colLetter(26), 'Z');
assert.equal(colLetter(27), 'AA');
assert.equal(sheetTabName('Q3: close?*'), 'Q3 close');
assert.equal(workbookFilename('NYC 311'), 'nyc-311.xlsx');
assert.equal(workbookFilename('***'), 'takeout.xlsx');
assert.deepEqual(uniqueSheetNames(['Rates', 'rates', 'Rates']), ['Rates', 'rates (2)', 'Rates (3)']);

const bytes = buildWorkbook([
  {
    name: 'Countries',
    columns: ['name', 'pop'],
    rows: [
      { name: 'France <A>', pop: 67 },
      { name: 'USA', pop: 330 },
    ],
    source: 'REST Countries',
    url: 'https://restcountries.com/v3.1/all',
    fetchedAt: '2026-08-22T00:00:00.000Z',
  },
  {
    name: 'Countries',
    columns: ['fx'],
    rows: [{ fx: 1.1 }],
    source: 'ECB',
    url: '',
    fetchedAt: '2026-08-22T00:00:00.000Z',
  },
]);

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
  'xl/worksheets/sheet2.xml',
  'xl/worksheets/sheet3.xml',
]) {
  assert.ok(zip.has(part), `xlsx is missing ${part}`);
}

const types = zip.get('[Content_Types].xml');
assert.match(types, /spreadsheetml\.sheet\.main\+xml/);
assert.match(types, /worksheets\/sheet3\.xml/);
assert.ok(!/vnd\.ms-excel/.test(types));

const book = zip.get('xl/workbook.xml');
assert.match(book, /fullCalcOnLoad="1"/);
assert.match(book, /<sheet name="Countries"/);
assert.match(book, /<sheet name="Countries \(2\)"/);
assert.match(book, /<sheet name="Sources"/);

const xml = zip.get('xl/worksheets/sheet1.xml');
assert.match(xml, /<t>name<\/t>/);
assert.match(xml, /France &lt;A&gt;/);
assert.match(xml, /<v>67<\/v>/);
assert.ok(!xml.includes('undefined'));
assert.ok(!xml.includes('NaN'));

const sources = zip.get('xl/worksheets/sheet3.xml');
assert.match(sources, /REST Countries/);
assert.match(sources, /restcountries\.com/);

assert.throws(() => buildWorkbook([]), /Nothing to export/);

const packed = zipStore([{ name: 'hello.txt', data: 'hi' }]);
assert.equal(packed[0], 0x50);

console.log('takeout workbook tests passed');

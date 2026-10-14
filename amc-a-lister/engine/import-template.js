/**
 * A-Lister watch-log import template (.xlsx).
 * Instructions tab + Watches tab. Browser-safe ESM — uncompressed zip, no npm.
 */

import {
  TEMPLATE_HEADERS,
  FORMAT_CHOICES,
  WHERE_IN_THEATERS,
  WHERE_AT_HOME,
  EXAMPLE_TEMPLATE_ROWS,
  watchToTemplateRow,
} from './import-watch.js';

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}

function u32(n) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function concatBytes(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const chunk of chunks) {
    out.set(chunk, off);
    off += chunk.length;
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

export function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8(file.name);
    const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    locals.push(local);
    centrals.push(
      concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concatBytes(centrals);
  const eocd = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...locals, central, eocd]);
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function colLetter(n) {
  let i = Number(n);
  if (!Number.isInteger(i) || i < 1) return 'A';
  let out = '';
  while (i > 0) {
    const rem = (i - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    i = Math.floor((i - 1) / 26);
  }
  return out;
}

function looksNumber(value) {
  if (value === '' || value == null) return false;
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  const s = String(value).trim();
  if (!s || /[a-zA-Z]/.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n) && s !== '';
}

function writeCell(value, row, col) {
  const ref = `${colLetter(col)}${row}`;
  if (value == null || value === '') return `<c r="${ref}"/>`;
  if (looksNumber(value)) {
    return `<c r="${ref}"><v>${Number(value)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
}

function colWidths(widths) {
  return widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
}

const INSTRUCTION_LINES = [
  ['How to import', 'Download this file, fill the Watches sheet, then upload it from Settings → Library.'],
  ['Required', 'Watch date (YYYY-MM-DD) and Movie title. Everything else is optional.'],
  ['Duplicates', 'A row with the same date, title, and theater as one already in your log is skipped. Export then re-import will not create copies.'],
  ['Ticket price', 'Dollars, not cents. 19.99 or $19.99 both work. Leave blank for at-home watches.'],
  ['Where', 'In theaters (counts toward A-List savings) or At home (logged, not billed).'],
  ['Format', 'Standard, IMAX, Dolby, IMAX 3D, 70MM, PRIME, VistaVision, or Q&A.'],
  ['Rating', '1 to 5 in half stars, or DNF.'],
  ['Companions', 'A-Lister usernames, comma-separated. Import tags them or sends a showing invite, same as Seen with on a log entry.'],
  ['Theaters', 'Names are matched to theaters you have already logged when the match is unique.'],
  ['Sample rows', 'Delete the two sample rows on Watches before uploading, or they will be added to your log.'],
  ['Export', 'Settings → Export my watch log downloads your current entries in this same layout.'],
];

function instructionsSheetXml() {
  const header = `${writeCell('Topic', 1, 1)}${writeCell('Details', 1, 2)}`;
  const body = INSTRUCTION_LINES
    .map((pair, i) => `<row r="${i + 2}">${writeCell(pair[0], i + 2, 1)}${writeCell(pair[1], i + 2, 2)}</row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colWidths([22, 88])}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
</worksheet>`;
}

const LAST_DATA_ROW = 2000;

function dataValidationsXml() {
  const formatList = ['Standard', ...FORMAT_CHOICES].join(',');
  const ratingList = '1,1.5,2,2.5,3,3.5,4,4.5,5,DNF';
  const whereList = `${WHERE_IN_THEATERS},${WHERE_AT_HOME}`;
  return `<dataValidations count="4">
<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" sqref="D2:D${LAST_DATA_ROW}"><formula1>"${esc(formatList)}"</formula1></dataValidation>
<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" sqref="I2:I${LAST_DATA_ROW}"><formula1>"${esc(ratingList)}"</formula1></dataValidation>
<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" sqref="K2:K${LAST_DATA_ROW}"><formula1>"${esc(whereList)}"</formula1></dataValidation>
<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" sqref="L2:L${LAST_DATA_ROW}"><formula1>"Yes,No"</formula1></dataValidation>
</dataValidations>`;
}

function watchesSheetXml(rowValues) {
  const header = TEMPLATE_HEADERS.map((name, i) => writeCell(name, 1, i + 1)).join('');
  const body = rowValues
    .map((row, r) => {
      const cells = TEMPLATE_HEADERS.map((_, i) => writeCell(row[i], r + 2, i + 1)).join('');
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${colWidths([14, 28, 28, 14, 14, 10, 14, 18, 10, 28, 14, 12])}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
${dataValidationsXml()}
</worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf xfId="0"/></cellXfs>
</styleSheet>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets>
<sheet name="Instructions" sheetId="1" r:id="rId1"/>
<sheet name="Watches" sheetId="2" r:id="rId2"/>
</sheets>
<calcPr fullCalcOnLoad="1"/>
</workbook>`;

export const IMPORT_TEMPLATE_FILENAME = 'a-lister-watch-log.xlsx';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param {object[]} [watches] If omitted, the blank template includes two sample rows.
 */
export function buildImportTemplate(watches) {
  const source = watches == null ? EXAMPLE_TEMPLATE_ROWS : watches;
  const rows = source.map((watch) => watchToTemplateRow(watch));
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'xl/workbook.xml', data: WORKBOOK },
    { name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'xl/worksheets/sheet1.xml', data: instructionsSheetXml() },
    { name: 'xl/worksheets/sheet2.xml', data: watchesSheetXml(rows) },
  ]);
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadImportTemplate() {
  downloadBytes(buildImportTemplate(), IMPORT_TEMPLATE_FILENAME);
}

export function downloadWatchLogExport(watches) {
  downloadBytes(buildImportTemplate(watches || []), IMPORT_TEMPLATE_FILENAME);
}

/**
 * Fresh .xlsx of one or more Takeout tables. Browser-safe ESM — a tiny
 * uncompressed zip writer, same approach as `table-manners/engine/workbook.js`.
 * No npm, no serverless function.
 */
import { cellValue } from './flatten.js';

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
      ])
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

export function sheetTabName(title) {
  const cleaned = String(title || 'Sheet')
    .replace(/[:\\/?*[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || 'Sheet';
}

export function uniqueSheetNames(titles) {
  const used = new Set();
  return titles.map((title, index) => {
    let base = sheetTabName(title || `Sheet ${index + 1}`);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n})`;
      name = sheetTabName(base.slice(0, Math.max(1, 31 - suffix.length)) + suffix);
      n += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

export function workbookFilename(title) {
  const slug = String(title || 'takeout')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'takeout'}.xlsx`;
}

function looksNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return false;
  if (value === '' || value == null) return false;
  const n = Number(value);
  return Number.isFinite(n) && String(value).trim() !== '';
}

function writeCell(value, row, col) {
  const ref = `${colLetter(col)}${row}`;
  const v = cellValue(value);
  if (v === '' || v == null) return `<c r="${ref}"/>`;
  if (typeof v === 'boolean') {
    return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'TRUE' : 'FALSE'}</t></is></c>`;
  }
  if (looksNumber(v)) {
    return `<c r="${ref}"><v>${Number(v)}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
}

function guessWidth(columns, rows) {
  return columns.map((col) => {
    let max = String(col).length;
    for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
      const len = String(rows[i]?.[col] ?? '').length;
      if (len > max) max = len;
    }
    return Math.min(48, Math.max(10, max + 2));
  });
}

function sheetXml(table) {
  const columns = table.columns || [];
  const rows = table.rows || [];
  const header = columns.map((col, i) => writeCell(col, 1, i + 1)).join('');
  const body = rows
    .map((row, r) => {
      const cells = columns.map((col, i) => writeCell(row[col], r + 2, i + 1)).join('');
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join('');
  const widths = guessWidth(columns, rows)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${widths}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
</worksheet>`;
}

function contentTypesXml(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) => {
    return `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function workbookRels(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) => {
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2">
<xf xfId="0"/>
<xf xfId="0" fontId="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function workbookXml(names) {
  const sheets = names
    .map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets>${sheets}</sheets>
<calcPr fullCalcOnLoad="1"/>
</workbook>`;
}

function sourcesTable(sheets) {
  return {
    name: 'Sources',
    columns: ['sheet', 'source', 'url', 'fetched', 'rows', 'columns'],
    rows: sheets.map((sheet) => ({
      sheet: sheet.name,
      source: sheet.source || '',
      url: sheet.url || '',
      fetched: sheet.fetchedAt || '',
      rows: sheet.rows?.length ?? 0,
      columns: (sheet.columns || []).join(', '),
    })),
  };
}

/**
 * @param {Array<{ name: string, columns: string[], rows: object[], source?: string, url?: string, fetchedAt?: string }>} sheets
 * @returns {Uint8Array}
 */
export function buildWorkbook(sheets) {
  const input = Array.isArray(sheets) ? sheets.filter((s) => s && Array.isArray(s.columns)) : [];
  if (!input.length) {
    throw new Error('Nothing to export — fetch a source and pick at least one column.');
  }
  const withSources = [...input, sourcesTable(input)];
  const names = uniqueSheetNames(withSources.map((s) => s.name));
  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml(withSources.length) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'xl/workbook.xml', data: workbookXml(names) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(withSources.length) },
    { name: 'xl/styles.xml', data: STYLES },
  ];
  withSources.forEach((sheet, i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: sheetXml({ columns: sheet.columns, rows: sheet.rows || [] }),
    });
  });
  return zipStore(files);
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'takeout.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadWorkbook(sheets, title) {
  const bytes = buildWorkbook(sheets);
  downloadBytes(bytes, workbookFilename(title || 'takeout'));
  return bytes;
}

/**
 * The Excel download: a real Office Open XML workbook (.xlsx) that Excel,
 * Numbers, and Sheets open with live formulas. Browser-safe ESM — a tiny
 * uncompressed zip writer, no npm, no build step.
 *
 * Wall Street Prep conventions this file is built around:
 *  - blue font = hard-coded input, black = formula, green = link to another sheet
 *  - inputs live on Assumptions; no constant is buried inside a formula
 *  - one row is one calculation, and a forecast row uses the same formula in
 *    every column (absolute row, relative column R1C1 refs make that literal;
 *    they are rewritten to A1 only when the xlsx is serialised)
 *  - income positive, expenses negative
 *  - historical column first, forecast to the right; no spacer columns
 *  - interest is charged on the *beginning* balance, so there is no circularity
 *    and no iterative-calc switch to explain to a beginner
 *
 * Everything is stated in USD millions.
 */

import { COMP_MULTIPLES } from './engine.js';
import { SCENARIO_DRIVERS, SCENARIO_LABELS } from './scenarios.js';

const SCENARIO_KEYS = ['downside', 'base', 'upside', 'custom'];

const M = 1e6;

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Style name → cellXfs index. Tests map cells back through this. */
export const STYLE = {
  Default: 0,
  title: 1,
  hdr: 2,
  lbl: 3,
  lblb: 4,
  note: 5,
  in: 6,
  inpct: 7,
  innum: 8,
  calc: 9,
  calcb: 10,
  calcpct: 11,
  calcnum: 12,
  link: 13,
  linknum: 14,
  check: 15,
};

const STYLE_NAMES = Object.fromEntries(Object.entries(STYLE).map(([k, v]) => [v, k]));

export function styleName(xf) {
  return STYLE_NAMES[xf] || null;
}

/* ----------------------------- R1C1 → A1 ----------------------------- */

export function colLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function r1c1RefToA1(rowPart, colPart, curRow, curCol) {
  let row;
  let rowAbs = false;
  if (rowPart == null || rowPart === '') {
    row = curRow;
  } else if (rowPart.startsWith('[')) {
    row = curRow + Number(rowPart.slice(1, -1));
  } else {
    row = Number(rowPart);
    rowAbs = true;
  }
  let col;
  let colAbs = false;
  if (colPart == null || colPart === '') {
    col = curCol;
  } else if (colPart.startsWith('[')) {
    col = curCol + Number(colPart.slice(1, -1));
  } else {
    col = Number(colPart);
    colAbs = true;
  }
  return `${colAbs ? '$' : ''}${colLetter(col)}${rowAbs ? '$' : ''}${row}`;
}

/**
 * Rewrite every R1C1 reference in a formula to A1, relative to the cell
 * that holds it. Sheet names stay put. Excel stores A1 in the xlsx.
 */
export function r1c1ToA1(formula, curRow, curCol) {
  return String(formula).replace(
    /(?:([A-Za-z_][A-Za-z0-9_.]*)!)?R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?/g,
    (match, sheet, r, c) => {
      if (r == null && c == null) return match;
      const a1 = r1c1RefToA1(r, c, curRow, curCol);
      return sheet ? `${sheet}!${a1}` : a1;
    }
  );
}

/* --------------------------- uncompressed zip -------------------------- */

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
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * STORED (uncompressed) zip. Excel, Numbers, and Sheets all accept it;
 * we only need a valid local-header / central-directory / EOCD chain.
 * @param {{name: string, data: string|Uint8Array}[]} files
 */
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

/* ------------------------------ OOXML parts ---------------------------- */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
SHEETS
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const CORE_PROPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Financial model</dc:title>
<dc:creator>Beep boop</dc:creator>
</cp:coreProperties>`;

const APP_PROPS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Microsoft Excel</Application>
</Properties>`;

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="1C1C1C"/></a:dk2>
<a:lt2><a:srgbClr val="F6F1E7"/></a:lt2>
<a:accent1><a:srgbClr val="1A49C4"/></a:accent1>
<a:accent2><a:srgbClr val="1F7A4D"/></a:accent2>
<a:accent3><a:srgbClr val="B3401F"/></a:accent3>
<a:accent4><a:srgbClr val="F2C14E"/></a:accent4>
<a:accent5><a:srgbClr val="755CA7"/></a:accent5>
<a:accent6><a:srgbClr val="78A8D5"/></a:accent6>
<a:hlink><a:srgbClr val="1A49C4"/></a:hlink>
<a:folHlink><a:srgbClr val="755CA7"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;

/**
 * fonts: 0 default black, 1 title bold, 2 bold, 3 italic muted, 4 blue input,
 * 5 green link, 6 check bold. fills 0 none, 1 gray125 (required), 2 hdr, 3 check.
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="164" formatCode="#,##0.0"/>
<numFmt numFmtId="165" formatCode="#,##0.0;(#,##0.0)"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
<numFmt numFmtId="167" formatCode="#,##0.00"/>
<numFmt numFmtId="168" formatCode="#,##0.000"/>
</numFmts>
<fonts count="7">
<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF000000"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
<font><i/><sz val="11"/><color rgb="FF6B6455"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF008000"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFEAE0"/><bgColor rgb="FFEFEAE0"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F3E8"/><bgColor rgb="FFE8F3E8"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="6" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

function writeCell(cell, row, col) {
  const ref = `${colLetter(col)}${row}`;
  const s = cell.s && STYLE[cell.s] != null ? ` s="${STYLE[cell.s]}"` : '';
  if (cell.f) {
    const raw = String(cell.f).replace(/^=/, '');
    const a1 = r1c1ToA1(raw, row, col);
    const cached = typeof cell.v === 'number' && Number.isFinite(cell.v) ? `<v>${cell.v}</v>` : '';
    return `<c r="${ref}"${s}><f>${esc(a1)}</f>${cached}</c>`;
  }
  if (cell.v == null || cell.v === '') return '';
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${esc(cell.v)}</t></is></c>`;
}

function sheetXml({ rows, widths }) {
  const cols = (widths || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round(w / 6))}" customWidth="1"/>`)
    .join('');
  const data = rows
    .map((cells, i) => {
      const r = i + 1;
      const body = (cells || []).map((cell, j) => writeCell(cell || {}, r, j + 1)).join('');
      return `<row r="${r}">${body}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${data}</sheetData>
</worksheet>`;
}

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

function workbookRels(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) => {
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${sheetCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
}

function contentTypes(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, i) => {
    return `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join('\n');
  return CONTENT_TYPES.replace('SHEETS', sheets);
}

function packXlsx(sheets) {
  const files = [
    { name: '[Content_Types].xml', data: contentTypes(sheets.length) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: CORE_PROPS },
    { name: 'docProps/app.xml', data: APP_PROPS },
    { name: 'xl/workbook.xml', data: workbookXml(sheets.map((s) => s.name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(sheets.length) },
    { name: 'xl/styles.xml', data: STYLES_XML },
    { name: 'xl/theme/theme1.xml', data: THEME },
  ];
  sheets.forEach((s, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) });
  });
  return zipStore(files);
}

/* --------------------------- sheet builders ---------------------------- */

/** Row builder that hands back the 1-based row number it just wrote. */
function sheetBuilder() {
  const rows = [];
  return {
    add(cells) {
      rows.push(cells);
      return rows.length;
    },
    blank() {
      rows.push([]);
      return rows.length;
    },
    text(values, style = 'lbl') {
      return this.add(values.map((v) => ({ v, s: style })));
    },
    get length() {
      return rows.length;
    },
    pack(widths) {
      return { rows, widths: widths || [] };
    },
  };
}

const mm = (n) => (typeof n === 'number' && Number.isFinite(n) ? n / M : null);

/** FY0 first, then one column per forecast year. No spacer columns. */
function yearHeader(rows, label = 'US$ in millions') {
  return [{ v: label, s: 'hdr' }, ...rows.map((r) => ({ v: r.filed ? `FY${r.year}A` : `FY${r.year}E`, s: 'hdr' }))];
}

/**
 * Assumptions sheet. Every driver the statements use lives here in blue, one
 * per row, with the plain-English note the page shows next to the same slider.
 */
function assumptionsSheet({ company, headlines, model, cards, scenarioState }) {
  const b = sheetBuilder();
  const at = new Map();
  const useScenarios = Boolean(scenarioState?.scenarios);
  at.valueCol = useScenarios ? 6 : 2;
  at.scenarioKeys = useScenarios ? new Set(SCENARIO_DRIVERS) : null;
  at.selectorRow = null;
  at.headerRow = null;

  b.text(['Assumptions & drivers'], 'title');
  b.text(['Blue cells are yours to change. Every other sheet reads the Active column when scenarios are on.'], 'note');
  b.text([`${company?.company || headlines?.entityName || ''} · ${company?.fortune_ticker || company?.sec_ticker || ''} · US$ in millions`], 'note');
  b.blank();

  if (useScenarios) {
    b.text(['Scenario selector — type downside, base, upside, or custom. Active column updates automatically.'], 'note');
    at.selectorRow = b.add([
      { v: 'Active scenario', s: 'lbl' },
      { v: scenarioState.activeScenario || 'base', s: 'in' },
    ]);
    b.blank();
    at.headerRow = b.add([
      { v: 'Driver', s: 'hdr' },
      ...SCENARIO_KEYS.map((k) => ({ v: SCENARIO_LABELS[k], s: 'hdr' })),
      { v: 'Active', s: 'hdr' },
      { v: 'What it is', s: 'hdr' },
      { v: 'How to get it', s: 'hdr' },
      { v: 'Where the default came from', s: 'hdr' },
    ]);
  } else {
    b.add([
      { v: 'Driver', s: 'hdr' },
      { v: 'Value', s: 'hdr' },
      { v: 'What it is', s: 'hdr' },
      { v: 'How to get it', s: 'hdr' },
      { v: 'Where the default came from', s: 'hdr' },
    ]);
  }

  const a = model.assumptions;
  const put = (key, label, value, style, what, how, origin) => {
    if (useScenarios && SCENARIO_DRIVERS.includes(key)) {
      const rowNum = b.length + 1;
      const cells = [{ v: label, s: 'lbl' }];
      for (const sk of SCENARIO_KEYS) {
        const raw = scenarioState.scenarios[sk]?.values?.[key];
        const val = raw != null ? raw : value;
        cells.push({ v: typeof val === 'number' && Number.isFinite(val) ? val : null, s: style });
      }
      cells.push({
        f: `=INDEX(R${rowNum}C2:R${rowNum}C5,1,MATCH(R${at.selectorRow}C2,R${at.headerRow}C2:R${at.headerRow}C5,0))`,
        s: style,
      });
      cells.push({ v: what, s: 'note' }, { v: how, s: 'note' }, { v: origin, s: 'note' });
      const r = b.add(cells);
      at.set(key, r);
      return r;
    }
    const r = b.add([
      { v: label, s: 'lbl' },
      { v: typeof value === 'number' && Number.isFinite(value) ? value : null, s: style },
      { v: what, s: 'note' },
      { v: how, s: 'note' },
      { v: origin, s: 'note' },
    ]);
    at.set(key, r);
    return r;
  };

  const copy = (key) => cards?.find((c) => c.key === key) || {};
  for (const [key, label, value, style] of [
    ['revenueGrowth', 'Revenue growth (per year)', a.revenueGrowth, 'inpct'],
    ['grossMargin', 'Gross margin', a.grossMargin, 'inpct'],
    ['ebitMargin', 'Operating (EBIT) margin', a.ebitMargin, 'inpct'],
    ['taxRate', 'Tax rate', a.taxRate, 'inpct'],
    ['daPct', 'Depreciation & amortisation (% of revenue)', a.daPct, 'inpct'],
    ['capexPct', 'Capital expenditure (% of revenue)', a.capexPct, 'inpct'],
    ['dsoDays', 'Days sales outstanding', a.dsoDays, 'innum'],
    ['dioDays', 'Days inventory on hand', a.dioDays, 'innum'],
    ['interestRate', 'Interest rate on debt', a.interestRate, 'inpct'],
    ['cashYield', 'Interest earned on cash', a.cashYield, 'inpct'],
    ['debtRepaymentPct', 'Debt repaid each year (% of balance)', a.debtRepaymentPct, 'inpct'],
    ['payoutRatio', 'Dividend payout (% of net income)', a.payoutRatio, 'inpct'],
    ['riskFreeRate', 'Risk-free rate', a.riskFreeRate, 'inpct'],
    ['equityRiskPremium', 'Equity risk premium', a.equityRiskPremium, 'inpct'],
    ['beta', 'Beta', a.beta, 'innum'],
    ['terminalGrowth', 'Terminal growth rate', a.terminalGrowth, 'inpct'],
  ]) {
    const c = copy(key);
    put(key, label, value, style, c.what || '', c.how || '', c.origin || '');
  }

  b.blank();
  b.text(['Opening balances (from the filed 10-K — locked)'], 'lblb');
  const row0 = model.rows[0];
  const opening = [
    ['openRevenue', 'Revenue', row0.revenue],
    ['openCash', 'Cash', row0.cash],
    ['openReceivables', 'Accounts receivable', row0.receivables],
    ['openInventory', 'Inventory', row0.inventory],
    ['openOtherAssets', 'Other assets (PP&E, goodwill, everything untagged)', row0.otherAssets],
    ['openDebt', 'Long-term debt', row0.debt],
    ['openOtherLiabilities', 'Other liabilities', row0.otherLiabilities],
    ['openEquity', 'Shareholders’ equity', row0.equity],
    ['shares', 'Diluted shares outstanding (millions)', model.shares],
  ];
  for (const [key, label, value] of opening) {
    const r = b.add([{ v: label, s: 'lbl' }, { v: mm(value), s: 'in' }]);
    at.set(key, r);
  }
  b.blank();
  b.text([
    'Note: the snapshot has no separate tag for net PP&E, goodwill, or payables, so those sit in the two “other” lines. They are what make the filed year balance exactly.',
  ], 'note');
  b.text(['Note: D&A is not tagged either. CapEx is the stand-in — a mature company roughly replaces what it wears out.'], 'note');

  return { sheet: b.pack(useScenarios ? [220, 72, 72, 72, 72, 72, 240, 300, 280] : [240, 90, 260, 360, 320]), at };
}

/**
 * `A!` prefixed reference into Assumptions. Scenario drivers read the Active
 * column; opening balances and locked cells stay in column B.
 */
function ref(at, key) {
  const col = at.scenarioKeys?.has(key) ? at.valueCol : 2;
  return `Assumptions!R${at.get(key)}C${col}`;
}

function incomeSheet(model, at) {
  const b = sheetBuilder();
  const rows = model.rows;
  const cols = rows.length;
  b.text(['Income statement'], 'title');
  b.text(['US$ in millions. Income positive, expenses negative. FY…A is filed; FY…E is your forecast.'], 'note');
  b.add(yearHeader(rows));

  const line = (label, fy0, formula, style = 'calc', bold = false) => {
    const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }, { v: mm(fy0), s: fy0 == null ? 'lbl' : 'in' }];
    for (let i = 1; i < cols; i += 1) cells.push({ f: formula, s: bold ? 'calcb' : style });
    return b.add(cells);
  };

  const hasGm = model.assumptions.grossMargin != null;
  const r = {};
  r.revenue = line('Revenue', rows[0].revenue, `=RC[-1]*(1+${ref(at, 'revenueGrowth')})`);
  r.cogs = line('Cost of sales', rows[0].cogs, hasGm ? `=-R${r.revenue}C*(1-${ref(at, 'grossMargin')})` : null);
  r.grossProfit = line('Gross profit', rows[0].grossProfit, hasGm ? `=R${r.revenue}C+R${r.cogs}C` : null);
  r.opex = line(
    'Operating expenses',
    rows[0].opex,
    hasGm
      ? `=-(R${r.grossProfit}C-R${r.revenue}C*${ref(at, 'ebitMargin')})`
      : `=-(R${r.revenue}C-R${r.revenue}C*${ref(at, 'ebitMargin')})`
  );
  r.ebit = line('Operating income (EBIT)', rows[0].ebit, `=R${r.revenue}C*${ref(at, 'ebitMargin')}`, 'calc', true);
  r.da = line('Depreciation & amortisation (memo)', rows[0].da, `=-R${r.revenue}C*${ref(at, 'daPct')}`);
  r.ebitda = line('EBITDA (memo)', rows[0].ebitda, `=R${r.ebit}C-R${r.da}C`);
  r.interestExpense = line('Interest expense', null, `=-Schedules!R${model.schedRows.debtBegin}C*${ref(at, 'interestRate')}`, 'link');
  r.interestIncome = line('Interest income', null, `=BS!R${model.bsRows.cash}C[-1]*${ref(at, 'cashYield')}`, 'link');
  r.pretax = line('Pre-tax income', null, `=R${r.ebit}C+R${r.interestExpense}C+R${r.interestIncome}C`, 'calc', true);
  r.taxes = line('Income taxes', null, `=-MAX(0,R${r.pretax}C)*${ref(at, 'taxRate')}`);
  r.netIncome = line('Net income', rows[0].netIncome, `=R${r.pretax}C+R${r.taxes}C`, 'calc', true);
  b.blank();
  b.text(['Interest uses the beginning-of-year debt and cash balances. That is deliberate: it keeps the model free of circular references.'], 'note');

  return { sheet: b.pack([300, ...rows.map(() => 90)]), rows: r };
}

/** BASE schedules: begin + additions − subtractions = end, one block each. */
function schedulesSheet(model, at, isRows) {
  const b = sheetBuilder();
  const rows = model.rows;
  const cols = rows.length;
  b.text(['Supporting schedules'], 'title');
  b.text(['US$ in millions. Each block is a corkscrew: beginning balance, what was added, what was taken out, ending balance.'], 'note');
  b.add(yearHeader(rows));

  const line = (label, fy0, formula, style = 'calc', bold = false) => {
    const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }, { v: mm(fy0), s: fy0 == null ? 'lbl' : 'in' }];
    for (let i = 1; i < cols; i += 1) cells.push({ f: formula, s: bold ? 'calcb' : style });
    return b.add(cells);
  };

  const r = {};
  b.text(['Working capital'], 'lblb');
  r.ar = line('Accounts receivable', rows[0].receivables, `=IS!R${isRows.revenue}C*${ref(at, 'dsoDays')}/365`, 'link');
  r.inv = line('Inventory', rows[0].inventory, `=-IS!R${isRows.cogs}C*${ref(at, 'dioDays')}/365`, 'link');
  r.nwc = line('Net working capital', rows[0].receivables + rows[0].inventory, `=R${r.ar}C+R${r.inv}C`, 'calc', true);
  r.nwcChange = line('(Increase) / decrease in working capital', null, `=-(R${r.nwc}C-R${r.nwc}C[-1])`);
  b.blank();

  b.text(['Long-term operating assets (PP&E, goodwill, everything untagged)'], 'lblb');
  r.ltaBegin = line('Beginning balance', null, `=R${b.length + 4}C[-1]`);
  r.capex = line('Capital expenditure', null, `=IS!R${isRows.revenue}C*${ref(at, 'capexPct')}`, 'link');
  r.dep = line('Depreciation & amortisation', null, `=IS!R${isRows.da}C`, 'link');
  r.ltaEnd = line('Ending balance', rows[0].otherAssets, `=R${r.ltaBegin}C+R${r.capex}C+R${r.dep}C`, 'calc', true);
  b.blank();

  b.text(['Long-term debt'], 'lblb');
  r.debtBegin = line('Beginning balance', null, `=R${b.length + 4}C[-1]`);
  r.debtIssued = line('Issuance', null, null);
  r.debtRepaid = line('Repayment', null, `=-R${r.debtBegin}C*${ref(at, 'debtRepaymentPct')}`);
  r.debtEnd = line('Ending balance', rows[0].debt, `=R${r.debtBegin}C+R${r.debtRepaid}C`, 'calc', true);
  b.blank();

  b.text(['Shareholders’ equity / retained earnings'], 'lblb');
  r.eqBegin = line('Beginning balance', null, `=R${b.length + 4}C[-1]`);
  r.eqNi = line('Net income', null, `=IS!R${isRows.netIncome}C`, 'link');
  r.eqDiv = line('Dividends paid', null, `=-MAX(0,IS!R${isRows.netIncome}C)*${ref(at, 'payoutRatio')}`, 'link');
  r.eqEnd = line('Ending balance', rows[0].equity, `=R${r.eqBegin}C+R${r.eqNi}C+R${r.eqDiv}C`, 'calc', true);

  return { sheet: b.pack([300, ...rows.map(() => 90)]), rows: r };
}

function balanceSheet(model, schedRows, cfsRows) {
  const b = sheetBuilder();
  const rows = model.rows;
  const cols = rows.length;
  b.text(['Balance sheet'], 'title');
  b.text(['US$ in millions. Cash is the plug — it is whatever the cash flow statement leaves behind, which is why the check below is a real test.'], 'note');
  b.add(yearHeader(rows));

  const line = (label, fy0, formula, style = 'calc', bold = false) => {
    const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }, { v: mm(fy0), s: fy0 == null ? 'lbl' : 'in' }];
    for (let i = 1; i < cols; i += 1) cells.push({ f: formula, s: bold ? 'calcb' : style });
    return b.add(cells);
  };

  const r = {};
  r.cash = line('Cash & equivalents', rows[0].cash, `=CFS!R${cfsRows.endCash}C`, 'link');
  r.ar = line('Accounts receivable', rows[0].receivables, `=Schedules!R${schedRows.ar}C`, 'link');
  r.inv = line('Inventory', rows[0].inventory, `=Schedules!R${schedRows.inv}C`, 'link');
  r.other = line('Other assets (PP&E, goodwill, untagged)', rows[0].otherAssets, `=Schedules!R${schedRows.ltaEnd}C`, 'link');
  r.totalAssets = line('Total assets', rows[0].totalAssets, `=SUM(R${r.cash}C:R${r.other}C)`, 'calc', true);
  b.blank();
  r.debt = line('Long-term debt', rows[0].debt, `=Schedules!R${schedRows.debtEnd}C`, 'link');
  r.otherLiab = line('Other liabilities', rows[0].otherLiabilities, `=RC[-1]`);
  r.totalLiab = line('Total liabilities', rows[0].totalLiabilities, `=R${r.debt}C+R${r.otherLiab}C`, 'calc', true);
  r.equity = line('Shareholders’ equity', rows[0].equity, `=Schedules!R${schedRows.eqEnd}C`, 'link');
  r.totalLE = line('Total liabilities & equity', rows[0].totalLiabEquity, `=R${r.totalLiab}C+R${r.equity}C`, 'calc', true);
  const checkCells = [{ v: 'Check: assets − (liabilities + equity)', s: 'lblb' }];
  for (let i = 0; i < cols; i += 1) checkCells.push({ f: `=R${r.totalAssets}C-R${r.totalLE}C`, s: 'check' });
  r.check = b.add(checkCells);

  return { sheet: b.pack([300, ...rows.map(() => 90)]), rows: r };
}

function cashFlowSheet(model, isRows, schedRows) {
  const b = sheetBuilder();
  const rows = model.rows;
  const cols = rows.length;
  b.text(['Cash flow statement'], 'title');
  b.text(['US$ in millions. Cash in positive, cash out negative.'], 'note');
  b.add(yearHeader(rows));

  const line = (label, fy0, formula, style = 'calc', bold = false) => {
    const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }, { v: mm(fy0), s: fy0 == null ? 'lbl' : 'in' }];
    for (let i = 1; i < cols; i += 1) cells.push({ f: formula, s: bold ? 'calcb' : style });
    return b.add(cells);
  };

  const r = {};
  r.ni = line('Net income', null, `=IS!R${isRows.netIncome}C`, 'link');
  r.da = line('Add back: depreciation & amortisation', null, `=-IS!R${isRows.da}C`, 'link');
  r.wc = line('Change in working capital', null, `=Schedules!R${schedRows.nwcChange}C`, 'link');
  r.cfo = line('Cash from operations', model.rows[0].cfo, `=SUM(R${r.ni}C:R${r.wc}C)`, 'calc', true);
  r.capex = line('Capital expenditure', model.rows[0].capex, `=-Schedules!R${schedRows.capex}C`, 'link');
  r.cfi = line('Cash from investing', model.rows[0].cfi, `=R${r.capex}C`, 'calc', true);
  r.repay = line('Debt repayment', null, `=Schedules!R${schedRows.debtRepaid}C`, 'link');
  r.div = line('Dividends paid', null, `=Schedules!R${schedRows.eqDiv}C`, 'link');
  r.cff = line('Cash from financing', model.rows[0].cff, `=R${r.repay}C+R${r.div}C`, 'calc', true);
  r.net = line('Net change in cash', null, `=R${r.cfo}C+R${r.cfi}C+R${r.cff}C`, 'calc', true);
  r.beginCash = line('Beginning cash', null, `=R${b.length + 2}C[-1]`);
  r.endCash = line('Ending cash', model.rows[0].cash, `=R${r.beginCash}C+R${r.net}C`, 'calc', true);

  return { sheet: b.pack([300, ...rows.map(() => 90)]), rows: r };
}

function dcfSheet(model, dcf, sensitivity, at, isRows, schedRows) {
  const b = sheetBuilder();
  const rows = model.rows;
  const cols = rows.length;
  b.text(['Discounted cash flow'], 'title');
  b.text(['US$ in millions except per-share. Two stages: the five years you forecast, then a Gordon-growth stub for everything after.'], 'note');
  b.blank();

  b.text(['WACC build-up'], 'lblb');
  const w = {};
  const kv = (label, formula, cached, style = 'calcpct') =>
    b.add([{ v: label, s: 'lbl' }, { f: formula, v: cached, s: style }]);
  w.rf = kv('Risk-free rate', `=${ref(at, 'riskFreeRate')}`, model.assumptions.riskFreeRate, 'calcpct');
  w.erp = kv('Equity risk premium', `=${ref(at, 'equityRiskPremium')}`, model.assumptions.equityRiskPremium, 'calcpct');
  w.beta = kv('Beta', `=${ref(at, 'beta')}`, model.assumptions.beta, 'calcnum');
  w.coe = kv('Cost of equity (CAPM)', `=R${w.rf}C+R${w.beta}C*R${w.erp}C`, dcf?.wacc?.costOfEquity, 'calcpct');
  w.kd = kv('Cost of debt (pre-tax)', `=${ref(at, 'interestRate')}`, model.assumptions.interestRate, 'calcpct');
  w.kdAt = kv('Cost of debt (after tax)', `=R${w.kd}C*(1-${ref(at, 'taxRate')})`, dcf?.wacc?.afterTaxCostOfDebt, 'calcpct');
  w.eq = b.add([{ v: 'Equity value (market cap)', s: 'lbl' }, { v: mm(dcf?.wacc?.equityValue), s: 'in' }]);
  w.dt = b.add([{ v: 'Debt', s: 'lbl' }, { f: `=Schedules!R${schedRows.debtEnd}C2`, v: mm(dcf?.wacc?.debt), s: 'link' }]);
  w.we = kv('Weight — equity', `=R${w.eq}C/(R${w.eq}C+R${w.dt}C)`, dcf?.wacc?.equityWeight, 'calcpct');
  w.wd = kv('Weight — debt', `=1-R${w.we}C`, dcf?.wacc?.debtWeight, 'calcpct');
  w.wacc = kv('WACC', `=R${w.coe}C*R${w.we}C+R${w.kdAt}C*R${w.wd}C`, dcf?.wacc?.wacc, 'calcpct');
  b.blank();

  b.text(['Free cash flow build'], 'lblb');
  b.add(yearHeader(rows));
  const line = (label, formula, style = 'calc', bold = false) => {
    const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }, { v: null, s: 'lbl' }];
    for (let i = 1; i < cols; i += 1) cells.push({ f: formula, s: bold ? 'calcb' : style });
    return b.add(cells);
  };
  const f = {};
  f.ebit = line('EBIT', `=IS!R${isRows.ebit}C`, 'link');
  f.tax = line('Less: tax on EBIT', `=-MAX(0,R${f.ebit}C)*${ref(at, 'taxRate')}`);
  f.da = line('Plus: depreciation & amortisation', `=-IS!R${isRows.da}C`, 'link');
  f.capex = line('Less: capital expenditure', `=-Schedules!R${schedRows.capex}C`, 'link');
  f.wc = line('Less: increase in working capital', `=Schedules!R${schedRows.nwcChange}C`, 'link');
  f.fcf = line('Unlevered free cash flow', `=SUM(R${f.ebit}C:R${f.wc}C)`, 'calc', true);
  f.period = b.add([
    { v: 'Discount period', s: 'lbl' },
    { v: null, s: 'lbl' },
    ...rows.slice(1).map((r) => ({ v: r.offset, s: 'in' })),
  ]);
  f.df = line('Discount factor', `=1/(1+R${w.wacc}C2)^R${f.period}C`, 'calcnum');
  f.pv = line('Present value of FCF', `=R${f.fcf}C*R${f.df}C`, 'calc', true);
  b.blank();

  const first = 3;
  const last = 2 + (cols - 1);
  const v = {};
  const val = (label, formula, cached, style = 'calc') =>
    b.add([{ v: label, s: 'lbl' }, { f: formula, v: cached, s: style }]);
  b.text(['Enterprise → equity bridge'], 'lblb');
  v.pvExplicit = val('PV of forecast years', `=SUM(R${f.pv}C${first}:R${f.pv}C${last})`, mm(dcf?.pvExplicit));
  v.g = val('Terminal growth rate', `=${ref(at, 'terminalGrowth')}`, model.assumptions.terminalGrowth, 'calcpct');
  v.tv = val('Terminal value', `=R${f.fcf}C${last}*(1+R${v.g}C2)/(R${w.wacc}C2-R${v.g}C2)`, mm(dcf?.terminalValue));
  v.pvTv = val('PV of terminal value', `=R${v.tv}C2*R${f.df}C${last}`, mm(dcf?.pvTerminal));
  v.ev = val('Enterprise value', `=R${v.pvExplicit}C2+R${v.pvTv}C2`, mm(dcf?.enterpriseValue), 'calcb');
  v.netDebt = val('Less: net debt (debt − cash)', `=-(${ref(at, 'openDebt')}-${ref(at, 'openCash')})`, -mm(dcf?.netDebt));
  v.equity = val('Equity value', `=R${v.ev}C2+R${v.netDebt}C2`, mm(dcf?.equityValue), 'calcb');
  v.shares = val('Diluted shares (millions)', `=${ref(at, 'shares')}`, mm(model.shares), 'calcnum');
  v.price = val('Implied share price', `=R${v.equity}C2/R${v.shares}C2`, dcf?.impliedPrice, 'calcnum');
  v.market = b.add([
    { v: 'Last market price (Yahoo)', s: 'lbl' },
    { v: Number.isFinite(dcf?.marketPrice) ? dcf.marketPrice : null, s: 'innum' },
  ]);
  val('Implied upside / (downside)', `=IFERROR(R${v.price}C2/R${v.market}C2-1,"not reported")`, dcf?.upside, 'calcpct');
  b.blank();

  b.text(['Sensitivity — implied share price'], 'lblb');
  b.text(['WACC down the side, terminal growth across. Live: these recalculate with the forecast.'], 'note');
  if (sensitivity) {
    const gHeader = b.add([
      { v: 'WACC \\ terminal g', s: 'hdr' },
      { v: null, s: 'hdr' },
      ...sensitivity.growths.map((g) => ({ v: g, s: 'inpct' })),
    ]);
    for (const srow of sensitivity.rows) {
      const cells = [{ v: null, s: 'lbl' }, { v: srow.wacc, s: 'inpct' }];
      for (let i = 0; i < srow.cells.length; i += 1) {
        cells.push({
          f:
            `=IFERROR((NPV(RC2,R${f.fcf}C${first}:R${f.fcf}C${last})` +
            `+(R${f.fcf}C${last}*(1+R${gHeader}C)/(RC2-R${gHeader}C))/(1+RC2)^R${f.period}C${last}` +
            `+R${v.netDebt}C2)/R${v.shares}C2,"n/a")`,
          v: Number.isFinite(srow.cells[i]) ? srow.cells[i] : null,
          s: 'calcnum',
        });
      }
      b.add(cells);
    }
  }

  return { sheet: b.pack([300, 100, ...rows.map(() => 90)]) };
}

function compsSheet(comps, model) {
  const b = sheetBuilder();
  b.text(['Trading comparables'], 'title');
  b.text(['US$ in millions except per-share. A blank cell means the peer does not report that ingredient — it is left out of the median, never counted as zero.'], 'note');
  b.blank();
  b.add(
    ['Company', 'Ticker', 'Price', 'Shares (m)', 'Market cap', 'Net debt', 'Enterprise value', 'Revenue', 'EBITDA', 'EPS', 'EV / Revenue', 'EV / EBITDA', 'P / E'].map((v) => ({ v, s: 'hdr' }))
  );

  const peerRows = [];
  const writePeer = (row) => {
    const netDebt = Number.isFinite(row.enterpriseValue) && Number.isFinite(row.marketCap) ? row.enterpriseValue - row.marketCap : null;
    const r = b.add([
      { v: row.name, s: 'lbl' },
      { v: row.ticker, s: 'lbl' },
      { v: row.price, s: 'innum' },
      { v: mm(row.shares), s: 'in' },
      { f: '=RC[-2]*RC[-1]', v: mm(row.marketCap), s: 'calc' },
      { v: mm(netDebt), s: 'in' },
      { f: '=RC[-2]+RC[-1]', v: mm(row.enterpriseValue), s: 'calc' },
      { v: mm(row.revenue), s: 'in' },
      { v: mm(row.ebitda), s: 'in' },
      { v: row.eps, s: 'innum' },
      { f: '=IFERROR(RC[-4]/RC[-3],"nr")', v: row.evRevenue, s: 'calcnum' },
      { f: '=IFERROR(RC[-5]/RC[-3],"nr")', v: row.evEbitda, s: 'calcnum' },
      { f: '=IFERROR(RC[-10]/RC[-3],"nr")', v: row.pe, s: 'calcnum' },
    ]);
    return r;
  };

  for (const row of comps.rows) peerRows.push(writePeer(row));
  const firstPeer = peerRows[0];
  const lastPeer = peerRows[peerRows.length - 1];
  b.blank();
  const statRow = (label, fn) =>
    b.add([
      { v: label, s: 'lblb' },
      ...Array(9).fill({ v: null, s: 'lbl' }),
      ...COMP_MULTIPLES.map((_, i) => ({
        f: firstPeer ? `=IFERROR(${fn}(R${firstPeer}C${11 + i}:R${lastPeer}C${11 + i}),"nr")` : null,
        s: 'calcb',
      })),
    ]);
  const meanRow = statRow('Mean', 'AVERAGE');
  const medianRow = statRow('Median', 'MEDIAN');
  b.blank();

  b.text(['Target'], 'lblb');
  const selfRow = writePeer(comps.self);
  b.blank();
  b.text(['Implied value at the peer median'], 'lblb');
  b.add(['Multiple', 'Peer median', 'Target driver', 'Implied value', 'Implied share price'].map((v) => ({ v, s: 'hdr' })));
  comps.implied.forEach((imp, i) => {
    const col = 11 + i;
    const driverCol = imp.key === 'pe' ? 10 : imp.key === 'evEbitda' ? 9 : 8;
    b.add([
      { v: imp.label, s: 'lbl' },
      { f: `=R${medianRow}C${col}`, v: imp.multiple, s: 'calcnum' },
      { f: `=R${selfRow}C${driverCol}`, v: imp.key === 'pe' ? imp.driver : mm(imp.driver), s: 'calc' },
      { f: `=IFERROR(RC[-2]*RC[-1],"nr")`, v: imp.key === 'pe' ? imp.value : mm(imp.value), s: 'calc' },
      {
        f:
          imp.key === 'pe'
            ? '=IFERROR(RC[-1],"nr")'
            : `=IFERROR((RC[-1]-R${selfRow}C6)/R${selfRow}C4,"nr")`,
        v: imp.pricePerShare,
        s: 'calcnum',
      },
    ]);
  });
  b.blank();
  b.text([`Mean row: ${meanRow ? 'live AVERAGE over the peer rows' : 'no peers selected'}.`], 'note');
  b.text([`Peer set you picked on the page for ${model.companyName || 'this company'}.`], 'note');

  return { sheet: b.pack([220, 70, 70, 90, 100, 90, 110, 100, 100, 70, 90, 90, 70]) };
}

function checksSheet(model, bsRows, at) {
  const b = sheetBuilder();
  const rows = model.rows;
  b.text(['Error dashboard'], 'title');
  b.text(['If any cell here is not zero / OK, the model is broken. Check it before you trust a number.'], 'note');
  b.blank();
  b.add(yearHeader(rows, 'Check'));
  const cells = [{ v: 'Balance sheet: assets − (liabilities + equity)', s: 'lblb' }];
  for (let i = 0; i < rows.length; i += 1) cells.push({ f: `=BS!R${bsRows.check}C`, s: 'check' });
  b.add(cells);
  const cashCells = [{ v: 'Cash never goes negative', s: 'lblb' }];
  for (let i = 0; i < rows.length; i += 1) cashCells.push({ f: `=IF(BS!R${bsRows.cash}C>=0,"OK","NEGATIVE")`, s: 'lbl' });
  b.add(cashCells);
  if (at?.selectorRow && at?.headerRow) {
    b.blank();
    b.add([
      { v: 'Scenario selector is valid', s: 'lblb' },
      {
        f: `=IF(COUNTIF(Assumptions!R${at.headerRow}C2:Assumptions!R${at.headerRow}C5,Assumptions!R${at.selectorRow}C2)=1,"OK","INVALID")`,
        s: 'lbl',
      },
    ]);
  }
  b.blank();
  b.text(['Sources = uses does not apply here: this is an operating model, not a transaction.'], 'note');
  b.text(['No circular references by design — interest is charged on beginning balances, so Excel never needs iterative calculation.'], 'note');
  b.text(['Scenarios change several drivers together; the DCF sensitivity grid isolates WACC and terminal growth only.'], 'note');
  return { sheet: b.pack([320, ...rows.map(() => 90)]) };
}

function coverSheet({ company, headlines, model, sheets }) {
  const b = sheetBuilder();
  b.text(['Financial model'], 'title');
  b.text([company?.company || headlines?.entityName || '']);
  b.text(['Ticker', company?.fortune_ticker || company?.sec_ticker || '']);
  b.text(['Source', headlines?.asOfYear ? `FY${headlines.asOfYear} 10-K (SEC XBRL Company Facts)` : '']);
  b.text(['Currency', 'USD']);
  b.text(['Scale', 'Millions (US$mm) on every sheet']);
  b.text(['Built', new Date().toISOString().slice(0, 10)]);
  b.blank();
  b.text(['Build order'], 'lblb');
  b.add([{ v: '1', s: 'lbl' }, { v: 'Assumptions — pick a scenario and edit blue drivers.', s: 'note' }]);
  b.add([{ v: '2', s: 'lbl' }, { v: 'IS → Schedules → BS → CFS — three statements wired together.', s: 'note' }]);
  b.add([{ v: '3', s: 'lbl' }, { v: 'DCF and Comps — valuation on top of the forecast.', s: 'note' }]);
  b.add([{ v: '4', s: 'lbl' }, { v: 'Checks — balance tie and scenario selector must read OK/zero.', s: 'note' }]);
  b.blank();
  b.text(['Scenarios vs sensitivity'], 'lblb');
  b.add([
    { v: 'Scenarios', s: 'lblb' },
    {
      v: 'Change several assumptions together (growth, margins, WACC). Use the scenario selector on Assumptions — each case has its own column.',
      s: 'note',
    },
  ]);
  b.add([
    { v: 'Sensitivity', s: 'lblb' },
    {
      v: 'On DCF, the WACC × terminal-growth grid holds everything else fixed — like Excel What-If Analysis with two input cells. Direction: higher WACC lowers value.',
      s: 'note',
    },
  ]);
  b.blank();
  b.text(['How to read the colours'], 'lblb');
  b.add([{ v: 'Blue', s: 'in' }, { v: 'A number you typed. Change these.', s: 'lbl' }]);
  b.add([{ v: 'Black', s: 'calc' }, { v: 'A formula. Do not overwrite.', s: 'lbl' }]);
  b.add([{ v: 'Green', s: 'link' }, { v: 'A link to another sheet.', s: 'lbl' }]);
  b.blank();
  b.text(['How the three statements connect'], 'lblb');
  b.add([{ v: 'Income statement', s: 'lblb' }, { v: 'Sales grow, margins make profit. Interest uses last year’s debt and cash, so nothing is circular. Net income is the handoff.', s: 'note' }]);
  b.add([{ v: 'Cash flow', s: 'lblb' }, { v: 'Starts with that net income. Add back D&A, then CapEx, working capital, debt repaid, dividends. The leftover is the change in cash.', s: 'note' }]);
  b.add([{ v: 'Balance sheet', s: 'lblb' }, { v: 'Cash is that leftover (the plug). Equity = last year + net income − dividends. The check row must read zero.', s: 'note' }]);
  b.blank();
  b.text(['Contents'], 'lblb');
  for (const [name, what] of sheets) b.add([{ v: name, s: 'lblb' }, { v: what, s: 'note' }]);
  b.blank();
  b.text(['Every driver lives on Assumptions. Edit a blue cell there and Excel recalculates the whole workbook.'], 'note');
  b.text(['A blank cell means the 10-K did not tag that number. It is not a zero.'], 'note');
  return b.pack([180, 520]);
}

const SHEET_INDEX = [
  ['Assumptions', 'Every driver, in blue. This is the only sheet you edit.'],
  ['IS', 'Income statement — revenue down to net income.'],
  ['BS', 'Balance sheet — cash is the plug, and the check row proves it ties.'],
  ['CFS', 'Cash flow statement — how net income becomes cash.'],
  ['Schedules', 'Working capital, long-term assets, debt, and equity corkscrews.'],
  ['DCF', 'Unlevered free cash flow, WACC, and the implied share price.'],
  ['Comps', 'Peer multiples and what they imply for this company.'],
  ['Checks', 'Error dashboard. Everything here should read zero or OK.'],
];

/**
 * @param {object} opts
 * @returns {Uint8Array} a STORED zip that is a valid .xlsx
 */
export function buildWorkbook({ company, headlines, model, dcf, sensitivity, comps, cards, include = {}, scenarioState = null }) {
  const { sheet: assumptions, at } = assumptionsSheet({ company, headlines, model, cards, scenarioState });

  // Sheet row numbers are resolved in dependency order: the income statement
  // needs to know where the debt schedule lives, the schedules need the income
  // statement's rows, so the two row maps are precomputed and threaded through
  // rather than guessed.
  const schedProbe = schedulesSheet({ ...model, schedRows: {}, bsRows: {} }, at, PROBE_IS_ROWS);
  const isProbe = incomeSheet({ ...model, schedRows: schedProbe.rows, bsRows: PROBE_BS_ROWS }, at);
  const sched = schedulesSheet({ ...model, schedRows: schedProbe.rows }, at, isProbe.rows);
  const cfsProbe = cashFlowSheet(model, isProbe.rows, sched.rows);
  const bs = balanceSheet(model, sched.rows, cfsProbe.rows);
  const is = incomeSheet({ ...model, schedRows: sched.rows, bsRows: bs.rows }, at);
  const cfs = cashFlowSheet(model, is.rows, sched.rows);
  const checks = checksSheet(model, bs.rows, at);

  const parts = [
    { name: 'Cover', ...coverSheet({ company, headlines, model, sheets: SHEET_INDEX }) },
    { name: 'Assumptions', ...assumptions },
    { name: 'IS', ...is.sheet },
    { name: 'BS', ...bs.sheet },
    { name: 'CFS', ...cfs.sheet },
    { name: 'Schedules', ...sched.sheet },
  ];
  if (include.dcf !== false && dcf) {
    parts.push({ name: 'DCF', ...dcfSheet(model, dcf, sensitivity, at, is.rows, sched.rows).sheet });
  }
  if (include.comps !== false && comps?.ok) {
    parts.push({ name: 'Comps', ...compsSheet(comps, model).sheet });
  }
  parts.push({ name: 'Checks', ...checks.sheet });

  return packXlsx(parts);
}

// First-pass row maps: only used to lay out the probe sheets whose real row
// numbers come back on the second pass. The layout is fixed, so these are the
// same numbers the real pass produces.
const PROBE_IS_ROWS = { revenue: 4, cogs: 5, da: 9, ebit: 8, netIncome: 15 };
const PROBE_BS_ROWS = { cash: 4 };

/* ---------------------- single-unit / portfolio workbook ---------------- */

const UNIT_ASSUMPTION_ROWS = [
  ['capacity', 'Capacity', 'innum'],
  ['utilization', 'Utilization', 'inpct'],
  ['corePrice', 'Core price', 'innum'],
  ['discountRate', 'Discount', 'inpct'],
  ['volumeGrowth', 'Volume growth (per year)', 'inpct'],
  ['variableCostPerTxn', 'Variable cost / transaction', 'innum'],
  ['laborVariablePct', 'Labor (% of revenue)', 'inpct'],
  ['laborFixed', 'Fixed labor (per year)', 'in'],
  ['rent', 'Rent & occupancy (per year)', 'in'],
  ['localMarketing', 'Local marketing (per year)', 'in'],
  ['centralMarketing', 'Central marketing (per year)', 'in'],
  ['allocatedOverhead', 'Allocated overhead (per year)', 'in'],
  ['taxRate', 'Tax rate', 'inpct'],
  ['openingCosts', 'Opening investment (year 1 CapEx)', 'in'],
  ['usefulLife', 'Useful life (years)', 'innum'],
  ['maintenanceCapex', 'Maintenance CapEx (per year)', 'in'],
  ['openingCash', 'Cash you start with', 'in'],
  ['openingDebt', 'Debt you start with', 'in'],
  ['dsoDays', 'Days to collect', 'innum'],
  ['dioDays', 'Days of inventory', 'innum'],
  ['dpoDays', 'Days to pay suppliers', 'innum'],
  ['interestRate', 'Interest rate on debt', 'inpct'],
  ['cashYield', 'Interest earned on cash', 'inpct'],
  ['debtRepaymentPct', 'Debt repaid each year (% of balance)', 'inpct'],
  ['payoutRatio', 'Owner draw (% of net income)', 'inpct'],
  ['hurdleRate', 'Discount rate (NPV hurdle)', 'inpct'],
];

function unitAssumptionsSheet(model, cards) {
  const b = sheetBuilder();
  const at = new Map();
  b.text(['Assumptions & drivers'], 'title');
  b.text(['Blue cells are yours to change. Every other sheet reads them. Figures are US dollars, not millions.'], 'note');
  b.text(['Single-unit model · capacity × utilization × price · same three-statement wiring as the 10-K model.'], 'note');
  b.blank();
  b.add([
    { v: 'Driver', s: 'hdr' },
    { v: 'Value', s: 'hdr' },
    { v: 'What it is', s: 'hdr' },
    { v: 'How to get it', s: 'hdr' },
    { v: 'Where the default came from', s: 'hdr' },
  ]);

  const a = model.assumptions;
  const copy = (key) => cards?.find((c) => c.key === key) || {};
  for (const [key, label, style] of UNIT_ASSUMPTION_ROWS) {
    const value = a[key];
    const c = copy(key);
    const r = b.add([
      { v: label, s: 'lbl' },
      { v: typeof value === 'number' && Number.isFinite(value) ? value : null, s: style },
      { v: c.what || '', s: 'note' },
      { v: c.how || '', s: 'note' },
      { v: c.origin || c.originText?.() || '', s: 'note' },
    ]);
    at.set(key, r);
  }

  return { sheet: b.pack([260, 90, 260, 360, 320]), at };
}

function unitLine(b, rows, label, formulas, cachedKey, style, bold) {
  const xf = bold ? 'calcb' : style || 'calc';
  const cells = [{ v: label, s: bold ? 'lblb' : 'lbl' }];
  for (let i = 0; i < rows.length; i += 1) {
    const f = typeof formulas === 'function' ? formulas(i) : formulas;
    const cached = cachedKey ? rows[i][cachedKey] : null;
    cells.push({ f, v: Number.isFinite(cached) ? cached : null, s: xf });
  }
  return b.add(cells);
}

function unitYearHeader(rows) {
  return [{ v: 'US$', s: 'hdr' }, ...rows.map((r) => ({ v: `Y${r.year}`, s: 'hdr' }))];
}

function unitIncomeSheet(model, at, bsRows) {
  const b = sheetBuilder();
  const rows = model.rows;
  b.text(['Income statement'], 'title');
  b.text(['US dollars. Transactions = capacity × utilization (growing each year). Interest uses last year’s cash and debt.'], 'note');
  b.add(unitYearHeader(rows));
  const line = (label, formulas, cachedKey, style, bold) =>
    unitLine(b, rows, label, formulas, cachedKey, style, bold);

  const r = {};
  r.transactions = line(
    'Transactions',
    (i) =>
      i === 0
        ? `=${ref(at, 'capacity')}*${ref(at, 'utilization')}`
        : `=RC[-1]*(1+${ref(at, 'volumeGrowth')})`,
    'transactions',
    'calcnum'
  );
  r.revenue = line(
    'Revenue',
    `=R${r.transactions}C*${ref(at, 'corePrice')}*(1-${ref(at, 'discountRate')})`,
    'revenue'
  );
  r.cogs = line('Cost of sales', `=-R${r.transactions}C*${ref(at, 'variableCostPerTxn')}`, 'cogs');
  r.grossProfit = line('Gross profit', `=R${r.revenue}C+R${r.cogs}C`, 'grossProfit', 'calc', true);
  r.labor = line(
    'Labor',
    `=-R${r.revenue}C*${ref(at, 'laborVariablePct')}-${ref(at, 'laborFixed')}`,
    'labor'
  );
  r.otherOpex = line(
    'Other operating costs',
    `=-${ref(at, 'rent')}-${ref(at, 'localMarketing')}-${ref(at, 'centralMarketing')}-${ref(at, 'allocatedOverhead')}`,
    'otherOpex'
  );
  r.da = line(
    'Depreciation',
    (i) => `=IF(${i + 1}<=${ref(at, 'usefulLife')},-${ref(at, 'openingCosts')}/${ref(at, 'usefulLife')},0)`,
    'da'
  );
  r.ebit = line(
    'Operating income (EBIT)',
    `=R${r.grossProfit}C+R${r.labor}C+R${r.otherOpex}C+R${r.da}C`,
    'ebit',
    'calc',
    true
  );
  r.interestExpense = line(
    'Interest expense',
    (i) =>
      i === 0
        ? `=-${ref(at, 'openingDebt')}*${ref(at, 'interestRate')}`
        : `=-BS!R${bsRows.debt}C[-1]*${ref(at, 'interestRate')}`,
    'interestExpense',
    'link'
  );
  r.interestIncome = line(
    'Interest income',
    (i) =>
      i === 0
        ? `=${ref(at, 'openingCash')}*${ref(at, 'cashYield')}`
        : `=BS!R${bsRows.cash}C[-1]*${ref(at, 'cashYield')}`,
    'interestIncome',
    'link'
  );
  r.pretax = line(
    'Pre-tax income',
    `=R${r.ebit}C+R${r.interestExpense}C+R${r.interestIncome}C`,
    'pretax',
    'calc',
    true
  );
  r.taxes = line('Income taxes', `=-MAX(0,R${r.pretax}C)*${ref(at, 'taxRate')}`, 'taxes');
  r.netIncome = line('Net income', `=R${r.pretax}C+R${r.taxes}C`, 'netIncome', 'calc', true);
  b.blank();
  b.text(['Interest uses the beginning-of-year debt and cash balances. That is deliberate: it keeps the model free of circular references.'], 'note');
  return { sheet: b.pack([280, ...rows.map(() => 90)]), rows: r };
}

function unitCashSheet(model, isRows, bsRows, at) {
  const b = sheetBuilder();
  const rows = model.rows;
  b.text(['Cash flow statement'], 'title');
  b.text(['US dollars. Cash in positive, cash out negative. Ending cash is the plug on the balance sheet.'], 'note');
  b.add(unitYearHeader(rows));
  const line = (label, formulas, cachedKey, style, bold) =>
    unitLine(b, rows, label, formulas, cachedKey, style, bold);

  const r = {};
  r.ni = line('Net income', `=IS!R${isRows.netIncome}C`, 'netIncome', 'link');
  r.da = line('Add back: depreciation', `=-IS!R${isRows.da}C`, 'daAddBack', 'link');
  r.dAr = line(
    'Receivables (use) / source',
    (i) => (i === 0 ? `=-BS!R${bsRows.ar}C` : `=-(BS!R${bsRows.ar}C-BS!R${bsRows.ar}C[-1])`),
    'deltaAr',
    'link'
  );
  r.dInv = line(
    'Inventory (use) / source',
    (i) => (i === 0 ? `=-BS!R${bsRows.inv}C` : `=-(BS!R${bsRows.inv}C-BS!R${bsRows.inv}C[-1])`),
    'deltaInv',
    'link'
  );
  r.dAp = line(
    'Payables source / (use)',
    (i) => (i === 0 ? `=BS!R${bsRows.ap}C` : `=BS!R${bsRows.ap}C-BS!R${bsRows.ap}C[-1]`),
    'deltaAp',
    'link'
  );
  r.cfo = line('Cash from operations', `=SUM(R${r.ni}C:R${r.dAp}C)`, 'cfo', 'calc', true);
  r.capex = line(
    'Capital expenditure',
    (i) => (i === 0 ? `=-${ref(at, 'openingCosts')}-${ref(at, 'maintenanceCapex')}` : `=-${ref(at, 'maintenanceCapex')}`),
    'capex',
    'link'
  );
  r.repay = line(
    'Debt repayment',
    (i) =>
      i === 0
        ? `=-${ref(at, 'openingDebt')}*${ref(at, 'debtRepaymentPct')}`
        : `=-BS!R${bsRows.debt}C[-1]*${ref(at, 'debtRepaymentPct')}`,
    'debtRepayment',
    'link'
  );
  r.div = line('Owner draw', `=-MAX(0,R${r.ni}C)*${ref(at, 'payoutRatio')}`, 'dividends', 'link');
  r.net = line('Net change in cash', `=R${r.cfo}C+R${r.capex}C+R${r.repay}C+R${r.div}C`, 'netChangeCash', 'calc', true);
  r.beginCash = line(
    'Beginning cash',
    (i) => (i === 0 ? `=${ref(at, 'openingCash')}` : `=R${b.length + 2}C[-1]`),
    null,
    'link'
  );
  r.endCash = line('Ending cash', `=R${r.beginCash}C+R${r.net}C`, 'cash', 'calc', true);
  return { sheet: b.pack([280, ...rows.map(() => 90)]), rows: r };
}

function unitBalanceSheet(model, isRows, cfsRows, at) {
  const b = sheetBuilder();
  const rows = model.rows;
  b.text(['Balance sheet'], 'title');
  b.text(['US dollars. Cash is the plug — it is whatever the cash flow statement leaves behind.'], 'note');
  b.add(unitYearHeader(rows));
  const line = (label, formulas, cachedKey, style, bold) =>
    unitLine(b, rows, label, formulas, cachedKey, style, bold);

  const r = {};
  r.cash = line('Cash (the plug)', `=CFS!R${cfsRows.endCash}C`, 'cash', 'link');
  r.ar = line('Accounts receivable', `=IS!R${isRows.revenue}C*${ref(at, 'dsoDays')}/365`, 'receivables', 'link');
  r.inv = line('Inventory', `=-IS!R${isRows.cogs}C*${ref(at, 'dioDays')}/365`, 'inventory', 'link');
  r.ppe = line(
    'Equipment (net)',
    (i) => (i === 0 ? `=${ref(at, 'openingCosts')}+IS!R${isRows.da}C` : `=RC[-1]+IS!R${isRows.da}C`),
    'ppe',
    'link'
  );
  r.totalAssets = line('Total assets', `=SUM(R${r.cash}C:R${r.ppe}C)`, 'totalAssets', 'calc', true);
  b.blank();
  r.debt = line(
    'Debt',
    (i) =>
      i === 0
        ? `=${ref(at, 'openingDebt')}*(1-${ref(at, 'debtRepaymentPct')})`
        : `=RC[-1]*(1-${ref(at, 'debtRepaymentPct')})`,
    'debt'
  );
  r.ap = line('Payables', `=-IS!R${isRows.cogs}C*${ref(at, 'dpoDays')}/365`, 'payables', 'link');
  r.totalLiab = line('Total liabilities', `=R${r.debt}C+R${r.ap}C`, 'totalLiabilities', 'calc', true);
  r.equity = line(
    'Shareholders’ equity',
    (i) => {
      const ni = `IS!R${isRows.netIncome}C`;
      const div = `-MAX(0,${ni})*${ref(at, 'payoutRatio')}`;
      return i === 0
        ? `=${ref(at, 'openingCash')}-${ref(at, 'openingDebt')}+${ni}+${div}`
        : `=RC[-1]+${ni}+${div}`;
    },
    'equity',
    'link'
  );
  r.totalLE = line('Total liabilities & equity', `=R${r.totalLiab}C+R${r.equity}C`, 'totalLiabEquity', 'calc', true);
  const checkCells = [{ v: 'Check: assets − (liabilities + equity)', s: 'lblb' }];
  for (let i = 0; i < rows.length; i += 1) {
    checkCells.push({ f: `=R${r.totalAssets}C-R${r.totalLE}C`, s: 'check' });
  }
  r.check = b.add(checkCells);
  return { sheet: b.pack([300, ...rows.map(() => 90)]), rows: r };
}

function unitChecksSheet(model, bsRows) {
  const b = sheetBuilder();
  b.text(['Checks'], 'title');
  b.text(['Everything here should read zero. If it does not, a formula was overwritten.'], 'note');
  b.add(unitYearHeader(model.rows));
  const cells = [{ v: 'Balance sheet imbalance', s: 'lblb' }];
  for (let i = 0; i < model.rows.length; i += 1) {
    cells.push({ f: `=BS!R${bsRows.check}C`, v: model.rows[i].balanceCheck, s: 'check' });
  }
  b.add(cells);
  return { sheet: b.pack([260, ...model.rows.map(() => 90)]) };
}

function unitCoverSheet(model) {
  const b = sheetBuilder();
  b.text(['Financial model — lemonade stall'], 'title');
  b.text([
    'Built from one sale (cups × price), not from a 10-K. Same three-statement wiring: cash is the plug, interest uses beginning balances.',
  ], 'note');
  b.blank();
  b.text(['How the three statements connect'], 'lblb');
  b.add([{ v: 'Income statement', s: 'lblb' }, { v: 'Cups × price is sales. Cost per cup is COGS. Net income is the handoff.', s: 'note' }]);
  b.add([{ v: 'Cash flow', s: 'lblb' }, { v: 'Starts with that net income. Year 1 buys the equipment. The leftover is the change in cash.', s: 'note' }]);
  b.add([{ v: 'Balance sheet', s: 'lblb' }, { v: 'Cash is that leftover (the plug). Equity = last year + net income − owner draw. The check row must read zero.', s: 'note' }]);
  b.blank();
  b.text([`Years: ${model.years}. Scenario: ${model.assumptions.scenario || 'base'}.`], 'note');
  return b.pack([200, 520]);
}

const UNIT_PROBE_BS = { cash: 4, ar: 5, inv: 6, ppe: 7, debt: 10, ap: 11 };

/**
 * Excel for the unit-econ exercise. Dollars, not millions. Live formulas
 * from cups × price, with the same colour code as the 10-K workbook.
 */
export function buildUnitWorkbook({ model, cards }) {
  const { sheet: assumptions, at } = unitAssumptionsSheet(model, cards);
  const isProbe = unitIncomeSheet(model, at, UNIT_PROBE_BS);
  const cfsProbe = unitCashSheet(model, isProbe.rows, UNIT_PROBE_BS, at);
  const bs = unitBalanceSheet(model, isProbe.rows, cfsProbe.rows, at);
  const is = unitIncomeSheet(model, at, bs.rows);
  const cfs = unitCashSheet(model, is.rows, bs.rows, at);
  const checks = unitChecksSheet(model, bs.rows);

  return packXlsx([
    { name: 'Cover', ...unitCoverSheet(model) },
    { name: 'Assumptions', ...assumptions },
    { name: 'IS', ...is.sheet },
    { name: 'CFS', ...cfs.sheet },
    { name: 'BS', ...bs.sheet },
    { name: 'Checks', ...checks.sheet },
  ]);
}

/* ---------------------- capital / strategic / market ------------------- */

function exerciseAssumptionsSheet(title, note, rows, cards) {
  const b = sheetBuilder();
  const at = new Map();
  b.text(['Assumptions & drivers'], 'title');
  b.text([note], 'note');
  b.text([title], 'note');
  b.blank();
  b.add([
    { v: 'Driver', s: 'hdr' },
    { v: 'Value', s: 'hdr' },
    { v: 'What it is', s: 'hdr' },
    { v: 'How to get it', s: 'hdr' },
    { v: 'Where the default came from', s: 'hdr' },
  ]);
  const copy = (key) => cards?.find((c) => c.key === key) || {};
  for (const row of rows) {
    const [key, label, value, style] = row;
    const c = copy(key);
    const r = b.add([
      { v: label, s: 'lbl' },
      { v: typeof value === 'number' && Number.isFinite(value) ? value : null, s: style || 'in' },
      { v: c.what || '', s: 'note' },
      { v: c.how || '', s: 'note' },
      { v: c.origin || c.originText?.() || '', s: 'note' },
    ]);
    at.set(key, r);
  }
  return { sheet: b.pack([260, 90, 260, 360, 320]), at };
}

function capitalAssumptionRows(a) {
  const overrun = 1 + (a.costOverrunPct ?? 0);
  return [
    ['constructionYears', 'Construction years', a.constructionYears, 'innum'],
    ['costOverrunPct', 'Cost overrun', a.costOverrunPct, 'inpct'],
    ['phase1Spend', 'Phase 1 spend', a.phase1Spend, 'in'],
    ['phase2Spend', 'Phase 2 spend', a.phase2Spend, 'in'],
    ['capacityUnits', 'Capacity units', a.capacityUnits, 'innum'],
    ['pricePerUnit', 'Price per unit', a.pricePerUnit, 'innum'],
    ['volumeGrowth', 'Volume growth', a.volumeGrowth, 'inpct'],
    ['variableCostPct', 'Variable cost (% revenue)', a.variableCostPct, 'inpct'],
    ['fixedOpex', 'Fixed opex (per year)', a.fixedOpex, 'in'],
    ['maintenanceCapex', 'Maintenance CapEx', a.maintenanceCapex, 'in'],
    ['debtPct', 'Debt funding %', a.debtPct, 'inpct'],
    ['equityInvested', 'Equity invested', a.equityInvested, 'in'],
    ['interestRate', 'Interest rate', a.interestRate, 'inpct'],
    ['amortYears', 'Debt amortization (years)', a.amortYears, 'innum'],
    ['taxRate', 'Tax rate', a.taxRate, 'inpct'],
    ['incentiveCredit', 'Incentive credit', a.incentiveCredit, 'in'],
    ['terminalValue', 'Terminal value', a.terminalValue, 'in'],
    ['hurdleRate', 'Hurdle rate', a.hurdleRate, 'inpct'],
    ['phase1SpendOverrun', 'Phase 1 (incl. overrun)', (a.phase1Spend ?? 0) * overrun, 'in'],
    ['phase2SpendOverrun', 'Phase 2 (incl. overrun)', (a.phase2Spend ?? 0) * overrun, 'in'],
  ];
}

function capitalScheduleSheet(model, at) {
  const b = sheetBuilder();
  const rows = model.rows;
  b.text(['Project schedule'], 'title');
  b.text(['US dollars. CapEx in construction years; revenue begins after construction.'], 'note');
  b.add([{ v: 'Line item', s: 'hdr' }, ...rows.map((r) => ({ v: `Y${r.year}`, s: 'hdr' }))]);

  const line = (label, formulas, cachedKey, style = 'calc', bold = false) =>
    unitLine(b, rows, label, formulas, cachedKey, style, bold);

  const buildYears = Math.max(1, Math.round(model.assumptions.constructionYears ?? 2));
  const r = {};
  r.capex = line(
    'CapEx',
    (i) => {
      const y = i + 1;
      if (y === 1) return `=-Assumptions!R${at.get('phase1SpendOverrun')}C2`;
      if (y === buildYears) return `=-Assumptions!R${at.get('phase2SpendOverrun')}C2`;
      return '=0';
    },
    'capex',
    'link'
  );
  r.revenue = line(
    'Revenue',
    (i) => {
      const y = i + 1;
      if (y <= buildYears) return '=0';
      return `=Assumptions!R${at.get('capacityUnits')}C2*Assumptions!R${at.get('pricePerUnit')}C2*(1+Assumptions!R${at.get('volumeGrowth')}C2)^(${y}-${buildYears})`;
    },
    'revenue',
    'link'
  );
  r.ebit = line(
    'EBIT',
    (i) => {
      const y = i + 1;
      if (y <= buildYears) return '=0';
      return `=R${r.revenue}C*(1-Assumptions!R${at.get('variableCostPct')}C2)-Assumptions!R${at.get('fixedOpex')}C2`;
    },
    'ebit'
  );
  r.projectFcf = line(
    'Project FCF',
    (i) => `=R${r.capex}C+R${r.ebit}C`,
    'projectFcf',
    'calc',
    true
  );

  return { sheet: b.pack([280, ...rows.map(() => 90)]), rows: r };
}

function returnsSummarySheet(returns, labels) {
  const b = sheetBuilder();
  b.text(['Returns summary'], 'title');
  b.add([{ v: 'Metric', s: 'hdr' }, { v: 'Value', s: 'hdr' }]);
  for (const [label, value, style] of labels) {
    b.add([
      { v: label, s: 'lbl' },
      { v: typeof value === 'number' && Number.isFinite(value) ? value : null, s: style || 'calcnum' },
    ]);
  }
  return b.pack([240, 120]);
}

export function buildCapitalWorkbook({ model, cards }) {
  const a = model.assumptions;
  const { sheet: assumptions, at } = exerciseAssumptionsSheet(
    'Capital project · construction, funding, and operations',
    'Blue cells are yours to change. Every other sheet reads them.',
    capitalAssumptionRows(a),
    cards
  );
  const schedule = capitalScheduleSheet(model, at);
  const ret = model.returns || {};
  const returns = returnsSummarySheet(ret, [
    ['Project IRR', ret.projectIrr, 'calcpct'],
    ['Equity IRR', ret.equityIrr, 'calcpct'],
    ['Project NPV', ret.projectNpv, 'calcnum'],
    ['Equity NPV', ret.equityNpv, 'calcnum'],
    ['Peak funding', ret.peakFunding, 'calcnum'],
    ['Payback (years)', ret.paybackYears, 'calcnum'],
  ]);

  return packXlsx([
    { name: 'Cover', ...exerciseCover('Capital project model', 'Construction CapEx, operating ramp, and project vs equity returns.') },
    { name: 'Assumptions', ...assumptions },
    { name: 'Schedule', ...schedule.sheet },
    { name: 'Returns', ...returns },
    { name: 'Checks', ...exerciseChecksSheet(model.checks) },
  ]);
}

function strategicAssumptionRows(a) {
  const rows = [
    ['hurdleRate', 'Hurdle rate', a.hurdleRate, 'inpct'],
    ['years', 'Forecast years', a.years, 'innum'],
    ['probabilityBuild', 'P(Build)', a.probabilityBuild, 'inpct'],
    ['probabilityBuy', 'P(Buy)', a.probabilityBuy, 'inpct'],
    ['probabilityPartner', 'P(Partner)', a.probabilityPartner, 'inpct'],
    ['probabilityLicense', 'P(License)', a.probabilityLicense, 'inpct'],
    ['probabilityLease', 'P(Lease)', a.probabilityLease, 'inpct'],
    ['probabilityDelay', 'P(Delay)', a.probabilityDelay, 'inpct'],
    ['probabilityNothing', 'P(Do nothing)', a.probabilityNothing, 'inpct'],
  ];
  for (const key of ['build', 'buy', 'partner', 'license', 'lease', 'delay', 'nothing']) {
    const alt = a[key] || {};
    rows.push([`${key}Capex`, `${key} — CapEx`, alt.capex, 'in']);
    rows.push([`${key}Opex`, `${key} — annual opex`, alt.opex, 'in']);
    rows.push([`${key}Revenue`, `${key} — revenue Y1`, alt.revenue, 'in']);
    rows.push([`${key}Growth`, `${key} — growth`, alt.growth, 'inpct']);
  }
  return rows;
}

function strategicAlternativesSheet(model) {
  const b = sheetBuilder();
  b.text(['Strategic alternatives'], 'title');
  b.add([
    { v: 'Alternative', s: 'hdr' },
    { v: 'NPV', s: 'hdr' },
    { v: 'Incremental NPV', s: 'hdr' },
    { v: 'Probability', s: 'hdr' },
    { v: 'Qualitative', s: 'hdr' },
  ]);
  for (const alt of model.alternatives) {
    b.add([
      { v: alt.label, s: 'lbl' },
      { v: Number.isFinite(alt.npv) ? alt.npv : null, s: 'calcnum' },
      { v: Number.isFinite(alt.incrementalNpv) ? alt.incrementalNpv : null, s: 'calcnum' },
      { v: alt.probability, s: 'inpct' },
      { v: alt.qualitativeScore, s: 'innum' },
    ]);
  }
  b.blank();
  b.add([
    { v: 'Expected NPV (probability-weighted)', s: 'lblb' },
    { v: Number.isFinite(model.expectedNpv) ? model.expectedNpv : null, s: 'calcb' },
  ]);
  return b.pack([200, 120, 120, 90, 90]);
}

export function buildStrategicWorkbook({ model, cards }) {
  const { sheet: assumptions } = exerciseAssumptionsSheet(
    'Strategic investment appraisal',
    'Blue cells are yours to change. Alternatives sheet shows NPV from the active case.',
    strategicAssumptionRows(model.assumptions),
    cards
  );
  return packXlsx([
    { name: 'Cover', ...exerciseCover('Strategic investment model', 'Build, buy, partner, and other alternatives vs do-nothing.') },
    { name: 'Assumptions', ...assumptions },
    { name: 'Alternatives', ...strategicAlternativesSheet(model) },
    { name: 'Checks', ...exerciseChecksSheet({ probabilitiesSum: model.checks?.probabilitiesSum }) },
  ]);
}

function marketAssumptionRows(a) {
  return [
    ['hurdleRate', 'Hurdle rate', a.hurdleRate, 'inpct'],
    ['years', 'Forecast years', a.years, 'innum'],
    ['addressableMarket', 'Addressable market', a.addressableMarket, 'in'],
    ['marketGrowth', 'Market growth', a.marketGrowth, 'inpct'],
    ['pricePremium', 'Price premium', a.pricePremium, 'inpct'],
    ['laborCost', 'Labor cost', a.laborCost, 'in'],
    ['rentCost', 'Rent', a.rentCost, 'in'],
    ['logisticsCost', 'Logistics', a.logisticsCost, 'in'],
    ['taxRate', 'Tax rate', a.taxRate, 'inpct'],
    ['withholdingPct', 'Withholding tax', a.withholdingPct, 'inpct'],
    ['tariffPct', 'Tariff', a.tariffPct, 'inpct'],
    ['incentivePct', 'Incentive', a.incentivePct, 'inpct'],
    ['localizationCost', 'Localization cost', a.localizationCost, 'in'],
    ['partnerShare', 'Partner share', a.partnerShare, 'inpct'],
    ['fxRate', 'FX rate (local per USD)', a.fxRate, 'innum'],
    ['countryRiskPremium', 'Country risk premium', a.countryRiskPremium, 'inpct'],
    ['rolloutYears', 'Rollout years', a.rolloutYears, 'innum'],
  ];
}

function marketStructuresSheet(model) {
  const b = sheetBuilder();
  b.text(['Entry structures'], 'title');
  b.add([{ v: 'Structure', s: 'hdr' }, { v: 'NPV (USD)', s: 'hdr' }, { v: 'Breakeven year', s: 'hdr' }]);
  for (const s of model.structures) {
    b.add([
      { v: s.label, s: 'lbl' },
      { v: Number.isFinite(s.npv) ? s.npv : null, s: 'calcnum' },
      { v: s.breakevenYear ?? null, s: 'innum' },
    ]);
  }
  return b.pack([200, 120, 100]);
}

function exerciseCover(title, blurb) {
  const b = sheetBuilder();
  b.text([title], 'title');
  b.text([blurb], 'note');
  b.blank();
  b.text(['How to read the colours'], 'lblb');
  b.add([{ v: 'Blue', s: 'in' }, { v: 'A number you typed. Change these on Assumptions.', s: 'lbl' }]);
  b.add([{ v: 'Black', s: 'calc' }, { v: 'A formula. Do not overwrite.', s: 'lbl' }]);
  b.add([{ v: 'Green', s: 'link' }, { v: 'A link to another sheet.', s: 'lbl' }]);
  return b.pack([200, 520]);
}

function exerciseChecksSheet(checks) {
  const b = sheetBuilder();
  b.text(['Checks'], 'title');
  if (checks?.probabilitiesSum != null) {
    b.add([
      { v: 'Scenario probabilities sum to 100%', s: 'lblb' },
      { v: checks.probabilitiesSum ? 'OK' : 'FAIL', s: checks.probabilitiesSum ? 'check' : 'lbl' },
    ]);
  }
  if (checks?.sourcesUses != null) {
    b.add([
      { v: 'Sources equal uses', s: 'lblb' },
      { v: checks.sourcesUses ? 'OK' : 'FAIL', s: checks.sourcesUses ? 'check' : 'lbl' },
    ]);
  }
  if (checks?.balances != null) {
    b.add([
      { v: 'Balance sheet ties', s: 'lblb' },
      { v: checks.balances ? 'OK' : 'FAIL', s: checks.balances ? 'check' : 'lbl' },
    ]);
  }
  return b.pack([280, 120]);
}

export function buildMarketWorkbook({ model, cards }) {
  const { sheet: assumptions } = exerciseAssumptionsSheet(
    `Market entry · ${model.assumptions.localCurrency} → ${model.assumptions.reportingCurrency}`,
    'Blue cells are yours to change. Structures sheet ranks entry modes.',
    marketAssumptionRows(model.assumptions),
    cards
  );
  return packXlsx([
    { name: 'Cover', ...exerciseCover('Market entry model', 'Regional sizing, entry structures, FX, and risk-adjusted returns.') },
    { name: 'Assumptions', ...assumptions },
    { name: 'Structures', ...marketStructuresSheet(model) },
    { name: 'Checks', ...exerciseChecksSheet({ fxIdentified: model.checks?.fxIdentified }) },
  ]);
}

export function exerciseWorkbookFilename(exercise, template) {
  if (exercise === 'unit') return template === 'blank' ? 'single-unit-model.xlsx' : 'lemonade-stall-model.xlsx';
  if (exercise === 'capital') return 'capital-project-model.xlsx';
  if (exercise === 'strategic') return 'strategic-investment-model.xlsx';
  if (exercise === 'market') return 'market-entry-model.xlsx';
  return 'financial-model.xlsx';
}

export function workbookFilename(company) {
  const ticker = String(company?.fortune_ticker || company?.sec_ticker || 'model').replace(/[^\w.-]/g, '');
  return `${ticker}-financial-model.xlsx`;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadWorkbook(filename, bytes) {
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

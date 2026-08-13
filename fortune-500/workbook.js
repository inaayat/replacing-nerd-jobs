/**
 * SpreadsheetML 2003 workbook (.xls Excel can open) for a practice model.
 * Browser-safe ESM — no zip, no npm. Formulas live in the Projection sheet.
 */

import { GOLDEN_RULES } from './playbooks.js';
import { assumptionFields, describeAssumption } from './model.js';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function dataCell(type, value) {
  if (value == null || value === '') return '<Cell/>';
  if (type === 'Number' && typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${esc(value)}</Data></Cell>`;
}

function formulaCell(formula, cached) {
  const cache =
    typeof cached === 'number' && Number.isFinite(cached)
      ? `<Data ss:Type="Number">${cached}</Data>`
      : '';
  return `<Cell ss:Formula="${esc(formula)}">${cache}</Cell>`;
}

function stringRow(values) {
  return `<Row>${values.map((v) => dataCell('String', v)).join('')}</Row>`;
}

function row(cells) {
  return `<Row>${cells.join('')}</Row>`;
}

function sheet(name, rowsXml) {
  return `<Worksheet ss:Name="${esc(name)}"><Table>${rowsXml}</Table></Worksheet>`;
}

function pct(n) {
  return Number.isFinite(n) ? n : '';
}

/**
 * The Assumptions sheet, built from the same field list as the on-screen guess
 * cards so the workbook and the page name and explain a guess identically.
 *
 * Returns the rows plus a key → row-number map: the Projection sheet's formulas
 * point at these cells, and hardcoding those numbers meant reordering a guess
 * silently repointed CapEx at R&D.
 *
 * The cards' "year-5 vs filed" sentence is deliberately left out — Excel
 * recalculates the projection, so a frozen sentence would start lying the first
 * time someone edits a cell. The Projection sheet is that answer, live.
 */
function assumptionsSheetRows({ company, headlines, assumptions, model, playbook }) {
  const rows = [];
  const rowOf = new Map();
  const add = (cells, key) => {
    rows.push(stringRow(cells));
    if (key) rowOf.set(key, rows.length);
  };

  const fy = headlines?.asOfYear ?? '';
  add(['Guess', 'Value (decimal)', 'What it is', 'Where the default came from']);
  add(['Company', company?.company || '']);
  add(['Ticker', company?.fortune_ticker || company?.sec_ticker || '']);
  add(['Industry', playbook?.label || '']);
  add(['Filed FY', fy]);
  add(['Filed revenue', headlines?.metrics?.revenue?.val ?? '', 'Year 0 of the projection, straight from the 10-K.', 'Locked — the sheet grows from here.']);

  for (const field of assumptionFields(playbook)) {
    const copy = describeAssumption(field, headlines, model, playbook);
    // Growth is the one cell the projection multiplies by, so it carries the
    // effective rate — industry drivers are already folded into it.
    const value =
      field.key === 'revenueGrowth'
        ? pct(model?.growth ?? assumptions?.revenueGrowth)
        : pct(field.isExtra ? assumptions?.extras?.[field.key] : assumptions?.[field.key]);
    add([copy.name, value, copy.what, copy.origin], field.key);
  }

  add([
    'ROA',
    pct(assumptions?.roa),
    'Net income as a share of assets. Banks earn on the balance sheet, so their projection uses this instead of a margin.',
    fy ? `Last year’s 10-K, FY${fy}.` : '',
  ], 'roa');
  add([]);
  add(['Change a value in column B and the Projection sheet recalculates.']);
  add(['Industry drivers are already inside the growth rate above; edit that cell to change the projection.']);

  return { rows: rows.join(''), rowOf };
}

/**
 * @param {{ company: object, headlines: object, assumptions: object, model: object, playbook: object }} opts
 */
export function buildWorkbookXml({ company, headlines, assumptions, model, playbook }) {
  const ticker = company?.fortune_ticker || company?.sec_ticker || '';
  const name = company?.company || '';
  const fy = headlines?.asOfYear ?? '';
  const filedRev = headlines?.metrics?.revenue?.val ?? '';
  const filedNi = headlines?.metrics?.net_income?.val ?? '';
  const filedFcf = headlines?.ratios?.fcf ?? '';
  const nm = assumptions?.netMargin;
  const fm = assumptions?.fcfMargin;
  const gm = assumptions?.grossMargin;

  // Golden rules live on the Industry sheet; printing them here too was the
  // same list twice in one file.
  const cover = [
    stringRow(['Fortune 500 practice model']),
    stringRow(['Company', name]),
    stringRow(['Ticker', ticker]),
    stringRow(['Fortune rank', company?.rank ?? '']),
    stringRow(['Industry', playbook?.label || 'Generic']),
    stringRow(['Scenario', assumptions?.scenario || 'base']),
    stringRow(['Source FY', fy ? `FY${fy} 10-K` : '']),
    stringRow([]),
    stringRow(['Year 0 is the filed 10-K. Every later year is a guess you made.']),
    stringRow(['Assumptions names and explains each guess; Projection is the answer.']),
  ].join('');

  const actuals = [
    stringRow(['Filed 10-K (year 0)', fy ? `FY${fy}` : '']),
    stringRow(['Line', 'USD', 'XBRL tag']),
    stringRow(['Revenue', filedRev, headlines?.metrics?.revenue?.tag || '']),
    stringRow(['Net income', filedNi, headlines?.metrics?.net_income?.tag || '']),
    stringRow(['Gross profit', headlines?.metrics?.gross_profit?.val ?? '', headlines?.metrics?.gross_profit?.tag || '']),
    stringRow(['Operating income', headlines?.metrics?.operating_income?.val ?? '', headlines?.metrics?.operating_income?.tag || '']),
    stringRow(['Assets', headlines?.metrics?.assets?.val ?? '', headlines?.metrics?.assets?.tag || '']),
    stringRow(['Equity', headlines?.metrics?.equity?.val ?? '', headlines?.metrics?.equity?.tag || '']),
    stringRow(['Operating cash flow', headlines?.metrics?.cfo?.val ?? '', headlines?.metrics?.cfo?.tag || '']),
    stringRow(['CapEx', headlines?.metrics?.capex?.val ?? '', headlines?.metrics?.capex?.tag || '']),
    stringRow(['R&D', headlines?.metrics?.rd?.val ?? '', headlines?.metrics?.rd?.tag || '']),
    stringRow(['FCF (CFO − CapEx)', filedFcf, 'computed']),
    stringRow([]),
    stringRow(['A blank cell means the tag was missing — not zero.']),
  ].join('');

  const { rows: assumptionsSheet, rowOf } = assumptionsSheetRows({
    company,
    headlines,
    assumptions,
    model,
    playbook,
  });
  const cell = (key) => `Assumptions!R${rowOf.get(key)}C2`;

  // Projection: row 2 is FY0 filed values; later rows are formulas off the
  // Assumptions cells above, so Excel recalculates when a guess is edited.
  const projHeader = stringRow(['Year', 'Revenue', 'Net income', 'FCF', 'Gross profit', 'CapEx', 'R&D', 'Rule of 40']);
  const projRows = (model?.rows || []).map((r, i) => {
    if (i === 0) {
      return row([
        dataCell('String', `FY${r.year} filed`),
        dataCell('Number', r.revenue),
        dataCell('Number', r.netIncome),
        dataCell('Number', r.fcf),
        dataCell('Number', r.grossProfit),
        dataCell('Number', r.capex),
        dataCell('Number', r.rd),
        dataCell('Number', r.ruleOf40),
      ]);
    }
    return row([
      dataCell('String', `FY${r.year}`),
      formulaCell(`=R[-1]C*(1+${cell('revenueGrowth')})`, r.revenue),
      nm == null ? dataCell('Number', r.netIncome) : formulaCell(`=RC2*${cell('netMargin')}`, r.netIncome),
      fm == null ? dataCell('Number', r.fcf) : formulaCell(`=RC2*${cell('fcfMargin')}`, r.fcf),
      gm == null ? dataCell('Number', r.grossProfit) : formulaCell(`=RC2*${cell('grossMargin')}`, r.grossProfit),
      assumptions?.capexIntensity == null
        ? dataCell('Number', r.capex)
        : formulaCell(`=RC2*${cell('capexIntensity')}`, r.capex),
      assumptions?.rdIntensity == null
        ? dataCell('Number', r.rd)
        : formulaCell(`=RC2*${cell('rdIntensity')}`, r.rd),
      fm == null
        ? dataCell('Number', r.ruleOf40)
        : formulaCell(`=${cell('revenueGrowth')}+${cell('fcfMargin')}`, r.ruleOf40),
    ]);
  });

  const projection = [
    projHeader,
    ...projRows,
    stringRow([]),
    stringRow(['Edit any guess on the Assumptions sheet — Excel recalculates these years.']),
  ].join('');

  const sens = model?.sensitivity;
  let sensitivity = stringRow(['Sensitivity: year-5 net income', `Growth down the side, net margin across. Center is your current drivers.`]);
  if (sens) {
    sensitivity += stringRow(['', ...sens.cols.map((c) => (Number.isFinite(c) ? `m ${(c * 100).toFixed(1)}%` : ''))]);
    for (const r of sens.rows) {
      sensitivity += row([
        dataCell('String', `g ${(r.growth * 100).toFixed(1)}%`),
        ...r.cells.map((c) => dataCell('Number', c)),
      ]);
    }
  }

  const listRows = (title, items) => [
    stringRow([title]),
    ...(items?.length ? items.map((item) => stringRow([item])) : [stringRow([''])]),
    stringRow([]),
  ];

  const industry = [
    stringRow([playbook?.label || 'Generic P&L']),
    stringRow([playbook?.subtitle || '']),
    stringRow([]),
    stringRow(['Why this industry is different']),
    stringRow([playbook?.intro || '']),
    stringRow([]),
    stringRow(['Core formula']),
    stringRow([playbook?.formula || '']),
    stringRow([]),
    stringRow(['Coach note']),
    stringRow([playbook?.quote || '']),
    stringRow([]),
    ...listRows('Key inputs', playbook?.inputs),
    ...listRows('Key metrics', playbook?.metrics),
    ...listRows('Sub-industries', playbook?.subs),
    stringRow(['Golden rules']),
    ...GOLDEN_RULES.map((rule, i) => stringRow([String(i + 1), rule])),
  ].join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheet('Cover', cover)}
${sheet('10-K actuals', actuals)}
${sheet('Assumptions', assumptionsSheet)}
${sheet('Projection', projection)}
${sheet('Sensitivity', sensitivity)}
${sheet('Industry', industry)}
</Workbook>`;
}

export function workbookFilename(company) {
  const ticker = String(company?.fortune_ticker || company?.sec_ticker || 'F500').replace(/[^\w.-]/g, '');
  return `${ticker}-practice-model.xls`;
}

export function downloadWorkbook(filename, xml) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

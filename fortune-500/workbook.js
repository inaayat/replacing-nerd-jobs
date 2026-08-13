/**
 * SpreadsheetML 2003 workbook (.xls Excel can open) for a practice model.
 * Browser-safe ESM — no zip, no npm. Formulas live in the Projection sheet.
 */

import { GOLDEN_RULES } from './playbooks.js';

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
 * @param {{ company: object, headlines: object, assumptions: object, model: object, playbook: object }} opts
 */
export function buildWorkbookXml({ company, headlines, assumptions, model, playbook }) {
  const ticker = company?.fortune_ticker || company?.sec_ticker || '';
  const name = company?.company || '';
  const fy = headlines?.asOfYear ?? '';
  const filedRev = headlines?.metrics?.revenue?.val ?? '';
  const filedNi = headlines?.metrics?.net_income?.val ?? '';
  const filedFcf = headlines?.ratios?.fcf ?? '';
  const g = model?.growth ?? assumptions?.revenueGrowth ?? 0;
  const nm = assumptions?.netMargin;
  const fm = assumptions?.fcfMargin;
  const gm = assumptions?.grossMargin;

  const cover = [
    stringRow(['Fortune 500 practice model']),
    stringRow(['Company', name]),
    stringRow(['Ticker', ticker]),
    stringRow(['Fortune rank', company?.rank ?? '']),
    stringRow(['Playbook', playbook?.label || 'Generic']),
    stringRow(['Scenario', assumptions?.scenario || 'base']),
    stringRow(['Source FY', fy ? `FY${fy} 10-K` : '']),
    stringRow(['Generated for practice — year 0 is filed; later years are assumptions.']),
    stringRow([]),
    stringRow(['Golden rules']),
    ...GOLDEN_RULES.map((rule, i) => stringRow([String(i + 1), rule])),
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

  const extraRows = (playbook?.extras || []).map((field) => {
    const val = assumptions?.extras?.[field.key];
    return stringRow([field.label, pct(val), field.help || '']);
  });

  const assumptionsSheet = [
    stringRow(['Driver', 'Value', 'Notes']),
    stringRow(['Company', name]),
    stringRow(['Ticker', ticker]),
    stringRow(['Playbook', playbook?.label || '']),
    stringRow(['Filed FY', fy]),
    stringRow(['Filed revenue', filedRev, 'Locked year-0 seed']),
    stringRow(['Revenue growth', pct(g), 'Decimal (0.05 = 5%). Projection uses this effective rate.']),
    stringRow(['Net margin', pct(nm), 'Decimal. Blank if not tagged.']),
    stringRow(['FCF margin', pct(fm), 'Decimal. Blank if CFO or CapEx missing.']),
    stringRow(['Gross margin', pct(gm), '']),
    stringRow(['Operating margin', pct(assumptions?.operatingMargin), '']),
    stringRow(['CapEx / sales', pct(assumptions?.capexIntensity), '']),
    stringRow(['R&D / sales', pct(assumptions?.rdIntensity), '']),
    stringRow(['ROA', pct(assumptions?.roa), 'Used for bank playbook NI.']),
    stringRow(['Industry extras', '', 'From this industry’s playbook. Change these, then copy implied growth into B7.']),
    ...extraRows,
  ].join('');

  // Projection: row 2 is FY0 values; rows 3+ formulas off Assumptions!B6 (rev) and B7 (growth), B8 (nm), B9 (fm)
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
      formulaCell('=R[-1]C*(1+Assumptions!R7C2)', r.revenue),
      nm == null ? dataCell('Number', r.netIncome) : formulaCell('=RC2*Assumptions!R8C2', r.netIncome),
      fm == null ? dataCell('Number', r.fcf) : formulaCell('=RC2*Assumptions!R9C2', r.fcf),
      gm == null ? dataCell('Number', r.grossProfit) : formulaCell('=RC2*Assumptions!R10C2', r.grossProfit),
      assumptions?.capexIntensity == null
        ? dataCell('Number', r.capex)
        : formulaCell('=RC2*Assumptions!R12C2', r.capex),
      assumptions?.rdIntensity == null ? dataCell('Number', r.rd) : formulaCell('=RC2*Assumptions!R13C2', r.rd),
      fm == null
        ? dataCell('Number', r.ruleOf40)
        : formulaCell('=Assumptions!R7C2+Assumptions!R9C2', r.ruleOf40),
    ]);
  });

  const projection = [projHeader, ...projRows, stringRow([]), stringRow(['Change growth in Assumptions!B7 or margins in B8/B9 — Excel will recalc this sheet.'])].join('');

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

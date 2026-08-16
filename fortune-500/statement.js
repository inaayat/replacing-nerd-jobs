/**
 * Statement view model: years across the top, line items down the side —
 * the way a 10-K excerpt or a comps workbook reads.
 *
 * Browser-safe ESM with no imports at all, so the filed pane, the practice
 * model, the compare scale block, and the tests share one row order. Values
 * come out as raw numbers (or null); formatting stays in the caller.
 *
 * A null cell means the tag was missing, never zero. Cash and debt have no
 * projection because this is not a balance-sheet model — those cells are
 * marked `na` instead of being extrapolated.
 */

/**
 * The statement, in filing order.
 * - `source`: 'metric' reads headlines.metrics[key].val, 'ratio' reads headlines.ratios[key]
 * - `modelKey`: field on a practice-model row; null means we don't project it
 * - `detail`: extra income-statement lines (R&D, CapEx) shown when the
 *   practice model is on; the UI always asks for them now that every guess
 *   is a card.
 */
export const STATEMENT_ROWS = [
  { key: 'revenue', label: 'Revenue', source: 'metric', modelKey: 'revenue' },
  { key: 'gross_profit', label: 'Gross profit', source: 'metric', modelKey: 'grossProfit' },
  { key: 'operating_income', label: 'Operating income', source: 'metric', modelKey: 'operatingIncome' },
  { key: 'net_income', label: 'Net income', source: 'metric', modelKey: 'netIncome' },
  { key: 'fcf', label: 'Free cash flow', source: 'ratio', modelKey: 'fcf' },
  { key: 'cash', label: 'Cash and cash equivalents', source: 'metric', modelKey: null },
  { key: 'long_term_debt', label: 'Long-term debt', source: 'metric', modelKey: null },
  { key: 'rd', label: 'R&D', source: 'metric', modelKey: 'rd', detail: true },
  { key: 'capex', label: 'CapEx', source: 'metric', modelKey: 'capex', detail: true },
];

/** Keys in statement order — the compare table's scale block uses this too. */
export const STATEMENT_KEYS = STATEMENT_ROWS.filter((r) => !r.detail).map((r) => r.key);

/** Percent check figures under the dollars, the way a model shows its drivers. */
export const DRIVER_ROWS = [
  { key: 'revenue_yoy', label: 'Revenue growth', of: 'revenue', kind: 'growth' },
  { key: 'gross_margin', label: 'Gross margin', of: 'gross_profit', kind: 'margin' },
  { key: 'operating_margin', label: 'Operating margin', of: 'operating_income', kind: 'margin' },
  { key: 'net_margin', label: 'Net margin', of: 'net_income', kind: 'margin' },
  { key: 'fcf_margin', label: 'FCF margin', of: 'fcf', kind: 'margin' },
];

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function numberOr(value) {
  return finite(value) ? value : null;
}

function fcfFrom(cfo, capex) {
  if (!finite(cfo) || !finite(capex)) return null;
  return capex < 0 ? cfo + capex : cfo - capex;
}

/** Latest filed value for one statement row. */
function filedValue(headlines, row) {
  if (row.source === 'ratio') return numberOr(headlines?.ratios?.[row.key]);
  return numberOr(headlines?.metrics?.[row.key]?.val);
}

/**
 * Prior-year filed value. `priorMetrics.values` is the slim map the snapshot
 * and the API carry; older payloads only have `priorRevenue`, so revenue still
 * gets its column and everything else stays honestly blank.
 */
function priorValue(headlines, row) {
  const values = headlines?.priorMetrics?.values;
  if (values) {
    if (row.key === 'fcf') return fcfFrom(numberOr(values.cfo), numberOr(values.capex));
    if (row.key in values) return numberOr(values[row.key]);
  }
  if (row.key === 'revenue') return numberOr(headlines?.priorRevenue?.val);
  return null;
}

export function priorYearOf(headlines) {
  const year = headlines?.priorMetrics?.year;
  if (Number.isInteger(year)) return year;
  const end = headlines?.priorRevenue?.end;
  const fromEnd = end ? Number(String(end).slice(0, 4)) : null;
  if (Number.isInteger(fromEnd)) return fromEnd;
  const asOf = headlines?.asOfYear;
  return Number.isInteger(asOf) ? asOf - 1 : null;
}

function hasPriorValues(headlines) {
  for (const row of STATEMENT_ROWS) {
    if (priorValue(headlines, row) != null) return true;
  }
  return false;
}

/**
 * Columns for a statement: the prior 10-K year (when we have it), the filed
 * year, then one column per projected year.
 */
export function statementColumns(headlines, { model = null, prior = true } = {}) {
  const columns = [];
  const filedYear = Number.isInteger(headlines?.asOfYear) ? headlines.asOfYear : null;
  if (prior && hasPriorValues(headlines)) {
    const year = priorYearOf(headlines);
    columns.push({ id: 'prior', kind: 'prior', year, label: year ? `FY${year}` : 'Prior FY' });
  }
  columns.push({
    id: 'filed',
    kind: 'filed',
    year: filedYear,
    label: filedYear ? `FY${filedYear}` : 'Filed FY',
    note: 'filed',
  });
  for (const row of model?.rows || []) {
    if (row.offset === 0) continue;
    columns.push({
      id: `y${row.offset}`,
      kind: 'projected',
      year: row.year,
      offset: row.offset,
      label: row.year ? `FY${row.year}` : `Y${row.offset}`,
      note: `Y${row.offset}`,
    });
  }
  return columns;
}

function cellFor(column, row, headlines, model) {
  if (column.kind === 'prior') return { kind: 'prior', value: priorValue(headlines, row) };
  if (column.kind === 'filed') return { kind: 'filed', value: filedValue(headlines, row) };
  if (!row.modelKey) return { kind: 'na', value: null };
  const projected = (model?.rows || []).find((r) => r.offset === column.offset);
  return { kind: 'projected', value: numberOr(projected?.[row.modelKey]) };
}

function driverCell(column, driver, dollars, revenueRow) {
  const value = dollars.get(driver.of)?.[column.id];
  const revenue = revenueRow?.[column.id];
  if (driver.kind === 'growth') {
    const idx = driver.prevColumnId;
    const prev = idx ? revenueRow?.[idx] : null;
    if (!finite(prev) || !prev || !finite(revenue)) return { kind: column.kind, value: null };
    return { kind: column.kind, value: revenue / prev - 1 };
  }
  if (!finite(value) || !finite(revenue) || !revenue) return { kind: column.kind, value: null };
  return { kind: column.kind, value: value / revenue };
}

/**
 * @param {object} headlines extracted 10-K headlines
 * @param {object} [opts]
 * @param {object} [opts.model] result of runPracticeModel (adds projected columns)
 * @param {boolean} [opts.detail] include the extra income-statement lines
 * @param {boolean} [opts.prior] include the prior filed year column
 * @param {boolean} [opts.projectedRowsOnly] drop lines this model never projects
 *   (cash, long-term debt), so the practice pane isn't half rows of n/a
 * @param {boolean} [opts.drivers] include the percent check figures underneath.
 *   Off on the practice pane, where those percentages are the guess cards
 *   sitting beside the statement.
 * @returns {{columns: object[], rows: object[], driverRows: object[], hasPrior: boolean, notes: string[]}}
 */
export function buildStatement(
  headlines,
  { model = null, detail = false, prior = true, projectedRowsOnly = false, drivers = true } = {}
) {
  const columns = statementColumns(headlines, { model, prior });
  const wanted = STATEMENT_ROWS.filter(
    (row) => (detail || !row.detail) && (!projectedRowsOnly || row.modelKey)
  );
  const dollars = new Map();

  const rows = wanted.map((row) => {
    const cells = columns.map((column) => cellFor(column, row, headlines, model));
    const byColumn = {};
    columns.forEach((column, i) => {
      byColumn[column.id] = cells[i].value;
    });
    dollars.set(row.key, byColumn);
    return {
      key: row.key,
      label: row.label,
      source: row.source,
      detail: Boolean(row.detail),
      projected: Boolean(row.modelKey),
      cells,
      empty: cells.every((cell) => cell.value == null),
    };
  });

  const revenueRow = dollars.get('revenue');
  const wantedDrivers = drivers ? DRIVER_ROWS.filter((driver) => dollars.has(driver.of)) : [];
  const driverRows = wantedDrivers.map((driver) => {
    const cells = columns.map((column, i) => {
      const prevColumnId = i > 0 ? columns[i - 1].id : null;
      return driverCell(column, { ...driver, prevColumnId }, dollars, revenueRow);
    });
    return {
      key: driver.key,
      label: driver.label,
      kind: driver.kind,
      cells,
      empty: cells.every((cell) => cell.value == null),
    };
  });

  const notes = [];
  const hasPrior = columns.some((c) => c.kind === 'prior');
  if (!hasPrior) notes.push('Only the latest 10-K year is in this snapshot, so there is no prior-year column yet.');
  if (model && rows.some((row) => !row.projected)) {
    notes.push('Cash and long-term debt are filed only — this projects the income statement, not a balance sheet.');
  }
  return { columns, rows, driverRows, hasPrior, notes };
}

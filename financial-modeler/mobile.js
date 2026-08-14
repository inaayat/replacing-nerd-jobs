/**
 * Phone walkthrough for Financial Modeler. Display-only: the engine still
 * runs the full five-year model. The web workspace in app.js is unchanged —
 * this module builds a one-assumption / one-statement view and is only
 * mounted when the viewport is narrow.
 *
 * Browser-safe ESM (no `node:` imports). Tests import the helpers below.
 */

export const MOBILE_MQ = '(max-width: 900px)';
export const MOBILE_FORECAST_YEARS = 3;

export const WEB_ONLY_FEATURES = [
  { id: 'excel', label: 'Excel download' },
  { id: 'dcf', label: 'DCF valuation' },
  { id: 'comps', label: 'Trading comps' },
  { id: 'scenarios', label: 'Scenario manager' },
  { id: 'sensitivity', label: 'Sensitivity and goal seek' },
  { id: 'five-year', label: 'Full five-year forecast' },
  { id: 'all-statements', label: 'All three statements on one screen' },
  { id: 'all-assumptions', label: 'Every assumption at once' },
];

export const STATEMENT_PAGES = [
  {
    id: 'income',
    label: 'Income',
    title: 'Income statement',
    hintKind: 'ni',
    hintArrow: '→',
    hint: 'Net income feeds cash flow and equity.',
  },
  {
    id: 'cash',
    label: 'Cash flow',
    title: 'Cash flow statement',
    hintKind: 'cash',
    hintArrow: '→',
    hint: 'The net change in cash becomes the balance-sheet plug.',
  },
  {
    id: 'balance',
    label: 'Balance sheet',
    title: 'Balance sheet',
    hintKind: 'interest',
    hintArrow: '↑',
    hint: 'Cash and debt set next year’s interest. The check row must be zero.',
  },
];

export function isMobileUi(media = globalThis.matchMedia) {
  if (typeof media !== 'function') return false;
  try {
    return Boolean(media(MOBILE_MQ)?.matches);
  } catch {
    return false;
  }
}

export function clampIndex(index, length) {
  if (!length) return 0;
  const n = Number(index);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.trunc(n), length - 1));
}

export function statementPage(id) {
  return STATEMENT_PAGES.find((p) => p.id === id) || STATEMENT_PAGES[0];
}

export function mobileModelPages(kind) {
  if (kind === 'capital-project') {
    return [{ id: 'schedule', label: 'Schedule', title: 'Project schedule', hintKind: 'ni', hintArrow: '→', hint: 'Three years of the project. The rest of the life is on the web version.' }];
  }
  if (kind === 'strategic') {
    return [{ id: 'alts', label: 'Alternatives', title: 'Alternatives', hintKind: 'ni', hintArrow: '→', hint: 'Incremental NPV versus do-nothing. Full appraisal is on the web version.' }];
  }
  if (kind === 'market-entry') {
    return [{ id: 'structures', label: 'Structures', title: 'Entry structures', hintKind: 'ni', hintArrow: '→', hint: 'Preferred structure on this phone view. Regional detail is on the web version.' }];
  }
  return STATEMENT_PAGES;
}

/**
 * Keep the filed year (offset 0) plus `forecastYears` projections, or the
 * first `forecastYears` rows when there is no filed column (unit / capital).
 * Never mutates the engine rows.
 */
export function truncateModelRows(rows, forecastYears = MOBILE_FORECAST_YEARS) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const years = Number.isInteger(forecastYears) && forecastYears > 0 ? forecastYears : MOBILE_FORECAST_YEARS;
  const hasFiled = rows[0]?.filed === true || rows[0]?.offset === 0;
  const keep = hasFiled ? years + 1 : years;
  return rows.slice(0, Math.min(keep, rows.length));
}

export function columnLabel(row, { unitKind = false } = {}) {
  if (!row) return '—';
  if (unitKind) return `Y${row.year ?? ''}`;
  const y = row.year ?? '';
  return `FY${y}${row.filed ? 'A' : 'E'}`;
}

export function yearRangeNote(rows, { unitKind = false, totalForecast = 5 } = {}) {
  if (!rows?.length) return 'Three-year view.';
  const first = columnLabel(rows[0], { unitKind });
  const last = columnLabel(rows[rows.length - 1], { unitKind });
  const hasFiled = rows[0]?.filed === true || rows[0]?.offset === 0;
  const shownForecast = hasFiled ? Math.max(0, rows.length - 1) : rows.length;
  if (shownForecast >= totalForecast) return `Showing ${first}–${last}.`;
  return `Showing ${first}–${last}. Years ${shownForecast + 1}–${totalForecast} are on the web version.`;
}

export function formatMobileCell(value, { scale = 1e6, fmt } = {}) {
  if (value == null || !Number.isFinite(value)) return null;
  if (fmt === 'qty') return Math.round(value).toLocaleString('en-US');
  if (fmt === 'raw') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  const n = value / scale;
  const digits = scale === 1 && Math.abs(n) < 100 ? 2 : 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function line(rows, label, key, extra = {}) {
  return {
    label,
    key,
    total: Boolean(extra.total),
    cls: extra.cls || '',
    fmt: extra.fmt,
    values: rows.map((r) => r[key]),
  };
}

export function linesForStatement(model, statementId) {
  const rows = model?.rows;
  if (!Array.isArray(rows) || !rows.length) return [];
  const unitKind = model.kind === 'unit' || model.kind === 'single-unit';
  const hasGross = model.assumptions?.grossMargin != null || unitKind;

  if (statementId === 'schedule' && model.kind === 'capital-project') {
    return [
      line(rows, 'CapEx', 'capex'),
      line(rows, 'Revenue', 'revenue'),
      line(rows, 'EBIT', 'ebit'),
      line(rows, 'Project FCF', 'projectFcf', { total: true }),
    ];
  }

  if (statementId === 'income') {
    return [
      ...(unitKind ? [line(rows, 'Transactions', 'transactions', { fmt: 'qty' })] : []),
      line(rows, 'Revenue', 'revenue'),
      ...(hasGross
        ? [line(rows, 'Cost of sales', 'cogs'), line(rows, 'Gross profit', 'grossProfit', { total: true })]
        : []),
      ...(unitKind
        ? [line(rows, 'Labor', 'labor'), line(rows, 'Other operating costs', 'otherOpex')]
        : [line(rows, 'Operating expenses', 'opex')]),
      line(rows, 'Operating income (EBIT)', 'ebit', { total: true }),
      line(rows, 'Interest expense', 'interestExpense', { cls: 'fm-link-interest' }),
      line(rows, 'Interest income', 'interestIncome', { cls: 'fm-link-interest' }),
      line(rows, 'Taxes', 'taxes'),
      line(rows, 'Net income', 'netIncome', { total: true, cls: 'fm-link-ni' }),
    ];
  }

  if (statementId === 'cash') {
    return [
      line(rows, 'Net income', 'netIncome', { cls: 'fm-link-ni' }),
      unitKind
        ? { label: 'Add back depreciation', key: 'da', cls: '', values: rows.map((r) => r.daAddBack) }
        : line(rows, 'Add back depreciation', 'da'),
      ...(unitKind
        ? [
            line(rows, 'Receivables (use) / source', 'deltaAr'),
            line(rows, 'Inventory (use) / source', 'deltaInv'),
            line(rows, 'Payables source / (use)', 'deltaAp'),
          ]
        : []),
      line(rows, 'Cash from operations', 'cfo', { total: true }),
      line(rows, 'Capital expenditure', 'capex'),
      line(rows, 'Debt repayment', 'debtRepayment'),
      line(rows, 'Dividends', 'dividends'),
      line(rows, 'Net change in cash', 'netChangeCash', { total: true, cls: 'fm-link-cash' }),
    ];
  }

  if (statementId === 'balance') {
    return [
      line(rows, 'Cash (the plug)', 'cash', { cls: 'fm-link-cash' }),
      line(rows, 'Accounts receivable', 'receivables'),
      line(rows, 'Inventory', 'inventory'),
      line(rows, unitKind ? 'Equipment (net)' : 'Other assets (PP&E, goodwill, untagged)', 'otherAssets'),
      line(rows, 'Total assets', 'totalAssets', { total: true }),
      line(rows, 'Debt', 'debt', { cls: 'fm-link-interest' }),
      line(rows, unitKind ? 'Payables (the grocer)' : 'Other liabilities', 'otherLiabilities'),
      line(rows, 'Shareholders’ equity', 'equity', { cls: 'fm-link-ni' }),
      line(rows, 'Total liabilities & equity', 'totalLiabEquity', { total: true }),
      { label: 'Check — should be zero', key: 'balanceCheck', total: true, values: rows.map((r) => r.balanceCheck) },
    ];
  }

  return [];
}

export function walkableDials(dials, valueOf) {
  if (!Array.isArray(dials)) return [];
  return dials.filter((d) => {
    if (d?.fmt === 'bool' || d?.fmt === 'raw') return d.fmt === 'bool';
    const v = valueOf ? valueOf(d) : d.value;
    return v != null && Number.isFinite(v);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function webOnlyListHtml() {
  return WEB_ONLY_FEATURES.map((f) => `<li>${escapeHtml(f.label)}</li>`).join('');
}

function stepperDots(dials, activeIndex) {
  return dials
    .map(
      (d, i) =>
        `<button type="button" class="fm-m-dot${i === activeIndex ? ' is-active' : ''}" data-assump-index="${i}" aria-label="${escapeHtml(d.name)}" aria-current="${i === activeIndex ? 'step' : 'false'}"></button>`
    )
    .join('');
}

function statementTabs(pages, activeId) {
  return pages
    .map(
      (p) =>
        `<button type="button" class="fm-m-stmt-tab" data-statement="${escapeHtml(p.id)}" aria-pressed="${p.id === activeId}">${escapeHtml(p.label)}</button>`
    )
    .join('');
}

function tableHtml(columns, lines, { scale, unitLabel }) {
  const head = `<thead><tr><th>${escapeHtml(unitLabel)}</th>${columns
    .map((c) => `<th class="${c.filed ? 'fm-col-actual' : ''}">${escapeHtml(c.label)}</th>`)
    .join('')}</tr></thead>`;
  const body = lines
    .map((lineRow) => {
      const cells = lineRow.values
        .map((v, i) => {
          const text = lineRow.fmt === 'raw' ? (v == null ? null : String(v)) : formatMobileCell(v, { scale, fmt: lineRow.fmt });
          const col = columns[i];
          return `<td class="${text == null ? 'fm-blank' : col?.filed ? 'fm-actual' : 'fm-forecast'}">${text == null ? '—' : escapeHtml(text)}</td>`;
        })
        .join('');
      const cls = [lineRow.total ? 'fm-total' : '', lineRow.cls || ''].filter(Boolean).join(' ');
      return `<tr class="${cls}"><td>${escapeHtml(lineRow.label)}</td>${cells}</tr>`;
    })
    .join('');
  return `<div class="fm-scroll fm-m-table-wrap"><table class="fm-table fm-m-table">${head}<tbody>${body}</tbody></table></div>`;
}

function valueControls(dial) {
  if (!dial) return '';
  if (dial.disabled) {
    return `<p class="fm-m-missing">This filing doesn’t tag this line, so there is nothing to edit — the model leaves it blank rather than invent a number.</p>`;
  }
  if (dial.fmt === 'bool') {
    const on = Boolean(dial.boolValue);
    return `<div class="fm-m-bool" role="group" aria-label="${escapeHtml(dial.name)}">
      <button type="button" data-bool="false" aria-pressed="${!on}">Off</button>
      <button type="button" data-bool="true" aria-pressed="${on}">On</button>
    </div>`;
  }
  return `<div class="fm-m-value">
    <button type="button" class="fm-m-nudge" data-nudge="-1" aria-label="Decrease ${escapeHtml(dial.name)}">−</button>
    <input class="fm-m-input" type="text" inputmode="decimal" enterkeyhint="done" value="${escapeHtml(dial.valueText)}" aria-label="${escapeHtml(dial.name)} value" data-mobile-input="1" />
    <button type="button" class="fm-m-nudge" data-nudge="1" aria-label="Increase ${escapeHtml(dial.name)}">+</button>
  </div>`;
}

function altTableHtml(headers, rows) {
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="fm-scroll fm-m-table-wrap"><table class="fm-table fm-m-table">${head}<tbody>${body}</tbody></table></div>`;
}

/**
 * Build the phone workspace HTML. `view` is assembled by app.js so this file
 * never reads page state.
 */
export function renderMobileHtml(view) {
  if (view?.error) {
    return `<div class="fm-m-shell">
      ${chromeHtml(view)}
      <section class="fm-m-card"><h2>Not enough filed data</h2><p>${escapeHtml(view.error)}</p></section>
    </div>`;
  }

  const dials = view.dials || [];
  const idx = clampIndex(view.assumptionIndex, dials.length);
  const dial = dials[idx];
  const pages = view.pages || STATEMENT_PAGES;
  const page = pages.find((p) => p.id === view.statementId) || pages[0] || STATEMENT_PAGES[0];
  const unitKind = Boolean(view.unitKind);
  const rows = view.rows || [];
  const columns = rows.map((r) => ({
    label: columnLabel(r, { unitKind }),
    filed: Boolean(r.filed),
  }));
  const scale = view.scale ?? 1e6;
  const unitLabel = view.unitLabel || 'US$ millions';

  let body;
  if (page.id === 'alts' && view.altRows) {
    body = altTableHtml(['Alternative', 'NPV', 'Incremental'], view.altRows);
  } else if (page.id === 'structures' && view.structureRows) {
    body = altTableHtml(['Structure', 'NPV', 'Breakeven'], view.structureRows);
  } else {
    const lines = linesForStatement({ ...view.model, rows, assumptions: view.assumptions, kind: view.kind }, page.id);
    body = tableHtml(columns, lines, { scale, unitLabel });
  }

  const warn = dial?.warn ? `<p class="fm-m-warn">${escapeHtml(dial.warn)}</p>` : '';
  const origin = dial?.origin ? `<p class="fm-m-origin"><span>${escapeHtml(dial.token || 'assumption')}</span> ${escapeHtml(dial.origin)}</p>` : '';
  const effect = dial?.effect ? `<p class="fm-m-effect">${escapeHtml(dial.effect)}</p>` : '';

  return `<div class="fm-m-shell">
    ${chromeHtml(view)}
    <section class="fm-m-card fm-m-assump" aria-label="Assumptions">
      ${
        view.unitTemplate
          ? `<div class="fm-m-templates" role="group" aria-label="Unit template">
        <button type="button" data-unit-template="lemonade" aria-pressed="${view.unitTemplate === 'lemonade'}">Lemonade example</button>
        <button type="button" data-unit-template="blank" aria-pressed="${view.unitTemplate === 'blank'}">Blank template</button>
      </div>`
          : ''
      }
      <div class="fm-m-assump-top">
        <p class="fm-m-kicker">Assumption ${dials.length ? idx + 1 : 0} of ${dials.length}</p>
        <div class="fm-m-dots" role="tablist" aria-label="Assumptions">${stepperDots(dials, idx)}</div>
      </div>
      ${
        dial
          ? `<h2>${escapeHtml(dial.name)}</h2>
            <p class="fm-m-what">${escapeHtml(dial.what || '')}</p>
            ${origin}
            ${valueControls(dial)}
            ${warn}
            ${effect}`
          : `<h2>No editable assumptions</h2><p class="fm-m-what">This filing left every driver blank. Open the web version if you still want the statements.</p>`
      }
      <div class="fm-m-assump-nav">
        <button type="button" class="fm-btn fm-btn-ghost" data-assump-delta="-1" ${idx <= 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="fm-btn" data-assump-delta="1" ${idx >= dials.length - 1 ? 'disabled' : ''}>Next</button>
      </div>
    </section>
    <section class="fm-m-card fm-m-model" aria-label="Model">
      <div class="fm-m-stmt-tabs" role="tablist" aria-label="Statements">${statementTabs(pages, page.id)}</div>
      <h3>${escapeHtml(page.title)}</h3>
      <p class="fm-m-year-note">${escapeHtml(view.yearNote || yearRangeNote(rows, { unitKind }))}</p>
      ${body}
      <div class="fm-handoff is-${escapeHtml(page.hintKind || 'ni')}">
        <span class="fm-handoff-arrow" aria-hidden="true">${escapeHtml(page.hintArrow || '→')}</span>
        <p>${escapeHtml(page.hint || '')}</p>
      </div>
      ${
        view.statusText
          ? `<p class="fm-m-check ${view.statusOk ? 'is-ok' : 'is-bad'}">${escapeHtml(view.statusText)}</p>`
          : ''
      }
    </section>
    ${webFooterHtml(view)}
  </div>`;
}

function chromeHtml(view) {
  return `<header class="fm-m-head">
    <div class="fm-m-head-row">
      <button type="button" class="fm-m-back" data-mobile-home="1">← Exercises</button>
      <p class="fm-m-status ${view.statusOk ? 'is-ok' : 'is-bad'}">${escapeHtml(view.statusChip || '')}</p>
    </div>
    <h1>${escapeHtml(view.title || 'Financial modeler')}</h1>
    <p class="fm-m-sub">${escapeHtml(view.subtitle || '')}</p>
  </header>
  <aside class="fm-m-webnote" aria-label="Web-only features">
    <p><strong>Phone walkthrough.</strong> One assumption at a time, three years, statements one by one. Open this page on a computer for the full model.</p>
  </aside>`;
}

function webFooterHtml(view) {
  const extra = view.webNote ? `<p>${escapeHtml(view.webNote)}</p>` : '';
  return `<footer class="fm-m-webfoot">
    <h3>On the web version</h3>
    <ul>${webOnlyListHtml()}</ul>
    ${extra}
    <p class="fm-m-webfoot-cta">Use a wider screen — or a computer — for DCF, comps, scenarios, and Excel.</p>
  </footer>`;
}

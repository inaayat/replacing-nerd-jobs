/**
 * Practice driver model: last 10-K as year 0, industry playbook drivers after that.
 * Browser-safe ESM. Missing XBRL stays blank. Not a 3-statement model or a DCF.
 */
import { extraDefaults, playbookById } from './playbooks.js';

export const MODEL_YEARS = 5;

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function num(headlines, key) {
  const p = headlines?.metrics?.[key];
  return p && finite(p.val) ? p.val : null;
}

export function defaultAssumptions(headlines) {
  const g = headlines?.ratios?.revenue_yoy;
  return {
    years: MODEL_YEARS,
    playbookId: 'generic',
    scenario: 'base',
    revenueGrowth: finite(g) ? g : 0.05,
    grossMargin: finite(headlines?.ratios?.gross_margin) ? headlines.ratios.gross_margin : null,
    operatingMargin: finite(headlines?.ratios?.operating_margin) ? headlines.ratios.operating_margin : null,
    netMargin: finite(headlines?.ratios?.net_margin) ? headlines.ratios.net_margin : null,
    fcfMargin: finite(headlines?.ratios?.fcf_margin) ? headlines.ratios.fcf_margin : null,
    capexIntensity: finite(headlines?.ratios?.capex_intensity) ? headlines.ratios.capex_intensity : null,
    rdIntensity: finite(headlines?.ratios?.rd_intensity) ? headlines.ratios.rd_intensity : null,
    roa: finite(headlines?.ratios?.roa) ? headlines.ratios.roa : null,
    extras: {},
  };
}

export function seedAssumptions(headlines, playbook) {
  const base = defaultAssumptions(headlines);
  const book = playbook || playbookById('generic');
  return {
    ...base,
    playbookId: book.id,
    extras: extraDefaults(book),
  };
}

export function applyScenario(assumptions, scenario) {
  const sign = scenario === 'bull' ? 1 : scenario === 'bear' ? -1 : 0;
  const bump = (v, delta) => (finite(v) ? v + sign * delta : v);
  const extras = { ...(assumptions.extras || {}) };
  for (const key of Object.keys(extras)) {
    if (key === 'nrr') extras[key] = bump(extras[key], 0.03);
    else extras[key] = bump(extras[key], 0.02);
  }
  return {
    ...assumptions,
    scenario,
    revenueGrowth: bump(assumptions.revenueGrowth, 0.02),
    netMargin: bump(assumptions.netMargin, 0.01),
    fcfMargin: bump(assumptions.fcfMargin, 0.01),
    operatingMargin: bump(assumptions.operatingMargin, 0.01),
    extras,
  };
}

export function impliedGrowth(assumptions, playbook) {
  const extra = assumptions?.extras || {};
  const kind = playbook?.growthKind || 'plain';
  if (kind === 'comp_unit' && finite(extra.compGrowth) && finite(extra.unitGrowth)) {
    return (1 + extra.compGrowth) * (1 + extra.unitGrowth) - 1;
  }
  if (kind === 'volume_price' && finite(extra.volumeGrowth) && finite(extra.priceGrowth)) {
    return (1 + extra.volumeGrowth) * (1 + extra.priceGrowth) - 1;
  }
  if (kind === 'nrr' && finite(extra.nrr) && finite(extra.newArrRate)) {
    return extra.nrr - 1 + extra.newArrRate;
  }
  if (kind === 'loan' && finite(extra.loanGrowth)) return extra.loanGrowth;
  if (
    kind === 'services' &&
    finite(extra.headcountGrowth) &&
    finite(extra.utilDelta) &&
    finite(extra.rateGrowth)
  ) {
    return (1 + extra.headcountGrowth) * (1 + extra.utilDelta) * (1 + extra.rateGrowth) - 1;
  }
  return finite(assumptions?.revenueGrowth) ? assumptions.revenueGrowth : 0;
}

export function effectiveGrowth(assumptions, playbook) {
  const implied = impliedGrowth(assumptions, playbook);
  return finite(implied) ? implied : finite(assumptions?.revenueGrowth) ? assumptions.revenueGrowth : 0;
}

function projectRows(headlines, assumptions, playbook) {
  const years = Number.isInteger(assumptions.years) && assumptions.years > 0 ? Math.min(10, assumptions.years) : MODEL_YEARS;
  const baseRev = num(headlines, 'revenue');
  const year0 = headlines?.asOfYear;
  if (!finite(baseRev) || year0 == null) {
    return { ok: false, reason: 'Need a tagged revenue figure for the latest 10-K year.' };
  }
  const growth = effectiveGrowth(assumptions, playbook);
  const gm = finite(assumptions.grossMargin) ? assumptions.grossMargin : null;
  const om = finite(assumptions.operatingMargin) ? assumptions.operatingMargin : null;
  const nm = finite(assumptions.netMargin) ? assumptions.netMargin : null;
  const fm = finite(assumptions.fcfMargin) ? assumptions.fcfMargin : null;
  const capexInt = finite(assumptions.capexIntensity) ? assumptions.capexIntensity : null;
  const rdInt = finite(assumptions.rdIntensity) ? assumptions.rdIntensity : null;
  const roa = finite(assumptions.roa) ? assumptions.roa : null;
  const baseAssets = num(headlines, 'assets');
  const useRoa = playbook?.niMode === 'roa' && finite(roa) && finite(baseAssets);

  const rows = [];
  let revenue = baseRev;
  let assets = baseAssets;
  for (let i = 0; i <= years; i += 1) {
    if (i > 0) {
      revenue *= 1 + growth;
      if (finite(assets)) assets *= 1 + growth;
    }
    const netIncome = useRoa ? assets * roa : nm == null ? null : revenue * nm;
    rows.push({
      year: year0 + i,
      offset: i,
      filed: i === 0,
      revenue,
      assets: finite(assets) ? assets : null,
      grossProfit: gm == null ? null : revenue * gm,
      operatingIncome: om == null ? null : revenue * om,
      netIncome,
      fcf: fm == null ? null : revenue * fm,
      capex: capexInt == null ? null : revenue * capexInt,
      rd: rdInt == null ? null : revenue * rdInt,
      ruleOf40: fm == null ? null : growth + fm,
    });
  }
  return { ok: true, years, growth, rows };
}

export function sensitivityGrid(headlines, assumptions, playbook, { yearsAhead = 5, metric = 'netIncome' } = {}) {
  const growth0 = effectiveGrowth(assumptions, playbook);
  const nm0 = finite(assumptions.netMargin) ? assumptions.netMargin : 0;
  const gDeltas = [-0.04, -0.02, 0, 0.02, 0.04];
  const mDeltas = assumptions.netMargin == null ? [0] : [-0.02, -0.01, 0, 0.01, 0.02];
  const cols = mDeltas.map((d) => nm0 + d);
  const rows = gDeltas.map((dg) => {
    const growth = growth0 + dg;
    const cells = mDeltas.map((dm) => {
      const trial = {
        ...assumptions,
        revenueGrowth: growth,
        netMargin: assumptions.netMargin == null ? null : nm0 + dm,
        extras: {},
      };
      const run = projectRows(headlines, trial, { ...playbook, growthKind: 'plain', niMode: playbook?.niMode });
      if (!run.ok) return null;
      const last = run.rows[Math.min(yearsAhead, run.rows.length - 1)];
      return last?.[metric] ?? null;
    });
    return { growth, cells };
  });
  return { metric, cols, rows, yearsAhead };
}

export function runPracticeModel(headlines, assumptions = {}, playbook) {
  const book = playbook || playbookById(assumptions.playbookId || 'generic');
  const projected = projectRows(headlines, assumptions, book);
  if (!projected.ok) return projected;
  const filed = projected.rows[0];
  const last = projected.rows[projected.rows.length - 1];
  const implied = impliedGrowth(assumptions, book);
  return {
    ok: true,
    playbook: book,
    year0: headlines?.asOfYear,
    growth: projected.growth,
    impliedGrowth: implied,
    growthFromExtras: Math.abs(implied - (assumptions.revenueGrowth || 0)) > 1e-9,
    rows: projected.rows,
    vsFiled: {
      revenue: last.revenue - filed.revenue,
      netIncome: filed.netIncome == null || last.netIncome == null ? null : last.netIncome - filed.netIncome,
      fcf: filed.fcf == null || last.fcf == null ? null : last.fcf - filed.fcf,
    },
    sensitivity: sensitivityGrid(headlines, assumptions, book),
    notes: [
      `Year 0 is the FY${headlines?.asOfYear} 10-K. Later years are your practice assumptions, not a SEC forecast.`,
      book.id !== 'generic' ? `Playbook: ${book.label}. Extra drivers follow this industry’s model.` : null,
      assumptions.netMargin == null && book.niMode !== 'roa' ? 'Net margin was not tagged, so profit stays blank.' : null,
      assumptions.fcfMargin == null ? 'FCF margin needs operating cash and CapEx. Missing either → FCF stays blank.' : null,
      'No share price in EDGAR, so this is not a DCF or a target price.',
    ].filter(Boolean),
  };
}

/** Back-compat wrapper used by older tests. */
export function runDriverModel(headlines, assumptions = {}) {
  return runPracticeModel(headlines, { ...defaultAssumptions(headlines), ...assumptions }, playbookById('generic'));
}

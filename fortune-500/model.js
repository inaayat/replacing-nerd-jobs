/**
 * Driver-based projection from a latest 10-K headline set.
 * Browser-safe ESM (no node: imports). Not a 3-statement model:
 * we only have one FY of tags, no share price, and missing XBRL stays blank.
 */

export const MODEL_YEARS = 5;

export function defaultAssumptions(headlines) {
  const g = headlines?.ratios?.revenue_yoy;
  return {
    years: MODEL_YEARS,
    revenueGrowth: Number.isFinite(g) ? g : 0.05,
    netMargin: Number.isFinite(headlines?.ratios?.net_margin) ? headlines.ratios.net_margin : null,
    fcfMargin: Number.isFinite(headlines?.ratios?.fcf_margin) ? headlines.ratios.fcf_margin : null,
  };
}

export function runDriverModel(headlines, assumptions = {}) {
  const years = Number.isInteger(assumptions.years) && assumptions.years > 0 ? Math.min(10, assumptions.years) : MODEL_YEARS;
  const baseRev = headlines?.metrics?.revenue?.val;
  const year0 = headlines?.asOfYear;
  if (typeof baseRev !== 'number' || !Number.isFinite(baseRev) || year0 == null) {
    return { ok: false, reason: 'Need a tagged revenue figure for the latest 10-K year.' };
  }

  const growth = Number.isFinite(assumptions.revenueGrowth) ? assumptions.revenueGrowth : 0;
  const netMargin = Number.isFinite(assumptions.netMargin) ? assumptions.netMargin : null;
  const fcfMargin = Number.isFinite(assumptions.fcfMargin) ? assumptions.fcfMargin : null;

  const rows = [];
  let revenue = baseRev;
  for (let i = 0; i <= years; i += 1) {
    if (i > 0) revenue *= 1 + growth;
    rows.push({
      year: year0 + i,
      offset: i,
      filed: i === 0,
      revenue,
      netIncome: netMargin == null ? null : revenue * netMargin,
      fcf: fcfMargin == null ? null : revenue * fcfMargin,
    });
  }

  return {
    ok: true,
    year0,
    growth,
    netMargin,
    fcfMargin,
    rows,
    notes: [
      'Year 0 is the filed 10-K. Later years apply your growth and margin assumptions — they are not a forecast from the SEC.',
      netMargin == null ? 'Net margin was not tagged, so profit is left blank instead of inventing 0%.' : null,
      fcfMargin == null ? 'FCF margin needs operating cash and CapEx. Missing either → FCF stays blank.' : null,
      'No share price in EDGAR, so this is not a DCF or a target price.',
    ].filter(Boolean),
  };
}

/**
 * Regional market entry analysis (Phase 8). Browser-safe ESM.
 */
import { npv, irr } from './returns.js';

function numberOr(v, f = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}

export const ENTRY_STRUCTURES = ['owned', 'franchise', 'license', 'jv', 'distributor', 'revshare'];

export const MARKET_DIAL_GROUPS = [
  { id: 'market', label: 'Market' },
  { id: 'cost', label: 'Local costs' },
  { id: 'fx', label: 'FX & risk' },
];

export const MARKET_DIALS = [
  { key: 'hurdleRate', group: 'fx', name: 'Hurdle rate', fmt: 'pct', min: 0.04, max: 0.3, step: 0.005, what: 'Base discount rate.', how: 'Before country risk premium.', originText: () => '14%.', effect: 'Structure NPV.' },
  { key: 'addressableMarket', group: 'market', name: 'Addressable market', fmt: 'usd', min: 0, max: 5_000_000_000, step: 1_000_000, what: 'Year-1 TAM in local currency.', how: 'Serviceable market size.', originText: () => '$500m.', effect: 'Revenue ramp.' },
  { key: 'marketGrowth', group: 'market', name: 'Market growth', fmt: 'pct', min: -0.1, max: 0.3, step: 0.01, what: 'TAM growth per year.', how: 'Compounds market size.', originText: () => '6%.', effect: 'Revenue.' },
  { key: 'pricePremium', group: 'market', name: 'Price premium', fmt: 'pct', min: -0.3, max: 0.5, step: 0.01, what: 'Pricing vs home market.', how: 'Applied to local revenue.', originText: () => '0%.', effect: 'Local revenue.' },
  { key: 'laborCost', group: 'cost', name: 'Labor cost', fmt: 'usd', min: 0, max: 100_000_000, step: 500_000, what: 'Annual local labor.', how: 'Fixed opex in local currency.', originText: () => '$12m.', effect: 'Structure NPV.' },
  { key: 'rentCost', group: 'cost', name: 'Rent', fmt: 'usd', min: 0, max: 50_000_000, step: 250_000, what: 'Occupancy cost.', how: 'Local currency.', originText: () => '$4m.', effect: 'Structure NPV.' },
  { key: 'logisticsCost', group: 'cost', name: 'Logistics', fmt: 'usd', min: 0, max: 50_000_000, step: 250_000, what: 'Supply chain cost.', how: 'Local currency.', originText: () => '$2m.', effect: 'Structure NPV.' },
  { key: 'taxRate', group: 'cost', name: 'Tax rate', fmt: 'pct', min: 0, max: 0.5, step: 0.01, what: 'Local corporate tax.', how: 'On positive profit.', originText: () => '25%.', effect: 'After-tax cash flow.' },
  { key: 'fxRate', group: 'fx', name: 'FX rate', fmt: 'num', min: 0.01, max: 50, step: 0.01, what: 'Local currency per USD.', how: 'Reporting conversion.', originText: () => '1.08 EUR/USD.', effect: 'USD NPV.' },
  { key: 'localizationCost', group: 'market', name: 'Localization cost', fmt: 'usd', min: 0, max: 50_000_000, step: 250_000, what: 'Up-front market entry spend.', how: 'Varies by structure.', originText: () => '$3m.', effect: 'Year-0 outflow.' },
  { key: 'partnerShare', group: 'market', name: 'Partner share', fmt: 'pct', min: 0, max: 0.9, step: 0.01, what: 'Revenue share to local partner.', how: 'JV / rev-share structures.', originText: () => '40%.', effect: 'Net cash to parent.' },
  { key: 'countryRiskPremium', group: 'fx', name: 'Country risk premium', fmt: 'pct', min: 0, max: 0.15, step: 0.005, what: 'Added to hurdle rate.', how: 'Sovereign / execution risk.', originText: () => '3%.', effect: 'Discount rate.' },
  { key: 'withholdingPct', group: 'fx', name: 'Withholding tax', fmt: 'pct', min: 0, max: 0.5, step: 0.01, what: 'Cash trapped locally.', how: 'On repatriated cash.', originText: () => '10%.', effect: 'USD cash flow.' },
];

export function defaultMarketEntryAssumptions() {
  return {
    years: 7,
    hurdleRate: 0.14,
    localCurrency: 'EUR',
    reportingCurrency: 'USD',
    fxRate: 1.08,
    fxVolatility: 0.05,
    addressableMarket: 500_000_000,
    marketGrowth: 0.06,
    pricePremium: 0,
    demandElasticity: -0.8,
    laborCost: 12_000_000,
    rentCost: 4_000_000,
    logisticsCost: 2_000_000,
    taxRate: 0.25,
    withholdingPct: 0.1,
    tariffPct: 0.05,
    incentivePct: 0.02,
    localizationCost: 3_000_000,
    partnerShare: 0.4,
    rolloutYears: 3,
    capacityRamp: [0.15, 0.35, 0.6, 0.85, 1, 1, 1],
    selectedStructure: 'owned',
    countryRiskPremium: 0.03,
  };
}

export function runMarketEntry(raw) {
  const a = { ...defaultMarketEntryAssumptions(), ...raw };
  const years = numberOr(a.years, 7);
  const hurdle = numberOr(a.hurdleRate, 0.14) + numberOr(a.countryRiskPremium, 0);
  const fx = numberOr(a.fxRate, 1);

  const structures = ENTRY_STRUCTURES.map((key) => {
    const share = key === 'jv' || key === 'revshare' ? numberOr(a.partnerShare, 0.4) : key === 'franchise' ? 0.08 : 0;
    const upfront = key === 'owned' ? numberOr(a.localizationCost, 0) * 2 : numberOr(a.localizationCost, 0) * 0.5;
    const flows = [-upfront];
    let shareOfMarket = 0;
    for (let y = 1; y <= years; y += 1) {
      const ramp = a.capacityRamp?.[y - 1] ?? 1;
      const tam = numberOr(a.addressableMarket, 0) * (1 + numberOr(a.marketGrowth, 0)) ** (y - 1);
      shareOfMarket = tam * ramp * 0.05;
      const revenueLocal = shareOfMarket * (1 + numberOr(a.pricePremium, 0));
      const opexLocal =
        numberOr(a.laborCost, 0) + numberOr(a.rentCost, 0) + numberOr(a.logisticsCost, 0);
      const tax = Math.max(0, revenueLocal - opexLocal) * numberOr(a.taxRate, 0.25);
      const partner = revenueLocal * share;
      const cfLocal = revenueLocal - opexLocal - tax - partner - revenueLocal * numberOr(a.withholdingPct, 0.1);
      flows.push(cfLocal * fx);
    }
    return {
      key,
      label: key,
      upfront,
      npv: npv(hurdle, flows),
      irr: irr(flows),
      breakevenYear: flows.findIndex((_, i) => i > 0 && flows.slice(0, i + 1).reduce((s, x) => s + x, 0) >= 0) || null,
      flows,
    };
  });

  const ranked = [...structures].sort((x, y) => (y.npv ?? -Infinity) - (x.npv ?? -Infinity));
  const selected = structures.find((s) => s.key === a.selectedStructure) || ranked[0];

  return {
    ok: true,
    kind: 'market-entry',
    scale: 1,
    unitLabel: 'US$',
    assumptions: a,
    structures,
    selected,
    preferredStructure: ranked[0]?.key ?? null,
    checks: { fxIdentified: Boolean(a.localCurrency && a.reportingCurrency) },
  };
}

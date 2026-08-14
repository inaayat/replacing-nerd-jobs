/**
 * Regional market entry analysis (Phase 8). Browser-safe ESM.
 */
import { npv, irr } from './returns.js';

function numberOr(v, f = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}

export const ENTRY_STRUCTURES = ['owned', 'franchise', 'license', 'jv', 'distributor', 'revshare'];

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

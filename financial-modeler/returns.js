/**
 * Deterministic return metrics for unit, project, and strategic models.
 * Browser-safe ESM — no imports.
 */

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** NPV of evenly spaced annual cash flows at rate r (first flow at t=1). */
export function npv(rate, cashFlows) {
  if (!finite(rate) || !Array.isArray(cashFlows) || !cashFlows.length) return null;
  let total = 0;
  for (let i = 0; i < cashFlows.length; i += 1) {
    const cf = cashFlows[i];
    if (!finite(cf)) return null;
    total += cf / (1 + rate) ** (i + 1);
  }
  return total;
}

/** IRR via bisection when sign changes; null if unreachable. */
export function irr(cashFlows, { min = -0.99, max = 5, tolerance = 1e-6, maxIter = 120 } = {}) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;
  const hasPos = cashFlows.some((c) => finite(c) && c > 0);
  const hasNeg = cashFlows.some((c) => finite(c) && c < 0);
  if (!hasPos || !hasNeg) return null;

  const f = (r) => {
    let total = 0;
    for (let i = 0; i < cashFlows.length; i += 1) {
      total += cashFlows[i] / (1 + r) ** (i + 1);
    }
    return total;
  };

  let lo = min;
  let hi = max;
  let flo = f(lo);
  let fhi = f(hi);
  if (!finite(flo) || !finite(fhi) || flo * fhi > 0) return null;

  for (let i = 0; i < maxIter; i += 1) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (!finite(fmid)) return null;
    if (Math.abs(fmid) < tolerance || (hi - lo) / 2 < tolerance) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Years until cumulative cash flow turns positive; null if never. */
export function paybackPeriod(cashFlows) {
  if (!Array.isArray(cashFlows) || !cashFlows.length) return null;
  let cumulative = 0;
  for (let i = 0; i < cashFlows.length; i += 1) {
    const cf = cashFlows[i];
    if (!finite(cf)) return null;
    const prev = cumulative;
    cumulative += cf;
    if (cumulative >= 0 && prev < 0) {
      const fraction = cf !== 0 ? (0 - prev) / cf : 0;
      return i + fraction;
    }
    if (cumulative >= 0 && prev >= 0 && i === 0) return 0;
    if (cumulative >= 0) return i + 1;
  }
  return null;
}

/** Average annual cash-on-cash on invested capital. */
export function cashOnCash(annualCash, investedCapital) {
  if (!finite(annualCash) || !finite(investedCapital) || investedCapital <= 0) return null;
  return annualCash / investedCapital;
}

/** Peak cumulative funding need (most negative cumulative cash). */
export function peakFunding(cashFlows) {
  if (!Array.isArray(cashFlows)) return null;
  let cumulative = 0;
  let peak = 0;
  for (const cf of cashFlows) {
    if (!finite(cf)) return null;
    cumulative += cf;
    peak = Math.min(peak, cumulative);
  }
  return peak < 0 ? -peak : 0;
}

/** Breakeven utilization given fixed + variable structure. */
export function breakevenUtilization({ capacity, fixedCosts, contributionPerTxn }) {
  if (!finite(capacity) || capacity <= 0) return null;
  if (!finite(contributionPerTxn) || contributionPerTxn <= 0) return null;
  if (!finite(fixedCosts)) return null;
  const txn = fixedCosts / contributionPerTxn;
  return Math.min(1, Math.max(0, txn / capacity));
}

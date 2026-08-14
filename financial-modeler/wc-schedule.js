/**
 * Working-capital component schedules (Phase 9). Browser-safe ESM.
 */

function numberOr(v, f = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}

/** AR, inventory, payables, deferred revenue from days/turnover assumptions. */
export function runWorkingCapitalSchedule({ revenue, cogs, years = 5, dsoDays = 45, dioDays = 30, dpoDays = 40, deferredRevPct = 0.05 }) {
  const rows = [];
  let prevAr = 0;
  let prevInv = 0;
  let prevAp = 0;
  let prevDef = 0;

  for (let i = 0; i < years; i += 1) {
    const rev = Array.isArray(revenue) ? numberOr(revenue[i], 0) : numberOr(revenue, 0) * (1.05 ** i);
    const cost = Array.isArray(cogs) ? Math.abs(numberOr(cogs[i], 0)) : rev * 0.6;
    const ar = (rev * numberOr(dsoDays, 0)) / 365;
    const inv = (cost * numberOr(dioDays, 0)) / 365;
    const ap = (cost * numberOr(dpoDays, 0)) / 365;
    const deferred = rev * numberOr(deferredRevPct, 0);
    const delta = ar - prevAr + inv - prevInv - (ap - prevAp) - (deferred - prevDef);
    rows.push({
      year: i + 1,
      receivables: ar,
      inventory: inv,
      payables: ap,
      deferredRevenue: deferred,
      wcUse: delta,
      wcSource: delta < 0,
    });
    prevAr = ar;
    prevInv = inv;
    prevAp = ap;
    prevDef = deferred;
  }

  return { ok: true, rows };
}

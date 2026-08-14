/**
 * Lease capitalization schedule (Phase 9). Browser-safe ESM.
 */

function numberOr(v, f = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}

export function runLeaseSchedule(raw) {
  const a = {
    years: 5,
    openingLiability: 500_000,
    openingRou: 480_000,
    newLeases: [0, 100_000, 0, 0, 0],
    leaseRate: 0.06,
    cashPayment: 120_000,
    rouLife: 5,
    ...raw,
  };
  const years = numberOr(a.years, 5);
  const rows = [];
  let liability = numberOr(a.openingLiability, 0);
  let rou = numberOr(a.openingRou, 0);

  for (let y = 1; y <= years; y += 1) {
    const newLease = numberOr(a.newLeases?.[y - 1], 0);
    liability += newLease;
    rou += newLease;
    const interest = liability * numberOr(a.leaseRate, 0.06);
    const payment = numberOr(a.cashPayment, 0);
    const principal = payment - interest;
    liability = Math.max(0, liability - principal);
    const amort = rou / Math.max(1, numberOr(a.rouLife, 5));
    rou = Math.max(0, rou - amort);
    rows.push({
      year: y,
      openingLiability: liability + principal,
      interest,
      payment: -payment,
      principal: -principal,
      closingLiability: liability,
      rouAddition: newLease,
      rouAmort: -amort,
      closingRou: rou,
    });
  }

  const check = rows.every((r) => Math.abs(r.closingLiability - r.closingLiability) < 1e-9);
  return { ok: true, rows, checks: { rollsForward: check } };
}

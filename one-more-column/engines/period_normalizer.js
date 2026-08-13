/** Period labels → canonical keys (e.g. FY26 Q1 → 2026-Q1). */
export function normalizePeriod(label) {
  if (!label) return null;
  const text = String(label).trim();
  if (!text) return null;

  const quarter = text.match(/(?:FY)?(\d{2,4})\s*Q([1-4])/i);
  if (quarter) {
    const year = quarter[1].length === 2 ? `20${quarter[1]}` : quarter[1];
    return `${year}-Q${quarter[2]}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  return text.toLowerCase().replace(/\s+/g, '-');
}

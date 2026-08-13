/**
 * Coerce a DATE / timestamptz / Date / ISO string to `YYYY-MM-DD`.
 * Neon sometimes returns DATE columns as Date objects; `String(date).slice(0, 10)`
 * is then `"Mon Aug 1"` and `toISOString()` on the resulting Invalid Date throws,
 * which Vercel surfaces as FUNCTION_INVOCATION_FAILED.
 */
export function isoDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Add calendar (wall-clock) days to an ISO date. Fractional days truncate via setUTCDate. */
export function addCalendarDays(isoDateValue, days) {
  const iso = isoDate(isoDateValue);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Add business days (Mon–Fri) to an ISO date.
 * Independent of working_days_per_week (that field is a capacity hours divisor,
 * not a calendar rule).
 */
export function addBusinessDays(isoDateValue, days) {
  const iso = isoDate(isoDateValue);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  let remaining = Math.round(Number(days));
  const step = remaining >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Review due from work due + policy offsets. */
export function computeReviewDue(workDue, policy = {}, override = null) {
  if (override) return isoDate(override);
  const due = isoDate(workDue);
  if (!due) return null;

  const lagDays = Number(policy.review_lag_days ?? 7);
  return addCalendarDays(due, lagDays);
}

/**
 * Materialize an ordered gate chain from an anchor date.
 * Each step's due date is previous due (or anchor for the first) + its duration.
 * Returns ordinary gate payloads: { label, dep_type, due_date }.
 */
export function materializeGateChain({ anchorDate, steps = [] }) {
  let cursor = isoDate(anchorDate);
  if (!cursor) return [];
  const result = [];

  for (const step of steps) {
    const duration = Number(step.duration_days ?? 1);
    const dayKind = step.day_kind === 'calendar' ? 'calendar' : 'business';
    const due =
      dayKind === 'calendar' ? addCalendarDays(cursor, duration) : addBusinessDays(cursor, duration);
    result.push({
      label: step.label || '',
      dep_type: step.dep_type || 'input_ready',
      due_date: due,
    });
    if (due) cursor = due;
  }

  return result;
}

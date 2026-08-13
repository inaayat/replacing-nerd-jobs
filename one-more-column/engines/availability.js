/**
 * Pure availability model: resource profiles minus time off → weekly capacity.
 */

/** Monday of the ISO week containing `date` (UTC). */
export function weekStart(date) {
  const d = toDate(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
}

export function formatWeekKey(date) {
  return toDate(date).toISOString().slice(0, 10);
}

export function addWeeks(date, weeks) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d;
}

export function enumerateWeeks(startDate, endDate) {
  const weeks = [];
  let cursor = weekStart(startDate);
  const end = toDate(endDate);
  while (cursor <= end) {
    weeks.push(formatWeekKey(cursor));
    cursor = addWeeks(cursor, 1);
  }
  return weeks;
}

export function enumerateDays(startDate, endDate) {
  const days = [];
  let cursor = toDate(startDate);
  const end = toDate(endDate);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return days;
  while (cursor <= end) {
    days.push(formatWeekKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function isWorkingDay(date, workingDaysPerWeek = 5) {
  const dow = toDate(date).getUTCDay();
  const days = Number(workingDaysPerWeek) || 5;
  if (days >= 7) return true;
  if (days <= 5) return dow !== 0 && dow !== 6;
  return dow !== 0;
}

function timeOffHoursOnDay(timeOffEntries, dayKey, dailyCapacity) {
  const day = toDate(dayKey);
  let deducted = 0;
  for (const entry of timeOffEntries || []) {
    const start = toDate(entry.start_date);
    const end = toDate(entry.end_date);
    if (day < start || day > end) continue;
    const perDay =
      entry.hours_per_day != null ? Number(entry.hours_per_day) : dailyCapacity;
    deducted += perDay;
  }
  return Math.min(deducted, dailyCapacity);
}

function profileForDate(profiles, date) {
  const target = toDate(date).getTime();
  const sorted = [...(profiles || [])].sort(
    (a, b) => toDate(b.effective_from).getTime() - toDate(a.effective_from).getTime(),
  );
  return sorted.find((p) => toDate(p.effective_from).getTime() <= target) || sorted.at(-1) || null;
}

function weeklyHoursForProfile(profile, policy) {
  if (!profile) return Number(policy?.weekly_capacity_default ?? 32);
  if (profile.weekly_hours != null) return Number(profile.weekly_hours);
  if (profile.daily_hours != null) {
    const days = Number(policy?.working_days_per_week ?? 5);
    return Number(profile.daily_hours) * days;
  }
  return Number(policy?.weekly_capacity_default ?? 32);
}

function timeOffHoursInWeek(timeOffEntries, weekKey, weeklyCapacity) {
  const weekStartDate = toDate(weekKey);
  const weekEndDate = addWeeks(weekStartDate, 1);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() - 1);

  let deducted = 0;
  for (const entry of timeOffEntries || []) {
    const start = toDate(entry.start_date);
    const end = toDate(entry.end_date);
    if (end < weekStartDate || start > weekEndDate) continue;

    const overlapStart = start > weekStartDate ? start : weekStartDate;
    const overlapEnd = end < weekEndDate ? end : weekEndDate;
    const days =
      Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
    const perDay =
      entry.hours_per_day != null
        ? Number(entry.hours_per_day)
        : weeklyCapacity / Number(entry.working_days_per_week ?? 5);
    deducted += days * perDay;
  }
  return Math.min(deducted, weeklyCapacity);
}

/**
 * @param {object[]} resources - { id, name, team, active, profiles[], time_off[] }
 * @param {string[]} weeks - ISO week-start dates
 * @param {object} policy - planning policy config
 * @returns {Map<string, Map<string, number>>} resourceId → weekKey → capacity hours
 */
export function computeWeeklyCapacity(resources, weeks, policy = {}) {
  const matrix = new Map();
  for (const resource of resources) {
    if (resource.active === false) continue;
    const weekMap = new Map();
    for (const weekKey of weeks) {
      const profile = profileForDate(resource.profiles, weekKey);
      const gross = weeklyHoursForProfile(profile, policy);
      const deducted = timeOffHoursInWeek(resource.time_off, weekKey, gross);
      weekMap.set(weekKey, Math.max(0, gross - deducted));
    }
    matrix.set(resource.id, weekMap);
  }
  return matrix;
}

/**
 * Daily capacity: weekly hours spread across working days, minus PTO on that day.
 */
export function computeDailyCapacity(resources, days, policy = {}) {
  const workingDays = Number(policy?.working_days_per_week ?? 5) || 5;
  const matrix = new Map();
  for (const resource of resources) {
    if (resource.active === false) continue;
    const dayMap = new Map();
    for (const dayKey of days) {
      if (!isWorkingDay(dayKey, workingDays)) {
        dayMap.set(dayKey, 0);
        continue;
      }
      const profile = profileForDate(resource.profiles, dayKey);
      const weekly = weeklyHoursForProfile(profile, policy);
      const daily = weekly / workingDays;
      const deducted = timeOffHoursOnDay(resource.time_off, dayKey, daily);
      dayMap.set(dayKey, Math.max(0, daily - deducted));
    }
    matrix.set(resource.id, dayMap);
  }
  return matrix;
}

/**
 * Local calendar dates.
 *
 * `new Date().toISOString().slice(0, 10)` returns the *UTC* date, which is
 * tomorrow's date for anyone in the Americas after ~7-8pm local. Since almost
 * every screening in this app is an evening one, that made the pre-filled date
 * wrong for a large slice of every day. Always build dates from local parts.
 */

/** Today in the viewer's own timezone, as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return toLocalISO(now);
}

/** A Date -> YYYY-MM-DD using local calendar parts, never a UTC shift. */
export function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First day of the local calendar month, as YYYY-MM-01. */
export function currentMonthISO(now = new Date()) {
  return `${todayISO(now).slice(0, 7)}-01`;
}

/** Local calendar date N months before today (or `now`), as YYYY-MM-DD. */
export function monthsBeforeISO(months, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return toLocalISO(d);
}

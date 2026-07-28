/** Parse A-List Tracking.xlsx (Movies sheet) into import JSON. */

export async function parseXlsxFile(file) {
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const ws = wb.Sheets.Movies;
  if (!ws) throw new Error('Movies sheet not found.');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const watches = [];

  for (const row of rows.slice(1)) {
    const date = toIsoDate(row[0]);
    const title = String(row[3] || '').trim();
    if (!date || !title) continue;

    const ratingRaw = row[10];
    const dnf = String(ratingRaw).toUpperCase() === 'DNF';
    watches.push({
      watched_on: date,
      title,
      location: String(row[4] || '').trim() || null,
      format: String(row[5] || '').trim(),
      saw_alone: String(row[6] || '').toUpperCase() === 'X',
      auditorium: cellText(row[7]),
      seat: cellText(row[8]),
      ticket_cents: moneyCents(row[9]),
      rating: dnf ? null : (Number(ratingRaw) || null),
      dnf,
    });
  }

  if (!watches.length) throw new Error('No movie rows found.');
  return watches;
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function cellText(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function moneyCents(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

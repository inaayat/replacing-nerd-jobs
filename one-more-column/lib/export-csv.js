/** CSV builders for plan and capacity export. */
export function capacityToCsv(grid) {
  const headers = ['person', 'team', ...grid.weeks.map((w) => `week_${w}`)];
  const lines = [headers.join(',')];

  for (const row of grid.rows || []) {
    const cells = row.weeks.map((c) => `${c.load}/${c.capacity}`);
    lines.push([csvCell(row.name), csvCell(row.team || ''), ...cells].join(','));
  }
  return lines.join('\n');
}

export function planToCsv(planItems) {
  const headers = ['unique_key', 'title', 'phase', 'work_hours', 'review_hours', 'due_week', 'source'];
  const lines = [headers.join(',')];
  for (const item of planItems) {
    lines.push(
      [
        csvCell(item.unique_key),
        csvCell(item.title),
        csvCell(item.phase),
        item.work_hours ?? 0,
        item.review_hours ?? 0,
        item.due_week ? String(item.due_week).slice(0, 10) : '',
        csvCell(item.source),
      ].join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

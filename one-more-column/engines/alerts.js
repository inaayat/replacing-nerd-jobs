/**
 * In-app alerts from Postgres-only data (overload, proximity, readiness).
 */
import { deriveEffortHours } from './effort.js';

export function computeAlerts({
  capacityGrid,
  planItems = [],
  readiness = [],
  dependencies = [],
  policy = {},
}) {
  const alerts = [];
  const proximityDays = Number(policy.alert_proximity_days ?? 14);
  const today = new Date().toISOString().slice(0, 10);
  const proximityEnd = addDays(today, proximityDays);

  for (const row of capacityGrid?.rows || []) {
    for (const cell of row.weeks || []) {
      if (cell.overloaded) {
        alerts.push({
          type: 'overload',
          severity: 'high',
          resource_id: row.resource_id,
          resource_name: row.name,
          team: row.team,
          week: cell.week,
          message: `${row.name} overloaded in week ${cell.week}: ${cell.load}h load vs ${cell.capacity}h capacity`,
          load: cell.load,
          capacity: cell.capacity,
        });
      } else if (cell.band === 'yellow') {
        alerts.push({
          type: 'tight_capacity',
          severity: 'medium',
          resource_id: row.resource_id,
          resource_name: row.name,
          team: row.team,
          week: cell.week,
          message: `${row.name} tight in week ${cell.week}: ${cell.remaining}h remaining`,
          remaining: cell.remaining,
        });
      }
    }
  }

  for (const item of planItems) {
    const due = item.due_week ? String(item.due_week).slice(0, 10) : null;
    if (due && due >= today && due <= proximityEnd) {
      const effort = deriveEffortHours(item.work_hours, item.review_hours, policy);
      alerts.push({
        type: 'due_proximity',
        severity: 'medium',
        plan_item_id: item.id,
        title: item.title,
        due_week: due,
        message: `"${item.title}" due week ${due} within ${proximityDays} days`,
        total_hours: effort.total_hours,
      });
    }
    if (due && due < today && Number(item.work_hours) > 0) {
      alerts.push({
        type: 'overdue',
        severity: 'high',
        plan_item_id: item.id,
        title: item.title,
        due_week: due,
        message: `"${item.title}" due week ${due} is in the past`,
      });
    }
  }

  for (const r of readiness || []) {
    if (r.blocked) {
      alerts.push({
        type: 'readiness_gap',
        severity: 'medium',
        plan_item_id: r.plan_item_id,
        title: r.title,
        message: `"${r.title}" blocked by ${(r.blockers || []).length} open gate(s)`,
        blockers: r.blockers,
      });
    }
  }

  const openDeps = dependencies.filter((d) => d.status === 'open' || d.status === 'blocked');
  for (const dep of openDeps) {
    const due = dep.meta?.due_date || dep.meta?.target_date;
    if (due && due >= today && due <= proximityEnd) {
      alerts.push({
        type: 'gate_proximity',
        severity: 'low',
        dependency_id: dep.id,
        label: dep.label || dep.dep_type,
        message: `Gate "${dep.label || dep.dep_type}" due ${due}`,
        due_date: due,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return alerts;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

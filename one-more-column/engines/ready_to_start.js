import { computeReviewDue, isoDate } from './date_policy.js';

/**
 * Readiness rules: aggregate predecessor gates → ready-to-start date.
 * Multiple predecessors → latest blocking date (max aggregation).
 */
function asMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) || {};
    } catch {
      return {};
    }
  }
  return meta;
}

export function computeReadyToStart(planItem, dependencies = [], policy = {}) {
  const attrs = planItem.attributes || {};
  const blockers = [];
  let readyDate = isoDate(attrs.evidence_due || attrs.ready_to_start);

  for (const dep of dependencies) {
    if (dep.status === 'waived') continue;

    const meta = asMeta(dep.meta);
    if (dep.status === 'met' && meta.met_date) {
      readyDate = maxDate(readyDate, isoDate(meta.met_date));
      continue;
    }

    if (dep.status === 'open' || dep.status === 'blocked') {
      const blockerDate = isoDate(meta.due_date || meta.target_date);
      blockers.push({
        id: dep.id,
        type: dep.dep_type,
        label: dep.label || dep.from_title || 'Dependency',
        due_date: blockerDate,
      });
      if (blockerDate) readyDate = maxDate(readyDate, blockerDate);
    }
  }

  if (!readyDate && planItem.due_week) {
    readyDate = isoDate(planItem.due_week);
  }

  const reviewDue = computeReviewDue(planItem.due_week, policy, attrs.review_due);

  return {
    ready_date: readyDate,
    review_due: reviewDue,
    blocked: blockers.some((b) => b.type !== 'external_flag'),
    blockers,
  };
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

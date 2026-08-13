/**
 * Payload builders for the autosave path.
 *
 * These are the exact bodies sent to the API for a single row. They are pure so
 * the shape — including the updated_at guard that makes a stale write fail
 * loudly instead of overwriting someone else's edit — can be tested without a
 * browser or a database.
 */

/** Guard value sent so the server can reject a write against a moved row. */
function guardOf(row) {
  return row.updated_at ?? null;
}

export function planItemPatch(item) {
  return {
    id: item.id,
    title: item.title ?? '',
    phase: item.phase || null,
    work_hours: Number(item.work_hours) || 0,
    due_week: item.due_week || null,
    attributes: item.attributes || {},
    updated_at: guardOf(item),
  };
}

export function dependencyPatch(dep) {
  return {
    id: dep.id,
    from_plan_item_id: dep.from_plan_item_id || null,
    dep_type: dep.dep_type,
    label: dep.label || null,
    status: dep.status,
    meta: dep.meta || {},
    updated_at: guardOf(dep),
  };
}

export function resourcePatch(resource) {
  return {
    id: resource.id,
    name: resource.name ?? '',
    team: resource.team || null,
    weekly_hours: Number(resource.profiles?.[0]?.weekly_hours) || null,
  };
}

export function taskTypePatch(type) {
  return {
    id: type.id,
    label: type.label,
    gate_templates: (type.gate_templates || []).map((s, i) => ({
      id: s.id,
      label: s.label,
      duration_days: Number(s.duration_days) || 1,
      day_kind: s.day_kind || 'business',
      dep_type: s.dep_type || 'input_ready',
      seq: i + 1,
    })),
    fields: (type.fields || []).map((f, i) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      field_type: f.field_type || 'text',
      options: f.field_type === 'select' ? f.options || [] : null,
      required: Boolean(f.required),
      seq: i + 1,
    })),
  };
}

/**
 * Policy config assembled from draft values, falling back to what is already
 * stored. Replaces reading the six threshold inputs back out of the DOM.
 */
export function policyConfig(draft, existing = {}, overrides = {}) {
  const num = (key, fallback) => {
    const raw = draft?.[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    ...existing,
    weekly_capacity_default: num('policy-weekly', existing.weekly_capacity_default ?? 32),
    review_ratio: num('policy-review', existing.review_ratio ?? 0.35),
    overload_threshold: num('policy-threshold', existing.overload_threshold ?? 1),
    alert_proximity_days: num('policy-proximity', existing.alert_proximity_days ?? 14),
    band_yellow_remaining: num('policy-yellow', existing.band_yellow_remaining ?? 8),
    review_floor_hours: num('policy-review-floor', existing.review_floor_hours ?? 0),
    ...overrides,
  };
}

/** Client-side mirror of the server slugify used for custom field keys. */
export function slugifyFieldKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

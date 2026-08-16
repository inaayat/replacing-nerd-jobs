/**
 * User-assigned XBRL tag → metric overrides (localStorage). Shared by the
 * Filings reference page, Financial Modeler, and Fortune 500 ratios page.
 * Browser-safe ESM — no Node APIs.
 */
import { ensureRatios, normalizeMetrics, computeRatios, sanityFlags } from '../fortune-500/extract.js';

export const STORAGE_KEY = 'fm-tag-overrides';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadAllOverrides() {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadOverridesForCik(cik) {
  const all = loadAllOverrides();
  const row = all[String(cik)];
  return row && typeof row === 'object' ? row : {};
}

export function saveOverride(cik, metricKey, point) {
  const store = storage();
  if (!store || cik == null || !metricKey || !point) return false;
  const all = loadAllOverrides();
  const key = String(cik);
  const row = { ...(all[key] || {}) };
  row[metricKey] = {
    taxonomy: point.taxonomy || 'us-gaap',
    tag: point.tag,
    val: point.val,
    unit: point.unit || 'USD',
    end: point.end || null,
    form: point.form || '10-K',
    fy: point.fy ?? null,
    filed: point.filed || null,
  };
  all[key] = row;
  store.setItem(STORAGE_KEY, JSON.stringify(all));
  return true;
}

export function clearOverride(cik, metricKey) {
  const store = storage();
  if (!store || cik == null || !metricKey) return false;
  const all = loadAllOverrides();
  const key = String(cik);
  const row = { ...(all[key] || {}) };
  if (!row[metricKey]) return false;
  delete row[metricKey];
  if (Object.keys(row).length) all[key] = row;
  else delete all[key];
  store.setItem(STORAGE_KEY, JSON.stringify(all));
  return true;
}

function metricIsBlank(metrics, key) {
  const p = metrics?.[key];
  return !(p && typeof p.val === 'number' && Number.isFinite(p.val));
}

function overridePoint(raw) {
  return {
    val: raw.val,
    unit: raw.unit || 'USD',
    start: null,
    end: raw.end || null,
    fy: raw.fy ?? null,
    fp: 'FY',
    form: raw.form || '10-K',
    filed: raw.filed || null,
    frame: null,
    tag: raw.tag,
    taxonomy: raw.taxonomy || 'us-gaap',
    override: true,
    source: 'your map',
  };
}

/**
 * Apply stored tag overrides onto a headlines payload. By default only fills
 * blank metrics; pass allowReplace to clobber an existing tagged value.
 */
export function applyTagOverrides(headlines, cik, { allowReplace = false } = {}) {
  if (!headlines?.metrics || cik == null) return headlines;
  const overrides = loadOverridesForCik(cik);
  if (!Object.keys(overrides).length) return headlines;

  const metrics = { ...headlines.metrics };
  let changed = false;
  for (const [metricKey, raw] of Object.entries(overrides)) {
    if (!raw || typeof raw.val !== 'number') continue;
    const blank = metricIsBlank(metrics, metricKey);
    if (!blank && !allowReplace) continue;
    metrics[metricKey] = overridePoint(raw);
    changed = true;
  }
  if (!changed) return headlines;

  normalizeMetrics(metrics, headlines.priorMetrics);
  const ratios = computeRatios(metrics, headlines.priorRevenue);
  return {
    ...headlines,
    metrics,
    ratios,
    flags: sanityFlags(metrics, ratios),
  };
}

/** ensureRatios + user tag overrides — use when loading snapshot rows. */
export function prepareHeadlines(row, cik) {
  if (!row) return row;
  const base = ensureRatios(row);
  const cikNum = cik ?? row.cik;
  return applyTagOverrides(base, cikNum);
}

/** Metric keys that are still blank after extraction (for “Use for…” menus). */
export function blankMetricKeys(headlines, keys) {
  const out = [];
  for (const key of keys || []) {
    if (metricIsBlank(headlines?.metrics, key)) out.push(key);
  }
  return out;
}

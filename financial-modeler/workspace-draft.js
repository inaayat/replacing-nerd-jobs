/**
 * Modeling-page draft: assumptions and typed year-0 blanks, keyed by CIK.
 * Browser-safe ESM — tests pass a fake storage object.
 */
import { ensureRatios } from '../fortune-500/extract.js';

export const DRAFT_STORAGE_KEY = 'fm-workspace-draft';
export const DRAFT_SCHEMA = 1;

export const YEAR0_METRIC = {
  revenue: 'revenue',
  cogs: 'cogs',
  grossProfit: 'cogs',
  ebit: 'operating_income',
  netIncome: 'net_income',
  cfo: 'cfo',
  capex: 'capex',
  cash: 'cash',
  receivables: 'receivables',
  inventory: 'inventory',
  debt: 'long_term_debt',
  totalAssets: 'assets',
  equity: 'equity',
};

export function emptyDraft() {
  return { schema: DRAFT_SCHEMA, lastCik: null, byCik: {} };
}

export function parseDraft(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== DRAFT_SCHEMA) return emptyDraft();
  const byCik = raw.byCik && typeof raw.byCik === 'object' ? raw.byCik : {};
  return { schema: DRAFT_SCHEMA, lastCik: raw.lastCik ?? null, byCik };
}

export function loadDraft(store) {
  const raw = store?.getItem?.(DRAFT_STORAGE_KEY);
  if (!raw) return emptyDraft();
  try {
    return parseDraft(JSON.parse(raw));
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(store, draft) {
  if (!store?.setItem) return false;
  try {
    store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readCikDraft(draft, cik) {
  if (cik == null || cik === '') return null;
  const row = draft?.byCik?.[String(cik)];
  return row && typeof row === 'object' ? row : null;
}

export function writeCikDraft(draft, cik, session) {
  if (cik == null || cik === '' || !session) return draft || emptyDraft();
  return {
    schema: DRAFT_SCHEMA,
    lastCik: String(cik),
    byCik: { ...(draft?.byCik || {}), [String(cik)]: session },
  };
}

/** Overlay typed year-0 USD amounts onto a headlines copy. */
export function applyYear0Inputs(headlines, year0) {
  if (!headlines?.metrics || !year0) return headlines;
  const metrics = { ...headlines.metrics };
  let changed = false;
  for (const [key, val] of Object.entries(year0)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    metrics[key] = {
      ...(metrics[key] || {}),
      val,
      unit: metrics[key]?.unit || 'USD',
      override: true,
      tag: 'UserEntered',
      taxonomy: 'user',
      source: 'typed',
    };
    changed = true;
  }
  if (!changed) return headlines;
  return ensureRatios({ ...headlines, metrics });
}

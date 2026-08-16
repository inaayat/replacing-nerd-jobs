/**
 * Extract every statement-like XBRL tag from SEC Company Facts for the latest
 * annual filing year. Browser-safe ESM — used by the API and tests.
 */
import { ALL_FILED_METRICS, extractHeadlines } from './extract.js';

const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A']);
const MIN_ANNUAL_DAYS = 300;
const TAXONOMIES = ['us-gaap', 'ifrs-full', 'dei'];
const MONEY_UNITS = new Set(['USD', 'EUR', 'CHF', 'GBP', 'CAD', 'AUD', 'ILS']);
const SHARE_UNITS = new Set(['USD/shares', 'shares']);

const JUNK_TAG =
  /(?:TextBlock|PolicyTextBlock|Policy$|Table$|Abstract$|Axis$|Domain$|Member$|LineItems$|Disclosure$|RollForward$|RollUp$|Extensible)/i;
const JUNK_DEI = /^(Entity|Document|TradingSymbol|Security|CityAreaCode|LocalPhoneNumber|Amendment|CurrentFiscal)/i;

/** Bump when row shape or filters change so Neon cache rows refetch. */
export const FILED_TAGS_SCHEMA = 1;

function yearOf(iso) {
  if (!iso || iso.length < 4) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

function daySpan(start, end) {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / 86400000;
}

function allowedUnit(unit) {
  return MONEY_UNITS.has(unit) || SHARE_UNITS.has(unit);
}

function isStatementUnit(unit) {
  return allowedUnit(unit);
}

function isJunkTag(taxonomy, tag) {
  if (!tag) return true;
  if (taxonomy === 'dei' && JUNK_DEI.test(tag)) return true;
  return JUNK_TAG.test(tag);
}

function scorePoint(p) {
  let score = 0;
  if (p.form === '10-K' || p.form === '20-F') score += 4;
  if (p.form === '10-K/A' || p.form === '20-F/A') score += 3;
  if (p.unit === 'USD') score += 1;
  if (p.filed) score += 0.001 * Date.parse(p.filed);
  return score;
}

function pickBestForYear(points, targetYear) {
  const pool = points.filter((p) => yearOf(p.end) === targetYear && ANNUAL_FORMS.has(p.form) && p.fp === 'FY');
  if (!pool.length) return { primary: null, also: [] };
  pool.sort((a, b) => scorePoint(b) - scorePoint(a));
  return { primary: pool[0], also: pool.slice(1) };
}

function classifyPoint(p) {
  const days = daySpan(p.start, p.end);
  if (days != null && days >= MIN_ANNUAL_DAYS) return 'duration';
  return 'instant';
}

function collectConceptPoints(facts, taxonomy, tag, node) {
  const out = [];
  const units = node?.units || {};
  for (const [unit, pts] of Object.entries(units)) {
    if (!isStatementUnit(unit)) continue;
    if (!Array.isArray(pts)) continue;
    for (const raw of pts) {
      if (typeof raw.val !== 'number' || !Number.isFinite(raw.val)) continue;
      if (!ANNUAL_FORMS.has(raw.form)) continue;
      if (raw.fp !== 'FY') continue;
      const kind = classifyPoint({ ...raw, unit });
      if (kind === 'duration') {
        const days = daySpan(raw.start, raw.end);
        if (days == null || days < MIN_ANNUAL_DAYS) continue;
      }
      out.push({
        val: raw.val,
        unit,
        start: raw.start || null,
        end: raw.end,
        fy: raw.fy ?? null,
        fp: raw.fp,
        form: raw.form,
        filed: raw.filed || null,
        frame: raw.frame || null,
        tag,
        taxonomy,
        kind,
      });
    }
  }
  return out;
}

/** Map taxonomy:tag → metric keys that list it as a candidate. */
export function candidateMap() {
  const out = new Map();
  for (const def of ALL_FILED_METRICS) {
    for (let i = 0; i < def.candidates.length; i++) {
      const cand = def.candidates[i];
      const id = `${cand.taxonomy}:${cand.tag}`;
      const prev = out.get(id) || [];
      prev.push({ key: def.key, label: def.label, candidateIndex: i });
      out.set(id, prev);
    }
  }
  return out;
}

/** Winning taxonomy:tag for each metric key from an extractHeadlines payload. */
export function winningTagByMetric(headlines) {
  const out = new Map();
  for (const [key, point] of Object.entries(headlines?.metrics || {})) {
    if (!point || typeof point.val !== 'number' || point.derived) continue;
    const tax = point.taxonomy || 'us-gaap';
    if (!point.tag) continue;
    out.set(key, `${tax}:${point.tag}`);
  }
  return out;
}

function mappedForRow(conceptId, winningByConcept, candidates) {
  const winKey = winningByConcept.get(conceptId);
  if (!winKey) return { mappedKey: null, mappedLabel: null };
  const match = (candidates || []).find((c) => c.key === winKey);
  if (!match) return { mappedKey: null, mappedLabel: null };
  return { mappedKey: match.key, mappedLabel: match.label };
}

/**
 * @param {object} facts SEC Company Facts JSON
 * @returns {{ cik, entityName, asOfYear, end, form, fy, rows, also, counts, schema }}
 */
export function extractFiledTags(facts) {
  const headlines = extractHeadlines(facts);
  const asOfYear = headlines.asOfYear;
  const candByConcept = candidateMap();
  const winByMetric = winningTagByMetric(headlines);
  const winningByConcept = new Map();
  for (const [key, conceptId] of winByMetric) {
    winningByConcept.set(conceptId, key);
  }

  const rows = [];
  const also = [];
  const taxonomies = facts?.facts || {};

  for (const taxonomy of TAXONOMIES) {
    const concepts = taxonomies[taxonomy];
    if (!concepts || typeof concepts !== 'object') continue;
    for (const [tag, node] of Object.entries(concepts)) {
      if (isJunkTag(taxonomy, tag)) continue;
      const points = collectConceptPoints(facts, taxonomy, tag, node);
      if (!points.length) continue;
      const { primary, also: altPts } =
        asOfYear == null ? { primary: null, also: [] } : pickBestForYear(points, asOfYear);
      if (!primary) {
        for (const p of points.slice(0, 3)) {
          also.push(slimAlsoRow(p, node?.label || tag));
        }
        continue;
      }
      const conceptId = `${taxonomy}:${tag}`;
      const cands = candByConcept.get(conceptId) || [];
      const { mappedKey, mappedLabel } = mappedForRow(conceptId, winningByConcept, cands);
      rows.push({
        taxonomy,
        tag,
        label: node?.label || tag,
        val: primary.val,
        unit: primary.unit,
        end: primary.end,
        form: primary.form,
        fy: primary.fy ?? asOfYear,
        filed: primary.filed || null,
        kind: primary.kind,
        mappedKey,
        mappedLabel,
      });
      for (const p of altPts) {
        also.push(slimAlsoRow(p, node?.label || tag));
      }
    }
  }

  rows.sort((a, b) => {
    const la = (a.label || a.tag).toLowerCase();
    const lb = (b.label || b.tag).toLowerCase();
    if (la !== lb) return la.localeCompare(lb);
    return a.tag.localeCompare(b.tag);
  });

  const mapped = rows.filter((r) => r.mappedKey).length;
  const end = rows.find((r) => r.mappedKey === 'revenue')?.end || headlines.metrics?.revenue?.end || rows[0]?.end || null;
  const form = headlines.metrics?.revenue?.form || rows[0]?.form || '10-K';

  return {
    schema: FILED_TAGS_SCHEMA,
    cik: facts?.cik ?? headlines.cik ?? null,
    entityName: facts?.entityName ?? headlines.entityName ?? null,
    asOfYear,
    fy: asOfYear,
    end,
    form,
    rows,
    also,
    counts: {
      filed: rows.length,
      mapped,
      unmapped: rows.length - mapped,
    },
  };
}

function slimAlsoRow(p, label) {
  return {
    taxonomy: p.taxonomy,
    tag: p.tag,
    label,
    val: p.val,
    unit: p.unit,
    end: p.end,
    form: p.form,
    fy: p.fy,
    reason: 'alternate period or filing',
  };
}

/** Filter rows for the filings UI (search + chip). */
export function filterFiledRows(rows, { query = '', filter = 'all' } = {}) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  return (rows || []).filter((row) => {
    if (filter === 'mapped' && !row.mappedKey) return false;
    if (filter === 'unmapped' && row.mappedKey) return false;
    if (!needle) return true;
    const hay = [row.tag, row.label, row.taxonomy, row.mappedKey, row.mappedLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

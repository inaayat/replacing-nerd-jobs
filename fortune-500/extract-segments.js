/**
 * Extract dimensional (segment) facts from a 10-K inline XBRL HTML document.
 * Browser-safe ESM. Company Facts does not include these dimensions.
 */

const REVENUE_CONCEPTS = new Set([
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'RevenuesNetOfInterestExpense',
  'RevenueFromContractsWithCustomers',
  'Revenue',
]);

const OPERATING_INCOME_CONCEPTS = new Set([
  'OperatingIncomeLoss',
  'SegmentReportingInformationOperatingIncomeLoss',
  'ProfitLossFromOperatingActivities',
]);

const ASSET_CONCEPTS = new Set(['Assets', 'SegmentReportingSegmentAssets']);

const DA_CONCEPTS = new Set([
  'DepreciationDepletionAndAmortization',
  'SegmentReportingInformationDepreciationDepletionAndAmortization',
  'Depreciation',
]);

const AXIS_MAP = [
  { id: 'product', match: /ProductOrServiceAxis/i },
  { id: 'operating', match: /StatementBusinessSegmentsAxis/i },
  { id: 'geography', match: /StatementGeographicalAxis|GeographicalAxis/i },
];

function localName(qname) {
  if (!qname) return '';
  const i = qname.lastIndexOf(':');
  return i >= 0 ? qname.slice(i + 1) : qname;
}

function axisId(dimension) {
  const name = localName(dimension);
  const hit = AXIS_MAP.find((a) => a.match.test(name) || a.match.test(dimension || ''));
  return hit ? hit.id : null;
}

function parseScale(attrs) {
  const m = attrs.match(/\bscale="([^"]+)"/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function parseNumber(raw, attrs) {
  const cleaned = String(raw || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#160;|&nbsp;/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned || cleaned === '—') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const sign = /\bsign="-"/i.test(attrs) ? -1 : 1;
  return sign * n * 10 ** parseScale(attrs);
}

function attr(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}="([^"]+)"`, 'i'))?.[1] || null;
}

function closeEnough(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-9);
}

/**
 * Match extracted Company Facts points to visible ix:* element IDs in the
 * filing. Those IDs let the reference page open the exact reported line.
 */
export function extractFactAnchorsFromHtml(html, headlines) {
  if (!html || typeof html !== 'string' || !headlines?.metrics) return {};
  const contexts = new Map();
  for (const m of html.matchAll(/<xbrli:context[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/gi)) {
    contexts.set(m[1], {
      end:
        m[2].match(/<xbrli:(?:endDate|instant)>([^<]+)<\/xbrli:(?:endDate|instant)>/i)?.[1] ||
        null,
      dimensional: /<xbrldi:(?:explicitMember|typedMember)\b/i.test(m[2]),
    });
  }

  const facts = [];
  for (const m of html.matchAll(/<ix:(?:nonFraction|nonNumeric)([^>]*)>([\s\S]*?)<\/ix:(?:nonFraction|nonNumeric)>/gi)) {
    const attrs = m[1];
    const id = attr(attrs, 'id');
    const name = attr(attrs, 'name');
    const context = contexts.get(attr(attrs, 'contextRef'));
    if (!id || !name || !context?.end) continue;
    facts.push({
      id,
      tag: localName(name),
      end: context.end,
      dimensional: context.dimensional,
      val: parseNumber(m[2], attrs),
    });
  }

  const expected = [];
  for (const [key, point] of Object.entries(headlines.metrics || {})) {
    if (point?.derived || !point?.tag || !point?.end || !Number.isFinite(point?.val)) continue;
    expected.push({ key, ...point });
  }
  for (const [key, rows] of Object.entries(headlines.seriesAnnual || {})) {
    for (const point of rows || []) {
      if (point?.derived || !point?.tag || !point?.end || !Number.isFinite(point?.val)) continue;
      expected.push({ key, ...point });
    }
  }

  const anchors = {};
  for (const point of expected) {
    const candidates = facts.filter(
      (fact) => fact.tag === localName(point.tag) && fact.end === point.end && !fact.dimensional
    );
    const hit = candidates.find((fact) => closeEnough(fact.val, point.val));
    if (!hit) continue;
    if (!anchors[point.key]) anchors[point.key] = {};
    anchors[point.key][point.end] = hit.id;
  }
  return anchors;
}

/**
 * @param {string} html inline XBRL filing
 * @param {{ asOfEnd?: string }} [opts] prefer contexts whose end date matches
 */
export function extractSegmentsFromHtml(html, opts = {}) {
  if (!html || typeof html !== 'string') {
    return { axes: [], flags: ['empty_filing'], checks: {} };
  }

  const contexts = new Map();
  for (const m of html.matchAll(/<xbrli:context[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/g)) {
    const id = m[1];
    const body = m[2];
    const members = [...body.matchAll(/<xbrldi:explicitMember[^>]*dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/g)].map(
      (x) => ({ dimension: x[1], member: x[2].trim() })
    );
    const end = body.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/)?.[1] || null;
    const start = body.match(/<xbrli:startDate>([^<]+)<\/xbrli:startDate>/)?.[1] || null;
    contexts.set(id, { members, end, start });
  }

  const facts = [];
  for (const m of html.matchAll(/<ix:nonFraction([^>]*)>([^<]*)<\/ix:nonFraction>/g)) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const ctx = attrs.match(/\bcontextRef="([^"]+)"/)?.[1];
    const val = parseNumber(m[2], attrs);
    if (!name || !ctx || val == null) continue;
    const context = contexts.get(ctx);
    if (!context?.members?.length) continue;
    facts.push({ name, val, ...context });
  }

  const targetEnd = opts.asOfEnd || latestDurationEnd(facts);
  const axes = [];
  for (const spec of AXIS_MAP) {
    const members = new Map();
    for (const f of facts) {
      if (targetEnd && f.end !== targetEnd) continue;
      const dim = f.members.find((x) => spec.match.test(x.dimension) || spec.match.test(localName(x.dimension)));
      if (!dim) continue;
      const concept = localName(f.name);
      const metric = conceptMetric(concept);
      if (!metric) continue;
      const key = localName(dim.member);
      if (!key || key === 'OperatingSegmentsMember') continue;
      const row = members.get(key) || {
        member: dim.member,
        label: humanizeMember(key),
        revenue: null,
        operating_income: null,
        assets: null,
        depreciation_amortization: null,
      };
      if (row[metric] == null) row[metric] = f.val;
      members.set(key, row);
    }
    const list = [...members.values()].filter((r) => r.revenue != null || r.operating_income != null || r.assets != null);
    if (list.length >= 2) {
      axes.push({
        id: spec.id,
        label: spec.id === 'product' ? 'Product and service' : spec.id === 'operating' ? 'Operating segments' : 'Geography',
        members: list.sort((a, b) => Math.abs(b.revenue || 0) - Math.abs(a.revenue || 0)),
      });
    }
  }

  const flags = [];
  if (!axes.length) flags.push('no_segment_breakdown');
  const operating = axes.find((a) => a.id === 'operating');
  const product = axes.find((a) => a.id === 'product');
  const geo = axes.find((a) => a.id === 'geography');
  const sumRev = (axis) => (axis?.members || []).reduce((s, m) => s + (m.revenue || 0), 0);

  return {
    asOfEnd: targetEnd,
    axes,
    flags,
    checks: {
      operating_revenue_sum: operating ? sumRev(operating) : null,
      product_revenue_sum: product ? sumRev(product) : null,
      geography_revenue_sum: geo ? sumRev(geo) : null,
    },
  };
}

function conceptMetric(concept) {
  if (REVENUE_CONCEPTS.has(concept)) return 'revenue';
  if (OPERATING_INCOME_CONCEPTS.has(concept)) return 'operating_income';
  if (ASSET_CONCEPTS.has(concept)) return 'assets';
  if (DA_CONCEPTS.has(concept)) return 'depreciation_amortization';
  return null;
}

function latestDurationEnd(facts) {
  let best = null;
  for (const f of facts) {
    if (!f.start || !f.end) continue;
    if (!best || f.end > best) best = f.end;
  }
  return best;
}

function humanizeMember(key) {
  return String(key || '')
    .replace(/Member$/i, '')
    .replace(/Segment$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim() || key;
}

export const SEGMENT_METRIC_DEFS = [
  {
    key: 'revenue',
    label: 'Segment revenue',
    student:
      'Revenue attributed to this reportable segment, product line, or geography in the 10-K’s dimensional XBRL. Axes are stored separately; product revenue and geographic revenue are alternative cuts of the same total, not additive.',
  },
  {
    key: 'operating_income',
    label: 'Segment operating income',
    student:
      'Operating profit (or loss) the filer assigned to the segment. Not always tagged. Corporate and reconciling items may appear as a separate member.',
  },
  {
    key: 'assets',
    label: 'Segment assets',
    student: 'Assets identified with the segment when the issuer tags them. Often incomplete relative to consolidated assets.',
  },
  {
    key: 'depreciation_amortization',
    label: 'Segment depreciation and amortization',
    student: 'D&A the filer allocated to the segment, when tagged.',
  },
];

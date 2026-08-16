/**
 * Pure helpers for the Financial Modeler filings (reference) page.
 * Browser-safe ESM — no Node APIs. Imported by information.js and tests.
 */

export const GROUP_TONE = {
  core_income: 'income',
  core_pershare: 'income',
  income_detail: 'income',
  core_balance: 'balance',
  balance_sheet: 'balance',
  core_cashflow: 'cash',
  leases: 'lease',
  financing: 'finance',
  bank: 'bank',
  ratios_core: 'ratio',
  ratios_extended: 'ratio',
  segments: 'segment',
};

export function padCik(cik) {
  const raw = String(cik ?? '').replace(/\D/g, '');
  return raw ? raw.padStart(10, '0') : '';
}

export function accessionNoDashes(accession) {
  return String(accession || '').replace(/-/g, '');
}

function compactDate(iso) {
  const s = String(iso || '').slice(0, 10).replace(/-/g, '');
  return /^\d{8}$/.test(s) ? s : '';
}

/** Add whole days to an ISO date (YYYY-MM-DD), UTC. */
export function addDaysIso(iso, days) {
  const t = Date.parse(`${String(iso || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + Number(days) * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function companyFactsUrl(cik, fallback) {
  if (fallback) return fallback;
  const pad = padCik(cik);
  return pad ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad}.json` : '';
}

export function companyConceptUrl(cik, taxonomy, tag) {
  const pad = padCik(cik);
  if (!pad || !taxonomy || !tag) return '';
  return `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(tag)}.json`;
}

/**
 * EDGAR company-filings search. `dateb` is “filed before”, so we bump the
 * filing date by one day when we have it — that surfaces this 10-K/10-Q near
 * the top without needing an accession number.
 */
export function edgarBrowseUrl({ cik, form, filed, browse } = {}) {
  const pad = padCik(cik);
  if (!pad && browse) return browse;
  if (!pad) return '';
  const type = form || '10-K';
  const dateb = filed ? compactDate(addDaysIso(filed, 1)) : '';
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad}&type=${encodeURIComponent(type)}&dateb=${dateb}&owner=include&count=10`;
}

export function filingArchiveUrl(cik, accession, primary) {
  if (cik == null || !accession || !primary) return '';
  const n = Number(String(cik).replace(/\D/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  const file = String(primary).replace(/^\/+/, '');
  return `https://www.sec.gov/Archives/edgar/data/${n}/${accessionNoDashes(accession)}/${file}`;
}

/** Inline XBRL viewer — the tagged line in the HTML filing, not a PDF page. */
export function inlineXbrlUrl(cik, accession, primary) {
  const archive = filingArchiveUrl(cik, accession, primary);
  if (!archive) return '';
  const path = archive.replace('https://www.sec.gov', '');
  return `https://www.sec.gov/ix?doc=${path}`;
}

export function metricSearchHaystack(def, point = null, extra = '') {
  const taxonomy = point?.taxonomy;
  const tag = point?.tag || def?.tags;
  return [
    def?.label,
    def?.key,
    def?.student,
    def?.plain,
    def?.tags,
    def?.formula,
    point?.tag,
    point?.taxonomy,
    point?.form,
    taxonomy && tag ? `${taxonomy}:${tag}` : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function metricMatchesQuery(query, def, point, extra) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;
  return metricSearchHaystack(def, point, extra).includes(needle);
}

export function annualSeries(headlines, key) {
  const rows = headlines?.seriesAnnual?.[key];
  return Array.isArray(rows) ? rows : [];
}

export function quarterlySeries(headlines, key) {
  const rows = headlines?.seriesQuarterly?.[key];
  return Array.isArray(rows) ? rows : [];
}

export function hasExpandableSeries(headlines, key) {
  return annualSeries(headlines, key).length > 0 || quarterlySeries(headlines, key).length > 0;
}

/**
 * Human links for “where to find it”. Company Facts do not store a PDF page
 * number; the inline XBRL viewer is the closest jump-to-the-line we can offer.
 */
export function filingSourceLinks({ company, point, def, filing, derived } = {}) {
  const cik = company?.cik;
  const links = [];
  const form = point?.form || filing?.form || company?.form || '10-K';
  const filed = point?.filed || filing?.filingDate || null;
  const accession = filing?.accession;
  const primary = filing?.primary;
  const taxonomy = point?.taxonomy || 'us-gaap';
  const tag = point?.tag || (typeof def?.tags === 'string' ? def.tags.split(/[,\s]+/)[0] : '');

  if (derived) {
    const browse = edgarBrowseUrl({ cik, form, browse: company?.edgar_filings_browse });
    if (browse) links.push({ href: browse, label: `Filings on EDGAR (${form})`, kind: 'browse' });
    return links;
  }

  if (accession && primary) {
    const html = inlineXbrlUrl(cik, accession, primary);
    const raw = filingArchiveUrl(cik, accession, primary);
    if (html) links.push({ href: html, label: `Open ${form} (inline XBRL)`, kind: 'document' });
    if (raw) links.push({ href: raw, label: `${form} HTML`, kind: 'archive' });
  }

  const browse = edgarBrowseUrl({
    cik,
    form,
    filed,
    browse: company?.edgar_filings_browse,
  });
  if (browse) {
    links.push({
      href: browse,
      label: accession ? `All ${form} filings` : `Open ${form} on EDGAR`,
      kind: 'browse',
    });
  }

  const concept = companyConceptUrl(cik, taxonomy, tag);
  if (concept && tag) {
    links.push({ href: concept, label: `${taxonomy}:${tag}`, kind: 'concept' });
  }

  const facts = companyFactsUrl(cik, company?.edgar_companyfacts_api);
  if (facts) links.push({ href: facts, label: 'Company Facts', kind: 'facts' });

  const seen = new Set();
  return links.filter((link) => {
    if (!link.href || seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

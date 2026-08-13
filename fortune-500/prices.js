/**
 * Yahoo Finance v8 chart helpers for Fortune 500 share prices.
 * Browser-safe ESM (no node: imports) — parse + ticker rules used by the
 * API, the page, and tests. The Node proxy lives in api/fortune-500.js.
 */

import { isPublic } from './catalog.js';

export const PRICE_RANGES = ['1y', '5y', 'max'];
export const DEFAULT_PRICE_RANGE = '5y';

const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;

export function normalizePriceRange(raw) {
  const s = String(raw || DEFAULT_PRICE_RANGE).trim().toLowerCase();
  return PRICE_RANGES.includes(s) ? s : DEFAULT_PRICE_RANGE;
}

/**
 * Prefer the SEC ticker when Fortune and SEC disagree (BRK-B not BRK-A).
 * Private / no_ticker names have nothing to fetch.
 */
export function priceTicker(company) {
  if (!company || !isPublic(company)) return null;
  const raw = String(company.sec_ticker || company.fortune_ticker || '')
    .trim()
    .toUpperCase();
  if (!raw || raw === 'NON-PUBLIC' || raw === 'NO_TICKER') return null;
  const symbol = raw.replace(/\./g, '-');
  return TICKER_RE.test(symbol) ? symbol : null;
}

export function yahooChartUrl(symbol, range = DEFAULT_PRICE_RANGE) {
  const ticker = String(symbol || '').trim().toUpperCase().replace(/\./g, '-');
  if (!TICKER_RE.test(ticker)) return null;
  const r = normalizePriceRange(range);
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${r}`;
}

function isoDay(unixSec) {
  if (unixSec == null || !Number.isFinite(Number(unixSec))) return null;
  const d = new Date(Number(unixSec) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isoTime(unixSec) {
  if (unixSec == null || !Number.isFinite(Number(unixSec))) return null;
  const d = new Date(Number(unixSec) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Flatten a Yahoo v8 chart JSON payload into the public API shape.
 * Returns `{ error }` on empty/malformed input — never throws.
 */
export function parseYahooChart(payload, requestedSymbol = null) {
  const result = payload?.chart?.result?.[0];
  if (!result || payload?.chart?.error) {
    return { error: 'price unavailable' };
  }
  const meta = result.meta || {};
  const ts = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens = Array.isArray(quote.open) ? quote.open : [];
  const highs = Array.isArray(quote.high) ? quote.high : [];
  const lows = Array.isArray(quote.low) ? quote.low : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const date = isoDay(ts[i]);
    const close = num(closes[i]);
    if (!date || close == null) continue;
    bars.push({
      date,
      open: num(opens[i]),
      high: num(highs[i]),
      low: num(lows[i]),
      close,
      volume: num(volumes[i]),
    });
  }

  const lastBar = bars[bars.length - 1] || null;
  const prevBar = bars[bars.length - 2] || null;
  const last = num(meta.regularMarketPrice) ?? lastBar?.close ?? null;
  const previousClose =
    num(meta.previousClose) ?? prevBar?.close ?? lastBar?.close ?? null;
  let changePct = null;
  if (last != null && previousClose) {
    changePct = last / previousClose - 1;
  }

  const symbol = String(meta.symbol || requestedSymbol || '').toUpperCase() || null;
  if (last == null && !bars.length) {
    return { error: 'price unavailable', symbol };
  }

  return {
    symbol,
    currency: meta.currency || 'USD',
    last,
    previousClose,
    changePct,
    asOf: isoTime(meta.regularMarketTime) || (lastBar ? `${lastBar.date}T00:00:00.000Z` : null),
    source: 'yahoo',
    bars,
  };
}

export function formatPrice(n, currency = 'USD') {
  if (n == null || !Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(n >= 1000 ? 0 : 2)}`;
  }
}

export function formatChangePct(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const pct = (Math.abs(n) * 100).toFixed(2) + '%';
  if (n > 0) return `+${pct}`;
  if (n < 0) return `−${pct}`;
  return pct;
}

/**
 * Compact SVG sparkline from daily closes. Empty string if too few points.
 */
export function sparklineSvg(bars, width = 180, height = 40) {
  const closes = (bars || []).map((b) => b?.close).filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (closes.length < 2) return '';
  const maxPts = 90;
  const step = Math.max(1, Math.ceil(closes.length / maxPts));
  const pts = [];
  for (let i = 0; i < closes.length; i += step) pts.push(closes[i]);
  if (pts[pts.length - 1] !== closes[closes.length - 1]) pts.push(closes[closes.length - 1]);
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const d = pts
    .map((v, i) => {
      const x = pad + (i / (pts.length - 1)) * innerW;
      const y = pad + (1 - (v - lo) / span) * innerH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  const stroke = up ? '#3a8a2a' : '#c44';
  return `<svg class="f5-spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

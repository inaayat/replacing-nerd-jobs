/**
 * A-Lister bug reports (browser + API).
 * Keep this file dependency-free — imported by settings.js and api/alist.js.
 */

export const BUG_MESSAGE_MAX = 500;
export const BUG_DETAILS_MAX = 4000;
export const BUG_URL_MAX = 2048;
export const BUG_UA_MAX = 512;
export const BUG_SCREENSHOT_MAX = 400_000;
export const BUG_CONTEXT_MAX = 2000;

const SCREENSHOT_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
const DANGEROUS_URL = /^\s*(javascript|data|vbscript):/i;

function clip(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function safeUrl(raw) {
  const s = clip(raw, BUG_URL_MAX);
  if (!s || DANGEROUS_URL.test(s)) return '';
  return s;
}

function normalizeScreenshot(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.length > BUG_SCREENSHOT_MAX) {
    return { error: 'Keep the screenshot under 250 KB, or skip it.' };
  }
  if (!SCREENSHOT_RE.test(s)) {
    return { error: 'Screenshots must be a PNG, JPEG, WebP, or GIF.' };
  }
  return { value: s.replace(/\s+/g, '') };
}

function normalizeContext(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = clip(key, 40);
    if (!k) continue;
    if (typeof value === 'string') out[k] = clip(value, 240);
    else if (typeof value === 'number' && Number.isFinite(value)) out[k] = value;
    else if (typeof value === 'boolean') out[k] = value;
  }
  const encoded = JSON.stringify(out);
  if (encoded.length > BUG_CONTEXT_MAX) return {};
  return out;
}

/**
 * @returns {{ error: string } | { data: {
 *   message: string, details: string, url: string, user_agent: string,
 *   screenshot: string, context: object
 * } }}
 */
export function normalizeBugReport(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const message = clip(body.message, BUG_MESSAGE_MAX);
  const details = clip(body.details, BUG_DETAILS_MAX);
  if (!message) return { error: 'Describe the bug in a sentence or two.' };

  const shot = normalizeScreenshot(body.screenshot);
  if (shot.error) return { error: shot.error };

  return {
    data: {
      message,
      details,
      url: safeUrl(body.url),
      user_agent: clip(body.user_agent, BUG_UA_MAX),
      screenshot: shot.value || '',
      context: normalizeContext(body.context),
    },
  };
}

/** Auto-captured page/device bits. User agent is sent separately. */
export function captureBugContext() {
  if (typeof window === 'undefined') return {};
  return {
    app: 'a-lister',
    page: location.pathname + location.search,
    href: location.href,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    language: navigator.language || '',
    platform: navigator.platform || '',
  };
}

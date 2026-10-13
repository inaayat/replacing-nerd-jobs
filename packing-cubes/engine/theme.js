/** Packing Cubes color theme: dark = Plotmaniac gold-on-ink, light = original green. */

export const THEME_KEY = 'packing-cubes-theme';
export const THEME_DARK_BG = '#0c0b09';
export const THEME_LIGHT_BG = '#f3f4f6';

export function resolveTheme(stored, prefersLight) {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersLight ? 'light' : 'dark';
}

export function themeColorFor(theme) {
  return theme === 'light' ? THEME_LIGHT_BG : THEME_DARK_BG;
}

export function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme, { persist = false } = {}) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColorFor(next));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }
  syncToggle();
  return next;
}

export function toggleTheme() {
  return applyTheme(currentTheme() === 'light' ? 'dark' : 'light', { persist: true });
}

function syncToggle() {
  const btn = document.getElementById('pc-theme-toggle');
  if (!btn) return;
  const light = currentTheme() === 'light';
  btn.setAttribute('aria-pressed', String(light));
  btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  btn.title = light ? 'Dark mode' : 'Light mode';
}

export function initThemeToggle() {
  const btn = document.getElementById('pc-theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
  syncToggle();
  try {
    if (readStoredTheme()) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', (e) => {
      if (!readStoredTheme()) applyTheme(e.matches ? 'light' : 'dark');
    });
  } catch { /* ignore */ }
}

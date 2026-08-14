export const THEME_KEY = 'alist.theme';

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function isDarkModeEnabled() {
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY)) === 'dark';
  } catch {
    return false;
  }
}

export function applyTheme(theme) {
  const dark = normalizeTheme(theme) === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0a0a0a' : '#AA0000';
}

export function setDarkModeEnabled(enabled) {
  const theme = enabled ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore storage failures
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(isDarkModeEnabled() ? 'dark' : 'light');
}

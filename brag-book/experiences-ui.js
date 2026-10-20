/**
 * Experiences UI helpers (browser-safe ESM).
 */

export const EXP_PANEL_COLLAPSED_KEY = 'brag-book-exp-panel-collapsed';
export const EXP_PANEL_FILTER_KEY = 'brag-book-exp-panel-filter-v1';
export const EXP_UI_DISABLED_KEY = 'brag-book-experiences-v1';

export function experiencesUiEnabled() {
  try {
    if (typeof location !== 'undefined') {
      const params = new URLSearchParams(location.search);
      if (params.get('experiences') === '0') return false;
      if (params.get('experiences') === '1') return true;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(EXP_UI_DISABLED_KEY) !== '0';
    }
  } catch {
    /* ignore */
  }
  return true;
}

export function librarySectionKey(jobKey, section) {
  if (section.kind === 'experience') return `${jobKey}:xp:${section.experienceId}`;
  return `${jobKey}:loose`;
}

export function readPanelFilter(defaultFilter = 'all') {
  try {
    return localStorage.getItem(EXP_PANEL_FILTER_KEY) || defaultFilter;
  } catch {
    return defaultFilter;
  }
}

export function writePanelFilter(value) {
  try {
    localStorage.setItem(EXP_PANEL_FILTER_KEY, value);
  } catch {
    /* ignore */
  }
}

export function readPanelCollapsed() {
  try {
    return localStorage.getItem(EXP_PANEL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePanelCollapsed(collapsed) {
  try {
    localStorage.setItem(EXP_PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

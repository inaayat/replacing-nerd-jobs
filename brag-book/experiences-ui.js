/**
 * Experiences UI helpers (browser-safe ESM).
 */

import { libraryCatalogGroups } from './engine.js';

export const EXP_PANEL_COLLAPSED_KEY = 'brag-book-exp-panel-collapsed';
export const CATALOG_COLLAPSED_SECTIONS_KEY = 'brag-book-collapsed-library-sections';
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

/** Experience headers and labeled loose sections (not unlabeled loose rows). */
export function libraryCollapsibleSectionKeys(store) {
  const keys = [];
  for (const group of libraryCatalogGroups(store, { query: '' })) {
    const jobKey = group.jobId || '__none__';
    for (const section of group.sections || []) {
      if (section.kind === 'experience') {
        keys.push(librarySectionKey(jobKey, section));
      } else if (section.kind === 'loose' && section.label) {
        keys.push(librarySectionKey(jobKey, section));
      }
    }
  }
  return keys;
}

export function readCollapsedLibrarySectionsFromSession() {
  try {
    const raw = sessionStorage.getItem(CATALOG_COLLAPSED_SECTIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function writeCollapsedLibrarySectionsToSession(keys) {
  try {
    sessionStorage.setItem(CATALOG_COLLAPSED_SECTIONS_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

export function catalogSectionsAllCollapsed(store, collapsedSet) {
  const keys = libraryCollapsibleSectionKeys(store);
  if (!keys.length) return false;
  return keys.every((key) => collapsedSet.has(key));
}

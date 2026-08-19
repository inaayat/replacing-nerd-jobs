/**
 * When the v0 Chrome extension is installed, its content script posts pending
 * notes (v0 store shape) via postMessage. Convert them to v1 notes and hand
 * them to the store via a CustomEvent (sync.js listens).
 */
import { migrateLegacyStore } from './notes.js';

const IMPORT_KEY = 'sticky-notes-extension-import';

function forward(payload) {
  const notes = migrateLegacyStore(payload);
  if (!notes.length) return;
  window.dispatchEvent(new CustomEvent('sticky-notes-extension-notes', { detail: notes }));
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'sticky-notes-import') return;
  try {
    // Stash in case the app has not booted yet; app.js drains this on init.
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(event.data.payload));
    forward(event.data.payload);
    window.dispatchEvent(new CustomEvent('sticky-notes-imported'));
  } catch {
    /* ignore malformed import */
  }
});

export function drainPendingImport() {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(IMPORT_KEY);
    forward(JSON.parse(raw));
  } catch {
    /* ignore */
  }
}

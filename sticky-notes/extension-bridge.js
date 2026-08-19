/**
 * When the Chrome extension is installed, a content script posts pending notes
 * into sessionStorage before this module merges them into the board store.
 */
import { mergeStores, loadFromLocalStorage, saveToLocalStorage } from './notes.js';

const IMPORT_KEY = 'sticky-notes-extension-import';

function mergeImport(payload) {
  if (!payload) return;
  const store = mergeStores(loadFromLocalStorage(), payload);
  saveToLocalStorage(store);
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'sticky-notes-import') return;
  try {
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(event.data.payload));
    mergeImport(event.data.payload);
    window.dispatchEvent(new CustomEvent('sticky-notes-imported'));
  } catch {
    /* ignore */
  }
});

// If import landed before app.js booted, app.js reads sessionStorage on init.

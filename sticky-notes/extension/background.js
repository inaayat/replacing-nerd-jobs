import { STORAGE_KEY, loadFromExtensionStorage } from './notes.js';

const BOARD_PATHS = ['/sticky-notes/', '/sticky-notes'];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sticky-notes-capture',
    title: 'Pin to Sticky Notes',
    contexts: ['selection', 'page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'sticky-notes-capture') return;
  const text = (info.selectionText || '').trim();
  chrome.action.openPopup?.();
  if (text && tab?.id) {
    await chrome.storage.session.set({
      'sticky-notes-draft': { text, tabId: tab.id },
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick-capture') chrome.action.openPopup?.();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-pending-for-board') {
    loadFromExtensionStorage()
      .then((store) => sendResponse({ ok: true, key: STORAGE_KEY, store }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'clear-extension-queue') {
    chrome.storage.local.set({ [STORAGE_KEY]: { version: 1, notes: [] } })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

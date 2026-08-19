import {
  NOTE_COLORS,
  addExtensionNote,
  loadFromExtensionStorage,
} from './notes.js';

const textEl = document.getElementById('note-text');
const statusEl = document.getElementById('status');
const colorsEl = document.getElementById('colors');
const saveBtn = document.getElementById('save');
const openBoard = document.getElementById('open-board');

let selectedColor = 'yellow';

function setStatus(message) {
  statusEl.textContent = message;
}

async function activeTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  return { url: tab.url || '', title: tab.title || '' };
}

function renderColors() {
  NOTE_COLORS.forEach((color) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = color;
    btn.style.background = `var(--note-${color})`;
    btn.setAttribute('aria-pressed', String(color === selectedColor));
    btn.addEventListener('click', () => {
      selectedColor = color;
      colorsEl.querySelectorAll('button').forEach((el) => {
        el.setAttribute('aria-pressed', String(el.title === color));
      });
    });
    colorsEl.append(btn);
  });
}

async function restoreDraft() {
  const draft = (await chrome.storage.session.get('sticky-notes-draft'))['sticky-notes-draft'];
  if (draft?.text) textEl.value = draft.text;
  await chrome.storage.session.remove('sticky-notes-draft');
}

saveBtn.addEventListener('click', async () => {
  const text = textEl.value.trim();
  if (!text) {
    setStatus('Write something first.');
    textEl.focus();
    return;
  }
  saveBtn.disabled = true;
  try {
    const source = await activeTabContext();
    await addExtensionNote({
      text,
      color: selectedColor,
      source: source?.url?.startsWith('http') ? source : null,
    });
    const store = await loadFromExtensionStorage();
    setStatus(`Pinned (${store.notes.length} waiting for the board).`);
    textEl.value = '';
    openBoard.focus();
  } catch (err) {
    setStatus('Could not save — try again.');
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
});

renderColors();
restoreDraft();
textEl.focus();

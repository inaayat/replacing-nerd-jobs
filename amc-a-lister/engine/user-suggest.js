import { userSearchApi } from './api.js';
import { escapeHtml } from './format.js';
import { wireComboboxKeys } from './combobox.js';

/**
 * Wire a username input to A-Lister user search suggestions.
 * @returns {{ close: () => void }}
 */
export function wireUserSuggest(input, resultsEl, {
  token,
  getExclude = () => [],
  onSelect,
  minChars = 0,
} = {}) {
  if (!input || !resultsEl || !token) return { close: () => {} };

  let timer = null;
  let reqId = 0;

  const close = () => {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
  };

  const render = (results) => {
    const exclude = new Set(
      (getExclude() || []).map((u) => String(u || '').trim().toLowerCase()).filter(Boolean),
    );
    const filtered = (results || []).filter((r) => !exclude.has(String(r.username || '').toLowerCase()));
    if (!filtered.length) {
      close();
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = filtered.map((u) => `
      <button type="button" data-username="${escapeHtml(u.username)}">
        <span>${escapeHtml(u.username)}</span>
        ${u.prior_companion ? '<span class="al-muted">seen before</span>' : ''}
      </button>
    `).join('');
    resultsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const username = btn.dataset.username || '';
        input.value = username;
        close();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        onSelect?.(username);
      });
    });
  };

  const fetchSuggestions = async (q) => {
    const id = ++reqId;
    try {
      const { results } = await userSearchApi.search(token, q);
      if (id !== reqId) return;
      render(results);
    } catch {
      if (id === reqId) close();
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < minChars) {
      if (!q && minChars === 0) {
        timer = setTimeout(() => fetchSuggestions(''), 120);
      } else {
        close();
      }
      return;
    }
    timer = setTimeout(() => fetchSuggestions(q), 180);
  };

  wireComboboxKeys(input, resultsEl);
  input.addEventListener('focus', schedule);
  input.addEventListener('input', schedule);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => {
    const wrap = input.closest('.al-search-wrap') || input.parentElement;
    if (!wrap || !wrap.contains(e.target)) close();
  });

  return { close };
}

/**
 * Multi-select "seen with" chips + username search.
 * @returns {{ getUsernames: () => string[], setUsernames: (list: string[]) => void, clear: () => void }}
 */
export function wireSeenWithPicker({
  chipsEl,
  input,
  resultsEl,
  token,
  initial = [],
  locked = [],
  onChange,
} = {}) {
  const selected = [];
  const lockedSet = new Set(
    (locked || []).map((u) => String(u || '').trim().toLowerCase()).filter(Boolean),
  );

  const emit = () => onChange?.(getUsernames());

  const getUsernames = () => selected.slice();

  const renderChips = () => {
    if (!chipsEl) return;
    chipsEl.innerHTML = selected.map((username) => {
      const isLocked = lockedSet.has(username);
      return `
        <span class="al-chip${isLocked ? ' is-locked' : ''}" data-username="${escapeHtml(username)}">
          ${escapeHtml(username)}
          ${isLocked
    ? ''
    : `<button type="button" class="al-chip-remove" data-remove-user="${escapeHtml(username)}" aria-label="Remove ${escapeHtml(username)}">×</button>`}
        </span>
      `;
    }).join('');
    chipsEl.querySelectorAll('[data-remove-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeUsername(btn.dataset.removeUser);
      });
    });
  };

  const addUsername = (raw) => {
    const username = String(raw || '').trim().toLowerCase();
    if (!username) return false;
    if (username.length < 3 || username.length > 24) return false;
    if (!/^[a-z0-9_]+$/.test(username)) return false;
    if (selected.includes(username)) return false;
    selected.push(username);
    renderChips();
    emit();
    return true;
  };

  const removeUsername = (raw) => {
    const username = String(raw || '').trim().toLowerCase();
    if (lockedSet.has(username)) return;
    const idx = selected.indexOf(username);
    if (idx < 0) return;
    selected.splice(idx, 1);
    renderChips();
    emit();
  };

  const setUsernames = (list = [], { silent = false } = {}) => {
    selected.length = 0;
    for (const item of list) {
      const username = String(item || '').trim().toLowerCase();
      if (!username) continue;
      if (username.length < 3 || username.length > 24) continue;
      if (!/^[a-z0-9_]+$/.test(username)) continue;
      if (selected.includes(username)) continue;
      selected.push(username);
    }
    renderChips();
    if (!silent) emit();
  };

  const clear = () => {
    selected.length = 0;
    for (const u of lockedSet) selected.push(u);
    renderChips();
    emit();
  };

  setUsernames([...(locked || []), ...(initial || [])], { silent: true });

  if (input && resultsEl && token) {
    wireUserSuggest(input, resultsEl, {
      token,
      getExclude: getUsernames,
      minChars: 0,
      onSelect: (username) => {
        addUsername(username);
        input.value = '';
        resultsEl.hidden = true;
        input.focus();
      },
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        if (addUsername(input.value)) input.value = '';
      } else if (e.key === 'Backspace' && !input.value && selected.length) {
        const last = selected[selected.length - 1];
        if (!lockedSet.has(last)) removeUsername(last);
      }
    });
  }

  return { getUsernames, setUsernames, clear, addUsername };
}

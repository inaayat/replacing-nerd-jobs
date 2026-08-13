/**
 * App chrome: sidebar shell, toasts, modal dialogs, busy buttons, and targeted
 * region updates so typing never triggers a full-page repaint.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/* ── Toasts ───────────────────────────────────────────────────────────
   Replaces the alert() calls that used to report every success and failure. */

function toastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

export function toast(message, kind = 'ok', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'ok' ? '' : kind}`.trim();
  el.textContent = message;
  toastStack().appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ── Modal ────────────────────────────────────────────────────────────
   Replaces window.confirm and window.prompt. Both resolve to null on cancel so
   callers can bail with a single falsy check. */

export function confirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <p>${body}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-act="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const previouslyFocused = document.activeElement;
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (previouslyFocused?.focus) previouslyFocused.focus();
      resolve(value);
    };
    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }

    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
    backdrop.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-act="ok"]').focus();
  });
}

export function promptDialog({
  title,
  body = '',
  label,
  value = '',
  placeholder = '',
  confirmLabel = 'Save',
  checkbox = null,
  inputType = 'text',
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const typeAttr = inputType === 'date' ? 'type="date"' : 'type="text"';
    backdrop.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        ${body ? `<p>${body}</p>` : ''}
        <label class="field">
          <span class="field-label">${escapeHtml(label)}</span>
          <input class="input" id="modal-input" ${typeAttr} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />
        </label>
        ${checkbox
          ? `<label style="display:flex;gap:8px;align-items:center;font-size:0.85rem;color:var(--muted)">
               <input type="checkbox" id="modal-check" ${checkbox.checked ? 'checked' : ''} />
               ${escapeHtml(checkbox.label)}
             </label>`
          : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>`;

    const previouslyFocused = document.activeElement;
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (previouslyFocused?.focus) previouslyFocused.focus();
      resolve(result);
    };
    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }

    const input = backdrop.querySelector('#modal-input');
    backdrop.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) {
        input.classList.add('invalid');
        input.focus();
        return;
      }
      close({ value: text, checked: backdrop.querySelector('#modal-check')?.checked ?? false });
    });
    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    input.focus();
    if (inputType !== 'date') input.select();
  });
}

/* ── Busy buttons ─────────────────────────────────────────────────────
   Every write used to fire with no feedback and no double-submit guard, which
   is rough on a serverless Postgres that can take a second to answer. */

export async function withBusy(button, label, fn) {
  if (!button) return fn();
  const original = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.innerHTML = escapeHtml(label);
  try {
    return await fn();
  } finally {
    // The DOM is often replaced by a re-render before we get here; only restore
    // the button if it is still attached.
    if (button.isConnected) {
      button.disabled = wasDisabled;
      button.innerHTML = original;
    }
  }
}

/* ── Targeted updates ─────────────────────────────────────────────────
   Views mark their updatable regions with data-section. Repainting one region
   leaves the rest of the DOM — including whatever the user is typing in —
   untouched, so there is nothing to snapshot and restore. */

/** Repaints a single named region. Returns false if it isn't on screen. */
export function patchSection(name, html) {
  const el = document.querySelector(`[data-section="${name}"]`);
  if (!el) return false;
  el.innerHTML = html;
  return true;
}

/** True when focus is inside the named region, which must not be repainted. */
export function focusWithinSection(name) {
  const el = document.querySelector(`[data-section="${name}"]`);
  return Boolean(el && document.activeElement && el.contains(document.activeElement));
}

/* ── Sidebar shell ────────────────────────────────────────────────────── */

function navLink(item, activeRoute) {
  const classes = ['nav-link'];
  if (item.id === activeRoute) classes.push('active');
  if (item.locked) classes.push('locked');

  const right = item.locked
    ? `<span class="nav-hint">${escapeHtml(item.lockedHint || 'later')}</span>`
    : item.count
      ? `<span class="nav-count${item.urgent ? ' urgent' : ''}">${item.count}</span>`
      : item.next
        ? '<span class="nav-dot" aria-hidden="true"></span>'
        : '';

  const label = `<span>${escapeHtml(item.label)}</span>${right}`;

  if (item.locked) {
    return `<span class="${classes.join(' ')}" title="${escapeHtml(item.lockedTitle || '')}" aria-disabled="true">${label}</span>`;
  }
  return `<a href="#/${item.id}" class="${classes.join(' ')}"${item.id === activeRoute ? ' aria-current="page"' : ''}>${label}</a>`;
}

export function renderShell({ body, activeRoute, navItems, context, user, narrow = false }) {
  const nav = navItems.map((item) => navLink(item, activeRoute)).join('');
  const displayName = user?.name || user?.email || 'Signed in';

  return `
    <div class="page-main">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <a href="#/planner" class="sidebar-title">
            <img src="./icon.svg" alt="" width="24" height="24" />
            One More Column
          </a>
          <p class="sidebar-tagline">because Final_FINAL_Plan wasn't enough</p>
        </div>

        ${context}

        <nav class="sidebar-nav" aria-label="Main">${nav}</nav>

        <div class="sidebar-footer">
          <div class="sidebar-user">
            <span class="sidebar-avatar" aria-hidden="true">${escapeHtml(initials(user?.name, user?.email))}</span>
            <span class="sidebar-user-name">${escapeHtml(displayName)}</span>
          </div>
          <div class="sidebar-links">
            <a class="sidebar-link" href="/">beep boop</a>
            <a class="sidebar-link" href="/account.html" id="nav-auth-link">Log out</a>
          </div>
        </div>
      </aside>

      <div class="content-scroll">
        <div class="content${narrow ? ' content-narrow' : ''}">${body}</div>
      </div>
    </div>
  `;
}

/** Active-plan block in the sidebar. Shows what you are editing at all times. */
export function renderContext({ state, planOptions, workspaceOptions, showSwitchers }) {
  const cycle = state.cycles.find((c) => c.id === state.activeCycleId);
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId);

  if (!cycle) {
    return `
      <div class="sidebar-context">
        <span class="context-label">No plan yet</span>
        <div class="context-dates">Create one to get started.</div>
      </div>`;
  }

  const multiWorkspace = state.workspaces.length > 1;

  return `
    <div class="sidebar-context">
      <div>
        <span class="context-label">Current plan</span>
        <div class="context-plan">${escapeHtml(cycle.name)}</div>
        <div class="context-dates">${escapeHtml(formatRange(cycle))}</div>
      </div>
      ${showSwitchers && state.cycles.length > 1
        ? `<div class="context-field">
             <label class="context-label" for="ctx-cycle">Switch plan</label>
             <select id="ctx-cycle" class="context-select">${planOptions}</select>
           </div>`
        : ''}
      ${showSwitchers && multiWorkspace
        ? `<div class="context-field">
             <label class="context-label" for="ctx-workspace">Workspace</label>
             <select id="ctx-workspace" class="context-select">${workspaceOptions}</select>
           </div>`
        : `<div class="context-dates">in ${escapeHtml(workspace?.name || 'workspace')}</div>`}
    </div>`;
}

export function formatRange(cycle) {
  const start = cycle?.start_date ? String(cycle.start_date).slice(0, 10) : '';
  const end = cycle?.end_date ? String(cycle.end_date).slice(0, 10) : '';
  if (start && end) return `${prettyDate(start)} → ${prettyDate(end)}`;
  if (start) return `from ${prettyDate(start)}`;
  if (end) return `until ${prettyDate(end)}`;
  return 'no dates set';
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

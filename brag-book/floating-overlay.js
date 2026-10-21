/**
 * Fixed-position overlay panels (portal to document.body). Browser-safe ESM.
 */

export const FLOAT_OVERLAY_MAX_HEIGHT_PX = 320;
export const FLOAT_OVERLAY_Z = 120;

function escapeAttrValue(value) {
  const raw = String(value || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const closeByPanel = new WeakMap();
const wired = new WeakMap();
/** @type {Map<string, { anchor: Element, panel: Element, onClose: () => void }>} */
const activeById = new Map();
let globalListenersInstalled = false;
/** Skip one outside-close cycle while a list option is pressed. */
let suppressOutsideCloseUntil = 0;

export function registerOverlayClose(panel, onClose) {
  if (panel && typeof onClose === 'function') closeByPanel.set(panel, onClose);
}

export function markOverlayOptionPress() {
  suppressOutsideCloseUntil = Date.now() + 400;
}

function overlayIdFor(panel) {
  return panel?.getAttribute?.('data-bb-overlay-panel') || '';
}

function focusReturnTarget(state) {
  if (!state) return null;
  const el = state.focusReturn || state.anchor;
  if (el && typeof el.focus === 'function') return el;
  return null;
}

function invokeClose(panel, { restoreFocus = false } = {}) {
  const id = overlayIdFor(panel);
  const state = id ? activeById.get(id) : null;
  const onClose = closeByPanel.get(panel) ?? state?.onClose;
  const focusEl = restoreFocus ? focusReturnTarget(state) : null;
  if (typeof onClose === 'function') onClose();
  else {
    panel.hidden = true;
  }
  detachOne(panel);
  if (id) activeById.delete(id);
  if (panel.isConnected) panel.remove();
  if (focusEl) {
    try { focusEl.focus({ preventScroll: true }); } catch { focusEl.focus(); }
  }
}

export function closeAllFloatingOverlaysExcept(keepPanelId = '') {
  for (const [id] of [...activeById]) {
    if (id && id !== keepPanelId) {
      const state = activeById.get(id);
      if (state?.panel) invokeClose(state.panel, { restoreFocus: false });
    }
  }
}

function closeIfOutside(event) {
  if (Date.now() < suppressOutsideCloseUntil) return;
  for (const [, state] of [...activeById]) {
    const { anchor, panel } = state;
    if (!panel || panel.hidden) continue;
    const target = event.target;
    if (anchor?.contains?.(target) || panel.contains?.(target)) continue;
    invokeClose(panel, { restoreFocus: false });
  }
}

function onGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  const entries = [...activeById.values()];
  if (!entries.length) return;
  const { panel, anchor } = entries[entries.length - 1];
  if (!panel || panel.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  invokeClose(panel, { restoreFocus: true });
  if (!anchor && panel) {
    const id = overlayIdFor(panel);
    const liveAnchor = id
      ? document.querySelector(`[data-bb-overlay-anchor="${escapeAttrValue(id)}"]`)
      : null;
    if (liveAnchor?.focus) liveAnchor.focus({ preventScroll: true });
  }
}

function ensureGlobalListeners() {
  if (globalListenersInstalled || typeof document === 'undefined') return;
  globalListenersInstalled = true;
  document.addEventListener('pointerdown', closeIfOutside, true);
  document.addEventListener('mousedown', closeIfOutside, true);
  document.addEventListener('keydown', onGlobalKeydown, true);
}

function detachOne(panel) {
  const state = wired.get(panel);
  if (!state) return;
  for (const { target, fn } of state.scrollListeners || []) {
    target.removeEventListener('scroll', fn);
  }
  if (state.focusOutListener && state.anchor) {
    state.anchor.removeEventListener('focusout', state.focusOutListener);
  }
  if (state.anchorFocusListener && state.anchor) {
    state.anchor.removeEventListener('focus', state.anchorFocusListener);
  }
  if (state.optionPressListener && state.panel) {
    state.panel.removeEventListener('pointerdown', state.optionPressListener, true);
  }
  wired.delete(panel);
}

function positionPanel(anchor, panel) {
  const anchorRect = anchor.getBoundingClientRect();
  const minWidth = 280;
  const width = Math.min(Math.max(anchorRect.width, minWidth), window.innerWidth - 16);
  let left = anchorRect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;

  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const openUp = spaceBelow < Math.min(FLOAT_OVERLAY_MAX_HEIGHT_PX, 180) && spaceAbove > spaceBelow;
  panel.classList.toggle('is-above', openUp);
  panel.style.width = `${width}px`;
  panel.style.left = `${left}px`;
  panel.style.right = 'auto';
  if (openUp) {
    panel.style.top = 'auto';
    panel.style.bottom = `${window.innerHeight - anchorRect.top + 4}px`;
  } else {
    panel.style.top = `${anchorRect.bottom + 4}px`;
    panel.style.bottom = 'auto';
  }
}

function attachOne(anchor, panel) {
  ensureGlobalListeners();
  const id = overlayIdFor(panel);
  detachOne(panel);
  panel.hidden = false;
  panel.classList.add('bb-float-overlay');
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  positionPanel(anchor, panel);

  let onClose = closeByPanel.get(panel);
  if (!onClose && id) {
    for (const candidate of document.querySelectorAll(`[data-bb-overlay-panel="${escapeAttrValue(id)}"]`)) {
      const fn = closeByPanel.get(candidate);
      if (fn) {
        onClose = fn;
        closeByPanel.set(panel, fn);
        break;
      }
    }
  }
  const focusReturn = panel.querySelector('.bb-exp-picker-search, .bb-post-map-search, .bb-exp-panel-search') || anchor;
  const optionPressListener = (event) => {
    const t = event.target;
    if (!t?.closest) return;
    if (t.closest('[data-exp-picker-option], .bb-post-map-choice, .bb-exp-picker-choice, .bb-float-overlay-foot button')) {
      markOverlayOptionPress();
    }
  };
  panel.addEventListener('pointerdown', optionPressListener, true);

  if (id) {
    activeById.set(id, {
      anchor,
      panel,
      onClose: onClose || (() => {}),
      focusReturn,
    });
    closeAllFloatingOverlaysExcept(id);
  }

  const reposition = () => {
    if (!document.body.contains(panel) || panel.hidden) return;
    const liveAnchor = document.querySelector(
      `[data-bb-overlay-anchor="${escapeAttrValue(panel.getAttribute('data-bb-overlay-panel') || '')}"]`,
    );
    if (liveAnchor) positionPanel(liveAnchor, panel);
  };

  const scrollListeners = [];
  for (const sel of ['.bb-exp-panel-scroll', '.bb-book-catalog', '.bb-resume-editor', '.job-workspace', '.bb-post-map-stack']) {
    const root = anchor.closest(sel) || document.querySelector(sel);
    if (root) {
      const fn = () => reposition();
      root.addEventListener('scroll', fn, { passive: true });
      scrollListeners.push({ target: root, fn });
    }
  }

  const focusOutListener = (event) => {
    if (panel.contains(event.relatedTarget)) return;
    queueMicrotask(() => {
      if (!document.body.contains(panel) || panel.hidden) return;
      if (panel.contains(document.activeElement)) return;
      if (anchor.contains(document.activeElement)) return;
      invokeClose(panel, { restoreFocus: false });
    });
  };
  anchor.addEventListener('focusout', focusOutListener);

  const anchorFocusListener = () => {
    if (id) closeAllFloatingOverlaysExcept(id);
  };
  anchor.addEventListener('focus', anchorFocusListener);

  const windowScroll = () => reposition();
  window.addEventListener('scroll', windowScroll, { passive: true });
  scrollListeners.push({ target: window, fn: windowScroll });
  wired.set(panel, {
    scrollListeners,
    focusOutListener,
    anchorFocusListener,
    anchor,
    panel,
    optionPressListener,
  });
}

/** Move registered overlay panels to body and position them (call after each render). */
export function refreshFloatingOverlays() {
  if (typeof document === 'undefined') return;
  const liveById = new Map();
  for (const panel of document.querySelectorAll('[data-bb-overlay-panel]')) {
    if (panel.hidden) {
      detachOne(panel);
      const id = overlayIdFor(panel);
      if (id) activeById.delete(id);
      continue;
    }
    const id = overlayIdFor(panel);
    if (!id) continue;
    const inApp = Boolean(panel.closest('#app'));
    const inAppPanel = document.querySelector(`#app [data-bb-overlay-panel="${escapeAttrValue(id)}"]`);
    const anchor = document.querySelector(`[data-bb-overlay-anchor="${escapeAttrValue(id)}"]`);
    if (!inApp && !inAppPanel && anchor?.getAttribute('aria-expanded') !== 'true') {
      detachOne(panel);
      panel.remove();
      activeById.delete(id);
      continue;
    }
    const prev = liveById.get(id);
    if (!prev || inApp) liveById.set(id, panel);
  }
  for (const [id, panel] of liveById) {
    for (const dup of document.querySelectorAll(`[data-bb-overlay-panel="${escapeAttrValue(id)}"]`)) {
      if (dup !== panel) {
        detachOne(dup);
        dup.remove();
        if (overlayIdFor(dup) === id) activeById.delete(id);
      }
    }
    const anchor = document.querySelector(`[data-bb-overlay-anchor="${escapeAttrValue(id)}"]`);
    if (!anchor) {
      panel.remove();
      detachOne(panel);
      activeById.delete(id);
      continue;
    }
    attachOne(anchor, panel);
  }

  const keptPanels = new Set(liveById.values());
  for (const panel of document.querySelectorAll('[data-bb-overlay-panel]')) {
    if (keptPanels.has(panel)) continue;
    detachOne(panel);
    panel.remove();
    const orphanId = overlayIdFor(panel);
    if (orphanId) activeById.delete(orphanId);
  }
}

export function removeFloatingOverlayPanel(panel) {
  if (!panel) return;
  invokeClose(panel, { restoreFocus: false });
  panel.remove();
}


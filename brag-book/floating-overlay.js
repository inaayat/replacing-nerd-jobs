/**
 * Fixed-position overlay panels (portal to document.body). Browser-safe ESM.
 */

export const FLOAT_OVERLAY_MAX_HEIGHT_PX = 320;
export const FLOAT_OVERLAY_Z = 120;

const closeByPanel = new WeakMap();
const wired = new WeakMap();

function detachOne(panel) {
  const state = wired.get(panel);
  if (!state) return;
  if (state.docListener) {
    document.removeEventListener('pointerdown', state.docListener, true);
  }
  if (state.keyListener) {
    document.removeEventListener('keydown', state.keyListener, true);
  }
  for (const { target, fn } of state.scrollListeners || []) {
    target.removeEventListener('scroll', fn);
  }
  wired.delete(panel);
}

export function registerOverlayClose(panel, onClose) {
  if (panel && typeof onClose === 'function') closeByPanel.set(panel, onClose);
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
  detachOne(panel);
  panel.hidden = false;
  panel.classList.add('bb-float-overlay');
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  positionPanel(anchor, panel);

  const reposition = () => {
    if (!document.body.contains(panel) || panel.hidden) return;
    const liveAnchor = document.querySelector(
      `[data-bb-overlay-anchor="${CSS.escape(panel.getAttribute('data-bb-overlay-panel') || '')}"]`,
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
  const docListener = (event) => {
    if (anchor.contains(event.target) || panel.contains(event.target)) return;
    const onClose = closeByPanel.get(panel);
    if (onClose) onClose();
    else {
      panel.hidden = true;
      detachOne(panel);
    }
  };
  document.addEventListener('pointerdown', docListener, true);

  const keyListener = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    const onClose = closeByPanel.get(panel);
    if (onClose) onClose();
    else {
      panel.hidden = true;
      detachOne(panel);
    }
  };
  document.addEventListener('keydown', keyListener, true);

  const windowScroll = () => reposition();
  window.addEventListener('scroll', windowScroll, { passive: true });
  scrollListeners.push({ target: window, fn: windowScroll });
  wired.set(panel, { docListener, keyListener, scrollListeners });
}

/** Move registered overlay panels to body and position them (call after each render). */
export function refreshFloatingOverlays() {
  if (typeof document === 'undefined') return;
  for (const panel of document.querySelectorAll('[data-bb-overlay-panel]')) {
    if (panel.hidden) {
      detachOne(panel);
      continue;
    }
    const id = panel.getAttribute('data-bb-overlay-panel');
    if (!id) continue;
    const anchor = document.querySelector(`[data-bb-overlay-anchor="${CSS.escape(id)}"]`);
    if (!anchor) {
      panel.remove();
      detachOne(panel);
      continue;
    }
    attachOne(anchor, panel);
  }
}

export function removeFloatingOverlayPanel(panel) {
  if (!panel) return;
  detachOne(panel);
  panel.remove();
}

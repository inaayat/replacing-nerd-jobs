/**
 * Brag Book PWA: offline read-only shell, flush-gated update reload, reconnect hook.
 */

export function setOfflineBanner(elements, online) {
  const { status, offline, update } = elements;
  if (!status || !offline) return;
  offline.hidden = online;
  const showStatus = !online || (update && !update.hidden);
  status.hidden = !showStatus;
  if (online) offline.hidden = true;
}

/** When offline, the signed-in editor is view-only (no new edits). */
export function setShellReadOnly(doc, online) {
  if (!doc?.documentElement) return;
  doc.documentElement.classList.toggle('bb-offline-readonly', !online);
  const app = doc.getElementById('app');
  if (!app) return;
  if (online) app.removeAttribute('inert');
  else app.setAttribute('inert', '');
}

export async function activateWaitingWorker({
  registration,
  flushBeforeReload,
  reload,
  serviceWorker,
  postMessage = (worker, data) => worker.postMessage(data),
}) {
  const waiting = registration?.waiting;
  if (!waiting) return { ok: false, reason: 'no-waiting' };
  let flushed = false;
  try {
    flushed = await flushBeforeReload();
  } catch {
    flushed = false;
  }
  if (flushed === false) return { ok: false, reason: 'flush-failed' };

  return new Promise((resolve) => {
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reload();
      resolve({ ok: true });
    };
    serviceWorker.addEventListener('controllerchange', onControllerChange);
    postMessage(waiting, { type: 'SKIP_WAITING' });
  });
}

export function initBragBookPwa({
  flushBeforeReload,
  onReconnect,
  onNetworkChange,
  document: doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  const status = doc?.getElementById('pwa-status');
  const offlineEl = doc?.getElementById('pwa-offline');
  const updateEl = doc?.getElementById('pwa-update');
  const reloadBtn = doc?.getElementById('pwa-reload');
  const elements = { status, offline: offlineEl, update: updateEl };

  const paintOnline = (online) => {
    setOfflineBanner(elements, online);
    if (doc) setShellReadOnly(doc, online);
    onNetworkChange?.(online);
    if (online && typeof onReconnect === 'function') void onReconnect();
  };

  paintOnline(navigator.onLine);
  window.addEventListener('online', () => paintOnline(true));
  window.addEventListener('offline', () => paintOnline(false));

  if (!('serviceWorker' in navigator)) return;

  let updateReloading = false;

  function revealUpdate(registration) {
    if (!registration?.waiting || !navigator.serviceWorker.controller) return;
    if (updateEl) updateEl.hidden = false;
    if (status) status.hidden = false;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.ready.then((registration) => {
      revealUpdate(registration);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') revealUpdate(registration);
        });
      });
      return registration;
    }).catch(() => {
      /* SW optional — normal browser use continues */
    });
  });

  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      if (updateReloading) return;
      reloadBtn.disabled = true;
      const registration = await navigator.serviceWorker.getRegistration('/brag-book/');
      const result = await activateWaitingWorker({
        registration,
        flushBeforeReload: flushBeforeReload || (async () => true),
        reload: () => {
          updateReloading = true;
          location.reload();
        },
        serviceWorker: navigator.serviceWorker,
      });
      if (!result.ok) {
        reloadBtn.disabled = false;
        if (result.reason === 'flush-failed' && updateEl) {
          updateEl.textContent = 'Save pending — update after reconnecting';
        }
      }
    });
  }
}

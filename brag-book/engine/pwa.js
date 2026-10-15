/** Register the Brag Book service worker for installable web app support. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/brag-book/service-worker.js', {
      scope: '/brag-book/',
    }).catch(() => {
      // Service workers require HTTPS (or localhost); ignore on unsupported hosts.
    });
  });
}

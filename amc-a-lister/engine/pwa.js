/** Register the A-Lister service worker for installable web app support. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/amc-a-lister/service-worker.js', {
      scope: '/amc-a-lister/',
    }).catch(() => {
      // Service workers require HTTPS (or localhost); ignore on unsupported hosts.
    });
  });
}

(function () {
  try {
    if (localStorage.getItem('alist.theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch {
    // ignore storage failures
  }
})();

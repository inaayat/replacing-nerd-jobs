chrome.runtime.sendMessage({ type: 'get-pending-for-board' }, (response) => {
  if (!response?.ok || !response.store?.notes?.length) return;
  window.postMessage(
    { type: 'sticky-notes-import', payload: response.store },
    window.location.origin
  );
  chrome.runtime.sendMessage({ type: 'clear-extension-queue' });
});

/**
 * Loki Content Script Entrypoint
 * Coordinates scanning and action execution messages between the background service worker and DOM helpers.
 */

(function () {
  console.log('[Loki] Content script initialized');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action, payload } = request;

    if (action === 'LOKI_PING') {
      sendResponse({ success: true, status: 'pong' });
      return true;
    }

    if (action === 'LOKI_SCAN_PAGE') {
      try {
        if (!window.__LokiDOMScanner) {
          sendResponse({ success: false, error: 'DOM Scanner module not loaded' });
          return true;
        }
        const pageData = window.__LokiDOMScanner.scan();
        sendResponse({ success: true, data: pageData });
      } catch (err) {
        console.error('[Loki Content] Error during page scan:', err);
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (action === 'LOKI_EXECUTE_ACTIONS') {
      (async () => {
        try {
          if (!window.__LokiActionExecutor) {
            sendResponse({ success: false, error: 'Action Executor module not loaded' });
            return;
          }
          const results = await window.__LokiActionExecutor.executeActions(payload.actions || []);
          sendResponse({ success: true, results });
        } catch (err) {
          console.error('[Loki Content] Error executing actions:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // Keep response channel open for async execution
    }

    if (action === 'LOKI_HIGHLIGHT_ELEMENT') {
      try {
        const el = window.__lokiElementMap?.get(payload.element_id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const origOutline = el.style.outline;
          el.style.outline = '2px solid oklch(70% 0.12 255)';
          setTimeout(() => {
            el.style.outline = origOutline || '';
          }, 2000);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Element not found' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });
})();

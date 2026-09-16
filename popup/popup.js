/**
 * Loki Popup Controller
 * Manages user interface events, mode selections, agent execution triggers,
 * settings persistence, live status updates, and action confirmation modals.
 */

const $ = id => document.getElementById(id);

let pendingConsequentialPayload = null;

// ── DOM Elements ──
const runBtn = $('run-btn');
const userRequest = $('user-request');
const askImportant = $('ask-important');
const statusDot = $('status-dot');
const statusText = $('status-text');
const historyFeed = $('history-feed');

const toggleSettingsBtn = $('toggle-settings-btn');
const settingsDrawer = $('settings-drawer');
const apiKeyInput = $('api-key-input');
const mockAiToggle = $('mock-ai-toggle');
const popupDisablePopupToggle = $('popup-disable-popup-toggle');
const saveSettingsBtn = $('save-settings-btn');
const popupOpenModelsBtn = $('popup-open-models-btn');
const popupTokenStrip = $('popup-token-strip');

const copyBodyBtn = $('copy-body-btn');
const debugCopyTextBtn = $('debug-copy-text-btn');
const debugCopyJsonBtn = $('debug-copy-json-btn');

const confirmationDrawer = $('confirmation-drawer');
const confirmationText = $('confirmation-text');
const confirmCancelBtn = $('confirm-cancel-btn');
const confirmAllowBtn = $('confirm-allow-btn');

// Mode Cards
const cardSuggest = $('card-suggest');
const cardFill = $('card-fill');
const cardAssist = $('card-assist');
const modeRadios = document.getElementsByName('mode');
const popupTokenDisplay = $('popup-token-display');

// ── Helpers ──
function getSelectedMode() {
  for (const radio of modeRadios) {
    if (radio.checked) return radio.value;
  }
  return 'SUGGEST';
}

function updateModeCardsUI() {
  const selected = getSelectedMode();
  cardSuggest.classList.toggle('active', selected === 'SUGGEST');
  cardFill.classList.toggle('active', selected === 'FILL');
  cardAssist.classList.toggle('active', selected === 'ASSIST');
}

function setStatus(text, state = 'default') {
  statusText.textContent = text;
  statusDot.className = 'status-indicator ' + state;
}

function updateTokenDisplay(stats) {
  if (!popupTokenDisplay) return;
  if (!stats) {
    popupTokenDisplay.textContent = '0 used • 1.05M ctx left';
    return;
  }
  const total = stats.lastTotal || 0;
  const prompt = stats.lastPrompt || 0;
  const out = stats.lastOutput || 0;
  const accumulated = stats.accumulatedRemainingTokens || stats.remainingContext || (1048576 - total);
  const accM = (accumulated / 1000000).toFixed(2);
  const ready = stats.readyKeysCount ?? stats.totalActiveKeys ?? 1;
  const totalKeys = stats.totalActiveKeys ?? 1;
  popupTokenDisplay.textContent = `${total.toLocaleString()} tokens • ${accM}M ctx left (${ready}/${totalKeys} models)`;
}

function addHistoryItem(text, type = 'success') {
  const item = document.createElement('div');
  item.className = `history-item ${type}`;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✖';
  item.textContent = `${icon} ${text}`;
  historyFeed.appendChild(item);
  historyFeed.scrollTop = historyFeed.scrollHeight;
}

function clearHistory() {
  historyFeed.innerHTML = '';
}

// ── Init & Settings ──
async function initSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'LOKI_GET_SETTINGS' });
    if (res && res.success && res.settings) {
      if (Array.isArray(res.settings.gemini_api_keys) && res.settings.gemini_api_keys.length > 0) {
        apiKeyInput.value = res.settings.gemini_api_keys.join('\n');
      } else {
        apiKeyInput.value = res.settings.gemini_api_key || '';
      }
      mockAiToggle.checked = res.settings.use_mock_ai === true;
      if (popupDisablePopupToggle) {
        popupDisablePopupToggle.checked = res.settings.disable_popup === true;
      }
    }
  } catch (err) {
    console.warn('[Loki Popup] Failed to load settings:', err);
  }
}

async function saveSettings() {
  const text = apiKeyInput.value.trim();
  const keys = text.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
  const payload = {
    gemini_api_key: keys.join('\n'),
    gemini_api_keys: keys,
    use_mock_ai: mockAiToggle.checked,
    disable_popup: popupDisablePopupToggle ? popupDisablePopupToggle.checked : false
  };

  try {
    await chrome.runtime.sendMessage({ action: 'LOKI_SAVE_SETTINGS', payload });
    if (saveSettingsBtn) {
      const origText = saveSettingsBtn.textContent;
      saveSettingsBtn.textContent = '✓ Settings Saved!';
      setTimeout(() => { saveSettingsBtn.textContent = origText; }, 1500);
    }
    addHistoryItem(`Saved settings (${keys.length} API key${keys.length === 1 ? '' : 's'} registered)`, 'success');
  } catch (err) {
    addHistoryItem(`Failed to save settings: ${err.message}`, 'warning');
  }
}

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', saveSettings);
}

async function triggerModelDashboard() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && !isRestrictedUrl(tab.url)) {
      await ensureContentInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_TOGGLE_MODEL_DASHBOARD', forceOpen: true });
      window.close();
    }
  } catch (err) {
    console.warn('[Loki Popup] Could not open model dashboard in tab:', err);
  }
}

if (popupOpenModelsBtn) popupOpenModelsBtn.addEventListener('click', triggerModelDashboard);
if (popupTokenStrip) popupTokenStrip.addEventListener('click', triggerModelDashboard);

// ── Mode selection events ──
[cardSuggest, cardFill, cardAssist].forEach(card => {
  card.addEventListener('click', () => {
    const radio = card.querySelector('input[type="radio"]');
    if (radio) {
      radio.checked = true;
      updateModeCardsUI();
    }
  });
});

// Settings Drawer Toggle
if (toggleSettingsBtn && settingsDrawer) {
  toggleSettingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.toggle('open');
  });
}

// Helper to check restricted URLs
function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('https://chromewebstore.google.com') ||
    url.startsWith('https://chrome.google.com/webstore')
  );
}

// Ensures content scripts are active on the tab; injects them dynamically if needed
async function ensureContentInjected(tabId) {
  try {
    const pingRes = await chrome.tabs.sendMessage(tabId, { action: 'LOKI_PING' });
    if (pingRes && pingRes.status === 'pong') return true;
  } catch (err) {
    // Content script not ready; proceed to inject
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      'content/dom-scanner.js',
      'content/action-executor.js',
      'content/side-panel.js',
      'content/content.js'
    ]
  });
  await new Promise(r => setTimeout(r, 100));
  return true;
}

// Clickable tip bar to open In-Page HUD
const openHudBtn = $('open-hud-btn');
if (openHudBtn) {
  openHudBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (isRestrictedUrl(tab.url)) {
        setStatus('Cannot open side panel on browser system pages.', 'warning');
        addHistoryItem('Loki side panel works on regular web pages and forms, not browser internal pages.', 'warning');
        return;
      }

      await ensureContentInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_TOGGLE_HUD', forceOpen: true });
      window.close();
    } catch (err) {
      console.warn('[Loki Popup] Failed to send open HUD message:', err);
      setStatus('Could not connect: ' + err.message, 'error');
      addHistoryItem('Could not connect to page. Please refresh the page tab and try again.', 'warning');
    }
  });
}

// ── Textarea Prompt Injection & Shortcut Handlers ──
if (userRequest) {
  userRequest.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runBtn.click();
    }
  });
}

document.querySelectorAll('.prompt-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const textToInject = chip.getAttribute('data-prompt') || chip.innerText;
    if (userRequest) {
      if (userRequest.value.trim().length > 0) {
        userRequest.value = `${userRequest.value.trim()} ${textToInject}`;
      } else {
        userRequest.value = textToInject;
      }
      userRequest.focus();
    }
  });
});

// ── Run Agent Flow ──
runBtn.addEventListener('click', async () => {
  const requestText = userRequest.value.trim();
  const mode = getSelectedMode();
  const askBeforeImp = askImportant.checked;

  clearHistory();
  confirmationDrawer.classList.remove('active');
  pendingConsequentialPayload = null;

  runBtn.disabled = true;
  setStatus('Scanning webpage...', 'running');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'LOKI_RUN_AGENT',
      payload: {
        requestText,
        mode,
        askBeforeImportant: askBeforeImp
      }
    });

    if (!response.success) {
      throw new Error(response.error || 'Agent execution failed');
    }

    const { aiResponse, executedResults, requiresConfirmation, reason, pendingConsequentialActions } = response;

    if (response.workflowTrace) {
      updateWorkflowTraceUI(response.workflowTrace);
    }

    if (response.tokenStats) {
      updateTokenDisplay(response.tokenStats);
    }

    // Display AI explanation
    if (aiResponse && aiResponse.message) {
      addHistoryItem(aiResponse.message, 'success');
    }

    // Display executed actions results
    if (executedResults && executedResults.length > 0) {
      executedResults.forEach(res => {
        if (res.success) {
          addHistoryItem(res.message || `Executed ${res.action.type}`, 'success');
        } else {
          addHistoryItem(`Failed: ${res.error}`, 'warning');
        }
      });
    }

    if (requiresConfirmation) {
      setStatus('Waiting for confirmation...', 'warning');
      pendingConsequentialPayload = pendingConsequentialActions;
      confirmationText.textContent = reason || 'The next step involves a consequential page interaction.';
      confirmationDrawer.classList.add('active');
      addHistoryItem('⚠ Confirmation required before proceeding', 'warning');
    } else {
      setStatus('Completed', 'success');
    }

  } catch (err) {
    console.error('[Loki Popup] Agent error:', err);
    setStatus(`Error: ${err.message}`, 'error');
    addHistoryItem(`Error: ${err.message}`, 'warning');
    await updateWorkflowTraceUI();
  } finally {
    runBtn.disabled = false;
  }
});

// ── Confirmation Modal Handlers ──
confirmCancelBtn.addEventListener('click', () => {
  confirmationDrawer.classList.remove('active');
  pendingConsequentialPayload = null;
  setStatus('Action cancelled by user', 'default');
  addHistoryItem('User cancelled pending actions', 'warning');
});

confirmAllowBtn.addEventListener('click', async () => {
  if (!pendingConsequentialPayload) return;

  const actionsToRun = pendingConsequentialPayload;
  confirmationDrawer.classList.remove('active');
  pendingConsequentialPayload = null;

  setStatus('Executing confirmed action...', 'running');

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'LOKI_CONFIRM_ACTIONS',
      payload: { actions: actionsToRun }
    });

    if (res.success && res.results) {
      res.results.forEach(r => {
        if (r.success) addHistoryItem(r.message || 'Executed action', 'success');
        else addHistoryItem(`Failed: ${r.error}`, 'warning');
      });
      setStatus('Completed', 'success');
    } else {
      throw new Error(res.error || 'Failed to execute confirmed actions');
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    addHistoryItem(`Error: ${err.message}`, 'warning');
  }
});

// ── Debug Copy & Workflow Trace Utilities ──
const debugCopyTraceBtn = $('debug-copy-trace-btn');
const debugTraceDrawer = $('debug-trace-drawer');
const closeTraceDrawerBtn = $('close-trace-drawer-btn');
const copyTraceJsonBtn = $('copy-trace-json-btn');
const debugTraceContent = $('debug-trace-content');

let latestWorkflowTrace = null;

async function updateWorkflowTraceUI(traceData) {
  if (traceData) {
    latestWorkflowTrace = traceData;
  } else {
    const data = await chrome.storage.local.get('latest_workflow_trace');
    latestWorkflowTrace = data.latest_workflow_trace || null;
  }

  if (debugTraceContent) {
    if (latestWorkflowTrace) {
      debugTraceContent.textContent = JSON.stringify(latestWorkflowTrace, null, 2);
    } else {
      debugTraceContent.textContent = 'No workflow execution recorded yet. Run an agent action to inspect trace.';
    }
  }
}

if (debugCopyTraceBtn) {
  debugCopyTraceBtn.addEventListener('click', async () => {
    await updateWorkflowTraceUI();
    if (debugTraceDrawer) debugTraceDrawer.classList.toggle('open');

    if (latestWorkflowTrace) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(latestWorkflowTrace, null, 2));
        const origText = debugCopyTraceBtn.textContent;
        debugCopyTraceBtn.textContent = '✓ Trace Copied!';
        addHistoryItem('Copied debug workflow trace log to clipboard', 'success');
        setTimeout(() => {
          debugCopyTraceBtn.textContent = origText;
        }, 1800);
      } catch (err) {
        addHistoryItem(`Trace loaded: ${err.message}`, 'warning');
      }
    } else {
      addHistoryItem('No workflow log available to copy', 'warning');
    }
  });
}

if (copyTraceJsonBtn) {
  copyTraceJsonBtn.addEventListener('click', async () => {
    if (latestWorkflowTrace) {
      await navigator.clipboard.writeText(JSON.stringify(latestWorkflowTrace, null, 2));
      const orig = copyTraceJsonBtn.textContent;
      copyTraceJsonBtn.textContent = '✓ Copied!';
      setTimeout(() => copyTraceJsonBtn.textContent = orig, 1500);
    }
  });
}

if (closeTraceDrawerBtn) {
  closeTraceDrawerBtn.addEventListener('click', () => {
    if (debugTraceDrawer) debugTraceDrawer.classList.remove('open');
  });
}

// ── Copy All Error Diagnostics Log ──
const debugCopyErrorBtn = $('debug-copy-error-btn');

async function copyAllErrorLogs() {
  try {
    const data = await chrome.storage.local.get([
      'latest_error_log',
      'latest_workflow_trace',
      'key_stats_map',
      'latest_token_stats'
    ]);

    const historyItems = Array.from(historyFeed.querySelectorAll('.history-item')).map(el => el.textContent.trim());

    const errorReport = {
      timestamp: new Date().toISOString(),
      report_title: 'Emerald Diagnostic Error & Execution Log',
      extension_version: chrome.runtime.getManifest().version,
      ui_history_log: historyItems,
      latest_error: data.latest_error_log || null,
      workflow_trace: data.latest_workflow_trace || null,
      key_health_status: data.key_stats_map || null,
      token_metrics: data.latest_token_stats || null
    };

    const formattedLog = JSON.stringify(errorReport, null, 2);
    await navigator.clipboard.writeText(formattedLog);

    if (debugCopyErrorBtn) {
      const orig = debugCopyErrorBtn.innerHTML;
      debugCopyErrorBtn.innerHTML = '✓ Error Log Copied!';
      setTimeout(() => { debugCopyErrorBtn.innerHTML = orig; }, 2000);
    }
    addHistoryItem('Copied full error diagnostic log to clipboard', 'success');
  } catch (err) {
    addHistoryItem(`Failed to copy error log: ${err.message}`, 'warning');
  }
}

if (debugCopyErrorBtn) {
  debugCopyErrorBtn.addEventListener('click', copyAllErrorLogs);
}

async function copyPageData(copyTextOnly, targetBtn) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab');
    if (isRestrictedUrl(tab.url)) throw new Error('Cannot inspect browser system pages');

    await ensureContentInjected(tab.id);
    const scanRes = await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_SCAN_PAGE' });

    if (!scanRes || !scanRes.success) throw new Error(scanRes?.error || 'Failed to scan page');

    const contentToCopy = copyTextOnly
      ? (scanRes.data.body_text || '')
      : JSON.stringify(scanRes.data, null, 2);

    await navigator.clipboard.writeText(contentToCopy);

    const origText = targetBtn.textContent;
    targetBtn.textContent = copyTextOnly ? '✓ Text Copied!' : '✓ JSON Copied!';
    addHistoryItem(`Copied page ${copyTextOnly ? 'text' : 'JSON'} to clipboard`, 'success');

    setTimeout(() => {
      targetBtn.textContent = origText;
    }, 1800);
  } catch (err) {
    addHistoryItem(`Failed to copy: ${err.message}`, 'warning');
  }
}

if (copyBodyBtn) copyBodyBtn.addEventListener('click', (e) => copyPageData(true, e.currentTarget));
if (debugCopyTextBtn) debugCopyTextBtn.addEventListener('click', (e) => copyPageData(true, e.currentTarget));
if (debugCopyJsonBtn) debugCopyJsonBtn.addEventListener('click', (e) => copyPageData(false, e.currentTarget));

// Init
updateModeCardsUI();
initSettings();
updateWorkflowTraceUI();

chrome.storage.local.get(['latest_token_stats'], (res) => {
  if (res?.latest_token_stats) {
    updateTokenDisplay(res.latest_token_stats);
  }
});

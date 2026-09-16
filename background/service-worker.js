/**
 * Loki Service Worker (Manifest V3 Background Script)
 * Manages the AI Agent Loop, safety confirmation checks, and extension storage.
 */

import { LokiAIClient } from './ai-client.js';

const aiClient = new LokiAIClient();

// Never ship a production API key in source. Users can add their own keys in the extension settings.
const HARDCODED_GEMINI_API_KEY = '';

console.log('[Loki Service Worker] Background initialized');

/**
 * Checks whether an action list contains consequential steps (form submission, buy, delete, pay, etc.)
 */
function isConsequentialAction(action, elementMap = []) {
  if (!action) return false;
  if (action.type === 'click') {
    const targetEl = elementMap.find(e => e.id === action.element_id);
    if (targetEl) {
      if (targetEl.is_submit) return true;
      const text = (targetEl.text || targetEl.aria_label || targetEl.label || '').toLowerCase();
      if (/submit|kirim|pay|buy|purchase|send|delete|confirm|remove|selesai|finish/i.test(text)) return true;
    }

    function isMetadataField(element) {
      const text = [
        element?.label,
        element?.question,
        element?.placeholder,
        element?.name
      ].filter(Boolean).join(' ').toLowerCase();
      return /\b(name|nama|age|usia|class|kelas|email|e-mail|phone|telepon|student id|nisn?|address|alamat)\b/i.test(text);
    }
  }
  return false;
}

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

/**
 * Ensures content scripts are active on the tab; injects them if not present.
 */
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
      'lib/katex/katex.min.js',
      'content/side-panel.js',
      'content/content.js'
    ]
  });
  await new Promise(r => setTimeout(r, 100));
  return true;
}

async function sendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    // A content-script message port can close while the page is being refreshed.
    // Re-establish the content scripts once, then retry the operation.
    await ensureContentInjected(tabId);
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (retryError) {
      throw new Error(`${retryError?.message || firstError?.message || 'Unable to communicate with the page.'}`);
    }
  }
}

function parseApiKeys(hardcoded, settings) {
  const keys = [];
  const seen = new Set();

  function add(val) {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach(add);
      return;
    }
    if (typeof val !== 'string') return;

    val.split(/[\n,]+/).forEach(k => {
      const clean = k.trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        keys.push(clean);
      }
    });
  }

  add(hardcoded);
  add(settings?.gemini_api_keys);
  add(settings?.gemini_api_key);

  return keys;
}

function buildReasoningDetails(pageData, aiResponse) {
  const elements = pageData?.elements || [];
  const actions = aiResponse?.actions || [];
  const actionById = new Map(actions.map(action => [action.element_id, action]));
  const groups = new Map();
  const fullReasoning = aiResponse?.reasoning || aiResponse?.message || 'No additional reasoning was provided.';
  const usedModel = aiResponse?.usedModel || null;

  function reasoningForQuestion(number) {
    const matcher = new RegExp(`(?:^|\\n)\\s*(?:Question|Q)\\s*${number}\\s*[:.)-]([\\s\\S]*?)(?=\\n\\s*(?:Question|Q)\\s*${number + 1}\\s*[:.)-]|$)`, 'i');
    const match = fullReasoning.match(matcher);
    return match?.[1]?.trim() || fullReasoning;
  }

  elements
    .filter(element => ['radio', 'checkbox', 'input', 'textarea', 'select', 'combobox'].includes(element.type))
    .forEach(element => {
      const key = element.question || `field:${element.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(element);
    });

  return Array.from(groups.values()).map((group, index) => {
    const first = group[0];
    const questionSet = pageData?.question_sets?.[index];
    const selected = group
      .map(element => ({ element, action: actionById.get(element.id) }))
      .filter(item => item.action && ['check', 'select', 'fill'].includes(item.action.type));

    return {
      number: index + 1,
      question: questionSet?.question || first.question || first.label || `Field ${index + 1}`,
      options: questionSet?.options || group.map(element => ({
        id: element.id,
        label: element.label || element.placeholder || element.value || element.name || element.id,
        type: element.type
      })),
      answer: selected.map(({ element, action }) => ({
        id: element.id,
        label: element.label || element.placeholder || element.value || element.name || element.id,
        value: action.value || null,
        action: action.type
      })),
      reasoning: reasoningForQuestion(index + 1),
      image: questionSet?.image || null,
      usedModel
    };
  });
}

/**
 * Main agent loop handler.
 */
async function handleAgentRun({ requestText = '', mode = 'FILL', askBeforeImportant = false, customInstruction = '' } = {}, requestedTabId = null) {
  let pageData = null;
  let aiResponse = null;
  let safeActions = [];
  let consequentialActions = [];
  let execResults = [];
  let errorMsg = null;
  let useMock = false;
  let apiKeys = [];

  try {
    // 1. Get active tab
    let tab = requestedTabId ? await chrome.tabs.get(requestedTabId) : null;
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    if (!tab || !tab.id) {
      throw new Error('No active browser tab found.');
    }

    if (isRestrictedUrl(tab.url)) {
      throw new Error('Loki cannot inspect restricted browser pages.');
    }

    // 2. Ensure content script is injected and ready
    await ensureContentInjected(tab.id);
    const scanRes = await sendTabMessage(tab.id, { action: 'LOKI_SCAN_PAGE' });

    if (!scanRes || !scanRes.success) {
      throw new Error(scanRes?.error || 'Failed to scan webpage DOM.');
    }

    pageData = scanRes.data;

    // Capture visual screenshot of active tab viewport for multimodal Gemini Vision
    let screenshotBase64 = null;
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 75 });
      if (dataUrl && dataUrl.includes(',')) {
        screenshotBase64 = dataUrl.split(',')[1];
      }
    } catch (shotErr) {
      console.warn('[Loki Service Worker] Screenshot capture failed or skipped:', shotErr);
    }

    // 3. Fetch stored or hardcoded Gemini API Keys
    const settings = await chrome.storage.local.get([
      'gemini_api_key',
      'gemini_api_keys',
      'use_mock_ai',
      'custom_ai_instruction',
      'key_stats_map',
      'allow_model_downgrade',
      'preferred_gemini_model'
    ]);

    apiKeys = parseApiKeys(HARDCODED_GEMINI_API_KEY, settings);
    useMock = settings.use_mock_ai === true || apiKeys.length === 0;

    const effectiveCustomInstruction = (customInstruction && customInstruction.trim())
      ? customInstruction.trim()
      : (settings.custom_ai_instruction || '');

    // 4. Get AI Decision (multimodal: DOM structure + Visual Screenshot) with multi-key failover
    if (useMock) {
      aiResponse = aiClient.generateMockResponse(pageData, requestText, mode);
    } else {
      aiResponse = await aiClient.callGeminiAPI(
        apiKeys,
        pageData,
        requestText,
        mode,
        screenshotBase64,
        effectiveCustomInstruction,
        {
          allowDowngrade: settings.allow_model_downgrade !== false,
          preferredModel: settings.preferred_gemini_model || 'gemini-3.1-flash'
        }
      );
    }

    // 5. Validate mode constraints and safety confirmation rules
    const explicitMetadataRequest = `${requestText} ${customInstruction}`.trim();
    const pendingActions = (aiResponse.actions || []).filter(action => {
      const target = pageData.elements.find(element => element.id === action.element_id);
      if (!target || !isMetadataField(target)) return true;
      return new RegExp(`\\b${(target.label || target.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(explicitMetadataRequest)
        || /\b(name|nama|age|usia|class|kelas|email|phone|telepon|student id|nisn?|address|alamat)\b/i.test(explicitMetadataRequest);
    });
    for (const act of pendingActions) {
      const isConsequential = isConsequentialAction(act, pageData.elements);
      if (isConsequential) {
        consequentialActions.push(act);
      } else {
        safeActions.push(act);
      }
    }

    // 6. Execute safe actions first (if not in SUGGEST mode)
    if (safeActions.length > 0 && mode !== 'SUGGEST') {
      const execRes = await sendTabMessage(tab.id, {
        action: 'LOKI_EXECUTE_ACTIONS',
        payload: { actions: safeActions }
      });
      execResults = execRes?.results || [];
    }
  } catch (err) {
    errorMsg = err.message;
    console.error('[Loki Service Worker] Error in handleAgentRun:', err);
  }

  // ALWAYS build and persist debug workflow trace with full AI reasoning
  const workflowTrace = {
    timestamp: new Date().toISOString(),
    status: errorMsg ? 'error' : (consequentialActions.length > 0 ? 'confirmation_required' : 'completed'),
    error: errorMsg || null,
    input: {
      requestText: requestText || '(No specific text instruction)',
      mode,
      askBeforeImportant
    },
    page_info: pageData ? {
      title: pageData.title,
      url: pageData.url,
      interactive_elements_count: pageData.elements?.length || 0,
      body_text_length: (pageData.body_text || '').length,
      sample_elements: (pageData.elements || []).slice(0, 5).map(e => ({ id: e.id, type: e.type, label: e.label, question: e.question }))
    } : null,
    ai_engine: useMock ? 'Mock AI Engine' : 'Google Gemini API',
    ai_response: aiResponse ? {
      status: aiResponse.status,
      reasoning: aiResponse.reasoning || null,
      message: aiResponse.message,
      actions_count: (aiResponse.actions || []).length,
      actions: aiResponse.actions || []
    } : null,
    execution: {
      safe_actions_count: safeActions.length,
      consequential_actions_count: consequentialActions.length,
      results: execResults
    }
  };

  // Compute and persist Gemini token consumption, per-key metrics & accumulated remaining context window
  let tokenStats = null;
  const usage = aiResponse?.usageMetadata;
  const usedApiKey = aiResponse?.usedApiKey || (apiKeys.length > 0 ? apiKeys[0] : null);

  const storedKeyData = await chrome.storage.local.get(['key_stats_map', 'session_tokens_total', 'session_requests_count']);
  const keyStatsMap = storedKeyData.key_stats_map || {};

  if (usage) {
    const promptTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const totalTokens = usage.totalTokenCount || (promptTokens + outputTokens);
    const contextCapacity = 1048576; // 1.05M tokens for Gemini 1.5/2.0 Flash

    // Update stats for the specific key that handled the request
    if (usedApiKey) {
      const prevKeyStat = keyStatsMap[usedApiKey] || { totalUsed: 0, requests: 0 };
      keyStatsMap[usedApiKey] = {
        totalUsed: (prevKeyStat.totalUsed || 0) + totalTokens,
        requests: (prevKeyStat.requests || 0) + 1,
        lastPrompt: promptTokens,
        lastOutput: outputTokens,
        lastTotal: totalTokens,
        lastUsed: Date.now(),
        status: 'ready'
      };
    }

    // Merge any key health statuses discovered during failover
    if (aiResponse?.keyHealthMap) {
      for (const [k, health] of Object.entries(aiResponse.keyHealthMap)) {
        if (!keyStatsMap[k]) keyStatsMap[k] = { totalUsed: 0, requests: 0 };
        keyStatsMap[k].status = health.status || 'ready';
        if (health.error) keyStatsMap[k].lastError = health.error;
      }
    }

    // Calculate accumulated remaining capacity across all registered keys
    let accumulatedRemainingTokens = 0;
    const keyStatsList = apiKeys.map((k, idx) => {
      const masked = aiClient.maskKey(k);
      const stat = keyStatsMap[k] || { totalUsed: 0 };
      const used = stat.totalUsed || 0;
      const rem = Math.max(0, contextCapacity - used);
      const isCurrent = k === usedApiKey;
      const status = stat.status || 'ready';
      accumulatedRemainingTokens += rem;
      return {
        index: idx + 1,
        masked,
        status,
        totalUsed: used,
        remainingContext: rem,
        isCurrent
      };
    });

    const sessionTotal = (storedKeyData.session_tokens_total || 0) + totalTokens;
    const requestsCount = (storedKeyData.session_requests_count || 0) + 1;

    tokenStats = {
      lastPrompt: promptTokens,
      lastOutput: outputTokens,
      lastTotal: totalTokens,
      remainingContext: Math.max(0, contextCapacity - totalTokens),
      contextCapacity: contextCapacity,
      sessionTotal: sessionTotal,
      requestsCount: requestsCount,
      usedKeyMasked: aiResponse?.usedKeyMasked || (usedApiKey ? aiClient.maskKey(usedApiKey) : 'Gemini'),
      usedKeyIndex: aiResponse?.usedKeyIndex ?? 0,
      totalActiveKeys: apiKeys.length,
      readyKeysCount: keyStatsList.filter(item => item.status === 'ready').length,
      accumulatedRemainingTokens: accumulatedRemainingTokens,
      keyStatsList: keyStatsList,
      timestamp: Date.now()
    };

    workflowTrace.token_usage = tokenStats;
  } else if (apiKeys.length > 0) {
    // Generate base model stats list even without immediate usage metadata
    const contextCapacity = 1048576;
    let accumulatedRemainingTokens = 0;
    const keyStatsList = apiKeys.map((k, idx) => {
      const masked = aiClient.maskKey(k);
      const stat = keyStatsMap[k] || { totalUsed: 0 };
      const used = stat.totalUsed || 0;
      const rem = Math.max(0, contextCapacity - used);
      accumulatedRemainingTokens += rem;
      return {
        index: idx + 1,
        masked,
        status: stat.status || 'ready',
        totalUsed: used,
        remainingContext: rem,
        isCurrent: idx === 0
      };
    });

    tokenStats = {
      lastPrompt: 0,
      lastOutput: 0,
      lastTotal: 0,
      remainingContext: contextCapacity,
      contextCapacity: contextCapacity,
      sessionTotal: storedKeyData.session_tokens_total || 0,
      requestsCount: storedKeyData.session_requests_count || 0,
      usedKeyMasked: aiClient.maskKey(apiKeys[0]),
      usedKeyIndex: 0,
      totalActiveKeys: apiKeys.length,
      readyKeysCount: keyStatsList.filter(item => item.status === 'ready').length,
      accumulatedRemainingTokens: accumulatedRemainingTokens,
      keyStatsList: keyStatsList,
      timestamp: Date.now()
    };
  }

  const storagePayload = {
    latest_workflow_trace: workflowTrace,
    latest_reasoning: aiResponse?.reasoning || null,
    latest_reasoning_details: buildReasoningDetails(pageData, aiResponse),
    latest_used_model: aiResponse?.usedModel || null,
    key_stats_map: keyStatsMap,
    ...(tokenStats ? {
      latest_token_stats: tokenStats,
      session_tokens_total: tokenStats.sessionTotal,
      session_requests_count: tokenStats.requestsCount
    } : {})
  };

  if (errorMsg) {
    storagePayload.latest_error_log = {
      timestamp: new Date().toISOString(),
      error_message: errorMsg,
      page_title: pageData?.title || 'Unknown Webpage',
      page_url: pageData?.url || 'Unknown URL',
      elements_detected: pageData?.elements?.length || 0,
      api_keys_count: apiKeys.length,
      mode: mode,
      user_request: requestText || '(none)',
      key_health_status: keyStatsMap,
      workflow_trace: workflowTrace
    };
  }

  await chrome.storage.local.set(storagePayload);

  if (errorMsg) {
    throw new Error(errorMsg);
  }

  if (mode === 'SUGGEST') {
    return {
      status: 'success',
      mode: 'SUGGEST',
      aiResponse: {
        status: 'answer',
        message: aiResponse.message || 'Page analysis completed.',
        actions: []
      },
      reasoningDetails: [],
      tokenStats,
      executedResults: [],
      workflowTrace,
      requiresConfirmation: false
    };
  }

  if (consequentialActions.length > 0) {
    return {
      status: 'confirmation_required',
      mode,
      aiResponse,
      usedModel: aiResponse?.usedModel || null,
      reasoningDetails: buildReasoningDetails(pageData, aiResponse),
      tokenStats,
      executedResults: execResults,
      workflowTrace,
      pendingConsequentialActions: consequentialActions,
      requiresConfirmation: true,
      reason: `The AI wants to execute important action(s): ${consequentialActions.map(a => a.type + ' ' + a.element_id).join(', ')}.`
    };
  }

  return {
    status: 'completed',
    mode,
    aiResponse,
    usedModel: aiResponse?.usedModel || null,
    reasoningDetails: buildReasoningDetails(pageData, aiResponse),
    tokenStats,
    executedResults: execResults,
    workflowTrace,
    requiresConfirmation: false
  };
}

// ── Message Router ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  if (action === 'LOKI_RUN_AGENT') {
    (async () => {
      try {
        const result = await handleAgentRun(payload, sender?.tab?.id || null);
        sendResponse({ success: true, ...result });
      } catch (err) {
        console.error('[Loki Service Worker] Agent request failed:', err);
        sendResponse({ success: false, error: err?.message || 'Agent request failed.' });
      }
    })();
    return true; // Keep response channel open
  }

  if (action === 'LOKI_CONFIRM_ACTIONS') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) throw new Error('Active tab not found');

        const execRes = await chrome.tabs.sendMessage(tab.id, {
          action: 'LOKI_EXECUTE_ACTIONS',
          payload: { actions: payload.actions }
        });

        sendResponse({ success: true, results: execRes?.results || [] });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (action === 'LOKI_GET_SETTINGS') {
    chrome.storage.local.get([
      'gemini_api_key',
      'gemini_api_keys',
      'use_mock_ai',
      'disable_popup',
      'custom_ai_instruction'
    ]).then(res => {
      sendResponse({ success: true, settings: res });
    });
    return true;
  }

  if (action === 'LOKI_GET_TOKEN_STATS' || action === 'LOKI_GET_MODEL_DASHBOARD') {
    chrome.storage.local.get([
      'latest_token_stats',
      'session_tokens_total',
      'session_requests_count',
      'key_stats_map',
      'gemini_api_keys',
      'gemini_api_key'
    ]).then(res => {
      const apiKeys = parseApiKeys(HARDCODED_GEMINI_API_KEY, res);
      let stats = res.latest_token_stats || null;
      const contextCapacity = 1048576;
      const keyStatsMap = res.key_stats_map || {};

      // Rebuild the key list from current storage so newly added keys appear immediately,
      // even when the last request's token snapshot was created with fewer keys.
      if (apiKeys.length > 0) {
        const keyStatsList = apiKeys.map((key, idx) => {
          const stat = keyStatsMap[key] || {};
          const totalUsed = stat.totalUsed || 0;
          return {
            index: idx + 1,
            masked: aiClient.maskKey(key),
            status: stat.status || 'ready',
            totalUsed,
            remainingContext: Math.max(0, contextCapacity - totalUsed),
            isCurrent: idx === 0
          };
        });
        stats = {
          ...(stats || {}),
          lastPrompt: stats?.lastPrompt || 0,
          lastOutput: stats?.lastOutput || 0,
          lastTotal: stats?.lastTotal || 0,
          remainingContext: stats?.remainingContext || contextCapacity,
          contextCapacity,
          sessionTotal: stats?.sessionTotal || res.session_tokens_total || 0,
          requestsCount: stats?.requestsCount || res.session_requests_count || 0,
          usedKeyMasked: stats?.usedKeyMasked || aiClient.maskKey(apiKeys[0]),
          usedKeyIndex: stats?.usedKeyIndex || 0,
          totalActiveKeys: apiKeys.length,
          readyKeysCount: keyStatsList.filter(item => item.status === 'ready').length,
          accumulatedRemainingTokens: keyStatsList.reduce((sum, item) => sum + item.remainingContext, 0),
          keyStatsList
        };
      }

      if (!stats && apiKeys.length > 0) {
        stats = {
          lastPrompt: 0,
          lastOutput: 0,
          lastTotal: 0,
          remainingContext: contextCapacity,
          contextCapacity: contextCapacity,
          sessionTotal: res.session_tokens_total || 0,
          requestsCount: res.session_requests_count || 0,
          usedKeyMasked: aiClient.maskKey(apiKeys[0]),
          usedKeyIndex: 0,
          totalActiveKeys: apiKeys.length,
          readyKeysCount: apiKeys.length,
          accumulatedRemainingTokens: apiKeys.length * contextCapacity,
          keyStatsList: apiKeys.map((k, idx) => ({
            index: idx + 1,
            masked: aiClient.maskKey(k),
            status: 'ready',
            totalUsed: 0,
            remainingContext: contextCapacity,
            isCurrent: idx === 0
          }))
        };
      }

      sendResponse({ success: true, tokenStats: stats });
    });
    return true;
  }

  if (action === 'LOKI_SAVE_SETTINGS') {
    chrome.storage.local.set(payload).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ── Native Browser Keyboard Commands (Alt+1, Alt+2, Alt+3, Alt+0) ──
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Loki Service Worker] Command triggered:', command);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) return;

    await ensureContentInjected(tab.id);

    if (command === 'toggle-hud') {
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_OPEN_SECTION', section: 'prompt' });
    } else if (command === 'toggle-reasoning') {
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_OPEN_SECTION', section: 'reasoning' });
    } else if (command === 'solve-form') {
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_RUN_SOLVER' });
    } else if (command === 'toggle-model-dashboard') {
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_OPEN_SECTION', section: 'models' });
    } else if (command === 'toggle-settings') {
      await chrome.tabs.sendMessage(tab.id, { action: 'LOKI_OPEN_UTILITY', panel: 'settings' });
    }
  } catch (err) {
    console.warn('[Loki Service Worker] Failed to dispatch command to active tab:', err);
  }
});

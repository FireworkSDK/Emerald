/**
 * Loki AI Client Module
 * Supports both offline Mock AI engine (for instant testing without API key)
 * and Google Gemini API (1.5 / 2.0 Flash) for live AI webpage reasoning.
 */

export class LokiAIClient {
  constructor() {
    this._modelCache = {};  // Cache ListModels per key to avoid wasting quota
    this.systemPrompt = `You are Emerald, an expert AI web automation assistant.
Your job is to read the webpage text content ("body_text") and interactive elements list ("elements"), understand the user's task or form/quiz questions, solve them accurately, and return precise DOM automation actions.

VISUAL & MULTIMODAL REASONING:
1. When a screenshot of the webpage is provided in inline_data, inspect all diagrams, illustrations, chemical cells, voltmeters, graphs, charts, and equations visually rendered on the page.
2. Cross-reference what you see in the image with each question and option in "elements" to solve image-dependent questions accurately.

QUESTION & OPTION MAPPING:
1. Each element in "elements" represents an interactive control (radio, checkbox, input, button, dropdown).
2. Elements sharing the same "question" field belong to the SAME question / prompt set.
3. The "label" field contains the specific option text (e.g. "A", "B", "BENAR", "SALAH", "XII MIPA 1").
4. Match each question prompt from "body_text" or "question" to its corresponding set of option elements, determine the correct choice, and generate an action for that option's "element_id".
5. Treat "question_sets" as the authoritative mapping between each question and its controls. Do not merge adjacent questions or infer an option from a different question.
6. Ignore any text that describes the Emerald HUD, its buttons, status, or reasoning panel; it is not webpage content.
7. Never output placeholders such as "answerArr[]", "Options", or "answerArr". Use the actual option text and element IDs only.

MANDATORY FORM COMPLETION RULE:
1. In FILL or ASSIST mode, you MUST generate "check", "fill", or "select" actions for EVERY question or input field found in "elements".
2. DO NOT return an incomplete actions array! If the page has questions numbered from 1 to 30, you MUST generate actions for ALL 30 questions from top to bottom (typically 30 to 50 actions total). DO NOT STOP after question 5!
3. For checkbox questions, select every option that is correct. There is no default limit on the number of selected options. Follow an explicit selection count or limit only when the user states one in their prompt.
4. Fill every academic or explicitly requested text input and textarea. Leave metadata-only fields blank unless requested.
5. Do not fill metadata-only fields (name, age, class, email, phone, student ID, address) unless the user explicitly requests them or provides their values.

RULES FOR ACTIONS:
1. You MUST evaluate and generate actions for ALL questions present on the page from top to bottom in a single pass.
2. Supported action types:
   - "fill": For text inputs/textareas. Provide "value". MANDATORY: every visible text input, textarea, and contenteditable box MUST receive a "fill" action.
   - "select": For dropdowns. Provide "value" matching an available option.
   - "check": For radios, checkboxes, and ARIA switches to select/toggle them ON.
   - "uncheck": To uncheck a checkbox.
   - "click": For buttons, links, or custom choice controls.
3. For multiple-choice questions or quizzes:
   - Carefully read the question prompt, given data (potential values, formulas, context) from "question" and "body_text".
   - CRITICAL SCIENTIFIC ACCURACY: Do NOT blindly pick the first options (e.g. A, B, C)! You MUST calculate and verify EVERY option (A, B, C, D, E) individually.
     * Calculate exact values (e.g. E°sel = E°katoda - E°anoda, spontaneity E°sel > 0 vs < 0, redox numbers, colligative properties).
     * Verify container reactions: if E°sel > 0, the reaction is spontaneous and WILL damage/dissolve the container, so it CANNOT be stored safely!
     * Only generate actions for statements that are strictly TRUE according to your calculation.
   - Single-choice (type="radio"): Output a "check" action for the single verified correct option.
   - Multi-select (type="checkbox"):
     * Select every option that is verified correct, with no default minimum or maximum.
     * If the user explicitly states a selection count or limit, follow that instruction instead.
   - Form inputs & short answers (type="input" or "textarea"):
     * MANDATORY: Output a "fill" action for EVERY text field without exception.
     * For Name/Nama: use a realistic Indonesian student name (e.g. "Andi Pratama").
     * For Class/Kelas: use a class like "XII MIPA 1".
     * For Student ID/NIS/NISN: use a realistic ID like "1234567890".
     * For short-answer questions: fill with the correct calculated answer.
4. Output MUST be strictly valid JSON matching this schema:
{
  "status": "actions" | "answer" | "confirmation" | "clarification" | "finished",
  "reasoning": "Full reasoning organized by question. Start each question with its number, quote the question, list the relevant options, identify the answer, and explain the calculation or evidence. Do not claim a question was answered unless an action was generated for it. Use KaTeX for mathematical notation: inline formulas must use $...$ and display formulas must use $$...$$. Never emit raw LaTeX delimiters, JavaScript arrays, or placeholder names.",
  "message": "Clear summary of the reasoning and actions actually generated. Do not repeat the full reasoning or emit placeholder arrays.",
  "actions": [
    {
      "type": "fill" | "select" | "check" | "uncheck" | "click" | "scroll",
      "element_id": "element_X",
      "value": "string value (required for fill and select)"
    }
  ]
}
5. OPERATING MODES:
   - SUGGEST: Analyze the page and give suggested answers in "message". Return EMPTY "actions": [].
   - FILL: Generate actions for inputs, textareas, radios, checkboxes, and selects. Do NOT submit forms.
   - ASSIST: Generate actions for form fields AND click navigation buttons (e.g., Next, Continue). If submitting or taking consequential actions (Submit/Kirim/Buy/Pay), request confirmation.`;
  }

  /**
   * Generates mock actions based on scanned elements for offline demonstration and testing.
   */
  generateMockResponse(pageData, userRequest, mode) {
    const elements = pageData.elements || [];
    const actions = [];
    let message = '';

    if (mode === 'SUGGEST') {
      const inputsCount = elements.filter(e => e.type === 'input' || e.type === 'textarea').length;
      const buttonsCount = elements.filter(e => e.type === 'button').length;
      return {
        status: 'answer',
        message: `Analysis complete: Found ${inputsCount} input fields and ${buttonsCount} buttons. In SUGGEST mode, no automated DOM modifications were made.`,
        actions: [],
        usageMetadata: {
          promptTokenCount: 180,
          candidatesTokenCount: 65,
          totalTokenCount: 245
        }
      };
    }

    // Find sample input fields to fill
    const textInputs = elements.filter(e => e.type === 'input' && e.input_type !== 'password' && e.input_type !== 'checkbox' && e.input_type !== 'radio');
    const selectInputs = elements.filter(e => e.type === 'select');
    const checkboxes = elements.filter(e => e.type === 'checkbox');
    const submitBtn = elements.find(e => e.type === 'button' && (e.is_submit || /continue|next|submit|search/i.test(e.text || '')));

    let filledCount = 0;

    textInputs.forEach(input => {
      const labelLower = (input.label || input.placeholder || input.name || '').toLowerCase();
      let fillVal = null;

      if (/email/i.test(labelLower)) fillVal = 'user@example.com';
      else if (/name/i.test(labelLower)) fillVal = 'John Doe';
      else if (/phone|tel/i.test(labelLower)) fillVal = '+1 555-0199';
      else if (/city|address/i.test(labelLower)) fillVal = 'Jakarta';
      else if (/search|query/i.test(labelLower)) fillVal = 'Loki AI Assistant';
      else fillVal = 'Sample Input';

      if (fillVal) {
        actions.push({
          type: 'fill',
          element_id: input.id,
          value: fillVal
        });
        filledCount++;
      }
    });

    selectInputs.forEach(sel => {
      if (sel.options && sel.options.length > 0) {
        const targetOpt = sel.options[0].text || sel.options[0].value;
        actions.push({
          type: 'select',
          element_id: sel.id,
          value: targetOpt
        });
        filledCount++;
      }
    });

    // Group checkboxes by question context
    const checkboxGroups = new Map();
    checkboxes.forEach((cb, idx) => {
      const label = (cb.label || '').toLowerCase();
      if (/salinan|kirimkan|copy|terms/i.test(label)) return;
      const qKey = cb.question || `mock_cb_group_${Math.floor(idx / 5)}`;
      if (!checkboxGroups.has(qKey)) checkboxGroups.set(qKey, []);
      checkboxGroups.get(qKey).push(cb);
    });

    checkboxGroups.forEach((groupCbs) => {
      // The mock engine selects all available options; live AI selects only verified answers.
      for (let i = 0; i < groupCbs.length; i++) {
        actions.push({
          type: 'check',
          element_id: groupCbs[i].id
        });
        filledCount++;
      }
    });

    // Handle radio controls (grouped by question title)
    const radioElements = elements.filter(e => e.type === 'radio');
    const radioGroups = new Map();
    radioElements.forEach(r => {
      const qKey = r.question || 'general_radios';
      if (!radioGroups.has(qKey)) radioGroups.set(qKey, []);
      radioGroups.get(qKey).push(r);
    });

    radioGroups.forEach((radios) => {
      // Pick first un-checked radio in each group
      const targetRadio = radios.find(r => !r.checked) || radios[0];
      if (targetRadio) {
        actions.push({
          type: 'check',
          element_id: targetRadio.id
        });
        filledCount++;
      }
    });

    // Handle navigation/submit buttons based on mode
    if (submitBtn && (mode === 'ASSIST' || mode === 'FILL')) {
      if (submitBtn.is_submit || /submit|pay|buy|send|confirm/i.test(submitBtn.text || '')) {
        message = `Prepared ${filledCount} field inputs. Requires confirmation before clicking '${submitBtn.text || 'Submit'}'.`;
      } else {
        actions.push({
          type: 'click',
          element_id: submitBtn.id
        });
        message = `Automated ${filledCount} field inputs and clicked '${submitBtn.text || 'Continue'}'.`;
      }
    } else {
      message = `Successfully filled ${filledCount} detected fields on the page.`;
    }

    return {
      status: actions.length > 0 ? 'actions' : 'finished',
      message: message,
      actions: actions,
      usageMetadata: {
        promptTokenCount: 420,
        candidatesTokenCount: 180,
        totalTokenCount: 600
      }
    };
  }

  /**
   * Queries Google AI Studio ModelService.ListModels endpoint to dynamically discover
   * available generateContent models enabled for the user's API key.
   * Strictly prioritizes Free Tier Flash models (gemini-2.0-flash, gemini-1.5-flash) and excludes 0-quota Pro models.
   */
  async fetchAvailableModels(apiKey) {
    const defaultPriority = [
      'gemini-3.1-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b'
    ];

    const sortNewestFirst = (models) => {
      const versionOf = (name) => {
        const match = name.match(/gemini-(\d+)(?:\.(\d+))?/i);
        return match ? [Number(match[1]), Number(match[2] || 0)] : [-1, -1];
      };
      const variantRank = (name) => {
        if (/-latest$/i.test(name)) return 1;
        if (/-preview(?:-|$)|-experimental(?:-|$)|-exp(?:-|$)/i.test(name)) return 0;
        if (/-\d{3}$/i.test(name)) return 3;
        return 2;
      };

      return [...new Set(models)].sort((a, b) => {
        const [aMajor, aMinor] = versionOf(a);
        const [bMajor, bMinor] = versionOf(b);
        if (aMajor !== bMajor) return bMajor - aMajor;
        if (aMinor !== bMinor) return bMinor - aMinor;
        const variantDifference = variantRank(b) - variantRank(a);
        return variantDifference || a.localeCompare(b);
      });
    };

    const fallbackModels = sortNewestFirst([
      ...defaultPriority,
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-flash-latest'
    ]);

    // Return cached result if fresh (10 min TTL) to avoid wasting API quota on ListModels
    const cacheKey = apiKey.slice(-8);
    const cached = this._modelCache[cacheKey];
    if (cached && (Date.now() - cached.ts < 600000)) {
      return cached.models;
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) {
        return defaultPriority;
      }
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        // Filter ONLY flash models supporting generateContent (free-tier eligible)
        const validModels = data.models
          .filter(m => {
            if (!m.supportedGenerationMethods || !m.supportedGenerationMethods.includes('generateContent')) return false;
            const name = (m.name || '').toLowerCase();
            // Exclude specialized non-text or 0-quota pro models on free tier
            if (/tts|audio|embed|imagen|image-gen|aqa|whisper|chirp|pro/i.test(name)) return false;
            return name.includes('flash');
          })
          .map(m => m.name.replace('models/', ''));

        // Try the newest compatible model first, then progressively older models.
        const orderedModels = sortNewestFirst(validModels);

        console.log('[Loki AI] Discovered compatible Flash models in newest-first order:', orderedModels);
        const result = orderedModels.length > 0 ? orderedModels : fallbackModels;
        this._modelCache[cacheKey] = { models: result, ts: Date.now() };
        return result;
      }
    } catch (err) {
      console.warn('[Loki AI] Failed to query ListModels, using fallback list:', err);
    }
    this._modelCache[cacheKey] = { models: fallbackModels, ts: Date.now() };
    return fallbackModels;
  }

  maskKey(key) {
    if (!key) return 'unknown';
    const clean = key.trim();
    if (clean.length <= 8) return '****';
    return clean.slice(0, 6) + '...' + clean.slice(-4);
  }

  /**
   * Calls Google Gemini API with multi-model failover and multi-key failover.
   * If a model hits a 429 quota limit, tries other flash models on the same key before rotating keys.
   */
  async callGeminiAPI(apiKeysInput, pageData, userRequest, mode, screenshotBase64 = null, customInstruction = '', modelOptions = {}) {
    const rawKeys = Array.isArray(apiKeysInput) ? apiKeysInput : (apiKeysInput ? [apiKeysInput] : []);
    const keys = rawKeys.map(k => k.trim()).filter(k => k.length > 0);

    if (keys.length === 0) {
      throw new Error('No Gemini API key provided. Please configure your API key(s) in Settings.');
    }

    const keyHealthMap = {};
    let lastError = null;

    // Compact page elements payload for high-speed AI processing (up to 300 interactive elements)
    const compactElements = (pageData.elements || []).slice(0, 300).map(e => ({
      id: e.id,
      type: e.type,
      label: e.label || e.text || null,
      question: e.question || null,
      value: e.value || null,
      options: e.options || undefined,
      image: e.image || undefined
    }));

    let effectiveInstruction = (userRequest && userRequest.trim())
      ? `${userRequest.trim()} Accurately solve the requested questions and select every checkbox option that is correct. Apply any checkbox count or limit only if explicitly stated.`
      : 'Solve all academic questions and explicitly requested fields from Question 1 to the end. Select every checkbox option that is correct with no default selection limit.';

    if (customInstruction && customInstruction.trim()) {
      effectiveInstruction += `\n[User Custom Context / Rule]: ${customInstruction.trim()}`;
    }
    effectiveInstruction += '\nDo not fill metadata-only fields such as name, age, class, email, phone, student ID, or address unless the user explicitly requests those fields or provides values for them.';

    // Assemble multimodal parts (image + text JSON)
    const userParts = [];
    if (screenshotBase64) {
      userParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: screenshotBase64
        }
      });
    }

    userParts.push({
      text: JSON.stringify({
        user_instruction: effectiveInstruction,
        operating_mode: mode,
        has_screenshot: !!screenshotBase64,
        page_info: {
          title: pageData.title,
          url: pageData.url,
          body_text: (pageData.body_text || '').slice(0, 30000),
          question_sets: pageData.question_sets || [],
          elements: compactElements
        }
      })
    });

    const promptPayload = {
      system_instruction: {
        parts: [{ text: this.systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: userParts
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    };

    // Iterate through key pool with automatic failover
    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const apiKey = keys[keyIdx];
      const masked = this.maskKey(apiKey);

      console.log(`[Loki AI] Attempting inference with Key ${keyIdx + 1}/${keys.length} (${masked})...`);

      // Dynamically query available models for this key (filtered and sorted to high-quota Flash first)
      const dynamicModels = await this.fetchAvailableModels(apiKey);
      const preferredModel = modelOptions.preferredModel || 'gemini-3.1-flash';
      const availableModels = (dynamicModels && dynamicModels.length > 0)
        ? dynamicModels
        : [preferredModel];
      const modelsToUse = [
        preferredModel,
        ...availableModels.filter(model => model !== preferredModel)
      ];

      const endpointsToTry = modelsToUse.map(model =>
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      );

      let allModelsRateLimited = true;
      let stopModelFallback = false;

      for (const endpoint of endpointsToTry) {
        const modelTag = endpoint.match(/models\/([^:]+):/)?.[1] || 'gemini';
        let retried = false;

        while (true) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s for large forms

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(promptPayload),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawText) {
                rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
                const parsed = JSON.parse(rawText);
                if (data.usageMetadata) {
                  parsed.usageMetadata = data.usageMetadata;
                }
                parsed.usedApiKey = apiKey;
                parsed.usedKeyIndex = keyIdx;
                parsed.usedKeyMasked = masked;
                parsed.usedModel = modelTag;
                parsed.totalKeysCount = keys.length;

                keyHealthMap[apiKey] = {
                  status: 'ready',
                  masked,
                  lastUsed: Date.now()
                };
                parsed.keyHealthMap = keyHealthMap;

                console.log(`[Loki AI] Succeeded with Key ${keyIdx + 1} (${masked}) on ${modelTag}`);
                return parsed;
              }
              lastError = `[${modelTag} | Key ${keyIdx + 1}] Response contained no usable JSON content`;
              allModelsRateLimited = false;
              break;
            } else {
              const errText = await response.text();
              lastError = `[${modelTag} | Key ${keyIdx + 1}] HTTP ${response.status}: ${errText}`;
              console.warn(`[Loki AI] ${lastError}`);

              if (response.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(errText)) {
                // If "limit: 0", model is not supported on free tier; advance immediately to next model
                if (/limit:\s*0/i.test(errText)) {
                  console.warn(`[Loki AI] Model ${modelTag} has limit: 0 on free tier. Trying next model...`);
                  break;
                }

                // If per-minute rate limit with short retry delay (<= 12s), wait and retry once
                const retryMatch = errText.match(/retry\s*(?:in|Delay[":\s]*)["\s]*(\d+\.?\d*)/i);
                const retrySeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 0;

                if (retrySeconds > 0 && retrySeconds <= 12 && !retried) {
                  console.log(`[Loki AI] Rate limit on ${modelTag}. Waiting ${retrySeconds}s before retry...`);
                  retried = true;
                  await new Promise(r => setTimeout(r, (retrySeconds + 1) * 1000));
                  continue; // retry same endpoint in the while loop
                }

                if (modelOptions.allowDowngrade === false) {
                  console.warn(`[Loki AI] Model downgrade disabled; stopping after ${modelTag}.`);
                  stopModelFallback = true;
                  break;
                }
                // If retry delay is long or already retried, try NEXT model on SAME key
                console.warn(`[Loki AI] Model ${modelTag} quota exhausted on Key ${masked}. Trying next Flash model on same key...`);
                break;
              } else {
                allModelsRateLimited = false;
                if (modelOptions.allowDowngrade === false) {
                  stopModelFallback = true;
                }
                break;
              }
            }
          } catch (err) {
            lastError = err.name === 'AbortError' ? `[${modelTag}] Timed out` : err.message;
            console.warn(`[Loki AI] Key ${masked} model ${modelTag} error:`, err);
            allModelsRateLimited = false;
            if (modelOptions.allowDowngrade === false) {
              stopModelFallback = true;
            }
            break;
          }
          if (stopModelFallback) break;
        }
        if (stopModelFallback) break;
      }

      // If all models failed for this key, mark key and rotate to next key
      console.warn(`[Loki AI] All models for Key ${keyIdx + 1} (${masked}) failed. Rotating to next key...`);
      keyHealthMap[apiKey] = {
        status: allModelsRateLimited ? 'rate_limited' : 'error',
        masked,
        error: lastError || 'All models failed',
        lastFailed: Date.now()
      };
    }

    throw new Error(lastError || `All ${keys.length} Gemini API keys failed or were exhausted. Verify your keys in Settings.`);
  }
}

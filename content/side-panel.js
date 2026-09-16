/**
 * Loki Ultra-Compact In-Page Dashboard & HUD
 * Features:
 *   - Hidden by default on page load (zero screen footprint)
 *   - Alt+3 or Ctrl+3: Instant analyze & solve in background (does NOT open dashboard)
 *   - Alt+1 or Ctrl+1: Toggle Dashboard card open / closed
 *   - Alt+2 or Ctrl+2: Toggle AI Reasoning drawer
 *   - Solves multiple-correct questions with maximum of 2 options
 *   - Accurately fills form text inputs (name, class, short answers)
 *   - Minimal floating toast for background feedback
 *   - Total CSS isolation via Shadow DOM
 */

(function () {
  // Clean up previous host element if re-injected
  const existingHost = document.getElementById('loki-compact-hud-host');
  if (existingHost) {
    try { existingHost.remove(); } catch (e) {}
  }

  // Create isolated container for Shadow DOM
  const host = document.createElement('div');
  host.id = 'loki-compact-hud-host';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';

  function attachHost() {
    if (!document.getElementById('loki-compact-hud-host')) {
      const target = document.body || document.documentElement;
      if (target) target.appendChild(host);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachHost);
  } else {
    attachHost();
  }

  const shadow = host.attachShadow({ mode: 'open' });

  // Stylesheet - Neobrutalism Design System
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --bg-dark: #0B3D20;
      --bg-card: #18A558;
      --bg-light: #A6E22E;
      --accent: #FF6B1A;
      --yellow: #F2C230;
      --green-light: #A6E22E;
      --green-mid: #18A558;
      --green-dark: #0B3D20;
      --text-primary: #F2C230;
      --text-dark: #0B3D20;
      --border-black: #000000;

      --neo-border-thick: 3px solid #000000;
      --neo-border-mid: 2.5px solid #000000;
      --neo-border-thin: 2px solid #000000;

      --neo-shadow-xs: 2px 2px 0px #000000;
      --neo-shadow-sm: 3px 3px 0px #000000;
      --neo-shadow-md: 4px 4px 0px #000000;
      --neo-shadow-lg: 6px 6px 0px #000000;
      --neo-shadow-active: 1px 1px 0px #000000;

      --neo-radius-sm: 4px;
      --neo-radius-md: 6px;
      --neo-radius-lg: 8px;
      --neo-radius-pill: 9999px;

      --font-neo: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: var(--font-neo);
      -webkit-font-smoothing: auto;
      -moz-osx-font-smoothing: auto;
    }

    /* Minimal floating toast for Alt+3 background solving (Neobrutal) */
    .loki-hud-toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px) scale(0.96);
      opacity: 0;
      background: var(--text-primary);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-md);
      color: var(--bg-card);
      padding: 8px 20px;
      border-radius: var(--neo-radius-sm);
      font-family: var(--font-neo);
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.03em;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 2147483647;
      user-select: none;
      max-width: calc(100vw - 20px);
      white-space: normal;
      pointer-events: none;
      transition: opacity 0.12s ease, transform 0.12s ease;
    }

    .loki-hud-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }

    /* Main Neobrutal Floating HUD Window */
    .loki-hud-card {
      position: fixed;
      top: max(10px, 2vh);
      right: max(10px, 2vw);
      width: min(340px, calc(100vw - 20px));
      max-width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
      box-sizing: border-box;
      background: var(--bg-dark);
      border: var(--neo-border-thick);
      box-shadow: var(--neo-shadow-lg);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      contain: layout paint;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
      transition: opacity 0.12s ease, transform 0.12s ease;
      z-index: 2147483647;
      visibility: hidden;
    }

    .loki-hud-card.open {
      opacity: 1 !important;
      transform: translateY(0) scale(1) !important;
      visibility: visible !important;
      pointer-events: auto !important;
      display: flex !important;
    }

    /* Header with Drag Handle (Neobrutal) */
    .hud-header {
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: var(--neo-border-thick);
      background: var(--yellow);
      color: var(--bg-dark);
      cursor: grab;
      user-select: none;
      min-width: 0;
      flex: 0 0 auto;
    }

    .hud-header:active {
      cursor: grabbing;
    }

    .brand-title {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .brand-title .logo {
      display: flex;
      align-items: center;
      color: var(--bg-dark);
      flex-shrink: 0;
    }

    .brand-title .name {
      font-family: var(--font-neo);
      font-size: 16px;
      font-weight: 900;
      color: var(--bg-dark);
      letter-spacing: -0.03em;
      text-transform: uppercase;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .brand-title .tag {
      font-size: 9px;
      font-family: var(--font-neo);
      background: var(--text-primary);
      color: var(--bg-card);
      border: var(--neo-border-thin);
      padding: 2px 6px;
      border-radius: var(--neo-radius-sm);
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: var(--neo-shadow-xs);
    }

    .header-btns {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      overflow-wrap: anywhere;
      flex: 0 0 auto;
    }

    .ai-status {
      width: 8px;
      height: 8px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--text-primary);
      box-shadow: 0 0 0 1px var(--bg-dark);
      transition: background 0.15s ease, box-shadow 0.15s ease;
    }

    .ai-status.active {
      background: var(--accent);
      box-shadow: 0 0 0 1px var(--bg-dark), 0 0 8px var(--accent);
      animation: aiStatusPulse 1s infinite alternate;
    }

    @keyframes aiStatusPulse {
      from { opacity: 0.55; }
      to { opacity: 1; }
    }

    .hud-icon-btn {
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      color: var(--text-primary);
      width: 26px;
      height: 26px;
      border-radius: var(--neo-radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 900;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
    }

    .hud-icon-btn:hover {
      background: var(--yellow);
      color: var(--bg-dark);
      transform: translate(-1px, -1px);
      box-shadow: var(--neo-shadow-sm);
    }

    .hud-icon-btn:active {
      transform: translate(1.5px, 1.5px);
      box-shadow: 0px 0px 0px #000;
    }

    /* Card Body */
    .hud-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--bg-dark);
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1 1 auto;
    }

    /* Primary Solve Button (Neobrutal) */
    .btn-solve-primary {
      width: 100%;
      background: var(--green-mid);
      border: var(--neo-border-mid);
      color: var(--text-primary);
      padding: 12px 14px;
      border-radius: var(--neo-radius-md);
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: var(--neo-shadow-md);
      transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease;
    }

    .btn-solve-primary:hover {
      background: var(--green-light);
      transform: translate(-2px, -2px);
      box-shadow: var(--neo-shadow-lg);
    }

    .btn-solve-primary:active {
      background: var(--green-mid);
      transform: translate(2px, 2px);
      box-shadow: var(--neo-shadow-active);
    }

    .btn-solve-primary.running {
      background: var(--yellow);
      color: var(--bg-dark);
      cursor: not-allowed;
      box-shadow: var(--neo-shadow-md);
      animation: neoPulse 1.2s infinite alternate;
    }

    @keyframes neoPulse {
      from { opacity: 0.88; }
      to { opacity: 1; }
    }

    /* Token Meter Row (Neobrutal) */
    .token-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      border-radius: var(--neo-radius-sm);
      font-size: 11px;
      font-weight: 800;
    }

    .token-label-badge {
      background: var(--text-primary);
      color: var(--bg-card);
      border: var(--neo-border-thin);
      padding: 2px 6px;
      border-radius: var(--neo-radius-sm);
      font-size: 9px;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: var(--neo-shadow-xs);
    }

    .token-stats-group {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 10.5px;
    }

    .token-highlight {
      font-weight: 900;
      color: var(--text-primary);
      background: var(--yellow);
      padding: 1px 4px;
      border-radius: 2px;
      box-shadow: 1px 1px 0px #000;
    }

    /* Status Row (Neobrutal) */
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      border-radius: var(--neo-radius-sm);
      font-size: 11.5px;
      font-weight: 800;
    }

    .status-indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 2px solid #000;
      background: var(--green-mid);
      box-shadow: 0 0 0 1px #000;
      flex-shrink: 0;
    }

    .status-indicator-dot.working {
      background: var(--yellow);
      animation: neoDotFlash 0.8s infinite alternate;
    }

    .status-indicator-dot.error {
      background: var(--accent);
    }

    @keyframes neoDotFlash {
      from { opacity: 0.6; }
      to { opacity: 1; }
    }

    .status-text-display {
      color: var(--text-primary);
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      font-weight: 800;
    }

    /* Utility Buttons */
    .controls-row {
      display: flex;
      gap: 8px;
    }

    .btn-action-tool {
      flex: 1;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      color: var(--text-primary);
      padding: 8px 10px;
      border-radius: var(--neo-radius-sm);
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
      user-select: none;
    }

    .btn-action-tool:hover {
      background: var(--yellow);
      transform: translate(-1px, -1px);
      box-shadow: var(--neo-shadow-sm);
    }

    .btn-action-tool:active {
      transform: translate(1.5px, 1.5px);
      box-shadow: 0px 0px 0px #000;
    }

    .btn-action-tool.active {
      background: var(--green-mid);
      border-color: var(--text-primary);
    }

    .kbd-pill {
      font-family: var(--font-neo);
      font-size: 9px;
      background: var(--text-primary);
      color: var(--bg-card);
      border: var(--neo-border-thin);
      padding: 1px 5px;
      border-radius: 2px;
      font-weight: 900;
      box-shadow: 1px 1px 0px #000;
    }

    /* Custom AI Instructions Textarea (Neobrutal - PROMINENT) */
    .hud-custom-prompt-wrap {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .hud-subhead-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .hud-subhead {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hud-subhead svg {
      width: 11px;
      height: 11px;
      fill: currentColor;
    }
    .hud-custom-textarea:focus-within {
      border-color: var(--yellow);
      box-shadow: var(--neo-shadow-md), 0 0 0 2px rgba(238, 232, 44, 0.3);
    }

    .neo-kbd-tag {
      font-size: 9px;
      font-weight: 900;
      background: var(--text-primary);
      color: var(--bg-card);
      border: var(--neo-border-thin);
      box-shadow: 1px 1px 0px #000;
      padding: 1px 5px;
      border-radius: 2px;
      letter-spacing: 0.03em;
    }

    .hud-custom-textarea {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      height: 72px;
      padding: 10px 12px;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-sm);
      border-radius: var(--neo-radius-md);
      font-family: var(--font-neo);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      color: var(--text-primary);
      resize: none;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }

    .hud-custom-textarea::placeholder {
      color: #71717A;
      font-weight: 500;
    }

    .hud-custom-textarea:focus {
      outline: none;
      background: var(--bg-light);
      box-shadow: var(--neo-shadow-md);
      transform: translate(-1px, -1px);
      border-color: var(--yellow);
    }

    .hud-chips-bar {
      display: flex;
      flex-wrap: wrap;
      color: var(--text-primary);
      gap: 5px;
      margin-top: 2px;
      max-width: 100%;
    }

    .hud-chip {
      background: var(--bg-card);
      border: var(--neo-border-thin);
      box-shadow: 1.5px 1.5px 0px #000;
      color: var(--text-primary);
      border-radius: var(--neo-radius-sm);
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.1s ease;
    }

    .hud-chip:hover {
      background: var(--yellow);
      color: var(--bg-dark);
      transform: translate(-1px, -1px);
      box-shadow: 2.5px 2.5px 0px #000;
    }

    .hud-chip:active {
      transform: translate(1px, 1px);
      box-shadow: 0px 0px 0px #000;
    }

    .hud-chip-action {
      background: var(--yellow);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      color: var(--bg-dark);
      border-radius: var(--neo-radius-sm);
      padding: 3px 10px;
      font-size: 10px;
      font-weight: 900;
      cursor: pointer;
      transition: all 0.1s ease;
    }

    .hud-chip-action:hover {
      background: var(--green-light);
      color: var(--bg-dark);
      transform: translate(-1px, -1px);
      box-shadow: var(--neo-shadow-sm);
    }

    .hud-chip-action:active {
      transform: translate(1px, 1px);
      box-shadow: 0px 0px 0px #000;
    }

    /* Stealth Mode Toggle */
    .hud-stealth-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      color: var(--text-primary);
      cursor: pointer;
      user-select: none;
    }

    .hud-stealth-row input {
      accent-color: var(--green-mid);
      width: 16px;
      height: 16px;
      cursor: pointer;
      border: var(--neo-border-mid);
    }

    /* Footer */
    .hud-footer {
      padding: 8px 12px;
      border-top: var(--neo-border-thick);
      background: var(--yellow);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--bg-dark);
      font-weight: 900;
      min-width: 0;
      flex-wrap: wrap;
      gap: 6px;
      flex: 0 0 auto;
    }

    .hud-footer .hints {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
      color: var(--bg-dark);
    }

    /* Section Tabs */
    .section-tabs {
      display: flex;
      gap: 3px;
      padding: 6px 8px;
      border-bottom: var(--neo-border-mid);
      background: var(--bg-dark);
      min-width: 0;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }

    .section-tab {
      flex: 1 1 72px;
      min-width: 0;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      color: var(--text-primary);
      padding: 5px 4px;
      border-radius: var(--neo-radius-sm);
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      font-family: var(--font-neo);
      transition: all 0.1s ease;
    }

    .section-tab:hover {
      background: var(--yellow);
      color: var(--bg-dark);
      transform: translate(-1px, -1px);
      box-shadow: var(--neo-shadow-sm);
    }

    .section-tab:active {
      transform: translate(1px, 1px);
      box-shadow: 0px 0px 0px #000;
    }

    .section-tab.active {
      background: var(--yellow);
      color: var(--bg-dark);
      border-color: var(--bg-dark);
    }

    .section-tab .kbd-pill {
      font-size: 8px;
      background: var(--bg-dark);
      color: var(--text-primary);
      border: var(--neo-border-thin);
      padding: 0px 3px;
    }

    .section-tab.active .kbd-pill {
      background: var(--bg-card);
      color: var(--bg-dark);
    }

    /* Section Bodies */
    .section-body {
      display: none;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      width: 100%;
    }

    .section-body.active {
      display: flex;
    }

    .utility-panel {
      display: none;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      width: 100%;
    }

    .utility-panel.active {
      display: flex;
    }

    .utility-panel textarea,
    .utility-panel input {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
      background: var(--bg-card);
      color: var(--text-primary);
      border: var(--neo-border-mid);
      border-radius: var(--neo-radius-sm);
      padding: 8px;
      font: 11px var(--font-mono);
    }

    .utility-panel textarea {
      min-height: 72px;
      resize: vertical;
    }

    .utility-panel label {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-primary);
      font-size: 11px;
      font-weight: 800;
    }

    .utility-panel label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--green-light);
    }

    .shortcut-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .shortcut-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 7px 8px;
      background: var(--bg-card);
      border: var(--neo-border-thin);
      color: var(--text-primary);
      font-size: 11px;
    }

    .key-editor {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .key-editor-row {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }

    .key-editor-row input {
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-card);
      color: var(--text-primary);
      border: var(--neo-border-mid);
      border-radius: var(--neo-radius-sm);
      padding: 8px;
      font: 11px var(--font-mono);
    }

    .key-remove-btn {
      flex: 0 0 auto;
      width: 28px;
      min-height: 28px;
      padding: 0;
    }

    /* Expandable AI Reasoning Drawer (Neobrutal) */
    .reasoning-drawer {
      border-top: var(--neo-border-thick);
      background: var(--bg-card);
      display: none;
      flex-direction: column;
    }

    .reasoning-drawer.open {
      display: flex;
    }

    .reasoning-top-bar {
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: var(--neo-border-mid);
      background: var(--yellow);
      font-size: 11px;
      font-weight: 900;
      color: var(--bg-dark);
      text-transform: uppercase;
    }

    .reasoning-body {
      padding: 10px 12px;
      font-size: 11px;
      line-height: 1.5;
      color: var(--text-primary);
      overflow-y: auto;
      overflow-x: hidden;
      max-height: 220px;
      white-space: pre-wrap;
      font-family: var(--font-mono);
      background: var(--bg-card);
      border-bottom: var(--neo-border-mid);
    }

    .reasoning-body:empty::before {
      content: "No reasoning generated yet. Press Alt+3 to analyze & solve.";
      color: #71717A;
    }

    .reasoning-summary {
      padding: 8px;
      margin-bottom: 8px;
      background: var(--bg-dark);
      border: var(--neo-border-mid);
      border-radius: var(--neo-radius-sm);
    }

    .reasoning-question {
      padding: 8px;
      margin-bottom: 8px;
      background: var(--bg-light);
      color: var(--bg-dark);
      border: var(--neo-border-mid);
      border-radius: var(--neo-radius-sm);
      font-family: var(--font-mono);
    }

    .reasoning-question:last-child { margin-bottom: 0; }
    .reasoning-question-title { font-weight: 900; margin-bottom: 5px; }
    .reasoning-question-section { margin-top: 5px; }
    .reasoning-question-section strong { font-weight: 900; }
    .reasoning-option { margin-left: 8px; }
    .reasoning-answer { color: #0B3D20; font-weight: 900; }
    .reasoning-explanation {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(11, 61, 32, 0.45);
      font-size: 10px;
    }

    /* Model Dashboard Card (Alt+0) */
    .loki-model-card {
      width: min(340px, calc(100vw - 20px));
      max-width: 100%;
    }

    .model-summary-box {
      background: var(--bg-card);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-sm);
      border-radius: var(--neo-radius-md);
      padding: 10px 12px;
    }

    .summary-stat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 3px;
    }

    .summary-label {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-primary);
    }

    .summary-val {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 900;
      color: var(--text-primary);
      background: var(--yellow);
      padding: 2px 7px;
      border-radius: var(--neo-radius-sm);
      border: var(--neo-border-thin);
      box-shadow: 1px 1px 0px #000;
    }

    .summary-sub {
      font-size: 10px;
      color: var(--text-primary);
      font-weight: 600;
    }

    .model-list-header {
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-primary);
      margin-top: 2px;
      margin-left: 2px;
    }

    .model-list-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 180px;
      overflow-y: auto;
    }

    .model-item-card {
      background: var(--bg-dark);
      border: var(--neo-border-mid);
      box-shadow: var(--neo-shadow-xs);
      border-radius: var(--neo-radius-sm);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--text-primary);
    }

    .model-item-card.is-current {
      border-color: var(--green-light);
      background: var(--bg-dark);
    }

    .model-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .model-key-title {
      font-size: 11px;
      font-weight: 900;
      color: var(--text-primary);
      font-family: var(--font-mono);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .model-status-pill {
      font-size: 9px;
      font-weight: 900;
      padding: 1px 6px;
      border-radius: var(--neo-radius-pill);
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border: var(--neo-border-thin);
    }

    .model-status-pill.ready {
      background: var(--green-light);
      color: var(--bg-dark);
    }

    .model-status-pill.rate_limited {
      background: var(--yellow);
      color: var(--bg-dark);
    }

    .model-status-pill.error {
      background: var(--accent);
      color: var(--bg-dark);
    }

    .model-item-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-weight: 700;
    }

    .model-empty-msg {
      font-size: 11px;
      color: var(--text-primary);
      text-align: center;
      padding: 12px 8px;
      background: var(--bg-card);
      border: var(--neo-border-mid);
      border-radius: var(--neo-radius-sm);
    }

    .brand-title .logo img {
      display: block;
      width: 18px;
      height: 18px;
      object-fit: contain;
    }
  `;
  shadow.appendChild(style);

  // HTML Structure
  const container = document.createElement('div');
  container.innerHTML = `
    <!-- Minimal Floating Toast (only appears briefly during solving) -->
    <div class="loki-hud-toast" id="loki-hud-toast"></div>

    <!-- Main Compact Floating HUD Card -->
    <div class="loki-hud-card" id="loki-hud-card">
      <!-- Header -->
      <div class="hud-header" id="hud-drag-handle">
        <div class="brand-title">
          <span class="logo">
          <img src="${chrome.runtime.getURL('icons/icon128.png')}" alt="Emerald">
          </span>
          <span class="name">EMERALD - <span id="page-title">...</span></span>
        </div>
        <div class="header-btns">
          <span class="ai-status" id="ai-status" title="AI idle" aria-label="AI idle"></span>
          <button class="hud-icon-btn" id="btn-help" title="Keyboard shortcuts">?</button>
          <button class="hud-icon-btn" id="btn-settings" title="Settings">&#9881;</button>
          <button class="hud-icon-btn" id="btn-close-hud" title="Close Panel">&times;</button>
        </div>
      </div>

      <!-- Section Tabs -->
      <div class="section-tabs">
        <button class="section-tab active" data-section="prompt">
          <span>PROMPT</span>
        </button>
        <button class="section-tab" data-section="reasoning">
          <span>REASONING</span>
        </button>
        <button class="section-tab" data-section="solve">
          <span>SOLVE</span>
        </button>
        <button class="section-tab" data-section="models">
          <span>MODELS</span>
        </button>
      </div>

      <!-- Section Bodies -->
      <div class="hud-body">
        <div class="utility-panel" id="utility-settings">
          <div class="hud-subhead">SETTINGS</div>
          <textarea id="hud-api-keys" placeholder="Gemini API keys, one per line"></textarea>
          <label><input type="checkbox" id="hud-use-mock"> Use Mock AI Engine</label>
          <label><input type="checkbox" id="hud-disable-popup"> Disable notification toasts</label>
          <button class="btn-action-tool" id="btn-save-settings">Save Settings</button>
        </div>

        <div class="utility-panel" id="utility-help">
          <div class="hud-subhead">KEYBOARD SHORTCUTS</div>
          <div class="shortcut-list">
            <div class="shortcut-row"><span>Prompt panel</span><strong>Alt+1</strong></div>
            <div class="shortcut-row"><span>Reasoning panel</span><strong>Alt+2</strong></div>
            <div class="shortcut-row"><span>Run solver</span><strong>Alt+3</strong></div>
            <div class="shortcut-row"><span>Settings</span><strong>Alt+4</strong></div>
            <div class="shortcut-row"><span>Models panel</span><strong>HUD Models tab</strong></div>
            <div class="shortcut-row"><span>Repeat active shortcut</span><strong>Hide panel</strong></div>
          </div>
        </div>

        <!-- PROMPT INJECTION Section -->
        <div class="section-body active" id="section-prompt">
          <div class="hud-custom-prompt-wrap">
            <div class="hud-subhead-row">
              <span class="hud-subhead">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M7 2v11h3v9l7-12h-4l4-11z"/></svg>
                PROMPT INJECTION
              </span>
              <span class="neo-kbd-tag" title="Press Enter inside textarea to execute">↵ ENTER</span>
            </div>
            <textarea id="hud-custom-prompt" class="hud-custom-textarea" placeholder="Type prompt to inject (e.g. Strictly select 2 options for checkboxes, calculate redox E°katoda - E°anoda)..."></textarea>
            <div class="hud-chips-bar">
              <button type="button" class="hud-chip" data-inject="Strictly select 2 options for every multi-choice checkbox question. Never select only 1 option.">⚡ 2 Options</button>
              <button type="button" class="hud-chip" data-inject="Calculate exact redox potentials E°sel = E°katoda - E°anoda. Spontaneous if E° > 0.">🧪 Redox</button>
              <button type="button" class="hud-chip" data-inject="Fill Name: Andi Pratama, Class: XII MIPA 1, NISN: 1234567890.">📝 Student</button>
              <button type="button" class="hud-chip-action" id="btn-inject-solve">⚡ Inject &amp; Run</button>
            </div>
          </div>
        </div>

        <!-- REASONING Section -->
        <div class="section-body" id="section-reasoning">
          <div class="hud-subhead-row">
            <span class="hud-subhead">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
              REASONING
            </span>
          </div>
          <div class="reasoning-body" id="reasoning-content"></div>
        </div>

        <!-- SOLVE Section -->
        <div class="section-body" id="section-solve">
          <div class="hud-subhead-row">
            <span class="hud-subhead">SOLVE</span>
          </div>
          <button class="btn-solve-primary" id="btn-solve-now">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M7 2v11h3v9l7-12h-4l4-11z"/></svg>
              Solve &amp; Auto-Fill
            </span>
          </button>
          <div class="status-row" style="margin-top:4px;">
            <span class="status-indicator-dot" id="status-dot"></span>
            <span class="status-text-display" id="status-text">Ready</span>
          </div>
        </div>

        <!-- MODELS Section -->
        <div class="section-body" id="section-models">
          <div class="hud-subhead-row">
            <span class="hud-subhead">MODELS</span>
          </div>
          <div class="key-editor">
            <div class="hud-subhead-row">
              <span class="hud-subhead">GEMINI API KEYS</span>
              <span class="neo-kbd-tag">MULTI-KEY</span>
            </div>
            <div id="model-key-inputs"></div>
            <div class="controls-row">
              <button class="btn-action-tool" id="btn-add-model-key" type="button">+ Add Key</button>
              <button class="btn-action-tool" id="btn-save-model-keys" type="button">Save Keys</button>
            </div>
            <span class="model-empty-msg">Keys are stored locally and used for Gemini failover.</span>
          </div>
          <div class="token-row" id="total-api-tokens">
            <div class="token-label-badge"><span>TOTAL ALL KEYS</span></div>
            <span class="token-highlight" id="total-api-tokens-value">0 tokens</span>
          </div>
          <div class="token-row" id="hud-token-row" style="cursor:pointer;">
            <div class="token-label-badge">
              <span>MODELS</span>
            </div>
            <div class="token-stats-group">
              <span id="hud-token-used">0 used</span>
              <span style="opacity:0.5;">•</span>
              <span id="hud-token-rem" class="token-highlight">1.05M ctx</span>
            </div>
          </div>
          <div id="model-keys-list" class="model-list-container">
            <div class="model-empty-msg">Loading Gemini model status...</div>
          </div>
          <button class="btn-action-tool" id="btn-refresh-models" style="margin-top:4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- Footer -->
      <div class="hud-footer">
        <div class="hints">
          <span>Emerald HUD</span>
        </div>
        <span id="elements-count-text" style="font-family:var(--font-mono);font-weight:600;color:var(--bg-dark);font-size:10px;">...</span>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  // ── KaTeX: load script and render math in reasoning drawer ──
  const katexReady = typeof window.katex !== 'undefined';

  // Renders KaTeX math inside an element: $$...$$ (display) then $...$ (inline)
  function renderKatex(el) {
    if (!el) return;
    const raw = el.textContent || '';
    if (!raw.trim()) return;
    if (!katexReady || typeof window.katex === 'undefined') {
      // Not loaded yet — show plain text, retry after 1s
      setTimeout(() => renderKatex(el), 1000);
      return;
    }

    // Escape HTML then replace math regions
    let html = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Display math: $$...$$
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      try {
        return window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
      } catch (e) { return `$$${tex}$$`; }
    });

    // Inline math: $...$
    html = html.replace(/\$([^\n$]+?)\$/g, (_, tex) => {
      try {
        return window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      } catch (e) { return `$${tex}$`; }
    });

    // Newlines to line breaks (outside math regions)
    html = html.replace(/\n/g, '<br>');
    el.innerHTML = html;
  }

  function escapeReasoningText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderReasoningDetails(details, fallbackReasoning, usedModel = '') {
    if (!reasoningContent) return;
    const detailModel = Array.isArray(details) && details.length ? details[0].usedModel : '';
    const modelLabel = usedModel || detailModel || 'Model unavailable';
    const summary = `<div class="reasoning-summary"><strong>Answered with ${escapeReasoningText(modelLabel)}</strong>${
      fallbackReasoning ? `<br><br><strong>AI full reasoning</strong><br>${escapeReasoningText(fallbackReasoning).replace(/\n/g, '<br>')}` : ''
    }</div>`;
    const cards = (Array.isArray(details) ? details : []).map(item => {
      const options = (item.options || [])
        .map(option => `<div class="reasoning-option">• ${escapeReasoningText(option.label)}</div>`)
        .join('');
      const answers = (item.answer || []).length
        ? item.answer.map(answer => `<div class="reasoning-answer">✓ ${escapeReasoningText(answer.label)}${answer.value ? `: ${escapeReasoningText(answer.value)}` : ''}</div>`).join('')
        : '<div class="reasoning-answer">No action selected</div>';
      return `<article class="reasoning-question">
        <div class="reasoning-question-title">Question ${item.number}: ${escapeReasoningText(item.question)}</div>
        <div class="reasoning-question-section"><strong>Options</strong>${options || '<div class="reasoning-option">No options detected</div>'}</div>
        <div class="reasoning-question-section"><strong>Answer</strong>${answers}</div>
        <div class="reasoning-explanation"><strong>AI reasoning</strong><br>${escapeReasoningText(item.reasoning || fallbackReasoning || 'No explanation provided.').replace(/\n/g, '<br>')}</div>
      </article>`;
    }).join('');

    reasoningContent.innerHTML = summary + cards;
    if (katexReady && typeof window.katex !== 'undefined') {
      reasoningContent.querySelectorAll('.reasoning-summary, .reasoning-explanation').forEach(renderKatex);
    }
  }

  // References
  const hudCard = shadow.getElementById('loki-hud-card');
  const toastEl = shadow.getElementById('loki-hud-toast');
  const dragHandle = shadow.getElementById('hud-drag-handle');
  const closeHudBtn = shadow.getElementById('btn-close-hud');
  const aiStatus = shadow.getElementById('ai-status');
  const helpBtn = shadow.getElementById('btn-help');
  const settingsBtn = shadow.getElementById('btn-settings');
  const saveSettingsBtn = shadow.getElementById('btn-save-settings');
  const settingsPanel = shadow.getElementById('utility-settings');
  const helpPanel = shadow.getElementById('utility-help');
  const hudApiKeys = shadow.getElementById('hud-api-keys');
  const hudUseMock = shadow.getElementById('hud-use-mock');
  const hudDisablePopup = shadow.getElementById('hud-disable-popup');
  const pageTitleEl = shadow.getElementById('page-title');
  const solveBtn = shadow.getElementById('btn-solve-now');
  const statusDot = shadow.getElementById('status-dot');
  const statusText = shadow.getElementById('status-text');
  const reasoningContent = shadow.getElementById('reasoning-content');
  const hudCustomPrompt = shadow.getElementById('hud-custom-prompt');
  const hudTokenUsed = shadow.getElementById('hud-token-used');
  const hudTokenRem = shadow.getElementById('hud-token-rem');
  const modelKeysList = shadow.getElementById('model-keys-list');
  const totalApiTokensValue = shadow.getElementById('total-api-tokens-value');
  const modelKeyInputs = shadow.getElementById('model-key-inputs');
  const addModelKeyBtn = shadow.getElementById('btn-add-model-key');
  const saveModelKeysBtn = shadow.getElementById('btn-save-model-keys');
  const btnRefreshModels = shadow.getElementById('btn-refresh-models');
  const elementsCountText = shadow.getElementById('elements-count-text');

  function setAiStatus(active) {
    if (!aiStatus) return;
    aiStatus.classList.toggle('active', active);
    const label = active ? 'AI working' : 'AI idle';
    aiStatus.title = label;
    aiStatus.setAttribute('aria-label', label);
  }

  // Section tabs
  const sectionTabs = shadow.querySelectorAll('.section-tab');
  const sectionBodies = shadow.querySelectorAll('.section-body');

  // Token meter display helper
  function updateTokenDisplay(stats) {
    if (!hudTokenUsed || !hudTokenRem) return;
    if (!stats) {
      hudTokenUsed.textContent = '0 used';
      hudTokenRem.textContent = '1.05M ctx';
      return;
    }
    const total = stats.lastTotal || 0;
    const prompt = stats.lastPrompt || 0;
    const out = stats.lastOutput || 0;
    const accumulated = stats.accumulatedRemainingTokens || stats.remainingContext || (1048576 - total);
    const accM = (accumulated / 1000000).toFixed(2);

    hudTokenUsed.textContent = `${total.toLocaleString()} (${prompt} in / ${out} out)`;
    hudTokenRem.textContent = `${accM}M ctx left`;
  }

  // Section tab toggling - click a tab to show/hide its section
  function switchSection(sectionId) {
    const validSections = new Set(['prompt', 'reasoning', 'solve', 'models']);
    const selectedSection = validSections.has(sectionId) ? sectionId : null;
    sectionTabs.forEach(tab => {
      const isActive = tab.dataset.section === selectedSection;
      tab.classList.toggle('active', isActive);
    });
    sectionBodies.forEach(body => {
      body.classList.toggle('active', body.id === `section-${selectedSection}`);
    });
    settingsPanel?.classList.remove('active');
    helpPanel?.classList.remove('active');
    if (selectedSection === 'models') {
      loadModelKeys().catch(err => console.warn('[Loki HUD] Failed to load model keys:', err));
      refreshModelDashboardData();
    }
  }

  sectionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const sectionId = tab.dataset.section;
      const currentActive = shadow.querySelector('.section-tab.active');
      if (currentActive && currentActive.dataset.section === sectionId) {
        // Re-clicking closes the section
        switchSection(null);
      } else {
        switchSection(sectionId);
      }
    });
  });

  // State Management
  let isHudOpen = false;
  let isExecuting = false;
  let toastTimeout = null;
  let notificationsEnabled = true;

  // Brief Toast Notification
  function showToast(text, duration = 1200) {
    if (!toastEl || !notificationsEnabled) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    if (duration > 0) {
      toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show');
      }, duration);
    }
  }

  // Toggle HUD Card (Alt+1 or Ctrl+1)
  function toggleHud(forceOpen) {
    attachHost();
    isHudOpen = typeof forceOpen === 'boolean' ? forceOpen : !isHudOpen;
    if (isHudOpen) {
      hudCard.classList.add('open');
      updateInputsCount();
    } else {
      hudCard.classList.remove('open');
    }
  }

  // Open a specific HUD section without closing the panel when switching tabs.
  function openSection(sectionId) {
    attachHost();
    const activeSection = shadow.querySelector('.section-tab.active')?.dataset.section;
    if (isHudOpen && activeSection === sectionId) {
      toggleHud(false);
      return;
    }
    if (!isHudOpen) {
      toggleHud(true);
    }
    switchSection(sectionId);
  }

  async function loadHudSettings() {
    const settings = await chrome.storage.local.get([
      'gemini_api_keys',
      'gemini_api_key',
      'use_mock_ai',
      'disable_popup'
    ]);
    if (hudApiKeys) {
      hudApiKeys.value = Array.isArray(settings.gemini_api_keys)
        ? settings.gemini_api_keys.join('\n')
        : (settings.gemini_api_key || '');
    }

    if (hudUseMock) hudUseMock.checked = settings.use_mock_ai === true;
    notificationsEnabled = settings.disable_popup !== true;
    if (hudDisablePopup) hudDisablePopup.checked = !notificationsEnabled;
  }

  function addModelKeyInput(value = '') {
    if (!modelKeyInputs) return;
    const row = document.createElement('div');
    row.className = 'key-editor-row';
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'model-key-input';
    input.placeholder = 'Paste Gemini API key';
    input.value = value;
    input.autocomplete = 'off';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-action-tool key-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove key';
    removeBtn.addEventListener('click', () => {
      row.remove();
      if (!modelKeyInputs.children.length) addModelKeyInput();
    });
    row.append(input, removeBtn);
    modelKeyInputs.appendChild(row);
  }

  async function loadModelKeys() {
    if (!modelKeyInputs) return;
    const settings = await chrome.storage.local.get(['gemini_api_keys', 'gemini_api_key']);
    const keys = Array.isArray(settings.gemini_api_keys)
      ? settings.gemini_api_keys
      : String(settings.gemini_api_key || '').split(/[\n,]+/).filter(Boolean);
    modelKeyInputs.replaceChildren();
    (keys.length ? keys : ['']).forEach(key => addModelKeyInput(key));
  }

  async function saveModelKeys() {
    const keys = Array.from(modelKeyInputs?.querySelectorAll('.model-key-input') || [])
      .map(input => input.value.trim())
      .filter(Boolean);
    await chrome.storage.local.set({ gemini_api_key: keys.join('\n'), gemini_api_keys: keys });
    await refreshModelDashboardData();
    showToast(`${keys.length} API key${keys.length === 1 ? '' : 's'} saved`, 1200);
  }

  function openUtility(panelName) {
    attachHost();
    const panel = panelName === 'settings' ? settingsPanel : helpPanel;
    const otherPanel = panelName === 'settings' ? helpPanel : settingsPanel;
    const alreadyOpen = isHudOpen && panel?.classList.contains('active');
    if (alreadyOpen) {
      toggleHud(false);
      return;
    }
    if (!isHudOpen) toggleHud(true);
    sectionTabs.forEach(tab => tab.classList.remove('active'));
    sectionBodies.forEach(body => body.classList.remove('active'));
    otherPanel?.classList.remove('active');
    panel?.classList.add('active');
    if (panelName === 'settings') loadHudSettings().catch(err => console.warn('[Loki HUD] Failed to load settings:', err));
  }

  // Model Dashboard (Alt+0) - opens the HUD and switches to Models tab.
  function toggleModelDashboard() {
    openSection('models');
  }

  // Update elements count
  function updateInputsCount() {
    try {
      if (window.__LokiDOMScanner && elementsCountText) {
        const scanData = window.__LokiDOMScanner.scan();
        const count = scanData.interactive_elements_count || 0;
        elementsCountText.textContent = `${count} fields`;
      }
    } catch (e) {}
  }

  // Update Status UI
  function updateStatus(message, state = 'ready') {
    if (!statusText || !statusDot) return;
    statusText.textContent = message;
    statusDot.className = 'status-indicator-dot';
    if (state === 'working') statusDot.classList.add('working');
    if (state === 'error') statusDot.classList.add('error');
  }

  // Main Solver Pipeline (Triggered by Alt+3 or the Solve button)
  // Runs completely in background without opening the dashboard popup
  async function runAutoSolve() {
    if (isExecuting) return;
    isExecuting = true;
    setAiStatus(true);
    solveBtn.classList.add('running');
    solveBtn.innerHTML = '<span>Processing...</span>';
    updateStatus('Scanning DOM & capturing viewport...', 'working');
    // Discrete toast popup (respects Disable Popup setting)
    showToast('Analyzing & solving in background...', 1000);

    try {
      const customInstruction = hudCustomPrompt ? hudCustomPrompt.value.trim() : '';

      const response = await chrome.runtime.sendMessage({
        action: 'LOKI_RUN_AGENT',
        payload: {
          requestText: '',
          mode: 'FILL',
          askBeforeImportant: false,
          customInstruction
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Automation failed');
      }

      const { aiResponse, usedModel, executedResults, reasoningDetails } = response;

      // Store Reasoning silently without opening the dashboard
      renderReasoningDetails(reasoningDetails, aiResponse?.reasoning || aiResponse?.message, usedModel || aiResponse?.usedModel);

      const actionCount = (executedResults || []).length;
      updateStatus(`Done! Answered ${actionCount} questions.`, 'ready');
      updateInputsCount();
      if (response?.tokenStats) {
        updateTokenDisplay(response.tokenStats);
      }
      // Completion popup (respects Disable Popup setting)
      showToast(`Done: filled ${actionCount} questions`, 1000);

    } catch (err) {
      console.error('[Loki HUD] Error running auto solver:', err);
      updateStatus(err.message, 'error');
      showToast(`Error: ${err.message}`, 1000);
    } finally {
      isExecuting = false;
      setAiStatus(false);
      solveBtn.classList.remove('running');
      solveBtn.innerHTML = '<span><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M7 2v11h3v9l7-12h-4l4-11z"/></svg> Solve &amp; Auto-Fill</span>';
    }
  }

  // Dragging Functionality for Panels
  function makeDraggable(handleEl, targetEl) {
    let isDragging = false;
    let dragStartX, dragStartY, initialLeft, initialTop;

    handleEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.hud-icon-btn')) return;
      isDragging = true;
      const rect = targetEl.getBoundingClientRect();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      targetEl.style.right = 'auto';
      const maxLeft = Math.max(10, window.innerWidth - targetEl.offsetWidth - 10);
      const maxTop = Math.max(10, window.innerHeight - targetEl.offsetHeight - 10);
      targetEl.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + deltaX))}px`;
      targetEl.style.top = `${Math.max(10, Math.min(maxTop, initialTop + deltaY))}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  makeDraggable(dragHandle, hudCard);

  // Update model keys list in Models section
  function renderModelDashboardStats(stats) {
    if (!stats || !modelKeysList) return;
    const totalUsed = (stats.keyStatsList || []).reduce((sum, key) => sum + (key.totalUsed || 0), 0);
    if (totalApiTokensValue) totalApiTokensValue.textContent = `${totalUsed.toLocaleString()} tokens`;
    const readyCount = stats.readyKeysCount ?? stats.totalActiveKeys ?? 0;
    const totalCount = stats.totalActiveKeys ?? (stats.keyStatsList?.length || 0);
    const accumulated = stats.accumulatedRemainingTokens || 0;
    const accMillions = (accumulated / 1000000).toFixed(2);

    if (!stats.keyStatsList || stats.keyStatsList.length === 0) {
      modelKeysList.innerHTML = `<div class="model-empty-msg">No Gemini API keys registered yet. Open extension settings to add keys.</div>`;
      return;
    }

    modelKeysList.innerHTML = stats.keyStatsList.map((m, idx) => {
      const isCurrent = m.isCurrent;
      const isReady = m.status === 'ready';
      const statusText = isReady ? 'Ready' : (m.status === 'rate_limited' ? '429 Rate Limit' : 'Error');
      const pillClass = isReady ? 'ready' : (m.status === 'rate_limited' ? 'rate_limited' : 'error');
      const remM = (m.remainingContext / 1000000).toFixed(2);

      return `
        <div class="model-item-card ${isCurrent ? 'is-current' : ''}">
          <div class="model-item-top">
            <span class="model-key-title">
              ${isCurrent ? '<span style="color:var(--green-mid);">●</span>' : '<span style="color:var(--text-primary);opacity:.4;">○</span>'}
              Model ${m.index || (idx + 1)}: ${m.masked}
            </span>
            <span class="model-status-pill ${pillClass}">
              ● ${statusText}
            </span>
          </div>
          <div class="model-item-bottom">
            <span>Used: ${m.totalUsed.toLocaleString()} tokens</span>
            <span>Capacity: ${remM}M ctx left</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Refresh Models data
  async function refreshModelDashboardData() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'LOKI_GET_MODEL_DASHBOARD' });
      if (res?.success && res.tokenStats) {
        renderModelDashboardStats(res.tokenStats);
      }
    } catch (err) {
      console.warn('[Loki HUD] Failed to query model dashboard:', err);
    }
  }

  // Button Listeners
  if (closeHudBtn) closeHudBtn.addEventListener('click', () => toggleHud(false));
  if (helpBtn) helpBtn.addEventListener('click', () => openUtility('help'));
  if (settingsBtn) settingsBtn.addEventListener('click', () => openUtility('settings'));
  if (addModelKeyBtn) addModelKeyBtn.addEventListener('click', () => addModelKeyInput());
  if (saveModelKeysBtn) {
    saveModelKeysBtn.addEventListener('click', () => {
      saveModelKeys().catch(err => {
        console.error('[Loki HUD] Failed to save model keys:', err);
        showToast('Failed to save API keys', 1500);
      });
    });
  }
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      const keys = (hudApiKeys?.value || '').split(/[\n,]+/).map(key => key.trim()).filter(Boolean);
      await chrome.storage.local.set({
        gemini_api_key: keys.join('\n'),
        gemini_api_keys: keys,
        use_mock_ai: hudUseMock?.checked === true,
        disable_popup: hudDisablePopup?.checked === true
      });
      notificationsEnabled = hudDisablePopup?.checked !== true;
      if (!notificationsEnabled) {
         clearTimeout(toastTimeout);
         toastEl?.classList.remove('show');
      }
      showToast('Settings saved', 1200);
    });
  }
  if (solveBtn) solveBtn.addEventListener('click', runAutoSolve);

  // Inject & Run button in Prompt section
  const btnInjectSolve = shadow.getElementById('btn-inject-solve');
  if (btnInjectSolve) btnInjectSolve.addEventListener('click', runAutoSolve);

  // Refresh Models button
  if (btnRefreshModels) btnRefreshModels.addEventListener('click', refreshModelDashboardData);

  // Custom Prompt Auto-Save & Enter to Run
  if (hudCustomPrompt) {
    hudCustomPrompt.addEventListener('input', () => {
      chrome.storage.local.set({ custom_ai_instruction: hudCustomPrompt.value });
    });
    hudCustomPrompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        runAutoSolve();
      }
    });
  }

  // Copy reasoning button
  const btnCopyReasoning = shadow.getElementById('btn-copy-reasoning');
  if (btnCopyReasoning && reasoningContent) {
    btnCopyReasoning.addEventListener('click', () => {
      const text = reasoningContent.textContent.trim();
      if (text) {
        navigator.clipboard.writeText(text);
        btnCopyReasoning.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        setTimeout(() => { btnCopyReasoning.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>'; }, 1500);
      }
    });
  }

  // Copy error diagnostic log
  const btnCopyErrorLog = shadow.getElementById('btn-copy-error-log');
  async function copyErrorDiagnosticLog() {
    try {
      const data = await chrome.storage.local.get(['latest_error_log', 'latest_workflow_trace', 'key_stats_map', 'latest_token_stats']);
      const historyItems = [];
      const report = { timestamp: new Date().toISOString(), source: 'Emerald In-Page HUD', page_url: window.location.href, page_title: document.title, reasoning: reasoningContent ? reasoningContent.textContent : null, latest_error: data.latest_error_log || null, workflow_trace: data.latest_workflow_trace || null, key_health_status: data.key_stats_map || null, token_stats: data.latest_token_stats || null };
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      showToast('Error log copied', 1500);
    } catch (err) { showToast(`Copy failed: ${err.message}`, 1500); }
  }
  if (btnCopyErrorLog) btnCopyErrorLog.addEventListener('click', copyErrorDiagnosticLog);

  // Hotkey Listener: Alt+3 / Alt+1 / Alt+2 / Alt+0
  let lastHotkeyTime = 0;
  function handleHotkey(e) {
    if (e.repeat) return;
    const hasMod = (e.altKey || e.ctrlKey || e.metaKey);
    if (!hasMod) return;
    const isZero = (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0' || e.keyCode === 48 || e.keyCode === 96);
    const isOne = (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1' || e.keyCode === 49 || e.keyCode === 97);
    const isTwo = (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2' || e.keyCode === 50 || e.keyCode === 98);
    const isThree = (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3' || e.keyCode === 51 || e.keyCode === 99);
    const isFour = (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4' || e.keyCode === 52 || e.keyCode === 100);
    if (!isZero && !isOne && !isTwo && !isThree && !isFour) return;
    const now = Date.now();
    if (now - lastHotkeyTime < 300) return;
    lastHotkeyTime = now;

    if (isZero) { e.preventDefault(); e.stopPropagation(); openSection('models'); return; }
    if (isThree) { e.preventDefault(); e.stopPropagation(); runAutoSolve(); return; }
    if (isOne) { e.preventDefault(); e.stopPropagation(); openSection('prompt'); return; }
    if (isTwo) { e.preventDefault(); e.stopPropagation(); openSection('reasoning'); return; }
    if (e.altKey && isFour) { e.preventDefault(); e.stopPropagation(); openUtility('settings'); return; }
  }
  window.addEventListener('keydown', handleHotkey, true);

  // Message Listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'LOKI_RUN_SOLVER') { runAutoSolve(); sendResponse({ success: true }); return true; }
    if (request.action === 'LOKI_TOGGLE_HUD') { toggleHud(typeof request.forceOpen === 'boolean' ? request.forceOpen : !isHudOpen); sendResponse({ success: true, isOpen: isHudOpen }); return true; }
    if (request.action === 'LOKI_OPEN_SECTION') { openSection(request.section || 'prompt'); sendResponse({ success: true, section: request.section || 'prompt', isOpen: isHudOpen }); return true; }
    if (request.action === 'LOKI_OPEN_UTILITY') { openUtility(request.panel || 'help'); sendResponse({ success: true, panel: request.panel || 'help', isOpen: isHudOpen }); return true; }
    if (request.action === 'LOKI_TOGGLE_REASONING') { openSection('reasoning'); sendResponse({ success: true }); return true; }
    if (request.action === 'LOKI_TOGGLE_MODEL_DASHBOARD') { toggleModelDashboard(); sendResponse({ success: true }); return true; }
  });

  // Load saved state on startup
  chrome.storage.local.get(['latest_reasoning', 'latest_reasoning_details', 'latest_used_model', 'latest_token_stats', 'custom_ai_instruction', 'disable_popup'], (res) => {
    notificationsEnabled = res?.disable_popup !== true;
    if ((res?.latest_reasoning || res?.latest_reasoning_details) && reasoningContent) {
      renderReasoningDetails(res.latest_reasoning_details, res.latest_reasoning, res.latest_used_model);
    }
    if (res?.latest_token_stats) {
      updateTokenDisplay(res.latest_token_stats);
    }
    if (res?.custom_ai_instruction && hudCustomPrompt) {
      hudCustomPrompt.value = res.custom_ai_instruction;
    }
    updateInputsCount();
  });

  // Live storage sync
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.disable_popup) {
      notificationsEnabled = changes.disable_popup.newValue !== true;
      if (!notificationsEnabled) {
        clearTimeout(toastTimeout);
        toastEl?.classList.remove('show');
      }
    }
    if (changes.latest_token_stats?.newValue) updateTokenDisplay(changes.latest_token_stats.newValue);
    if ((changes.latest_reasoning?.newValue || changes.latest_reasoning_details?.newValue || changes.latest_used_model?.newValue) && reasoningContent) {
      renderReasoningDetails(
        changes.latest_reasoning_details?.newValue || [],
        changes.latest_reasoning?.newValue || '',
        changes.latest_used_model?.newValue || ''
      );
    }
    if (changes.custom_ai_instruction && hudCustomPrompt) hudCustomPrompt.value = changes.custom_ai_instruction.newValue || '';
  });

  console.log('[Loki] Ready. Shortcuts: Alt+3 (Solve), Alt+1 (HUD), Alt+2 (Reasoning), Alt+0 (Models).');
})();

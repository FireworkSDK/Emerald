# Emerald

[![Emerald icon](https://raw.githubusercontent.com/FireworkSDK/Emerald/main/icons/icon128.png)](https://github.com/FireworkSDK/Emerald)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Emerald is an open-source Manifest V3 browser extension for AI-assisted Google
Forms and webpage automation. It scans the current page, builds a structured
map of questions and controls, asks Google Gemini to reason about the page, and
applies validated actions such as filling fields and selecting answers.

Emerald supports Chromium-based browsers, including Google Chrome and
Microsoft Edge.

Emerald is released under the [MIT License](LICENSE).

## Features

- **Structured page scanning**: detects text fields, textareas, dropdowns,
  radio buttons, checkboxes, ARIA controls, buttons, and question groups.
- **AI form solving**: sends the page structure and, when available, a
  screenshot of the visible viewport to Gemini for multimodal reasoning.
- **Checkbox handling**: selects every verified-correct checkbox option unless
  the user explicitly requests a limit.
- **Framework-aware actions**: dispatches input, change, focus, keyboard, and
  blur events to work with Google Forms and common frontend frameworks.
- **Three operating modes**:
  - **Suggest**: analyze the page without changing it.
  - **Fill**: fill fields and select answers without submitting the form.
  - **Assist**: fill fields and navigate non-consequential steps, while
    protecting consequential actions.
- **Safety checks**: submit, payment, deletion, purchase, and similar actions
  are separated from safe actions and can require confirmation.
- **Multiple Gemini API keys**: store multiple keys and automatically rotate
  when a key is unavailable or rate-limited.
- **Newest-model-first failover**: tries the newest compatible Gemini Flash
  model first, then downgrades to older compatible models when needed.
- **Per-key model dashboard**: shows key health, token usage, remaining
  context capacity, and aggregate usage.
- **Reasoning panel**: shows the model used, each question, its options, the
  selected answer, and the AI explanation.
- **Image vision**: captures the visible tab viewport so Gemini can inspect
  diagrams, charts, equations, and other visual question content.
- **Offline Mock AI**: test the extension without a Gemini key.
- **Keyboard shortcuts**:
  - `Alt+1`: Prompt panel
  - `Alt+2`: Reasoning panel
  - `Alt+3`: Run solver
  - `Alt+4`: Settings
- **Toast control**: disable HUD notification animations from Settings.

## How the extension works

1. The content scripts scan the current webpage and remove the Emerald HUD,
   scripts, styles, and other non-content nodes from the text snapshot.
2. Interactive controls are assigned stable session IDs such as
   `element_1`. Questions are grouped with their related options in
   `question_sets`.
3. The service worker captures the visible viewport when screenshot access is
   available.
4. The AI client sends the structured page data and screenshot to Gemini.
5. Gemini returns strict JSON actions such as `fill`, `select`, `check`, or
   `click`.
6. The action executor validates each target and applies safe actions to the
   page.
7. Reasoning, token usage, model selection, and workflow diagnostics are saved
   locally for display in the HUD.

The screenshot covers the visible viewport only. Scroll the relevant question
or diagram into view before running the solver if visual context is required.

## Local installation

### 1. Download the project

Clone the repository:

```powershell
git clone https://github.com/FireworkSDK/Emerald.git
cd Emerald
```

Alternatively, download the repository as a ZIP and extract it.

### 2. Load the unpacked extension

For Google Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the directory containing `manifest.json`.
5. Pin **Emerald** to the browser toolbar.

For Microsoft Edge, use the same process at `edge://extensions`.

After changing extension files, click **Reload** on the extension card and
refresh the webpage being tested.

## Gemini setup

Emerald does not include a shared API key. Each user supplies their own key.

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Open Emerald on a webpage.
3. Open the **Settings** utility panel.
4. Enter one or more Gemini API keys, one per line.
5. Disable **Use Mock AI Engine**.
6. Click **Save Settings**.

Keys are stored in Chrome/Edge extension local storage under
`gemini_api_key` and `gemini_api_keys`. They are not committed to this
repository.

The **Models** panel also supports adding and removing individual key inputs.
Use **Save Keys** there to update the key pool.

## Using Emerald

### Prompt panel

Use the Prompt panel to enter additional instructions, such as a requested
answer format or a subject-specific constraint. Press **Enter** in the prompt
box or use **Inject & Run** to run the instruction.

### Solver

1. Open the target form or webpage.
2. Make sure the questions and any important diagrams are visible.
3. Press `Alt+3`, or open the HUD and click **Solve & Auto-Fill**.
4. Wait for the status to change from **Processing** to **Done**.
5. Open **Reasoning** to review the model, questions, options, answers, and
   explanations.

Emerald fills fields and selects answers but does not submit a form in
**Fill** mode. Do not refresh or navigate away while a solve operation is
running.

### Reasoning panel

The top of the panel displays:

```text
Answered with gemini-2.5-flash
```

Each question card includes detected options, selected answers, and the
available AI explanation. If the selected model cannot be determined, the
panel reports **Model unavailable**.

### Models panel

The Models panel displays:

- Each configured key, masked for display
- Ready, rate-limited, or error status
- Per-key token usage
- Remaining context capacity
- Total usage across all keys

Gemini model selection is newest-first. If a model fails, is unavailable on
the key, or has insufficient quota, Emerald tries the next compatible model
before rotating to the next API key.

### Settings and help

Settings lets you configure API keys, toggle Mock AI, and disable toast
notifications. The `?` button opens the shortcut reference.

## Permissions and privacy

Emerald requests broad page access because it must inspect and interact with
the current webpage:

- `activeTab` and `scripting` for page scanning and action execution
- `storage` for local settings, API keys, token statistics, and diagnostics
- `tabs` for active-tab coordination and visible-tab screenshots
- `<all_urls>` host access for supported webpages

When Gemini mode is enabled, the extension sends the scanned page text,
structured interactive-element data, and the visible screenshot to Google
Gemini using the user’s API key. Do not use the extension on pages containing
information you do not want to send to that service. API keys are stored
locally by the browser extension storage API.

Emerald does not execute arbitrary AI-generated JavaScript. AI output is
restricted to the supported action schema and validated against current DOM
elements before execution. Users should still review generated answers and
never rely on automation for high-impact decisions.

## Project structure

```text
manifest.json
background/
  ai-client.js          Gemini integration, model failover, and Mock AI
  service-worker.js     Agent loop, permissions, storage, and routing
content/
  dom-scanner.js        Page and question extraction
  action-executor.js    Validated DOM actions
  content.js            Content-script message routing
  side-panel.js         In-page HUD and controls
icons/                  Extension icons
lib/katex/              Local KaTeX assets for reasoning display
popup/
  popup.html            Browser-action popup
  popup.js              Popup controller
  popup.css             Popup styles
```

## Development and validation

No package installation is required for the current extension. Validate the
main JavaScript files with Node:

```powershell
node --check background/ai-client.js
node --check background/service-worker.js
node --check content/dom-scanner.js
node --check content/action-executor.js
node --check content/content.js
node --check content/side-panel.js
node --check popup/popup.js
```

For changes to the extension, reload it from `chrome://extensions` or
`edge://extensions`, then test on a disposable form before using it on real
data.

## Contributing

1. Create a feature branch.
2. Make focused changes.
3. Run the JavaScript syntax checks above.
4. Test the unpacked extension in Chrome or Edge.
5. Open a pull request with the behavior change and validation performed.

## License

This repository is open source. Add the project license that matches your
distribution and contribution requirements before publishing a store listing.

# Emerald Privacy Policy

**Effective date:** September 16, 2026

Emerald is an open-source browser extension for AI-assisted webpage and form
automation. This policy explains what information Emerald processes, where it is
stored, and when it is sent to a third-party AI provider.

## 1. Information Emerald processes

When you use Emerald on a webpage, it may process:

- Text visible in the page content.
- Structured information about interactive controls, including labels,
  questions, options, input types, and element identifiers.
- The visible browser-tab screenshot when multimodal reasoning is used.
- Your instructions, selected operation mode, and custom AI instructions.
- Generated answers, reasoning, action results, token statistics, model status,
  and diagnostic information.

Emerald only performs this processing when its functionality is used. It does
not require an Emerald account.

## 2. Gemini and third-party processing

If Gemini mode is enabled, the page information described above is sent
directly to Google Gemini through the Gemini API using an API key that you
provide. Google’s handling of that information is governed by Google’s
applicable terms and privacy documentation, not by Emerald.

Do not use Gemini mode on pages containing information that you do not want to
send to Google or that you are not authorized to process.

If Offline Mock AI is enabled, Emerald uses its local mock engine instead of
the Gemini API for the mock operation. The mock engine is intended for
testing and does not provide real AI answers.

## 3. Local storage

Emerald stores the following information in the browser’s extension storage:

- Gemini API keys configured by you.
- Preferred model and model downgrade settings.
- Mock AI, notification, and other extension settings.
- Token statistics, model status, latest reasoning, and diagnostic workflow
  information.

API keys are stored locally by the browser extension storage API and are not
embedded in this repository or shared by Emerald with other users. Anyone with
access to your browser profile may be able to access extension storage, so
protect your browser profile and revoke keys that you no longer use.

You can remove stored settings and keys by using the extension’s settings or
by removing the extension through your browser’s extension manager. Previously
sent information may remain subject to the third-party provider’s policies.

## 4. Page access and permissions

Emerald requests broad webpage access because it supports ordinary websites,
forms, surveys, quizzes, dashboards, and custom web applications. Its
permissions allow it to:

- Inspect and interact with the active webpage.
- Inject the extension’s scanner, action executor, and user interface.
- Coordinate with the active tab and capture the visible tab when requested.
- Store local settings and diagnostic data.

Emerald does not operate a hosted Emerald analytics service or require a
central Emerald server for its normal operation.

## 5. Automation and user control

Emerald may fill fields, select options, check controls, click supported
navigation buttons, and perform other actions requested by the user. It does
not intentionally submit consequential actions such as purchases, payments,
deletions, or final submissions without the applicable confirmation flow.

AI output can be incorrect. Review generated answers, filled values, and
actions before relying on them.

## 6. Security

No software can guarantee complete security. Use current browser versions,
keep API keys private, avoid storing sensitive data in custom prompts, and
remove or rotate compromised keys immediately.

## 7. Children and sensitive information

Emerald is not designed to collect personal information from children. You
are responsible for deciding whether its use is appropriate for a particular
page, organization, or jurisdiction. Do not process sensitive information
unless you have a lawful basis and authorization to do so.

## 8. Changes and contact

This policy may be updated when Emerald’s features or data flows change. The
effective date at the top will be updated when material changes are made.

For questions or privacy-related concerns, open an issue in the
[Emerald repository](https://github.com/FireworkSDK/Emerald/issues).

## 9. Open-source license

Emerald is released under the [MIT License](LICENSE). This privacy policy
describes the extension’s behavior and does not grant rights beyond that
license.

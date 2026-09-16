/**
 * Loki Universal DOM Scanner
 * Universal scanner for web pages built with React/Next.js, Vue/Nuxt, Angular, Svelte,
 * Tailwind UI, Radix UI, Material UI, Ant Design, Google Forms, and traditional HTML.
 * Produces a compact, structured element map with internal IDs (element_1, element_2, etc.).
 */

(function () {
  if (window.__LokiDOMScanner) return;
  class LokiDOMScanner {
    constructor() {
      window.__lokiElementMap = new Map();
    }

    /**
     * Checks if a DOM element is visible to the user.
     */
    isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    /**
     * Finds enclosing question, field, or section header text for contextual AI reasoning.
     * Works with fieldsets, form groups, Radix UI slots, Material UI wrappers, and ARIA groups.
     */
    getQuestionContext(el) {
      // For Google Forms, each option row is nested inside a per-question block.
      // We walk up ONLY to specific known question container classes, never arbitrary ancestors.

      // 1. Check aria-labelledby on the element or nearest radiogroup/group
      const parentGroup = el.closest('[role="radiogroup"], [role="group"]');
      const ariaLabelledBy = el.getAttribute('aria-labelledby') || parentGroup?.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const parts = ariaLabelledBy.split(/\s+/);
        const textParts = parts
          .map(id => document.getElementById(id))
          .filter(Boolean)
          .map(target => target.textContent.trim())
          .filter(t => t.length > 0 && t.length < 500 && !/<[a-z]/i.test(t));
        if (textParts.length > 0) return textParts.join(' ').replace(/\s+/g, ' ');
      }

      // 2. Find the question item container in Google Forms / modern form frameworks
      // Google Forms questions are wrapped in .Qr7Oae or [role="listitem"]
      const questionRoot = el.closest(
        '.Qr7Oae, [role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot, .geor2, fieldset'
      );

      if (questionRoot) {
        // Look for Google Forms question title (.M7eMe) or standard headings
        const heading = questionRoot.querySelector(
          '.M7eMe, .freebirdFormviewerComponentsQuestionBaseTitle, .exportQuestionTitle, ' +
          'legend, [role="heading"], h1, h2, h3, h4, h5'
        );

        if (heading && !heading.contains(el) && !el.contains(heading)) {
          let headingText = heading.textContent.trim().replace(/\s+/g, ' ');
          if (headingText.length > 2 && headingText.length < 600 && !/<[a-z]/i.test(headingText)) {
            // Optional: attach question description/subtitle (e.g. "Pilihlah 3 pernyataan...") if present
            const sub = questionRoot.querySelector('.gND9Gd, .Y6W2fd');
            const subText = sub ? sub.textContent.trim().replace(/\s+/g, ' ') : '';
            if (subText && subText.length > 2 && subText.length < 300 && !sub.contains(el)) {
              headingText = `${headingText} - ${subText}`;
            }

            // Flag if question contains an attached diagram/image so vision AI inspects it
            const hasImg = !!questionRoot.querySelector('img.exportItemImage, img[src]');
            if (hasImg) {
              headingText += ' [Note: Question has visual diagram/image shown in screenshot]';
            }

            return headingText;
          }
        }

        // Fallback: clone and strip interactive controls, then extract remaining text
        try {
          const clone = questionRoot.cloneNode(true);
          clone.querySelectorAll(
            'input, select, textarea, button, [role="radio"], [role="checkbox"], ' +
            '[role="option"], label, .exportOption, .doc2da, .aFv42, .disc, .aDTYNe, ' +
            '.appsMaterialWizToggleRadiogroupOffRadio, script, style, noscript'
          ).forEach(child => child.remove());
          const remainingText = clone.textContent.trim().replace(/\s+/g, ' ');
          if (remainingText.length > 2 && remainingText.length < 600 && !/<[a-z]/i.test(remainingText)) {
            return remainingText;
          }
        } catch (err) {}
      }

      return null;
    }

    /**
     * Resolves label or choice text associated with an element across native HTML and framework UIs.
     */
    getLabelText(el) {
      // 1. Explicit <label for="id">
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl && labelEl.textContent.trim()) {
          return labelEl.textContent.trim();
        }
      }

      // 2. Enclosing <label>
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const childInputs = clone.querySelectorAll('input, select, textarea, button');
        childInputs.forEach(child => child.remove());
        const labelText = clone.textContent.trim();
        if (labelText) return labelText;
      }

      // 3. aria-label attribute (strip Google Forms '[ ] ' / '[x] ' prefix injected for screen readers)
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim().replace(/^\[.\]\s*/i, '');
      }

      // 4. aria-labelledby attribute
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const parts = ariaLabelledBy.split(/\s+/);
        const textParts = parts
          .map(id => document.getElementById(id))
          .filter(Boolean)
          .map(target => target.textContent.trim());
        if (textParts.length > 0) return textParts.join(' ');
      }

      // 5. Direct inner text / content (for custom ARIA controls / buttons / options)
      const directText = (el.innerText || el.textContent || '').trim();
      if (directText && directText.length < 150) {
        return directText;
      }

      // 6. placeholder attribute
      if (el.placeholder) {
        return el.placeholder.trim();
      }

      // 7. name or data-testid attribute
      if (el.name) {
        return el.name.replace(/[-_]/g, ' ').trim();
      }
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy');
      if (testId) {
        return testId.replace(/[-_]/g, ' ').trim();
      }

      // 8. Nearby preceding sibling text
      let prev = el.previousElementSibling;
      while (prev) {
        if (['SPAN', 'LABEL', 'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'DT'].includes(prev.tagName)) {
          const text = prev.textContent.trim();
          if (text && text.length < 100) return text;
        }
        prev = prev.previousElementSibling;
      }

      return null;
    }

    /**
     * Main scan entry point. Returns structured array of detected elements.
     */
    scan() {
      window.__lokiElementMap.clear();

      const elements = [];
      let counter = 1;

      // Universal selector for native + modern framework interactive controls (React, Vue, Angular, Svelte, Tailwind, Radix)
      const selector =
        'input, textarea, select, button, a[href], [contenteditable="true"], ' +
        '[role="button"], [role="checkbox"], [role="option"], [role="radio"], ' +
        '[role="switch"], [role="combobox"], [role="listbox"], [role="menuitem"], ' +
        '[role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="textbox"]';

      const candidates = document.querySelectorAll(selector);

      candidates.forEach(el => {
        // Skip hidden native input elements
        if (el.type === 'hidden') return;

        const visible = this.isVisible(el);
        if (!visible) return;

        const tagName = el.tagName.toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        const inputType = (el.type || '').toLowerCase();
        const isContentEditable = el.getAttribute('contenteditable') === 'true';

        let itemData = null;
        const internalId = `element_${counter++}`;

        // A. Radio Controls (Native HTML or Framework ARIA)
        if (inputType === 'radio' || role === 'radio' || role === 'menuitemradio') {
          const labelText = this.getLabelText(el);
          itemData = {
            id: internalId,
            visible: true,
            type: 'radio',
            label: labelText,
            question: this.getQuestionContext(el),
            value: el.value || el.getAttribute('data-value') || labelText,
            checked: el.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked'
          };
        }

        // B. Checkbox & Switch Controls (Native HTML or Framework ARIA)
        else if (inputType === 'checkbox' || role === 'checkbox' || role === 'switch' || role === 'menuitemcheckbox') {
          const labelText = this.getLabelText(el);
          itemData = {
            id: internalId,
            visible: true,
            type: 'checkbox',
            label: labelText,
            question: this.getQuestionContext(el),
            value: el.value || el.getAttribute('data-value') || labelText,
            checked: el.checked || el.getAttribute('aria-checked') === 'true' || el.getAttribute('data-state') === 'checked'
          };
        }

        // C. Combobox & Custom Select (Radix, Headless UI, Vuetify, Angular Material)
        else if (role === 'combobox' || role === 'listbox') {
          const labelText = this.getLabelText(el);
          itemData = {
            id: internalId,
            visible: true,
            type: 'combobox',
            label: labelText,
            question: this.getQuestionContext(el),
            value: el.value || el.getAttribute('data-value') || labelText,
            expanded: el.getAttribute('aria-expanded') === 'true'
          };
        }

        // D. Contenteditable Rich Text (Draft.js, Quill, Vue/React rich inputs)
        else if (isContentEditable || role === 'textbox') {
          itemData = {
            id: internalId,
            visible: true,
            type: 'input',
            input_type: 'contenteditable',
            label: this.getLabelText(el),
            question: this.getQuestionContext(el),
            value: (el.innerText || el.textContent || '').trim()
          };
        }

        // E. Native Text Inputs
        else if (tagName === 'input') {
          if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
            const btnText = el.value || el.innerText || this.getLabelText(el) || 'Submit';
            itemData = {
              id: internalId,
              visible: true,
              type: 'button',
              text: btnText,
              is_submit: inputType === 'submit'
            };
          } else {
            itemData = {
              id: internalId,
              visible: true,
              type: 'input',
              input_type: inputType || 'text',
              label: this.getLabelText(el),
              question: this.getQuestionContext(el),
              placeholder: el.placeholder || null,
              name: el.name || null,
              value: el.value || '',
              required: !!el.required
            };
          }
        }

        // F. Native Textarea
        else if (tagName === 'textarea') {
          itemData = {
            id: internalId,
            visible: true,
            type: 'textarea',
            label: this.getLabelText(el),
            question: this.getQuestionContext(el),
            placeholder: el.placeholder || null,
            name: el.name || null,
            value: el.value || '',
            required: !!el.required
          };
        }

        // G. Native Select Dropdown
        else if (tagName === 'select') {
          itemData = {
            id: internalId,
            visible: true,
            type: 'select',
            label: this.getLabelText(el),
            question: this.getQuestionContext(el),
            name: el.name || null,
            required: !!el.required,
            value: el.value || null,
            options: Array.from(el.options).map(opt => ({
              text: opt.text.trim(),
              value: opt.value
            }))
          };
        }

        // H. Custom ARIA Options / Tabs / Menuitems
        else if (role === 'option' || role === 'tab' || role === 'menuitem') {
          const optText = (el.innerText || el.textContent || '').trim();
          itemData = {
            id: internalId,
            visible: true,
            type: 'option',
            text: optText,
            selected: el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'active'
          };
        }

        // I. Buttons (Native or ARIA)
        else if (tagName === 'button' || role === 'button') {
          const btnText = (el.innerText || el.textContent || this.getLabelText(el) || '').trim();
          itemData = {
            id: internalId,
            visible: true,
            type: 'button',
            text: btnText,
            aria_label: el.getAttribute('aria-label') || null,
            title: el.getAttribute('title') || null,
            is_submit: (el.type === 'submit') || /submit|kirim|send|buy|purchase|pay|confirm|delete|next|continue/i.test(btnText)
          };
        }

        // J. Links
        else if (tagName === 'a') {
          const linkText = (el.innerText || el.textContent || '').trim();
          if (!linkText && !el.getAttribute('aria-label')) return;
          itemData = {
            id: internalId,
            visible: true,
            type: 'link',
            text: linkText,
            href: el.href || null,
            aria_label: el.getAttribute('aria-label') || null
          };
        }

        // Register and record valid itemData
        if (itemData) {
          window.__lokiElementMap.set(internalId, el);
          elements.push(itemData);
        }
      });

      // Extract general page text context
      const pageTitle = document.title || '';
      const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
      const formsCount = document.forms.length;

      // Extract page text without including Emerald's own HUD or non-content nodes.
      // The HUD lives in the page DOM and can otherwise contaminate the AI context.
      let rawText = '';
      if (document.body) {
        const bodyClone = document.body.cloneNode(true);
        bodyClone.querySelectorAll(
          '#loki-compact-hud-host, script, style, noscript, svg, iframe'
        ).forEach(node => node.remove());
        rawText = bodyClone.innerText || bodyClone.textContent || '';
      }
      const cleanedBodyText = rawText
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 30000);

      const questionSets = [];
      const groupedQuestions = new Map();
      elements
        .filter(element => element.question)
        .forEach(element => {
          if (!groupedQuestions.has(element.question)) {
            groupedQuestions.set(element.question, []);
          }
          groupedQuestions.get(element.question).push({
            id: element.id,
            type: element.type,
            label: element.label || element.text || null,
            value: element.value || null,
            options: element.options || undefined,
            checked: element.checked || false
          });
        });
      groupedQuestions.forEach((options, question) => {
        questionSets.push({ question, options });
      });

      return {
        title: pageTitle,
        url: window.location.href,
        description: metaDescription,
        forms_count: formsCount,
        body_text: cleanedBodyText,
        question_sets: questionSets,
        interactive_elements_count: elements.length,
        elements: elements
      };
    }
  }

  window.__LokiDOMScanner = new LokiDOMScanner();
})();

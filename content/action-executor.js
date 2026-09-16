/**
 * Loki Universal Action Executor
 * Safely executes validated AI actions on web page elements across native HTML and
 * modern frontend frameworks (React/Next.js, Vue/Nuxt, Angular, Svelte, Tailwind UI, Radix UI).
 */

(function () {
  if (window.__LokiActionExecutor) return;
  class LokiActionExecutor {
    constructor() {
      this.allowedActions = new Set([
        'fill',
        'select',
        'check',
        'uncheck',
        'click',
        'scroll',
        'answer',
        'finish'
      ]);
    }

    /**
     * Dispatches complete synthetic event sequence to trigger framework reactive updates
     * (React v-model/state, Vue v-model, Angular NgModel/ReactiveForms, Svelte stores).
     */
    triggerReactivitySequence(el) {
      const eventTypes = ['focus', 'keydown', 'input', 'keyup', 'change', 'blur'];
      eventTypes.forEach(type => {
        try {
          let event;
          if (type.startsWith('key')) {
            event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
          } else if (type === 'input') {
            event = new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' });
          } else {
            event = new Event(type, { bubbles: true, cancelable: true });
          }
          el.dispatchEvent(event);
        } catch (err) {
          try {
            el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
          } catch (e) {}
        }
      });
    }

    /**
     * Safely updates input value bypassing framework internal value tracking property descriptors.
     */
    setNativeInputValue(el, value) {
      try { el.focus(); } catch (e) {}
      const valStr = value !== undefined && value !== null ? String(value) : '';
      const isTextArea = el.tagName && el.tagName.toLowerCase() === 'textarea';
      const prototype = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

      if (descriptor && descriptor.set) {
        descriptor.set.call(el, valStr);
      } else {
        el.value = valStr;
      }

      el.setAttribute('value', valStr);

      // Auto-grow textareas for Google Forms and modern UI
      if (isTextArea) {
        try {
          el.style.height = 'auto';
          el.style.height = `${Math.max(el.scrollHeight, 36)}px`;
        } catch (e) {}
      }

      this.triggerReactivitySequence(el);
    }

    /**
     * Dispatches a realistic mouse/pointer click sequence for custom ARIA controls.
     */
    dispatchFullClickSequence(el) {
      el.focus();

      const eventOpts = { bubbles: true, cancelable: true, view: window };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
        el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
        el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
        el.click();
      } catch (err) {
        el.click();
      }
    }

    /**
     * Scroll element into view smoothly.
     */
    scrollIntoView(el) {
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }

    /**
     * Validates action object structure and target element presence.
     */
    validateAction(action) {
      if (!action || typeof action !== 'object') {
        return { valid: false, reason: 'Invalid action payload structure' };
      }

      if (!this.allowedActions.has(action.type)) {
        return { valid: false, reason: `Action type '${action.type}' is not permitted` };
      }

      if (['fill', 'select', 'check', 'uncheck', 'click', 'scroll'].includes(action.type)) {
        if (!action.element_id) {
          return { valid: false, reason: `Action '${action.type}' requires 'element_id'` };
        }

        const el = window.__lokiElementMap?.get(action.element_id);
        if (!el || !document.body.contains(el)) {
          return { valid: false, reason: `Target element '${action.element_id}' is no longer present on the page` };
        }
      }

      return { valid: true };
    }

    /**
     * Executes a single validated action.
     */
    async executeSingleAction(action) {
      const validation = this.validateAction(action);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      const { type, element_id, value } = action;
      const el = window.__lokiElementMap?.get(element_id);

      if (el) {
        this.scrollIntoView(el);
      }

      switch (type) {
        case 'fill': {
          if (!el) throw new Error('Target element missing');
          const isContentEditable = el.isContentEditable ||
            el.getAttribute('contenteditable') === 'true' ||
            el.getAttribute('role') === 'textbox';

          if (isContentEditable) {
            try { el.focus(); } catch (e) {}
            const valStr = value !== undefined && value !== null ? String(value) : '';
            const doc = el.ownerDocument || document;
            const replaced = doc.execCommand && doc.execCommand('selectAll', false, null) &&
              doc.execCommand('insertText', false, valStr);
            if (!replaced || el.innerText !== valStr) {
              el.innerText = valStr;
              el.textContent = valStr;
            }
            this.triggerReactivitySequence(el);
          } else {
            this.setNativeInputValue(el, value !== undefined && value !== null ? String(value) : '');
          }
          return { status: 'success', message: `Filled element '${element_id}' with '${value}'` };
        }

        case 'select': {
          if (!el) throw new Error('Target element missing');
          const tagName = el.tagName.toLowerCase();
          const role = (el.getAttribute('role') || '').toLowerCase();

          if (tagName === 'select') {
            let matched = false;
            for (let i = 0; i < el.options.length; i++) {
              const opt = el.options[i];
              if (
                opt.value.toLowerCase() === String(value).toLowerCase() ||
                opt.text.trim().toLowerCase() === String(value).toLowerCase()
              ) {
                el.selectedIndex = i;
                matched = true;
                break;
              }
            }
            this.triggerReactivitySequence(el);
            return { status: 'success', message: `Selected option '${value}' on '${element_id}'` };
          } else if (role === 'combobox' || role === 'listbox') {
            // Open combobox and find option text
            this.dispatchFullClickSequence(el);
            await new Promise(r => setTimeout(r, 150));

            const options = document.querySelectorAll('[role="option"], [role="treeitem"], li');
            for (const opt of options) {
              if ((opt.innerText || opt.textContent || '').toLowerCase().includes(String(value).toLowerCase())) {
                this.dispatchFullClickSequence(opt);
                break;
              }
            }
            return { status: 'success', message: `Selected custom option '${value}'` };
          }
          return { status: 'success', message: `Selected '${value}'` };
        }

        case 'check':
        case 'uncheck': {
          if (!el) throw new Error('Target element missing');
          const shouldCheck = type === 'check';

          // ── Native <input type="checkbox"> / <input type="radio"> ──
          const isNativeCheckable = el.tagName.toLowerCase() === 'input' &&
            (el.type === 'checkbox' || el.type === 'radio');

          if (isNativeCheckable) {
            if (el.checked !== shouldCheck) {
              this.dispatchFullClickSequence(el);
              if (el.checked !== shouldCheck) {
                el.checked = shouldCheck;
                this.triggerReactivitySequence(el);
              }
            }
            return { status: 'success', message: `${shouldCheck ? 'Checked' : 'Unchecked'} native element '${element_id}'` };
          }

          // ── ARIA / custom controls (div[role="checkbox"], div[role="radio"], etc.) ──
          const getAriaChecked = (node) =>
            node.getAttribute('aria-checked') === 'true' ||
            node.getAttribute('data-state') === 'checked';

          // If already in the target state, do NOT click (prevent unchecking)
          if (getAriaChecked(el) === shouldCheck) {
            return { status: 'success', message: `'${element_id}' already ${shouldCheck ? 'checked' : 'unchecked'}` };
          }

          // Method 1: Click the element itself directly (where Google Forms jsaction is attached)
          this.dispatchFullClickSequence(el);
          await new Promise(r => setTimeout(r, 150));
          if (getAriaChecked(el) === shouldCheck) {
            return { status: 'success', message: `${shouldCheck ? 'Checked' : 'Unchecked'} element '${element_id}'` };
          }

          // Method 2: Space key press (standard ARIA keyboard toggle)
          try {
            el.focus();
            const spaceOpts = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true };
            el.dispatchEvent(new KeyboardEvent('keydown', spaceOpts));
            el.dispatchEvent(new KeyboardEvent('keyup', spaceOpts));
            await new Promise(r => setTimeout(r, 150));
            if (getAriaChecked(el) === shouldCheck) {
              return { status: 'success', message: `${shouldCheck ? 'Checked' : 'Unchecked'} '${element_id}' via keyboard` };
            }
          } catch (err) {}

          // Method 3: Click enclosing label if present (for frameworks wrapping standard inputs)
          const enclosingLabel = el.closest('label');
          if (enclosingLabel) {
            this.dispatchFullClickSequence(enclosingLabel);
            await new Promise(r => setTimeout(r, 150));
            if (getAriaChecked(el) === shouldCheck) {
              return { status: 'success', message: `${shouldCheck ? 'Checked' : 'Unchecked'} '${element_id}' via label` };
            }
          }

          return { status: 'success', message: `Attempted '${element_id}'` };
        }

        case 'click': {
          if (!el) throw new Error('Target element missing');
          this.dispatchFullClickSequence(el);
          return { status: 'success', message: `Clicked element '${element_id}'` };
        }

        case 'scroll': {
          if (el) this.scrollIntoView(el);
          return { status: 'success', message: `Scrolled to element '${element_id}'` };
        }

        case 'answer':
        case 'finish': {
          return { status: 'success', message: action.message || 'Task completed' };
        }

        default:
          throw new Error(`Unsupported action type: ${type}`);
      }
    }

    /**
     * Clears all currently-selected checkboxes and form selections
     * to provide a clean slate before executing new AI actions.
     */
    async clearExistingSelections() {
      try {
        // 1. Uncheck all currently checked ARIA checkboxes (Google Forms, custom UI)
        const ariaCheckedBoxes = document.querySelectorAll(
          '[role="checkbox"][aria-checked="true"], [role="checkbox"][data-state="checked"]'
        );
        for (const cb of ariaCheckedBoxes) {
          // Keep email agreement or terms checkbox intact if present
          if (/record.*email|include.*response|agree.*terms/i.test(cb.getAttribute('aria-label') || '')) {
            continue;
          }
          this.dispatchFullClickSequence(cb);
          await new Promise(r => setTimeout(r, 80));
        }

        // 2. Uncheck native checkboxes
        const nativeCheckedBoxes = document.querySelectorAll('input[type="checkbox"]:checked');
        for (const cb of nativeCheckedBoxes) {
          cb.checked = false;
          this.triggerReactivitySequence(cb);
        }

        // 3. Clear radio group selections if "Clear selection" / "Hapus pilihan" button exists
        const clearButtons = document.querySelectorAll(
          '[role="button"][aria-label*="Clear"], [role="button"][aria-label*="Hapus"], [data-action="clear"]'
        );
        for (const btn of clearButtons) {
          const btnLabel = (btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
          if (btnLabel.includes('clear') || btnLabel.includes('hapus')) {
            this.dispatchFullClickSequence(btn);
            await new Promise(r => setTimeout(r, 50));
          }
        }

        // Allow DOM to settle before applying new actions
        await new Promise(r => setTimeout(r, 120));
      } catch (err) {
        console.warn('[Loki Executor] Error during pre-fill clear:', err);
      }
    }

    /**
     * Executes a batch of actions sequentially with brief pause for DOM reactivity.
     */
    async executeActions(actions) {
      // Wipe stale / pre-checked options first for a clean slate
      await this.clearExistingSelections();

      const results = [];
      for (const action of actions) {
        try {
          const res = await this.executeSingleAction(action);
          results.push({ action, success: true, ...res });
          await new Promise(r => setTimeout(r, 120));
        } catch (err) {
          results.push({ action, success: false, error: err.message });
          // Log error and continue executing remaining actions
        }
      }
      return results;
    }
  }

  window.__LokiActionExecutor = new LokiActionExecutor();
})();

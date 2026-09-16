// popup.js – Loki Page Inspector

const $ = id => document.getElementById(id);

async function scanPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // ── Inputs: skip hidden, skip empty/nameless with no placeholder ──
      const inputs = [...document.querySelectorAll("input")]
        .filter(i => i.type !== "hidden")
        .map(i => ({
          type:        i.type || "text",
          name:        i.name        || null,
          placeholder: i.placeholder || null,
          value:       i.value       || null,
          required:    i.required    || false
        }))
        .filter(i => i.name || i.placeholder || i.type === "submit"); // drop totally anonymous

      // ── Buttons: skip blank and icon-only ──
      const buttons = [...document.querySelectorAll("button, input[type='submit'], input[type='button']")]
        .map(b => ({
          text:     (b.innerText || b.value || "").trim(),
          type:     b.type || "button",
          disabled: b.disabled
        }))
        .filter(b => b.text.length > 0);

      // ── Forms: group inputs by their parent <form> ──
      const forms = [...document.querySelectorAll("form")].map((form, idx) => ({
        id:     form.id     || null,
        name:   form.name   || null,
        action: form.action || null,
        method: form.method || "get",
        fields: [...form.querySelectorAll("input, select, textarea")]
          .filter(el => el.type !== "hidden")
          .map(el => ({
            tag:         el.tagName.toLowerCase(),
            type:        el.type        || null,
            name:        el.name        || null,
            placeholder: el.placeholder || null,
            required:    el.required    || false
          }))
      }));

      // ── Text: trim and deduplicate whitespace ──
      const text = document.body.innerText
        .replace(/\n{3,}/g, "\n\n")  // collapse 3+ blank lines
        .trim();

      return {
        title:   document.title,
        url:     location.href,
        text,
        buttons,
        inputs,
        forms
      };
    }
  });

  return result;
}

function render(page) {
  // Meta
  $("pg-title").textContent = page.title || "(no title)";
  $("pg-url").textContent   = page.url;
  $("pg-text").textContent  = page.text || "";

  // Buttons
  const buttons = page.buttons;
  $("btn-count").textContent = buttons.length;
  const btnList = $("btn-list");
  if (buttons.length === 0) {
    btnList.innerHTML = '<span class="empty">No buttons found</span>';
  } else {
    btnList.innerHTML = buttons
      .slice(0, 30)
      .map(b => `<div class="chip"${b.disabled ? ' style="opacity:.45"' : ''}>${b.text}</div>`)
      .join("");
  }

  // Inputs (visible only)
  const inputs = page.inputs;
  $("inp-count").textContent = inputs.length;
  const inpList = $("inp-list");
  if (inputs.length === 0) {
    inpList.innerHTML = '<span class="empty">No visible inputs found</span>';
  } else {
    inpList.innerHTML = inputs
      .slice(0, 20)
      .map(i => `
        <div class="input-item">
          <span class="input-type">${i.type}</span>
          <span class="input-name">${i.name || ""}</span>
          ${i.placeholder ? `<span class="input-placeholder">${i.placeholder}</span>` : ""}
          ${i.required ? `<span class="input-type" style="margin-left:auto">*</span>` : ""}
        </div>
      `)
      .join("");
  }

  // Print clean JSON to console
  console.log("[Loki] Page data:", JSON.stringify(page, null, 2));

  // Show dashboard
  $("loading").style.display   = "none";
  $("dashboard").style.display = "block";

  // Copy — exports the clean page object
  $("copy-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify(page, null, 2)).then(() => {
      const btn = $("copy-btn");
      btn.textContent = "copied";
      btn.classList.add("success");
      setTimeout(() => {
        btn.textContent = "copy as json";
        btn.classList.remove("success");
      }, 1800);
    });
  });
}

// Run
scanPage()
  .then(render)
  .catch(err => {
    $("loading").innerHTML = `<p style="color:oklch(60% 0.15 25);font-family:var(--font-display);font-size:11px;padding:16px">${err.message}</p>`;
    console.error("[Loki]", err);
  });

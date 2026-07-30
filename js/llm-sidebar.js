(function () {
  "use strict";

  var STORAGE_KEY = "yokubi-openrouter-api-key";
  var MODEL_KEY = "yokubi-openrouter-model";
  var OPEN_KEY = "yokubi-llm-sidebar-open";
  var WIDTH_KEY = "yokubi-llm-sidebar-width";
  var FONT_KEY = "yokubi-llm-font-size";
  var DEFAULT_MODEL = "openai/gpt-4o-mini";
  var DEFAULT_WIDTH = 480;
  var MIN_WIDTH = 360;
  var DEFAULT_FONT = 17;
  var MIN_FONT = 13;
  var MAX_FONT = 24;
  var MOBILE_BREAKPOINT = 820;
  var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  var SYSTEM_PROMPT_URL = "system-prompt.txt";
  var DEFAULT_SYSTEM_PROMPT = [
    "You are a pragmatic Japanese-language learning assistant embedded in Yokubi, a Japanese grammar guide.",
    "",
    "Act as a focused helper, not a companion. Be professional, direct, calm, and useful. Do not simulate friendship or emotional intimacy, use pet names, or frame yourself as a source of companionship.",
    "",
    "Answer questions using the lesson the student is currently reading. Explain the relevant grammar, meaning, usage, or nuance clearly and concisely. Use English unless the student asks for Japanese. When useful, provide short Japanese example sentences with brief explanations.",
    "",
    "Do not use emoji unless the student explicitly requests them or an emoji is itself the subject of the question.",
    "",
    "Use Markdown only when it materially improves readability. Prefer plain paragraphs for short answers. Use headings and lists sparingly. Use bold only for essential labels or a genuinely important contrast; do not arbitrarily bold words, phrases, or every key term.",
    "",
    "The chat renderer supports:",
    "- Plain paragraphs and line breaks.",
    "- ATX headings from `#` through `######`.",
    "- Flat unordered lists using `-`, `*`, or `+`, and flat ordered lists using `1.` syntax.",
    "- Blockquotes using `>`.",
    "- Horizontal rules using three or more `-`, `*`, or `_` characters.",
    "- Fenced code blocks using triple backticks, optionally followed by a language name.",
    "- GFM-style pipe tables, including `:` alignment markers in the separator row.",
    "- Inline code using backticks.",
    "- Italic using `*text*` or `_text_`; bold using `**text**` or `__text__`; and bold italic using three markers.",
    "- Links using `[label](URL)` when the URL uses `http`, `https`, or `mailto`.",
    "",
    "The renderer does not support images, nested lists, task lists, strikethrough, footnotes, or raw HTML. Do not emit unsupported Markdown syntax.",
    "",
    "If a question falls outside the current lesson, say so briefly and still provide practical help when possible. If uncertain, state the uncertainty rather than inventing an answer.",
  ].join("\n");

  var state = {
    open: false,
    busy: false,
    messages: [],
    resizing: false,
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || "";
  }

  function setApiKey(key) {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  }

  function getModel() {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  }

  function setModel(model) {
    localStorage.setItem(MODEL_KEY, model || DEFAULT_MODEL);
  }

  function maxWidth() {
    return Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.9));
  }

  function clampWidth(px) {
    var n = Math.round(Number(px));
    if (!isFinite(n)) n = DEFAULT_WIDTH;
    return Math.min(maxWidth(), Math.max(MIN_WIDTH, n));
  }

  function getStoredWidth() {
    var n = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    return isFinite(n) ? clampWidth(n) : DEFAULT_WIDTH;
  }

  function applyWidth(px) {
    var w = clampWidth(px);
    document.documentElement.style.setProperty("--yokubi-llm-width", w + "px");
    return w;
  }

  function setWidth(px) {
    var w = applyWidth(px);
    localStorage.setItem(WIDTH_KEY, String(w));
    return w;
  }

  function getPanelWidth() {
    var panel = $("#yokubi-llm-panel");
    if (panel) {
      var rect = panel.getBoundingClientRect().width;
      if (rect > 0) return rect;
    }
    return getStoredWidth();
  }

  function clampFontSize(px) {
    var n = Math.round(Number(px));
    if (!isFinite(n)) n = DEFAULT_FONT;
    return Math.min(MAX_FONT, Math.max(MIN_FONT, n));
  }

  function getFontSize() {
    var n = parseInt(localStorage.getItem(FONT_KEY), 10);
    return isFinite(n) ? clampFontSize(n) : DEFAULT_FONT;
  }

  function applyFontSize(px) {
    var size = clampFontSize(px);
    document.documentElement.style.setProperty("--yokubi-llm-font-size", size + "px");
    return size;
  }

  function setFontSize(px) {
    var size = applyFontSize(px);
    localStorage.setItem(FONT_KEY, String(size));
    return size;
  }

  function isMobileLayout() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function updateFontSizeLabel(size) {
    var label = $("#yokubi-llm-font-value");
    if (label) label.textContent = clampFontSize(size) + "px";
  }

  function setupResize(handle) {
    var startX = 0;
    var startW = 0;

    function onMove(e) {
      if (!state.resizing) return;
      var dx = startX - e.clientX;
      applyWidth(startW + dx);
    }

    function onUp(e) {
      if (!state.resizing) return;
      state.resizing = false;
      document.documentElement.classList.remove("yokubi-llm-resizing");
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      setWidth(getPanelWidth());
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (isMobileLayout() || !state.open) return;
      state.resizing = true;
      startX = e.clientX;
      startW = getPanelWidth();
      document.documentElement.classList.add("yokubi-llm-resizing");
      handle.setPointerCapture(e.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      e.preventDefault();
    });

    handle.addEventListener("dblclick", function () {
      if (isMobileLayout()) return;
      setWidth(DEFAULT_WIDTH);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(url) {
    var u = String(url || "").trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    return "#";
  }

  function renderInline(text) {
    var s = escapeHtml(text);
    // code
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // bold + italic
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      return '<a href="' + escapeHtml(safeHref(href)) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });
    return s;
  }

  function splitTableRow(line) {
    var s = String(line).trim();
    if (s.charAt(0) === "|") s = s.slice(1);
    if (s.charAt(s.length - 1) === "|") s = s.slice(0, -1);
    return s.split("|").map(function (c) { return c.trim(); });
  }

  function isTableSeparator(line) {
    if (!/^\s*\|?[\s:|\-]+\|?\s*$/.test(line) || line.indexOf("-") === -1) return false;
    var cells = splitTableRow(line);
    if (!cells.length) return false;
    return cells.every(function (c) {
      return /^:?-{1,}:?$/.test(c);
    });
  }

  function isTableRow(line) {
    var t = String(line).trim();
    if (!t || t.indexOf("|") === -1) return false;
    if (isTableSeparator(t)) return false;
    return true;
  }

  function tableAlignments(sepLine) {
    return splitTableRow(sepLine).map(function (c) {
      var left = c.charAt(0) === ":";
      var right = c.charAt(c.length - 1) === ":";
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return "";
    });
  }

  function renderTable(headerLine, sepLine, bodyLines) {
    var headers = splitTableRow(headerLine);
    var aligns = tableAlignments(sepLine);
    var out = ['<div class="yokubi-llm-table-wrap"><table class="yokubi-llm-table"><thead><tr>'];
    headers.forEach(function (cell, idx) {
      var a = aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : "";
      out.push("<th" + a + ">" + renderInline(cell) + "</th>");
    });
    out.push("</tr></thead><tbody>");
    bodyLines.forEach(function (rowLine) {
      var cells = splitTableRow(rowLine);
      out.push("<tr>");
      for (var c = 0; c < headers.length; c++) {
        var a = aligns[c] ? ' style="text-align:' + aligns[c] + '"' : "";
        out.push("<td" + a + ">" + renderInline(cells[c] || "") + "</td>");
      }
      out.push("</tr>");
    });
    out.push("</tbody></table></div>");
    return out.join("");
  }

  function renderMarkdown(src) {
    if (!src) return "";
    var text = String(src).replace(/\r\n?/g, "\n");
    var lines = text.split("\n");
    var html = [];
    var i = 0;
    var inUl = false;
    var inOl = false;
    var inBq = false;

    function closeLists() {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (inOl) { html.push("</ol>"); inOl = false; }
    }
    function closeBq() {
      if (inBq) { html.push("</blockquote>"); inBq = false; }
    }
    function closeBlocks() {
      closeLists();
      closeBq();
    }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code
      var fence = line.match(/^```([\w-]*)\s*$/);
      if (fence) {
        closeBlocks();
        var lang = fence[1] || "";
        var code = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++; // closing fence
        html.push(
          '<pre class="yokubi-llm-code"' +
            (lang ? ' data-lang="' + escapeHtml(lang) + '"' : "") +
            "><code>" +
            escapeHtml(code.join("\n")) +
            "</code></pre>"
        );
        continue;
      }

      // blank
      if (/^\s*$/.test(line)) {
        closeBlocks();
        i++;
        continue;
      }

      // GFM table: header + separator + rows
      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        closeBlocks();
        var headerLine = line;
        var sepLine = lines[i + 1];
        var body = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          body.push(lines[i]);
          i++;
        }
        html.push(renderTable(headerLine, sepLine, body));
        continue;
      }

      // hr
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        closeBlocks();
        html.push("<hr>");
        i++;
        continue;
      }

      // headings
      var h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        closeBlocks();
        var level = h[1].length;
        html.push("<h" + level + ">" + renderInline(h[2]) + "</h" + level + ">");
        i++;
        continue;
      }

      // blockquote
      var bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        closeLists();
        if (!inBq) { html.push("<blockquote>"); inBq = true; }
        html.push("<p>" + renderInline(bq[1]) + "</p>");
        i++;
        continue;
      } else {
        closeBq();
      }

      // unordered list
      var ul = line.match(/^[-*+]\s+(.+)$/);
      if (ul) {
        closeBq();
        if (inOl) { html.push("</ol>"); inOl = false; }
        if (!inUl) { html.push("<ul>"); inUl = true; }
        html.push("<li>" + renderInline(ul[1]) + "</li>");
        i++;
        continue;
      }

      // ordered list
      var ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        closeBq();
        if (inUl) { html.push("</ul>"); inUl = false; }
        if (!inOl) { html.push("<ol>"); inOl = true; }
        html.push("<li>" + renderInline(ol[1]) + "</li>");
        i++;
        continue;
      }

      closeLists();

      // paragraph: gather consecutive plain lines
      var para = [line];
      i++;
      while (i < lines.length) {
        var next = lines[i];
        if (/^\s*$/.test(next)) break;
        if (/^(#{1,6})\s+/.test(next)) break;
        if (/^```/.test(next)) break;
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
        if (/^>\s?/.test(next)) break;
        if (/^[-*+]\s+/.test(next)) break;
        if (/^\d+\.\s+/.test(next)) break;
        // don't swallow a table that starts on the next line
        if (isTableRow(next) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
        para.push(next);
        i++;
      }
      html.push("<p>" + renderInline(para.join("\n")).replace(/\n/g, "<br>") + "</p>");
    }

    closeBlocks();
    return html.join("");
  }

  function setMessageBody(body, content, opts) {
    opts = opts || {};
    if (opts.markdown) {
      body.innerHTML = renderMarkdown(content);
      body.classList.add("yokubi-llm-md");
    } else {
      body.textContent = content;
      body.classList.remove("yokubi-llm-md");
    }
  }

  function getPageTitle() {
    var h1 = $(".content h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return document.title || "Yokubi lesson";
  }

  function getPageContent() {
    var main = $(".content main") || $(".content") || document.body;
    var clone = main.cloneNode(true);
    clone.querySelectorAll("script, style, nav, .yokubi-llm-root").forEach(function (n) {
      n.remove();
    });
    var text = (clone.innerText || clone.textContent || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > 12000) text = text.slice(0, 12000) + "\n\n[...truncated for length...]";
    return text;
  }

  function pathToRoot() {
    return typeof path_to_root === "string" ? path_to_root : "";
  }

  function loadSystemPromptTemplate() {
    var url = pathToRoot() + SYSTEM_PROMPT_URL;
    return fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var trimmed = String(text || "").trim();
        if (trimmed) state.systemPromptTemplate = trimmed;
        return state.systemPromptTemplate;
      })
      .catch(function () {
        state.systemPromptTemplate = DEFAULT_SYSTEM_PROMPT;
        return state.systemPromptTemplate;
      });
  }

  function systemPrompt() {
    var base = (state.systemPromptTemplate || DEFAULT_SYSTEM_PROMPT).trim();
    return [
      base,
      "",
      "Current lesson title: " + getPageTitle(),
      "Current lesson content:",
      "---",
      getPageContent(),
      "---",
    ].join("\n");
  }

  function setOpen(open, options) {
    options = options || {};
    state.open = open;
    document.documentElement.classList.toggle("yokubi-llm-open", open);
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    var panel = $("#yokubi-llm-panel");
    var toggle = $("#yokubi-llm-toggle");
    if (panel) {
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      panel.inert = !open;
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close lesson assistant" : "Open lesson assistant");
      toggle.title = open ? "Close lesson assistant" : "Open lesson assistant";
    }
    if (open && options.focus !== false) {
      var input = $("#yokubi-llm-input");
      if (input) setTimeout(function () { input.focus(); }, 50);
    } else if (panel && panel.contains(document.activeElement) && toggle) {
      toggle.focus();
    }
  }

  function appendMessage(role, content, opts) {
    opts = opts || {};
    var log = $("#yokubi-llm-messages");
    if (!log) return null;

    var useMd = opts.markdown !== false && role === "assistant" && !opts.error;
    var bubble = el("div", {
      className: "yokubi-llm-msg yokubi-llm-msg-" + role + (opts.error ? " yokubi-llm-msg-error" : ""),
    });
    var label = el("div", { className: "yokubi-llm-msg-role", text: role === "user" ? "You" : role === "assistant" ? "Assistant" : "System" });
    var body = el("div", { className: "yokubi-llm-msg-body" });
    setMessageBody(body, content, { markdown: useMd });
    bubble.appendChild(label);
    bubble.appendChild(body);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return body;
  }

  function setBusy(busy) {
    state.busy = busy;
    var send = $("#yokubi-llm-send");
    var input = $("#yokubi-llm-input");
    if (send) send.disabled = busy;
    if (input) input.disabled = busy;
    document.documentElement.classList.toggle("yokubi-llm-busy", busy);
  }

  async function sendMessage() {
    var input = $("#yokubi-llm-input");
    if (!input || state.busy) return;

    var text = input.value.trim();
    if (!text) return;

    var apiKey = getApiKey();
    if (!apiKey) {
      openSettings(true);
      appendMessage("assistant", "Add your OpenRouter API key in Settings to chat.", { error: true });
      return;
    }

    input.value = "";
    autoResize(input);
    appendMessage("user", text);
    state.messages.push({ role: "user", content: text });

    var assistantBody = appendMessage("assistant", "");
    assistantBody.parentElement.classList.add("yokubi-llm-msg-streaming");
    setBusy(true);

    var payload = {
      model: getModel(),
      messages: [{ role: "system", content: systemPrompt() }].concat(state.messages),
      stream: true,
      temperature: 0.4,
    };

    try {
      var res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin || "https://yoku.bi",
          "X-Title": "Yokubi Lesson Assistant",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        var errText = await res.text();
        var msg = "Request failed (" + res.status + ")";
        try {
          var errJson = JSON.parse(errText);
          if (errJson.error && errJson.error.message) msg = errJson.error.message;
        } catch (_) {
          if (errText) msg += ": " + errText.slice(0, 300);
        }
        throw new Error(msg);
      }

      var full = "";
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line.indexOf("data:") !== 0) continue;
          var data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            var json = JSON.parse(data);
            var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
            if (delta) {
              full += delta;
              setMessageBody(assistantBody, full, { markdown: true });
              var log = $("#yokubi-llm-messages");
              if (log) log.scrollTop = log.scrollHeight;
            }
          } catch (_) {}
        }
      }

      if (!full) {
        full = "(No response)";
        setMessageBody(assistantBody, full, { markdown: true });
      } else {
        setMessageBody(assistantBody, full, { markdown: true });
      }
      state.messages.push({ role: "assistant", content: full });
    } catch (err) {
      setMessageBody(assistantBody, "Error: " + (err && err.message ? err.message : String(err)), { markdown: false });
      assistantBody.parentElement.classList.add("yokubi-llm-msg-error");
      // Drop the failed user turn from history so retries stay clean if needed
      if (state.messages.length && state.messages[state.messages.length - 1].role === "user") {
        state.messages.pop();
      }
    } finally {
      assistantBody.parentElement.classList.remove("yokubi-llm-msg-streaming");
      setBusy(false);
    }
  }

  function clearChat() {
    state.messages = [];
    var log = $("#yokubi-llm-messages");
    if (log) log.innerHTML = "";
    appendMessage(
      "assistant",
      "Ask me anything about this lesson: “" + getPageTitle() + "”. I can explain grammar, examples, and nuance."
    );
  }

  function openSettings(force) {
    var box = $("#yokubi-llm-settings");
    if (!box) return;
    var show = force === true ? true : box.hidden;
    box.hidden = !show;
    if (show) {
      var keyInput = $("#yokubi-llm-key");
      var modelInput = $("#yokubi-llm-model");
      var fontInput = $("#yokubi-llm-font");
      if (keyInput) keyInput.value = getApiKey();
      if (modelInput) modelInput.value = getModel();
      if (fontInput) {
        fontInput.value = String(getFontSize());
        updateFontSizeLabel(fontInput.value);
      }
      if (keyInput) keyInput.focus();
    }
  }

  function saveSettings() {
    var keyInput = $("#yokubi-llm-key");
    var modelInput = $("#yokubi-llm-model");
    var fontInput = $("#yokubi-llm-font");
    if (keyInput) setApiKey(keyInput.value.trim());
    if (modelInput) setModel(modelInput.value.trim() || DEFAULT_MODEL);
    if (fontInput) setFontSize(fontInput.value);
    var box = $("#yokubi-llm-settings");
    if (box) box.hidden = true;
    updateKeyHint();
  }

  function updateKeyHint() {
    var hint = $("#yokubi-llm-key-hint");
    if (!hint) return;
    var has = !!getApiKey();
    hint.textContent = has ? "" : "No API key set";
    hint.classList.toggle("yokubi-llm-key-ok", has);
    hint.hidden = has;
    var keyStatus = $("#yokubi-llm-key-status");
    if (keyStatus) {
      keyStatus.textContent = has ? "✓" : "";
      keyStatus.hidden = !has;
      keyStatus.title = has ? "API key saved" : "";
    }
  }

  function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
  }

  function buildUI() {
    if ($("#yokubi-llm-root")) return;

    var restoreOpen = localStorage.getItem(OPEN_KEY) === "1";
    if (restoreOpen) {
      document.documentElement.classList.add("yokubi-llm-restoring");
    }

    var root = el("div", { id: "yokubi-llm-root", className: "yokubi-llm-root" });

    var toggle = el("button", {
      id: "yokubi-llm-toggle",
      className: "icon-button yokubi-llm-toggle",
      type: "button",
      title: "Open lesson assistant",
      "aria-label": "Open lesson assistant",
      "aria-expanded": "false",
      "aria-controls": "yokubi-llm-panel",
      onClick: function () { setOpen(!state.open); },
    }, [
      el("span", { className: "yokubi-llm-toggle-icon", "aria-hidden": "true", text: "✦" }),
      el("span", { className: "yokubi-llm-toggle-label", text: "Ask" }),
    ]);

    var panel = el("aside", {
      id: "yokubi-llm-panel",
      className: "yokubi-llm-panel",
      "aria-hidden": "true",
      "aria-label": "Lesson assistant",
    });
    panel.inert = true;

    var resizeHandle = el("div", {
      className: "yokubi-llm-resize",
      role: "separator",
      title: "Drag to resize · double-click to reset",
      "aria-orientation": "vertical",
      "aria-label": "Resize assistant panel",
      tabindex: "0",
    }, [
      el("div", { className: "yokubi-llm-resize-indicator", "aria-hidden": "true" }),
    ]);
    setupResize(resizeHandle);

    resizeHandle.addEventListener("keydown", function (e) {
      if (isMobileLayout() || !state.open) return;
      var step = e.shiftKey ? 40 : 16;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setWidth(getPanelWidth() + step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setWidth(getPanelWidth() - step);
      } else if (e.key === "Home") {
        e.preventDefault();
        setWidth(DEFAULT_WIDTH);
      }
    });

    var header = el("header", { className: "yokubi-llm-header" }, [
      el("div", { className: "yokubi-llm-header-inner" }, [
        el("div", { className: "yokubi-llm-header-text" }, [
          el("div", { className: "yokubi-llm-title", text: "Yokubi assistant" }),
          el("div", { id: "yokubi-llm-subtitle", className: "yokubi-llm-subtitle", text: getPageTitle() }),
        ]),
        el("div", { className: "yokubi-llm-header-actions" }, [
          el("button", {
            type: "button",
            className: "yokubi-llm-icon-btn",
            title: "Settings",
            "aria-label": "Assistant settings",
            onClick: function () { openSettings(); },
          }, [el("span", { className: "yokubi-llm-symbol", "aria-hidden": "true", text: "⚙︎" })]),
          el("button", {
            type: "button",
            className: "yokubi-llm-icon-btn",
            title: "Clear chat",
            "aria-label": "Clear chat",
            onClick: clearChat,
          }, [el("span", { className: "yokubi-llm-symbol", "aria-hidden": "true", text: "↻" })]),
          el("button", {
            type: "button",
            className: "yokubi-llm-icon-btn",
            title: "Close",
            "aria-label": "Close lesson assistant",
            onClick: function () { setOpen(false); },
          }, [el("span", { className: "yokubi-llm-symbol yokubi-llm-symbol-close", "aria-hidden": "true", text: "×" })]),
        ]),
      ]),
    ]);

    var settings = el("div", { id: "yokubi-llm-settings", className: "yokubi-llm-settings", hidden: "hidden" }, [
      el("div", { className: "yokubi-llm-settings-inner" }, [
        el("label", { className: "yokubi-llm-field" }, [
          el("span", { className: "yokubi-llm-field-label" }, [
            el("span", { text: "OpenRouter API key" }),
            el("span", {
              id: "yokubi-llm-key-status",
              className: "yokubi-llm-key-status",
              hidden: "hidden",
              "aria-label": "API key saved",
            }),
          ]),
          el("input", {
            id: "yokubi-llm-key",
            type: "password",
            autocomplete: "off",
            spellcheck: "false",
            placeholder: "sk-or-...",
          }),
        ]),
        el("label", { className: "yokubi-llm-field" }, [
          el("span", { text: "Model" }),
          el("input", {
            id: "yokubi-llm-model",
            type: "text",
            spellcheck: "false",
            placeholder: DEFAULT_MODEL,
          }),
        ]),
        el("label", { className: "yokubi-llm-field" }, [
          el("span", { className: "yokubi-llm-field-label" }, [
            el("span", { text: "Font size" }),
            el("span", { id: "yokubi-llm-font-value", className: "yokubi-llm-font-value" }),
          ]),
          el("input", {
            id: "yokubi-llm-font",
            className: "yokubi-llm-range",
            type: "range",
            min: String(MIN_FONT),
            max: String(MAX_FONT),
            step: "1",
            value: String(getFontSize()),
            onInput: function (e) {
              var size = applyFontSize(e.target.value);
              updateFontSizeLabel(size);
            },
            onChange: function (e) {
              setFontSize(e.target.value);
              updateFontSizeLabel(e.target.value);
            },
          }),
        ]),
        el("p", {
          className: "yokubi-llm-help",
          text: "Get a key at openrouter.ai. Your key and preferences stay in this browser. Drag the panel edge to resize.",
        }),
        el("div", { className: "yokubi-llm-settings-actions" }, [
          el("button", { type: "button", className: "yokubi-llm-btn", onClick: saveSettings }, ["Save"]),
          el("button", {
            type: "button",
            className: "yokubi-llm-btn yokubi-llm-btn-ghost",
            onClick: function () {
              setApiKey("");
              var keyInput = $("#yokubi-llm-key");
              if (keyInput) keyInput.value = "";
              updateKeyHint();
            },
          }, ["Clear key"]),
        ]),
      ]),
    ]);

    var messages = el("div", { id: "yokubi-llm-messages", className: "yokubi-llm-messages", role: "log", "aria-live": "polite" });

    var composer = el("div", { className: "yokubi-llm-composer" }, [
      el("div", { className: "yokubi-llm-composer-inner" }, [
        el("div", { id: "yokubi-llm-key-hint", className: "yokubi-llm-key-hint" }),
        el("div", { className: "yokubi-llm-input-row" }, [
          el("textarea", {
            id: "yokubi-llm-input",
            className: "yokubi-llm-input",
            rows: "1",
            placeholder: "Ask about this lesson…",
            onInput: function (e) { autoResize(e.target); },
            onKeydown: function (e) {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            },
          }),
          el("button", {
            id: "yokubi-llm-send",
            type: "button",
            className: "yokubi-llm-send",
            title: "Send",
            "aria-label": "Send message",
            onClick: sendMessage,
          }, [el("span", { className: "yokubi-llm-symbol yokubi-llm-symbol-send", "aria-hidden": "true", text: "↑" })]),
        ]),
      ]),
    ]);

    panel.appendChild(resizeHandle);
    panel.appendChild(header);
    panel.appendChild(settings);
    panel.appendChild(messages);
    panel.appendChild(composer);
    root.appendChild(panel);
    document.body.appendChild(root);

    var toolbar = $(".right-buttons");
    if (toolbar) toolbar.insertBefore(toggle, toolbar.firstChild);
    else root.appendChild(toggle);

    applyWidth(getStoredWidth());
    applyFontSize(getFontSize());
    updateFontSizeLabel(getFontSize());
    updateKeyHint();
    clearChat();

    if (restoreOpen) {
      setOpen(true, { focus: false });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.remove("yokubi-llm-restoring");
        });
      });
    }

    window.addEventListener("resize", function () {
      if (!state.resizing) applyWidth(getStoredWidth());
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.open) {
        var settingsBox = $("#yokubi-llm-settings");
        if (settingsBox && !settingsBox.hidden) {
          settingsBox.hidden = true;
        } else {
          setOpen(false);
        }
      }
    });
  }

  function init() {
    loadSystemPromptTemplate().finally(function () {
      buildUI();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

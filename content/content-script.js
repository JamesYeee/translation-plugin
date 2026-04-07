(() => {
  if (window.__LLT_CONTENT_SCRIPT_LOADED__) {
    // Avoid duplicate listeners when injected dynamically multiple times.
    return;
  }
  window.__LLT_CONTENT_SCRIPT_LOADED__ = true;

  const app = globalThis.LLT_APP;
  if (!app?.CONFIG || !app?.MESSAGE_TYPES) {
    console.error("[LLT-content] Missing shared modules in content script");
    return;
  }

  const { CONFIG, MESSAGE_TYPES } = app;

  const TRANSLATION_LOADING_TEXT = "翻译中...";
  const TRANSLATION_FAILED_TEXT = "未获取到译文，请检查翻译配置和扩展后台日志。";

  const state = {
    panelEl: null,
    translationEl: null,
    closeBtnEl: null,
    requestId: 0,
    panelAnchoredToViewport: false
  };

  function logDebug(...args) {
    if (!CONFIG.debug) {
      return;
    }
    console.log("[LLT-content]", ...args);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function ensurePanel() {
    if (state.panelEl) {
      return;
    }

    const panelEl = document.createElement("div");
    panelEl.className = "llt-panel llt-hidden";
    panelEl.innerHTML = [
      '<div class="llt-header">',
      '<span class="llt-title">翻译</span>',
      '<button type="button" class="llt-close" aria-label="关闭">×</button>',
      "</div>",
      '<div class="llt-result"></div>'
    ].join("");

    document.documentElement.appendChild(panelEl);

    state.panelEl = panelEl;
    state.translationEl = panelEl.querySelector(".llt-result");
    state.closeBtnEl = panelEl.querySelector(".llt-close");

    state.closeBtnEl?.addEventListener("click", hidePanel);
  }

  function hidePanel() {
    if (!state.panelEl) {
      return;
    }
    state.panelEl.classList.add("llt-hidden");
  }

  function movePanelNearRect(rect) {
    if (!state.panelEl || !rect) {
      return;
    }

    const panelWidth = CONFIG.panel.floatingWidth;
    const panelHeight = state.panelEl.offsetHeight || 120;
    const padding = CONFIG.panel.viewportPadding;
    const offset = CONFIG.panel.offset;

    const minLeft = window.scrollX + padding;
    const maxLeft = window.scrollX + window.innerWidth - panelWidth - padding;
    let left = window.scrollX + rect.left;
    left = clamp(left, minLeft, Math.max(minLeft, maxLeft));

    let top = window.scrollY + rect.bottom + offset;
    const maxTop = window.scrollY + window.innerHeight - panelHeight - padding;
    if (top > maxTop) {
      top = window.scrollY + rect.top - panelHeight - offset;
    }
    top = clamp(top, window.scrollY + padding, Math.max(window.scrollY + padding, maxTop));

    state.panelEl.style.left = `${left}px`;
    state.panelEl.style.top = `${top}px`;
  }

  function movePanelToViewportCorner() {
    if (!state.panelEl) {
      return;
    }

    const panelWidth = CONFIG.panel.floatingWidth;
    const padding = CONFIG.panel.viewportPadding;

    const left = window.scrollX + Math.max(padding, window.innerWidth - panelWidth - padding);
    const top = window.scrollY + padding;

    state.panelEl.style.left = `${left}px`;
    state.panelEl.style.top = `${top}px`;
  }

  function placePanel(rect) {
    if (rect) {
      state.panelAnchoredToViewport = false;
      movePanelNearRect(rect);
      return;
    }

    state.panelAnchoredToViewport = true;
    movePanelToViewportCorner();
  }

  function setPanelContent(text) {
    if (!state.translationEl) {
      return;
    }
    state.translationEl.textContent = text;
  }

  function showPanel(rect) {
    ensurePanel();
    setPanelContent(TRANSLATION_LOADING_TEXT);
    state.panelEl?.classList.remove("llt-hidden");
    placePanel(rect);
  }

  function getCurrentSelectionText() {
    const selection = window.getSelection();
    if (!selection) {
      return "";
    }
    return selection.toString().trim();
  }

  function getCurrentSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }

    return rect;
  }

  function requestTranslate(text) {
    return new Promise((resolve, reject) => {
      logDebug("send message", { chars: text.length });
      chrome.runtime.sendMessage(
        {
          type: MESSAGE_TYPES.translateText,
          text
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logDebug("runtime error", chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          logDebug("message response", response);
          resolve(response || { ok: false, translation: "" });
        }
      );
    });
  }

  async function translateFromContextMenu(selectedTextFromMenu) {
    const text = String(selectedTextFromMenu || "").trim() || getCurrentSelectionText();
    if (!text) {
      return;
    }

    const initialRect = getCurrentSelectionRect();
    const currentId = ++state.requestId;

    logDebug("selection", {
      requestId: currentId,
      chars: text.length
    });

    showPanel(initialRect);

    try {
      const response = await requestTranslate(text);
      if (currentId !== state.requestId) {
        return;
      }

      if (!response?.ok) {
        const detail = response?.error ? `\n错误: ${response.error}` : "";
        setPanelContent(`${TRANSLATION_FAILED_TEXT}${detail}`);
        placePanel(getCurrentSelectionRect() || initialRect);
        return;
      }

      const translation = (response.translation || "").trim();
      if (!translation) {
        setPanelContent(`${TRANSLATION_FAILED_TEXT}\n错误: 返回空译文`);
      } else {
        setPanelContent(translation);
      }
      placePanel(getCurrentSelectionRect() || initialRect);
    } catch (error) {
      if (currentId !== state.requestId) {
        return;
      }
      console.warn("[LLT-content] Translate request failed:", error);
      setPanelContent(TRANSLATION_FAILED_TEXT);
      placePanel(getCurrentSelectionRect() || initialRect);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE_TYPES.triggerTranslatePanel) {
      return;
    }

    translateFromContextMenu(message.text).catch((error) => {
      console.warn("[LLT-content] Translate from context menu failed:", error);
    });
  });

  document.addEventListener(
    "scroll",
    () => {
      if (!state.panelEl || state.panelEl.classList.contains("llt-hidden")) {
        return;
      }

      if (state.panelAnchoredToViewport) {
        movePanelToViewportCorner();
        return;
      }

      const rect = getCurrentSelectionRect();
      if (rect) {
        movePanelNearRect(rect);
      }
    },
    { passive: true }
  );

  document.addEventListener("mousedown", (event) => {
    if (!state.panelEl || state.panelEl.classList.contains("llt-hidden")) {
      return;
    }

    if (event.target instanceof Node && state.panelEl.contains(event.target)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "") {
      hidePanel();
    }
  });
})();

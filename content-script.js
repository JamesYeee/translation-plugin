if (window.__LLT_CONTENT_SCRIPT_LOADED__) {
  // Avoid duplicate listeners when injected dynamically multiple times.
} else {
  window.__LLT_CONTENT_SCRIPT_LOADED__ = true;

  let panelEl = null;
  let translationEl = null;
  let closeBtnEl = null;
  let requestId = 0;
  let panelAnchoredToViewport = false;

const DEBUG_LOG = true;
const TRANSLATION_LOADING_TEXT = "翻译中...";
const TRANSLATION_FAILED_TEXT = "未获取到译文，请检查 Ollama 服务和扩展后台日志。";

function logDebug(...args) {
  if (!DEBUG_LOG) {
    return;
  }
  console.log("[LLT-content]", ...args);
}

function ensurePanel() {
  if (panelEl) {
    return;
  }

  panelEl = document.createElement("div");
  panelEl.className = "llt-panel llt-hidden";
  panelEl.innerHTML = [
    '<div class="llt-header">',
    '<span class="llt-title">翻译</span>',
    '<button type="button" class="llt-close" aria-label="关闭">×</button>',
    "</div>",
    '<div class="llt-result"></div>'
  ].join("");

  document.documentElement.appendChild(panelEl);

  translationEl = panelEl.querySelector(".llt-result");
  closeBtnEl = panelEl.querySelector(".llt-close");

  closeBtnEl.addEventListener("click", hidePanel);
}

function hidePanel() {
  if (!panelEl) {
    return;
  }
  panelEl.classList.add("llt-hidden");
}

function movePanelNearRect(rect) {
  if (!panelEl || !rect) {
    return;
  }

  const panelWidth = 320;
  const panelHeight = panelEl.offsetHeight || 120;
  const padding = 8;

  let left = window.scrollX + rect.left;
  let top = window.scrollY + rect.bottom + 10;

  if (left + panelWidth > window.scrollX + window.innerWidth - padding) {
    left = window.scrollX + window.innerWidth - panelWidth - padding;
  }

  if (left < window.scrollX + padding) {
    left = window.scrollX + padding;
  }

  const maxTop = window.scrollY + window.innerHeight - panelHeight - padding;
  if (top > maxTop) {
    top = window.scrollY + rect.top - panelHeight - 10;
  }

  if (top < window.scrollY + padding) {
    top = window.scrollY + padding;
  }

  panelEl.style.left = `${left}px`;
  panelEl.style.top = `${top}px`;
}

function movePanelToViewportCorner() {
  if (!panelEl) {
    return;
  }

  const panelWidth = 320;
  const padding = 8;

  const left = window.scrollX + Math.max(padding, window.innerWidth - panelWidth - padding);
  const top = window.scrollY + padding;

  panelEl.style.left = `${left}px`;
  panelEl.style.top = `${top}px`;
}

function placePanel(rect) {
  if (rect) {
    panelAnchoredToViewport = false;
    movePanelNearRect(rect);
    return;
  }
  panelAnchoredToViewport = true;
  movePanelToViewportCorner();
}

function setPanelContent(translatedText) {
  translationEl.textContent = translatedText;
}

function showPanel(rect) {
  ensurePanel();
  setPanelContent(TRANSLATION_LOADING_TEXT);
  panelEl.classList.remove("llt-hidden");
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
        type: "TRANSLATE_TEXT",
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
  const currentId = ++requestId;
  logDebug("selection", {
    requestId: currentId,
    chars: text.length
  });
  showPanel(initialRect);

  try {
    const response = await requestTranslate(text);
    if (currentId !== requestId) {
      return;
    }

    if (!response?.ok) {
      const detail = response?.error ? `\n错误: ${response.error}` : "";
      setPanelContent(`${TRANSLATION_FAILED_TEXT}${detail}`);
      placePanel(getCurrentSelectionRect() || initialRect);
      return;
    }

    const translation = (response?.translation || "").trim();
    if (!translation) {
      setPanelContent(`${TRANSLATION_FAILED_TEXT}\n错误: 返回空译文`);
    } else {
      setPanelContent(translation);
    }
    placePanel(getCurrentSelectionRect() || initialRect);
  } catch (error) {
    if (currentId !== requestId) {
      return;
    }
    console.warn("Translate request failed:", error);
    setPanelContent(TRANSLATION_FAILED_TEXT);
    placePanel(getCurrentSelectionRect() || initialRect);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "TRIGGER_TRANSLATE_PANEL") {
    return;
  }
  translateFromContextMenu(message.text).catch((error) => {
    console.warn("Translate from context menu failed:", error);
  });
});

document.addEventListener("scroll", () => {
  if (!panelEl || panelEl.classList.contains("llt-hidden")) {
    return;
  }

  if (panelAnchoredToViewport) {
    movePanelToViewportCorner();
    return;
  }

  const rect = getCurrentSelectionRect();
  if (rect) {
    movePanelNearRect(rect);
  }
});

  document.addEventListener("mousedown", (event) => {
    if (!panelEl || panelEl.classList.contains("llt-hidden")) {
      return;
    }
    if (panelEl.contains(event.target)) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.toString().trim() === "") {
      hidePanel();
    }
  });
}

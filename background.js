const OLLAMA_CHAT_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = "qwen3.5:9b-q8_0";
const REQUEST_TIMEOUT_MS = 30000;
const DEBUG_LOG = true;
const CONTEXT_MENU_ID = "ai-trans-helper-translate-selection";
const CONTEXT_MENU_TITLE = "AI trans-helper";
const SIDEPANEL_PATH = "sidepanel.html";
const SIDEPANEL_STORAGE_KEY = "lltSidePanelResult";

const STRICT_TRANSLATION_SYSTEM_PROMPT = [
  "你是一名专业技术翻译，目标是把输入文本严谨地翻译成简体中文。",
  "必须遵守：",
  "1) 忠实原文，不遗漏、不增补、不改写事实。",
  "2) 保留术语、专有名词、数字、单位、代码、链接与标点结构。",
  "3) 语气客观中性，避免口语化和过度意译。",
  "4) 术语前后一致；有歧义时采用最保守、最直译的表达。",
  '5) 仅输出 JSON：{"translation":"..."}，不要输出其他字段或说明。'
].join("\n");

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function logDebug(...args) {
  if (!DEBUG_LOG) {
    return;
  }
  console.log("[LLT]", ...args);
}

function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isLikelyEnglish(text) {
  return /[A-Za-z]/.test(text) && !/[\u4e00-\u9fff]/.test(text);
}

function extractTranslation(data) {
  const content = data?.message?.content;

  if (content && typeof content === "object" && typeof content.translation === "string") {
    return content.translation.trim();
  }

  if (typeof content !== "string") {
    if (typeof data?.translation === "string") {
      return data.translation.trim();
    }
    return "";
  }

  const rawContent = content.trim();
  if (!rawContent) {
    return "";
  }

  const parsed = safeJsonParse(rawContent);
  if (parsed && typeof parsed.translation === "string") {
    return parsed.translation.trim();
  }

  const cleaned = rawContent
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsedCleaned = safeJsonParse(cleaned);
  if (parsedCleaned && typeof parsedCleaned.translation === "string") {
    return parsedCleaned.translation.trim();
  }

  // Fallback: model did not follow JSON constraint.
  return rawContent;
}

function triggerContentScriptTranslate(tabId, selectedText) {
  return new Promise((resolve) => {
    const message = {
      type: "TRIGGER_TRANSLATE_PANEL",
      text: selectedText
    };
    const callback = () => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      resolve({ ok: true });
    };
    chrome.tabs.sendMessage(tabId, message, callback);
  });
}

function setSidePanelResult(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      {
        [SIDEPANEL_STORAGE_KEY]: data
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
  });
}

function openSidePanel(tabId) {
  return new Promise((resolve, reject) => {
    if (!chrome.sidePanel?.setOptions || !chrome.sidePanel?.open) {
      reject(new Error("sidePanel API is not available in current Chrome version"));
      return;
    }

    chrome.sidePanel.setOptions(
      {
        tabId,
        path: SIDEPANEL_PATH,
        enabled: true
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        chrome.sidePanel.open(
          {
            tabId
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          }
        );
      }
    );
  });
}

async function translateAndShowSidePanel(tabId, selectedText) {
  try {
    const translation = await callOllamaTranslate(selectedText);
    await setSidePanelResult({
      ok: true,
      source: selectedText,
      translation,
      error: "",
      updatedAt: Date.now()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setSidePanelResult({
      ok: false,
      source: selectedText,
      translation: "",
      error: message,
      updatedAt: Date.now()
    });
  }

  await openSidePanel(tabId);
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: CONTEXT_MENU_TITLE,
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn("Create context menu failed:", chrome.runtime.lastError.message);
        }
      }
    );
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  const selectedText = normalizeText(info.selectionText);
  if (!selectedText) {
    return;
  }

  if (!tab?.id) {
    console.warn("Context menu click has no active tab id");
    return;
  }

  (async () => {
    try {
      const result = await triggerContentScriptTranslate(tab.id, selectedText);
      if (result.ok) {
        return;
      }
      logDebug("content script unavailable, fallback to side panel", result.error);
      await translateAndShowSidePanel(tab.id, selectedText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Context menu translate failed:", message);
      try {
        await setSidePanelResult({
          ok: false,
          source: selectedText,
          translation: "",
          error: message,
          updatedAt: Date.now()
        });
        await openSidePanel(tab.id);
      } catch (panelError) {
        const panelMessage = panelError instanceof Error ? panelError.message : String(panelError);
        console.warn("Open side panel failed:", panelMessage);
      }
    }
  })();
});

async function callOllamaTranslate(text) {
  if (!text) {
    return "";
  }

  const { controller, timer } = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    logDebug("translate request", {
      chars: text.length
    });

    const response = await fetch(OLLAMA_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        think: false,
        format: "json",
        options: {
          temperature: 0.1,
          top_p: 0.9,
          repeat_penalty: 1.05
        },
        messages: [
          {
            role: "system",
            content: STRICT_TRANSLATION_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: text
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      const shortErr = errText.slice(0, 400);
      console.warn("Ollama API failed:", response.status, shortErr);
      throw new Error(`Ollama API failed (${response.status}): ${shortErr || "empty error body"}`);
    }

    const data = await response.json();
    const translation = extractTranslation(data);

    if (!translation) {
      logDebug("empty translation", data);
      throw new Error("Ollama returned empty translation");
    }

    if (normalizeText(translation) === normalizeText(text) && isLikelyEnglish(text)) {
      logDebug("translation equals source (likely untranslated)", {
        source: text,
        translation
      });
    }

    logDebug("translate success", {
      chars: translation.length
    });
    return translation;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Ollama request timeout (${REQUEST_TIMEOUT_MS}ms)`);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Ollama API error:", message);
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE_TEXT") {
    return;
  }

  logDebug("message received", {
    hasText: Boolean(message.text),
    chars: String(message.text || "").length
  });

  callOllamaTranslate(message.text)
    .then((translation) => {
      sendResponse({
        ok: true,
        translation
      });
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({
        ok: false,
        translation: "",
        error: errorMessage
      });
    });

  return true;
});

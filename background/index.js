importScripts("../shared/app-config.js", "../shared/message-types.js", "../shared/utils.js", "./translate-service.js");

(() => {
  const app = globalThis.LLT_APP;
  const bg = globalThis.LLT_BACKGROUND;

  if (!app?.CONFIG || !app?.MESSAGE_TYPES || !app?.STORAGE_KEYS || !app?.utils || !bg?.translateTextBySettings || !bg?.normalizeTranslationSettings) {
    console.error("[LLT] Missing shared modules in background worker");
    return;
  }

  const { CONFIG, MESSAGE_TYPES, STORAGE_KEYS, utils } = app;
  const { translateTextBySettings, normalizeTranslationSettings, logDebug } = bg;

  function buildSidePanelResult({ ok, source, translation = "", error = "", engine = "" }) {
    return {
      ok,
      source,
      translation,
      error,
      engine,
      updatedAt: Date.now()
    };
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message,
            response: null
          });
          return;
        }

        resolve({
          ok: true,
          error: "",
          response
        });
      });
    });
  }

  function triggerContentScriptTranslate(tabId, selectedText) {
    return sendMessageToTab(tabId, {
      type: MESSAGE_TYPES.triggerTranslatePanel,
      text: selectedText
    });
  }

  function setSidePanelResult(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(
        {
          [STORAGE_KEYS.sidePanelResult]: data
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

  function getTranslationSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.translationSettings, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(normalizeTranslationSettings(result[STORAGE_KEYS.translationSettings]));
      });
    });
  }

  function buildEngineLabel(settings) {
    if (settings.mode === "api") {
      const model = settings.api?.model || "unknown-model";
      return `API / ${model}`;
    }

    const model = settings.local?.model || "unknown-model";
    return `Local / ${model}`;
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
          path: CONFIG.panel.sidepanelPath,
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
    const settings = await getTranslationSettings();
    const engine = buildEngineLabel(settings);

    try {
      const translation = await translateTextBySettings(selectedText, settings);
      await setSidePanelResult(
        buildSidePanelResult({
          ok: true,
          source: selectedText,
          translation,
          engine
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setSidePanelResult(
        buildSidePanelResult({
          ok: false,
          source: selectedText,
          error: message,
          engine
        })
      );
    }

    await openSidePanel(tabId);
  }

  function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create(
        {
          id: CONFIG.contextMenu.id,
          title: CONFIG.contextMenu.title,
          contexts: ["selection"]
        },
        () => {
          if (chrome.runtime.lastError) {
            console.warn("[LLT] Create context menu failed:", chrome.runtime.lastError.message);
          }
        }
      );
    });
  }

  chrome.runtime.onInstalled.addListener(createContextMenu);
  chrome.runtime.onStartup.addListener(createContextMenu);

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONFIG.contextMenu.id) {
      return;
    }

    const selectedText = utils.normalizeText(info.selectionText);
    if (!selectedText) {
      return;
    }

    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      console.warn("[LLT] Context menu click has no active tab id");
      return;
    }

    (async () => {
      try {
        const result = await triggerContentScriptTranslate(tabId, selectedText);
        if (result.ok) {
          return;
        }

        logDebug("content script unavailable, fallback to side panel", result.error);
        await translateAndShowSidePanel(tabId, selectedText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[LLT] Context menu translate failed:", message);

        try {
          await setSidePanelResult(
            buildSidePanelResult({
              ok: false,
              source: selectedText,
              error: message
            })
          );
          await openSidePanel(tabId);
        } catch (panelError) {
          const panelMessage = panelError instanceof Error ? panelError.message : String(panelError);
          console.warn("[LLT] Open side panel failed:", panelMessage);
        }
      }
    })();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.translateText) {
      return;
    }

    logDebug("message received", {
      hasText: Boolean(message.text),
      chars: String(message.text || "").length
    });

    getTranslationSettings()
      .then((settings) => {
        return translateTextBySettings(message.text, settings).then((translation) => ({
          translation,
          engine: buildEngineLabel(settings)
        }));
      })
      .then(({ translation, engine }) => {
        sendResponse({
          ok: true,
          translation,
          engine
        });
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({
          ok: false,
          translation: "",
          engine: "",
          error: errorMessage
        });
      });

    return true;
  });
})();

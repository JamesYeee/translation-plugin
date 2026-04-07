(() => {
  const app = globalThis.LLT_APP;
  const storageKeys = app?.STORAGE_KEYS || {};
  const sidePanelStorageKey = storageKeys.sidePanelResult || "lltSidePanelResult";
  const settingsStorageKey = storageKeys.translationSettings || "lltTranslationSettings";
  const translationModes = app?.CONFIG?.translationModes || {
    local: "local",
    api: "api"
  };
  const defaultSettings = app?.CONFIG?.translationDefaults || {
    mode: "local",
    local: {
      endpoint: "http://127.0.0.1:11434/api/chat",
      model: "qwen3.5:9b-q8_0"
    },
    api: {
      preset: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4.1-mini",
      apiKey: ""
    }
  };
  const apiPresets = Array.isArray(app?.CONFIG?.apiProviderPresets) ? app.CONFIG.apiProviderPresets : [];
  const customPresetId = "custom";
  const formatLocaleTime =
    app?.utils?.formatLocaleTime ||
    ((timestamp) => {
      const date = new Date(timestamp);
      return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
    });

  const statusTextEl = document.getElementById("statusText");
  const translationTextEl = document.getElementById("translationText");
  const engineTextEl = document.getElementById("engineText");
  const timeTextEl = document.getElementById("timeText");
  const settingsFormEl = document.getElementById("settingsForm");
  const modeSelectEl = document.getElementById("modeSelect");
  const localFieldsEl = document.getElementById("localFields");
  const localEndpointInputEl = document.getElementById("localEndpointInput");
  const localModelInputEl = document.getElementById("localModelInput");
  const apiFieldsEl = document.getElementById("apiFields");
  const apiPresetSelectEl = document.getElementById("apiPresetSelect");
  const apiEndpointInputEl = document.getElementById("apiEndpointInput");
  const apiModelInputEl = document.getElementById("apiModelInput");
  const apiKeyInputEl = document.getElementById("apiKeyInput");
  const resetBtnEl = document.getElementById("resetBtn");
  const settingsStatusEl = document.getElementById("settingsStatus");

  if (
    !statusTextEl ||
    !translationTextEl ||
    !engineTextEl ||
    !timeTextEl ||
    !settingsFormEl ||
    !modeSelectEl ||
    !localFieldsEl ||
    !localEndpointInputEl ||
    !localModelInputEl ||
    !apiFieldsEl ||
    !apiPresetSelectEl ||
    !apiEndpointInputEl ||
    !apiModelInputEl ||
    !apiKeyInputEl ||
    !resetBtnEl ||
    !settingsStatusEl
  ) {
    console.error("[LLT-sidepanel] Missing sidepanel DOM elements");
    return;
  }

  function readStringWithFallback(value, fallbackValue) {
    if (typeof value === "string") {
      return value.trim();
    }
    return String(fallbackValue || "").trim();
  }

  function cloneDefaultSettings() {
    return {
      mode: defaultSettings.mode,
      local: {
        endpoint: defaultSettings.local.endpoint,
        model: defaultSettings.local.model
      },
      api: {
        preset: defaultSettings.api.preset,
        endpoint: defaultSettings.api.endpoint,
        model: defaultSettings.api.model,
        apiKey: defaultSettings.api.apiKey
      }
    };
  }

  function findPresetById(presetId) {
    return apiPresets.find((item) => item.id === presetId) || null;
  }

  function normalizeSettings(rawSettings) {
    const defaults = cloneDefaultSettings();
    const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    const sourceLocal = source.local && typeof source.local === "object" ? source.local : {};
    const sourceApi = source.api && typeof source.api === "object" ? source.api : {};
    const preset = findPresetById(sourceApi.preset) ? sourceApi.preset : defaults.api.preset;
    const presetConfig = findPresetById(preset);

    let apiEndpoint = readStringWithFallback(sourceApi.endpoint, defaults.api.endpoint);
    let apiModel = readStringWithFallback(sourceApi.model, defaults.api.model);
    if (presetConfig && presetConfig.id !== customPresetId) {
      if (!apiEndpoint) {
        apiEndpoint = String(presetConfig.endpoint || "").trim();
      }
      if (!apiModel) {
        apiModel = String(presetConfig.model || "").trim();
      }
    }

    return {
      mode: source.mode === translationModes.api ? translationModes.api : translationModes.local,
      local: {
        endpoint: readStringWithFallback(sourceLocal.endpoint, defaults.local.endpoint),
        model: readStringWithFallback(sourceLocal.model, defaults.local.model)
      },
      api: {
        preset,
        endpoint: apiEndpoint,
        model: apiModel,
        apiKey: readStringWithFallback(sourceApi.apiKey, defaults.api.apiKey)
      }
    };
  }

  function setSettingsStatus(text, statusType = "") {
    settingsStatusEl.textContent = text;
    settingsStatusEl.classList.remove("success", "error");
    if (statusType) {
      settingsStatusEl.classList.add(statusType);
    }
  }

  function updateModeFields(mode) {
    const showApi = mode === translationModes.api;
    apiFieldsEl.classList.toggle("hidden", !showApi);
    localFieldsEl.classList.toggle("hidden", showApi);
  }

  function renderPresets() {
    apiPresetSelectEl.innerHTML = "";
    apiPresets.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label || item.id;
      apiPresetSelectEl.appendChild(option);
    });

    if (!apiPresets.length) {
      const option = document.createElement("option");
      option.value = customPresetId;
      option.textContent = "Custom";
      apiPresetSelectEl.appendChild(option);
    }
  }

  function renderSettings(settings) {
    modeSelectEl.value = settings.mode;
    localEndpointInputEl.value = settings.local.endpoint;
    localModelInputEl.value = settings.local.model;
    apiPresetSelectEl.value = findPresetById(settings.api.preset) ? settings.api.preset : customPresetId;
    apiEndpointInputEl.value = settings.api.endpoint;
    apiModelInputEl.value = settings.api.model;
    apiKeyInputEl.value = settings.api.apiKey;
    updateModeFields(settings.mode);
  }

  function parseSettingsFromForm() {
    return normalizeSettings({
      mode: modeSelectEl.value,
      local: {
        endpoint: localEndpointInputEl.value,
        model: localModelInputEl.value
      },
      api: {
        preset: apiPresetSelectEl.value,
        endpoint: apiEndpointInputEl.value,
        model: apiModelInputEl.value,
        apiKey: apiKeyInputEl.value
      }
    });
  }

  function saveSettings(settings, successMessage) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(
        {
          [settingsStorageKey]: settings
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          setSettingsStatus(successMessage, "success");
          resolve();
        }
      );
    });
  }

  function applyPresetSelection() {
    const preset = findPresetById(apiPresetSelectEl.value);
    if (!preset || preset.id === customPresetId) {
      return;
    }

    apiEndpointInputEl.value = String(preset.endpoint || "").trim();
    apiModelInputEl.value = String(preset.model || "").trim();
  }

  function markPresetCustom() {
    if (apiPresetSelectEl.value !== customPresetId && findPresetById(customPresetId)) {
      apiPresetSelectEl.value = customPresetId;
    }
  }

  function renderResult(data) {
    if (!data) {
      statusTextEl.textContent = "等待翻译结果...";
      translationTextEl.textContent = "暂无内容";
      engineTextEl.textContent = "-";
      timeTextEl.textContent = "-";
      return;
    }

    if (data.ok) {
      statusTextEl.textContent = "翻译完成";
      translationTextEl.textContent = data.translation || "返回空译文";
    } else {
      statusTextEl.textContent = "翻译失败";
      translationTextEl.textContent = data.error || "未知错误";
    }

    engineTextEl.textContent = data.engine || "-";
    timeTextEl.textContent = formatLocaleTime(data.updatedAt);
  }

  renderPresets();

  modeSelectEl.addEventListener("change", () => {
    updateModeFields(modeSelectEl.value);
  });

  apiPresetSelectEl.addEventListener("change", () => {
    applyPresetSelection();
  });

  apiEndpointInputEl.addEventListener("input", markPresetCustom);
  apiModelInputEl.addEventListener("input", markPresetCustom);

  settingsFormEl.addEventListener("submit", (event) => {
    event.preventDefault();

    const settings = parseSettingsFromForm();
    saveSettings(settings, "设置已保存").catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setSettingsStatus(`保存失败: ${message}`, "error");
    });
  });

  resetBtnEl.addEventListener("click", () => {
    const settings = cloneDefaultSettings();
    renderSettings(settings);
    saveSettings(settings, "已恢复默认配置").catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setSettingsStatus(`恢复失败: ${message}`, "error");
    });
  });

  chrome.storage.local.get([sidePanelStorageKey, settingsStorageKey], (result) => {
    renderResult(result[sidePanelStorageKey]);
    renderSettings(normalizeSettings(result[settingsStorageKey]));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[sidePanelStorageKey]) {
      renderResult(changes[sidePanelStorageKey].newValue);
    }

    if (changes[settingsStorageKey]) {
      renderSettings(normalizeSettings(changes[settingsStorageKey].newValue));
      setSettingsStatus("配置已同步更新");
    }
  });
})();

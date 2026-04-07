(() => {
  const root = globalThis;
  const app = root.LLT_APP;
  const bg = root.LLT_BACKGROUND || (root.LLT_BACKGROUND = {});

  if (!app?.CONFIG || !app?.PROMPTS || !app?.utils) {
    console.error("[LLT] Missing shared app config for translate service");
    return;
  }

  const { CONFIG, PROMPTS, utils } = app;
  const translationModes = CONFIG.translationModes || {
    local: "local",
    api: "api"
  };
  const modeValues = new Set(Object.values(translationModes));
  const defaultSettings = CONFIG.translationDefaults || {
    mode: translationModes.local,
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
  const presetIds = new Set((CONFIG.apiProviderPresets || []).map((item) => item.id));
  const customPresetId = "custom";

  function logDebug(...args) {
    if (!CONFIG.debug) {
      return;
    }

    console.log("[LLT]", ...args);
  }

  function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  function extractTextContent(value) {
    if (typeof value === "string") {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const chunks = value
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (!item || typeof item !== "object") {
            return "";
          }

          if (typeof item.text === "string") {
            return item.text;
          }

          return "";
        })
        .join("")
        .trim();
      return chunks;
    }

    if (value && typeof value === "object") {
      if (typeof value.translation === "string") {
        return value.translation.trim();
      }

      if (typeof value.text === "string") {
        return value.text.trim();
      }
    }

    return "";
  }

  function extractFromRawText(rawText) {
    const rawContent = String(rawText || "").trim();
    if (!rawContent) {
      return "";
    }

    const parsed = utils.safeJsonParse(rawContent);
    if (parsed && typeof parsed.translation === "string") {
      return parsed.translation.trim();
    }

    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsedCleaned = utils.safeJsonParse(cleaned);
    if (parsedCleaned && typeof parsedCleaned.translation === "string") {
      return parsedCleaned.translation.trim();
    }

    return cleaned;
  }

  function extractTranslation(data) {
    if (typeof data?.translation === "string") {
      return data.translation.trim();
    }

    const candidates = [data?.message?.content, data?.choices?.[0]?.message?.content, data?.output_text];

    for (const candidate of candidates) {
      const text = extractTextContent(candidate);
      if (!text) {
        continue;
      }

      const translation = extractFromRawText(text);
      if (translation) {
        return translation;
      }
    }

    return "";
  }

  function normalizeTranslationSettings(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    const sourceLocal = source.local && typeof source.local === "object" ? source.local : {};
    const sourceApi = source.api && typeof source.api === "object" ? source.api : {};

    const mode = modeValues.has(source.mode) ? source.mode : defaultSettings.mode;
    const preset = typeof sourceApi.preset === "string" && presetIds.has(sourceApi.preset) ? sourceApi.preset : defaultSettings.api.preset;
    const readString = (value, fallbackValue) => {
      if (typeof value === "string") {
        return value.trim();
      }
      return String(fallbackValue || "").trim();
    };

    return {
      mode,
      local: {
        endpoint: readString(sourceLocal.endpoint, defaultSettings.local.endpoint),
        model: readString(sourceLocal.model, defaultSettings.local.model)
      },
      api: {
        preset: preset || customPresetId,
        endpoint: readString(sourceApi.endpoint, defaultSettings.api.endpoint),
        model: readString(sourceApi.model, defaultSettings.api.model),
        apiKey: readString(sourceApi.apiKey, defaultSettings.api.apiKey)
      }
    };
  }

  async function parseJsonResponse(response, apiName) {
    const bodyText = await response.text();
    const data = utils.safeJsonParse(bodyText);

    if (!response.ok) {
      const shortErr = bodyText.slice(0, 400);
      console.warn(`[LLT] ${apiName} API failed:`, response.status, shortErr);
      throw new Error(`${apiName} API failed (${response.status}): ${shortErr || "empty error body"}`);
    }

    if (!data) {
      throw new Error(`${apiName} API response is not valid JSON`);
    }

    return data;
  }

  async function callOllamaTranslate(text, localSettings) {
    const sourceText = String(text || "");
    if (!sourceText) {
      return "";
    }

    const endpoint = String(localSettings?.endpoint || "").trim();
    const model = String(localSettings?.model || "").trim();

    if (!endpoint) {
      throw new Error("本地模型端点未配置");
    }

    if (!model) {
      throw new Error("本地模型名称未配置");
    }

    const { controller, timer } = withTimeout(CONFIG.requestTimeoutMs);

    try {
      logDebug("local translate request", { chars: sourceText.length, endpoint, model });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
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
              content: PROMPTS.strictTranslationSystem
            },
            {
              role: "user",
              content: sourceText
            }
          ]
        }),
        signal: controller.signal
      });

      const data = await parseJsonResponse(response, "Ollama");
      const translation = extractTranslation(data);

      if (!translation) {
        logDebug("empty translation", data);
        throw new Error("Ollama returned empty translation");
      }

      if (utils.normalizeText(translation) === utils.normalizeText(sourceText) && utils.isLikelyEnglish(sourceText)) {
        logDebug("translation equals source (likely untranslated)", {
          source: sourceText,
          translation
        });
      }

      logDebug("translate success", { chars: translation.length });
      return translation;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Ollama request timeout (${CONFIG.requestTimeoutMs}ms)`);
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn("[LLT] Ollama API error:", message);
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function callApiTranslate(text, apiSettings) {
    const sourceText = String(text || "");
    if (!sourceText) {
      return "";
    }

    const endpoint = String(apiSettings?.endpoint || "").trim();
    const model = String(apiSettings?.model || "").trim();
    const apiKey = String(apiSettings?.apiKey || "").trim();

    if (!endpoint) {
      throw new Error("API 端点未配置");
    }

    if (!model) {
      throw new Error("API 模型名称未配置");
    }

    if (!apiKey) {
      throw new Error("API Key 未配置");
    }

    const { controller, timer } = withTimeout(CONFIG.requestTimeoutMs);

    try {
      logDebug("api translate request", { chars: sourceText.length, endpoint, model });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          stream: false,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: PROMPTS.strictTranslationSystem
            },
            {
              role: "user",
              content: sourceText
            }
          ]
        }),
        signal: controller.signal
      });

      const data = await parseJsonResponse(response, "API");
      const translation = extractTranslation(data);

      if (!translation) {
        logDebug("empty translation from api", data);
        throw new Error("API returned empty translation");
      }

      logDebug("api translate success", { chars: translation.length });
      return translation;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`API request timeout (${CONFIG.requestTimeoutMs}ms)`);
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn("[LLT] API translate error:", message);
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function translateTextBySettings(text, settings) {
    const normalized = normalizeTranslationSettings(settings);
    if (normalized.mode === translationModes.api) {
      return callApiTranslate(text, normalized.api);
    }

    return callOllamaTranslate(text, normalized.local);
  }

  bg.logDebug = logDebug;
  bg.translateTextBySettings = translateTextBySettings;
  bg.normalizeTranslationSettings = normalizeTranslationSettings;
})();

(() => {
  const root = globalThis;
  const app = root.LLT_APP;
  const bg = root.LLT_BACKGROUND || (root.LLT_BACKGROUND = {});

  if (!app?.CONFIG || !app?.PROMPTS || !app?.utils) {
    console.error("[LLT] Missing shared app config for translate service");
    return;
  }

  const { CONFIG, PROMPTS, utils } = app;

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

    // Fallback: model did not follow JSON constraint.
    return rawContent;
  }

  async function callOllamaTranslate(text) {
    const sourceText = String(text || "");
    if (!sourceText) {
      return "";
    }

    const { controller, timer } = withTimeout(CONFIG.requestTimeoutMs);

    try {
      logDebug("translate request", { chars: sourceText.length });

      const response = await fetch(CONFIG.ollamaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: CONFIG.ollamaModel,
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

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const shortErr = errText.slice(0, 400);
        console.warn("[LLT] Ollama API failed:", response.status, shortErr);
        throw new Error(`Ollama API failed (${response.status}): ${shortErr || "empty error body"}`);
      }

      const data = await response.json();
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

  bg.logDebug = logDebug;
  bg.callOllamaTranslate = callOllamaTranslate;
})();

(() => {
  const root = globalThis;
  const app = root.LLT_APP || (root.LLT_APP = {});

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function normalizeText(text) {
    return String(text || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function isLikelyEnglish(text) {
    return /[A-Za-z]/.test(text) && !/[\u4e00-\u9fff]/.test(text);
  }

  function formatLocaleTime(timestamp) {
    if (!timestamp) {
      return "-";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString();
  }

  app.utils = Object.freeze({
    safeJsonParse,
    normalizeText,
    isLikelyEnglish,
    formatLocaleTime
  });
})();

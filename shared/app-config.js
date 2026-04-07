(() => {
  const root = globalThis;
  const app = root.LLT_APP || (root.LLT_APP = {});

  app.CONFIG = Object.freeze({
    debug: true,
    requestTimeoutMs: 30000,
    ollamaEndpoint: "http://127.0.0.1:11434/api/chat",
    ollamaModel: "qwen3.5:9b-q8_0",
    contextMenu: Object.freeze({
      id: "ai-trans-helper-translate-selection",
      title: "AI trans-helper"
    }),
    panel: Object.freeze({
      floatingWidth: 320,
      offset: 10,
      viewportPadding: 8,
      sidepanelPath: "sidepanel/sidepanel.html"
    })
  });

  app.PROMPTS = Object.freeze({
    strictTranslationSystem: [
      "你是一名专业技术翻译，目标是把输入文本严谨地翻译成简体中文。",
      "必须遵守：",
      "1) 忠实原文，不遗漏、不增补、不改写事实。",
      "2) 保留术语、专有名词、数字、单位、代码、链接与标点结构。",
      "3) 语气客观中性，避免口语化和过度意译。",
      "4) 术语前后一致；有歧义时采用最保守、最直译的表达。",
      '5) 仅输出 JSON：{"translation":"..."}，不要输出其他字段或说明。'
    ].join("\n")
  });
})();

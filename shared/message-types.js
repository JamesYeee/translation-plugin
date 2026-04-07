(() => {
  const root = globalThis;
  const app = root.LLT_APP || (root.LLT_APP = {});

  app.MESSAGE_TYPES = Object.freeze({
    translateText: "TRANSLATE_TEXT",
    triggerTranslatePanel: "TRIGGER_TRANSLATE_PANEL"
  });

  app.STORAGE_KEYS = Object.freeze({
    sidePanelResult: "lltSidePanelResult",
    translationSettings: "lltTranslationSettings"
  });
})();

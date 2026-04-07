(() => {
  const app = globalThis.LLT_APP;
  const storageKey = app?.STORAGE_KEYS?.sidePanelResult || "lltSidePanelResult";
  const formatLocaleTime =
    app?.utils?.formatLocaleTime ||
    ((timestamp) => {
      const date = new Date(timestamp);
      return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
    });

  const statusTextEl = document.getElementById("statusText");
  const translationTextEl = document.getElementById("translationText");
  const timeTextEl = document.getElementById("timeText");

  if (!statusTextEl || !translationTextEl || !timeTextEl) {
    console.error("[LLT-sidepanel] Missing sidepanel DOM elements");
    return;
  }

  function renderResult(data) {
    if (!data) {
      statusTextEl.textContent = "等待翻译结果...";
      translationTextEl.textContent = "暂无内容";
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

    timeTextEl.textContent = formatLocaleTime(data.updatedAt);
  }

  chrome.storage.local.get(storageKey, (result) => {
    renderResult(result[storageKey]);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (!changes[storageKey]) {
      return;
    }

    renderResult(changes[storageKey].newValue);
  });
})();

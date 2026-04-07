const SIDEPANEL_STORAGE_KEY = "lltSidePanelResult";

const statusTextEl = document.getElementById("statusText");
const translationTextEl = document.getElementById("translationText");
const timeTextEl = document.getElementById("timeText");

function formatTime(ts) {
  if (!ts) {
    return "-";
  }
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
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

  timeTextEl.textContent = formatTime(data.updatedAt);
}

chrome.storage.local.get(SIDEPANEL_STORAGE_KEY, (result) => {
  renderResult(result[SIDEPANEL_STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (!changes[SIDEPANEL_STORAGE_KEY]) {
    return;
  }

  renderResult(changes[SIDEPANEL_STORAGE_KEY].newValue);
});

# 划词翻译 Chrome 插件框架

这是一个最小可用的 MV3 插件骨架，支持：

- 在网页中划词（选中一句文本）
- 直接调用本机 Ollama 模型进行翻译
- 以简洁悬浮框显示翻译结果

## 文件说明

- `manifest.json`: 插件配置与权限
- `content-script.js`: 监听划词、展示悬浮框、向后台请求翻译
- `content-style.css`: 悬浮框样式
- `background.js`: 调用 Ollama `/api/chat` 并做翻译结果解析

## 本地加载方式

1. 打开 Chrome 扩展页：`chrome://extensions/`
2. 开启右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录

## Ollama 配置（当前已接入）

当前在 `background.js` 中使用：

```js
const OLLAMA_CHAT_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const OLLAMA_MODEL = "qwen3.5:9b-q8_0";
```

发送到 Ollama 的请求核心参数：

```json
{
  "model": "qwen3.5:9b-q8_0",
  "stream": false,
  "think": false,
  "format": "json",
  "options": {
    "temperature": 0.1,
    "top_p": 0.9,
    "repeat_penalty": 1.05
  },
  "messages": [
    {
      "role": "system",
      "content": "严谨翻译规则 + 只输出 JSON"
    },
    {
      "role": "user",
      "content": "待翻译句子"
    }
  ]
}
```

插件期望模型输出：

```json
{"translation":"..."}
```

如果模型未严格按 JSON 返回，插件会回退到原始文本输出。

## 启动前检查

1. 启动 Ollama 服务：`ollama serve`
2. 确认模型存在：`ollama list`
3. 若没有该模型：`ollama pull qwen3.5:9b-q8_0`

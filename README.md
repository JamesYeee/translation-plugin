# 划词翻译 Chrome 插件（MV3）

支持以下两条链路，并已兼容优化后的代码结构：

- 普通网页划词翻译：优先在页面内弹出悬浮翻译面板
- PDF 划词翻译：当 content script 不可用时，自动回退到 Side Panel 展示结果

## 项目结构

```text
.
├── manifest.json
├── background
│   ├── index.js
│   └── translate-service.js
├── content
│   ├── content-script.js
│   └── content-style.css
├── sidepanel
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
└── shared
    ├── app-config.js
    ├── message-types.js
    └── utils.js
```

## 设计说明

- `shared/app-config.js`: 统一维护模型配置、超时、调试开关、UI 常量、翻译 Prompt
- `shared/message-types.js`: 统一消息类型与 storage key，避免字符串散落在各文件
- `shared/utils.js`: 公共工具函数（文本归一化、JSON 安全解析、时间格式化等）
- `background/translate-service.js`: 专注 Ollama 请求与译文解析
- `background/index.js`: 专注 Chrome 事件编排（右键菜单、消息分发、PDF 回退 Side Panel）
- `content/content-script.js`: 专注网页悬浮面板渲染与交互
- `sidepanel/*`: 专注 Side Panel 结果展示

## 运行流程（保持原有能力）

1. 用户右键划词触发菜单
2. `background/index.js` 先尝试通知 content script 显示页面内悬浮翻译
3. 若目标页面（如 PDF 浏览器内页）无法接收 content script 消息，则自动回退：
   - 后台直接调用 Ollama 翻译
   - 写入 `chrome.storage.local`
   - 打开 Side Panel 展示结果

## 本地加载方式

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目目录

## 启动前检查

1. 启动 Ollama 服务：`ollama serve`
2. 确认模型存在：`ollama list`
3. 若没有该模型：`ollama pull qwen3.5:9b-q8_0`

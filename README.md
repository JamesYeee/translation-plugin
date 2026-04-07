# 划词翻译 Chrome 插件（MV3）

支持两种翻译引擎模式，并可在 Side Panel 里切换：

- 本地模型模式：通过 Ollama 进行翻译
- API 模式：调用 OpenAI 兼容的聊天补全接口（支持 OpenAI / DeepSeek / Qwen 兼容接口 / Moonshot / 自定义）

普通网页会优先显示页面内悬浮翻译面板；PDF 等场景自动回退到 Side Panel 展示。

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

## 关键设计

- `shared/app-config.js`：
  - 统一维护默认翻译模式、Ollama 默认参数、API 预设、Prompt、超时等配置
- `shared/message-types.js`：
  - 统一消息类型
  - 统一 storage key（翻译结果 + 翻译设置）
- `background/translate-service.js`：
  - 根据设置动态路由到本地模式或 API 模式
  - 兼容不同返回格式并抽取译文
- `background/index.js`：
  - 处理右键菜单、消息分发、PDF 回退 Side Panel
  - 每次翻译前读取最新设置
- `sidepanel/*`：
  - 展示翻译结果
  - 提供翻译设置表单（模式切换、API Key、端点、模型）

## 使用方式

1. 右键划词，点击 `AI trans-helper`
2. 在 Side Panel 的“翻译设置”中选择模式：
   - `本地模型（Ollama）`
   - `API（OpenAI 兼容）`
3. 若选择 API：
   - 选择预设（OpenAI / DeepSeek / Qwen Compatible / Moonshot / Custom）
   - 填写 API Key
   - 按需修改端点与模型
   - 点击“保存设置”

## 本地加载

1. 选择一个文件夹目录 `git clone https://github.com/JamesYeee/translation-plugin.git`
2. 打开 `chrome://extensions/`
3. 开启“开发者模式”
4. 点击“加载未打包的扩展程序”
5. 选择本项目目录

## Ollama 使用提示（本地模式）

1. 启动服务：`systemctl start ollama`
2. 查看模型：`ollama list`
3. 拉取模型：`ollama pull qwen3.5:9b-q8_0`
4. 允许扩展访问 Ollama（按你的系统配置 `OLLAMA_ORIGINS`）

# Electron + DeepSeek API 桌面悬浮 AI 助手

## 项目概述

一个始终悬浮在桌面最顶层的轻量 AI 对话窗口，使用 DeepSeek API，支持透明度调节、无边框拖动、流式输出。

---

## 用户需求

1. **悬浮窗口**：始终置顶（always-on-top），无系统边框，可在屏幕任意位置拖动
2. **透明度可调**：窗口带透明度滑块，范围 30%～100%，实时生效
3. **输入框**：底部单行输入框，按 Enter 发送，Shift+Enter 换行
4. **流式输出**：AI 回答以打字机效果逐字显示（streaming）
5. **全局快捷键**：`Ctrl+Space` 显示/隐藏窗口
6. **窗口尺寸**：默认 360×500px，可拖拽边缘自由调整大小
7. **历史对话**：当前会话内保留多轮上下文，关闭窗口后清空
8. **关闭/最小化按钮**：自定义标题栏按钮（关闭、最小化、透明度滑块）
9. **DeepSeek API**：使用 `deepseek-chat` 模型，API Key 在 `.env` 文件中配置
10. **界面风格**：深色毛玻璃风格，简洁现代

---

## 技术栈

- **框架**：Electron (最新版)
- **前端**：原生 HTML + CSS + JS（无需 React/Vue，保持轻量）
- **AI**：DeepSeek API（OpenAI 兼容格式，流式请求）
- **IPC**：Electron `ipcMain` / `ipcRenderer` 处理主进程与渲染进程通信
- **配置**：`dotenv` 读取 `.env` 中的 `DEEPSEEK_API_KEY`

---

## 项目结构

```
electron-ai-overlay/
├── package.json
├── .env                    # DEEPSEEK_API_KEY=your_key_here
├── .env.example
├── .gitignore
├── main.js                 # 主进程：窗口创建、全局快捷键、API 调用
├── preload.js              # 预加载脚本：安全暴露 IPC 接口
└── renderer/
    ├── index.html          # 主界面
    ├── style.css           # 深色毛玻璃样式
    └── app.js              # 渲染进程逻辑：对话管理、流式显示
```

---

## 各文件职责

### `main.js`（主进程）
- 创建 `BrowserWindow`：
  - `frame: false`（无边框）
  - `transparent: true`（透明背景）
  - `alwaysOnTop: true`
  - `resizable: true`
  - `webPreferences: { preload, contextIsolation: true }`
- 注册全局快捷键 `Ctrl+Space` 切换窗口显示/隐藏
- 监听 IPC `chat-request`，调用 DeepSeek API（fetch 流式请求）
- 逐 chunk 转发流式数据到渲染进程（`ipcRenderer.send('chat-chunk', chunk)`）
- 监听 IPC `set-opacity`，调用 `win.setOpacity(value)`
- 监听 IPC `minimize-window` / `close-window`

### `preload.js`
- 通过 `contextBridge.exposeInMainWorld` 暴露以下接口：
  - `window.electronAPI.sendMessage(messages)` → 发送对话
  - `window.electronAPI.onChunk(callback)` → 接收流式 chunk
  - `window.electronAPI.onDone(callback)` → 接收完成信号
  - `window.electronAPI.setOpacity(value)` → 设置透明度
  - `window.electronAPI.minimize()` / `window.electronAPI.close()`

### `renderer/index.html`
- 自定义标题栏：拖动区域 + 最小化按钮 + 关闭按钮 + 透明度滑块
- 消息列表区域（可滚动）
- 底部输入区域：textarea + 发送按钮

### `renderer/style.css`
- 整体背景：`rgba(15, 15, 20, 0.75)` + `backdrop-filter: blur(20px)`
- 用户消息气泡：右对齐，蓝紫色
- AI 消息气泡：左对齐，深灰色
- 自定义滚动条
- 输入框：无边框，深色背景，聚焦时发光边框
- 标题栏：`-webkit-app-region: drag`（可拖动区域），按钮设为 `no-drag`

### `renderer/app.js`
- 维护 `messages[]` 数组（多轮上下文）
- 发送消息时将用户消息追加到 UI 和 `messages[]`
- 调用 `electronAPI.sendMessage(messages)` 触发请求
- 监听 `onChunk` 回调，将 chunk 追加到当前 AI 消息气泡（打字机效果）
- 监听 `onDone` 回调，将完整 AI 回答推入 `messages[]`
- 透明度滑块 `input` 事件实时调用 `electronAPI.setOpacity()`

---

## DeepSeek API 调用方式（在 main.js 中）

```js
// DeepSeek 兼容 OpenAI 格式，baseURL 如下
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: messages,   // 完整历史上下文
    stream: true
  })
});

// 逐行读取 SSE 流，解析 data: {...} 中的 delta.content
// 每个 chunk 通过 win.webContents.send('chat-chunk', text) 推送
// 流结束时发送 win.webContents.send('chat-done')
```

---

## package.json 关键依赖

```json
{
  "name": "electron-ai-overlay",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "electron": "^31.0.0"
  }
}
```

---

## .env.example

```
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

---

## 启动方式

```bash
npm install
# 复制 .env.example 为 .env，填入 API Key
cp .env.example .env
npm start
```

---

## 注意事项

1. `transparent: true` 在 Windows 上需要 `backgroundColor: '#00000000'`
2. 拖动区域使用 CSS `-webkit-app-region: drag`，交互元素必须设为 `no-drag`
3. 流式 SSE 解析：按 `\n\n` 分割，跳过 `[DONE]` 行，解析 `JSON.parse(line.replace('data: ', ''))`
4. 全局快捷键在 `app.on('will-quit')` 时必须调用 `globalShortcut.unregisterAll()`
5. `contextIsolation: true` + preload 是安全最佳实践，不要使用 `nodeIntegration: true`

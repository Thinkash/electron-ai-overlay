require('dotenv').config();
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('renderer/index.html');
  win.setMinimumSize(160, 200);
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Control+Space', () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC: window controls
ipcMain.on('minimize-window', () => win && win.minimize());
ipcMain.on('close-window', () => win && win.close());
ipcMain.on('set-opacity', (_event, value) => win && win.setOpacity(value));

const ALLOWED_MODELS = new Set(['deepseek-v4-pro', 'deepseek-v4-flash']);

// IPC: DeepSeek streaming chat
ipcMain.on('chat-request', async (_event, { messages, model }) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    win.webContents.send('chat-error', 'DEEPSEEK_API_KEY not set in .env');
    return;
  }

  const safeModel = ALLOWED_MODELS.has(model) ? model : 'deepseek-v4-pro';

  const proxyUrl = process.env.HTTPS_PROXY;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: safeModel,
      messages,
      stream: true,
    }),
  };
  if (proxyUrl) fetchOptions.agent = new HttpsProxyAgent(proxyUrl);

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', fetchOptions);

    if (!response.ok) {
      const errText = await response.text();
      win.webContents.send('chat-error', `API error ${response.status}: ${errText}`);
      return;
    }

    await new Promise((resolve, reject) => {
      let buffer = '';

      response.body.setEncoding('utf-8');

      response.body.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) win.webContents.send('chat-chunk', content);
          } catch {
            // malformed chunk, skip
          }
        }
      });

      response.body.on('end', () => {
        win.webContents.send('chat-done');
        resolve();
      });

      response.body.on('error', reject);
    });
  } catch (err) {
    win.webContents.send('chat-error', err.message);
  }
});

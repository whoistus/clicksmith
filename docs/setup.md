# Chrome Like a Human - Setup Guide (Phase 1)

## Prerequisites
- Node.js 20+ ([nodejs.org](https://nodejs.org))
- Chrome 120+ or Chromium-based browser
- Command-line terminal (bash, zsh, or PowerShell)

## 1. Install & Build

```bash
npm install
npm run build
```

Output: Extension files → `dist/extension/`, MCP server → `dist/host/`.

## 2. Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `dist/extension/` directory

Chrome loads extension with red error badge (expected—waiting for auth token).

## 3. Set Auth Token

MCP server generates token on startup. Run:

```bash
node dist/host/mcp-server.js
```

Look for stderr output:
```
Auth token: <generated-token-here>
WebSocket listening on ws://localhost:9333
```

In Chrome DevTools console (extension page):

```javascript
chrome.storage.local.set({ authToken: '<generated-token-here>' })
```

Extension reconnects, error badge clears.

## 4. Configure MCP for Claude Desktop/Code

Create/update config (path depends on OS):
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add entry:

```json
{
  "mcpServers": {
    "chrome-qa": {
      "command": "node",
      "args": ["/absolute/path/to/dist/host/mcp-server.js"]
    }
  }
}
```

Replace path with absolute path to `mcp-server.js`. Restart Claude Desktop/Code.

## 5. Available Tools

- `navigate(url)` - Load URL in active tab
- `snapshot()` - JSON tree of DOM, text nodes, inputs
- `screenshot()` - PNG of visible viewport
- `click(selector)` - Click element by CSS selector
- `type(text)` - Type text in focused element
- `press_key(key)` - Send key (e.g., "Enter", "Tab")

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| Extension shows red badge, won't connect | Token not set. Run server, copy token to `chrome.storage.local.set()` in DevTools console. |
| Yellow "Debugger" bar in content | Normal. Click X to dismiss. Chrome Developer Protocol active. |
| Port 9333 already in use | Kill existing process: `lsof -i :9333` (macOS/Linux) or `netstat -ano \| findstr :9333` (Windows). Change port in env var `MCP_PORT`. |
| "WebSocket connection failed" | Server not running or wrong hostname. Verify `ws://localhost:9333` in extension logs. |

---

**Next:** See `/api-docs.md` for tool reference or `/architecture.md` for system design.

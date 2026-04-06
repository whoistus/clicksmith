# Phase 1: Foundation

## Context

- [Architecture Research](./research/researcher-01-chrome-mcp-architecture.md)
- [CDP/ARIA Research](../reports/researcher-260406-2241-cdp-accessibility-aria.md)
- [Plan Overview](./plan.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-04-06 |
| Priority | P1 |
| Effort | 2 weeks |
| Status | done (2026-04-06) |
| Description | Scaffold MV3 extension, native messaging bridge, MCP server, and 6 core tools (navigate, snapshot, screenshot, click, type, press_key) with ARIA element resolution |

## Key Insights

1. Native messaging uses 4-byte length prefix (u32 LE) + JSON; avoids WebSocket/MV3 timeout issues
2. Windows requires O_BINARY mode on stdin/stdout; text mode corrupts framing bytes
3. `chrome.debugger` yellow bar is unavoidable but acceptable for QA use case
4. CDP `Accessibility.getFullAXTree` returns role/name/value/childIds per node
5. DOM-based ARIA fallback handles 80% of cases without debugger attachment
6. NEVER log to stdout — it carries JSON-RPC; use stderr exclusively
7. hangwin/mcp-chrome proves 3-tier architecture works; we adopt same pattern

## Requirements

### Functional
- MCP server discoverable by Claude Desktop/Code via config
- Extension communicates with host via native messaging
- `navigate(url)` loads URL in active tab
- `snapshot()` returns structured accessibility tree text
- `screenshot()` returns viewport PNG as base64
- `click(role, name)` clicks element found by ARIA role + accessible name
- `type(role, name, text)` types into input found by ARIA
- `press_key(key)` dispatches keyboard event

### Non-Functional
- Tool response < 500ms for interactions, < 2s for snapshots
- Messages under 1MB (native messaging host limit)
- Extension works on Chrome 120+

## Architecture

### Message Flow
```
Claude -> stdio -> mcp-server.js -> bridge.js -> native messaging -> background.js
                                                                          |
                                                                    chrome.debugger (CDP)
                                                                    content.js (DOM ARIA)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/extension/manifest.json` | MV3 manifest with debugger, nativeMessaging, activeTab permissions |
| `src/extension/background.js` | Service worker: receives native messages, dispatches CDP commands |
| `src/extension/content.js` | Content script: DOM ARIA fallback resolution, element interaction |
| `src/host/mcp-server.js` | MCP server with tool definitions, StdioServerTransport |
| `src/host/bridge.js` | 4-byte framed native messaging I/O, Windows binary mode |
| `src/shared/protocol.js` | Message type enums and schemas shared between host and extension |
| `scripts/install.js` | Registers native messaging host manifest in Windows registry |
| `scripts/build.js` | Builds extension (copies/bundles for chrome://extensions load) |
| `package.json` | Dependencies: @modelcontextprotocol/sdk, typescript |
| `tsconfig.json` | TypeScript config (target ES2022, module NodeNext) |

## Implementation Steps

### Step 1: Project Init
**Files:** `package.json`, `tsconfig.json`, `.gitignore`

- Init npm project with `@modelcontextprotocol/sdk` dependency
- TypeScript config targeting ES2022 for top-level await
- Add build scripts: `tsc` for host, copy for extension
- `.gitignore`: node_modules, dist, *.js.map

### Step 2: Shared Protocol Types
**Files:** `src/shared/protocol.ts`

- Define message types enum: `NAVIGATE`, `SNAPSHOT`, `SCREENSHOT`, `CLICK`, `TYPE`, `PRESS_KEY`, `RESULT`, `ERROR`
- Define request/response interfaces for each message type
- Keep under 80 lines; just types and constants

### Step 3: Native Messaging Bridge
**Files:** `src/host/bridge.ts`

- Read stdin with 4-byte LE length prefix, parse JSON payload
- Write stdout with 4-byte LE length prefix + JSON
- Windows: set stdin/stdout to binary mode via `process.stdin.setEncoding(null)` and raw Buffer reads
- Export `sendToExtension(msg)` and `onExtensionMessage(callback)`
- Handle partial reads (buffer accumulation until full message received)
- Error handling: malformed JSON, message too large (>1MB)

### Step 4: MCP Server
**Files:** `src/host/mcp-server.ts`

- Import `Server` from `@modelcontextprotocol/sdk/server/index.js`
- Import `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
- Register 6 tools with JSON Schema input definitions:
  - `navigate`: `{url: string}`
  - `snapshot`: `{depth?: number}`
  - `screenshot`: `{}`
  - `click`: `{role: string, name: string}`
  - `type`: `{role: string, name: string, text: string}`
  - `press_key`: `{key: string}`
- CallTool handler: serialize request -> bridge -> await response -> return MCP result
- Use request ID to correlate async responses from extension
- All logging to stderr: `console.error()` only

### Step 5: Extension Manifest
**Files:** `src/extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Chrome Like a Human",
  "version": "0.1.0",
  "permissions": ["debugger", "activeTab", "nativeMessaging", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }]
}
```

### Step 6: Extension Background (Service Worker)
**Files:** `src/extension/background.js`

- Connect to native messaging host via `chrome.runtime.connectNative("chrome_like_a_human")`
- Message router: dispatch incoming messages by type to handlers
- **navigate handler**: `chrome.tabs.update(tabId, {url})`, wait for `chrome.tabs.onUpdated` with `status: 'complete'`
- **snapshot handler**: `chrome.debugger.attach` -> `Accessibility.enable` -> `Accessibility.getFullAXTree` -> format tree -> respond
- **screenshot handler**: `chrome.tabs.captureVisibleTab({format: 'png'})` -> return base64
- **click/type/press_key handlers**: send message to content script via `chrome.tabs.sendMessage`
- Maintain debugger attachment state per tab (attach once, reuse)
- Error handling: wrap all CDP calls in try/catch, return structured errors

### Step 7: Content Script (DOM ARIA)
**Files:** `src/extension/content.js`

- `findByRoleAndName(role, name)`: query DOM for elements matching ARIA role + accessible name
- Role detection: explicit `role` attr -> implicit role from tag mapping
- Name detection: `aria-labelledby` -> `aria-label` -> `label[for]` -> textContent -> placeholder
- **click handler**: find element -> `element.click()` (fallback: dispatchEvent MouseEvent)
- **type handler**: find element -> `element.focus()` -> `element.value = ''` -> dispatch input events -> set value
- **press_key handler**: dispatch KeyboardEvent on active element or document
- Listen for messages from background via `chrome.runtime.onMessage`

### Step 8: Snapshot Formatter
**Files:** `src/extension/snapshot-formatter.js`

- Convert CDP AXNode array into indented text tree (like Playwright's snapshot format)
- Format: `- role "name" [state1, state2]` with indentation for depth
- Filter out ignored/invisible nodes
- Truncate if result > 800KB (leave room in 1MB native message limit)
- Include node count in output header

### Step 9: Install Script
**Files:** `scripts/install.js`

- Generate native messaging host manifest JSON:
  - `name`: `"chrome_like_a_human"`
  - `path`: absolute path to host entry point (batch wrapper or node)
  - `type`: `"stdio"`
  - `allowed_origins`: `["chrome-extension://EXTENSION_ID/"]`
- Write manifest to `%APPDATA%/chrome-like-a-human/native-messaging-host.json`
- Create Windows registry key at `HKCU\Software\Google\Chrome\NativeMessagingHosts\chrome_like_a_human`
- Registry value: path to manifest JSON
- Create batch wrapper `host.bat` that runs `node dist/host/mcp-server.js` (ensures binary mode on Windows)
- Print instructions for loading unpacked extension and getting extension ID

### Step 10: Build Script
**Files:** `scripts/build.js`

- Compile TypeScript: `tsc` for host code -> `dist/host/`
- Copy extension files to `dist/extension/` (manifest.json, background.js, content.js, snapshot-formatter.js)
- Print load instructions: `chrome://extensions` -> Load unpacked -> select `dist/extension/`

### Step 11: MCP Config Entry
**Files:** documented in README

Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "chrome-qa": {
      "command": "node",
      "args": ["C:/path/to/chrome-like-a-human/dist/host/mcp-server.js"]
    }
  }
}
```

## Todo

- [x] Init npm project + TypeScript
- [x] Shared protocol types
- [x] Native messaging bridge with 4-byte framing
- [x] MCP server with 6 core tools
- [x] Extension manifest.json
- [x] Background service worker (native messaging + CDP dispatch)
- [x] Content script (DOM ARIA resolution + interactions)
- [x] Snapshot formatter (AXNode tree -> text)
- [x] Install script (Windows registry + manifest)
- [x] Build script
- [x] Manual test: navigate + snapshot + screenshot from Claude

## Success Criteria

- `navigate("https://example.com")` loads page, returns success
- `snapshot()` returns indented accessibility tree with roles/names
- `screenshot()` returns base64 PNG viewable in Claude
- `click("link", "More information...")` clicks the link on example.com
- `type("textbox", "Search", "hello")` types into search field
- `press_key("Enter")` submits form
- Round-trip latency < 500ms for click/type, < 2s for snapshot

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Windows binary mode breaks framing | High | Critical | Test early; batch wrapper forces binary mode |
| Native messaging 1MB limit hit by large AX trees | Medium | High | Truncate snapshot to viewport; add depth param |
| chrome.debugger detach on tab switch | Medium | Medium | Re-attach on demand; cache attachment state |
| Extension ID changes on reload | Low | Medium | Install script prompts for ID; document update process |

## Security Considerations

- Extension requests `<all_urls>` host permission — required for CDP on any site
- `debugger` permission grants full CDP access — document clearly in README
- Native messaging host runs as user's OS process — same trust boundary as Chrome
- No secrets stored; extension ID is not sensitive
- MCP server runs locally only (stdio transport, no network exposure)

## Next Steps

After Phase 1 complete:
- Phase 2 adds assertion tools (assert_visible, assert_text, etc.)
- Phase 2 adds network/console capture via CDP Network/Runtime domains

## Unresolved Questions

1. Should bridge.js and mcp-server.js be one file or separate? Separate is cleaner but adds IPC complexity. Decision: start as one file, split if >200 lines.
2. How to handle extension ID in install script? User must load extension first, get ID from chrome://extensions, then run install with ID as argument.
3. Should content script inject on all pages or on-demand via `chrome.scripting.executeScript`? All-pages is simpler; on-demand is more efficient. Start with all-pages.

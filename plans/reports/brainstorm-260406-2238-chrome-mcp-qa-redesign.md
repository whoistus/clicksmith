# Brainstorm: Chrome MCP for Human-Like QA Testing

## Problem Statement

User wants Claude to test web apps **like a human** — in the user's real Chrome browser with real auth, cookies, extensions. Not through Playwright's isolated Chromium. The tool should be an MCP server so Claude drives it directly, no API keys needed.

## Existing Landscape

### hangwin/mcp-chrome
- Chrome extension MCP with 20+ tools (click, type, navigate, screenshot, network)
- WebSocket-based (extension ↔ Node.js MCP host)
- Uses real Chrome with real sessions
- **Missing:** accessibility tree snapshots, ARIA-first locators, assertion tools, test generation, QA workflow

### ChromeDevTools/chrome-devtools-mcp (Official Google)
- Has `take_snapshot` — accessibility tree text snapshot with unique element IDs
- Lighthouse audits (accessibility, SEO, best practices)
- **Focus:** debugging, not QA automation
- **Missing:** interaction tools are limited, no assertion primitives, no test generation

### Playwright MCP
- Full browser automation, ARIA snapshots, acts by selector
- **Problem:** runs its own Chromium — not the user's real Chrome with auth state

## Gap Analysis: What Doesn't Exist Yet

| Capability | mcp-chrome | DevTools MCP | Playwright MCP | **Needed** |
|---|---|---|---|---|
| Real Chrome browser | Yes | Yes | No | Yes |
| ARIA accessibility snapshot | No | Yes | Yes | Yes |
| Click/type by ARIA role+name | No | Partial (by uid) | Yes | Yes |
| Assert element visible | No | No | No | **Yes** |
| Assert text content | No | No | No | **Yes** |
| Assert URL pattern | No | No | No | **Yes** |
| Network request capture | Yes | Yes | Yes | Yes |
| Console log capture | Partial | Yes | Yes | Yes |
| Test .spec.ts generation | No | No | No | **Yes** |
| Coverage gap analysis | No | No | No | **Yes** |
| Human-like interaction patterns | No | No | No | **Yes** |

**Core differentiator:** ARIA-first QA assertion tools + test generation, running in real Chrome.

## Architecture Decision

### Chosen: Extension + Native Messaging Host + MCP (stdio)

```
Claude Code/Desktop (MCP client)
        ↓ stdio (JSON-RPC)
Node.js Native Messaging Host (MCP server, thin bridge)
        ↓ WebSocket (localhost)
Chrome Extension (Manifest V3 — executes in real browser)
        ↓ Chrome APIs + CDP
Real Chrome tabs with real auth/cookies
```

**Why this over alternatives:**
- **vs Direct API calls:** No API key exposure, Claude handles auth via MCP client
- **vs File-based handoff:** Zero friction — Claude calls tools directly, no manual export step
- **vs WebSocket-only (like mcp-chrome):** stdio is the standard MCP transport, works natively with Claude Desktop/Code config

### Transport Detail
1. Claude spawns the Node.js host via MCP config (`"command": "node", "args": ["host.js"]`)
2. Host listens on `localhost:WS_PORT` for extension connection
3. Extension connects on load, keeps WebSocket alive
4. Host forwards MCP tool calls → extension, extension returns results → host → Claude

## MCP Tool Design

### Core Navigation & Interaction
- `navigate(url)` — go to URL
- `click(role, name)` — click by ARIA role + accessible name
- `type(role, name, text)` — type into field by ARIA
- `select_option(role, name, value)` — select dropdown
- `press_key(key)` — keyboard (Enter, Escape, Tab)
- `hover(role, name)` — hover element
- `scroll(direction, amount)` — scroll page

### Observation
- `snapshot()` — full accessibility tree as structured text
- `screenshot()` — viewport capture as base64 image
- `get_text(role, name)` — get element's text content
- `get_url()` — current page URL
- `get_title()` — current page title
- `get_network_log(filter?)` — recent XHR/fetch with status codes
- `get_console_log(level?)` — recent console output

### QA Assertions (unique to this project)
- `assert_visible(role, name)` — pass/fail if element visible
- `assert_text(role, name, expected)` — pass/fail text match
- `assert_url(pattern)` — pass/fail URL regex match
- `assert_title(expected)` — pass/fail title match
- `assert_network(url_pattern, status)` — pass/fail network response check
- `assert_count(role, name, count)` — pass/fail element count

### Session & Tab Management
- `list_tabs()` — list open tabs
- `switch_tab(id)` — switch to tab
- `wait_for(role, name, timeout?)` — wait for element to appear
- `wait_for_network(url_pattern, timeout?)` — wait for network request

### Test Generation (MCP resource/prompt, not tool)
- MCP Prompt: `generate_test` — given a session transcript, produce .spec.ts
- MCP Prompt: `analyze_gaps` — given test coverage, suggest untested scenarios

## Implementation Phases

### Phase 1: Foundation (Extension + Host + Core Tools)
- Manifest V3 scaffold + native messaging host
- WebSocket bridge (host ↔ extension)
- MCP server (stdio) with tool registration
- Core tools: navigate, snapshot, screenshot, click, type, press_key
- Accessibility tree via CDP `Accessibility.getFullAXTree` through `chrome.debugger`

### Phase 2: QA Assertion Layer
- All assert_* tools
- wait_for / wait_for_network
- Network request capture via `chrome.webRequest` + `chrome.debugger`
- Console capture via CDP `Runtime.consoleAPICalled`

### Phase 3: Test Generation & Gap Analysis
- MCP prompts for test generation and gap analysis
- Session transcript recording (tool call history → structured log)
- Export generated .spec.ts to project directory

### Phase 4: Polish
- Shadow DOM traversal
- iframe support (same-origin)
- SPA navigation detection
- Multi-tab workflows
- Connection status sidebar (minimal UI)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `chrome.debugger` shows yellow bar | Document it; required for CDP access. Users accept once. |
| Extension service worker goes idle (MV3) | WebSocket keepalive ping every 25s, or use offscreen document |
| Native messaging 1MB message limit | Chunk large snapshots; screenshots as separate tool calls |
| Accessibility tree too large for context | Truncate to viewport-visible elements, allow depth param |

## Success Metrics

| Metric | Target |
|---|---|
| Tool call → response latency | < 500ms for interactions, < 2s for snapshots |
| Accessibility tree accuracy | Matches Chrome DevTools accessibility panel |
| Assertion tools false-positive rate | 0% — assertions must be deterministic |
| Setup time (install ext + configure MCP) | < 5 minutes |
| Claude can complete login + dashboard test | Yes, with no human intervention |

## Unresolved Questions

1. **Should we support Firefox/Edge?** Probably not in v1 — Chrome-only keeps scope tight
2. **MCP Streamable HTTP vs stdio?** stdio is simpler and sufficient for local use
3. **Offscreen document vs service worker for WebSocket?** Need to test MV3 service worker lifecycle limits

## Sources
- [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) — existing Chrome extension MCP
- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) — official Google Chrome DevTools MCP
- [Chrome Native Messaging docs](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [chrome-native-messaging npm](https://www.npmjs.com/package/chrome-native-messaging)
- [Chrome DevTools Protocol - Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [Full accessibility tree in Chrome DevTools](https://developer.chrome.com/blog/full-accessibility-tree)

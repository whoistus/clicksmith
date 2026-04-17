# Clicksmith

Chrome extension MCP server that lets Claude test web apps in your **real Chrome browser** — with your real auth, cookies, and extensions. ARIA-first element resolution, QA assertions, network capture, and test generation.

## Architecture

```
Claude Code/Desktop (MCP client)
    | stdio (JSON-RPC)
Node.js MCP Server (ws://127.0.0.1:9333)
    | WebSocket + shared-secret auth
Chrome Extension (Manifest V3)
    | chrome.debugger CDP + DOM APIs
Your real Chrome tabs
```

## Quick Start

```bash
# 1. Install & build
npm install
npm run build

# 2. Run interactive setup (generates token + config)
node scripts/install.js

# 3. Follow the printed instructions
```

Or manual setup:

```bash
# Build
npm install && npm run build

# Load extension: chrome://extensions → Developer mode → Load unpacked → dist/extension/

# Set auth token in extension (Service worker console):
#   chrome.storage.local.set({ authToken: 'your-token' })

# Add MCP server to Claude:
#   claude mcp add chrome-qa node -- dist/host/host/mcp-server.js --token=your-token
```

## Tools (24)

### Core Interaction
| Tool | Description |
|------|-------------|
| `navigate(url)` | Go to URL, wait for load |
| `click(role, name)` | Click element by ARIA role + name |
| `type(role, name, text)` | Type into input field |
| `press_key(key)` | Press keyboard key (Enter, Tab, etc.) |
| `select_option(role, name, value)` | Select dropdown option (native + custom) |
| `hover(role, name)` | Hover over element |

### Observation
| Tool | Description |
|------|-------------|
| `snapshot(mode?)` | Accessibility tree ("interactive" default, "full") |
| `screenshot()` | Viewport capture (base64 PNG) |
| `get_text(role, name)` | Get element text content |
| `get_url()` | Current page URL |
| `get_network_log(filter?)` | Recent XHR/fetch requests |
| `get_console_log(level?)` | Console messages |

### QA Assertions
| Tool | Description |
|------|-------------|
| `assert_visible(role, name)` | Element exists and visible |
| `assert_text(role, name, expected)` | Element contains text |
| `assert_url(pattern)` | URL matches regex |
| `assert_network(url_pattern, status?)` | Network request captured |
| `assert_count(role, name, count)` | Element count matches |

### Wait
| Tool | Description |
|------|-------------|
| `wait_for(role, name, timeout?)` | Wait for element to appear |
| `wait_for_network(url_pattern, timeout?)` | Wait for network request |

### Session & Files
| Tool | Description |
|------|-------------|
| `get_session()` | Get QA session transcript (all tool calls) |
| `clear_session()` | Reset session transcript |
| `save_file(path, content)` | Write file to disk (e.g., generated tests) |

### Tab Management
| Tool | Description |
|------|-------------|
| `list_tabs()` | List all open tabs |
| `switch_tab(id)` | Switch to specific tab |

## MCP Prompts (2)

| Prompt | Description |
|--------|-------------|
| `generate_test` | Convert session transcript to Playwright .spec.ts |
| `analyze_gaps` | Suggest untested scenarios from existing coverage |

## Example Test Flow

```
You: Use chrome-qa to test login on https://myapp.com

Claude:
1. navigate("https://myapp.com/login")
2. snapshot()  → sees textbox "Email", textbox "Password", button "Sign in"
3. type("textbox", "Email", "user@test.com")
4. type("textbox", "Password", "password123")
5. click("button", "Sign in")
6. wait_for("heading", "Dashboard")
7. assert_url("/dashboard")
8. assert_visible("heading", "Dashboard")
9. get_session()  → full transcript
10. → generate_test prompt → Playwright .spec.ts
11. save_file("tests/login.spec.ts", generatedCode)
```

## Features

- **ARIA-first**: finds elements by role + accessible name, not CSS selectors
- **Real browser**: your actual Chrome with real auth, cookies, extensions
- **Shadow DOM**: pierces open shadow roots automatically
- **SPA support**: detects pushState/replaceState navigation
- **iframe support**: traverses same-origin iframes
- **Token-efficient snapshots**: interactive mode shows only actionable elements (~70% reduction)
- **Network capture**: ring buffer of recent XHR/fetch with status codes
- **Console capture**: recent console output by level
- **Session recording**: automatic transcript of all tool calls for test generation

## Auth Token

The WebSocket connection requires a shared secret token:

```bash
# Option A: Fixed token (recommended)
node scripts/install.js --token=my-secret-token

# Option B: Auto-generated (changes each restart)
node scripts/install.js
```

Both the MCP server (`--token=`) and extension (`chrome.storage.local`) must have the same token.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Chrome extension not connected" | Check extension is loaded + auth token matches |
| Yellow "debugging" bar in Chrome | Normal — required for CDP access (accessibility tree, network capture) |
| Extension shows "Disconnected, reconnecting" | MCP server not running, or token mismatch |
| Port 9333 conflict | Use `--port=9334` in MCP args |
| Snapshot too large | Use default `mode: "interactive"` (only actionable elements) |
| `select_option` fails on custom dropdown | Element must have role "combobox" or "listbox"; options need role "option" |

## Limitations

- Cross-origin iframes not accessible (browser security)
- Closed shadow DOM not traversable (by design)
- Yellow debugger bar always visible when connected
- One active extension connection at a time
- `save_file` restricted to paths within project directory

## Development

```bash
npm run build       # Compile TS + copy extension files
npm test            # Run vitest (35 tests)
npm run test:watch  # Watch mode
```

## License

MIT

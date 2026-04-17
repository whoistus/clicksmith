# Clicksmith

**Give Claude hands in your real Chrome browser.** An MCP server + Chrome extension that lets Claude click, type, test, and verify web apps using the same browser session you already have open — with your real cookies, your real logins, your real extensions.

Unlike headless browser automation (Playwright, Puppeteer), Clicksmith drives the Chrome window in front of you. Claude sees what you see. Perfect for QA testing, form filling, end-to-end verification, and design QA.

```
You: "Test the login flow on localhost:3000, then verify the dashboard loads."

Claude:
  1. navigate("http://localhost:3000/login")
  2. type("textbox", "Email", "user@test.com")
  3. type("textbox", "Password", "hunter2")
  4. click("button", "Sign in")
  5. wait_for("heading", "Dashboard")
  6. assert_url("/dashboard")
  → Test passed. Report saved.
```

---

## Why Clicksmith

- **Real browser, real session.** Uses your actual Chrome with your logged-in state. Test behind auth walls without mocking.
- **ARIA-first targeting.** `click(role, name)` instead of brittle CSS selectors. Works with React, Vue, Angular, or vanilla HTML.
- **Batch execution.** One `batch(...)` call runs 10 actions in a single round-trip — ~8× faster for autonomous test flows.
- **Self-correcting.** When an element lookup fails, the error lists actual candidates Claude saw — no more snapshot-retry loops.
- **Design QA built-in.** `get_element_style` returns computed CSS + bounding box, perfect for diffing live UI against Figma designs.
- **Zero cloud dependency.** All communication is localhost. No data leaves your machine.

---

## Install

### Prerequisites

- Node.js 20 or newer
- Chrome (or Chromium-based: Brave, Edge, Arc)
- Claude Code or Claude Desktop

### 1. Install the Chrome extension

Download the latest `clicksmith-extension-v*.zip` from [Releases](https://github.com/whoistus/clicksmith/releases/latest), then:

```bash
# Unzip to a location you'll keep (extension loads FROM this folder)
unzip clicksmith-extension-v*.zip -d ~/clicksmith-extension
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select `~/clicksmith-extension`

### 2. Configure Claude

No global install needed — Claude runs the MCP server via `npx`.

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "clicksmith": {
      "command": "npx",
      "args": ["-y", "clicksmith"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add clicksmith -- npx -y clicksmith
```

Restart Claude. First invocation downloads `clicksmith` via npx and caches it; subsequent runs are instant.

### 3. (Optional) Lock to your extension

By default the server accepts any Chrome extension connecting from localhost. To restrict to only your extension:

```json
{
  "mcpServers": {
    "clicksmith": {
      "command": "npx",
      "args": ["-y", "clicksmith"],
      "env": { "CLICKSMITH_EXTENSION_ID": "abcdefghijklmnop..." }
    }
  }
}
```

Find the id at `chrome://extensions` under the Clicksmith tile.

---

## Usage

Ask Claude anything browser-related:

```
"Fill out the signup form at myapp.com with test data and submit it."
"Take a screenshot of the pricing page and compare it to the Figma design."
"Test that clicking 'Delete' actually removes the item from the list."
"Navigate through all the tabs in settings and verify nothing 404s."
```

Claude decides which tools to use and in what order. You just describe the task.

### Example: full test case

```
You: /start_test name="Create project" description="Verify a user can create a new project"

You: Create a project called "Test Project" and verify it appears in the list.

Claude runs the test, then:

You: /end_test

→ Returns a structured QA report with pass/fail, evidence, and grouped steps.
```

---

## Tools

28 total. Shown here grouped by purpose.

### Interaction

| Tool | What it does |
|------|-------------|
| `navigate(url)` | Go to URL, wait for load |
| `click(role, name)` | Click by ARIA role + accessible name |
| `type(role, name, text)` | Type into input |
| `press_key(key)` | Enter, Tab, ArrowDown, etc. |
| `select_option(role, name, value?, strategy?)` | Dropdown select — `exact` / `first` / `random` / `fuzzy` |
| `hover(role, name)` | Mouse hover |

### Observation

| Tool | What it does |
|------|-------------|
| `snapshot(mode?)` | Accessibility tree (`interactive` default, or `full`) |
| `screenshot()` | Viewport PNG |
| `get_text(role, name)` | Element text content |
| `get_url()` | Current page URL |
| `get_element_style(role, name)` | Computed CSS + bounding box (for design QA) |
| `get_network_log(filter?)` | Recent XHR/fetch requests |
| `get_console_log(level?)` | Recent console output |

### Assertions

| Tool | What it does |
|------|-------------|
| `assert_visible(role, name)` | Element is visible |
| `assert_text(role, name, expected)` | Element contains text |
| `assert_url(pattern)` | URL matches regex |
| `assert_network(url_pattern, status?)` | Network request happened |
| `assert_count(role, name, count)` | N elements match |

### Waits

| Tool | What it does |
|------|-------------|
| `wait_for(role, name, timeout?)` | Wait for element to appear |
| `wait_for_network(url_pattern, timeout?)` | Wait for a network request |

### Tabs

| Tool | What it does |
|------|-------------|
| `list_tabs()` | Open Chrome tabs |
| `switch_tab(id)` | Switch active tab |

### Batch & Sessions

| Tool | What it does |
|------|-------------|
| `batch(actions, stop_on_error?, snapshot_after?)` | Run many tools in one round-trip |
| `start_test(name, description?, ...)` | Begin structured test case |
| `end_test()` | Return test report (pass/fail, evidence) |
| `get_session()` | Full transcript of tool calls |
| `clear_session()` | Reset transcript |
| `save_file(path, content)` | Write generated test files |

### MCP Prompts

- `generate_test` — turn a session transcript into a Playwright `.spec.ts` file
- `analyze_gaps` — suggest untested scenarios from existing coverage

---

## Features in depth

### Batch mode

For long deterministic flows (login, form-fill, navigation), call `batch()` instead of N individual tools:

```json
{
  "actions": [
    {"tool": "type", "role": "textbox", "name": "Email", "text": "x@y.z"},
    {"tool": "type", "role": "textbox", "name": "Password", "text": "pw"},
    {"tool": "click", "role": "button", "name": "Sign in"},
    {"tool": "wait_for", "role": "heading", "name": "Dashboard"}
  ]
}
```

Returns results + final snapshot in one response. Eliminates 9 round-trips of model inference time.

### Smart `select_option`

Custom dropdowns (React Select, Material UI, Ant Design, base-ui) just work. Strategies:

- `exact` — error if value not found (default)
- `first` — just select the first option
- `random` — pick one at random
- `fuzzy` — partial/case-insensitive match, fallback to first

On failure, returns `available_options` so Claude retries in one turn. Uses MutationObserver (not polling) to detect option render.

### Design QA with Figma

Clicksmith pairs perfectly with a Figma MCP to diff live UI against the design spec. Recommended companion: [figma-mcp-poor](https://github.com/whoistus/figma-mcp-poor) ([npm](https://www.npmjs.com/package/figma-mcp-poor)) — lightweight, no token setup, follow the repo's install instructions.

With both MCPs active, prompt Claude:

```
You: "Compare the Save button on localhost with the 'Primary Button' 
      component in my Figma file. Report visual drift."

Claude:
  1. [figma-mcp-poor] fetch component spec → design tokens
  2. [clicksmith] get_element_style("button", "Save") → computed CSS
  3. Diffs: background #3B82F6 vs #2563EB, padding 12px vs 16px
  4. Proposes CSS fix
```

Works with any Figma MCP that exposes frame/component data.

### Test report generation

After a session, `end_test` returns a structured report. Use the `generate_test` MCP prompt to turn it into a Playwright `.spec.ts` file.

---

## Security

**Threat model.** The real threat is a malicious webpage doing `new WebSocket('ws://127.0.0.1:9333')` to hijack your browser through Clicksmith.

**Defense.** Clicksmith validates the WebSocket handshake `Origin` header. Chrome sets this server-side on every handshake and page JavaScript **cannot** forge it. Only `chrome-extension://` origins are accepted; everything else is rejected at HTTP 403 before the connection opens.

**No tokens, no rotation, no friction.**

**Optional hardening.** Set `CLICKSMITH_EXTENSION_ID` to lock to your exact extension id.

**What Clicksmith can see.** Everything the extension has access to: any tab you have open, cookies, page content, form values. This is the point of the tool. Inspect the open-source code before installing.

**What Clicksmith sends over the network.** Nothing. All communication is `127.0.0.1:9333` on localhost. No telemetry, no analytics, no cloud.

**Chrome's "being controlled" bar.** Required to access the accessibility tree and execute automation. It's a browser-enforced visible indicator that automation is active — a feature, not a bug.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Claude says "Chrome extension not connected" | Open Chrome; verify extension is loaded at `chrome://extensions`; if recently loaded, click its icon once to wake the service worker |
| Port 9333 already in use | Another Clicksmith or conflicting app is running. Kill it, or wait 30 seconds |
| Extension console shows WebSocket errors | MCP server isn't running. Restart Claude Desktop / Claude Code |
| Yellow "being debugged" bar in Chrome | Normal. Required for the accessibility APIs. Cannot be hidden by design. |
| `select_option` can't find custom dropdown | Error response now includes candidate elements — read them, retry with the real accessible name |
| Snapshot is too large | Default is `mode: "interactive"` which shows only actionable elements. If you need the full tree, use `mode: "full"` |

---

## How it works

```
Claude (Desktop or Code)
   │ stdio / JSON-RPC
   ▼
Clicksmith MCP Server ──────── Node.js process
   │ WebSocket (127.0.0.1:9333, Origin-validated)
   ▼
Chrome Extension (Manifest V3)
   │ chrome.debugger CDP + DOM APIs
   ▼
Your Chrome tabs
```

- **MCP server:** stdio transport, 28 tools, prompts for test generation
- **WebSocket bridge:** 127.0.0.1 only, Origin-header auth, auto-reconnect
- **Chrome extension:** service worker + content script, keep-alive via `chrome.alarms`
- **ARIA resolver:** deep DOM traversal including open shadow roots + same-origin iframes

---

## Limitations

- Cross-origin iframes not accessible (browser security; no workaround)
- Closed shadow DOM not traversable (by design)
- One active MCP ↔ extension connection at a time
- `save_file` restricted to relative paths under the project root
- Chrome Web Store listing not yet published — install via `load unpacked` for now

---

## Development

```bash
git clone https://github.com/whoistus/clicksmith
cd clicksmith
npm install
npm test              # vitest (43 tests)
npm run build         # compile host + copy extension to dist/
npm run package       # build + produce clicksmith-extension-v*.zip for release
```

Source layout:

```
src/
├── shared/      protocol types (host ↔ extension)
├── host/        Node.js MCP server + WebSocket bridge
└── extension/   Chrome MV3 service worker + content script
```

PRs welcome. See `CONTRIBUTING.md` (coming soon).

---

## License

MIT. See [LICENSE](LICENSE).

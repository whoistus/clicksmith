# Implementation plan — QA layer on top of Playwright MCP

**Premise:** Playwright MCP handles the infrastructure (DOM snapshots, act by selector, network capture, authenticated sessions). This plan covers only the product layer that doesn't exist yet.

**Stack**
- `@playwright/mcp` — browser automation + accessibility snapshots (not built, just configured)
- Chrome extension (Manifest V3) — recorder UI + event capture
- Claude API (`claude-sonnet-4-6`) — session log → test code + assertions
- Node.js backend (optional, thin) — session storage, CI webhook

**Timeline: 5 weeks**

---

## Phase 1 — ARIA-first session recorder
**Duration:** Week 1–2

The recorder is the core differentiator. It watches a human tester interact with the app and captures every action as a structured, ARIA-first event — not a video, not CSS selectors.

### 1.1 Chrome extension scaffold

```
/extension
  manifest.json          ← Manifest V3
  background.js          ← service worker: network capture, message routing
  content.js             ← injected into page: event listeners, ARIA resolution
  sidebar/
    index.html           ← recorder UI (start, stop, export)
    sidebar.js
    sidebar.css
```

**manifest.json permissions needed:**
```json
{
  "permissions": ["activeTab", "scripting", "storage", "webRequest", "sidePanel"],
  "host_permissions": ["<all_urls>"]
}
```

Tasks:
- [ ] Scaffold Manifest V3 extension with service worker
- [ ] Register side panel (Chrome 114+ `chrome.sidePanel` API) — sidebar persists while tester navigates, unlike a popup which closes on navigation
- [ ] Message passing: `content.js` → `background.js` → `sidebar.js`
- [ ] Storage: `chrome.storage.session` for active recording, `chrome.storage.local` for saved sessions

---

### 1.2 Content script — event capture with ARIA resolution

Injected into the page. Listens for user interactions and resolves each target element to its best available selector, in priority order:

```
1. getByRole(role, { name })     ← ARIA role + accessible name
2. getByTestId(value)            ← data-testid / data-cy / data-qa
3. getByLabel(text)              ← associated label text
4. getByPlaceholder(text)        ← input placeholder
5. getByText(text, { exact })    ← visible text content
6. CSS selector                  ← last resort, fragile
```

**Event captured per interaction:**
```json
{
  "id": "evt_001",
  "type": "click",
  "timestamp": 1712345678123,
  "url": "https://app.example.com/login",
  "target": {
    "ariaRole": "button",
    "ariaName": "Sign in",
    "testId": null,
    "label": null,
    "text": "Sign in",
    "cssSelector": "button.btn-primary[type=submit]",
    "playwright": "getByRole('button', { name: 'Sign in' })"
  },
  "value": null,
  "networkTriggered": true
}
```

For `input` and `change` events, `value` captures the entered text. For sensitive fields (`type=password`, field names matching `password|secret|token`), `value` is replaced with `"[REDACTED]"` before the event leaves the content script — it never reaches storage or Claude.

Events to capture:
- [ ] `click` on interactive elements (buttons, links, checkboxes, selects)
- [ ] `input` / `change` on text fields, textareas, selects
- [ ] `keydown` for Enter, Escape, Tab (navigation keys only — not full keystroke logging)
- [ ] Navigation: `popstate`, `hashchange`, MutationObserver on `<title>` for SPA route changes
- [ ] Form submit (in case submit fires without a button click)

Tasks:
- [ ] Content script with event delegation on `document`
- [ ] `resolveARIA(element)` — walks the accessibility tree to compute role + accessible name
- [ ] `resolvePlaywrightLocator(element)` — returns the best Playwright locator string
- [ ] Sensitive field redaction before message dispatch
- [ ] Debounce rapid `input` events (100ms) to avoid capturing every keystroke

---

### 1.3 Background service worker — network capture

Captures XHR/fetch requests and pairs them with the events that triggered them, using a 500ms correlation window.

```json
{
  "id": "net_001",
  "correlatedEventId": "evt_001",
  "url": "https://api.example.com/auth/login",
  "method": "POST",
  "requestBody": { "email": "user@example.com", "password": "[REDACTED]" },
  "status": 200,
  "responseBody": { "token": "[REDACTED]", "user": { "id": 42, "role": "admin" } },
  "durationMs": 183
}
```

Tasks:
- [ ] `chrome.webRequest` listeners for request/response
- [ ] Request body capture via `requestBody` from `onBeforeRequest`
- [ ] Response body capture via `chrome.debugger` (`Network.getResponseBody`) — requires attaching debugger to the tab
- [ ] Sensitive field scrubbing in both request and response bodies (regex pass on field names)
- [ ] Correlate network events to user events by timestamp proximity

---

### 1.4 Sidebar UI

The tester's control panel. Stays open as they navigate.

**States:**
- **Idle** — "Start Recording" button, list of saved sessions
- **Recording** — live event feed (last 5 events), timer, "Stop" button
- **Review** — session summary, "Generate Test" button, "Export JSON" button

Tasks:
- [ ] Idle state UI with session history list
- [ ] Recording state with live event stream (auto-scrolling)
- [ ] Stop → Review transition with session summary (page count, event count, APIs hit)
- [ ] "Export JSON" — downloads raw session log
- [ ] "Generate Test" — sends session to Claude API (Phase 2)

**Validation for Phase 1:** Record a 10-step login + dashboard flow. Inspect the exported JSON. Verify every action has a `playwright` locator that is ARIA-first, and that no passwords appear anywhere in the file.

---

## Phase 2 — Claude integration: session → test + assertions
**Duration:** Week 3

Takes the structured session log and produces a runnable Playwright test with assertions — not just a replay of actions.

### 2.1 Session log → Claude prompt

Sent as a single API call after the tester clicks "Generate Test":

```
System:
You are a senior QA engineer. You will receive a structured session log of a human
tester interacting with a web application. Your job is to produce a complete Playwright
test in TypeScript that:

1. Uses ARIA-first locators (getByRole, getByLabel, getByText) — never raw CSS selectors
   unless no semantic alternative exists
2. Adds waitForResponse() after actions that trigger network calls
3. Infers and adds expect() assertions after each meaningful state change:
   - URL changes → expect(page).toHaveURL(...)
   - Network response → expect(response.status()).toBe(200)
   - Element appears → expect(page.getByRole(...)).toBeVisible()
   - Element text changes → expect(page.getByRole(...)).toHaveText(...)
4. Groups related steps into logical test blocks with descriptive names
5. Adds a comment above each assertion explaining WHY this assertion matters

Return ONLY the TypeScript test file. No explanation. No markdown fences.

User:
<session log JSON>
```

Tasks:
- [ ] Claude API call from sidebar with session log as user message
- [ ] Stream response back to sidebar (show code generating live)
- [ ] Parse and syntax-highlight the returned TypeScript in the sidebar
- [ ] "Copy to clipboard" and "Download as `.spec.ts`" buttons
- [ ] Error handling: if Claude returns malformed code, retry with simplified prompt

---

### 2.2 Assertion inference rules

Claude follows these patterns when adding assertions — make them explicit in the system prompt so output is consistent:

| Trigger | Assertion added |
|---|---|
| Navigation event | `await expect(page).toHaveURL(/pattern/)` |
| Network POST → 200 | `await expect(response.status()).toBe(200)` |
| Network POST → 4xx | Test error path separately (flagged as a gap) |
| Element becomes visible after action | `await expect(locator).toBeVisible()` |
| Button becomes disabled after click | `await expect(locator).toBeDisabled()` |
| Text content changes | `await expect(locator).toHaveText('...')` |
| Form resets | `await expect(input).toHaveValue('')` |
| Toast / alert appears | `await expect(page.getByRole('alert')).toBeVisible()` |

Tasks:
- [ ] Encode inference rules in the system prompt
- [ ] Post-generation validation: parse the TypeScript with `@typescript-eslint/parser` and flag syntax errors before showing to user
- [ ] If any step has no assertion: flag it with a `// TODO: add assertion` comment rather than silently skipping

---

### 2.3 Sensitive data handling in prompts

Before the session log is sent to Claude:
- Replace all `[REDACTED]` values with realistic-looking placeholder values (`user@example.com`, `••••••••`)
- Strip full response bodies for auth tokens — keep only the status code and top-level field names
- Strip `Authorization` and `Cookie` headers from network events

Tasks:
- [ ] Pre-send scrubber that runs on the session log before the API call
- [ ] Show the tester a diff: "This data will be sent to Claude" vs "This data was redacted" — consent step

**Validation for Phase 2:** Take the login session from Phase 1 validation. Generate a test. Run `npx playwright test` against the same app and confirm the test passes without any manual edits.

---

## Phase 3 — Coverage gap analysis
**Duration:** Week 4

After generating a test from the happy path, Claude analyzes what was NOT tested and suggests what the tester should record next.

### 3.1 Gap analysis prompt

Sent immediately after test generation as a second API call:

```
System:
You are a QA lead reviewing test coverage. Given the session log and the generated test,
identify the most important untested scenarios. For each gap:
- Name the scenario (e.g. "Login with wrong password")
- Explain why it matters (one sentence)
- List the steps to reproduce it
- Estimate the risk if this scenario breaks in production (High / Medium / Low)

Return JSON only:
{
  "gaps": [
    {
      "scenario": "Login with incorrect password",
      "rationale": "Most common auth failure — must show error, not crash",
      "steps": ["Navigate to /login", "Enter valid email", "Enter wrong password", "Click Sign in"],
      "risk": "High"
    }
  ]
}
```

Tasks:
- [ ] Second API call after test generation
- [ ] Render gap list in sidebar below the generated test
- [ ] Each gap has a "Record this flow" button that starts a new recording session scoped to that scenario
- [ ] Risk badge (High = red, Medium = amber, Low = gray)

---

### 3.2 Session history and coverage view

After multiple sessions are recorded, show a simple coverage map.

Tasks:
- [ ] `chrome.storage.local` stores all session summaries (URL, event count, timestamp, generated test filename)
- [ ] Sidebar "Coverage" tab: list of recorded flows with status (recorded / test generated / test passing)
- [ ] "Mark as passing" toggle the tester can set after running the test in their terminal

**Validation for Phase 3:** Record happy path login. Generate test. Check that the gap analysis correctly identifies "wrong password" and "empty fields" as High risk gaps. Click "Record this flow" and verify it starts a new session.

---

## Phase 4 — Polish and CI export
**Duration:** Week 5

### 4.1 Playwright MCP bridge (connect recorder to MCP for replay)

Right now the recorder captures events but replay requires the tester to run `npx playwright test`. This connects the two so replay can happen directly from the sidebar.

Requires Playwright MCP to be running locally (Claude Desktop or Claude Code).

Tasks:
- [ ] Detect if `@playwright/mcp` is reachable on localhost (ping the MCP HTTP endpoint)
- [ ] "Replay in Playwright MCP" button — sends the session log to MCP, which replays the actions using `page.getByRole()` locators
- [ ] Show replay result in sidebar (pass / fail per step)

---

### 4.2 GitHub Actions export

Tasks:
- [ ] "Export to CI" button downloads a `.github/workflows/playwright.yml` pre-configured with:
  - The generated `.spec.ts` file path
  - `npx playwright install` step
  - Test run step with artifact upload for the HTML report
- [ ] Copy-paste instructions shown inline for first-time setup

---

### 4.3 Edge case hardening

Known rough edges to handle before shipping:

| Issue | Fix |
|---|---|
| SPA navigation not detected | Use `PerformanceObserver` + `MutationObserver` on `<title>` in content script |
| Shadow DOM elements not resolved | Walk shadow roots in `resolveARIA()` using `element.shadowRoot` traversal |
| iframes | Inject content script into same-origin iframes; for cross-origin, capture the iframe click and note it as a manual step |
| Rapid re-renders (React Strict Mode) | Debounce DOM mutation events at 100ms in the content script |
| Extension mode bug in Playwright MCP | Detect the bug (new window opens instead of connecting) and show a clear error with the workaround steps |

Tasks:
- [ ] Shadow DOM traversal in `resolveARIA()`
- [ ] Same-origin iframe content script injection
- [ ] SPA navigation detection via `PerformanceObserver`
- [ ] Extension mode bug detection + user-facing error message

---

### 4.4 Onboarding flow

First-time user lands in the sidebar and has no context. Need a 60-second orientation.

Tasks:
- [ ] Empty state in sidebar: "Record your first test" with 3-step visual guide
- [ ] First session walkthrough tooltip sequence (record → review → generate → run)
- [ ] Link to Playwright MCP setup instructions for replay feature

**Validation for Phase 4:** Give the sidebar to someone who has never seen it. Time how long it takes them to record a session, generate a test, and run it. Target: under 5 minutes with no explanation.

---

## Folder structure

```
/
├── extension/               ← Chrome extension
│   ├── manifest.json
│   ├── background.js        ← network capture, message routing
│   ├── content.js           ← event capture, ARIA resolution
│   └── sidebar/
│       ├── index.html
│       ├── sidebar.js       ← UI logic, Claude API calls
│       └── sidebar.css
│
├── prompts/                 ← Claude prompt templates (versioned)
│   ├── generate-test.md
│   └── gap-analysis.md
│
├── scripts/
│   └── validate-test.js     ← post-generation TypeScript syntax check
│
└── docs/
    ├── setup.md             ← how to install + connect Playwright MCP
    └── session-schema.md    ← session log JSON schema reference
```

---

## What is explicitly NOT built

These are handled by Playwright MCP and should not be reimplemented:

- DOM accessibility tree serialization
- Acting on elements by selector
- Network request/response capture for the MCP-driven replay
- Authenticated session management (`--extension` mode)
- Cross-browser support (Playwright handles this)
- Headless/CI execution

If Playwright MCP adds a feature that overlaps with something in this plan (e.g. better codegen), adopt it and remove the custom implementation.

---

## Success metrics

| Metric | Target |
|---|---|
| Time from install to first generated test | < 10 minutes |
| Generated test pass rate (no edits) | ≥ 70% on first run |
| ARIA locator usage in generated tests | ≥ 90% of locators (vs CSS fallback) |
| Sensitive data leakage to Claude | 0 — verified by audit of outgoing API calls |
| Gap analysis recall | ≥ 3 meaningful gaps identified per happy-path session |
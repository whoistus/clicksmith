# Phase 4: Polish

## Context

- [Phase 1: Foundation](./phase-01-foundation.md) (prerequisite)
- [Phase 2: QA Assertions](./phase-02-qa-assertions.md) (prerequisite)
- [Phase 3: Test Generation](./phase-03-test-generation.md) (prerequisite)
- [Plan Overview](./plan.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-04-06 |
| Priority | P2 |
| Effort | 1 week |
| Status | pending |
| Description | Shadow DOM traversal, iframe support, SPA detection, additional interaction tools, multi-tab management, minimal sidebar UI, setup docs |

## Key Insights

1. Shadow DOM requires recursive traversal via `element.shadowRoot.querySelectorAll()` — standard querySelectorAll doesn't pierce shadow boundaries
2. Same-origin iframes accessible via `contentDocument`; cross-origin iframes require separate CDP target attachment
3. SPA navigation doesn't trigger `tabs.onUpdated` — detect via MutationObserver on `document.title` or `history.pushState`/`popstate` monkey-patching
4. `select_option` needs special handling: native `<select>` uses `element.value = x; dispatchEvent('change')`, custom dropdowns need click sequences
5. Chrome sidebar panel API (MV3) is experimental — use `chrome.sidePanel` if available, fallback to popup

## Requirements

### Additional Interaction Tools (4 tools)
- `select_option(role, name, value)` — select dropdown option
- `hover(role, name)` — hover over element (triggers CSS :hover, mouseenter events)
- `list_tabs()` — return list of open tabs with id, title, url
- `switch_tab(id)` — switch to specified tab

### Shadow DOM Support
- Content script ARIA resolution pierces open shadow roots
- Recursive traversal in `findByRoleAndName`

### Iframe Support
- Same-origin iframes: traverse via contentDocument
- Cross-origin: out of scope for v1 (document limitation)

### SPA Navigation Detection
- Detect URL changes without page reload
- Update internal state for `get_url()` and `assert_url()`

### Sidebar UI (Minimal)
- Connection status indicator (connected/disconnected to host)
- Current active tab info
- Last tool call + result (for debugging)

## Architecture

### Shadow DOM Traversal
```javascript
function deepQueryAll(root, predicate, results = []) {
  for (const el of root.querySelectorAll('*')) {
    if (predicate(el)) results.push(el);
    if (el.shadowRoot) deepQueryAll(el.shadowRoot, predicate, results);
  }
  return results;
}
```

### SPA Detection
```
content.js
  |-- Monkey-patch history.pushState / history.replaceState
  |-- Listen for popstate event
  |-- On URL change: notify background.js with new URL
  |-- MutationObserver on <title> for title changes
```

### Sidebar Architecture
```
src/extension/sidebar/
  |-- index.html     (panel shell)
  |-- sidebar.js     (listens for status messages from background)
  |-- sidebar.css    (minimal styling)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/extension/content.js` | Shadow DOM traversal, SPA detection, select_option, hover |
| `src/extension/background.js` | list_tabs, switch_tab, SPA URL tracking |
| `src/extension/sidebar/index.html` | Sidebar panel HTML |
| `src/extension/sidebar/sidebar.js` | Status display logic |
| `src/extension/sidebar/sidebar.css` | Panel styles |
| `src/extension/manifest.json` | Add side_panel config |
| `src/host/mcp-server.ts` | Register 4 new tools |
| `README.md` | Setup and usage documentation |

## Implementation Steps

### Step 1: Shadow DOM Traversal
**Files:** `src/extension/content.js` (extend)

- Replace `document.querySelectorAll` calls with `deepQueryAll` that pierces open shadow roots
- Update `findByRoleAndName(role, name)` to use deep traversal
- `deepQueryAll(root, predicate)`: recursively walk DOM tree, enter each `el.shadowRoot`
- Only open shadow roots are accessible (closed shadow roots are inaccessible by design)
- Test with common shadow DOM components (e.g., `<input type="date">`, custom web components)

### Step 2: Same-Origin Iframe Support
**Files:** `src/extension/content.js` (extend)

- After querying main document, check `document.querySelectorAll('iframe')`
- For each iframe: try `iframe.contentDocument` (same-origin check)
- If accessible, run `findByRoleAndName` inside iframe document
- Return results with `{frameIndex}` metadata so click/type targets correct frame
- Cross-origin iframes: skip silently (log to console for debugging)

### Step 3: SPA Navigation Detection
**Files:** `src/extension/content.js` (extend)

- Monkey-patch `history.pushState` and `history.replaceState`:
  ```javascript
  const origPush = history.pushState;
  history.pushState = function(...args) {
    origPush.apply(this, args);
    notifyUrlChange(location.href);
  };
  ```
- Listen for `popstate` event (back/forward button)
- `notifyUrlChange(url)`: send message to background via `chrome.runtime.sendMessage`
- Background stores current URL per tab; used by `get_url()` and `assert_url()`

### Step 4: Select Option Tool
**Files:** `src/extension/content.js` (extend)

- Find element by role + name (role should be "combobox" or "listbox")
- **Native `<select>`**: set `element.value = value`, dispatch `change` and `input` events
- **Custom dropdown**: click to open, find option by text, click option
- Heuristic: if element is `<select>`, use native path; else use click sequence
- Return `{success, selectedValue}`

### Step 5: Hover Tool
**Files:** `src/extension/content.js` (extend)

- Find element by role + name
- Dispatch `mouseenter` and `mouseover` events on element
- Use `element.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}))`
- Also dispatch `mouseenter` (doesn't bubble)
- Return `{success: true}`

### Step 6: Tab Management Tools
**Files:** `src/extension/background.js` (extend)

- `list_tabs()`: `chrome.tabs.query({})` -> return `[{id, title, url, active}]`
- `switch_tab(id)`: `chrome.tabs.update(id, {active: true})` + `chrome.windows.update(tab.windowId, {focused: true})`
- Update MCP server with 2 new tools

### Step 7: Sidebar Panel
**Files:** `src/extension/sidebar/index.html`, `sidebar.js`, `sidebar.css`

**index.html**: Minimal shell with status container
**sidebar.js**:
- Listen for messages from background via `chrome.runtime.onMessage`
- Display: connection status (green/red dot), active tab title+URL, last tool call name + pass/fail
- Update on each tool execution
**sidebar.css**: Clean minimal styles, dark theme, monospace for tool names
**manifest.json update**: Add `"side_panel": {"default_path": "sidebar/index.html"}`

### Step 8: Manifest Updates
**Files:** `src/extension/manifest.json`

- Add `"sidePanel"` permission
- Add `"side_panel"` config pointing to sidebar/index.html
- Ensure content script runs in all frames (`"all_frames": true`) for iframe support

### Step 9: MCP Tool Registrations
**Files:** `src/host/mcp-server.ts` (extend)

Register 4 new tools:
- `select_option`: `{role: string, name: string, value: string}`
- `hover`: `{role: string, name: string}`
- `list_tabs`: `{}`
- `switch_tab`: `{id: number}`

### Step 10: README Documentation
**Files:** `README.md`

Sections:
- What it does (1 paragraph)
- Architecture diagram (ASCII)
- Prerequisites (Chrome 120+, Node.js 18+)
- Installation steps (npm install, build, load extension, run install script)
- MCP config for Claude Desktop and Claude Code
- Tool reference (table of all tools with args)
- Troubleshooting (common issues: binary mode, extension ID, yellow bar)
- Limitations (cross-origin iframes, closed shadow DOM, yellow debugger bar)

## Todo

- [ ] Shadow DOM deep traversal in content script
- [ ] Same-origin iframe support
- [ ] SPA navigation detection (history.pushState monkey-patch)
- [ ] select_option tool (native + custom dropdown)
- [ ] hover tool
- [ ] list_tabs / switch_tab tools
- [ ] Sidebar panel (HTML + JS + CSS)
- [ ] Manifest updates (sidePanel, all_frames)
- [ ] MCP tool registrations (4 tools)
- [ ] README with setup guide
- [ ] End-to-end test: multi-tab login flow with shadow DOM components

## Success Criteria

- `click("button", "Submit")` works inside open shadow DOM
- ARIA resolution finds elements in same-origin iframes
- `get_url()` returns correct URL after SPA navigation (no page reload)
- `select_option("combobox", "Country", "Vietnam")` selects correct option
- `hover("link", "Menu")` triggers hover dropdown
- `list_tabs()` returns all open tabs with correct metadata
- `switch_tab(id)` activates target tab
- Sidebar shows green status when connected, updates on each tool call
- README enables new user to set up in < 5 minutes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shadow DOM traversal slow on complex pages | Medium | Low | Limit depth; cache results; lazy traversal |
| history.pushState monkey-patch conflicts with app code | Low | Medium | Wrap carefully; don't break original function |
| Custom dropdown detection unreliable | High | Medium | Start with native `<select>` only; add heuristics incrementally |
| chrome.sidePanel API not available in older Chrome | Low | Low | Fallback to browser action popup |
| Cross-origin iframe requests fail silently | Medium | Low | Document limitation clearly; suggest workarounds |

## Security Considerations

- Shadow DOM traversal: only open shadow roots (closed roots are private by design)
- Iframe access: same-origin only (browser enforces; we don't bypass)
- SPA monkey-patching: minimal surface, doesn't modify page behavior
- Sidebar: display-only, no user input, no data exfiltration
- list_tabs exposes all open tab URLs — acceptable since MCP runs locally with user consent

## Next Steps

After Phase 4 (v1.0 complete):
- Publish to Chrome Web Store (optional)
- Consider cross-origin iframe support via CDP target attachment
- Consider `scroll(direction, amount)` tool
- Consider `drag_and_drop(from, to)` tool
- Consider parallel test execution across multiple tabs

## Unresolved Questions

1. Should `list_tabs` filter out chrome:// and extension pages? Decision: yes, filter to http/https tabs only — extension/settings tabs aren't QA targets.
2. Should sidebar use chrome.sidePanel API or popup? Decision: sidePanel if Chrome 114+, else skip sidebar entirely (it's optional UX).
3. How to handle closed shadow DOM? Decision: document as limitation. Closed shadow roots are intentionally private; respecting that boundary is correct.
4. Should hover trigger `:hover` CSS pseudo-class? JS events alone don't trigger CSS `:hover`. May need CDP `Input.dispatchMouseEvent` for true hover. Investigate during implementation.

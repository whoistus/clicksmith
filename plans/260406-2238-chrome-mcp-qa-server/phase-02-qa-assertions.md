# Phase 2: QA Assertion Layer

## Context

- [Phase 1: Foundation](./phase-01-foundation.md) (prerequisite)
- [CDP/ARIA Research](../reports/researcher-260406-2241-cdp-accessibility-aria.md)
- [Plan Overview](./plan.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-04-06 |
| Priority | P1 |
| Effort | 1 week |
| Status | pending |
| Description | Add assertion tools, wait utilities, network/console capture, and observation tools |

## Key Insights

1. Assertions must be deterministic — return pass/fail with clear error messages, never ambiguous
2. Network capture requires CDP `Network.enable` + tracking request lifecycle (requestWillBeSent -> responseReceived -> loadingFinished)
3. Must call `Network.getResponseBody` only after `loadingFinished` event (else "No resource" error)
4. Console capture via CDP `Runtime.consoleAPICalled` — provides level, args, stackTrace
5. Wait utilities need polling with timeout — check condition every 100-200ms
6. Network log should be ring buffer (last N entries) to avoid unbounded memory

## Requirements

### Assertion Tools (6 tools)
- `assert_visible(role, name)` — pass if element exists and is visible
- `assert_text(role, name, expected)` — pass if element text matches (substring or exact)
- `assert_url(pattern)` — pass if current URL matches regex
- `assert_network(url_pattern, status)` — pass if matching request found with expected status
- `assert_count(role, name, count)` — pass if element count matches

### Wait Tools (2 tools)
- `wait_for(role, name, timeout?)` — poll until element appears (default 5s timeout)
- `wait_for_network(url_pattern, timeout?)` — wait for matching network request

### Observation Tools (4 tools)
- `get_text(role, name)` — return element's text content
- `get_url()` — return current page URL
- `get_network_log(filter?)` — return recent XHR/fetch entries
- `get_console_log(level?)` — return recent console messages

## Architecture

### Network Capture Flow
```
background.js
  |-- chrome.debugger.sendCommand("Network.enable")
  |-- chrome.debugger.onEvent listener:
  |     Network.requestWillBeSent -> store in requestMap
  |     Network.responseReceived  -> update entry with status/headers
  |     Network.loadingFinished   -> mark complete, optionally fetch body
  |-- Ring buffer: keep last 100 entries, evict oldest
```

### Console Capture Flow
```
background.js
  |-- chrome.debugger.sendCommand("Runtime.enable")
  |-- chrome.debugger.onEvent listener:
  |     Runtime.consoleAPICalled -> store {level, text, timestamp}
  |-- Ring buffer: keep last 200 entries
```

### Assertion Execution
All assertions execute in content script (DOM queries) or background (network/URL checks). Return structured result:
```json
{"pass": true, "message": "Element button 'Submit' is visible"}
{"pass": false, "message": "Expected URL to match /dashboard/ but got /login"}
```

### Key Files

| File | Purpose |
|------|---------|
| `src/host/mcp-server.ts` | Add 12 new tool definitions |
| `src/extension/background.js` | Add network/console capture, URL assertions |
| `src/extension/content.js` | Add assertion handlers, wait polling, get_text |
| `src/shared/protocol.ts` | Add message types for new tools |
| `src/extension/network-capture.js` | Network event tracking + ring buffer |
| `src/extension/console-capture.js` | Console event tracking + ring buffer |

## Implementation Steps

### Step 1: Network Capture Module
**Files:** `src/extension/network-capture.js`

- Class `NetworkCapture` with ring buffer (max 100 entries)
- `start(tabId)`: enable CDP Network domain, register event listeners
- `onRequestWillBeSent`: store `{requestId, url, method, timestamp}`
- `onResponseReceived`: update entry with `{status, statusText, headers, mimeType}`
- `onLoadingFinished`: mark entry complete
- `getLog(filter?)`: return entries, optionally filtered by URL pattern
- `findMatch(urlPattern, status?)`: find entry matching pattern + optional status
- Export singleton per tab

### Step 2: Console Capture Module
**Files:** `src/extension/console-capture.js`

- Class `ConsoleCapture` with ring buffer (max 200 entries)
- `start(tabId)`: enable CDP Runtime domain, register event listeners
- `onConsoleAPICalled`: store `{level, text, timestamp}` where text = args joined
- `getLog(level?)`: return entries, optionally filtered by level (log/warn/error/info)
- Export singleton per tab

### Step 3: Assertion Handlers in Content Script
**Files:** `src/extension/content.js` (extend)

- `assertVisible(role, name)`: find element -> check `offsetParent !== null` && `getComputedStyle(el).visibility !== 'hidden'` && `getComputedStyle(el).display !== 'none'`
- `assertText(role, name, expected)`: find element -> compare textContent.trim() with expected (substring match)
- `assertCount(role, name, count)`: find all matching elements -> compare length
- `getText(role, name)`: find element -> return textContent.trim()
- All return `{pass, message}` or `{text}` as appropriate

### Step 4: Background Assertion Handlers
**Files:** `src/extension/background.js` (extend)

- `assertUrl(pattern)`: `chrome.tabs.get(tabId)` -> test URL against regex
- `assertNetwork(urlPattern, status)`: query NetworkCapture.findMatch()
- `getUrl()`: return `tab.url`
- `getNetworkLog(filter)`: return NetworkCapture.getLog(filter)
- `getConsoleLog(level)`: return ConsoleCapture.getLog(level)

### Step 5: Wait Utilities
**Files:** `src/extension/content.js` (extend)

- `waitFor(role, name, timeout=5000)`: poll every 200ms, resolve when element found, reject on timeout
- Background handler for `waitForNetwork(urlPattern, timeout=5000)`: poll NetworkCapture every 200ms

### Step 6: MCP Tool Registrations
**Files:** `src/host/mcp-server.ts` (extend)

Register 12 new tools with schemas:
- `assert_visible`: `{role: string, name: string}` -> `{pass: bool, message: string}`
- `assert_text`: `{role: string, name: string, expected: string}` -> `{pass: bool, message: string}`
- `assert_url`: `{pattern: string}` -> `{pass: bool, message: string}`
- `assert_network`: `{url_pattern: string, status?: number}` -> `{pass: bool, message: string}`
- `assert_count`: `{role: string, name: string, count: number}` -> `{pass: bool, message: string}`
- `wait_for`: `{role: string, name: string, timeout?: number}` -> `{found: bool}`
- `wait_for_network`: `{url_pattern: string, timeout?: number}` -> `{found: bool, entry?: object}`
- `get_text`: `{role: string, name: string}` -> `{text: string}`
- `get_url`: `{}` -> `{url: string}`
- `get_network_log`: `{filter?: string}` -> `{entries: array}`
- `get_console_log`: `{level?: string}` -> `{entries: array}`

### Step 7: Protocol Types Update
**Files:** `src/shared/protocol.ts` (extend)

Add message types: `ASSERT_VISIBLE`, `ASSERT_TEXT`, `ASSERT_URL`, `ASSERT_NETWORK`, `ASSERT_COUNT`, `WAIT_FOR`, `WAIT_FOR_NETWORK`, `GET_TEXT`, `GET_URL`, `GET_NETWORK_LOG`, `GET_CONSOLE_LOG`

## Todo

- [ ] Network capture module (CDP Network domain + ring buffer)
- [ ] Console capture module (CDP Runtime domain + ring buffer)
- [ ] Content script assertion handlers (visible, text, count)
- [ ] Background assertion handlers (url, network)
- [ ] Wait utilities (wait_for, wait_for_network)
- [ ] get_text, get_url observation tools
- [ ] get_network_log, get_console_log observation tools
- [ ] MCP tool registrations (12 tools)
- [ ] Protocol type updates
- [ ] Integration test: navigate -> click -> assert_text -> assert_url flow

## Success Criteria

- `assert_visible("button", "Submit")` returns `{pass: true}` when button exists and visible
- `assert_text("heading", "Dashboard", "Dashboard")` passes on correct page
- `assert_url("/dashboard")` passes after navigation
- `assert_network("/api/users", 200)` passes after API call
- `wait_for("button", "Load More", 3000)` resolves when button appears dynamically
- `get_network_log("/api/")` returns recent API calls with status codes
- `get_console_log("error")` returns only error-level console messages

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Network capture misses requests started before enable | Medium | Low | Document: enable capture early; re-navigate if needed |
| Ring buffer evicts needed entries | Low | Medium | Make buffer size configurable; default 100 is generous |
| Wait polling drains CPU | Low | Low | 200ms interval is light; timeout prevents infinite loops |
| Large response bodies in network log | Medium | High | Don't capture bodies by default; optional flag if needed |

## Security Considerations

- Network log may contain sensitive data (auth tokens in headers, PII in bodies)
- Default: capture URL + method + status only, not headers/bodies
- Console log may contain user data — same ring buffer eviction applies
- All data stays local (MCP stdio transport, no network transmission)

## Next Steps

After Phase 2:
- Phase 3 adds session recording (tool call transcript) and test generation prompts
- Network/console capture from this phase feeds into session transcripts

## Unresolved Questions

1. Should `assert_text` use exact match or substring? Decision: substring by default, add `exact: true` option later if needed.
2. Should network capture store response bodies? Decision: no by default — bodies can be huge and contain sensitive data. Add `get_response_body(requestId)` tool later if needed.
3. Should assertions throw (error response) or return `{pass: false}`? Decision: return structured result. Claude can interpret pass/fail and decide next action.

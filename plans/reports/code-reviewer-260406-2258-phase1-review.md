# Code Review — Phase 1: Chrome Like a Human

**Score: 8.5/10**

## Scope
- Files reviewed: 10 source + 2 test files
- LOC: ~900 (source), ~210 (tests)
- Build: passing (tsc clean). Tests: 14/14 passing.

---

## Overall Assessment
Solid Phase 1. Clean architecture, correct 3-tier design (MCP stdio ↔ WebSocket ↔ Extension ↔ CDP/DOM). Code is readable, well-commented, and DRY. A few meaningful security/robustness gaps below.

---

## Critical Issues

None blocking. One high-severity security concern:

---

## High Priority

**H1. No WebSocket origin/auth validation (security)**
`native-messaging-bridge.ts:33` binds to `127.0.0.1` only — good. But any local process can connect, including malicious ones. With `debugger` permission (full CDP), a rogue WS client could exfiltrate cookies, run arbitrary JS, screenshot passwords.
- Add a shared secret: MCP server generates a random token on startup, passes it to extension via a known mechanism (e.g. extension manifest `externally_connectable` or URL param on connect), and bridge rejects connections without valid `Authorization` header.
- Minimal fix: validate first message contains a pre-shared token, close socket otherwise.

**H2. `findByRoleAndName` runs duplicate full DOM scan (`content.js:110-133`)**
Iterates `document.querySelectorAll('*')` twice. For large pages (1000+ nodes) the second "exact match fallback" pass is unreachable in practice because `includes` always finds it first. Remove the second loop or restructure: collect all candidates once, prefer exact match, fall back to includes.

**H3. Navigate listener leak on concurrent calls (`background.js:132-153`)**
If two `navigate` commands arrive concurrently, both register `onUpdated` listeners. First completion resolves both and removes only one listener; second listener leaks. Fix: include the listener ref in the closure and always `removeListener` in timeout handler too (timeout path already does this, but a second concurrent call adds another listener against the same `tabId`).

---

## Medium Priority

**M1. Dead code: `originalOnMessage = null` (`background.js:56`)**
`const originalOnMessage = null` is never used. Looks like an abandoned refactor comment. Remove.

**M2. `handleMessage` in `background.js` doesn't validate `msg.id` is present**
If malformed JSON arrives without `id`, `sendResponse({type:'error', id: undefined, ...})` is sent back. The host-side `pendingRequests.get(undefined)` returns nothing — the caller silently timeouts rather than getting a fast error. Add: `if (!msg?.id || !msg?.type) throw new Error('Malformed message')`.

**M3. `callExtension` silently drops message if extension not connected (`mcp-server.ts:165`, `bridge.ts:90-94`)**
`sendToExtension` returns void and logs to stderr but the Promise in `callExtension` just hangs until timeout (10s). Caller gets a slow timeout instead of a fast "extension not connected" error. Fix: `sendToExtension` should throw/return boolean; `callExtension` should check `isExtensionConnected()` before queuing.

**M4. `handlePressKey` `code` generation is wrong for special keys (`content.js:179`)**
`code: \`Key${...}\`` produces `KeyEnter`, `KeyEscape`, `KeyTab` — all invalid. `code` should be omitted or use a proper mapping (`Enter` → `Enter`, `Escape` → `Escape`, `Tab` → `Tab`, `ArrowDown` → `ArrowDown`). For most sites it doesn't matter (they read `key` not `code`), but could fail strict listeners.

**M5. Port collision not handled gracefully**
If port 9222 (Chrome DevTools default) is taken, `startBridge` rejects and the server exits. Consider defaulting to a non-conflicting port (e.g. 9229 is Node debugger, 9333 is safer) or document the conflict risk prominently.

**M6. `install.js` produces duplicate config objects (YAGNI/DRY)**
`config` and `claudeCodeConfig` are identical objects. One is enough.

---

## Low Priority

**L1. `NATIVE_HOST_NAME` + `MAX_MESSAGE_SIZE` in `protocol.ts` unused in the codebase**
The project uses WebSocket, not native messaging. These constants are dead. Either remove (YAGNI) or add a comment explaining they're retained for future native-messaging path.

**L2. `tsconfig.json` `rootDir: "src"` but only `host/**` and `shared/**` are included**
`rootDir` is broader than `include`. This means if someone accidentally adds a file elsewhere under `src/`, tsc emits it. Tighten: `rootDir` not needed when `include` is already scoped, or set `rootDir: "src"` explicitly with awareness.

**L3. `handleScreenshot` doesn't specify `windowId`**
`chrome.tabs.captureVisibleTab()` with no `windowId` uses the current window — fine for typical use, but could grab wrong window if Chrome has multiple windows. Low risk for QA use case.

**L4. Test isolation: bridge tests use module-level singleton state**
Each test calls `import('./native-messaging-bridge.js')` but ESM caches the module — all tests share the same module-level `wss`/`activeSocket`/etc. Tests work because ports differ, but `stopBridge` called in one test clears state shared by all. Using different ports mitigates this, but a `vi.resetModules()` before each test would make isolation explicit.

---

## Positive Observations
- `127.0.0.1` binding (not `0.0.0.0`) is correct security default.
- `debugger` + `activeTab` + `tabs` only — minimal permissions.
- MV3 SW keepalive with 25s ping is well-reasoned.
- `getAccessibleName` implements the ARIA spec priority order correctly.
- `formatAccessibilityTree` truncates at 800KB — good defensive practice.
- All logging goes to `stderr`; `stdout` reserved for MCP protocol — correct.
- TypeScript strict mode enabled throughout.
- `callExtension` uses timeout + cleanup to prevent pending-map leaks.

---

## Recommended Actions (prioritized)
1. **Add WS shared-secret auth** (H1) — critical for any real deployment.
2. **Fast-fail when extension disconnected** (M3) — better UX than 10s timeout.
3. **Remove dead `originalOnMessage` + duplicate install config** (M1, M6).
4. **Fix `code` field in `handlePressKey`** (M4) — or just omit it.
5. **Deduplicate `findByRoleAndName` DOM scan** (H2).
6. **Validate `msg.id` in background message handler** (M2).
7. **Evaluate removing `NATIVE_HOST_NAME`/`MAX_MESSAGE_SIZE`** (L1) if native messaging is out of scope for Phase 1.

---

## Metrics
- Type Coverage: ~100% (strict mode, tsc clean)
- Test Coverage: 14/14 (bridge + protocol); no tests for mcp-server tool routing or content.js DOM actions
- Linting Issues: 0 compiler errors; dead code at `background.js:56`
- Build: clean

---

## Unresolved Questions
- Is native messaging (`NATIVE_HOST_NAME`, `MAX_MESSAGE_SIZE`) planned for a future phase, or definitively replaced by WebSocket?
- Port 9222 conflicts with Chrome's own remote debugging port — intentional choice or oversight?
- Does the QA use-case require multi-tab support? Current `getActiveTabId()` always operates on the active tab.

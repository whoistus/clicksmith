# Code Review: Phase 2 — QA Assertions

**Score: 8.5 / 10**

## Scope
- Files: 10 (7 source + 3 tests)
- Tests: 35/35 passing — verified
- Typecheck: 0 errors — verified

## Overall Assessment
Solid, focused implementation. Architecture is clean: capture concerns isolated into dedicated modules, message routing is a flat switch (O(1)), assertions follow a consistent `{pass, message}` contract. No serious issues; findings below are mostly medium/low.

---

## Critical Issues
None.

---

## High Priority

### H1 — ReDoS via user-controlled regex (security)
**Files:** `network-capture.js` (`getLog`, `findMatch`), `background.js` (`handleAssertUrl`), `content.js` (`handleAssertUrl` via background)

User-supplied `filter`, `url_pattern`, and `pattern` are passed directly into `new RegExp(input)`. While the catch-to-substring fallback prevents crashes, it does **not** prevent catastrophic backtracking. A malicious or buggy AI-generated pattern like `(a+)+$` against a long URL string can lock the JS thread.

**Fix:** add a simple regex complexity guard or use a safe substring-only path (YAGNI applies here — regex flexibility isn't strictly needed for most use cases).

```js
// Minimal guard: reject patterns with nested quantifiers
function safeRegex(pattern) {
  if (/(\+|\*|\{).*(\+|\*|\{)/.test(pattern)) return null; // too complex
  try { return new RegExp(pattern); } catch { return null; }
}
```

---

## Medium Priority

### M1 — Ring buffer uses `Array.shift()` (O(n) eviction)
**Files:** `network-capture.js` L98-100, `console-capture.js` L59-60

`shift()` on a 100/200-element array is negligible in practice, but contradicts "ring buffer" semantics. At high request rates (SPA with polling) this will thrash GC.

**Fix:** use a circular index or a `push`/`slice(-N)` pattern:
```js
_push(entry) {
  if (this._entries.length >= MAX_ENTRIES) this._entries.shift();
  this._entries.push(entry);
}
```
The current code is already equivalent, but inverting the condition avoids the length > N branch on each write (the common path should be N-1 entries, not N+1).

### M2 — `handleAssertText` uses `el.textContent` not `getAccessibleName`
**File:** `content.js` L249

`findByRoleAndName` locates the element by accessible name, then `handleAssertText` reads `el.textContent.trim()`. For a `<button aria-label="Send">Submit</button>`, `textContent` is `"Submit"` but the accessible name used to find it is `"Send"`. Inconsistent — user expecting to assert on the visible text while addressing by label will hit this.

**Fix:** document the behavior explicitly, or expose a `mode: 'text'|'name'` parameter.

### M3 — `findAllByRoleAndName` does not filter by visibility
**File:** `content.js` L216-227

`assert_count` counts all matching elements regardless of visibility, while `assert_visible` checks visibility. A hidden duplicate element inflates count. Inconsistency can cause flaky assertions.

**Fix:** add an optional `visibleOnly` flag or align count to match only visible elements by default.

### M4 — `ensureCaptureStarted` called on every assertion
**File:** `background.js` L330-334, called from `handleAssertNetwork`, `handleWaitForNetwork`, `handleGetNetworkLog`, `handleGetConsoleLog`

`ensureDebuggerAttached` guards against double-attach, but `networkCapture.start` and `consoleCapture.start` each call `Network.enable` / `Runtime.enable` via CDP even when already started (the `_listening && _tabId === tabId` guard only prevents the CDP call if same tab). If the tab changes (user navigates manually), `_listening` stays `true` for old `_tabId` — capture silently stops working for the new tab.

**Fix:** reset `_listening` in `stop()` is correct, but `ensureCaptureStarted` should call `networkCapture.stop()` + restart when tab changes. Or simply track the current active tab and always compare.

### M5 — `background.js` comment still says "6 core tools"
**File:** `mcp-server.ts` L6 — "Registers 6 core tools" (stale comment, now 17 tools)

---

## Low Priority

### L1 — `importScripts` in MV3 service worker is deprecated path
**File:** `background.js` L11

MV3 service workers don't support `importScripts` reliably in all Chromium versions (it works but is legacy). Preferred approach is ES module bundling (`"type": "module"` in manifest). Not breaking, but worth tracking.

### L2 — `_pending` map in `NetworkCapture` can grow unbounded
**File:** `network-capture.js` L11

Requests that never receive `loadingFinished` or `loadingFailed` (e.g. WebSocket upgrades, cancelled requests) accumulate in `_pending` forever. At 100+ long-lived connections this becomes a slow leak.

**Fix:** evict `_pending` entries older than e.g. 30s in `_push` or on a periodic cleanup.

### L3 — `const obj = 'object' as const` micro-DRY violation
**File:** `tool-definitions.ts` L7

Saving 4 characters of `'object'` via a local alias is not worth the cognitive overhead. Just inline `'object'` in each schema — it's already repeated 17 times.

### L4 — `WaitForNetworkRequest` missing from `ExtensionRequest` union
**File:** `protocol.ts` L154-171

`WaitForNetworkRequest`, `GetUrlRequest`, and `GetConsoleLogRequest` are missing from the `ExtensionRequest` union type. The code works at runtime (JS doesn't enforce the union), but TypeScript callers constructing these request types won't get union-narrowing benefits and `callExtension` will silently accept them untyped.

**Fix:** add the three missing types to the union on L154-171.

---

## Positive Observations
- Auth token generation (64-char hex), close-code 4003/4001 contract, and auth timeout are all well-implemented in the bridge.
- ARIA resolution (labelledby → aria-label → label[for] → wrapping label → placeholder) is thorough.
- Capture modules are correctly decoupled from background routing.
- `handleNavigate` cleanup pattern (settled flag + explicit listener removal) prevents listener leak.
- 800KB snapshot truncation guard is a practical safety net.
- Test coverage is meaningful — not just smoke tests, includes wrong-token rejection and auth timeout.

---

## Recommended Actions
1. **[H1]** Add regex complexity guard in `getLog`/`findMatch`/`handleAssertUrl` before `new RegExp(input)`.
2. **[M4]** Fix tab-change case in `ensureCaptureStarted` — detect tab switch, restart capture.
3. **[L4]** Add `WaitForNetworkRequest | GetUrlRequest | GetConsoleLogRequest` to `ExtensionRequest` union in `protocol.ts`.
4. **[M3]** Align `assert_count` to count only visible elements (or document the difference).
5. **[M5]** Fix stale "6 core tools" comment in `mcp-server.ts`.
6. **[L2]** Add `_pending` TTL cleanup in `NetworkCapture`.

---

## Metrics
- Type errors: 0
- Test pass rate: 35/35 (100%)
- Linting issues: not configured (no eslint/biome found)
- Missing union members: 3 (`WaitForNetworkRequest`, `GetUrlRequest`, `GetConsoleLogRequest`)

---

## Unresolved Questions
- Is ReDoS a realistic threat here (local-only tool vs. MCP agents that generate patterns)? If agents supply patterns, H1 becomes more critical.
- Should `assert_count` count all or only visible matches? No spec found — needs product decision.

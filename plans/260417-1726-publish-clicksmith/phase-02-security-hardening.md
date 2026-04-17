# Phase 2: Security Hardening

**Effort:** 0.5 day
**Goal:** Before strangers install this and hand it their browser session, make sure it's not a loaded gun.

## Threat model

**Asset being protected:** the user's Chrome session (cookies, logged-in state, any tab they have open).
**Attacker:** malicious actor on same machine or network who wants to MITM the MCP ↔ extension channel.
**Trust boundary:** localhost 9333. If an attacker has code running on localhost, they can impersonate the extension or server.

## Current state

- ✅ WebSocket binds to `127.0.0.1` only (not `0.0.0.0`) — good
- ⚠️ Auth token bypass with `__skip__` still enabled in `background.js:40` — MUST disable before launch
- ⚠️ No rate limiting on tool calls
- ⚠️ `save_file` tool can write anywhere path resolves to — path traversal risk
- ⚠️ `navigate` accepts any URL including `file://` and `chrome://` — potential escape
- ⚠️ No origin check on WebSocket handshake

## Checklist

### Auth (DONE — Origin-header model)
- [x] Drop token auth entirely; server validates WebSocket Origin header (`chrome-extension://…`)
- [x] Origin set by Chrome, not forgeable by page JS — blocks the real threat
- [x] Remove `__skip__` bypass from background.js
- [x] Optional `CLICKSMITH_EXTENSION_ID` env var to lock to a specific extension id
- [x] No more token rotation, no `--token` flag, no auth-token.txt on disk

### Input validation
- [ ] `navigate`: reject `file://`, `chrome://`, `chrome-extension://` schemes unless explicit flag
- [ ] `save_file`: resolve path, reject if outside project root or absolute paths outside CWD
- [ ] All regex patterns (URL matching, assertions): length-cap + try/catch with substring fallback (already done in some places, audit all)

### WebSocket hardening
- [ ] Close connection on any auth failure immediately (already does, verify)
- [ ] Optional: check `Origin` header on WS handshake to reject non-extension clients
- [ ] Drop messages larger than N bytes (DoS prevention)

### Extension permissions audit
- [ ] `host_permissions: "<all_urls>"` is broad — justified for QA tool. Document in README.
- [ ] `debugger` permission — document user-visible "being controlled" warning in README
- [ ] `storage` — only used for auth token, confirm no PII stored

### Dependency audit
- [ ] `npm audit` — fix any high/critical
- [ ] Pin dependency versions in package.json (exact versions, not ranges)
- [ ] Add `package-lock.json` to repo (already present)

### Disclosure & ongoing
- [ ] Enable GitHub security advisories
- [ ] Document responsible disclosure email in `SECURITY.md`
- [ ] Add CodeQL GitHub Action for automated scanning

## Must-fix before launch

1. **Re-enable auth token flow** (currently `__skip__` is hardcoded for dev convenience)
2. **Path traversal guard on `save_file`**
3. **Navigate scheme allowlist**

## Nice-to-have (post-launch)

- CSP on extension pages (not blocking, small UI)
- Encrypt auth token at rest (Chrome already encrypts chrome.storage.local on most platforms)
- Per-tool permission prompts (UI for "Claude wants to click Sign In, allow?") — big feature, defer

## Unresolved

- Should we ship with auth disabled for first run + onboarding asks user to enable? More friction but more secure default. Or auth always-on + install script sets token automatically? Recommend latter — installer handles complexity, users never see token unless they want to rotate.

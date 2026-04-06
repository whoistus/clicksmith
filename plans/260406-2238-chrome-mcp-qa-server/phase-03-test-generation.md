# Phase 3: Test Generation

## Context

- [Phase 1: Foundation](./phase-01-foundation.md) (prerequisite)
- [Phase 2: QA Assertions](./phase-02-qa-assertions.md) (prerequisite)
- [Plan Overview](./plan.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-04-06 |
| Priority | P2 |
| Effort | 1 week |
| Status | pending |
| Description | MCP prompts for test generation, session transcript recording, and file export |

## Key Insights

1. MCP prompts are templates Claude uses to generate output — not tools. Defined via `server.setRequestHandler(ListPromptsRequestSchema, ...)`
2. Session recording captures every tool call + result as structured JSON — this becomes the source for test generation
3. Generated tests should target Playwright format (.spec.ts) since it's the de facto standard
4. Claude already knows Playwright API — prompt just needs to provide the session transcript and mapping rules
5. File write needs a dedicated MCP tool since Claude can't write files through the extension
6. Gap analysis prompt analyzes existing test files and suggests untested user journeys

## Requirements

### Session Recording
- Record every MCP tool call (name, args, result, timestamp) during a session
- Export as structured JSON transcript
- Include page URLs at each step for context

### MCP Prompts (2 prompts)
- `generate_test` — given session transcript JSON, produce Playwright .spec.ts
- `analyze_gaps` — given test file paths and app URL, suggest untested scenarios

### File Export (1 tool)
- `save_file(path, content)` — write generated test to user's filesystem

## Architecture

### Session Recording Flow
```
mcp-server.ts (CallTool handler)
  |-- Before dispatch: log {tool, args, timestamp}
  |-- After response: log {result, duration}
  |-- Store in session transcript array
  |-- Tool: get_session() returns transcript JSON
```

### Prompt Flow
```
Claude calls ListPrompts -> sees generate_test, analyze_gaps
Claude calls GetPrompt("generate_test") -> receives template with session data
Claude generates .spec.ts content
Claude calls save_file(path, content) -> host writes to disk
```

### Key Files

| File | Purpose |
|------|---------|
| `src/host/mcp-server.ts` | Add prompt handlers, save_file tool, session recording |
| `src/host/session-recorder.ts` | Session transcript capture + export |
| `prompts/generate-test.md` | Template for Playwright test generation |
| `prompts/analyze-gaps.md` | Template for test gap analysis |

## Implementation Steps

### Step 1: Session Recorder
**Files:** `src/host/session-recorder.ts`

- Class `SessionRecorder`
- `recordCall(tool, args)`: push `{tool, args, timestamp}` to transcript array
- `recordResult(result, duration)`: update last entry with result and duration
- `getTranscript()`: return full transcript as JSON
- `clear()`: reset transcript for new session
- Include `currentUrl` field updated on every navigate call
- Timestamp as ISO 8601

### Step 2: Wire Recording into MCP Server
**Files:** `src/host/mcp-server.ts` (extend)

- Import SessionRecorder, create instance
- In CallTool handler: `recorder.recordCall(name, args)` before dispatch
- After response: `recorder.recordResult(result, Date.now() - start)`
- Add tool `get_session()` -> returns recorder.getTranscript()
- Add tool `clear_session()` -> clears recorder

### Step 3: Generate Test Prompt
**Files:** `prompts/generate-test.md`, `src/host/mcp-server.ts`

Prompt template (`generate-test.md`):
```
Given the following QA session transcript, generate a Playwright test file (.spec.ts).

Rules:
- Use page.getByRole() locators (ARIA-first, matching our tool calls)
- Map click(role, name) -> page.getByRole(role, {name}).click()
- Map type(role, name, text) -> page.getByRole(role, {name}).fill(text)
- Map assert_visible -> expect(page.getByRole(role, {name})).toBeVisible()
- Map assert_text -> expect(page.getByRole(role, {name})).toContainText(expected)
- Map assert_url -> expect(page).toHaveURL(pattern)
- Map navigate(url) -> page.goto(url)
- Group related steps into test.step() blocks
- Add descriptive test name based on user journey

Session transcript:
{{session_json}}
```

Register as MCP prompt:
```typescript
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{
    name: "generate_test",
    description: "Generate Playwright .spec.ts from QA session transcript",
    arguments: [{ name: "session_json", required: false }]
  }]
}));
```

If `session_json` arg not provided, auto-inject current session transcript.

### Step 4: Analyze Gaps Prompt
**Files:** `prompts/analyze-gaps.md`, `src/host/mcp-server.ts`

Prompt template:
```
Analyze the following test coverage and suggest untested user journeys.

Consider:
- Happy path vs error path coverage
- Edge cases (empty states, long inputs, concurrent actions)
- Accessibility scenarios (keyboard navigation, screen reader flow)
- Network failure scenarios
- Authentication edge cases (expired session, wrong credentials)

Current tests:
{{test_files}}

App URL: {{app_url}}
```

Register as MCP prompt with `test_files` and `app_url` arguments.

### Step 5: Save File Tool
**Files:** `src/host/mcp-server.ts` (extend)

- Tool `save_file(path, content)`:
  - Validate path is within user's project directory (prevent path traversal)
  - Create parent directories if needed (`fs.mkdirSync(dir, {recursive: true})`)
  - Write content to file (`fs.writeFileSync`)
  - Return `{success: true, path: absolutePath}`
- Security: reject paths containing `..`, absolute paths outside CWD

### Step 6: Protocol Types Update
**Files:** `src/shared/protocol.ts` (extend)

Add message types: `GET_SESSION`, `CLEAR_SESSION` (handled in host, no extension message needed for these)

## Todo

- [ ] Session recorder class
- [ ] Wire recording into CallTool handler
- [ ] get_session / clear_session tools
- [ ] generate_test MCP prompt with Playwright mapping rules
- [ ] analyze_gaps MCP prompt
- [ ] save_file tool with path validation
- [ ] Test: run QA session -> get_session -> generate_test -> save_file -> verify .spec.ts is valid

## Success Criteria

- After a 5-step QA session, `get_session()` returns valid JSON transcript with all 5 steps
- `generate_test` prompt produces compilable Playwright .spec.ts
- Generated test uses `getByRole` locators (not CSS selectors)
- `save_file("tests/login.spec.ts", content)` writes file to disk
- `analyze_gaps` prompt identifies at least 3 untested scenarios given a simple test suite

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Session transcript too large for context | Medium | Medium | Truncate old entries; summarize long results |
| Generated tests have syntax errors | Medium | Low | Claude validates; user runs `npx tsc --noEmit` |
| save_file path traversal attack | Low | High | Strict validation: reject `..`, require relative path within project |
| Playwright API mismatch (version drift) | Low | Low | Target Playwright 1.40+ API which is stable |

## Security Considerations

- `save_file` is the most sensitive tool — can write arbitrary content to filesystem
- Restrict to relative paths within CWD (or configurable project root)
- Reject paths containing `..` or starting with `/` or drive letter
- Log all file writes to stderr for audit trail
- Session transcripts may contain sensitive page data — stored in memory only, cleared on session reset

## Next Steps

After Phase 3:
- Phase 4 adds Shadow DOM, iframe support, SPA detection, multi-tab, and sidebar UI
- Consider: MCP resource for reading existing test files (enables analyze_gaps to see current coverage)

## Unresolved Questions

1. Should session recording be opt-in or always-on? Decision: always-on, minimal overhead (just array push). User calls `clear_session` to reset.
2. Should `save_file` be restricted to `.spec.ts` extensions? Decision: no, keep flexible — user may want to save `.test.ts`, `.json`, etc.
3. Should `generate_test` prompt include the full session or just the last N steps? Decision: full session by default; add `last_n` argument if context window becomes issue.

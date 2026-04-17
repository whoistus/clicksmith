---
title: "Smart select_option with fallback strategy"
description: "Add strategy param (exact/first/random/fuzzy) to select_option, fix custom dropdown timing, return available options on error"
status: done
priority: P1
effort: 2h
branch: master
tags: [select-option, ux, mcp-tool, chrome-extension]
created: 2026-04-15
---

# Smart `select_option` with Fallback Strategy

## Problem

`select_option` tool forces Claude into a 3-4 call dance (snapshot → read options → retry) because:

1. **Native `<select>` hard-fails** when option text doesn't match exactly (`content.js:366`)
2. **Custom dropdowns use fixed 300ms timeout** (`content.js:397`) — too short for animated frameworks
3. **No fallback** when value not found or not specified — just errors out

## Solution

Add optional `strategy` parameter + return available options on error. Reduces typical flow from 3-4 calls to 1.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Protocol & Schema | pending | 20m | [phase-01-protocol-schema.md](phase-01-protocol-schema.md) |
| 2 | Content Script Logic | pending | 1h | [phase-02-content-script-logic.md](phase-02-content-script-logic.md) |
| 3 | Tests | pending | 30m | [phase-03-tests.md](phase-03-tests.md) |

## Architecture

```
Claude calls select_option(role, name, value?, strategy?)
    ↓
mcp-server.ts passes strategy through to extension
    ↓
content.js handleSelectOption():
    ├── Native <select>: try exact → apply strategy fallback → return selected + available_options
    └── Custom dropdown: poll for options (50ms × 40 = 2s max) → apply strategy → return selected + available_options
```

## API Change

```
select_option(
  role: string,          // required
  name: string,          // required  
  value?: string,        // option to select (single)
  values?: string[],     // options to select (multi)
  strategy?: "exact" | "first" | "random" | "fuzzy"  // NEW — default "exact"
)
```

**Response on success:** `{ success: true, selectedValue: "..." }`
**Response on failure (via data path, NOT error path):** `{ success: false, error: "...", available_options: ["opt1", "opt2", ...] }` ← NEW

> **Eng Review Decision:** Error responses with `available_options` MUST use the data path (`resolve()`), not the error path (`reject()`). background.js drops non-string fields from error responses. See Issue 1A.

## Strategy Behavior

| Strategy | Value provided | Value NOT provided |
|----------|---------------|-------------------|
| `exact` (default) | Match exact or error + show options | Error: value required |
| `first` | Try exact first, fallback to first option | Select first option |
| `random` | Try exact first, fallback to random | Select random option |
| `fuzzy` | Partial/case-insensitive match, fallback to first | Select first option |

## Eng Review Decisions (2026-04-15)

1. **Error chain fix (1A):** `available_options` uses data path, not error path — background.js drops extra fields from reject()
2. **DOM polling (2A):** Ship simple setTimeout loop, no MutationObserver optimization
3. **No placeholder filtering (3A):** `collectNativeOptions` includes ALL options, no skipping
4. **Manual QA for applyStrategy (4A):** Keep in content.js, no extraction for unit testing

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — ready to implement.

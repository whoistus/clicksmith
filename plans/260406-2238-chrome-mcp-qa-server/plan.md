---
title: "Chrome MCP QA Server"
description: "Chrome extension MCP server enabling Claude to test web apps like a human in real Chrome browser"
status: in-progress
priority: P1
effort: 5w
branch: main
tags: [chrome-extension, mcp, qa, testing, cdp, aria]
created: 2026-04-06
---

# Chrome MCP QA Server

Chrome extension + native messaging host + MCP server that lets Claude drive the user's real Chrome browser for QA testing. ARIA-first element resolution, assertion primitives, network/console capture, and test generation.

## Architecture

```
Claude Code/Desktop (MCP client)
    | stdio (JSON-RPC)
Node.js MCP Server (@modelcontextprotocol/sdk + StdioServerTransport)
    | native messaging (4-byte length prefix + JSON)
Chrome Extension (Manifest V3 - chrome.debugger CDP)
    | Chrome APIs + CDP
Real Chrome tabs (real auth/cookies)
```

## Project Structure

```
src/extension/     - MV3 extension (background.js, content.js, sidebar/)
src/host/          - Native messaging host (bridge.js, mcp-server.js)
src/shared/        - Shared types/constants (protocol.js)
prompts/           - MCP prompt templates
scripts/           - Install & build scripts
```

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Foundation: Extension + Native Messaging + MCP + Core Tools | 2w | done | [phase-01](./phase-01-foundation.md) |
| 2 | QA Assertions + Network/Console Capture | 1w | done | [phase-02](./phase-02-qa-assertions.md) |
| 3 | Test Generation + Session Recording | 1w | pending | [phase-03](./phase-03-test-generation.md) |
| 4 | Polish: Shadow DOM, Iframes, SPA, Multi-Tab, Sidebar | 1w | pending | [phase-04](./phase-04-polish.md) |

## Key Decisions (Validated 2026-04-06)

- **WebSocket bridge (not native messaging)** — Claude owns stdio for MCP, extension connects via WS on localhost:9333 with shared-secret auth
- **CDP debugger always attached** - yellow bar accepted for QA use case; simplest, most capable
- **CDP getFullAXTree for snapshots** - matches browser's internal AX tree
- **DOM ARIA fallback for interactions** - covers 80% without debugger overhead
- **TypeScript throughout** - host + extension, build step via esbuild/rollup
- **Target audience: team** - needs setup docs, reasonable defaults, assumes technical users
- **Windows binary mode** - required to prevent `\n` -> `\r\n` corruption in framing
- **stderr-only logging** - stdout reserved for JSON-RPC protocol

## Research

- [Architecture Research](./research/researcher-01-chrome-mcp-architecture.md)
- [CDP/ARIA Research](../reports/researcher-260406-2241-cdp-accessibility-aria.md)
- [Brainstorm](../reports/brainstorm-260406-2238-chrome-mcp-qa-redesign.md)

## Success Criteria

- Tool call -> response latency < 500ms (interactions), < 2s (snapshots)
- Claude completes login + dashboard test with no human intervention
- Assertions are deterministic (0% false positives)
- Setup time < 5 minutes (install ext + configure MCP)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Chrome extension + MCP server that lets Claude test web apps in a real Chrome browser via ARIA-based element resolution. The extension connects to the MCP server over WebSocket (localhost:9333) with shared-secret auth.

## Architecture

```
Claude (MCP client) --stdio--> Node.js MCP Server --WebSocket--> Chrome Extension (MV3) --CDP/DOM--> Chrome tabs
```

Three source layers in `src/`:
- **`shared/`** — Protocol types (`MessageType` enum, request/response interfaces) shared by host and extension
- **`host/`** — Node.js MCP server: `mcp-server.ts` (tool registration + routing), `native-messaging-bridge.ts` (WebSocket server + auth), `host-tools.ts` (save_file, session recorder), `session-recorder.ts`, `tool-definitions.ts` (tool schemas)
- **`extension/`** — Chrome MV3 extension (plain JS): `background.js` (WS client + CDP dispatch), `content.js` (DOM queries), `network-capture.js`, `console-capture.js`

Build output: `dist/host/` (compiled TS) and `dist/extension/` (copied JS + manifest).

## Commands

```bash
npm run build          # Compile TS + copy extension files to dist/
npm run build:host     # TypeScript only (no extension copy)
npm test               # vitest run
npm run test:watch     # vitest watch mode
node scripts/install.js  # Interactive setup (generates token + MCP config)
```

Run a single test file:
```bash
npx vitest run src/host/tool-definitions.test.ts
```

## Key Conventions

- **stdout is reserved for MCP protocol** — all logging must go to stderr (`console.error`)
- Extension code is plain JavaScript (not TypeScript) because MV3 service workers use `importScripts`
- ARIA-first element targeting: tools use `(role, name)` pairs, not CSS selectors
- All extension ↔ host messages go through the typed protocol in `src/shared/protocol.ts` — add new message types there first
- WebSocket auth uses a shared token; currently bypassed in dev (`__skip__` token in background.js)
- TypeScript compiles only `src/host/` and `src/shared/` (see `tsconfig.json` include); extension JS is copied as-is by `scripts/build.js`

## Adding a New Tool

1. Add `MessageType` variant in `src/shared/protocol.ts`
2. Add request interface and include in `ExtensionRequest` union
3. Add tool schema in `src/host/tool-definitions.ts`
4. Add handler case in `mcp-server.ts` `CallToolRequestSchema` handler
5. Add command handler in `src/extension/background.js`
6. Add tests in corresponding `.test.ts` files

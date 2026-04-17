#!/usr/bin/env node
/**
 * Install script: setup instructions for Clicksmith.
 * No token needed — auth is via WebSocket Origin header (chrome-extension://).
 *
 * Usage: node scripts/install.js
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const serverPath = resolve(root, 'dist', 'host', 'host', 'mcp-server.js').replace(/\\/g, '/');
const extPath = resolve(root, 'dist', 'extension').replace(/\\/g, '/');

console.log(`
========================================
  Clicksmith — Setup
========================================

STEP 1: Load Chrome Extension
  1. Open chrome://extensions
  2. Enable "Developer mode" (top right)
  3. Click "Load unpacked"
  4. Select: ${extPath}
  5. Copy the extension ID shown on that tile (optional, see Step 3)

STEP 2: Add MCP Server Config

  For Claude Desktop (~/.claude/claude_desktop_config.json):
${JSON.stringify({ mcpServers: { clicksmith: { command: 'node', args: [serverPath] } } }, null, 2).split('\n').map(l => '  ' + l).join('\n')}

  For Claude Code (settings or claude mcp add):
    claude mcp add clicksmith node -- ${serverPath}

STEP 3: (Optional) Lock to your specific extension id
  Default accepts any chrome-extension:// origin. To restrict to only your
  extension, set the env var in your MCP server config:

    "env": { "CLICKSMITH_EXTENSION_ID": "<the id from step 1.5>" }

STEP 4: Verify
  1. Restart Claude Desktop or Claude Code
  2. Extension service worker console should log: "[bg] Connected to MCP server"
  3. Test: ask Claude to run navigate("https://example.com")

========================================
  Security: no token. Server validates the WebSocket Origin header
  (chrome-extension://…) set by Chrome — page JS cannot forge it.
========================================
`);

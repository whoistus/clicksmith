#!/usr/bin/env node
/**
 * Install script: interactive setup for Chrome Like a Human.
 * Generates MCP config with --token flag, prints extension setup steps.
 *
 * Usage: node scripts/install.js [--token=mytoken]
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const serverPath = resolve(root, 'dist', 'host', 'host', 'mcp-server.js').replace(/\\/g, '/');
const extPath = resolve(root, 'dist', 'extension').replace(/\\/g, '/');

// Parse --token from args or generate one
const tokenArg = process.argv.find(a => a.startsWith('--token='));
const token = tokenArg ? tokenArg.split('=')[1] : randomBytes(16).toString('hex');

console.log(`
========================================
  Chrome Like a Human — Setup
========================================

STEP 1: Load Chrome Extension
  1. Open chrome://extensions
  2. Enable "Developer mode" (top right)
  3. Click "Load unpacked"
  4. Select: ${extPath}

STEP 2: Set Auth Token in Extension
  1. On chrome://extensions, click "Service worker" under the extension
  2. In DevTools console, run:

     chrome.storage.local.set({ authToken: '${token}' })

STEP 3: Add MCP Server Config

  For Claude Desktop (~/.claude/claude_desktop_config.json):
${JSON.stringify({ mcpServers: { 'chrome-qa': { command: 'node', args: [serverPath, `--token=${token}`] } } }, null, 2).split('\n').map(l => '  ' + l).join('\n')}

  For Claude Code (settings or claude mcp add):
    claude mcp add chrome-qa node -- ${serverPath} --token=${token}

STEP 4: Verify
  1. Restart Claude Desktop or Claude Code
  2. Extension console should show: "[bg] Authenticated with MCP server"
  3. Test: ask Claude to run navigate("https://example.com")

========================================
  Auth Token: ${token}
  (same token must be in BOTH extension storage and MCP --token flag)
========================================
`);

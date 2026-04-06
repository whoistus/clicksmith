#!/usr/bin/env node
/**
 * Install script: generates MCP config snippet for Claude Desktop/Code.
 *
 * Since we use WebSocket (not native messaging), no registry setup needed.
 * This script just prints the MCP configuration to add.
 *
 * Usage: node scripts/install.js
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const serverPath = resolve(root, 'dist', 'host', 'host', 'mcp-server.js');

console.log('Chrome Like a Human — Setup Instructions\n');
console.log('=' .repeat(50));

// Step 1: Extension
console.log('\n1. Load the Chrome extension:');
console.log('   • Open chrome://extensions');
console.log('   • Enable "Developer mode" (top right)');
console.log('   • Click "Load unpacked"');
console.log(`   • Select: ${resolve(root, 'dist', 'extension')}`);

// Step 2: MCP config
console.log('\n2. Add MCP server config:\n');

const config = {
  mcpServers: {
    'chrome-qa': {
      command: 'node',
      args: [serverPath.replace(/\\/g, '/')],
    },
  },
};

const configStr = JSON.stringify(config, null, 2).split('\n').join('\n   ');
console.log('   For Claude Desktop (claude_desktop_config.json):');
console.log('   ' + configStr);
console.log('\n   For Claude Code (.claude/settings.json):');
console.log('   ' + configStr);

// Step 3: Verify
console.log('\n3. Verify connection:');
console.log('   • Start Claude Desktop or Claude Code');
console.log('   • The extension should show "Connected to MCP server" in its console');
console.log('   • Try: navigate("https://example.com")');

console.log('\n' + '='.repeat(50));
console.log('Setup complete! The extension will auto-connect to the MCP server.');

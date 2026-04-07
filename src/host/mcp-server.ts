#!/usr/bin/env node
/**
 * MCP server for Chrome Like a Human.
 * Registers 17 tools (6 core + 11 QA), routes calls through WebSocket bridge to Chrome extension.
 * Transport: stdio (JSON-RPC via @modelcontextprotocol/sdk).
 * IMPORTANT: All logging to stderr only — stdout is reserved for MCP protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MessageType, ResponseType } from '../shared/protocol.js';
import type { ExtensionRequest, ExtensionResponse } from '../shared/protocol.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startBridge, onExtensionMessage, sendToExtension, isExtensionConnected, getAuthToken } from './native-messaging-bridge.js';

// Pending request callbacks keyed by request ID
const pendingRequests = new Map<string, {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Default timeout for extension responses (ms)
const REQUEST_TIMEOUT = 10_000;

let requestCounter = 0;

/** Generate unique request ID */
function nextId(): string {
  return `req_${++requestCounter}_${Date.now()}`;
}

/** Send request to extension and await response. */
function callExtension(msg: Omit<ExtensionRequest, 'id'>): Promise<unknown> {
  const id = nextId();
  const request = { ...msg, id } as ExtensionRequest;

  if (!isExtensionConnected()) {
    return Promise.reject(new Error('Chrome extension not connected. Open Chrome with the extension loaded.'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Extension request timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(id, { resolve, reject, timer });
    sendToExtension(request);
  });
}

// Route extension responses to pending requests
onExtensionMessage((msg: ExtensionResponse) => {
  const pending = pendingRequests.get(msg.id);
  if (!pending) {
    console.error(`[mcp] Received response for unknown request: ${msg.id}`);
    return;
  }

  clearTimeout(pending.timer);
  pendingRequests.delete(msg.id);

  if (msg.type === ResponseType.ERROR) {
    pending.reject(new Error(msg.error));
  } else {
    pending.resolve(msg.data);
  }
});

import { ALL_TOOLS } from './tool-definitions.js';

// Map tool name -> MessageType for routing
const TOOL_TYPE_MAP: Record<string, MessageType> = {
  navigate: MessageType.NAVIGATE,
  snapshot: MessageType.SNAPSHOT,
  screenshot: MessageType.SCREENSHOT,
  click: MessageType.CLICK,
  type: MessageType.TYPE,
  press_key: MessageType.PRESS_KEY,
  // Phase 2
  assert_visible: MessageType.ASSERT_VISIBLE,
  assert_text: MessageType.ASSERT_TEXT,
  assert_url: MessageType.ASSERT_URL,
  assert_network: MessageType.ASSERT_NETWORK,
  assert_count: MessageType.ASSERT_COUNT,
  wait_for: MessageType.WAIT_FOR,
  wait_for_network: MessageType.WAIT_FOR_NETWORK,
  get_text: MessageType.GET_TEXT,
  get_url: MessageType.GET_URL,
  get_network_log: MessageType.GET_NETWORK_LOG,
  get_console_log: MessageType.GET_CONSOLE_LOG,
};

// Create and configure MCP server
const server = new Server(
  { name: 'chrome-like-a-human', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const messageType = TOOL_TYPE_MAP[name];
    if (!messageType) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    const result = await callExtension({ type: messageType, ...args });

    // Screenshot returns base64 image
    if (name === 'screenshot' && typeof result === 'string') {
      return {
        content: [{
          type: 'image',
          data: result.replace(/^data:image\/png;base64,/, ''),
          mimeType: 'image/png',
        }],
      };
    }

    // All other tools return text
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// Start server: WebSocket bridge first, then MCP stdio transport
async function main() {
  const portArg = process.argv.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 9333;

  // Optional fixed token: --token=mytoken (useful for stable setup)
  const tokenArg = process.argv.find(a => a.startsWith('--token='));
  const fixedToken = tokenArg ? tokenArg.split('=')[1] : undefined;

  await startBridge(port, fixedToken);

  // Write token to file so user can easily copy it
  const token = getAuthToken();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const tokenPath = join(__dirname, '..', '..', 'auth-token.txt');
  try {
    writeFileSync(tokenPath, token || '');
    console.error(`[mcp] Auth token written to: ${tokenPath}`);
  } catch {
    // dist might not be writable, fall back to just logging
    console.error(`[mcp] Auth token: ${token}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Chrome Like a Human MCP server started');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * MCP server for Chrome Like a Human.
 * Registers 6 core tools, routes calls through native messaging bridge to Chrome extension.
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
import { startBridge, onExtensionMessage, sendToExtension, isExtensionConnected } from './native-messaging-bridge.js';

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

// MCP tool definitions
const TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate the active tab to a URL and wait for page load.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'snapshot',
    description: 'Get the accessibility tree of the current page as structured text. Returns ARIA roles, names, and states in an indented tree format.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        depth: { type: 'number', description: 'Max tree depth (omit for full tree)' },
      },
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the visible viewport. Returns base64-encoded PNG.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'click',
    description: 'Click an element found by ARIA role and accessible name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        role: { type: 'string', description: 'ARIA role (e.g., button, link, checkbox)' },
        name: { type: 'string', description: 'Accessible name (label text, aria-label, etc.)' },
      },
      required: ['role', 'name'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input element found by ARIA role and accessible name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        role: { type: 'string', description: 'ARIA role (e.g., textbox, combobox, searchbox)' },
        name: { type: 'string', description: 'Accessible name of the input field' },
        text: { type: 'string', description: 'Text to type into the field' },
      },
      required: ['role', 'name', 'text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key on the currently focused element or page.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Key name (e.g., Enter, Escape, Tab, ArrowDown)' },
      },
      required: ['key'],
    },
  },
];

// Create and configure MCP server
const server = new Server(
  { name: 'chrome-like-a-human', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let messageType: MessageType;
    switch (name) {
      case 'navigate': messageType = MessageType.NAVIGATE; break;
      case 'snapshot': messageType = MessageType.SNAPSHOT; break;
      case 'screenshot': messageType = MessageType.SCREENSHOT; break;
      case 'click': messageType = MessageType.CLICK; break;
      case 'type': messageType = MessageType.TYPE; break;
      case 'press_key': messageType = MessageType.PRESS_KEY; break;
      default:
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
  // Parse optional port from args: --port=9222
  const portArg = process.argv.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 9333;

  await startBridge(port);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Chrome Like a Human MCP server started');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * MCP server for Clicksmith.
 * Registers 17 tools (6 core + 11 QA), routes calls through WebSocket bridge to Chrome extension.
 * Transport: stdio (JSON-RPC via @modelcontextprotocol/sdk).
 * IMPORTANT: All logging to stderr only — stdout is reserved for MCP protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MessageType, ResponseType } from '../shared/protocol.js';
import type { ExtensionRequest, ExtensionResponse } from '../shared/protocol.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startBridge, onExtensionMessage, sendToExtension, isExtensionConnected, getAuthToken } from './native-messaging-bridge.js';
import { readFileSync } from 'fs';
import { sessionRecorder, handleSaveFile } from './host-tools.js';

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
    return Promise.reject(new Error(
      'Chrome extension not connected. Check: (1) Chrome is running, (2) "Clicksmith" extension is enabled at chrome://extensions, (3) if just installed, click the extension icon once to wake it.'
    ));
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
  // Phase 4
  select_option: MessageType.SELECT_OPTION,
  hover: MessageType.HOVER,
  list_tabs: MessageType.LIST_TABS,
  switch_tab: MessageType.SWITCH_TAB,
  // Phase 5: Design QA
  get_element_style: MessageType.GET_ELEMENT_STYLE,
};

// Create and configure MCP server
const server = new Server(
  { name: 'clicksmith', version: '0.1.0' },
  { capabilities: { tools: {}, prompts: {} } }
);

// --- MCP Prompts (Phase 3) ---

const __dirname_prompts = dirname(fileURLToPath(import.meta.url));
function loadPrompt(name: string): string {
  try {
    return readFileSync(join(__dirname_prompts, '..', '..', '..', 'prompts', `${name}.md`), 'utf-8');
  } catch { return `(prompt template ${name}.md not found)`; }
}

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    { name: 'generate_test', description: 'Generate Playwright .spec.ts from QA session transcript', arguments: [{ name: 'session_json', description: 'Session JSON (auto-injected if omitted)', required: false }] },
    { name: 'analyze_gaps', description: 'Analyze test coverage gaps and suggest untested scenarios', arguments: [{ name: 'test_files', description: 'Existing test file contents', required: false }, { name: 'app_url', description: 'App URL being tested', required: false }] },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'generate_test') {
    const sessionJson = args?.session_json || JSON.stringify(sessionRecorder.getTranscript(), null, 2);
    const template = loadPrompt('generate-test');
    return { messages: [{ role: 'user', content: { type: 'text', text: template.replace('{{session_json}}', sessionJson) } }] };
  }
  if (name === 'analyze_gaps') {
    const template = loadPrompt('analyze-gaps');
    const text = template.replace('{{test_files}}', args?.test_files || '(none provided)').replace('{{app_url}}', args?.app_url || '(not specified)');
    return { messages: [{ role: 'user', content: { type: 'text', text } }] };
  }
  throw new Error(`Unknown prompt: ${name}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

// Host-only tools (no extension message needed)
const HOST_TOOLS = new Set(['get_session', 'clear_session', 'save_file', 'start_test', 'end_test', 'batch']);

/**
 * Dispatch a single tool call (no MCP response wrapping). Used by both
 * CallToolRequestSchema handler and `batch`. Non-throwing — returns shape
 * { ok: true, data } or { ok: false, error }.
 */
async function dispatchTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    if (name === 'batch') {
      return { ok: false, error: 'batch cannot be nested inside batch' };
    }
    if (HOST_TOOLS.has(name)) {
      // Host tools return MCP-shaped content, extract the data
      const mcp = handleHostTool(name, args);
      const text = mcp.content?.[0]?.type === 'text' ? mcp.content[0].text : JSON.stringify(mcp);
      return mcp.isError ? { ok: false, error: text } : { ok: true, data: text };
    }
    const messageType = TOOL_TYPE_MAP[name];
    if (!messageType) return { ok: false, error: `Unknown tool: ${name}` };

    sessionRecorder.recordCall(name, args);
    const result = await callExtension({ type: messageType, ...args });
    sessionRecorder.recordResult(result);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sessionRecorder.recordError(msg);
    return { ok: false, error: msg };
  }
}

interface BatchAction { tool: string; [key: string]: unknown }

/** Execute a batch of tool calls in a single round-trip. */
async function handleBatch(args: Record<string, unknown>) {
  const actions = (args.actions as BatchAction[]) || [];
  const stopOnError = args.stop_on_error === true; // default false
  const snapshotAfter = args.snapshot_after !== false; // default true

  if (!Array.isArray(actions) || actions.length === 0) {
    return { content: [{ type: 'text', text: 'Error: batch.actions must be a non-empty array' }], isError: true };
  }

  const results: Array<{ index: number; tool: string; ok: boolean; ms: number; data?: unknown; error?: string }> = [];
  const batchStart = Date.now();
  let stopped = false;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const { tool, ...actionArgs } = action;
    const t0 = Date.now();
    const res = await dispatchTool(tool, actionArgs as Record<string, unknown>);
    const ms = Date.now() - t0;
    results.push({ index: i, tool, ok: res.ok, ms, ...(res.ok ? { data: res.data } : { error: res.error }) });
    if (!res.ok && stopOnError) { stopped = true; break; }
  }

  // Auto-snapshot final state (interactive mode for token efficiency)
  let finalSnapshot: string | null = null;
  if (snapshotAfter) {
    const snap = await dispatchTool('snapshot', { mode: 'interactive' });
    finalSnapshot = snap.ok ? (typeof snap.data === 'string' ? snap.data : JSON.stringify(snap.data)) : `(snapshot failed: ${snap.error})`;
  }

  const totalMs = Date.now() - batchStart;
  const okCount = results.filter(r => r.ok).length;
  const summary = {
    executed: results.length,
    total: actions.length,
    succeeded: okCount,
    failed: results.length - okCount,
    stopped_early: stopped,
    total_ms: totalMs,
    results,
    ...(finalSnapshot !== null ? { final_snapshot: finalSnapshot } : {}),
  };

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Host-only tools
    if (name === 'batch') {
      return handleBatch((args || {}) as Record<string, unknown>);
    }

    if (HOST_TOOLS.has(name)) {
      return handleHostTool(name, args || {});
    }

    const messageType = TOOL_TYPE_MAP[name];
    if (!messageType) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    // Session recording: log the call
    sessionRecorder.recordCall(name, (args || {}) as Record<string, unknown>);

    const result = await callExtension({ type: messageType, ...args });

    // Session recording: log the result
    sessionRecorder.recordResult(result);

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

    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sessionRecorder.recordError(message);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

function handleHostTool(name: string, args: Record<string, unknown>): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  switch (name) {
    case 'get_session': {
      const transcript = sessionRecorder.getTranscript();
      return { content: [{ type: 'text', text: JSON.stringify(transcript, null, 2) }] };
    }
    case 'clear_session': {
      sessionRecorder.clear();
      return { content: [{ type: 'text', text: 'Session cleared' }] };
    }
    case 'save_file': {
      const result = handleSaveFile(args as { path: string; content: string });
      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }], isError: !result.success };
    }
    case 'start_test': {
      const testName = (args.name as string) || 'Unnamed Test';
      sessionRecorder.startTest(testName, {
        description: args.description as string | undefined,
        precondition: args.precondition as string | undefined,
        steps: args.steps as string | undefined,
        expected: args.expected as string | undefined,
      });
      const parts = [`Test started: "${testName}"`];
      if (args.expected) parts.push(`Expected: ${args.expected}`);
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }
    case 'end_test': {
      const report = sessionRecorder.getReport();
      return { content: [{ type: 'text', text: report.summary }] };
    }
    default:
      return { content: [{ type: 'text', text: `Unknown host tool: ${name}` }], isError: true };
  }
}

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
  console.error('[mcp] Clicksmith MCP server started');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});

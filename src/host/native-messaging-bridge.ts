/**
 * WebSocket bridge between MCP server and Chrome extension.
 *
 * Trust model:
 *   - Server binds to 127.0.0.1 only (not reachable from network)
 *   - WebSocket handshake is validated via the Origin header, which Chrome sets
 *     server-side and page JavaScript cannot forge. Only `chrome-extension://`
 *     origins are accepted, which blocks the main real-world attack
 *     (malicious webpage doing `new WebSocket('ws://127.0.0.1:9333')`).
 *   - For exact-match hardening, set CLICKSMITH_EXTENSION_ID to the extension's
 *     id and the server will only accept connections from that specific origin.
 *
 * Why no token:
 *   - Tokens defend against attackers already running code on the user's
 *     machine, which is a less-interesting threat than the webpage attack above.
 *   - Token rotation on every server restart interrupts the user's workflow.
 *   - Origin check is a hard Chrome-enforced boundary; no user-visible token.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { ExtensionRequest, ExtensionResponse } from '../shared/protocol.js';

type MessageCallback = (msg: ExtensionResponse) => void;

const DEFAULT_PORT = 9333;
const PING_INTERVAL = 25_000;
const EXTENSION_ORIGIN_PREFIX = 'chrome-extension://';

let wss: WebSocketServer | null = null;
let activeSocket: WebSocket | null = null;
let messageCallback: MessageCallback | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

/** Check whether a handshake Origin header is acceptable. */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || !origin.startsWith(EXTENSION_ORIGIN_PREFIX)) return false;
  const requiredId = process.env.CLICKSMITH_EXTENSION_ID;
  if (!requiredId) return true; // any chrome-extension origin is fine by default
  return origin === `${EXTENSION_ORIGIN_PREFIX}${requiredId}`;
}

/** Start WebSocket server and wait for extension to connect. */
export function startBridge(port = DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({
      port,
      host: '127.0.0.1',
      // Reject handshake at HTTP level before upgrading to WS if origin is bad
      verifyClient: (info, cb) => {
        const origin = info.req.headers.origin;
        if (isAllowedOrigin(origin)) {
          cb(true);
        } else {
          console.error(`[bridge] Rejected connection — bad origin: ${origin || '(none)'}`);
          cb(false, 403, 'Only chrome-extension origins are allowed');
        }
      },
    });

    wss.on('listening', () => {
      console.error(`[bridge] WebSocket server listening on ws://127.0.0.1:${port}`);
      const required = process.env.CLICKSMITH_EXTENSION_ID;
      if (required) {
        console.error(`[bridge] Extension id lock: ${required}`);
      } else {
        console.error('[bridge] Accepting any chrome-extension:// origin (set CLICKSMITH_EXTENSION_ID to lock)');
      }
      resolve();
    });

    wss.on('error', (err) => {
      console.error('[bridge] WebSocket server error:', err.message);
      reject(err);
    });

    wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const origin = request.headers.origin || '(unknown)';
      console.error(`[bridge] Extension connected from ${origin}`);

      // Replace previous connection (e.g. extension reloaded)
      if (activeSocket && activeSocket !== ws) {
        console.error('[bridge] Replacing previous connection');
        activeSocket.close();
      }
      activeSocket = ws;

      // Keepalive at the WS protocol layer
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, PING_INTERVAL);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // App-level keepalive pings from extension — ack and drop, don't forward
          if (msg.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
            }
            return;
          }

          messageCallback?.(msg as ExtensionResponse);
        } catch (err) {
          console.error('[bridge] Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        if (activeSocket === ws) {
          console.error('[bridge] Extension disconnected');
          activeSocket = null;
          if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        }
      });

      ws.on('error', (err) => {
        console.error('[bridge] WebSocket error:', err.message);
      });
    });
  });
}

/** Register callback for messages from the extension. */
export function onExtensionMessage(callback: MessageCallback): void {
  messageCallback = callback;
}

/** Send a message to the Chrome extension. */
export function sendToExtension(msg: ExtensionRequest): void {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    console.error('[bridge] No active extension connection');
    return;
  }
  activeSocket.send(JSON.stringify(msg));
}

/** Check if extension is connected. */
export function isExtensionConnected(): boolean {
  return activeSocket !== null && activeSocket.readyState === WebSocket.OPEN;
}

/** Gracefully shut down the bridge. */
export function stopBridge(): void {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (activeSocket) { activeSocket.close(); activeSocket = null; }
  if (wss) { wss.close(); wss = null; }
}

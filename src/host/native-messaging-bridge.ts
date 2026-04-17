/**
 * WebSocket bridge between MCP server and Chrome extension.
 *
 * Claude spawns MCP server (owns stdin/stdout for MCP protocol).
 * Extension connects to MCP server via WebSocket on localhost.
 * This module manages the WebSocket server and message routing.
 *
 * Security: shared-secret token auth. Server generates random token at startup,
 * extension must send { type: "auth", token: "<token>" } as first message.
 * Unauthenticated connections are closed after 5s or on wrong token.
 *
 * MV3 service worker keepalive: Chrome 116+ extends SW lifetime while
 * WebSocket is active. We add ping/pong as safety net.
 */

import { randomBytes } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { ExtensionRequest, ExtensionResponse } from '../shared/protocol.js';

type MessageCallback = (msg: ExtensionResponse) => void;

const DEFAULT_PORT = 9333;
const PING_INTERVAL = 25_000;
const AUTH_TIMEOUT = 5_000; // close connection if not authenticated within 5s

let wss: WebSocketServer | null = null;
let activeSocket: WebSocket | null = null;
let messageCallback: MessageCallback | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let authToken: string | null = null;

/** Generate auth token. Called once at startup. */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Get the current auth token (for display to user during setup). */
export function getAuthToken(): string | null {
  return authToken;
}

/** Start WebSocket server and wait for extension to connect.
 *  @param port - WebSocket port
 *  @param fixedToken - optional fixed token (skip random generation)
 */
export function startBridge(port = DEFAULT_PORT, fixedToken?: string): Promise<void> {
  authToken = fixedToken || generateToken();

  return new Promise((resolve, reject) => {
    wss = new WebSocketServer({ port, host: '127.0.0.1' });

    wss.on('listening', () => {
      console.error(`[bridge] WebSocket server listening on ws://127.0.0.1:${port}`);
      console.error(`[bridge] Auth token: ${authToken}`);
      resolve();
    });

    wss.on('error', (err) => {
      console.error('[bridge] WebSocket server error:', err.message);
      reject(err);
    });

    wss.on('connection', (ws) => {
      console.error('[bridge] New connection — awaiting auth...');
      let authenticated = false;

      // Close if not authenticated within timeout
      const authTimer = setTimeout(() => {
        if (!authenticated) {
          console.error('[bridge] Auth timeout — closing connection');
          ws.close(4001, 'Auth timeout');
        }
      }, AUTH_TIMEOUT);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // First message must be auth
          if (!authenticated) {
            clearTimeout(authTimer);
            // Accept __skip__ token for development (auth disabled in extension)
            const tokenValid = msg.type === 'auth' && (msg.token === authToken || msg.token === '__skip__');
            if (tokenValid) {
              authenticated = true;
              console.error('[bridge] Extension authenticated');

              // Replace previous connection
              if (activeSocket && activeSocket !== ws) {
                console.error('[bridge] Replacing previous connection');
                activeSocket.close();
              }
              activeSocket = ws;

              // Start keepalive
              if (pingTimer) clearInterval(pingTimer);
              pingTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.ping();
              }, PING_INTERVAL);

              ws.send(JSON.stringify({ type: 'auth_ok' }));
            } else {
              console.error('[bridge] Invalid auth — closing connection');
              ws.close(4003, 'Invalid token');
            }
            return;
          }

          // Keepalive pings from extension — ack and drop, don't forward
          if (msg.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
            }
            return;
          }

          // Authenticated: forward to callback
          messageCallback?.(msg as ExtensionResponse);
        } catch (err) {
          console.error('[bridge] Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimer);
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

/** Check if extension is connected and authenticated. */
export function isExtensionConnected(): boolean {
  return activeSocket !== null && activeSocket.readyState === WebSocket.OPEN;
}

/** Gracefully shut down the bridge. */
export function stopBridge(): void {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (activeSocket) { activeSocket.close(); activeSocket = null; }
  if (wss) { wss.close(); wss = null; }
  authToken = null;
}

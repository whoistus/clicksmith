import { describe, it, expect, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { MessageType, ResponseType } from '../shared/protocol.js';
import type { ExtensionResponse } from '../shared/protocol.js';

// Each test imports fresh module to avoid shared state
async function createBridge(port: number) {
  // Dynamic import to get fresh module state per test
  const mod = await import('./native-messaging-bridge.js');
  return mod;
}

/** Helper: connect and authenticate a WebSocket client. */
async function connectAndAuth(port: number, token: string): Promise<WebSocket> {
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve, reject) => {
    client.onopen = () => resolve();
    client.onerror = (e) => reject(e);
  });

  // Send auth message
  client.send(JSON.stringify({ type: 'auth', token }));

  // Wait for auth_ok
  await new Promise<void>((resolve, reject) => {
    client.onmessage = (e) => {
      const msg = JSON.parse(e.data.toString());
      if (msg.type === 'auth_ok') resolve();
      else reject(new Error(`Expected auth_ok, got ${msg.type}`));
    };
    setTimeout(() => reject(new Error('Auth timeout')), 3000);
  });

  return client;
}

describe('WebSocket Bridge with Auth', () => {
  it('should generate an auth token on startup', async () => {
    const bridge = await createBridge(19300);
    await bridge.startBridge(19300);

    const token = bridge.getAuthToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token!.length).toBe(64); // 32 bytes hex

    bridge.stopBridge();
  });

  it('should accept authenticated connections', async () => {
    const bridge = await createBridge(19301);
    await bridge.startBridge(19301);
    const token = bridge.getAuthToken()!;

    const client = await connectAndAuth(19301, token);
    expect(bridge.isExtensionConnected()).toBe(true);

    client.close();
    bridge.stopBridge();
  });

  it('should reject connections with wrong token', async () => {
    const bridge = await createBridge(19302);
    await bridge.startBridge(19302);

    const client = new WebSocket('ws://127.0.0.1:19302');
    await new Promise<void>(r => { client.onopen = () => r(); });

    // Send wrong token
    client.send(JSON.stringify({ type: 'auth', token: 'wrong_token' }));

    // Should be closed by server
    const closeCode = await new Promise<number>(r => {
      client.onclose = (e) => r(e.code);
    });

    expect(closeCode).toBe(4003);
    expect(bridge.isExtensionConnected()).toBe(false);

    bridge.stopBridge();
  });

  it('should forward messages after authentication', async () => {
    const bridge = await createBridge(19303);
    await bridge.startBridge(19303);
    const token = bridge.getAuthToken()!;

    const received: ExtensionResponse[] = [];
    bridge.onExtensionMessage((msg) => received.push(msg));

    const client = await connectAndAuth(19303, token);

    // Send a response from "extension"
    const response: ExtensionResponse = {
      type: ResponseType.RESULT,
      id: 'req_1',
      data: 'Navigated',
    };
    client.send(JSON.stringify(response));
    await new Promise(r => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('req_1');

    client.close();
    bridge.stopBridge();
  });

  it('should send messages from host to authenticated extension', async () => {
    const bridge = await createBridge(19304);
    await bridge.startBridge(19304);
    const token = bridge.getAuthToken()!;

    const client = await connectAndAuth(19304, token);

    const received: unknown[] = [];
    client.onmessage = (e) => received.push(JSON.parse(e.data.toString()));

    bridge.sendToExtension({
      type: MessageType.NAVIGATE,
      id: 'req_2',
      url: 'https://example.com',
    });
    await new Promise(r => setTimeout(r, 100));

    expect(received).toHaveLength(1);
    expect((received[0] as { id: string }).id).toBe('req_2');

    client.close();
    bridge.stopBridge();
  });

  it('should timeout unauthenticated connections', async () => {
    const bridge = await createBridge(19305);
    await bridge.startBridge(19305);

    const client = new WebSocket('ws://127.0.0.1:19305');
    await new Promise<void>(r => { client.onopen = () => r(); });

    // Don't send auth — wait for timeout (5s)
    const closeCode = await new Promise<number>(r => {
      client.onclose = (e) => r(e.code);
      setTimeout(() => r(-1), 7000);
    });

    expect(closeCode).toBe(4001); // auth timeout code

    bridge.stopBridge();
  }, 10000);
});

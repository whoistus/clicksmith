import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { MessageType, ResponseType } from '../shared/protocol.js';
import type { ExtensionResponse } from '../shared/protocol.js';

// Each test imports fresh module to avoid shared state
async function createBridge() {
  const mod = await import('./native-messaging-bridge.js');
  return mod;
}

/**
 * Connect a test client with a spoofed Origin header (the Node `ws` client lets
 * tests set the Origin at the HTTP handshake layer, simulating what Chrome does
 * for real connections from chrome-extension:// contexts).
 */
function connectWithOrigin(port: number, origin: string | null): Promise<WebSocket> {
  const headers: Record<string, string> = {};
  if (origin) headers['Origin'] = origin;
  const client = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
  return new Promise((resolve, reject) => {
    client.on('open', () => resolve(client));
    client.on('unexpected-response', (_req, res) => {
      reject(new Error(`handshake rejected: ${res.statusCode}`));
    });
    client.on('error', (e) => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 2000);
  });
}

describe('WebSocket Bridge with Origin check', () => {
  afterEach(() => {
    delete process.env.CLICKSMITH_EXTENSION_ID;
  });

  it('accepts any chrome-extension:// origin by default', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19301);

    const client = await connectWithOrigin(19301, 'chrome-extension://abc123fakeid');
    await new Promise(r => setTimeout(r, 50)); // let server finalize activeSocket
    expect(bridge.isExtensionConnected()).toBe(true);

    client.close();
    bridge.stopBridge();
  });

  it('rejects connections with no Origin header', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19302);

    await expect(connectWithOrigin(19302, null)).rejects.toThrow(/handshake rejected: 403/);
    expect(bridge.isExtensionConnected()).toBe(false);

    bridge.stopBridge();
  });

  it('rejects connections from webpage origins (the actual attack)', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19303);

    await expect(connectWithOrigin(19303, 'https://evil.example.com')).rejects.toThrow(/handshake rejected: 403/);
    expect(bridge.isExtensionConnected()).toBe(false);

    bridge.stopBridge();
  });

  it('locks to specific extension id when CLICKSMITH_EXTENSION_ID is set', async () => {
    process.env.CLICKSMITH_EXTENSION_ID = 'the-real-id';
    const bridge = await createBridge();
    await bridge.startBridge(19304);

    await expect(connectWithOrigin(19304, 'chrome-extension://wrong-id')).rejects.toThrow(/handshake rejected: 403/);

    const client = await connectWithOrigin(19304, 'chrome-extension://the-real-id');
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.isExtensionConnected()).toBe(true);

    client.close();
    bridge.stopBridge();
  });

  it('forwards messages from extension to callback', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19305);

    const received: ExtensionResponse[] = [];
    bridge.onExtensionMessage((msg) => received.push(msg));

    const client = await connectWithOrigin(19305, 'chrome-extension://test-id');
    await new Promise(r => setTimeout(r, 50));

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

  it('sends host messages to connected extension', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19306);

    const client = await connectWithOrigin(19306, 'chrome-extension://test-id');
    await new Promise(r => setTimeout(r, 50));

    const received: unknown[] = [];
    client.on('message', (data: Buffer) => received.push(JSON.parse(data.toString())));

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

  it('replies pong to app-level ping, does not forward', async () => {
    const bridge = await createBridge();
    await bridge.startBridge(19307);

    const forwarded: ExtensionResponse[] = [];
    bridge.onExtensionMessage((msg) => forwarded.push(msg));

    const client = await connectWithOrigin(19307, 'chrome-extension://test-id');
    await new Promise(r => setTimeout(r, 50));

    const pongs: unknown[] = [];
    client.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') pongs.push(msg);
    });

    client.send(JSON.stringify({ type: 'ping', id: 'ka_1' }));
    await new Promise(r => setTimeout(r, 100));

    expect(pongs).toHaveLength(1);
    expect(forwarded).toHaveLength(0); // ping was NOT forwarded to MCP callback

    client.close();
    bridge.stopBridge();
  });
});

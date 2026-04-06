import { describe, it, expect } from 'vitest';
import {
  MessageType,
  ResponseType,
  DEFAULT_WS_PORT,
} from './protocol.js';
import type {
  NavigateRequest,
  ClickRequest,
  TypeRequest,
  AssertVisibleRequest,
  AssertTextRequest,
  AssertUrlRequest,
  AssertNetworkRequest,
  AssertCountRequest,
  WaitForRequest,
  GetTextRequest,
  GetNetworkLogRequest,
  SuccessResponse,
  ErrorResponse,
  ExtensionRequest,
  ExtensionResponse,
} from './protocol.js';

describe('Protocol types', () => {
  it('should have correct message type values', () => {
    expect(MessageType.NAVIGATE).toBe('navigate');
    expect(MessageType.SNAPSHOT).toBe('snapshot');
    expect(MessageType.SCREENSHOT).toBe('screenshot');
    expect(MessageType.CLICK).toBe('click');
    expect(MessageType.TYPE).toBe('type');
    expect(MessageType.PRESS_KEY).toBe('press_key');
  });

  it('should have correct response type values', () => {
    expect(ResponseType.RESULT).toBe('result');
    expect(ResponseType.ERROR).toBe('error');
  });

  it('should have valid constants', () => {
    expect(DEFAULT_WS_PORT).toBe(9333);
  });

  it('should allow constructing valid NavigateRequest', () => {
    const req: NavigateRequest = {
      type: MessageType.NAVIGATE,
      id: 'req_1',
      url: 'https://example.com',
    };
    expect(req.type).toBe('navigate');
    expect(req.id).toBe('req_1');
    expect(req.url).toBe('https://example.com');
  });

  it('should allow constructing valid ClickRequest', () => {
    const req: ClickRequest = {
      type: MessageType.CLICK,
      id: 'req_2',
      role: 'button',
      name: 'Submit',
    };
    expect(req.role).toBe('button');
    expect(req.name).toBe('Submit');
  });

  it('should allow constructing valid TypeRequest', () => {
    const req: TypeRequest = {
      type: MessageType.TYPE,
      id: 'req_3',
      role: 'textbox',
      name: 'Email',
      text: 'user@example.com',
    };
    expect(req.text).toBe('user@example.com');
  });

  it('should allow constructing SuccessResponse', () => {
    const res: SuccessResponse = {
      type: ResponseType.RESULT,
      id: 'req_1',
      data: { url: 'https://example.com' },
    };
    expect(res.type).toBe('result');
  });

  it('should allow constructing ErrorResponse', () => {
    const res: ErrorResponse = {
      type: ResponseType.ERROR,
      id: 'req_1',
      error: 'Element not found',
    };
    expect(res.type).toBe('error');
    expect(res.error).toBe('Element not found');
  });

  it('should correctly discriminate ExtensionRequest union', () => {
    const req: ExtensionRequest = {
      type: MessageType.PRESS_KEY,
      id: 'req_4',
      key: 'Enter',
    };
    expect(req.type).toBe('press_key');
    if (req.type === MessageType.PRESS_KEY) {
      expect(req.key).toBe('Enter');
    }
  });

  it('should correctly discriminate ExtensionResponse union', () => {
    const res: ExtensionResponse = {
      type: ResponseType.ERROR,
      id: 'req_1',
      error: 'timeout',
    };
    if (res.type === ResponseType.ERROR) {
      expect(res.error).toBe('timeout');
    }
  });

  // Phase 2: Assertion types
  it('should have Phase 2 assertion message types', () => {
    expect(MessageType.ASSERT_VISIBLE).toBe('assert_visible');
    expect(MessageType.ASSERT_TEXT).toBe('assert_text');
    expect(MessageType.ASSERT_URL).toBe('assert_url');
    expect(MessageType.ASSERT_NETWORK).toBe('assert_network');
    expect(MessageType.ASSERT_COUNT).toBe('assert_count');
  });

  it('should have Phase 2 wait message types', () => {
    expect(MessageType.WAIT_FOR).toBe('wait_for');
    expect(MessageType.WAIT_FOR_NETWORK).toBe('wait_for_network');
  });

  it('should have Phase 2 observation message types', () => {
    expect(MessageType.GET_TEXT).toBe('get_text');
    expect(MessageType.GET_URL).toBe('get_url');
    expect(MessageType.GET_NETWORK_LOG).toBe('get_network_log');
    expect(MessageType.GET_CONSOLE_LOG).toBe('get_console_log');
  });

  it('should construct AssertVisibleRequest', () => {
    const req: AssertVisibleRequest = { type: MessageType.ASSERT_VISIBLE, id: 'r1', role: 'button', name: 'Submit' };
    expect(req.type).toBe('assert_visible');
  });

  it('should construct AssertTextRequest', () => {
    const req: AssertTextRequest = { type: MessageType.ASSERT_TEXT, id: 'r2', role: 'heading', name: 'Title', expected: 'Hello' };
    expect(req.expected).toBe('Hello');
  });

  it('should construct AssertUrlRequest', () => {
    const req: AssertUrlRequest = { type: MessageType.ASSERT_URL, id: 'r3', pattern: '/dashboard' };
    expect(req.pattern).toBe('/dashboard');
  });

  it('should construct AssertNetworkRequest', () => {
    const req: AssertNetworkRequest = { type: MessageType.ASSERT_NETWORK, id: 'r4', url_pattern: '/api/users', status: 200 };
    expect(req.status).toBe(200);
  });

  it('should construct AssertCountRequest', () => {
    const req: AssertCountRequest = { type: MessageType.ASSERT_COUNT, id: 'r5', role: 'listitem', name: 'Item', count: 3 };
    expect(req.count).toBe(3);
  });

  it('should construct WaitForRequest with optional timeout', () => {
    const req: WaitForRequest = { type: MessageType.WAIT_FOR, id: 'r6', role: 'button', name: 'Load More', timeout: 3000 };
    expect(req.timeout).toBe(3000);
  });

  it('should construct GetTextRequest', () => {
    const req: GetTextRequest = { type: MessageType.GET_TEXT, id: 'r7', role: 'heading', name: 'Title' };
    expect(req.role).toBe('heading');
  });

  it('should construct GetNetworkLogRequest with optional filter', () => {
    const req: GetNetworkLogRequest = { type: MessageType.GET_NETWORK_LOG, id: 'r8', filter: '/api/' };
    expect(req.filter).toBe('/api/');
  });
});

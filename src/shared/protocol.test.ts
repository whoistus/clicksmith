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
});

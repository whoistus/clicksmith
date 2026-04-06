/**
 * Message protocol between MCP host and Chrome extension.
 * Native messaging transport: 4-byte LE length prefix + JSON payload.
 */

// Message types from host -> extension
export enum MessageType {
  NAVIGATE = 'navigate',
  SNAPSHOT = 'snapshot',
  SCREENSHOT = 'screenshot',
  CLICK = 'click',
  TYPE = 'type',
  PRESS_KEY = 'press_key',
}

// Response types from extension -> host
export enum ResponseType {
  RESULT = 'result',
  ERROR = 'error',
}

// Request payloads per message type
export interface NavigateRequest {
  type: MessageType.NAVIGATE;
  id: string;
  url: string;
}

export interface SnapshotRequest {
  type: MessageType.SNAPSHOT;
  id: string;
  depth?: number;
}

export interface ScreenshotRequest {
  type: MessageType.SCREENSHOT;
  id: string;
}

export interface ClickRequest {
  type: MessageType.CLICK;
  id: string;
  role: string;
  name: string;
}

export interface TypeRequest {
  type: MessageType.TYPE;
  id: string;
  role: string;
  name: string;
  text: string;
}

export interface PressKeyRequest {
  type: MessageType.PRESS_KEY;
  id: string;
  key: string;
}

export type ExtensionRequest =
  | NavigateRequest
  | SnapshotRequest
  | ScreenshotRequest
  | ClickRequest
  | TypeRequest
  | PressKeyRequest;

// Response from extension back to host
export interface SuccessResponse {
  type: ResponseType.RESULT;
  id: string;
  data: unknown;
}

export interface ErrorResponse {
  type: ResponseType.ERROR;
  id: string;
  error: string;
}

export type ExtensionResponse = SuccessResponse | ErrorResponse;

// WebSocket port for extension <-> host communication
export const DEFAULT_WS_PORT = 9333;

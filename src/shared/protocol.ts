/**
 * Message protocol between MCP host and Chrome extension.
 * Native messaging transport: 4-byte LE length prefix + JSON payload.
 */

// Message types from host -> extension
export enum MessageType {
  // Phase 1: Core tools
  NAVIGATE = 'navigate',
  SNAPSHOT = 'snapshot',
  SCREENSHOT = 'screenshot',
  CLICK = 'click',
  TYPE = 'type',
  PRESS_KEY = 'press_key',
  // Phase 2: Assertions
  ASSERT_VISIBLE = 'assert_visible',
  ASSERT_TEXT = 'assert_text',
  ASSERT_URL = 'assert_url',
  ASSERT_NETWORK = 'assert_network',
  ASSERT_COUNT = 'assert_count',
  // Phase 2: Wait utilities
  WAIT_FOR = 'wait_for',
  WAIT_FOR_NETWORK = 'wait_for_network',
  // Phase 2: Observation
  GET_TEXT = 'get_text',
  GET_URL = 'get_url',
  GET_NETWORK_LOG = 'get_network_log',
  GET_CONSOLE_LOG = 'get_console_log',
  // Phase 4: Additional interaction
  SELECT_OPTION = 'select_option',
  HOVER = 'hover',
  LIST_TABS = 'list_tabs',
  SWITCH_TAB = 'switch_tab',
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

// Phase 2: Assertion requests
export interface AssertVisibleRequest {
  type: MessageType.ASSERT_VISIBLE;
  id: string;
  role: string;
  name: string;
}

export interface AssertTextRequest {
  type: MessageType.ASSERT_TEXT;
  id: string;
  role: string;
  name: string;
  expected: string;
}

export interface AssertUrlRequest {
  type: MessageType.ASSERT_URL;
  id: string;
  pattern: string;
}

export interface AssertNetworkRequest {
  type: MessageType.ASSERT_NETWORK;
  id: string;
  url_pattern: string;
  status?: number;
}

export interface AssertCountRequest {
  type: MessageType.ASSERT_COUNT;
  id: string;
  role: string;
  name: string;
  count: number;
}

// Phase 2: Wait requests
export interface WaitForRequest {
  type: MessageType.WAIT_FOR;
  id: string;
  role: string;
  name: string;
  timeout?: number;
}

export interface WaitForNetworkRequest {
  type: MessageType.WAIT_FOR_NETWORK;
  id: string;
  url_pattern: string;
  timeout?: number;
}

// Phase 2: Observation requests
export interface GetTextRequest {
  type: MessageType.GET_TEXT;
  id: string;
  role: string;
  name: string;
}

export interface GetUrlRequest {
  type: MessageType.GET_URL;
  id: string;
}

export interface GetNetworkLogRequest {
  type: MessageType.GET_NETWORK_LOG;
  id: string;
  filter?: string;
}

export interface GetConsoleLogRequest {
  type: MessageType.GET_CONSOLE_LOG;
  id: string;
  level?: string;
}

// Phase 4: Interaction requests
export interface SelectOptionRequest {
  type: MessageType.SELECT_OPTION;
  id: string;
  role: string;
  name: string;
  value: string;
}

export interface HoverRequest {
  type: MessageType.HOVER;
  id: string;
  role: string;
  name: string;
}

export interface ListTabsRequest {
  type: MessageType.LIST_TABS;
  id: string;
}

export interface SwitchTabRequest {
  type: MessageType.SWITCH_TAB;
  id: string;
  id_tab: number;
}

export type ExtensionRequest =
  | NavigateRequest
  | SnapshotRequest
  | ScreenshotRequest
  | ClickRequest
  | TypeRequest
  | PressKeyRequest
  | AssertVisibleRequest
  | AssertTextRequest
  | AssertUrlRequest
  | AssertNetworkRequest
  | AssertCountRequest
  | WaitForRequest
  | WaitForNetworkRequest
  | GetTextRequest
  | GetUrlRequest
  | GetNetworkLogRequest
  | GetConsoleLogRequest
  | SelectOptionRequest
  | HoverRequest
  | ListTabsRequest
  | SwitchTabRequest;

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

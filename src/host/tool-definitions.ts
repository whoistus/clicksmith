/**
 * MCP tool definitions for Chrome Like a Human.
 * Phase 1: 6 core tools (navigate, snapshot, screenshot, click, type, press_key)
 * Phase 2: 11 QA tools (assertions, wait, observation)
 */

const obj = 'object' as const;

// Phase 1: Core tools
const CORE_TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate the active tab to a URL and wait for page load.',
    inputSchema: { type: obj, properties: { url: { type: 'string', description: 'URL to navigate to' } }, required: ['url'] },
  },
  {
    name: 'snapshot',
    description: 'Get the accessibility tree of the current page. Default mode "interactive" returns only actionable elements (buttons, links, inputs, headings) for token efficiency. Use mode "full" for complete tree.',
    inputSchema: { type: obj, properties: { depth: { type: 'number', description: 'Max tree depth (omit for full tree)' }, mode: { type: 'string', description: '"interactive" (default, token-efficient) or "full" (complete tree)' } } },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the visible viewport. Returns base64-encoded PNG.',
    inputSchema: { type: obj, properties: {} },
  },
  {
    name: 'click',
    description: 'Click an element found by ARIA role and accessible name.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role (button, link, checkbox, etc.)' }, name: { type: 'string', description: 'Accessible name' } }, required: ['role', 'name'] },
  },
  {
    name: 'type',
    description: 'Type text into an input element found by ARIA role and accessible name.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role (textbox, combobox, searchbox)' }, name: { type: 'string', description: 'Accessible name of input' }, text: { type: 'string', description: 'Text to type' } }, required: ['role', 'name', 'text'] },
  },
  {
    name: 'press_key',
    description: 'Press a keyboard key on the currently focused element or page.',
    inputSchema: { type: obj, properties: { key: { type: 'string', description: 'Key name (Enter, Escape, Tab, ArrowDown, etc.)' } }, required: ['key'] },
  },
];

// Phase 2: Assertion tools
const ASSERTION_TOOLS = [
  {
    name: 'assert_visible',
    description: 'Assert that an element with the given ARIA role and name is visible on the page. Returns {pass, message}.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' } }, required: ['role', 'name'] },
  },
  {
    name: 'assert_text',
    description: 'Assert that an element contains the expected text (substring match). Returns {pass, message}.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' }, expected: { type: 'string', description: 'Expected text substring' } }, required: ['role', 'name', 'expected'] },
  },
  {
    name: 'assert_url',
    description: 'Assert that the current page URL matches a regex pattern. Returns {pass, message}.',
    inputSchema: { type: obj, properties: { pattern: { type: 'string', description: 'Regex pattern or substring to match against URL' } }, required: ['pattern'] },
  },
  {
    name: 'assert_network',
    description: 'Assert that a network request matching URL pattern (and optional status code) was captured. Returns {pass, message}.',
    inputSchema: { type: obj, properties: { url_pattern: { type: 'string', description: 'Regex or substring to match request URL' }, status: { type: 'number', description: 'Expected HTTP status code (optional)' } }, required: ['url_pattern'] },
  },
  {
    name: 'assert_count',
    description: 'Assert that the number of elements matching ARIA role and name equals the expected count. Returns {pass, message}.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' }, count: { type: 'number', description: 'Expected element count' } }, required: ['role', 'name', 'count'] },
  },
];

// Phase 2: Wait tools
const WAIT_TOOLS = [
  {
    name: 'wait_for',
    description: 'Wait until an element with the given ARIA role and name appears and is visible. Returns {found, message}.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' }, timeout: { type: 'number', description: 'Timeout in ms (default 5000)' } }, required: ['role', 'name'] },
  },
  {
    name: 'wait_for_network',
    description: 'Wait until a network request matching the URL pattern is captured. Returns {found, entry}.',
    inputSchema: { type: obj, properties: { url_pattern: { type: 'string', description: 'Regex or substring to match request URL' }, timeout: { type: 'number', description: 'Timeout in ms (default 5000)' } }, required: ['url_pattern'] },
  },
];

// Phase 2: Observation tools
const OBSERVATION_TOOLS = [
  {
    name: 'get_text',
    description: 'Get the text content of an element found by ARIA role and accessible name.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' } }, required: ['role', 'name'] },
  },
  {
    name: 'get_url',
    description: 'Get the current page URL.',
    inputSchema: { type: obj, properties: {} },
  },
  {
    name: 'get_network_log',
    description: 'Get recent network requests, optionally filtered by URL pattern. Returns {entries}.',
    inputSchema: { type: obj, properties: { filter: { type: 'string', description: 'Regex or substring to filter by URL (optional)' } } },
  },
  {
    name: 'get_console_log',
    description: 'Get recent console messages, optionally filtered by level. Returns {entries}.',
    inputSchema: { type: obj, properties: { level: { type: 'string', description: 'Filter by level: log, warn, error, info, debug (optional)' } } },
  },
];

// Phase 4: Additional interaction tools
const INTERACTION_TOOLS = [
  {
    name: 'select_option',
    description: 'Select an option from a dropdown (native <select> or custom). Finds element by ARIA role+name, then selects option by value or text.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role (combobox, listbox, or select element role)' }, name: { type: 'string', description: 'Accessible name of the dropdown' }, value: { type: 'string', description: 'Option value or visible text to select' } }, required: ['role', 'name', 'value'] },
  },
  {
    name: 'hover',
    description: 'Hover over an element found by ARIA role and accessible name. Triggers mouseenter/mouseover events.',
    inputSchema: { type: obj, properties: { role: { type: 'string', description: 'ARIA role' }, name: { type: 'string', description: 'Accessible name' } }, required: ['role', 'name'] },
  },
  {
    name: 'list_tabs',
    description: 'List all open Chrome tabs with their id, title, URL, and active status.',
    inputSchema: { type: obj, properties: {} },
  },
  {
    name: 'switch_tab',
    description: 'Switch to a specific Chrome tab by its ID.',
    inputSchema: { type: obj, properties: { id: { type: 'number', description: 'Tab ID (from list_tabs)' } }, required: ['id'] },
  },
];

// Phase 3: Session + file tools (host-only, no extension message)
const SESSION_TOOLS = [
  {
    name: 'get_session',
    description: 'Get the current QA session transcript (all tool calls + results). Use before generate_test prompt.',
    inputSchema: { type: obj, properties: {} },
  },
  {
    name: 'clear_session',
    description: 'Clear the session transcript to start a new QA session.',
    inputSchema: { type: obj, properties: {} },
  },
  {
    name: 'save_file',
    description: 'Save content to a file on disk (e.g., generated .spec.ts test). Path must be relative to project root.',
    inputSchema: { type: obj, properties: { path: { type: 'string', description: 'Relative file path (e.g., tests/login.spec.ts)' }, content: { type: 'string', description: 'File content to write' } }, required: ['path', 'content'] },
  },
];

export const ALL_TOOLS = [
  ...CORE_TOOLS,
  ...ASSERTION_TOOLS,
  ...WAIT_TOOLS,
  ...OBSERVATION_TOOLS,
  ...INTERACTION_TOOLS,
  ...SESSION_TOOLS,
];

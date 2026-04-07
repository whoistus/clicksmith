/**
 * Background service worker for Chrome Like a Human extension.
 * Connects to MCP server via WebSocket, dispatches commands to CDP or content script.
 *
 * Architecture:
 *   WebSocket (from MCP server) -> message router -> CDP commands or content script messages
 *   CDP/content script responses -> WebSocket (back to MCP server)
 */

// Import capture modules (MV3 service worker uses importScripts)
importScripts('network-capture.js', 'console-capture.js');

// --- Configuration ---
const WS_URL = 'ws://127.0.0.1:9333';
const RECONNECT_DELAY = 3000;

// --- State ---
let ws = null;
let authenticated = false;
/** @type {Map<number, {tabId: number, version: string}>} debugger attachments by tabId */
const debuggerAttachments = new Map();

// --- WebSocket Connection ---

async function connect() {
  // AUTH DISABLED FOR DEVELOPMENT — uncomment below to re-enable
  // const { authToken } = await chrome.storage.local.get('authToken');
  // if (!authToken) {
  //   console.error('[bg] No auth token set. Go to extension options to configure.');
  //   setTimeout(connect, RECONNECT_DELAY);
  //   return;
  // }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[bg] Connected to MCP server');
    // AUTH DISABLED — send skip-auth signal
    ws.send(JSON.stringify({ type: 'auth', token: '__skip__' }));
  };

  ws.onclose = () => {
    console.log('[bg] Disconnected from MCP server, reconnecting...');
    ws = null;
    setTimeout(connect, RECONNECT_DELAY);
  };

  ws.onerror = (err) => {
    console.error('[bg] WebSocket error:', err.message || err);
  };

  ws.onmessage = async (event) => {
    let msgId = 'unknown';
    try {
      const msg = JSON.parse(event.data);

      // Handle auth response
      if (msg.type === 'auth_ok') {
        authenticated = true;
        console.log('[bg] Authenticated with MCP server');
        return;
      }

      msgId = msg.id || 'unknown';
      if (!msg.id || !msg.type) {
        sendResponse({ type: 'error', id: msgId, error: 'Missing id or type field' });
        return;
      }
      const result = await handleMessage(msg);
      sendResponse({ type: 'result', id: msgId, data: result });
    } catch (err) {
      sendResponse({ type: 'error', id: msgId, error: err.message });
    }
  };
}

function sendResponse(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- Message Router ---

async function handleMessage(msg) {
  switch (msg.type) {
    // Phase 1: Core tools
    case 'navigate': return handleNavigate(msg);
    case 'snapshot': return handleSnapshot(msg);
    case 'screenshot': return handleScreenshot();
    case 'click': return handleContentAction(msg);
    case 'type': return handleContentAction(msg);
    case 'press_key': return handleContentAction(msg);
    // Phase 2: Content script assertions/observation (routed to content.js)
    case 'assert_visible': return handleContentAction(msg);
    case 'assert_text': return handleContentAction(msg);
    case 'assert_count': return handleContentAction(msg);
    case 'get_text': return handleContentAction(msg);
    case 'wait_for': return handleContentAction(msg);
    // Phase 2: Background assertions/observation (handled here)
    case 'assert_url': return handleAssertUrl(msg);
    case 'assert_network': return handleAssertNetwork(msg);
    case 'wait_for_network': return handleWaitForNetwork(msg);
    case 'get_url': return handleGetUrl();
    case 'get_network_log': return handleGetNetworkLog(msg);
    case 'get_console_log': return handleGetConsoleLog(msg);
    // Phase 4: New interaction tools
    case 'select_option': return handleContentAction(msg);
    case 'hover': return handleContentAction(msg);
    case 'list_tabs': return handleListTabs();
    case 'switch_tab': return handleSwitchTab(msg);
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

// --- Active Tab Helper ---
// Track last known tab to avoid "no active tab" when Chrome isn't focused
let lastKnownTabId = null;

chrome.tabs.onActivated.addListener((info) => {
  lastKnownTabId = info.tabId;
});

async function getActiveTabId() {
  // Try 1: active tab in current window
  const [tab1] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab1?.id) { lastKnownTabId = tab1.id; return tab1.id; }

  // Try 2: active tab in ANY window (covers unfocused Chrome)
  const [tab2] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab2?.id) { lastKnownTabId = tab2.id; return tab2.id; }

  // Try 3: last known tab (covers Chrome minimized/background)
  if (lastKnownTabId) {
    try {
      await chrome.tabs.get(lastKnownTabId);
      return lastKnownTabId;
    } catch { lastKnownTabId = null; }
  }

  // Try 4: any tab at all
  const [tab3] = await chrome.tabs.query({});
  if (tab3?.id) { lastKnownTabId = tab3.id; return tab3.id; }

  throw new Error('No Chrome tab found. Open at least one tab.');
}

// --- CDP Debugger Helpers ---

/** Ensure debugger is attached to tab. Returns tabId. */
async function ensureDebuggerAttached(tabId) {
  if (debuggerAttachments.has(tabId)) return;

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Debugger attach failed: ${chrome.runtime.lastError.message}`));
      } else {
        debuggerAttachments.set(tabId, { tabId, version: '1.3' });
        resolve();
      }
    });
  });
}

/** Send CDP command to tab. */
function cdpCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`CDP ${method} failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

// Clean up debugger on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerAttachments.has(tabId)) {
    debuggerAttachments.delete(tabId);
  }
});

// Clean up on debugger detach (user clicked "cancel" on yellow bar)
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    debuggerAttachments.delete(source.tabId);
  }
});

// --- Tool Handlers ---

async function handleNavigate(msg) {
  const tabId = await getActiveTabId();

  // Navigate and wait for page load (single listener, cleanup guaranteed)
  await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
    };

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.update(tabId, { url: msg.url }, () => {
      if (chrome.runtime.lastError) {
        cleanup();
        reject(new Error(`Navigate failed: ${chrome.runtime.lastError.message}`));
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      resolve(); // resolve anyway, page may be slow
    }, 30000);
  });

  return `Navigated to ${msg.url}`;
}

async function handleSnapshot(msg) {
  const tabId = await getActiveTabId();
  await ensureDebuggerAttached(tabId);

  await cdpCommand(tabId, 'Accessibility.enable');

  const params = msg.depth ? { depth: msg.depth } : {};
  const result = await cdpCommand(tabId, 'Accessibility.getFullAXTree', params);

  // mode: "interactive" (default, token-efficient) or "full"
  return formatAccessibilityTree(result.nodes, msg.mode || 'interactive');
}

async function handleScreenshot() {
  const dataUrl = await new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (url) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve(url);
      }
    });
  });

  // Return base64 without data URL prefix
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/** Route click/type/press_key to content script. */
async function handleContentAction(msg) {
  const tabId = await getActiveTabId();

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Content script error: ${chrome.runtime.lastError.message}`));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response?.data || 'OK');
      }
    });
  });
}

// --- Accessibility Tree Formatter ---

/** Roles that are meaningful for QA interaction and assertion. */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'slider', 'spinbutton', 'switch', 'tab', 'tablist', 'menuitem', 'menu',
  'menubar', 'option', 'searchbox', 'treeitem',
]);
const LANDMARK_ROLES = new Set([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary', 'form',
  'region', 'search', 'dialog', 'alertdialog', 'alert',
]);
const CONTENT_ROLES = new Set([
  'heading', 'img', 'table', 'row', 'cell', 'list', 'listitem',
  'status', 'progressbar', 'separator',
]);

/**
 * Convert CDP AXNode array into compact text tree.
 * @param {Array} nodes - AXNode array from CDP
 * @param {string} mode - "interactive" (default, token-efficient) or "full"
 */
function formatAccessibilityTree(nodes, mode = 'interactive') {
  if (!nodes || nodes.length === 0) return '(empty accessibility tree)';

  const childMap = new Map();
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
    if (node.childIds) childMap.set(node.nodeId, node.childIds);
  }

  const lines = [];
  const rootId = nodes[0]?.nodeId;
  let nodeCount = 0;
  const MAX_LINES = 500; // hard cap to prevent token bloat

  function isRelevant(role, name) {
    if (mode === 'full') return true;
    if (INTERACTIVE_ROLES.has(role)) return true;
    if (LANDMARK_ROLES.has(role)) return true;
    if (CONTENT_ROLES.has(role) && name) return true;
    // Keep named static text only if short (labels, not paragraphs)
    if (role === 'StaticText' && name && name.length <= 80) return true;
    return false;
  }

  function getStates(node) {
    const s = [];
    if (!node.properties) return s;
    for (const p of node.properties) {
      if (p.name === 'disabled' && p.value?.value === true) s.push('disabled');
      if (p.name === 'checked' && p.value?.value) s.push('checked');
      if (p.name === 'expanded' && p.value?.value === true) s.push('expanded');
      if (p.name === 'selected' && p.value?.value === true) s.push('selected');
      if (p.name === 'required' && p.value?.value === true) s.push('required');
    }
    return s;
  }

  function walk(nodeId, depth) {
    if (lines.length >= MAX_LINES) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const role = node.role?.value || 'generic';
    const name = node.name?.value || '';
    const value = node.value?.value || '';

    // Skip ignored nodes
    if (node.ignored) {
      const children = childMap.get(nodeId) || [];
      for (const cid of children) walk(cid, depth);
      return;
    }

    const relevant = isRelevant(role, name);
    if (relevant) {
      nodeCount++;
      const states = getStates(node);
      // Compact format: "  button 'Sign in' [disabled]"
      const indent = '  '.repeat(Math.min(depth, 8)); // cap indent depth
      let line = `${indent}${role}`;
      if (name) line += ` '${name.substring(0, 60)}'`; // truncate long names
      if (value) line += ` value='${value.substring(0, 40)}'`;
      if (states.length) line += ` [${states.join(',')}]`;
      lines.push(line);
    }

    // Always walk children (relevant parent may contain relevant children)
    const children = childMap.get(nodeId) || [];
    const nextDepth = relevant ? depth + 1 : depth;
    for (const cid of children) walk(cid, nextDepth);
  }

  walk(rootId, 0);

  const truncated = lines.length >= MAX_LINES ? '\n... (truncated at 500 nodes)' : '';
  return `Page snapshot (${nodeCount} nodes, mode=${mode}):${truncated}\n${lines.join('\n')}`;
}

// --- CDP Event Listener (for network + console capture) ---

chrome.debugger.onEvent.addListener((source, method, params) => {
  networkCapture.handleEvent(method, params);
  consoleCapture.handleEvent(method, params);
});

// --- Ensure capture modules started when debugger attaches ---

async function ensureCaptureStarted(tabId) {
  await ensureDebuggerAttached(tabId);
  // If tab changed, reset capture modules to avoid stale data (M4 fix)
  if (networkCapture._tabId !== null && networkCapture._tabId !== tabId) {
    networkCapture.stop();
    networkCapture.clear();
  }
  if (consoleCapture._tabId !== null && consoleCapture._tabId !== tabId) {
    consoleCapture.stop();
    consoleCapture.clear();
  }
  await networkCapture.start(tabId);
  await consoleCapture.start(tabId);
}

// --- Phase 2: Background Assertion Handlers ---

/** Safe regex test with length guard (ReDoS prevention). */
function safeRegexTest(str, pattern) {
  if (!pattern) return true;
  if (pattern.length > 200) return str.includes(pattern);
  try { return new RegExp(pattern).test(str); }
  catch { return str.includes(pattern); }
}

async function handleAssertUrl(msg) {
  const tabId = await getActiveTabId();
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url || '';
  const pass = safeRegexTest(url, msg.pattern);
  return {
    pass,
    message: pass
      ? `URL matches pattern "${msg.pattern}"`
      : `Expected URL to match "${msg.pattern}" but got "${url}"`,
  };
}

async function handleAssertNetwork(msg) {
  const tabId = await getActiveTabId();
  await ensureCaptureStarted(tabId);
  const entry = networkCapture.findMatch(msg.url_pattern, msg.status);
  if (entry) {
    return {
      pass: true,
      message: `Found ${entry.method} ${entry.url} → ${entry.status}`,
    };
  }
  const statusStr = msg.status !== undefined ? ` with status ${msg.status}` : '';
  return {
    pass: false,
    message: `No network request matching "${msg.url_pattern}"${statusStr}`,
  };
}

async function handleWaitForNetwork(msg) {
  const tabId = await getActiveTabId();
  await ensureCaptureStarted(tabId);
  const timeout = msg.timeout || 5000;
  const interval = 200;
  const start = Date.now();

  return new Promise((resolve) => {
    const poll = () => {
      const entry = networkCapture.findMatch(msg.url_pattern);
      if (entry) {
        resolve({ found: true, entry: { url: entry.url, method: entry.method, status: entry.status } });
        return;
      }
      if (Date.now() - start >= timeout) {
        resolve({ found: false, message: `Timeout: no request matching "${msg.url_pattern}" after ${timeout}ms` });
        return;
      }
      setTimeout(poll, interval);
    };
    poll();
  });
}

async function handleGetUrl() {
  const tabId = await getActiveTabId();
  const tab = await chrome.tabs.get(tabId);
  return { url: tab.url || '' };
}

async function handleGetNetworkLog(msg) {
  const tabId = await getActiveTabId();
  await ensureCaptureStarted(tabId);
  const entries = networkCapture.getLog(msg.filter);
  return {
    entries: entries.map(e => ({
      url: e.url, method: e.method, status: e.status,
      statusText: e.statusText, mimeType: e.mimeType, timestamp: e.timestamp,
    })),
  };
}

async function handleGetConsoleLog(msg) {
  const tabId = await getActiveTabId();
  await ensureCaptureStarted(tabId);
  return { entries: consoleCapture.getLog(msg.level) };
}

// --- Phase 4: Tab Management ---

async function handleListTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active })),
  };
}

async function handleSwitchTab(msg) {
  const tab = await chrome.tabs.update(msg.id, { active: true });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
  return `Switched to tab ${msg.id}: ${tab.title}`;
}

// --- SPA URL Change Listener (from content script) ---

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'url_changed' && sender.tab) {
    console.log(`[bg] SPA navigation: ${msg.url} (tab ${sender.tab.id})`);
  }
});

// --- Start ---
connect();

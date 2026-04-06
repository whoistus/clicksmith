/**
 * Background service worker for Chrome Like a Human extension.
 * Connects to MCP server via WebSocket, dispatches commands to CDP or content script.
 *
 * Architecture:
 *   WebSocket (from MCP server) -> message router -> CDP commands or content script messages
 *   CDP/content script responses -> WebSocket (back to MCP server)
 */

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
  // Read auth token from extension storage (set by user during setup)
  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) {
    console.error('[bg] No auth token set. Go to extension options to configure.');
    setTimeout(connect, RECONNECT_DELAY);
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[bg] Connected, sending auth...');
    ws.send(JSON.stringify({ type: 'auth', token: authToken }));
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
    case 'navigate': return handleNavigate(msg);
    case 'snapshot': return handleSnapshot(msg);
    case 'screenshot': return handleScreenshot();
    case 'click': return handleContentAction(msg);
    case 'type': return handleContentAction(msg);
    case 'press_key': return handleContentAction(msg);
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

// --- Active Tab Helper ---

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return tab.id;
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

  // Enable Accessibility domain
  await cdpCommand(tabId, 'Accessibility.enable');

  // Get full accessibility tree
  const params = msg.depth ? { depth: msg.depth } : {};
  const result = await cdpCommand(tabId, 'Accessibility.getFullAXTree', params);

  // Format tree as text
  return formatAccessibilityTree(result.nodes);
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

/**
 * Convert CDP AXNode array into indented text tree.
 * Format: "  - role \"name\" [state1, state2]"
 */
function formatAccessibilityTree(nodes) {
  if (!nodes || nodes.length === 0) return '(empty accessibility tree)';

  // Build parent->children map
  const childMap = new Map();
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
    if (node.childIds) {
      childMap.set(node.nodeId, node.childIds);
    }
  }

  const lines = [];
  const rootId = nodes[0]?.nodeId;

  function walk(nodeId, depth) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const role = node.role?.value || 'generic';
    const name = node.name?.value || '';
    const ignored = node.ignored;

    // Skip ignored/generic nodes without useful info
    if (ignored || (role === 'generic' && !name)) {
      // Still walk children
      const children = childMap.get(nodeId) || [];
      for (const childId of children) walk(childId, depth);
      return;
    }

    // Build state list
    const states = [];
    if (node.properties) {
      for (const prop of node.properties) {
        if (prop.value?.value === true) states.push(prop.name);
        if (prop.name === 'checked' && prop.value?.value) states.push('checked');
        if (prop.name === 'disabled' && prop.value?.value === true) states.push('disabled');
        if (prop.name === 'expanded' && prop.value?.value === true) states.push('expanded');
      }
    }

    const indent = '  '.repeat(depth);
    const nameStr = name ? ` "${name}"` : '';
    const stateStr = states.length > 0 ? ` [${states.join(', ')}]` : '';
    lines.push(`${indent}- ${role}${nameStr}${stateStr}`);

    // Walk children
    const children = childMap.get(nodeId) || [];
    for (const childId of children) walk(childId, depth + 1);
  }

  walk(rootId, 0);

  // Truncate if too large (stay under 800KB for safety within 1MB limit)
  let result = `Accessibility Tree (${nodes.length} nodes):\n${lines.join('\n')}`;
  if (result.length > 800 * 1024) {
    result = result.substring(0, 800 * 1024) + '\n... (truncated)';
  }

  return result;
}

// --- Start ---
connect();

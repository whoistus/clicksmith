/**
 * Network capture module: tracks XHR/fetch requests via CDP Network domain.
 * Ring buffer keeps last N entries to prevent unbounded memory growth.
 * Security: captures URL + method + status only, NOT headers/bodies by default.
 */

const NETWORK_MAX_ENTRIES = 100;
const PENDING_TTL = 60_000; // evict pending entries older than 60s

/**
 * Safely test a string against a pattern.
 * Guards against ReDoS by limiting pattern length and falling back to substring.
 */
function safeMatchUrl(url, pattern) {
  if (!pattern) return true;
  // Reject overly complex patterns (ReDoS guard)
  if (pattern.length > 200) return url.includes(pattern);
  try {
    return new RegExp(pattern).test(url);
  } catch {
    return url.includes(pattern);
  }
}

class NetworkCapture {
  constructor() {
    /** @type {Map<string, object>} requestId -> entry */
    this._pending = new Map();
    /** @type {Array<object>} completed entries ring buffer */
    this._entries = [];
    this._tabId = null;
    this._listening = false;
  }

  /** Start capturing network events for a tab. Requires debugger already attached. */
  async start(tabId) {
    if (this._listening && this._tabId === tabId) return;
    this._tabId = tabId;

    await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Network.enable failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });

    this._listening = true;
  }

  /** Handle CDP event from chrome.debugger.onEvent listener. */
  handleEvent(method, params) {
    switch (method) {
      case 'Network.requestWillBeSent':
        this._onRequest(params);
        break;
      case 'Network.responseReceived':
        this._onResponse(params);
        break;
      case 'Network.loadingFinished':
        this._onFinished(params);
        break;
      case 'Network.loadingFailed':
        this._onFailed(params);
        break;
    }
  }

  _onRequest(params) {
    const { requestId, request, timestamp } = params;
    this._pending.set(requestId, {
      requestId,
      url: request.url,
      method: request.method,
      timestamp: Math.floor(timestamp * 1000),
      status: null,
      statusText: null,
      mimeType: null,
      complete: false,
      failed: false,
    });
  }

  _onResponse(params) {
    const entry = this._pending.get(params.requestId);
    if (!entry) return;
    entry.status = params.response.status;
    entry.statusText = params.response.statusText;
    entry.mimeType = params.response.mimeType;
  }

  _onFinished(params) {
    const entry = this._pending.get(params.requestId);
    if (!entry) return;
    entry.complete = true;
    this._pending.delete(params.requestId);
    this._push(entry);
  }

  _onFailed(params) {
    const entry = this._pending.get(params.requestId);
    if (!entry) return;
    entry.failed = true;
    entry.errorText = params.errorText;
    this._pending.delete(params.requestId);
    this._push(entry);
  }

  /** Add entry to ring buffer, evict oldest if full. */
  _push(entry) {
    this._entries.push(entry);
    if (this._entries.length > NETWORK_MAX_ENTRIES) {
      this._entries.shift();
    }
  }

  /**
   * Get log entries, optionally filtered by URL pattern.
   * @param {string} [filter] - substring or regex pattern to match URL
   * @returns {Array<object>}
   */
  getLog(filter) {
    this._evictStalePending();
    if (!filter) return [...this._entries];
    return this._entries.filter(e => safeMatchUrl(e.url, filter));
  }

  /** Evict pending entries older than TTL (M1: prevent unbounded growth). */
  _evictStalePending() {
    const now = Date.now();
    for (const [id, entry] of this._pending) {
      if (now - entry.timestamp > PENDING_TTL) this._pending.delete(id);
    }
  }

  /**
   * Find first entry matching URL pattern and optional status code.
   * Searches most recent first.
   * @param {string} urlPattern - regex or substring
   * @param {number} [status] - expected HTTP status
   * @returns {object|null}
   */
  findMatch(urlPattern, status) {
    const entries = [...this._entries].reverse();
    for (const entry of entries) {
      if (!safeMatchUrl(entry.url, urlPattern)) continue;
      if (status !== undefined && entry.status !== status) continue;
      return entry;
    }
    return null;
  }

  /** Clear all entries. */
  clear() {
    this._entries = [];
    this._pending.clear();
  }

  /** Stop capturing (does not disable CDP domain — debugger may still be needed). */
  stop() {
    this._listening = false;
    this._tabId = null;
  }
}

// Singleton instance
const networkCapture = new NetworkCapture();

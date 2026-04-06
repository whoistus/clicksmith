/**
 * Console capture module: tracks console output via CDP Runtime domain.
 * Ring buffer keeps last N entries to prevent unbounded memory growth.
 */

const MAX_ENTRIES = 200;

class ConsoleCapture {
  constructor() {
    /** @type {Array<{level: string, text: string, timestamp: number}>} */
    this._entries = [];
    this._tabId = null;
    this._listening = false;
  }

  /** Start capturing console events for a tab. Requires debugger already attached. */
  async start(tabId) {
    if (this._listening && this._tabId === tabId) return;
    this._tabId = tabId;

    await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId }, 'Runtime.enable', {}, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Runtime.enable failed: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    });

    this._listening = true;
  }

  /** Handle CDP event from chrome.debugger.onEvent listener. */
  handleEvent(method, params) {
    if (method === 'Runtime.consoleAPICalled') {
      this._onConsole(params);
    }
  }

  _onConsole(params) {
    const { type, args, timestamp } = params;
    // Join args into text representation
    const text = (args || [])
      .map(arg => {
        if (arg.type === 'string') return arg.value;
        if (arg.type === 'number' || arg.type === 'boolean') return String(arg.value);
        if (arg.description) return arg.description;
        return JSON.stringify(arg.value ?? arg.type);
      })
      .join(' ');

    this._entries.push({
      level: type || 'log', // log, warn, error, info, debug
      text,
      timestamp: Math.floor(timestamp),
    });

    if (this._entries.length > MAX_ENTRIES) {
      this._entries.shift();
    }
  }

  /**
   * Get log entries, optionally filtered by level.
   * @param {string} [level] - filter by level (log, warn, error, info, debug)
   * @returns {Array<{level: string, text: string, timestamp: number}>}
   */
  getLog(level) {
    if (!level) return [...this._entries];
    return this._entries.filter(e => e.level === level);
  }

  /** Clear all entries. */
  clear() {
    this._entries = [];
  }

  /** Stop capturing. */
  stop() {
    this._listening = false;
    this._tabId = null;
  }
}

// Singleton instance
const consoleCapture = new ConsoleCapture();

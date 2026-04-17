/**
 * Content script: DOM-based ARIA element resolution and interaction.
 * Injected into all pages. Receives messages from background service worker.
 *
 * ARIA resolution priority:
 *   1. Explicit role attribute
 *   2. Implicit role from HTML tag
 *   3. Accessible name: aria-labelledby -> aria-label -> label[for] -> textContent -> placeholder
 */

// --- Implicit Role Mapping ---
const IMPLICIT_ROLES = {
  a: (el) => el.hasAttribute('href') ? 'link' : 'generic',
  button: () => 'button',
  input: (el) => {
    const type = (el.type || 'text').toLowerCase();
    const map = {
      checkbox: 'checkbox', radio: 'radio', range: 'slider',
      number: 'spinbutton', search: 'searchbox', email: 'textbox',
      tel: 'textbox', url: 'textbox', text: 'textbox', password: 'textbox',
      submit: 'button', reset: 'button', image: 'button',
    };
    return map[type] || 'textbox';
  },
  select: (el) => el.multiple ? 'listbox' : 'combobox',
  textarea: () => 'textbox',
  img: (el) => el.alt ? 'img' : 'presentation',
  h1: () => 'heading', h2: () => 'heading', h3: () => 'heading',
  h4: () => 'heading', h5: () => 'heading', h6: () => 'heading',
  nav: () => 'navigation',
  main: () => 'main',
  header: () => 'banner',
  footer: () => 'contentinfo',
  aside: () => 'complementary',
  form: () => 'form',
  table: () => 'table',
  ul: () => 'list', ol: () => 'list',
  li: () => 'listitem',
  dialog: () => 'dialog',
  details: () => 'group',
  summary: () => 'button',
  option: () => 'option',
  optgroup: () => 'group',
};

/** Get computed ARIA role for an element. */
function getRole(el) {
  // Explicit role takes precedence
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;

  // Implicit role from tag
  const tag = el.tagName.toLowerCase();
  const resolver = IMPLICIT_ROLES[tag];
  return resolver ? resolver(el) : 'generic';
}

/** Get accessible name for an element. */
function getAccessibleName(el) {
  // 1. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent.trim() : '';
    }).filter(Boolean);
    if (parts.length) return parts.join(' ');
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // 3. Associated label (for form elements)
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }
  // Also check wrapping label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get label text excluding the input's own text
    const clone = parentLabel.cloneNode(true);
    const inputs = clone.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.remove());
    const labelText = clone.textContent.trim();
    if (labelText) return labelText;
  }

  // 4. Title attribute
  const title = el.getAttribute('title');
  if (title) return title.trim();

  // 5. Placeholder (for inputs)
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();

  // 6. <option> — prefer label attribute, then textContent (per HTML spec)
  if (el.tagName === 'OPTION') return el.label || el.textContent.trim();

  // 7. Text content (for buttons, links, headings)
  const textRoles = ['button', 'link', 'heading', 'tab', 'menuitem', 'treeitem'];
  if (textRoles.includes(getRole(el))) {
    return el.textContent.trim();
  }

  // 7. Value/alt for specific elements
  if (el.tagName === 'IMG') return el.alt || '';
  if (el.tagName === 'INPUT' && el.type === 'submit') return el.value || 'Submit';

  return '';
}

// --- Deep DOM Traversal (Shadow DOM + iframes) ---

/** Collect all elements, piercing open shadow roots and same-origin iframes. */
function deepQueryAll(root) {
  const results = [];
  const walk = (node) => {
    for (const el of node.querySelectorAll('*')) {
      results.push(el);
      // Pierce open shadow roots
      if (el.shadowRoot) walk(el.shadowRoot);
      // Pierce same-origin iframes
      if (el.tagName === 'IFRAME') {
        try { if (el.contentDocument) walk(el.contentDocument); } catch { /* cross-origin */ }
      }
    }
  };
  walk(root);
  return results;
}

/** Find element by ARIA role and accessible name. Pierces shadow DOM + iframes. */
function findByRoleAndName(role, name) {
  const allElements = deepQueryAll(document);
  const nameLower = name.toLowerCase();

  let exactMatch = null;
  let partialMatch = null;

  for (const el of allElements) {
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML' && el.tagName !== 'OPTION' && el.tagName !== 'OPTGROUP') continue;
    const elRole = getRole(el);
    if (elRole !== role) continue;
    const elName = getAccessibleName(el).toLowerCase();
    if (elName === nameLower) { exactMatch = el; break; }
    if (!partialMatch && elName.includes(nameLower)) partialMatch = el;
  }

  return exactMatch || partialMatch || null;
}

/**
 * Summarize every element matching a role — used when an exact name match fails,
 * so Claude can see what the extension actually saw and retry without a snapshot.
 * Portal-heavy libs (base-ui, Radix) often have triggers whose accessible name
 * is the current value or placeholder, not the visible label.
 * @param {string} role
 * @param {number} [limit=10]
 * @returns {Array<{name: string, visible: boolean, tag: string}>}
 */
function findCandidatesByRole(role, limit = 10) {
  const allElements = deepQueryAll(document);
  const out = [];
  for (const el of allElements) {
    if (getRole(el) !== role) continue;
    out.push({
      name: getAccessibleName(el).substring(0, 80),
      visible: isElementVisible(el),
      tag: el.tagName.toLowerCase(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Build a "not found" error string with candidate hints appended. */
function notFoundError(role, name) {
  const candidates = findCandidatesByRole(role);
  if (candidates.length === 0) {
    return `No element found with role="${role}" name="${name}". No elements with role="${role}" exist on the page.`;
  }
  const hint = candidates
    .map((c, i) => `[${i}] name="${c.name}" visible=${c.visible}`)
    .join('; ');
  return `No element found with role="${role}" name="${name}". ${candidates.length} candidate(s) with role="${role}": ${hint}`;
}

// --- Action Handlers ---

function handleClick(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };

  // Native <option> inside <select>: delegate to select_option for proper event handling
  if (el.tagName === 'OPTION' && el.closest('select')) {
    const selectEl = el.closest('select');
    const selectRole = getRole(selectEl);
    const selectName = getAccessibleName(selectEl);
    return handleSelectOption({
      role: selectRole,
      name: selectName,
      value: el.textContent.trim(),
    });
  }

  // Scroll into view and click
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.click();
  return { data: `Clicked ${msg.role} "${msg.name}"` };
}

function handleType(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };

  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.focus();

  // Clear existing value
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, msg.text);
  } else {
    el.value = msg.text;
  }

  // Dispatch events to trigger React/Vue/Angular change detection
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { data: `Typed "${msg.text}" into ${msg.role} "${msg.name}"` };
}

// Map common key names to their correct KeyboardEvent.code values
const KEY_CODE_MAP = {
  Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace',
  Delete: 'Delete', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Home: 'Home',
  End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ' ': 'Space',
};

function handlePressKey(msg) {
  const target = document.activeElement || document.body;
  const code = KEY_CODE_MAP[msg.key] || (msg.key.length === 1 ? `Key${msg.key.toUpperCase()}` : msg.key);
  const keyEvent = new KeyboardEvent('keydown', {
    key: msg.key,
    code,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(keyEvent);

  const keyUpEvent = new KeyboardEvent('keyup', {
    key: msg.key,
    code,
    bubbles: true,
  });
  target.dispatchEvent(keyUpEvent);

  // Special: Enter on a form submits it
  if (msg.key === 'Enter' && target.form) {
    target.form.requestSubmit();
  }

  return { data: `Pressed key "${msg.key}"` };
}

// --- Visibility Check ---

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  // offsetParent null means hidden (except for body/html/fixed)
  if (!el.offsetParent && style.position !== 'fixed' && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
  return true;
}

// --- Find ALL elements matching role + name ---

function findAllByRoleAndName(role, name) {
  const allElements = document.querySelectorAll('*');
  const nameLower = name.toLowerCase();
  const matches = [];
  for (const el of allElements) {
    const elRole = getRole(el);
    if (elRole !== role) continue;
    const elName = getAccessibleName(el).toLowerCase();
    if (elName === nameLower || elName.includes(nameLower)) matches.push(el);
  }
  return matches;
}

// --- Assertion Handlers ---

function handleAssertVisible(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { data: { pass: false, message: `No element found with role="${msg.role}" name="${msg.name}"` } };
  const visible = isElementVisible(el);
  return {
    data: {
      pass: visible,
      message: visible
        ? `Element ${msg.role} "${msg.name}" is visible`
        : `Element ${msg.role} "${msg.name}" exists but is not visible`,
    },
  };
}

function handleAssertText(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { data: { pass: false, message: `No element found with role="${msg.role}" name="${msg.name}"` } };
  const actual = el.textContent.trim();
  const pass = actual.includes(msg.expected);
  return {
    data: {
      pass,
      message: pass
        ? `Text matches: "${msg.expected}" found in ${msg.role} "${msg.name}"`
        : `Expected "${msg.expected}" but got "${actual.substring(0, 200)}"`,
    },
  };
}

function handleAssertCount(msg) {
  const matches = findAllByRoleAndName(msg.role, msg.name);
  const actual = matches.length;
  const pass = actual === msg.count;
  return {
    data: {
      pass,
      message: pass
        ? `Count matches: ${actual} element(s) with role="${msg.role}" name="${msg.name}"`
        : `Expected ${msg.count} but found ${actual} element(s) with role="${msg.role}" name="${msg.name}"`,
    },
  };
}

function handleGetText(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };
  return { data: { text: el.textContent.trim() } };
}

// --- Wait Handlers (async with polling) ---

function handleWaitFor(msg, sendResponse) {
  const timeout = msg.timeout || 5000;
  const interval = 200;
  const start = Date.now();

  const poll = () => {
    const el = findByRoleAndName(msg.role, msg.name);
    if (el && isElementVisible(el)) {
      sendResponse({ data: { found: true, message: `Element ${msg.role} "${msg.name}" appeared` } });
      return;
    }
    if (Date.now() - start >= timeout) {
      sendResponse({ data: { found: false, message: `Timeout: ${msg.role} "${msg.name}" not found after ${timeout}ms` } });
      return;
    }
    setTimeout(poll, interval);
  };
  poll();
}

// --- Select Option Handler ---

/** Collect all options from a native <select> as [{value, text}]. Includes all options (no placeholder filtering). */
function collectNativeOptions(selectEl) {
  return Array.from(selectEl.options).map(o => ({ value: o.value, text: o.textContent.trim() }));
}

/**
 * Apply selection strategy to a list of options.
 * @param {Array<{value: string, text: string, element?: Element}>} options
 * @param {string|undefined} target - requested value/text
 * @param {'exact'|'first'|'random'|'fuzzy'} strategy
 * @returns {{match: object, method: string}|null}
 */
function applyStrategy(options, target, strategy) {
  if (target) {
    // All strategies attempt exact match first
    const targetLower = target.toLowerCase();
    const exact = options.find(o => o.value === target || o.text.toLowerCase() === targetLower);
    if (exact) return { match: exact, method: 'exact' };

    // Fuzzy: try partial match before fallback
    if (strategy === 'fuzzy') {
      const partial = options.find(o =>
        o.text.toLowerCase().includes(targetLower) || o.value.toLowerCase().includes(targetLower)
      );
      if (partial) return { match: partial, method: 'fuzzy' };
    }
  }

  // Fallback based on strategy
  if (strategy === 'first' || strategy === 'fuzzy') {
    return options.length ? { match: options[0], method: 'first_fallback' } : null;
  }
  if (strategy === 'random') {
    if (!options.length) return null;
    return { match: options[Math.floor(Math.random() * options.length)], method: 'random_fallback' };
  }

  // exact strategy: no fallback
  return null;
}

function handleSelectOption(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };

  el.scrollIntoView({ block: 'center', behavior: 'instant' });

  const values = Array.isArray(msg.values) ? msg.values : (msg.value != null ? [msg.value] : []);
  const strategy = msg.strategy || 'exact';

  // Native <select> element
  if (el.tagName === 'SELECT') {
    const options = Array.from(el.options);
    const available = collectNativeOptions(el);

    // Multi-select: keep existing behavior (strategy doesn't apply)
    if (el.multiple) {
      const selected = [];
      for (const opt of options) {
        const matchText = opt.textContent.trim().toLowerCase();
        const matchVal = opt.value.toLowerCase();
        const shouldSelect = values.some(v => v.toLowerCase() === matchText || v.toLowerCase() === matchVal);
        if (shouldSelect) { opt.selected = true; selected.push(opt.value); }
      }
      if (selected.length === 0) {
        // Use data path so available_options reaches Claude (eng review decision 1A)
        return { data: { success: false, error: 'No matching options found in multi-select', available_options: available.map(o => o.text) } };
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { data: { success: true, selectedValue: selected.length === 1 ? selected[0] : selected } };
    }

    // Single select with strategy
    const target = values[0];
    const result = applyStrategy(available, target, strategy);

    if (!result) {
      // Data path (not error path) so available_options reaches Claude
      return {
        data: {
          success: false,
          error: target ? `Option "${target}" not found in select` : 'No value specified and strategy is "exact"',
          available_options: available.map(o => o.text),
        },
      };
    }

    el.value = result.match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      data: {
        success: true,
        selectedValue: result.match.value,
        selectedText: result.match.text,
        method: result.method,
      },
    };
  }

  // Custom dropdown: MutationObserver-driven detection (replaces setTimeout polling)
  const OPTION_ROLES = ['option', 'listitem', 'menuitem', 'treeitem'];
  const MAX_WAIT = 2000;
  const SETTLE_MS = 80; // debounce: wait this long after last mutation before selecting

  return new Promise((resolve) => {
    let settled = false;
    let settleTimer = null;
    let fallbackTimer = null;
    let observer = null;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (observer) observer.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      resolve(payload);
    };

    const collectOptions = () => {
      const candidates = deepQueryAll(document).filter(c => {
        const r = getRole(c);
        return OPTION_ROLES.includes(r) && isElementVisible(c);
      });
      return candidates.map(c => ({
        value: c.getAttribute('data-value') || c.textContent.trim(),
        text: c.textContent.trim(),
        element: c,
      }));
    };

    const trySelect = () => {
      const options = collectOptions();
      if (options.length === 0) {
        finish({ data: { success: false, error: 'No dropdown options found after 2s', available_options: [] } });
        return;
      }

      const target = values[0];
      const result = applyStrategy(options, target, strategy);

      if (!result) {
        finish({
          data: {
            success: false,
            error: target ? `Option "${target}" not found in dropdown` : 'No value specified and strategy is "exact"',
            available_options: options.map(o => o.text),
          },
        });
        return;
      }

      result.match.element.scrollIntoView({ block: 'center', behavior: 'instant' });
      result.match.element.click();
      finish({
        data: {
          success: true,
          selectedValue: result.match.value,
          selectedText: result.match.text,
          method: result.method,
          available_options: options.map(o => o.text),
        },
      });
    };

    const scheduleSettle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(trySelect, SETTLE_MS);
    };

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) { scheduleSettle(); return; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    fallbackTimer = setTimeout(() => {
      if (collectOptions().length > 0) trySelect();
      else finish({ data: { success: false, error: 'No dropdown options found after 2s', available_options: [] } });
    }, MAX_WAIT);

    el.click();

    // Dropdown may already be rendered (CSS toggle, pre-existing DOM)
    if (collectOptions().length > 0) scheduleSettle();
  });
}

// --- Design QA: Element Style Inspector ---
// Extracts computed CSS + bounding box so Claude can diff live UI against design
// specs pulled from Figma MCP (or any design source). Keeps the payload compact —
// only the ~15 fields that matter for visual comparison.
function handleGetElementStyle(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };

  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();

  // Round bounds to integers — sub-pixel precision is noise for design diffs
  const bounds = {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };

  return {
    data: {
      // Color / fill
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      // Typography
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
      // Box model
      padding: cs.padding,
      margin: cs.margin,
      // Border / shape
      borderRadius: cs.borderRadius,
      borderWidth: cs.borderWidth,
      borderColor: cs.borderColor,
      borderStyle: cs.borderStyle,
      // Effects
      boxShadow: cs.boxShadow,
      opacity: cs.opacity,
      // Layout
      display: cs.display,
      position: cs.position,
      bounds,
    },
  };
}

// --- Hover Handler ---

function handleHover(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: notFoundError(msg.role, msg.name) };
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { data: `Hovered ${msg.role} "${msg.name}"` };
}

// --- SPA Navigation Detection ---

(function detectSpaNavigation() {
  let lastUrl = location.href;
  const notify = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      chrome.runtime.sendMessage({ type: 'url_changed', url: lastUrl });
    }
  };
  // Monkey-patch pushState/replaceState
  const origPush = history.pushState;
  history.pushState = function(...args) { origPush.apply(this, args); notify(); };
  const origReplace = history.replaceState;
  history.replaceState = function(...args) { origReplace.apply(this, args); notify(); };
  window.addEventListener('popstate', notify);
})();

// --- Message Listener ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    // Async handlers
    if (msg.type === 'wait_for') { handleWaitFor(msg, sendResponse); return true; }
    if (msg.type === 'select_option') {
      const result = handleSelectOption(msg);
      if (result instanceof Promise) { result.then(sendResponse); return true; }
      sendResponse(result); return true;
    }

    let result;
    switch (msg.type) {
      case 'click': result = handleClick(msg); break;
      case 'type': result = handleType(msg); break;
      case 'press_key': result = handlePressKey(msg); break;
      case 'hover': result = handleHover(msg); break;
      case 'assert_visible': result = handleAssertVisible(msg); break;
      case 'assert_text': result = handleAssertText(msg); break;
      case 'assert_count': result = handleAssertCount(msg); break;
      case 'get_text': result = handleGetText(msg); break;
      case 'get_element_style': result = handleGetElementStyle(msg); break;
      default:
        result = { error: `Unknown content action: ${msg.type}` };
    }
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
  return true;
});

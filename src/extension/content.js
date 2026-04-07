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

  // 6. Text content (for buttons, links, headings)
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
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') continue;
    const elRole = getRole(el);
    if (elRole !== role) continue;
    const elName = getAccessibleName(el).toLowerCase();
    if (elName === nameLower) { exactMatch = el; break; }
    if (!partialMatch && elName.includes(nameLower)) partialMatch = el;
  }

  return exactMatch || partialMatch || null;
}

// --- Action Handlers ---

function handleClick(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: `No element found with role="${msg.role}" name="${msg.name}"` };

  // Scroll into view and click
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  el.click();
  return { data: `Clicked ${msg.role} "${msg.name}"` };
}

function handleType(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: `No element found with role="${msg.role}" name="${msg.name}"` };

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
  if (!el) return { error: `No element found with role="${msg.role}" name="${msg.name}"` };
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

function handleSelectOption(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: `No element found with role="${msg.role}" name="${msg.name}"` };

  el.scrollIntoView({ block: 'center', behavior: 'instant' });

  // Support both single value (string) and multiple values (array)
  const values = Array.isArray(msg.values) ? msg.values : [msg.value];

  // Native <select> element
  if (el.tagName === 'SELECT') {
    const options = Array.from(el.options);
    const selected = [];

    // For multi-select: toggle requested options
    if (el.multiple) {
      for (const opt of options) {
        const matchText = opt.textContent.trim().toLowerCase();
        const matchVal = opt.value.toLowerCase();
        const shouldSelect = values.some(v => v.toLowerCase() === matchText || v.toLowerCase() === matchVal);
        if (shouldSelect) { opt.selected = true; selected.push(opt.value); }
      }
    } else {
      // Single select: find matching option
      const target = values[0];
      const option = options.find(o => o.value === target || o.textContent.trim().toLowerCase() === target.toLowerCase());
      if (!option) return { error: `Option "${target}" not found in select` };
      el.value = option.value;
      selected.push(option.value);
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { data: { success: true, selectedValue: selected.length === 1 ? selected[0] : selected } };
  }

  // Custom dropdown: click to open, search portals + deep DOM for option
  el.click();
  return new Promise((resolve) => {
    setTimeout(() => {
      // Search entire document (portals render at body level, not under trigger)
      const allEls = deepQueryAll(document);
      const target = values[0]?.toLowerCase();
      const match = allEls.find(candidate => {
        const r = getRole(candidate);
        if (!['option', 'listitem', 'menuitem', 'treeitem'].includes(r)) return false;
        const text = candidate.textContent.trim().toLowerCase();
        const val = candidate.getAttribute('data-value')?.toLowerCase();
        return text === target || val === target;
      });
      if (match) {
        match.scrollIntoView({ block: 'center', behavior: 'instant' });
        match.click();
        resolve({ data: { success: true, selectedValue: values[0] } });
      } else {
        resolve({ error: `Option "${values[0]}" not found in dropdown. Searched ${allEls.length} elements.` });
      }
    }, 300);
  });
}

// --- Hover Handler ---

function handleHover(msg) {
  const el = findByRoleAndName(msg.role, msg.name);
  if (!el) return { error: `No element found with role="${msg.role}" name="${msg.name}"` };
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
      default:
        result = { error: `Unknown content action: ${msg.type}` };
    }
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
  return true;
});

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

/** Find element by ARIA role and accessible name. Case-insensitive name match. */
function findByRoleAndName(role, name) {
  const allElements = document.querySelectorAll('*');
  const nameLower = name.toLowerCase();

  // Single pass: collect candidates, prefer exact match over partial
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

// --- Message Listener ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  try {
    let result;
    switch (msg.type) {
      case 'click': result = handleClick(msg); break;
      case 'type': result = handleType(msg); break;
      case 'press_key': result = handlePressKey(msg); break;
      default:
        result = { error: `Unknown content action: ${msg.type}` };
    }
    sendResponse(result);
  } catch (err) {
    sendResponse({ error: err.message });
  }
  return true; // keep channel open for async
});

# Chrome DevTools Protocol: Accessibility Tree & ARIA-First Patterns

**Date:** 2026-04-06 | **Status:** Research Complete

---

## 1. CDP Accessibility.getFullAXTree

### API Signature
```javascript
chrome.debugger.sendCommand(tabId, "Accessibility.getFullAXTree", {
  depth: 2,        // optional: max depth, omit for full tree
  frameId: "..."   // optional: frame ID, omit for root frame
}, (result) => {
  console.log(result.nodes); // Array of AXNode objects
});
```

### AXNode Response Structure
Each AXNode contains:
- **nodeId** — unique identifier
- **role** — ARIA role (button, link, textbox, etc.)
- **name** — accessible name (label text, aria-label, etc.)
- **description** — accessible description
- **value** — current value (for inputs, selects)
- **properties** — array of AXPropertyEntry {name, value}
- **childIds** — array of child node IDs
- **parentId** — parent node ID
- **states** — accessibility states (disabled, checked, expanded, etc.)
- **attributes** — ARIA attributes (aria-pressed, aria-expanded, etc.)

### Extraction Example
```javascript
function extractSemantics(node) {
  return {
    role: node.role?.value || 'generic',
    name: node.name?.value || '',
    isInteractive: ['button', 'link', 'textbox', 'checkbox'].includes(node.role?.value)
  };
}
```

### Key Notes
- Must call `Accessibility.enable` before using tree methods
- Full tree depth can be large; use `depth` parameter to limit queries
- Reflects Blink's internal AX tree, matching ARIA specification roles

---

## 2. chrome.debugger API Requirements

### Manifest Permissions
```json
{
  "manifest_version": 3,
  "permissions": ["debugger"],
  "host_permissions": ["<all_urls>"]
}
```

### Attach/Detach Flow
```javascript
// Attach debugger to tab
chrome.debugger.attach({tabId: tabId}, "1.3", () => {
  if (chrome.runtime.lastError) {
    console.error("Attach failed:", chrome.runtime.lastError);
    return;
  }
  console.log("Debugger attached");
});

// Enable Accessibility domain
chrome.debugger.sendCommand({tabId: tabId}, "Accessibility.enable", {}, () => {
  // Now can call getFullAXTree
});

// Detach when done
chrome.debugger.detach({tabId: tabId}, () => {
  console.log("Debugger detached");
});
```

### UX Impact
- Yellow "debugging" bar appears at top of tab
- Visible to user; cannot be hidden
- Users may perceive browser activity or potential security concern
- Debugger persists until `detach()` is called

### Protocol Versions
- Use version "1.3" or higher for modern CDP features
- Check `chrome.debugger.getVersion()` for browser capability

---

## 3. ARIA-First DOM Fallback (No CDP)

### Role Detection via DOM
```javascript
// Detect computed role without CDP
function getElementRole(element) {
  // ARIA explicit role takes precedence
  const ariaRole = element.getAttribute('role');
  if (ariaRole) return ariaRole;
  
  // Implicit role based on tag
  const implicitRoles = {
    'button': 'button',
    'a': 'link',
    'input': element.type === 'checkbox' ? 'checkbox' : 'textbox',
    'h1': 'heading', 'h2': 'heading', 'h3': 'heading',
    'nav': 'navigation',
    'main': 'main',
    'footer': 'contentinfo'
  };
  
  return implicitRoles[element.tagName.toLowerCase()] || 'generic';
}

// Extract accessible name
function getAccessibleName(element) {
  // 1. aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = document.getElementById(labelledBy);
    if (label) return label.textContent;
  }
  
  // 2. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // 3. Associated label (for inputs)
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent;
  }
  
  // 4. text content / placeholder
  return element.textContent?.trim() || element.placeholder || '';
}
```

### Query by Role + Name
```javascript
function findElementByRoleAndName(role, name) {
  // Get all elements with matching role
  const candidates = Array.from(
    document.querySelectorAll('[role], button, a, input, select, textarea')
  );
  
  return candidates.find(el => {
    return getElementRole(el) === role && 
           getAccessibleName(el).toLowerCase() === name.toLowerCase();
  });
}

// Usage
const submitBtn = findElementByRoleAndName('button', 'Submit');
```

### Limitations
- Cannot fully replicate browser's computed name algorithm
- aria-labelledby resolution is simplified
- Implicit roles may vary by browser
- No access to shadow DOM without query selectors

---

## 4. Network Capture via CDP

### Request Tracking
```javascript
// Enable Network domain
chrome.debugger.sendCommand({tabId}, "Network.enable", {}, () => {
  // Now receive network events
});

// Listen for requests
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Network.requestWillBeSent") {
    const {requestId, request, timestamp} = params;
    console.log("Request:", request.url, request.method);
  }
  
  if (method === "Network.responseReceived") {
    const {requestId, response} = params;
    console.log("Response:", response.status, response.url);
    
    // Fetch response body
    chrome.debugger.sendCommand({tabId}, "Network.getResponseBody", 
      {requestId}, (result) => {
        console.log("Body:", result.body);
      });
  }
  
  if (method === "Network.loadingFinished") {
    const {requestId} = params;
    // Request complete
  }
});
```

### Full Flow
```javascript
const requestMap = new Map();

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Network.requestWillBeSent") {
    requestMap.set(params.requestId, {
      url: params.request.url,
      method: params.request.method,
      headers: params.request.headers,
      postData: params.request.postData
    });
  }
  
  if (method === "Network.responseReceived") {
    const entry = requestMap.get(params.requestId);
    entry.status = params.response.status;
    entry.headers = params.response.headers;
  }
  
  if (method === "Network.loadingFinished") {
    const entry = requestMap.get(params.requestId);
    chrome.debugger.sendCommand({tabId}, "Network.getResponseBody",
      {requestId: params.requestId}, (result) => {
        entry.body = result.body;
        entry.base64Encoded = result.base64Encoded;
        // Use entry (complete request + response)
      });
  }
});
```

### Gotchas
- **"No resource with given identifier"** — Call `getResponseBody` before loading finishes; use `loadingFinished` event
- **Headers not in requestWillBeSent** — Use `Network.requestWillBeSentExtraInfo` for full headers
- **Base64 encoding** — Check `result.base64Encoded` flag; decode if needed

---

## 5. Screenshot Capture Methods

### chrome.tabs.captureVisibleTab
```javascript
// Capture only visible viewport
chrome.tabs.captureVisibleTab({
  format: 'png',  // or 'jpeg'
  quality: 90     // JPEG quality
}, (dataUrl) => {
  // dataUrl is PNG/JPEG data URL
  const img = new Image();
  img.src = dataUrl;
});
```

**Pros:**
- Simple API, no debugger attachment needed
- Captures sensitive sites (with activeTab permission)
- Native performance

**Cons:**
- Visible area only; no full-page scroll capture
- Cannot capture shadow DOM
- Expensive operation; limit frequency

**Permissions:**
```json
"permissions": ["activeTab"] // or <all_urls>
```

### CDP Page.captureScreenshot
```javascript
// Full-page or viewport capture via CDP
chrome.debugger.sendCommand({tabId}, "Page.captureScreenshot", {
  format: 'png',
  quality: 90,
  fromSurface: true,        // Capture from display list
  captureBeyondViewport: true  // Extend beyond visible area
}, (result) => {
  const pngBase64 = result.data;
  const blob = base64ToBlob(pngBase64, 'image/png');
});

function base64ToBlob(base64, mimeType) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], {type: mimeType});
}
```

**Pros:**
- Full-page capture (with `captureBeyondViewport`)
- Fine-grained control over viewport
- Better for headless scenarios

**Cons:**
- Requires debugger attachment (yellow bar)
- Slower than `captureVisibleTab`

### Comparison Table

| Feature | captureVisibleTab | Page.captureScreenshot |
|---------|-------------------|------------------------|
| Visible area only | Yes | No (extensible) |
| Requires debugger | No | Yes |
| Full page | No | Yes |
| Setup complexity | Low | Medium |
| Performance | Fast | Medium |
| Sensitive sites | Yes (activeTab) | Yes (with debugger) |

---

## Key Insights

1. **CDP accessibility.getFullAXTree is powerful** — exposes same role/name data browser uses internally; best for semantic automation
2. **Debugger yellow bar is unavoidable** — plan UX accordingly; transparent approach recommended
3. **DOM fallback is viable** — simpler than CDP, covers 80% of cases; combine with CDP for edge cases
4. **Network.getResponseBody timing is critical** — always wait for loadingFinished before requesting body
5. **Screenshot choice depends on scope** — visible tab is fast; CDP enables full-page automation

---

## Unresolved Questions

- How does Chromium handle implicit role computation for custom elements? (No native API exposed)
- Can `Accessibility.getPartialAXTree` query subtrees more efficiently than full tree + filtering?
- Is Network.getResponseBody available for data: URLs, blob: URLs in extensions?

---

## Sources

- [Chrome DevTools Protocol - Accessibility domain](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [chrome.debugger API Reference](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Full accessibility tree in Chrome DevTools](https://developer.chrome.com/blog/full-accessibility-tree)
- [Chrome DevTools Protocol - Network domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Chrome DevTools Protocol - Page domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/)
- [chrome.tabs API Reference](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Testing Library - ByRole](https://testing-library.com/docs/queries/byrole/)
- [Accessible Name Computation (WICG Discussion)](https://discourse.wicg.io/t/dom-apis-to-expose-accessible-role-states-properties/693/)

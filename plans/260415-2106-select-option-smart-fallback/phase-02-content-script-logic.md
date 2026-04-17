# Phase 2: Content Script Logic

- **Parent:** [plan.md](plan.md)
- **Dependencies:** [Phase 1](phase-01-protocol-schema.md)
- **Status:** pending
- **Effort:** 1h

## Overview

Rewrite `handleSelectOption` in `content.js` (lines 340-399) with strategy support, polling for custom dropdowns, and `available_options` in error responses.

## Related Files

- `src/extension/content.js` — `handleSelectOption` (line 340-399), `findByRoleAndName` (line 135)

## Key Insights

- Extension code is **plain JS** — no TypeScript, no type annotations
- `handleSelectOption` is called from two places: message listener (line 436) and `handleClick` delegation (line 165)
- The `handleClick` delegation passes `{ role, name, value }` without strategy — defaults to `exact` behavior, which is correct
- Custom dropdown path returns a Promise; native `<select>` path returns sync — both patterns must be preserved

## Architecture

```
handleSelectOption(msg)
  ├── Extract strategy (default: 'exact')
  ├── Extract available options helper: collectOptions(el) → [{value, text}]
  │
  ├── Native <select>:
  │   ├── Try exact match on value/text
  │   ├── If no match → apply strategy:
  │   │   ├── exact: error + available_options
  │   │   ├── first: select options[0] (skip empty placeholder)
  │   │   ├── random: select random from options
  │   │   └── fuzzy: partial match → first fallback
  │   └── Return { success, selectedValue, selectedText }
  │
  └── Custom dropdown:
      ├── Click to open
      ├── Poll every 50ms up to 2000ms for option elements
      ├── Once options found → apply strategy (same as native)
      └── Return { success, selectedValue } or { error, available_options }
```

## Implementation Steps

### 2.1 Add `collectNativeOptions` helper

Extract option text/value from a native `<select>` element. Skip the first option if it's a placeholder (empty value + text like "Select...", "Choose...", "--").

```javascript
function collectNativeOptions(selectEl) {
  return Array.from(selectEl.options)
    .filter(o => o.value !== '')  // skip empty-value placeholders
    .map(o => ({ value: o.value, text: o.textContent.trim() }));
}
```

### 2.2 Add `applyStrategy` helper

Shared logic for both native and custom dropdown paths:

```javascript
function applyStrategy(options, target, strategy) {
  // options: [{value, text, element?}]
  // target: string (the requested value) or undefined
  // strategy: 'exact' | 'first' | 'random' | 'fuzzy'
  
  if (target) {
    // Try exact match first (all strategies attempt exact before fallback)
    const exact = options.find(o =>
      o.value === target ||
      o.text.toLowerCase() === target.toLowerCase()
    );
    if (exact) return { match: exact, method: 'exact' };
    
    // Fuzzy: try partial match
    if (strategy === 'fuzzy') {
      const partial = options.find(o =>
        o.text.toLowerCase().includes(target.toLowerCase()) ||
        o.value.toLowerCase().includes(target.toLowerCase())
      );
      if (partial) return { match: partial, method: 'fuzzy' };
    }
  }
  
  // Apply fallback based on strategy
  if (strategy === 'first' || strategy === 'fuzzy') {
    return options.length ? { match: options[0], method: 'first_fallback' } : null;
  }
  if (strategy === 'random') {
    if (!options.length) return null;
    const idx = Math.floor(Math.random() * options.length);
    return { match: options[idx], method: 'random_fallback' };
  }
  
  // exact strategy: no fallback
  return null;
}
```

### 2.3 Rewrite native `<select>` path (lines 349-373)

Replace hard-fail with strategy-aware selection:

```javascript
if (el.tagName === 'SELECT') {
  const options = Array.from(el.options);
  const available = collectNativeOptions(el);
  const strategy = msg.strategy || 'exact';
  
  // Multi-select: keep existing behavior (strategy doesn't apply)
  if (el.multiple) {
    // ... existing multi-select logic unchanged ...
    // But add available_options to error if none matched
  }
  
  // Single select with strategy
  const target = values[0];
  const result = applyStrategy(
    available.map(o => ({ ...o, element: options.find(opt => opt.value === o.value) })),
    target,
    strategy
  );
  
  if (!result) {
    return {
      error: target
        ? `Option "${target}" not found in select`
        : 'No value specified and strategy is "exact"',
      available_options: available.map(o => o.text),
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
```

### 2.4 Rewrite custom dropdown path (lines 376-398)

Replace fixed 300ms timeout with polling + strategy:

```javascript
// Custom dropdown: click to open, poll for options
el.click();
const strategy = msg.strategy || 'exact';

return new Promise((resolve) => {
  const POLL_INTERVAL = 50;
  const MAX_WAIT = 2000;
  const start = Date.now();
  
  const poll = () => {
    const allEls = deepQueryAll(document);
    const optionRoles = ['option', 'listitem', 'menuitem', 'treeitem'];
    const candidates = allEls.filter(c => {
      const r = getRole(c);
      return optionRoles.includes(r) && isElementVisible(c);
    });
    
    // No options found yet — keep polling if under timeout
    if (candidates.length === 0 && Date.now() - start < MAX_WAIT) {
      setTimeout(poll, POLL_INTERVAL);
      return;
    }
    
    const options = candidates.map(c => ({
      value: c.getAttribute('data-value') || c.textContent.trim(),
      text: c.textContent.trim(),
      element: c,
    }));
    
    if (options.length === 0) {
      resolve({ error: 'No dropdown options found after 2s', available_options: [] });
      return;
    }
    
    const target = values[0];
    const result = applyStrategy(options, target, strategy);
    
    if (!result) {
      resolve({
        error: target
          ? `Option "${target}" not found in dropdown`
          : 'No value specified and strategy is "exact"',
        available_options: options.map(o => o.text),
      });
      return;
    }
    
    result.match.element.scrollIntoView({ block: 'center', behavior: 'instant' });
    result.match.element.click();
    resolve({
      data: {
        success: true,
        selectedValue: result.match.value,
        selectedText: result.match.text,
        method: result.method,
      },
    });
  };
  
  // Start polling after brief initial delay (dropdown needs first frame to render)
  setTimeout(poll, 50);
});
```

### 2.5 Handle `handleClick` delegation (line 165)

No changes needed. The delegation at line 165 passes `{ role, name, value }` without `strategy`, which defaults to `'exact'` — preserving current click-on-option behavior.

## Error Response Format

Current: `{ error: "Option X not found in select" }`

New: `{ error: "Option X not found in select", available_options: ["Option A", "Option B", "Option C"] }`

This lets Claude self-correct in a single retry without needing a snapshot.

## Success Criteria

- [ ] `select_option` with no strategy behaves identically to current (backward compat)
- [ ] `strategy: "first"` selects first non-placeholder option without requiring value
- [ ] `strategy: "random"` selects a random option without requiring value
- [ ] `strategy: "fuzzy"` does partial match, falls back to first
- [ ] Error responses include `available_options` array
- [ ] Custom dropdown polls instead of fixed 300ms timeout
- [ ] Success responses include `selectedText` and `method` fields
- [ ] `handleClick` delegation still works (no strategy = exact)

## Risk Assessment

- **Low:** Strategy logic is simple enum dispatch, easy to test
- **Medium:** Custom dropdown polling might find stale options from previous interactions → mitigated by checking `isElementVisible`
- **Low:** `available_options` in error adds payload but is small (dropdown options are typically <50 items)

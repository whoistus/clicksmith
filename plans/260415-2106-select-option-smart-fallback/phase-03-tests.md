# Phase 3: Tests

- **Parent:** [plan.md](plan.md)
- **Dependencies:** [Phase 1](phase-01-protocol-schema.md), [Phase 2](phase-02-content-script-logic.md)
- **Status:** pending
- **Effort:** 30m

## Overview

Add tests for the new `strategy` field in protocol types and tool schema. Content script logic (`content.js`) can't be unit-tested in vitest (runs in Chrome context), so coverage is via protocol + schema tests + manual QA.

## Related Files

- `src/shared/protocol.test.ts` — type construction tests
- `src/host/tool-definitions.test.ts` — schema validation tests

## Implementation Steps

### 3.1 Protocol type tests (`src/shared/protocol.test.ts`)

Add test for `SelectOptionRequest` with strategy:

```typescript
import type { SelectOptionRequest } from './protocol.js';

it('should construct SelectOptionRequest with strategy', () => {
  const req: SelectOptionRequest = {
    type: MessageType.SELECT_OPTION,
    id: 'r1',
    role: 'combobox',
    name: 'Country',
    value: 'Vietnam',
    strategy: 'fuzzy',
  };
  expect(req.strategy).toBe('fuzzy');
  expect(req.value).toBe('Vietnam');
});

it('should construct SelectOptionRequest without value when using first strategy', () => {
  const req: SelectOptionRequest = {
    type: MessageType.SELECT_OPTION,
    id: 'r2',
    role: 'combobox',
    name: 'Country',
    strategy: 'first',
  };
  expect(req.strategy).toBe('first');
  expect(req.value).toBeUndefined();
});

it('should construct SelectOptionRequest with values array', () => {
  const req: SelectOptionRequest = {
    type: MessageType.SELECT_OPTION,
    id: 'r3',
    role: 'listbox',
    name: 'Tags',
    values: ['red', 'blue'],
    strategy: 'exact',
  };
  expect(req.values).toEqual(['red', 'blue']);
});
```

### 3.2 Tool schema tests (`src/host/tool-definitions.test.ts`)

Add test for `select_option` schema having `strategy` property:

```typescript
it('should have strategy enum on select_option tool', () => {
  const selectOption = ALL_TOOLS.find(t => t.name === 'select_option');
  expect(selectOption).toBeDefined();
  const strategyProp = selectOption?.inputSchema.properties.strategy;
  expect(strategyProp).toBeDefined();
  expect(strategyProp.type).toBe('string');
  expect(strategyProp.enum).toEqual(['exact', 'first', 'random', 'fuzzy']);
});

it('should not require value on select_option (strategy can pick)', () => {
  const selectOption = ALL_TOOLS.find(t => t.name === 'select_option');
  expect(selectOption?.inputSchema.required).toEqual(['role', 'name']);
  expect(selectOption?.inputSchema.required).not.toContain('value');
});
```

### 3.3 Run tests

```bash
npm test
```

Verify all existing tests still pass + new tests pass.

## Success Criteria

- [ ] All existing tests pass (no regressions)
- [ ] New protocol tests verify `SelectOptionRequest` with all 4 strategies
- [ ] New schema tests verify `strategy` enum exists with correct values
- [ ] `value` is confirmed optional in both type and schema

## Manual QA Checklist (post-implementation)

Since `content.js` runs in Chrome, test these manually:

- [ ] `select_option(combobox, "Country", value="Vietnam")` — exact match works
- [ ] `select_option(combobox, "Country", strategy="first")` — selects first non-placeholder
- [ ] `select_option(combobox, "Country", value="viet", strategy="fuzzy")` — partial match
- [ ] `select_option(combobox, "Country", value="nonexistent")` — error includes `available_options`
- [ ] Custom dropdown with animation delay — polling finds options
- [ ] Multi-select still works (strategy ignored for multi)

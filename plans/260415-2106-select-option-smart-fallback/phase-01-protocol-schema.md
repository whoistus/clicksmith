# Phase 1: Protocol & Schema

- **Parent:** [plan.md](plan.md)
- **Status:** pending
- **Effort:** 20m

## Overview

Add `strategy` field to the protocol type and tool schema. Pass-through in mcp-server.ts (already spreads args).

## Related Files

- `src/shared/protocol.ts` — `SelectOptionRequest` interface (line 160-166)
- `src/host/tool-definitions.ts` — `select_option` schema (line 113-115)
- `src/host/mcp-server.ts` — routing at line 104, `callExtension` at line 171

## Implementation Steps

### 1.1 Update `SelectOptionRequest` in `src/shared/protocol.ts`

Add `strategy` and `values` fields to the interface:

```typescript
export interface SelectOptionRequest {
  type: MessageType.SELECT_OPTION;
  id: string;
  role: string;
  name: string;
  value?: string;          // was required, now optional (strategy can pick)
  values?: string[];       // already supported in content.js but not typed
  strategy?: 'exact' | 'first' | 'random' | 'fuzzy';
}
```

**Note:** `value` changes from required to optional — when strategy is `first`/`random`, caller may omit it.

### 1.2 Update tool schema in `src/host/tool-definitions.ts`

Add `strategy` property to `select_option` inputSchema:

```javascript
{
  name: 'select_option',
  description: 'Select option(s) from a dropdown (native <select> or custom). Strategies: "exact" (default, error if not found), "first" (select first option), "random" (select random option), "fuzzy" (partial match, fallback to first). On error, returns available_options list.',
  inputSchema: {
    type: obj,
    properties: {
      role: { type: 'string', description: 'ARIA role (combobox, listbox)' },
      name: { type: 'string', description: 'Accessible name of dropdown' },
      value: { type: 'string', description: 'Option value or text (single select)' },
      values: { type: 'array', description: 'Array of values (multi-select)', items: { type: 'string' } },
      strategy: { type: 'string', enum: ['exact', 'first', 'random', 'fuzzy'], description: 'Selection strategy: exact (default), first, random, fuzzy (partial match)' },
    },
    required: ['role', 'name'],
  },
}
```

### 1.3 Verify mcp-server.ts pass-through

`mcp-server.ts:171` already does `{ type: messageType, ...args }` which spreads all args including `strategy`. No change needed, but verify the spread includes strategy by reading the line.

## Success Criteria

- [ ] `SelectOptionRequest.strategy` is typed with 4 enum values
- [ ] `SelectOptionRequest.value` is optional (was required)
- [ ] `SelectOptionRequest.values` is typed as `string[]`
- [ ] Tool schema includes `strategy` with enum and description
- [ ] Tool description mentions strategies and `available_options` on error
- [ ] `npm run build:host` compiles without errors

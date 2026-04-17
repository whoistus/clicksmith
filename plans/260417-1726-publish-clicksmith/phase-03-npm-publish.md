# Phase 3: npm Package Publish

**Effort:** 0.5 day
**Goal:** `npm install -g clicksmith` works for anyone.

## Prereqs

- npm account with 2FA enabled
- Package name `clicksmith` reserved (verify availability one more time before publishing)

## Checklist

### Package prep
- [ ] Bump `version` to `0.1.0` in package.json (first public release)
- [ ] Add `bin` field: `"bin": { "clicksmith": "./dist/host/mcp-server.js" }`
- [ ] Add shebang `#!/usr/bin/env node` to compiled entry (already present in source)
- [ ] Add `"files"` allowlist to avoid shipping `src/`, `plans/`, `node_modules/`
- [ ] Add `"main"` + `"type": "module"` (ensure ESM is configured)
- [ ] Verify `postinstall` script (if any) — users expect no magic on install

### Install script UX
- [ ] `npx clicksmith-setup <extension-id>` or similar — generates MCP config snippet
- [ ] Print copy-paste MCP config to stdout
- [ ] Offer to auto-patch `~/.config/claude-desktop/config.json` and `~/.claude/config.json` (opt-in)

### Testing the package locally
- [ ] `npm pack` to produce tarball
- [ ] `npm install -g ./clicksmith-0.1.0.tgz` in fresh shell
- [ ] Verify `clicksmith` command runs MCP server
- [ ] Verify `clicksmith-setup` (if added) works
- [ ] `npm uninstall -g clicksmith` — clean removal

### Publish
- [ ] `npm login`
- [ ] `npm publish --access public` (unscoped)
- [ ] Verify on npmjs.com/package/clicksmith
- [ ] Tag git: `git tag v0.1.0 && git push --tags`

### Post-publish
- [ ] Add npm badge to README
- [ ] Add bundle size badge (via packagephobia.com)
- [ ] Add GitHub Action that publishes to npm on tag push (automate future releases)

## Release cadence decision

- **0.x phase** — breaking changes allowed in minor versions (e.g. 0.1 → 0.2)
- **1.0** when: API stable, 3+ weeks of no bug reports on core tools, 5+ users shipped workflows
- Follow semver strictly after 1.0

## Unresolved

- Do you want `clicksmith-mcp` as an alternate/alias name for MCP ecosystem discoverability? Some MCP tools do this (e.g. `@mcp/filesystem`). Probably not needed if the name is unique.
- Ship extension source inside the npm package (so `npm install` gives you both) or keep them separate? Recommend including `dist/extension/` so the install script can show the path users load-unpacked FROM the npm install dir as fallback if Web Store review is pending.

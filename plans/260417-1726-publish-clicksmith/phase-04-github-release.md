# Phase 4: GitHub Release (Extension Zip)

**Effort:** 0.5 day
**Goal:** Users download a zip from a GitHub Release, unzip it, load unpacked. No Chrome Web Store.

## Why this path

- Chrome Web Store review is 1-2 weeks and uncertain due to `debugger` permission
- Target audience (developers using Claude Code) already uses `load unpacked` regularly
- Faster to market, zero cost, full control over releases
- Trust signal: users can inspect the zip contents before loading

## Checklist

### Build script for releases
- [ ] Add `npm run package` script that produces `extension.zip` from `dist/extension/`
  ```json
  "scripts": {
    "package": "npm run build && cd dist/extension && zip -r ../../extension.zip ."
  }
  ```
- [ ] Verify zip contains: manifest.json, background.js, content.js, network-capture.js, console-capture.js, icons/
- [ ] Test: unzip to temp dir → load unpacked in Chrome → extension runs

### GitHub Actions: release on tag
- [ ] `.github/workflows/release.yml` — on push of tag `v*`:
  1. Checkout
  2. `npm ci && npm test && npm run build && npm run package`
  3. Create GitHub Release with tag name
  4. Upload `extension.zip` as release asset
  5. Upload MCP tarball as release asset too (`npm pack`)
  6. Also publish to npm (skip if tag is `v*-beta`)
- [ ] Set `NPM_TOKEN` secret in GitHub repo settings
- [ ] Set up release notes template that auto-fills from CHANGELOG.md

### First release: v0.1.0
- [ ] Update CHANGELOG.md with v0.1.0 entry
- [ ] `git tag v0.1.0`
- [ ] `git push --tags`
- [ ] Verify GitHub Action ran successfully
- [ ] Verify Release page has both `extension.zip` + MCP tarball attached
- [ ] Copy release URL for use in README + install script

### Install script improvements
- [ ] `npx clicksmith-setup` auto-detects latest release via GitHub API
- [ ] Downloads `extension.zip`, unzips to `~/.clicksmith/extension/`
- [ ] Prints clear instructions: "Open chrome://extensions, enable Developer mode, Load unpacked, select `~/.clicksmith/extension/`"
- [ ] Optionally writes Claude Desktop/Code MCP config snippet
- [ ] Clear uninstall path: `npx clicksmith-setup --uninstall`

### README snippets
- [ ] Install section with 3-step flow (npm install, download extension, configure Claude)
- [ ] Direct link to latest release: `https://github.com/USER/clicksmith/releases/latest`
- [ ] Badge showing latest version (shields.io pulls from GitHub Releases)

## Security notes for the release

Users need to trust the zip. Help them:
- [ ] Sign releases with `gpg` (optional, nice-to-have)
- [ ] Include SHA-256 checksum in release notes
- [ ] Link to exact source commit that produced the release
- [ ] README section: "Verify the extension zip matches the source" with one-line command

## Update flow (for existing users)

When you ship v0.1.1:
- Install script checks GitHub for latest release, downloads, overwrites `~/.clicksmith/extension/`
- User sees Chrome "Extension updated" notice or reloads manually
- No automatic updates (that's Chrome Web Store's job — acceptable tradeoff)

## Future path to Web Store (v0.2+)

When you're ready:
- Chrome Web Store review process becomes Phase 4 of v0.2 plan
- GitHub Release path stays as backup (power users still prefer it)
- Both coexist — users choose based on preference

## Unresolved

- Host the extension unpacked source in the same repo, or split into `clicksmith-mcp` + `clicksmith-extension` repos? Recommend single repo — split adds complexity with no user benefit.
- Do you want to provide a `.crx` signed extension (for enterprise auto-deploy via Chrome policy) in addition to the zip? Niche; skip for v0.1.

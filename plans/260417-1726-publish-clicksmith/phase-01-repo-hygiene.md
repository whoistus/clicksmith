# Phase 1: Repo Hygiene & Docs

**Effort:** 1 day
**Goal:** Make the repo safe to show strangers. First impression is README.

## Checklist

### Legal & meta
- [ ] Add `LICENSE` — MIT recommended (maximum OSS adoption)
- [ ] Add `CONTRIBUTING.md` — how to run tests, file bugs, submit PRs
- [ ] Add `CODE_OF_CONDUCT.md` — copy Contributor Covenant 2.1
- [ ] Add `SECURITY.md` — how to responsibly disclose; email contact
- [ ] Add `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md`
- [ ] Add `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] Add `CHANGELOG.md` — start with v0.1.0 entry

### README rewrite (MOST IMPORTANT)
Current README mentions "Chrome Like a Human" and is setup-focused. Rewrite for stranger-first-reader:

- [ ] Hero: 1-sentence pitch + animated GIF or screenshot of Claude doing a test
- [ ] Why Clicksmith (vs Playwright MCP, vs Stagehand)
- [ ] Quick start: `npm install -g clicksmith` → install extension → configure Claude
- [ ] Tool reference (table): all 28 tools with 1-line descriptions
- [ ] Example prompts users can copy-paste
- [ ] Architecture diagram (simple: Claude → MCP → WebSocket → Extension → Chrome)
- [ ] FAQ: "Why does it ask for debugger permission?" "Is my data sent anywhere?" "Can it break my browser?"
- [ ] Link to latest GitHub Release (extension zip)
- [ ] Link to demo video (Phase 5)

### Clean up artifacts
- [ ] Remove `testcase.csv` from working tree (appears to be personal test data)
- [ ] Review `plans/` — keep only the ones with reference value, archive the rest
- [ ] Add `.npmignore` so npm package doesn't ship `plans/`, `docs/setup.md` (outdated), tests, `dist/extension/`

### Package.json polish
- [ ] Fill in `description`, `keywords`, `author`, `homepage`, `repository`, `bugs`
- [ ] `keywords`: `["mcp", "claude", "chrome", "browser-automation", "qa", "testing", "accessibility"]`
- [ ] Add `"files": ["dist/host/**", "dist/extension/**", "README.md", "LICENSE"]`
- [ ] Add `bin` entry if you want `npx clicksmith` to work
- [ ] Set `"engines": { "node": ">=20" }`

### GitHub repo settings
- [ ] Add repo description + topics (matching npm keywords)
- [ ] Enable Discussions (for questions that aren't bugs)
- [ ] Enable Security Advisories
- [ ] Set up GitHub Actions CI: `npm test` on push + PR

## Success criteria

- Random developer lands on the repo and understands in <30 seconds what it does
- They can go from `git clone` to working setup in <5 minutes using README
- No embarrassing leftovers (TODOs, dead code, personal references)

## Unresolved

- Does the user want a dedicated GitHub org (e.g. `clicksmith-dev/clicksmith`) or personal account for the repo? Org signals "serious project", personal is lower friction.

---
title: "Publish Clicksmith to open source"
description: "Ship MCP to npm + extension as GitHub Release zip for load-unpacked install"
status: pending
priority: P1
effort: 3-5 days total (no Chrome Web Store wait)
branch: master
tags: [publish, launch, oss, npm, github-release]
created: 2026-04-17
revised: 2026-04-17
---

# Publish Clicksmith

## Problem

Clicksmith works locally. For OSS launch we need:
- MCP server published to npm for one-line install
- Chrome extension packaged as zip, attached to a GitHub Release for "load unpacked" install
- Public GitHub repo with docs polished enough for strangers
- Basic launch motion (HN, Twitter, Reddit) to get first 100 users

## Scope decision: SKIP Chrome Web Store for v0.1

Rationale: Chrome Web Store review is 1-2 weeks, demands privacy policy hosting, and scrutinizes `debugger` permission heavily. That's scope for v0.2 after we have real-user feedback. For launch, load-unpacked is acceptable for the developer-tool audience this targets — the same audience that uses `load unpacked` daily already.

Net effect: **3-5 days of work instead of 3-4 weeks elapsed.** Faster to market, faster to learn.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Repo hygiene & docs | pending | 1d | [phase-01-repo-hygiene.md](phase-01-repo-hygiene.md) |
| 2 | Security hardening | pending | 0.5d | [phase-02-security-hardening.md](phase-02-security-hardening.md) |
| 3 | npm package publish | pending | 0.5d | [phase-03-npm-publish.md](phase-03-npm-publish.md) |
| 4 | GitHub Release (extension zip) | pending | 0.5d | [phase-04-github-release.md](phase-04-github-release.md) |
| 5 | Launch assets (demo, screenshots) | pending | 1d | [phase-05-launch-assets.md](phase-05-launch-assets.md) |
| 6 | Launch day (HN, Twitter, MCP registry) | pending | 0.5d | [phase-06-launch-day.md](phase-06-launch-day.md) |
| 7 | Post-launch iterate | pending | ongoing | [phase-07-post-launch.md](phase-07-post-launch.md) |

## Critical path

```
Phase 1 (docs) ─┐
Phase 2 (sec)  ─┼─→ Phase 3 (npm) ──┐
Phase 5 (assets) ─┼─→ Phase 4 (release) ─→ Phase 6 (launch)
                 │
                 └─ runs in parallel with 1-3
```

Phase 3 + Phase 4 together form the installable product. Can ship on same day.

## Install flow users will experience

```bash
# 1. Install MCP
npm install -g clicksmith

# 2. Download extension from GitHub Release
curl -L -o clicksmith-ext.zip \
  https://github.com/USER/clicksmith/releases/download/v0.1.0/extension.zip
unzip clicksmith-ext.zip -d ~/clicksmith-ext

# 3. Load unpacked in Chrome
# Open chrome://extensions → Developer mode → Load unpacked → pick ~/clicksmith-ext

# 4. Configure Claude Desktop / Code
# Add to ~/.config/claude-desktop/config.json or ~/.claude/config.json:
# { "mcpServers": { "clicksmith": { "command": "clicksmith" } } }
```

Install script (`npx clicksmith-setup`) automates steps 2-4.

## Risks (simplified)

1. **`__skip__` auth bypass still in `background.js:40`** — MUST remove before launch. Phase 2 blocker.
2. **Name trademark** — quick USPTO search before publishing ($0, 5 min)
3. **Competition** — Playwright MCP + Stagehand exist. Edge: uses real Chrome session with real cookies. Lead with that everywhere.
4. **First-run friction** — "load unpacked" is 3 extra steps vs Web Store. Install script + clear README mitigate. Some users will bounce; accept that for launch.

## Success metrics (first 30 days)

- 300+ GitHub stars
- 500+ npm weekly installs
- 10+ GitHub issues with real use cases
- 1+ organic blog post from a user

## Budget

- Everything free (GitHub, npm). $0.

## Unresolved questions

1. npm package name — `clicksmith` (bare, free, recommended) or `@user/clicksmith` (scoped)?
2. License — MIT (max adoption, recommended) or Apache 2.0?
3. GitHub account — personal or new org?
4. Domain — skip for launch (GitHub URL is enough) or grab clicksmith.dev ($12/yr)?
5. Chrome Web Store — v0.2 goal after launch, or permanent "load unpacked only" stance?

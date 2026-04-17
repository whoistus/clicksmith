# Phase 5: Launch Assets

**Effort:** 1 day
**Goal:** Give launch posts + README the visual punch that converts scrollers to installers.

## Critical assets

### 1. Hero GIF or video
The single most important asset. Shows Claude doing something real:

**Best demo ideas (pick one):**
- QA a login flow + show test report (most universal, relatable)
- Compare a live page vs Figma design, auto-fix the CSS (shows the killer feature + visual drama)
- Fill out a complex form that would take a human 2 minutes, Claude does in 5 seconds (speed + wow factor)

**Format specs:**
- GIF for README: 15-30 seconds, <10MB, 800px wide
- MP4 for Twitter/YouTube: 60-90 seconds, 1920×1080
- Include captions/subtitles (auto-playing video has audio off by default)

### 2. Architecture diagram
Simple, readable. Excalidraw or Mermaid. Shows the flow:
```
Claude (Claude Code / Desktop)
   ↓ MCP (stdio)
Clicksmith MCP Server (Node)
   ↓ WebSocket (127.0.0.1:9333, auth token)
Chrome Extension (MV3)
   ↓ CDP + DOM
Your Real Chrome Tabs
```

### 3. Logo/icon
- 128×128 for Chrome Web Store
- Flat design, recognizable at 16×16
- Concept ideas: hammer + cursor icon (literal "click-smith"), anvil with click indicator, stylized C with a cursor through it
- Use [Figma](https://figma.com) or hire on Fiverr ($30-50 for clean logo)

### 4. Screenshots (5 for store)
1. Setup flow (`npx clicksmith-setup`) terminal output
2. Claude reading an accessibility snapshot
3. Claude executing a batch of actions
4. `get_element_style` output diffed against Figma
5. Structured test report from `end_test`

### 5. Launch post drafts

Write and get feedback BEFORE launch day. Three variants:

**HN title (optimized for front page):**
> "Show HN: Clicksmith – Give Claude hands in your real Chrome browser (open source)"

**Twitter thread (5-7 tweets):**
1. Hook: hero video + 1-sentence pitch
2. Problem: existing browser automation MCPs use headless/remote — lose cookies, extensions, real session
3. Solution: Clicksmith uses your actual Chrome via extension
4. Highlight features: 28 tools, ARIA-first, batch mode, design QA
5. How to install (link)
6. What's next / contribute
7. Credits / thanks

**Reddit r/MachineLearning / r/ClaudeAI post:**
- Longer-form write-up
- Include technical deep-dive on one interesting part (API payload correlation, MutationObserver for dropdowns, etc)
- Answers "why not Playwright MCP?" upfront

### 6. Demo prompt library
Ship a `/examples/` folder in repo with working prompts:
- `qa-login-flow.md` — full login test
- `form-autofill.md` — fill long signup form
- `design-qa.md` — compare with Figma
- `regression-test.md` — re-run a test after code changes

These become the first content users share ("check out what I did with Clicksmith").

## Nice-to-have

- Landing page (clicksmith.dev) — simple one-pager with hero video, install CTA, tool list. Ship via Vercel in an hour.
- Logo stickers (printful.com, ~$30) for conference giveaways

## Unresolved

- Who can give honest feedback on the hero video before launch? Bad first demo kills momentum. Share with 3-5 trusted developers in the Claude/MCP community first.
- Do you want a Discord/community space from day 1, or point people to GitHub Discussions? Discord = higher engagement but more work to moderate. Recommend GitHub Discussions for launch, open Discord if community grows past ~500 users.

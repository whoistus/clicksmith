# Phase 6: Launch Day

**Effort:** 0.5 day (+ availability for 24-48h to respond)
**Goal:** First 100 users and 500 stars in first week.

## Pre-launch checklist (must all be true)

- [ ] npm package published and `npm install -g clicksmith` works
- [ ] GitHub Release v0.1.0 published with `extension.zip` attached
- [ ] `npx clicksmith-setup` tested end-to-end on a fresh machine
- [ ] README polished with hero GIF + 3-step install flow
- [ ] Demo video published on YouTube (unlisted → public on launch day)
- [ ] GitHub repo public, topics set, description filled
- [ ] CI passing on master
- [ ] Available in Slack/Discord/Twitter to respond to comments for 24-48h after launch

## Timing

**Best day to launch:** Tuesday or Wednesday, 9-11am ET (peak HN audience in US + Europe awake)
**Avoid:** Friday afternoons, major US holidays, big industry event days (Anthropic announcements, OpenAI DevDay, etc)

## Launch sequence

### T-1 day: Soft launch
- [ ] Post to personal Twitter with "early access" framing — get 10-20 friendly installs/feedback
- [ ] Share in Claude Discord / MCP Discord with the same soft-launch framing
- [ ] Fix any blockers that friendly users hit

### T=0: Public launch

**Parallel posts (same day, same hour):**

1. **Hacker News** (Show HN) — most important
   - Title: `Show HN: Clicksmith – Give Claude hands in your real Chrome browser`
   - Body: 3 paragraphs — what it is, why you built it, how to try it. Link to GitHub.
   - **Engage in comments for 4-6 hours**. Every reply that goes answered = more eyes.

2. **Twitter/X thread**
   - Lead with hero video
   - Tag @AnthropicAI if relevant
   - Pin to profile for 1 week

3. **r/ClaudeAI + r/MCP** (Reddit)
   - Longer technical write-up
   - Different angle than HN (more implementation detail)

4. **dev.to article**
   - Tutorial format: "How I gave Claude hands in my browser with MCP"
   - Include working example prompts

5. **MCP Registry / Awesome MCP list**
   - Submit PR to [awesome-mcp-servers](https://github.com/modelcontextprotocol/servers) if it accepts third-party entries
   - Check official MCP registry (if one exists by April 2026)

### T+1 to T+7: Sustain
- [ ] Respond to every GitHub issue within 24h (signals active project)
- [ ] Merge small PRs fast (even typo fixes) — builds contributor momentum
- [ ] Post update tweet with metrics (if positive): "48 hours in, X stars, Y installs, thanks for the reception"

### T+14: Retrospective
- [ ] Count: GitHub stars, npm downloads, Chrome installs, issues filed, PRs merged
- [ ] Write postmortem blog post if interesting (gets a second wave of traffic)

## What makes or breaks HN

- **Title does 80% of the work** — mentions Claude, Chrome, open source
- **First 2-3 comments** set the tone. Have a friendly developer ready to post a genuine "I just tried this and X works well" comment within 15 minutes.
- **Don't be defensive** in replies. "Good point, I'll look at that" beats "actually you're wrong because..."
- **Be honest about limitations**. HN smells marketing BS from orbit.

## Preparing for negative feedback

Most likely criticisms (prepare responses):
1. *"Why not just use Playwright MCP?"* — A: "Uses your real browser session (cookies, extensions, logged-in state). Playwright MCP is great for CI, Clicksmith is for interactive QA."
2. *"The debugger permission is scary"* — A: "It shows the yellow 'being controlled' bar at all times. Everything is local. Source is open, audit it."
3. *"This is just a thin wrapper over CDP"* — A: "Yes. Value is in the ARIA-first tool design + test-case semantics + auto-correlation features, not the CDP plumbing."
4. *"Why a whole MCP instead of a CLI?"* — A: "MCP lets Claude use it natively with context. A CLI means scripting work; MCP means natural language + tool use."

## Unresolved

- Should the launch post mention specific customer names or use cases you've heard about? Social proof is powerful but requires permission.
- Do you want to coordinate launch with an Anthropic employee tweet/RT? Reach out beforehand — they often boost MCP launches.

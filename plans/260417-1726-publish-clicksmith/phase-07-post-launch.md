# Phase 7: Post-Launch

**Effort:** Ongoing (2-5 hours/week for first month)
**Goal:** Convert initial attention into a sustainable project.

## Week 1-2: Fire mode

- Respond to issues within 24h
- Fix crash bugs same-day if you can repro
- Merge simple PRs fast (encourages more)
- Post weekly update tweet/thread with stats + "what shipped"
- Listen to what people actually use it for (vs what you thought)

## Week 3-4: Consolidate

- First patch release (0.1.1) with top 3-5 bug fixes
- First minor release (0.2.0) with most-requested feature
- Write "lessons learned" blog post (drives second traffic wave)

## Ongoing signals to watch

| Signal | What it means | Action |
|--------|---------------|--------|
| Issues/week rising | People trying real things | Good — keep shipping |
| Issues/week flat | Early adopters lost interest | Investigate, maybe relaunch with new feature |
| Same feature requested 3+ times | Real demand | Prioritize |
| "Does this work with X?" | New integration request | Evaluate vs core focus |
| No one files issues | No one using it | Rethink positioning |

## Content pipeline (first 90 days)

- **Week 2:** "How we made select_option 8x faster with MutationObserver" (technical deep-dive)
- **Week 4:** "Lessons from launching an MCP tool" (meta, gets retweeted in the MCP community)
- **Week 6:** Video: Claude QA tests a real SaaS app end-to-end (long-form, demo power)
- **Week 8:** Guest post on Anthropic or MCP-focused publication
- **Week 12:** First 1.0 release with stability commitment

## Graduation criteria to 1.0

All of:
- 30+ days with no critical bugs reported
- API surface (tool names + signatures) unchanged for 14 days
- Chrome Web Store rating ≥4 stars with 10+ reviews
- 5+ users have shipped workflows using it
- README/docs can answer 90%+ of common questions without issue filing

## Monetization (optional, later)

Clicksmith itself stays free and open source. Revenue options if you want them:
- **Pro tier:** hosted relay server so you can drive remote Chrome instances (no local setup)
- **Team features:** shared test case libraries, CI integration, multi-tenant auth
- **Consulting:** help companies build custom QA flows on top
- **Don't monetize:** build as resume project, keep it OSS forever

Recommend **don't monetize in year 1**. Build distribution first, revenue later (or never — a hit OSS project is a career asset regardless).

## Long-term roadmap questions

Track these as GitHub issues/discussions for community input:
- Multi-browser support (Firefox, Safari)? Requires porting extension.
- Remote Chrome instances (Browserbase-like)? Big architectural shift.
- Playwright export from session recordings? (There's a prompt for this; could productize)
- Visual regression testing with pixel diffing?
- Integration with CI (GitHub Actions runner)?
- Voice-driven QA ("Claude, test the login flow")?

## Unresolved

- How much time per week can you actually commit long-term? Be honest. Overcommitting kills OSS projects.
- Is there a co-maintainer you'd want to bring on? Bus factor matters for serious projects.
- At what point do you declare "done" and move on vs keep iterating indefinitely?

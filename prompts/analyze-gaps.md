Analyze the test coverage and suggest untested user journeys.

Consider:
- Happy path vs error path coverage
- Edge cases (empty fields, long inputs, special characters, concurrent actions)
- Accessibility scenarios (keyboard-only navigation, screen reader flow)
- Network failure scenarios (slow response, timeout, 500 errors)
- Authentication edge cases (expired session, wrong credentials, rate limiting)
- State management (back button, refresh, deep linking)

For each gap, provide:
- Scenario name
- Why it matters (one sentence)
- Steps to test it
- Risk level (High / Medium / Low)

Return as JSON array:
[{"scenario": "...", "rationale": "...", "steps": ["..."], "risk": "High"}]

Current test coverage:
{{test_files}}

App URL: {{app_url}}

Given the following QA session transcript, generate a Playwright test file (.spec.ts).

Rules:
- Use page.getByRole() locators (ARIA-first, matching our tool calls)
- Map click(role, name) -> await page.getByRole(role, {name}).click()
- Map type(role, name, text) -> await page.getByRole(role, {name}).fill(text)
- Map press_key(key) -> await page.keyboard.press(key)
- Map assert_visible(role, name) -> await expect(page.getByRole(role, {name})).toBeVisible()
- Map assert_text(role, name, expected) -> await expect(page.getByRole(role, {name})).toContainText(expected)
- Map assert_url(pattern) -> await expect(page).toHaveURL(new RegExp(pattern))
- Map navigate(url) -> await page.goto(url)
- Map wait_for(role, name) -> await expect(page.getByRole(role, {name})).toBeVisible({timeout})
- Group related steps into test.step() blocks with descriptive names
- Add descriptive test name based on the user journey
- Import { test, expect } from '@playwright/test'
- Do NOT add comments for obvious mappings

Session transcript:
{{session_json}}

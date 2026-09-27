// Live AI flows through the real UI. These call the model and cost tokens,
// so they only run when E2E_AI=1 (and the server has ANTHROPIC_API_KEY).
import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.skip(process.env.E2E_AI !== "1", "set E2E_AI=1 to run live AI tests");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("coach streams a grounded reply and keeps the conversation", async ({ page }) => {
  await register(page);
  await page.goto("/coach");
  await page.getByTestId("coach-input").fill("In one sentence: what does a hash table's load factor measure?");
  await page.keyboard.press("Enter");
  // The assistant bubble fills in as SSE deltas arrive.
  await expect(page.locator("text=/entries|slots|buckets/i").first()).toBeVisible({ timeout: 120_000 });
  await expect(page).toHaveURL(/\/coach\/[0-9a-f-]+$/);
  await page.reload();
  await expect(page.locator("text=/load factor/i").first()).toBeVisible();
});

test("coach dock opens from a lesson with lesson context", async ({ page }) => {
  await register(page);
  await page.goto("/learn/data-structures/hashing/hash-tables");
  await page.getByRole("button", { name: "Ask the coach" }).first().click();
  const dock = page.getByRole("dialog", { name: "AI coach" });
  await expect(dock).toBeVisible();
  await expect(dock).toContainText("lesson");
  await dock.locator("textarea").fill("Why do tombstones exist? One sentence.");
  await dock.locator("textarea").press("Enter");
  await expect(dock.locator("text=/probe|probing|lookup/i").first()).toBeVisible({ timeout: 120_000 });
});

test("solo coding interview: interviewer engages, coach is locked, report is produced", async ({ page }) => {
  await register(page);
  await page.goto("/interviews");
  await page.getByTestId("kind-coding").click();
  await page.getByTestId("mode-solo").click();
  await page.getByTestId("start-interview").click();
  await expect(page).toHaveURL(/\/interviews\/[0-9a-f-]+$/);
  await expect(page.getByTestId("timer")).toBeVisible();
  // The interviewer opens the conversation.
  const transcript = page.getByTestId("interview-transcript");
  await expect(transcript.getByText("Interviewer", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 120_000 });
  // Solo mode: no assistant panel and no coach hand-off in the editor.
  await expect(page.getByRole("button", { name: "Assistant" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask the coach" })).toHaveCount(0);
  await page.getByTestId("interview-input").fill("Can I assume the input fits in memory? My plan is a single pass with a hash map, O(n) time and O(n) space.");
  await page.getByTestId("interview-input").press("Enter");
  await expect(transcript.getByText("Interviewer", { exact: true })).toHaveCount(2, { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 120_000 });
  await page.getByTestId("finish-interview").click();
  await expect(page.getByTestId("evaluation")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("evaluation")).toContainText("Dimensions");
});

test("assisted system design interview: assistant panel works and is graded", async ({ page }) => {
  await register(page);
  await page.goto("/interviews");
  await page.getByTestId("kind-system_design").click();
  await page.getByTestId("mode-assisted").click();
  await page.getByTestId("start-interview").click();
  await expect(page).toHaveURL(/\/interviews\/[0-9a-f-]+$/);
  const transcript = page.getByTestId("interview-transcript");
  await expect(transcript.getByText("Interviewer", { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 120_000 });
  await page.getByRole("button", { name: "Assistant" }).click();
  const panel = page.getByTestId("assistant-panel");
  await panel.getByTestId("assistant-input").fill("List three back-of-envelope numbers I should estimate first for this design. Be brief.");
  await panel.getByRole("button", { name: "Send to assistant" }).click();
  await expect(panel.getByText("Assistant", { exact: true })).toHaveCount(1, { timeout: 120_000 });
  await expect(panel.getByRole("button", { name: "Send to assistant" })).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("interview-input").fill("Requirements first: I'll assume 200M users and 10% daily active. My assistant suggested estimating QPS, storage and bandwidth; I agree with QPS and storage but will derive bandwidth from bitrate myself.");
  await page.getByTestId("interview-input").press("Enter");
  await expect(transcript.getByText("Interviewer", { exact: true })).toHaveCount(2, { timeout: 120_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 120_000 });
  await page.getByTestId("finish-interview").click();
  await expect(page.getByTestId("evaluation")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("evaluation")).toContainText(/AI direction|verification/i);
});

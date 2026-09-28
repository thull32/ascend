import { expect, test } from "@playwright/test";
import { register } from "./helpers";

test.describe("public pages", () => {
  test("landing renders stats and a live visualisation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("senior");
    await expect(page.getByTestId("landing-stats")).toContainText("lessons");
    await expect(page.getByTestId("viz")).toBeVisible();
    // Step the visualisation forward.
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(page.getByTestId("viz")).toContainText("2/");
  });

  test("curriculum, track, module and lesson pages render", async ({ page }) => {
    await page.goto("/learn");
    const first = page.getByTestId("track-card").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/learn\/[^/]+$/);
    await page.getByRole("link", { name: /^1\. / }).first().click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/[^/]+$/);
    await page.getByTestId("lesson-link").first().click();
    await expect(page).toHaveURL(/\/learn\/[^/]+\/[^/]+\/[^/]+$/);
    await expect(page.locator("article h1")).toBeVisible();
    await expect(page.locator("article h2").first()).toBeVisible();
  });

  test("search finds a lesson", async ({ page }) => {
    await page.goto("/learn");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByPlaceholder("Search lessons and problems…").fill("hash table");
    await expect(page.getByRole("dialog").getByRole("button").first()).toContainText(/hash/i);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/(learn|practice)\//);
  });

  test("practice list and problem page work; JS tests run in the browser", async ({ page }) => {
    await page.goto("/practice/two-sum");
    await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
    await page.getByRole("button", { name: "JavaScript" }).click();
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    // insertText is one input event, so bracket auto-closing does not interfere.
    await page.keyboard.insertText(
      "function two_sum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n",
    );
    await page.getByTestId("run-tests").click();
    await expect(page.getByTestId("results")).toContainText(/(\d+) \/ \1 passed/, { timeout: 30_000 });
  });

  test("graph clones that reuse input nodes are rejected by the runner", async ({ page }) => {
    await page.goto("/practice/clone-graph");
    await page.getByRole("button", { name: "JavaScript" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText("function clone_graph(node) {\n  return node;\n}\n");
    await page.getByTestId("run-tests").click();
    await expect(page.getByTestId("results")).not.toContainText(/^(\d+) \/ \1 passed/, { timeout: 30_000 });
    await page.getByTestId("results").getByRole("button").filter({ hasText: "Test 1" }).click();
    await expect(page.getByTestId("results")).toContainText("shares nodes with the original graph");
  });

  test("python runs in the browser via Pyodide", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/playground");
    await page.getByTestId("run").click();
    await expect(page.getByTestId("output")).toContainText("[1, 3, 5, 8]", { timeout: 150_000 });
  });

  test("visualisation gallery renders every family", async ({ page }) => {
    await page.goto("/viz");
    await expect(page.getByTestId("viz")).toBeVisible();
    const families = page.locator("button", { hasText: /\(\d+\)$/ });
    const n = await families.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      await families.nth(i).click();
      await expect(page.getByTestId("viz")).toBeVisible();
      await expect(page.locator("text=Visualisation failed")).toHaveCount(0);
    }
  });
});

test.describe("authenticated flows", () => {
  test("register → onboarding → roadmap → lesson progress → dashboard", async ({ page }) => {
    await register(page);
    await expect(page.getByTestId("roadmap-module").first()).toBeVisible();
    // Mark a module confident and see it dim.
    const first = page.getByTestId("roadmap-module").first();
    await first.getByRole("button", { name: "I know this" }).click();
    await expect(first.getByRole("button", { name: "Confident" })).toBeVisible();
    // Open the next lesson from the dashboard and complete it.
    await page.goto("/dashboard");
    await page.getByTestId("continue").click();
    await expect(page).toHaveURL(/\/learn\//);
    await page.getByTestId("mark-complete").click();
    await expect(page.getByTestId("mark-complete")).toContainText("Completed");
    await page.goto("/dashboard");
    await expect(page.locator("dd").first()).toContainText(/^1 \//);
  });

  test("a solve is graded on the server, and a claimed result is not trusted", async ({ page }) => {
    await register(page);
    await page.goto("/practice/two-sum");
    await page.getByRole("button", { name: "JavaScript" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(
      "function two_sum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n",
    );
    await page.getByTestId("run-tests").click();
    await expect(page.getByTestId("server-verdict")).toContainText("Solved: the server's check passed all", { timeout: 60_000 });
    await page.goto("/dashboard");
    await expect(page.locator("dt", { hasText: "Problems solved" }).locator("xpath=../dd")).toContainText(/^1 \//);

    // A request that claims a pass for wrong code is graded as what it is.
    const res = await page.request.post("/api/submissions", {
      data: { target_kind: "problem", target_slug: "valid-anagram", language: "python", code: "def is_anagram(s, t):\n    return True\n", passed_count: 99, total_count: 99 },
      headers: { "content-type": "application/json", "x-requested-with": "fetch" },
    });
    expect(res.status()).toBe(200);
    const graded = await res.json();
    expect(graded.passed).toBe(false);
    expect(graded.tests.length).toBe(graded.total_count);
  });

  test("quiz grading and comments", async ({ page }) => {
    await register(page);
    await page.goto("/learn/data-structures/hashing/hash-tables");
    const quiz = page.getByTestId("quiz");
    await quiz.scrollIntoViewIfNeeded();
    const questions = quiz.locator("ol > li");
    const n = await questions.count();
    for (let i = 0; i < n; i++) await questions.nth(i).locator("label").first().click();
    await quiz.getByRole("button", { name: "Check answers" }).click();
    await expect(quiz).toContainText(/\d+ \/ \d+ correct/);
    // Comment
    await page.getByPlaceholder(/Ask a question/).fill("Great lesson, the tombstone explanation clicked.");
    await page.getByRole("button", { name: "Post" }).click();
    await expect(page.getByTestId("comments")).toContainText("tombstone explanation");
  });

  test("CSRF: a mutating request without the custom header is rejected", async ({ page, request }) => {
    await register(page);
    const res = await page.request.put("/api/progress/lessons/data-structures/hashing/hash-tables", { data: { status: "completed" }, headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
    void request;
  });

  test("profile update and logout everywhere", async ({ page }) => {
    await register(page);
    await page.goto("/profile");
    await page.getByLabel("Display name").fill("Renamed");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("account deletion needs the password and cannot be undone", async ({ page }) => {
    const email = await register(page);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    await page.getByLabel("Confirm with your password").fill("not-my-password");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("alert")).toContainText("password is incorrect");
    await expect(page).toHaveURL(/\/profile/);

    await page.getByLabel("Confirm with your password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

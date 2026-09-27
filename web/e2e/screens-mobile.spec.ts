import { test } from "@playwright/test";

test.skip(process.env.SCREENSHOTS !== "1", "set SCREENSHOTS=1");

test("mobile viewport details", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  const dir = "test-results/screens/m-";
  await page.goto("/learn/data-structures/hashing/hash-tables");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${dir}lesson-top.png` });
  await page.getByTestId("viz").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}lesson-viz.png` });
  await page.getByTestId("exercise").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}lesson-exercise.png` });
  await page.getByTestId("quiz").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}lesson-quiz.png` });
  await page.goto("/learn/networking/fundamentals/dns");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("viz").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}network-viz.png` });
  await page.goto("/learn/system-design/building-blocks/caching-strategies");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("viz").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}system-viz.png` });
  await page.goto("/practice/two-sum");
  await page.waitForLoadState("networkidle");
  await page.locator(".cm-editor").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}problem-editor.png` });
  await page.goto("/learn");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.screenshot({ path: `${dir}nav-open.png` });
});

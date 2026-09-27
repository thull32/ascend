// Visual review: captures full-page screenshots of the main screens.
// Run with SCREENSHOTS=1; images land in test-results/screens/.
import { test } from "@playwright/test";
import { register } from "./helpers";

test.skip(process.env.SCREENSHOTS !== "1", "set SCREENSHOTS=1 to capture screenshots");
test.setTimeout(180_000);

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test("public pages", async ({ page }, info) => {
  const p = info.project.name;
  const pages: [string, string][] = [
    ["landing", "/"],
    ["learn", "/learn"],
    ["track", "/learn/data-structures"],
    ["module", "/learn/data-structures/hashing"],
    ["lesson", "/learn/data-structures/hashing/hash-tables"],
    ["lesson-graph", "/learn/data-structures/graphs/breadth-first-search"],
    ["lesson-network", "/learn/networking/fundamentals/dns"],
    ["lesson-system", "/learn/system-design/building-blocks/caching-strategies"],
    ["practice", "/practice"],
    ["problem", "/practice/two-sum"],
    ["roadmap", "/roadmap"],
    ["viz", "/viz"],
    ["playground", "/playground"],
    ["login", "/login"],
  ];
  for (const [name, url] of pages) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot(name, p), fullPage: name !== "lesson" && name.startsWith("lesson") ? false : true });
  }
});

test("signed-in pages", async ({ page }, info) => {
  const p = info.project.name;
  await register(page);
  for (const [name, url] of [
    ["dashboard", "/dashboard"],
    ["roadmap-signed-in", "/roadmap"],
    ["interviews", "/interviews"],
    ["coach", "/coach"],
    ["profile", "/profile"],
  ] as const) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(name, p), fullPage: true });
  }
});

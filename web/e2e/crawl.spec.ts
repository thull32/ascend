// Full-content rendering crawl: opens every lesson and problem and records
// anything that rendered as an error (Mermaid, KaTeX, viz, exercise, quiz)
// plus uncaught page errors. Run with CRAWL=1; writes test-results/crawl.json.
// CRAWL_ONLY=a,b limits the crawl to URLs containing any of those substrings.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

test.skip(process.env.CRAWL !== "1", "set CRAWL=1 to crawl all content");
test.setTimeout(60 * 60 * 1000);

interface Issue {
  url: string;
  kind: string;
  detail: string;
}

async function collect(page: Page, url: string, issues: Issue[]) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on("pageerror", onError);
  await page.goto(url, { waitUntil: "networkidle" });
  // Lazy blocks (viz, exercises, mermaid) mount on load; give them a beat.
  await page.waitForTimeout(700);
  const found = await page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const text = (el: Element) => (el.textContent ?? "").slice(0, 200);
    document.querySelectorAll("pre").forEach((el) => {
      if ((el.textContent ?? "").startsWith("Diagram failed to render")) out.push({ kind: "mermaid", detail: text(el) });
    });
    document.querySelectorAll(".katex-error").forEach((el) => out.push({ kind: "katex", detail: el.getAttribute("title") ?? text(el) }));
    document.querySelectorAll("div").forEach((el) => {
      const t = el.textContent ?? "";
      if (el.children.length === 0 && /^(Unknown visualisation|Unknown [a-z-]+ algorithm|Visualisation (failed|produced no steps|block is not valid JSON)|Malformed exercise block)/.test(t))
        out.push({ kind: "viz/exercise", detail: t.slice(0, 200) });
    });
    if (!document.querySelector("article h1, h1")) out.push({ kind: "render", detail: "no h1" });
    // Every table-of-contents link must land on a heading in the page.
    document.querySelectorAll('aside a[href^="#"]').forEach((a) => {
      const id = decodeURIComponent((a.getAttribute("href") ?? "").slice(1));
      if (id && !document.getElementById(id)) out.push({ kind: "toc-anchor", detail: `#${id} (${text(a)})` });
    });
    if (/That page does not exist/.test(document.body.textContent ?? "")) out.push({ kind: "404", detail: "not found" });
    return out;
  });
  for (const f of found) issues.push({ url, ...f });
  for (const e of errors) issues.push({ url, kind: "pageerror", detail: e.slice(0, 300) });
  page.off("pageerror", onError);
}

test("every lesson and problem renders cleanly", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop");
  const curriculum = await (await request.get("/api/curriculum")).json();
  const urls: string[] = [];
  for (const t of curriculum.tracks) {
    const track = await (await request.get(`/api/curriculum/tracks/${t.slug}`)).json();
    urls.push(`/learn/${t.slug}`);
    for (const m of track.modules) {
      urls.push(`/learn/${m.slug}`);
      for (const l of m.lessons) urls.push(`/learn/${l.slug}`);
    }
  }
  const problems = await (await request.get("/api/problems")).json();
  for (const p of problems) urls.push(`/practice/${p.slug}`);

  const only = (process.env.CRAWL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const selected = only.length ? urls.filter((u) => only.some((o) => u.includes(o))) : urls;
  expect(selected.length, "CRAWL_ONLY matched no pages").toBeGreaterThan(0);

  const issues: Issue[] = [];
  for (const url of selected) await collect(page, url, issues);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/crawl.json", JSON.stringify({ pages: selected.length, issues }, null, 2));
  console.log(`crawled ${selected.length} pages, ${issues.length} issues`);
  expect(issues, JSON.stringify(issues.slice(0, 20), null, 2)).toEqual([]);
});

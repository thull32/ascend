// @vitest-environment node
// Narrated walkthroughs (content/walkthroughs) tie each spoken cue to a frame
// of a lesson's visualisation. If a generator changes how many frames it
// produces, the cues no longer point at what the narration describes, so the
// frame count is pinned in each walkthrough and checked here against the
// generator itself.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VizSpec } from "./engine";
import { runSpec } from "./VizBlock";

const CONTENT = fileURLToPath(new URL("../../../content", import.meta.url));
const WALK = join(CONTENT, "walkthroughs");

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p);
    return name.endsWith(".md") ? [p] : [];
  });
}

const walkthroughs = markdownFiles(WALK).map((file) => {
  const text = readFileSync(file, "utf8");
  const front = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!front) throw new Error(`${file}: no front matter`);
  const meta = Object.fromEntries([...front[1]!.matchAll(/^(\w+):\s*(.*?)\s*$/gm)].map((m) => [m[1], m[2]!.replace(/^"|"$/g, "")]));
  const cues = [...front[2]!.matchAll(/^@(\d+)(?:-(\d+))?$/gm)].flatMap((m) => [Number(m[1]), Number(m[2] ?? m[1])]);
  // content/walkthroughs/<track>/<module>/<lesson file stem>/<n>.md
  const lesson = readFileSync(join(CONTENT, "tracks", `${relative(WALK, dirname(file))}.md`), "utf8");
  const spec = [...lesson.matchAll(/^```viz[^\n]*\n([\s\S]*?)^```/gm)]
    .map((m) => JSON.parse(m[1]!) as VizSpec)
    .find((s) => s.title === meta.viz);
  return { name: relative(WALK, file), meta, cues, spec };
});

describe("narrated walkthroughs", () => {
  it.each(walkthroughs.map((w) => [w.name, w] as const))("%s matches its visualisation's frames", (_name, w) => {
    expect(w.spec, `no visualisation titled ${w.meta.viz}`).toBeDefined();
    const result = runSpec(w.spec!);
    if ("error" in result) throw new Error(result.error);
    expect(result.frames.length).toBe(Number(w.meta.frames));
    expect(w.cues[0]).toBe(0);
    expect(Math.max(...w.cues)).toBeLessThan(result.frames.length);
  });
});

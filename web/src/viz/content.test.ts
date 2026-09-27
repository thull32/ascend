// @vitest-environment node
// Every visualisation embedded in the curriculum must resolve in the registry
// and generate frames with the lesson's exact input. A misnamed algorithm or
// an input that crashes a generator fails CI instead of reaching a learner.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_FRAMES, type VizSpec } from "./engine";
import { runSpec } from "./VizBlock";

const CONTENT = fileURLToPath(new URL("../../../content", import.meta.url));

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p);
    return name.endsWith(".md") ? [p] : [];
  });
}

const blocks: { file: string; index: number; source: string }[] = [];
for (const file of markdownFiles(CONTENT)) {
  const text = readFileSync(file, "utf8");
  let i = 0;
  for (const m of text.matchAll(/^```viz[^\n]*\n([\s\S]*?)^```/gm)) blocks.push({ file: relative(CONTENT, file), index: i++, source: m[1]! });
}

describe("curriculum visualisations", () => {
  it("finds visualisations to check", () => {
    expect(blocks.length).toBeGreaterThan(100);
  });
  it.each(blocks.map((b) => [`${b.file}#${b.index}`, b] as const))("%s renders", (_name, b) => {
    const spec = JSON.parse(b.source) as VizSpec;
    const result = runSpec(spec);
    if ("error" in result) throw new Error(result.error);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
    for (const f of result.frames) expect(f.note.trim().length).toBeGreaterThan(0);
  });
});

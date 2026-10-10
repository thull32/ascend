// @vitest-environment node
// Writing aid for narrated walkthroughs (content/AUDIO_GUIDE.md): prints
// every frame of every visualisation in one lesson, with its note and a
// compact view of its state, so a script's cues can describe exactly what
// is on screen. Skipped unless FRAMES names a lesson:
//
//   cd web && FRAMES=../content/tracks/<track>/<module>/<lesson>.md \
//     FRAMES_OUT=/tmp/frames.txt pnpm exec vitest run src/viz/frames.dump.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import type { VizSpec } from "./engine";
import { runSpec } from "./VizBlock";

const lesson = process.env.FRAMES;

describe.skipIf(!lesson)("frame dump", () => {
  it("writes every frame of the lesson's visualisations", () => {
    const text = readFileSync(resolve(lesson!), "utf8");
    const out: string[] = [];
    [...text.matchAll(/^```viz[^\n]*\n([\s\S]*?)^```/gm)].forEach((m, k) => {
      const spec = JSON.parse(m[1]!) as VizSpec;
      const result = runSpec(spec);
      out.push(`=== viz ${k + 1}: ${spec.title ?? "(untitled)"} (${spec.type}/${String(spec.algorithm ?? spec.scenario ?? "")})`);
      if ("error" in result) {
        out.push(`  error: ${result.error}`);
        return;
      }
      out.push(`  frames: ${result.frames.length}`, `  input: ${JSON.stringify(result.input).slice(0, 400)}`);
      result.frames.forEach((f, i) => {
        out.push(`  @${i} [${f.tag ?? ""}] ${f.note}`);
        out.push(`      state: ${JSON.stringify(f.state)}`);
      });
    });
    writeFileSync(process.env.FRAMES_OUT ?? "/dev/stdout", out.join("\n") + "\n");
  });
});

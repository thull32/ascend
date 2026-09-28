// @vitest-environment node
// A frame must look the same when the player shows it as when the generator
// recorded it. Families build frames with a snapshot function; if a snapshot
// copies an object but not an array inside it, every frame shares that array
// and early frames silently show the final result (scrubbing back "does
// nothing"). Reference checks on the top level cannot see this, so this test
// records each frame's JSON at the moment it is pushed and compares it with
// the same frame after the whole run, for every algorithm in the catalogue
// and every visualisation embedded in the curriculum.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Frames, type VizSpec } from "./engine";
import { catalogue } from "./registry";
import { runSpec } from "./VizBlock";

const recorded: string[] = [];
const originalPush = Frames.prototype.push;

beforeAll(() => {
  Frames.prototype.push = function (this: Frames<unknown>, note: string, tag?: string) {
    const frames = (this as unknown as { frames: { state: unknown }[] }).frames;
    const before = frames.length;
    originalPush.call(this, note, tag);
    if (frames.length > before) recorded.push(JSON.stringify(frames[frames.length - 1]!.state));
  };
});
afterAll(() => {
  Frames.prototype.push = originalPush;
});

/** Runs a spec and returns the indexes of frames that changed after being pushed. */
function mutatedFrames(spec: VizSpec): number[] {
  recorded.length = 0;
  const result = runSpec(spec);
  if ("error" in result) throw new Error(result.error);
  return result.frames.flatMap((f, i) => (JSON.stringify(f.state) === recorded[i] ? [] : [i]));
}

const CONTENT = fileURLToPath(new URL("../../../content", import.meta.url));
function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return markdownFiles(p);
    return name.endsWith(".md") ? [p] : [];
  });
}
const blocks: [string, VizSpec][] = [];
for (const file of markdownFiles(CONTENT)) {
  let i = 0;
  for (const m of readFileSync(file, "utf8").matchAll(/^```viz[^\n]*\n([\s\S]*?)^```/gm)) {
    blocks.push([`${relative(CONTENT, file)}#${i++}`, JSON.parse(m[1]!) as VizSpec]);
  }
}

describe("frames are immutable once recorded", () => {
  const algorithms = catalogue().flatMap(({ type, algorithms }) => algorithms.map((a) => [`${type}/${a}`, { type, algorithm: a, scenario: a }] as const));

  it.each(algorithms)("%s (catalogue example)", (_name, spec) => {
    expect(mutatedFrames(spec as VizSpec)).toEqual([]);
  });

  it.each(blocks)("%s (curriculum block)", (_name, spec) => {
    expect(mutatedFrames(spec)).toEqual([]);
  });
});

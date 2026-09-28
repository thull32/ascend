---
slug: the-visualisation-engine
title: "The visualisation engine: frames, pure generators and a DSL"
description: How Ascend makes roughly 230 step-by-step animations scrubbable, deterministic and testable by treating each one as a pure function from input to a capped list of snapshots.
minutes: 38
difficulty: hard
tags: [case-study, frontend, react, testing, property-testing, dsl, determinism]
---
Ascend has 229 animated visualisations across 17 families: sorting, trees, graphs, TCP, Raft, attention heads, deadlocks. Many authors wrote them, lessons embed them as JSON (725 `viz` blocks in 333 Markdown files when last measured), and learners watch them on phones, stepping backward and forward, dragging a slider. Some inputs are hand-written by people in a hurry.

That is the requirements document. Every animation must scrub both ways without special code; be deterministic, so the step the prose names is the step the learner sees; never freeze the page, whatever JSON the author typed; and be testable without a browser, or 229 generators fed 725 inputs will rot. This lesson reads `web/src/viz/` (engine, player, registry, the array family, the `system` DSL, the tests) and both ends of the pipe, `crates/core/src/content/blocks.rs` and `web/src/components/Markdown.tsx`. Every number comes from running the real generators.

## Frames are full snapshots

The whole engine is 80 lines. Its central type is the frame:

```typescript
// web/src/viz/engine.ts
export const MAX_FRAMES = 600;

export interface Frame<S> {
  state: S;
  /** One sentence shown under the canvas explaining this step. */
  note: string;
  /** Optional short label (e.g. "compare", "swap") for the timeline. */
  tag?: string;
}

export type Generator<I, S> = (input: I) => Frame<S>[];
```

A visualisation is a generator: a function from an input to an array of frames, each a *complete* snapshot of the structure plus one sentence of explanation. The renderer is a React component that draws exactly one frame and knows nothing of the others. The alternatives lose on concrete axes:

| Design | Scrub backwards | Renderer | Testable without a browser | Size | Lesson can change the input |
|---|---|---|---|---|---|
| Imperative animation (D3 transitions, a tween timeline library) | Hard: must reverse effects | Stateful, entangled with timing | Barely | Low | Yes |
| A log of diffs or commands ("swap 2 and 5") | Needs inverse operations or a replay | Must apply diffs correctly | Yes, but every diff kind needs tests | Lowest | Yes |
| Pre-rendered video or GIF | Free: seek | A media element | No: only pixels | Grows with length and resolution | No: re-render offline |
| **Full snapshots (chosen)** | Free: set the index | Pure function of one frame | Yes: assert on data | Highest, bounded by the cap | Yes |

Git makes the same choice at scale (each commit is a full tree snapshot; deltas exist only inside packfiles), while event-sourced systems store changes and add periodic snapshots to bound replay ([Event-driven architecture](/learn/system-design/building-blocks/event-driven-architecture)).

## What snapshots cost, measured

A script transpiles `web/src/viz` with sucrase (a web dependency), imports the real `runSpec`, and runs every `viz` block in `content/` as the content test does, then every algorithm on its gallery example. Size is `JSON.stringify(frame).length`, a proxy for heap; times are first runs under Node 24 on the development machine.

| Measure | 725 embedded blocks | 229 gallery examples |
|---|---|---|
| Frames per animation, min / median / p90 / max | 2 / 12 / 23 / 78 | 3 / 12 / 22 / 55 |
| JSON per animation, median / max | 9.3 KB / 114 KB | 6.9 KB / 77 KB |
| Largest single frame | 2.7 KB (`concurrency/dining-philosophers`) | 2.7 KB |
| Generation time, median / max | 0.09 ms / under 3 ms | 0.06 ms / 0.9 ms |
| Animations that reach the cap | 1, this lesson's deliberate example (excluded from the maxima above) | 0 |

The heaviest is `memory/cache-lines` (78 frames, 114 KB). An array frame with the 40 values `normalise` allows is about 550 bytes, so an array animation at the cap holds about 270 KB. On a phone several times slower, the slowest block would take around ten milliseconds.

This input produces exactly four frames: the invariant, two "go right" steps, and "found".

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20, 24, 31], "target": 24, "title": "Four frames, each a complete snapshot", "caption": "Drag the slider backwards: the player only changes an index. No frame knows how it was reached."}
```

## One generator, traced frame by frame

This is the array family's binary search, unabridged:

```typescript
// web/src/viz/families/array.tsx — binarySearch
const binarySearch: G = ({ values, target = 0 }) => {
  const { s, f, clearTones } = make(values);
  let lo = 0;
  let hi = values.length - 1;
  let steps = 0;
  s.vars = { target, lo, hi };
  f.push(`Sorted array. Invariant: if the target is present it lies within [lo, hi] = [${lo}, ${hi}].`);
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    steps++;
    clearTones();
    for (let i = 0; i < values.length; i++) if (i < lo || i > hi) s.tones[i] = "muted";
    s.tones[mid] = "compare";
    s.pointers = { lo, mid, hi };
    s.vars = { target, lo, hi, mid, comparisons: steps };
    const v = values[mid]!;
    if (v === target) {
      s.tones[mid] = "done";
      f.push(`values[mid] = ${v} equals the target. Found at index ${mid} after ${steps} comparisons (⌈log₂ ${values.length}⌉ = ${Math.ceil(Math.log2(Math.max(2, values.length)))} max).`, "found");
      return f.done();
    }
    if (v < target) {
      f.push(`values[mid] = ${v} < ${target}, so the target can only be to the right: lo = mid + 1 = ${mid + 1}.`, "go right");
      lo = mid + 1;
    } else {
      f.push(`values[mid] = ${v} > ${target}, so the target can only be to the left: hi = mid − 1 = ${mid - 1}.`, "go left");
      hi = mid - 1;
    }
  }
  clearTones();
  s.pointers = { lo, hi };
  s.vars = { target, lo, hi, comparisons: steps };
  f.push(`lo (${lo}) > hi (${hi}): the range is empty, the target is absent. ${steps} comparisons.`, "miss");
  return f.done();
};
```

On the block above (`target = 24`), the recorded output is:

| Frame | `pointers` | Tones by index | `vars` changed | Tag | Note says |
|---|---|---|---|---|---|
| 0 | none | none | target 24, lo 0, hi 9 | none | the invariant, [lo, hi] = [0, 9] |
| 1 | lo 0, mid 4, hi 9 | 4 compare | mid 4, comparisons 1 | go right | 9 < 24, lo = mid + 1 = 5 |
| 2 | lo 5, mid 7, hi 9 | 0–4 muted, 7 compare | lo 5, mid 7, comparisons 2 | go right | 20 < 24, lo = mid + 1 = 8 |
| 3 | lo 8, mid 8, hi 9 | 0–7 muted, 8 done | lo 8, mid 8, comparisons 3 | found | index 8 after 3 comparisons (⌈log₂ 10⌉ = 4 max) |

1. `make(values)` copies the input and creates the `Frames` builder. Frame 0, the invariant, is pushed before any comparison.
2. `mid = 0 + ⌊9 / 2⌋ = 4`; `clearTones()` resets every tone and index 4 turns "compare". `values[4] = 9 < 24`, and `f.push` runs *before* `lo = mid + 1`, so frame 1's `vars.lo` is still 0 while its note announces 5: each frame shows a decision, the next its consequence. A lesson saying "at step 1, lo is 5" is off by one frame.
3. `mid = 5 + ⌊4 / 2⌋ = 7`; `20 < 24`, so `lo` becomes 8, and indices 0 to 4 are muted.
4. `mid = 8 + ⌊1 / 2⌋ = 8`; `values[8] = 24`: tone "done", tag `found`, return. The bound is computed from the input's length. Frames grow from 262 to 357 bytes of JSON.

### The same generator on an author's mistake

An author writes `{"type": "array", "algorithm": "binary-search", "values": [2, 4, 6]}` and forgets `target`. `runSpec` merges the family's gallery example, `{values: [1, 3, …, 31], target: 15}`, under the author's fields: the author's `values` win and the example's `target` survives. The learner watches `[2, 4, 6]` searched for 15, ending "the target is absent"; the generator's default, `target = 0`, never applies. Write `"target": "six"` instead and `normalise` stores `Number("six")`, which is `NaN`; every `v < NaN` is false, so each step goes left and the notes read "values[mid] = 4 > NaN". Both pass the content scan, which only checks that notes are non-empty.

## Generators are pure, and snapshots must be copies

"Pure" means the same input always gives the same frames: no randomness, no clock, no DOM, no shared module state. That lets a lesson say "at frame 3, `mid` is 8" and be right on every device. It also makes React's `StrictMode` (on in `main.tsx`), which calls every `useMemo` function twice in development, harmless.

The subtle part is the snapshot. Generators are written imperatively, mutating a working state and pushing a frame after each step, so every push must *copy* the state. The array family's helper shows the pattern:

```typescript
// web/src/viz/families/array.tsx — make
function make(values: number[], bars = false) {
  const s: ArrayState = { values: [...values], tones: values.map(() => undefined), pointers: {}, vars: {}, bars };
  const f = new Frames<ArrayState>(() => ({ ...s, values: [...s.values], tones: [...s.tones], pointers: { ...s.pointers }, vars: { ...s.vars }, aux: s.aux ? { ...s.aux, values: [...s.aux.values], tones: s.aux.tones ? [...s.aux.tones] : undefined } : undefined }));
  const clearTones = () => s.tones.fill(undefined);
  return { s, f, clearTones };
}
```

The `Frames` builder takes a snapshot *function*, and every family supplies one that copies each nested array and object it mutates. Leave out `tones: [...s.tones]` and the outer `...s` copies only the reference: every frame shares one `tones` array, `clearTones` refills it in place, and after the run every frame shows the final colours. Scrubbing appears to do nothing. It is the most common bug in this style, and it is silent; the exercise has you build a builder that avoids it.

### Before and after: two generators that rewrote their own past

The suites check aliasing by reference: `system-a.test.ts` asserts that the first and last frames' `state` and `state.nodes` are different objects, and `memory.test.ts` compares two frames' `heap`. That proves the top level was copied, nothing beneath it. A stronger detector wraps `Frames.prototype.push`, records each frame's JSON when pushed, and compares it with the same frame after the run. Run over all 229 algorithms and 725 blocks while this lesson was being written, it flagged two generators, used by six lesson blocks:

- `array/monotonic-stack-next-greater` sets `s.vars = { answer: ans }` and keeps filling `ans`.
- `graph/dfs` sets `s.vars = { stackDepth: depth, discovered: disc }` and keeps adding to `disc`.

`vars: { ...s.vars }` copies one level, so every frame's `vars.answer` was the same array. On the gallery example `[2, 1, 5, 6, 2, 3]`, frame 1 ("Push 0") was recorded with six nulls and displayed `[5, 5, 6, null, 3, null]`, the final result; DFS's frame 1 ("Enter A") displayed discovery times for all six nodes. Neither family has a test file, which is how both survived.

Commit `7066802` fixed each with one copy at the assignment (`answer: [...ans]`, `discovered: { ...disc }`) and, more importantly, turned the detector into a test. `web/src/viz/frames-immutable.test.ts` wraps `push` in `beforeAll`, restores it in `afterAll`, and runs one case per catalogue algorithm and one per curriculum block (954 cases when it landed). With the two old lines restored, the same check flags eight of them: the two algorithms and the six blocks that use them. The fix without the test would have protected two generators; the test protects the next one.

## From a fenced block to frames: runSpec

The Rust loader parses each `viz` block as JSON and re-emits it compactly ([The content engine](/learn/case-study-ascend/the-system/the-content-engine)). In the browser, `Markdown.tsx` overrides react-markdown's `pre` renderer: a `code` child with class `language-viz` becomes the lazily imported `VizBlock`, which parses the JSON (failure is a warning box) and passes it to `VizFromSpec`, which calls `runSpec` inside `useMemo`. The content test calls the same function:

```typescript
// web/src/viz/VizBlock.tsx
/** Resolves a spec to frames exactly as the page does (shared with tests). */
export function runSpec(spec: VizSpec): { frames: Frame<unknown>[]; input: unknown } | { error: string } {
  if (typeof spec.type !== "string") return { error: "Visualisation block has no \"type\"." };
  const family = getFamily(spec.type) as Family<Record<string, unknown>, unknown> | undefined;
  const algo = algorithmOf(spec);
  if (!family) return { error: `Unknown visualisation type "${spec.type}".` };
  const gen = family.algorithms[algo];
  if (!gen) return { error: `Unknown ${spec.type} algorithm "${algo}". Known: ${Object.keys(family.algorithms).join(", ")}.` };
  const { type: _t, algorithm: _a, scenario: _s, title: _ti, caption: _c, ...rest } = spec;
  void _t; void _a; void _s; void _ti; void _c;
  const base = family.examples[algo] ?? {};
  const raw = { ...base, ...rest };
  // Normalising runs inside the try too: it reads author-supplied fields, and
  // an unexpected shape must become a warning box, not an exception that
  // takes the page down.
  try {
    const input = family.normalise ? family.normalise(raw) : raw;
    const frames = gen(input);
    if (frames.length === 0) return { error: "Visualisation produced no steps." };
    return { frames, input };
  } catch (e) {
    return { error: `Visualisation failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function VizFromSpec({ spec, compact }: { spec: VizSpec; compact?: boolean }) {
  // ...
  const result = useMemo(() => runSpec(spec), [spec]);
  // ... a warning box on error, otherwise the player inside a VizErrorBoundary
}
```

The lines that are not what they look like:

1. `getFamily(spec.type)` indexes a plain object, so `"type": "constructor"` finds `Object.prototype.constructor`, and `family.algorithms[algo]` then throws before the `try` (measured: "Cannot read properties of undefined"). `"algorithm": "constructor"` returns the input object as "frames"; its `length` is undefined and the zero-frames check passes it. Both fail the content scan, and both are still open: `Object.hasOwn` or a `Map` would close them.
2. `algorithmOf` reads `algorithm`, then `scenario` (common in `system` and `network` blocks), then `""`. The error lists valid names, so the warning box carries the fix.
3. The destructuring strips the five keys the engine owns; the `void` line only satisfies `noUnusedLocals`.
4. `{ ...base, ...rest }` is a shallow merge where the author's keys win: the `target: 15` surprise. The tree family's `normalise` compares `raw.values` by reference with its own examples to tell them apart.
5. `normalise` used to run *before* the `try`, so `{"type": "graph", "algorithm": "bfs", "edges": [null]}` threw "Cannot read properties of null (reading 'from')" straight out of `runSpec`; with no React error boundary anywhere, and React unmounting the whole tree on an uncaught render error since version 16, the gallery's editable JSON box could blank the page. Since `7066802` the normaliser runs inside the `try` and that input becomes a warning; `parseSpec` rejects JSON that is not an object; a missing `type` is reported; and a `VizErrorBoundary` wraps each `VizPlayer`, so a renderer that throws shows a warning in place. `VizBlock.test.ts` feeds hostile specs and asserts `runSpec` never throws.
6. Zero frames is an error because the player needs one frame to draw. Note what the boundary does *not* cover: `runSpec` runs in `VizFromSpec`'s `useMemo`, outside it, so the `"type": "constructor"` throw in item 1 still escapes.

So the defences are each narrower than they look: example defaults fill missing fields (sometimes wrongly), `normalise` coerces and clamps (the array family drops non-finite `values` and keeps 40, but only parses `target`), a throwing normaliser or generator becomes a warning box, and a throwing renderer is caught by the boundary.

## The frame cap, and why it is not enough

```typescript
// web/src/viz/engine.ts — Frames
export class Frames<S> {
  private frames: Frame<S>[] = [];
  constructor(private readonly snapshot: () => S) {}
  push(note: string, tag?: string): void {
    if (this.frames.length >= MAX_FRAMES) {
      if (this.frames.length === MAX_FRAMES) this.frames.push({ state: this.snapshot(), note: "Stopped: frame limit reached. Try a smaller input.", tag: "limit" });
      return;
    }
    this.frames.push({ state: this.snapshot(), note, tag });
  }
  get full(): boolean {
    return this.frames.length > MAX_FRAMES;
  }
  done(): Frame<S>[] {
    return this.frames;
  }
}
```

At 600 frames the builder appends one "limit" frame and ignores everything after it: at most 601 frames, and the learner is told why. This method is the only place the cap is enforced; the content test's `<= MAX_FRAMES + 1` is a backstop for a generator that bypasses `Frames` (none does: the detector saw every frame arrive through `push`).

Bubble sort over 40, 39, …, 1 needs 39 + 38 + … + 1 = 780 swaps, so an uncapped run would push 782 frames:

1. Frame 0 is the intro; swaps 1 to 599 become frames 1 to 599. The builder holds 600 frames.
2. Swap 600 (20 > 10, in the 21st pass) calls `push` at length 600. Its note is discarded; the builder records the state after that swap under "Stopped: frame limit reached" with tag `limit`. Length 601.
3. The generator's next line is `if (f.full) return f.done();`. `full` means `length > 600`, now true, so it returns. Swaps 601 to 780 are never computed.

Measured: 601 frames, 266 KB of JSON, about half a millisecond. `full` turns true only once the limit frame exists, so a generator that checks it only per outer loop finishes its inner loop first, each `push` returning at once. Detect a capped run by length or note, not tag: `system/lamport-clock` tags an ordinary frame `limit`, which fooled the first version of the measurement script.

```viz
{"type": "array", "algorithm": "bubble-sort", "values": [40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], "title": "The cap, live: 780 swaps needed, 601 frames kept", "caption": "Press the last-step button. Frame 601 is the limit frame, drawn after swap 600; the remaining swaps and the final sorted frame were never generated."}
```

The cap bounds memory, not *work*. `push` returning early does not stop the loop that calls it, and generators run synchronously on the main thread, inside `useMemo`, during render: a loop that never terminates freezes the page however many frames it discards. That is why the family files check `full` 170 times, in lines like `if (f.full) break;`. Termination is each generator's job, helped by `normalise` keeping inputs small and by hostile-input tests.

A worker would make a runaway generator killable, as in the [code runner](/learn/case-study-ascend/product-systems/running-code-in-the-browser). It was not done: generators are first-party code with clamped inputs that finish in milliseconds, and a worker would make the first frame asynchronous on every lesson.

## The family registry

`registry.ts` is a two-level map. The first level is a plain object from `type` to `Family`: `array`, `graph` and `network` imported directly and 14 more spread in from `families/index.ts`, 17 in all. The second is each family's `algorithms` record from name to generator; a `Family` also carries `examples` (gallery inputs and merge defaults), optional `labels` and `normalise`, and one `Renderer`. `families/system.tsx` spreads three core scenarios, pack A (25) and pack B (21) into 49. A later spread silently replaces an earlier key of the same name; `system-a.test.ts` pins pack A's names, but nothing checks pack B or collisions (none today).

There is no allow-list on the backend. `blocks.rs` parses each `viz` block as a `serde_json::Value`, calling them "opaque JSON passed straight to the frontend's visualiser registry". The names live in TypeScript; a Rust copy would be a second source of truth. So three lists must agree, each pair held together differently:

| Pair | Held together by | Runs | When measured |
|---|---|---|---|
| Registry and lessons | `content.test.ts` | CI web job; Railway waits for CI (`checkSuites: true` in `.railway/railway.ts`) | 725 blocks resolve; 218 of 229 names used |
| Registry and the `CONTENT_GUIDE.md` catalogue | A comment in `registry.ts` and `engine.ts` | Code review | The same 229 names (diffed by a script) |
| Registry and the gallery | `catalogue()` computes the list and its "229 steppable animations" subtitle | Every render | Cannot drift |

The guide is the weak pair: a stale name fails only in CI, and an algorithm missing from it never gets used. A short test comparing the table with `catalogue()` would close it. Of the eleven unused algorithms, three (`array/reverse`, `array/selection-sort`, `graph/dag-build`) are in untested families and are not their family's first algorithm, the only one the Playwright gallery test renders: nothing automated runs them.

The registry also decides what learners download. It imports every family statically, so the lazy `VizBlock` chunk carries all 17: 601 KB minified, 203 KB gzipped in the current `web/dist` build (`wc -c`, and `gzip -c` piped to `wc -c`). A lesson with one binary search downloads the ML family too; per-family loaders (`ml: () => import("./families/ml")`) would fix that for a second round trip.

## The player is small because the frames are data

`VizPlayer` is 116 lines: an index, a playing flag, a speed from 0.5x to 4x, a `setTimeout` of `900 / speed` milliseconds, a range slider, keyboard handling (arrows step, space plays), and an `aria-live="polite"` region that reads each note to screen readers. It resets to frame 0 when the frames change and knows nothing about any algorithm: the payoff of putting the complexity into data.

## The DSL families

Some families are hand-drawn per algorithm (array, tree, graph). The `system` family's 49 scenarios, from the core file and two packs by different authors, are scripts over a tiny DSL, and one shared renderer draws boxes, arrows, a message log, variables, an optional hash ring and an optional table.

```typescript
// web/src/viz/families/system-core.tsx — Sys
/** One message in flight for this frame (cleared on the next call unless keep). */
msg(from: string, to: string, label: string, note: string, opts: { tone?: Tone; tag?: string; keep?: boolean; dashed?: boolean } = {}) {
  const m: SysMessage = { from, to, label, tone: opts.tone ?? "active", dashed: opts.dashed };
  this.s.messages = opts.keep ? [...this.s.messages, m] : [m];
  this.s.log = [...this.s.log.slice(-4), `${from} → ${to}: ${label}`];
  this.f.push(note, opts.tag ?? "message");
}
/** Several messages at once (fan-out, replication, gossip). */
fanout(from: string, tos: string[], label: string, note: string, tone: Tone = "active", tag = "fan-out") {
  this.s.messages = tos.map((to) => ({ from, to, label, tone }));
  this.s.log = [...this.s.log.slice(-4), `${from} → ${tos.join(", ")}: ${label}`];
  this.f.push(note, tag);
}
```

`msg` and `fanout` *replace* `messages` and `log` with new arrays, so those cannot alias; `state()` mutates a node in place, so the snapshot copies every node. A scenario reads like a narrated sequence diagram:

```typescript
// web/src/viz/families/system-core.tsx — requestFlow
sys.msg("api", "cache", "GET lessons:v3", `API checks the cache first (cache-aside).`, { tone: "compare" });
sys.state("cache", "MISS", "danger");
sys.msg("cache", "api", "(nil)", `Miss: the key is not there yet.`, { tone: "danger" });
sys.msg("api", "db", "SELECT … FROM lessons", `Fall through to the database (~5 ms).`, { tone: "compare" });
sys.msg("db", "api", "42 rows", `Database answers.`, { tone: "done" });
sys.state("cache", "lessons:v3 (TTL 60s)", "done");
```

```viz
{"type": "system", "algorithm": "request-flow", "title": "A DSL scenario, rendered", "caption": "Each msg call is one frame. The renderer, the log and the variables panel are shared by every system scenario."}
```

The DSL buys visual consistency (nobody draws arrows by hand), authors who think in messages rather than SVG coordinates, and above all *generic testability*: every scenario has the same state shape, so one test can assert invariants for all of them, such as "every message goes between nodes that exist". That one matters because the renderer silently skips an arrow with an unknown endpoint (`if (!a || !b) return null`). A DSL pays off when many instances of one shape need checking in bulk.

## Testing 229 generators and 725 embedded blocks

The tests in `web/src/viz/families/*.test.ts` come in two kinds.

**Property-style tests over a matrix of hostile inputs.** The test for the first system pack runs each of its 25 scenarios against ten inputs, from `{}` to negative, NaN and infinite numbers, 100,000 requests and 200 keys:

```typescript
// web/src/viz/families/system-a.test.ts
it(`produces valid frames for ${JSON.stringify(input).slice(0, 60)}`, () => {
  const gen = scenariosA[name]!;
  const frames = gen(family.normalise!({ ...input }));
  expect(frames.length).toBeGreaterThanOrEqual(8);
  expect(frames.length).toBeLessThanOrEqual(20);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const f of frames) {
    expect(typeof f.note).toBe("string");
    expect(f.note.trim().length).toBeGreaterThan(0);
    expect(f.note).not.toContain("undefined");
    expect(f.note).not.toContain("NaN");
    const ids = new Set(f.state.nodes.map((n) => n.id));
    expect(ids.size).toBe(f.state.nodes.length);
    for (const m of f.state.messages) {
      expect(ids.has(m.from), `message from unknown node ${m.from} in ${name}`).toBe(true);
      expect(ids.has(m.to), `message to unknown node ${m.to} in ${name}`).toBe(true);
    }
  }
  const last = frames[frames.length - 1]!;
  expect(last.tag).toBe("done");
});
```

Checking notes for `"undefined"` and `"NaN"` looks crude and works: a template literal that interpolates a missing field is the commonest generator bug, invisible until someone reads the sentence. The file also checks purity (run twice, compare JSON) and that first and last states are different objects: property tests with a hand-picked input matrix, the cheap end of [Testing strategy](/learn/senior-craft/software-craft/testing-strategy).

**Semantic tests for behaviour.** `hash-table.test.ts` checks that `hashKey` matches Java's `String.hashCode` (`"apple"` is 93029210, so a lesson's arithmetic is right), that open-addressing deletion leaves a tombstone and a later key is still stored and found, that `resize` doubles 4 buckets to 8 keeping every key, and that `normalise` clamps 999 buckets to 16 and 100 operations to 40. Shape tests find crashes; semantic tests find animations that teach the wrong thing.

### How the content scan finds and runs every block

`web/src/viz/content.test.ts` is 41 lines. It resolves the curriculum relative to itself (`new URL("../../../content", import.meta.url)`), walks it with `readdirSync` and `statSync`, reads every `.md` file, and collects blocks with `/^```viz[^\n]*\n([\s\S]*?)^```/gm`: a line starting with three backticks and `viz`, then everything, lazily, up to the next line starting with three backticks. Blocks are numbered per file, so a failure names `tracks/…/lesson.md#1`.

Per block, through `it.each`, it asserts that the JSON parses, that `runSpec` returns no error (unknown name, a throwing generator, zero frames), that there are 1 to `MAX_FRAMES + 1` frames, and that every note is non-empty. A separate test requires more than 100 blocks, so moving `content/` cannot make 725 checks vanish. A misspelt name or crashing input fails the web job, and deploys wait for CI (they once did not; see [Build and deploy](/learn/case-study-ascend/shipping/build-and-deploy)). The Docker build cannot catch it: `pnpm build` typechecks and bundles but runs no tests, and the Rust check only parses JSON.

The file starts with `// @vitest-environment node`, and each test is named "renders", but no React component runs. Renderers run only in `tree-heap-trie.test.ts` (first, middle and last frame of every tree, heap and trie algorithm, in jsdom) and in the Playwright gallery test.

### What nobody is watching

- Ten family test files cover twelve families (one covers tree, heap and trie). `array`, `graph`, `network`, `ml`, `concurrency` and the second system pack have none: a `kruskal` with plausible frames and the wrong spanning tree would pass.
- The content scan does not look for `NaN` in notes (the `target: "six"` block passes) or check purity. Copying the `undefined` substring check over would misfire: the only three blocks with "undefined" in a note use the memory family's correct sentence about "undefined behaviour". Aliasing, the third gap, now has its own test.

The remaining fixes are cheap: a purity check and a `NaN` check in the content scan, a catalogue test, and a semantic test file for every new family. [Testing the system](/learn/case-study-ascend/shipping/testing-the-system) has you write the invariant checker.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Unknown algorithm in content (`"dijkstraa"`) | A warning box: `Unknown graph algorithm "dijkstraa". Known: bfs, dfs, …` | The content scan fails with the same message and names `file.md#index` | Fix the name; the failed check blocks the deploy |
| A snapshot aliases a nested array | Colours scrub, but the variables panel shows final values on early frames | A frame's JSON at push time differs from its JSON at the end | Copy at the assignment or `clone` in the snapshot; `frames-immutable.test.ts` now fails on it (both known cases fixed in `7066802`) |
| A loop never terminates for one input | The tab freezes when the lesson opens | A profile shows the time in a generator under `useMemo`; the block through `runSpec` in Node never returns | `f.full` checks in loops, inputs bounded in `normalise`; a worker with a timeout for untrusted generators |
| A legitimate input exceeds the cap | The animation ends at 601/601 on "Stopped: frame limit reached" | 601 frames and the limit note, not the tag alone | A smaller input, or coarser steps such as one frame per pass |
| A lookup throws before the `try` | A blank gallery page for `"type": "constructor"` (before `7066802`, for any input that broke a normaliser) | The stack trace points into `runSpec`, which runs outside the error boundary | Own-key lookups (`Object.hasOwn` or a `Map`); the normaliser is already inside the `try` |
| A missing field is filled from the example | A plausible animation about a value nobody wrote | Compare `runSpec`'s returned `input` with the block | Required fields per algorithm in `normalise` |

## At 100x

The engine's cost does not grow with users: generators run on learners' devices, and the server sends everyone one static chunk. What grows is families, blocks and authors. The content scan is linear (about 115 ms of generation for 725 blocks, so under two seconds for 10,000 plus Vitest's per-test overhead). The chunk is the problem: family 30 would make every animated lesson pay for families 1 to 29. So: stronger content-scan checks, a semantic test per new family, a catalogue test, per-family loading, and a screenshot per algorithm at a few frames, since no data assertion covers renderers.

## Interviewer follow-ups

**"Why store full snapshots rather than diffs?"** Model answer: the consumers need random access: the slider jumps to any index, the renderer is a pure function of one frame, tests assert on plain data. The cost is measured and bounded: a median 9 KB of JSON per embedded animation, about 270 KB for an array animation at the cap. Diffs save memory nobody is short of and add an inverse operation, and a test, per diff kind. Common wrong answer: "diffs, because they are smaller", with no number for snapshots.

**"How do you know 229 animations still work after a refactor?"** Model answer: three layers, each with a blind spot. The content scan runs all 725 blocks through the page's own `runSpec` in CI, which gates deploys; ten family test files add hostile inputs and semantics for twelve families; Playwright renders one algorithm per family. None checked aliasing, which is how two aliasing bugs survived until a push-time detector found them; that detector is now a fourth layer, `frames-immutable.test.ts`, run on every catalogue algorithm and curriculum block. Common wrong answer: "the gallery test renders them all", when it renders 17 of 229.

**"A generator hangs the page for one input. Why didn't the cap save you?"** Model answer: `push` stops recording at 601 frames but cannot stop the loop calling it, which runs synchronously in `useMemo` on the main thread. Termination comes from `f.full` checks and bounded inputs; the structural fix is a worker with a timeout, at the cost of an asynchronous first frame everywhere. Common wrong answer: "the cap stops it at 600 frames".

**"What breaks first if authors add 1,000 more animations?"** Model answer: not the server, which never runs a generator, and not CI, where generation costs well under a millisecond per block. First the bundle: one lazy chunk already carries all 17 families at 203 KB gzipped. Then the guide's catalogue, kept in sync by a comment. Then review, as untested families grow. Common wrong answer: "server load".

**"Why doesn't the Rust loader validate viz types?"** Model answer: the registry lives in TypeScript, and a Rust copy would drift. The check lives with the knowledge, in the content scan; the price is that it runs only in CI, so deploys must wait for CI. For a build-time gate, the web build could emit `catalogue()` as a manifest for the loader. Common wrong answer: "hard-code the list in Rust too", with no plan to keep two lists equal.

## What mid-level engineers get wrong

- **Trusting a shallow copy because a reference test passes.** `first.state !== last.state` held while `vars: { ...s.vars }` shared one array across every frame of two generators.
- **Treating the frame cap as a timeout.** It bounds memory; a loop without an `f.full` check still freezes the tab.
- **Assuming a `try` or an error boundary covers everything.** The registry lookup still runs before `runSpec`'s `try`, and `runSpec` runs outside the boundary, so a prototype key such as `constructor` still escapes both.
- **Leaning on example defaults.** They merge under the author's fields, so a forgotten `target` silently becomes 15.
- **Reading a test's name as its behaviour.** The content scan's tests are called "renders" and never render.
- **Detecting the cap by tag.** A scenario already uses `limit` as an ordinary tag; count 601 frames or match the note.
- **Adding a family with no test file**, trusting a scan that only checks something non-empty came out.

## Exercise

```exercise
id: frame-recorder
title: Implement the frame-capped snapshot builder
prompt: |
  Implement `FrameRecorder`, a version of the engine's `Frames` builder that owns
  its working state. The starter already implements `set` and `append`.

  - `FrameRecorder(max_frames)` starts with an empty state object and no frames.
  - `set(key, value)` sets `state[key]`; `append(key, value)` appends to the list
    at `state[key]` (creating it), mutating it in place.
  - `push(note, tag)` records `{"state": <snapshot>, "note": note, "tag": tag}`.
    The snapshot must be a deep copy: later `set`/`append` calls must not change
    frames already recorded.
  - The cap: if the number of frames is already `max_frames`, record one final
    frame with the current state, note `"Stopped: frame limit reached."` and tag
    `"limit"` instead; if there are more than `max_frames` frames, ignore the push.
  - `full()` returns whether more than `max_frames` frames are recorded.
  - `done()` returns the list of frames.

  The tests replay method calls and compare the return values.
languages: [python, javascript]
entry: FrameRecorder
starter:
  python: |
    class FrameRecorder:
        def __init__(self, max_frames):
            self.max = max_frames
            self.state = {}
            self.frames = []

        def set(self, key, value):
            self.state[key] = value

        def append(self, key, value):
            self.state.setdefault(key, []).append(value)

        def push(self, note, tag):
            # TODO: snapshot the state and enforce the cap
            pass

        def full(self):
            return False

        def done(self):
            return self.frames
  javascript: |
    class FrameRecorder {
      constructor(maxFrames) {
        this.max = maxFrames;
        this.state = {};
        this.frames = [];
      }
      set(key, value) {
        this.state[key] = value;
      }
      append(key, value) {
        if (!(key in this.state)) this.state[key] = [];
        this.state[key].push(value);
      }
      push(note, tag) {
        // TODO: snapshot the state and enforce the cap
      }
      full() {
        return false;
      }
      done() {
        return this.frames;
      }
    }
tests:
  - args: [["__init__", 5], ["set", "i", 0], ["push", "start", "init"], ["set", "i", 1], ["push", "step", "move"], ["done"]]
    expected: [null, null, null, null, null, [{"state": {"i": 0}, "note": "start", "tag": "init"}, {"state": {"i": 1}, "note": "step", "tag": "move"}]]
  - args: [["__init__", 5], ["append", "stack", 1], ["push", "push 1", "push"], ["append", "stack", 2], ["push", "push 2", "push"], ["done"]]
    expected: [null, null, null, null, null, [{"state": {"stack": [1]}, "note": "push 1", "tag": "push"}, {"state": {"stack": [1, 2]}, "note": "push 2", "tag": "push"}]]
    label: each frame is an independent snapshot
  - args: [["__init__", 2], ["push", "a", "x"], ["push", "b", "x"], ["full"], ["push", "c", "x"], ["full"], ["push", "d", "x"], ["done"]]
    expected: [null, null, null, false, null, true, null, [{"state": {}, "note": "a", "tag": "x"}, {"state": {}, "note": "b", "tag": "x"}, {"state": {}, "note": "Stopped: frame limit reached.", "tag": "limit"}]]
    label: the cap adds exactly one limit frame
  - args: [["__init__", 0], ["push", "a", "x"], ["push", "b", "x"], ["done"]]
    expected: [null, null, null, [{"state": {}, "note": "Stopped: frame limit reached.", "tag": "limit"}]]
    label: a cap of zero
  - args: [["__init__", 1], ["set", "n", 7], ["push", "one", "t"], ["set", "n", 8], ["push", "two", "t"], ["set", "n", 9], ["push", "three", "t"], ["done"]]
    expected: [null, null, null, null, null, null, null, [{"state": {"n": 7}, "note": "one", "tag": "t"}, {"state": {"n": 8}, "note": "Stopped: frame limit reached.", "tag": "limit"}]]
    hidden: true
    label: the limit frame snapshots the state at that moment
  - args: [["__init__", 3], ["append", "q", "a"], ["push", "enqueue a", "enq"], ["append", "q", "b"], ["append", "q", "c"], ["push", "enqueue b and c", "enq"], ["done"]]
    expected: [null, null, null, null, null, null, [{"state": {"q": ["a"]}, "note": "enqueue a", "tag": "enq"}, {"state": {"q": ["a", "b", "c"]}, "note": "enqueue b and c", "tag": "enq"}]]
    hidden: true
    label: lists are copied, not shared
hints:
  - "A shallow copy of the state dict is not enough: the lists inside it are still shared. Use copy.deepcopy in Python and structuredClone (or a JSON round trip) in JavaScript."
  - "Check the cap before recording: compare the current number of frames with max_frames, and only the exactly-equal case records the limit frame."
```

## Senior signals

- You choose **snapshots over diffs** when consumers need random access and the memory is bounded, and you state the bound as a measured number.
- You know capping output does not cap work: a runaway loop is stopped by the loop, a thread boundary or a kill switch.
- You test snapshot code for **aliasing by content** (each frame when recorded against the same frame at the end), because a reference check only proves the top level was copied.
- You read an entry function for what sits **outside the `try`**, what a shallow merge fills in silently, and what a plain-object lookup finds on the prototype.
- You build a DSL when many instances share one shape, because it makes bulk invariant testing possible.
- You put a check **where the knowledge lives** and then confirm it is on the path to production.
- You read a test suite as a coverage map ("renders" that never renders, "a different object" that misses a shared array) and close each gap with the cheapest true check.

## Check yourself

```quiz
- q: >-
    Why does the engine store a full snapshot per frame instead of a list of diffs?
  options: ["Any frame is reachable by setting an index, and tests assert on plain data", "React cannot render a diff without first replaying it into a full state", "Diffs cannot be serialised to JSON, so the tests could not inspect them", "Snapshots use less memory than diffs once the 600-frame cap applies"]
  answer: 0
  explanation: >-
    Diffs are smaller, which is the tempting answer, but every backward step then needs an inverse operation or a replay from the start, and every renderer must apply diffs correctly. Snapshots make the renderer a pure function of one frame. Measured over the curriculum, they cost a median of about 9 KB of JSON per animation and about 270 KB for an array animation at the cap.
- q: >-
    A new generator has a loop whose exit condition is never met for one input, and it calls f.push on every iteration. What happens when a lesson renders it?
  options: ["React catches the runaway loop and shows the warning box instead", "The player shows the limit frame and lets the learner scrub through the rest", "The page freezes, because push stops recording but the loop keeps running", "The cap stops the loop once 600 frames have been recorded for it"]
  answer: 2
  explanation: >-
    Frames.push returns early after the limit frame, but that only bounds memory. Generators run synchronously inside useMemo on the main thread, so nothing interrupts the loop and runSpec never returns to show anything. Loops must check f.full (the families do, 170 times) or otherwise terminate.
- q: >-
    A lesson adds a viz block with algorithm dijkstraa and is pushed to main. Where does the mistake surface?
  options: ["In CI's web job, where content.test.ts runs every viz block through runSpec", "In the Docker build, where --check-content rejects the unknown algorithm", "Nowhere before production; learners see a warning box in the lesson instead", "In cargo test, where the embedded curriculum test resolves each viz block it finds"]
  answer: 0
  explanation: >-
    The Rust loader only checks that a viz block is valid JSON, because the registry lives in TypeScript, so neither the Docker build nor cargo test notices. The Vitest content scan runs the exact spec through the page's own function and fails with the list of known algorithms. With Railway waiting for CI, that failure also blocks the deploy.
- q: >-
    A generator sets s.vars = { answer: ans } before each push and keeps filling ans in place. The snapshot copies vars with { ...s.vars }. After the run, what does frame 1's variables panel show?
  options: ["The final answers, because every frame's answer is the same array", "A warning box, because runSpec detects the mutated frame and fails", "The answers at frame 1, because the spread copied the vars object", "Nothing, because the frame cap drops arrays nested inside vars"]
  answer: 0
  explanation: >-
    The spread copies one level: each frame gets a new vars object whose answer field points at the one ans array, which the generator keeps mutating. This was the bug in the monotonic-stack and DFS generators until commit 7066802. A test that the first and last states are different objects passes; comparing each frame's JSON at push time with its JSON at the end catches it.
- q: >-
    A lesson embeds a binary-search block with values [2, 4, 6] and no target. The family's example for binary-search has target 15, and the generator's parameter default is target = 0. What does the learner see?
  options: ["A search for 0 that ends with the target reported absent", "A search for NaN, with NaN printed in every step's note", "A search for 15 that ends with the target reported absent", "A warning box saying the target field is required here"]
  answer: 2
  explanation: >-
    runSpec merges the family's example under the author's fields, so the author's values win and the example's target of 15 survives. The parameter default only applies when target is undefined, which it no longer is. NaN appears only when the author supplies a non-number such as six. The content scan passes this block, because every note is non-empty.
- q: >-
    Bubble sort on the 40 values 40, 39, and so on down to 1 needs 780 swaps, each pushing a frame after one intro frame. With MAX_FRAMES = 600, what does the finished frame list contain?
  options: ["601 frames: the intro, 599 swaps and the final sorted frame", "782 frames, since push keeps recording and the player trims", "601 frames: the intro, 599 swaps and the limit frame", "600 frames: the intro and 599 swaps, with no limit frame"]
  answer: 2
  explanation: >-
    The push for swap 600 arrives when the builder holds exactly 600 frames, so it records the limit frame, with the state after that swap, instead of its own note. full is now true, the generator's next check returns, and the sorted frame is never generated. The cap is applied inside push; the player never trims anything.
```

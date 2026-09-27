---
slug: the-visualisation-engine
title: "The visualisation engine: frames, pure generators and a DSL"
description: How Ascend makes roughly 230 step-by-step animations scrubbable, deterministic and testable by treating each one as a pure function from input to a capped list of snapshots.
minutes: 38
difficulty: hard
tags: [case-study, frontend, react, testing, property-testing, dsl, determinism]
---
Ascend has about 230 animated visualisations across 17 families: sorting, trees, graphs, TCP, Raft, attention heads, deadlocks. Many different authors wrote them, content authors embed them as JSON inside lessons, and learners watch them on phones, stepping forward and backward, dragging a slider, changing speed. Some inputs in lessons are hand-written by people in a hurry.

That list of facts is the requirements document. Every animation must be scrubbable in both directions without special code. It must be deterministic, so the step a lesson's prose refers to is the step the learner sees. It must never freeze the page, whatever JSON the author typed. And 230 of them must be testable without a browser, or they will rot. This lesson reads `web/src/viz/engine.ts`, `VizBlock.tsx`, `VizPlayer.tsx`, `registry.ts`, one reference family (`families/array.tsx`), the DSL in `families/system-core.tsx`, and the tests beside them.

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

A visualisation is a generator: a function from an input to an array of frames, where each frame is a *complete* snapshot of the structure plus one sentence of explanation. The renderer is a React component that draws exactly one frame and knows nothing about the frames before or after it.

The alternatives were both considered and rejected for concrete reasons.

| Design | Scrub backwards | Renderer | Testable without a browser | Memory |
|---|---|---|---|---|
| Imperative animation (D3 transitions, a timeline of tweens) | Hard: must reverse effects | Stateful and entangled with timing | Barely | Low |
| A log of diffs or commands ("swap 2 and 5") | Needs inverse operations or replay from the start | Must apply diffs correctly | Yes, but every diff kind needs tests | Lowest |
| **Full snapshots (chosen)** | Free: set the index | Pure function of one frame | Yes: assert on data | Highest, bounded by the cap |

The memory cost is real but small. An array visualisation's state is the values (at most 40, because the family's `normalise` truncates longer input), a tone per value, a few pointers and variables: on the order of a kilobyte per frame, so well under a megabyte at the 600-frame cap. For that price the player is trivial and the frames are plain data that a test can inspect.

Here is a frame list you can scrub. This input produces exactly four frames: the invariant, two "go right" steps, and "found".

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20, 24, 31], "target": 24, "title": "Four frames, each a complete snapshot", "caption": "Drag the slider backwards: the player just changes an index. No frame knows how it was reached."}
```

## Generators are pure, and snapshots must be copies

"Pure" here means: the same input always gives the same frames, with no randomness, no clock, no DOM and no shared module state. That is what lets a lesson say "at step 3, `mid` is 7" and be right on every device.

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

The `Frames` builder takes a snapshot *function*, and every family supplies one that copies each nested array and object it mutates. Forget one, say `tones` is spread shallowly, and every frame shares the same `tones` array: after the generator finishes, every frame shows the final colours, and scrubbing appears to do nothing. It is the most common bug in this style of code, it is silent, and it is why the test suites check that the first and last frames' states are different objects. You will implement the builder, with that property, in the exercise.

The embedding path is defensive in the same spirit. `VizBlock` parses the JSON; `runSpec` looks up the family and algorithm, merges the family's example input with whatever the author supplied, normalises it, and runs the generator. The page calls it inside `useMemo`, and the content test calls the very same function:

```typescript
// web/src/viz/VizBlock.tsx
/** Resolves a spec to frames exactly as the page does (shared with tests). */
export function runSpec(spec: VizSpec): { frames: Frame<unknown>[]; input: unknown } | { error: string } {
  const family = getFamily(spec.type) as Family<Record<string, unknown>, unknown> | undefined;
  const algo = algorithmOf(spec);
  if (!family) return { error: `Unknown visualisation type "${spec.type}".` };
  const gen = family.algorithms[algo];
  if (!gen) return { error: `Unknown ${spec.type} algorithm "${algo}". Known: ${Object.keys(family.algorithms).join(", ")}.` };
  const { type: _t, algorithm: _a, scenario: _s, title: _ti, caption: _c, ...rest } = spec;
  void _t; void _a; void _s; void _ti; void _c;
  const base = family.examples[algo] ?? {};
  const raw = { ...base, ...rest };
  const input = family.normalise ? family.normalise(raw) : raw;
  try {
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
  // ... a warning box on error, otherwise the player
}
```

Three layers of defence are visible: example defaults fill missing fields, `normalise` coerces and clamps what content supplies (numbers are parsed, non-finite values dropped, arrays truncated), and a thrown exception becomes a warning box in the lesson instead of a white screen. Content is treated as untrusted input to the engine, even though it is written by the same team.

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

At 600 frames the builder appends one explanatory "limit" frame and ignores everything after it, so the maximum length is 601 and the learner is told why the animation stopped. That bounds memory.

It does not bound *work*. `push` returning early does nothing to stop the loop that calls it, and generators run synchronously on the main thread, inside `useMemo`, during render. A generator whose loop never terminates for some input freezes the page no matter how many frames it discards. That is why the families check the `full` flag to stop computing, around 170 times across the family files, in lines like `if (f.full) break;`. The cap is a memory guard; termination is still each generator's responsibility, protected by `normalise` keeping inputs small and by tests that throw hostile inputs at every generator.

Moving generators into a worker would make a runaway generator killable, the same trick the code runner uses. It was not done because generators are first-party code with clamped inputs, they finish in milliseconds, and a worker round trip would make the first frame asynchronous for every lesson on the site.

## The player is small because the frames are data

`VizPlayer` is about 120 lines: an index, a playing flag, a speed from 0.5x to 4x, a `setTimeout` of `900 / speed` milliseconds to advance, a range slider, keyboard handling (arrows step, space plays), and an `aria-live="polite"` region that reads each frame's note to screen readers. It resets to frame 0 whenever the frames change. It contains no knowledge of any algorithm, and adding a family requires no change to it. That is the payoff of putting all the complexity into data.

## The DSL families

Some families are hand-drawn per algorithm (array, tree, graph). The `system` family, which has around 50 scenarios split across two packs written by different authors, is built differently: scenarios are scripts over a tiny DSL, and one shared renderer draws boxes, arrows, a message log, variables, an optional hash ring and an optional table.

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

A scenario then reads like a sequence diagram with narration:

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

The DSL buys three things. Visual consistency across 50 scenarios by different authors, because nobody draws arrows by hand. Scenario authors who think in messages and state, not SVG coordinates. And, most importantly, *generic testability*: because every scenario produces the same state shape, a single test can assert invariants that hold for all of them, such as "every message goes between nodes that exist". A DSL is worth building when you have many instances of one shape and want to check them in bulk.

## Testing 230 animations

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

Checking notes for the literal strings `"undefined"` and `"NaN"` looks crude and is very effective: a template literal that interpolates a missing field is the most common way a generator goes wrong, and it is invisible until someone reads the sentence. The same file checks purity (run twice, compare JSON) and snapshot independence (first and last states are different objects).

**Semantic tests for behaviour.** `hash-table.test.ts` checks that `hashKey` matches Java's `String.hashCode` (so a lesson's arithmetic is right), that open-addressing deletion leaves a tombstone, and that a later key is still reachable past it. Shape tests find crashes; semantic tests find animations that run perfectly and teach the wrong thing.

**A content scan over real inputs.** `web/src/viz/content.test.ts` reads every Markdown file under `content/`, extracts each `viz` block and runs it through `runSpec`, the function the page uses, with the lesson's exact input. It asserts that the spec resolves, that it produces between 1 and 601 frames, and that every note is non-empty. That is what makes the content guide's promise true: a misspelt type or algorithm, or an input that crashes a generator, fails the web job in CI. It cannot fail the Docker build, because the Rust loader only checks that a `viz` block is valid JSON (the registry lives in TypeScript), and for a while that gap mattered: Railway deployed pushes to `main` without waiting for CI. Now that deploys wait for CI to pass, a broken animation cannot reach production through `main`.

Then read the gaps honestly, because a test suite is also a map of what nobody is watching:

- Ten family test files cover twelve families (one file covers tree, heap and trie). `array`, `graph`, `network`, `ml`, `concurrency` and the second system pack have none. They are exercised only by the content scan, on the inputs lessons happen to use, and by the Playwright gallery test, which clicks each family and renders its *first* algorithm with its example input. Neither checks what an animation teaches: a `kruskal` that produced plausible frames and the wrong spanning tree would pass both.
- The content scan's assertions are weaker than the system pack's. It does not look for `undefined` or `NaN` in notes, check purity or check that snapshots are independent, so a template literal that interpolates a missing field ships as long as the sentence is non-empty.

Both gaps have cheap fixes: move the property assertions from `system-a.test.ts` into the content scan so every embedded animation gets them, and make a semantic test file a requirement for adding a family.

## At 100x

The engine's cost does not grow with users; it runs on their devices. What grows is the number of families and authors. The changes are about keeping 230 (or 2,300) animations honest: the property assertions in the content scan, a per-family semantic test as a requirement for adding a family, and a visual regression check (a screenshot per algorithm at a few frames) for renderers, which no data assertion can cover.

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

- You choose **snapshots over diffs** when the consumer needs random access (scrubbing, debugging, testing) and you can bound the memory, and you can state the bound.
- You know that capping output does not cap work: a runaway loop must be stopped by the loop, a thread boundary, or a kill switch, not by discarding its results.
- You look for **aliasing** in any snapshot or event-sourcing code and ask for a test that proves earlier snapshots are independent.
- You build a DSL when there are many instances of one shape, because it makes bulk invariant testing possible, not because DSLs are elegant.
- You read a test suite as a coverage map, notice which families have no tests and where a check is weaker than it sounds ("renders without error" is not "teaches the right thing"), and close the gap with the cheapest check that makes the claim true.

## Check yourself

```quiz
- q: >-
    Why does the engine store a full snapshot per frame instead of a list of diffs?
  options: ["Any frame is reachable by setting an index, and tests assert on plain data", "React cannot render a diff without first replaying it into a full state", "Diffs cannot be serialised to JSON, so the tests would be unable to inspect them", "Snapshots take less memory than diffs once the frame cap is applied to them"]
  answer: 0
  explanation: >-
    Diffs are smaller, which is the tempting answer, but every backward step then needs an inverse operation or a replay from the start, and every renderer must apply diffs correctly. Snapshots make the renderer a pure function of one frame. With inputs clamped and a 600-frame cap, they cost well under a megabyte per visualisation.
- q: >-
    A new generator has a loop whose exit condition is never met for one input, and it calls f.push on every iteration. What happens when a lesson renders it?
  options: ["React catches the runaway loop and shows the warning box instead", "The player shows the limit frame and lets the learner scrub through the rest", "The page freezes, because push stops recording but the loop keeps running", "The cap stops the loop once 600 frames have been recorded for it"]
  answer: 2
  explanation: >-
    Frames.push returns early after the limit frame, but that only bounds memory. Generators run synchronously inside useMemo on the main thread, so nothing interrupts the loop. Loops must check f.full (the families do, about 170 times) or otherwise terminate.
- q: >-
    A lesson adds a viz block with algorithm "dijkstraa" and is pushed to main. Where does the mistake surface?
  options: ["In cargo test, where the embedded curriculum test resolves each viz block it finds", "In CI's web job, where content.test.ts runs every viz block through runSpec", "In the Docker build, where --check-content rejects the unknown algorithm", "Nowhere before production; the lesson just shows learners a warning box instead"]
  answer: 1
  explanation: >-
    The Rust loader only checks that a viz block is valid JSON, because the registry lives in TypeScript, so neither the Docker build nor cargo test notices. The Vitest content scan runs the exact spec through the page's own function and fails. With Railway now waiting for CI, that failure also blocks the deploy.
- q: >-
    Every frame of a new animation shows the same final colours, and scrubbing appears to do nothing. What is the most likely bug?
  options: ["MAX_FRAMES is set too low, so the generator stops before any colour change", "The generator is impure and reads the clock, so each frame differs by run", "The snapshot copies the state object but not an array nested inside it", "The player's index state is not updating when the slider is dragged"]
  answer: 2
  explanation: >-
    Frames record whatever the snapshot function returns. A shallow spread copies the outer object but keeps references to nested arrays, which the generator keeps mutating, so every frame shows their final values. The family tests assert that the first and last frame states are different objects for this reason.
- q: >-
    What is the main engineering benefit of writing the system scenarios against the Sys DSL rather than drawing each one?
  options: ["Notes become optional, because the DSL writes a sentence for each step", "Scenarios run faster, because the DSL precomputes each frame's layout", "One state shape lets one test check invariants across every scenario at once", "The DSL guarantees termination, so no scenario can loop forever at all"]
  answer: 2
  explanation: >-
    Uniform output is what makes bulk checking possible: one test file asserts, for all 25 scenarios in the first pack, that messages only connect nodes that exist, and it could cover the second pack unchanged. Consistency and authoring speed are real benefits too. The DSL does not make scenarios terminate; purity and bounded loops still depend on the author.
```

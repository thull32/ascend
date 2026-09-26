# Brief for visualisation-family authors

You are implementing step-by-step visualisation families for **Ascend**
(`/home/tristan/ascend/web`, React 19 + TypeScript strict + Tailwind 4).
Lessons embed a viz with a JSON fence, e.g.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [8, 3, 10, 1, 6, 14]}
```

The frontend looks up the family by `type` in `src/viz/registry.ts`, the
generator by `algorithm` (or `scenario`; both keys are accepted), merges the
JSON over the family's example input, runs `normalise`, and plays the frames.

## Read first, completely

1. `src/viz/engine.ts` (Frame, Frames builder, Family interface, MAX_FRAMES).
2. `src/viz/primitives.tsx` (shared tones, Cells, Bars, Vars, Legend, SVG Arrow/Circle/Box).
3. `src/viz/families/array.tsx` and `src/viz/families/graph.tsx` (reference
   families with generators + renderer), `src/viz/families/network.tsx` (a
   DSL-driven family), `src/viz/families/system-core.tsx` (a DSL + renderer
   split so scenario packs can be written separately).
4. `src/viz/VizPlayer.tsx` and `src/viz/VizBlock.tsx` (how frames are shown).
5. `content/CONTENT_GUIDE.md` → the "Visualisation" table: it lists every
   `type` and every `algorithm`/`scenario` name plus the input fields content
   authors were told to use. **Implement every algorithm listed for your
   family with exactly those names.** Also grep the lessons for real usage:
   `grep -rho '"type": *"<family>"[^}]*' content/tracks | sort | uniq -c | sort -rn | head -50`
   and make `normalise` tolerant of the field names authors actually used
   (fill sensible defaults for anything missing; never throw on bad input,
   produce a frame explaining the problem instead).

## Contract for each family (file `src/viz/families/<name>.tsx`)

- Export `const <name>Family: Family<Input, State>` with: `name`,
  `description`, `algorithms` (every catalogue name), `labels` (human
  titles), `Renderer`, `examples` (a good example input per algorithm; the
  gallery renders these, so make them illustrative and small), `normalise`.
- Generators are pure: input → `Frame[]`. Use `new Frames<State>(snapshot)`
  and `f.push(note, tag)`. Every frame's `note` is one clear sentence a
  learner reads under the canvas: say what happened and why (the
  invariant, the comparison, the decision). The final frame states the
  complexity or the takeaway. Check `f.full` inside loops and bail out.
- Cap inputs in `normalise` (e.g. ≤ 40 values, ≤ 30 nodes) so no input can
  exceed MAX_FRAMES or freeze the page. Never recurse unboundedly.
- Renderer: use the primitives and the tone system so every family looks
  like the same product. SVG with `viewBox` for structures (trees, lists,
  rings); HTML flex/grid for cells and tables. Must be readable at 360px
  width (phones): prefer horizontal scroll over shrinking text below 9px.
  No external libraries. Show a `Legend` and `Vars` readout.
- Register the family in `src/viz/families/index.ts` (add one line to
  `extraFamilies`). Do not edit other families' files.
- Keep all state snapshots plain-data (arrays/objects), deep-copied in the
  snapshot closure (see array.tsx `make`).

## Quality bar

These are teaching instruments, not decorations. Each algorithm's frames
should let a learner reconstruct the algorithm from the notes alone. Show
the auxiliary state that matters (the stack, the queue, the DP table, the
recursion depth, the hash slots) and highlight the exact elements being
compared or moved on each step.

## Verify

- `cd /home/tristan/ascend/web && timeout 300 npx tsc -b` must pass with no
  errors (run it at most once at a time; do not run `pnpm build`).
- Write a small node smoke test that imports your family via
  `npx tsx` is NOT available; instead, add `src/viz/families/<name>.test.ts`
  using vitest: for every algorithm, run the generator on the example input
  and on a couple of edge inputs (empty, single element, all equal, the
  largest allowed) and assert frames.length > 0 and ≤ MAX_FRAMES + 1 and
  that every frame has a non-empty note. Run only your test file:
  `timeout 300 npx vitest run src/viz/families/<name>.test.ts`.
- Never run any script without `timeout`. One test process at a time.

## Report

List the file(s), the algorithms implemented, any catalogue names you could
not implement (and why), and the input fields you accept per algorithm.

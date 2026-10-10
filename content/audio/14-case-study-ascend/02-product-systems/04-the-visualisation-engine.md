---
lesson: the-visualisation-engine
source: dd437d38e6a3159b
fit: great
desk:
  - "The binary-search generator traced frame by frame, and the two live animations"
  - "The runSpec entry function, read line by line"
  - "The measurement table for snapshot sizes, and the coverage map of the test suites"
  - "Exercise: implement the frame-capped snapshot builder"
---
## Introduction

Ascend has 229 animated visualisations across 17 families: sorting, trees, graphs, TCP, Raft, attention heads, deadlocks. Many authors wrote them. Lessons embed them as JSON, 725 blocks when last measured. Learners watch them on phones, stepping backward and forward and dragging a slider. And some of the inputs are typed by people in a hurry.

That is the requirements document. Every animation must scrub both ways without special code. It must be deterministic, so the step the prose names is the step the learner sees. It must never freeze the page, whatever JSON the author typed. And it must be testable without a browser, or 229 generators fed 725 inputs will rot.

The whole design is one idea: a visualisation is a pure function from an input to a capped list of snapshots. This is the story of that idea, and of the three places it quietly failed.

## Frames are full snapshots

The engine is 80 lines. A visualisation is a generator: a function from an input to an array of frames, and each frame is a complete snapshot of the structure plus one sentence explaining the step. The renderer is a React component that draws exactly one frame and knows nothing about the others.

Compare the alternatives. Imperative animation, with transitions and tweens, makes scrubbing backwards hard, because every effect has to be reversed. A log of diffs, "swap 2 and 5", is the smallest, but every backward step needs an inverse operation or a replay, and every kind of diff needs its own tests. Pre-rendered video scrubs for free, but you cannot test pixels, and a lesson cannot change the input. Full snapshots cost the most memory, but scrubbing is just setting an index, the renderer is a pure function, and tests assert on plain data. Git makes the same choice: each commit is a full snapshot of the tree.

So what does that memory actually cost? Measured over every block in the curriculum: a median of 12 frames and about 9 kilobytes of JSON per animation. The heaviest is 114 kilobytes. Generation takes a median of under a tenth of a millisecond. That is the number to remember when someone says "diffs, because they are smaller": snapshots are measured, and bounded.

Because the frames are data, the player is tiny: 116 lines holding an index, a play button, a speed, a slider and keyboard handling. It also reads each note aloud to screen readers. It knows nothing about any algorithm. That is the payoff of putting the complexity into data.

## Pure generators, and snapshots that were not copies

Pure means the same input always gives the same frames: no randomness, no clock, no shared state. That is what lets a lesson say "at frame 3, mid is 8" and be right on every device.

The subtle part is the snapshot. Generators are written imperatively: they mutate a working state and push a frame after each step. So every push must copy the state, including every nested array it will later change. Leave one out and the copy holds only a reference. Every frame shares the same array, and after the run every frame shows the final values. Scrubbing appears to do nothing. It is the most common bug in this style, and it is silent.

The test suites did check for it, by asking whether the first and last frames' states were different objects. Before I say what that missed, think about it.

[pause]

It proves the top level was copied, and nothing beneath it. While this lesson was being written, a stronger detector was tried: record each frame's JSON when it is pushed, and compare it with the same frame after the run. Over all 229 algorithms and 725 blocks, it flagged two generators. A monotonic-stack animation kept filling its answer array after storing it, and depth-first search did the same with its discovery times. Their copies went one level deep. So the monotonic stack's first frame, "push 0", displayed the final answer, and depth-first search's first frame showed discovery times for all six nodes. Neither family had a test file, which is how both survived.

A later commit fixed each with one copy, and more importantly turned the detector into a test, run on every algorithm and every lesson block, 954 cases when it landed. The fix alone would have protected two generators. The test protects the next one.

## From a block of JSON to frames, and what sits outside the try

On the page, each JSON block goes through one function, the same one the tests call. It looks up the family and the algorithm, merges the family's example input under the author's fields, normalises the input, runs the generator, and turns any exception into a warning box. Read it for what it does not do, and three surprises appear.

First, the merge. An author writes a binary search over 2, 4 and 6 and forgets the target. The example's target was 15, and the author's fields win only where they exist, so the learner watches 2, 4 and 6 searched for 15, ending "the target is absent". Nobody wrote 15. Type the word "six" as the target instead, and it becomes not-a-number, every comparison goes left, and the notes say so. Both pass the content scan, which only checks the notes are not empty.

Second, the lookups. The registry is a plain object, and until a later fix it was indexed directly. So a block with the type "constructor" found the object prototype's constructor, and threw before the try. The fix checks only the object's own keys.

Third, the normaliser used to run before the try as well. A graph block with a null edge threw straight out of the function, and with no React error boundary anywhere, the gallery's editable JSON box could blank the whole page. Now the normaliser runs inside the try, and an error boundary wraps each player. The rule: read an entry function for what sits outside the try.

## The frame cap, and why it is not enough

Every generator pushes frames through one builder, and at 600 frames it appends a single limit frame, "Stopped: frame limit reached", and ignores everything after. At most 601 frames, and the learner is told why.

Picture bubble sort over 40 numbers in reverse order: 780 swaps. Swaps 1 to 599 become frames. Swap 600 becomes the limit frame. The generator's next check sees the builder is full and returns, so the remaining swaps, and the sorted frame, are never generated. 601 frames, about half a millisecond.

Now the trap.

[pause]

The cap bounds memory, not work. Push returning early does not stop the loop that calls it. Generators run synchronously on the main thread, during render, so a loop that never terminates freezes the page however many frames it throws away. That is why the family files check whether the builder is full 170 times. Termination is each generator's job. A worker would make a runaway generator killable, like the code runner, but generators are first-party code that finish in milliseconds, and a worker would make the first frame asynchronous on every lesson.

## The registry, and a DSL for the system family

The registry maps 17 family names to families, and each family maps algorithm names to generators. There is no allow-list in the Rust backend; it passes the JSON straight through, because the names live in TypeScript and a Rust copy would be a second source of truth. The check lives where the knowledge lives: a content scan in CI runs every block through the page's own function. Deploys wait for CI, so a misspelt algorithm name blocks the deploy.

The registry also decides what learners download. It imports every family, so the one lazy chunk carries all 17: about 200 kilobytes compressed. A lesson with one binary search downloads the machine-learning family too.

Some families are drawn by hand per algorithm. The system family's 49 scenarios are scripts over a tiny DSL, where each call sends a message between named boxes and pushes one frame. A scenario reads like a narrated sequence diagram. The DSL buys visual consistency, authors who think in messages instead of coordinates, and above all bulk testing: every scenario has the same shape, so one test can check that every message goes between nodes that exist. That matters, because the renderer silently skips an arrow with an unknown endpoint.

## Testing, and what nobody watches

The tests come in two kinds. Property-style tests run each scenario against a matrix of hostile inputs, from an empty object to negative, not-a-number and infinite values, and check that every note is non-empty and never contains the words "undefined" or "NaN". Crude, and it works: interpolating a missing field into a sentence is the commonest generator bug. Semantic tests check behaviour, like a hash table's resize keeping every key. Shape tests find crashes; semantic tests find animations that teach the wrong thing.

And the coverage map has gaps. Six families have no test file, so a spanning-tree animation with plausible frames and the wrong tree would pass. The content scan's tests are named "renders" and never render anything.

## In the interview

A follow-up the lesson expects: a generator hangs the page for one input. Why didn't the cap save you?

[pause]

Because push stops recording at 601 frames but cannot stop the loop calling it, which runs synchronously on the main thread. Termination comes from full-checks and bounded inputs; the structural fix is a worker with a timeout, at the cost of an asynchronous first frame everywhere. The wrong answer is "the cap stops it at 600 frames".

And: what breaks first if authors add a thousand more animations? Not the server, which never runs a generator. First the bundle, then the catalogue kept in sync by a comment, then review, as untested families grow.

## Recap

Four things to remember. Choose snapshots over diffs when consumers need random access and the memory is bounded, and state the bound as a measured number. Test snapshot code for aliasing by content, not by reference. Capping output does not cap work; only the loop, a thread boundary or a kill switch does. And read entry code for what sits outside the try, and what a shallow merge fills in silently.

At your desk: the binary-search trace and live animations, the entry function line by line, the measurements and coverage map, and the frame-recorder exercise.

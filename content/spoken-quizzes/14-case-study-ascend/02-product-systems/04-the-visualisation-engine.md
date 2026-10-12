---
lesson: the-visualisation-engine
source: 4067463e78cb4af9
---
## 1

Why does Ascend's visualisation engine store a full snapshot per frame, instead of a list of diffs?

A, any frame is reachable by setting an index, and tests assert on plain data. B, React cannot render a diff without first replaying it into a full state. C, diffs cannot be serialised to JSON, so the tests could not inspect them. D, snapshots use less memory than diffs once the 600 frame cap applies.

[think]

The answer is A: any frame is reachable by setting an index, and tests assert on plain data.

Diffs are smaller, which is the tempting answer, but then every backward step needs an inverse operation or a replay from the start, and every renderer must apply diffs correctly. Snapshots make the renderer a pure function of one frame. Measured over the curriculum, they cost a median of about 9 kilobytes of JSON per animation, and about 270 kilobytes for an array animation at the cap.

## 2

A new generator has a loop whose exit condition is never met for one input, and it pushes a frame on every iteration. What happens when a lesson renders it?

A, React catches the runaway loop, and shows the warning box instead. B, the player shows the limit frame, and lets the learner scrub through the rest. C, the page freezes, because push stops recording but the loop keeps running. D, the cap stops the loop once 600 frames have been recorded for it.

[think]

The answer is C: the page freezes, because push stops recording but the loop keeps running.

Push returns early after the limit frame, but that only bounds memory. Generators run synchronously on the main thread while the page renders, so nothing interrupts the loop, and the engine never returns to show anything. Loops must check whether the frame list is full, which the families do 170 times, or otherwise terminate.

## 3

A lesson adds a visualisation block whose algorithm is misspelled as "dijkstraa", and it is pushed to main. Where does the mistake surface?

A, in CI's web job, where the content test runs every visualisation block through the engine. B, in the Docker build, where the content check rejects the unknown algorithm. C, nowhere before production; learners see a warning box in the lesson instead. D, in cargo test, where the embedded curriculum test resolves each visualisation block.

[think]

The answer is A: in CI's web job, where the content test runs every visualisation block through the engine.

The Rust loader only checks that a visualisation block is valid JSON, because the registry lives in TypeScript, so neither the Docker build nor cargo test notices. The Vitest content scan runs the exact spec through the page's own function, and fails with the list of known algorithms. With Railway waiting for CI, that failure also blocks the deploy.

## 4

A generator sets a frame's variables to an object whose answer field points at an array, before each push, and keeps filling that array in place. The snapshot copies the variables object with a spread. After the run, what does frame 1's variables panel show?

A, the final answers, because every frame's answer is the same array. B, a warning box, because the engine detects the mutated frame and fails. C, the answers at frame 1, because the spread copied the variables object. D, nothing, because the frame cap drops arrays nested inside the variables.

[think]

The answer is A: the final answers, because every frame's answer is the same array.

The spread copies one level: each frame gets a new variables object, but its answer field points at the one array, which the generator keeps mutating. This was the bug in the monotonic stack and depth-first search generators until a recent fix. A test that the first and last states are different objects passes; comparing each frame's JSON at push time with its JSON at the end catches it.

## 5

A lesson embeds a binary search block with the values 2, 4 and 6, and no target. The family's example for binary search has a target of 15, and the generator's parameter default is a target of zero. What does the learner see?

A, a search for zero that ends with the target reported absent. B, a search for "not a number", printed in every step's note. C, a search for 15 that ends with the target reported absent. D, a warning box saying the target field is required here.

[think]

The answer is C: a search for 15 that ends with the target reported absent.

The engine merges the family's example under the author's fields, so the author's values win, and the example's target of 15 survives. The parameter default only applies when the target is undefined, which it no longer is. "Not a number" appears only when the author supplies a non-number, such as the word six. The content scan passes this block, because every note is non-empty.

## 6

Bubble sort on the 40 values from 40 down to 1 needs 780 swaps, each pushing a frame, after one intro frame. With a maximum of 600 frames, what does the finished frame list contain?

A, 601 frames: the intro, 599 swaps, and the final sorted frame. B, 782 frames, since push keeps recording and the player trims. C, 601 frames: the intro, 599 swaps, and the limit frame. D, 600 frames: the intro and 599 swaps, with no limit frame.

[think]

The answer is C: 601 frames, the intro, 599 swaps, and the limit frame.

The push for swap 600 arrives when the builder holds exactly 600 frames, so it records the limit frame, with the state after that swap, instead of its own note. The list is now full, the generator's next check returns, and the sorted frame is never generated. The cap is applied inside push; the player never trims anything.

---
lesson: testing-live
source: 0ead68540fcf4a47
fit: partial
desk:
  - "The risk table: code shapes, the bug each invites, and the test that exposes it"
  - "The lower-bound binary search traced on two elements"
  - "Merge Intervals: the eleven-line draft, its four bugs traced, and the restructured version"
  - "The LRU Cache state trace, row by row, and the invariant check function"
  - "Cases as data, the randomised differential test, and the measured hidden linear costs in CPython and Node"
  - "Exercise: merge intervals that survive the risky-line tests"
---
## Introduction

You finish typing, lean back and say "I think that works." The interviewer pauses and asks, "What does it return for an empty list?" Everything about how that question is asked tells you they saw the bug a while ago and have been waiting to find out whether you would see it too. You did not. Whatever happens next, the notes will say "bug found by interviewer", and at a senior bar that is a much worse line than "found and fixed own bug".

Testing in an interview demonstrates one habit: whether you check your own work before someone else has to. Four ideas, then. Which three tests to run, in which order. How to find the line most likely to be wrong. Why a stateful class has to be traced by its state, not its answers. And what the interviewer writes while you do it.

## Three passes

When you have six minutes, run three passes in this order.

First, the example you wrote at minute 6. It proves the main path and exercises most of the code. Trace it all the way to the return statement, because many bugs live in the last step.

Second, the smallest degenerate input: empty, a single element, capacity zero. It catches crashes on the first element of an empty list, sentinel nodes treated as data, and loops that assume at least one iteration.

Third, the adversarial input. Choose it by reading your own code for risk, and make it the smallest input that reaches the risky line, because every extra element is another row to trace.

Then list the other edge cases in a sentence each, pointing at the line that handles them. "Duplicates: the less-than-or-equal on line 6 handles equal starts."

## Reading your own code for risk

Certain code shapes produce the same bugs again and again. A loop that emits a group when the group changes forgets to emit the last group. A strict less-than mishandles values that are equal or touching. A running value that is overwritten, rather than extended with a max, breaks when a later item is contained in the current one. Binary search updates loop forever or land one off. And a method with an "already exists" branch, like updating a key, skips a step that the new-key path does.

You do not need to memorise the list. You need the reflex it builds. After coding, glance over the code and ask: which line would I bet against? Then test that line.

Here is why the smallest input matters. A lower-bound binary search, written quickly, sets low to mid when the middle value is too small. Test it on four elements and it simply hangs, which tells you nothing. Test it on two elements, 1 and 3, looking for 3. Mid rounds down to low, low is set to mid, and the second iteration is identical to the first. That is the infinite loop, visible in two rows. The fix is low equals mid plus one, which is safe because the middle value is ruled out. A second two-row trace, looking for a value past the end, finds the other bug: high started at the last index, so the range never included the position past the end. Two bugs, both found by tiny traces, neither by the natural four-element example.

## Four bugs in eleven lines

The lesson's first session is a quick first draft of Merge Intervals, with touching intervals merging. It has four bugs, and the three passes find all of them.

Pass one, the example: four intervals, three in the answer. Trace it to the return, and the last interval is missing. The loop emits a block only when the next block starts, so the final block is never emitted. Candidates miss this because they stop tracing when the loop looks right, before the return.

Pass two, empty input. The draft reads the first interval before the loop, so it crashes.

Pass three, the riskiest lines, and there are two. The comparison is a strict less-than, and the end is overwritten instead of extended. Containment, 1 to 10 then 2 to 3: the block shrinks to end at 3. Touching, 1 to 2 then 2 to 3: they stay separate. Two more bugs.

Instead of four patches, restructure so two of them cannot exist: write directly into the last output element, so there is no separate current block to flush and no first element to read. Say why you did it. Then re-run the earlier traces, because any change can break a case that passed.

## When the return values lie late

Stateful classes hide bugs differently. A wrong line corrupts the structure, and the return values only go wrong several operations later.

The lesson's second session is an LRU cache, a map plus a list in recency order, whose put always creates a new node, even for a key that already exists. Capacity 2. Put key 1, put key 2, then update key 1 to 10. Now the list holds three nodes for two keys: the stale old node for key 1, key 2, and the new node for key 1. Nothing is returned, so nothing looks wrong.

Next, put key 3, which forces an eviction. The eviction takes the stale node from the front, and deletes key 1 from the map, which removes the entry for the live node. Still nothing returned.

Before I tell you: which operation is the first to return a wrong answer?

[pause]

The next one, get key 2. It returns 2, but key 2 should have been evicted. Then get key 1 returns minus one instead of 10, and two operations later the program crashes on the orphaned node. One root cause, three symptoms, two to five operations after the line that caused them.

A candidate who traces only returns sees "get 2 returned 2" and starts looking at eviction, which is where the damage landed, not where it began. A candidate who traces the list sees three nodes for two keys at the update and fixes the right line: in put, look the key up first, and if it exists, update the value and move it to the end.

So trace the state, and state the invariant: every node in the list is the one the map points to, and there are as many nodes as keys. With an editor that runs code, turn that into a check after every operation. On the buggy class, it fails at the update itself, two operations before the first wrong return value. Saying "I'm checking the structure after each operation, not only the answers" is a strong line on its own.

## Running code, and hidden costs

Budget the tracing. One loop iteration traced aloud takes roughly 10 to 20 seconds, and one row of a stateful trace 20 to 40. So a six-minute testing phase holds about 15 to 25 spoken rows. That is why the third pass uses the smallest input that reaches the line.

When the editor runs code, the risk becomes running instead of thinking. Two habits. Say what you expect before you run; if you cannot predict the output, you do not understand the code well enough to judge it. And write the cases as data, so they all re-run after every fix, one change per run. With time left, a randomised test against a brute force you trust, on small value ranges, finds what you did not think of. On Merge Intervals it caught the touching bug within 13 random trials and the containment bug within 19, every time.

Then check the complexity of the code you wrote, not the one you planned. Interview code often hides an extra factor of n. Draining a Python list from the front took 0.21 seconds at 100 thousand elements and 0.93 seconds at 200 thousand. Doubling n multiplied the time by about four and a half: quadratic, because each pop from the front shifts everything behind it. A deque took about 2 milliseconds. A fourfold increase when n doubles is the signature to listen for.

## When the interviewer finds it first

It will happen, and how you respond is scored as much as the bug. The weak response: "Hmm, it should work. Oh, wait," and an if-statement for that input. That patches the symptom and re-tests nothing. The strong response traces the input aloud, names the root cause in a sentence, "I'm assigning the new end instead of taking the max", fixes the logic, re-runs the first example, and names the missed test category without grovelling. Defensiveness, like "that's an unusual input", costs more than the bug did.

Interviewers rarely say "there is a bug". "Can you walk me through this part?" usually means the bug is on or near that line. "Are you sure about the less-than?" means they are one step from telling you. And "let's move on" with a bug still present means they have recorded it. Then say it in one sentence: one known issue, containment, the fix is a max on line 5. That becomes "identified remaining bug and its fix" instead of "left bug in code".

In the debrief, testing is argued from four facts, roughly in this order. Who found each bug. Where it was: a main-path bug weighs more than an exotic edge. Whether the fix was a root-cause fix. And what state the code was left in. Two candidates in the lesson wrote the same eleven lines. One found all four bugs unprompted; the other had two found for them and left the flush bug in. The code was not the difference.

## In the interview

A follow-up the lesson expects. What is the invariant of your LRU structure, and how would you check it?

[pause]

Every node in the list is the node the map holds for its key, the list and the map have the same size, the size is at most the capacity, and the list order is recency order. The first three can be asserted after every operation. The wrong answer is "get returns the right value", which is a consequence of the invariant and, as the trace showed, lags the corruption by several operations.

And another: your tests pass; how confident are you? Confident on the cases you traced, and say which. Not yet on the ones you did not, and not on performance at 100 thousand, which the complexity argument covers but no run has checked. The wrong answer is "a hundred percent", which the interviewer then tests.

## Recap

Four things to remember. Test in three passes: the example to the return, the smallest degenerate input, then the smallest input aimed at the line you would bet against. On a stateful class, trace the state and state the invariant, so the bug shows up at the operation that causes it. When a bug is found, trace it, name the root cause, fix the logic and re-run the earlier cases. And re-check the complexity of the code as written: a fourfold slowdown when n doubles means a hidden quadratic.

At your desk: the risk table, the binary search and Merge Intervals traces, the LRU state trace and check function, the randomised test and the measured hidden costs, and the merge intervals exercise.

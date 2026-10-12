---
lesson: cycle-detection
source: af9e71bf14ed6269
---
## 1

In Floyd's algorithm, why is it guaranteed that the fast pointer does not jump over the slow pointer without landing on it?

A, the cycle length is always even, so a jump of two lands on every node. B, the list is finite, so fast must eventually visit every node in the cycle. C, the gap between them changes by exactly one node each iteration. D, the gap between them shrinks by two nodes each iteration, reaching zero.

[think]

The answer is C: the gap between them changes by exactly one node each iteration.

With speeds one and two, the relative speed is one, so the distance from slow forward to fast grows by one each iteration. It must pass through a multiple of the cycle length within that many iterations of slow entering the cycle. A gap that changed by two could skip over that multiple on cycles of even length, and cycles can have any length.

## 2

In Floyd's algorithm, after the pointers meet, one is reset to the head and both advance one step at a time. Call the tail length F and the cycle length C. Why do they meet at the cycle start?

A, the cycle length always equals the tail length, so both walks take F steps. B, both pointers move at the same speed, so they are bound to meet somewhere. C, slow sits at cycle position minus F, mod C, so F more steps land it on the start. D, the first meeting point is always the cycle start, so the walk only confirms it.

[think]

The answer is C: slow sits at cycle position minus F, mod C, so F more steps land it on the start.

The meeting time is a multiple of C, so slow's position in the cycle is that multiple minus F, which is minus F, mod C. Adding F steps gives a multiple of C, the start, on the same step that the head pointer arrives there after F steps. Equal speed alone does not guarantee a meeting: two pointers at different cycle positions moving at the same speed never meet.

## 3

An array holds n plus 1 integers, each between 1 and n. Which of these lets you apply Floyd's algorithm to find the duplicate?

A, sort the array first, so equal values become adjacent nodes in the chain. B, link index i to the value at i, and the duplicate is where slow and fast first meet. C, treat index i as a node whose next is the value at i, and the duplicate starts the cycle. D, use the array as a hash set, negating the entry at v to mark each value v as seen.

[think]

The answer is C: treat index i as a node whose next is the value at i, and the duplicate starts the cycle.

Values from 1 to n are valid indexes, so following index to value defines a function on n plus 1 nodes with only n targets. Some target has two incoming edges, and that node is where the cycle begins. The first meeting point is somewhere inside the cycle, not necessarily its start, so the second phase is still needed. Sorting and negation both modify the array.

## 4

Which comparison correctly tests whether the two pointers have met, in a linked list of node objects?

A, slow is fast, since only identity proves they are the same node. B, slow's value equals fast's value, since meeting means reaching the same value. C, the id of slow's value equals the id of fast's value, since ids are unique per node. D, slow's next is fast's next, since equal successors mean the same node.

[think]

The answer is A: slow is fast, since only identity proves they are the same node.

Two distinct nodes can hold equal values, so comparing values gives false positives, and small integers share one object, so their ids match too. Identity comparison, "is" in Python or triple equals on objects in JavaScript, checks that both references point at the same node. Equal successors do not prove it either: the cycle's first node has two predecessors.

## 5

Speeds one and three are used instead of one and two, on a list with no tail and a cycle of length 4. What happens?

A, the pointers never meet, since a gap that changes by two skips every node. B, the pointers meet at the cycle start directly, so the second phase is unnecessary. C, the pointers meet only after the fast one has lapped the cycle four times. D, the pointers meet after two iterations, but the cycle-start walk then fails.

[think]

The answer is D: the pointers meet after two iterations, but the cycle-start walk then fails.

With speed three, the pointers coincide when twice the iteration count is a multiple of 4, so at iteration 2 they meet, at cycle position 2. Because 2 is not a multiple of the cycle length, slow is not where the second phase needs it, and advancing a head pointer and slow together never lands both on the start. Speed two guarantees the meeting time is a multiple of the cycle length, which is what the second phase relies on.

## 6

You need the period of a deterministic state machine whose step function is expensive and whose states are large. What is the most appropriate method?

A, store every state in a hash set until the first repeated state appears. B, serialise every state to disk, and compare checksums of each new one. C, run Brent's cycle detection over the step function, one evaluation per step. D, run for a fixed large number of steps, then scan the log for repeats.

[think]

The answer is C: run Brent's cycle detection over the step function, one evaluation per step.

Cycle detection over an iterated function stores a constant number of states. Brent's variant evaluates the step function once per step, against three for Floyd, and reports the cycle length directly. A hash set costs memory in proportion to the tail plus the cycle, and requires hashing large states, and a fixed run may stop before the cycle closes.

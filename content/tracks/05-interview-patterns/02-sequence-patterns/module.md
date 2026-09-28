---
slug: sequence-patterns
title: Linked list, stack, heap & hashing patterns
description: The eight patterns that turn linked lists, stacks, heaps and hash maps from data structures you know into tools you reach for on sight.
prerequisites: [data-structures/heaps]
---
You already know how a hash map, a stack, a heap and a linked list work; the [data structures track](/learn/data-structures/hashing/hash-tables) builds each one from the bytes up. This module is the other half of the interview skill: reading a problem statement and knowing within a minute that it is "top-k with a heap" or "monotonic stack", saying why the nearest alternative is worse, writing the standard shape without an off-by-one, and then handling the follow-up that changes the pattern ("the stream does not fit in memory", "k is close to n", "now do it in O(1) space"). That instant, defensible classification is what frees the rest of the round for edge cases and the conversation that earns a senior rating.

Each lesson follows the same shape. It opens with the signal and a table of near-miss statements that look like the pattern but need something else. It gives the template in Python and JavaScript with the invariant that makes it correct, argued rather than asserted: why the map must be queried before it is updated, why fast and slow pointers meet and why resetting one to the head finds the cycle's entry, why a monotonic stack does at most 2n comparisons, why two heaps always hold the median at a root. It then works three or more practice problems with a state table per step on concrete input, lists the variants, derives the complexity, and measures what the runtime does underneath on CPython 3.14 and Node 24. Every lesson closes with production failure modes, interviewer follow-ups with model answers, the mistakes mid-level candidates make, verified exercises, and a quiz.

| If the statement says | Lesson |
|---|---|
| "pair that sums to", "how many times", "group", "seen before" | [Hash-map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns) |
| "cycle", "middle", "repeated value, read-only, O(1) space" | [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) |
| "reverse", "reorder", "in place" on a linked list | [In-place linked list](/learn/interview-patterns/sequence-patterns/in-place-linked-list) |
| "valid brackets", "evaluate", "nested", "collide" | [Stack patterns](/learn/interview-patterns/sequence-patterns/stack-patterns) |
| "next greater", "nearest smaller", "days until", "largest rectangle" | [Monotonic stack](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern) |
| "k largest", "k most frequent", "k closest" | [Top-k elements](/learn/interview-patterns/sequence-patterns/top-k-elements) |
| "median of a stream", "balance two halves" | [Two heaps](/learn/interview-patterns/sequence-patterns/two-heaps) |
| "merge k sorted", "smallest range across lists" | [K-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) |

Several of these patterns overlap, and part of what the module teaches is choosing out loud. "Merge k sorted lists" is both a linked-list splice and a k-way merge; "sliding window maximum" is both a sliding window and a monotonic deque; "find the duplicate" is a hash set until the interviewer forbids extra memory, and then it is cycle detection on an array read as a linked list. Say which pattern you are choosing, what it costs, and why the alternative is worse.

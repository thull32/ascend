---
slug: sequence-patterns
title: Linked list, stack, heap & hashing patterns
description: The eight patterns that turn linked lists, stacks, heaps and hash maps from data structures you know into tools you reach for on sight.
prerequisites: [data-structures/heaps]
---
You already know how a hash map, a stack, a heap and a linked list work. This module is about the other half of the interview skill: seeing a problem statement and knowing, within a minute, that it is a "top-k with a heap" problem or a "monotonic stack" problem, then writing the standard shape without hesitation. That instant classification is what frees up the rest of the interview for edge cases, follow-ups and the conversation that actually earns a senior rating.

The eight lessons cover the hash-map family (counting, complement lookup, grouping and dedupe), the two linked-list families (fast/slow pointers and in-place rewiring), the two stack families (matching and evaluation, then the monotonic stack), and the three heap families (top-k, two heaps for streaming medians, and k-way merge). Each lesson gives the signal that selects the pattern, the template in Python and JavaScript, two or three Ascend 150 problems traced step by step, the variations you will be pushed towards, and the pitfalls that cost candidates the round.

Several of these patterns overlap. "Merge k sorted lists" is both a linked-list problem and a k-way merge; "sliding window maximum" is both a sliding window and a monotonic deque. Part of what this module teaches is how to say, out loud, which pattern you are choosing and why the alternative is worse.

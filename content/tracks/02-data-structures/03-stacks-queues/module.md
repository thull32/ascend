---
slug: stacks-queues
title: Stacks, queues and deques
description: The LIFO and FIFO containers under every call stack, scheduler and parser, their array and ring-buffer implementations, and the monotonic stack and deque techniques that turn O(n²) scans into O(n).
prerequisites: [data-structures/arrays-strings]
---
Stacks and queues are the simplest abstract data types and the most frequently mis-implemented. A queue built on `list.pop(0)` or `array.shift()` is O(n) per operation and it ships to production every week. A recursion that should have been an explicit stack overflows at depth 1,000. A "sliding window maximum" written with a heap is a log factor slower than it needs to be.

This module covers the mechanics first: array-backed stacks, ring-buffer queues, deques, the two-stack queue and what each language's standard library actually gives you. It then spends two lessons on the monotonic stack and monotonic deque, a pair of techniques that look like tricks and are really one invariant applied twice, with a proof of why they are linear. The final lesson connects stacks to what they run: parsers, expression evaluators, undo systems, iterative DFS and the call stack itself.

By the end you should be able to implement any of these from scratch, say what the amortised cost of each operation is and why, and recognise the "next greater element" and "window extremum" shapes in a problem before the interviewer finishes describing it.

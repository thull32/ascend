---
slug: linked-lists
title: Linked lists
description: Pointer-based sequences from first principles with per-node byte counts and the cache-miss arithmetic, the two-pointer techniques every interview expects traced step by step, Floyd's cycle detection with its proof and Brent's alternative, and the merge and partition primitives behind sorting and storage engines.
prerequisites: [data-structures/arrays-strings]
---
Linked lists are the first data structure that is not an array, and the first place most engineers meet pointer manipulation as a skill in its own right. In production you will rarely write one by hand, but you will use them constantly without noticing: LRU caches, allocator free lists, the Linux kernel's intrusive `list_head`, CPython's block-based `deque`, Java's `LinkedHashMap`, and the chains inside a hash table are all linked lists.

Interviews use them for a different reason. A linked-list problem is a compact test of whether you can reason about pointers, invariants and edge cases (empty list, single node, the last node) without a debugger. Reversal, fast/slow pointers, cycle detection and merging are the four techniques that cover almost every question, and each has a short proof of correctness that you should be able to give.

This module builds the node-and-pointer model with measured node sizes (48 bytes for a slotted CPython node, 16 for a Rust `Box`), contrasts it honestly with arrays (a pointer chase is a cache miss, so a list traversal is often 10–50× slower than an array scan, and the module shows the arithmetic behind that range), and then works through the four techniques with per-step state tables: iterative and recursive reversal with the call stack drawn, middle and nth-from-end on odd and even lengths, Floyd's algorithm with the modular-arithmetic proof and Brent's faster variant, and the applications beyond lists (functional graphs, duplicate finding, random-number periods, symlink and redirect loops). It ends with the merge and partition primitives, traced with sentinels, and follows them into `heapq.merge`, Timsort, LSM compaction and external sorting.

---
slug: linked-lists
title: Linked lists
description: Pointer-based sequences from first principles, the two-pointer techniques every interview expects, Floyd's cycle detection with its proof, and the merge and partition primitives behind sorting and storage engines.
prerequisites: [data-structures/arrays-strings]
---
Linked lists are the first data structure that is not an array, and the first place most engineers meet pointer manipulation as a skill in its own right. In production you will rarely write one by hand, but you will use them constantly without noticing: LRU caches, memory allocators, kernel scheduler queues, Python's `deque`, and the chains inside a hash table are all linked lists.

Interviews use them for a different reason. A linked-list problem is a compact test of whether you can reason about pointers, invariants and edge cases (empty list, single node, the last node) without a debugger. Reversal, fast/slow pointers, cycle detection and merging are the four techniques that cover almost every question, and each has a short proof of correctness that you should be able to give.

This module builds the node-and-pointer model, contrasts it honestly with arrays (which win far more often than textbooks admit), and then works through the four techniques with hand traces, ending with the merge and partition primitives that reappear in merge sort, k-way merge and log-structured storage.

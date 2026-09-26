---
slug: heaps
title: Heaps and priority queues
description: How a binary heap turns "give me the smallest thing" into O(log n) with an array and no pointers, and where priority queues quietly run production systems.
prerequisites: [data-structures/arrays-strings]
---
Every scheduler, every event simulator, every shortest-path search and every "top ten" dashboard has the same inner loop: repeatedly take the most urgent item from a set that keeps changing. A sorted list answers that in O(1) but costs O(n) to maintain; a hash table maintains cheaply but cannot answer "smallest" at all. The binary heap sits exactly between them, O(log n) for both insert and extract, with a memory layout so simple it is a flat array.

This module builds the heap from its array layout and the two repair operations that keep it valid, then moves to how priority queues are used and misused in real code: what the standard libraries actually give you, why ties break unpredictably, and how to make a heap stable. The third lesson covers the interview pattern family that heaps own outright: top-k, k-way merge and the streaming median. The last lesson tackles the operation a plain binary heap cannot do, decrease-key, and the two ways to fake it (lazy deletion and an indexed heap), together with the honest question of when you should be using a balanced tree instead.

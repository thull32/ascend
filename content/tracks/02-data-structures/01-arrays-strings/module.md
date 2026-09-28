---
slug: arrays-strings
title: Arrays and strings
description: The contiguous-memory structures behind every list, buffer and string you use, with the measured cost model, the growth rules of five runtimes, the byte-level string layouts and Unicode traps, and the in-place techniques interviews expect, each traced by hand.
prerequisites: [foundations/complexity]
---
Arrays are the only data structure the hardware understands. Everything else, from hash tables to B-trees, is eventually laid out in one, and most of the performance folklore you have absorbed ("arrays are fast", "linked lists are slow", "strings are immutable") comes down to how contiguous memory interacts with the CPU cache.

This module starts at the byte level: how an index becomes an address, why appending is O(1) only on average, and what your language's list actually allocates (CPython's `n + n/8 + 6` over-allocation traced resize by resize, V8's `1.5n + 16`, Rust's doubling, Go's size classes, Java's `1.5n`), with what one `insert(0, x)` on a million elements costs in cache lines and measured milliseconds. It moves through strings (PEP 393 byte counts, V8 cons strings, the five conditions under which CPython makes `+=` linear, and code points versus code units versus grapheme clusters on real emoji), two-dimensional grids (row-major address arithmetic, the measured 20× cost of walking columns, strides, pitches and tiles), prefix sums (1D, 2D and difference arrays traced cell by cell, with the overflow limits) and finishes with the in-place techniques (Lomuto and Hoare partitions, Dutch national flag, three-reversal rotation, cycle leaders) that let you answer "can you do it in O(1) extra space?" without hesitation.

Every lesson carries production failure modes with symptom, diagnosis and fix, the follow-up questions a senior interviewer asks next, and two exercises whose tests you can reproduce from the traces. By the end you will be able to read a line like `nums.insert(0, x)` or `s += ch` and see the memory traffic behind it, and you will have the two-pointer and partitioning reflexes that the algorithms and interview-pattern tracks build on.

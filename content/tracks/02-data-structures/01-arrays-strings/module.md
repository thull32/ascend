---
slug: arrays-strings
title: Arrays and strings
description: The contiguous-memory structures behind every list, buffer and string you use, with the cost model, the growth strategy and the in-place techniques interviews expect.
prerequisites: [foundations/complexity]
---
Arrays are the only data structure the hardware understands. Everything else, from hash tables to B-trees, is eventually laid out in one, and most of the performance folklore you have absorbed ("arrays are fast", "linked lists are slow", "strings are immutable") comes down to how contiguous memory interacts with the CPU cache.

This module starts at the byte level: how an index becomes an address, why appending is O(1) only on average, and what your language's list actually allocates. It moves through strings (which are arrays with rules), two-dimensional grids (which are arrays with arithmetic), prefix sums (which turn arrays into O(1) range oracles) and finishes with the in-place techniques that let you answer "can you do it in O(1) extra space?" without hesitation.

By the end you will be able to read a line like `nums.insert(0, x)` or `s += ch` and see the memory traffic behind it, and you will have the two-pointer and partitioning reflexes that the algorithms and interview-pattern tracks build on.

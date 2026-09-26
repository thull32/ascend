---
slug: sorting-searching
title: Sorting and searching
description: The sorts your language actually ships, the lower bound they cannot beat, and binary search as a general tool for any monotone question.
prerequisites: [data-structures/arrays-strings]
---
Sorting and searching are the two operations you call most and implement least. That is exactly why interviewers use them: a candidate who can only say "quicksort is O(n log n)" has memorised a fact, while a candidate who can explain why `sort()` in Python is a merge sort with run detection, why Rust ships two different sorts, and why binary search is really a tool for asking monotone questions has understood a mechanism.

This module starts with the comparison sorts and the partition schemes that make quicksort fast or quadratic. It then breaks the comparison model to show how counting and radix sort go below n log n, and proves the lower bound that says nothing else can. The second half is binary search done properly: the invariant that makes the code correct, the off-by-one discipline that makes it stay correct, and the generalisation to "binary search on the answer" that turns a family of hard-looking optimisation problems into a predicate and a loop. It closes with selection: finding the k-th element in linear time without sorting at all.

By the end you should be able to derive any of these algorithms from its invariant rather than recall it, and say what your production stack is doing when you call `sort` or `bisect`.

---
slug: complexity
title: Complexity & the cost model
description: Derive the cost of code from a model of the machine, express it precisely, and know exactly when the asymptotic answer misleads you.
---
Every interview answer and every capacity plan rests on one question: how does the cost grow with the input? Big-O is the shorthand for the answer, but most engineers learn it as a lookup table ("hash map is O(1), sort is O(n log n)") and cannot derive it for code they have just written, let alone say when it stops being true.

This module starts from the cost model itself: a machine with unit-cost operations and unlimited memory, the assumptions that model quietly makes, and what happens when reality (caches, allocation, constant factors) breaks them. From there you learn to read O, Ω and Θ off code, to reason about amortised costs where a single expensive operation is paid for by many cheap ones, to count space as carefully as time, and to solve the recurrences that recursive and divide-and-conquer algorithms produce.

The module ends where a senior engineer's judgement starts: measuring. You will see a quadratic algorithm beat a linearithmic one on real input sizes, learn why micro-benchmarks lie, and adopt the discipline of profiling before optimising. By the end, "this is O(n log n)" will be a claim you can derive, defend and, when the numbers disagree, override.

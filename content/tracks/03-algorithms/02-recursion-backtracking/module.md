---
slug: recursion-backtracking
title: Recursion and backtracking
description: Design recursive functions you can trust, enumerate combinatorial objects without duplicates, prune constraint searches hard, and recognise the moment a search becomes dynamic programming.
prerequisites: [foundations/how-code-runs]
---
Most engineers can write a recursive function that works on the example. Fewer can say *why* it terminates, what it costs on the call stack, or how to turn it into a loop when the input is a million elements deep. Almost none can look at a backtracking search and predict, before running it, whether it finishes in a millisecond or a month. This module builds those skills, because every tree, graph, parsing and dynamic-programming technique that follows sits on top of them.

The first lesson treats recursion as a contract: a base case you can point at, a recursive call you trust by induction, and a stack frame you pay for. The second turns that contract into the choose/explore/unchoose template and uses it to generate subsets, permutations and combinations, including the duplicate-handling rule that trips up most candidates. The third applies the template to constraint problems (N-queens, sudoku, word search) where the whole game is pruning: how you order choices and how early you detect a dead end decides whether the exponential worst case ever shows up.

The fourth lesson is the pivot of the algorithms track. It takes a backtracking search, counts the subproblems it solves twice, adds a cache, and watches the exponential collapse to polynomial. That is memoisation, and once you can see which arguments define a subproblem you are already doing dynamic programming; the [next module](/learn/algorithms/dynamic-programming/the-dp-mindset) just makes it systematic.

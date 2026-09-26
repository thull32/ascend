---
slug: dynamic-programming
title: Dynamic programming
description: Turn exponential recursion into polynomial tables by defining the state precisely, deriving the transition, and filling the table in the right order.
prerequisites: [algorithms/recursion-backtracking]
---
Dynamic programming is the topic most candidates fear and most interviewers love, for the same reason: it cannot be faked. You either see the state and the transition or you do not. The good news is that the skill is learnable, because every DP solution, from climbing stairs to burst balloons, is produced by the same four-step procedure: define what a subproblem is, write the recurrence that expresses a subproblem in terms of smaller ones, decide the order in which to solve them, and read off the answer.

This module drills that procedure until it is reflexive. The first lesson builds the mindset from a recursive solution you already know how to write. The next six lessons walk the major DP families (one-dimensional, grid, string, knapsack, sequence, interval and tree) and in each one derive the state definition and the transition *explicitly* before showing the table being filled with concrete numbers. The final lesson covers the craft that separates a passing answer from a senior one: reconstructing the actual solution, cutting memory from O(n²) to O(n), spotting DP in problems that do not look like DP, and knowing when DP is the wrong tool.

By the end you should be able to take an unfamiliar optimisation or counting problem, say "the state is (i, j) meaning …, the transition is …, the order is …, the answer is …" out loud, and then fill in the table by hand for a small input to check it before writing code.

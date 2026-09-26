---
slug: greedy
title: Greedy algorithms
description: When a locally best choice is globally optimal, how to prove it with an exchange argument, and how to spot the cases where greed quietly returns the wrong answer.
prerequisites: [algorithms/sorting-searching]
---
Greedy algorithms are the shortest code you will write in an interview and the easiest to get wrong. The algorithm itself is usually one sort and one loop; the difficulty is entirely in the question "is the obvious choice actually safe?". Mid-level engineers answer that question by intuition and are right about two thirds of the time. Senior engineers answer it with a two-line exchange argument, or with a five-element counterexample that sends them to dynamic programming instead.

This module teaches both halves. The first lesson is about the proof technique: the greedy-choice property, the exchange argument, "greedy stays ahead", and the canonical failures (non-canonical coin systems, 0/1 knapsack) that every interviewer keeps in their back pocket. The second lesson is the most common greedy family in interviews, interval problems, where the entire algorithm is deciding which endpoint to sort by. The third walks the classic greedy algorithms (Huffman, jump game, gas station, task scheduling) and reframes Dijkstra, Prim and Kruskal as greedy algorithms justified by a cut property, so you see the same idea across the whole algorithms track.

By the end you should be able to look at a problem, state a candidate greedy choice, try to break it in under a minute, and either prove it or abandon it for DP without losing the interview clock.

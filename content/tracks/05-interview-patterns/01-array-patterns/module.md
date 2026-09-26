---
slug: array-patterns
title: Array & string patterns
description: The nine patterns behind most array and string interview problems, from two pointers and sliding windows to intervals, cyclic sort and matrix traversal.
prerequisites: [algorithms/technique-mastery]
---
Arrays and strings are where most coding rounds start, and where most candidates lose the most time. The problems look different on the surface ("longest substring", "container with most water", "merge these meetings", "find the missing number") but they map onto a small set of mechanical patterns. An engineer who knows the patterns spends the first two minutes classifying the problem and the remaining time executing; an engineer who does not spends thirty minutes rediscovering a sliding window.

This module teaches the nine array patterns as decisions. Each lesson names the signal in the problem statement that selects the pattern, hands you a template you can type from memory in Python or JavaScript, and then runs two or three Ascend 150 problems through the template with full traces so you see exactly where each index moves and why. Variations and pitfalls sections cover the ways an interviewer will push you off the template and the bugs that appear under pressure.

The order is deliberate. Two pointers and sliding windows are the foundation; prefix sums and binary search add precomputation and search-on-the-answer; sorting-based patterns and intervals show how one `sort()` call unlocks a greedy sweep; cyclic sort, Kadane and matrix traversal are the specialised tools that appear less often but are unmistakable once you know their signals.

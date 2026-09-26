---
slug: technique-mastery
title: Technique mastery
description: "The linear-time toolbox behind most medium interview problems, taken to the depth where you can derive the shrink condition, prove the invariant, and recognise the trick in disguise: sliding windows, two pointers, prefix sums and hashing, meet-in-the-middle, randomisation and bit tricks."
prerequisites: [algorithms/sorting-searching, data-structures/hashing]
---
Most medium-difficulty interview problems are not about a clever algorithm. They are about a handful of techniques that turn an $O(n^2)$ pair of loops into a single $O(n)$ pass, and the difference between an engineer who has memorised the template and one who has mastered the technique shows up the moment the problem is phrased in an unfamiliar way. The memoriser recognises "longest substring without repeating characters" and produces the code; the master recognises "the property I am tracking is monotone under extending the window", which is why the same code works, and then notices that "at most k distinct" is the same technique with a different counter.

This module goes one level deeper than the pattern lessons in the interview-patterns track. Each lesson isolates the mechanism that makes a technique correct (the monotonicity that lets a window shrink, the sorted-array assumption that lets two pointers skip pairs, the algebra that makes prefix sums and XOR prefixes compose), shows the standard variations and the trick that unlocks the hard ones (the at-most-k subtraction, the three-pointer generalisation, the modulo bucket), and ends with the failure modes: the problems that look like they fit and do not.

The last two lessons are the techniques that separate a strong senior from a good mid-level engineer in an algorithms round. Meet-in-the-middle and randomisation are what you reach for when the constraints make every deterministic polynomial approach too slow, and bit tricks are how competitive programmers and kernel engineers squeeze a factor of sixty-four out of an inner loop. You will not use them every week. You will use them at exactly the moment nothing else works.

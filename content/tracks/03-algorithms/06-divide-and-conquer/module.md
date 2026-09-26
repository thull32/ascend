---
slug: divide-and-conquer
title: Divide and conquer
description: Split, solve, combine, and prove the cost with a recurrence; from merge sort and inversion counting through closest pair, Karatsuba and fast exponentiation to the intuition behind the FFT.
prerequisites: [algorithms/recursion-backtracking, foundations/complexity]
---
Divide and conquer is the technique most engineers think they already understand, because they have written merge sort. The interesting part is not the splitting; it is the combine step, and the recurrence that tells you whether the combine step is cheap enough for the whole thing to beat the obvious loop. Merge sort's combine is a linear merge, so the recurrence is $T(n) = 2T(n/2) + O(n)$ and the algorithm is $O(n \log n)$. Change the combine to $O(n^2)$ and the recursion buys you nothing. Change the number of subproblems from four to three, as Karatsuba did in 1960, and you get the first multiplication algorithm faster than the one taught in school.

This short module has three lessons. The first makes the recurrence the object of study: how to write one from code, how to solve it with the master theorem, and how inversion counting shows that a small tweak to the combine step gives you a new algorithm for free. The second collects the classic divide-and-conquer algorithms that appear in interviews and in real systems (closest pair of points, fast exponentiation, Karatsuba, Boyer-Moore majority, Strassen) and works out what each one's recurrence says. The third is the FFT: not a full derivation, but enough intuition to explain why polynomial multiplication is $O(n \log n)$, where you have met it without noticing, and why you should almost never implement it yourself.

The through-line is a habit: before you write a recursive solution, write its recurrence, and before you claim a complexity, solve the recurrence. That habit is what lets a senior engineer say "this is $O(n \log^2 n)$, which is fine" or "this recursion is $O(n^2)$ in disguise" in the design review instead of finding out in production.

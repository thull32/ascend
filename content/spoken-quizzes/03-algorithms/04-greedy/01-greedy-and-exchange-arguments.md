---
lesson: greedy-and-exchange-arguments
source: 04ebeb80c77c9674
---
## 1

An interviewer gives you coins of 1, 5 and 8, and asks for the fewest coins that make 10. What do you say?

A, greedy fails, since 5 plus 5 is 2 coins; use the coin-change table. B, greedy is safe, since the set includes a 1 coin: 3 coins. C, greedy gives 8 plus 1 plus 1, 3 coins, as largest-first is optimal. D, greedy fails; sort ascending and take the smallest coins first.

[think]

The answer is A: greedy fails, since 5 plus 5 is 2 coins.

Largest-first gives 8, 1 and 1, but 5 and 5 use two coins, so no optimal solution contains the greedy choice, and the greedy-choice property fails. That is the signal to index a table by amount instead. Having a 1 coin only guarantees that some answer exists, not that largest-first is optimal, and sorting ascending does not rescue greedy either.

## 2

Which statement correctly describes the greedy-choice property?

A, the greedy choice is the best choice at every step. B, every optimal solution contains the greedy choice. C, some optimal solution contains the greedy choice. D, the greedy choice minimises the remaining problem size.

[think]

The answer is C: some optimal solution contains the greedy choice.

The property only needs one optimal solution to agree with the greedy choice, and the exchange argument builds it by rewriting an arbitrary optimal solution. Requiring every optimal solution to agree is too strong, because ties exist. And "best right now" is the definition of greedy, not of correctness.

## 3

A bag holds 50 kilograms. The items are 10 kilograms worth 60 dollars, 20 kilograms worth 100, and 30 kilograms worth 120. Greedy by value per kilogram returns 160 dollars for the zero-one knapsack. Why is that wrong, and what is the optimum?

A, the rule is fine but stops early; a fraction of the third item gives 240. B, it is correct: density order is optimal for zero-one as well, so 160. C, the key is wrong: sorting by raw value is always optimal, giving 220. D, items cannot be split, so the exchange fails; the optimum is 220.

[think]

The answer is D: items cannot be split, so the exchange fails; the optimum is 220 dollars.

The second and third items fill the bag exactly, for 220. The fractional exchange argument moves weight between items, which zero-one forbids, so greedy has no proof, and indeed fails. 240 is the fractional answer, not allowed here, and sorting by raw value happens to reach 220 on this data but fails in general.

## 4

You have proved that, after k steps, your greedy solution's k-th finish time is never later than any other solution's k-th finish time. Which proof technique is that, and what does it let you conclude?

A, optimal substructure; the remaining subproblem is solved optimally. B, an exchange argument; greedy's first pick is in some optimal solution. C, greedy stays ahead; no other solution has more elements. D, matroid exchange; the chosen activities form a matroid basis.

[think]

The answer is C: greedy stays ahead; no other solution has more elements.

Tracking a running measure and showing greedy is never behind is the stays-ahead technique. If another solution had more elements, its extra element would also fit after greedy's last finish, so greedy has at least as many. An exchange argument rewrites a specific optimal solution instead, and activity selection is not a matroid at all.

## 5

Which problem feature most strongly suggests dynamic programming rather than greedy?

A, the input has a natural order you can sort by. B, the answer is a count of non-overlapping items. C, values must combine to hit an exact target. D, the constraints let n reach 100 thousand or more.

[think]

The answer is C: values must combine to hit an exact target.

Summing to exactly k, or filling a capacity exactly, is where a local choice commits you to something that cannot be undone. Confirm it by breaking the obvious rule with a five-element counterexample. A single sort key and counts of non-overlapping items are greedy signals, and a large n argues against a quadratic table, not for it.

## 6

A customer configures coin denominations of 1, 5, 10, 21 and 25. What is a complete, cheap way to decide, before serving any request, whether largest-first change-making is safe?

A, compare greedy with the exact table for amounts up to 1,000, and extrapolate. B, compare greedy with the exact table for every amount below 25 plus 21. C, confirm each coin divides the next, which is what canonical means. D, confirm the set contains 1, which makes largest-first optimal.

[think]

The answer is B: compare greedy with the exact table for every amount below 25 plus 21.

Kozen and Zaks showed that a non-canonical coin system has its smallest counterexample below the sum of its two largest coins, so checking up to 45 is complete. Here it finds 31: greedy gives 25, 5 and 1, and the optimum is 21 and 10. Containing 1 only guarantees an answer exists. Each coin dividing the next is sufficient but not necessary: it would reject the canonical US coins, since 25 is not a multiple of 10.

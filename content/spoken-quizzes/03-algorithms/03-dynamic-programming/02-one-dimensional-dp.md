---
lesson: one-dimensional-dp
source: 72ec17149070c44f
---
## 1

The coins are 1, 3 and 4, and the amount is 6. What does the minimum-coins dynamic programming return, and what does the greedy "largest coin first" return?

A, both return 3, using 4, 1 and 1. B, both return 2, using 3 and 3. C, the table returns 2, using 4 and 2, and greedy returns 3, using 4, 1 and 1. D, the table returns 2, using 3 and 3, and greedy returns 3, using 4, 1 and 1.

[think]

The answer is D: the table gives 2, using 3 and 3; greedy gives 3, using 4, 1 and 1.

The table takes one coin plus the best of amounts 5, 3 and 2, which need 2, 1 and 2 coins, so it uses a 3 and then a 3. Greedy commits to the 4 and is left making 2 from ones. There is no 2 coin, so 4 plus 2 is not available. The 4, 1, 1 route is one of the candidates the table considers, and it loses.

## 2

You want the number of multisets of coins that make an amount, where order does not matter. Which loop nesting is correct?

A, coins on the outside, amounts on the inside, swept downwards. B, amounts on the outside, coins on the inside. C, coins on the outside, amounts on the inside. D, either nesting, since addition is commutative.

[think]

The answer is C: coins on the outside, amounts on the inside.

With coins outermost, the table means "ways using only the coins seen so far", so each multiset is built in one canonical order. Amounts outermost counts every ordering separately, so the nestings are not interchangeable. And a downward sweep is the use-each-coin-once variant, which is a different problem.

## 3

In house robber, why can the transition use the best up to house i minus 2, plus house i, without checking what happened at house i minus 3?

A, because the optimum alternates houses, so i minus 3 is always skipped. B, it cannot; a correct recurrence must also consult house i minus 3. C, because the best up to i minus 2 already covers all those houses, robbed or not. D, because house i minus 2 is always robbed whenever house i is robbed.

[think]

The answer is C: the best up to i minus 2 already covers all those houses, robbed or not.

That state is the best from every house up to i minus 2, whether or not house i minus 2 was robbed, so it already encodes the best compatible history. Robbing house i only forbids house i minus 1. Adding i minus 3 is redundant, and the optimum need not alternate: on 2, 1, 1, 2 it robs the first and last houses.

## 4

How many ways are there to decode the digit string 1, 0, 0, and which transition rule produces that?

A, 1, since 100 is read as one three-digit letter code. B, 0, since neither a lone 0 nor 0 0 is a valid code at the end. C, 2, one for each way to split the string. D, 1, via the two-digit code 10 followed by a single 0.

[think]

The answer is B: 0, since neither a lone 0 nor 0 0 is a valid code at the end.

The first two digits decode one way, as 10. At the third digit, a single 0 is invalid, and the pair 0 0 is not between 10 and 26, so the count drops to zero. The trailing 0 cannot stand alone, so 10 followed by 0 is not a decoding. Any string with a zero not preceded by 1 or 2 has no decoding.

## 5

The coin change table runs in time proportional to the amount times the number of coins. An interviewer says the amount can be up to 10 to the 12. What do you say?

A, sort the coins, so the inner loop can stop at the first coin bigger than the amount. B, use memoisation, so only reachable amounts are computed. C, it still works, because the running time is linear in the amount. D, it is infeasible: pseudo-polynomial means 10 to the 12 table cells.

[think]

The answer is D: it is infeasible; pseudo-polynomial means 10 to the 12 table cells.

The table has one cell per unit of amount. Polynomial in the numeric value means exponential in the number of bits used to write the input, so "linear in the amount" is exactly the problem. You need a different approach, or a restriction on the coin system. Memoisation does not meaningfully reduce the reachable states here, and sorting does not change the count.

## 6

A JavaScript climbing-stairs function returns a 17-digit number ending in 0 for 78 stairs, but the exact answer ends in 1. What happened, and what is the fix?

A, the base cases were off by one; start both from 1, not 0. B, the value wrapped past 2 to the 31; switch the table to a 64-bit float array. C, the sum passed 2 to the 53 and the double rounded; reduce modulo a prime, or use BigInt. D, the rolling variables were assigned in the wrong order; compute the sum first.

[think]

The answer is C: the sum passed 2 to the 53, and the double rounded.

The answer is the 79th Fibonacci number, about 14 quadrillion, above JavaScript's largest safe integer, 2 to the 53 minus 1. Up there, doubles represent only every second integer, so the odd answer rounds to its even neighbour with no error. A wrong base case would be wrong for every n, and JavaScript numbers do not wrap at 2 to the 31. Reduce modulo a prime at each addition, or use BigInt.

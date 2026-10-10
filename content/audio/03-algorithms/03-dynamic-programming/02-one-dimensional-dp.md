---
lesson: one-dimensional-dp
source: c00e317de4b1403a
fit: partial
desk:
  - "The four table fills: house robber, coin change, both counting loop orders, and decode ways"
  - "The code for each problem, including the rolling two-variable house robber"
  - "The sentinel comparison table and the integer-precision details for JavaScript and Python"
  - "Exercises: house robber, and decode ways"
---
## Introduction

A row of houses holds cash, and you may rob any of them, except that robbing two neighbours trips the alarm. What is the most you can take? Greedy says take the biggest and skip its neighbours. On three houses holding 3, 5 and 3, greedy takes the 5, which forbids both 3s, and ends with 5. The optimum is 3 plus 3, which is 6. Every plausible local rule has a counterexample like that. The problem needs dynamic programming, and it is the cleanest introduction to a one-dimensional state.

One-dimensional means the state is a single index: the best answer for the prefix ending at i, or the number of ways to make amount a. Four problems, then: house robber, coin change, counting ways where loop order changes the answer, and decode ways. Then the invariant that proves them all, and the traps.

## House robber

The state: the most cash you can take from houses 0 up to i, whether or not house i itself is robbed.

The transition comes from the last decision. Either you rob house i, in which case you could not have robbed i minus 1, and the best before it is the answer two houses back. Or you skip house i, and the best is the answer one house back. Take the larger. That is the whole algorithm.

Why is it safe to look only two houses back? Because the best from houses 0 to i minus 2 already covers that whole prefix, robbed or not. It is by definition the best compatible history, so nothing further back needs checking.

Say it aloud on five houses: 2, 7, 9, 3, 1. After the first house, 2. After the second, 7. At the third, rob it for 2 plus 9, which is 11, against skipping for 7: 11. At the fourth, robbing gives 7 plus 3, which is 10, and skipping keeps 11. The 3 is never worth losing the 9. At the fifth, 11 plus 1 is 12. Houses 0, 2 and 4.

The transition only reads two earlier cells, so two variables replace the array. Start them both at zero, and the first houses need no special case, and an empty street returns 0 for free. That is a general trick: pick base values that make the transition produce the first real cells.

And if the houses form a ring? The only new constraint is that the first and last cannot both be robbed. Run the same linear recurrence twice, once without the last house and once without the first, and take the larger.

## Coin change

Given coin values and an amount, find the fewest coins. Greedy by largest coin works for ordinary currency and fails for coins of 1, 3 and 4 with an amount of 6. Greedy takes the 4, then 1, then 1: three coins. The optimum is 3 plus 3: two.

The state: the fewest coins that make amount a exactly. The transition: the last coin had some value c, and before it you made a minus c optimally. So it is one plus the minimum, over every coin that fits, of the answer for a minus c. Base case: zero coins make zero. Fill in increasing amount.

At amount 6, the candidates come from 5, from 3 and from 2, which need 2, 1 and 2 coins. The best is via 3, so 6 needs two coins. Notice that greedy's route, 4 then 1 then 1, is one of the candidates the table considers, and it simply loses.

The cost is the amount times the number of coins. That is pseudo-polynomial: polynomial in the numeric value of the amount, not in the number of digits needed to write it. For an amount of a billion, the table needs a billion cells, 8 gigabytes as a typed array, about 36 as a Python list. That is why the general problem is NP-hard while the table is fine for the amounts up to ten thousand an interviewer gives you. Saying "pseudo-polynomial" unprompted is a senior signal.

One more detail: what value marks an amount no coins can make? It must lose every minimum. Amount plus one works, because every coin is at least 1, so no real answer uses more than amount coins. It keeps the array all integers, cannot overflow, and survives JSON. Minus one, without a guard, is the classic bug. With a single coin of 2 and an amount of 3, the unguarded table reads minus 1 for amount 1, adds 1, and claims that zero coins make 3. Then the zero poisons every larger amount that routes through it.

## Counting, and the loop-order rule

Now ask how many ways make the amount. There are two versions, and they have different answers. With coins of 1 and 2 and an amount of 4: as combinations, where order does not matter, there are 3 ways. Four ones; two ones and a two; two twos. As ordered sequences, like climbing stairs, 1 1 2, 1 2 1 and 2 1 1 are different, so there are 5.

The recurrences look almost identical and differ only in which loop is outside.

[pause]

Coins outside, amounts inside, counts combinations. Amounts outside, coins inside, counts ordered sequences.

Why? Each nesting keeps a different invariant. With coins outside, after processing some coins, each cell holds the number of multisets of just those coins. A multiset either contains none of the new coin, already counted, or at least one; remove one copy and you have a multiset for a smaller amount over the same coins. Each multiset is built in one canonical coin order, so it is counted once. With amounts outside, each cell sums over every possible last coin, and the rest is any sequence for the smaller amount, so every ordering counts separately.

This is the single most common dynamic programming bug in interviews: right recurrence, wrong nesting, wrong by a factor that grows with the input. When you write a counting table, say which version the problem wants, then say which loop is outer and why.

## Decode ways

Digits encode letters, 1 for A up to 26 for Z. How many ways can you decode 2 2 6? Three: 2, 2, 6; 22, 6; and 2, 26.

The state: the number of ways to decode the first i characters. The transition: the last letter came from one digit or from two. Add the count from one back, if that single digit is not zero. Add the count from two back, if the last two digits form a number from 10 to 26.

Zeros are the trap. A zero contributes nothing on its own and survives only if the digit before it is 1 or 2. So 0 6 has no decoding, and 1 0 has exactly one. And 1 0 0 has none: the final zero cannot stand alone, and 0 0 is not a code. A pair like 27 is harmless, because the pair fails but the single 7 carries the count forward.

The base case, one way to decode the empty prefix, is a common stumbling point. It is not one way to decode nothing in any physical sense. It is the value the transition needs so that 1 2 gets its two-digit reading. When a base case feels arbitrary, ask what the transition needs it to be.

## Why increasing order is enough

Every table in this lesson is proved the same way. The invariant: when the loop is about to compute cell i, every earlier cell holds the exact answer.

It holds initially because the base cells are checked against the state sentence. It is preserved because each transition reads only smaller indices: one and two back for house robber and decode ways, a minus c for coin change, with every coin at least 1. Increasing order means every cell read is already final. And each transition is exact because it splits the objects being counted or optimised by their last decision, into disjoint, exhaustive cases.

Step back, and every one-dimensional problem has the same shape. Counting problems combine with addition; optimisation problems with minimum or maximum. The last decision is the last step size, rob or skip, the last coin, the last letter's width. If you can list the last decisions and each leaves a smaller instance of the same problem, you have a one-dimensional table, and the state is the size of what remains.

## Numbers that silently go wrong

Counting tables grow exponentially, and that bites in JavaScript. A JavaScript number is a double, exact only up to 2 to the 53, about 9 times 10 to the 15. Climbing stairs at 78 steps gives an odd number above that limit, and the double rounds it to its even neighbour. Off by one, no exception, no warning. The fixes: reduce modulo a prime like a billion and seven at every addition, or use BigInt and accept slower arithmetic.

Python never overflows, but the price is that addition is linear in the number of digits, so an exponentially growing count costs more than the cell count suggests. When the problem gives you a modulus, use it.

And on memory: a million-cell Python list costs 36 to 40 megabytes, a typed array 8, and two rolling variables almost nothing. But coin change cannot roll to two variables, because it reads back by every coin value. At best it keeps the last largest-coin cells.

## In the interview

A follow-up the lesson expects. Why does swapping the two loops in counting coin change change the answer?

[pause]

Because each nesting keeps a different invariant. Coins outside builds each multiset in one canonical order. Amounts outside sums over every possible last coin, so it counts orderings. The wrong answer is "it should not; addition is commutative", which confuses the order of the additions with what is being added.

And another. The amount can be up to 10 to the 12. What do you say? That the table is infeasible. Pseudo-polynomial means one cell per unit of amount, a trillion cells. You need a different approach or a restriction, like a coin system where greedy is provably safe.

## Recap

Four things to remember. Name the last decision and you have the transition: rob or skip, the last coin, one digit or two. Increasing order is enough because every transition reads only smaller indices. In counting problems, coins outside counts combinations and amounts outside counts sequences; say which before you code. And coin change is pseudo-polynomial, its unreachable sentinel should be amount plus one, and JavaScript counts are exact only to 2 to the 53.

At your desk: the four table fills, the code for each problem, the sentinel and precision details, and the house robber and decode ways exercises.

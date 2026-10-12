---
lesson: the-dp-mindset
source: 8d22cab5b16d7b19
---
## 1

A recursive solution has optimal substructure, but its subproblems never overlap. What should you do?

A, go greedy, since optimal substructure implies a safe local choice. B, add memoisation, since a cache can only ever reduce the call count. C, tabulate bottom-up, since that removes repeated recursive calls. D, use divide and conquer, since no subproblem is ever requested twice.

[think]

The answer is D: use divide and conquer, since no subproblem is ever requested twice.

A cache only pays when the same state is requested more than once. With disjoint subproblems, as in merge sort or quicksort, a memo would store every result once and never hit, costing memory and hashing for nothing. And greedy needs a separate safe-choice property, which optimal substructure does not imply.

## 2

You define cell i as "something about the first i elements", and you cannot write a transition. What is the most likely fix?

A, sharpen the state, often by adding a dimension the transition needs. B, add more base cases, so the recurrence always has somewhere to start. C, precompute prefix sums, so each transition reads a range in constant time. D, switch from top-down to bottom-up, so the fill order is explicit.

[think]

The answer is A: sharpen the state, often by adding a dimension the transition needs.

A transition can only be derived from a precise state. If the last decision depends on information the state does not carry, such as whether you are holding a share, or whether the last move was a 2-step, that information must become part of the state, usually as an extra dimension. Changing the evaluation direction does not help: top-down and bottom-up evaluate the same recurrence.

## 3

A dynamic programming solution has n squared states, and each transition scans n earlier states. n is 5,000. Is it fast enough for a typical limit of one or two seconds?

A, no; states times transition cost is n cubed, about 125 billion. B, yes; 25 million states is comfortably within the limit. C, yes; memoisation computes each state once, so it is n squared. D, only bottom-up; top-down call overhead makes it n cubed.

[think]

The answer is A: no; n cubed is about 125 billion operations.

Running time is the number of states times the cost of each transition: n squared times n, which is n cubed, far too many. Memoisation only guarantees each state is computed once; it does not shrink the linear work inside each state. Top-down versus bottom-up changes constants, not the exponent.

## 4

Which is a genuine advantage of top-down memoisation over bottom-up tabulation?

A, it runs faster, since it skips allocating a full table. B, it cannot overflow the stack, since results are cached. C, it uses less memory, since finished rows can be rolled away. D, it computes only the states reachable from the initial call.

[think]

The answer is D: it computes only the states reachable from the initial call.

Tabulation fills the whole table, including states the answer never depends on; memoisation touches only what the recursion requests. Rolling rows and stack safety are advantages of bottom-up, since the memo still recurses as deep as the longest chain of dependencies. And per-state call and hash overhead usually makes memoisation slower.

## 5

In min-cost climbing stairs, the costs are 10, 15 and 20. Why is the answer 15 and not 10?

A, because the top is the last stair, so every route must pay its 20. B, because from stair 0 you still pay for stair 1 or 2 before the top. C, because you must start on stair 1; stair 0 is only the ground. D, because the table keeps the shortest path, which starts on stair 1.

[think]

The answer is B: from stair 0 you still pay for stair 1 or 2 before the top.

The top is one past the last stair, and it is free. Starting on stair 0 costs 10, but you must then land on stair 1 or 2, for 25 or 30 in total. Starting on stair 1 costs 15, and a single 2-step reaches the top. You may start on either stair 0 or stair 1, so nothing forces stair 1.

## 6

Climbing stairs gains a rule: no two 2-steps in a row. You keep the count of ways to reach stair i as the ways to reach i minus 1, plus the ways to reach i minus 2. What happens for 4 stairs?

A, it raises an error, since the i minus 2 term is undefined once a 2-step is forbidden. B, it returns 3, since the rule removes one sequence from each term. C, it returns 5 instead of 4, since the state cannot tell how stair i minus 2 was reached. D, it returns 4, since the recurrence never generates 2 then 2.

[think]

The answer is C: it returns 5 instead of 4.

The coarse state merges reaching stair 2 by two 1-steps with reaching it by a 2-step, so the i minus 2 term counts a 2-step after a 2-step, and the table gives 1, 1, 2, 3, 5. Listing them gives four: 1 1 1 1, 1 1 2, 1 2 1, and 2 1 1. The fix adds whether the last step was a 2 to the state, which gives 3 plus 1, the correct 4.

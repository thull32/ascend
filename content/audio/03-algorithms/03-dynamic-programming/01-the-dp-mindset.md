---
lesson: the-dp-mindset
source: 1caff2553d3ad7be
fit: partial
desk:
  - "The call tree for ways of 6 and the table of calls per argument"
  - "The memoised and tabulated code, in Python and JavaScript, and the top-down versus bottom-up table"
  - "The min-cost stairs trace on the ten-stair cost array"
  - "Under the hood: what a memoised call, a table cell and the stack cost, and bytes per cell"
  - "Exercises: staircase with arbitrary step sizes, and min-cost stairs in constant space"
---
## Introduction

How many distinct ways are there to climb a staircase of n steps, if each move climbs one step or two? The recursion writes itself. The last move was either a 1-step from stair n minus 1, or a 2-step from stair n minus 2. So the ways to reach n are the ways to reach n minus 1, plus the ways to reach n minus 2.

It is correct, and it is unusable. Ways of 40 makes about 331 million calls, roughly half a minute in Python. Ways of 45 makes about 3.7 billion, eleven times more, to compute a number you could write on the back of a receipt.

The recursion is not wrong. It is wasteful: it solves the same subproblem, ways of 20 say, hundreds of millions of times. Dynamic programming is the discipline of noticing that waste and solving each subproblem once. Everything else, the tables, the memo dictionaries, the top-down versus bottom-up debate, is bookkeeping around that single idea.

Four things, then. Why the recursion explodes. The two properties that make a problem dynamic programming. The four-step procedure that produces every solution in this module. And how to prove the table is right and say what it costs.

## Why the recursion explodes

Draw the call tree for ways of 6, with ways of 0 and ways of 1 both equal to 1. Every call spawns two children, and the argument only shrinks by one or two per level. Count the nodes and you get 25 calls. But only 7 of them are distinct subproblems: ways of 0 up to ways of 6.

The call counts are themselves Fibonacci numbers, and the tree grows by about 1.6 times for every extra step. The number of distinct arguments grows by one. Exponential calls against a linear number of distinct subproblems: that ratio is the entire opportunity.

## The two properties

A problem is dynamic programming when it has two properties.

The first is optimal substructure: the answer to the whole problem can be assembled from answers to smaller instances of the same problem. Ways to reach stair n decomposes into ways to reach n minus 1 and n minus 2. The shortest path to Z decomposes into the shortest path to some neighbour of Z, plus the last edge.

The second is overlapping subproblems: the decomposition hits the same smaller instances again and again. Merge sort has the first property but not the second. Every element is in exactly one half at each level, so there is nothing to reuse. That is divide and conquer, not dynamic programming. And if one locally best choice is always safe, you do not need to explore alternatives at all, and greedy beats both. Dynamic programming sits in the middle: several choices at each step, but the consequences of a choice depend only on a small summary of the past. That summary is the state.

Optimal substructure must be argued, not assumed. Here is a problem where it looks right and is wrong. Take four vertices in a square, A, B, C, D, joined in a cycle, and ask for the longest simple path from A to C, with no vertex repeated. The tempting recurrence: the last edge enters C from B or from D, so the answer is one plus the longer of the paths to B and to D. The longest simple path from A to B has length 3: A, D, C, B. Same for D. So the recurrence claims 4.

[pause]

The truth is 2. The 3-edge path to B passes through C, so extending it back to C repeats a vertex. The subproblem's answer depends on which vertices the rest of the path needs, and that is not in the state. Adding the set of used vertices gives 2 to the n states. Longest simple path is NP-hard, and no table saves it.

Shortest paths survive the same decomposition because of a cut-and-paste argument. If the prefix of a shortest path to Y were not itself a shortest path to Y, you could splice in the shorter one and get a shorter whole path. That is a contradiction. Whenever you propose a transition, say that sentence for your problem. If you cannot, the table you fill will be confidently wrong.

## The four steps

Every solution in this module comes from answering four questions in order.

State: what is a subproblem, and what identifies it? Write it as a sentence a stranger could compute by hand. "dp of i is the number of ways to reach stair i."

Transition: how does one state follow from smaller ones? Ask what the last decision was, then sum or minimise over the possibilities.

Order and base cases: which states have no dependencies, and in what order must the rest be filled so every dependency is ready? For a one-dimensional array, increasing i. For a grid, row by row. For intervals, by increasing length.

Answer: which state is the final answer? Often the last cell, but not always. In longest increasing subsequence it is the maximum over all cells.

Now the test for a state. A state is the minimal set of arguments such that the answer is a pure function of it. Can two different situations map to the same state and yet have different futures? If yes, the state is too coarse.

Add a rule to climbing stairs: no two 2-steps in a row. Keep the old state and the old recurrence, and for four stairs the table says 5. But list the legal sequences: 1 1 1 1, then 1 1 2, 1 2 1, and 2 1 1. That is 4. The coarse table counted 2 then 2, which is illegal, because reaching stair 2 by two 1-steps and reaching it by one 2-step are the same state, yet only the first may be followed by a 2-step. The fix is to add the missing fact to the state: the ways to reach stair i, split by whether the last move was a 2-step. A 1-step may follow anything; a 2-step may only follow a 1-step. That table gives 4. When you are stuck, sharpening the state is nearly always the fix.

## Two ways to fill the table

Top-down, or memoisation: keep the recursive function and add a cache keyed by the state. For ways of 6, the 25-call tree collapses to 7 computed states plus 4 cache hits, 11 calls in all. Time drops from exponential to linear. The cost is the call stack. Ways of n still recurses n deep before the first base case returns, so at n of ten thousand Python hits its default recursion limit of 1,000 frames and raises a recursion error. Memoisation removes repeated work, not depth.

Bottom-up, or tabulation: start from the base cases and fill an array in dependency order. 1, 1, 2, 3, 5, 8, 13, 21. Each cell reads two cells to its left. And because only the last two are ever read, you can keep two variables instead of the array, dropping memory from linear to constant. That rolling window recurs in almost every family in this module.

How to choose. Top-down computes only the states actually reached, and recursion finds awkward orders for free, like intervals, trees and bitmasks. Bottom-up has no stack, rolls memory easily, and an array index is typically several times faster than a function call plus a hash lookup. In an interview: write top-down if the dependencies are awkward or only a sparse set of states is reachable; write bottom-up when the state space is a dense rectangle, memory matters, or the depth would blow the stack. Say which you are choosing and why. That sentence alone is a senior signal.

## Proof and cost

Most problems optimise rather than count. Variant: each stair has a cost you pay when you step on it, you may start on stair 0 or stair 1, and the top is one past the last stair and free. The state: dp of i is the minimum cost to stand on stair i, having paid for it. The transition: the cost of stair i plus the cheaper of the two stairs below. The answer: the cheaper of the last two stairs.

Take costs 10, 15 and 20. Standing on stair 0 costs 10, on stair 1 costs 15, on stair 2 costs 20 plus 10, which is 30. The top is reached from stair 1 or stair 2, so the answer is 15. Not 10: starting on stair 0 is cheaper, but you must then land on stair 1 or 2 before the top. And the table stores numbers, not the route. If asked which stairs, keep a parent pointer per cell or walk back from the answer.

Why is the table right? A dynamic programming loop is proved like any loop, by an invariant. After filling dp of i, every cell up to i holds the exact answer. Initially it holds by inspection. It is preserved because every way to reach stair i ends with exactly one last move, a 1-step or a 2-step. The two words to say in an interview are disjoint and exhaustive: the last-decision cases must not double-count, and must not miss anything. For optimisation, add the cut-and-paste sentence.

The cost is the number of distinct states times the work per transition. Climbing stairs: n states, constant work, linear time. Edit distance: m times n states, constant work. Simple longest increasing subsequence: n states, but each scans all earlier ones, so n squared. Matrix chain: n squared intervals, each trying n splits, so n cubed.

Use that formula to check feasibility before you code. A Python inner loop manages on the order of ten million simple transitions a second. An n cubed table at n of 5,000 is over a hundred billion steps: hours. At n of 500, it is seconds. A state that is a subset of n items means 2 to the n states: fine up to n of about 20, hopeless at 100. If you propose a state and cannot say how many there are, you have not finished designing the algorithm.

## In the interview

Here is a follow-up the lesson expects. Your memoised solution is linear. What happens at n of a hundred thousand in Python?

[pause]

It raises a recursion error at a depth of 1,000, because the dependency chain is n long. Convert to bottom-up, which has no stack and also allows the two-variable form. The wrong answer is "the memo makes it linear, so it is fine". Time and depth are different resources.

And another. Why is merge sort not dynamic programming? It has optimal substructure, but its subproblems never overlap, so a memo would store every result once and never hit. "Because it is divide and conquer" just restates the label without naming the property.

## Recap

Four things to remember. Dynamic programming is solving each subproblem once; the gap between exponential calls and a linear number of states is the opportunity. A problem needs both optimal substructure, argued with cut and paste, and overlapping subproblems. Write the state as a sentence first, test that the same state always means the same future, and when stuck, sharpen the state. And the cost is states times transition work, with depth a separate resource that memoisation does not remove.

At your desk: the call tree for ways of 6, both implementations and the comparison table, the min-cost stairs trace, the runtime and memory costs, and the two staircase exercises.

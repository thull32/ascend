---
lesson: interval-and-tree-dp
source: 5ca9cb5ee087ed2e
fit: partial
desk:
  - "The matrix-chain trace for four matrices, length by length, and the code"
  - "The burst-balloons trace, gap by gap, and reading the burst order back"
  - "The house-robber-on-a-tree post-order table, and the rerooting trace on a six-node tree"
  - "The Held-Karp table on four cities, and the assignment trace with its code"
  - "The sizes table for each family, and the state-shape table"
  - "Exercises: matrix chain multiplication, and minimum-cost assignment with a bitmask"
---
## Introduction

You multiply three matrices: 10 by 30, then 30 by 5, then 5 by 60. Multiplication is associative, so you can multiply the first two and then the third, or the last two and then the first, and get the same result. The first order costs 4,500 scalar multiplications. The second costs 27,000. Six times the work for the same answer.

With n matrices, the number of ways to bracket them grows roughly like 4 to the n, so trying them all is out. But the best way to multiply a range of matrices depends only on the best ways to multiply its two halves, wherever you split it. That is an interval table.

This lesson covers three families whose state is not a prefix. Intervals, a contiguous range from i to j. Subtrees, computed bottom-up from the children. And subsets, a bitmask of which items are used. Each has a signature fill order, each has a size where it stops being feasible, and one of them has a famous problem where the obvious state is wrong.

## Interval tables

The state: the cheapest way to multiply the matrices from i to j. The transition: some multiplication happens last, and it splits the range at some k. The left part and the right part are each multiplied optimally, and the last multiplication costs the outer dimension, times the split dimension, times the other outer dimension. Try every split and keep the cheapest. Base case: one matrix costs nothing.

Now the order. The transition reads shorter intervals. But one of them, from k plus one to j, lives in a later row of the table. So row by row would read it before it is filled, as its initial zero, and silently return an answer that is too small.

[pause]

Fill by increasing length instead: every interval of length 2, then 3, and so on. That is a topological order of the dependencies, just as row by row was for grids. Palindrome tables use the same order.

Why is it correct? The last multiplication combines two sub-products that were computed independently. If either half had a cheaper order, swapping it in leaves the last multiplication's cost unchanged and lowers the total. Cut and paste again. And the state is sufficient, because the cost of a range depends only on the dimensions inside it.

The cost: n squared intervals, each trying up to n splits, so n cubed, about a sixth of n cubed inner steps. 500 matrices is about 20 million steps, fine anywhere. 5,000 is 20 billion, fine nowhere. The same shape, "the last operation splits the range, try every split", solves optimal binary search trees, polygon triangulation and stone merging.

## Burst balloons

Balloons in a row each hold a number. Bursting one earns its number times its two neighbours' numbers, with the ends counting as 1, and then its neighbours become adjacent. Maximise the total.

The obvious state is "burst some balloon k first in this range". It fails. After bursting k first, the left side and the right side become adjacent and interact, so they are not independent subproblems.

The fix is to think about the balloon burst last. If k is the last one to go between two boundaries i and j, which are still standing, then when it goes, its neighbours are exactly i and j. And before that, the left part and the right part were burst completely independently, each with k still standing as a wall. Pad the row with a 1 at each end, and the state is the best total from bursting everything strictly between i and j.

On 3, 1, 5 and 8, the best is 167. In forward order: burst the 1, earning 3 times 1 times 5, which is 15. Then the 5, now between 3 and 8: 120. Then the 3, between the padding 1 and the 8: 24. Then the 8 alone: 8. 15 plus 120 plus 24 plus 8 is 167.

The "last, not first" reversal is a general technique. It appears whenever an operation changes who is adjacent to whom: removing boxes, merging stones, cutting a stick. If your interval subproblems seem to interact, ask what happened last.

## Tree tables

A tree is a recursion waiting to happen. The answer for a node depends on its children's answers, the children's subtrees are disjoint, and a post-order traversal computes everything bottom-up in linear time. The disjointness is the correctness argument: choices inside one child's subtree cannot affect another's, so their optima add. The only interaction is between a node and its children, and a small flag carries that.

House robber on a tree: no two directly connected nodes may both be robbed. Each node returns two numbers. Rob here: this node's cash plus each child's "skip" value, because a robbed node's children must be skipped. Skip here: for each child, the better of its rob and skip values. The answer at the root is the better of the two. Returning a pair per node is the idiom: the table is the recursion's return values, and the fill order is post-order. Tree diameter and maximum path sum have the same shape.

Sometimes you need an answer for every possible root, like the sum of distances from each node to all others. Running the linear pass from every node is n squared. Rerooting does it in two passes. A down pass computes each subtree's size and its internal sum. Then an up pass moves the root from a parent to a child: the child's subtree, of size s, gets one step closer, and the other n minus s nodes get one step further. So the child's answer is the parent's, minus s, plus n minus s.

That only works because a sum can be subtracted. For a maximum, like the tree's height when hung from each node, you cannot un-max. So each node keeps its best and second-best child, and uses the second-best when the child being rerooted to was the best.

One practical trap. A path-shaped tree of a hundred thousand nodes recurses a hundred thousand deep. Python raises a recursion error at 1,000, and raising the limit can crash the process instead of raising. The fix is an iterative traversal: one pass to record parents and an order, then loop over the order reversed.

## Bitmask tables

When the state must remember which of n things have been used, and n is at most about 20, encode the used set as an n-bit integer. Bit i set means item i is used. That is 2 to the n states, each an array index, and transitions add one bit.

The travelling salesman, in the Held-Karp formulation. The state: the shortest path that starts at city 0, visits exactly the cities in the mask, and ends at a given last city. The transition: it arrived at that last city from some other city in the mask, so take the best over those, plus the final edge. Fill masks in increasing numeric order: every transition reads a mask with one bit fewer, which is a smaller number, so numeric order is a topological order.

Assignment is simpler. n workers, n jobs. Assign jobs in order; after j jobs, all that matters is which workers are taken. So the state is just the mask, and the next job is the number of bits set.

Now size it, out loud, before writing it. The salesman table is 2 to the n times n cells. At n of 20, that is 168 megabytes as 64-bit integers. At 25, 6.7 gigabytes. The honest interview sentence: bitmask tables are a tool for n up to about 20.

Two implementation notes a senior engineer mentions. To loop over every submask of every mask, there is a trick: subtract one and AND with the mask. It visits each pair once, and the total is 3 to the n, not 4 to the n, because each element is outside the mask, in the mask only, or in both. And use the built-in population count, not a conversion to a binary string, which allocates per call. In JavaScript, shifts are 32-bit, so a mask breaks silently at 31 bits.

## Choosing the shape

Each family's fill order is the topological order of its dependencies. Shorter intervals before longer. Children before parents. Smaller masks before larger. Once you name the state shape, the order follows, and the transition comes from asking what the last operation was.

The smells: "split a range" or "last operation on a segment" means an interval, filled by length, n cubed. "On a tree" or "no two adjacent nodes" means a subtree with a flag, in post-order, linear. "Answer for every root" means rerooting. "Assign or visit each of up to 20 things exactly once" means a subset mask.

When the input passes these limits, the answer is a different algorithm, not a bigger machine. For interval tables whose optimal split moves monotonically, Knuth's optimisation restricts the splits and gets n squared. For a salesman with 100 cities, heuristics or branch and bound.

## In the interview

A follow-up the lesson expects. The travelling salesman with 100 cities?

[pause]

Exact dynamic programming is 2 to the 100 states, and the problem is NP-hard. Use a constructive heuristic like nearest neighbour, polished by local search like two-opt, or branch and bound, or an integer programming solver when a provable optimum is required. For metric instances, Christofides guarantees within one and a half times optimal. The wrong answer is "memoise more aggressively", which cannot shrink 2 to the 100.

Another: sum of distances from every node, with two hundred thousand nodes. Rerooting, linear: down pass for sizes, up pass with the parent's answer minus the subtree size plus everything else. A search from every node is n squared, 40 billion steps.

## Recap

Four things to remember. Interval tables come from "the last operation splits the range", filled by increasing length, because row by row reads unfilled cells. When the first choice makes the sides interact, as in burst balloons, think about what happens last. Tree tables are a post-order function returning a small tuple; rerooting gives every root in two passes if the combine can be undone; and deep trees need an iterative order. Bitmask tables are for n up to about 20; size them out loud before writing them.

At your desk: the matrix-chain and burst-balloons traces, the tree and rerooting tables, the Held-Karp and assignment traces, the sizes and shapes tables, and the two exercises.

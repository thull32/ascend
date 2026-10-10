---
lesson: dp-craft
source: 013b023f1dbf6205
fit: partial
desk:
  - "The reconstruction code for coin change, and the LCS and knapsack walk-back tables"
  - "Hirschberg's trick traced on AGGTAB against GXTXAYB"
  - "The memory-in-bytes table and the reconstruction strategies table"
  - "Under the hood: cost per cell, vectorising an edit-distance row, what diff runs, and recursion limits"
  - "Exercises: coin change with reconstruction, and reconstructing an LCS"
---
## Introduction

Your coin-change table says the answer is 3 coins. The interviewer nods and asks: which coins? The table holds counts, not choices, and a candidate who has only ever returned the last cell now has to improvise. Then: your table is a million by something; can you do better? And finally: is dynamic programming even the right approach here, or is there something simpler?

Those three follow-ups are how a senior interviewer separates someone who has memorised recurrences from someone who understands the technique. This lesson is the craft that answers them: getting the solution back out of the table, cutting memory without losing it, spotting the technique in problems that do not announce it, debugging a wrong table, and knowing when the technique is wrong.

## Which coins?

A table stores the value of the best solution at each state. To recover the solution, you need to know which transition produced each value. Two strategies.

Parent pointers: alongside the table, record the winning choice at each state, at the moment the minimum or maximum is decided. For coin change, the last coin used at each amount. Then walk from the amount, subtracting each recorded coin, down to zero. It costs a second array.

Recomputation: store nothing extra. From the final state, re-try the transition's candidates and step to whichever one reproduces the stored value. For coin change: from amount a, find any coin c where the cell at a minus c holds exactly one less than the cell at a.

Say it with coins 1, 3 and 4 and an amount of 6. The table reads 0, 1, 2, 1, 1, 2, 2. From 6, which needs 2 coins: coin 1 leads to amount 5, which also needs 2, so no. Coin 3 leads to amount 3, which needs 1. Yes. From 3, coin 1 leads to 2, which needs 2, no; coin 3 leads to 0. Yes. The coins are 3 and 3.

The same idea works everywhere. For longest common subsequence, walk from the corner: on a match, emit the character and step diagonally; otherwise step towards the larger neighbour, with a tie-break you choose deliberately, because ties are where different, equally long answers come from. For knapsack, an item is in the bag exactly when its row improved on the row without it. The general rule: reconstruction is the fill, run in reverse. If you can state the transition, you can state the walk back.

## Memory without losing the answer

Every memory optimisation rests on one question: which earlier states does the transition read? If only the previous row, keep two rows, or one with the right sweep direction. If the last two, keep three. If it reads arbitrary earlier states, as the quadratic increasing-subsequence table does, the full table stays.

But rolling rows destroy the table, and with it the walk back. Unless you divide and conquer. Hirschberg's trick, for common subsequence: split the first string in half. Run the rolled table forwards over the first half against all of the second string, giving one row. Run it backwards over the second half against the reversed second string, giving another. Somewhere there is a split point in the second string that lies on an optimal answer, and it is the point where the forward and backward values add up to the most. Recurse on the two halves.

The cost: each level does a table's worth of work on a problem half the size, so the total is about twice the fill. In exchange, memory is linear in the two lengths, and you still get the actual subsequence. Git's diff implementation uses the same split-in-the-middle idea to keep its algorithm in linear space. A cheaper cousin is checkpointing: keep every k-th row and rebuild each band on the way back.

And put numbers on it. A table of ten thousand by ten thousand is a hundred million cells. As a Python list of lists, up to about 3 gigabytes. As 32-bit integers in NumPy, 400 megabytes. Two rolling rows of 32-bit integers: 80 kilobytes, which fits in the processor's cache. A memoisation dictionary: 10 to 20 gigabytes. The interviewer asking "can you do better" is usually asking whether you know which of those you are proposing.

## Dynamic programming in disguise

Some of the most-asked problems never say "count" or "minimum".

Word break: can a string be split into dictionary words? No optimisation and no count, but there is a prefix state: can the first i characters be split? The transition: some word ends at i, and the prefix before it could be split. A yes or no question with a prefix state is still a table, a row of booleans. What makes it dynamic programming is that a naive search revisits the same prefixes again and again.

Counting structures: how many differently shaped binary search trees hold the keys 1 to n? Fix the root; the left side is any tree on the smaller keys and the right side any tree on the larger ones, and the two sides are independent. That gives the Catalan numbers: 1, 1, 2, 5, 14, 42. The tell is "choose a root or pivot, and the two sides are independent instances".

Paths in a graph with no cycles: counting paths or finding the longest is a table filled in topological order. Unique paths on a grid is exactly this. In a general graph, longest path is NP-hard; acyclicity is what makes the table valid. And probability or expectation, like the chance a knight stays on the board after k moves, is a table with real-valued cells, averaging over outcomes.

The shared tell: an exponential search where the future depends on a small summary of the past. When you notice yourself writing a recursive search, ask what its arguments are and how many distinct combinations exist. If that count is polynomial, memoise.

## When it is the wrong tool

Saying "this is not dynamic programming" at the right moment is worth more than any recurrence.

When a greedy choice is provably safe, like interval scheduling by earliest end or fractional knapsack by density, a table would also work and be strictly worse. At a hundred thousand items, the greedy is about 1.7 million operations and the table is 10 billion, about 6,000 times more. If you can write an exchange argument, use it.

When the state space is too big. Subsets of 20 items are about a million states, fine. Subsets of 40 are about a trillion. Subsets of 100 are 2 to the 100; at a billion states a second, that is tens of trillions of years. Recognise that in the first two minutes, not after writing the recurrence, and talk about branch and bound or heuristics instead.

When there is a closed form or a simpler structure: unique paths without obstacles is a binomial coefficient, and counting subarrays with a given sum is prefix sums and a hash map. When subproblems do not overlap, as in merge sort, a memo never hits. And when the data streams past and the table would not fit.

A useful sentence: "This has optimal substructure, and I think the subproblems overlap, so dynamic programming is a candidate; but let me check whether a greedy choice is safe first, because that would be n log n instead of n squared."

## Debugging a wrong table

When a table gives the wrong answer, the bug is almost always in one of four places. Check them in this order.

One, state semantics. Is cell i about the first i elements, or about index i? Mixing the two is the commonest off-by-one, and its usual sign is a table one cell too small, missing the empty-prefix border.

Two, base cases. Does the transition produce the first real cell from the bases you set? Coin change with the zero cell set to infinity instead of zero: before I say it, what does the table become?

[pause]

All infinity. Every cell is the minimum over infinities, plus one. With the zero cell at zero, it is the correct row. The one in decode ways and in counting coin change is not a statement about the world; it is the value that makes cell one right. Check it by computing cell one by hand.

Three, fill order. Does every state exist when it is read? Interval tables filled by row, knapsack swept the wrong way: each reads garbage silently. Four, the answer cell. The last cell, or the maximum over all cells? Longest increasing subsequence on 1, 2, 3, 0 has a last cell of 1 and a maximum of 3.

The tool for all four is the same: fill a five-cell table by hand for a tiny input and compare it with what the code prints. Candidates who trace a small example find these bugs in a minute; candidates who run and stare find them in ten.

A related trap in the walk back. If the recomputation test checks for an equal value instead of one less, the walk with coins 1, 3 and 4 goes from 6 to 5 to 2, and then no coin qualifies, and the loop spins forever.

## In the interview

A follow-up the lesson expects. The table is a million rows by a thousand columns. What do you do?

[pause]

A billion cells is 4 gigabytes as 32-bit integers, so look at what the transition reads. If only the previous row, keep two rows of a thousand. If the path is needed, Hirschberg, for linear memory at twice the time, or checkpoints every thousand rows, for about 4 megabytes and a bounded recomputation. The wrong answer is spilling the table to disk, which is slower than recomputing.

And: the table is all zeros; where do you look first? The base case. A minimum table seeded with infinity, or a counting table seeded with zero, spreads the wrong base into every cell. Compute cell one by hand and compare. Rewriting the transition is the wrong first move.

## Recap

Four things to remember. Reconstruction is the fill in reverse: parent pointers, or recomputation that steps to the candidate that explains the stored value. Every memory optimisation is justified by which states the transition reads; rolling rows lose the path, and Hirschberg gets it back in linear memory for twice the time. Recognise the technique in disguise, and rule it out out loud when greedy is safe, the state is a large subset, or a closed form exists. And debug in order: state meaning, base cases, fill order, answer cell, on a five-cell hand trace.

At your desk: the reconstruction code and walk-back tables, the Hirschberg trace, the memory and strategy tables, the under-the-hood notes, and the two reconstruction exercises.

---
lesson: generating-combinatorial-objects
source: d0ed96bd955ab1ba
fit: partial
desk:
  - "The template in Python and JavaScript, and the include-exclude and start-index trees for subsets"
  - "The start-index correctness argument, written out"
  - "The permutation tree, the used-array and swap implementations, and the duplicate-permutation trace"
  - "The itertools odometer table and the next permutation table"
  - "Exercises: unique subsets of a multiset, and unique permutations"
---
## Introduction

You need every way of choosing some items from a set, every ordering of a list, every selection of exactly k things, or every assignment of options to slots. Feature-flag combinations to test, seatings to evaluate, sums that reach a target, the strings a phone keypad can spell.

The count is exponential, so no clever data structure helps. The job is to enumerate every object exactly once, with no duplicates and nothing missing, in code you can write in five minutes under pressure.

There is one template for all of it. The differences between subsets, permutations and combinations are two lines each: what you may choose next, and when you record an answer. So: the template and its three traps. The three shapes it produces. The one rule that removes duplicates. And why the output size, not the recursion, sets the cost.

## The template

Backtracking builds each object one choice at a time. There is one shared partial object, the path. At each step you choose: append something to the path. You explore: recurse on everything that can follow. Then you unchoose: pop it off again, so the next choice starts from the same state.

Three details decide whether the code is right. First, copy when you record. The path is one list, mutated in place. If you record the list itself, every entry in your output is a reference to the same list, and after the final pop it is empty. You end up with 2 to the n empty lists. This is the most common bug in the whole pattern.

Second, undo exactly what you did. One append before the call, one pop after. If choosing also flips a used flag, unchoosing flips it back. Symmetry is the invariant. And watch for an early return between the choose and the unchoose.

Third, the recursion tree is the output. Each root-to-leaf path is one object. So the cost is the number of nodes times the work per node, and the output size is a lower bound. No enumerator can beat it.

## Subsets, combinations, permutations

Subsets first. The interview version loops over a start index. Every node of the tree is a subset, so you record at every call, and after choosing the element at index i, only later indices are allowed. For 1, 2, 3 that gives exactly eight nodes: empty, 1, 1 2, 1 2 3, 1 3, 2, 2 3, and 3. The start index is what stops 2 1 from appearing as well as 1 2. Each subset is generated in one canonical order.

Why is it correct? Each call is responsible for the subsets that agree with its path on the elements before its start index. It records the one that adds nothing more, and hands everything else to its children, split by the next element chosen. Those groups are disjoint and cover everything, so every subset comes out exactly once.

The cost: there are 2 to the n subsets, and their total length is n times 2 to the n minus 1, because each element is in half of them. So the work is n times 2 to the n, and the depth is only n. At n of 20, that is about a million subsets, fine. At 30, it is a billion, not fine in any language. When n is at most 20, a bitmask loop over the integers from zero to 2 to the n works too.

Combinations are subsets of a fixed size k: the same start index, but record only at depth k. Add one prune: stop when the elements left cannot fill the path. Without it, the code is still correct but walks into dead branches. With n of 20 and k of 10, the prune cuts the internal nodes from about 432 thousand to about 168 thousand, roughly 60 percent fewer.

Combination Sum is the twist: candidates can be reused, and you stop at a target sum instead of a length. One change does it: recurse with the same index, not the next one. That allows reuse but still forbids going back to earlier indices, so each multiset comes out in one order. And sort the candidates first, so you can stop the loop at the first candidate bigger than what remains. That is the simplest example of pruning.

Permutations use every element, so the choice at each level is any element not yet used. The branching is n, then n minus 1, and so on, with n factorial leaves. Keep a used flag per element, or swap each candidate into the current position and swap it back. Both cost n times n factorial. Ten factorial is about 3.6 million, fine. Thirteen factorial is over 6 billion, not fine. When an interviewer gives you n of at most 10 for a permutation problem, they are telling you the intended solution is exhaustive.

And a phone keypad's letter combinations is a Cartesian product: each slot has its own option list. No start index is needed, because positions are distinct by construction. Recognise the shape: independent options per slot is a product; choosing from one pool is subsets, combinations or permutations.

## Duplicates: skip the same value at the same level

Now the input is 1, 2, 2. Treat the 2s as distinct and you get the subset "1, 2" twice. You could deduplicate with a set of tuples, but that does the full duplicated enumeration first. It is the answer interviewers accept from mid-level candidates while waiting for the real one.

The real one: sort, then at each level of the tree, skip a value equal to the previous value you tried at that same level. In code, skip index i when i is greater than start and the value equals the one before it.

On 1, 2, 2, you get six subsets from six nodes: empty, 1, 1 2, 1 2 2, 2, and 2 2. No set. Each pruned branch would have exactly reproduced its left sibling's subtree. On five 1s, the unpruned tree has 32 nodes for 6 distinct subsets. The pruned tree has 6.

Here is the question interviewers ask. Why "i greater than start", and not "i greater than zero"?

[pause]

Because the rule must only compare siblings. When you have chosen the first 2 and recursed, the second 2 is the first choice of the new level. Its index equals start, so it is allowed, and 1 2 2 is generated. With "greater than zero", the rule also fires there, a value can never follow itself, and both 1 2 2 and 2 2 silently vanish. The rule says: do not start two sibling branches with the same value. It never stops a value from following itself deeper down.

Permutations with duplicates use the same idea, with the used array. Skip an element if it equals the previous one and the previous one is not currently used. "Not used" means the earlier equal element was tried at this level and undone, so it is a sibling, not an ancestor. On 1, 1, 2, that yields exactly three permutations from nine nodes. Flip the condition to "is used" and you still get the right three, but through more nodes. On a bigger input, four 1s and two 2s, it is 55 nodes with the right rule, 331 with the flipped one, and nearly two thousand with no rule, plus duplicates in the output.

## What the libraries do

Python's itertools permutations, combinations and product are written in C. Each keeps a small array of indices and advances it like an odometer, yielding one tuple per step. Nothing is built up front. Two surprises: the order is by index position, not by value, and there is no deduplication, so the permutations of 1, 1 include 1, 1 twice.

C plus plus next permutation rewrites the array in place to the next arrangement in value order, using an algorithm attributed to Narayana Pandita, from the 14th century. Find the longest non-increasing suffix. The element just before it is the pivot. Swap the pivot with the rightmost suffix element larger than it, then reverse the suffix. Each step is amortised constant time. Because it works by value, it skips duplicates for free, which is the C plus plus answer to unique permutations.

Two more worth naming. Heap's algorithm makes each permutation from the last with a single swap, useful when the objects are expensive to copy. And Gray-code order visits all subsets so that consecutive ones differ by a single element, which lets you keep a running sum in constant time per subset.

## In the interview

A follow-up the lesson expects. Why is the constraint n of at most 20 on the subsets problem, and what would n of 25 change?

[pause]

The output is n times 2 to the n: about 20 million integers at n of 20, and about 800 million at 25. The algorithm is unchanged; the output stops fitting in time and memory. The wrong answer is "recursion depth", which is only n.

And the inverse: an interviewer gives you n up to 100 thousand and asks how many subsets sum to a target. That constraint tells you not to enumerate at all. Two to the 100 thousand subsets cannot be listed by any method, pruned or not. Asking for a count with a large n is the signature of dynamic programming over index and sum.

## Recap

Four things to remember. One template: choose, explore, unchoose, with a copy on record and an undo for every do. Subsets and combinations use a start index, permutations use a used array or swaps, and products need no guard. Duplicates are handled by sorting and skipping a value already tried at the same level, with "i greater than start" for subsets and "previous not used" for permutations. And the cost is the output size times the object length, which no enumerator can beat, so read the constraints: n up to 20 says enumerate, n of 100 thousand says count.

At your desk: the template, the subset trees and their correctness argument, the permutation implementations and duplicate trace, the itertools and next permutation tables, and the two exercises, unique subsets and unique permutations.

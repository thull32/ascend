---
lesson: backtracking-pattern
source: 62eb53e9aa37b158
---
## 1

A subsets solution records the current path list itself into the output, instead of a copy of it. What is the output for the input 1, 2?

A, an exception, since a list is appended to itself. B, the empty set, 1, then 1 and 2, then 2, which is correct. C, four copies of 1 and 2, the deepest state. D, four empty lists, four references to one emptied list.

[think]

The answer is D: four empty lists, four references to one emptied list.

The path is one shared list, mutated by every append and pop. Each recorded entry is a reference to it, and after the recursion unwinds, it is empty. Copying at the moment of recording takes a snapshot of the state.

## 2

In Subsets Two on sorted input, the duplicate skip says: skip this index if it is past the loop's start, and its value equals the previous one. Why compare with the loop's start, rather than skipping whenever the index is past 0 and the value repeats?

A, the start version is only needed for permutations. B, past 0 is correct, and past the start is the actual bug here. C, past 0 would also skip a copy chosen deeper, losing the subset 2, 2. D, they are equivalent once the input has been sorted.

[think]

The answer is C: past 0 would also skip a copy chosen deeper, losing 2, 2.

Equal values at one level root identical subtrees, so only the first is taken, and comparing with the start restricts the skip to siblings. The second copy is still needed to continue a branch that already took the first, which happens at the start index of the deeper call. The past-0 version would skip it there and lose every subset with both 2s.

## 3

On an input of ten 1s and ten 2s, generating every subset into a set of tuples makes about a million calls, while the version that skips equal siblings makes 121. Why is the gap so large?

A, hashing tuples is slow, and that cost dominates the run. B, the skip version returns fewer subsets than the set does. C, sorting the input first is what saves most of the work. D, the set version walks every duplicate subtree, and the skip version enters none of them.

[think]

The answer is D: the set walks each duplicate subtree, and the skip enters none.

Both return the same 121 distinct subsets. The set version still visits all the nodes of the unpruned tree, 2 to the 20 of them, and throws the duplicates away afterwards. The skip rule refuses to enter a subtree that would only repeat an earlier sibling, so the number of calls equals the size of the output.

## 4

Combination Sum sorts the candidates and breaks out of the loop when a candidate is bigger than what remains. The candidates are 2 to 40, and the target is 40. Compared with using continue, what does break change?

A, it skips the remaining loop iterations, while the number of calls stays the same. B, it makes the search incorrect when the candidates are sorted. C, nothing; the two keywords compile to identical bytecode. D, it cuts the number of recursive calls by a factor of 25.

[think]

The answer is A: it skips the remaining loop iterations, and the calls stay the same.

Continue already avoids the recursive call for a candidate that is too large, so both versions make about 37 thousand calls here. Break also stops scanning the larger candidates after it, which is only sound because the list is sorted and positive. In the measurement, that removed about three quarters of the running time.

## 5

Word Search, on a three by three board whose rows read C, A, A, then A, A, A, then B, C, D, returns false for the word A, A, B, which is present. Which bug fits that symptom?

A, a failed path left its cells marked, blocking later paths. B, the search should use BFS, so it finds the shortest path. C, the recursion should check bounds after reading the cell. D, neighbours must be tried in reading order to find it.

[think]

The answer is A: a failed path left its cells marked.

Marking a cell as on the path is correct. Not restoring it when the branch fails leaks the mark into every later branch and every later start cell. The first failed start leaves three A cells marked, and the valid path through them is never found. Every mark needs an unmark on the way out.

## 6

The interviewer asks you to use all cores to enumerate every N-Queens solution for n of 14. What is the sound design?

A, run one thread per row, each placing its row's queen. B, memoise on the three masks, so that workers share results. C, share one path and three sets behind a single mutex. D, give each worker a column in the first row, and its own state.

[think]

The answer is D: give each worker a first-row column and its own state.

The subtrees under different first choices are independent, so splitting at the root needs no locks: each worker owns its path and masks, and returns its solutions for a final merge. A shared locked path serialises the search. The mask state almost never repeats, so memoisation buys nothing. And rows are sequential decisions that cannot run in parallel.

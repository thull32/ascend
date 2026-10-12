---
lesson: two-pointers-mastery
source: c3c2573592b0523b
---
## 1

In pair-sum on a sorted array, the values at lo and hi add up to less than the target. Why is it safe to discard lo entirely?

A, lo's value is the smallest remaining, so it cannot appear in any valid pair. B, lo has already been compared once, and each index needs only one comparison. C, it is not safe; a larger partner beyond hi could still reach the target. D, even its largest remaining partner, the value at hi, gives a sum that is too small.

[think]

The answer is D: even its largest remaining partner, at hi, gives a sum that is too small.

The remaining partners for lo are the indices up to hi, and the value at hi is the largest of them. If even that sum is too small, lo's whole row of the pair table is ruled out. Partners beyond hi are no way back: they were discarded earlier for being too large even with the smallest remaining partner. Being the smallest value alone does not rule lo out.

## 2

In Container With Most Water, the wall at lo has height 3 and the wall at hi has height 9. Why move lo rather than hi?

A, the taller wall is more likely to be part of the best container overall. B, moving either pointer works, since both shrink the width by exactly one. C, every other container using hi is narrower, so each one is worse than this. D, every other container using lo is narrower, and still capped at height 3.

[think]

The answer is D: every other container using lo is narrower, and still capped at height 3.

The shorter wall caps the height of every pair it belongs to, and the width only shrinks inwards, so every remaining pair using lo is strictly worse than the current one. Containers using hi are narrower too, but their height is the smaller of the other wall and 9, which can exceed 3. So moving hi would discard pairs that could be better, and are not proven worse.

## 3

In the Dutch national flag loop, the element at mid is a 2, so it is swapped with the element at hi. Why does mid stay where it is?

A, not advancing mid keeps the potential dropping, so the loop stays linear. B, keeping mid still stops the 2 now at hi from being swapped out again. C, the element that arrived from hi is still unexamined, and must be classified first. D, it should advance; the swapped-in element is always a 1, as in the lo case.

[think]

The answer is C: the element that arrived from hi is unexamined, and must be classified first.

Everything left of mid has been examined, and everything right of hi is known to be 2, but the region between them is unknown, and the swap brings an unknown element to mid. On the lo side it is different: the element arriving from lo was already examined, which is why mid advances there. Progress still happens, because hi decreases; not advancing mid is about correctness, not speed.

## 4

Which question is a better fit for sorting plus two pointers than for a hash map?

A, count the pairs whose sum is strictly less than t. B, group the words that are anagrams of each other. C, return the indices of two values that sum exactly to t. D, check whether any value in the array appears twice.

[think]

The answer is A: count the pairs whose sum is strictly less than t.

A hash map answers exact-membership questions. Counting pairs below a threshold needs order, which two pointers exploit by adding a whole row of valid pairs per step. The other three are equality questions, where hashing wins, and returning the original indices is especially awkward after a sort.

## 5

You keep at most two copies of each value in a sorted array, in place. Why does the keep test compare the value at read with the value at write minus 2, and not at read minus 2?

A, write minus 2 stays in cache, so it is faster to read. B, write minus 2 is in the output, which records how many copies were kept. C, read minus 2 can be out of bounds, while write minus 2 is always valid. D, the two are always equal, so either comparison gives the same result.

[think]

The answer is B: write minus 2 is in the output, which records how many copies were kept.

Everything before write is the correct output so far, and it is sorted, so if the value two places back in the output equals the current value, the last two kept values already equal it. The input position read minus 2 says nothing about what was kept, and it may have been overwritten. On three 1s, three 2s and a 3, comparing with the input would wrongly drop the second 2.

## 6

A 3Sum implementation sorts, anchors each index, and runs pointers in from both ends. But on minus 1, 0, 1, 2, minus 1, minus 4, it returns minus 1, 0, 1 twice. Where is the missing step?

A, remove duplicates from the input with a set before sorting. B, sort in descending order, so repeated values are visited from the largest first. C, skip an anchor equal to the previous anchor, and after a hit, move lo and hi past repeated values. D, stop the pointer sweep at the first hit for each anchor.

[think]

The answer is C: skip equal anchors, and after a hit, move lo and hi past repeated values.

The two minus 1s act as two anchors, and each finds 0 and 1; repeated values at lo or hi produce the same triple again after a hit. Skipping both removes the duplicates, and the skip loops need the lo-below-hi bound to stay in the array. Removing duplicates from the input is wrong, because triples like 0, 0, 0 need repeated values, and one hit per anchor would miss triples.

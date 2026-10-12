---
problem: sort-colors
args: [[1, 2, 0, 1, 0]]
frames: 27
source: 954ccb90eec56c44
---
@0
We are sorting 1, 2, 0, 1, 0 into zeros, then ones, then twos, in one pass. Three pointers split the list into four regions. Before lo: finished zeros. From lo up to mid: finished ones. From mid to hi: not yet examined. After hi: finished twos. Each step looks at the value under mid and shrinks the unexamined region by one. lo and mid start at zero, and hi at the last position, 4.

@1-4
mid sees a 1. A one is already in the right place, just past the ones region, so mid simply moves on, to position 1.

@5-9
mid sees a 2. It is swapped with the value at hi, a 0, so the 2 lands at the very end, in the twos region, and hi steps back to 3. The list reads 1, 0, 0, 1, 2. Now the rule people get wrong: mid does not move. The 0 that just arrived from the back has never been examined.

@10-14
And here it is, still at mid: a 0. It is swapped with the value at lo, which is the 1 at the front. The list reads 0, 1, 0, 1, 2. This time both lo and mid move forward. That is safe, because whatever comes back from lo was already examined and found to be a one.

@15-19
mid, at position 2, sees another 0. It swaps with lo's 1, giving 0, 0, 1, 1, 2, and lo and mid both move forward again. lo is now 2 and mid is 3.

@20-23
mid sees a 1, already in place, and moves to 4.

@24-26
Now mid, at 4, has passed hi, at 3. Nothing is left unexamined, so the loop stops. The result is 0, 0, 1, 1, 2.

Each step either advances mid or pulls hi back, so there are at most n steps: linear time, constant space, a single pass. This is the Dutch national flag partition, the same three way split a good quicksort uses on duplicate keys. The two classic bugs are both visible in this trace. Advancing mid after swapping a 2 to the back would have skipped the 0 that arrived. And looping only while mid is strictly less than hi would leave the value at hi unexamined. If one pass is not required, counting the three values and overwriting the list is a perfectly good answer.

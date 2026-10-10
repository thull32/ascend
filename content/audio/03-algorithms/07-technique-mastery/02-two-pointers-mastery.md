---
lesson: two-pointers-mastery
source: 039705b40d4d7757
fit: partial
desk:
  - "The pair-table trace for 1, 3, 4, 6, 8, 11 with target 10, and the two-pointer animation"
  - "The Container With Most Water inequality, and the Trapping Rain Water two-pointer rule"
  - "The potential table for five pointer loops"
  - "The keep-at-most-k trace, the merge-from-the-back argument, and the Dutch flag animation"
  - "The triangle-counting trace, and the hashing versus sorting table"
  - "The Timsort, memory and loop-cost numbers"
  - "Exercises: count triangles, and smallest difference across two arrays"
---
## Introduction

You write the opposite-ends loop for "find a pair in a sorted array that sums to the target", and the interviewer asks: when you move the left pointer forward, how do you know you have not skipped the pair? The usual reply is "because the array is sorted". That names the precondition, but it proves nothing.

The follow-ups come next. Why does Container With Most Water work when nothing is sorted? Why is the loop linear? And why would you ever sort, when a hash map is linear?

Three tools answer all of that. One picture, the table of all pairs, which explains every opposite-ends algorithm. One technique, a potential, which proves every pointer loop linear. And one rule for choosing between sorting and hashing.

## The pair table

Take the sorted array 1, 3, 4, 6, 8, 11, and a target of 10. Picture a table with a row for each left index and a column for each right index, where each cell holds the sum of that pair. Because the array is sorted, sums increase to the right along a row and downward along a column. The pointers start at the top-right corner: the smallest value and the largest.

Walk it. 1 plus 11 is 12, too big. The 11 is too big even with the smallest remaining partner, so its whole column goes. 1 plus 8 is 9, too small. The 1 is too small even with the largest remaining partner, so its whole row goes. 3 plus 8 is 11, drop the 8. 3 plus 6 is 9, drop the 3. 4 plus 6 is 10. Found, in five steps.

That walk is the proof. The invariant: every pair outside the remaining triangle, left of the left pointer or right of the right one, has been ruled out. A sum too large rules out a column; a sum too small rules out a row. Neither move can discard the answer, and each removes one line, so after at most n minus 1 steps the pair is found or nothing is left. Outside interviews, this walk is called saddleback search: searching a matrix whose rows and columns are both sorted, from the top-right corner. If you can say "each comparison eliminates a whole row or column of the pair table", you have answered the question completely.

Now the surprise. The argument never needed sorted values. It needs some reason why one comparison makes a whole row or column hopeless. In Container With Most Water, the area of a pair of walls is the distance between them times the shorter wall's height. Suppose the left wall is the shorter one. Every other container that uses it is narrower, and still capped at its height, so every one of them is strictly worse than the pair you just measured. Its row is dominated, and the left pointer moves.

Here is the trap. Before I say it: why is moving the taller wall wrong?

[pause]

Because the shorter wall still caps every remaining pair that uses it, so moving the taller one throws away candidates without proving they are worse. Trapping Rain Water's two-pointer version uses the same kind of dominance: whichever side has the smaller running maximum has enough information to be settled now.

## Proving it linear: pick a potential

For any pointer loop, find a non-negative whole-number quantity, at most about n at the start, that strictly decreases on every iteration of every loop, including the inner loops that skip duplicates. Then the loop runs at most that many times. For opposite ends, it is the gap between the pointers. For a read and write compaction, it is how far the reader has left to go. For merging two sorted arrays, it is the elements not yet consumed.

The discipline catches a real class of bug: the iteration that moves nothing. In the Dutch national flag, which sorts 0s, 1s and 2s in one pass, swapping with the high pointer does not advance the middle pointer, but it does move the high one in, so the potential still drops. A version that swaps and forgets to move either pointer spins forever on the input 2, 2. And a duplicate skip that compares an element with the next one, without the "left still below right" condition, walks straight off the end of the array. When you write a pointer loop, name the potential for every branch. It takes ten seconds.

## Same-direction pointers

Read and write loops have a different invariant: everything before the write pointer is the correct output for everything the reader has seen. Every correctness question becomes "does this step preserve that?"

Take "remove duplicates from a sorted array, keeping at most k copies of each value". Keep the current element if fewer than k have been written, or if it differs from the element k places back in the output. The comparison is against the output, not the input. The output is sorted, so if the element k places back equals the current one, the last k kept values all equal it, and keeping it would make k plus 1 copies. Comparing with k places back in the input looks at a position that may already have been overwritten, and that cannot tell you how many copies you kept.

The same invariant explains in-place merging. To merge one sorted array into another that has spare slots at the end, write from the back. The write position always stays at least one ahead of the unread part of the first array, so you never overwrite data you still need. Write from the front and the output lands on unread elements. The question "which end do I write from?" is always answered by asking where the unread data lives.

## Three pointers

The Dutch national flag keeps four regions: 0s, then 1s, then the unknown, then 2s, with three pointers on the boundaries. Seeing a 0 at the middle, swap it to the low boundary and advance both low and middle. Seeing a 1, advance the middle. Seeing a 2, swap it to the high boundary and move high in, but do not advance the middle.

Why the asymmetry? Each swap brings an element into the middle position. Anything coming from the left has already been examined. Anything coming from the high end has not, so it must be classified before you move on. That asymmetry is the whole bug surface.

Next, an anchor plus a pair. Fix one index and run opposite-end pointers over the rest: that is 3Sum, in n squared time. Is that optimal? Nobody knows an algorithm for 3SUM that runs in n to any power below 2. The best known improvements shave only logarithmic factors, and a whole family of geometry problems is called 3SUM-hard because they inherit that barrier. So n squared is the expected answer, and you can say why you are not looking for better. In numbers: about n squared over 2 pointer steps, which is four and a half million for 3 thousand elements, under a second in Python, and 5 billion for 100 thousand, out of reach in any language for an interactive service.

The same shape counts, too. To count triangles from stick lengths, sort, fix the largest side, and run pointers below it. If the two pointer values sum to more than the largest side, then every value from the left pointer up to the right one also works with the right one, because they are all at least as big. That certifies a whole row of the pair table at once: add the gap between the pointers, and move the right pointer down. The pair table works both ways. A comparison can rule a row out, or certify a whole row in.

And with several sorted arrays, give each its own pointer and advance the one that is behind. For the closest pair with one element from each array, the smaller of the two current values has already met its best remaining partner, so you can drop it.

## What sorting buys, and what it costs

Sorting buys an order in which one comparison tells you which way to move. It costs n log n time, it loses the original indices, and it mutates the input unless you copy it first. The alternative for pair problems is a hash map, and the two answer different questions.

Here is the rule of thumb to keep: equality goes to a hash map; order goes to sorting. A hash map answers "is this exact value present?" and knows nothing about neighbours. "Less than", "closest", "within a range" and "count how many" all need order. That is why Two Sum on unsorted input with indices is a hash-map problem, while Two Sum Two, with sorted input, is a pointer problem that needs no extra space.

Memory can decide it. A Python dict costs about 100 bytes an entry, so a two-sum map over a million elements is around 100 megabytes; a sorted copy is 8. And the sort is sometimes nearly free: Python's sort is Timsort, which detects already-ordered runs. In the lesson's measurement, a million random integers took 0.15 seconds to sort, and the already-sorted result took 0.02.

Two traps. JavaScript's default sort compares elements as strings, so 10, 9, 1 sorts to 1, 10, 9, and the pointer proof's precondition is silently false. Always pass a numeric comparator. And if the interviewer asks for constant extra space, say that the sort itself may not be: Timsort needs up to n over 2 pointers of temporary space, and sorted makes a copy.

## In the interview

The lesson's first follow-up is the one from the opening. Convince me the pair search never skips the answer.

[pause]

The pair table. Each comparison eliminates a full row or column, because the current sum is an upper or lower bound on every remaining sum in that line. The answer is never in an eliminated line, and each step removes one line, so at most n minus 1 steps. The wrong answer is "because the array is sorted", which names the precondition and proves nothing.

And a second. Partition so that all zeros come first, keeping the relative order of the non-zeros. The model answer is the read and write compaction: stable by construction, linear time, constant space. The wrong answer is offering a swap-based partition, like the Dutch flag, and asserting it preserves order. It does not.

## Recap

Four things to remember. Every opposite-ends algorithm is a walk on the pair table, where one comparison rules out, or certifies, a whole row or column; that is why it never skips the answer, sorted or not. Prove every pointer loop linear by naming a potential that drops on every branch, which also catches branches that move nothing. Read and write loops keep "the prefix is the correct output", which is why you compare against the output and merge from the back. And equality goes to a hash map, order goes to sorting.

At your desk: the pair-table and Dutch flag animations, the potential table, the compaction and triangle traces, the hashing versus sorting table, and the two exercises.

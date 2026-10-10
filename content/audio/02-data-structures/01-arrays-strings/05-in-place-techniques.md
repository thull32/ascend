---
lesson: in-place-techniques
source: 06193850d8eccff4
fit: partial
desk:
  - "The move-zeroes trace and the read/write visualiser"
  - "Lomuto and Hoare traced on the same input"
  - "The Dutch national flag code and its seven-step trace, with the visualiser"
  - "The three-reversal rotation trace, the cycle-leader example and the rotate visualiser"
  - "The technique trade-off table and the production failure table"
  - "Exercises: move zeroes, and the Dutch national flag"
---
## Introduction

The interviewer nods at your linear solution and says: good, now do it without allocating a second array. Most solutions that use linear extra space become constant-space with one of three moves. Two pointers that read and write at different speeds. Swaps that partition the array into regions. Or reversals, composed to produce a permutation.

Each has an invariant: a small statement about what is true between iterations. The invariant is what lets you write the loop without guessing, and saying it out loud before you write the loop is the senior signal.

In-place matters outside interviews too. Sorting 8 gigabytes of records on a 12 gigabyte machine, compacting a network buffer, rearranging a 25 megabyte video frame: all rule out copying to a new array. And they share the hazards, which we will end on.

## Read and write pointers

The first move. A read index scans every element. A write index marks the end of the output built so far. Elements you keep go to the write position, and write advances. Elements you discard are skipped.

The invariant: everything before write is exactly the answer for everything read so far, and write never passes read. That second half is what makes it safe. Every slot you write into has already been read, so you never destroy something you still need.

Move the zeroes to the end, keeping the others in order. The array is 0, 1, 0, 3, 12. Read the zero: skip. Read the 1: swap it to position zero, write moves to one. Skip the next zero. The 3 swaps into position one, the 12 into position two. The result is 1, 3, 12, 0, 0.

The same loop removes duplicates from a sorted array, removes every copy of a value, and compacts a buffer. Rust's retain and Go's DeleteFunc are this loop in the standard library. And it is stable for free: read visits the kept elements in order, and write places them in order. Hold onto that, because the next techniques lose it.

The other two-pointer shape starts at both ends and moves inward. Reversing swaps the two ends and moves both pointers; the invariant is that everything outside the pointers is already final. Two-sum on a sorted array moves whichever pointer the comparison proves useless: if the pair is too small, nothing paired with the low element can reach the target, so low moves up. That is why it needs sorted input.

## Partitioning with swaps

Partitioning rearranges an array so everything satisfying a predicate comes before everything that does not. It is the heart of quicksort and quickselect.

Lomuto's partition is the move-zeroes loop with a general predicate. A write index marks the end of the "less than the pivot" region, a scan index walks forward, and the pivot waits at the end until a final swap puts it in place. It is simple. But it does up to n minus one swaps, and everything equal to the pivot lands on the same side.

Hoare's partition runs two pointers from opposite ends. The left one stops at an element that is not less than the pivot, the right one at an element that is not greater, they swap, and they continue until they cross. Each swap fixes two misplaced elements, so Hoare does at most n over 2 swaps. And elements equal to the pivot stop both pointers, so equal keys split evenly. The price is that neither side keeps its order, and the return value is a split point, not the pivot's final position. Getting that wrong is how hand-written Hoare partitions loop forever on a whiteboard.

Here is a question to answer before I do. Quicksort with Lomuto's partition, on an array of a million identical values. What happens?

[pause]

Every element compares "not less than the pivot", so each partition puts n minus one elements on one side and nothing on the other. The recursion goes n deep, and the sort is quadratic. It does not loop forever; it is slow, not stuck. The fix is a three-way partition, which finishes an all-equal run in one pass.

## The Dutch national flag

That three-way partition has a name. Sort an array holding only 0s, 1s and 2s, in one pass. Keep three pointers, low, mid and high, and four regions. Before low: zeros. From low to mid: ones. From mid to high: not yet examined. After high: twos. Those four statements are the invariant.

The loop looks at the element at mid. A 0 swaps with low, and both low and mid advance. A 1 just advances mid. A 2 swaps with high, and high retreats. Mid does not advance.

That last line is the whole algorithm, and it is the most common bug in it. The element that arrived from the right has never been examined. It might be a 0. Picture the array 1, 2, 0. The 1 just advances mid. The 2 at mid swaps with the 0 at the end, giving 1, 0, 2, and high retreats. If mid advances now, it passes high, the loop stops, and you return 1, 0, 2. Wrong. If mid stays, it examines the 0, swaps it with low, and you get 0, 1, 2. The buggy version is wrong only for some inputs, often when a 0 sits at the far right, which is why you trace this by hand before you run it.

Why is it safe to advance mid after the swap with low? Because what comes back from low is either mid itself or a 1 that was already classified. Every step either moves mid up or high down, so the loop is linear, with at most n swaps.

Production sorts use exactly this idea for repeated keys. pdqsort, which Go and Rust both use or build on, sweeps a run of keys equal to the pivot in one partition.

## Reversals

A reversal is an in-place, linear, constant-space primitive, and reversals compose.

Rotate right by k with three reversals: reverse the whole array, then reverse the first k elements, then reverse the rest. Say it on 1, 2, 3, 4, 5, rotated right by 2. Reverse everything: 5, 4, 3, 2, 1. Reverse the first two: 4, 5, 3, 2, 1. Reverse the last three: 4, 5, 1, 2, 3. Why it works: reversing everything brings the last k elements to the front, backwards, and the two partial reversals restore each block's internal order.

The trap: reduce k modulo n first. Rotate 5 elements by 7 without reducing, and reversing the first 7 elements indexes off the end. Rotating by 7 is rotating by 2.

There is an alternative with fewer moves. Cycle-leader rotation carries each element straight to its destination, following cycles: exactly n moves, against about 3n for the reversals. But each move jumps k slots, so on a large array with a large k every move is a cache miss, while the reversals stream through memory with the prefetcher's help. Rust's rotate picks per call: the cycle algorithm for short slices and large elements, and sequential copies or block swaps otherwise.

The same composition gives you reversing the words of a sentence in place: reverse the whole thing, so the words are in the right order but spelled backwards, then reverse each word.

## What a swap really costs

A swap is two loads and two stores in C, Rust or Go. In CPython, it is two subscript lookups, a swap and two subscript stores, each a full method dispatch with reference counting. Measured: a two-pointer reverse of a million-element list took about 48 milliseconds. The built-in list reverse, a C loop, took 0.22 milliseconds, 220 times faster. So when the interviewer asks for constant space in Python, the two-pointer loop is the honest answer, and the built-in is what you would ship.

Two traps here. Assigning a reversed slice back over the whole list is in place in name only: it builds a full copy and copies it back. And the XOR swap, which avoids a temporary, zeroes the element when both indices are the same. Lomuto swaps an element with itself on every kept element. Compilers already keep the temporary in a register, so the trick saves nothing and adds a bug.

And stable sorts are not in place. Python's sort and Java's object sort are Timsort, needing up to n over 2 references of temporary space. Rust's stable sort allocates up to half the elements themselves, so stably sorting 8 gigabytes of inline records needs about 12.

## The costs of in-place

A senior answer names the hazards. You mutate the caller's data, so name the function clearly, sort against sorted, and never do it to a slice you do not own. A classic Python version: assigning the result of sort back to the variable leaves you holding None, because sort mutates and returns nothing.

Stability is usually lost. If the follow-up is "keep the original order of equal elements", the answer is read and write compaction, not Hoare or the flag.

Strings are immutable in Python, Java, JavaScript and Go, so in place on a string means converting to a list and joining at the end, which is linear space anyway. Say so and move on.

Concurrent readers see intermediate states. There is no moment during three reversals when a shared buffer holds either the old order or the new one. The production answer is a lock, double buffering, or copy-on-write.

And in-place is about memory and allocation, not speed. For small inputs the copying version is often faster.

## In the interview

A follow-up the lesson expects. Another thread reads this buffer. Is your in-place rotation safe?

[pause]

No. There is no instant during the three reversals when the buffer is a valid old or new order, so readers must be excluded with a lock, or given a different buffer, through double buffering or copy-on-write. The common wrong answer is "each swap is atomic, so readers only see valid states".

And: do this in place in Python. A list, yes, with two pointers. A string, no, because strings are immutable; convert to a list, work in place, and join, and acknowledge that the list is linear space. Presenting a reversed slice as in place is the wrong answer.

## Recap

Four things to remember. Read and write pointers compact an array stably, and the invariant that write never passes read is what makes them safe. Lomuto is simple but quadratic on equal keys; Hoare halves the swaps and splits equal keys; a three-way partition handles them in one pass, as long as mid does not advance after the swap with high. Three reversals rotate an array with sequential access, after you reduce k modulo n. And in-place costs stability, mutates the caller's data, and exposes half-finished states to other readers.

At your desk: the move-zeroes, Lomuto, Hoare, Dutch flag and rotation traces with their visualisers, the trade-off and failure tables, and the two exercises, move zeroes and the Dutch national flag.

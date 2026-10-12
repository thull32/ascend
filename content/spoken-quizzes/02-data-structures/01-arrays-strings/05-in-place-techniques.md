---
lesson: in-place-techniques
source: ae04bcc4ee186100
---
## 1

In read and write two-pointer compaction, what guarantees that writing at the write pointer never destroys an element you have not yet read?

A, the array is sorted, so each kept element only ever moves leftward. B, elements are swapped rather than overwritten, so none is ever lost. C, the array has no duplicates, so each slot is written at most once. D, the invariant that write never passes read, so every slot written was already read.

[think]

The answer is D: the invariant that write never passes read, so every slot written was already read.

The write pointer only advances when the read pointer does, so it never overtakes it. Every element before the read pointer has already been examined, so any slot the write touches has been consumed. Swapping against overwriting changes what happens to discarded elements, not this safety property, and the technique needs neither sorted nor distinct input.

## 2

In the Dutch national flag algorithm, after swapping a 2 at mid with the element at high, why is mid not advanced?

A, advancing would make the loop exceed linear time on inputs full of 2s. B, mid only advances on 1s, since 0s and 2s are always swapped. C, the element swapped in from high has not been examined yet. D, the swapped-in element is always a 1, which the next step skips.

[think]

The answer is C: the element swapped in from high has not been examined yet.

The region from mid to high is the unknown region. The swap brings an unexamined element, which may itself be a 0 or a 2, into position mid, and advancing would classify it without looking. Mid does advance on a 0, because the element swapped in from low is a known 1, or mid itself, so advancing is safe there.

## 3

Quicksort with a Lomuto partition is run on an array of one million identical values. What happens, and what fixes it?

A, it runs in n log n as usual, because equal keys never need to move. B, it loops forever, because the pointers never cross: add a strict comparison. C, it runs in order n squared, because every element lands on one side: use a three-way partition. D, it runs in order n squared because of the final pivot swap: use Hoare, which has no final swap.

[think]

The answer is C: it runs in order n squared, because every element lands on one side, so use a three-way partition.

Every comparison says the element is not less than the pivot, so each partition splits n minus 1 against zero, and the recursion goes n deep. Hoare splits equal keys evenly, and a Dutch flag style three-way partition finishes an all-equal run in one pass, which is what production sorts like pdqsort do. Lomuto does terminate; it is slow, not stuck.

## 4

Which in-place technique preserves the relative order of the elements it keeps?

A, read and write pointer compaction. B, the Dutch national flag partition. C, Hoare partition from opposite ends. D, three-reversal rotation of a subset.

[think]

The answer is A: read and write pointer compaction.

The read pointer visits the kept elements in order, and the write pointer places them in order, so their relative order is preserved: the technique is stable. Swap-based partitions, such as Hoare and the Dutch flag, move elements across the array and scramble the order within regions.

## 5

You rotate an array of length 5 to the right by 7, using the three-reversal method, without reducing 7 first. What happens?

A, it rotates left by 2 instead, since k exceeds n and the direction flips. B, it works correctly, because each reversal wraps indexes around the end. C, it produces the rotation by 2 anyway, since 7 mod 5 is applied implicitly. D, it indexes past the end when it reverses the first k elements.

[think]

The answer is D: it indexes past the end when it reverses the first k elements.

The method reverses the first k elements, and 7 exceeds the length, so it indexes past the end, or, with clamped slices, reverses the wrong ranges. Nothing reduces k for you: take k mod n, which is 2, first. Rotating by n is the identity, so only the remainder matters.

## 6

An interviewer asks you to reverse a Python string in place, with constant extra space. What is the best response?

A, say it is impossible, since strings are immutable, and stop there. B, note that strings are immutable, then reverse a list copy with two pointers. C, use a reversed slice, since slicing reverses the string with constant extra space. D, reverse it recursively, swapping the first and last characters on each call.

[think]

The answer is B: note that strings are immutable, then reverse a list copy with two pointers.

The two-pointer technique is what is being tested. Stating the immutability constraint, and its consequence that a linear list buffer is unavoidable, shows you understand the runtime. A reversed slice allocates a new string and hides the algorithm, and recursion adds a linear stack on top of the copies.

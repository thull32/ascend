---
lesson: cyclic-sort
source: fc4a167cd628eacb
---
## 1

Why is cyclic sort linear time, even though a single index can be examined many times?

A, each index is examined at most twice, by the way the guard is built. B, re-examination happens only on duplicates, which are rare in the input. C, it is really n log n, and the log factor is small enough to ignore. D, each swap puts one value home for good, so there are at most n swaps.

[think]

The answer is D: each swap puts one value home for good, capping swaps at n.

The bound counts swaps, not visits. A value that reaches its home never moves again, so there are at most n swaps, and every iteration that does not swap advances the index, so there are n of those. An index can be revisited many times, not just twice, but each revisit is paid for by a value placed permanently. Duplicates are not needed for revisits; any displaced value causes one.

## 2

A candidate writes the swap as one Python tuple assignment. The first target is nums at i; the second target is nums at the index given by nums at i, minus 1; and the right-hand side holds those same two values in the opposite order. On the array 3, 1, 2, at i equal to 0, what is the array after that one line?

A, 2, 1, 3, because the tuple swap exchanges index 0 with index 2. B, 2, 3, 2, since the second index is read after nums at 0 has changed. C, 3, 1, 2, unchanged, because Python evaluates both sides before assigning. D, 1, 3, 2, because the targets are assigned from right to left.

[think]

The answer is B: 2, 3, 2, since the second index is read after nums at 0 changes.

The right-hand side, 2 and 3, is built first. Then the targets are assigned left to right: nums at 0 becomes 2, and only then is the second target's index computed, as 2 minus 1, which is 1. So nums at 1 becomes 3, and the value 1 is lost. Evaluating the right-hand side first is true, but does not protect the index expressions on the left. Compute the target index before the swap.

## 3

The placement guard is written as: while the value at i is not i plus 1, swap it with the slot at its value minus 1. Which input hangs it?

A, 1, 1, since equal values swap with each other. B, 3, 1, 2, since each swap moves a value two slots. C, 1, 2, 3, since every value is already at home. D, 2, 1, since index 0 is examined a second time.

[think]

The answer is A: 1, 1, since equal values swap with each other.

At index 1, the value 1 is not at its own index, but its home already holds a copy. Swapping two equal values changes nothing, so the condition never becomes false. Compare the value with what sits at its home, not with the current index. The other inputs terminate normally.

## 4

Find the Duplicate Number forbids modifying the array and requires constant extra space. What is the intended approach?

A, a hash set of the values seen so far, stopping at the first repeat. B, cyclic sort on a copy of the array, then read the first misplaced value. C, XOR every value against the range 1 to n, so that pairs cancel. D, Floyd's cycle detection, on the function from each index to the value stored there.

[think]

The answer is D: Floyd's cycle detection on the index-to-value function.

With n plus 1 indices mapping into the values 1 to n, the path from index 0 must enter a cycle, and the entry point is a value held at two indices: the duplicate. Floyd finds it in linear time and constant space without writing anything. A copy or a hash set costs linear space, and XOR fails when the duplicate appears more than twice or other values are missing.

## 5

First Missing Positive, but now the values range up to a billion, with n equal to a hundred thousand. What changes?

A, cyclic sort fails, since a billion has no index, so use a set. B, the swaps overflow, so values must be taken modulo n. C, nothing, since values above n are placeholders already. D, the answer may exceed n plus 1, so the scan must go further.

[think]

The answer is C: nothing, since values above n are already placeholders.

The answer is always between 1 and n plus 1, so any value above n is irrelevant, and the range check already leaves it where it is. The set objection is right for general missing or duplicate problems over an unbounded range, not for this one. Taking values modulo n would invent values that were never present.

## 6

A C plus plus service computes the missing ID as n times n plus 1, over 2, minus the sum, all in 32-bit integers. It is correct in tests, and wrong for some batches above about 46 thousand IDs. What is the most robust fix?

A, cast only the final subtraction to 64-bit before returning. B, sort the batch and scan, since sorting cannot overflow either. C, divide n by 2 first, since the division is what overflows. D, XOR the indices and the values, which has no carries to overflow.

[think]

The answer is D: XOR the indices and values, which cannot overflow.

The product of n and n plus 1 exceeds the largest 32-bit signed integer from n of 46,341, and dividing after a wrapped multiply gives a wrong result. XOR cannot overflow, and stays linear time with constant space. Casting after the damage is done does not help. Dividing n first breaks when n is odd, unless you pick the even factor. And sorting is n log n, and mutates the batch.

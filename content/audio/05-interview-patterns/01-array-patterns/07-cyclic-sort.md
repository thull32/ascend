---
lesson: cyclic-sort
source: 8a1f924247eb0a44
fit: partial
desk:
  - "The cyclic sort template in Python and JavaScript, and the four-decisions table"
  - "The one-line swap trace on 3, 1, 2"
  - "The traces: Missing Number, two missing values by XOR split, First Missing Positive, Find the Duplicate with Floyd"
  - "The variants and complexity tables, including sign marking"
  - "The measured costs of the five approaches, and the overflow analysis"
  - "Exercises: every missing number in 1 to n, and the corrupted pair"
---
## Introduction

You are handed an array of n integers and told that every value lies between 1 and n. One number is missing, or one is duplicated, or the interviewer wants the smallest positive integer that does not appear.

The obvious answers work. A hash set, which for a million integers in CPython is a 33 and a half megabyte table on top of the list. Or a sort, at n log n. Then comes the follow-up this pattern exists for: can you do it in linear time and constant extra space?

The constraint on the values is not a detail. It is the algorithm. If every value is between 1 and n, every value names a valid index, and the array can serve as its own hash table: the slot for value v answers the question "is v present?". Put each value in its slot, and whatever is out of place afterwards is the answer.

Three things to carry away: how to spot the bounded range, the swap loop and why it is linear, and when a single XOR or Floyd's cycle detection is the better answer.

## Recognising it

Cyclic sort applies when three things hold. First, the values are bounded by the length, and the statement says so in a constraint line: each value is in 1 to n, or 0 to n, or n plus 1 integers each between 1 and n. That line is the whole signal. Without it there is nowhere for a value to go.

Second, the question is about membership of that range: which value is missing, which is duplicated, every missing value, the smallest missing positive.

Third, extra space is forbidden and mutation is allowed. If the statement says do not modify the array, the pattern flips: to arithmetic, like a sum or an XOR, or to cycle detection.

The range is sometimes hidden. "The smallest positive integer not in the array", with arbitrary values: the answer must be between 1 and n plus 1, so only values in 1 to n matter and the rest are placeholders. Message IDs from some base to base plus n: subtract the base. "Is this array a permutation of 1 to n?": place everything, then check every slot holds its own value.

And the near misses. Values up to a billion in an array of a hundred thousand: the value has no slot, so use a hash set or a sort. "Every value appears twice except one", with arbitrary values: XOR everything and the pairs cancel.

## The loop and its invariant

Walk an index i from left to right. Look at the value v sitting there. If v has a home, and the home does not already hold v, swap v into its home, and look again at whatever just landed at i. Otherwise, advance i.

The guard, "the home does not already hold v", does two jobs. When the home is i itself, it is the "already home" test. And when the home holds another copy of v, it stops a swap that would exchange two equal values forever. Without it, the array 1, 1 never terminates. The classic bug is comparing the current value with the current index instead of with its home. That hangs on the first duplicate.

The invariant: swaps never change which values are present, and every index to the left of i holds either its own value or a value that cannot go home, because it is out of range or its home already has a copy. At the end that holds everywhere, which gives the read-off rule: value k is present if and only if slot k holds it.

Here is a small one. First Missing Positive on four values: 3, 4, minus 1, 1. The 3 goes home to the third slot, sending minus 1 back to the front. The 4 goes home to the fourth slot, which sends the 1 into the second slot, and the 1 goes home to the first slot. The minus 1 drifts into the second slot and stays, because it has no home. The array reads 1, minus 1, 3, 4. The first slot that does not hold its own number is the second one, so the answer is 2.

Now, why is this linear, when one index can be examined again and again?

[pause]

Count swaps, not visits. Every swap puts one value into its home, and the guard keeps it there forever. So there are at most n swaps. Every iteration that does not swap advances i, so there are exactly n of those. At most 2n iterations in total. On a shuffled million-element input the lesson measured just under a million swaps and just under two million iterations.

## The swap you must not write on one line

This is where the pattern costs rounds. The tempting line in Python is a tuple swap with the home index written inline: swap nums at i with nums at "nums at i, minus one".

It is wrong. Python evaluates the right-hand side first, then assigns the targets left to right, computing each target's index only when it gets there. So nums at i is overwritten first, and the second target's index is then computed from the new value. On the array 3, 1, 2, that single line produces 2, 3, 2. The value 1 is destroyed, 2 is duplicated, and the loop then alternates between two broken states forever. JavaScript's destructuring swap produced the identical result in Node.

The fix is simple and worth saying out loud in an interview: compute the home index on its own line first, then swap. Reversing the targets also happens to work, but it is correct by accident of ordering, and the next person will tidy it back.

One more trap: a missing range check. In Python, minus 1's "home" is index minus 2, which wraps to a real slot, so 1 and minus 1 can trade places forever. Test that the value is between 1 and n before you compute its home.

## When a different tool wins

Missing Number: n distinct values from 0 to n, one absent. Cyclic sort solves it, but with one unknown and distinct values, arithmetic is the better answer and a senior offers it first. XOR every index from 0 to n with every value. Each present number appears twice and cancels; the missing one survives. For the array 3, 0, 1, everything cancels except 2.

Why not the sum formula, n times n plus 1 over 2, minus the sum? In 32-bit arithmetic the product overflows from n of 46,341, and the division after a wrapped multiplication gives the wrong answer, for 58 percent of the values of n the lesson tested between there and 200 thousand. Right on the rest by coincidence, which is the worst kind of bug to test for. XOR has no carries, so it cannot overflow in any language.

And it is faster. In Node, finding one missing number in a million values, the XOR pass took a third of a millisecond and cyclic sort about 13 milliseconds, roughly 40 times slower. Both are linear. The difference is the memory access pattern: XOR reads the array front to back, which the prefetcher loves, while every swap jumps to an unpredictable index.

So cyclic sort earns its place when there are several unknowns: find all the missing numbers, or there are duplicates mixed with gaps, where one equation no longer pins down the answer.

Find the Duplicate Number is the other famous member, and it forbids modifying the array, which rules cyclic sort out. Read the array as a function from each index to the value stored there. There are n plus 1 indices and every value is between 1 and n, so nothing points to index 0, and the path starting at 0 must eventually loop. The node where the loop begins has two arrows pointing into it, meaning two indices hold the same value: the duplicate. Floyd's tortoise and hare finds that entry point in linear time and constant space.

## Routing the problem

Before placing anything, ask "may I modify the input?" in the first minute. The answer changes the algorithm, and asking it is itself a signal the interviewer listens for.

If mutation is not allowed: one missing value is XOR. One duplicate is Floyd. Two missing values is still arithmetic: XOR everything to get the XOR of the two, pick any set bit, split every value by that bit, and XOR each half separately, so each half keeps exactly one missing value. Or use the sum and the sum of squares, two equations in two unknowns.

If mutation is allowed: one unknown is still XOR, because it is shorter, faster, and leaves the input alone. Several unknowns is cyclic sort.

And at scale, production code rarely mutates the batch. Gap detection over sequence numbers keeps a bitset instead: a million IDs is 125 kilobytes as bits, against 33 and a half megabytes for a CPython set.

## In the interview

A follow-up the lesson expects: now values go up to a billion, with n of a hundred thousand. What changes for First Missing Positive?

[pause]

Nothing. The answer is still between 1 and n plus 1, so every value above n is already treated as a placeholder, and the range check leaves it where it is. For general missing or duplicate problems over an unbounded range you would switch to a hash set or a sort, but not for this one. The common wrong answer is "cyclic sort no longer works".

And another: now the array is read-only. For one missing value, XOR or an incremental sum. For one duplicate, Floyd. For all missing values or First Missing Positive, the honest answer is n bits, a bitset of about 12 and a half kilobytes for a hundred thousand values, and saying "bits, not integers" is the senior detail. The wrong answer is copying the array, sorting the copy, and still claiming constant space.

## Recap

Four things to remember. The constraint line, values between 1 and n, is the signal: it lets the array be its own presence table. The loop is linear because each swap places a value for good, so at most n swaps plus n advances. Compute the home index on its own line, and guard on "the home already holds v", or you destroy values and loop forever. And pick the simplest tool for the constraints: XOR for one missing value, Floyd when you may not mutate, cyclic sort when there are many unknowns and mutation is allowed.

At your desk: the template, the one-line swap trace, the four worked traces, the measured costs, and the two exercises on all missing numbers and the corrupted pair.

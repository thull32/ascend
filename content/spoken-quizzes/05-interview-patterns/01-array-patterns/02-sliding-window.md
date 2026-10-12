---
lesson: sliding-window
source: 0f389e3681f33f39
---
## 1

You must take exactly k cards from the two ends of a row, some from the left and some from the right, to maximise their total. Which window solves it in linear time?

A, a variable window that grows while its sum stays below the best total seen. B, none; choosing between the two ends needs dynamic programming over how many cards come from each side. C, a window of width n minus k, minimising the sum of the cards left behind. D, a window of width k over the row, maximising the sum of the cards inside it.

[think]

The answer is C: a window of width n minus k, minimising what is left behind.

Whatever split you choose, the cards you do not take form one contiguous block of width n minus k. So the best take is the total minus the lightest such block. A width-k window describes contiguous cards, but the taken cards wrap around the two ends. The dynamic programming approach is correct, just slower and unnecessary, and there is no monotone condition for a variable window to shrink on.

## 2

For Longest Substring Without Repeating Characters, the last-index version jumps left to one past the last position of the current character whenever that character has been seen before, with no max guard. What does it return for the string a, b, b, a?

A, 2, because the second b already pushed left past index 0. B, 3, because left moves back to 1 when the second a arrives. C, 4, because the jump version never shrinks the window at all. D, 2, because the stale index for a is overwritten before it is read.

[think]

The answer is B: 3, because left moves back to 1 when the second a arrives.

At the second a, the stored position of a is still 0, which lies before the current left of 2. Without the guard, left becomes 1, and the window b, b, a is recorded with length 3. The guard, taking the larger of left and the jump target, keeps left moving only forward, which is what the pattern depends on. Index 0 is not overwritten until after it is read.

## 3

A service keeps a rolling sum of the last 60 latencies, each about 0.1 to 0.5, as a float, adding each new sample and subtracting the oldest. After one corrupt sample of 10 to the 16 passes through, the sum stays about 2 too high. What is the cause, and the fix?

A, subtracting the spike overflowed the double's exponent; clamp huge samples on the way in. B, the spike was evicted one slide late by an off-by-one; recheck the eviction index. C, Python floats are 32-bit and lose digits; switch to a 64-bit float. D, values added beside the spike were rounded to its precision; recompute the sum every k slides.

[think]

The answer is D: values added beside the spike were rounded, so recompute the sum every k slides.

Near 10 to the 16, the gap between adjacent doubles is 2, so each small sample added while the spike was present was rounded, and that error remains after the spike is subtracted. Recomputing from the buffer every k slides costs amortised constant time, and integer units avoid the problem entirely. Nothing overflows, the eviction index is fine, and Python floats are already 64-bit.

## 4

A JavaScript solution to Longest Substring Without Repeating Characters returns 3 for a string of two different emoji, where Python returns 2. Why?

A, JavaScript indexes UTF-16 code units, and both emoji share the same high surrogate. B, V8 normalises emoji to a decomposed form, which splits each into several code points. C, Map keys compare by reference, so two equal halves count as distinct. D, Python indexes UTF-8 bytes, which hides one of the repeated byte values.

[think]

The answer is A: JavaScript indexes UTF-16 code units, and both emoji share a high surrogate.

Each emoji is two UTF-16 code units, and both start with the same high surrogate, so the window over units finds three distinct units in a row. Python strings index code points, so the answer is 2. Iterating with a for-of loop, or spreading the string, fixes the JavaScript version. A Map compares string keys by value.

## 5

Follow-up: the input to your at-most-k-distinct window is an unbounded event stream that cannot be replayed. What memory does the variable window need?

A, constant, since the loop reads only the left and right positions. B, linear, for a prefix array, since the stream must be replayed. C, the window's events plus the counts, which can grow linear in the stream. D, order k for the count map, since eviction only needs the counts.

[think]

The answer is C: the window's events plus the counts, which can grow linear.

To evict, you must know which element is leaving, so the window's elements must be stored, and a long valid window can hold most of the stream. The count map alone cannot tell you what the element at left was. Bounding the window by time or count caps the memory, but changes the question, and a senior says so explicitly.

## 6

Find the longest subarray whose sum is exactly k, when every value is positive, with constant extra space. What works, and why?

A, a window that shrinks only when the sum equals k, and records each time. B, a window that keeps the sum at most k, and records only when the sum equals k. C, at-most k minus at-most k minus 1, since exact targets always need two passes. D, prefix sums with a first-index map, since exact sums rule out a window.

[think]

The answer is B: a window for sum at most k that records only when the sum equals k.

With positive values, the sums of windows ending at the right edge strictly fall as left advances, so at most one start can hit k, and it can only be the smallest start whose sum is at most k, which the window finds. The prefix-sum map also works, but uses linear space. The at-most subtraction counts subarrays rather than finding the longest, and shrinking only on equality never repairs an oversized window.

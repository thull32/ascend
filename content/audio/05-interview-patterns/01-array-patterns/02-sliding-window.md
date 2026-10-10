---
lesson: sliding-window
source: c47b7bbaef48d2c4
fit: partial
desk:
  - "The four-decisions table for seven classic problems"
  - "The longest, shortest and fixed-width templates, in Python and JavaScript"
  - "Full traces: Longest Substring Without Repeats, the abba jump trap, Longest Repeating Replacement, Permutation in String and Minimum Window Substring"
  - "The hidden-window and near-miss tables, and the variants table"
  - "The state-container benchmark, UTF-16 surrogates and the float-drift table"
  - "Exercises: longest subarray with sum at most a limit, and take k cards from the ends"
---
## Introduction

The statement says "longest substring such that", or "smallest subarray with", or "does any window of size k satisfy". Checking every start and end is order n squared at best. At 100 thousand elements that is 5 billion steps, minutes in CPython. The window version of Longest Substring Without Repeating Characters handles a million characters in 83 milliseconds in CPython, and in 3 milliseconds in Node with a typed array.

The window works because extending a segment by one element leaves almost everything you knew about it still true. You keep one window, move each edge forward only, and update a summary of its contents as one element enters and another leaves. Every element enters once and leaves at most once, so the pass is linear however the edges move.

So the pattern is not "two indices". It is a summary of the segment between them that updates in constant time per element, plus a reason the left edge never has to move back.

Recognising "substring" is the easy part. Candidates lose this round in four decisions that come after it. Three ideas, then: how to tell a real window from a lookalike, the four decisions to say out loud before you type, and the traps that hide in the record line and the left edge.

## The signal

A statement selects a window when three things hold. The answer is a contiguous segment: subarray, substring, consecutive, a period of days. Subsequences, subsets and pairs are out. It asks for an extreme or a count: longest, shortest, the best window of size k, or how many segments qualify. And validity is monotone in the window.

That third test is two questions, and they are worth memorising. If I drop an element from an end of a valid window, is it still valid? A yes means the longest shape, or a count. If I add an element to a valid window, is it still valid? A yes means the shortest shape. Two noes mean it is not a window problem, however much the wording says "subarray".

Fixed width is the special case where the statement hands you the width: every window of size k, or k consecutive days.

The most valuable recognitions are the windows the statement never names. "Take exactly k cards from either end of a row, and maximise the total." The cards you leave behind are always a contiguous middle block, so you minimise its sum with a fixed window. "Flip at most k zeros to get the longest run of ones." That is the longest window holding at most k zeros. You never flip anything.

And the near-misses. "Count subarrays with sum exactly k", with negative values: dropping a negative raises the sum, so both questions say no, and it is prefix sums with a hash map. "Maximum-sum subarray" has no predicate to shrink on, so it is Kadane. "Maximum of every window of size k" is a window, but max has no inverse, so the state is a monotonic deque. And "exactly k distinct values" survives neither dropping nor adding; you compute at most k, minus at most k minus 1.

## Four decisions before you type

Say these four out loud before writing a line. They are the plan the interviewer is listening for.

First, the shape: longest, shortest or fixed. Second, the state. For a small fixed alphabet, an array indexed by character code. For arbitrary keys, a hash map, and you delete keys whose count reaches zero, so the map's size is the distinct count. For a maximum or minimum, a deque. For a median, two heaps.

Third, a validity test that runs in constant time. This is where the linear-time claim lives or dies. If checking validity scans the state, the pass is n times the alphabet size, and the interviewer can refute your claim.

Fourth, which line records the answer. Longest and count record after the shrink, when the window is valid and as long as it can be. Shortest records inside the shrink loop, before each eviction, because the eviction may make the window invalid. Fixed records once the window has reached full width.

The skeleton never changes: admit on the right, repair on the left, record. Only the state lines differ.

The invariant for the longest shape is the sentence to say: after the shrink, the window is the longest valid window ending at the right edge, because the shrink stops at the first valid start and every earlier start was invalid.

Complexity is a short argument. The left and right edges each only move forward, and each moves at most n times. So the two loops together run at most 2n times, times the cost of one admit, one evict and one validity test. With a count array or a counter, that is constant, and the pass is linear. With heaps for a median, it is n log k.

## The left edge must never move back

Longest Substring Without Repeating Characters has a faster variant that stores the last index of each character and jumps the left edge past the previous copy in one step. It has one trap, and interviewers pick the input that springs it.

The input is the four letters a, b, b, a. At the second b, the left edge jumps to index 2. Now the final a arrives. Its last index is 0. What happens if you jump the left edge to one past that?

[pause]

The left edge moves backwards, to 1, and the window b, b, a is reported as having no repeats, with length 3. The right answer is 2. The stale index for a points outside the window. The fix is to take the larger of the current left edge and one past the last index, which keeps the left edge monotone. That property is what the whole pattern rests on.

Longest Repeating Character Replacement has a stranger move. The window is valid when its length minus the count of its most frequent character is at most k, because the other characters are the ones you repaint. The lesson's code never decreases that maximum count, even when the window shrinks. That is safe, because the best answer can only grow when a genuinely new maximum appears. If you cannot reproduce that proof under pressure, recompute the true maximum over the 26 counts on each shrink, and say 26 is a constant. Nobody fails you for it.

## Record before you evict

Minimum Window Substring is the shortest shape: the smallest piece of s containing every character of t. The state is a need map plus one integer, missing, which only changes when a count crosses zero from the positive side. The window is valid when missing is zero.

Take the lesson's example. The text is B, A, X, C, B, A, and you need A, B and C. The window first becomes valid at C, holding B, A, X, C. Record it, drop the B, and it is invalid again. Moving on, at the final A the window is X, C, B, A. Valid. Record, drop the X, and it is still valid: C, B, A. Record again, and that is the answer, three letters.

Two bugs live here. If the shrink is an "if" instead of a "while", you stop after dropping the X and return the four-letter window. And if you record after the eviction instead of before it, you record B, A, which is not valid at all.

Permutation in String is the fixed shape, with one neat trick. Keep counts for the pattern and the window, and a matches counter: how many of the 26 letters currently have equal counts. Each admit or evict changes one count by one, so matches changes by at most one, and "is this window an anagram" becomes "is matches 26", in constant time instead of a 26-entry comparison.

## Under the hood and in production

Which container holds the counts matters more in one runtime than the other. In CPython almost all the cost is interpreter dispatch, so an array barely beats a dict, and Counter is actually slower than a plain dict. In Node the picture flips: a typed array indexed by character code was twelve times faster than a Map. So in JavaScript, on a known alphabet, the typed array is the idiomatic choice. In Python, write whichever you can type without bugs.

JavaScript strings index UTF-16 code units, and every emoji takes two of them. In the lesson's example, two different emoji start with the same first half, so the count-map solution returns 3 on that two-emoji string, splitting a character in half. Iterate code points instead. Python does not have this problem; its strings index code points.

And floating-point windows drift. Adding the new value and subtracting the old one is exact for integers and not for floats. While one huge value sits in the window, every small value added beside it is rounded to the huge value's precision, and that error stays behind after it leaves. In the lesson's measurement, one corrupt sample of 10 to the 16 left a 60-sample rolling sum about 2 too high, for as long as the process lived. Keep integers, such as cents or microseconds, or recompute the sum from scratch every k slides.

Two more production failures. A per-user window map that decrements counts to zero but never deletes the keys grows without bound. And a sum-based window that is correct on the sample and wrong on hidden tests, with no exception, usually means the array has negatives.

## In the interview

Here is a follow-up the lesson expects. Now values can be negative.

[pause]

Run the two questions again. Anything whose predicate ignores sign, such as at most k distinct or at most k zeros, survives unchanged. Sum-based windows lose monotonicity: exact sums move to prefix sums with a hash map, and "shortest with sum at least k" moves to a monotonic deque over prefix sums. The common wrong answer is "negatives break sliding windows" as a blanket rule, which throws away the windows that still work.

And another: now the input is a stream you cannot replay. A fixed window needs a ring buffer of exactly k elements, because you must know what leaves. A variable window must hold its current elements, which can be most of the stream. The wrong answer is "only the count map", forgetting that eviction needs to know which element is leaving.

## Recap

Four things to remember. A window needs a contiguous answer, an extreme or a count, and monotone validity: ask whether dropping an end keeps it valid, and whether adding one does. Make the four decisions out loud: shape, state, a constant-time validity test, and the record line. Longest records after the shrink; shortest records before each eviction, inside a while loop. And keep the left edge monotone, including in the last-index jump, where a, b, b, a is the input that breaks it.

At your desk: the four-decisions table, the three templates, the five traces, the near-miss tables, the benchmarks and drift table, and the two exercises.

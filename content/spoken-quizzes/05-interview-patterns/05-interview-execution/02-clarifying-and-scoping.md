---
lesson: clarifying-and-scoping
source: c2c4b06403cddf54
---
## 1

You have a plan that sorts and uses a heap for Meeting Rooms Two. Which answer to a clarifying question lets you drop the sort and solve it in linear time?

A, the times are whole minutes within one day. B, no two meetings share a start time. C, back-to-back meetings may share a room. D, the meetings arrive already sorted by start.

[think]

The answer is A: the times are whole minutes within one day.

A bounded integer range lets you index by time: add one at each start and subtract one at each end across 1,441 slots, then take a running sum whose peak is the answer, in n plus 1,440 steps. Sorted starts remove one sort, but the heap of end times still costs a logarithmic step per meeting. Distinct starts and the back-to-back rule change a comparison, not the complexity class.

## 2

Measured on a fast desktop, a CPython pair comparison in a nested loop costs about 14 nanoseconds. Roughly how long does a quadratic pair loop take at n of 100 thousand?

A, about 70 seconds, so the quadratic plan is out. B, about 7 seconds, which is borderline but passes. C, about a tenth of a second, so the quadratic plan is fine. D, about 3 hours, since Python is interpreted.

[think]

The answer is A: about 70 seconds, so the quadratic plan is out.

Half of n squared is 5 billion pairs, and at 14 nanoseconds each that is 70 seconds, before allowing for slower laptops or judges. At n of 2,000 the same loop measured 28 milliseconds, which is why the answer about input size, turned into a time budget, decides whether the brute force is acceptable.

## 3

A JavaScript solution for longest substring without repeating characters uses the string's length property and indexes it character by position. Which answer to a clarifying question breaks it?

A, the input may contain emoji. B, the input may repeat one letter only. C, the input may be the empty string. D, the input may contain uppercase letters.

[think]

The answer is A: the input may contain emoji.

JavaScript strings are UTF-16, and an emoji outside the Basic Multilingual Plane is two code units, so the length counts it as 2 and indexing returns half a surrogate pair. Iterating with a for-of loop, or Array from, works on code points. Uppercase, empty and single-letter inputs need no change of representation.

## 4

The interviewer changes Meeting Rooms Two so that times are Unix timestamps in seconds, over a year. What should happen to the difference-array solution?

A, replace it with a heap of start times per room. B, keep it, but store the array as a Python dictionary. C, replace it with a sweep over the sorted endpoints. D, keep it, since it remains linear for any input.

[think]

The answer is C: replace it with a sweep over the sorted endpoints.

The array has one slot per time unit, about 32 million here: 252 megabytes as a Python list, and 1.4 seconds to scan on a fast desktop, so the term for the time range now dominates. Sorting the 2 n endpoints and sweeping costs n log n, independent of the range. A dictionary keyed only by endpoints can work, but must still be walked in time order, which is the sort again.

## 5

You ask how ties at k-th place should be broken, and the interviewer says, your call. What is the strongest response?

A, return every tied item, to satisfy any rule. B, ask the same question again in other words. C, ignore ties, since real inputs rarely have them. D, pick a rule, give a reason, and say what would change.

[think]

The answer is D: pick a rule, give a reason, and say what would change.

Your call tests whether you can make and own a reasonable decision. Choose a rule such as user id ascending, for deterministic and testable output, write it in the assumption ledger, and say the key changes if the product wants another rule. Asking again signals you need to be told, ignoring ties makes the output nondeterministic, and returning extra items changes the function's contract.

## 6

In a debrief, which fact most strengthens a candidate's problem-understanding rating?

A, the candidate asked more than ten clarifying questions. B, the material constraints were asked for, not volunteered by the interviewer. C, the candidate avoided asking and inferred every constraint. D, the candidate wrote the distributed design before coding.

[think]

The answer is B: the material constraints were asked for, not volunteered.

Interviewers commonly hold one material constraint in reserve and note whether the candidate asked for it or had to be told. Discovered constraints, an example confirmed early, and assumptions that absorb the follow-up are the evidence. Question count is not: four material questions outrank twelve, and silent inference leaves nothing in the notes.

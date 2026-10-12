---
lesson: greedy-pattern
source: 810a1c078683faa3
---
## 1

Jump Game Two, on the array 2, 3, 1, 1, 4. A candidate always jumps as far as possible from the current index. How many jumps does that take, and what is optimal?

A, 2 jumps, which is also the optimum here. B, 4 jumps, while 3 are optimal via index 2. C, 3 jumps, while 2 are optimal via index 1. D, 3 jumps, which is also the optimum here.

[think]

The answer is C: 3 jumps, while 2 are optimal via index 1.

Jumping as far as possible goes from index 0 to 2, then 3, then 4, because from index 2 the reach is only 3. Index 1 reaches the end in one more jump, so 2 jumps suffice. The level-based rule compares the furthest reach over every index of the current level, which is why it finds index 1.

## 2

In Gas Station, starting at station s, the tank goes negative leaving station i. Why can every station from s to i be skipped as a start?

A, they cannot be skipped; each one must still be tried. B, any later start reaches i with no more fuel than s did. C, because the problem guarantees the answer is unique. D, because they all come before station i in the array.

[think]

The answer is B: any later start reaches i with no more fuel than s did.

The tank was non-negative at every station between s and i, otherwise the scan would have reset earlier, so the stretch from s to any later station t contributed a non-negative surplus. Starting at t gives that surplus up, so you reach i with at most the same fuel, and still fail. That makes the scan linear.

## 3

Three meetings must share one room: one from 1 to 5, one from 4 to 7, and one from 6 to 10, each ending just before its end time. Which rule picks the most meetings, and what does shortest meeting first return?

A, shortest first is optimal, and returns 2 meetings. B, earliest finish first, and shortest first returns 1. C, latest start first, and shortest first returns 3. D, earliest start first, and shortest first returns 2.

[think]

The answer is B: earliest finish first, and shortest first returns 1.

The shortest meeting, 4 to 7, overlaps both others, so shortest first keeps one meeting. Earliest finish takes 1 to 5, then 6 to 10, for 2. The exchange argument proves it optimal: swapping any optimum's first meeting for the earliest-ending one keeps the rest compatible.

## 4

Earliest finish first is optimal for the number of meetings in one room. Why does it fail when each meeting has a value, and you want the largest total value?

A, it still works, as long as ties go to the higher value. B, the exchange keeps the schedule feasible, but can lose value. C, values make the problem NP-hard, so nothing is exact. D, the sort by end time becomes unstable once values tie.

[think]

The answer is B: the exchange keeps feasibility but can lose value.

The exchange argument swaps an optimum's meeting for one that ends no later. That preserves feasibility and the count, but the swapped-in meeting may be worth less: one from 0 to 2 worth 1, replacing one from 0 to 4 worth 5. Weighted scheduling is solved exactly by DP over meetings sorted by end, with binary search for the last compatible one, in n log n time.

## 5

A JavaScript interval solution sorts with a comparator that returns whether a's end is greater than b's end, a boolean. What happens?

A, it sorts correctly, since true and false act as 1 and 0. B, false reads as equal, so the order is left arbitrary. C, it throws a TypeError, as comparators must return numbers. D, it sorts in descending order of end instead of ascending.

[think]

The answer is B: false reads as equal, so the order is arbitrary.

The comparator's result is converted to a number, so false becomes 0, which tells the sort the two elements are equal, and it never learns when a should come first. In Node 24, sorting 3, 1, 2 with that kind of comparator came back unchanged. Return a's end minus b's end instead.

## 6

The maximum subarray sum is wanted over an array split across 100 machines. What is the correct way to combine the machines' work?

A, run Kadane on each machine, then take the largest result. B, sort every chunk, then run Kadane on the merged output. C, have each machine send four numbers, its total, best prefix, best suffix and best subarray, and merge those summaries. D, send every element to one machine and run Kadane there.

[think]

The answer is C: merge the four-number summaries.

The best subarray may cross a chunk boundary, so the largest per-chunk answer misses it. Each chunk's summary combines with its neighbour's: the best of the two is the larger of each side's best and the left suffix plus the right prefix. Merging in a tree gives the exact answer with a constant amount of data per chunk. Sorting destroys contiguity.

---
lesson: binary-search
source: 584b3fc5edfd67b0
fit: partial
desk:
  - "The half-open template and the two traces, for a present and an absent target"
  - "The off-by-one taxonomy table"
  - "The first-true code, the lower-bound trace and the predicate table"
  - "The rotated-array code and trace, and the fixed-iteration square root"
  - "Exercises: lower bound, and search in a rotated sorted array"
---
## Introduction

Jon Bentley gave professional programmers a couple of hours to write binary search from a description. About 90 percent found bugs in their own code. The algorithm is twelve lines, and the bugs live in the three places where an index is one too big or one too small.

Most engineers know binary search the way they know a phone number: by recall, and recall fails under pressure. The fix is to derive it from an invariant every time, so the boundaries are forced rather than remembered.

So: one template, and why each line of it is forced. Then the general form, first true, which turns first occurrence, last occurrence, insertion point and first bad version into the same code. Then rotated arrays, real numbers, and what a probe really costs.

## The invariant

Binary search keeps a range that is guaranteed to hold the answer, and halves it on every step by looking at the middle. After k probes, at most n over 2 to the k candidates remain. For a thousand elements, that is 10 probes. For a million, 20. For a billion, 30. That is the whole reason it exists.

Here is the discipline. Use a half-open range: lo is inclusive, hi is exclusive. The invariant: the answer, if present, lies at an index from lo up to but not including hi, and everything outside has been ruled out.

Now every line is forced. hi starts at n, not n minus 1, because it is exclusive. The loop runs while lo is less than hi, because when they are equal the range is empty. If the middle element is too small, everything up to and including mid is ruled out, so lo becomes mid plus 1. If it is too big, everything from mid upwards is ruled out, and because hi is exclusive, hi becomes mid. Not mid minus 1.

A tiny example. Search for 12 in 1, 3, 4, 7, 9, 12, 15, 20. The first probe lands on 9, too small, so the left half goes. The next lands on 15, too big. The next lands on 12. Three probes for eight elements.

And termination: mid is always at least lo and strictly less than hi. So setting hi to mid strictly shrinks the range, and so does setting lo to mid plus 1. A shrinking non-negative count must reach zero. There is no input that loops forever.

One more line that matters. Compute mid as lo plus half of hi minus lo, not as lo plus hi, halved. With fixed-width integers, lo plus hi overflows once the array passes about a billion elements. That bug sat in Java's library binary search for about nine years, and it is in the version Bentley proved correct too. Python does not overflow. Write the safe form anyway, because the interviewer will ask.

## The four bugs

Every binary-search bug is one of four, and it helps to name them.

One: an out-of-range read, because hi is exclusive but the loop runs while lo is less than or equal to hi. Two: an infinite loop, from setting lo to mid when mid can equal lo. On a range of two elements, mid rounds down to lo, and the range never shrinks. Three: a missed element at the boundary, from setting an exclusive hi to mid minus 1, which skips an index nobody examined. Four: a wrong answer when the target is absent, from returning mid after the loop instead of lo.

The closed-range version works too, if you use it consistently. The point is to pick one convention and derive from it. Python's bisect, C plus plus lower bound and Rust's partition point all use half-open ranges.

## First true

Stopping when you find the target is the least useful variant, because it returns some matching index. Interviews want the first occurrence, the last, the insertion point, or the first bad version. All of these are the same question. Through a predicate, the array looks like false, false, false, then true, true, true, and you want the first true.

The code changes in one place. When the predicate is true at mid, you do not stop. Mid might be the answer, so you keep it in range by setting hi to mid. When it is false, lo becomes mid plus 1. The invariant: the predicate is false everywhere below lo, and true everywhere at or above hi. When the loop ends, lo equals hi, and that is the first true, or n if there is none.

Now the variants are one-liners. First occurrence of a value: the first index where the element is at least that value. Insertion point: the same search. Last occurrence: the first index where the element is strictly greater, minus one. Count: the difference between those two searches.

Quick check. In the array 1, 2, 2, 2, 3, where is the first index with an element greater than or equal to 2, and where is the first index with an element strictly greater than 2?

[pause]

Index 1 and index 4. So there are three 2s, at indices 1 to 3. In Python, those are bisect left and bisect right. And for a value larger than everything, both return the length of the array, never minus 1.

Two warnings about bisect. Bisect never checks that the list is sorted. Search a list sorted case-sensitively with a case-insensitive key, or with a NaN in it, and it returns garbage, silently. And inserting into a sorted list with insort shifts every later element, so building a sorted list that way is quadratic.

## Rotated arrays and real numbers

Take 4, 5, 6, 7, 0, 1, 2: a sorted array, rotated. It is not monotone, so it looks like binary search should break. The saving fact: at least one half of any range is sorted, because the rotation point can be in at most one of them. Compare the middle element with the first to learn which half is sorted. If the target lies inside that sorted half's range of values, search it. Otherwise, search the other half.

Two traps. The comparison must be "less than or equal", or the single-element range goes to the wrong branch. And with duplicates, as in 1, 1, 1, 0, 1, the first and middle elements can be equal, and you cannot tell which half is sorted. The honest move is to shrink the range by one and retry, and the worst case becomes linear. Say that if asked.

Binary search does not even need an array. It needs a monotone predicate and a range. The square root of x is the largest r whose square is at most x. But over doubles, do not loop "while hi minus lo is bigger than some epsilon". Near 10 to the 16, adjacent doubles are 2 apart. The midpoint equals lo or hi, the interval stops shrinking, and the loop never ends. Run a fixed number of iterations instead. A hundred halvings is far beyond double precision, and it always terminates.

The same pattern works on anything indexable and monotone. A matrix whose rows run on from each other is a sorted array in disguise. A time-versioned store answers "the value at time t" with "the last entry at or before t". An expensive call like "is this version bad?", where the problem says "minimise API calls". And a sorted sequence of unknown length: probe 1, 2, 4, 8, until you pass the target, then binary search the last interval. That is exponential search, the same galloping Timsort uses.

## What a probe costs

Thirty probes for a billion elements sounds instant. It is not. A billion 8-byte integers is 8 gigabytes. On a cold lookup, roughly the first 20 probes miss every cache level, at about 100 nanoseconds each. The lookup costs a few microseconds, and the arithmetic is under 30 nanoseconds. Only the last 3 probes share a cache line.

Real systems respond in two ways. The Eytzinger layout stores the array in breadth-first heap order, so the next probes sit together in memory and can be prefetched. And databases use B-tree nodes with high fan-out for the same reason. The comparison at each probe is unpredictable by construction, so fast versions also make the update branchless.

## In the interview

A follow-up the lesson expects. Find a peak element, one larger than both its neighbours, in log n time. The array is not sorted.

[pause]

Compare the middle element with the one to its right. If the slope goes up, a peak exists to the right. Otherwise, there is one at mid or to its left. The predicate is not globally monotone, but the argument that each half you keep contains a peak is all binary search needs. The wrong answer is "it is not sorted, so binary search does not apply."

And one from the failure modes: git bisect blames a commit that cannot be the cause. Why? The predicate is not monotone. The test is flaky, or the bug was introduced, fixed and reintroduced, so the history goes false, true, false, true, and binary search assumes a single boundary. Make the predicate deterministic, and when the history really is not monotone, a linear scan of the suspicious range is the only correct tool.

## Recap

Four things to remember. Derive binary search from a half-open invariant: lo moves to mid plus 1, hi moves to mid, and the loop always terminates. Never assign mid back to the side it came from, and compute mid without overflow. First true is the general form: first occurrence, insertion point, last occurrence and count are all predicates over it. And check monotonicity before you trust the answer, whether the data is rotated with duplicates, unsorted for bisect, or a flaky test history.

At your desk: the template and its two traces, the off-by-one table, the first-true code and predicate table, the rotated-array trace, and the two exercises, lower bound and rotated-array search.

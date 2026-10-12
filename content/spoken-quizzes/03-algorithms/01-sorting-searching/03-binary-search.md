---
lesson: binary-search
source: dcfd6d851b88c62d
---
## 1

In the half-open binary search template, lo starts at 0, hi starts at n, and the loop runs while lo is below hi. When the middle element is greater than the target, it sets hi to mid. A colleague changes that to hi equals mid minus 1. What happens?

A, index mid minus 1 is never examined, and can be missed. B, it can compute a negative mid and go out of bounds. C, it can loop forever when the range has two elements. D, nothing, since mid itself was already ruled out.

[think]

The answer is A: index mid minus 1 is never examined, and can be missed.

Hi is exclusive, so setting it to mid already excludes mid. Setting it to mid minus 1 also excludes the index just below, which nobody has looked at, so a target sitting there is missed. The range still shrinks, so it terminates, and the loop exits before mid could go negative. Mixing the closed and half-open conventions is the classic off-by-one.

## 2

All four of these binary search loops round mid down. Which one can run forever on some inputs?

A, lo becomes mid plus 1 or hi becomes mid, looping while lo is below hi. B, a fixed 100-iteration loop over doubles, where lo or hi becomes mid. C, lo becomes mid or hi becomes mid minus 1, looping while lo is at most hi. D, lo becomes mid plus 1 or hi becomes mid minus 1, looping while lo is at most hi.

[think]

The answer is C: lo becomes mid, or hi becomes mid minus 1, while lo is at most hi.

With mid rounded down and a range of two elements, mid equals lo, so setting lo to mid does not shrink the range and the loop spins. The half-open and closed templates always move lo past mid, and the fixed loop ends after 100 steps whatever it assigns. The rule: never assign mid back to the side it was computed from without adjusting by one.

## 3

You need the number of times the value 7 appears in a sorted array of 10 million integers. What is the cleanest log n approach?

A, a linear scan, stopping at the first value above 7. B, a hash map of value counts, then one lookup. C, binary search for any 7, then scan outward from it. D, the first index whose value is above 7, minus the first index whose value is at least 7.

[think]

The answer is D: the first index above 7, minus the first index at or above 7.

Two boundary searches give the half-open range of 7s in log n time. Scanning outward from one hit costs as much as the count, which is linear when the array is mostly 7s. A hash map costs linear time to build, and a linear scan is linear even with an early exit.

## 4

When you binary search over doubles, why is a fixed number of iterations preferred over looping while hi minus lo is bigger than 10 to the minus 9?

A, epsilon tests lose accuracy as the interval shrinks. B, subtracting lo from hi can overflow for large doubles. C, it is faster, because it skips a comparison per step. D, doubles near large values are spaced wider than 10 to the minus 9.

[think]

The answer is D: doubles near large values are spaced wider than 10 to the minus 9.

At large magnitudes, the gap between neighbouring doubles is bigger than a tiny epsilon, so the midpoint equals lo or hi, the range stops shrinking, and the epsilon loop never ends. A hundred halvings always terminate and go beyond double precision anyway. Speed is not the reason, and subtracting doubles does not overflow the way adding integers can.

## 5

You search a rotated sorted array, and duplicates are allowed, as in 1, 1, 1, 0, 1. What does the guaranteed complexity become?

A, linear, because equal endpoints hide which half is sorted. B, log n, since one half is always sorted. C, unbounded, since the loop may never terminate. D, log squared n, from a nested search per probe.

[think]

The answer is A: linear, because equal endpoints hide which half is sorted.

One half is still sorted, but when the first and middle elements are equal you cannot tell which, so the safe move is to shrink the range by one. That always makes progress, so it terminates, but an all-equal array with one odd element forces n such steps.

## 6

The array is 1, 2, 2, 2, 3. What do Python's bisect left and bisect right return for the value 2, and what does bisect right return for the value 4?

A, 1, 3 and 5: the first and last occurrence of 2, and the length when absent. B, 1, 4 and 5: the first index at least 2, the first index above 2, and the length when nothing is greater. C, 2, 2 and minus 1: any matching index twice, and minus 1 when absent. D, 1, 4 and 4: the first index at least 2, the first index above 2, and the last valid index when absent.

[think]

The answer is B: 1, 4 and 5.

Bisect left returns the first index whose element is at least 2, which is 1. Bisect right returns the first index whose element is above 2, which is 4, one past the last 2. For a value larger than everything, both return the length, 5, never minus 1 and never the last valid index. The last occurrence is bisect right minus 1, which is 3.

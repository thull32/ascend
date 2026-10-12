---
problem: subarray-sum-equals-k
args: [[1, -1, 1, 1], 2]
frames: 22
source: 536125cc5437db32
---
@0
We are counting the stretches of 1, minus 1, 1, 1 that add up to 2. There are two: the whole list, and the last two ones. The minus 1 rules out a sliding window, because extending a window can make its sum smaller, so "too big, shrink" stops being a valid decision. The insight is prefix sums. The sum of a stretch is the running total at its end minus the running total just before its start. So a stretch ending here sums to 2 exactly when some earlier running total equals the current one minus 2. A map from running total to how many times we have seen it answers that instantly.

@1-2
The map is seeded with zero, seen once. That is the empty prefix, before any element, and it is what lets a stretch start at the very beginning. The running total and the count start at zero.

@3-7
Element 1. The running total is 1. We look up 1 minus 2, which is minus 1: never seen, so the count stays zero. Only then do we record total 1, seen once. Looking up before inserting is deliberate: it stops a prefix pairing with itself.

@8-11
Element minus 1. The total drops back to zero. We look up minus 2: not there. Then total zero is recorded again, so zero has now been seen twice. Remember that.

@12-15
Element 1. The total is 1. We look up minus 1: still not there. Total 1 is now seen twice.

@16-19
The last element, 1. The total is 2. We look up 2 minus 2, which is zero, and zero has been seen twice. Each sighting is a different starting point. One is the empty prefix, which gives the whole list, 1, minus 1, 1, 1. The other is the total after the minus 1, which gives the last two ones. So the count jumps by two at once.

@20-21
We return 2.

One pass with a constant time lookup per element: linear time, and the map takes linear space. The mistakes are forgetting the seed of zero, which loses every stretch starting at the front; inserting before looking up, which for k equal to zero counts empty stretches; and storing totals in a set instead of counting them, which would have counted only one of the two answers here. And check the signs before reaching for a sliding window just because the problem says subarray.

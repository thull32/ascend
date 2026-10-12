---
lesson: count-min-sketch-and-hyperloglog
source: e6e7b0f7656c1a11
---
## 1

A count-min sketch estimates a key's count as 1,200. Which statement is guaranteed?

A, the true count is at least 1,200. B, the true count is at most 1,200. C, the true count is within 1 percent of 1,200. D, the true count is exactly 1,200.

[think]

The answer is B: the true count is at most 1,200.

Every counter a key touches holds its true count plus any collisions, so every row is at least the truth, and so is their minimum. The sketch never underestimates. It can be exact, but that is not guaranteed.

## 2

You have a count-min sketch 1,000 counters wide, over a stream of 10 billion events. Which key's count can it report usefully?

A, a key with 100 million events. B, none; the stream is too large. C, a key with 50 thousand events. D, a key with just 500 events.

[think]

The answer is A: a key with 100 million events.

The error bound is additive in the total traffic: about twice the stream size over the width, which is 20 million here. Only counts well above that, the heavy hitters, are meaningful; the keys with 500 and 50 thousand events are lost in collision noise.

## 3

In the lesson's traced sketch, the three cells for the key GET slash login hold 11, 23 and 27. One more event arrives, and with conservative update only the cell holding 11 rises, to 12; the cells holding 23 and 27 are untouched. Why is that correct?

A, only one row needs updating, because the minimum row holds the true count. B, conservative update always writes to exactly one row, to keep updates constant time. C, the cells at 23 and 27 belong to other keys, so the sketch must not change them. D, those cells are already above the key's new estimate of 12, so raising them would add only collision noise.

[think]

The answer is D: those cells are already above the new estimate of 12.

The key's estimate is the minimum, 11, so after the increment no cell needs to exceed 12 to keep the guarantee that every cell is at least the true count. Cells already above 12 were inflated by other keys' collisions, and adding to them would inflate every key sharing them. All three are still the key's cells; here, two happen to need no change.

## 4

Two data centres each keep a HyperLogLog of unique users. How do you get the global unique count?

A, add the two estimates together. B, take the larger of the two estimates. C, take the register-wise maximum, and estimate from that. D, they cannot be combined; recount from the raw logs.

[think]

The answer is C: take the register-wise maximum, and estimate from that.

A register holds the longest run of leading zeros among the elements routed to it, so the maximum over both structures is exactly what one structure over the union would hold. Adding the estimates double-counts users seen in both centres, and the larger estimate ignores users seen only in the other.

## 5

Why does HyperLogLog combine its registers with a harmonic mean, rather than an arithmetic mean of 2 to the power of each register?

A, the registers are stored as reciprocals, to save space. B, one register with a freak long run of zeros would dominate. C, the harmonic mean is unbiased, so no correction is needed. D, it is cheaper to compute than an arithmetic mean.

[think]

The answer is B: one register with a freak long run of zeros would dominate.

Each register's estimate is heavy-tailed: one lucky hash gives a huge value that would dominate an arithmetic mean. The harmonic mean is dominated by the small values, so it is robust to that outlier. It is not unbiased, though: it still needs the alpha constant to correct the bias.

## 6

Product wants the number of users who visited both page A and page B this week, from per-page HyperLogLogs. What do you say?

A, compute A plus B minus their union, which is exact for HyperLogLogs. B, the error can dwarf a small intersection; use MinHash. C, raise the register count enough, then subtract as usual. D, merge the two HyperLogLogs, and read the merged count.

[think]

The answer is B: the error can dwarf a small intersection; use MinHash.

Each term carries about 1 percent relative error on possibly large numbers, while the intersection may be tiny, and the absolute errors do not cancel, so the subtraction's error can exceed the answer. Use MinHash or Theta sketches, or count the intersection directly. More registers reduce the problem but do not remove it, and merging gives the union, not the intersection.

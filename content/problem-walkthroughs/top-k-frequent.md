---
problem: top-k-frequent
args: [[1, 1, 1, 2, 2, 3], 2]
frames: 47
source: d29c76c1fa4d1057
---
@0
We want the two most frequent values in 1, 1, 1, 2, 2, 3. That is 1, which appears three times, and 2, which appears twice. Counting and then sorting every count works, but it does more than the question asks: we need the top two, not a full order. The insight is that a frequency is a whole number between 1 and the length of the list. So instead of sorting, drop each value into a bucket numbered by its frequency, then walk the buckets from the top down. No comparison sort anywhere.

@1-13
First, one pass to count. Each 1 bumps its count: one, two, three. Then 2 reaches two, and 3 reaches one.

@14-21
Next, the buckets: seven empty lists, one for every possible frequency from zero up to six, the length of the input, because a single value repeated six times would land in bucket six. Sizing the buckets by the number of distinct values instead is a classic slip.

@22-28
Each value goes into the bucket for its count. 1 goes into bucket three, 2 into bucket two, and 3 into bucket one.

@29-36
Now walk from the highest bucket down. Buckets six, five and four are empty, so nothing happens.

@37-40
Bucket three holds 1. It goes into the output. We have one value, but we need two, so we keep going.

@41-44
Bucket two holds 2. It goes into the output, and now the output has two values, which is k.

@45-46
So we return at once, mid walk, without visiting bucket one: 1 and 2. If a bucket held several values, this early return is what stops us from returning more than k.

Every loop is bounded by the length of the input or by the number of distinct values, so the whole thing is linear in time and space. A min heap of size k is the other good answer, n log k, and it generalises to streams and to scores that are not small integers. Say which one you are building and why: buckets win here because frequencies are bounded integers, which is exactly what removes the logarithm.

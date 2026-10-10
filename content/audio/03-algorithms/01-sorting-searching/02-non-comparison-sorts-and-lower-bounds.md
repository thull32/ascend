---
lesson: non-comparison-sorts-and-lower-bounds
source: d49ea60fb6c0cc29
fit: partial
desk:
  - "The counting sort placement trace and the stable record-sorting code"
  - "The base-10 radix sort trace and the induction on digits, written out"
  - "The decision tree for insertion sort on three elements"
  - "The table of what each language's sort function is"
  - "Exercises: counting sort with a bounded key, and LSD radix sort"
---
## Introduction

You are told that sorting takes n log n time, and in the same breath that counting sort is linear. Both are true. The gap between them is one of the few places in an interview where you can show you understand a proof rather than a fact.

The lower bound applies to algorithms that learn about the input only by comparing elements. Counting sort does not compare. It uses the values as array indices, which is a different and much stronger kind of information.

Three ideas, then. The sorts that exploit structure in the keys: counting, radix and bucket. The decision-tree argument for why nothing comparison-based can beat n log n. And what the sort function in your language actually does with all of this.

## Counting sort

If every key is an integer between zero and some small k, you do not need to compare anything. Count how many times each key occurs. Then turn the counts into starting positions with a running total: the number of elements with a smaller key is exactly the index where the first element with this key belongs. Then walk the input once, put each element at its key's position, and bump that position by one.

That last pass is where stability comes from. It visits elements in input order, so equal keys land in input order. Run the placement pass backwards and it still sorts, but it is no longer stable. That is the classic bug in hand-written versions.

The cost is n plus k: n to count and place, and k for the positions, plus k counters of memory. If k is a million and n is ten, that is a terrible trade. Counting sort wants k to be on the order of n. The failure mode in production: the key range was assumed small, but it is actually the full 32-bit range. At 4 bytes a counter, that is a 16 gigabyte allocation.

In interviews it usually comes disguised: sort the characters of a lowercase string, where k is 26, or sort by frequency, where the frequencies are bounded by n.

## Radix sort

For 32-bit keys, counting sort is hopeless. Radix sort fixes that by counting-sorting on one digit at a time, starting from the least significant digit, and it relies on each pass being stable.

Here is the smallest example that shows why. Sort 21, 12 and 11. First pass, by the ones digit: 21 and 11 both end in 1, and 12 ends in 2, so you get 21, 11, 12. Second pass, by the tens digit: 11 and 12 both have a tens digit of 1, and 21 has a 2. A stable pass keeps 11 before 12, the order the first pass gave them, and you get 11, 12, 21. Sorted.

The invariant, in words: after pass i, the array is sorted by the low i digits. Elements with different digits in the new pass are ordered by that digit. Elements with the same digit keep their order from the previous pass, because the pass is stable, and that order was already right on the lower digits. Break stability, and ties on the current digit lose everything earlier passes did.

The cost is the number of digits times n plus the base. With 32-bit keys and one byte per digit, that is four passes, each two sweeps over the data, about 8 sweeps in all. A comparison sort on a million elements has about 20 levels, each a full sweep. So radix sort genuinely wins on large arrays of fixed-width keys, which is why GPU sorting libraries and some database sort operators use it.

The digit width is an engineering choice. Eight-bit digits scatter into 256 streams, which fits the cache. Sixteen-bit digits need only two passes, but 65 thousand streams, and the cache and TLB misses erase the gain. The best width is measured, not derived.

Why does everyone not use it? It needs keys that break into digits, not arbitrary comparators. It needs a second full copy of the data. And below a few thousand elements, the comparison sort's tight inner loop wins.

## Bucket sort

If the keys are real numbers spread roughly uniformly over a range, drop each into one of n buckets by scaling, insertion-sort each bucket, and concatenate. Each bucket holds about one element on average, so the expected time is linear.

The word doing the work is uniform. Feed it skewed data, timestamps clustered in one hour, say, and one bucket gets nearly everything. Now you are running insertion sort on almost the whole input, and the cost is quadratic. The senior answer includes the sentence: if the data is not uniform, this degrades, so I would check, or fall back. The production fix is sample sort: draw a sample, use its quantiles as bucket boundaries, and every bucket is balanced whatever the distribution. That is what Spark does before a distributed sort.

## The lower bound

Now the proof. Take any algorithm that sorts by comparing. Draw its behaviour as a binary decision tree. Each internal node is a comparison, "is this element less than that one?" The two children are what the algorithm does for yes and for no. Each leaf is a final output order.

Three facts, and the theorem falls out. First, there are n factorial possible input orders, and a correct algorithm must produce a different output for each, so the tree needs at least n factorial leaves. Second, a binary tree of height h has at most 2 to the h leaves. Third, therefore h is at least log base two of n factorial. The height is the number of comparisons on the worst input, and log of n factorial is roughly n log n minus 1.44 n. That is the floor.

Take three elements. There are six orders, so you need at least three comparisons, because two comparisons can only distinguish four outcomes. Now try eight elements. Eight factorial is 40,320. What is the fewest comparisons any sort can promise on eight elements?

[pause]

16. The log of 40,320 is about 15.3, and you cannot do a fraction of a comparison. Merge sort does at most 17. Insertion sort, at worst, does 28. So merge sort is close to the floor.

Two more things the argument gives you. It bounds the average case too, because a binary tree with n factorial leaves has average leaf depth of at least log n factorial. So randomisation does not help: a randomised sort is a mix of deterministic trees, and every one of them obeys the bound. Randomisation avoids the worst input, not the floor.

And it says exactly how counting sort escapes. A comparison learns one bit. Using a value as an index learns log k bits in one step. A richer model of what one step can do. So when an interviewer asks, can you beat n log n? The answer is: not with comparisons. If the keys have bounded structure, yes, and here is how.

## What your sort function is

Nobody ships the textbook versions. Two designs dominate.

Timsort, written by Tim Peters for Python in 2002, is a merge sort that refuses to redo work the input has already done. It scans for runs that are already ascending, or strictly descending, which it reverses. Short runs are extended with insertion sort to a minimum length between 32 and 64. Runs go on a stack, and merges are triggered by invariants on the run lengths that keep the merge tree balanced. Merging copies only the shorter run into a buffer. And there is galloping: once one run has won 7 comparisons in a row, Timsort switches to an exponential search to find how far the streak goes, and copies the whole block at once. The threshold adapts, so random data, where streaks are short, does not pay the overhead.

The payoff: on sorted input, Timsort does n minus 1 comparisons. On two sorted files concatenated, it finds two runs and does one galloping merge, close to linear. "Sorting is n log n" is the wrong mental model for real data, which is very often nearly sorted.

A cautionary tale: in 2015, researchers formally verifying Java's Timsort found that the run-stack invariant was only checked on the top three runs, and a crafted input of about 67 million elements could overflow the stack. A heavily used, thirteen-year-old sort, hiding a bug only a proof found.

The other design is pattern-defeating quicksort, pdqsort, the modern unstable sort. Go uses it, and the newer Rust and C plus plus unstable sorts are built on the same design. It is introsort with additions: it detects already-sorted ranges and finishes them in linear time, it handles runs of equal keys, and when a partition is badly unbalanced it shuffles a few elements to break adversarial patterns. Its inner loop records misplaced elements without branching. A normal partition mispredicts about half its branches on random data, and the branchless version was reported 80 percent faster than the standard C plus plus sort on random integers.

The practical rule: need ties preserved, use the stable sort. Sorting primitives, or you do not care about ties, the unstable one is usually faster, because it does not allocate and its partition can run branchless.

## In the interview

A follow-up the lesson expects. Sort a billion distinct 32-bit integers with one gigabyte of RAM.

[pause]

A bitmap. Two to the 32 bits is 512 megabytes. Set each integer's bit in one pass, then walk the bitmap in order. That is counting sort with a one-bit counter, and it works only because the integers are distinct. With duplicates, an external radix sort on bytes, or an external merge sort. The wrong answer is quicksort, which needs the whole array in memory.

And one more: your keys are strings of up to 100 bytes. Radix or comparison? Most-significant-digit radix on bytes, with insertion sort for small buckets, or its trie-based descendant, burstsort. Both win because a comparison sort re-reads the shared prefixes on every comparison. The trap is least-significant-digit radix "because it is linear": that needs 100 passes and touches every byte of every string.

## Recap

Four things to remember. The n log n bound is a decision-tree argument: n factorial leaves, so height at least log n factorial, and it covers average-case and randomised sorts too. Counting sort escapes it by using values as indices, and only pays when k is on the order of n. Radix sort depends on every pass being stable, and wins on large arrays of fixed-width keys. And bucket sort's linear time is conditional on a uniform distribution, so reach for sampled boundaries when you do not know it.

At your desk: the counting sort and radix sort traces, the decision tree for three elements, the table of what each language's sort is, and the two exercises, counting sort and radix sort.

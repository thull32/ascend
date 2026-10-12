---
lesson: lazy-propagation
source: b0598b2557b41cf0
---
## 1

On the lesson's eight-element tree, you add 10 to positions 2 through 5. Which nodes then hold a non-zero tag?

A, every leaf from 2 to 5, since those are the updated elements. B, every node on the paths from leaves 2 and 5 up to the root. C, only the nodes for 2 to 3, and 4 to 5, which exactly cover the range. D, only the root, which holds the pending add for the whole tree.

[think]

The answer is C: only the nodes for 2 to 3, and 4 to 5.

Fully covered nodes receive the tag, and the update stops there. Their ancestors have their sums corrected by recomputation, but carry no tag, because their other children were not affected. The leaves are untouched, and stale by 10, until something pushes the tag down.

## 2

A lazy segment tree has just had one range update. After a second, overlapping update, the sum over positions 2 to 3 returns 14, while the sum at 2 plus the sum at 3 returns 34. What is the bug?

A, the build computed internal sums from the wrong children. B, a tagged node was descended into without a push first. C, closed and half-open intervals are mixed in the length term. D, tags were composed in the wrong order during the push.

[think]

The answer is B: a tagged node was descended into without a push first.

The second update went through the tagged node without pushing, and recomputed its sum from stale children, discarding the first update. Narrow queries push the surviving tag down to the leaves and come out right; queries that take the node whole read the damaged sum. A length mix-up would already be wrong after the first update, and composition order cannot show with add-only updates.

## 3

Tags are written as a pair, m and a, meaning x becomes m times x, plus a. A node holds the older tag, add 10, and receives the newer tag, assign 4. What must its tag become?

A, 1 and 4, because the newer tag replaces only the add part. B, 0 and 14, because the pending add is kept on top of the assign. C, 1 and 14, because both values fold into a single add. D, 0 and 4, because the assign overwrites whatever came before it.

[think]

The answer is D: 0 and 4, because the assign overwrites whatever came before.

Composing older first gives a multiplier of 1 times 0, and an add of 10 times 0, plus 4: so 0 and 4. After an assign, earlier adds no longer matter. 0 and 14 is what composing backwards produces, resurrecting the older add on top of the newer assign.

## 4

Why does a push compose the child's existing tag first, and the parent's tag second?

A, parent tags always cover more elements than child tags. B, composition is commutative for every tag, so any order works. C, the child's tag must be older, because writing it pushed the parent first. D, child tags are cleared before the parent tag is ever applied.

[think]

The answer is C: the child's tag must be older, because writing it pushed the parent first.

Any operation that set the child's tag walked through the parent and pushed it first, so whatever tag the parent holds now was set later. Composition is commutative for add, but not for assign, which is why the rule matters.

## 5

In the AtCoder library's lazy segment tree, the mapping function receives a tag and a summary, but no interval. How do you implement range add with range sum?

A, store the sum and the size in each summary, and add the tag times the size. B, pass the interval length as part of every tag. C, store only the sum, and add the tag once per mapping call. D, recompute the length from the node index inside the mapping.

[think]

The answer is A: store the sum and the size in each summary, and add the tag times the size.

Leaves are built with a size of 1, and the combine adds both fields, so each node knows its length, and the mapping adds the tag times the size to the sum. Adding the tag once ignores the length, tags are shared across nodes of different lengths, and the mapping never sees a node index.

## 6

Your updates are all range adds, and your queries are all single-element reads, at a high rate, in Python. What should you use?

A, a Fenwick tree over a difference array of the values. B, a prefix-sum array, rebuilt after every range update. C, a plain segment tree, with a point update per element. D, a lazy segment tree with range add and range sum.

[think]

The answer is A: a Fenwick tree over a difference array.

A range add becomes two point updates on the difference array, and a point read is one prefix sum, each a short loop of about 20 steps. Measured, those walks cost under a microsecond in CPython, against 17 microseconds per lazy update. A point update per element costs k log n per range, and rebuilding prefix sums is linear per update.

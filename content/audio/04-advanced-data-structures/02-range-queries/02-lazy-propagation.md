---
lesson: lazy-propagation
source: 834ea760b3bf6a6d
fit: partial
desk:
  - "The difference-array picture"
  - "The tag-by-tag traces of update A, update B and the query, and the whole-history table"
  - "The missing-push bug reproduced node by node"
  - "The lazy tree code and the assign-and-add tree with its four-ordering composition table"
  - "AtCoder's lazy segtree layout, the measured-cost table, and the trade-off and failure tables"
  - "Exercises: range add with range sum; range assign, range add and range sum on one tree"
---
## Introduction

Your rate limiter tracks per-user allowances in one-minute buckets, and a policy change says: add 50 to the allowance for every bucket between 8 in the morning and 8 at night, for the next month. That is a range update, one instruction touching 21,600 buckets. A plain segment tree applies it one bucket at a time, k times log n, and the dashboard still wants range sums on top.

Measured in CPython, a plain loop adding to a third of a million-element array takes 11 milliseconds per update. A lazy segment tree does the same update in 17 microseconds.

The trick is to not do the work. Three ideas. The invariant that makes deferred updates safe. The one missing line that breaks nearly every first implementation, and its strange signature. And what happens when assign meets add, which is where the second family of bugs lives.

## The difference-array intuition

Start with a simpler trick that explains the whole idea. To add v to every element from l to r, write plus v at position l, and minus v at position r plus 1, in a separate difference array. The real array is the running sum of that difference array. Add 5 to positions 1 through 3: put plus 5 at 1 and minus 5 at 4. Running sums give 0, 5, 5, 5, 0. The elements in between were never touched. The update starts at one boundary and stops at the other.

Lazy propagation generalises that: record the update at the boundary of the region it affects, and let it flow inward only when something needs to look.

## Two values per node, one invariant

Each node of the segment tree keeps two things. Its sum, which already includes every update recorded at it. And a pending tag, say "add d", that has been applied to this node's sum but not yet to its children.

Two operations. Apply a tag to a node: add d times the node's length to its sum, and add d to its tag. The node is now correct, and owes its children d. Push a node: apply its tag to both children, then reset it. And the rule: every operation that moves from a node into its children pushes first.

The invariant: a node you reach walking down from the root is exact. Only its children may be stale, and by exactly its tag.

Take the eight values from the segment tree lesson, 5, 2, 4, 7, 1, 3, 6, 8, and add 10 to positions 2 through 5. The walk classifies nodes just like a query. The two nodes that exactly cover the range, the pair 2 and 3 and the pair 4 and 5, get a tag of 10 and their sums go up by 20 each. Their ancestors are recomputed on the way back up; the root goes from 36 to 76. The four leaves underneath still hold their old values, stale by exactly 10, which is what the tags say.

Now a second update, add 3 to positions 3 through 6. It cuts through the tagged pair 2 and 3, so before descending, the walk pushes the 10 down to those two leaves. Later, a query for positions 5 to 7 finally pushes the other tag. The answer is 33, and you can check: the true array is now 5, 2, 14, 20, 14, 16, 9, 8.

Notice what never happened. Nothing under the right-most pair was ever stale, and two leaves stayed stale for two whole operations and cost nothing while they were. That is the entire saving: work is done only on paths some operation actually walks.

And the cost is worst-case log n, not amortised. At most two nodes straddle the range per level, the same argument as a query, and each push is constant work whatever the history. Deferral is not amortisation.

## The missing push

Here is the bug nearly every first implementation has. The query pushes before descending, but the update does not.

Run the same two updates. After the first, everything is correct. The second update descends into the tagged pair 2 and 3 without pushing, adds 3 to one stale leaf, and then recomputes the pair's sum from its stale children. That throws away the 20 the first update had put there.

Before I tell you the symptoms: what do you think wide queries and single-element queries return now?

[pause]

The root says 68 instead of 88: off by exactly 20, an earlier update's delta times its overlap. Any query that takes that pair whole is wrong. But a query for a single element in it is right, because the query pushes the surviving tag of 10 onto the leaves. Wide queries wrong, narrow ones right, error a multiple of an earlier delta, and everything was fine after one update. Your test needs two overlapping updates, then one wide query and two narrow ones.

## When assign meets add

Adds compose by addition, so their order is invisible: plus 10 then plus 3 is plus 13 either way. Assign, "set every element to v", overwrites. A tree that supports both needs a rule for every pair.

The clean way is to make the tag a function: x becomes m times x plus a. Add d is m of 1 and a of d. Assign v is m of 0 and a of v. No tag is m of 1 and a of 0. Composition is defined once.

The order rule is the subtle part. When a node is pushed, its tag lands on children that may already have tags. The child's tag is always the older one, because anything that wrote it walked through the parent and pushed the parent first. So push composes the child's tag first, then the parent's.

Get that backwards and look what happens. Older add 10, newer assign 4: every element should end as 4; backwards gives 14. Older assign 4, newer add 3: should be 7; backwards gives 4. Older assign 4, newer assign 9: should be 9; backwards gives 4. Three of the four orderings break, and the only one that survives, add then add, is the only one an add-only test exercises.

One more trap: the identity. A tree that stores the tag as one number and treats zero as "no tag" loses "assign zero". On 3, 3, 3, 3, assign 0 everywhere sets the root's tag to 0, which reads as no tag. A later add of 1 to the first two descends without pushing, and the tree reports a total of 14 where the answer is 2. Use an explicit identity tag.

And one operation that does not fit at all: setting each element to the minimum of itself and x, combined with range sums. The change to a node's sum depends on how many elements exceed x, which one number per node cannot say. That needs Segment Tree Beats.

## In real code, and what it costs

The AtCoder Library's lazy segment tree is the one most people copy. Tags live on internal nodes only, so you cannot write the leaf-push bug. The newer tag always goes on the outside of the composition, the child-first rule. And its apply function never sees the interval, so for range add with range sum the summary must carry its own length. Build the leaves with a length of zero and you get a tree that silently ignores every add, a common first bug. For a million elements it takes about 40 mebibytes, against 64 megabytes for the recursive layout with two arrays.

Measured in CPython over a million elements: 16.9 microseconds per range add and 9.3 per range sum. That caps one core near 60 thousand range updates a second. The same tree in Node did about half a microsecond per operation, roughly 2 million a second. And two Fenwick trees, from the next lesson, managed 3 microseconds per add and 2.7 per sum, about five times faster on adds and three on sums, but they only handle add with sum.

So the honest rule: a lazy tree is worth it only when both sides are ranges. Range update with point reads is a difference array over a Fenwick tree, a fifth of the code. Point update with range queries is the plain segment tree. Where both are ranges: a scheduler booking 4 CPUs from 2 to 6 in the afternoon adds to a range of time slots, then asks for the peak over a wider window before accepting. That is range add with range max: the same tags, only the summary's rule changes. Booking a calendar is range assign with range max. And reversing a subarray inside an implicit treap is a lazy "reversed" flag, pushed on descent.

## In the interview

A follow-up the lesson expects. The keys are timestamps up to a billion, with 100 thousand bookings. You cannot allocate 4 billion nodes. What do you do?

[pause]

A dynamic lazy tree over the whole range that allocates children on first push, so each operation creates at most about 60 nodes, and 100 thousand operations create a few million. Or, if every booking is known up front, compress the endpoints to at most 200 thousand points and use an ordinary tree. The wrong answer is a hash map of booked minutes, which costs the length of every booking.

And one more: can you avoid pushing at all? For commutative tags like add, yes: make tags permanent. An update adds d times its overlap to every node it visits and tags covered nodes; a query carries the sum of tags along its path. Nothing is ever written below a node on a read, which is what makes a persistent lazy tree cheap. Not for assign, which is not commutative.

## Recap

Four things to remember. Record a range update on the log n nodes that exactly cover it, and push it down only when an operation needs to look inside; a node reached from the root is exact, and its children are stale by exactly its tag. Push before every descent, in updates and queries alike; a missing push shows up as wide queries wrong and narrow ones right. Model tags as functions, compose the child's older tag first, and test all four assign and add orderings plus assign zero. And use a lazy tree only when both the update and the query are ranges.

At your desk: the tag-by-tag traces, the missing-push reproduction, both implementations, the composition table, the AtCoder layout and the measured costs, and the two exercises.

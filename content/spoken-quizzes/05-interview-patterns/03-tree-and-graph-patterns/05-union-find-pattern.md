---
lesson: union-find-pattern
source: 86f0c89f55e4683f
---
## 1

A candidate's union of a and b simply sets the parent of b to a, without calling find on either argument. The calls union 1 and 2, union 2 and 3, then union 3 and 1 are executed. What happens?

A, it raises an index error on the third union call. B, the third call is correctly rejected as a cycle edge. C, the parent of 1 becomes 3, which makes a pointer cycle, and find never ends. D, all three end up in one set, and nothing is wrong.

[think]

The answer is C: the parent of 1 becomes 3, a pointer cycle, so find never ends.

After the first two calls, 2 points to 1 and 3 points to 2, which happens to be a valid tree. The third call points the root, 1, at its own descendant, 3, forming the loop 1, 3, 2, 1, so the next find never reaches a root. Union must compute both roots, compare them, and link one root under the other.

## 2

Why does Redundant Connection return the first union that fails, when the edges are processed in input order?

A, because union-find only works on edges in sorted order. B, because the answer is always the last edge of the input. C, because it closes the only cycle, and the other cycle edges came earlier. D, because the failing union always has the smallest labels.

[think]

The answer is C: it closes the only cycle, and the other cycle edges came earlier.

One extra edge creates exactly one cycle, and the cycle is not closed until its last edge in input order is seen. That edge is the first whose endpoints are already joined. Every other cycle edge appeared earlier, so the tie-break, returning the edge that appears last, is automatic.

## 3

With union by rank but no path compression, what is the worst-case cost of a single find on n nodes?

A, constant, because each node points close to its root. B, inverse Ackermann, since rank alone achieves it. C, linear, because the trees can still become chains. D, logarithmic, because rank bounds the tree height.

[think]

The answer is D: logarithmic, because rank bounds the height.

A root of rank r has at least 2 to the r nodes, because rank only grows when two trees of equal rank merge. So height is at most log n, and no chain can form. Compression alone lets a chain form but flattens it the first time it is walked, for amortised log n as well. Only the combination of the two gives inverse Ackermann.

## 4

A component counter decrements the count on every call to union. On 3 nodes, with the edge from 0 to 1 listed twice, what does it return?

A, 1, since the no-op union still decrements. B, 3, since the duplicate edge is ignored. C, 0, since each call decrements twice. D, 2, the correct number of components.

[think]

The answer is A: 1, since the no-op union still decrements.

The count starts at 3. The first union merges 0 and 1, leaving 2 groups. The second finds both endpoints under the same root and merges nothing, but the unconditional decrement drops the count to 1. Decrement only when the roots differ, which a boolean return from union makes natural.

## 5

In Accounts Merge, a candidate uses the account names as the union-find nodes. What breaks?

A, nothing, since names identify people in this problem. B, union-find cannot use strings as its node keys. C, the output emails come out unsorted in each group. D, different people who share a name get merged together.

[think]

The answer is D: different people who share a name get merged.

Names are not identities here; shared emails are. Two accounts named John with no shared email must stay separate, and name-keyed nodes merge them. The nodes must be account indices, or emails, with the name attached to the output afterwards.

## 6

Starting from a known graph, edges are only deleted over time, with connectivity queries in between, and the whole sequence is known in advance. What is the standard approach?

A, rebuild the whole structure after every deletion. B, switch to Dijkstra, which supports removing edges. C, process time backwards, so deletions become unions. D, add a delete operation that splits a set in two.

[think]

The answer is C: process time backwards, so deletions become unions.

Union-find cannot split sets. Knowing the sequence up front lets you start from the final graph and walk time in reverse, turning every deletion into a union. If additions were interleaved as well, reversing would turn them into deletions, and the standard tool becomes a rollback union-find, with no path compression, over a segment tree of time. Rebuilding after each deletion works, but throws away the near-constant cost.

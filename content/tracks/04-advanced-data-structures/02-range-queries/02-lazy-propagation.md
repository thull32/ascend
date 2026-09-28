---
slug: lazy-propagation
title: "Lazy propagation: range updates without touching every element"
description: How a segment tree defers range updates as pending tags, traced tag by tag on an eight-element tree through two overlapping updates and a query, the push-down order bug reproduced node by node, composing range assign with range add, AtCoder's lazy_segtree internals, measured costs, and the bugs that break most lazy trees.
minutes: 30
difficulty: hard
tags: [segment-tree, lazy-propagation, range-update, range-query, atcoder-library]
problems: [range-sum-query-immutable]
---
Your rate limiter tracks per-user request allowances in one-minute buckets, and a policy change says "add 50 to the allowance for every bucket between 08:00 and 20:00 for the next month". That is a *range update*: one instruction that touches 21,600 buckets. The segment tree from the [previous lesson](/learn/advanced-data-structures/range-queries/segment-trees) handles a point update in `O(log n)`, so applying the policy one bucket at a time costs `O(k log n)`, and a dashboard that also asks "total allowance between these two times" needs range queries on top. Measured on CPython 3.14, a plain loop that adds to a third of a million-element array takes 11 ms per update; a lazy tree does the same update in 17 µs.

The fix is to not do the work. A range update on `[l, r]` is recorded on the `O(log n)` nodes that exactly cover `[l, r]`, as a *pending tag*, and a tag moves one level down only when a later operation needs to look inside that node. Every operation stays `O(log n)` in the worst case, not amortised, and the bookkeeping is where nearly every implementation goes wrong. This lesson traces every tag on an eight-element tree through two overlapping updates and a query, reproduces the push-down bug on the same data, and then composes range assign with range add, which is where the second family of bugs lives.

## The difference-array intuition

For range *add* with only *point* queries there is a simpler trick, and it explains why the lazy tree works.

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [0, 5, 0, 0, -5, 0, 3, 0],
 "title": "A difference array: range add becomes two point updates",
 "caption": "diff = [0,5,0,0,-5,0,3,0] encodes 'add 5 to [1,3]' and 'add 3 to [6,7]'. Its prefix sums are the actual values: [0,5,5,5,0,0,3,3]."}
```

To add `v` to every element of `[l, r]`, set `diff[l] += v` and `diff[r+1] -= v`. The real array is the prefix sum of `diff`, so range add costs `O(1)` and a point read costs a prefix sum, which a [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees) makes `O(log n)`. The effect of the add "starts" at `l` and "stops" after `r`; the elements in between are never touched.

Lazy propagation generalises that idea: record the update at the boundary of the region it affects and let it flow inward only when needed. The segment tree also has to answer *range* sums, so every node needs to know the total effect of updates that have not yet reached its children.

## Two values per node, one invariant

Each node keeps:

- `sum[node]`: the sum of its interval, including every update recorded at this node or pushed into it from above;
- `lazy[node]`: a pending tag, here "add `d`", that has been applied to this node's `sum` but not yet to its children.

The invariant: **a node's `sum` is correct for its own interval except for tags still pending at its ancestors, and the children of a node with tag `d` are stale by exactly `d` per element.** An operation walking down from the root pushes every tag it passes, so each node it reaches is exact.

Use the same eight values and the same array layout as the segment-tree lesson: `[5, 2, 4, 7, 1, 3, 6, 8]`, root at index 1, children of `i` at `2i` and `2i + 1`, leaf `k` at index `8 + k`.

| node | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| interval | [0,7] | [0,3] | [4,7] | [0,1] | [2,3] | [4,5] | [6,7] | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| sum | 36 | 18 | 18 | 7 | 11 | 4 | 14 | 5 | 2 | 4 | 7 | 1 | 3 | 6 | 8 |

Two operations use the tree. **Apply** a tag to a node: `sum += d × length`, `lazy += d`; the node is now correct and owes its children `d`. **Push** a node: apply its tag to both children, then reset it to 0. Every operation that moves from a node to its children pushes first.

## Trace: update A leaves two tags

**Update A: add 10 to `[2, 5]`.** The walk classifies nodes exactly as a segment-tree query does; covered nodes get the tag and stop.

| step | node | interval | verdict | action | sum | lazy |
|---|---|---|---|---|---|---|
| 1 | 1 | [0,7] | straddles | push (tag 0, nothing moves), descend | | 0 |
| 2 | 2 | [0,3] | straddles | push (nothing), descend | | 0 |
| 3 | 4 | [0,1] | outside | return | 7 | 0 |
| 4 | 5 | [2,3] | **covered** | apply: `11 + 10 × 2` | 31 | **10** |
| 5 | 2 | [0,3] | returning | recompute `7 + 31` | 38 | 0 |
| 6 | 3 | [4,7] | straddles | push (nothing), descend | | 0 |
| 7 | 6 | [4,5] | **covered** | apply: `4 + 10 × 2` | 24 | **10** |
| 8 | 7 | [6,7] | outside | return | 14 | 0 |
| 9 | 3, then 1 | | returning | recompute `24 + 14`, then `38 + 38` | 38, 76 | 0 |

Leaves 10–13 still hold 4, 7, 1, 3: stale by exactly 10 each, which is what the tags on nodes 5 and 6 say.

## Trace: update B pushes one tag and stacks another

**Update B: add 3 to `[3, 6]`.** This range cuts through node 5, which holds a tag, so the walk must push before descending.

| step | node | interval | verdict | action | sum | lazy |
|---|---|---|---|---|---|---|
| 1 | 1, 2 | | straddle | push (nothing), descend | | |
| 2 | 4 | [0,1] | outside | return | 7 | |
| 3 | 5 | [2,3] | straddles | **push 10**: node 10 → `4 + 10 = 14`, node 11 → `7 + 10 = 17`; node 5's tag → 0 | 31 | 0 |
| 4 | 10 | [2,2] | outside | return | 14 | |
| 5 | 11 | [3,3] | covered | apply `+3` | 20 | |
| 6 | 5, then 2 | | returning | recompute `14 + 20`, then `7 + 34` | 34, 41 | |
| 7 | 6 | [4,5] | **covered** | apply `+3 × 2`; tags compose: `10 + 3` | 30 | **13** |
| 8 | 7 | [6,7] | straddles | push (nothing); node 14 covered, `6 + 3 = 9`; node 15 outside | 17 after recompute | |
| 9 | 3, then 1 | | returning | recompute `30 + 17`, then `41 + 47` | 47, 88 | |

Node 6 now carries 13, the composition of two adds, and its leaves still read 1 and 3.

## Trace: a query settles the stacked tag

**Query: `sum(5, 7)`.**

| node | interval | verdict | action | contributes |
|---|---|---|---|---|
| 1 | [0,7] | straddles | push (nothing) | |
| 2 | [0,3] | outside | | 0 |
| 3 | [4,7] | straddles | push (nothing) | |
| 6 | [4,5] | straddles | **push 13**: node 12 → `1 + 13 = 14`, node 13 → `3 + 13 = 16` | |
| 12 | [4,4] | outside | | 0 |
| 13 | [5,5] | covered | | 16 |
| 7 | [6,7] | covered | | 17 |
| | | | **total** | **33** |

The true array is now `[5, 2, 14, 20, 14, 16, 9, 8]`, and `16 + 9 + 8 = 33`. The whole history in one table (`sum/tag`, a star marks a leaf that is stale):

| node | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| start | 36 | 18 | 18 | 7 | 11 | 4 | 14 | 4 | 7 | 1 | 3 | 6 |
| after A | 76 | 38 | 38 | 7 | 31/10 | 24/10 | 14 | 4* | 7* | 1* | 3* | 6 |
| after B | 88 | 41 | 47 | 7 | 34 | 30/13 | 17 | 14 | 20 | 1* | 3* | 9 |
| after query | 88 | 41 | 47 | 7 | 34 | 30 | 17 | 14 | 20 | 14 | 16 | 9 |

Nothing under node 7 was ever stale, and leaves 12 and 13 were stale for two operations and cost nothing while they were. That is the whole saving: work is done only on paths that some operation actually walks.

## The push-down order bug, reproduced

Run update B again on the post-A tree, but with the push in `_add` deleted (queries still push). At node 5 the walk descends without pushing: node 11 becomes `7 + 3 = 10`, node 10 stays 4, and node 5 is recomputed as `4 + 10 = 14`. Its correct value is 34. The recompute threw away the 20 that update A had put into node 5's sum, while node 5 still carries tag 10. Node 2 becomes 21 and the root 68 instead of 88: off by exactly `10 × 2`, a previous update's delta times the overlap.

The symptoms are what make this bug expensive to find:

- `sum(0, 7)` returns 68 and `sum(2, 3)` returns 14: queries that take node 5 whole are wrong.
- `sum(2, 2)` returns 14 and `sum(3, 3)` returns 20, both correct, because the query pushes node 5's surviving tag onto the leaves. Wide queries are wrong while narrow ones are right.
- Everything was correct after update A. The error needs a second update that cuts through a tagged node.

The second ordering bug is about *which tag is newer*. When a node is pushed, its tag lands on children that may already have tags. The child's tag is always the older one: anything that wrote the child's tag walked through the parent and pushed it first, so the parent's current tag was set later. Push must therefore compose "child's tag first, then parent's tag". With adds the order is invisible, because `+10` then `+3` equals `+3` then `+10`. With assign it is not: if node 5 holds "assign 0" and a later "assign 9 to `[3, 3]`" ends up applied *before* that older assign (by composing in the wrong order, or by pushing after recursing instead of before), leaf 3 reads 0 instead of 9. The newer update is erased by the older one, and add-only test suites never notice.

## The implementation

```python
class LazySegmentTree:
    def __init__(self, values):
        self.n = len(values)
        self.sum = [0] * (4 * self.n)
        self.lazy = [0] * (4 * self.n)
        self._build(1, 0, self.n - 1, values)

    def _build(self, node, lo, hi, values):
        if lo == hi:
            self.sum[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid + 1, hi, values)
        self.sum[node] = self.sum[2 * node] + self.sum[2 * node + 1]

    def _apply(self, node, lo, hi, delta):
        """Apply 'add delta to every element of [lo, hi]' to this node only."""
        self.sum[node] += delta * (hi - lo + 1)
        self.lazy[node] += delta

    def _push(self, node, lo, hi):
        """Move this node's pending add down to its children."""
        if self.lazy[node] != 0 and lo != hi:
            mid = (lo + hi) // 2
            self._apply(2 * node, lo, mid, self.lazy[node])
            self._apply(2 * node + 1, mid + 1, hi, self.lazy[node])
            self.lazy[node] = 0

    def add(self, l, r, delta):
        self._add(1, 0, self.n - 1, l, r, delta)

    def _add(self, node, lo, hi, l, r, delta):
        if r < lo or hi < l:
            return
        if l <= lo and hi <= r:
            self._apply(node, lo, hi, delta)
            return
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        self._add(2 * node, lo, mid, l, r, delta)
        self._add(2 * node + 1, mid + 1, hi, l, r, delta)
        self.sum[node] = self.sum[2 * node] + self.sum[2 * node + 1]

    def query(self, l, r):
        return self._query(1, 0, self.n - 1, l, r)

    def _query(self, node, lo, hi, l, r):
        if r < lo or hi < l:
            return 0
        if l <= lo and hi <= r:
            return self.sum[node]
        self._push(node, lo, hi)
        mid = (lo + hi) // 2
        return (self._query(2 * node, lo, mid, l, r)
                + self._query(2 * node + 1, mid + 1, hi, l, r))

t = LazySegmentTree([5, 2, 4, 7, 1, 3, 6, 8])
t.add(2, 5, 10); t.add(3, 6, 3)
print(t.query(5, 7), t.query(0, 7))   # 33 88, as traced
```

Four lines carry the correctness:

1. `_apply` updates `sum` *and* `lazy` together: the node is correct immediately, and the tag is a debt to its children.
2. `_push` runs in both `_add` and `_query` **before** descending into a partially covered node. Delete it from `_add` and you get the 68-instead-of-88 trace above.
3. The recompute after the recursive `_add` reads children that were pushed and then updated, so it is correct.
4. `lo != hi` in `_push`: a leaf's tag is never read, and pushing from a leaf would write to indices `2·node` that belong to nothing (harmless with `4n` slots, an `IndexError` with a tighter allocation).

The cost bound is the segment-tree query argument: per level at most two nodes straddle the range, each push is `O(1)` regardless of history, so an update or query visits at most about `4 log₂ n` nodes. Nothing cascades, which is why the bound is worst-case rather than amortised.

## Composing tags: range assign versus range add

Adds compose by addition. **Assign** ("set every element of `[l, r]` to `v`") overwrites, and a tree that supports both needs a rule for every pair. Make the tag a function and define composition once. With `(m, a)` meaning `x → m·x + a`:

- add `d` is `(1, d)`; assign `v` is `(0, v)`; "no tag" is `(1, 0)`;
- "first `(m₁, a₁)`, then `(m₂, a₂)`" is `(m₁·m₂, a₁·m₂ + a₂)`;
- applying `(m, a)` to a node of length `len` does `sum = m·sum + a·len`.

The four orderings, on a node whose older tag meets a newer one, with what each element under the node ends as:

| older tag | newer tag | correct composition | element ends as | composed backwards | element ends as |
|---|---|---|---|---|---|
| add 10 `(1,10)` | add 3 `(1,3)` | `(1, 13)` | `x + 13` | `(1, 13)` | `x + 13` |
| add 10 `(1,10)` | assign 4 `(0,4)` | `(0, 4)` | 4 | `(0, 14)` | 14 |
| assign 4 `(0,4)` | add 3 `(1,3)` | `(0, 7)` | 7 | `(0, 4)` | 4 |
| assign 4 `(0,4)` | assign 9 `(0,9)` | `(0, 9)` | 9 | `(0, 4)` | 4 |

Three of four orderings break when the composition is backwards, and the one that survives is the only one an add-only test exercises. Only `_apply` and `_push` change; the walk in `_add` and `_query` is reused as written, passing a tag tuple where it passed `delta`:

```python
class AssignAddTree(LazySegmentTree):
    """Tags are (m, a), meaning x -> m*x + a. Reuses _add and _query from above."""
    def __init__(self, values):
        self.mul = [1] * (4 * len(values))
        self.inc = [0] * (4 * len(values))
        super().__init__(values)

    def _apply(self, node, lo, hi, tag):
        m, a = tag
        self.sum[node] = m * self.sum[node] + a * (hi - lo + 1)
        self.mul[node], self.inc[node] = self.mul[node] * m, self.inc[node] * m + a   # older tag first

    def _push(self, node, lo, hi):
        if (self.mul[node], self.inc[node]) != (1, 0) and lo != hi:   # identity, not "!= 0"
            mid = (lo + hi) // 2
            tag = (self.mul[node], self.inc[node])
            self._apply(2 * node, lo, mid, tag)
            self._apply(2 * node + 1, mid + 1, hi, tag)
            self.mul[node], self.inc[node] = 1, 0

    def range_assign(self, l, r, v): self.add(l, r, (0, v))
    def range_add(self, l, r, d):    self.add(l, r, (1, d))

t = AssignAddTree([5, 2, 4, 7, 1, 3, 6, 8])
t.range_add(2, 5, 10); t.range_assign(3, 6, 0); t.range_add(0, 7, 1)
print(t.query(0, 7), t.query(3, 6))   # 37 4
```

`self.inc[node] * m + a` is the composition rule with the node's existing tag as the older one: an assign (`m = 0`) wipes the accumulated add, an add (`m = 1`) stacks on top of it.

## Identity tags, and summaries that do not compose

The identity test matters. A tree that stores assign as a bare `lazy` value and tests `lazy != 0` loses "assign 0": on `[3, 3, 3, 3]`, assign 0 to everything sets the root's sum to 0 and its tag to 0, which reads as "no tag", so a later `add(0, 1, 1)` descends without pushing and the tree reports 14 where the answer is 2.

The same pattern covers other summaries. Range add on a min tree applies `min += d`; range assign applies `min = v`. Multiplying by a negative number swaps min and max, so a "negate a range" tag needs both stored per node. Two operations do not fit at all: range chmin (`a[i] = min(a[i], x)`) with range sum, because the effect on a sum depends on how many elements exceed `x`, which one number per node cannot say (Segment Tree Beats, in the follow-ups, handles it).

## Under the hood: AtCoder's lazy_segtree

The AtCoder Library's `lazy_segtree<S, op, e, F, mapping, composition, id>` is the reference implementation most people copy. `S`, `op`, `e` are the summary monoid, as in `segtree`. `F` is the tag type, `mapping(f, x)` applies a tag to a summary, `composition(f, g)` returns `f ∘ g` (apply `g`, then `f`), and `id()` is the identity tag.

- **Storage.** `d` holds `2 · size` summaries, where `size` is `n` rounded up to a power of two; `lz` holds `size` tags, internal nodes only. Leaves have no tag slot, so the leaf-push bug cannot be written.
- **Where the newer tag goes.** `all_apply(k, f)` does `d[k] = mapping(f, d[k])` and, for internal `k`, `lz[k] = composition(f, lz[k])`: the new tag goes on the outside, which is the "child's tag first" rule from the order-bug section.
- **No interval is passed to `mapping`.** For range add with range sum the summary must carry its own length, `S = {sum, size}`, with leaves built as `{a[i], 1}` and `mapping(f, x) = {x.sum + f · x.size, x.size}`. Building leaves with `size = 0` gives a tree that ignores every add, a common first ACL bug.
- **Iterative, three passes.** `apply(l, r, f)` first pushes, top-down from level `log` to 1, every ancestor of the boundary leaves whose subtree is cut by the boundary (`((l >> i) << i) != l`); then runs the two-cursor loop from the segment-tree lesson, calling `all_apply` on each node it takes; then recomputes the same ancestors bottom-up. `prod(l, r)` does the first pass and then the ordinary two-accumulator loop.

For `n = 10⁶`, `size = 2²⁰`, 16-byte summaries and 8-byte tags: `d` is 32 MiB and `lz` 8 MiB, 40 MiB in total, against 64 MB for the recursive `4n` layout with two 8-byte arrays. The recursive version remains the one to write on a whiteboard: `[lo, hi]` in every call keeps the push logic visible.

## Measured costs

Measured on CPython 3.14 on one core of a Ryzen 9 9950X3D, `n = 10⁶`, 20,000 random ranges (average length about 333,000):

| operation | recursive lazy tree | two Fenwick trees (range add, range sum) | plain list loop |
|---|---|---|---|
| build | 0.17 s | `O(n)` | none |
| range add | **16.9 µs** | 3.0 µs | 11.1 ms |
| range sum | **9.3 µs** | 2.7 µs | 2.9 ms (`sum(a[l:r+1])`) |
| memory for `sum` + `lazy` (pointers only) | 64 MB (`2 × 4n × 8 B`) | 16 MB | 8 MB |

The same recursive tree in Node 24 over `Float64Array`s: 11 ms to build, 506 ns per range add and 398 ns per range sum. A Python lazy tree therefore sustains roughly 60,000 range updates per second per core; the Node version roughly 2 million. The two-Fenwick structure, covered in the next lesson, is five times faster in Python because it has no recursion and no push, but it only handles add-and-sum.

## Where range updates meet range queries

- **Advance reservation.** A scheduler that books capacity over time ("reserve 4 CPUs on this host from 14:00 to 18:00") adds demand to a range of time slots and asks "what is the peak between 13:00 and 19:00" before accepting: range add with range max.
- **Calendars and seat maps.** "Book `[l, r)`" and "is anything in `[a, b)` booked" is range assign plus range max, and with timestamps up to 10⁹ it becomes the dynamic tree in the follow-ups.
- **Interval painting.** "Colour `[l, r]` with `c`" and "what colour is position `x`" is range assign with point query, as in genome-browser annotation tracks or a canvas.
- **Sequence editing.** Reversing a subarray inside an implicit [treap](/learn/advanced-data-structures/balanced-trees/treaps-skip-lists-and-splay) is a lazy "reversed" flag pushed on descent, the same mechanism on a balanced BST instead of a fixed array.

In each case the lazy tree is worth it only when *both* sides are ranges. Range update with point query is a difference array over a Fenwick tree; point update with range query is the plain segment tree.

## Trade-offs

| | Difference array + Fenwick | Two Fenwick trees | Lazy segment tree | Sqrt decomposition with block tags | Segment Tree Beats |
|---|---|---|---|---|---|
| Updates | range add | range add | any composable tag (add, assign, affine) | anything expressible per block | range chmin/chmax, add |
| Queries | point | range sum | any monoid (sum, min, max, count) | anything | sum, min, max |
| Cost per op | `O(log n)` | `O(log n)`, 4 walks | `O(log n)`, ~`4 log n` nodes | `O(√n)` | amortised `O(log n)` for chmin with sum |
| Memory, `n = 10⁶`, 8-byte values | 8 MB | 16 MB | 64 MB recursive, 40 MiB ACL | 8 MB + tags | 4 values per node |
| Code | 10 lines | 20 lines | 50 lines | 30 lines | 100+ lines |
| Python cost measured above | ~0.7 µs per walk | 3.0 µs add, 2.7 µs sum | 16.9 µs add, 9.3 µs sum | | |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Correct after one update; after a second overlapping update, wide queries are wrong and single-element queries are right; the error is a multiple of an earlier delta | A partially covered node is descended into without a push, and its recompute discards the pending tag (the 68-instead-of-88 trace) | Push before every descent, in updates and queries; test two overlapping updates followed by one wide and two narrow queries |
| "Set to 0" updates are ignored; other assigns work | `lazy == 0` doubles as "no tag", so assign-0 is never pushed | An explicit identity tag `(1, 0)` or a `None` sentinel; test assign 0 |
| Mixed assign/add sequences return values from an older update | Tags composed in the wrong order (parent applied before the child's older tag), or push placed after the recursive call | `lazy[child] = compose(child_tag, parent_tag)`; push before descending; test all four orderings from the table |
| Every sum off by exactly `delta` per update | `hi − lo + 1` used on a half-open interval, or `hi − lo` on a closed one | One convention per codebase; test `sum(i, i)` after an add covering `i` |
| Sums wrap negative after large batches | `delta × length` in 32-bit: `10⁴ × 10⁶ = 10¹⁰` exceeds `2³¹ − 1` | 64-bit sums; in JavaScript stay under `2⁵³` or use `BigInt` |
| A service that applies policy changes falls behind at peak | 17 µs per range update in CPython caps one core near 60,000 updates per second | Batch updates, move the structure to a compiled service (about 0.5 µs in Node), or use two Fenwick trees when the operation is add-and-sum |

## Interviewer follow-ups

**"The keys are timestamps up to 10⁹ and you get 10⁵ bookings. You cannot allocate `4 × 10⁹` nodes."** Model answer: a dynamic lazy tree over `[0, 10⁹)` that allocates children on first push, so each operation creates at most about `2 log₂ 10⁹ ≈ 60` nodes and 10⁵ operations create a few million; or, if all bookings are known up front, coordinate-compress the endpoints to at most `2 × 10⁵` points and use an ordinary tree. Common wrong answer: "use a hash map of booked minutes", which is `O(length)` per booking.

**"Support `a[i] = min(a[i], x)` over a range, with range sum."** Model answer: a plain tag cannot work because the change in a node's sum depends on how many elements exceed `x`; Segment Tree Beats stores max, strict second max, count of max and sum per node, applies the update at a node only when `second_max < x < max` (the sum drops by `(max − x) × count`) and recurses otherwise, with an amortised `O((n + q) log n)` bound from Ji's 2016 analysis. Common wrong answer: a "min with `x`" tag composed like assign.

**"Can you avoid pushing at all?"** Model answer: for commutative tags such as add, yes: keep tags permanent. An update adds `d × overlap` to every node it visits and tags the covered nodes; a query carries the sum of tags along its path and adds `tag × length` at each covered node. Nothing is ever written below a node on read, which is what makes a [persistent](/learn/advanced-data-structures/spatial-and-persistent/persistent-and-immutable-structures) lazy tree cheap. Common wrong answer: "push is always required", or permanent tags for assign, which is not commutative.

**"Range add, range max. Anything special?"** Model answer: no new structure: `_apply` does `max += d` and tags still compose by addition; only the summary's update rule changes. Common wrong answer: proposing a separate max-heap per range.

**"Why is this worst-case `O(log n)` rather than amortised?"** Model answer: the walk visits at most two straddling nodes per level, the same argument as a query, and each push is constant work independent of history. Common wrong answer: "because pushes are deferred, the cost is amortised", confusing deferral with amortisation.

## What mid-level engineers get wrong

- **Testing only with add.** Add is commutative, so wrong composition order and missing pushes in some paths pass every test until assign appears.
- **Using 0 as "no pending tag"** for an operation where 0 is a meaningful value.
- **Reaching for a lazy tree when one side is a point.** A difference array over a Fenwick tree is a fifth of the code and five times faster in Python.
- **Pushing in updates but not in queries**, or the reverse, and concluding the bug is elsewhere because single-element tests pass.
- **Forgetting the length.** A sum node must know how many elements it covers; ACL forces you to store it, recursive code gets it from `hi − lo + 1`, and code that mixes the two conventions is off by `delta`.
- **Quoting `O(log n)` without the constant.** In CPython a lazy update is 17 µs; 10⁵ updates per second need 1.7 cores for the tree alone.

## Exercises

```exercise
id: lazy-range-add-range-sum
title: Range add and range sum with lazy propagation
prompt: |
  Implement `LazySegmentTree` with:

  - `build(values)` — initialise from a non-empty list of integers.
  - `add(l, r, delta)` — add `delta` to every element in `l..r` inclusive.
  - `sum(l, r)` — return the sum of elements `l..r` inclusive.

  Both `add` and `sum` must be O(log n) regardless of the range length.
  A solution that loops over the range in `add` will pass the small tests
  but is not what the exercise is about; write the lazy version.
languages: [python, javascript]
entry: LazySegmentTree
starter:
  python: |
    class LazySegmentTree:
        def build(self, values):
            self.n = len(values)
            self.tot = [0] * (4 * self.n)
            self.lazy = [0] * (4 * self.n)
            # TODO: recursive build from values

        def add(self, l, r, delta):
            # TODO: apply to fully covered nodes; push before descending
            pass

        def sum(self, l, r):
            # TODO: push before descending into partially covered nodes
            return 0
  javascript: |
    class LazySegmentTree {
      build(values) {
        this.n = values.length;
        this.tot = new Array(4 * this.n).fill(0);
        this.lazy = new Array(4 * this.n).fill(0);
        // TODO: recursive build from values
      }
      add(l, r, delta) {
        // TODO: apply to fully covered nodes; push before descending
      }
      sum(l, r) {
        // TODO: push before descending into partially covered nodes
        return 0;
      }
    }
tests:
  - args: [["build",[1,2,3,4,5]],["sum",0,4],["add",1,3,10],["sum",0,4],["sum",2,2],["sum",3,4]]
    expected: [null, 15, null, 45, 13, 19]
  - args: [["build",[0,0,0,0]],["add",0,3,1],["add",0,3,1],["sum",0,3],["add",1,2,5],["sum",0,0],["sum",1,1],["sum",1,3]]
    expected: [null, null, null, 8, null, 2, 7, 16]
    label: stacked range adds
  - args: [["build",[5]],["add",0,0,-5],["sum",0,0]]
    expected: [null, null, 0]
    label: single element
  - args: [["build",[1,1,1,1,1,1,1,1]],["add",0,7,2],["add",2,5,3],["sum",0,7],["sum",1,2],["add",4,7,-1],["sum",4,7],["sum",0,7]]
    expected: [null, null, null, 36, 9, null, 14, 32]
    label: overlapping ranges
  - args: [["build",[5,2,4,7,1,3,6,8]],["add",2,5,10],["add",3,6,3],["sum",5,7],["sum",2,3],["sum",0,7]]
    expected: [null, null, null, 33, 34, 88]
    label: the lesson's trace
  - args: [["build",[3,-1,4,1,-5,9,2,-6]],["sum",0,7],["add",2,6,10],["sum",2,6],["sum",0,7],["add",0,7,-2],["sum",1,4],["sum",7,7]]
    expected: [null, 7, null, 61, 57, null, 21, -8]
    hidden: true
  - args: [["build",[1,2,3,4,5,6,7,8]],["add",0,7,1],["sum",3,3],["sum",4,6],["add",3,4,10],["sum",3,4],["sum",0,7]]
    expected: [null, null, 5, 21, null, 31, 64]
    hidden: true
    label: point query after a whole-array add forces a push
hints:
  - "Keep tot[node] correct for its own interval at all times; lazy[node] is the add not yet applied to the children."
  - "Write apply(node, lo, hi, delta) that does tot += delta * (hi - lo + 1) and lazy += delta, and push(node, lo, hi) that applies lazy[node] to both children then clears it."
  - "Call push before recursing into a partially covered node, in both add and sum; then recompute tot[node] from the children after the recursive add."
```

```exercise
id: lazy-assign-and-add
title: Range assign, range add and range sum on one tree
prompt: |
  Implement `AssignAddTree` with:

  - `build(values)` — initialise from a non-empty list of integers.
  - `assign(l, r, v)` — set every element in `l..r` inclusive to `v`.
  - `add(l, r, d)` — add `d` to every element in `l..r` inclusive.
  - `sum(l, r)` — return the sum of elements `l..r` inclusive.

  All three operations must be O(log n). Represent a pending tag as the
  function `x -> m*x + a` (add `d` is `(1, d)`, assign `v` is `(0, v)`,
  no tag is `(1, 0)`), and when a newer tag meets an older one, apply the
  older one first. Assigning 0 is a real update, not "no tag".
languages: [python, javascript]
entry: AssignAddTree
starter:
  python: |
    class AssignAddTree:
        def build(self, values):
            self.n = len(values)
            self.tot = [0] * (4 * self.n)
            self.mul = [1] * (4 * self.n)   # pending tag x -> mul*x + add
            self.add_ = [0] * (4 * self.n)
            # TODO: recursive build

        def assign(self, l, r, v):
            # TODO: update with tag (0, v)
            pass

        def add(self, l, r, d):
            # TODO: update with tag (1, d)
            pass

        def sum(self, l, r):
            # TODO: push before descending
            return 0
  javascript: |
    class AssignAddTree {
      build(values) {
        this.n = values.length;
        this.tot = new Array(4 * this.n).fill(0);
        this.mul = new Array(4 * this.n).fill(1);   // pending tag x -> mul*x + add
        this.add_ = new Array(4 * this.n).fill(0);
        // TODO: recursive build
      }
      assign(l, r, v) {
        // TODO: update with tag (0, v)
      }
      add(l, r, d) {
        // TODO: update with tag (1, d)
      }
      sum(l, r) {
        // TODO: push before descending
        return 0;
      }
    }
tests:
  - args: [["build",[5,2,4,7,1,3,6,8]],["add",2,5,10],["assign",3,6,0],["sum",0,7],["sum",2,3],["add",0,7,1],["sum",3,6]]
    expected: [null, null, null, 29, 14, null, 4]
    label: add, then an overlapping assign, then add
  - args: [["build",[1,1,1,1]],["assign",0,3,5],["add",1,2,2],["sum",0,3],["sum",1,1],["sum",3,3]]
    expected: [null, null, null, 24, 7, 5]
    label: add on top of a pending assign
  - args: [["build",[3,3,3,3]],["assign",0,3,0],["sum",0,3],["add",0,1,1],["sum",0,3],["sum",2,3]]
    expected: [null, null, 0, null, 2, 0]
    label: assigning zero is a real update
  - args: [["build",[7]],["add",0,0,3],["assign",0,0,-2],["sum",0,0],["add",0,0,5],["sum",0,0]]
    expected: [null, null, null, -2, null, 3]
    label: single element
  - args: [["build",[0,0,0,0,0,0]],["add",0,5,4],["assign",1,4,1],["add",2,3,10],["sum",0,5],["sum",0,1],["sum",3,5]]
    expected: [null, null, null, null, 32, 5, 16]
    hidden: true
  - args: [["build",[2,-1,3,0,5,-4,1,6,2]],["assign",2,7,3],["add",0,4,-2],["sum",0,8],["assign",4,4,9],["add",3,8,1],["sum",3,5],["sum",0,8]]
    expected: [null, null, null, 11, null, null, 16, 25]
    hidden: true
    label: n is not a power of two
  - args: [["build",[1,2,3,4,5,6,7,8]],["add",0,7,2],["assign",0,3,1],["add",2,5,3],["assign",5,7,0],["sum",0,7],["sum",4,4],["sum",5,7]]
    expected: [null, null, null, null, null, 20, 10, 0]
    hidden: true
    label: all four tag orderings
hints:
  - "apply(node, lo, hi, m, a): tot = m*tot + a*(hi-lo+1); then compose the node's tag as old-first: mul = mul*m, add = add*m + a."
  - "push only when the tag is not the identity (1, 0); testing add != 0 loses assign 0."
  - "Assign is the tag (0, v) and add is (1, d); one update routine handles both."
```

## Senior signals

- You explain lazy propagation as "record the update where the range is covered, push it inward only on demand", and relate it to the difference-array trick.
- You state the invariant precisely: a node reached from the root is exact; only its children may be stale, by exactly its tag.
- You can trace two overlapping updates on eight elements with every tag, and reproduce the missing-push bug with its signature: wide queries wrong, narrow ones right, error a multiple of an earlier delta.
- You model tags as composable functions `(m, a)`, know that the child's tag is always older than its parent's, and test all four assign/add orderings plus assign 0.
- You know ACL's `lazy_segtree` shape: tags on internal nodes only, `composition(f, g) = f ∘ g`, the summary carrying its own length, and the three-pass iterative update.
- You quote costs: 17 µs per range update in CPython, about 0.5 µs in Node, 64 MB for a recursive tree at `n = 10⁶`, and you choose two Fenwick trees or a difference array when the operation allows it.
- You know the limits: chmin with sum needs Segment Tree Beats, huge coordinate ranges need a dynamic tree or compression, and commutative tags can be made permanent to avoid pushes.

## Check yourself

```quiz
- q: >-
    After add 10 to [2,5] on the eight-element tree, which nodes hold a non-zero tag?
  options: ["Every leaf from 2 to 5, since those are the updated elements", "Every node on the paths from leaves 2 and 5 up to the root", "Only [2,3] and [4,5], the nodes that exactly cover [2,5]", "Only the root, which holds the pending add for the whole tree"]
  answer: 2
  explanation: >-
    Fully covered nodes receive the tag and stop. Their ancestors have their sums corrected by recomputation but carry no tag, because their other children were not affected. The leaves are untouched and stale by 10 until something pushes.
- q: >-
    A lazy tree is right after one range update. After a second overlapping update, sum(2,3) returns 14 while sum(2,2) + sum(3,3) returns 34. What is the bug?
  options: ["The build computed internal sums from the wrong children", "A tagged node was descended into without a push first", "Closed and half-open intervals are mixed in the length term", "Tags were composed in the wrong order during the push"]
  answer: 1
  explanation: >-
    The update descended through the tagged node without pushing and recomputed its sum from stale children, discarding the earlier update. Narrow queries push the surviving tag onto the leaves and come out right; queries that take the node whole read the damaged sum. A length mix-up would already be wrong after the first update, and composition order is invisible with add-only updates.
- q: >-
    A node holds the older tag add 10 and receives the newer tag assign 4. With tags written as (m, a) for x -> m*x + a, what must the node's tag become?
  options: ["(1, 4), because the newer tag replaces only the add component", "(0, 14), because the pending add is kept on top of the assign", "(1, 14), because both values are folded into a single add", "(0, 4), because the assign overwrites whatever came before it"]
  answer: 3
  explanation: >-
    Composing older-first gives (1·0, 10·0 + 4) = (0, 4): after an assign, earlier adds no longer matter. (0, 14) is what backwards composition produces, resurrecting the older add on top of the newer assign.
- q: >-
    Why does push compose the child's existing tag first and the parent's tag second?
  options: ["Parent tags always cover more elements than child tags do", "Composition is commutative for every tag, so any order works", "The child's tag must be older, as writing it pushed the parent", "Child tags are cleared before the parent tag is ever applied"]
  answer: 2
  explanation: >-
    Any operation that set the child's tag walked through the parent and pushed it first, so whatever tag the parent holds now was set later. Composition is commutative for add but not for assign, which is why the rule matters.
- q: >-
    In AtCoder's lazy_segtree, mapping(f, x) receives a tag and a summary but no interval. How do you implement range add with range sum?
  options: ["Store {sum, size} in each summary and add f times size", "Pass the interval length as part of every tag value", "Store only the sum and add f once per mapping call", "Recompute the length from the node index inside mapping"]
  answer: 0
  explanation: >-
    Leaves are built as {a[i], 1} and op adds both fields, so each node knows its length and mapping returns {sum + f·size, size}. Adding f once ignores the length; tags are shared across nodes of different lengths; mapping never sees a node index.
- q: >-
    Your updates are all range adds and your queries are all single-element reads, at a high rate in Python. What should you use?
  options: ["A Fenwick tree over a difference array of the values", "A prefix-sum array rebuilt after every range update", "A plain segment tree with a point update per element", "A lazy segment tree with range add and range sum"]
  answer: 0
  explanation: >-
    Range add becomes two point updates on a difference array and a point read is one prefix sum, each a short loop of about 20 steps; measured walks cost under a microsecond in CPython against 17 µs per lazy update. Point updates per element cost O(k log n) per range, and rebuilding prefix sums is O(n) per update.
```

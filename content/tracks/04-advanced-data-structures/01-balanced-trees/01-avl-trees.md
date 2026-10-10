---
slug: avl-trees
title: "AVL trees: balance factors and rotations"
description: How AVL trees keep a BST within 1.44 log n of perfect height using balance factors and four rotation cases, with insert and delete traced rotation by rotation, the node layouts real implementations use, and an honest comparison with red-black trees and B-trees.
minutes: 45
difficulty: medium
tags: [avl, balanced-bst, rotations, trees, ordered-map]
problems: [validate-bst, balanced-binary-tree, kth-smallest-bst]
---
Insert the keys 1, 2, 3, … 1,000,000 into a plain binary search tree and you get a linked list a million nodes long. Every lookup walks it: O(n), not O(log n). The same thing happens with any input that arrives roughly sorted, which is most real input (timestamps, auto-increment IDs, log lines). A BST only delivers its promised cost when its height is O(log n), and nothing in the plain insert algorithm guarantees that. In Python the failure is louder: a recursive insert of the 1,000th sorted key hits the default recursion limit and dies with `RecursionError` before the O(n) cost even matters.

An AVL tree is the oldest fix (Adelson-Velsky and Landis, 1962) and the strictest: after every insert or delete it checks whether any node's two subtrees differ in height by more than one and, if so, repairs it with a constant number of local pointer moves called rotations. The height stays under 1.44 log₂ n no matter what order the keys arrive in. This lesson traces the repairs rotation by rotation, checks the invariant after every step, and then puts numbers on what a node costs in memory and why that arithmetic sends large ordered sets to a [B-tree](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) instead. It assumes the plain [binary search tree](/learn/data-structures/trees/binary-search-trees) and the overview in [balanced trees](/learn/data-structures/trees/balanced-trees).

## The invariant and what it buys you

For every node, define the **balance factor** as `height(left) − height(right)`, where the height of a single node is 1 and of an empty subtree 0. The AVL invariant is that every node's balance factor is −1, 0 or +1. Nothing more.

Why does that small rule bound the height? Ask the opposite question: what is the *fewest* nodes an AVL tree of height `h` can have? Call it `N(h)`. The sparsest tree of height `h` has a root, one subtree of height `h−1` and the other as short as the rule allows, `h−2`, so:

```text
N(h) = N(h−1) + N(h−2) + 1,   N(1) = 1, N(2) = 2
h:     1  2  3  4   5   6   7   8   9   10   11   12  …   28       29
N(h):  1  2  4  7  12  20  33  54  88  143  232  376  …  832,039  1,346,268
```

That is the Fibonacci recurrence with an extra 1 (`N(h) = F(h+2) − 1`), so `N(h)` grows like `φ^h` with `φ ≈ 1.618`. Inverting, `h ≤ log_φ(n) ≈ 1.44 log₂ n`. Read the table directly: a million keys cannot reach height 29, because the sparsest tree of height 29 already needs 1,346,268 nodes, so the height is at most **28**. A perfect binary tree of a million keys has height 20, so an AVL lookup does at most 40% more comparisons than the theoretical best. A plain BST could be a million. The sparsest trees, called Fibonacci trees, are the ones that make delete expensive, and one of them is drawn in the delete section below.

## Rotations: the only tool

A rotation is a local rewrite of two nodes and three subtrees that preserves the in-order sequence (so the tree is still a valid BST) while moving one node up and the other down.

```text
Right rotation at y:            Left rotation at x:

      y                x              x                 y
     / \              / \            / \               / \
    x   C    ==>     A   y          A   y     ==>     x   C
   / \                  / \            / \           / \
  A   B                B   C          B   C         A   B
```

In-order before and after is `A x B y C` in both pictures, which is why the tree is still a valid BST afterwards. The pointers that change are `y.left`, `x.right` and the parent's link: three writes, plus two height recomputations. That is O(1) work, independent of the size of the subtrees A, B and C.

```python
def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update_height(y)      # y is now lower, fix it first
    update_height(x)
    return x              # new root of this subtree

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update_height(x)
    update_height(y)
    return y
```

The order of the two `update_height` calls matters: the node that moved down must be recomputed before the node that moved up, because the upper node's height depends on it. Swap them and every height above the rotation is stale by one, the balance factors lie, and the tree drifts out of balance without any assertion failing.

## The four insertion cases

After inserting a leaf, walk back up the path. The first node whose balance factor becomes ±2 is the lowest unbalanced node, call it `z`. Exactly four shapes are possible, named by the path from `z` to the inserted key.

| Case | Shape | `balance(z)` | Fix |
|---|---|---|---|
| **LL** | new key in `z.left.left` | +2, `balance(z.left) ≥ 0` | one right rotation at `z` |
| **RR** | new key in `z.right.right` | −2, `balance(z.right) ≤ 0` | one left rotation at `z` |
| **LR** | new key in `z.left.right` | +2, `balance(z.left) < 0` | left rotation at `z.left`, then right rotation at `z` |
| **RL** | new key in `z.right.left` | −2, `balance(z.right) > 0` | right rotation at `z.right`, then left rotation at `z` |

Trace the four with three keys each. Insert 10, 20, 30: 30 goes to `20.right`, so 10 has balance −2 and its right child has balance −1. RR. Left-rotate at 10 and 20 is the root with 10 and 30 as children. Insert 30, 20, 10: the mirror, LL, one right rotation, same result. Insert 10, 30, 20: 20 lands at `30.left`, so 10 has balance −2 but its right child 30 has balance +1. That is RL, and a single left rotation at 10 would *not* fix it (try it: 30 becomes root with 10 on its left and 20 still hanging off 10's right, height unchanged). Right-rotate at 30 first, which turns the shape into RR, then left-rotate at 10. The final tree is again 20 with children 10 and 30.

The double rotation is the part people get wrong under pressure. The rule to remember: if the heavy child leans the *same* way as its parent, one rotation; if it leans the *opposite* way, straighten the child first.

## Insert traced, with the invariant checked after every step

Insert 10, 20, 30, 40, 50, 25 in that order. The table shows each node as `key(balance)` in level order after the step, so you can check the invariant (every balance in {−1, 0, +1}) with your finger.

| Step | Insert | Where it lands | Lowest unbalanced node | Case | Rotations | Tree after (level order, `key(bf)`) | Height |
|---|---|---|---|---|---|---|---|
| 1 | 10 | root | none | | none | `10(0)` | 1 |
| 2 | 20 | `10.right` | none (10 is −1) | | none | `10(−1) 20(0)` | 2 |
| 3 | 30 | `20.right` | 10 (−2), child 20 is −1 | RR | left at 10 | `20(0) 10(0) 30(0)` | 2 |
| 4 | 40 | `30.right` | none (30 is −1, 20 is −1) | | none | `20(−1) 10(0) 30(−1) 40(0)` | 3 |
| 5 | 50 | `40.right` | 30 (−2), child 40 is −1 | RR | left at 30 | `20(−1) 10(0) 40(0) 30(0) 50(0)` | 3 |
| 6 | 25 | `30.left` | 20 (−2), child 40 is **+1** | RL | right at 40, then left at 20 | `30(0) 20(0) 40(−1) 10(0) 25(0) 50(0)` | 3 |

Step 6 is the one to study. Before it the tree is `20 → (10, 40 → (30, 50))`. 25 goes under 30's left, making 30 height 2, 40 height 3 with balance +1, and the root 20 balance `1 − 3 = −2`: right-heavy with a right child that leans *left*, the zig-zag. Right-rotate at 40 (30 comes up, 40 becomes its right child keeping 50) and the shape is now RR; left-rotate at 20 and 30 is the root with `20 → (10, 25)` on the left and `40 → (·, 50)` on the right. Level order `30, 20, 40, 10, 25, 50`, height 3 for six nodes, which is optimal. Notice that the height after step 6 (3) equals the height before the insert: that is the property that stops the fix-up from propagating further, explained below.

```viz
{"type": "tree", "algorithm": "avl-insert", "values": [10, 20, 30, 40, 50, 25], "heightUnit": "nodes",
 "title": "AVL insert with RR then RL rebalancing",
 "caption": "Inserting 30 triggers an RR rotation at 10; inserting 50 triggers RR at 30; inserting 25 triggers an RL double rotation at the root."}
```

Sorted input 1 through 7 is the other trace to be able to do blind: RR at 1 after inserting 3 (root 2), RR at 3 after 5, RR at 2 after 6 (root 4), RR at 5 after 7. Four single rotations and the result is the perfect tree `4 → (2 → (1, 3), 6 → (5, 7))`.

## Insert, in full

```python
class Node:
    __slots__ = ("key", "left", "right", "height")
    def __init__(self, key):
        self.key, self.left, self.right, self.height = key, None, None, 1

def height(n):
    return n.height if n else 0

def update_height(n):
    n.height = 1 + max(height(n.left), height(n.right))

def balance(n):
    return height(n.left) - height(n.right) if n else 0

def rebalance(node):
    b = balance(node)
    if b > 1 and balance(node.left) >= 0:    # LL (>= 0 matters for delete)
        return rotate_right(node)
    if b > 1:                                # LR
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if b < -1 and balance(node.right) <= 0:  # RR
        return rotate_left(node)
    if b < -1:                               # RL
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node

def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    else:
        return node                       # duplicates ignored
    update_height(node)
    return rebalance(node)
```

Two facts about this code that interviewers probe:

**Insert needs at most one rebalancing.** After a rotation (single or double) at the lowest unbalanced node, that subtree's height returns to what it was before the insert (step 6 above: height 3 before and after), so no ancestor can be unbalanced. Insert is O(log n) to walk down and O(log n) to update heights on the way up, but only O(1) rotations. Measured on 10⁵ random keys, about 47% of inserts trigger a rebalance, split roughly evenly between single and double rotations; the sorted-input trace above shows 4 rotations in 6 inserts because sorted input is the worst case for rotation count.

**The recursion is the parent pointer.** Returning the possibly-new subtree root from every call is how the parent's link gets updated without storing parent pointers. An iterative version needs either parent pointers (8 more bytes per node) or an explicit stack of the path (at most 91 entries even for 2⁶⁴ nodes, since `N(92)` exceeds 2⁶⁴; 45 entries cover any tree of up to 2³² nodes).

## Delete, traced rotation by rotation

Delete in a BST has three cases: leaf (unlink), one child (splice), two children (replace the key with the in-order successor, then delete the successor from the right subtree). AVL delete is the same followed by `rebalance` on the way back up.

```python
def delete(node, key):
    if node is None:
        return None
    if key < node.key:
        node.left = delete(node.left, key)
    elif key > node.key:
        node.right = delete(node.right, key)
    else:
        if node.left is None or node.right is None:
            return node.left or node.right
        succ = node.right
        while succ.left:
            succ = succ.left
        node.key = succ.key
        node.right = delete(node.right, succ.key)
    update_height(node)
    return rebalance(node)      # same four cases as insert
```

The difference from insert: **delete may need a rotation at every level.** Removing a node from the shorter subtree can shrink that subtree, which unbalances the parent; fixing the parent can shrink *its* subtree by one, which unbalances the grandparent, and so on to the root. Here it is on the sparsest tree that can trigger it, a 12-node Fibonacci tree of height 5 (drawn with `key[height, balance]`, right subtrees above left):

```text
                12[1,0]
        11[3,+1]
                10[2,+1]
                        9[1,0]
8[5,+1]
                7[2,+1]
                        6[1,0]
        5[4,+1]
                        4[1,0]
                3[3,+1]
                        2[2,+1]
                                1[1,0]
```

Every node leans left by exactly one. Delete **12**, the only leaf on the short side of the root:

| Step | Node on the path | Heights (left, right) | Balance | Action | Invariant afterwards |
|---|---|---|---|---|---|
| 1 | 12 removed | | | leaf unlinked | |
| 2 | 11 | (2, 0) | **+2**, child 10 is +1 | LL: right-rotate at 11 | subtree `10 → (9, 11)`, height 2, balances 0 0 0 |
| 3 | 8 | (4, 2) | **+2**, child 5 is +1 | LL: right-rotate at 8 | root `5 → (3 → (2 → (1, ·), 4), 8 → (7 → (6, ·), 10 → (9, 11)))`, height 4 |

Two rotations in one delete, one level apart, and the tree got one level shorter. Level order afterwards: `5, 3, 8, 2, 4, 7, 10, 1, 6, 9, 11`; check each balance: 5(0), 3(+1), 8(0), 2(+1), 4(0), 7(+1), 10(0), and every leaf 0. On a Fibonacci tree of height `h`, deleting the shallowest leaf cascades rotations up its short spine: `⌊(h − 1)/2⌋` of them for one delete, two here at `h = 5`, about `h/2` in general. Worst case O(log n) rotations, still O(log n) total, but a materially more expensive operation than insert. That asymmetry is one of the reasons [red-black trees](/learn/advanced-data-structures/balanced-trees/red-black-trees) exist: they cap delete at three rotations.

### The balance-0 case that only delete produces

After an *insert*, the heavy child of the unbalanced node always has balance ±1. After a *delete* it can have balance 0, and the code must treat that as the single-rotation case. Build `20 → (10 → (5, 15), 30)` by inserting 20, 10, 30, 5, 15, then delete 30:

| Step | Node | Heights (left, right) | Balance | Child 10's balance | Action | Result |
|---|---|---|---|---|---|---|
| 1 | 30 removed | | | | leaf unlinked | |
| 2 | 20 | (2, 0) | +2 | **0** | LL: right-rotate at 20 | `10 → (5, 20 → (15, ·))`, balances 10(−1), 5(0), 20(+1), 15(0) |

The new root has balance −1 and its height (3) is the same as before the delete, so the rotation does not shorten the subtree and nothing propagates. Now consider the ported-from-insert code you will find in several tutorials: `if b > 1 and balance(node.left) > 0: LL` and `elif b > 1 and balance(node.left) < 0: LR`. With the child at 0 *neither branch fires*, the node stays at +2, no exception is raised, and from now on the height field says 3 while the shape says otherwise. The bug is invisible until a later operation trusts a stale balance. The `>= 0` and `<= 0` in `rebalance` above exist for this case.

## Under the hood: what a node costs

The asymptotics say O(log n); the constants say whether the structure survives contact with a real machine.

**Node layout.** A C or Rust node with a 64-bit key, two 8-byte child pointers and a height needs 8 + 16 + 1 = 25 bytes, padded to **32** by alignment. Height fits in one byte (it never exceeds 92 for any tree addressable in 64 bits), and the balance factor fits in **two bits**, which is why compact implementations steal them from the low bits of a pointer (heap pointers are 8- or 16-byte aligned, so the bottom three bits are always zero) and get a 24-byte node. Measured on CPython 3.14 with `sys.getsizeof`, the `__slots__` node above is 64 bytes plus 28 for a small `int` key, about **92 bytes per key**; a class without `__slots__` costs 48 bytes for the object plus a 296-byte `__dict__`, which is why the `__slots__` line is in the code. A Java `TreeMap.Entry` (key, value, left, right, parent, colour) is 40 bytes with compressed references plus the boxed key.

**Where the time goes.** A lookup follows one pointer per level. While the tree fits in L2 cache each hop is a few nanoseconds; once it does not, each hop is a DRAM access at about 80–100 ns on a current server (the ladder is in [memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy)). A million-key AVL tree at 32 bytes per node is 32 MB, larger than most L2 and many L3 caches, so a cold lookup costs up to 28 misses, roughly 2–3 µs. A B-tree with 64-key nodes over the same keys is 4 levels and 4 misses. That factor of five to seven, not asymptotics, is why Rust's `BTreeMap`, the Linux kernel's index of memory regions (the maple tree, since 6.1) and database indexes use wide nodes; the [Rust documentation](https://doc.rust-lang.org/std/collections/struct.BTreeMap.html) gives exactly this reason, one heap allocation and one potential cache miss per BST node.

**Where AVL trees actually run.** Standard libraries went red-black (C++, Java, .NET, Linux) or B-tree (Rust). AVL trees survive in a few well-known places: OCaml's standard `Map` and `Set` are AVL trees with a deliberately relaxed rule (the [source](https://raw.githubusercontent.com/ocaml/ocaml/trunk/stdlib/map.ml) rebalances only when sibling heights differ by more than 2, trading a slightly taller tree for fewer rotations); the Windows kernel keeps each process's virtual address descriptors (VADs) in an AVL tree (`EPROCESS.VadRoot` is an `_MM_AVL_TABLE` in Windows 7 and an `_RTL_AVL_TREE` in Windows 11, according to the [layouts published from Microsoft's symbols](https://www.vergiliusproject.com/kernels/x64/windows-11/24h2/_EPROCESS)); and functional languages use path-copied AVL or weight-balanced trees (Haskell's `Data.Map` balances on subtree *size*, a cousin). Most of the time when you meet an AVL tree it is in an interview or in a codebase that predates the alternatives.

## Trade-offs: AVL against the alternatives

| | AVL | Red-black | In-memory B-tree (Rust `BTreeMap`) | Skip list | Sorted array + binary search |
|---|---|---|---|---|---|
| Height / levels for 10⁶ keys | ≤ 28 | ≤ 40 | 6–8 (at most 11 keys per node) | ~20 expected | 20 probes |
| Rotations per insert | ≤ 1 (single or double) | ≤ 2 | 0 (node splits) | 0 | O(n) shift |
| Rotations per delete | O(log n) | ≤ 3 | 0 (merges) | 0 | O(n) shift |
| Per-key overhead | 2 pointers + 1 byte (or 2 bits) | 2–3 pointers + 1 bit | under 1 pointer, plus empty slots | 1.33–2 pointers | none |
| Cache misses per lookup (cold) | ~28 | ~40 | 6–8 nodes, 1–2 lines each | ~20–40 | ~20, prefetch-friendly |
| Iterator stability across inserts | yes | yes | no | yes | no |
| Best fit | lookup-heavy, teaching, functional maps | write-heavy general purpose | large in-memory ordered maps | concurrent ordered maps | static or rarely-changing data |

AVL trees are shorter, so lookups touch fewer nodes. Red-black trees rotate less on delete and their rebalancing is cheaper in the average case, which is why `std::map`, Java's `TreeMap` and the Linux kernel's `rb_tree` chose red-black. For a workload that is 95% reads the AVL tree wins by a few percent; for anything write-heavy the red-black tree wins by more; and once the data outgrows the cache both lose to the B-tree by the miss count in the table. The [ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps) lesson covers the decision one level up: whether you need order at all.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| `RecursionError` (Python) or a stack overflow (Java, Go with small stacks) after loading a sorted file into a home-grown BST | The tree is not balanced: sorted input made it a chain, and the recursive insert is `n` frames deep. Log the height; if it is anywhere near `n` you have a chain | Use a balancing tree, or the language's ordered map, or sort once and binary-search |
| Lookups get slower over weeks in a long-running process even though the AVL invariant holds | Heights are right but the tree is now larger than cache; every level is a DRAM miss. `perf` shows the time in pointer loads, not comparisons | Switch to a B-tree-shaped container (`BTreeMap`, a sorted block list), or shrink keys so more nodes fit per cache line |
| Balance factors say the tree is fine but a traversal shows a chain | Stale heights: `update_height` was called in the wrong order after a rotation, or the LL/RR test used `> 0` instead of `>= 0` so a delete left a +2 node untouched | Assert the invariant in tests with a recursive checker (`abs(h(l) − h(r)) ≤ 1` and `height == 1 + max`) after every operation on random workloads |
| Keys disappear: `insert(k)` returns but `find(k)` fails, only for some keys | The comparator is inconsistent: `float('nan')` keys (every comparison is false, so the key is treated as a duplicate of the root), or an object whose `__lt__` is not a strict weak ordering, or keys mutated in place after insertion | Validate keys at the boundary; never mutate a key while it is in the tree; compare with a total order |
| A multiset use case silently loses entries | `insert` ignores duplicates (the `else: return node` branch) and the caller assumed a count | Store a count in the node, or key by `(value, sequence_number)` |
| GC pauses grow with the map size (JVM) | Millions of small `Entry` objects are a long-lived object graph the collector must trace on every old-generation cycle | Primitive-specialised collections (fastutil, Eclipse Collections) or an array-backed B-tree with far fewer objects |

## Interviewer follow-ups

**"Insert 1 through 7 in order into an AVL tree and draw it."** Model answer: rotations happen after inserting 3, 5, 6 and 7 (all RR), and the result is the perfect tree `4 → (2 → (1, 3), 6 → (5, 7))`. Common wrong answer: drawing a chain or forgetting the rotation at 2 after inserting 6, which leaves 2 as the root with a right subtree of height 3.

**"Why not skip rotations and rebuild the tree into a perfect one every k inserts?"** Model answer: a rebuild is O(n) and between rebuilds the height is unbounded, so worst-case lookups are O(n) again; amortised the cost is O(n/k) per insert, which is not O(log n) for any constant k. Scapegoat trees make a version of this idea work by rebuilding only the smallest unbalanced subtree, giving O(log n) amortised with no per-node balance data. Common wrong answer: "rebuild every time the height exceeds 2 log n", which does bound the height but costs O(n) per trigger and triggers constantly under sorted input.

**"How would you support `kth_smallest(k)` and `rank(key)` in O(log n)?"** Model answer: store the subtree size in every node, update it on the way back up exactly like the height, and fix the two nodes touched by each rotation (the one that moved down is recomputed first, then the one that moved up, same as heights). Then `kth_smallest` descends comparing `k` with `size(left) + 1`. Common wrong answer: an in-order traversal to the k-th element, which is O(k), or keeping a separate sorted array that costs O(n) to maintain.

**"Can you store the balance factor in 2 bits instead of a height byte, and what changes?"** Model answer: yes, since it only takes the values −1, 0, +1; insert can update it from the direction it came from without knowing heights (if the balance goes to 0 the height did not change and you stop early). The price is that delete's logic becomes harder to get right because you can no longer recompute heights from scratch, which is why the teaching version stores heights. Common wrong answer: "no, you need the height to compute the balance".

**"When would you choose AVL over red-black?"** Model answer: a lookup-dominated workload where the data fits in cache, or a functional/persistent map where the simpler rebalancing (four cases, no colour bookkeeping across path copies) matters more than rotation count; otherwise red-black or, for anything large, a B-tree. Common wrong answer: "AVL is always faster because it is more balanced", which ignores the O(log n) rotations on delete and the cache argument.

## What mid-level engineers get wrong

- **Testing only insert.** The `balance(child) == 0` case cannot occur after an insert, so an insert-only test suite passes a `rebalance` that silently fails on delete.
- **Calling `update_height` on the upper node first** after a rotation. Every height above is then off by one and the tree slowly unbalances with no error.
- **Quoting "O(log n)" as the whole story** for a 50-million-key in-memory index, and being surprised by 2–3 µs lookups; the pointer-per-level miss count is the real cost past cache size.
- **Reaching for a balanced BST when a sorted array or a hash map would do.** Static data wants a sorted array; unordered lookups want a hash map at a fifth of the memory.
- **Using floats or mutable objects as keys** and then debugging "the key is there but `find` can't see it".
- **Treating duplicates as a non-issue.** The textbook insert ignores them; a leaderboard with tied scores needs a count or a compound key.

## Exercises

```exercise
id: avl-level-order
title: Build an AVL tree and return its level order
prompt: |
  Implement `avl_level_order(values)`: insert the distinct integers in
  `values` one at a time into an initially empty AVL tree, rebalancing after
  each insert with the four rotation cases, and return the final tree's keys
  in level order (breadth-first, left to right).

  Balance factor is `height(left) − height(right)`; a leaf has height 1. Use
  `>=`/`<=` on the child's balance for the single-rotation cases.
languages: [python, javascript]
entry: avl_level_order
starter:
  python: |
    class Node:
        def __init__(self, key):
            self.key = key
            self.left = None
            self.right = None
            self.height = 1

    def height(n):
        return n.height if n else 0

    def insert(node, key):
        # TODO: BST insert, update height, then rebalance (LL, LR, RR, RL)
        return node

    def avl_level_order(values):
        root = None
        for v in values:
            root = insert(root, v)
        # TODO: breadth-first traversal of root
        return []
  javascript: |
    class Node {
      constructor(key) { this.key = key; this.left = null; this.right = null; this.height = 1; }
    }
    function height(n) { return n ? n.height : 0; }

    function insert(node, key) {
      // TODO: BST insert, update height, then rebalance (LL, LR, RR, RL)
      return node;
    }

    function avl_level_order(values) {
      let root = null;
      for (const v of values) root = insert(root, v);
      // TODO: breadth-first traversal of root
      return [];
    }
tests:
  - args: [[10, 20, 30]]
    expected: [20, 10, 30]
    label: RR single rotation
  - args: [[30, 20, 10]]
    expected: [20, 10, 30]
    label: LL single rotation
  - args: [[10, 30, 20]]
    expected: [20, 10, 30]
    label: RL double rotation
  - args: [[30, 10, 20]]
    expected: [20, 10, 30]
    label: LR double rotation
  - args: [[1, 2, 3, 4, 5, 6, 7]]
    expected: [4, 2, 6, 1, 3, 5, 7]
    label: sorted input becomes a perfect tree
  - args: [[]]
    expected: []
    label: empty
  - args: [[10, 20, 30, 40, 50, 25]]
    expected: [30, 20, 40, 10, 25, 50]
    hidden: true
    label: RL at the root after earlier rotations
  - args: [[50, 40, 60, 30, 45, 20]]
    expected: [40, 30, 50, 20, 45, 60]
    hidden: true
    label: LL at the root with a full sibling
hints:
  - "Return the (possibly new) subtree root from `insert` and assign it back: `node.left = insert(node.left, key)`."
  - "After a rotation recompute the height of the node that moved down before the node that moved up."
  - "For the double rotation cases, rotate the child first so the shape becomes the single-rotation case, then rotate the node."
```

```exercise
id: avl-after-deletes
title: AVL delete with cascading rebalance
prompt: |
  Implement `avl_after_deletes(inserts, deletes)`: insert the distinct
  integers in `inserts` in order into an empty AVL tree, then delete each key
  in `deletes` in order (a key that is absent is ignored), rebalancing after
  every operation. Return the final tree's keys in level order.

  Use the in-order successor when deleting a node with two children. Handle
  the heavy child having balance 0 as a single rotation (`>=` / `<=`).
languages: [python, javascript]
entry: avl_after_deletes
starter:
  python: |
    class Node:
        def __init__(self, key):
            self.key = key
            self.left = None
            self.right = None
            self.height = 1

    def height(n):
        return n.height if n else 0

    def rebalance(node):
        # TODO: the four cases; return the new subtree root
        return node

    def insert(node, key):
        # TODO
        return node

    def delete(node, key):
        # TODO: BST delete, then update height and rebalance
        return node

    def avl_after_deletes(inserts, deletes):
        root = None
        for v in inserts:
            root = insert(root, v)
        for v in deletes:
            root = delete(root, v)
        # TODO: level order
        return []
  javascript: |
    class Node {
      constructor(key) { this.key = key; this.left = null; this.right = null; this.height = 1; }
    }
    function height(n) { return n ? n.height : 0; }
    function rebalance(node) {
      // TODO: the four cases; return the new subtree root
      return node;
    }
    function insert(node, key) {
      // TODO
      return node;
    }
    function del(node, key) {
      // TODO: BST delete, then update height and rebalance
      return node;
    }
    function avl_after_deletes(inserts, deletes) {
      let root = null;
      for (const v of inserts) root = insert(root, v);
      for (const v of deletes) root = del(root, v);
      // TODO: level order
      return [];
    }
tests:
  - args: [[10, 20, 30], [10]]
    expected: [20, 30]
    label: delete a leaf, no rotation
  - args: [[20, 10, 30, 5, 15], [30]]
    expected: [10, 5, 20, 15]
    label: heavy child with balance 0 needs a single rotation
  - args: [[1, 2, 3, 4, 5, 6, 7], [1, 2, 3]]
    expected: [6, 4, 7, 5]
    label: deletes that shorten the left side
  - args: [[50, 30, 70, 20, 40, 60, 80, 10], [60, 70, 80]]
    expected: [30, 20, 50, 10, 40]
    label: one-child delete followed by an LL rotation at the root
  - args: [[], []]
    expected: []
    label: empty
  - args: [[10, 20, 30], [99]]
    expected: [20, 10, 30]
    hidden: true
    label: deleting an absent key changes nothing
  - args: [[5], [5]]
    expected: []
    hidden: true
    label: deleting the only node
  - args: [[8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15], [8]]
    expected: [9, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 11, 13, 15]
    hidden: true
    label: root with two children is replaced by its successor
hints:
  - "Write `rebalance(node)` once and call it at the end of both `insert` and `delete`, after `update_height`."
  - "Two-children delete: find the leftmost node of the right subtree, copy its key into `node`, then delete that key from the right subtree."
  - "`if node.left is None or node.right is None: return node.left or node.right` handles the leaf and one-child cases together."
```

## Senior signals

- You state the AVL invariant as a **balance-factor rule** and can derive the 1.44 log n height bound from the Fibonacci recurrence, and read "a million keys means height at most 28" off the `N(h)` table.
- You know the four cases by shape and the rule for choosing single versus double rotation: same direction, one rotation; opposite direction, two.
- You know that insert needs **at most one** rebalancing because the subtree regains its pre-insert height, that delete can cascade **O(log n) rotations** (the Fibonacci tree is the witness), and that this asymmetry is why libraries chose red-black.
- You check the `balance(child) == 0` edge case in delete and know that a `> 0` test silently leaves the tree unbalanced.
- You can quote a node's cost (32 bytes in C, ~92 bytes per key in CPython) and say that past cache size a lookup is ~28 DRAM misses versus 4 for a B-tree, and that this, not big-O, decides the structure at scale.
- You know where AVL trees still run (OCaml's `Map`, the Windows kernel VAD tree) and that most ordered containers went red-black or B-tree.
- In an interview you offer "a balanced BST such as AVL or red-black, O(log n) per operation" as the ordered-map tool, then immediately ask whether a sorted array plus binary search or a hash map would do, because those are cheaper when they fit.

## Check yourself

```quiz
- q: >-
    An AVL tree has 1,000,000 keys. Which statement about its height h is guaranteed?
  options: ["h is at most 28 levels", "h can reach 1,000,000 on sorted input", "h is exactly 20, as in a perfect tree", "h is at most 40 levels"]
  answer: 0
  explanation: >-
    The sparsest AVL tree of height 29 needs N(29) = 1,346,268 nodes, more than a million, so the height is at most 28 (1.44 log₂ n ≈ 28.7 says the same). A perfect tree would be 20 but AVL does not guarantee perfection; 40 is the red-black bound; a million is the unbalanced BST worst case that AVL exists to prevent.
- q: >-
    After inserting a key, the lowest unbalanced node z has balance −2 and z.right has balance +1. What fixes it?
  options: ["Left-rotate z.right, then right-rotate z", "Right-rotate z once, since z.right leans left", "Right-rotate z.right, then left-rotate z", "Left-rotate z once, since z is right-heavy"]
  answer: 2
  explanation: >-
    Balance −2 means right-heavy; the right child leaning left (+1) is the RL case. A single left rotation at z, the tempting fix, moves the zig-zag to the other side and leaves the tree unbalanced. Straighten the child with a right rotation first, then left-rotate at z.
- q: >-
    Why can an AVL delete cost O(log n) rotations while an insert needs at most one rebalancing?
  options: ["Insert never changes the heights of the ancestors above the new leaf", "A two-child delete unbalances both subtrees, so each needs its own rotation", "Delete must also rebalance the successor's old subtree as a separate pass", "A post-delete rotation can shorten the subtree and unbalance its parent"]
  answer: 3
  explanation: >-
    After an insert, the rebalanced subtree has the same height it had before the insert, so ancestors are unaffected. After a delete, fixing one node can leave its subtree one shorter, which can unbalance the parent, and so on up to the root, as the Fibonacci-tree trace shows with two rotations. Insert does change ancestor heights on the way up; it is the rotation that restores the pre-insert height and stops the propagation.
- q: >-
    You insert the keys 1 through 7 in order into an AVL tree. What is the root?
  options: ["1, which was inserted first", "It varies with rotation tie-breaking", "7, which was inserted last", "4, with 2 and 6 as its children"]
  answer: 3
  explanation: >-
    Sorted input triggers RR rotations at 1 (after 3), at 3 (after 5), at 2 (after 6), and at 5 (after 7), producing the perfect tree 4 → (2 → (1, 3), 6 → (5, 7)). The result is deterministic: each case has exactly one fix, so there is nothing to break ties on.
- q: >-
    A delete leaves node z with balance +2 and z.left with balance 0. The rebalance code tests `balance(z.left) > 0` for LL and `balance(z.left) < 0` for LR. What happens?
  options: ["The LL branch runs, because 0 counts as leaning left", "The LR branch runs and produces a valid but taller tree", "An exception is raised when the heights are recomputed", "Neither branch runs and z stays unbalanced with no error"]
  answer: 3
  explanation: >-
    Balance 0 satisfies neither strict test, so the function returns z unchanged at +2 and the invariant is silently broken; nothing in the code checks heights against the shape. The case never arises after an insert, which is why insert-only tests miss it. The correct test is `>= 0` for the single rotation.
- q: >-
    A service keeps 50 million timestamped events in memory and does range queries constantly, with occasional inserts. A colleague proposes an AVL tree. What is the strongest objection?
  options: ["A red-black tree is shorter, so its reads would be faster", "The per-node height field makes AVL trees too memory-hungry", "An in-memory B-tree needs far fewer cache misses per lookup", "AVL trees cannot answer range queries without a second index"]
  answer: 2
  explanation: >-
    Every AVL level costs a pointer dereference and, once the tree exceeds cache, a DRAM miss: about 36 of them for 50 million keys. A B-tree with 64-key nodes holds many keys per node and needs about 5. Range queries work fine on any BST via in-order traversal; red-black trees are slightly taller, not shorter, so they are not faster for reads.
```

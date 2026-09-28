---
slug: binary-search-trees
title: "Binary search trees: the invariant and what breaks it"
description: Search, insert and the three-case delete, why inorder is sorted, how to validate a BST without the classic bug, and why sorted input turns O(log n) into O(n).
minutes: 45
difficulty: medium
tags: [trees, bst, binary-search-tree, validation, deletion]
problems: [validate-bst, lowest-common-ancestor-bst, kth-smallest-bst]
---
A hash table finds a key in O(1) but cannot tell you the smallest key, the next key after 42, or every key between 100 and 200. A sorted array answers all of those with binary search but costs O(n) to insert into. You want both: ordered queries *and* cheap updates. The binary search tree is the structure that gives you both at O(h), and the entire engineering question is what h turns out to be.

## The invariant

A binary search tree is a binary tree where, for every node, every key in its left subtree is smaller than the node's key and every key in its right subtree is larger. Not the children: the *entire* subtrees. That distinction is the source of the most common BST bug and it comes up again below.

The tree used for every trace in this lesson is built by inserting 50, 30, 70, 20, 40, 60, 80, 35 in that order:

```text
            50
          /    \
        30      70
       /  \    /  \
     20   40  60  80
          /
        35
```

Because of the invariant, an inorder traversal (left, node, right) visits keys in ascending order: 20 30 35 40 50 60 70 80. That single fact gives you sorted iteration, min and max (leftmost and rightmost node), k-th smallest (k-th visited), successor and predecessor, and range queries, all from one walk.

### Duplicates need a policy

The invariant as stated forbids equal keys. Real code must decide where they go, and the decision has to be the same in insert, delete and validate:

| Policy | Insert rule | Consequence |
|---|---|---|
| Forbid (a set) | Equal key: return or overwrite the value | Simplest; what every ordered map does with its keys |
| Count per node | Equal key: `node.count += 1` | Multiset semantics with one node per distinct key; delete decrements first |
| Equal keys to one side | `<` goes left, `>=` goes right (or the mirror) | Cheapest to write, but the tree can hold a chain of equal keys, and validation must use the same `<=` on the same side |

The third policy is where validators go wrong: a checker that demands strict `lo < v < hi` rejects a tree the insert code built. Write the interview answer as "no duplicates, and here is the one-line change if they go right".

## Search and insert

Search compares the target with the current node and goes left or right, discarding a whole subtree each step:

```python
def search(node, key):
    while node is not None and node.val != key:
        node = node.left if key < node.val else node.right
    return node          # None if absent
```

Searching for 35 in the tree above: at 50, 35 < 50, go left; at 30, 35 > 30, go right; at 40, 35 < 40, go left; at 35, equal, found. Four nodes touched, seven comparisons if you count the equality test and the ordering test separately, which is what the loop above does. Searching for 36 follows the identical path and then steps from 35 to its right child, which is `None`: absence is discovered only when you fall off the tree, never earlier.

Insert is the same walk, followed by attaching a new leaf where the search fell off. New keys always become leaves; the existing structure is never rearranged.

```python
def insert(node, key):
    if node is None:
        return BTNode(key)
    if key < node.val:
        node.left = insert(node.left, key)
    elif key > node.val:
        node.right = insert(node.right, key)
    return node          # duplicate: ignored
```

The recursive form returns the (possibly new) subtree root and the parent reassigns its child pointer; that pattern ("return the new subtree root") is the standard way to write tree mutations without parent pointers, and delete uses it too.

### Hand trace: eight inserts

| Insert | Compared against | Attached as | Tree after (level order) |
|---|---|---|---|
| 50 | | root | [50] |
| 30 | 50 | left of 50 | [50, 30] |
| 70 | 50 | right of 50 | [50, 30, 70] |
| 20 | 50, 30 | left of 30 | [50, 30, 70, 20] |
| 40 | 50, 30 | right of 30 | [50, 30, 70, 20, 40] |
| 60 | 50, 70 | left of 70 | [50, 30, 70, 20, 40, 60] |
| 80 | 50, 70 | right of 70 | [50, 30, 70, 20, 40, 60, 80] |
| 35 | 50, 30, 40 | left of 40 | [50, 30, 70, 20, 40, 60, 80, null, null, 35] |

```text
after 50     after 30     after 70      after 20       after 40
   50          50           50            50             50
              /            /  \          /  \           /  \
            30           30    70      30    70       30    70
                                      /              /  \
                                    20             20    40

after 60          after 80           after 35
    50                50                 50
   /  \              /  \               /  \
 30    70          30    70           30    70
/  \   /          /  \   /  \        /  \   /  \
20  40 60       20  40  60  80     20  40  60  80
                                        /
                                      35
```

Thirteen comparisons in total for eight keys, and the first key becomes the root forever: the *insertion order* determines the shape. Watch the visualiser build the nine-key tree from the fundamentals lesson the same way.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13],
 "title": "Building a BST by insertion", "caption": "Each key walks down from the root and becomes a new leaf. The shape is decided by the order the keys arrive."}
```

## Delete: the three cases

Deletion is where BST code gets hard, because removing an internal node leaves a hole that must be filled without breaking the invariant. Find the node, then:

1. **Leaf.** Remove it; set the parent's pointer to null.
2. **One child.** Splice it out: the parent points at the child instead. The invariant holds because the child's whole subtree was already on the correct side of the parent.
3. **Two children.** You cannot remove the node without orphaning a subtree, so replace its *value* with the in-order successor (the minimum of the right subtree), then delete that successor node from the right subtree. The successor has no left child by definition, so that second deletion is case 1 or 2, never case 3 again.

```python
def delete(node, key):
    if node is None:
        return None
    if key < node.val:
        node.left = delete(node.left, key)
    elif key > node.val:
        node.right = delete(node.right, key)
    else:
        if node.left is None:  return node.right        # cases 1 and 2
        if node.right is None: return node.left
        succ = node.right                                # case 3
        while succ.left is not None:
            succ = succ.left
        node.val = succ.val
        node.right = delete(node.right, succ.val)        # now a case-1 or case-2 delete
    return node
```

Note that case 1 is not written separately: a leaf has no left child, so `return node.right` returns `None`, which is what the parent should now point at.

### Hand trace: three deletes in sequence

Start from the eight-key tree. Delete 20, a leaf; then 40, which now has one child; then 50, the root, which has two.

| Delete | Case | What happens | Tree after (level order) | Inorder after |
|---|---|---|---|---|
| 20 | leaf | 30.left becomes None | [50, 30, 70, null, 40, 60, 80, 35] | 30 35 40 50 60 70 80 |
| 40 | one child | 30.right becomes 35, spliced up one level | [50, 30, 70, null, 35, 60, 80] | 30 35 50 60 70 80 |
| 50 | two children | successor walk 70 → 60 stops at 60 (no left child); copy 60 into the root; delete 60 from the right subtree (a leaf) | [60, 30, 70, null, 35, null, 80] | 30 35 60 70 80 |

```text
start           after del 20     after del 40     after del 50
    50              50               50               60
   /  \            /  \             /  \             /  \
 30    70        30    70         30    70         30    70
/  \   /  \        \   /  \         \   /  \         \      \
20 40 60  80       40 60  80        35 60  80        35      80
   /               /
  35              35
```

The inorder sequence stays sorted after every step, which is the check to run in your head after any mutation. Cost is O(h) to find the node plus O(h) for the successor walk, so O(h) overall.

### Predecessor instead of successor, and why to alternate

Case 3 could equally copy the in-order *predecessor* (maximum of the left subtree) and delete that. Deleting 50 from the original tree both ways:

```text
successor (60 replaces 50)      predecessor (40 replaces 50)
        60                              40
       /  \                            /  \
     30    70                        30    70
    /  \     \                      /  \   /  \
  20   40    80                   20   35 60  80
       /
     35
```

With the successor, 60 is removed from a subtree of three nodes; with the predecessor, 40 is removed and its one child 35 is spliced up, so the left subtree loses a level. Always choosing the successor takes nodes from right subtrees only, and over a long sequence of random inserts and deletes that asymmetry skews the tree: experiments and analysis from the 1980s (Eppinger; Culberson) found the average depth growing over time under successor-only deletion, on the order of √n in the models analysed, while choosing successor and predecessor symmetrically (alternating, or at random) kept it logarithmic. Almost nobody implements the alternation, because almost nobody ships an unbalanced BST; the balanced structures in the [next lesson](/learn/data-structures/trees/balanced-trees) fix the shape after every delete instead.

```viz
{"type": "tree", "algorithm": "bst-delete", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13], "target": 3,
 "title": "Deleting a node with two children", "caption": "The in-order successor (leftmost node of the right subtree) replaces the deleted value, then is itself removed from where it sat."}
```

## Validation: the bug everyone writes first

"Is this tree a valid BST?" is asked constantly because the obvious solution is wrong. The obvious solution checks each node against its children:

```python
def is_bst_wrong(node):
    if node is None:
        return True
    if node.left and node.left.val >= node.val:  return False
    if node.right and node.right.val <= node.val: return False
    return is_bst_wrong(node.left) and is_bst_wrong(node.right)
```

It accepts this tree, `[10, 5, 15, null, null, 6, 20]`:

```text
      10
     /  \
    5    15
        /  \
       6    20
```

Every parent-child pair is consistent, but 6 sits in the right subtree of 10 and is smaller than 10. The damage is concrete: `search(6)` goes left at 10 (6 < 10), right at 5, and hits `None`. The tree *contains* 6 and cannot find it. Inorder gives 5 10 6 15 20, unsorted, so every ordered operation is wrong too.

### The (lo, hi) bound method

The correct condition is the invariant as stated: every node must lie within the range established by *all* its ancestors. Pass the range down; going left tightens the upper bound to the current value, going right tightens the lower bound.

```python
def is_bst(node, lo=None, hi=None):           # None means "no bound"
    if node is None:
        return True
    if lo is not None and node.val <= lo: return False
    if hi is not None and node.val >= hi: return False
    return is_bst(node.left, lo, node.val) and is_bst(node.right, node.val, hi)
```

| Visit | lo | hi | Check | Result |
|---|---|---|---|---|
| 10 | none | none | always passes | ok |
| 5 | none | 10 | 5 < 10 | ok |
| 15 | 10 | none | 15 > 10 | ok |
| 6 | 10 | 15 | 6 > 10 fails | **invalid** |

On the good eight-key tree the same walk visits 50 (none, none), 30 (none, 50), 20 (none, 30), 40 (30, 50), 35 (30, 40), 70 (50, none), 60 (50, 70), 80 (70, none), and every key sits inside its window. Using `None` for "no bound" rather than a sentinel matters: a sentinel like −2³¹ − 1 fails when keys can equal the integer limits, and infinities fail when keys are not numbers.

### The inorder-with-previous method

Walk inorder and check that each value is strictly greater than the one before, using the iterative stack so a deep tree does not overflow:

```python
def is_bst_inorder(root):
    stack, node, prev = [], root, None
    while stack or node:
        while node:
            stack.append(node); node = node.left
        node = stack.pop()
        if prev is not None and node.val <= prev:
            return False
        prev = node.val
        node = node.right
    return True
```

On the bad tree: visit 5 (prev none), 10 (5 < 10), 6 (10 ≤ 6 fails after three visits). Both methods are O(n) time and O(h) space and both stop at the first violation; the bounds method is easier to adapt to a duplicate policy, the inorder method reuses the iterator you already have.

### Duplicates and the `<=`

With the "equal keys go left" policy the bound check becomes `lo < v <= hi`. Then `[2, 2]` (a 2 with a left child 2) validates and `[2, null, 2]` does not; with strict bounds both fail. Whichever side the insert code chooses, the validator must use the non-strict comparison on exactly that side, or it rejects trees the insert built. Ask the interviewer which policy they want before writing the comparison.

```viz
{"type": "tree", "algorithm": "validate-bst", "values": [10, 5, 15, 6, 20],
 "title": "Validating with ancestor bounds", "caption": "The visualiser inserts the values as a BST, then checks each node against the (lo, hi) range inherited from its ancestors."}
```

## The degenerate tree

Everything above is O(h). Insert the keys 1, 2, 3, …, n in order and every key is larger than everything before it, so every insertion goes right:

| Insert | Path compared | Depth of new node |
|---|---|---|
| 1 | | 0 |
| 2 | 1 | 1 |
| 3 | 1, 2 | 2 |
| 4 | 1, 2, 3 | 3 |
| 5 | 1, 2, 3, 4 | 4 |
| 6 | 1, 2, 3, 4, 5 | 5 |
| 7 | 1, 2, 3, 4, 5, 6 | 6 |

Twenty-one comparisons for seven keys: n(n − 1)/2 in general, which for a million sorted keys is 5 × 10^11, and the finished tree is a chain of height n − 1. Search, insert and delete are now O(n), and the recursive `insert` and `delete` above overflow the stack at depth 1,000 in CPython long before the million is reached.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [1, 2, 3, 4, 5, 6, 7],
 "title": "Sorted input builds a chain", "caption": "Each new key is the largest so far, so it always goes right. Height is n - 1 and every operation degrades to O(n)."}
```

This is not a contrived case. Auto-incrementing IDs, timestamps, log lines, sorted exports and anything already ordered by the producer will do this to a naive BST.

### Random order is fine; production order is not random

For keys inserted in uniformly random order the asymptotic results are that the average node depth is about 2 ln n and the height about 4.31 ln n (the constant is Devroye's; a negative lower-order term brings the height down for practical n). For n = 10^6, 2 ln n ≈ 27.6 and 4.31 ln n ≈ 60. One simulated shuffle of 10^6 keys, inserted with the code above, gave an average depth of 24.2 and a height of 49, against a balanced tree's 19 and a chain's 999,999. So a random-order BST is only about 1.3 times deeper than optimal on average, and a search in it costs about 25 comparisons, not a million. The point is who controls the order: production data is rarely random, and a BST whose performance depends on the order clients send keys is a latent incident.

There are three responses: shuffle the input before bulk-loading (only works offline), build from a sorted array by recursively picking the middle element (perfectly balanced, O(n), also only offline), or use a self-balancing tree that restructures on every insert and delete, which is the [next lesson](/learn/data-structures/trees/balanced-trees). Every standard library ordered map is self-balancing; nobody ships a plain BST.

## Ordered operations the hash table cannot do

Given the invariant, each of these is a short walk:

| Query | Method | Cost |
|---|---|---|
| min / max | Leftmost / rightmost node | O(h) |
| floor(x): largest key ≤ x | Walk down; record the node each time you go right | O(h) |
| ceiling(x): smallest key ≥ x | Walk down; record the node each time you go left | O(h) |
| successor of a key | Min of its right subtree, else the last ancestor you went left from | O(h) |
| k-th smallest | Inorder, stop after k; or store subtree sizes and navigate | O(h + k), or O(h) with sizes |
| range [a, b] | Inorder, prune subtrees entirely outside the range | O(h + output) |

### Trace: successor without parent pointers

Search from the root, remembering the last node where you turned left; that node is the successor unless the key has a right subtree.

| successor of | Walk | Answer |
|---|---|---|
| 35 | 50: turn left, candidate 50; 30: turn right; 40: turn left, candidate 40; 35: found, no right subtree | 40 |
| 40 | 50: candidate 50; 30: right; 40: found, no right subtree | 50 |
| 50 | 50: found, has right subtree; min of it: 70 → 60 | 60 |
| 80 | 50: right; 70: right; 80: found, no right subtree, no candidate | none: 80 is the maximum |

`floor(45)` is the same walk recording right turns: 50 (left), 30 (right, candidate 30), 40 (right, candidate 40), then `None`; answer 40.

### Order statistics with subtree sizes

Store `size` in each node and maintain it on insert and delete. Then k-th smallest is a descent: if the left subtree has s nodes, the answer is in the left subtree when k ≤ s, is this node when k = s + 1, and is the (k − s − 1)-th of the right subtree otherwise. The 4th smallest of the eight-key tree: at 50 the left size is 4 and k = 4 ≤ 4, go left; at 30 the left size is 1 and k = 4 > 2, so k becomes 2 and go right; at 40 the left size is 1 and k = 2 = 1 + 1, answer 40. Three nodes instead of a four-element inorder walk, and O(h) however large k is. The same field gives rank(x), the number of keys less than x, in one descent, and range count [a, b] as rank(b + 1) − rank(a). This is an **order-statistic tree**, and it is the follow-up to `kth-smallest-bst`: "now the tree is modified frequently and you need k-th smallest repeatedly".

## Under the hood: where BSTs actually live

Nobody ships the plain BST, but its descendants are everywhere, and the per-node arithmetic explains each design choice.

**Java `TreeMap` and C++ `std::map` are red-black trees with parent pointers.** A `TreeMap.Entry` holds key, value, left, right, parent and a boolean colour: 12-byte header + 5 × 4-byte compressed references + 1 byte = 33, padded to 40 bytes, plus the separately allocated key and value objects (a boxed `Integer` is 16 bytes). libstdc++'s node is a 4-byte colour padded to 8, three 8-byte pointers and the `pair<const K, V>`: 40 bytes for `map<int, int>`, 48 with glibc's malloc header and rounding. A million entries is 40–50 MB of nodes, each a separate allocation. The parent pointer is what makes the iterator stackless and O(1) amortised, as the [traversals lesson](/learn/data-structures/trees/binary-tree-traversals) showed.

**Rust's `BTreeMap` is a B-tree on purpose.** Its nodes hold up to 11 keys (B = 6, capacity 2B − 1), so a leaf of `(u32, u32)` pairs is about 100 bytes by the layout arithmetic (8-byte parent pointer, two 2-byte counters, 11 keys, 11 values), two cache lines, and an internal node adds 12 child pointers. A lookup in a million entries visits about 6–7 nodes instead of 20-plus, each node's keys are scanned linearly inside one or two cache lines, and the allocation count drops by an order of magnitude. The standard library chose this over a red-black tree because DRAM misses, not comparisons, dominate an in-memory ordered map.

**The Linux kernel's `rbtree`** is an intrusive red-black tree used wherever the kernel needs an ordered set with cheap updates: the scheduler's run queue (the CFS timeline keyed by virtual runtime, and still an rbtree, augmented with a subtree minimum, under the EEVDF scheduler in recent kernels), epoll's set of monitored file descriptors, high-resolution timers ordered by expiry, the deadline I/O scheduler's sorted request lists, and, historically, the lookup of a process's memory mappings (VMAs), which moved to the maple tree in 6.1 because a tree of pointer-linked 2-child nodes was too cache-hostile for that workload.

### Cache misses per lookup, million keys

| Structure | Levels touched | Cached top | Likely DRAM misses | Notes |
|---|---|---|---|---|
| Red-black tree, 40-byte nodes | 20–25 (worst-case bound 2 log₂ n ≈ 40) | top ~12 levels, ~190 KB, fit in L2 | ~10, about 1 µs at ~100 ns each | One dependent load per level; allocation order scatters nodes |
| Sorted array binary search | 20 probes | first ~12 probe positions shared by every search | ~4–5 | Last 4 probes fall inside one 64-byte line |
| B-tree, 11-key nodes (`BTreeMap`) | 6–7 | top 3 levels | ~4 | Each node is 1–2 lines; keys scanned linearly |
| B+-tree on disk, 4 KB pages, ~200 keys per page | 3–4 | root and second level in the buffer pool | 1–2 page reads, ~100 µs on NVMe, ~10 ms on spinning disk | Why databases never use binary nodes |

The miss counts are estimates: they depend on node size, allocation locality, the cache sizes of the machine and whether the workload keeps the top levels warm. The ordering between the rows is robust; the exact numbers are not.

Elsewhere: Redis sorted sets pair a hash table with a skip list, a randomised structure with the same O(log n) ordered operations and simpler concurrent updates. Python has no balanced tree in the standard library; use `bisect` on a sorted list (O(n) insert, but the memmove of 10^5 pointers is under 100 µs, so it wins below about 10^5 elements) or the third-party `sortedcontainers`.

## Trade-offs across ordered structures

| Structure | Lookup | Insert | Ordered queries | Memory per entry | Shape guarantee |
|---|---|---|---|---|---|
| Plain BST | O(h): 20 comparisons balanced, 10^6 on a chain | O(h) | Yes | ~24 B + value | None: depends on insertion order |
| Red-black tree (`TreeMap`, `std::map`) | O(log n), height ≤ 2 log₂(n + 1) | O(log n), ≤ 2 rotations | Yes | 40–48 B + key and value | Always |
| B-tree (`BTreeMap`) | O(log n), 6–7 node visits at 10^6 | O(log n), occasional split | Yes | ~13 B per pair at 75% fill | Always |
| Sorted array + binary search | O(log n), fewest misses | O(n) memmove | Yes | 0 overhead | n/a |
| Hash table | O(1) expected | O(1) amortised | No | ~8–24 B + key and value | n/a |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Lookups in a hand-rolled BST are fast in staging and get slower every day in production; p99 grows linearly with the key count | Keys arrive in sorted order (IDs, timestamps), so the tree is a chain; measure its height, and compare with log₂ n | A balanced tree or the library's ordered map; if the structure is loaded once, build it from the sorted input by middle-element recursion |
| Java `TreeMap` reports `containsKey` false for a key that `keySet()` prints; entries vanish or duplicate | The comparator is inconsistent (not transitive, changes over time, depends on a mutable field, or compares `double` values with NaN), so the invariant does not hold and searches turn the wrong way | Make the comparator a total order on immutable fields; never mutate a key after insertion; test with a randomised consistency check |
| `RecursionError` or a stack overflow from `insert`/`delete` on a large import | Recursive tree mutation on a chain-shaped tree, depth n | Iterative insert (walk down holding the parent); a balanced tree so the depth is logarithmic |
| A multiset built on "equal keys go right" loses or double-counts elements | Delete or validate assumed no duplicates, so equal keys sitting in the right subtree are skipped or rejected | One duplicate policy shared by insert, delete and validation; prefer a count per node |
| Ordered map lookups are 5–10 times slower than the hash map alongside it, with time in cache misses | Pointer-linked nodes: one DRAM miss per level below the cached top | A B-tree-style map, or a sorted array if the set is static |

## Interviewer follow-ups

**"k-th smallest works with an inorder walk. Now the tree changes constantly and you need it repeatedly."** Model answer: augment each node with its subtree size, maintained on the way back up from insert and delete (and through rotations in a balanced tree); k-th smallest and rank become O(h) descents, as traced above. Common wrong answer: caching the inorder list and rebuilding it on every change, which is O(n) per update.

**"Count the keys in [a, b] in O(log n)."** Model answer: rank(b + 1) − rank(a) with subtree sizes, where rank(x) walks down adding `left.size + 1` every time it goes right. Without sizes it is O(h + output), an inorder walk that prunes subtrees outside the range. Common wrong answer: two searches and then walking the in-between nodes, which is O(output) and can be the whole tree.

**"What if the tree does not fit in memory?"** Model answer: a binary node per disk read is hopeless; make each node a page of a few hundred keys so the height is 3–4 for billions of keys, keep the top levels in a buffer pool, and link the leaves for range scans: a B+-tree, which is what every relational index is. Common wrong answer: "swap the nodes to disk and let the OS page them", which costs one random read per level of a 30-level tree.

**"Why does Java use a red-black tree for `TreeMap` but Rust a B-tree for `BTreeMap`?"** Model answer: both are O(log n); the B-tree does fewer DRAM misses and allocations per operation because a node holds 11 keys in one or two cache lines, and Rust's standard library was written when that trade-off was well understood; `TreeMap` dates from 1998 and keeps a stable iteration contract that parent pointers make cheap. Common wrong answer: "B-trees are only for disk".

**"Validate a BST where duplicates are allowed on the right."** Model answer: bounds become `lo <= v < hi` with the non-strict side matching the insert policy, and the inorder check becomes `prev <= v`. Common wrong answer: keeping strict bounds and then "fixing" the failing test by skipping equal children, which accepts invalid trees.

## What mid-level engineers get wrong

- **Checking children instead of ancestor bounds.** The parent-only validator accepts a tree in which search cannot find a key that is present.
- **Believing "BST is O(log n)".** It is O(h); sorted input makes h = n − 1, and most production key streams are sorted or nearly so.
- **Writing delete without the three cases.** Splicing a two-child node loses a subtree; copying the successor without deleting it duplicates a key.
- **Recursive insert on unbounded input.** A million-key import from a sorted file overflows the stack at 1,000 frames in CPython.
- **Comparators that are not a total order.** A `TreeMap` keyed on a mutable field or compared with a `<` that is not transitive corrupts silently; the map still "works" for most keys.
- **Reaching for a BST when there are no ordered queries.** A hash map is faster, smaller and simpler when floor, range and successor are never needed.

## Exercises

```exercise
id: validate-bst
title: Validate a binary search tree
prompt: |
  Given a binary tree as a **level-order list** with `null` gaps, return
  `true` if it is a valid BST: for every node, all keys in its left subtree
  are strictly smaller and all keys in its right subtree are strictly larger.
  Duplicates are not allowed. The empty tree is valid.

  Check ancestors, not only parents. `build_tree` and `BTNode` are provided.
languages: [python, javascript]
entry: is_valid_bst
starter:
  python: |
    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def build_tree(values):
        if not values or values[0] is None:
            return None
        root = BTNode(values[0])
        queue, head, i = [root], 0, 1
        while head < len(queue) and i < len(values):
            node = queue[head]; head += 1
            if values[i] is not None:
                node.left = BTNode(values[i]); queue.append(node.left)
            i += 1
            if i < len(values) and values[i] is not None:
                node.right = BTNode(values[i]); queue.append(node.right)
            i += 1
        return root

    def is_valid_bst(values):
        root = build_tree(values)
        return True
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function build_tree(values) {
      if (!values.length || values[0] === null) return null;
      const root = new BTNode(values[0]);
      const queue = [root];
      let head = 0, i = 1;
      while (head < queue.length && i < values.length) {
        const node = queue[head++];
        if (values[i] !== null && values[i] !== undefined) { node.left = new BTNode(values[i]); queue.push(node.left); }
        i++;
        if (i < values.length && values[i] !== null) { node.right = new BTNode(values[i]); queue.push(node.right); }
        i++;
      }
      return root;
    }

    function is_valid_bst(values) {
      const root = build_tree(values);
      return true;
    }
tests:
  - args: [[5, 3, 8, 1, 4, 7, 9]]
    expected: true
  - args: [[5, 1, 4, null, null, 3, 6]]
    expected: false
    label: right child smaller than root
  - args: [[]]
    expected: true
    label: empty tree
  - args: [[2, 2]]
    expected: false
    label: duplicate
  - args: [[2, 1, 3]]
    expected: true
  - args: [[10, 5, 15, null, null, 6, 20]]
    expected: false
    hidden: true
    label: violates an ancestor bound, not a parent bound
hints:
  - "Recurse with (lo, hi) bounds; use None or infinity for 'no bound'. Going left sets hi = node.val; going right sets lo = node.val."
  - "Alternatively, inorder-traverse and check each value is strictly greater than the previous one."
```

```exercise
id: bst-insert-delete
title: Build a BST, delete a key, report preorder
prompt: |
  `bst_insert_delete(values, key)`: insert the integers in `values` into an
  initially empty BST **in the given order** (ignore duplicates), then delete
  `key` (a no-op if it is absent), and return the **preorder** traversal of
  the resulting tree as a list.

  When the deleted node has two children, replace its value with the
  **in-order successor** (the minimum of its right subtree) and remove that
  successor node. This rule makes the result deterministic.

  Inputs are plain arrays; build the nodes yourself with `BTNode`.
languages: [python, javascript]
entry: bst_insert_delete
starter:
  python: |
    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def insert(node, key):
        # return the subtree root after inserting key
        return node

    def delete(node, key):
        # return the subtree root after deleting key
        return node

    def bst_insert_delete(values, key):
        root = None
        for v in values:
            root = insert(root, v)
        root = delete(root, key)
        out = []
        # preorder into out
        return out
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function insert(node, key) {
      // return the subtree root after inserting key
      return node;
    }

    function delete_key(node, key) {
      // return the subtree root after deleting key
      return node;
    }

    function bst_insert_delete(values, key) {
      let root = null;
      for (const v of values) root = insert(root, v);
      root = delete_key(root, key);
      const out = [];
      // preorder into out
      return out;
    }
tests:
  - args: [[5, 3, 8, 1, 4, 7, 9], 3]
    expected: [5, 4, 1, 8, 7, 9]
    label: two children, successor is a leaf
  - args: [[5, 3, 8, 1, 4, 7, 9], 5]
    expected: [7, 3, 1, 4, 8, 9]
    label: delete the root
  - args: [[5, 3, 8, 1, 4, 7, 9], 1]
    expected: [5, 3, 4, 8, 7, 9]
    label: delete a leaf
  - args: [[5, 3, 8, 1, 4, 9], 8]
    expected: [5, 3, 1, 4, 9]
    label: one child is spliced up
  - args: [[5, 3, 8, 1, 4, 7, 9], 10]
    expected: [5, 3, 1, 4, 8, 7, 9]
    label: absent key is a no-op
  - args: [[], 1]
    expected: []
    label: empty
  - args: [[5, 3, 8, 1, 4, 7, 9], 8]
    expected: [5, 3, 1, 4, 9, 7]
    hidden: true
    label: successor has no left child but the node keeps its left subtree
hints:
  - "Write insert and delete as functions that return the new subtree root, and have the parent assign node.left = insert(node.left, key)."
  - "In delete, handle 'no left child' and 'no right child' first; the two-children case copies the successor value and recurses into the right subtree to delete it."
```

## Senior signals

- You state the invariant as a **subtree** property, not a child property, and you can show the tree where the parent-only check lets `search` miss a key that is present.
- You implement delete with the "return the new subtree root" pattern, can name the three cases and why case 3 never recurses into itself, and you know the successor-only asymmetry skews a tree over long update sequences.
- You say "O(h)" and immediately follow with "and h is n − 1 on sorted input, which is why nobody ships an unbalanced BST", and you can quote the random-order numbers (about 2 ln n average depth) as the best case that production data does not give you.
- You state a duplicate policy before writing the comparison, and you keep it identical across insert, delete and validate.
- You reach for a BST-shaped structure when the query is **ordered** (floor, ceiling, range, k-th), and a hash table when it is not.
- You know the augmentation trick: store subtree sizes to get O(h) rank, select and range count.
- You can name what your language's ordered map actually is (red-black tree with parent pointers, B-tree with 11-key nodes, skip list), give the bytes per node, and explain the choice in terms of cache misses per lookup.

## Check yourself

```quiz
- q: >-
    A BST validation checks that every left child is smaller than its parent and every right child is larger. Which tree does it wrongly accept?
  options: ["10 with children 5 and 15, where 5 has left child 12", "10 with children 5 and 15, where 5 has right child 7", "10 with children 5 and 15, where 15 has right child 12", "10 with children 5 and 15, where 15 has left child 6"]
  answer: 3
  explanation: >-
    6 is smaller than its parent 15, so the parent-only check passes, but 6 lies in the right subtree of 10 and must be greater than 10; a search for 6 turns left at 10 and never finds it. Only ancestor bounds catch it. 7 under 5 is a valid placement (between 5 and 10), and 12 as a left child of 5 or a right child of 15 fails even the parent-only check.
- q: >-
    Deleting a node with two children by replacing it with its in-order successor never requires a further two-child deletion. Why?
  options: ["It is the right subtree's minimum, so it has no left child", "It is the left subtree's max, so it has no right child", "It is always the direct right child, so it is spliced out", "It is always a leaf, so removing it needs no splicing"]
  answer: 0
  explanation: >-
    The leftmost node of a subtree has no left child by construction, so removing it is case 1 (leaf) or case 2 (one right child). It may not be a leaf, and it is the direct right child only when that child has no left subtree. The maximum of the left subtree is the in-order predecessor, the other valid choice, not the successor.
- q: >-
    Keys 1 through 100,000 are inserted in ascending order into a plain BST. Searching for key 100,000 costs:
  options: ["About 23, since expected height is 1.39 log₂ n", "About 17, since each step halves the remaining keys", "About 50,000, since search stops halfway on average", "About 100,000, since the tree is a right chain"]
  answer: 3
  explanation: >-
    Ascending insertion produces a right chain of height 99,999; the largest key is at the bottom, so the search walks every node. A balanced tree would take about 17, and the logarithmic expected-depth figures hold only for random insertion order.
- q: >-
    You need to support insert, delete and "how many stored keys are less than x" in O(log n) each. The right structure is:
  options: ["A sorted array, using binary search to find the rank", "A hash set, scanning every key to count the ones below x", "A balanced BST with a subtree size stored in each node", "A min-heap, popping until the top is at least x"]
  answer: 2
  explanation: >-
    Subtree sizes let you compute rank(x) in one O(h) descent, and balancing keeps h logarithmic. A sorted array answers the query in O(log n) but inserts in O(n); a heap gives no rank information without destroying itself; a hash set has no order.
- q: >-
    A Java TreeMap keyed on objects whose compareTo uses a field that is later mutated starts returning false from containsKey for keys that iteration still prints. What is going on?
  options: ["The mutated keys were rehashed into a different bucket of the backing hash table", "TreeMap caches comparison results per key, and the cache is stale after the mutation", "The tree has degenerated into a chain, so lookups time out and return false", "Searches turn the wrong way at nodes whose keys now violate the invariant, so present keys are unreachable"]
  answer: 3
  explanation: >-
    A red-black tree only works if every node's key sits inside the bounds its ancestors impose; mutating a key breaks that silently, and a search that compares against the mutated value goes down the wrong side while iteration, which follows pointers rather than comparisons, still visits the node. A chain slows lookups but does not lose keys; there are no buckets or comparison caches in a TreeMap.
- q: >-
    Python has no balanced tree in the standard library. For an ordered set of about 10,000 integers with frequent inserts and floor queries, the pragmatic choice is:
  options: ["A hand-written red-black tree for O(log n) inserts", "A dict, calling sorted() on its keys per query", "A heapq-ordered list, searched for the floor key", "A sorted list, using bisect for search and insert"]
  answer: 3
  explanation: >-
    bisect gives O(log n) search and O(n) insert, but the insert is a memmove of at most 80 KB, which is microseconds; a hand-written red-black tree is a lot of risky code that does not beat it below about 10^5 elements. Sorting a dict per query is O(n log n) each time; a heap cannot answer floor.
```

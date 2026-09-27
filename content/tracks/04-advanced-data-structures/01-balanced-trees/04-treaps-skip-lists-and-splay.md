---
slug: treaps-skip-lists-and-splay
title: "Treaps, skip lists and splay trees: balance without bookkeeping"
description: Three ways to get O(log n) ordered operations without AVL or red-black case analysis, why Redis sorted sets and RocksDB memtables are skip lists, and what splay trees buy with locality.
minutes: 50
difficulty: hard
tags: [treap, skip-list, splay-tree, randomised, redis, ordered-map, memtable]
problems: [kth-smallest-bst, time-based-kv]
---
AVL and red-black trees buy their O(log n) guarantee with case analysis: four rotation shapes, colour rules, a delete procedure that runs to pages. Two things bother experienced engineers about that. First, the code is long and every line is a place to introduce a bug that shows up once a month. Second, the structures are hostile to concurrency, because a rotation modifies several nodes at once and readers must not see the intermediate state.

Three structures solve the same problem by giving something up. Treaps and skip lists replace the invariant with randomness: they are balanced with high probability, and the code is a fraction of the size. Splay trees keep no balance information at all and instead reshape themselves around whatever you access, which makes them fast on skewed workloads and useless on adversarial ones. Between them they cover Redis, RocksDB, LevelDB, Java's concurrent ordered map, and a good chunk of competitive programming.

## Treaps: a BST and a heap at once

A treap node holds a key and a **priority**. The tree is a BST on keys and a max-heap on priorities: every node's priority is at least its children's. If priorities are assigned uniformly at random when a node is created, the treap is exactly the BST you would get by inserting the keys in *decreasing priority order*, which is a random order. A BST built from a random permutation has expected depth about `2 ln n ≈ 1.39 log₂ n` per node, so treap operations are O(log n) in expectation, with no adversarial insertion order that can break it.

The shape is fully determined by the (key, priority) pairs. Insert 30, 10 and 20 with priorities 10, 5 and 50 in any order and you always end with 20 at the root, because 20 has the highest priority; then 10 and 30 sort to its left and right. That uniqueness is worth remembering: it means two replicas that insert the same keys with the same priorities in different orders end up with identical trees.

**Insert:** do a BST insert as a leaf with a fresh random priority, then rotate the node up while its priority exceeds its parent's. Rotations here are the same right and left rotations as in the [AVL lesson](/learn/advanced-data-structures/balanced-trees/avl-trees), but chosen by priority comparison, not balance factors.

**Delete:** find the node and rotate it *down* (always rotating with the higher-priority child, so the heap property holds) until it is a leaf, then unlink it. No cases.

```python
def insert(node, key, prio):
    if node is None:
        return Node(key, prio)
    if key < node.key:
        node.left = insert(node.left, key, prio)
        if node.left.prio > node.prio:
            node = rotate_right(node)
    elif key > node.key:
        node.right = insert(node.right, key, prio)
        if node.right.prio > node.prio:
            node = rotate_left(node)
    return node
```

Trace 40, 20, 60, 10, 30 with priorities 70, 60, 65, 20, 90. After the first four inserts the tree is `40 → (20 → (10, ·), 60)` with priorities decreasing downward. Insert 30 under 20's right with priority 90. 90 beats 20's 60, so rotate left at 20: 30 moves up with 20 as its left child. 90 beats 40's 70, so rotate right at 40: 30 is now the root with 20 on the left and 40 on the right. Two rotations, and the priorities read 90 at the root, 60 and 70 below it.

There is no treap visualiser in the catalogue, but a plain BST built from keys in random order is exactly the shape a treap has, since a treap *is* the BST of its keys sorted by random priority. Compare this with the sorted-input chain from the red-black lesson:

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [50, 20, 70, 10, 30, 60, 80, 25, 65],
 "title": "A BST from a random insertion order",
 "caption": "Random order gives expected depth about 1.39 log₂ n. A treap forces this shape regardless of the order keys actually arrive in, by simulating a random order with priorities."}
```

### Split and merge: the feature that makes treaps worth knowing

The operation that balanced trees do awkwardly and treaps do trivially is **split**: divide a treap into two treaps, one with keys `< k` and one with keys `≥ k`, in O(log n). Walk down from the root; at each node, if its key is below `k` the node and its left subtree belong to the left result, so recurse into the right subtree; otherwise mirror. **Merge** two treaps where every key in the first is below every key in the second: the root is whichever root has the higher priority, and you recurse on one side. Both are ten lines.

With split and merge, insert is "split at the key, merge left + new node + right" and delete is "split out the key, merge the rest". More interestingly, an **implicit treap** stores no keys at all and uses subtree sizes to address positions, which gives you an array with O(log n) insert, delete, reverse and range-sum on arbitrary ranges. That is the structure behind ropes in some text editors and behind a whole class of competitive-programming solutions.

## Skip lists: a linked list with express lanes

A sorted linked list has O(n) search because you cannot skip ahead. Give some nodes a second forward pointer that skips several nodes, some of those a third that skips even more, and you get a hierarchy of increasingly sparse lists over the same keys. A search starts at the top level, moves right while the next key is still below the target, drops a level, and repeats. It is binary search on a linked list.

Each node's **level** is chosen at random when it is inserted: with probability `p` it gets one more level, repeated. With `p = 1/2` about half the nodes have level 2, a quarter level 3, and so on, so a search visits an expected O(log n) nodes and the total pointer count is `n / (1 − p) = 2n`. Redis uses `p = 1/4` and a maximum of 32 levels, which costs 1.33 pointers per node and makes the structure a little slower to search but leaner in memory.

```text
level 3:  HEAD ------------------------> 30 -------------------> NIL
level 2:  HEAD ------> 20 -------------> 30 --------> 50 ------> NIL
level 1:  HEAD -> 10 -> 20 -> 25 -> 30 -> 40 -> 50 -> 60 -> NIL

search(40): level 3: 30 < 40, move to 30; 30.next is NIL, drop.
            level 2: 30.next = 50 > 40, drop.
            level 1: 30.next = 40, found. Four node visits instead of six.
```

**Insert** is a search that remembers, at every level, the last node whose key was below the new key (the "update" vector). Draw a random level `L`, then for levels 1 to `L` splice the new node in after `update[level]`. **Delete** is the same walk followed by unlinking at each level where the node appears. There are no rotations and the structure never moves an existing node, which is the property that concurrency people care about.

### Why Redis, RocksDB and Java chose it

**Redis sorted sets** (`ZADD`, `ZRANGE`, `ZRANK`, `ZRANGEBYSCORE`) are a skip list plus a hash map, once the set is large enough to leave the compact listpack encoding. The skip list orders members by score; the hash map gives O(1) score lookup by member. Two design details explain the choice over a balanced tree: each forward pointer carries a **span**, the number of level-1 nodes it skips, so `ZRANK` and "give me elements 100 to 110 by rank" are O(log n) without an extra size field per subtree; and the code for range deletion, range iteration and reverse iteration is a handful of lines because the bottom level is just a doubly linked list. Antirez's stated reasons were exactly those: simpler to implement, easy range operations, and memory comparable to a balanced tree.

**RocksDB and LevelDB memtables** are skip lists because writers and readers must proceed concurrently. A skip list insert publishes a node by writing one pointer per level with release semantics; a reader that observes the pointer sees a fully constructed node and a reader that does not simply skips it. No rotation ever moves a node, so a reader never needs to lock. RocksDB's default memtable is a skip list with a per-level CAS insert and no reader locks at all.

**Java's `ConcurrentSkipListMap`** is the standard library's only concurrent ordered map, for the same reason: lock-free insertion and deletion on a red-black tree is a research problem; on a skip list it is a CAS per level.

The costs: skip lists use more memory than a B-tree (a pointer per level per node, and a cache miss per node visited), and their O(log n) is expected, not guaranteed. A pathological level sequence, which random level generation makes astronomically unlikely, would degrade to a linked list. Nobody has ever been bitten by that; everyone has been bitten by the memory.

## Splay trees: let the workload shape the tree

A splay tree stores nothing but keys and pointers. Every access, including lookups, ends by **splaying** the accessed node to the root through a sequence of double rotations: *zig-zig* when node and parent lean the same way (rotate the grandparent first, then the parent) and *zig-zag* when they lean opposite ways (rotate the parent, then the grandparent), with a single *zig* at the end if needed. The zig-zig order is the subtle part; rotating the parent first at every step, the naive "move to root", does not give the amortised bound.

What you get is O(log n) **amortised** per operation: any sequence of `m` operations on `n` keys costs O(m log n) in total, even though a single operation can cost O(n). What you also get, and the reason the structure is studied, are locality properties no balanced tree has:

- **Working-set theorem.** Accessing a key that was one of the last `t` distinct keys accessed costs O(log t), not O(log n). A hot working set of a hundred keys in a tree of a billion is served at a depth of about 7.
- **Static optimality.** For any fixed access distribution, the splay tree performs within a constant factor of the best possible static BST for that distribution, without knowing it.
- **Sequential access.** Touching all keys in order costs O(n) total, O(1) amortised each.

The costs are equally concrete. Reads write: a lookup restructures the tree, so a read-heavy concurrent workload serialises on the root, and a cache line that many threads read becomes one that many threads write. There is no worst-case guarantee per operation, which rules splay trees out of anything with a latency SLO. In practice they appear in a few memory allocators and garbage collectors that care about locality more than tail latency, in some compilers' internal tables, and in interview questions about amortised analysis. The idea, "move what you touched to where it is cheap to touch again", lives on in every cache eviction policy in the [caches module](/learn/advanced-data-structures/caches-and-eviction/lru-cache).

## Choosing among them

| Need | Pick | Why |
|---|---|---|
| Ordered map, single-threaded, guaranteed bounds | Red-black or B-tree | Worst-case O(log n), library-grade |
| Ordered map with concurrent readers and writers | Skip list | Nodes never move; per-level CAS inserts |
| Rank queries and range-by-rank | Skip list with spans, or a tree with subtree sizes | Redis `ZRANK` in O(log n) |
| Split/merge, sequence editing, ranged operations | Treap (implicit treap) | Split and merge are ten lines each |
| Deterministic replicas built in different orders | Treap with agreed priorities | Shape depends only on (key, priority) pairs |
| Skewed access with a small hot set, single thread | Splay tree | Working-set bound |
| Anything large enough to miss cache | B-tree | Fan-out beats every pointer-per-key structure |

The interviewer's follow-up after "I'd use a balanced BST" is often "how would you make it concurrent?" or "how do you get the k-th smallest quickly?", and the answers are in this table: a skip list for the first, subtree sizes or spans for the second, and a treap if the problem turns into splitting and joining sequences.

## Exercises

```exercise
id: treap-with-given-priorities
title: Build a treap from explicit priorities
prompt: |
  Implement `treap_level_order(items)`: `items` is a list of `[key, priority]`
  pairs with distinct keys and distinct priorities. Insert them in order into
  a treap (BST on key, max-heap on priority) by doing a BST insert and then
  rotating the new node up while its priority is greater than its parent's.
  Return the keys in level order.

  Because the treap shape depends only on the pairs, inserting the same pairs
  in a different order must give the same answer.
languages: [python, javascript]
entry: treap_level_order
starter:
  python: |
    class Node:
        def __init__(self, key, prio):
            self.key, self.prio = key, prio
            self.left = self.right = None

    def insert(node, key, prio):
        # TODO: BST insert, then rotate up on priority
        return node

    def treap_level_order(items):
        root = None
        for key, prio in items:
            root = insert(root, key, prio)
        # TODO: BFS
        return []
  javascript: |
    class Node {
      constructor(key, prio) { this.key = key; this.prio = prio; this.left = this.right = null; }
    }
    function insert(node, key, prio) {
      // TODO: BST insert, then rotate up on priority
      return node;
    }
    function treap_level_order(items) {
      let root = null;
      for (const [key, prio] of items) root = insert(root, key, prio);
      // TODO: BFS
      return [];
    }
tests:
  - args: [[[50, 90]]]
    expected: [50]
    label: single node
  - args: [[[50, 90], [30, 80], [70, 95]]]
    expected: [70, 50, 30]
    label: one left rotation at the root
  - args: [[[10, 5], [20, 50], [30, 10]]]
    expected: [20, 10, 30]
    label: highest priority ends at the root
  - args: [[[30, 10], [10, 5], [20, 50]]]
    expected: [20, 10, 30]
    label: same pairs, different order, same treap
  - args: [[[40, 70], [20, 60], [60, 65], [10, 20], [30, 90], [50, 30], [70, 10]]]
    expected: [30, 20, 40, 10, 60, 50, 70]
    label: the worked example plus two leaves
  - args: [[[5, 1], [6, 2], [7, 3], [8, 4]]]
    expected: [8, 7, 6, 5]
    hidden: true
    label: adversarial priorities degrade to a chain
  - args: [[]]
    expected: []
    hidden: true
    label: empty
hints:
  - "After `node.left = insert(node.left, key, prio)`, check `node.left.prio > node.prio` and rotate right; mirror for the right side."
  - "Rotations return the new subtree root; assign it back to `node` and return it."
```

```exercise
id: skip-list-with-given-levels
title: Skip list with explicit levels
prompt: |
  Implement `SkipList` with a head node and forward pointers per level.
  The tests replay operations:

  - `insert(key, level)`: insert a new distinct key that occupies levels
    1..`level` (level 1 is the full list). Grow the head's pointer array if
    `level` exceeds the current maximum.
  - `contains(key)`: `true`/`false`.
  - `delete(key)`: unlink at every level; return `true` if the key existed.
  - `levels()`: a list of key lists, one per level from level 1 upward, each
    in ascending order, stopping at the highest level that currently holds
    at least one key (an empty list when the skip list is empty).

  Use the standard search with an `update` array recording, per level, the
  last node whose key is below the target.
languages: [python, javascript]
entry: SkipList
starter:
  python: |
    class SLNode:
        def __init__(self, key, level):
            self.key = key
            self.forward = [None] * level

    class SkipList:
        def __init__(self):
            self.head = SLNode(None, 1)

        def insert(self, key, level):
            # TODO
            pass

        def contains(self, key):
            # TODO
            return False

        def delete(self, key):
            # TODO
            return False

        def levels(self):
            # TODO
            return []
  javascript: |
    class SLNode {
      constructor(key, level) { this.key = key; this.forward = new Array(level).fill(null); }
    }
    class SkipList {
      constructor() { this.head = new SLNode(null, 1); }
      insert(key, level) { /* TODO */ }
      contains(key) { /* TODO */ return false; }
      delete(key) { /* TODO */ return false; }
      levels() { /* TODO */ return []; }
    }
tests:
  - args: [["insert", 10, 1], ["insert", 30, 3], ["insert", 20, 2], ["levels"]]
    expected: [null, null, null, [[10, 20, 30], [20, 30], [30]]]
    label: three levels
  - args: [["insert", 10, 1], ["insert", 30, 3], ["insert", 20, 2], ["contains", 20], ["contains", 25], ["delete", 30], ["levels"], ["delete", 30]]
    expected: [null, null, null, true, false, true, [[10, 20], [20]], false]
    label: delete shrinks the top level
  - args: [["levels"], ["contains", 1], ["delete", 1]]
    expected: [[], false, false]
    label: empty list
  - args: [["insert", 5, 2], ["insert", 1, 1], ["insert", 9, 1], ["insert", 7, 4], ["levels"]]
    expected: [null, null, null, null, [[1, 5, 7, 9], [5, 7], [7], [7]]]
    hidden: true
    label: head grows when a taller node arrives
  - args: [["insert", 3, 2], ["insert", 4, 2], ["delete", 3], ["delete", 4], ["levels"], ["insert", 8, 1], ["levels"]]
    expected: [null, null, true, true, [], null, [[8]]]
    hidden: true
    label: emptying and refilling
hints:
  - "Search from the top level down: `while node.forward[i] and node.forward[i].key < key: node = node.forward[i]`, recording `update[i] = node` before dropping a level."
  - "If a new node's level exceeds the head's, extend `head.forward` with `None` entries and set `update[i] = head` for the new levels."
  - "For `levels`, walk each level's forward chain from the head; stop adding levels once a level is empty."
```

## Senior signals

- You explain a treap as **a BST of a random permutation** and derive its expected depth from that, and you know split/merge is the reason to reach for one.
- You can draw a skip list search and explain why Redis stores a **span** on each forward pointer to make `ZRANK` logarithmic.
- You give the concurrency argument for skip lists (nodes never move; publish with one pointer write per level) and know that RocksDB, LevelDB and `ConcurrentSkipListMap` chose them for exactly that.
- You state the splay tree's **amortised** bound and its **working-set** property, and immediately say why it is unsuitable for concurrent or latency-sensitive systems: reads write.
- You know that randomised balance is "expected", that nobody has been hurt by that, and that the real cost of a skip list is memory and cache misses.
- Asked to make an ordered map concurrent or to support rank queries, you name the structure and the exact mechanism rather than saying "add a lock".

## Check yourself

```quiz
- q: >-
    Two replicas insert the same set of (key, priority) pairs into treaps in different orders. What is true of the resulting trees?
  options: ["They match only if priorities were assigned in sorted order", "They differ, because insertion order changes the rotations", "They are identical, since the pairs alone fix the shape", "They share the same height but can differ in shape"]
  answer: 2
  explanation: >-
    With distinct keys and priorities there is exactly one tree that is a BST on keys and a heap on priorities. Insertion order does change which rotations are performed along the way, but not the final shape.
- q: >-
    Redis implements sorted sets with a skip list rather than a red-black tree. Which reason did NOT motivate that choice?
  options: ["The code is far shorter than an equivalent balanced tree", "Rank queries are O(log n) using the span stored on each pointer", "Skip lists guarantee O(log n) worst-case for every operation", "Range operations are simple since the bottom level is a linked list"]
  answer: 2
  explanation: >-
    Skip lists are O(log n) in expectation, not in the worst case. Simplicity, easy ranges and rank support via spans were the actual reasons; the missing worst-case guarantee is a cost that was accepted.
- q: >-
    Why is a skip list a better fit than a red-black tree for a storage engine's in-memory memtable with concurrent readers?
  options: ["It uses less memory per key than a red-black tree", "It has a better worst-case bound than a red-black tree", "Inserts never move existing nodes, so readers need no locks", "It supports range scans, which balanced trees cannot do"]
  answer: 2
  explanation: >-
    Rotations relocate nodes and modify several pointers at once, which readers must not see half-done. Skip list inserts splice a new node in with one pointer write per level; a reader either sees it or does not. Memory is actually higher (a pointer per level per node), trees support range scans fine, and the skip list's bound is only expected.
- q: >-
    A single splay tree lookup takes O(n) time. What does the amortised O(log n) bound tell you?
  options: ["The next lookup is guaranteed to be O(1) to compensate", "The tree has degenerated and must now be rebuilt", "Any sequence of m operations costs O(m log n) in total", "That lookup was a bug in the splay implementation"]
  answer: 2
  explanation: >-
    Amortised bounds constrain totals, not individual operations. The O(n) lookup restructured the tree so that following operations are cheaper, and the potential-function argument shows the sum stays O(m log n). It promises nothing about any particular next operation.
- q: >-
    You need an in-memory ordered index for a service with a p99 latency SLO, moderate write rate and a single-threaded access path. Which is the weakest choice?
  options: ["A splay tree", "A red-black tree", "A randomised treap", "An in-memory B-tree"]
  answer: 0
  explanation: >-
    A splay tree can spend O(n) on one operation, which is exactly what a tail-latency SLO forbids. Red-black and B-trees have worst-case bounds; a treap's bounds are expected but its bad cases are astronomically unlikely and not workload-triggerable.
```

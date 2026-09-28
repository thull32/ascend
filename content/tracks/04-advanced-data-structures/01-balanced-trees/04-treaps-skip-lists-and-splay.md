---
slug: treaps-skip-lists-and-splay
title: "Treaps, skip lists and splay trees: balance without bookkeeping"
description: Three ways to get O(log n) ordered operations without AVL or red-black case analysis, with the treap rotations, skip-list level distribution and expected search cost, and splay zig-zig steps traced, plus why Redis sorted sets and RocksDB memtables are skip lists and what those nodes look like in memory.
minutes: 50
difficulty: hard
tags: [treap, skip-list, splay-tree, randomised, redis, ordered-map, memtable]
problems: [kth-smallest-bst, time-based-kv]
---
AVL and red-black trees buy their O(log n) guarantee with case analysis: four rotation shapes, colour rules, a delete procedure that runs to pages. Two things bother experienced engineers about that. First, the code is long and every line is a place to introduce a bug that shows up once a month. Second, the structures are hostile to concurrency, because a rotation modifies several nodes at once and readers must not see the intermediate state.

Three structures solve the same problem by giving something up. Treaps and skip lists replace the invariant with randomness: they are balanced with high probability, and the code is a fraction of the size. Splay trees keep no balance information at all and instead reshape themselves around whatever you access, which makes them fast on skewed workloads and useless on adversarial ones. Between them they cover Redis, RocksDB, LevelDB, Java's concurrent ordered map, and a good chunk of competitive programming. This lesson traces each one on paper, measures the randomised ones, and opens the node layouts Redis and RocksDB actually use. It builds on the rotations from the [AVL lesson](/learn/advanced-data-structures/balanced-trees/avl-trees) and the worst-case guarantees of [red-black trees](/learn/advanced-data-structures/balanced-trees/red-black-trees).

## Treaps: a BST and a heap at once

A treap node holds a key and a **priority**. The tree is a BST on keys and a max-heap on priorities: every node's priority is at least its children's. If priorities are assigned uniformly at random when a node is created, the treap is exactly the BST you would get by inserting the keys in *decreasing priority order*, which is a random order. A BST built from a random permutation has expected depth about `2 ln n ≈ 1.39 log₂ n` per node, so treap operations are O(log n) in expectation, with no adversarial insertion order that can break it.

The shape is fully determined by the (key, priority) pairs. Insert 30, 10 and 20 with priorities 10, 5 and 50 in any order and you always end with 20 at the root, because 20 has the highest priority; then 10 and 30 sort to its left and right. That uniqueness is worth remembering: it means two replicas that insert the same keys with the same priorities in different orders end up with identical trees.

**Insert:** do a BST insert as a leaf with a fresh random priority, then rotate the node up while its priority exceeds its parent's. Rotations here are the same right and left rotations as in the AVL lesson, chosen by priority comparison instead of balance factors.

**Delete:** find the node and rotate it *down*, always rotating with the higher-priority child so the heap property holds, until it has at most one child, then splice it out. No cases.

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

def delete(node, key):
    if node is None:
        return None
    if key < node.key:
        node.left = delete(node.left, key)
    elif key > node.key:
        node.right = delete(node.right, key)
    else:
        if node.left is None:
            return node.right
        if node.right is None:
            return node.left
        if node.left.prio > node.right.prio:     # rotate the higher child up
            node = rotate_right(node)
            node.right = delete(node.right, key)
        else:
            node = rotate_left(node)
            node.left = delete(node.left, key)
    return node
```

### Insert and delete traced

Insert (key/priority) 40/70, 20/60, 60/65, 10/20, 30/90, 50/30, 70/10, then delete 30 and 40. Notation `key/prio→(left, right)`.

| Step | Operation | Rotations | Tree after | Heap check |
|---|---|---|---|---|
| 1–4 | insert 40/70, 20/60, 60/65, 10/20 | none (each priority below its parent's) | `40/70→(20/60→(10/20, ·), 60/65)` | 70 ≥ 60, 65; 60 ≥ 20 |
| 5 | insert 30/90 under `20.right` | 90 > 60: left at 20; 90 > 70: right at 40 | `30/90→(20/60→(10/20, ·), 40/70→(·, 60/65))` | 90 at root |
| 6–7 | insert 50/30, 70/10 | none | `30/90→(20/60→(10/20, ·), 40/70→(·, 60/65→(50/30, 70/10)))` | ok |
| 8 | delete 30 (root, two children: 20/60 vs 40/70) | 40 is higher: left at 30 | 30 now has children (20/60, ·): splice → `40/70→(20/60→(10/20, ·), 60/65→(50/30, 70/10))` | 70 ≥ 60, 65 |
| 9 | delete 40 (root, children 20/60 vs 60/65) | 60 is higher: left at 40; then 40 has children (20/60, 50/30): right at 40 | 40 has one child 50/30: splice → `60/65→(20/60→(10/20, 50/30), 70/10)` | 65 ≥ 60, 10; 60 ≥ 20, 30 |

Compare the AVL delete cascade: here every step is "rotate with the bigger child", and the number of rotations is the node's depth in the final tree, expected O(log n).

There is no treap visualiser in the catalogue, but a plain BST built from keys in random order is exactly the shape a treap has, since a treap *is* the BST of its keys sorted by random priority. Compare this with the sorted-input chain from the red-black lesson:

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [50, 20, 70, 10, 30, 60, 80, 25, 65],
 "title": "A BST from a random insertion order",
 "caption": "Random order gives expected depth about 1.39 log₂ n. A treap forces this shape regardless of the order keys actually arrive in, by simulating a random order with priorities."}
```

### Split and merge: the feature that makes treaps worth knowing

The operation that balanced trees do awkwardly and treaps do in one short recursion is **split**: divide a treap into two treaps, one with keys `< k` and one with keys `≥ k`, in O(log n). Walk down from the root; at each node, if its key is below `k` the node and its left subtree belong to the left result, so recurse into the right subtree; otherwise mirror. **Merge** two treaps where every key in the first is below every key in the second: the root is whichever root has the higher priority, and you recurse on one side.

```python
def split(node, k):                    # -> (keys < k, keys >= k)
    if node is None:
        return None, None
    if node.key < k:
        l, r = split(node.right, k)
        node.right = l
        return node, r
    l, r = split(node.left, k)
    node.left = r
    return l, node

def merge(a, b):                       # every key in a < every key in b
    if a is None: return b
    if b is None: return a
    if a.prio > b.prio:
        a.right = merge(a.right, b)
        return a
    b.left = merge(a, b.left)
    return b
```

Splitting the seven-node treap above at 45 gives `30/90→(20/60→(10/20, ·), 40/70)` and `60/65→(50/30, 70/10)`; merging them back reproduces the original exactly, because the shape is determined by the pairs. With split and merge, insert is "split at the key, merge left + new node + right" and delete is "split out the key, merge the rest". An **implicit treap** stores no keys at all and uses subtree sizes to address positions, which gives you an array with O(log n) insert, delete, reverse and range-sum on arbitrary ranges: the structure behind ropes in some text editors and a whole class of competitive-programming solutions.

## Skip lists: a linked list with express lanes

A sorted linked list has O(n) search because you cannot skip ahead. Give some nodes a second forward pointer that skips several nodes, some of those a third that skips even more, and you get a hierarchy of increasingly sparse lists over the same keys. A search starts at the top level, moves right while the next key is still below the target, drops a level, and repeats. It is binary search on a linked list.

Each node's **level** is chosen at random when it is inserted: with probability `p` it gets one more level, repeated. The distribution is geometric:

| Level ≥ k | k = 1 | 2 | 3 | 4 | 5 | 6 | Pointers per node | Expected top level, n = 10⁶ |
|---|---|---|---|---|---|---|---|---|
| `p = 1/2` | 1 | 0.5 | 0.25 | 0.125 | 0.0625 | 0.031 | `1/(1−p)` = 2.0 | log₂ 10⁶ ≈ 20 |
| `p = 1/4` | 1 | 0.25 | 0.0625 | 0.0156 | 0.0039 | 0.001 | 1.33 | log₄ 10⁶ ≈ 10 |

Pugh's expected search cost is about `log_{1/p}(n) / p + 1/(1−p)` node steps: for a million keys that is 41.9 at `p = 1/2` and 41.2 at `p = 1/4`. The two are within a step of each other because the halved level count is paid back by walking up to three nodes per level instead of one, but `p = 1/4` needs 1.33 pointers per node instead of 2. Measured on a 100,000-key list, the mean search touched 33 nodes at `p = 1/2` and 30 at `p = 1/4`, with maximum levels of 16 and 9. That is why Redis, LevelDB and RocksDB all chose `p = 1/4`: same search time, a third less pointer memory.

### Search traced

```text
level 3:  HEAD ------------------------> 30 -------------------> NIL
level 2:  HEAD ------> 20 -------------> 30 --------> 50 ------> NIL
level 1:  HEAD -> 10 -> 20 -> 25 -> 30 -> 40 -> 50 -> 60 -> NIL
```

| Search | Level 3 | Level 2 | Level 1 | Result | Nodes touched |
|---|---|---|---|---|---|
| 40 | 30 < 40, move to 30; next is NIL, drop | 30's next is 50 ≥ 40, drop | 30's next is 40 | found | 30, 50, 40 = 3 (versus 5 in a plain list) |
| 45 | move to 30; drop | next 50 ≥ 45, drop | next 40 < 45, move to 40; next 50 ≥ 45 | absent, would insert between 40 and 50 | 30, 50, 40, 50 = 4 |
| 10 | next 30 ≥ 10, drop | next 20 ≥ 10, drop | next is 10 | found | 30, 20, 10 = 3 (versus 1 in a plain list) |

The last row shows the price of the express lanes: the search for the first key still visits the top of every level. A skip list's O(log n) is an average over keys and over the coin flips.

**Insert** is a search that remembers, at every level, the last node whose key was below the new key (the "update" vector: for 45 it is `[40, 30, 30]` from level 1 up). Draw a random level `L`, then for levels 1 to `L` splice the new node in after `update[level]`. **Delete** is the same walk followed by unlinking at each level where the node appears. There are no rotations and the structure never moves an existing node, which is the property that concurrency people care about.

## Splay trees: let the workload shape the tree

A splay tree stores nothing but keys and pointers. Every access, including lookups, ends by **splaying** the accessed node `x` to the root through a sequence of steps, each chosen by the shape of `x`, its parent `p` and grandparent `g`:

- **zig** (`p` is the root): one rotation at `p`.
- **zig-zig** (`x` and `p` are both left children or both right children): rotate at `g` first, then at `p`. Two rotations, same direction.
- **zig-zag** (`x` is a left child and `p` a right child, or the reverse): rotate at `p`, then at the new parent. Two rotations, opposite directions.

The zig-zig order is the subtle part. Rotating at `p` first at every step, the naive "move to root", brings `x` up equally fast but leaves the rest of the path as long as it was; zig-zig halves the depth of every node on the path.

### Splay traced

Insert 1 through 7 in order into an empty splay tree (an insert splays the new node, so each insert is one zig): the result is a chain with 7 at the root and 1 at depth 7, the worst possible shape. Now access 1:

| Step | `x`, `p`, `g` | Shape | Rotations | Tree after |
|---|---|---|---|---|
| 1 | 1, 2, 3 | zig-zig (both left children) | right at 3, right at 2 | `7→(6→(5→(4→(1→(·, 2→(·, 3)), ·), ·), ·), ·)` |
| 2 | 1, 4, 5 | zig-zig | right at 5, right at 4 | `7→(6→(1→(·, 4→(2→(·, 3), 5)), ·), ·)` |
| 3 | 1, 6, 7 | zig-zig | right at 7, right at 6 | `1→(·, 6→(4→(2→(·, 3), 5), 7))` |

Six rotations, and the height dropped from 7 to 5: every node on the path is now at about half its old depth. Access 4 next: `x = 4`, `p = 6`, `g = 1`, 4 is a left child and 6 a right child, so zig-zag: rotate at 6 (right), then at 1 (left), giving `4→(1→(·, 2→(·, 3)), 6→(5, 7))`, height 4. Access 1 again: it is now the root's left child, one zig, `1→(·, 4→(2→(·, 3), 6→(5, 7)))`.

Measured on a 2,000-key tree built by sorted inserts and then accessed sequentially 1 to 2,000: splaying costs 4.4 rotations per access on average, and the naive move-to-root costs 1,000 per access, because it keeps the tree a chain and walks it from the other end each time. That factor of 200 is the whole content of the amortised analysis.

What you get is O(log n) **amortised** per operation: any sequence of `m` operations on `n` keys costs O(m log n) in total, even though a single operation can cost O(n). What you also get, and the reason the structure is studied, are locality properties no balanced tree has:

- **Working-set theorem.** Accessing a key that was one of the last `t` distinct keys accessed costs O(log t), not O(log n). A hot working set of a hundred keys in a tree of a billion is served at a depth of about 7.
- **Static optimality.** For any fixed access distribution, the splay tree performs within a constant factor of the best possible static BST for that distribution, without knowing it.
- **Sequential access.** Touching all keys in order costs O(n) total, O(1) amortised each, as the measurement above shows.

The costs are equally concrete. Reads write: a lookup restructures the tree, so a read-heavy concurrent workload serialises on the root, and a cache line that many threads read becomes one that many threads write. There is no worst-case guarantee per operation, which rules splay trees out of anything with a latency SLO. The Windows kernel kept process address-space descriptors in a splay tree through XP and moved to an AVL tree precisely because reads were writing; GCC's `libiberty` still ships a splay tree for compiler-internal tables where a single thread touches a small hot set. The idea, "move what you touched to where it is cheap to touch again", lives on in every cache eviction policy in the [caches module](/learn/advanced-data-structures/caches-and-eviction/lru-cache).

## Under the hood: Redis, RocksDB and Java

**Redis sorted sets.** A small zset (at most 128 entries, each at most 64 bytes, `zset-max-listpack-entries` and `zset-max-listpack-value`) is a flat listpack scanned linearly. Above that it becomes a `zskiplist` **plus a hash table** from member to score. Each skip-list node holds the member string, a `double` score, a `backward` pointer for reverse iteration, and an array of levels, each a forward pointer and a **span**: the number of level-1 nodes the pointer jumps over. `ZSKIPLIST_MAXLEVEL` is 32 and `ZSKIPLIST_P` is 0.25. Spans are what make `ZRANK` and `ZRANGE 100 110` O(log n): summing spans along the search path gives the rank, and descending by rank picks the pointer whose span does not overshoot. Per element you pay roughly 24 bytes of fixed node fields, about 21 bytes of level pointers on average (1.33 levels × 16), the member string, and the hash-table entry: on the order of 80–100 bytes per member before the string. Antirez's stated reasons for the choice over a balanced tree were exactly these: simpler to implement, range operations fall out of the bottom-level list, and memory is comparable.

**RocksDB and LevelDB memtables.** The default memtable is an `InlineSkipList` (LevelDB: `SkipList`) with `kMaxHeight = 12` and branching factor 4 (`p = 1/4`), allocated from an arena, with the key bytes stored inline after the node's pointer array so a search touches one allocation per node. Insert publishes a node by writing one forward pointer per level with release semantics; a reader that observes the pointer sees a fully constructed node and a reader that does not skips it. No rotation ever moves a node, so a reader never locks. RocksDB's `InsertConcurrently` lets multiple writers insert with a compare-and-swap per level, and a per-thread *splice* caches the previous insert's search path so sequential keys insert in near O(1). When the memtable reaches `write_buffer_size` (64 MB by default) it is frozen and a new one takes writes while the old one is flushed to an SSTable; the [LSM lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) continues from there.

**Java `ConcurrentSkipListMap`** is the standard library's only concurrent ordered map, for the same reason: lock-free insertion and deletion on a red-black tree is a research problem; on a skip list it is a CAS per level. It uses `p = 1/4` and separates index nodes from the base list so the base level is a plain lock-free linked list.

The costs: skip lists use more memory than a B-tree (a pointer per level per node, and a cache miss per node visited), and their O(log n) is expected, not guaranteed. A pathological level sequence, which random level generation makes astronomically unlikely, would degrade to a linked list. Nobody has been bitten by that; everyone has been bitten by the memory.

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

| | Treap | Skip list | Splay tree | Red-black |
|---|---|---|---|---|
| Bound | expected O(log n) | expected O(log n) | amortised O(log n), single op O(n) | worst-case O(log n) |
| Extra data per node | 4–8 byte priority | 1.33–2 pointers on average | none | 1 bit |
| Concurrency story | rotations move nodes | lock-free by design | reads write; serialises | rotations move nodes |
| Split / merge | O(log n), trivial | O(log n) with care | O(log n) amortised | O(log n), complex |
| Code size (insert + delete) | ~40 lines | ~60 lines | ~50 lines | ~150 lines |

The interviewer's follow-up after "I'd use a balanced BST" is often "how would you make it concurrent?" or "how do you get the k-th smallest quickly?", and the answers are in this table: a skip list for the first, subtree sizes or spans for the second, and a treap if the problem turns into splitting and joining sequences.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A Redis instance's memory is 5× the size of the data it holds in sorted sets | Each zset member costs ~80–100 bytes of skip-list node, level pointers and dict entry before the string; a million 20-byte members is ~120 MB, not 20 MB | Keep members short (ids, not JSON); use `ZADD` only where ranking is needed; small sets stay in listpack form, so shard many small zsets rather than one huge one |
| A treap-backed service shows O(n) depths in production although tests were fine | Priorities are derived from the key (a hash) or from a per-process seeded RNG an attacker can predict, so a crafted key set produces a chain; or the RNG is `random()` reseeded per request | Cryptographic or per-instance secret seeding; never derive priorities from the key on untrusted input |
| Read-only load on a splay-tree index scales negatively with cores | Every read splays, so every read writes the root's cache line; cores bounce it | Do not splay on reads under concurrency; use a red-black tree, a B-tree or a skip list |
| RocksDB write stalls appear every few seconds (`Stalling writes because we have N immutable memtables`) | The skip-list memtable fills faster than flushes drain; `write_buffer_size` and `max_write_buffer_number` are too small for the write rate | Raise them within memory limits, or add flush threads; the LSM lesson covers the stall arithmetic |
| `ZRANK` or rank-range queries are O(n) in a home-grown skip list | No spans on the pointers; rank needs a level-1 walk | Store the span per forward pointer and maintain it on insert and delete |
| A skip list under sequential inserts is slower than a red-black tree | Each insert walks from the head; with no splice cache the descent is repeated for adjacent keys | Cache the last insert's update vector (RocksDB's splice) or batch-sort and bulk-load |

## Interviewer follow-ups

**"Two replicas insert the same keys in different orders. How do you make their in-memory trees identical?"** Model answer: a treap whose priority is a deterministic function agreed by both replicas (for example a keyed hash of the key with a shared secret) has a shape that depends only on the set of (key, priority) pairs, so both replicas converge; the secret protects against adversarial keys. Common wrong answer: "an AVL tree, because it is deterministic", which is deterministic *given the order*, and the orders differ.

**"Why did Redis choose a skip list over a red-black tree for sorted sets?"** Model answer: shorter code, range operations that fall out of the bottom-level doubly linked list, rank queries via spans without augmenting a tree, and comparable memory at `p = 1/4`; not because of the asymptotic bound, which is only expected. Common wrong answer: "skip lists are faster", which is not true in general.

**"How does a reader survive a concurrent insert into a skip-list memtable without a lock?"** Model answer: the writer fully builds the node, then publishes it by writing the forward pointers from the bottom level up with release semantics; a reader that loads a pointer with acquire semantics sees either the old next (and skips the new node) or the new node with all its fields visible, and no existing node's key or level ever changes. Common wrong answer: "a read-write lock", which is exactly what the structure avoids.

**"A single splay operation costs O(n). Why is that acceptable and when is it not?"** Model answer: the amortised bound says any sequence of `m` operations costs O(m log n), so throughput is fine and a hot working set is served fast; it is unacceptable when a single operation has a latency SLO or when reads are concurrent, because reads restructure the tree. Common wrong answer: "it is never acceptable" or "the next operation is O(1) to make up for it".

**"Why must zig-zig rotate the grandparent before the parent?"** Model answer: rotating the parent first at every step (move-to-root) brings `x` up but leaves the path's other nodes as deep as before, so a chain accessed from the far end stays a chain and costs O(n) per access forever; zig-zig halves the depth of every node on the path, which is what the potential-function argument needs. The measurement in the lesson is 4.4 versus 1,000 rotations per access. Common wrong answer: "it does not matter as long as `x` reaches the root".

## What mid-level engineers get wrong

- **Calling a skip list's O(log n) a guarantee.** It is expected; the guarantee is probabilistic, and the honest cost is memory.
- **Deriving treap priorities from the key** for determinism, which hands an attacker the shape of the tree.
- **Putting a splay tree under a concurrent read path** because "reads are the common case", when reads are the expensive case for a splay tree.
- **Forgetting spans**, then implementing rank with a level-1 walk.
- **Implementing zig-zig as two parent rotations**, which passes every unit test and fails the amortised bound.
- **Choosing a skip list for a single-threaded ordered map** and paying 2× the pointer memory of a B-tree for no concurrency benefit.

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
- You can draw a skip list search, quote the level distribution for `p = 1/4` (a quarter of nodes reach level 2, 1.33 pointers per node) and explain why Redis stores a **span** on each forward pointer to make `ZRANK` logarithmic.
- You give the concurrency argument for skip lists (nodes never move; publish with one pointer write per level, release/acquire) and know that RocksDB, LevelDB and `ConcurrentSkipListMap` chose them for exactly that.
- You state the splay tree's **amortised** bound and its **working-set** property, can name the zig-zig rule and why the order matters, and immediately say why it is unsuitable for concurrent or latency-sensitive systems: reads write.
- You know that randomised balance is "expected", that nobody has been hurt by that, and that the real cost of a skip list is memory: ~80–100 bytes per Redis zset member before the string.
- Asked to make an ordered map concurrent or to support rank queries, you name the structure and the exact mechanism rather than saying "add a lock".

## Check yourself

```quiz
- q: >-
    Two replicas insert the same set of (key, priority) pairs into treaps in different orders. What is true of the resulting trees?
  options: ["They match only if priorities were assigned in sorted order", "They are identical, since the pairs alone fix the shape", "They differ, because insertion order changes the rotations", "They share the same height but can differ in shape"]
  answer: 1
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
  options: ["Inserts never move existing nodes, so readers need no locks", "It uses less memory per key than a red-black tree", "It has a better worst-case bound than a red-black tree", "It supports range scans, which balanced trees cannot do"]
  answer: 0
  explanation: >-
    Rotations relocate nodes and modify several pointers at once, which readers must not see half-done. Skip list inserts splice a new node in with one pointer write per level; a reader either sees it or does not. Memory is higher (a pointer per level per node), trees support range scans fine, and the skip list's bound is only expected.
- q: >-
    Redis, LevelDB and RocksDB all use p = 1/4 for skip-list levels rather than p = 1/2. What does that choice change?
  options: ["Inserts no longer need the update vector, since levels are sparser", "Searches become about twice as fast because there are half as many levels", "The worst case improves because tall towers become rarer", "Memory per node drops to 1.33 pointers while search cost stays about the same"]
  answer: 3
  explanation: >-
    Halving the levels is paid back by walking up to three nodes per level instead of one, so the expected search cost is nearly unchanged (about 41 steps for a million keys either way), but the expected pointer count falls from 2 to 1.33 per node. The worst case is still a chain in principle, and insertion still records the update vector.
- q: >-
    A single splay tree lookup takes O(n) time. What does the amortised O(log n) bound tell you?
  options: ["The next lookup is guaranteed to be O(1) to compensate", "The tree has degenerated and must now be rebuilt", "That lookup was a bug in the splay implementation", "Any sequence of m operations costs O(m log n) in total"]
  answer: 3
  explanation: >-
    Amortised bounds constrain totals, not individual operations. The O(n) lookup restructured the tree so that following operations are cheaper, and the potential-function argument shows the sum stays O(m log n). It promises nothing about any particular next operation.
- q: >-
    You need an in-memory ordered index for a service with a p99 latency SLO, moderate write rate and a single-threaded access path. Which is the weakest choice?
  options: ["An in-memory B-tree", "A randomised treap", "A splay tree", "A red-black tree"]
  answer: 2
  explanation: >-
    A splay tree can spend O(n) on one operation, which is exactly what a tail-latency SLO forbids. Red-black and B-trees have worst-case bounds; a treap's bounds are expected but its bad cases are astronomically unlikely and not workload-triggerable.
```

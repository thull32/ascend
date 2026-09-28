---
slug: merging-and-partitioning
title: Merging and partitioning
description: Merge two sorted lists with a sentinel and a full trace, k-way merge three ways with measured costs (sequential O(nk) against a heap of heads at O(n log k)), stable partition around a value with two sentinel lists, the reorder problem step by step, and the same merges inside heapq, Timsort, the Linux kernel, external sorting and LSM compaction.
minutes: 45
difficulty: medium
tags: [linked-list, merge, k-way-merge, partition, merge-sort, sentinel, heap, lsm, external-sort, timsort]
problems: [merge-two-sorted-lists, merge-k-sorted-lists, reorder-list, add-two-numbers]
---
A storage engine flushes sorted runs of records to disk and, later, has to combine dozens of them into one sorted file without loading everything into memory. A log aggregator receives sorted-by-timestamp streams from a hundred servers and must emit one ordered stream. Merge sort needs to combine two sorted halves. All three are the same operation: walk several sorted sequences in lockstep, always taking the smallest head. On linked lists it is the cleanest algorithm you will write, because splicing nodes costs nothing.

Partitioning is the sibling operation: split one list into two by a predicate, then join them. On arrays, in-place partitioning scrambles order; on lists it is naturally stable, because you never move a node past another, you only re-thread the pointers. The price of that freedom is a class of bug (a stale `next` pointer) that produces a cycle instead of an error, and this lesson shows it happening.

## Merging two sorted lists

Given heads `a` and `b` of two sorted lists, build the merged list by repeatedly detaching the smaller head and appending it to a result tail. A sentinel gives the result a tail to append to from the start.

```python
def merge(a, b):
    sentinel = ListNode(0)
    tail = sentinel
    while a is not None and b is not None:
        if a.val <= b.val:          # <= keeps the merge stable: ties take from a
            tail.next = a
            a = a.next
        else:
            tail.next = b
            b = b.next
        tail = tail.next
    tail.next = a if a is not None else b     # splice whichever list remains
    return sentinel.next
```

```viz
{"type": "linked-list", "algorithm": "merge-sorted", "values": [1, 2, 4, 7], "values2": [1, 3, 4, 8, 9], "title": "Merge: always take the smaller head"}
```

Trace with `a = 1 → 2 → 4`, `b = 1 → 3 → 4` (`S` is the sentinel):

| step | `a` head | `b` head | comparison | taken | `tail` after | result from `S` |
|---|---|---|---|---|---|---|
| 1 | 1 | 1 | `1 <= 1` | a's 1 | 1 | `1` |
| 2 | 2 | 1 | `2 <= 1` false | b's 1 | 1 (b's) | `1 → 1` |
| 3 | 2 | 3 | `2 <= 3` | a's 2 | 2 | `1 → 1 → 2` |
| 4 | 4 | 3 | `4 <= 3` false | b's 3 | 3 | `1 → 1 → 2 → 3` |
| 5 | 4 | 4 | `4 <= 4` | a's 4 | 4 | `1 → 1 → 2 → 3 → 4` |
| splice | – | 4 | `a` is null | rest of `b` | – | `1 → 1 → 2 → 3 → 4 → 4` |

Five comparisons for six nodes, then one pointer write for the remainder. Three properties worth stating out loud:

- **O(n + m) time, O(1) extra space.** No nodes are allocated; the existing nodes are re-threaded. An array merge needs an output array of size `n + m`.
- **Stable** because of `<=`: on ties, the node from the first list comes first, which is why step 1 took a's 1 and step 5 took a's 4. Stability matters when the values are keys of records and the input order carries meaning (earlier timestamp, newer version).
- **The final splice is O(1).** Once one list is exhausted, the remainder of the other is already sorted and already linked. The array version has to copy the remainder.

The recursive version (`merge(a.next, b)` or `merge(a, b.next)`) is two lines shorter and O(n + m) stack; the cliffs are the ones in [Reversal and runner techniques](/learn/data-structures/linked-lists/reversal-and-runner-techniques): 1,000 frames by default in CPython, about 10⁴ in V8. Write it iteratively for anything whose length you do not control. [Merge Two Sorted Lists](/practice/merge-two-sorted-lists) is the practice problem.

## Merge sort on a linked list

Merge sort is the natural sort for linked lists: it needs only sequential access and the merge is in place. Split with the runner (first middle, then cut), sort both halves, merge.

```python
def merge_sort(head):
    if head is None or head.next is None:
        return head
    slow, fast = head, head.next          # fast starts one ahead: first middle
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
    right = slow.next
    slow.next = None                      # cut
    return merge(merge_sort(head), merge_sort(right))
```

O(n log n) time, O(log n) stack, no extra nodes. The `fast = head.next` start is the line that decides whether the function terminates; trace the two-node list `1 → 2` both ways:

| `fast` starts at | `slow` stops at | left half | right half | outcome |
|---|---|---|---|---|
| `head` | 2 | `1 → 2` | empty | `merge_sort(1 → 2)` calls itself with the same input: infinite recursion |
| `head.next` | 1 | `1` | `2` | two singletons, merged to `1 → 2` |

A bottom-up variant (merge runs of length 1, then 2, then 4, …) is fully iterative and O(1) extra space; the Linux kernel's `list_sort` is a bottom-up merge over intrusive lists (under the hood, below). Quicksort on a linked list is possible but pointless: it needs random access to pick good pivots and gains nothing from in-place swapping. Heap sort needs index arithmetic. So "how would you sort a linked list?" has exactly one good answer, and [Comparison sorts](/learn/algorithms/sorting-searching/comparison-sorts) covers why merge sort is the stable one.

## k-way merge

With `k` sorted lists totalling `n` nodes there are three strategies, and the difference between the first and the others is a factor of `k / log k`.

**Sequential merging.** Merge list 1 into list 2, the result into list 3, and so on. The `i`-th merge re-walks everything merged so far, so the total is about `n × k / 2` node visits: O(nk).

**Divide and conquer.** Pair the lists up and merge each pair, halving `k` each round. Each round touches all `n` nodes once, and there are `log₂ k` rounds: O(n log k), with the same two-list code.

**Min-heap of heads.** Put the head of each list into a min-heap keyed by value (`k` entries). Repeatedly pop the smallest, append it to the output, and push that node's successor. Each of the `n` nodes is pushed and popped once at O(log k): O(n log k) time, O(k) extra space.

```python
import heapq

def merge_k(lists):
    heap = []
    for i, node in enumerate(lists):
        if node is not None:
            heap.append((node.val, i, node))   # i breaks ties: nodes are never compared
    heapq.heapify(heap)
    sentinel = ListNode(0)
    tail = sentinel
    while heap:
        val, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next is not None:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return sentinel.next
```

The `i` in the tuple is not decoration. On a tie in `val`, Python compares the next tuple element; without `i` that is the two `ListNode` objects, and CPython raises `TypeError: '<' not supported between instances of 'ListNode' and 'ListNode'`. With `i`, ties resolve by list index, which also makes the merge stable (earlier list wins).

## The heap of heads, traced and measured

Trace on `[1 → 4 → 9]`, `[2 → 3 → 10]`, `[5 → 6]` (heap shown sorted, entries as `value(list)`):

| step | popped | pushed | heap after | output so far |
|---|---|---|---|---|
| 0 | – | heads | `1(L0), 2(L1), 5(L2)` | |
| 1 | 1 (L0) | 4 | `2(L1), 4(L0), 5(L2)` | `1` |
| 2 | 2 (L1) | 3 | `3(L1), 4(L0), 5(L2)` | `1 → 2` |
| 3 | 3 (L1) | 10 | `4(L0), 5(L2), 10(L1)` | `1 → 2 → 3` |
| 4 | 4 (L0) | 9 | `5(L2), 9(L0), 10(L1)` | `… → 4` |
| 5 | 5 (L2) | 6 | `6(L2), 9(L0), 10(L1)` | `… → 5` |
| 6 | 6 (L2) | – | `9(L0), 10(L1)` | `… → 6` |
| 7 | 9 (L0) | – | `10(L1)` | `… → 9` |
| 8 | 10 (L1) | – | empty | `1 → 2 → 3 → 4 → 5 → 6 → 9 → 10` |

Eight pops for eight nodes, the heap never larger than three. The heap version is the one that works for *streams*, because it never needs all of a list at once, only the current head of each: that is how external merge sort combines runs on disk, how LSM compaction merges SSTables, and how log aggregators produce a globally ordered stream. Python's `heapq.merge` is this loop. [Top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge) covers the heap side; [Merge k Sorted Lists](/practice/merge-k-sorted-lists) is the interview version; [K-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) is the pattern lesson.

How much the strategy matters, counted as node visits for `k` lists of 1,000 nodes each (sequential is `Σ (i + 1) × 1,000` over the merges; heap is `n log₂ k`):

| `k` | `n` | sequential | heap of heads | ratio |
|---|---|---|---|---|
| 2 | 2,000 | 2,000 | 2,000 | 1.0 |
| 8 | 8,000 | 35,000 | 24,000 | 1.5 |
| 64 | 64,000 | 2,079,000 | 384,000 | 5.4 |
| 1,000 | 1,000,000 | 500,499,000 | 9,965,784 | 50 |

At `k = 3` nobody can tell the difference; at a thousand input streams the sequential version does half a billion visits where the heap does ten million.

## Partitioning a list around a value

"Rearrange the list so every node with value less than `x` comes before every node with value `≥ x`, preserving the relative order within each group." On an array this is the stable-partition problem and needs O(n) extra space or an O(n log n) in-place algorithm. On a list it is one pass with two sentinels.

```python
def partition(head, x):
    less, more = ListNode(0), ListNode(0)     # sentinels for the two sublists
    lt, mt = less, more                       # their tails
    node = head
    while node is not None:
        if node.val < x:
            lt.next = node
            lt = node
        else:
            mt.next = node
            mt = node
        node = node.next
    mt.next = None            # terminate the second list, or it may still point into the first
    lt.next = more.next       # join: the "less" list followed by the "more" list
    return less.next
```

Trace on `1 → 4 → 3 → 2 → 5 → 2` with `x = 3`. Appending a node to a sublist overwrites only the *previous* tail's `next`; the node's own `next` still points into the original list until it is overwritten in turn, which is what the last column shows:

| step | node | goes to | `less` (from sentinel) | `more` (from sentinel) | `more` tail's stale `next` |
|---|---|---|---|---|---|
| 1 | 1 | less | `1` | empty | – |
| 2 | 4 | more | `1` | `4` | 3 |
| 3 | 3 | more | `1` | `4 → 3` | 2 |
| 4 | 2 | less | `1 → 2` | `4 → 3` | 2 |
| 5 | 5 | more | `1 → 2` | `4 → 3 → 5` | 2 (the last node) |
| 6 | 2 | less | `1 → 2 → 2` | `4 → 3 → 5` | 2 |

After the loop, node 5 (the `more` tail) still points at the final 2, which is now the `less` tail. `mt.next = None` cuts that; `lt.next = more.next` joins; the result is `1 → 2 → 2 → 4 → 3 → 5`, both groups in their original order. Skip the termination and the joined list reads `1 → 2 → 2 → 4 → 3 → 5 → 2 → 4 → 3 → 5 → …`: a cycle through the stale pointer, and a traversal that never ends. Whenever you re-thread nodes into several lists, terminate every list explicitly before joining.

The same two-sentinel pattern solves: separate odd- and even-indexed nodes (odd-even list), split by parity of value, and quicksort-style partition, which is stable on lists unlike on arrays. The three-way version with a third sentinel for `== x` is the Dutch national flag from [In-place techniques](/learn/data-structures/arrays-strings/in-place-techniques) without any of its index juggling.

## Reorder problems: composing the primitives

Most "rearrange this list" problems compose middle, reverse, merge and partition. **Reorder** `1 → 2 → 3 → 4 → 5` into `1 → 5 → 2 → 4 → 3` ([Reorder List](/practice/reorder-list)) uses three of them:

```python
def reorder(head):
    slow, fast = head, head.next                  # first middle
    while fast is not None and fast.next is not None:
        slow, fast = slow.next, fast.next.next
    second, slow.next = slow.next, None           # cut
    prev = None
    while second is not None:                     # reverse the second half
        second.next, prev, second = prev, second, second.next
    a, b = head, prev
    while b is not None:                          # interleave: a, b, a, b, ...
        a_next, b_next = a.next, b.next
        a.next, b.next = b, a_next
        a, b = a_next, b_next
```

| stage | state |
|---|---|
| split at the first middle | `1 → 2 → 3` and `4 → 5` |
| reverse the second half | `1 → 2 → 3` and `5 → 4` |
| interleave, step 1 | `1 → 5 → 2 → 3`; `a = 2`, `b = 4` |
| interleave, step 2 | `1 → 5 → 2 → 4 → 3`; `b` is null, stop |

The first-middle split matters: for an odd length the first half is the longer one, so the interleave ends with the middle node in place and `b` running out first. The interleave is a merge with "alternate" instead of "smaller first".

Three more, each a two-list walk: **remove duplicates from a sorted list** (walk with `p`; while `p.next.val == p.val`, bypass); **add two numbers stored as reversed-digit lists** ([Add Two Numbers](/practice/add-two-numbers)), which is `merge` with a carry instead of a comparison and a final carry node people forget; **rotate a list by `k`**, where connecting the tail to the head to make a ring, walking `n − k mod n` steps and cutting is simpler than juggling two ends. The common thread: never allocate nodes unless a new value must exist, and always terminate lists explicitly.

## Under the hood: heapq, Timsort, list_sort and compaction

**`heapq.merge`** (CPython, `Lib/heapq.py`) is the heap-of-heads loop with two refinements: each heap entry is a small list `[value, order, next]` where `order` is the input's index (so ties never compare the iterators, and the merge is stable) and `next` is the bound `__next__` of that input; and after yielding a value it calls `heapreplace`, one sift-down instead of a pop and a push. It supports `key=` and `reverse=` and never materialises an input.

**Timsort**, the sort behind Python's `sorted`, Java's `Arrays.sort` for objects and V8's `Array.prototype.sort`, is a merge sort over the runs already present in the input. Runs shorter than `minrun` (32 to 64, chosen so the run count is close to a power of two) are extended with insertion sort; merging uses a temporary buffer of the smaller run and switches to *galloping* (binary search for how far the next element from one run reaches) after one run wins `MIN_GALLOP = 7` comparisons in a row. CPython 3.11 replaced the original run-stack invariants with the powersort merge policy; the merge step itself is unchanged.

**Linux `list_sort`** (`lib/list_sort.c`) sorts intrusive `list_head` lists bottom-up: it walks the input once, keeping a pending set of sorted sub-lists and merging pairs so that the pending sizes stay in a 2:1 ratio, which keeps merges cache-resident, and it ignores the `prev` pointers entirely until a final pass rebuilds them. Callers pass a comparison function; the kernel uses it for block-layer request queues and for sorting file system extents.

## Under the hood: compaction and external sort

**LSM compaction.** RocksDB's default configuration triggers a compaction when level 0 holds 4 files, writes 64 MB target files, and sizes level 1 at 256 MB with each further level 10× the previous. A compaction opens an iterator per input file and drives them through a `MergingIterator`, a min-heap of heads exactly like `merge_k`; when the same key appears in several inputs, the entry with the highest sequence number (the newest write) is emitted and older versions and tombstones are dropped once no snapshot needs them. That tie rule is the merge's stability rule with "newest run wins". [LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) has the structure; [Storage engine internals](/learn/databases/storage-and-scale/storage-engine-internals) the engine around it.

**External sort.** Postgres sorts a result larger than `work_mem` (default 4 MB) by sorting `work_mem`-sized runs in memory, spilling each to a temporary file, and k-way merging the runs; at 1 GB of input that is on the order of 250 runs and, since the merge only needs one buffered block per run, a single merge pass. In general, with memory for `M` runs at once, `r` runs take `⌈log_M r⌉` passes over the data, and each extra pass reads and writes everything again. Raising `work_mem` shortens the merge; lowering it multiplies passes.

## Trade-offs

| Strategy | Time | Extra space | Streams? | Node visits at `k = 64`, `n = 64,000` | Stability | Code |
|---|---|---|---|---|---|---|
| Sequential merging | O(nk) | O(1) | no | 2,079,000 | tie rule per merge | the two-list merge in a loop |
| Divide and conquer | O(n log k) | O(log k) stack | no | 384,000 | preserved if pairs keep input order | the two-list merge, recursive |
| Min-heap of heads | O(n log k) | O(k) | yes | 384,000 (plus heap constant) | needs an explicit tiebreaker | heap plus the tuple trick |
| Concatenate and sort | O(n log n) | O(n) | no | ~1,000,000 comparisons | Timsort is stable | one line, wrong at scale |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Compaction or log-merge time grows with the square of the number of input files | Inputs are merged one at a time into an accumulator: O(nk); at 64 inputs that is 5× the heap's work, at 1,000 it is 50× | Heap of heads or pairwise divide and conquer |
| `TypeError: '<' not supported between instances of 'ListNode' and 'ListNode'` from `heapq`, only on inputs with equal keys | Heap entries are `(val, node)`; on a tie Python compares the nodes | `(val, index, node)` or a counter; `heapq.merge` does this for you |
| A traversal after a partition never terminates | The second sublist's tail still points into the first (the `5 → 2 → 4 → 3 → 5 …` cycle above) | Terminate every re-threaded list; a Floyd assertion in tests ([Cycle detection](/learn/data-structures/linked-lists/cycle-detection)) |
| List merge sort hangs or overflows the stack on two-element input | The split started `fast` at `head` and produced an empty right half | Start `fast` at `head.next`; test lengths 1, 2 and 3 |
| A deleted or overwritten key comes back after compaction | The merge's tie rule preferred the older version (`<` instead of `<=` with the wrong source first, or sequence numbers compared the wrong way) | Newest run wins ties, tested with a key present in two inputs |
| `RecursionError` or `StackOverflowError` from a merge on long lists | Recursive two-list merge; depth equals the output length | Iterative merge with a sentinel |
| A merged stream stalls although most inputs have data | The heap needs a head from every input, and one input is idle | Per-input timeouts or idleness markers (watermarks in Flink and Kafka Streams) so an idle input stops blocking the heap |

## Interviewer follow-ups

**Q: "Merge k sorted lists. Which strategy and why?"**

Model answer: name all three with their costs, then write the heap version because it is O(n log k), O(k) extra, and streaming; mention that pairwise divide and conquer has the same complexity with no heap and is the better choice when all inputs are in memory and `k` is small. Put a number on it: at `k = 64` the sequential version does about 5× the work, at `k = 1,000` about 50×. Common wrong answer: concatenate and sort, O(n log n) and O(n) memory, which throws away the fact that the inputs are sorted.

**Q: "Your heap merge crashes with a `TypeError` on some inputs."**

Model answer: the inputs have equal keys, so the tuple comparison falls through to the node objects, which are not orderable. Add a tiebreaker (the list index or a counter) between the key and the node, which also fixes stability. Common wrong answer: defining `__lt__` on the node class, which works but hides the tie rule inside a data class and makes stability an accident.

**Q: "How does an LSM compaction decide which version of a key to keep?"**

Model answer: the merge iterates all input files through a heap of heads ordered by key and, within a key, by sequence number descending, so the newest version surfaces first; older versions and tombstones are dropped once no open snapshot needs them. It is the stable merge's tie rule with a defined priority. Common wrong answer: "the higher level wins", which is backwards (newer data lives in lower levels).

**Q: "Sort a singly linked list in O(1) extra space."**

Model answer: bottom-up merge sort, merging runs of length 1, 2, 4, … with the sentinel-and-splice merge; O(n log n), no recursion, no allocation. Top-down is O(log n) stack, which is acceptable for most inputs but not O(1). Common wrong answer: quicksort, which needs random access for pivots and buys nothing from in-place swaps on a list.

**Q: "Why is a stable partition free on a list but not on an array?"**

Model answer: a list partition re-threads nodes into two output lists in input order, one pointer write per node; an array must move elements past each other, and keeping order costs O(n) extra space or an O(n log n) in-place rotation scheme. Common wrong answer: "arrays can do it with two pointers", which is the unstable Dutch-flag partition.

## What mid-level engineers get wrong

- **Comparing with `<` instead of `<=`.** Ties come from the second list, the merge becomes unstable, and in a compaction that means the older version of a record wins.
- **Merging k inputs sequentially because "merge is O(n)".** Each merge is O(n), but the `k`-th one re-walks all previous output; the total is O(nk).
- **`(val, node)` tuples in the heap.** Works until the first tie in production, then a `TypeError`.
- **Forgetting to terminate re-threaded lists.** No error; a cycle that shows up as a hung traversal later.
- **Starting `fast` at `head` when splitting for merge sort.** Infinite recursion on any two-node sublist, which every non-trivial input contains.
- **Treating the merge as the whole cost of external sorting.** Each extra merge pass reads and writes the entire data set again; the number of passes, set by memory, is the cost that matters.

## Where this shows up in systems

- **External merge sort** is every database's `ORDER BY` on a result larger than memory; Postgres's run size is `work_mem` (4 MB by default) and the merge is a heap of one block per run.
- **LSM-tree compaction** in RocksDB, Cassandra and LevelDB is a heap merge of SSTable iterators with "newest sequence number wins" as the tie rule.
- **Timsort** in Python, Java and V8 is a merge sort over natural runs with galloping after 7 straight wins.
- **Stream joins** in Kafka Streams and Flink merge time-ordered streams by timestamp, buffering only heads, with watermarks deciding when a head is final.

```viz
{"type": "system", "algorithm": "lsm-tree", "title": "LSM tree: memtable flushes become sorted runs, compaction k-way merges them"}
```

## Exercises

```exercise
id: merge-sorted
title: Merge two sorted linked lists
prompt: |
  `a` and `b` are heads of sorted singly linked lists (either may be empty,
  passed as `None`/`null`, but not both). Merge them into one sorted list
  by re-threading the existing nodes (do not allocate new value nodes) and
  return its head. On ties take the node from `a` first.
languages: [python, javascript]
entry: merge_sorted
starter:
  python: |
    def merge_sorted(a, b):
        # your code here
        return a
  javascript: |
    function merge_sorted(a, b) {
      // your code here
      return a;
    }
tests:
  - args: [{"$list": [1, 2, 4]}, {"$list": [1, 3, 4]}]
    expected: {"$list": [1, 1, 2, 3, 4, 4]}
  - args: [{"$list": []}, {"$list": [0]}]
    expected: {"$list": [0]}
    label: first list empty
  - args: [{"$list": [5]}, {"$list": []}]
    expected: {"$list": [5]}
    label: second list empty
  - args: [{"$list": [1, 2, 3]}, {"$list": [4, 5]}]
    expected: {"$list": [1, 2, 3, 4, 5]}
    label: no interleaving
  - args: [{"$list": [2, 2]}, {"$list": [1, 1]}]
    expected: {"$list": [1, 1, 2, 2]}
    hidden: true
  - args: [{"$list": [1, 3, 5, 7]}, {"$list": [2, 4, 6]}]
    expected: {"$list": [1, 2, 3, 4, 5, 6, 7]}
    hidden: true
hints:
  - "Use a sentinel with a `tail` pointer; loop while both lists are non-empty and append the smaller head."
  - "After the loop, `tail.next` is whichever list is left; no copying needed."
```

```exercise
id: partition-list
title: Stable partition around a value
prompt: |
  Rearrange the list so that all nodes with value less than `x` come
  before all nodes with value greater than or equal to `x`, preserving
  the original relative order inside each group. Return the new head.
  Re-thread the existing nodes into two sublists and join them; remember
  to terminate the second sublist.
languages: [python, javascript]
entry: partition_list
starter:
  python: |
    def partition_list(head, x):
        # your code here
        return head
  javascript: |
    function partition_list(head, x) {
      // your code here
      return head;
    }
tests:
  - args: [{"$list": [1, 4, 3, 2, 5, 2]}, 3]
    expected: {"$list": [1, 2, 2, 4, 3, 5]}
  - args: [{"$list": [2, 1]}, 2]
    expected: {"$list": [1, 2]}
  - args: [{"$list": [1, 2, 3]}, 0]
    expected: {"$list": [1, 2, 3]}
    label: everything is >= x
  - args: [{"$list": [3, 1, 2]}, 10]
    expected: {"$list": [3, 1, 2]}
    label: everything is < x
  - args: [{"$list": [5, 4, 3, 2, 1]}, 3]
    expected: {"$list": [2, 1, 5, 4, 3]}
    hidden: true
  - args: [{"$list": [1]}, 1]
    expected: {"$list": [1]}
    hidden: true
hints:
  - "Two sentinels (`less`, `more`) with two tails; append each node to one of them in a single pass."
  - "Set the `more` tail's `next` to null before joining, or the result may contain a cycle."
```

## Senior signals

- You merge with a sentinel and `<=`, can trace which steps the tie rule decides, and can say why stability is the "newest version wins" rule in a compaction.
- You know the three k-way strategies with their costs, can put numbers on the gap (5× at 64 inputs, 50× at 1,000), and know only the heap version works on streams.
- You put a tiebreaker between the key and the node in heap entries and can name the `TypeError` you get without it.
- You start `fast` at `head.next` when splitting for merge sort and can trace the two-node infinite recursion otherwise.
- You terminate every re-threaded list explicitly and can show the exact cycle you get when you forget.
- You see reorder, odd-even, add-two-numbers and remove-duplicates as compositions of middle, reverse, merge and partition.
- You connect list merging to `heapq.merge`, Timsort's galloping, the kernel's `list_sort`, external sort passes and LSM compaction.

## Check yourself

```quiz
- q: >-
    In the two-list merge, why compare with `a.val <= b.val` rather than `<`?
  options: ["Ties then skip a comparison, which makes the loop measurably faster", "Ties then take from the first list, which keeps the merge stable", "Ties then take from both lists at once, which removes duplicate values", "Ties then advance a pointer, which prevents an infinite loop on equal heads"]
  answer: 1
  explanation: >-
    With `<`, ties take from b, reversing the relative order of equal keys across the two inputs. Stability (first input wins ties) is what merge sort and record merging rely on, and in a compaction it is the rule that keeps the newest version. Both versions advance exactly one pointer per iteration, so `<` would not loop forever; it would only lose stability.
- q: >-
    Merging k sorted lists totalling n nodes by merging them one after another into an accumulator costs:
  options: ["O(nk), because each merge re-walks everything merged so far", "O(n log k), because each node takes part in log k of the merges", "O(k log n), because the accumulator doubles in length each merge", "O(n), because every node is appended to the output exactly once"]
  answer: 0
  explanation: >-
    The i-th merge re-walks everything merged so far, so the total is roughly n × k / 2: about 2 million visits for 64 lists of 1,000 against 384,000 for a heap. The early lists' nodes take part in almost every merge, not log k of them; it is pairwise divide-and-conquer or a heap of heads that reduces the cost to O(n log k).
- q: >-
    Which k-way merge strategy is appropriate when the inputs are unbounded sorted streams arriving over the network?
  options: ["Collecting all streams, then sorting them together with one stable sort", "Divide and conquer, pairing streams up and merging each pair recursively", "A min-heap of size k holding only the current head of each stream", "Sequential merging, folding each stream into one growing output"]
  answer: 2
  explanation: >-
    Only the heap approach needs one element per input at a time. The others need each input to be complete before merging, which never happens for an unbounded stream; divide and conquer has the same O(n log k) cost but not the streaming property. This is how external sort, LSM compaction and log aggregators work.
- q: >-
    In the two-sentinel partition of a list, what happens if you forget to set the tail of the "greater or equal" sublist's `next` to null?
  options: ["The second sublist is dropped, since the join reads a stale pointer", "Nothing, since the last node appended was already the original tail", "The order within groups is lost, since that node's `next` skips ahead", "The result can contain a cycle through that node's stale `next` pointer"]
  answer: 3
  explanation: >-
    Nodes keep their original `next` pointers until overwritten. The last node placed in the second sublist may be from the middle of the original list and still point at a node that was moved to the first sublist; after the join the list reads 1 → 2 → 2 → 4 → 3 → 5 → 2 → 4 → 3 → 5 and so on forever. It is only already null when that node happened to be the original tail.
- q: >-
    A merge sort on a linked list recurses forever on two-node input. The most likely cause is:
  options: ["The merge is unstable, so equal nodes keep swapping between the halves", "The recursion is not tail-recursive, so the stack never unwinds", "The list contains duplicates, which the midpoint split cannot separate", "The split starts fast at head, so the right half comes out empty"]
  answer: 3
  explanation: >-
    For a two-node list, slow must stop at the first node so the split yields two singletons. Starting fast at head advances slow to node two, the cut produces (whole list, empty), and the left recursion never shrinks. Start fast at head.next. Stability and duplicate values affect only the order of the output, never the size of the halves.
- q: >-
    A Python heap merge that pushes `(node.val, node)` tuples works in tests but raises `TypeError` in production. Why?
  options: ["The heap grew beyond k entries, so heapq compared entries of different lengths", "Two nodes had equal values, so the tuple comparison fell through to the node objects", "The values were floats, which heapq cannot order against integers", "A list was empty, so `None` was pushed and compared with an integer"]
  answer: 1
  explanation: >-
    Tuples compare element by element; when the first elements tie, Python compares the second, and `ListNode` objects have no ordering. Put a tiebreaker (the input index or a counter) between the key and the node, which also makes the merge stable. Empty inputs are skipped before pushing, heap size does not affect comparison, and ints and floats compare fine.
```

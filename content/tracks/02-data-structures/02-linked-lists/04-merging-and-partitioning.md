---
slug: merging-and-partitioning
title: Merging and partitioning
description: Merge two sorted lists with a sentinel, scale to k-way merge three ways, partition a list around a value while keeping order, and see why these primitives power merge sort and log-structured storage.
minutes: 40
difficulty: medium
tags: [linked-list, merge, k-way-merge, partition, merge-sort, sentinel]
problems: [merge-two-sorted-lists, merge-k-sorted-lists, reorder-list, add-two-numbers]
---
A storage engine flushes sorted runs of records to disk and, later, has to combine dozens of them into one sorted file without loading everything into memory. A log aggregator receives sorted-by-timestamp streams from a hundred servers and must emit one ordered stream. Merge sort needs to combine two sorted halves. All three are the same operation: walk several sorted sequences in lockstep, always taking the smallest head. On linked lists it is the cleanest algorithm you will write, because splicing nodes costs nothing.

Partitioning is the sibling operation: split one list into two by a predicate, then join them. On arrays, in-place partitioning scrambles order; on lists it is naturally stable, because you never move a node past another, you only re-thread the pointers.

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

Trace with `a = 1 → 2 → 4`, `b = 1 → 3 → 4`:

| step | a | b | taken | result so far |
|---|---|---|---|---|
| 1 | 1 | 1 | a's 1 (tie → a) | `1` |
| 2 | 2 | 1 | b's 1 | `1 → 1` |
| 3 | 2 | 3 | a's 2 | `1 → 1 → 2` |
| 4 | 4 | 3 | b's 3 | `1 → 1 → 2 → 3` |
| 5 | 4 | 4 | a's 4 | `… → 4` |
| 6 | – | 4 | splice rest of b | `1 → 1 → 2 → 3 → 4 → 4` |

Three properties worth stating out loud:

- **O(n + m) time, O(1) extra space.** No nodes are allocated; the existing nodes are re-threaded. An array merge needs an output array of size `n + m`.
- **Stable** because of `<=`: on ties, the node from the first list comes first. Stability matters when the values are keys of records and the input order carries meaning (earlier timestamp, earlier insertion).
- **The final splice is O(1).** Once one list is exhausted, the remainder of the other is already sorted and already linked; you attach it with one pointer write. The array version has to copy the remainder.

The recursive version (`merge(a.next, b)` or `merge(a, b.next)`) is two lines shorter and O(n + m) stack. Same rule as reversal: write it iteratively for anything whose length you do not control. [Merge Two Sorted Lists](/practice/merge-two-sorted-lists) is the practice problem.

## Merge sort on a linked list

Merge sort is the natural sort for linked lists: it needs only sequential access and the merge is in-place. Split with the runner (first middle, then cut the link), sort both halves, merge.

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

O(n log n) time, O(log n) stack for the recursion, no extra nodes. A bottom-up variant (merge runs of length 1, then 2, then 4, …) is fully iterative and O(1) extra space; the Linux kernel's `list_sort` is a bottom-up merge sort over intrusive lists. Quicksort on a linked list is possible but pointless: it needs random access to pick good pivots and gains nothing from in-place swapping. Heap sort is impossible without index arithmetic. So "how would you sort a linked list?" has exactly one good answer.

The `fast = head.next` start is deliberate: for a two-node list, `slow` must stop at the first node so the cut produces two one-node lists. Start `fast` at `head` and `slow` lands on the second node, `right` is empty, and the recursion never shrinks the left half: infinite recursion. Trace the two-node case before trusting any list merge sort.

## k-way merge

With `k` sorted lists totalling `n` nodes, there are three strategies, and the difference is a factor of `k` versus `log k`.

**Sequential merging.** Merge list 1 into list 2, the result into list 3, and so on. The `i`-th merge touches everything merged so far, so the total is about `n × k / 2` node visits: O(nk). Fine for `k = 3`; hopeless for `k = 10,000` streams.

**Divide and conquer.** Pair the lists up and merge each pair, halving `k` each round. Each round touches all `n` nodes once, and there are `log₂ k` rounds: O(n log k). No extra structure, and the same code as merging two lists.

**Min-heap of heads.** Put the head of each list into a min-heap keyed by value (`k` entries). Repeatedly pop the smallest, append it to the output, and push that node's successor. Each of the `n` nodes is pushed and popped once at O(log k): O(n log k) time, O(k) extra space. This is the version that works for *streams*, because it never needs all of a list at once, only the current head of each; it is how external merge sort combines runs on disk, how LSM-tree compaction merges SSTables, and how log aggregators produce a globally ordered stream. In Python, `heapq.merge` is exactly this. [Top-k and k-way merge](/learn/data-structures/heaps/top-k-and-k-way-merge) covers the heap side; [Merge k Sorted Lists](/practice/merge-k-sorted-lists) is the interview version, and the senior answer names all three strategies with their costs before writing the heap one.

| Strategy | Time | Extra space | Streams? |
|---|---|---|---|
| Sequential | O(nk) | O(1) | No |
| Divide and conquer | O(n log k) | O(log k) stack | No |
| Min-heap of heads | O(n log k) | O(k) | Yes |

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

Trace on `1 → 4 → 3 → 2 → 5 → 2`, `x = 3`: nodes go to `less`: 1, 2, 2 and to `more`: 4, 3, 5, each appended in the order encountered. Join: `1 → 2 → 2 → 4 → 3 → 5`. Both groups keep their original order.

The line `mt.next = None` is the one people forget. The last node appended to `more` may be a node from the middle of the original list whose `next` still points at a node that is now in `less`; leaving it creates a cycle. Whenever you re-thread nodes into multiple lists, terminate every list explicitly before joining.

The same two-sentinel pattern solves: separate odd- and even-indexed nodes (odd-even list), split by parity of value, and quicksort-style partition (which is stable on lists, unlike on arrays; the three-way version with a third sentinel for `== x` is the Dutch national flag from [In-place techniques](/learn/data-structures/arrays-strings/in-place-techniques) without any of its subtlety).

## Reorder problems: composing the primitives

Most "rearrange this list" problems are compositions of middle, reverse, merge and partition.

**Reorder** `1 → 2 → 3 → 4 → 5` into `1 → 5 → 2 → 4 → 3`: find the first middle (3), cut, reverse the second half (`5 → 4`), then interleave the two halves by alternately taking a node from each. The interleave is a merge with "alternate" instead of "smaller first". [Reorder List](/practice/reorder-list).

**Remove duplicates from a sorted list** (keep one of each): walk with `p`; while `p.next.val == p.val`, bypass. To remove *all* nodes that have duplicates, use a sentinel and compare `p.next` with `p.next.next` in a nested skip loop.

**Add two numbers stored as reversed-digit lists**: a merge with a carry. Walk both lists together, summing digits plus carry, appending a new node per digit, and do not forget the final carry node. [Add Two Numbers](/practice/add-two-numbers) is exactly the two-list walk from `merge` with arithmetic instead of comparison.

**Rotate a list by k**: find the length and the tail, connect the tail to the head to make a ring, walk `n − k mod n` steps, cut. The ring trick is often simpler than juggling the two ends.

The common thread is that you never allocate nodes (except when a new value must exist, as in addition) and you always terminate lists explicitly. With those two rules and a sentinel, most list problems become a matter of deciding which primitives to compose.

## Where this shows up in systems

- **External merge sort** sorts data larger than memory: sort chunks that fit, write each as a run, then k-way merge the runs with a heap, reading each run sequentially. Every database's `ORDER BY` on a large result set does this, with `work_mem` (Postgres) deciding the run size.
- **LSM-tree compaction** merges sorted SSTables into a new one, dropping overwritten and deleted keys as it goes. The merge is the k-way heap merge; the "drop the older version of a key" rule is the stability rule (newest run wins ties). [LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) covers it.
- **Timsort**, the sort in Python, Java and V8, is a merge sort over naturally occurring runs with a stability guarantee; the merge step is the array version of the code above, with galloping to skip long stretches.
- **Stream joins** in Kafka Streams and Flink merge time-ordered streams by timestamp, buffering only heads, which is the heap merge with watermarks deciding when a head is final.

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

- You merge with a sentinel and `<=` and can say why the tie rule makes the merge stable and why that matters for records.
- You know the three k-way strategies, their costs, and that only the heap version works on streams.
- You start `fast` at `head.next` when splitting for merge sort and can explain the two-node infinite recursion otherwise.
- You terminate every re-threaded list explicitly and know the cycle you get when you forget.
- You see reorder, odd-even, add-two-numbers and remove-duplicates as compositions of middle, reverse, merge and partition.
- You connect list merging to external sort, LSM compaction and Timsort.

## Check yourself

```quiz
- q: >-
    In the two-list merge, why compare with `a.val <= b.val` rather than `<`?
  options: ["It is faster", "So that on ties the node from the first list is taken first, making the merge stable", "To avoid an infinite loop", "Because `<` does not work on linked lists"]
  answer: 1
  explanation: >-
    With `<`, ties take from b, reversing the relative order of equal keys across the two inputs. Stability (first input wins ties) is what merge sort and record merging rely on.
- q: >-
    Merging k sorted lists totalling n nodes by merging them one after another into an accumulator costs:
  options: ["O(n)", "O(n log k)", "O(nk)", "O(k log n)"]
  answer: 2
  explanation: >-
    The i-th merge re-walks everything merged so far, so the total is roughly n × k / 2. Pairwise divide-and-conquer or a heap of heads reduces it to O(n log k).
- q: >-
    Which k-way merge strategy is appropriate when the inputs are unbounded sorted streams arriving over the network?
  options: ["Sequential merging", "Divide and conquer over full lists", "A min-heap holding only the current head of each stream", "Sorting all inputs together"]
  answer: 2
  explanation: >-
    Only the heap approach needs just one element per input at a time. The others need each input to be complete before merging. This is how external sort and log aggregators work.
- q: >-
    In the two-sentinel partition of a list, what happens if you forget to set the tail of the "greater or equal" sublist's `next` to null?
  options: ["Nothing; it is already null", "The result may contain a cycle, because that node's old `next` can point into the other sublist", "The order within groups is lost", "The first sublist becomes empty"]
  answer: 1
  explanation: >-
    Nodes keep their original `next` pointers until overwritten. The last node placed in the second sublist may still point at a node that was moved to the first sublist, forming a loop after the join.
- q: >-
    A merge sort on a linked list recurses forever on two-node input. The most likely cause is:
  options: ["The merge function is unstable", "The split starts fast at head, so slow lands on the second node and the right half is empty", "The base case checks only for null", "The list contains duplicates"]
  answer: 1
  explanation: >-
    For a two-node list, slow must stop at the first node so the split yields two singletons. Starting fast at head advances slow to node two, the cut produces (whole list, empty), and the left recursion never shrinks. Start fast at head.next.
```

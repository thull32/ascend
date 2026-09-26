---
slug: merge-k-sorted-lists
title: Merge K Sorted Lists
difficulty: hard
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, google, uber]
order: 8
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "At every step the next output node is the smallest of the k current heads. Finding a minimum among k candidates repeatedly is what a min-heap is for."
  - "Push (value, list index, node) into the heap; the index is a tiebreaker so equal values never make Python compare two node objects."
  - "Alternatively, merge lists pairwise in rounds (1 with 2, 3 with 4, ...). Each round halves the count, giving log k rounds of O(N) work."
signatures:
  python:
    name: merge_k_lists
    starter: |
      def merge_k_lists(lists: list[ListNode | None]) -> ListNode | None:
          pass
  javascript:
    name: merge_k_lists
    starter: |
      function merge_k_lists(lists) {
      }
tests:
  - args: [[{"$list": [1, 4, 5]}, {"$list": [1, 3, 4]}, {"$list": [2, 6]}]]
    expected: {"$list": [1, 1, 2, 3, 4, 4, 5, 6]}
  - args: [[]]
    expected: null
    label: no lists at all
  - args: [[{"$list": []}]]
    expected: null
    label: one empty list
  - args: [[{"$list": [1]}]]
    expected: {"$list": [1]}
    label: single list
  - args: [[{"$list": [1, 2, 3]}, {"$list": [4, 5]}, {"$list": [6]}]]
    expected: {"$list": [1, 2, 3, 4, 5, 6]}
    label: lists that do not interleave
  - args: [[{"$list": []}, {"$list": [2]}, {"$list": []}]]
    expected: {"$list": [2]}
    hidden: true
    label: empty lists mixed in
  - args: [[{"$list": [-2, 0]}, {"$list": [-3]}, {"$list": [-1, 1]}]]
    expected: {"$list": [-3, -2, -1, 0, 1]}
    hidden: true
  - args: [[{"$list": [5, 5]}, {"$list": [5]}, {"$list": [5, 5, 5]}]]
    expected: {"$list": [5, 5, 5, 5, 5, 5]}
    hidden: true
    label: all values equal
time_limit_ms: 4000
---
You are given an array `lists` of `k` linked-list heads. Each list is sorted in non-decreasing order; some may be empty, and the array itself may be empty. Merge all of them into one sorted linked list, reusing the existing nodes, and return its head.

Let `N` be the total number of nodes across all lists.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1 → 4 → 5, 1 → 3 → 4, 2 → 6]` | `1 → 1 → 2 → 3 → 4 → 4 → 5 → 6` | All eight nodes in order |
| `[]` | (empty) | Nothing to merge |
| `[(empty), 2, (empty)]` | `2` | Empty lists are skipped |

### Constraints

- `0 ≤ k ≤ 10⁴`
- `0 ≤ nodes per list ≤ 500`
- `-10⁴ ≤ node.val ≤ 10⁴`
- `N ≤ 10⁴`

### Follow-up

The interviewer asks: "The lists are now too big for memory and each is a sorted file on disk. Which of your approaches survives, and what does the heap solution's memory footprint become?"

## Solution

### The naive approach

Two obvious baselines. Concatenate everything and sort: `O(N log N)`, and it ignores that the inputs are sorted. Or merge sequentially: merge list 1 into list 2, the result into list 3, and so on. Each merge is linear in the size of its inputs, but the accumulated result grows, so nodes from the first list get re-visited up to `k - 1` times: `O(kN)` in the worst case. For `k = 10⁴` that is the wrong answer, and the interviewer knows the sequential merge is the trap.

### The insight

Only the `k` current heads matter at any moment; the next output is the smallest of them. A min-heap holding exactly those `k` heads answers "which is smallest?" in `O(log k)`, and each of the `N` nodes enters and leaves the heap once. Total `O(N log k)`, and `log k ≤ 14` for the given bounds.

### The optimal approach

Seed the heap with the non-empty heads as `(value, index, node)` tuples. Pop the minimum, append its node to the output tail, and if that node has a successor, push the successor. Loop until the heap is empty.

The `index` element is essential in Python: when two values tie, `heapq` compares the next tuple element, and `ListNode` objects are not orderable. The list index is unique per entry, so the comparison never reaches the node.

```python
import heapq

def merge_k_lists(lists: list[ListNode | None]) -> ListNode | None:
    heap: list[tuple[int, int, ListNode]] = []
    for i, node in enumerate(lists):
        if node is not None:
            heap.append((node.val, i, node))
    heapq.heapify(heap)

    dummy = ListNode(0)
    tail = dummy
    while heap:
        _, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next is not None:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next
```

Time `O(N log k)`. Space `O(k)` for the heap.

The **divide-and-conquer** alternative reuses [Merge Two Sorted Lists](/practice/merge-two-sorted-lists): pair the lists up and merge each pair, halving `k` each round. Each round touches every node once, and there are `⌈log₂ k⌉` rounds, so it is also `O(N log k)`, with `O(1)` extra space beyond recursion (or none, iteratively). It is the better answer when a heap library is unavailable or when you want to show you can build on the two-list primitive.

### Common mistakes

- Sequential merging, and not being able to explain why it is `O(kN)` rather than `O(N log k)`.
- Pushing `(val, node)` into the heap and getting a `TypeError` the first time two values tie.
- Pushing *all* `N` nodes into the heap up front. Correct, but `O(N log N)` time and `O(N)` space; it throws away the sortedness inside each list.
- Forgetting to skip `None` heads when seeding the heap.

### How to discuss it

Give the sequential merge and its `O(kN)` cost in one breath, then say "only the k heads matter, so a heap of size k" and write the loop. Mention divide-and-conquer as the equal-complexity alternative and note that the heap's `O(k)` working set is what makes it the streaming answer. For the disk follow-up: the heap solution is exactly the merge phase of external sort; memory is `k` buffered records plus read-ahead buffers per file, independent of `N`, and if `k` exceeds the number of file handles you can afford you merge in multiple passes, which is where `log k` reappears.

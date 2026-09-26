---
slug: merge-two-sorted-lists
title: Merge Two Sorted Lists
difficulty: easy
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, apple, adobe]
order: 2
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "Both lists are sorted, so the smallest remaining node overall is always at the front of one of them. Compare the two heads and take the smaller."
  - "A dummy node in front of the result removes the special case of choosing which list supplies the first node."
  - "When one list runs out, the rest of the other list is already sorted; attach it whole instead of looping over it."
signatures:
  python:
    name: merge_two_lists
    starter: |
      def merge_two_lists(a: ListNode | None, b: ListNode | None) -> ListNode | None:
          pass
  javascript:
    name: merge_two_lists
    starter: |
      function merge_two_lists(a, b) {
      }
tests:
  - args: [{"$list": [1, 3, 5]}, {"$list": [2, 4, 6]}]
    expected: {"$list": [1, 2, 3, 4, 5, 6]}
  - args: [{"$list": [1, 1, 2]}, {"$list": [1, 3]}]
    expected: {"$list": [1, 1, 1, 2, 3]}
    label: duplicate values across lists
  - args: [{"$list": []}, {"$list": []}]
    expected: null
    label: both empty
  - args: [{"$list": []}, {"$list": [0]}]
    expected: {"$list": [0]}
    label: one empty
  - args: [{"$list": [2]}, {"$list": [1]}]
    expected: {"$list": [1, 2]}
    label: second list supplies the head
  - args: [{"$list": [-5, -1]}, {"$list": [-3, 0, 4]}]
    expected: {"$list": [-5, -3, -1, 0, 4]}
    hidden: true
  - args: [{"$list": [1, 2, 3]}, {"$list": [4, 5, 6]}]
    expected: {"$list": [1, 2, 3, 4, 5, 6]}
    hidden: true
    label: one list exhausted before the other starts
  - args: [{"$list": [5, 5, 5]}, {"$list": [5]}]
    expected: {"$list": [5, 5, 5, 5]}
    hidden: true
time_limit_ms: 4000
---
You are given the heads of two singly linked lists, `a` and `b`, each already sorted in non-decreasing order. Splice them into one sorted list by rewiring the existing nodes (do not allocate new nodes for the values) and return its head.

Either list may be empty.

### Examples

| Input | Output | Why |
|---|---|---|
| `a = 1 → 3 → 5`, `b = 2 → 4 → 6` | `1 → 2 → 3 → 4 → 5 → 6` | Alternating picks |
| `a = 1 → 1 → 2`, `b = 1 → 3` | `1 → 1 → 1 → 2 → 3` | Equal values are all kept |
| `a = (empty)`, `b = 0` | `0` | The other list is the answer |

### Constraints

- `0 ≤ nodes in each list ≤ 50`
- `-100 ≤ node.val ≤ 100`
- Both lists are sorted in non-decreasing order.

### Follow-up

The interviewer asks: "Is your merge stable, and why would anyone care?" Then: "Now merge `k` lists. What is the complexity of doing it pairwise, and what is better?"

## Solution

### The naive approach

Dump both lists into an array, sort it, rebuild a list. `O((n + m) log(n + m))` time and `O(n + m)` space, and it throws away the fact that the inputs are already sorted. It is what you would do if the inputs were *not* sorted.

### The insight

The globally smallest remaining element is always one of the two current heads, because everything behind a head is at least as large as it. So one comparison per output node decides the next node, and you never look further than the two fronts. That is the merge step of merge sort, applied to pointers instead of array indices.

### The optimal approach

Create a `dummy` node whose `next` will be the answer, and a `tail` pointer that starts at `dummy`. While both lists are non-empty, attach the smaller head to `tail`, advance that list, advance `tail`. When one list is exhausted, attach the other list's remainder in a single assignment. Return `dummy.next`.

Using `<=` when comparing `a.val` with `b.val` takes from `a` on ties, which makes the merge stable: equal elements keep their input order. It costs nothing and is the kind of detail a reviewer notices.

```python
def merge_two_lists(a: ListNode | None, b: ListNode | None) -> ListNode | None:
    dummy = ListNode(0)
    tail = dummy
    while a is not None and b is not None:
        if a.val <= b.val:
            tail.next = a
            a = a.next
        else:
            tail.next = b
            b = b.next
        tail = tail.next
    tail.next = a if a is not None else b   # the survivor is already sorted
    return dummy.next
```

Time `O(n + m)`: each loop iteration consumes exactly one node. Space `O(1)` beyond the dummy.

### Common mistakes

- Handling "which list gives the first node" with a separate `if`, which doubles the code and is exactly what the dummy node exists to avoid.
- Looping over the leftover tail node by node instead of attaching it once. Correct, but it signals not having noticed the invariant.
- Writing the recursive version (`a.next = merge(a.next, b)`) without mentioning the `O(n + m)` stack depth.

### How to discuss it

Say "this is the merge step of merge sort on linked lists; I'll use a dummy head so I don't special-case the first node." Point out the `<=` and the word *stable*: stability matters when nodes carry payloads beyond the key (merging two sorted logs by timestamp should keep same-timestamp events in source order). For the `k`-list follow-up: merging pairwise one at a time is `O(kN)` where `N` is the total node count, because early nodes get re-merged up to `k - 1` times; divide-and-conquer pairing or a `k`-element min-heap brings it to `O(N log k)`. That is [Merge K Sorted Lists](/practice/merge-k-sorted-lists).

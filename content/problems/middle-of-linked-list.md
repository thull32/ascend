---
slug: middle-of-linked-list
title: Middle of the Linked List
difficulty: easy
patterns: [fast-slow-pointers]
lists: [ascend-150]
companies: [amazon, microsoft, google, apple]
order: 3
lesson: interview-patterns/sequence-patterns/fast-slow-pointers
hints:
  - "Counting the nodes and then walking to position n // 2 takes two passes. To do it in one, use a pointer that moves twice as fast as another."
  - "When the fast pointer reaches the end, the slow pointer has covered half the distance. That is the middle."
  - "The loop condition decides which middle you get for even lengths. `while fast and fast.next` lands on the second of the two."
signatures:
  python:
    name: middle_node
    starter: |
      def middle_node(head: ListNode | None) -> ListNode | None:
          pass
  javascript:
    name: middle_node
    starter: |
      function middle_node(head) {
      }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}]
    expected: {"$list": [3, 4, 5]}
  - args: [{"$list": [1, 2, 3, 4, 5, 6]}]
    expected: {"$list": [4, 5, 6]}
    label: even length returns the second middle
  - args: [{"$list": [1]}]
    expected: {"$list": [1]}
    label: single node
  - args: [{"$list": [1, 2]}]
    expected: {"$list": [2]}
    label: two nodes
  - args: [{"$list": [1, 2, 3, 4]}]
    expected: {"$list": [3, 4]}
  - args: [{"$list": [10, 20, 30]}]
    expected: {"$list": [20, 30]}
    hidden: true
  - args: [{"$list": [7, 6, 5, 4, 3, 2, 1, 0]}]
    expected: {"$list": [3, 2, 1, 0]}
    hidden: true
time_limit_ms: 4000
---
Given the head of a non-empty singly linked list, return the middle node. When the list has an even number of nodes there are two middles; return the **second** one. The harness will show your answer as the list from that node to the end.

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 3 → 4 → 5` | node `3` (shown as `3 → 4 → 5`) | Five nodes, the third is the middle |
| `1 → 2 → 3 → 4 → 5 → 6` | node `4` (shown as `4 → 5 → 6`) | Six nodes; the middles are 3 and 4, return the second |
| `1` | node `1` | |

### Constraints

- `1 ≤ number of nodes ≤ 100`
- `1 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Change it to return the *first* middle for even lengths, and tell me exactly which line changes." Then: "Where does this show up as a sub-step in bigger problems?"

## Solution

### The naive approach

Two passes: count `n`, then walk `n // 2` steps from the head. `O(n)` time, `O(1)` space, and correct. It is not wrong; the one-pass version is the technique the interviewer wants to see because it is a building block for harder problems.

### The insight

If one pointer moves two nodes per step and another moves one, then whenever the fast pointer has covered the whole list the slow pointer has covered half of it. The middle falls out without ever knowing `n`.

### The optimal approach

Start `slow` and `fast` at `head`. Loop while `fast` and `fast.next` are both non-null, moving `slow` one and `fast` two. Return `slow`.

Trace on six nodes `1..6`: `(slow, fast)` goes `(1,1) → (2,3) → (3,5) → (4, None)`. `fast` is `None`, stop, return node 4, the second middle. On five nodes: `(1,1) → (2,3) → (3,5)`; `fast.next` is `None`, stop, return 3.

```python
def middle_node(head: ListNode | None) -> ListNode | None:
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
    return slow
```

Time `O(n)`, roughly `n / 2` iterations. Space `O(1)`.

To return the first middle for even lengths, change the condition to `while fast.next is not None and fast.next.next is not None` (guarding `head` being non-null). Then on six nodes the walk stops at `(3, 5)`. That single-line difference is why [Reorder List](/practice/reorder-list) and [Palindrome Linked List](/practice/palindrome-linked-list) each use a specific variant: one wants the split point to keep the middle node in the first half, the other does not care.

### Common mistakes

- Off-by-one on even lengths from picking the wrong loop condition, and not knowing which variant you wrote. Trace two and four nodes before saying done.
- Guarding only `fast is not None` and then reading `fast.next.next`, which throws on even lengths.
- Returning `slow.val` when the problem asks for the node.

### How to discuss it

This is a warm-up; the interviewer wants to see you state the invariant ("fast is always twice as far from the head as slow") and prove the even/odd behaviour with a two-line trace. Then name where it recurs: splitting a list for merge sort, finding the halfway point in reorder and palindrome checks, and as the first phase of cycle detection where the same two pointers meet inside a loop instead of at the end.

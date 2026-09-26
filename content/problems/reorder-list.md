---
slug: reorder-list
title: Reorder List
difficulty: medium
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, google]
order: 3
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "The target order alternates between the front of the list and the back of the list. Which two sub-problems you already know would let you walk the back half forwards?"
  - "Find the middle with fast and slow pointers, reverse the second half in place, then you have two lists whose heads are exactly the nodes you need to interleave."
  - "When splitting, cut the first half's tail (`slow.next = None`) or the interleaving loop will run into the second half twice."
signatures:
  python:
    name: reorder_list
    starter: |
      def reorder_list(head: ListNode | None) -> ListNode | None:
          # rewire in place and return the (unchanged) head
          pass
  javascript:
    name: reorder_list
    starter: |
      function reorder_list(head) {
        // rewire in place and return the (unchanged) head
      }
tests:
  - args: [{"$list": [1, 2, 3, 4]}]
    expected: {"$list": [1, 4, 2, 3]}
  - args: [{"$list": [1, 2, 3, 4, 5]}]
    expected: {"$list": [1, 5, 2, 4, 3]}
    label: odd length
  - args: [{"$list": [1]}]
    expected: {"$list": [1]}
    label: single node
  - args: [{"$list": [1, 2]}]
    expected: {"$list": [1, 2]}
    label: two nodes
  - args: [{"$list": [1, 2, 3]}]
    expected: {"$list": [1, 3, 2]}
  - args: [{"$list": [10, 20, 30, 40, 50, 60]}]
    expected: {"$list": [10, 60, 20, 50, 30, 40]}
    hidden: true
  - args: [{"$list": [4, 4, 4, 4, 4]}]
    expected: {"$list": [4, 4, 4, 4, 4]}
    hidden: true
    label: identical values
  - args: [{"$list": []}]
    expected: null
    hidden: true
    label: empty list
time_limit_ms: 4000
---
You are given the head of a singly linked list `L0 → L1 → … → Ln-1`. Rearrange its nodes in place so the order becomes:

`L0 → Ln-1 → L1 → Ln-2 → L2 → Ln-3 → …`

That is, alternate between the next node from the front and the next node from the back until every node has been placed. Rewire the existing nodes rather than copying values, and return the head (which does not change).

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 3 → 4` | `1 → 4 → 2 → 3` | front, back, front, back |
| `1 → 2 → 3 → 4 → 5` | `1 → 5 → 2 → 4 → 3` | The middle node ends up last |
| `1 → 2` | `1 → 2` | Already in order |

### Constraints

- `0 ≤ number of nodes ≤ 5 × 10⁴`
- `1 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "Your solution mutates the second half. If the caller still held a pointer into the middle of the list, what would they see, and how would you make the operation safe?"

## Solution

### The naive approach

Copy node references into an array, then use two indices (`i` from the front, `j` from the back) to relink them. `O(n)` time, `O(n)` space. It works and is worth stating in one sentence, but the interviewer chose a linked list precisely to see whether you can do it without the array.

### The insight

The awkward part is walking the back half *backwards*. That is a solved problem: [reverse it](/practice/reverse-linked-list). After reversing the second half you have two forward lists, `L0 → L1 → …` and `Ln-1 → Ln-2 → …`, and the answer is simply their interleaving. The whole problem is three sub-routines you already know: find the middle, reverse, merge alternately.

### The optimal approach

1. **Find the middle** with fast/slow pointers. Start both at `head`; advance `fast` two steps and `slow` one step while `fast.next` and `fast.next.next` exist. `slow` stops on the last node of the first half (for odd lengths, the middle node stays in the first half, which is what puts it last in the output).
2. **Split and reverse.** `second = slow.next`, `slow.next = None`, then reverse `second`.
3. **Interleave.** While `second` is not empty: save both `next` pointers, link `first → second → first.next`, advance. The first half is always at least as long as the second, so this loop terminates when the second half runs out and never leaves nodes behind.

Trace on `1 → 2 → 3 → 4 → 5`: `slow` stops at 3; second half `4 → 5` reversed is `5 → 4`; interleaving `1 → 2 → 3` with `5 → 4` gives `1 → 5 → 2 → 4 → 3`.

```python
def reorder_list(head: ListNode | None) -> ListNode | None:
    if head is None or head.next is None:
        return head

    # 1. middle: slow ends on the last node of the first half
    slow, fast = head, head
    while fast.next is not None and fast.next.next is not None:
        slow = slow.next
        fast = fast.next.next

    # 2. split and reverse the second half
    second = slow.next
    slow.next = None
    prev = None
    while second is not None:
        nxt = second.next
        second.next = prev
        prev = second
        second = nxt
    second = prev

    # 3. interleave
    first = head
    while second is not None:
        f_next, s_next = first.next, second.next
        first.next = second
        second.next = f_next
        first, second = f_next, s_next
    return head
```

Time `O(n)` for three linear passes. Space `O(1)`.

### Common mistakes

- Not cutting `slow.next`, so the first half still runs into the (now reversed) second half and the interleave loop produces a cycle or duplicates.
- Using the `fast, fast.next` loop condition, which for even lengths lands `slow` on the *first* node of the second half; then the split puts an extra node in the second half and the interleave leaves it dangling.
- Reversing the whole list and trying to zip from both ends, which needs `O(n)` extra references anyway.

### How to discuss it

Decompose out loud before coding: "middle, reverse the back half, merge alternately." Interviewers grade this problem on whether you see the decomposition, so say it early. Then flag the invariant that makes the merge terminate cleanly: the first half is never shorter than the second. For the follow-up: the operation is destructive, a caller's pointer into the old second half now points into a reversed segment; the safe version either documents the list as owned by the callee or copies first at `O(n)` space, and that is a design trade-off, not a coding one.

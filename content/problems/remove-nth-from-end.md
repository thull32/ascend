---
slug: remove-nth-from-end
title: Remove Nth Node From End of List
difficulty: medium
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, apple]
order: 4
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "Counting the length first and then walking to position `len - n` works in two passes. To do it in one, you need something that reaches the end exactly `n` steps before another pointer reaches the node you want."
  - "Send a `lead` pointer `n` nodes ahead of a `trail` pointer, then move both until `lead` falls off the end. `trail` is now `n` from the end."
  - "To delete a node you need the node *before* it. Start `trail` at a dummy node in front of the head so removing the head is not a special case."
signatures:
  python:
    name: remove_nth_from_end
    starter: |
      def remove_nth_from_end(head: ListNode | None, n: int) -> ListNode | None:
          pass
  javascript:
    name: remove_nth_from_end
    starter: |
      function remove_nth_from_end(head, n) {
      }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2]
    expected: {"$list": [1, 2, 3, 5]}
  - args: [{"$list": [1]}, 1]
    expected: null
    label: removing the only node
  - args: [{"$list": [1, 2]}, 1]
    expected: {"$list": [1]}
    label: remove the tail
  - args: [{"$list": [1, 2]}, 2]
    expected: {"$list": [2]}
    label: remove the head
  - args: [{"$list": [1, 2, 3]}, 3]
    expected: {"$list": [2, 3]}
    hidden: true
    label: n equals the length
  - args: [{"$list": [5, 6, 7, 8]}, 1]
    expected: {"$list": [5, 6, 7]}
    hidden: true
  - args: [{"$list": [9, 8, 7, 6, 5, 4]}, 3]
    expected: {"$list": [9, 8, 7, 5, 4]}
    hidden: true
time_limit_ms: 4000
---
You are given the head of a singly linked list and an integer `n`. Remove the `n`-th node counting from the *end* of the list (`n = 1` is the tail) and return the head of the resulting list.

`n` is always valid: `1 ≤ n ≤ length`. The interviewer wants a single pass over the list.

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 3 → 4 → 5`, `n = 2` | `1 → 2 → 3 → 5` | 4 is second from the end |
| `1 → 2`, `n = 2` | `2` | The head itself is removed |
| `1`, `n = 1` | (empty) | The only node goes |

### Constraints

- `1 ≤ number of nodes ≤ 3 × 10⁴`
- `1 ≤ n ≤ number of nodes`

### Follow-up

The interviewer asks: "Is your one-pass solution actually faster than the two-pass one, or is it the same number of pointer dereferences? When does the difference matter?"

## Solution

### The naive approach

Two passes: count the length `L`, then walk to node `L - n - 1` and unlink its successor. `O(L)` time, `O(1)` space, completely correct. The interviewer's "one pass" request is a nudge towards the gap-pointer technique, not a claim that two passes is wrong.

### The insight

You do not need to know `L`. You need a pointer that is `n` nodes behind another. If `lead` starts `n` steps ahead of `trail` and they advance together, then when `lead` steps off the end, `trail` is exactly `n` from the end. Add one more node of separation and `trail` sits on the node *before* the target, which is the one whose `next` you must rewrite.

### The optimal approach

Put a `dummy` in front of `head`. Start `lead` and `trail` at `dummy`. Advance `lead` by `n + 1` steps. Now advance both until `lead` is `None`. `trail.next` is the node to remove; splice it out with `trail.next = trail.next.next`. Return `dummy.next`, which is the correct head even when the original head was removed.

Trace on `1 → 2 → 3 → 4 → 5`, `n = 2`: after `n + 1 = 3` steps `lead` is at 3 and `trail` at dummy. Advance together: `lead` 4/`trail` 1, `lead` 5/`trail` 2, `lead` None/`trail` 3. `trail.next` is 4; skip it.

```python
def remove_nth_from_end(head: ListNode | None, n: int) -> ListNode | None:
    dummy = ListNode(0, head)
    lead = dummy
    trail = dummy
    for _ in range(n + 1):
        lead = lead.next
    while lead is not None:
        lead = lead.next
        trail = trail.next
    trail.next = trail.next.next
    return dummy.next
```

Time `O(L)`; the two pointers together make `L + 1` moves. Space `O(1)`.

### Common mistakes

- Starting `trail` at `head` and advancing `lead` only `n` steps, which lands `trail` *on* the target rather than before it, and then failing to delete the head because nothing points to it.
- Skipping the dummy and adding a special case for `n == length`; it works but is the exact branch the dummy removes.
- Off-by-one in the loop bound: `n` versus `n + 1` steps. Trace the two-node cases (`n = 1` and `n = 2`) by hand before declaring done.

### How to discuss it

State the gap invariant: "`lead` is always `n + 1` nodes ahead of `trail`, so when `lead` is `None`, `trail` is the predecessor of the node to delete." Say why the dummy exists. Then answer the follow-up honestly: both solutions dereference about `2L` pointers; the one-pass version wins only when a pass is expensive, for example the list is a stream you cannot rewind, or nodes are on disk or across a network and each traversal has real latency. In memory, "one pass" here is about demonstrating the technique, not about speed.

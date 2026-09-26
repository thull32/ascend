---
slug: reverse-nodes-k-group
title: Reverse Nodes in k-Group
difficulty: hard
patterns: [linked-list]
lists: [ascend-150]
companies: [amazon, microsoft, meta, apple]
order: 9
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "Before reversing a group, check that k nodes actually exist ahead of you. If not, stop and leave the tail as it is."
  - "Reversing a group is the ordinary three-pointer reversal run exactly k times. The hard part is reconnecting: the node before the group must point at the group's new head, and the group's old head (now its tail) must point at the next group."
  - "Keep a `group_prev` pointer that always sits just before the group you are about to reverse. After each group, the old first node becomes `group_prev` for the next round."
signatures:
  python:
    name: reverse_k_group
    starter: |
      def reverse_k_group(head: ListNode | None, k: int) -> ListNode | None:
          pass
  javascript:
    name: reverse_k_group
    starter: |
      function reverse_k_group(head, k) {
      }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2]
    expected: {"$list": [2, 1, 4, 3, 5]}
  - args: [{"$list": [1, 2, 3, 4, 5]}, 3]
    expected: {"$list": [3, 2, 1, 4, 5]}
    label: leftover shorter than k stays in order
  - args: [{"$list": [1, 2, 3, 4, 5]}, 1]
    expected: {"$list": [1, 2, 3, 4, 5]}
    label: k of one changes nothing
  - args: [{"$list": [1, 2, 3, 4, 5, 6]}, 3]
    expected: {"$list": [3, 2, 1, 6, 5, 4]}
    label: length is a multiple of k
  - args: [{"$list": [1]}, 1]
    expected: {"$list": [1]}
  - args: [{"$list": [1, 2]}, 3]
    expected: {"$list": [1, 2]}
    hidden: true
    label: k larger than the list
  - args: [{"$list": [1, 2, 3, 4, 5, 6, 7, 8]}, 4]
    expected: {"$list": [4, 3, 2, 1, 8, 7, 6, 5]}
    hidden: true
  - args: [{"$list": [1, 2, 3, 4, 5, 6, 7]}, 7]
    expected: {"$list": [7, 6, 5, 4, 3, 2, 1]}
    hidden: true
    label: k equals the length
time_limit_ms: 4000
---
You are given the head of a singly linked list and a positive integer `k`. Reverse the nodes in consecutive groups of `k` and return the resulting head. If the number of nodes at the end is not a multiple of `k`, the leftover nodes keep their original order.

Rewire the nodes; do not change the values stored in them. Aim for `O(1)` extra space.

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 3 → 4 → 5`, `k = 2` | `2 → 1 → 4 → 3 → 5` | Two full groups; `5` is left over |
| `1 → 2 → 3 → 4 → 5`, `k = 3` | `3 → 2 → 1 → 4 → 5` | One full group; `4 → 5` is left over |
| `1 → 2`, `k = 3` | `1 → 2` | No full group exists |

### Constraints

- `1 ≤ number of nodes ≤ 5000`
- `1 ≤ k ≤ number of nodes`
- `0 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "What if the *last* partial group should also be reversed?" Then: "What if the groups should alternate: reverse, leave, reverse, leave?"

## Solution

### The naive approach

Copy the nodes into an array, reverse each length-`k` slice, and relink in order. `O(n)` time and `O(n)` space, and it works. State it, then explain that the interviewer asked for the linked-list version because the reconnection logic is what is being examined.

### The insight

You already know how to [reverse a whole list](/practice/reverse-linked-list). Reversing a group is the same loop bounded to `k` steps. What makes this problem hard is bookkeeping, not the reversal: after each group, three connections must be right. The node *before* the group must point at the group's new first node; the group's new last node (which was its first) must point at whatever comes next; and you must have verified the group is full before touching anything, because a partial group must be left alone.

### The optimal approach

Use a dummy in front of the head and a `group_prev` pointer that always sits immediately before the next group. Each round:

1. Walk `k` nodes ahead from `group_prev` to find `kth`. If you run off the end, the remaining nodes form a partial group: return.
2. Record `group_next = kth.next` and `first = group_prev.next`.
3. Reverse the `k` nodes starting at `first`, with `prev` initialised to `group_next` so the last flipped pointer already points at the next group.
4. Reconnect: `group_prev.next = kth` (the new first), then `group_prev = first` (the old first, now the group's tail).

Initialising `prev` to `group_next` instead of `None` is the small trick that makes step 3 do half of the reconnection for you.

Trace on `1 → 2 → 3 → 4 → 5`, `k = 2`: round 1, `kth = 2`, `group_next = 3`; reversing `1, 2` with `prev = 3` yields `2 → 1 → 3`; dummy points at 2; `group_prev = 1`. Round 2, `kth = 4`, `group_next = 5`; reversing gives `4 → 3 → 5`; node 1 points at 4; `group_prev = 3`. Round 3: only one node ahead, stop.

```python
def reverse_k_group(head: ListNode | None, k: int) -> ListNode | None:
    dummy = ListNode(0, head)
    group_prev = dummy

    while True:
        # 1. is there a full group ahead?
        kth = group_prev
        for _ in range(k):
            kth = kth.next
            if kth is None:
                return dummy.next
        group_next = kth.next

        # 2-3. reverse exactly k nodes, landing on group_next
        prev, cur = group_next, group_prev.next
        for _ in range(k):
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt

        # 4. reconnect
        first = group_prev.next   # old first node, now the group's tail
        group_prev.next = kth
        group_prev = first
```

Time `O(n)`: each node is visited once by the look-ahead and once by the reversal, so about `2n` pointer hops. Space `O(1)`.

### Common mistakes

- Reversing first and checking the group length afterwards, which mangles a partial tail and then needs a second reversal to repair it.
- Setting `group_prev = kth` after reconnection; the group's tail is the *old first* node, not `kth`.
- Recursing per group (`head.next = reverse(group_next, k)` style). It is clean but uses `O(n / k)` stack frames, which for `k = 1` is `O(n)`.
- Off-by-one in the look-ahead loop so that a group of exactly `k` remaining nodes is treated as partial (or a group of `k - 1` as full). Test `k == length` explicitly.

### How to discuss it

Say "count k ahead, reverse k, reconnect three pointers, advance" before coding, and name `group_prev` as the anchor whose job is to make the reconnection uniform. Point at the `prev = group_next` initialisation and explain what it saves. For the follow-ups: reversing the final partial group means dropping the early `return` and letting the reversal loop run for `min(k, remaining)` steps; alternating groups means skipping the reversal on every other round while still advancing `group_prev` by `k` nodes. Both are two-line edits if the structure above is in place, which is the point of building it that way.

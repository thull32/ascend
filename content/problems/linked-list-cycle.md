---
slug: linked-list-cycle
title: Linked List Cycle
difficulty: easy
patterns: [fast-slow-pointers]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 1
lesson: interview-patterns/sequence-patterns/fast-slow-pointers
hints:
  - "A hash set of visited nodes finds a cycle in O(n) time and O(n) space. The interviewer wants O(1) space, so you need to detect repetition without remembering nodes."
  - "Two runners on a circular track at different speeds must eventually meet. Move one pointer one step and the other two steps per iteration."
  - "If the fast pointer ever reaches None (or its next is None), there is no cycle. If the pointers ever point at the same node, there is."
signatures:
  python:
    name: has_cycle
    starter: |
      def has_cycle(values: list[int], pos: int) -> bool:
          # Build the list from `values` with ListNode, then link the tail
          # to the node at index `pos` (no link when pos == -1) and detect.
          pass
  javascript:
    name: has_cycle
    starter: |
      function has_cycle(values, pos) {
        // Build the list from `values` with ListNode, then link the tail
        // to the node at index `pos` (no link when pos === -1) and detect.
      }
tests:
  - args: [[3, 2, 0, -4], 1]
    expected: true
  - args: [[1, 2], 0]
    expected: true
    label: tail links back to the head
  - args: [[1], -1]
    expected: false
    label: single node, no cycle
  - args: [[], -1]
    expected: false
    label: empty list
  - args: [[1, 2, 3, 4, 5, 6], -1]
    expected: false
  - args: [[1], 0]
    expected: true
    hidden: true
    label: single node pointing to itself
  - args: [[1, 2, 3, 4, 5, 6], 5]
    expected: true
    hidden: true
    label: tail points to itself
  - args: [[5, 4, 3, 2, 1], 4]
    expected: true
    hidden: true
time_limit_ms: 4000
---
You are given the node values of a singly linked list and an integer `pos`. Build the list with `ListNode` (the harness provides the class), then connect the last node's `next` to the node at index `pos`; when `pos` is `-1`, leave the tail pointing at `None`. Return `true` if the resulting list contains a cycle and `false` otherwise.

The list-building is scaffolding so the tests can describe a cycle in plain JSON. The part being assessed is the detection: do it in `O(n)` time and `O(1)` extra space, without modifying the nodes.

### Examples

| Input | Output | Why |
|---|---|---|
| `values = [3, 2, 0, -4]`, `pos = 1` | `true` | `-4 → 2` closes a loop of three nodes |
| `values = [1, 2]`, `pos = 0` | `true` | `2 → 1` |
| `values = [1]`, `pos = -1` | `false` | A single node with no self-link |

### Constraints

- `0 ≤ len(values) ≤ 10⁴`
- `-10⁵ ≤ values[i] ≤ 10⁵`
- `pos = -1` or `0 ≤ pos < len(values)`

### Follow-up

The interviewer asks: "Return the node where the cycle *starts*, still in O(1) space." Then: "Why does the fast pointer always catch the slow one instead of jumping over it?"

## Solution

### The naive approach

Walk the list, adding each node to a set; if you meet a node already in the set, there is a cycle; if you reach `None`, there is not. `O(n)` time and `O(n)` space. A hackier variant marks visited nodes by mutating them (setting a flag, or pointing `next` at a sentinel), which is `O(1)` space but destroys the input; say so if you mention it.

### The insight

Put two pointers on the list, one moving one step per turn and one moving two. If the list ends, the fast pointer reaches `None` first and you are done. If there is a cycle, both pointers eventually enter it and stay in it, and once both are inside, the gap between them shrinks by exactly one node per turn (fast gains one on slow each step). A gap that shrinks by one per turn hits zero, so they meet. That is Floyd's tortoise and hare, and it needs two pointers of state.

### The optimal approach

Build the list from `values`, keeping the node references in an array so `pos` can be resolved. Then run the two pointers.

```python
def has_cycle(values: list[int], pos: int) -> bool:
    # scaffolding: build the list and close the cycle
    nodes = [ListNode(v) for v in values]
    for i in range(len(nodes) - 1):
        nodes[i].next = nodes[i + 1]
    if nodes and pos != -1:
        nodes[-1].next = nodes[pos]
    head = nodes[0] if nodes else None

    # detection: Floyd's tortoise and hare
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
```

Detection is `O(n)` time: without a cycle the fast pointer reaches the end in `n / 2` steps; with a cycle of length `c`, the slow pointer takes at most `n` steps to enter it and then at most `c` more before being caught. Space `O(1)` for the detection (the scaffolding array is `O(n)`, but it stands in for the list the harness would otherwise hand you).

Why the fast pointer cannot jump over the slow one: measure the gap as the number of steps slow would need to reach fast going forwards around the cycle. Each turn slow moves one and fast moves two, so the gap decreases by exactly one. It passes through every value down to zero rather than skipping it.

### Common mistakes

- Comparing values (`slow.val == fast.val`) instead of identity (`slow is fast`); duplicate values give false positives.
- Checking `slow is fast` *before* moving, which is true at the start and returns `true` for every non-empty list.
- Only guarding `fast is not None` and then dereferencing `fast.next.next`; both `fast` and `fast.next` need checking.

### How to discuss it

Name the hash-set solution and its space cost, then say "tortoise and hare" and give the one-sentence argument for why they meet. For the cycle-start follow-up: after the meeting point, reset one pointer to the head and advance both one step at a time; they meet at the cycle entrance. The proof is arithmetic: if the entrance is `a` nodes from the head and the meeting point is `b` nodes into a cycle of length `c`, then slow travelled `a + b` and fast `2(a + b)`, so `a + b` is a multiple of `c`, which means `a` more steps from the meeting point wraps to the entrance. That same reasoning solves [Find the Duplicate Number](/practice/find-duplicate-number).

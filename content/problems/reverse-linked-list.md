---
slug: reverse-linked-list
title: Reverse Linked List
difficulty: easy
patterns: [linked-list]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, apple, google]
order: 1
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "You cannot walk backwards in a singly linked list, so the reversal has to happen as you walk forwards. What is the minimum you need to remember about the node you just left?"
  - "Keep three pointers: `prev` (already reversed), `cur` (the node being flipped) and `nxt` (saved before you overwrite `cur.next`). Each step flips one arrow."
  - "When `cur` becomes `None`, `prev` is the last node you flipped, which is the new head."
signatures:
  python:
    name: reverse_list
    starter: |
      def reverse_list(head: ListNode | None) -> ListNode | None:
          pass
  javascript:
    name: reverse_list
    starter: |
      function reverse_list(head) {
      }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}]
    expected: {"$list": [5, 4, 3, 2, 1]}
  - args: [{"$list": [1, 2]}]
    expected: {"$list": [2, 1]}
    label: two nodes
  - args: [{"$list": [1]}]
    expected: {"$list": [1]}
    label: single node
  - args: [{"$list": []}]
    expected: null
    label: empty list
  - args: [{"$list": [7, 7, 7]}]
    expected: {"$list": [7, 7, 7]}
    label: repeated values
  - args: [{"$list": [-3, 0, 3]}]
    expected: {"$list": [3, 0, -3]}
    hidden: true
  - args: [{"$list": [10, 20, 30, 40, 50, 60, 70]}]
    expected: {"$list": [70, 60, 50, 40, 30, 20, 10]}
    hidden: true
time_limit_ms: 4000
---
You are given the head of a singly linked list. Reverse it in place so that every `next` pointer points the other way, and return the new head.

The harness gives you real `ListNode` objects (`val`, `next`). Do not build a new list from the values; the interviewer wants the pointers rewired, using `O(1)` extra space.

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 3 → 4 → 5` | `5 → 4 → 3 → 2 → 1` | Every arrow flips |
| `1 → 2` | `2 → 1` | The old tail is the new head |
| (empty) | (empty) | Nothing to reverse |

### Constraints

- `0 ≤ number of nodes ≤ 5000`
- `-5000 ≤ node.val ≤ 5000`

### Follow-up

The interviewer asks: "Do it recursively. What is the space cost, and when would that be a problem in production?" And then: "Reverse only the nodes between positions `left` and `right`, in one pass."

## Solution

### The naive approach

Copy the values into an array, reverse the array, and either build a new list or write the values back into the existing nodes. `O(n)` time but `O(n)` extra space, and it sidesteps the actual skill being tested, which is pointer manipulation. Mention it as the fallback, then do it properly.

### The insight

Walking forwards, the only thing that stops you flipping `cur.next` to point backwards is that you would lose the rest of the list. So save `cur.next` first. Once it is saved, flipping one arrow is a single assignment, and the problem becomes "flip one arrow, advance, repeat".

### The optimal approach

Maintain `prev` (the head of the already-reversed prefix, initially `None`) and `cur` (the first node not yet flipped). Each iteration: save `nxt = cur.next`, point `cur.next` at `prev`, then slide both pointers forward. When `cur` runs off the end, `prev` is the old tail, which is the new head.

Trace on `1 → 2 → 3`:

| step | prev | cur | list after flip |
|---|---|---|---|
| 0 | `None` | 1 | `1 → None`, `2 → 3` |
| 1 | 1 | 2 | `2 → 1 → None`, `3` |
| 2 | 2 | 3 | `3 → 2 → 1 → None` |
| 3 | 3 | `None` | return `prev` = 3 |

```python
def reverse_list(head: ListNode | None) -> ListNode | None:
    prev = None
    cur = head
    while cur is not None:
        nxt = cur.next      # save before overwriting
        cur.next = prev     # flip the arrow
        prev = cur          # advance the reversed prefix
        cur = nxt           # advance into the unreversed suffix
    return prev
```

Time `O(n)`, one visit per node. Space `O(1)`.

The recursive version reverses the tail first, then hooks the current node onto the end: `head.next.next = head; head.next = None`. It is elegant and it costs `O(n)` stack frames; Python's default recursion limit is around 1000, so a 5000-node list crashes it. That is the answer to the follow-up.

### Common mistakes

- Overwriting `cur.next` before saving it, which orphans the rest of the list and typically yields a one-node result.
- Returning `cur` (always `None` at loop exit) instead of `prev`.
- Forgetting to set the old head's `next` to `None`, leaving a cycle; the iterative version above gets this for free because `prev` starts as `None`.

### How to discuss it

Name the three pointers before writing anything, and state the invariant: "everything from `prev` backwards is reversed, everything from `cur` forwards is untouched." Trace three nodes by hand. For the recursive follow-up, give the two-line body and immediately volunteer the stack-depth cost. For "reverse between `left` and `right`", describe walking to the node before `left`, running this same loop for `right - left + 1` steps, and stitching the two boundary pointers back; the trick is a dummy node in front of the head so `left = 1` is not a special case.

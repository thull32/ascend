---
slug: reversal-and-runner-techniques
title: Reversal and runner techniques
description: Iterative and recursive reversal with a full pointer trace, the fast/slow runner for finding the middle and the nth node from the end in one pass, and the invariants that make each correct.
minutes: 40
difficulty: medium
tags: [linked-list, reversal, two-pointers, fast-slow, runner, recursion]
problems: [reverse-linked-list, middle-of-linked-list, remove-nth-from-end, reorder-list, reverse-nodes-k-group, palindrome-linked-list]
---
You are asked to reverse a singly linked list in place. It is three lines of code, and about a third of candidates get one of the three lines in the wrong order on the whiteboard. Then the interviewer asks for the middle node in one pass, or the 7th node from the end without knowing the length. These are the two techniques that cover most linked-list questions: rewiring pointers as you walk, and walking two pointers at different speeds or offsets.

Neither technique is deep. Both are unforgiving, because a singly linked list gives you no way back: overwrite the wrong `next` and the tail of the list is gone. The discipline is to name what each pointer means, state the invariant, and trace by hand before running.

## Iterative reversal

Three pointers: `prev` (the reversed prefix so far), `curr` (the node being rewired), and `nxt` (saved so the rest of the list is not lost).

```python
def reverse(head):
    prev, curr = None, head
    while curr is not None:
        nxt = curr.next        # 1. save the rest
        curr.next = prev       # 2. rewire this node backwards
        prev = curr            # 3. advance prev
        curr = nxt             # 4. advance curr
    return prev
```

**Invariant:** at the top of each iteration, `prev` is the head of a correctly reversed list containing exactly the nodes already visited, and `curr` is the head of the untouched remainder. When `curr` becomes null, `prev` is the whole list reversed.

Trace on `1 → 2 → 3 → 4`:

| iteration | prev (reversed part) | curr | nxt | after rewire |
|---|---|---|---|---|
| start | `None` | 1 | – | – |
| 1 | `1 → None` | 2 | 2 | `1.next = None` |
| 2 | `2 → 1 → None` | 3 | 3 | `2.next = 1` |
| 3 | `3 → 2 → 1 → None` | 4 | 4 | `3.next = 2` |
| 4 | `4 → 3 → 2 → 1 → None` | `None` | `None` | `4.next = 3` |

Return `prev` = node 4. Four iterations for four nodes: O(n) time, O(1) extra space.

```viz
{"type": "linked-list", "algorithm": "reverse", "values": [1, 2, 3, 4, 5], "title": "Iterative reversal: prev, curr, nxt"}
```

The line people get wrong is step 1. If you write `curr.next = prev` first, `curr.next` (the rest of the list) is overwritten before it is saved, and the loop terminates after one node with the tail lost. Say "save next" out loud before you touch the pointer.

Reversal is the primitive for many other problems: reverse a sublist between positions `m` and `n` (walk to `m − 1`, reverse `n − m + 1` nodes, reconnect both ends), reverse in groups of `k` ([Reverse Nodes in k-Group](/practice/reverse-nodes-k-group)), and check whether a list is a palindrome in O(1) space (find the middle, reverse the second half, compare, optionally reverse back: [Palindrome Linked List](/practice/palindrome-linked-list)).

## Recursive reversal

```python
def reverse_rec(head):
    if head is None or head.next is None:
        return head
    new_head = reverse_rec(head.next)   # reverses everything after head
    head.next.next = head               # the old successor now points back at head
    head.next = None                    # head becomes the tail
    return new_head
```

Trust the recursive call: after `reverse_rec(head.next)` returns, the sublist from `head.next` onward is reversed and `head.next` (unchanged so far) is now the *last* node of that reversed sublist. Appending `head` after it is `head.next.next = head`. Then `head.next = None` makes `head` the new tail.

For `1 → 2 → 3`: the call on `1` recurses to `2`, which recurses to `3` (base case, returns 3). Back at `2`: `3.next = 2`, `2.next = None`, return 3. Back at `1`: `2.next = 1`, `1.next = None`, return 3. Result `3 → 2 → 1`.

The recursion is O(n) time and **O(n) stack space**, one frame per node. Python's default recursion limit is 1,000, so a list of 10,000 nodes crashes with `RecursionError`; JavaScript and Java have deeper stacks but also finite ones. In an interview, write the iterative version and mention the recursive one; in production, never recurse over a list whose length you do not control. [Stack, heap and the call stack](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the mechanics.

## Worked example: reversing a sublist

Reverse positions `m..n` (1-indexed) of `1 → 2 → 3 → 4 → 5` with `m = 2`, `n = 4`, so the answer is `1 → 4 → 3 → 2 → 5`. The core reversal is the same three-pointer loop; the work is in the reconnection, and a sentinel handles `m = 1`.

```python
def reverse_between(head, m, n):
    sentinel = ListNode(0, head)
    before = sentinel
    for _ in range(m - 1):
        before = before.next          # node just before the sublist
    tail = before.next                # first node of the sublist; becomes its last
    prev, curr = None, tail
    for _ in range(n - m + 1):
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    before.next = prev                # reconnect the front: prev is the reversed head
    tail.next = curr                  # reconnect the back: curr is the node after n
    return sentinel.next
```

Trace: `before` walks one step to node 1. `tail = 2`. Reverse three nodes: after the loop, `prev = 4` (head of `4 → 3 → 2`) and `curr = 5`. Then `1.next = 4` and `2.next = 5`. Read it back: `1 → 4 → 3 → 2 → 5`. With `m = 1`, `before` is the sentinel itself and the head is replaced through `sentinel.next`, no branch needed.

Two of the four pointers here (`before`, `tail`) exist only to reconnect. Whenever you reverse *part* of a list, budget for those two before writing the loop; forgetting `tail.next = curr` leaves the reversed block's last node pointing at null and silently drops the rest of the list.

## The runner technique: fast and slow pointers

Two pointers start at the head. `slow` advances one node per step, `fast` advances two. When `fast` reaches the end, `slow` is at the middle. One pass, no length count, O(1) space.

```python
def middle(head):
    slow = fast = head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next
    return slow
```

**Invariant:** `fast` is always `2k` nodes from the head when `slow` is `k` nodes from the head. Where it stops determines which "middle" you get:

- Odd length `1 → 2 → 3 → 4 → 5`: steps `(slow, fast)` = (1,1), (2,3), (3,5); `fast.next` is null, stop. `slow = 3`, the exact middle.
- Even length `1 → 2 → 3 → 4`: (1,1), (2,3), (3,None); `fast` is null, stop. `slow = 3`, the *second* of the two middle nodes.

If you need the *first* middle node for even lengths (typical when splitting a list in two for merge sort, or for palindrome checks), start `fast` at `head.next`, or loop while `fast.next and fast.next.next`. Decide which you need before writing the loop; the off-by-one here is the most common bug in reorder and merge-sort implementations.

```viz
{"type": "linked-list", "algorithm": "middle", "values": [1, 2, 3, 4, 5, 6], "title": "Runner: fast moves two, slow moves one"}
```

The loop condition `fast and fast.next` is load-bearing. Without the `fast.next` check, `fast.next.next` dereferences null on odd-length lists. Trace with one node and with two nodes before you trust it.

### Nth node from the end

Advance a `lead` pointer `n` nodes ahead of `trail`, then move both until `lead` falls off the end. `trail` is then `n` nodes from the end. To *delete* that node you need its predecessor, so start `trail` at a sentinel and stop when `lead` is at the last node.

```python
def remove_nth_from_end(head, n):
    sentinel = ListNode(0, head)
    lead = trail = sentinel
    for _ in range(n):
        lead = lead.next             # assumes 1 <= n <= length
    while lead.next is not None:
        lead = lead.next
        trail = trail.next
    trail.next = trail.next.next     # unlink
    return sentinel.next
```

Trace on `1 → 2 → 3 → 4 → 5`, `n = 2`: after the first loop `lead = 2` (two steps from the sentinel). Second loop: `(lead, trail)` moves (3, 1), (4, 2), (5, 3); `lead.next` is null. `trail = 3`, so `trail.next = 5` unlinks node 4. Result `1 → 2 → 3 → 5`. The sentinel is what makes `n = length` (delete the head) work without a branch: `trail` stays at the sentinel and `sentinel.next` is rewired.

```viz
{"type": "linked-list", "algorithm": "remove-nth-from-end", "values": [1, 2, 3, 4, 5], "n": 2, "title": "Gap of n between two pointers"}
```

Why one pass matters: the two-pass version (count the length, then walk `length − n`) is equally O(n), and in an interview you should say that first. The one-pass version matters when the list is a stream you cannot rewind, and it is the version interviewers usually want to see because it demonstrates the offset-pointer idea.

### Other runner problems

- **Split a list in half** for merge sort: middle (first-middle variant), then `mid.next = None`.
- **Reorder** `1 → 2 → 3 → 4 → 5` into `1 → 5 → 2 → 4 → 3`: find the middle, reverse the second half, interleave. Three techniques in one problem; [Reorder List](/practice/reorder-list). The runner and the reversal both appear, which is why interviewers like it.
- **Cycle detection**: the runner with a different termination question, covered in [Cycle detection](/learn/data-structures/linked-lists/cycle-detection).
- **Intersection of two lists**: two pointers that switch lists when they reach the end, so both travel `len(A) + len(B)` and meet at the intersection.

## A checklist for pointer code

1. **Name every pointer by its meaning**, not `p`, `q`, `r`. `prev`/`curr`/`nxt`, `slow`/`fast`, `lead`/`trail`.
2. **State the invariant** in one sentence and check it holds after each loop body.
3. **Save before you overwrite.** Any assignment to `x.next` where you still need the old `x.next` is preceded by saving it.
4. **Check the termination expression against null.** `while curr` vs `while curr.next` vs `while fast and fast.next`: each is correct for a different loop and wrong for the others.
5. **Trace four cases by hand**: empty, one node, two nodes, and a list where the answer is the head or the tail.
6. **Return the right head.** After reversal it is `prev`; after edits with a sentinel it is `sentinel.next`.

## Exercises

```exercise
id: reverse-list
title: Reverse a linked list
prompt: |
  Reverse the singly linked list in place and return the new head. O(n)
  time and O(1) extra space; do not build a new list or use recursion.
  The list has at least one node.
languages: [python, javascript]
entry: reverse_list
starter:
  python: |
    def reverse_list(head):
        # your code here
        return head
  javascript: |
    function reverse_list(head) {
      // your code here
      return head;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}]
    expected: {"$list": [5, 4, 3, 2, 1]}
  - args: [{"$list": [1]}]
    expected: {"$list": [1]}
    label: single node
  - args: [{"$list": [1, 2]}]
    expected: {"$list": [2, 1]}
    label: two nodes
  - args: [{"$list": [3, 3, 1]}]
    expected: {"$list": [1, 3, 3]}
    hidden: true
    label: duplicate values
  - args: [{"$list": [1, 2, 3, 4, 5, 6, 7, 8]}]
    expected: {"$list": [8, 7, 6, 5, 4, 3, 2, 1]}
    hidden: true
hints:
  - "Three pointers: save `nxt = curr.next` before setting `curr.next = prev`."
  - "When `curr` becomes null, `prev` is the new head."
```

```exercise
id: kth-from-end
title: Value of the k-th node from the end
prompt: |
  Return the value of the k-th node from the end of the list (`k = 1` is
  the last node), or `None`/`null` if the list has fewer than `k` nodes.
  Use two pointers with a gap of `k` and a single pass; do not compute the
  length first.
languages: [python, javascript]
entry: kth_from_end
starter:
  python: |
    def kth_from_end(head, k):
        # your code here
        return None
  javascript: |
    function kth_from_end(head, k) {
      // your code here
      return null;
    }
tests:
  - args: [{"$list": [1, 2, 3, 4, 5]}, 2]
    expected: 4
  - args: [{"$list": [1, 2, 3, 4, 5]}, 5]
    expected: 1
    label: k equals the length
  - args: [{"$list": [1, 2, 3, 4, 5]}, 1]
    expected: 5
    label: last node
  - args: [{"$list": [1, 2]}, 3]
    expected: null
    label: k larger than the list
  - args: [{"$list": [10, 20, 30, 40]}, 4]
    expected: 10
    hidden: true
  - args: [{"$list": [9]}, 2]
    expected: null
    hidden: true
hints:
  - "Advance `lead` k times; if it runs off the end (becomes null) before k steps complete, the list is too short."
  - "Then move `lead` and `trail` together until `lead` is null; `trail` is the answer."
```

## Senior signals

- You write iterative reversal without hesitation, name the invariant, and explain which assignment order loses the tail.
- You know recursive reversal is O(n) stack and why that rules it out for unbounded input.
- You choose the first or second middle deliberately for even-length lists and can say which loop condition gives which.
- You use a sentinel with the nth-from-end pattern so deleting the head is not a special case.
- You mention the two-pass alternative and explain when one-pass matters (streams).
- You trace empty, single, double and boundary cases before running.

## Check yourself

```quiz
- q: >-
    In iterative reversal, what happens if `curr.next = prev` is executed before saving `curr.next`?
  options: ["The list is reversed correctly but slowly", "The loop terminates after the first node and the rest of the list is unreachable", "An infinite loop", "The list is reversed in the wrong direction"]
  answer: 1
  explanation: >-
    Overwriting `curr.next` discards the only reference to the remainder. `nxt` would then be read from the already-rewired pointer (prev), so `curr` becomes `None` after one iteration and the tail is lost.
- q: >-
    With `slow = fast = head` and `while fast and fast.next`, what does `slow` point to for the list 1 → 2 → 3 → 4?
  options: ["2, the first middle", "3, the second middle", "4, the tail", "1, the head"]
  answer: 1
  explanation: >-
    Steps: (1,1) → (2,3) → (3,None). The loop exits with slow at 3. Starting fast at head.next, or using `while fast.next and fast.next.next`, yields the first middle (2), which is what list-splitting for merge sort usually wants.
- q: >-
    Why is recursive list reversal a poor choice for a list of 100,000 nodes in Python?
  options: ["It is O(n²)", "Each node adds a stack frame, and Python's default recursion limit (about 1,000) is exceeded", "Recursion cannot modify pointers", "Python lacks tail-call optimisation, which makes it O(n log n)"]
  answer: 1
  explanation: >-
    The recursion depth equals the list length. The algorithm is O(n) time, but O(n) stack space, and Python raises RecursionError long before 100,000 frames. Iteration uses O(1) space.
- q: >-
    To delete the nth node from the end with two pointers in one pass, why start `trail` at a sentinel rather than at the head?
  options: ["To make the loop faster", "So that `trail` ends at the predecessor of the target, and deleting the head (n equal to the length) needs no special case", "Because the head might be null", "To avoid needing `lead`"]
  answer: 1
  explanation: >-
    Deletion in a singly linked list needs the predecessor. With `trail` one node behind the target and starting at the sentinel, the head's predecessor is the sentinel and `sentinel.next` is rewired uniformly.
- q: >-
    Which of these problems combines the runner technique and reversal?
  options: ["Delete every node with a given value", "Reorder a list as first, last, second, second-last, ...", "Insert into a sorted list", "Find the length of a list"]
  answer: 1
  explanation: >-
    Reorder List finds the middle with fast/slow pointers, reverses the second half in place, and interleaves the two halves, exercising both techniques and the sentinel-free reconnection logic.
```

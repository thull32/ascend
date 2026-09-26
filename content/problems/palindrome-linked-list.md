---
slug: palindrome-linked-list
title: Palindrome Linked List
difficulty: easy
patterns: [linked-list]
lists: [ascend-150]
companies: [amazon, meta, microsoft, apple]
order: 10
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "Copying the values into an array and comparing from both ends is O(n) space. The interviewer wants O(1) space, which means comparing the two halves without an index into the back half."
  - "Find the middle with fast and slow pointers, reverse the second half in place, then walk both halves forwards comparing values."
  - "The first half may be one node longer than the second (odd length). Compare only while the second half has nodes, and the middle node is skipped automatically."
signatures:
  python:
    name: is_palindrome
    starter: |
      def is_palindrome(head: ListNode | None) -> bool:
          pass
  javascript:
    name: is_palindrome
    starter: |
      function is_palindrome(head) {
      }
tests:
  - args: [{"$list": [1, 2, 2, 1]}]
    expected: true
  - args: [{"$list": [1, 2]}]
    expected: false
  - args: [{"$list": [1]}]
    expected: true
    label: single node
  - args: [{"$list": [1, 2, 3, 2, 1]}]
    expected: true
    label: odd length
  - args: [{"$list": [7, 7, 7, 7]}]
    expected: true
  - args: [{"$list": [1, 2, 3, 3, 1]}]
    expected: false
    hidden: true
    label: mismatch near the middle
  - args: [{"$list": [1, 0, 1, 0]}]
    expected: false
    hidden: true
  - args: [{"$list": []}]
    expected: true
    hidden: true
    label: empty list
time_limit_ms: 4000
---
Given the head of a singly linked list, return `true` if the sequence of values reads the same forwards and backwards, and `false` otherwise. An empty list and a single node both count as palindromes.

The interviewer wants `O(n)` time and `O(1)` extra space. You may temporarily rewire the list, but restore it before returning.

### Examples

| Input | Output | Why |
|---|---|---|
| `1 → 2 → 2 → 1` | `true` | Symmetric |
| `1 → 2 → 3 → 2 → 1` | `true` | Odd length; the middle node is its own mirror |
| `1 → 2` | `false` | `1 ≠ 2` |

### Constraints

- `0 ≤ number of nodes ≤ 10⁵`
- `0 ≤ node.val ≤ 9`

### Follow-up

The interviewer asks: "Your solution mutates the list while checking. Is that acceptable in a multithreaded service? What would you do instead, and what would it cost?"

## Solution

### The naive approach

Copy the values into an array and compare `arr[i]` with `arr[n - 1 - i]`. `O(n)` time and `O(n)` space; two lines. A stack of the first half's values does the same with half the memory. Either is fine as a warm-up, but the interviewer's constraint is `O(1)` space.

### The insight

A palindrome check compares the front half with the *reverse* of the back half. Reversing in place is a technique you already own ([Reverse Linked List](/practice/reverse-linked-list)), and finding the split point is the fast/slow middle. After reversing the back half you have two forward lists that should be identical, which is a single simultaneous walk.

### The optimal approach

1. Handle the trivial cases (zero or one node).
2. Move `fast` two steps and `slow` one until `fast` runs out; `slow` lands on the first node of the second half (for odd lengths, the middle node, which is then compared with itself harmlessly, or you can start from `slow.next`; both work).
3. Reverse from `slow` onward to get `second`.
4. Walk `head` and `second` together while `second` has nodes; any mismatch means `false`.
5. Reverse the second half back so the caller's list is intact, then return the verdict.

Trace on `1 → 2 → 3 → 2 → 1`: `slow` stops at the middle 3; reversing `3 → 2 → 1` gives `1 → 2 → 3`; compare `1/1`, `2/2`, `3/3`; all match, `true`.

```python
def is_palindrome(head: ListNode | None) -> bool:
    if head is None or head.next is None:
        return True

    slow, fast = head, head
    while fast is not None and fast.next is not None:
        slow = slow.next
        fast = fast.next.next

    def reverse(node):
        prev = None
        while node is not None:
            nxt = node.next
            node.next = prev
            prev = node
            node = nxt
        return prev

    second = reverse(slow)
    ok = True
    a, b = head, second
    while b is not None:
        if a.val != b.val:
            ok = False
            break
        a, b = a.next, b.next

    reverse(second)      # restore the original list
    return ok
```

Time `O(n)`: three passes over at most half the list plus one full pass. Space `O(1)`.

### Common mistakes

- Comparing `while a is not None`, which for odd lengths runs the first half one node further than the second and dereferences `None`.
- Forgetting to restore the list, which a test harness may not catch but a code reviewer will.
- Using the `fast.next, fast.next.next` loop condition and then reversing from `slow` (not `slow.next`), which makes the second half one node too long for even lengths and breaks the comparison.

### How to discuss it

Say the decomposition first: "middle, reverse the second half, compare, restore." Mention that the restore step matters because mutating an input for a read-only query is a side effect callers do not expect. That is also the answer to the follow-up: in a concurrent setting the temporary reversal is a data race for any other reader, so you either take a lock for the duration, or spend the `O(n)` space on a value copy and keep the query pure. Naming that trade-off, rather than insisting on `O(1)` space, is what the interviewer is listening for.

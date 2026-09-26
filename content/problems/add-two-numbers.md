---
slug: add-two-numbers
title: Add Two Numbers
difficulty: medium
patterns: [linked-list]
lists: [ascend-150]
companies: [amazon, microsoft, bloomberg, adobe]
order: 6
lesson: interview-patterns/sequence-patterns/in-place-linked-list
hints:
  - "The digits are stored least significant first, which is exactly the order you add on paper: units column, then tens, carrying as you go."
  - "Treat a missing node as the digit 0 so the loop does not need separate cases for lists of different lengths."
  - "The loop must keep going while there is a carry even after both lists are exhausted, otherwise `99 + 1` loses its leading 1."
signatures:
  python:
    name: add_two_numbers
    starter: |
      def add_two_numbers(a: ListNode | None, b: ListNode | None) -> ListNode | None:
          pass
  javascript:
    name: add_two_numbers
    starter: |
      function add_two_numbers(a, b) {
      }
tests:
  - args: [{"$list": [2, 4, 3]}, {"$list": [5, 6, 4]}]
    expected: {"$list": [7, 0, 8]}
  - args: [{"$list": [0]}, {"$list": [0]}]
    expected: {"$list": [0]}
    label: zero plus zero
  - args: [{"$list": [9, 9, 9, 9, 9, 9, 9]}, {"$list": [9, 9, 9, 9]}]
    expected: {"$list": [8, 9, 9, 9, 0, 0, 0, 1]}
    label: long carry chain, different lengths
  - args: [{"$list": [5]}, {"$list": [5]}]
    expected: {"$list": [0, 1]}
    label: carry creates a new digit
  - args: [{"$list": [3, 2, 1]}, {"$list": [4]}]
    expected: {"$list": [7, 2, 1]}
  - args: [{"$list": [1, 8]}, {"$list": [0]}]
    expected: {"$list": [1, 8]}
    hidden: true
  - args: [{"$list": [9, 9]}, {"$list": [1]}]
    expected: {"$list": [0, 0, 1]}
    hidden: true
    label: carry after both lists end
  - args: [{"$list": [1]}, {"$list": [9, 9, 9]}]
    expected: {"$list": [0, 0, 0, 1]}
    hidden: true
time_limit_ms: 4000
---
Two non-negative integers are stored as linked lists, one decimal digit per node, with the **least significant digit first**. So the number 342 is stored as `2 → 4 → 3`.

Given the heads of two such lists, return a new list in the same format representing their sum. Neither number has leading zeros, except the number 0 itself, which is the single node `0`.

### Examples

| Input | Output | Why |
|---|---|---|
| `2 → 4 → 3`, `5 → 6 → 4` | `7 → 0 → 8` | 342 + 465 = 807 |
| `5`, `5` | `0 → 1` | 5 + 5 = 10; the carry becomes a new node |
| `9 → 9`, `1` | `0 → 0 → 1` | 99 + 1 = 100 |

### Constraints

- `1 ≤ nodes in each list ≤ 100`
- `0 ≤ node.val ≤ 9`

### Follow-up

The interviewer asks: "Now the digits are stored most significant first. What changes?" And: "Why would a system ever store numbers this way instead of using a 64-bit integer?"

## Solution

### The naive approach

Convert each list to an integer, add, convert back. In Python this works because integers are arbitrary precision; in most other languages a 100-digit number overflows immediately, and the interviewer will ask you to do it without that crutch. It also misses the point: the list format is the whole problem.

### The insight

Least-significant-first is the order of schoolbook addition. Walk both lists in lockstep, add the two digits plus the incoming carry, emit `sum % 10`, and pass `sum // 10` (always 0 or 1) to the next column. Missing digits are zero. The carry is the only state.

### The optimal approach

Use a dummy head and a `tail` pointer. Loop while `a` or `b` has nodes *or* `carry` is non-zero. In each iteration read the digit from each list if present (else 0), compute the column sum, append a node with `total % 10`, set `carry = total // 10`, advance whichever lists still have nodes.

Trace on `9 → 9` plus `1`: column 1: 9 + 1 + 0 = 10 → emit 0, carry 1. Column 2: 9 + 0 + 1 = 10 → emit 0, carry 1. Both lists done, carry 1 → emit 1. Result `0 → 0 → 1` = 100.

```python
def add_two_numbers(a: ListNode | None, b: ListNode | None) -> ListNode | None:
    dummy = ListNode(0)
    tail = dummy
    carry = 0
    while a is not None or b is not None or carry:
        total = carry
        if a is not None:
            total += a.val
            a = a.next
        if b is not None:
            total += b.val
            b = b.next
        carry, digit = divmod(total, 10)
        tail.next = ListNode(digit)
        tail = tail.next
    return dummy.next
```

Time `O(max(n, m))`. Space `O(max(n, m))` for the output, `O(1)` beyond it.

### Common mistakes

- Looping only while *both* lists have nodes and then bolting on the remainder, which triples the code and usually drops the final carry.
- Forgetting the `or carry` in the loop condition, so `5 + 5` returns `0` instead of `0 → 1`.
- Reusing the input nodes for the output to save allocation, which is fine if the interviewer permits mutation, but say so; the problem asks for a new list.

### How to discuss it

Call out that the storage order matches the addition order, which is why the loop is a single pass with one integer of state. For the most-significant-first follow-up, you cannot add left to right because carries flow right to left; either reverse both lists first (an in-place [reversal](/practice/reverse-linked-list), then reverse the result) or push digits onto two stacks and pop. For "why store numbers this way": arbitrary-precision arithmetic (cryptographic keys, financial systems that refuse floating point, bignum libraries) stores limbs least-significant first for exactly this reason, and the limb is usually a 32- or 64-bit word rather than a decimal digit.

---
slug: happy-number
title: Happy Number
difficulty: easy
patterns: [fast-slow-pointers]
lists: [ascend-150]
companies: [google, amazon, apple, uber]
order: 4
lesson: interview-patterns/sequence-patterns/fast-slow-pointers
hints:
  - "The sequence either reaches 1 or repeats forever. Detecting a repeat with a set works; the interviewer wants you to notice this is cycle detection."
  - "The digit-square-sum of any number below 1000 is at most 243, so after one step every sequence lives in a small range and must eventually cycle. That is why a repeat is guaranteed."
  - "Run fast/slow pointers on the sequence: slow takes one step, fast takes two. If they meet at 1 the number is happy; if they meet anywhere else it is not."
signatures:
  python:
    name: is_happy
    starter: |
      def is_happy(n: int) -> bool:
          pass
  javascript:
    name: is_happy
    starter: |
      function is_happy(n) {
      }
tests:
  - args: [19]
    expected: true
  - args: [2]
    expected: false
  - args: [1]
    expected: true
    label: one is happy by definition
  - args: [7]
    expected: true
  - args: [68]
    expected: true
  - args: [20]
    expected: false
  - args: [4]
    expected: false
    hidden: true
    label: four is inside the unhappy cycle
  - args: [100]
    expected: true
    hidden: true
  - args: [1111111]
    expected: true
    hidden: true
    label: seven ones sum to 7, which is happy
time_limit_ms: 4000
---
Starting from a positive integer, repeatedly replace it with the sum of the squares of its decimal digits. A number is **happy** if this process reaches `1` (after which it stays at `1` forever). Otherwise the process loops endlessly through a cycle that never contains `1`.

Return `true` if `n` is happy.

### Examples

| Input | Output | Why |
|---|---|---|
| `19` | `true` | `1² + 9² = 82`, `8² + 2² = 68`, `6² + 8² = 100`, `1² + 0² + 0² = 1` |
| `2` | `false` | `2 → 4 → 16 → 37 → 58 → 89 → 145 → 42 → 20 → 4 → …` repeats without reaching 1 |
| `7` | `true` | `7 → 49 → 97 → 130 → 10 → 1` |

### Constraints

- `1 ≤ n ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Prove the process always terminates in a repeat; why can't it grow forever?" Then: "Every unhappy number falls into the same cycle. How could you exploit that, and is it a good idea?"

## Solution

### The naive approach

Iterate, storing every value seen in a set; stop when you hit `1` (happy) or a repeat (unhappy). This is correct and `O(1)`-ish in practice because the values stay small. The interviewer accepts it as a first answer but will ask you to remove the set.

### The insight

The map `n → digit_square_sum(n)` defines a sequence, and asking whether the sequence reaches a fixed point or loops is exactly the linked-list cycle question, with the function playing the role of `next`. Floyd's tortoise and hare finds the loop with two integers of state instead of a set.

Why the sequence must loop: a number with `d` digits has digit-square sum at most `81d`. For `d ≥ 4`, `81d < 10^(d-1)`, so any number with four or more digits strictly shrinks; for `d ≤ 3` the sum is at most `243`. So after the first step every value is at most `243`, and a sequence over a finite set of values must eventually repeat. A repeat is either the fixed point `1 → 1` or a genuine cycle.

### The optimal approach

Run `slow = f(slow)` and `fast = f(f(fast))` until they are equal. If they met at `1`, the number is happy. Otherwise they met inside the unhappy cycle.

Trace on `2` with the code below, where `fast` starts one step ahead. `(slow, fast)` per iteration: `(2, 4)` initially, then `(4, 37)`, `(16, 89)`, `(37, 42)`, `(58, 4)`, `(89, 37)`, `(145, 89)`, `(42, 42)`. They meet at 42, not 1, so `false`. On `19`: `(19, 82)`, `(82, 100)`, `(68, 1)`; fast is 1, stop, `true`.

```python
def is_happy(n: int) -> bool:
    def step(x: int) -> int:
        total = 0
        while x:
            x, d = divmod(x, 10)
            total += d * d
        return total

    slow, fast = n, step(n)
    while fast != 1 and slow != fast:
        slow = step(slow)
        fast = step(step(fast))
    return fast == 1
```

Time: each `step` is `O(log n)` for the digit loop; the number of steps before meeting is bounded by the tail plus cycle length, which is a small constant for values under 244. Effectively `O(log n)`. Space `O(1)`.

Starting `fast` one step ahead avoids the trivial `slow == fast` at initialisation. The `fast != 1` check ends early on happy numbers because `1` is a fixed point and fast would otherwise sit there waiting for slow.

### Common mistakes

- Initialising `slow = fast = n` and using a `while slow != fast` loop, which exits immediately.
- Treating "reaches a small number" as "happy". `4` is small and unhappy.
- Recomputing digit sums with string conversion in the hot loop; fine for correctness, but be ready to write the arithmetic version.

### How to discuss it

Present the set solution in one sentence, then say "this is cycle detection on an implicit linked list, so Floyd" and give the shrinking argument for why a cycle must exist. For the second follow-up: every unhappy number ends up in the cycle `4, 16, 37, 58, 89, 145, 42, 20`, so you could simply iterate until you hit `1` or `4`. It is faster and shorter, but it hard-codes a mathematical fact about base 10 that most reviewers cannot verify at a glance; in an interview, offer it as a known optimisation after the general solution, not instead of it.

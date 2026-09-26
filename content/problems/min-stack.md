---
slug: min-stack
title: Min Stack
difficulty: medium
patterns: [stack]
lists: [core-75, ascend-150]
companies: [amazon, bloomberg, google, uber]
order: 2
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - Scanning the stack for the minimum on every `get_min` is O(n). What could you store *alongside* each element so the answer is already there?
  - The minimum of the stack after pushing `x` is `min(x, previous minimum)`. That value only depends on what is below `x`, so it can be recorded when `x` is pushed and forgotten when `x` is popped.
  - Two parallel stacks, or a stack of `(value, min_so_far)` pairs, both work. Make sure a popped minimum is restored correctly when duplicates of the minimum exist.
signatures:
  python:
    name: MinStack
    starter: |
      class MinStack:
          def __init__(self):
              pass

          def push(self, val: int) -> None:
              pass

          def pop(self) -> None:
              pass

          def top(self) -> int:
              pass

          def get_min(self) -> int:
              pass
  javascript:
    name: MinStack
    starter: |
      class MinStack {
        constructor() {
        }
        push(val) {
        }
        pop() {
        }
        top() {
        }
        get_min() {
        }
      }
tests:
  - args: [["push", -2], ["push", 0], ["push", -3], ["get_min"], ["pop"], ["top"], ["get_min"]]
    expected: [null, null, null, -3, null, 0, -2]
  - args: [["push", 5], ["get_min"], ["push", 3], ["get_min"], ["push", 7], ["get_min"], ["pop"], ["get_min"], ["pop"], ["get_min"]]
    expected: [null, 5, null, 3, null, 3, null, 3, null, 5]
    label: minimum survives a larger push and returns after pops
  - args: [["push", 1], ["push", 1], ["get_min"], ["pop"], ["get_min"], ["top"]]
    expected: [null, null, 1, null, 1, 1]
    label: duplicate minimums
  - args: [["push", 2], ["top"], ["get_min"]]
    expected: [null, 2, 2]
    label: single element
  - args: [["push", 4], ["push", 2], ["push", 2], ["push", 6], ["pop"], ["get_min"], ["pop"], ["get_min"], ["pop"], ["get_min"]]
    expected: [null, null, null, null, null, 2, null, 2, null, 4]
    hidden: true
    label: popping one copy of the minimum keeps the other
  - args: [["push", -10], ["push", -20], ["push", -5], ["get_min"], ["pop"], ["pop"], ["get_min"], ["top"]]
    expected: [null, null, null, -20, null, null, -10, -10]
    hidden: true
  - args: [["push", 0], ["push", -1], ["push", -1], ["pop"], ["get_min"], ["pop"], ["get_min"]]
    expected: [null, null, null, null, -1, null, 0]
    hidden: true
time_limit_ms: 4000
---
Design a stack that, in addition to the usual operations, can report its current minimum element in constant time. Implement a class `MinStack` with:

- `push(val)` — push `val` onto the stack.
- `pop()` — remove the top element. Returns nothing.
- `top()` — return the top element without removing it.
- `get_min()` — return the smallest element currently in the stack.

Every operation must run in `O(1)` time. `pop`, `top` and `get_min` are only ever called on a non-empty stack.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for methods that return nothing.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `push(-2), push(0), push(-3), get_min()` | `null, null, null, -3` | `-3` is the smallest of the three |
| `pop(), top(), get_min()` (continuing) | `null, 0, -2` | After `-3` leaves, the minimum is `-2` again |
| `push(5), get_min(), push(3), get_min(), pop(), get_min()` | `null, 5, null, 3, null, 5` | The minimum must *revert* when the element that set it is popped |

### Constraints

- `-2³¹ ≤ val ≤ 2³¹ - 1`
- At most `3 × 10⁴` calls in total

### Follow-up

The interviewer asks: "Your solution doubles the memory. Can you get `get_min` in O(1) with `O(1)` extra space beyond the stack itself?" Then: "How would you support `get_max` at the same time, and then `pop_min`?"

## Solution

### The naive approach

A plain list, and `get_min` scans it. Push, pop and top are `O(1)`; `get_min` is `O(n)`. Alternatively keep a running `min` variable: `get_min` becomes `O(1)` but `pop` must rescan the stack whenever the minimum leaves, which is `O(n)` again. Either way one operation pays.

### The insight

The minimum of the stack is a function of *which elements are below the top*. When you push `x`, the new minimum is `min(x, old minimum)`, and that value is fixed for as long as `x` is on the stack. When `x` is popped, the minimum goes back to whatever it was before `x` arrived. So record the minimum *at push time*, next to the element, and popping automatically restores the earlier one.

### The optimal approach

Keep two stacks moving in lockstep: `vals` holds the elements and `mins[i]` holds the minimum of `vals[0..i]`. Push computes `min(val, mins[-1])`; pop pops both; `get_min` is `mins[-1]`.

```python
class MinStack:
    def __init__(self):
        self.vals: list[int] = []
        self.mins: list[int] = []

    def push(self, val: int) -> None:
        self.vals.append(val)
        current_min = val if not self.mins else min(val, self.mins[-1])
        self.mins.append(current_min)

    def pop(self) -> None:
        self.vals.pop()
        self.mins.pop()

    def top(self) -> int:
        return self.vals[-1]

    def get_min(self) -> int:
        return self.mins[-1]
```

Every operation is `O(1)`. Space is `O(n)`, twice the plain stack.

A space refinement: only push onto `mins` when the new value is `≤` the current minimum, and only pop `mins` when the popped value equals `mins[-1]`. The `≤` (not `<`) is what makes duplicates of the minimum work: `push(1), push(1), pop()` must leave a `1` on `mins`.

### Common mistakes

- Storing a single `min` variable and forgetting to restore it on pop.
- Using `<` instead of `≤` in the sparse-`mins` variant, so the second `pop` of a duplicate minimum pops a stale entry or underflows.
- Trying to sort or scan on `get_min`; the whole point is that the answer is precomputed.

### How to discuss it

Lead with the invariant: "`mins[i]` is the minimum of everything at or below index `i`, so the top of `mins` is always the current minimum, and popping restores it for free." Then mention the sparse variant as an optimisation. For the `O(1)` extra space follow-up there is a known trick that stores `2*val - min` encoded values in the stack and keeps just one `min` integer; it works but overflows fixed-width integers, which is the answer the interviewer wants to hear. `get_max` is the same structure mirrored. `pop_min` breaks the LIFO shape entirely: that is a different structure (a balanced tree or a heap with lazy deletion keyed by insertion order), and recognising that the request changes the problem is the senior move.

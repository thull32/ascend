---
slug: find-duplicate-number
title: Find the Duplicate Number
difficulty: medium
patterns: [fast-slow-pointers]
lists: [ascend-150]
companies: [amazon, microsoft, google, bloomberg]
order: 2
lesson: interview-patterns/sequence-patterns/fast-slow-pointers
hints:
  - "Every value is a valid index into the array (1..n, and the array has n+1 slots). So `i -> nums[i]` defines a function from indices to indices. What shape does repeatedly applying that function draw?"
  - "Because two indices hold the same value, two arrows point at the same node: the structure is a linked list with a cycle, and the duplicate is the node the cycle enters."
  - "Run Floyd's algorithm starting at index 0: find the meeting point with slow/fast pointers, then walk a second pointer from 0 in lockstep with slow; where they meet is the answer."
signatures:
  python:
    name: find_duplicate
    starter: |
      def find_duplicate(nums: list[int]) -> int:
          pass
  javascript:
    name: find_duplicate
    starter: |
      function find_duplicate(nums) {
      }
tests:
  - args: [[1, 3, 4, 2, 2]]
    expected: 2
  - args: [[3, 1, 3, 4, 2]]
    expected: 3
  - args: [[1, 1]]
    expected: 1
    label: smallest input
  - args: [[2, 2, 2, 2]]
    expected: 2
    label: duplicate appears many times
  - args: [[1, 4, 4, 2, 4]]
    expected: 4
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 5]]
    expected: 5
    hidden: true
  - args: [[4, 3, 1, 4, 2]]
    expected: 4
    hidden: true
  - args: [[3, 1, 2, 3]]
    expected: 3
    hidden: true
    label: duplicate is the largest value
time_limit_ms: 4000
---
You are given an array `nums` of `n + 1` integers, each in the range `1` to `n` inclusive. By the pigeonhole principle at least one value repeats. Exactly one value is repeated (it may appear two or more times); return it.

The interviewer's constraints are the whole problem: do not modify the array, use `O(1)` extra space, and run in better than `O(n²)` time.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 3, 4, 2, 2]` | `2` | `2` appears twice |
| `[3, 1, 3, 4, 2]` | `3` | |
| `[2, 2, 2, 2]` | `2` | The duplicate may appear more than twice |

### Constraints

- `2 ≤ len(nums) ≤ 10⁵`
- `1 ≤ nums[i] ≤ len(nums) - 1`
- Exactly one value appears more than once.

### Follow-up

The interviewer asks: "Give me a solution that is O(n log n) time and O(1) space *without* the linked-list trick." Then: "If you *were* allowed to modify the array, what is the simplest O(n) approach?"

## Solution

### The naive approach

Sort and look for adjacent equals: `O(n log n)` time, but sorting modifies the array (or copies it, `O(n)` space). A hash set: `O(n)` time and `O(n)` space. Brute-force pair comparison: `O(n²)` and `O(1)`, which the constraints explicitly rule out. Each violates one of the three rules; the interviewer chose the rules so that every standard tool is disqualified.

### The insight

Values lie in `1..n` and indices lie in `0..n`, so every value is a valid index. Treat `nums` as a function `f(i) = nums[i]` and follow it from index `0`: `0 → nums[0] → nums[nums[0]] → …`. This walk never leaves the array, so it must eventually repeat, meaning the sequence forms a ρ shape: a tail leading into a cycle. Index `0` is never a value, so `0` has no incoming arrow, which guarantees the walk starts on the tail rather than inside the cycle.

Now the key claim: **the node where the cycle begins is the duplicate value.** A cycle entrance has at least two arrows pointing into it (one from the tail, one from the cycle's last node). An arrow into node `v` means some index holds the value `v`. Two arrows means two indices hold `v`. That is the duplicate.

So the problem *is* [finding the start of a cycle in a linked list](/practice/linked-list-cycle), with `nums[i]` playing the role of `node.next`.

### The optimal approach

Phase 1: from `0`, advance `slow` by `nums[slow]` and `fast` by `nums[nums[fast]]` until they are equal. Phase 2: put a second pointer at `0` and advance both one step at a time; they meet at the cycle entrance.

Trace on `[1, 3, 4, 2, 2]`: the function map is `0→1, 1→3, 2→4, 3→2, 4→2`. Walking from 0 gives `0, 1, 3, 2, 4, 2, 4, …`: a tail `0, 1, 3` into the cycle `2, 4`. Phase 1, `(slow, fast)` per step: `(1, 3)`, `(3, 4)`, `(2, 4)`, `(4, 4)`; they meet at 4 (fast is stuck alternating `4 → 2 → 4`, so two steps leave it on 4). Phase 2, `(finder, slow)`: start `(0, 4)`, then `(1, 2)`, `(3, 4)`, `(2, 2)`. Meet at `2`. Answer 2.

```python
def find_duplicate(nums: list[int]) -> int:
    slow = fast = 0
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    finder = 0
    while finder != slow:
        finder = nums[finder]
        slow = nums[slow]
    return finder
```

Time `O(n)`: each phase is at most `n` steps. Space `O(1)`. The array is untouched.

The `O(n log n)`, `O(1)`-space follow-up is binary search on the *value* range: for a candidate `mid`, count how many elements are `≤ mid`; if the count exceeds `mid`, the duplicate is in `[1, mid]`, otherwise in `[mid + 1, n]`. That is `log n` counting passes.

### Common mistakes

- Starting the pointers at `nums[0]` instead of index `0`, which can start inside the cycle and break phase 2.
- Using `do-while` logic incorrectly: checking `slow == fast` before the first move (both are `0`) and exiting immediately. The `while True … break` shape above avoids it.
- Explaining the algorithm without being able to say *why* the cycle entrance is the duplicate. Interviewers ask; it is the in-degree argument above.

### How to discuss it

Name the three disqualified approaches and which constraint kills each. Then say "values are indices, so the array is a functional graph; a repeated value is a node with in-degree two, which is the entrance of the cycle; Floyd finds it in O(1) space." Give the binary-search-on-values alternative when asked, and for the mutable-array follow-up: negate `nums[abs(x)]` as you visit and return the first `x` whose slot is already negative, or cyclic-sort values into their own slots.

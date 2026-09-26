---
slug: move-zeroes
title: Move Zeroes
difficulty: easy
patterns: [two-pointers]
lists: [ascend-150]
companies: [meta, bloomberg, amazon]
order: 7
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - You need to keep the non-zero elements in their original relative order. Think of it as compacting the non-zeros to the front, then filling the rest with zeros.
  - A write pointer marks where the next non-zero goes; a read pointer scans. Every non-zero is copied to the write position.
  - Swapping instead of copying gets you a single pass with no fill-up step, at the cost of some redundant swaps.
signatures:
  python:
    name: move_zeroes
    starter: |
      def move_zeroes(nums: list[int]) -> list[int]:
          # Rearrange in place and return nums.
          pass
  javascript:
    name: move_zeroes
    starter: |
      function move_zeroes(nums) {
        // Rearrange in place and return nums.
      }
tests:
  - args: [[0, 1, 0, 3, 12]]
    expected: [1, 3, 12, 0, 0]
  - args: [[0]]
    expected: [0]
    label: single zero
  - args: [[]]
    expected: []
    label: empty input
  - args: [[1, 2, 3]]
    expected: [1, 2, 3]
    label: no zeros
  - args: [[0, 0, 1]]
    expected: [1, 0, 0]
  - args: [[1, 0]]
    expected: [1, 0]
  - args: [[4, 0, 0, 0, 5, 0, 6]]
    expected: [4, 5, 6, 0, 0, 0, 0]
    hidden: true
  - args: [[0, 0, 0]]
    expected: [0, 0, 0]
    hidden: true
    label: all zeros
time_limit_ms: 4000
---
You are given an array of integers `nums`. Rearrange it in place so that every `0` is moved to the end while all other elements keep their original relative order. Do not allocate a second array.

Return `nums` after rearranging it, so the tests can check the result.

### Examples

| Input | Output | Why |
|---|---|---|
| `[0, 1, 0, 3, 12]` | `[1, 3, 12, 0, 0]` | `1, 3, 12` keep their order |
| `[4, 0, 0, 0, 5, 0, 6]` | `[4, 5, 6, 0, 0, 0, 0]` | |
| `[0, 0, 0]` | `[0, 0, 0]` | Nothing to move |

### Constraints

- `0 ≤ len(nums) ≤ 10⁴`
- `-2³¹ ≤ nums[i] ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Minimise the number of writes to the array, not just the passes." Then: "Generalise: move every element satisfying a predicate to the end, stably. What does the code look like?"

## Solution

### The naive approach

Collect the non-zeros into a new list, append the right number of zeros, copy back. `O(n)` time, `O(n)` extra space. Or repeatedly find a zero and `pop` it, then `append(0)`: each pop shifts the tail, so `O(n²)`.

### The insight

"Stable partition by a predicate" is a read/write two-pointer job. The write pointer is the boundary of the compacted prefix of non-zeros; the read pointer scans everything. Each non-zero is placed at the write position and the boundary advances. Because the write pointer never passes the read pointer, an in-place write never clobbers an unread element. Zeros are what is left behind.

### The optimal approach

Two variants, both `O(n)` time and `O(1)` space.

**Copy then fill.** Copy every non-zero to `write`, then overwrite the tail with zeros. Two passes, and the number of writes is `(non-zeros) + (zeros) = n` at most.

```python
def move_zeroes(nums: list[int]) -> list[int]:
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write] = nums[read]
            write += 1
    for i in range(write, len(nums)):
        nums[i] = 0
    return nums
```

**Swap.** Swap `nums[read]` with `nums[write]` whenever `nums[read]` is non-zero. One pass, no fill-up step, but when there are no zeros yet (`read == write`) each swap is an element with itself.

```python
def move_zeroes_swap(nums: list[int]) -> list[int]:
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1
    return nums
```

Trace the copy-then-fill version on `[0, 1, 0, 3, 12]`. `read = 0`: zero, skip. `read = 1`: write `1` to index 0, `write = 1`. `read = 2`: skip. `read = 3`: write `3` to index 1, `write = 2`. `read = 4`: write `12` to index 2, `write = 3`. Fill indices 3, 4 with zero → `[1, 3, 12, 0, 0]`.

### Common mistakes

- Breaking stability by swapping with the *last* position (a "move zero to the end" that reorders the non-zeros).
- Writing a `while` that scans for the next zero and the next non-zero separately; correct but easy to get wrong at the boundaries, and no faster.
- Forgetting the fill-up pass in the copy version, which leaves stale values in the tail: `[0, 1]` would become `[1, 1]`.
- Treating `nums[read]` as falsy with `if nums[read]:`; fine for integers, wrong the moment the array can contain `None` or empty strings. Compare to `0` explicitly.

### How to discuss it

Say "stable partition with a read pointer and a write pointer", write the copy-then-fill version, trace it, then mention the swap variant and its trade-off. For the minimise-writes follow-up, the copy version already does at most `n` writes, and you can skip the copy when `read == write` (no zero seen yet) to avoid rewriting elements onto themselves; the swap version can do up to `2n` writes. For the generalisation: replace `nums[read] != 0` with `not pred(nums[read])` and you have `stable_partition`; the identical loop in [Remove Duplicates from a Sorted Array](/practice/remove-duplicates-sorted) uses "differs from the last kept element" as its predicate.

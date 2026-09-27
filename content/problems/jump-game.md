---
slug: jump-game
title: Jump Game
difficulty: medium
patterns: [greedy]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 2
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "You do not need to know which jumps to take, only whether the last index is reachable. What single number summarises everything the indices you have visited so far can reach?"
  - "Track the furthest index reachable so far. Walking left to right, index i is usable only if i is within that reach; if it is, it may push the reach out to i + nums[i]."
  - "If you ever stand on an index greater than the furthest reach, you are stuck: nothing before you can get you here, so nothing after you matters."
signatures:
  python:
    name: can_jump
    starter: |
      def can_jump(nums: list[int]) -> bool:
          pass
  javascript:
    name: can_jump
    starter: |
      function can_jump(nums) {
      }
tests:
  - args: [[1, 2, 0, 1, 3]]
    expected: true
  - args: [[3, 1, 0, 0, 2]]
    expected: false
    label: a zero you cannot get past
  - args: [[0]]
    expected: true
    label: already at the last index
  - args: [[0, 1]]
    expected: false
    label: stuck at the start
  - args: [[5, 0, 0, 0, 0]]
    expected: true
    label: one big jump
  - args: [[2, 0, 0]]
    expected: true
    label: reach lands exactly on the end
  - args: [[1, 1, 1, 0, 1]]
    expected: false
    hidden: true
  - args: [[4, 0, 0, 0, 0, 1]]
    expected: false
    hidden: true
    label: falls one short
  - args: [[3, 0, 0, 2, 0, 1]]
    expected: true
    hidden: true
    label: hop over a run of zeros
time_limit_ms: 4000
---
You stand on index `0` of an array `nums` of non-negative integers. The value `nums[i]` is the *maximum* distance you may jump forward from index `i`; you may also jump any shorter distance, including zero. Return `true` if you can reach the last index, and `false` otherwise.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 2, 0, 1, 3]` | `true` | `0 → 1 → 3 → 4`: from index 1 you can jump 2 and step over the zero |
| `nums = [3, 1, 0, 0, 2]` | `false` | Every path ends on index 2 or 3, both zeros; nothing reaches index 4 |
| `nums = [0]` | `true` | You start on the last index |

### Constraints

- `1 ≤ len(nums) ≤ 10⁴`
- `0 ≤ nums[i] ≤ 10⁵`

### Follow-up

The interviewer asks: "Now return the *minimum* number of jumps, given the end is always reachable." That is [Jump Game II](/practice/jump-game-ii). Then: "What if jumps may go backwards as well as forwards?"

## Solution

### The naive approach

Treat it as a graph search: from each index, try every jump length from 1 to `nums[i]`, recursively. Without memoisation that is exponential. With memoisation (or a bottom-up table `good[i]` = "can reach the end from `i`") it is `O(n · max(nums))`, which for `n = 10⁴` and jumps up to `10⁵` is too slow in the worst case, and `O(n²)` if you cap each scan at the array length.

### The insight

The question is only reachability, and reachability from the start has a very simple shape: **the set of reachable indices is always a prefix `[0, reach]`**. If you can reach index `j` you can reach every index before it, because the jump that lands on or past `j` could have stopped earlier. So you never need a set or a table; one integer, the furthest reachable index, captures everything.

Walk left to right. If index `i` is within `reach`, it is reachable, and it extends the prefix to `max(reach, i + nums[i])`. If `i > reach`, there is a gap nobody can cross, and the answer is `false`.

### The optimal approach

```python
def can_jump(nums: list[int]) -> bool:
    reach = 0
    last = len(nums) - 1
    for i, step in enumerate(nums):
        if i > reach:
            return False          # a gap: index i is unreachable
        reach = max(reach, i + step)
        if reach >= last:
            return True
    return True
```

Trace `[3, 1, 0, 0, 2]`: reach becomes 3 at `i = 0`, stays 3 through `i = 1..3` (`1 + 1`, `2 + 0`, `3 + 0` never exceed 3), and at `i = 4` we have `4 > 3`, so the answer is `false`.

Time `O(n)`, space `O(1)`.

A mirror-image version walks right to left, keeping `goal`, the leftmost index known to reach the end: if `i + nums[i] ≥ goal`, move `goal` to `i`. The answer is `goal == 0`. Both are correct; the forward version is usually easier to explain.

### Why greedy is safe here

A greedy algorithm needs an argument, not a feeling. The argument here is the prefix property above: because reachable indices form a contiguous prefix, the maximum reach *dominates* every other summary of the past. Any index some cleverer strategy could reach, the maximum-reach walk also reaches. There is no choice being made that could turn out wrong later, which is why no backtracking is needed.

### Common mistakes

- Greedily *jumping* the maximum distance from each index. On `[3, 1, 5, 0, 0, 0]`, jumping 3 from index 0 lands on a zero and gets stuck, while jumping 2 reaches the `5` and then the end. The greedy choice is "maximise reach over every index in range", not "take the longest hop", and the reach sweep considers every index in range for free.
- Forgetting the `i > reach` check and letting a later large value "rescue" an unreachable index.
- Returning `false` for `[0]`. You already stand on the last index.

### How to discuss it

Say the DP formulation first ("`good[i]` is true if any `j` in `i+1..i+nums[i]` is good; that is `O(n²)`"), then observe that reachable indices form a prefix, so the DP state collapses to one integer. Interviewers like hearing *why* greedy works, stated as that invariant. For the minimum-jumps follow-up, the same reach idea becomes a BFS over "levels" of indices reachable in `k` jumps. If backward jumps are allowed, the prefix property breaks and you are doing genuine BFS on a graph with `n` nodes, `O(n + edges)`.

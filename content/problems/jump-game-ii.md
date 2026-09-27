---
slug: jump-game-ii
title: Jump Game II
difficulty: medium
patterns: [greedy]
lists: [ascend-150]
companies: [amazon, google, microsoft, apple]
order: 3
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "Think of it as BFS: the indices reachable with 0 jumps, then with 1 jump, then with 2. How are those groups shaped?"
  - "Each group is a contiguous window of indices. The next window ends at the furthest i + nums[i] over every index i in the current window."
  - "Sweep once, tracking the end of the current window and the furthest reach seen. When i reaches the end of the current window, you must take another jump, and the new window ends at the furthest reach. Stop before processing the last index."
signatures:
  python:
    name: min_jumps
    starter: |
      def min_jumps(nums: list[int]) -> int:
          pass
  javascript:
    name: min_jumps
    starter: |
      function min_jumps(nums) {
      }
tests:
  - args: [[1, 3, 1, 1, 2, 1]]
    expected: 3
  - args: [[0]]
    expected: 0
    label: already at the end
  - args: [[4, 1, 1, 1, 1]]
    expected: 1
    label: one jump covers everything
  - args: [[1, 1, 1, 1]]
    expected: 3
    label: forced single steps
  - args: [[2, 1, 3, 1, 1, 1, 2]]
    expected: 3
  - args: [[2, 1]]
    expected: 1
  - args: [[5, 9, 3, 2, 1, 0, 2, 3, 3, 1, 0, 0]]
    expected: 3
    hidden: true
    label: the best first hop is not the longest
  - args: [[3, 2, 1, 1, 1]]
    expected: 2
    hidden: true
  - args: [[2, 3, 0, 1, 4, 0, 0, 1]]
    expected: 3
    hidden: true
time_limit_ms: 4000
---
You start at index `0` of an array `nums` of non-negative integers, where `nums[i]` is the longest forward jump allowed from index `i` (any shorter jump is also allowed). Return the minimum number of jumps needed to reach the last index. The inputs are chosen so that the last index is always reachable.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 3, 1, 1, 2, 1]` | `3` | `0 → 1 → 4 → 5`. After two jumps the furthest you can be is index 4, so two is not enough |
| `nums = [4, 1, 1, 1, 1]` | `1` | Jump straight from index 0 to index 4 |
| `nums = [0]` | `0` | You are already on the last index |

### Constraints

- `1 ≤ len(nums) ≤ 10⁴`
- `0 ≤ nums[i] ≤ 1000`
- The last index is reachable.

### Follow-up

The interviewer asks: "Return the actual sequence of indices, not just the count." Then: "Now each jump has a cost equal to the value you land on, and you want the cheapest path. Does the greedy still work?"

## Solution

### The naive approach

Dynamic programming: `dp[i]` = fewest jumps to reach `i`. For each `i`, relax every `j` in `i+1..i+nums[i]` with `dp[j] = min(dp[j], dp[i] + 1)`. That is `O(n · max(nums))`, or `O(n²)`, and correct. It is a reasonable first answer, but it ignores the structure that makes the problem linear.

### The insight

Run BFS in your head. Level 0 is `{0}`. Level 1 is every index reachable from level 0 in one jump. Level 2 is everything newly reachable from level 1. The minimum number of jumps to reach the end is the level that contains it.

The key structural fact, inherited from [Jump Game](/practice/jump-game), is that **each level is a contiguous window of indices**. If level `k` is `[start, end]`, then level `k + 1` is `[end + 1, furthest]` where `furthest = max(i + nums[i] for i in [start, end])`. So BFS needs no queue: two integers describe each level.

### The optimal approach

Sweep `i` from left to right, maintaining:

- `window_end`: the last index reachable with the current number of jumps.
- `furthest`: the furthest index reachable with one more jump, from anything seen so far.

When `i` reaches `window_end`, every index at the current level has been examined, so commit to one more jump and move `window_end` to `furthest`.

```python
def min_jumps(nums: list[int]) -> int:
    jumps = 0
    window_end = 0
    furthest = 0
    # Never process the last index: arriving there needs no further jump.
    for i in range(len(nums) - 1):
        furthest = max(furthest, i + nums[i])
        if i == window_end:
            jumps += 1
            window_end = furthest
            if window_end >= len(nums) - 1:
                break
    return jumps
```

Trace `[1, 3, 1, 1, 2, 1]`:

| i | furthest | window_end before | action | jumps |
|---|---|---|---|---|
| 0 | 1 | 0 | end of level 0, jump | 1 (window 1) |
| 1 | 4 | 1 | end of level 1, jump | 2 (window 4) |
| 2 | 4 | 4 | | 2 |
| 3 | 4 | 4 | | 2 |
| 4 | 6 | 4 | end of level 2, jump | 3 (window 6) |

Time `O(n)`, space `O(1)`.

### Why this is greedy and why it is correct

The greedy choice is "within the current level, the next level extends as far as any index in it can reach". It is correct because it is exactly BFS, just with levels represented as intervals; BFS finds shortest paths in unweighted graphs. Note what the algorithm does *not* do: it does not pick the index with the biggest `nums[i]`, nor the longest hop. In `[5, 9, 3, 2, 1, 0, 2, 3, 3, 1, 0, 0]` the longest first hop (to index 5) lands on a zero; the right first hop is to index 1, because from there you reach index 10.

### Common mistakes

- Looping over the last index too. If `window_end` happens to equal `len(nums) - 1`, the loop would count one extra jump. `range(len(nums) - 1)` prevents that; so does `[0]` returning `0`.
- Jumping to the index with the largest *value* rather than the largest *reach* (`i + nums[i]`).
- Mixing up the two counters: incrementing `jumps` whenever `furthest` grows rather than when the current window is exhausted.

### How to discuss it

Frame it as BFS first: "the answer is the BFS level of the last index". Then point out the levels are intervals, so the queue collapses to two integers. That framing makes the correctness argument trivial and shows you know *why* the greedy works. For reconstructing the path, record, for each level, which index produced `furthest`; walking those choices backwards gives a valid sequence. For weighted jumps the interval structure no longer gives the answer, because a longer path can be cheaper; you are back to shortest paths with Dijkstra (or a monotonic-deque DP when the jump range is a sliding window), which is the kind of "the greedy breaks here" awareness the follow-up is probing for.

---
slug: time-based-kv
title: Time-Based Key-Value Store
difficulty: medium
patterns: [binary-search]
lists: [ascend-150]
companies: [google, amazon, netflix, lyft]
order: 6
lesson: interview-patterns/array-patterns/binary-search
hints:
  - Each key has its own history. Because timestamps for a key only ever increase, that history is a sorted list without any sorting work.
  - A `get` asks for the last entry whose timestamp is at most `t`. That is "rightmost element ≤ t" in a sorted list, which is a binary search (`bisect_right` in Python).
  - Store timestamps and values in two parallel lists per key so you can bisect the timestamps directly without a key function.
signatures:
  python:
    name: TimeMap
    starter: |
      class TimeMap:
          def __init__(self):
              pass

          def set(self, key: str, value: str, timestamp: int) -> None:
              pass

          def get(self, key: str, timestamp: int) -> str:
              pass
  javascript:
    name: TimeMap
    starter: |
      class TimeMap {
        constructor() {
        }
        set(key, value, timestamp) {
        }
        get(key, timestamp) {
        }
      }
tests:
  - args: [["set", "foo", "bar", 1], ["get", "foo", 1], ["get", "foo", 3], ["set", "foo", "bar2", 4], ["get", "foo", 4], ["get", "foo", 5]]
    expected: [null, "bar", "bar", null, "bar2", "bar2"]
  - args: [["get", "missing", 5]]
    expected: [""]
    label: unknown key
  - args: [["set", "k", "v1", 10], ["get", "k", 5]]
    expected: [null, ""]
    label: query before the first write
  - args: [["set", "a", "x", 1], ["set", "a", "y", 2], ["set", "a", "z", 3], ["get", "a", 2], ["get", "a", 3], ["get", "a", 100]]
    expected: [null, null, null, "y", "z", "z"]
  - args: [["set", "a", "1", 1], ["set", "b", "2", 2], ["get", "a", 2], ["get", "b", 1]]
    expected: [null, null, "1", ""]
    hidden: true
    label: keys are independent
  - args: [["set", "q", "alpha", 5], ["set", "q", "beta", 10], ["set", "q", "gamma", 15], ["get", "q", 4], ["get", "q", 5], ["get", "q", 9], ["get", "q", 10], ["get", "q", 14], ["get", "q", 15], ["get", "q", 16]]
    expected: [null, null, null, "", "alpha", "alpha", "beta", "beta", "gamma", "gamma"]
    hidden: true
    label: every boundary around three versions
  - args: [["set", "x", "a", 1], ["get", "x", 0], ["get", "x", 1]]
    expected: [null, "", "a"]
time_limit_ms: 4000
---
Design a key-value store that keeps the full history of each key. Implement a class `TimeMap` with:

- `set(key, value, timestamp)` — record that `key` had `value` as of time `timestamp`.
- `get(key, timestamp)` — return the value that `key` had at time `timestamp`: that is, the value from the `set` call with the largest timestamp `≤ timestamp`. If there is no such call (unknown key, or every write for the key is later than `timestamp`), return the empty string `""`.

All `set` calls for a given key arrive with strictly increasing timestamps. Timestamps are positive integers.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for `set`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `set("foo", "bar", 1), get("foo", 1), get("foo", 3)` | `null, "bar", "bar"` | At time 3 the latest write at or before 3 is still the one at time 1 |
| `set("foo", "bar2", 4), get("foo", 4), get("foo", 5)` (continuing) | `null, "bar2", "bar2"` | The write at 4 now shadows the earlier one |
| `set("k", "v1", 10), get("k", 5)` | `null, ""` | Nothing had been written yet at time 5 |

### Constraints

- Keys and values have length `1..100`
- `1 ≤ timestamp ≤ 10⁷`
- At most `2 × 10⁵` calls in total

### Follow-up

The interviewer asks: "Timestamps are no longer guaranteed to arrive in order. What changes, and what does each operation cost now?" Then: "How would you bound memory if a hot key is written a million times an hour?"

## Solution

### The naive approach

Store a list of `(timestamp, value)` per key and scan it on every `get` for the largest timestamp `≤ t`. `set` is `O(1)`, `get` is `O(k)` where `k` is the number of versions of that key. With `10⁵` writes to one key and `10⁵` reads, that is `10¹⁰` steps.

### The insight

The problem hands you a sorted list for free: per key, timestamps only increase, so appending keeps each key's history sorted with zero work. A `get` then asks for the rightmost timestamp `≤ t`, which is one binary search. This is the *rightmost true* form: the predicate "timestamp ≤ t" is true for a prefix of the list, and you want the last true.

### The optimal approach

Two parallel lists per key: timestamps and values. `bisect_right(times, t)` returns the number of timestamps `≤ t`, so the answer index is one less than that; zero means no write is early enough.

```python
import bisect
from collections import defaultdict


class TimeMap:
    def __init__(self):
        self.times: dict[str, list[int]] = defaultdict(list)
        self.values: dict[str, list[str]] = defaultdict(list)

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.times[key].append(timestamp)
        self.values[key].append(value)

    def get(self, key: str, timestamp: int) -> str:
        if key not in self.times:
            return ""
        times = self.times[key]
        i = bisect.bisect_right(times, timestamp)
        return self.values[key][i - 1] if i > 0 else ""
```

`set` is amortised `O(1)`; `get` is `O(log k)`. Space is `O(total writes)`.

If you write the search by hand, this is the template that finds the rightmost index with `times[i] <= t`:

```python
def rightmost_le(times: list[int], t: int) -> int:
    lo, hi = 0, len(times) - 1
    answer = -1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if times[mid] <= t:
            answer = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return answer
```

Trace the `"q"` example with `times = [5, 10, 15]`, `get(9)`: `mid = 1 → 10 > 9`, `hi = 0`. `mid = 0 → 5 ≤ 9`, `answer = 0`, `lo = 1`. Done: index 0, `"alpha"`.

### Common mistakes

- Using `bisect_left`, which for a timestamp that exactly matches a write returns the index *of* that write, so `i - 1` gives the previous version. The equality case must be included, hence `bisect_right`.
- Storing a list of tuples and bisecting with a `(timestamp, "")` key; it works only by accident of string ordering and is a bug waiting for the day values are compared. Parallel lists or a `key=` function are explicit.
- Returning `None` instead of `""` for a miss.

### How to discuss it

Name the structure ("map from key to an append-only sorted log") and the search ("rightmost timestamp at most `t`"), then say the costs. For out-of-order timestamps, appending breaks sortedness: either insert with `bisect.insort` at `O(k)` per write (fine if reads dominate), or use a balanced tree or skip list for `O(log k)` on both sides; in Python `sortedcontainers.SortedList` is the practical answer, and in a real system this is exactly what an LSM tree's memtable does. For the memory follow-up, say the real system's answer: retention (drop versions older than a window), compaction (collapse consecutive identical values), and moving cold history to disk with an index in memory. This structure is a toy version of MVCC; the lesson on [Binary search](/learn/interview-patterns/array-patterns/binary-search) covers the template, and [Min Stack](/practice/min-stack) is the other class-design problem in this set.

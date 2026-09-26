---
slug: find-median-data-stream
title: Find Median from Data Stream
difficulty: hard
patterns: [two-heaps]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, netflix]
order: 1
lesson: interview-patterns/sequence-patterns/two-heaps
hints:
  - "The median splits the data into a lower half and an upper half. You only ever need the largest of the lower half and the smallest of the upper half."
  - "Keep the lower half in a max-heap and the upper half in a min-heap, with sizes equal or the lower one larger by one. The median is then one root or the mean of both."
  - "To insert, push onto the lower heap, move its root to the upper heap, and if the upper heap is now larger move its root back. That three-step dance keeps both the ordering and the size invariant."
signatures:
  python:
    name: MedianFinder
    starter: |
      class MedianFinder:
          def __init__(self):
              pass

          def add_num(self, num: int) -> None:
              pass

          def find_median(self) -> float:
              pass
  javascript:
    name: MedianFinder
    starter: |
      class MinHeap {
        constructor(compare = (a, b) => a - b) { this.a = []; this.cmp = compare; }
        size() { return this.a.length; }
        peek() { return this.a[0]; }
        push(x) {
          const a = this.a; a.push(x);
          let i = a.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.cmp(a[i], a[p]) >= 0) break;
            [a[i], a[p]] = [a[p], a[i]]; i = p;
          }
        }
        pop() {
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
              const l = 2 * i + 1, r = l + 1; let m = i;
              if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
              if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
              if (m === i) break;
              [a[i], a[m]] = [a[m], a[i]]; i = m;
            }
          }
          return top;
        }
      }

      class MedianFinder {
        constructor() {
        }
        add_num(num) {
        }
        find_median() {
        }
      }
tests:
  - args: [["add_num", 1], ["add_num", 2], ["find_median"], ["add_num", 3], ["find_median"]]
    expected: [null, null, 1.5, null, 2.0]
  - args: [["add_num", 5], ["find_median"]]
    expected: [null, 5.0]
    label: single value
  - args: [["add_num", -1], ["add_num", -2], ["add_num", -3], ["add_num", -4], ["find_median"], ["add_num", -5], ["find_median"]]
    expected: [null, null, null, null, -2.5, null, -3.0]
    label: descending negatives
  - args: [["add_num", 2], ["add_num", 2], ["add_num", 2], ["find_median"], ["add_num", 3], ["find_median"]]
    expected: [null, null, null, 2.0, null, 2.0]
    label: duplicates
  - args: [["add_num", 6], ["add_num", 10], ["add_num", 2], ["add_num", 6], ["find_median"], ["add_num", 5], ["find_median"]]
    expected: [null, null, null, null, 6.0, null, 6.0]
  - args: [["add_num", 10], ["find_median"], ["add_num", 1], ["find_median"], ["add_num", 5], ["find_median"], ["add_num", 7], ["find_median"], ["add_num", 3], ["find_median"]]
    expected: [null, 10.0, null, 5.5, null, 5.0, null, 6.0, null, 5.0]
    hidden: true
    label: median after every insert
  - args: [["add_num", 0], ["add_num", 1000000], ["find_median"], ["add_num", 3], ["find_median"]]
    expected: [null, null, 500000.0, null, 3.0]
    hidden: true
  - args: [["add_num", 9], ["add_num", 8], ["add_num", 7], ["add_num", 6], ["find_median"], ["add_num", 5], ["find_median"]]
    expected: [null, null, null, null, 7.5, null, 7.0]
    hidden: true
time_limit_ms: 4000
---
Design a structure that accepts integers one at a time and can report the median of everything received so far. The median of an odd count is the middle value in sorted order; of an even count, the mean of the two middle values. Implement `MedianFinder` with:

- `add_num(num)` — add one integer.
- `find_median()` — return the current median as a float. Only called after at least one `add_num`.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for `add_num`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `add_num(1), add_num(2), find_median()` | `null, null, 1.5` | Two values: `(1 + 2) / 2` |
| `add_num(3), find_median()` (continuing) | `null, 2.0` | Sorted `1, 2, 3`, middle is `2` |
| `add_num(2), add_num(2), add_num(2), find_median()` | `null, null, null, 2.0` | Duplicates are ordinary values |

### Constraints

- `-10⁵ ≤ num ≤ 10⁵`
- At most `5 × 10⁴` calls to `add_num`; `find_median` may be called after every one

### Follow-up

The interviewer asks: "All numbers are in `[0, 100]`. Can you beat `O(log n)` per insert?" Then: "99% of the numbers are in `[0, 100]`; the rest are arbitrary. Now what?"

## Solution

### The naive approach

Append to a list; on `find_median` sort and index the middle. `O(1)` insert, `O(n log n)` query, so a stream that queries after every insert costs `O(n² log n)`. Keeping the list sorted with `bisect.insort` makes the query `O(1)` but the insert `O(n)` because the list shifts. Both are honest answers to give in the first minute.

### The insight

The median only cares about the boundary between the lower half and the upper half of the data. Nothing inside either half matters until it reaches the boundary. So keep the lower half in a structure that can hand you its *maximum* and the upper half in one that can hand you its *minimum*: a max-heap and a min-heap. Insert into one, rebalance sizes with at most one move across the boundary, and the median is read off the two roots.

### The optimal approach

Invariants: every element of `low` ≤ every element of `high`, and `len(low)` is `len(high)` or `len(high) + 1`. The insert pushes into `low`, moves `low`'s maximum into `high` (which guarantees ordering), then moves `high`'s minimum back if `high` has become larger (which restores the size rule).

```python
class MedianFinder:
    def __init__(self):
        self.low: list[int] = []   # max-heap via negation
        self.high: list[int] = []  # min-heap

    def add_num(self, num: int) -> None:
        heapq.heappush(self.low, -num)
        heapq.heappush(self.high, -heapq.heappop(self.low))
        if len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def find_median(self) -> float:
        if len(self.low) > len(self.high):
            return float(-self.low[0])
        return (-self.low[0] + self.high[0]) / 2
```

Trace `add 1, add 2, add 3`: after 1, `low = [1]`. Adding 2: push → `low = [2, 1]`, pop max 2 into `high = [2]`, sizes equal. Median `1.5`. Adding 3: push → `low = [1, 3]`… pop max 3 into `high = [2, 3]`, now `high` is larger so move 2 back: `low = [1, 2]`, `high = [3]`. Median `2`.

`add_num` is `O(log n)` (three heap operations); `find_median` is `O(1)`. Space `O(n)`.

### Common mistakes

- Choosing the heap by comparing with only one root and then forgetting to rebalance sizes, or rebalancing sizes without maintaining the ordering invariant. The push-pop-push sequence does both unconditionally, which is why it is the version to memorise.
- Returning an integer for the odd case in a language where the caller expects a float; the tests compare `2` and `2.0` as equal, but an API should be consistent.
- Negating on push and forgetting to negate on pop.

### How to discuss it

Say the invariants before writing code, then explain the three-step insert as "guarantee order, then fix size". For the bounded-range follow-up, a counting array of 101 buckets gives `O(1)` insert and `O(100)` median by walking the counts, which beats the heap for large `n`. For the 99% follow-up, combine them: the counting array for `[0, 100]` plus two small heaps (or sorted containers) for the outliers on each side, and a median query walks the buckets while accounting for how many outliers sit below the range. Recognising that the data distribution, not the API, decides the structure is what makes this a senior answer.

---
slug: last-stone-weight
title: Last Stone Weight
difficulty: easy
patterns: [heap]
lists: [ascend-150]
companies: [amazon, google, bloomberg]
order: 2
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "Each round needs the two heaviest stones and may produce a new one. Which structure gives you the maximum repeatedly while also accepting inserts?"
  - "A max-heap. Pop twice, push the difference if it is positive, repeat while at least two stones remain. Python only has a min-heap, so negate the weights."
  - "Handle the case where the heap ends up empty (everything cancelled) versus one stone left."
signatures:
  python:
    name: last_stone_weight
    starter: |
      def last_stone_weight(stones: list[int]) -> int:
          pass
  javascript:
    name: last_stone_weight
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

      function last_stone_weight(stones) {
      }
tests:
  - args: [[2, 7, 4, 1, 8, 1]]
    expected: 1
  - args: [[1]]
    expected: 1
    label: single stone
  - args: [[3, 3]]
    expected: 0
    label: two equal stones cancel
  - args: [[5, 5, 5]]
    expected: 5
  - args: [[9, 3, 2, 10]]
    expected: 0
  - args: [[4, 4, 4, 4]]
    expected: 0
  - args: [[1, 3]]
    expected: 2
    hidden: true
  - args: [[6, 2, 7, 1, 9]]
    expected: 1
    hidden: true
  - args: [[100, 1, 1, 1]]
    expected: 97
    hidden: true
    label: one heavy stone is worn down
time_limit_ms: 4000
---
You have a pile of stones with positive integer weights. Repeatedly take the two heaviest stones, of weights `x ≤ y`, and smash them together: if `x == y` both are destroyed; otherwise the lighter one is destroyed and the heavier one is replaced by a stone of weight `y - x`. Stop when at most one stone remains and return its weight, or `0` if none remain.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 7, 4, 1, 8, 1]` | `1` | `8,7 → 1`; `4,2 → 2`; `2,1 → 1`; `1,1 → 0`; one stone of weight 1 is left |
| `[3, 3]` | `0` | Equal stones destroy each other |
| `[100, 1, 1, 1]` | `97` | The heavy stone loses 1 three times |

### Constraints

- `1 ≤ len(stones) ≤ 30`
- `1 ≤ stones[i] ≤ 1000`

### Follow-up

The interviewer asks: "With 30 stones this is trivial. Suppose there are ten million and they arrive over a network. What is your memory and time?" Then: "Now change the rule: *you choose* which two stones to smash, and want the smallest possible final weight. Is the greedy still right?"

## Solution

### The naive approach

Sort the list, take the last two, push back the difference, sort again. Each round is `O(n log n)` and there are up to `n - 1` rounds, giving `O(n² log n)`. For `n = 30` it is fine, and saying so is honest; but it does not demonstrate that you recognise the shape of the problem.

### The insight

The rule only ever touches the two largest values, and the pile changes by at most one element per round. "Repeatedly extract the maximum, occasionally insert" is the exact contract of a priority queue. A max-heap gives `O(log n)` for both operations and no re-sorting.

### The optimal approach

Python's `heapq` is a min-heap, so store negated weights: the smallest negative is the largest stone.

```python
def last_stone_weight(stones: list[int]) -> int:
    heap = [-s for s in stones]
    heapq.heapify(heap)
    while len(heap) > 1:
        y = -heapq.heappop(heap)
        x = -heapq.heappop(heap)
        if y != x:
            heapq.heappush(heap, -(y - x))
    return -heap[0] if heap else 0
```

`heapify` is `O(n)`; each of at most `n - 1` rounds does two pops and at most one push, `O(log n)` each, so the total is `O(n log n)`. Space is `O(n)` for the heap.

### Common mistakes

- Pushing `0` back into the heap when stones cancel; it is harmless for the answer but pointless, and in the "choose the pairs" variant it hides a bug.
- Forgetting that the loop must stop at *one* stone, not zero, and then indexing an empty heap.
- Negating on push but not on pop, or vice versa.

### How to discuss it

Name the pattern: "repeated extract-max with inserts is a heap; `O(n log n)` total, `O(n)` space." For the streaming follow-up, note that the smash rule needs the global maximum, so you cannot process stones before they have all arrived, but a heap still bounds work to `O(log n)` per stone; a counting array works when weights are small integers (`≤ 1000`) and turns the whole thing into `O(n + max_weight)`. For the "you choose" variant, the greedy is *not* optimal: the problem becomes partitioning the stones into two groups with the closest sums, which is the subset-sum DP. Recognising that a one-word rule change moves the problem from greedy to DP is exactly what the interviewer is probing.

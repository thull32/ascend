---
slug: top-k-elements
title: "Top-k elements: the size-k heap and the greedy scheduler"
description: Recognise "k largest", "k closest", "most frequent" and "repeatedly take the biggest" problems, and solve them with a bounded heap in O(n log k) instead of a sort.
minutes: 32
difficulty: medium
tags: [heap, priority-queue, top-k, greedy, pattern:heap]
problems: [kth-largest-array, k-closest-points, kth-largest-stream, last-stone-weight, top-k-frequent, task-scheduler, reorganize-string, design-twitter]
---
You have a million log lines and need the ten slowest requests. You have a stream of scores and need the current third-highest at any moment. You have a set of tasks with cooldowns and must always run the one with the most work remaining. Every one of these asks the same question repeatedly: *what is the largest (or smallest) thing I have not dealt with yet?*

Sorting answers that question for every element at once, at a cost of `O(n log n)` and a full copy of the data. A heap answers it for the one element you need next, at a cost of `O(log n)` per answer, and it keeps answering as new data arrives. When `k` is much smaller than `n`, or when the data is a stream you cannot sort, the heap is the pattern.

## The signal

Reach for a heap when the statement contains any of these:

- **"k largest", "k smallest", "k closest", "k most frequent"**, with `k` given as a parameter and usually much smaller than `n`. The size-k heap is the answer.
- **"kth largest"** on its own. Same structure; you return the root instead of the contents.
- **A stream**: "numbers arrive one at a time", "design a class with `add(x)` that returns the kth largest so far". You cannot sort what has not arrived; a heap keeps the answer current after every insert.
- **"Repeatedly take the largest two and combine them"** ([Last Stone Weight](/practice/last-stone-weight)), or **"always schedule the most frequent remaining task"** ([Task Scheduler](/practice/task-scheduler), [Reorganize String](/practice/reorganize-string)). This is the heap as a greedy engine: the heap picks the best candidate, you act on it, and you push it back with an updated priority.
- **"Merge feeds by recency"** ([Design Twitter](/practice/design-twitter)): the ten newest posts across a user's followees is top-k by timestamp over k sorted sources, which is the [k-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) special case.

What rules it out:

- **You need every element in order.** Then sort; the heap version is `O(n log n)` too and slower in practice.
- **`k` is close to `n`.** `O(n log k)` becomes `O(n log n)` and a sort wins on constants.
- **A one-shot "kth" on an array that you may rearrange.** Quickselect does it in `O(n)` average with no extra memory (see [Selection and order statistics](/learn/algorithms/sorting-searching/selection-and-order-statistics)). The heap still wins if the input is read-only or streamed.
- **Counts are the only thing that matters and the value range is small.** Bucket by frequency in `O(n)` ([Top K Frequent](/practice/top-k-frequent)); the heap is the fallback when the range is unbounded.

The confusable pattern is [two heaps](/learn/interview-patterns/sequence-patterns/two-heaps). One heap answers "what is the best?"; two heaps answer "where is the middle?". If the word *median* or *balance* appears, you need the other lesson.

## The template

The core trick is counter-intuitive the first time: to keep the **k largest** elements you use a **min**-heap. The heap holds the k best candidates seen so far, and its root is the *weakest* of them. A new element competes only with the root: if it beats the root, the root is evicted and the new element joins; if not, it cannot be in the top k and is discarded. The invariant after every element is "the heap contains exactly the k largest elements seen so far, and its root is the kth largest".

```python
import heapq

def k_largest(nums, k):
    heap = []                        # min-heap of at most k elements
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:            # beats the weakest of the current top k
            heapq.heapreplace(heap, x)   # pop root, push x, one sift
    return heap                      # any order; heap[0] is the kth largest
```

`heapreplace` pops and pushes in a single sift-down, which is the cheapest way to swap one element. `heappushpop` is the mirror image (push first, then pop) and is the right call when the heap might be below capacity.

For **k smallest**, flip the comparison, which in Python means negating the values because `heapq` is min-only:

```python
def k_smallest(nums, k):
    heap = []                        # max-heap via negation
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, -x)
        elif -x > heap[0]:           # x is smaller than the current largest kept
            heapq.heapreplace(heap, -x)
    return [-v for v in heap]
```

JavaScript has no heap in the standard library. In an interview, say "I'll assume a `MinHeap` with `push`, `pop`, `peek`, `size`" and write the pattern; if the interviewer wants the heap too, this is the smallest correct one:

```javascript
class MinHeap {
  constructor(cmp = (a, b) => a - b) { this.a = []; this.cmp = cmp; }
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
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

function kLargest(nums, k) {
  const heap = new MinHeap();
  for (const x of nums) {
    if (heap.size() < k) heap.push(x);
    else if (x > heap.peek()) { heap.pop(); heap.push(x); }
  }
  return heap.a;
}
```

The comparator makes the same class serve as a max-heap (`(a, b) => b - a`) or a heap of objects (`(a, b) => a.dist - b.dist`), which is what the traces below need.

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4], "k": 2, "kind": "min", "title": "Size-2 min-heap keeping the 2 largest", "caption": "Each new value competes only with the root; the root is always the kth largest seen so far."}
```

The second template is the heap as a scheduler. Pop the highest-priority item, act on it, and push it back with a reduced priority unless it is exhausted:

```python
def schedule(counts):
    heap = [(-c, item) for item, c in counts.items()]
    heapq.heapify(heap)              # O(n), not O(n log n)
    while heap:
        c, item = heapq.heappop(heap)
        emit(item)
        if c + 1 < 0:                # c is negative; c + 1 is "one fewer remaining"
            heapq.heappush(heap, (c + 1, item))
```

`heapify` on an existing list is `O(n)`; pushing the same elements one at a time is `O(n log n)`. Interviewers notice which one you use. See [Binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics) for why heapify is linear.

## Worked problems

### Kth largest element in an array

[Kth Largest Element in an Array](/practice/kth-largest-array): return the kth largest value in an unsorted array, where "kth largest" counts duplicates (`[3, 3, 3]`, `k = 2` is `3`).

Insight: you do not need the k largest in order, only the smallest of them. The size-k min-heap keeps exactly those and its root is the answer.

Trace on `nums = [3, 2, 1, 5, 6, 4]`, `k = 2`:

| Step | x | Heap before | Root | Action | Heap after |
|---|---|---|---|---|---|
| 1 | 3 | `[]` | – | size < k, push | `[3]` |
| 2 | 2 | `[3]` | 3 | size < k, push | `[2, 3]` |
| 3 | 1 | `[2, 3]` | 2 | 1 > 2? no, discard | `[2, 3]` |
| 4 | 5 | `[2, 3]` | 2 | 5 > 2, replace root | `[3, 5]` |
| 5 | 6 | `[3, 5]` | 3 | 6 > 3, replace root | `[5, 6]` |
| 6 | 4 | `[5, 6]` | 5 | 4 > 5? no, discard | `[5, 6]` |

Answer: root `5`. Sorted, the array is `[1, 2, 3, 4, 5, 6]` and the second largest is indeed 5.

Complexity: `O(n log k)` time, `O(k)` space. For `n = 10⁶`, `k = 10` that is about 3.3 million heap comparisons against 20 million for a full sort. Quickselect would average `O(n)` but needs the array to be mutable and has an `O(n²)` worst case unless you randomise the pivot; say all three and let the interviewer pick.

### K closest points to the origin

[K Closest Points to Origin](/practice/k-closest-points): given 2D points, return the k with the smallest Euclidean distance from `(0, 0)`.

Insight: you want the k *smallest* distances, so the bounded heap must evict the *largest* distance kept: a max-heap of size k. Compare squared distances; the square root is monotone and only costs time. Python gets a max-heap by pushing `(-d, point)`.

Trace on `points = [(1,3), (-2,2), (5,8), (0,1), (2,-2)]`, `k = 2`. Squared distances: 10, 8, 89, 1, 8.

| Step | Point | d² | Heap (as distances, max at root) | Action |
|---|---|---|---|---|
| 1 | (1,3) | 10 | `[10]` | push |
| 2 | (-2,2) | 8 | `[10, 8]` | push |
| 3 | (5,8) | 89 | `[10, 8]` | 89 < 10? no, discard |
| 4 | (0,1) | 1 | `[8, 1]` | 1 < 10, evict 10, push 1 |
| 5 | (2,-2) | 8 | `[8, 1]` | 8 < 8? no, discard |

Result: `(-2,2)` and `(0,1)`. The tie at step 5 shows a rule you should state aloud: with a strict comparison, an incoming element equal to the root does not replace it, which keeps the earlier one. Either choice is valid for this problem; be deliberate.

Complexity: `O(n log k)`. Sorting all points by distance is `O(n log n)` and simpler to write; for `k = 2` and a million points it does about ten times the work. A senior candidate also mentions quickselect on distance as the `O(n)` option and then says why the heap is the better default: no mutation, works on a stream, easy to reason about.

### Reorganize string

[Reorganize String](/practice/reorganize-string): rearrange the characters so that no two adjacent characters are equal, or return `""` if impossible.

Insight: the greedy that works is "always place the character with the most remaining copies, except the one you just placed". A max-heap of counts gives you the most frequent; holding back the previous character for one turn prevents adjacency. If the heap runs dry while a held-back character still has copies, no arrangement exists.

```python
def reorganize(s):
    heap = [(-c, ch) for ch, c in Counter(s).items()]
    heapq.heapify(heap)
    out, prev = [], None                    # prev = (count, ch) held back
    while heap:
        c, ch = heapq.heappop(heap)
        out.append(ch)
        if prev and prev[0] < 0:
            heapq.heappush(heap, prev)      # previous char is allowed again
        prev = (c + 1, ch)                  # one fewer copy of ch remains
    return "".join(out) if len(out) == len(s) else ""
```

Trace on `s = "aaabbc"`, counts `a:3, b:2, c:1`:

| Step | Heap (count, ch) | Pop | Output | Push back `prev` | New `prev` |
|---|---|---|---|---|---|
| 1 | `(-3,a) (-2,b) (-1,c)` | a | `a` | – | `(-2,a)` |
| 2 | `(-2,b) (-1,c)` | b | `ab` | `(-2,a)` | `(-1,b)` |
| 3 | `(-2,a) (-1,c)` | a | `aba` | `(-1,b)` | `(-1,a)` |
| 4 | `(-1,b) (-1,c)` | b | `abab` | `(-1,a)` | `(0,b)` |
| 5 | `(-1,a) (-1,c)` | a | `ababa` | – (count 0) | `(0,a)` |
| 6 | `(-1,c)` | c | `ababac` | – | `(0,c)` |

The heap is empty and the output has 6 characters, so `"ababac"` is returned. On `"aaab"` the loop produces `aba`, then the heap is empty while `prev = (-1, a)` still holds a copy; the length check fails and you return `""`. That check is the whole correctness argument: the greedy only fails when a single character exceeds `⌈n/2⌉`, and in that case the leftover copy is exactly what the length mismatch detects.

Complexity: `O(n log σ)` where `σ` is the alphabet size (26 here, so effectively `O(n)`), `O(σ)` space. [Task Scheduler](/practice/task-scheduler) is the same loop with a cooldown of `n` instead of 1 and a queue holding the cooling tasks with their release times.

## Variations

- **"Return them sorted."** Pop the size-k heap k times and reverse; that is `O(k log k)` on top of the scan, still cheaper than sorting `n`.
- **Streaming kth largest.** [Kth Largest Element in a Stream](/practice/kth-largest-stream) is the same size-k min-heap wrapped in a class: `add(x)` pushes, pops if the size exceeds k, and returns the root. Initialise with `heapify` on the seed array and trim to k.
- **Top k by frequency.** Count first ([Top K Frequent](/practice/top-k-frequent)), then run the size-k heap over `(count, value)` pairs; or, since counts are bounded by `n`, bucket them into an array indexed by count and walk down from `n`, which is `O(n)` and needs no heap. The [hash-map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns) lesson traces the bucket version.
- **Objects with ties.** Python compares tuples element-wise, so `(count, obj)` breaks when counts tie and `obj` is not comparable. Add a tiebreaker: `(count, index, obj)`. In JavaScript the comparator handles it directly.
- **Merging k sorted feeds** ([Design Twitter](/practice/design-twitter)): one heap entry per followee holding their newest unread post; pop the newest, push that followee's next post. That is k-way merge with a size-k heap, `O(k + 10 log k)` per feed request.
- **Decrease-key.** If priorities change for items already in the heap (Dijkstra, a task whose deadline moves), the binary heap has no cheap update. Push a fresh entry and skip stale ones on pop (lazy deletion), or use an indexed heap; see [Indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key).

## Pitfalls

- **Using a max-heap of all n elements and popping k times.** It works, but it is `O(n + k log n)` time and `O(n)` space. The point of the pattern is the `O(k)` heap; the interviewer is checking whether you know that.
- **Wrong heap direction.** k largest needs a *min*-heap; k smallest needs a *max*-heap. If you find yourself evicting the best element, you flipped it.
- **Forgetting that Python's heapq is a min-heap.** Negate numbers, or push `(-key, payload)`. Do not write a wrapper class with `__lt__` under time pressure unless the payload is genuinely incomparable.
- **Pushing before checking the size.** `push` then `pop` when the heap is full costs two sifts; `heapreplace` costs one. On a hot loop that is a measurable difference, and it also avoids the momentary `k + 1` element that some off-by-one bugs come from.
- **Comparing with `>=` instead of `>`.** Equal elements then evict each other on every tie, extra work with no change in the answer set, and it changes *which* of the tied elements you keep. Pick one and know why.
- **Recomputing the answer from scratch on every stream event.** A stream problem that sorts on every `add` is `O(n log n)` per call. The heap is `O(log k)`.
- **Scheduler loop that never terminates.** Every pushed-back entry must have a strictly smaller remaining count. The guard `if c + 1 < 0` (or `count > 0` in positive terms) is what ends the loop; drop it and the heap never empties.

## Exercise

```exercise
id: connect-ropes-min-cost
title: Minimum cost to connect ropes
prompt: |
  You have `lengths`, a list of rope lengths. Connecting two ropes of lengths
  `a` and `b` costs `a + b` and produces one rope of length `a + b`. Return
  the minimum total cost to connect all ropes into one. If there are zero or
  one ropes, the cost is 0.

  Aim for O(n log n) using a heap. The JavaScript starter includes a working
  `MinHeap`; Python can use `heapq`.
languages: [python, javascript]
entry: connect_ropes
starter:
  python: |
    import heapq

    def connect_ropes(lengths):
        # your code here
        return 0
  javascript: |
    class MinHeap {
      constructor() { this.a = []; }
      size() { return this.a.length; }
      push(x) {
        const a = this.a; a.push(x);
        let i = a.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (a[i] >= a[p]) break;
          [a[i], a[p]] = [a[p], a[i]]; i = p;
        }
      }
      pop() {
        const a = this.a, top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < a.length && a[l] < a[m]) m = l;
            if (r < a.length && a[r] < a[m]) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
          }
        }
        return top;
      }
    }

    function connect_ropes(lengths) {
      // your code here
      return 0;
    }
tests:
  - args: [[4, 3, 2, 6]]
    expected: 29
  - args: [[1, 2, 3, 4, 5]]
    expected: 33
  - args: [[5]]
    expected: 0
    label: single rope
  - args: [[]]
    expected: 0
    label: no ropes
  - args: [[10, 10]]
    expected: 20
  - args: [[8, 4, 6, 12]]
    expected: 58
    hidden: true
  - args: [[2, 2, 3, 3]]
    expected: 20
    hidden: true
hints:
  - "Always join the two shortest ropes first; a min-heap gives you those in O(log n)."
  - "Pop two, add their sum to the total, push the sum back. Stop when one rope remains."
  - "Build the heap with heapify (Python) or by pushing each length; both are fine here."
```

## Senior signals

- You say "size-k min-heap for the k largest" without hesitation and can explain why the root is the kth largest.
- You quote all three options for a one-shot kth element (sort `O(n log n)`, heap `O(n log k)`, quickselect `O(n)` average) and choose based on `k`, mutability and streaming.
- You use `heapify` for bulk construction and `heapreplace` for the swap, and you know they are `O(n)` and one sift respectively.
- You know Python's heap is min-only and that tuple ties need a tiebreaker; in JavaScript you state the heap interface and move on.
- You recognise the scheduler shape (pop, act, push back with reduced priority) and state its termination argument.
- When counts are bounded by `n` you bucket instead of heaping, and you can say why that is `O(n)`.

## Check yourself

```quiz
- q: >-
    You need the 5 largest values from a read-only stream of 10 million numbers. Which structure do you keep, and why?
  options: ["A max-heap of all numbers seen; pop 5 at the end", "A min-heap of size 5; the root is the weakest of the current top 5", "A sorted array of all numbers; take the last 5", "A max-heap of size 5; the root is the largest so far"]
  answer: 1
  explanation: >-
    The bounded min-heap holds the 5 best so far and evicts its weakest (the root) when a better value arrives, in O(log 5) per element with O(5) memory. A max-heap or sorted array of everything costs O(n) memory and, for the sorted array, O(n log n) time. A max-heap of size 5 would evict the best element, which is backwards.
- q: >-
    Building a heap from an existing list of n elements with heapify costs:
  options: ["O(n)", "O(n log n)", "O(log n)", "O(n²)"]
  answer: 0
  explanation: >-
    heapify sifts down from the last internal node; most nodes are near the leaves and sift only a step or two, and the sum of sift lengths is bounded by 2n. Pushing n elements one at a time is O(n log n).
- q: >-
    In Reorganize String, why is the character you just placed held back for one iteration instead of pushed straight back into the heap?
  options: ["To reduce the heap size", "So that its count decreases", "Because it would otherwise be popped again immediately whenever it is still the most frequent, producing two adjacent copies", "To make the algorithm O(n)"]
  answer: 2
  explanation: >-
    The greedy picks the most frequent remaining character; if that is the one just placed, popping it again puts two copies side by side. Holding it back for exactly one pop forces a different character in between.
- q: >-
    An array of 10⁶ elements is in memory and can be modified; you need the 500,000th largest element once. The best expected-time choice is:
  options: ["Size-k min-heap", "Full sort", "Quickselect with random pivot", "Bucket sort by value"]
  answer: 2
  explanation: >-
    With k ≈ n/2 the heap is O(n log n) with a large constant and no better than sorting. Quickselect averages O(n) and needs no extra memory when mutation is allowed. Bucket sort requires a bounded value range, which is not given.
- q: >-
    Your Python code pushes (count, item) tuples into heapq and crashes with TypeError when two counts are equal. What is wrong?
  options: ["heapq cannot store tuples", "Equal counts make Python compare the items, which are not orderable; add an orderable tiebreaker such as an index", "The heap needs to be a max-heap", "Counts must be negated before pushing"]
  answer: 1
  explanation: >-
    Tuple comparison is lexicographic: on a tie in the first field Python compares the second. If the payload has no ordering, insert an integer tiebreaker between the priority and the payload.
```

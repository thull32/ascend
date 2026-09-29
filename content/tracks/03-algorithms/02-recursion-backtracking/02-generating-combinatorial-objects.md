---
slug: generating-combinatorial-objects
title: "Generating subsets, permutations and combinations"
description: The choose/explore/unchoose template, the three enumeration shapes it produces, the one rule that removes duplicates, and why the output size, not the recursion, sets the complexity.
minutes: 45
difficulty: medium
tags: [backtracking, subsets, permutations, combinations, duplicates, pattern:backtracking]
problems: [subsets, subsets-ii, permutations, combination-sum, combination-sum-ii, letter-combinations]
---
You need every way of choosing some items from a set, every ordering of a list, every selection of exactly $k$ things, or every assignment of options to slots. Feature-flag combinations to test, seatings to evaluate, sums that reach a target, strings a phone keypad can spell. The count is exponential, so no clever data structure helps; the job is to *enumerate* every object exactly once, without duplicates and without missing any, in code you can write in five minutes under pressure.

There is one template for all of these. The differences between subsets, permutations and combinations are two lines each: what you are allowed to choose next, and when you record an answer.

## The template

Backtracking builds each object incrementally. A partial object (`path`) grows by one choice, recursion explores everything that can follow, and the choice is undone so the next choice can be tried from the same state.

```python
def backtrack(path, choices):
    if is_complete(path):
        output.append(path.copy())     # copy: path is mutated later
        return
    for choice in choices_available(path, choices):
        path.append(choice)            # choose
        backtrack(path, choices)       # explore
        path.pop()                     # unchoose
```

```javascript
function backtrack(path, choices) {
  if (isComplete(path)) { output.push([...path]); return; }
  for (const choice of choicesAvailable(path, choices)) {
    path.push(choice);
    backtrack(path, choices);
    path.pop();
  }
}
```

Three details that decide whether the code is right:

- **Copy on record.** `path` is one shared list mutated in place. If you `append(path)` you will end with `output` full of references to the same, now-empty, list. This is the most common bug in the whole pattern.
- **Undo exactly what you did.** One `append` before the call, one `pop` after. If choosing also flips a `used[i]` flag or removes from a set, unchoosing flips it back. Symmetry is the invariant.
- **The recursion tree is the output.** Each root-to-leaf path is one object. Complexity is (number of nodes in the tree) times (work per node), and the number of leaves is at least the number of objects, so the output size is a lower bound on the running time.

## Subsets: include or exclude

Every subset of $\{1, 2, 3\}$ is a sequence of $n$ binary decisions: include element 1 or not, then element 2 or not, and so on. Here is that tree with every node drawn; each level decides one element, and the eight leaves are the eight subsets.

```text
                         []                       decide on 1
               /                    \
           [1]                       []           decide on 2
         /      \                 /      \
     [1,2]      [1]            [2]        []      decide on 3
     /   \      /   \          /  \       /  \
[1,2,3] [1,2] [1,3] [1]    [2,3] [2]   [3]  []    8 leaves = 8 subsets
```

$1 + 2 + 4 + 8 = 15$ nodes, $2^3 = 8$ leaves, depth 3.

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3],
 "title": "Include/exclude tree: each leaf is one of the 8 subsets"}
```

The interview-standard version iterates over the *next start index* rather than making an explicit include/exclude branch. Every node of the tree is a subset (not only the leaves), so you record at every call, and the tree has exactly $2^n$ nodes.

```python
def subsets(nums):
    out = []
    def go(start, path):
        out.append(path.copy())                 # every prefix is a valid subset
        for i in range(start, len(nums)):
            path.append(nums[i])
            go(i + 1, path)                     # only later elements can follow
            path.pop()
    go(0, [])
    return out
```

The same eight subsets as a start-index tree, every node shown:

```text
go(0, [])                       record []
├── i=0  go(1, [1])             record [1]
│   ├── i=1  go(2, [1,2])       record [1,2]
│   │   └── i=2  go(3, [1,2,3]) record [1,2,3]
│   └── i=2  go(3, [1,3])       record [1,3]
├── i=1  go(2, [2])             record [2]
│   └── i=2  go(3, [2,3])       record [2,3]
└── i=2  go(3, [3])             record [3]
```

Eight nodes, eight subsets, each recorded once, in a fixed order. The `start` parameter is what prevents `[2, 1]` from appearing as well as `[1, 2]`: after choosing index `i`, only indices greater than `i` are available, so each subset is generated in one canonical order.

**Cost, with the lower bound.** There are $2^n$ subsets and their total length is $n \cdot 2^{n-1}$ (each element appears in half of them), so any algorithm that writes them all out does $\Theta(n \cdot 2^n)$ work; the recursion adds $2^n$ calls and $2^n$ copies of length up to $n$, which is the same bound. The recursion depth is only $n$. For $n = 20$ that is about $10^6$ subsets and $10^7$ integers of output, fine; for $n = 30$ it is $10^9$ subsets, not fine in any language.

The bitmask alternative iterates integers `0 .. 2^n - 1` and reads bit `j` as "element `j` is in". It is shorter, non-recursive, and the natural choice when $n \le 20$ and you want to index subsets by a number (see [Bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation)).

```python
def subsets_bits(nums):
    n = len(nums)
    return [[nums[j] for j in range(n) if mask >> j & 1] for mask in range(1 << n)]
```

## Why the start index is correct

The invariant, stated for the call `go(start, path)`: *`path` holds elements of `nums[:start]` in increasing index order, and this call records exactly the subsets whose intersection with `nums[:start]` is `path`, each once.*

- **Initially** `go(0, [])`: `nums[:0]` is empty, `path` is empty, and "subsets whose intersection with nothing is nothing" is every subset. So the root is responsible for all $2^n$ of them.
- **Preservation.** Split the subsets this call is responsible for by their smallest chosen index $\ge$ `start`: either there is none (the subset is `path` itself, which this call records), or it is some $i \ge$ `start`, and those subsets are exactly what `go(i + 1, path + [nums[i]])` is responsible for by the invariant applied to the child. The cases are disjoint and cover everything, so every subset is recorded once.
- **Read-off.** At the root the responsibility is all subsets, so `out` is all subsets, none twice.

Every variant below is the same argument with a different partition: permutations split by "which element goes next", combinations by the same smallest-index rule with a length cap, and the duplicate rule changes the partition from "smallest chosen index" to "smallest chosen *value*". [Recursion design](/learn/algorithms/recursion-backtracking/recursion-design) has the induction template this instantiates.

## Permutations: every element, every position

A permutation uses every element exactly once, so the choice at each level is "any element not yet used". The tree has depth $n$, branching $n$ then $n-1$ then $n-2$, and $n!$ leaves. For $[1, 2, 3]$, every node:

```text
[]
├── [1]
│   ├── [1,2] ── [1,2,3]
│   └── [1,3] ── [1,3,2]
├── [2]
│   ├── [2,1] ── [2,1,3]
│   └── [2,3] ── [2,3,1]
└── [3]
    ├── [3,1] ── [3,1,2]
    └── [3,2] ── [3,2,1]
```

$1 + 3 + 6 + 6 = 16$ nodes, $6$ leaves. In general the node count is $\sum_{k=0}^{n} n!/(n-k)! = n! \sum_{k} 1/k! < e \cdot n!$, so the internal nodes cost at most a constant factor over the leaves.

```viz
{"type": "recursion", "algorithm": "permutations", "values": [1, 2, 3],
 "title": "Branching shrinks by one per level: 3 × 2 × 1 = 6 leaves"}
```

Two implementations you should be able to write from memory.

**Used-array.** Keep a boolean per element. Produces permutations in lexicographic order of indices, and generalises to duplicates (below).

```python
def permutations(nums):
    out, n = [], len(nums)
    used = [False] * n
    def go(path):
        if len(path) == n:
            out.append(path.copy())
            return
        for i in range(n):
            if used[i]:
                continue
            used[i] = True;  path.append(nums[i])
            go(path)
            path.pop();      used[i] = False
    go([])
    return out
```

**Swap-based.** Fix position `k` by swapping each candidate into it, recurse on `k + 1`, swap back. No `used` array, no `path` list: the permutation is the array itself.

```javascript
function permutations(nums) {
  const out = [];
  function go(k) {
    if (k === nums.length) { out.push([...nums]); return; }
    for (let i = k; i < nums.length; i++) {
      [nums[k], nums[i]] = [nums[i], nums[k]];   // choose: put nums[i] at position k
      go(k + 1);
      [nums[k], nums[i]] = [nums[i], nums[k]];   // unchoose
    }
  }
  go(0);
  return out;
}
```

The swap version saves a constant factor and the `used` array; the used-array version keeps lexicographic order and is easier to extend. Both are $\Theta(n \cdot n!)$: $n!$ leaves, each copied at length $n$, and no algorithm that outputs every permutation can do less.

For scale: $10! \approx 3.6 \times 10^6$ permutations of length 10 is about 36 million integers of output, which is fine. $13! \approx 6.2 \times 10^9$ is not. When an interviewer gives you $n \le 10$ for a permutation problem they are telling you the intended solution is exhaustive.

## Combinations: exactly k, order irrelevant

Combinations are subsets of a fixed size. Same `start`-index trick as subsets, record only at depth $k$, and prune when the remaining elements cannot fill the path.

```viz
{"type": "recursion", "algorithm": "combinations", "n": 4, "k": 2,
 "title": "C(4,2) = 6 leaves; the start index keeps every pair in one order"}
```

```python
def combinations(n, k):
    out = []
    def go(start, path):
        if len(path) == k:
            out.append(path.copy())
            return
        # need k - len(path) more; the last usable start is n - (k - len(path)) + 1
        for i in range(start, n - (k - len(path)) + 2):
            path.append(i)
            go(i + 1, path)
            path.pop()
    go(1, [])
    return out
```

Without the pruned upper bound the code is still correct but slower: it walks into branches that can never reach length $k$. With $n = 20, k = 10$ the pruning cuts the internal nodes from 431,910 to 167,960, about 60% fewer. The count is $\binom{n}{k}$ leaves and $\Theta(k \binom{n}{k})$ output; [Counting and combinatorics](/learn/foundations/math-for-engineers/counting-and-combinatorics) has the numbers.

**Combination Sum** is combinations with a twist: elements are reusable and the stopping condition is a target rather than a length. The `start` trick still applies, but you recurse with `i` instead of `i + 1` to allow reuse, and you stop when the remaining target is below the smallest candidate.

```python
def combination_sum(candidates, target):
    candidates.sort()
    out = []
    def go(start, remaining, path):
        if remaining == 0:
            out.append(path.copy()); return
        for i in range(start, len(candidates)):
            if candidates[i] > remaining:
                break                          # sorted: nothing later fits either
            path.append(candidates[i])
            go(i, remaining - candidates[i], path)   # i, not i + 1: reuse allowed
            path.pop()
    go(0, target, [])
    return out
```

The `break` on a sorted array is the difference between "tries every candidate at every level" and "stops at the first that overshoots". It is the simplest example of pruning, the subject of the [next lesson](/learn/algorithms/recursion-backtracking/constraint-satisfaction).

## Duplicates: the skip-same-level rule

Input `[1, 2, 2]` has three subsets containing exactly one 2 if you treat the 2s as distinct, but the problem wants `[1, 2]` once. Deduplicating the output with a set of tuples works but costs the full duplicated enumeration first, and it is the answer interviewers accept from mid-level candidates while waiting for the real one.

The real one: **sort, then at each level of the tree, skip a value equal to the previous value you tried at that same level.**

```python
def subsets_with_dup(nums):
    nums.sort()
    out = []
    def go(start, path):
        out.append(path.copy())
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue                     # same value already tried at this level
            path.append(nums[i])
            go(i + 1, path)
            path.pop()
    go(0, [])
    return out
```

Trace with `[1, 2, 2]`, pruned branches marked:

```text
go(0, [])                         record []
├── i=0  go(1, [1])               record [1]
│   ├── i=1  go(2, [1,2])         record [1,2]
│   │   └── i=2  go(3, [1,2,2])   record [1,2,2]    i == start: allowed
│   └── i=2  PRUNED  i > start and nums[2] == nums[1]  (would be a copy of the i=1 subtree: [1,2])
├── i=1  go(2, [2])               record [2]
│   └── i=2  go(3, [2,2])         record [2,2]      i == start: allowed
└── i=2  PRUNED  i > start and nums[2] == nums[1]      (would be a copy of the i=1 subtree: [2], [2,2])
```

Six nodes instead of eight, six subsets, no set. Each pruned branch would have reproduced its left sibling's subtree exactly, because two sibling branches that start with the same value and have the same remaining elements available (the sort guarantees the second one sees a subset of what the first saw) generate the same objects. On `[1, 1, 1, 1, 1]` the unpruned tree has 32 nodes for 6 distinct subsets; the pruned tree has 6.

Why `i > start` and not `i > 0`: the condition must only fire for siblings. At `start = 1`, index 2 has the same value as index 1, and index 1 is a *sibling choice* at this level (both are "the next element after `1`"), so index 2 is skipped. But when we chose index 1 and recursed to `start = 2`, index 2 is the *first* choice of the new level; `i == start`, so it is allowed, and `[1, 2, 2]` is generated. The rule says "do not start two sibling branches with the same value"; it never blocks a value from following itself in a deeper branch. With `i > 0` the rule would also fire at `i == start`, and `[1, 2, 2]` and `[2, 2]` would vanish.

The same rule handles [Combination Sum II](/practice/combination-sum-ii) (skip at the same level, recurse on `i + 1`).

### Permutations with duplicates

For permutations the level is "the candidates for position `k`", and the sibling test uses the `used` array: skip `nums[i]` if it equals `nums[i-1]` and `nums[i-1]` is *not* currently used, meaning the earlier equal element was tried at this level and backtracked, rather than being an ancestor in the current path.

```python
def permute_unique(nums):
    nums.sort()
    out, n = [], len(nums)
    used = [False] * n
    def go(path):
        if len(path) == n:
            out.append(path.copy()); return
        for i in range(n):
            if used[i]:
                continue
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue
            used[i] = True;  path.append(nums[i])
            go(path)
            path.pop();      used[i] = False
    go([])
    return out
```

Trace on `[1, 1, 2]` (indices 0 and 1 hold the two 1s):

```text
go([])          used=[F,F,F]
├── i=0  [1]    used=[T,F,F]
│   ├── i=1  [1,1]        nums[1]==nums[0] but used[0] is True: an ancestor, allowed
│   │   └── i=2  [1,1,2]  recorded
│   └── i=2  [1,2]
│       └── i=1  [1,2,1]  recorded (used[0] is True, allowed)
├── i=1  PRUNED  nums[1]==nums[0] and not used[0]: index 0 was a sibling here
└── i=2  [2]
    ├── i=0  [2,1]
    │   └── i=1  [2,1,1]  recorded
    └── i=1  PRUNED  not used[0]
```

Nine nodes, three leaves, exactly `[1,1,2]`, `[1,2,1]`, `[2,1,1]`. Flip the condition to `used[i - 1]` and the same three permutations come out, but through twelve nodes: the flipped rule forbids a 1 from following an earlier 1 in the path, so `[1, 2, _]` reached through index 0 dead-ends, and the answers are found through the index-1 branch instead. On `[1, 1, 1, 1, 2, 2]` it is 55 nodes with `not used[i-1]`, 331 with `used[i-1]`, and 1,957 with no rule (and duplicates in the output). Keep `not used[i-1]`, and be ready to explain it, because interviewers ask.

## Products and mappings

[Letter Combinations of a Phone Number](/practice/letter-combinations) is a Cartesian product: for each digit choose one of its letters. The template applies with "choices at level `d`" being the letters of digit `d` and recording at depth `len(digits)`. Output size is $\prod |letters(d)|$, up to $4^n$. No start index is needed because positions are distinct by construction. Recognise the shape: when each *slot* has its own independent option list, it is a product; when you are choosing *from one pool*, it is subsets/combinations/permutations.

## Under the hood: itertools and next_permutation

**`itertools`.** `permutations`, `combinations` and `product` are C types in CPython. Each keeps a small array of *indices* into a tuple copy of the input and advances it like an odometer, yielding one tuple per `next()`. Nothing is materialised: `permutations(range(12))` costs a few hundred bytes until you iterate, and iterating it fully is $12!$ tuples of $12$ pointers. The order is lexicographic **by index position**, not by value: `permutations([3, 1, 2])` yields `(3, 1, 2)` first and `(1, 3, 2)` third. There is no deduplication: `permutations([1, 1])` yields `(1, 1)` twice.

`permutations` keeps two arrays, `indices` (a permutation of `0..n-1`) and `cycles` (a countdown per output position). To advance, it scans positions from the right; at position `i` it decrements `cycles[i]`; if that hits zero it rotates `indices[i:]` left by one and resets `cycles[i]`, moving on to `i - 1`; otherwise it swaps `indices[i]` with `indices[-cycles[i]]` and yields. For `[1, 2, 3]`:

| yield | `indices` | `cycles` | what happened |
|---|---|---|---|
| `(1, 2, 3)` | `[0, 1, 2]` | `[3, 2, 1]` | initial state |
| `(1, 3, 2)` | `[0, 2, 1]` | `[3, 1, 1]` | `i=1`: cycles[1] 2 to 1, swap indices[1] with indices[-1] |
| `(2, 1, 3)` | `[1, 0, 2]` | `[2, 2, 1]` | `i=2` and `i=1` hit zero and rotate; `i=0`: 3 to 2, swap with indices[-2] |
| `(2, 3, 1)` | `[1, 2, 0]` | `[2, 1, 1]` | `i=1`: swap with indices[-1] |
| `(3, 1, 2)` | `[2, 0, 1]` | `[1, 2, 1]` | rotations, then `i=0`: 2 to 1, swap with indices[-1] |
| `(3, 2, 1)` | `[2, 1, 0]` | `[1, 1, 1]` | `i=1`: swap with indices[-1] |

`combinations(n, k)` keeps `k` increasing indices and, to advance, finds the rightmost index that can still move right, increments it, and resets the ones after it to consecutive values. `product` is a plain odometer over the pools, rightmost pool fastest.

**`std::next_permutation`.** C++ rewrites the array in place to the next permutation in lexicographic order, using the algorithm attributed to Narayana Pandita (14th century): find the longest non-increasing suffix; the element before it is the pivot; swap the pivot with the rightmost suffix element larger than it; reverse the suffix. Each step is $O(n)$ worst case and amortised $O(1)$ over a full run. Starting from `[1, 2, 3, 4]`:

| current | suffix | pivot | swap with | after swap | after reverse |
|---|---|---|---|---|---|
| `1 2 3 4` | `4` | `3` | `4` | `1 2 4 3` | `1 2 4 3` |
| `1 2 4 3` | `4 3` | `2` | `3` | `1 3 4 2` | `1 3 2 4` |
| `1 3 2 4` | `4` | `2` | `4` | `1 3 4 2` | `1 3 4 2` |
| `1 3 4 2` | `4 2` | `3` | `4` | `1 4 3 2` | `1 4 2 3` |
| `1 4 2 3` | `3` | `2` | `3` | `1 4 3 2` | `1 4 3 2` |

Because it works by value rather than by index, it skips duplicates for free: a sorted multiset run to exhaustion yields each distinct permutation once, which is the C++ answer to `permute_unique`.

**Heap's algorithm** generates each permutation from the previous by a single swap (for `[1, 2, 3]`: `123, 213, 312, 132, 231, 321`), which matters when the object being permuted is expensive to copy; the output is not lexicographic.

**Gray-code subsets.** Iterating masks as `mask ^ (mask >> 1)` for `mask` in `0..2^n - 1` visits every subset with consecutive subsets differing by one element: for $n = 3$ the order is `000, 001, 011, 010, 110, 111, 101, 100`. That lets you maintain a running sum or hash in $O(1)$ per subset, so enumerating all $2^n$ subset sums costs $\Theta(2^n)$ instead of $\Theta(n \cdot 2^n)$. [Meet in the middle](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation) leans on this.

## Choosing the shape

| You want | Choice at each level | Record when | Count | Guard |
|---|---|---|---|---|
| Subsets | next element from `start` onward | every node | $2^n$ | `start` index |
| Combinations of size k | next element from `start` onward | depth = k | $\binom{n}{k}$ | `start` + remaining-count prune |
| Permutations | any unused element | depth = n | $n!$ | `used` array or swap |
| Product of option lists | any option for slot d | depth = slots | $\prod k_i$ | none needed |
| Any of the above with duplicates | as above | as above | fewer | sort + skip-same-level |

Time is always $\Theta(\text{objects} \times \text{length})$ and interview inputs are sized so that this is tractable ($n \le 20$ for subsets, $n \le 10$ for permutations). If the constraint says $n = 10^5$, the problem is *not* asking you to enumerate; it is asking for a count or an optimum, which is dynamic programming.

## Four ways to enumerate

| Axis | Recursive template | Bitmask loop | `itertools` | `next_permutation` |
|---|---|---|---|---|
| Laziness | eager unless written as a generator | eager or lazy per mask | lazy, one tuple per `next()` | in place, one object at a time |
| Extra memory | $O(n)$ path plus stack | $O(1)$ beyond output | $O(n)$ index arrays | $O(1)$ |
| Order | index-lexicographic | numeric by mask | index-lexicographic | value-lexicographic |
| Duplicates | skip rule | none | none | free |
| Pruning | natural (return early) | none | none | none |
| Applies to | all shapes, with constraints | subsets, $n \le$ about 25 | subsets, permutations, products | permutations only |

Pick the template when there are constraints to prune on; pick bitmasks when subsets must be indexed by integer; pick `itertools` when there is nothing to prune and you want zero code; pick `next_permutation` in C++ when duplicates are present.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Output is $2^n$ copies of `[]` (or of the last object) | `out.append(path)` stored references to the one mutated list; every `pop` emptied all of them | `out.append(path.copy())` / `out.push([...path])` |
| Missing objects and objects that contain an element twice | A choose without a matching unchoose (`used[i]` never reset, `path.pop()` skipped on an early `return`) | Pair every mutation with its undo; avoid `return` between choose and unchoose, or use `try/finally` |
| Correct output but memory and time blow up on inputs with many duplicates | Deduplicating with a set of tuples: `[1] * 20` builds about a million tuples and hashes them to keep 21 | Sort and apply the skip-same-level rule; the pruned tree has 21 nodes |
| Combination Sum runs for seconds on 30 candidates | Generate-and-filter: every candidate tried at every level, sum checked only at the leaf | Sort and `break` when a candidate exceeds the remaining target; check at placement |
| Permutations of a 12-element list "hangs" | $12! \approx 4.8 \times 10^8$ leaves; the enumeration is the cost, not the code | Read the constraint: $n = 12$ with a permutation question means prune, count, or DP over bitmasks, not list |

## Interviewer follow-ups

1. **"Why is the constraint $n \le 20$ on the subsets problem, and what would $n = 25$ change?"** Model answer: output is $\Theta(n \cdot 2^n)$, about $2 \times 10^7$ integers at $n = 20$ and $8 \times 10^8$ at $n = 25$; the algorithm is unchanged, the output stops fitting in time and memory. Wrong answer: "recursion depth", which is only $n$.
2. **"Your output order differs from the expected list. Does that matter?"** Model answer: any order is a valid enumeration; if a canonical order is required, the start-index template produces index-lexicographic order and sorting the input first makes that value-lexicographic. Wrong answer: sorting the $2^n$ outputs afterwards, which adds an $O(2^n \log 2^n) = O(n \cdot 2^n)$ factor with a large constant.
3. **"Give me the $k$-th permutation without generating the first $k - 1$."** Model answer: factorial number system; the first element is index $\lfloor (k-1) / (n-1)! \rfloor$ of the unused list, remove it, repeat: $O(n^2)$ with a list, $O(n \log n)$ with a Fenwick tree over unused positions. Wrong answer: generate and count, which is $O(k \cdot n)$.
4. **"Why `i > start` in the duplicate rule and not `i > 0`?"** Model answer: the rule must only compare siblings; `i > 0` also fires when the equal element is the first candidate of a deeper level, so a value can never follow itself and `[1, 2, 2]` disappears. Wrong answer: "both work, `i > 0` is stricter", which loses objects.
5. **"How would you enumerate iteratively if the stack were a problem?"** Model answer: bitmasks for subsets, `next_permutation` for permutations, or an explicit stack of `(start, path)` frames; note that the depth here is only $n$, so the stack is not the limiting resource. Wrong answer: raising the recursion limit for a depth-20 recursion.

## What mid-level engineers get wrong

- Recording the shared `path` by reference and debugging the "everything is empty" output for twenty minutes.
- Using a set of tuples to deduplicate, which enumerates the full duplicated tree first; on inputs with many repeats that is exponentially more nodes than the skip rule.
- Writing `i > 0` instead of `i > start`, which silently drops every subset containing a repeated value twice.
- Resetting `start` to 0 in Combination Sum, producing every ordering of each valid multiset.
- Quoting the complexity as "$O(2^n)$" for subsets and forgetting the factor $n$ for copying each one.
- Missing that a permutation question with $n = 12$ and an optimisation target is a bitmask DP, not an enumeration.

## Exercises

```exercise
id: subsets-with-duplicates
title: Unique subsets of a multiset
prompt: |
  Implement `subsets_with_dup(nums)` returning every distinct subset of
  `nums`, which may contain repeated values. Each subset must be listed
  in non-decreasing order, the empty subset must be included, and no
  subset may appear twice. The order of subsets in the output does not
  matter.

  Use the sort + skip-same-level rule, not a set of seen tuples.
languages: [python, javascript]
entry: subsets_with_dup
starter:
  python: |
    def subsets_with_dup(nums):
        # your code here
        return []
  javascript: |
    function subsets_with_dup(nums) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 2, 2]]
    expected: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]
    any_order: true
  - args: [[0]]
    expected: [[], [0]]
    any_order: true
  - args: [[]]
    expected: [[]]
    any_order: true
    label: empty input
  - args: [[1, 1, 1]]
    expected: [[], [1], [1, 1], [1, 1, 1]]
    any_order: true
    hidden: true
  - args: [[2, 1, 2]]
    expected: [[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]
    any_order: true
    hidden: true
    label: unsorted input
hints:
  - "Sort first; duplicates must be adjacent for the skip rule to see them."
  - "Skip index i when i > start and nums[i] == nums[i - 1]; the i > start part is what allows [1, 2, 2]."
  - "Record a copy of the path at every call, not only at leaves."
```

```exercise
id: unique-permutations
title: Unique permutations of a multiset
prompt: |
  Implement `permute_unique(nums)` returning every distinct permutation
  of `nums`, which may contain repeated values. No permutation may appear
  twice; the order of permutations in the output does not matter.

  Use a `used` array and the skip rule for the sibling with the same value.
languages: [python, javascript]
entry: permute_unique
starter:
  python: |
    def permute_unique(nums):
        # your code here
        return []
  javascript: |
    function permute_unique(nums) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 1, 2]]
    expected: [[1, 1, 2], [1, 2, 1], [2, 1, 1]]
    any_order: true
  - args: [[1, 2, 3]]
    expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
    any_order: true
  - args: [[5]]
    expected: [[5]]
    any_order: true
    label: single element
  - args: [[]]
    expected: [[]]
    any_order: true
    label: empty input has one (empty) permutation
  - args: [[2, 2, 1, 1]]
    expected: [[1, 1, 2, 2], [1, 2, 1, 2], [1, 2, 2, 1], [2, 1, 1, 2], [2, 1, 2, 1], [2, 2, 1, 1]]
    any_order: true
    hidden: true
  - args: [[3, 3, 3]]
    expected: [[3, 3, 3]]
    any_order: true
    hidden: true
hints:
  - "Sort, then skip nums[i] when it equals nums[i - 1] and used[i - 1] is false."
  - "Choose: mark used and push; unchoose: pop and unmark. Keep them symmetric."
```

## Senior signals

- You write the **choose/explore/unchoose** loop from memory and name the two lines that differ between subsets, combinations and permutations.
- You state the complexity as **output size times object length**, you know it is a lower bound for any enumerator, and you can say what $n$ makes it intractable ($2^{20}$ fine, $13!$ not).
- You handle duplicates with **sort + skip-same-level**, you can explain why the test is `i > start` for subsets and `not used[i-1]` for permutations, and you can quote the node counts that show why a set of tuples is worse.
- You copy the path when recording and you can explain the aliasing bug that happens if you do not.
- You know what `itertools.permutations` does (index arrays, lazy tuples, index-lexicographic, no dedup) and what `std::next_permutation` does (in place, value-lexicographic, dedup for free), and you pick between them and the template on purpose.
- You read the constraints first: $n \le 20$ says enumerate, $n = 10^5$ says count with DP instead.
- You recognise a **Cartesian product** (independent option lists per slot) versus a **selection from one pool**, and you pick the guard accordingly.

## Check yourself

```quiz
- q: >-
    A subsets function records with out.append(path) instead of out.append(path.copy()). What does out contain after the call returns?
  options: ["All 2^n subsets, each recorded correctly", "All 2^n subsets, but in reverse order", "2^n references to one list, now the full set", "2^n references to one list, now empty"]
  answer: 3
  explanation: >-
    path is one list mutated in place; every recorded entry aliases it. Every append is undone by a pop, so after the final pop it is empty and every entry reads as []; it never stays at the full set. Copy on record.
- q: >-
    In the subsets-with-duplicates code, the skip condition is i > start and nums[i] == nums[i-1]. If you change it to i > 0 and nums[i] == nums[i-1], on input [1, 2, 2] you would:
  options: ["Lose only [2, 2], keeping [1, 2, 2]", "Get [1, 2] and [2] twice each", "Get the same six subsets as before", "Lose both [1, 2, 2] and [2, 2]"]
  answer: 3
  explanation: >-
    With i > 0 the rule also fires when the equal element is the first candidate of a deeper level, so a 2 can never follow a 2, whether the path starts with 1 or with 2. No duplicates appear, since sibling 2s are still skipped. The rule must only block equal siblings, which is what i > start expresses.
- q: >-
    You need every permutation of 12 distinct items. Approximately how many objects is that, and is exhaustive enumeration feasible in a few seconds?
  options: ["About 4 billion; no, not even compiled code", "About 479 million; borderline in Python", "About 144, i.e. 12²; yes, very fast", "About 4,096, i.e. 2^12; yes, very fast"]
  answer: 1
  explanation: >-
    12! is roughly 4.8 × 10^8, not 2^12 (that counts subsets). In a compiled language it is seconds; in Python it is minutes and the output alone is gigabytes, so it is borderline and probably not in Python. Constraints of n = 12 for permutations signal that the intended solution prunes or counts rather than lists.
- q: >-
    Combination Sum allows reusing a candidate. Which single change to the combinations template implements that?
  options: ["Drop the start index and loop over all candidates", "Remove the break so larger candidates are retried", "Recurse with start = 0 so every candidate is open", "Recurse with start = i rather than i + 1"]
  answer: 3
  explanation: >-
    start = i lets the same index be chosen again but still forbids going back to earlier indices, so each multiset of candidates is produced in one canonical order. Removing start or resetting it to 0 produces permutations of the same sum. The break is only a pruning step on sorted input; removing it changes speed, not which items can repeat.
- q: >-
    An interviewer gives you n up to 10^5 and asks for the number of subsets whose sum equals a target. What does the constraint tell you?
  options: ["Sort, then count matching sums with two pointers", "Enumerate bitmasks, since iteration avoids recursion", "Backtrack with pruning once the sum passes target", "Count with DP over (index, sum), not enumeration"]
  answer: 3
  explanation: >-
    2^(10^5) subsets cannot be enumerated by any method, iterative or pruned; pruning cuts branches but the count of matches alone can be exponential. Asking for a count rather than the objects, with a large n, is the signature of a DP over the subproblem state, not a search.
- q: >-
    std::next_permutation is applied once to [1, 3, 2]. Which array results?
  options: ["[2, 1, 3], after swapping the pivot 1 with 2 and reversing the suffix", "[1, 2, 3], after reversing the non-increasing suffix in place", "[3, 1, 2], after rotating the whole array left by one position", "[2, 3, 1], after swapping the pivot 1 with 2 and keeping the suffix"]
  answer: 0
  explanation: >-
    The longest non-increasing suffix is [3, 2], so the pivot is 1; the rightmost suffix element larger than 1 is 2; swapping gives [2, 3, 1] and reversing the suffix gives [2, 1, 3], the next permutation in value order. Reversing without the swap would move backwards to [1, 2, 3], and a rotation is not part of the algorithm.
```

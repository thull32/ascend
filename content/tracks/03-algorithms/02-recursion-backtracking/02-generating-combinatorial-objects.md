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
- **The recursion tree is the output.** Each root-to-leaf path is one object. Complexity is (number of nodes in the tree) × (work per node), and the number of leaves is at least the number of objects, so the output size is a lower bound on the running time.

## Subsets: include or exclude

Every subset of $\{1, 2, 3\}$ is a sequence of $n$ binary decisions: include element 0 or not, then element 1 or not, and so on. The tree has depth $n$ and $2^n$ leaves.

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3],
 "title": "Include/exclude tree: each leaf is one of the 8 subsets"}
```

The interview-standard version iterates over the *next start index* rather than making an explicit include/exclude branch. Every node of the tree is a subset (not just the leaves), so you record at every call.

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

Trace on `[1, 2, 3]`, recording the path at each call:

```text
go(0, [])        record []
  i=0 go(1, [1])        record [1]
    i=1 go(2, [1,2])       record [1,2]
      i=2 go(3, [1,2,3])     record [1,2,3]
    i=2 go(3, [1,3])       record [1,3]
  i=1 go(2, [2])        record [2]
    i=2 go(3, [2,3])       record [2,3]
  i=2 go(3, [3])        record [3]
```

Eight subsets, each recorded once, in a fixed order. The `start` parameter is what prevents `[2, 1]` from appearing as well as `[1, 2]`: after choosing index `i`, only indices greater than `i` are available, so each subset is generated in one canonical order.

Cost: $2^n$ subsets, each copied at length up to $n$, so $O(n \cdot 2^n)$ time and the same space for the output. The recursion depth is only $n$.

The bitmask alternative iterates integers `0 .. 2^n - 1` and reads bit `j` as "element `j` is in". It is shorter, non-recursive, and the natural choice when $n \le 20$ and you want to index subsets by a number (see [Bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation)).

```python
def subsets_bits(nums):
    n = len(nums)
    return [[nums[j] for j in range(n) if mask >> j & 1] for mask in range(1 << n)]
```

## Permutations: every element, every position

A permutation uses every element exactly once, so the choice at each level is "any element not yet used". The tree has depth $n$, branching $n$ then $n-1$ then $n-2$, and $n!$ leaves.

```viz
{"type": "recursion", "algorithm": "permutations", "values": [1, 2, 3],
 "title": "Branching shrinks by one per level: 3 × 2 × 1 = 6 leaves"}
```

Two implementations you should be able to write from memory.

**Used-array.** Keep a boolean per element. Simple, produces permutations in lexicographic order of indices, and generalises to duplicates (next section).

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

**Swap-based.** Fix position `k` by swapping each candidate into it, recurse on `k + 1`, swap back. No extra `used` array, no `path` list: the permutation is the array itself.

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

The swap version is faster by a constant and uses $O(n)$ auxiliary space instead of $O(n)$ for `used` plus $O(n)$ for `path`; the used-array version is easier to extend. Both are $O(n \cdot n!)$: $n!$ leaves, each copied at length $n$. The internal nodes add a factor that sums to at most $e \cdot n!$, so they do not change the bound.

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

Without the pruned upper bound the code is still correct, just slower: it walks into branches that can never reach length $k$. With $n = 20, k = 10$ the pruning removes about half the internal nodes. The count is $\binom{n}{k}$ leaves and $O(k \binom{n}{k})$ output; [Counting and combinatorics](/learn/foundations/math-for-engineers/counting-and-combinatorics) has the numbers.

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

Input `[1, 2, 2]` has three subsets containing exactly one 2 if you treat the 2s as distinct, but the problem wants `[1, 2]` once. Deduplicating the output with a set of tuples works but costs the full duplicated enumeration first ($O(n \cdot 2^n)$ either way, but wasteful when most objects are duplicates) and is the answer interviewers accept from mid-level candidates while waiting for the real one.

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

Why `i > start` and not `i > 0`: the condition must only fire for siblings. At `start = 1` with `nums = [1, 2, 2]`, index 2 has the same value as index 1, and index 1 is a *sibling choice* at this level (both are "the next element after `1`"), so index 2 is skipped. But when we chose index 1 and recursed to `start = 2`, index 2 is the *first* choice of the new level; `i == start`, so it is allowed, and `[1, 2, 2]` is generated. The rule says "do not start two sibling branches with the same value"; it never blocks a value from following itself in a deeper branch.

Trace with `[1, 2, 2]`:

```text
go(0, [])          record []
  i=0 [1]            record [1]
    i=1 [1,2]          record [1,2]
      i=2 [1,2,2]        record [1,2,2]
    i=2 skip (i>start, nums[2]==nums[1])
  i=1 [2]            record [2]
    i=2 [2,2]          record [2,2]
  i=2 skip
```

Six subsets, no duplicates, no set. The same rule handles [Combination Sum II](/practice/combination-sum-ii) (skip at the same level, recurse on `i + 1`).

For permutations with duplicates the level is "the candidates for position `k`", and the sibling test uses the `used` array: skip `nums[i]` if it equals `nums[i-1]` and `nums[i-1]` is *not* currently used (meaning the earlier equal element was tried at this level and backtracked, rather than being an ancestor in the current path).

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

On `[1, 1, 2]` this yields exactly `[1,1,2]`, `[1,2,1]`, `[2,1,1]`. Flip the condition to `used[i - 1]` and it still produces the right *set* of answers but explores the tree in a less pruned order; keep `not used[i-1]`, and be ready to explain it, because interviewers ask.

## Products and mappings

[Letter Combinations of a Phone Number](/practice/letter-combinations) is a Cartesian product: for each digit choose one of its letters. The template applies with "choices at level `d`" being the letters of digit `d` and recording at depth `len(digits)`. Output size is $\prod |letters(d)|$, up to $4^n$. No start index is needed because positions are distinct by construction. Recognise the shape: when each *slot* has its own independent option list, it is a product; when you are choosing *from one pool*, it is subsets/combinations/permutations.

## Choosing the shape

| You want | Choice at each level | Record when | Count | Guard |
|---|---|---|---|---|
| Subsets | next element from `start` onward | every node | $2^n$ | `start` index |
| Combinations of size k | next element from `start` onward | depth = k | $\binom{n}{k}$ | `start` + remaining-count prune |
| Permutations | any unused element | depth = n | $n!$ | `used` array or swap |
| Product of option lists | any option for slot d | depth = slots | $\prod k_i$ | none needed |
| Any of the above with duplicates | as above | as above | fewer | sort + skip-same-level |

Time is always $O(\text{objects} \times \text{length})$ and interview inputs are sized so that this is tractable ($n \le 20$ for subsets, $n \le 10$ for permutations). If the constraint says $n = 10^5$, the problem is *not* asking you to enumerate; it is asking for a count or an optimum, which is dynamic programming.

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
- You state the complexity as **output size times object length** and you can say what $n$ makes that intractable ($2^{20}$ fine, $13!$ not).
- You handle duplicates with **sort + skip-same-level**, you can explain why the test is `i > start` for subsets and `not used[i-1]` for permutations, and you do not reach for a set of tuples.
- You copy the path when recording and you can explain the aliasing bug that happens if you do not.
- You read the constraints first: $n \le 20$ says enumerate, $n = 10^5$ says count with DP instead.
- You recognise a **Cartesian product** (independent option lists per slot) versus a **selection from one pool**, and you pick the guard accordingly.

## Check yourself

```quiz
- q: >-
    A subsets function records with out.append(path) instead of out.append(path.copy()). What does out contain after the call returns?
  options: ["2^n references to one list, now the full set", "2^n references to one list, now empty", "All 2^n subsets, but in reverse order", "All 2^n subsets, each recorded correctly"]
  answer: 1
  explanation: >-
    path is one list mutated in place; every recorded entry aliases it. Every append is undone by a pop, so after the final pop it is empty and every entry reads as []; it never stays at the full set. Copy on record.
- q: >-
    In the subsets-with-duplicates code, the skip condition is i > start and nums[i] == nums[i-1]. If you change it to i > 0 and nums[i] == nums[i-1], on input [1, 2, 2] you would:
  options: ["Lose only [2, 2], keeping [1, 2, 2]", "Get the same six subsets as before", "Lose both [1, 2, 2] and [2, 2]", "Get [1, 2] and [2] twice each"]
  answer: 2
  explanation: >-
    With i > 0 the rule also fires when the equal element is the first candidate of a deeper level, so a 2 can never follow a 2, whether the path starts with 1 or with 2. No duplicates appear, since sibling 2s are still skipped. The rule must only block equal siblings, which is what i > start expresses.
- q: >-
    You need every permutation of 12 distinct items. Approximately how many objects is that, and is exhaustive enumeration feasible in a few seconds?
  options: ["About 479 million; borderline in Python", "About 144, i.e. 12²; yes, trivially fast", "About 4,096, i.e. 2^12; yes, trivially fast", "About 4 billion; no, not even compiled code"]
  answer: 0
  explanation: >-
    12! is roughly 4.8 × 10^8, not 2^12 (that counts subsets). In a compiled language it is seconds; in Python it is minutes and the output alone is gigabytes, so it is borderline and probably not in Python. Constraints of n = 12 for permutations signal that the intended solution prunes or counts rather than lists.
- q: >-
    Combination Sum allows reusing a candidate. Which single change to the combinations template implements that?
  options: ["Drop the start index and loop over all candidates", "Remove the break so larger candidates are retried", "Recurse with start = i rather than i + 1", "Recurse with start = 0 so every candidate is open"]
  answer: 2
  explanation: >-
    start = i lets the same index be chosen again but still forbids going back to earlier indices, so each multiset of candidates is produced in one canonical order. Removing start or resetting it to 0 produces permutations of the same sum. The break is only a pruning step on sorted input; removing it changes speed, not which items can repeat.
- q: >-
    An interviewer gives you n up to 10^5 and asks for the number of subsets whose sum equals a target. What does the constraint tell you?
  options: ["Sort, then count matching sums with two pointers", "Count with DP over (index, sum), not enumeration", "Backtrack with pruning once the sum passes target", "Enumerate bitmasks, since iteration avoids recursion"]
  answer: 1
  explanation: >-
    2^(10^5) subsets cannot be enumerated by any method, iterative or pruned; pruning cuts branches but the count of matches alone can be exponential. Asking for a count rather than the objects, with a large n, is the signature of a DP over the subproblem state, not a search.
```

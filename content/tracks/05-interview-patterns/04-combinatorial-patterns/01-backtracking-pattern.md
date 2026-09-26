---
slug: backtracking-pattern
title: "Backtracking: choose, explore, unchoose, and prune early"
description: Recognise generate-all and find-any-valid problems, write the one recursive template that covers subsets, combinations, permutations and constraint satisfaction, and see Subsets II, Combination Sum and N-Queens traced through their recursion trees.
minutes: 34
difficulty: medium
tags: [backtracking, recursion, subsets, permutations, constraint-satisfaction, pruning, pattern:backtracking]
problems: [subsets, combination-sum, permutations, subsets-ii, combination-sum-ii, word-search, palindrome-partitioning, letter-combinations, n-queens, sudoku-solver]
---
"Return all subsets." "Return every combination that sums to the target." "Place eight queens so none attack." "Fill in the sudoku." Each of these asks you to search a space of candidate answers that is exponential in size, and there is no shortcut: the output itself can be exponential, or the problem is NP-hard in general and the interviewer is only asking for `n = 9`. What the interviewer is testing is whether you can *organise* the search so that it visits each candidate once, abandons hopeless branches as early as possible, and does not leak state between branches.

Backtracking is that organisation. You build a candidate one decision at a time, recursing after each decision; when a partial candidate cannot lead to a valid answer you return immediately (prune); and when you return from a decision you undo it so the next decision starts from clean state. Every problem in this lesson is the same twelve-line template with three things filled in: what a decision is, when a partial candidate is complete, and when it is doomed.

## The signal

Reach for backtracking when the statement says any of these:

- **"All", "every", "enumerate", "generate", "list all possible"**: subsets, permutations, combinations, partitions, parenthesisations. The output size forces exponential time, so there is no better complexity class; the question is constant factors and correctness with duplicates.
- **"Find any valid", "is there a way to", "solve"** with small `n` and constraints that interact: N-Queens, Sudoku, word search on a grid. You stop at the first complete candidate.
- **"Can be partitioned / split into pieces that each satisfy"** ([Palindrome Partitioning](/practice/palindrome-partitioning)): the decision is where to cut next.
- **Small input bounds** (`n ≤ 10`, `≤ 16`, a 9×9 board) with a question that has no polynomial structure. Small bounds are the interviewer telling you exponential is fine.
- **Choices that must not be reused** or must be used at most once, with duplicates in the input: the duplicate-skipping rule is the part of the template that separates candidates.

What rules it out:

- **"Count", "minimum", "maximum", "is it possible"** *with* overlapping subproblems and large `n`. If the same `(index, remaining)` state recurs, the recursion tree has repeated subtrees and you want [DP patterns](/learn/interview-patterns/combinatorial-patterns/dp-patterns). The test: does the answer for a suffix depend only on a small summary of what came before? If yes, memoise; if the answer needs the actual partial candidate (which subset, which permutation), backtrack.
- **A greedy rule is provably safe**: [Greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern). "Fewest intervals to remove" is greedy, not a search over subsets.
- **The structure is a tree or graph** and the search is over nodes, not over choices: that is DFS, and it is covered in [Tree DFS](/learn/interview-patterns/tree-and-graph-patterns/tree-dfs) and [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal). Grid word search sits on the border and is treated here because the unchoose step is the point.

The confusable pattern is DP, and the boundary is worth one sentence in the interview: "the output requires every solution, so memoisation cannot help; I will backtrack with pruning." Or the reverse: "we only need the count, and the state is `(i, remaining)`, so I will memoise." See [From backtracking to memoisation](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation) for the bridge.

## The template

One recursive function with the partial candidate as mutable shared state. Three slots: `is_complete`, `candidates(start)` (which choices are legal from here) and the prune check.

```python
def backtrack_all(items):
    out, path = [], []

    def go(start):
        out.append(path[:])                        # every prefix is a subset
        for i in range(start, len(items)):
            if i > start and items[i] == items[i - 1]:
                continue                           # skip duplicate at this level
            path.append(items[i])                  # choose
            go(i + 1)                              # explore (i + 1: no reuse)
            path.pop()                             # unchoose

    items.sort()                                   # duplicates become adjacent
    go(0)
    return out


def backtrack_first(state):
    """Find-any form: return True as soon as a complete candidate exists."""
    if state.is_complete():
        return True
    for choice in state.candidates():
        if state.is_doomed_with(choice):           # prune
            continue
        state.apply(choice)
        if backtrack_first(state):
            return True                            # propagate success, keep state
        state.undo(choice)
    return False
```

```javascript
function backtrackAll(items) {
  const out = [], path = [];
  items.sort((a, b) => a - b);
  function go(start) {
    out.push([...path]);                           // copy: path is shared
    for (let i = start; i < items.length; i++) {
      if (i > start && items[i] === items[i - 1]) continue;
      path.push(items[i]);
      go(i + 1);
      path.pop();
    }
  }
  go(0);
  return out;
}
```

Three variations of the loop cover the classic families:

| family | `candidates(start)` | recursion argument | complete when |
|---|---|---|---|
| subsets | `i in [start, n)` | `go(i + 1)` | always (record every node) |
| combinations of size k | `i in [start, n)` | `go(i + 1)` | `len(path) == k` |
| combination sum with reuse | `i in [start, n)` | `go(i)` (same `i`: reuse allowed) | `remaining == 0` |
| permutations | `i in [0, n)` not yet used | `go()` with a `used` array | `len(path) == n` |

The invariant: *on entry to `go`, `path` is exactly the sequence of choices made on the current branch, and every recorded output was copied at the moment it was complete*. The copy is not optional. `out.append(path)` stores a reference to the shared list, which is later mutated by `pop`, so every recorded answer ends up empty.

The duplicate rule `i > start and items[i] == items[i - 1]` says: at one level of the recursion, among equal values, take only the first. Two equal values at the same level would produce identical subtrees. Note it is `i > start`, not `i > 0`: the second copy of a value is still allowed *deeper* in the recursion (the subset `{2, 2}` is valid), just not as an alternative at the same depth.

Watch the recursion tree for subsets, each node a prefix, each edge a choice:

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3], "title": "Subsets by backtracking", "caption": "Every node in the tree is a recorded subset; each edge appends one element with index greater than the last."}
```

Time is `O(number of nodes in the recursion tree × cost per node)`. For subsets that is `O(2ⁿ · n)` (the `n` from copying); for permutations `O(n! · n)`; for constraint problems it is the pruned tree size, which is what the pruning is for.

## Worked problems

### Subsets II

[Subsets II](/practice/subsets-ii): all distinct subsets of an array that may contain duplicates.

Sort, then the template with the skip rule. Trace on `[1, 2, 2]`:

| call `go(start)` | `path` on entry | recorded | loop body |
|---|---|---|---|
| go(0) | `[]` | `[]` | i=0 (1): choose → go(1) |
| go(1) | `[1]` | `[1]` | i=1 (2): choose → go(2) |
| go(2) | `[1, 2]` | `[1, 2]` | i=2 (2): choose → go(3) |
| go(3) | `[1, 2, 2]` | `[1, 2, 2]` | loop empty; return; pop |
| back in go(2) | `[1, 2]` | | loop ends; return; pop |
| back in go(1) | `[1]` | | i=2 (2): `i > start` and `items[2] == items[1]`: **skip** |
| back in go(0) | `[]` | | i=1 (2): choose → go(2) |
| go(2) | `[2]` | `[2]` | i=2 (2): `i > start` (2 > 2 is false): choose → go(3) |
| go(3) | `[2, 2]` | `[2, 2]` | return; pop |
| back in go(0) | `[]` | | i=2 (2): `i > start` and equal: **skip** |

Output `[[], [1], [1, 2], [1, 2, 2], [2], [2, 2]]`, six distinct subsets. The two skips removed exactly the two branches that would have produced a second `[1, 2]` and a second `[2]`. Notice the `[2, 2]` branch was *not* skipped because there `i == start`: the second 2 is the first candidate at its level.

Compare the wrong rule `i > 0 and items[i] == items[i - 1]`: it would skip index 2 in `go(2)` too, losing `[1, 2, 2]` and `[2, 2]`. And the wrong fix of "collect everything into a set of tuples": correct, but `O(2ⁿ · n)` extra memory and it hides that you did not understand where the duplicates came from.

### Combination Sum

[Combination Sum](/practice/combination-sum): distinct positive candidates; return every combination (with unlimited reuse of each candidate) that sums to `target`.

Reuse means the recursive call passes `i`, not `i + 1`. Sorting lets you break, not just continue, when a candidate exceeds the remainder, because everything after it is larger too.

```python
def combination_sum(candidates, target):
    candidates.sort()
    out, path = [], []
    def go(start, remaining):
        if remaining == 0:
            out.append(path[:])
            return
        for i in range(start, len(candidates)):
            c = candidates[i]
            if c > remaining:
                break                              # sorted: no later candidate fits
            path.append(c)
            go(i, remaining - c)                   # i, not i + 1: reuse allowed
            path.pop()
    go(0, target)
    return out
```

Trace on `candidates = [2, 3, 6, 7]`, `target = 7`. Depth-first, showing only the nodes visited:

| `go(start, remaining)` | `path` | action |
|---|---|---|
| (0, 7) | `[]` | try 2 |
| (0, 5) | `[2]` | try 2 |
| (0, 3) | `[2, 2]` | try 2 |
| (0, 1) | `[2, 2, 2]` | 2 > 1: break |
| (0, 3) | `[2, 2]` | try 3 |
| (1, 0) | `[2, 2, 3]` | **record** |
| (0, 3) | `[2, 2]` | 6 > 3: break |
| (0, 5) | `[2]` | try 3 |
| (1, 2) | `[2, 3]` | 3 > 2: break |
| (0, 5) | `[2]` | 6 > 5: break |
| (0, 7) | `[]` | try 3 |
| (1, 4) | `[3]` | try 3 |
| (1, 1) | `[3, 3]` | 3 > 1: break |
| (1, 4) | `[3]` | 6 > 4: break |
| (0, 7) | `[]` | try 6 |
| (2, 1) | `[6]` | break |
| (0, 7) | `[]` | try 7 |
| (3, 0) | `[7]` | **record** |

Output `[[2, 2, 3], [7]]`. Eighteen nodes visited for a search space that, unpruned, would have been much larger. Passing `i` rather than `i + 1` is why `[2, 2, 3]` is reachable and why `[3, 2, 2]` is not generated separately: combinations are produced in non-decreasing order, which is what makes them unique without a set.

[Combination Sum II](/practice/combination-sum-ii) is the same with `go(i + 1, …)` (no reuse) and the `i > start` duplicate skip, because its input has duplicates. Knowing that the two problems differ by one character in the recursive call and one `if` line is the kind of thing that lets you finish in ten minutes.

### N-Queens

[N-Queens](/practice/n-queens): place `n` queens on an `n × n` board so no two share a row, column or diagonal. Return all boards.

One queen per row, so the decision at depth `r` is "which column in row `r`". The prune is the attack check, and the trick that makes it `O(1)` is three sets: columns used, `r + c` diagonals used, `r − c` anti-diagonals used. Every cell on a `↘` diagonal has the same `r − c`; every cell on a `↙` diagonal has the same `r + c`.

```python
def solve_n_queens(n):
    out, cols, diag, anti = [], set(), set(), set()
    queens = []                                    # queens[r] = column
    def go(r):
        if r == n:
            out.append(["." * c + "Q" + "." * (n - c - 1) for c in queens])
            return
        for c in range(n):
            if c in cols or (r - c) in diag or (r + c) in anti:
                continue                           # prune: attacked
            cols.add(c); diag.add(r - c); anti.add(r + c); queens.append(c)
            go(r + 1)
            cols.discard(c); diag.discard(r - c); anti.discard(r + c); queens.pop()
    go(0)
    return out
```

Trace for `n = 4`, tracking the column chosen per row:

| row | columns tried | rejected because | placed |
|---|---|---|---|
| 0 | 0 | | c=0 |
| 1 | 0, 1, 2 | c=0: column taken; c=1: r−c=0 equals the diagonal of (0,0); c=2: r−c=−1, r+c=3, column free | c=2 |
| 2 | 0, 1, 2, 3 | col 0; c=1: r−c=1, r+c=3 = anti of (1,2); col 2; c=3: r−c=−1 = diag of (1,2) | none: **backtrack** |
| 1 | 3 | | c=3 |
| 2 | 0, 1 | c=0: column taken; c=1: r−c=1, r+c=3, neither in diag {0, −2} or anti {0, 4}, column free | c=1 |
| 3 | 0, 1, 2, 3 | c=0, c=1: columns taken; c=2: r−c=1 is in diag {0, −2, 1}; c=3: column taken | none: **backtrack** |
| 2 | 2, 3 | c=2: r−c=0 is in diag; c=3: column taken | none: backtrack |
| 1 | (exhausted) | | backtrack |
| 0 | 1 | | c=1 |
| 1 | 0, 1, 2, 3 | c=0: r+c=1 equals the anti-diagonal of (0,1); c=1: column taken; c=2: r−c=−1 equals the diagonal of (0,1); c=3: free | c=3 |
| 2 | 0 | c=0: r−c=2, r+c=2, not in diag {−1, −2} or anti {1, 4}, column free | c=0 |
| 3 | 0, 1, 2 | c=0, c=1: columns taken; c=2: r−c=1, r+c=5, free | c=2: **solution** `[1, 3, 0, 2]` |

The first solution is `.Q.. / ...Q / Q... / ..Q.`. Continuing the search finds the mirror `[2, 0, 3, 1]`, and `n = 4` has exactly those two. The prune rejected most placements in `O(1)` without scanning the board; a version that re-checks every previous queen costs `O(n)` per placement and is the difference between `n = 12` finishing and not.

The find-any form (return `True` on the first solution, do not undo on the way out) is what [Sudoku Solver](/practice/sudoku-solver) needs: the board itself is the state, `candidates` are the digits legal in the next empty cell, and the prune is the row/column/box sets.

## Variations

- **Permutations** ([Permutations](/practice/permutations)): loop over all indices with a `used` array instead of a `start`; with duplicates, sort and skip when `nums[i] == nums[i−1] and not used[i−1]`.
- **Letter Combinations of a Phone Number** ([Letter Combinations](/practice/letter-combinations)): one decision per digit, candidates are that digit's letters; no pruning, output size is the product of the letter counts.
- **Palindrome Partitioning**: decision is the end of the next piece; prune by checking the piece is a palindrome before recursing; precompute a palindrome table with DP to make the check `O(1)`.
- **Word Search** ([Word Search](/practice/word-search)): the grid cell is the decision, the unchoose is restoring the cell. With many words, carry a trie: [Trie pattern](/learn/interview-patterns/tree-and-graph-patterns/trie-pattern).
- **Generate Parentheses** ([Generate Parentheses](/practice/generate-parentheses)): two choices at each step with two prunes (`open < n`, `close < open`).
- **Bitmask instead of sets**: for `n ≤ 32`, `cols`, `diag` and `anti` become integers and the checks become `&`; the recursion can even iterate free positions with `lowbit`. Same algorithm, five times faster.
- **Iterative backtracking**: an explicit stack of `(state, next_choice_index)` for when the depth is large or the language's recursion limit is small. Rarely needed in interviews; know it exists.
- **Ordering heuristics**: in Sudoku, choose the empty cell with the fewest legal digits first (minimum remaining values). It changes nothing asymptotically and everything in practice.

## Pitfalls

- **Recording the shared list** instead of a copy. Every output ends up empty or identical. `path[:]` / `[...path]`.
- **Forgetting the unchoose.** Sets or `used` flags left set after a branch returns poison every sibling branch. Every `add` needs a matching `discard` on the line after the recursive call.
- **Duplicate skip compared to the wrong thing.** `i > start`, not `i > 0`. And skip only after sorting.
- **`go(i + 1)` where reuse is allowed, or `go(i)` where it is not.** Read the problem for "each number may be used once/unlimited times" and match it.
- **Pruning with `continue` where `break` is valid.** Sorted input plus "candidate exceeds remaining" means everything after it also exceeds; `break` saves a factor.
- **Early return in the find-any form that also undoes the state.** If you undo after a successful return, the solved board is gone by the time the caller looks at it. Return before undoing, or copy at the leaf.
- **`O(n)` attack checks in N-Queens.** Use the three sets (or bitmasks).
- **Mutable default arguments in Python** (`def go(path=[])`). The default is shared across calls. Pass it explicitly or use a closure.
- **Exceeding the recursion limit** on deep decisions (a 1,000-character string partition). Python's default is 1,000 frames; either raise it or iterate.

## Exercise

```exercise
id: combination-sum-backtracking
title: Combination sum with reuse
prompt: |
  Given a list of distinct positive integers `candidates` and a positive
  `target`, return every combination of candidates that sums to `target`.
  Each candidate may be used any number of times. Each combination must be
  in non-decreasing order, and no combination may appear twice; the order
  of combinations in the output does not matter.

  Sort the candidates and pass the same start index into the recursive
  call so reuse is allowed without generating permutations of one
  combination.
languages: [python, javascript]
entry: combination_sum
starter:
  python: |
    def combination_sum(candidates, target):
        # your code here
        return []
  javascript: |
    function combination_sum(candidates, target) {
      // your code here
      return [];
    }
tests:
  - args: [[2, 3, 6, 7], 7]
    expected: [[2, 2, 3], [7]]
    any_order: true
  - args: [[2, 3, 5], 8]
    expected: [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
    any_order: true
  - args: [[2], 1]
    expected: []
    label: nothing fits
  - args: [[1], 2]
    expected: [[1, 1]]
    label: reuse of a single candidate
  - args: [[7], 7]
    expected: [[7]]
    label: exact single candidate
  - args: [[2, 3, 4], 6]
    expected: [[2, 2, 2], [2, 4], [3, 3]]
    any_order: true
    hidden: true
  - args: [[3, 5], 4]
    expected: []
    hidden: true
hints:
  - "Recurse with (start, remaining); record a copy of the path when remaining hits 0."
  - "Loop i from start; append candidates[i], recurse with the same i, then pop."
  - "After sorting, break out of the loop as soon as candidates[i] > remaining."
```

## Senior signals

- You state **"the output is exponential, so exponential time is the floor"** before anyone asks about complexity, and then talk about pruning and constants.
- You write **choose / explore / unchoose** as three visibly paired lines and can point to the exact line where a missing unchoose would corrupt sibling branches.
- You explain the **duplicate rule by the recursion tree** ("equal values at the same level produce identical subtrees") rather than by deduplicating at the end.
- You know that **Combination Sum I and II differ by `i` versus `i + 1` and one skip line**, and say so.
- You make the N-Queens check **`O(1)` with three sets** and can name the invariant of each set, and you mention bitmasks as the faster equivalent.
- You draw the **backtracking-versus-DP boundary** in one sentence: all solutions or the actual candidate matters means backtrack; count or optimum over a small state means memoise.
- You mention **ordering heuristics** (most-constrained first) when the problem is a constraint satisfaction search, because that is what production solvers do.

## Check yourself

```quiz
- q: >-
    A subsets solution records out.append(path) instead of out.append(path[:]). What is the output for [1, 2]?
  options: ["[[], [1], [1, 2], [2]], correct", "Four references to the same list, which is empty after the final pop, so [[], [], [], []]", "[[1, 2], [1, 2], [1, 2], [1, 2]]", "An exception"]
  answer: 1
  explanation: >-
    path is one shared list mutated by every append and pop. Each recorded entry is a reference to it, and after the recursion unwinds it is empty. Copying at the moment of recording snapshots the state.
- q: >-
    In Subsets II on sorted input, why is the duplicate skip written as i > start and nums[i] == nums[i - 1] rather than i > 0 and nums[i] == nums[i - 1]?
  options: ["They are equivalent", "i > start restricts the skip to alternatives at the same recursion level; i > 0 would also skip a duplicate chosen deeper, losing subsets such as [2, 2]", "i > 0 is correct and i > start is a bug", "The start version is only for permutations"]
  answer: 1
  explanation: >-
    Equal values at one level generate identical subtrees, so only the first is taken. But the second copy is still needed as a continuation of a branch that already took the first, which happens when i == start in the deeper call.
- q: >-
    Combination Sum allows reusing candidates; Combination Sum II does not and has duplicate candidates. What changes between the two solutions?
  options: ["A completely different algorithm", "The recursive call passes i instead of i + 1 for reuse, and Sum II adds the sorted duplicate skip; everything else is identical", "Sum II needs a set to deduplicate outputs", "Sum II is solved with DP instead"]
  answer: 1
  explanation: >-
    Reuse is controlled by whether the next call may pick the same index again. Duplicate candidates are handled by the same-level skip. Recognising the one-character difference is what makes the second problem fast to solve.
- q: >-
    In N-Queens, why do the sets keyed by r - c and r + c detect diagonal attacks in O(1)?
  options: ["Because queens on a diagonal have the same row", "Because every cell on a down-right diagonal shares the value r - c, and every cell on a down-left diagonal shares r + c, so membership in the set is exactly the attack test", "Because the board is symmetric", "They do not; you still need to scan previous rows"]
  answer: 1
  explanation: >-
    Moving one step down and one right leaves r - c unchanged; one step down and one left leaves r + c unchanged. Two sets plus a column set replace an O(n) scan of earlier queens.
- q: >-
    The interviewer changes Combination Sum to ask only for the number of combinations, with target up to 10,000 and 100 candidates. What should change?
  options: ["Nothing; backtracking is still best", "The answer no longer needs each combination, and the state (index, remaining) recurs, so memoise or use bottom-up DP in O(candidates * target) instead of enumerating an exponential number of combinations", "Use a greedy count", "Switch to BFS"]
  answer: 1
  explanation: >-
    Enumeration is forced only when every solution must be output. A count over a small state space is dynamic programming (the unbounded-knapsack count), which is polynomial where backtracking is exponential.
- q: >-
    In the find-any form of backtracking (Sudoku), a candidate writes: apply choice; if go() returns True, undo and return True. What goes wrong?
  options: ["Nothing; undoing is always required", "The solved board is undone on the way out of every frame, so the caller receives True but an unsolved board; return immediately on success without undoing, or copy the solution at the leaf", "It loops forever", "It finds all solutions instead of one"]
  answer: 1
  explanation: >-
    In the find-any form the state on success is the answer. Undoing it destroys the answer. Undo only on the failure path.
```

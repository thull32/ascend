---
slug: backtracking-pattern
title: "Backtracking: choose, explore, unchoose, and prune early"
description: Recognise generate-all and find-any-valid problems from the statement and its bounds, write the one template that covers subsets, permutations and constraint search, and see Subsets II, Combination Sum, N-Queens and Word Search traced through their recursion trees with every pruned branch counted.
minutes: 45
difficulty: medium
tags: [backtracking, recursion, subsets, permutations, constraint-satisfaction, pruning, pattern:backtracking]
problems: [subsets, combination-sum, permutations, subsets-ii, combination-sum-ii, word-search, palindrome-partitioning, letter-combinations, n-queens, sudoku-solver, generate-parentheses]
---
"Return all subsets." "Return every combination that sums to the target." "Place eight queens so none attack." "Fill in the sudoku." Each of these asks you to search a space of candidate answers that is exponential in size, and there is no shortcut: the output itself can be exponential, or the problem is NP-hard in general and the interviewer is only asking for `n = 9`. What the interviewer is testing is whether you can *organise* the search so that it visits each candidate once, abandons hopeless branches as early as possible, and does not leak state between branches.

Backtracking is that organisation. You build a candidate one decision at a time, recursing after each decision; when a partial candidate cannot lead to a valid answer you return immediately (prune); and when you return from a decision you undo it so the next decision starts from clean state. Every problem in this lesson is the same dozen-line template with four things filled in: what a decision is, which choices are legal next, when a partial candidate is complete, and when it is doomed.

The enumeration shapes and the heavy constraint searches are taught in [Generating combinatorial objects](/learn/algorithms/recursion-backtracking/generating-combinatorial-objects) and [Constraint satisfaction](/learn/algorithms/recursion-backtracking/constraint-satisfaction). This lesson is about the interview: reading the pattern off the statement and its bounds, sizing the search before you write it, and writing it without the bugs that cost the round.

## The signal

Reach for backtracking when the statement says any of these:

- **"All", "every", "enumerate", "generate", "list all possible"**: subsets, permutations, combinations, partitions, parenthesisations. The output size forces exponential time, so the questions are pruning, constants and duplicates.
- **"Find any valid", "is there a way to", "solve"** with small `n` and constraints that interact: [N-Queens](/practice/n-queens), [Sudoku Solver](/practice/sudoku-solver), [Word Search](/practice/word-search). You stop at the first complete candidate.
- **"Split into pieces that each satisfy"** ([Palindrome Partitioning](/practice/palindrome-partitioning)): the decision is where to cut next.
- **Choices that may be used once, or unlimited times, with duplicates in the input**: the duplicate rule is the line that separates candidates.
- **Small bounds.** The bound is the interviewer's budget, and you can convert it to a shape:

| Bound | Size of the search | Shape | Measured here |
|---|---|---|---|
| `n ≤ 8–10`, "all orderings" | `n!` leaves, `e · n!` nodes | permutations | full `n = 10` tree: 9.86 × 10⁶ calls, 1.1 s in CPython 3.14, 86 ms in Node 24 |
| `n ≤ 15–20`, "all subsets" | `2ⁿ` | subsets | all 2²⁰ subsets built in 0.3–0.4 s, holding 151 MB |
| 9 × 9 board, `n ≤ 12` queens | pruned tree, far below the domain | constraint search | depends on the prune and the ordering |
| `n ≈ 30–40`, subset sums | `2ⁿ` is 10⁹–10¹² | meet in the middle | not backtracking |
| `n ≥ 10³` | | DP, greedy or graph search | not backtracking |

What rules it out:

- **"Count", "minimum", "maximum", "is it possible"** with a small summary state that recurs. If the answer for a suffix depends only on `(index, remaining)`, the tree has repeated subtrees: [DP patterns](/learn/interview-patterns/combinatorial-patterns/dp-patterns).
- **A provably safe local rule**: [Greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern).
- **Search over nodes, not choices**: [Tree DFS](/learn/interview-patterns/tree-and-graph-patterns/tree-dfs) and [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal), where a visited cell stays visited.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "How many coin combinations make 500?" | Combination Sum | unbounded-knapsack count, `O(coins · amount)` | only the count is asked; `(i, remaining)` recurs |
| "Can the array split into two equal-sum halves?", `n ≤ 200` | subsets | 0/1 knapsack on `sum / 2`, or a bitset | yes/no over a numeric target |
| "Split into `k` equal-sum groups", `n ≤ 16` | knapsack | backtracking with a descending sort and the "empty bucket" prune, or DP over 2¹⁶ masks | groups are unlabelled; `n` is tiny |
| "Fewest cuts so every piece is a palindrome" | Palindrome Partitioning | prefix DP, `O(n²)` | a minimum, not a list |
| "Longest path through strictly increasing cells" | grid backtracking | memoised DFS; increasing values rule out cycles | the constraint forbids revisits for free |
| "Count the islands" | backtracking on a grid | flood fill with a global visited set, never unmarked | a cell is claimed once, forever |
| "Does the word occur in the grid?" | flood fill | backtracking with per-path marking | a cell may be reused by a *different* path |
| "Return every segmentation" (Word Break II) | Word Break DP | backtracking over split points, pruned by the DP table | every solution must be output |

The boundary is worth one sentence out loud: "the output requires every solution, so memoisation cannot shrink it; I will backtrack with pruning", or "we only need the count and the state is `(i, remaining)`, so I will memoise". [From backtracking to memoisation](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation) is the bridge.

## The template

One recursive function with the partial candidate as shared mutable state, and four slots: the **decision** at each depth, the **candidates** legal from here, the **complete** test, and the **prune**. The collect-all form records at completion; the find-first form returns `True` up the stack and keeps the state.

```python
def subsets_with_dup(nums):
    nums = sorted(nums)                          # equal values become adjacent
    out, path = [], []

    def go(start):
        out.append(path[:])                      # every node is a subset: record a copy
        for i in range(start, len(nums)):
            if i > start and nums[i] == nums[i - 1]:
                continue                         # same value, same level: identical subtree
            path.append(nums[i])                 # choose
            go(i + 1)                            # explore; i + 1 means no reuse
            path.pop()                           # unchoose

    go(0)
    return out


def permute_unique(nums):
    nums = sorted(nums)
    n = len(nums)
    out, path, used = [], [], [False] * n

    def go():
        if len(path) == n:                       # complete
            out.append(path[:])
            return
        for i in range(n):
            if used[i]:
                continue                         # each index at most once per permutation
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue                         # equal copies are taken left to right only
            used[i] = True
            path.append(nums[i])
            go()
            path.pop()
            used[i] = False

    go()
    return out


def solve_sudoku(board):
    """Find-first form. board: 9 lists of 9 chars, '.' for empty. Solves in place."""
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    empty = []
    for r in range(9):
        for c in range(9):
            d = board[r][c]
            if d == ".":
                empty.append((r, c))
            else:
                rows[r].add(d); cols[c].add(d); boxes[r // 3 * 3 + c // 3].add(d)

    def go(k):
        if k == len(empty):
            return True                          # complete: every empty cell is filled
        r, c = empty[k]
        b = r // 3 * 3 + c // 3
        for d in "123456789":
            if d in rows[r] or d in cols[c] or d in boxes[b]:
                continue                         # prune: digit already used in a unit
            board[r][c] = d
            rows[r].add(d); cols[c].add(d); boxes[b].add(d)
            if go(k + 1):
                return True                      # success: keep the board, do not undo
            rows[r].discard(d); cols[c].discard(d); boxes[b].discard(d)
            board[r][c] = "."                    # undo only on failure
        return False

    go(0)
    return board
```

```javascript
function subsetsWithDup(nums) {
  nums = [...nums].sort((a, b) => a - b);        // numeric sort: the default sort compares strings
  const out = [], path = [];
  function go(start) {
    out.push([...path]);                         // copy: path is shared and mutated below
    for (let i = start; i < nums.length; i++) {
      if (i > start && nums[i] === nums[i - 1]) continue;
      path.push(nums[i]);
      go(i + 1);
      path.pop();
    }
  }
  go(0);
  return out;
}

function permuteUnique(nums) {
  nums = [...nums].sort((a, b) => a - b);
  const n = nums.length, out = [], path = [], used = new Array(n).fill(false);
  function go() {
    if (path.length === n) { out.push([...path]); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      if (i > 0 && nums[i] === nums[i - 1] && !used[i - 1]) continue;
      used[i] = true; path.push(nums[i]);
      go();
      path.pop(); used[i] = false;
    }
  }
  go();
  return out;
}

function solveSudoku(board) {
  const rows = Array.from({ length: 9 }, () => new Set());
  const cols = Array.from({ length: 9 }, () => new Set());
  const boxes = Array.from({ length: 9 }, () => new Set());
  const empty = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const d = board[r][c];
      if (d === ".") empty.push([r, c]);
      else { rows[r].add(d); cols[c].add(d); boxes[3 * Math.floor(r / 3) + Math.floor(c / 3)].add(d); }
    }
  function go(k) {
    if (k === empty.length) return true;
    const [r, c] = empty[k], b = 3 * Math.floor(r / 3) + Math.floor(c / 3);
    for (const d of "123456789") {
      if (rows[r].has(d) || cols[c].has(d) || boxes[b].has(d)) continue;
      board[r][c] = d; rows[r].add(d); cols[c].add(d); boxes[b].add(d);
      if (go(k + 1)) return true;                // keep the solved board
      rows[r].delete(d); cols[c].delete(d); boxes[b].delete(d); board[r][c] = ".";
    }
    return false;
  }
  go(0);
  return board;
}
```

The families differ only in the slots:

| family | candidates from here | recursive call | complete when |
|---|---|---|---|
| subsets | `i in [start, n)` | `go(i + 1)` | always: record every node |
| combinations of size `k` | `i in [start, n − (k − len) ]` | `go(i + 1)` | `len(path) == k` |
| combination sum with reuse | `i in [start, n)` | `go(i)`: same index, reuse allowed | `remaining == 0` |
| permutations | every unused `i` | `go()` with a `used` array | `len(path) == n` |
| partitioning | every end `j > start` whose piece is valid | `go(j)` | `start == n` |
| constraint search | legal values for the next variable | `go(k + 1)` | all variables set |

Watch the subsets tree, where every node is an answer, then the combinations tree, where branches that cannot reach `k` items are cut before they are entered:

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3], "title": "Subsets by backtracking", "caption": "The visualiser uses the include-or-exclude form: each level decides one element, and the 2^3 = 8 leaves are the subsets. The start-index loop in the template produces the same 8 answers with one node per subset."}
```

```viz
{"type": "recursion", "algorithm": "combinations", "values": [1, 2, 3, 4, 5], "k": 3, "title": "Choose 3 of 5 with the enough-elements-left prune", "caption": "A branch that starts too late to collect 3 items is marked pruned instead of being explored."}
```

## Why the template is correct

**Each candidate is generated exactly once.** In the subsets form, the path to a node is a strictly increasing sequence of indices, because every call starts its loop at `start` and recurses with `i + 1`. A subset of distinct positions has exactly one increasing ordering, so it has exactly one node. That is why subsets need no deduplication and why `[3, 2]` is never generated after `[2, 3]`. Combination Sum passes `i` instead, so the index sequence is non-decreasing: one node per multiset.

**The duplicate skip loses nothing.** At one level, suppose `nums[i] == nums[i − 1]` with `i > start`. Any path that picks position `i` here can be rewritten to pick `i − 1` here instead, and the rest of the path is still available, because `i − 1`'s subtree may choose from positions `i, i + 1, …` while `i`'s subtree may only choose from `i + 1, …`. So the first copy's subtree already contains every value sequence the second would produce. Deeper in the tree, when `i == start`, the second copy is the *first* candidate at its level and is kept, which is how `[2, 2]` survives.

For permutations the rule `nums[i] == nums[i − 1] and not used[i − 1]` forces equal copies to be placed in left-to-right order. The mirror rule `used[i − 1]` also gives correct output, because it forces right-to-left order, but it prunes later: on `[1, 1, 1, 1, 2, 2, 2, 2]` the first makes 251 calls, the second 4,695, and generating everything into a set makes 109,601 (measured here).

**A prune must be monotone.** Cutting a branch is sound only if no extension of a doomed partial candidate can become valid. "Sum already exceeds the target" is monotone when every number is positive; with a negative candidate it is not, and with a zero candidate and reuse the recursion never terminates. `break` instead of `continue` needs one more fact: the candidates are sorted, so everything after a too-large candidate is too large.

**State is restored exactly.** The invariant is: on entry to `go`, the shared state (`path`, `used`, sets, marked cells) reflects exactly the choices on the current root-to-node path. Every "choose" line has a matching "unchoose" line after the recursive call. The find-first form breaks the pairing on purpose on the success path, because the state *is* the answer.

## Worked problems

### Subsets II

[Subsets II](/practice/subsets-ii): all distinct subsets of an array that may contain duplicates. [Subsets](/practice/subsets) is the same code without the skip line. Trace `subsets_with_dup([1, 2, 2])`:

| call `go(start)` | `path` on entry | recorded | loop body |
|---|---|---|---|
| go(0) | `[]` | `[]` | i=0 (1): choose → go(1) |
| go(1) | `[1]` | `[1]` | i=1 (2): choose → go(2) |
| go(2) | `[1, 2]` | `[1, 2]` | i=2 (2): `i > start` is false: choose → go(3) |
| go(3) | `[1, 2, 2]` | `[1, 2, 2]` | loop empty; return; pop |
| back in go(1) | `[1]` | | i=2: `i > start` and `nums[2] == nums[1]`: **skip** |
| back in go(0) | `[]` | | i=1 (2): choose → go(2) |
| go(2) | `[2]` | `[2]` | i=2 (2): `i > start` is false: choose → go(3) |
| go(3) | `[2, 2]` | `[2, 2]` | return; pop |
| back in go(0) | `[]` | | i=2: equal to i=1 at this level: **skip** |

Six calls, six distinct subsets, two branches cut. Each cut branch would have produced a whole duplicate subtree: the first a second `[1, 2]`, the second a second `[2]` and `[2, 2]`.

Two wrong versions are worth knowing. The rule `i > 0` also skips index 2 inside `go(2)` and returns `[[], [1], [1, 2], [2]]`, losing two answers. Generating every subset into a set of tuples is correct but pays for the whole unpruned tree: on ten 1s and ten 2s it makes 1,048,576 calls to find 121 distinct subsets (128 ms here), where the skip rule makes 121 calls (0.05 ms).

### Combination Sum

[Combination Sum](/practice/combination-sum): distinct positive candidates, unlimited reuse, every combination summing to `target`.

```python
def combination_sum(candidates, target):
    candidates = sorted(candidates)
    out, path = [], []

    def go(start, remaining):
        if remaining == 0:
            out.append(path[:])
            return
        for i in range(start, len(candidates)):
            c = candidates[i]
            if c > remaining:
                break                            # sorted: no later candidate fits either
            path.append(c)
            go(i, remaining - c)                 # i, not i + 1: reuse allowed
            path.pop()

    go(0, target)
    return out
```

Trace on `[2, 3, 6, 7]`, `target = 7`. Every call, in order:

| # | `go(start, remaining)` | `path` | what the loop does |
|---|---|---|---|
| 1 | (0, 7) | `[]` | 2 fits → call 2 |
| 2 | (0, 5) | `[2]` | 2 fits → call 3 |
| 3 | (0, 3) | `[2, 2]` | 2 fits → call 4 |
| 4 | (0, 1) | `[2, 2, 2]` | 2 > 1: **break**, three candidates never tried |
| | back in 3 | `[2, 2]` | 3 fits → call 5 |
| 5 | (1, 0) | `[2, 2, 3]` | **record** |
| | back in 3 | `[2, 2]` | 6 > 3: break |
| | back in 2 | `[2]` | 3 fits → call 6 |
| 6 | (1, 2) | `[2, 3]` | 3 > 2: break |
| | back in 2 | `[2]` | 6 > 5: break |
| | back in 1 | `[]` | 3 fits → call 7 |
| 7 | (1, 4) | `[3]` | 3 fits → call 8 |
| 8 | (1, 1) | `[3, 3]` | 3 > 1: break |
| | back in 7 | `[3]` | 6 > 4: break |
| | back in 1 | `[]` | 6 fits → call 9, then 7 fits → call 10 |
| 9 | (2, 1) | `[6]` | 6 > 1: break |
| 10 | (3, 0) | `[7]` | **record** |

Ten calls, output `[[2, 2, 3], [7]]`. Without the prune, recursing and returning when `remaining < 0`, the same input makes 28 calls. The gap grows with the input; measured on candidates `2..40` and target 40:

| prune | calls | time (CPython 3.14) |
|---|---|---|
| none: recurse, return when `remaining < 0` | 915,998 | 68 ms |
| `continue` when `c > remaining` | 37,338 | 20 ms |
| sort, then `break` when `c > remaining` | 37,338 | 5 ms |

`continue` and `break` make the same calls; `break` also skips the loop iterations over every larger candidate, which is the remaining factor of four. [Combination Sum II](/practice/combination-sum-ii) is this code with `go(i + 1, …)` and the `i > start` skip, because each candidate is used once and the input has duplicates.

### N-Queens

[N-Queens](/practice/n-queens): one queen per row, so the decision at depth `r` is a column. The prune is the attack check, made `O(1)` by three sets: columns, `r − c` diagonals (constant along `↘`) and `r + c` anti-diagonals (constant along `↙`).

```python
def solve_n_queens(n):
    out, cols, diag, anti, queens = [], set(), set(), set(), []

    def go(r):
        if r == n:
            out.append(["." * c + "Q" + "." * (n - c - 1) for c in queens])
            return
        for c in range(n):
            if c in cols or (r - c) in diag or (r + c) in anti:
                continue                         # prune: attacked
            cols.add(c); diag.add(r - c); anti.add(r + c); queens.append(c)
            go(r + 1)
            cols.discard(c); diag.discard(r - c); anti.discard(r + c); queens.pop()

    go(0)
    return out
```

Trace to the first solution for `n = 4`:

| row | columns tried | rejected because | placed |
|---|---|---|---|
| 0 | 0 | | c=0 |
| 1 | 0, 1, 2 | 0: column; 1: r−c = 0 is (0,0)'s diagonal | c=2 |
| 2 | 0, 1, 2, 3 | 0: column; 1: r+c = 3 is (1,2)'s anti-diagonal; 2: column; 3: r−c = −1 is (1,2)'s diagonal | none: **backtrack** |
| 1 | 3 | | c=3 |
| 2 | 0, 1 | 0: column | c=1 |
| 3 | 0, 1, 2, 3 | 0, 1, 3: columns; 2: r−c = 1 is (2,1)'s diagonal | none: **backtrack** |
| 2 | 2, 3 | 2: r−c = 0 is (0,0)'s diagonal; 3: column | none: backtrack |
| 0 | 1 | | c=1 |
| 1 | 0, 1, 2, 3 | 0: r+c = 1 is (0,1)'s anti-diagonal; 1: column; 2: r−c = −1 is (0,1)'s diagonal | c=3 |
| 2 | 0 | | c=0 |
| 3 | 0, 1, 2 | 0, 1: columns | c=2: **solution** `[1, 3, 0, 2]` |

Nine calls, eight placements, 18 of 26 tested cells rejected in `O(1)` each. Enumerating all solutions for `n = 4` takes 17 calls and finds the mirror `[2, 0, 3, 1]`; for `n = 8`, 2,057 calls find all 92. A version that re-scans earlier queens pays `O(n)` per test instead.

```viz
{"type": "recursion", "algorithm": "n-queens", "n": 4, "title": "4-queens to the first solution", "caption": "Attacked cells are rejected in O(1); a row with no safe column sends the search back to the previous row."}
```

### Word Search

[Word Search](/practice/word-search): does `word` appear as a path of adjacent cells, each used at most once? The decision is the next neighbour; the state is the set of cells on the current path, kept on the board itself by overwriting a cell with `#` and restoring it on the way out.

```python
def exist(board, word):
    R, C = len(board), len(board[0])

    def go(r, c, k):
        if board[r][c] != word[k]:
            return False                         # prune: wrong letter, or '#' (on the path)
        if k == len(word) - 1:
            return True
        ch, board[r][c] = board[r][c], "#"       # choose: mark as on the path
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < R and 0 <= nc < C and go(nr, nc, k + 1):
                board[r][c] = ch                 # restore before reporting success
                return True
        board[r][c] = ch                         # unchoose
        return False

    return any(go(r, c, 0) for r in range(R) for c in range(C))
```

Board `ABCE / SFCS / ADEE`, word `"ABCB"`, which needs the B twice:

| call | cell | `k` | result |
|---|---|---|---|
| 1 | (0,0) A | 0 | match, mark |
| 2 | (1,0) S | 1 | wants B: reject |
| 3 | (0,1) B | 1 | match, mark |
| 4 | (1,1) F | 2 | wants C: reject |
| 5 | (0,2) C | 2 | match, mark |
| 6–8 | (1,2) C, (0,3) E, (0,1) `#` | 3 | reject, reject, reject: the B is on the path; unmark (0,2) |
| 9 | (0,0) `#` | 2 | reject; unmark (0,1), then (0,0) |
| 10–22 | the other eleven start cells and (2,0)'s two neighbours | | nothing matches: **false** |

Call 8 is the point of the pattern: the only B adjacent to the C is the one already on the path, and the `#` makes that visible in `O(1)`. Delete the restoring line and the search leaks state across branches: on board `CAA / AAA / BCD` the word `"AAB"` returns false, because the first failed start leaves three A cells as `#` and the successful path through them is never found.

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| [Permutations](/practice/permutations) | loop over all indices with `used[]` | a node is an injective prefix |
| Permutations with duplicates | sort; skip if equal to the previous and the previous is unused | copies placed left to right only |
| [Letter Combinations](/practice/letter-combinations) | one decision per digit, candidates are its letters; no prune | output size is the product of letter counts |
| [Generate Parentheses](/practice/generate-parentheses) | two choices, prunes `open < n` and `close < open` | every prefix stays balanceable; output is the Catalan number, 16,796 at `n = 10` |
| Palindrome Partitioning | decision is the end `j` of the next piece; prune non-palindromes | a precomputed `is_pal[i][j]` table makes the check `O(1)` |
| Word Search II (many words) | walk a trie alongside the grid | [Trie pattern](/learn/interview-patterns/tree-and-graph-patterns/trie-pattern) |
| Bitmask state | `cols`, `diag`, `anti` as integers, iterate free bits with `x & -x` | same tree, cheaper nodes |
| Most-constrained first | choose the empty cell with the fewest legal digits | changes the order, never the set of solutions |
| Streaming output | `yield` a copy instead of appending to `out` | memory is the recursion depth, not the output |

## Complexity, derived

The cost is **nodes in the tree × work per node**, and each shape has a countable tree:

- **Subsets**: one node per subset, `2ⁿ`, each copying up to `n` elements: `O(n · 2ⁿ)`. Measured: 4,194,304 calls for `n = 22` in the count-only version.
- **Permutations**: `n!/(n − k)!` nodes at depth `k`; summed over `k` that is `⌊e · n!⌋`, 9,864,101 for `n = 10`, which matches the measured call count exactly. With the `O(n)` loop and copy per node, `O(n · n!)`.
- **Combinations of size `k`**: `C(n, k)` leaves, each copied in `O(k)`.
- **Combination Sum**: bounded by the number of non-decreasing sequences with sum at most the target; the prune is what keeps it near the output size.
- **Word Search**: `R · C` starts, then at most 4 choices at the first step and 3 after it (the cell you came from is marked): `O(R · C · 3^L)` for a word of length `L`.
- **N-Queens**: at most `n!` placements with the column rule alone, far fewer with the diagonals; the tree has 2,057 nodes for `n = 8`.

Space is the recursion depth plus the output: `O(n)` for the path and the sets, and the output itself, which for subsets of 20 elements is 151 MB in CPython.

## Under the hood

### What a call costs

CPython 3.14 on this machine made about 19 million trivial recursive calls per second (4.2 × 10⁶ in 216 ms), and about 9 million per second once each call runs a loop and a `used` check (the `n = 10` permutation tree in 1.1 s). Node 24 ran that same tree in 86 ms, about 13 times faster. The practical ceiling for an interview answer in Python is therefore a tree of around 10⁷ nodes; past that you need pruning, a different algorithm, or a compiled language.

`itertools` is written in C and keeps an index array per iterator: `itertools.permutations(range(9))` produced all 362,880 tuples in 22 ms against 180 ms for the recursive version, and `combinations(range(20), 10)` 184,756 tuples in 10 ms against 44 ms. Use it when the problem is plain enumeration with no pruning; it cannot skip a subtree, so it loses as soon as a prune exists.

### Memory: the output, not the stack

Storing all 2²⁰ subsets held 151 MB (tracemalloc), about 144 bytes per subset: a list object with its pointer array, plus the outer list's slot. The recursion itself holds `n` frames. A generator that `yield`s a tuple per node peaked at 10 KB and ran 1.5 times slower (564 ms against 369 ms), because each result travels up through every `yield from` level. If the caller only filters or counts, stream.

### Recursion depth

CPython's default limit is 1,000 frames (`sys.getrecursionlimit()`); Node 24 overflowed at 10,435 frames for a one-argument function and at 7,365 for a three-argument one, because the limit is a byte budget (about 1 MB of stack by default) rather than a frame count. Backtracking rarely hits either: the depth is the length of one candidate, and an exponential tree caps that near 20–30 before time runs out. The exceptions are decisions that do not branch much, such as partitioning a 2,000-character string where most cuts fail immediately. [Recursion design](/learn/algorithms/recursion-backtracking/recursion-design) has the frame mechanics and the explicit-stack conversion.

### Copying in JavaScript

`out.push(path)` stores a reference exactly as in Python; `[...path]` or `path.slice()` copies. The default `Array.prototype.sort()` compares values as strings, so `[10, 9, 1, 2].sort()` returns `[1, 10, 2, 9]`, and the duplicate skip, which relies on equal values being adjacent, still works but a `break` prune on "candidate exceeds remaining" silently cuts valid branches (see the failure modes). Always pass `(a, b) => a - b`.

### Where it runs at scale

Dependency resolution is this pattern in production. pip's resolver (resolvelib, the default since pip 20.3) chooses a candidate version for one requirement, recurses into its dependencies, and backtracks to the most recent choice when a later requirement conflicts; its `ResolutionTooDeep` error is a search budget running out on an exponential tree (pip passes resolvelib `max_rounds=200000`). The same levers apply: prune on the first conflict, and choose the most constrained requirement first.

## Failure modes

**Symptom: every recorded answer is empty, or all are identical.** Diagnosis: `out.append(path)` stores the shared list, which later pops empty. Fix: `path[:]` or `[...path]` at the moment of recording.

**Symptom: Word Search returns false for a word that is on the board; the result depends on which start cell is tried first.** Diagnosis: a missing restore; marks from a failed branch block later branches (the `"AAB"` case above). Fix: pair every mark with an unmark on every return path, including the success path if the caller reuses the board.

**Symptom: Subsets II or Combination Sum II misses answers such as `[2, 2]`.** Diagnosis: the skip compares against the wrong boundary (`i > 0` instead of `i > start`) or the input was not sorted. Fix: sort once; skip only among siblings.

**Symptom: correct on the samples, time limit on a hidden test with many duplicates.** Diagnosis: duplicates removed at the end with a set, so the full tree is walked: 1,048,576 calls instead of 121 on ten 1s and ten 2s. Fix: the sibling skip, which removes the subtree before it is entered.

**Symptom: Combination Sum returns too few combinations in JavaScript.** Diagnosis: the default sort is lexicographic, so `[2, 9, 10]` becomes `[10, 2, 9]`, and `break` on `c > remaining` stops at the 10 before trying the 2 and the 9: target 9 returns `[]` instead of `[[9]]` (run in Node 24). Fix: `sort((a, b) => a - b)`.

**Symptom: Sudoku reports success but the board still has dots.** Diagnosis: the find-first form undoes its move on the way out of the successful call. Fix: return `True` before the undo lines, as in the template.

## Trade-offs

| Approach | Speed (CPython) | Memory | Prunes and dedups | When |
|---|---|---|---|---|
| Recursive backtracking, append/pop | baseline | depth + output | yes | the interview default |
| `itertools` | 4–8× faster | lazy | no | plain enumeration, no constraints |
| Bitmask loop over `0..2ⁿ − 1` | 2.5× slower when it builds each subset (tests all `n` bits per mask) | `O(1)` per mask | no subtree skipping | subsets with `n ≤ 20` and a cheap per-mask test |
| Explicit stack of `(start, next choice)` | about the same | heap, not call stack | yes | depth beyond the recursion limit |
| Generator (`yield`) | 1.5× slower | depth only | yes | caller streams, filters or stops early |

## Interviewer follow-ups

**"Only return the number of combinations; the target is 10,000."** Model answer: the output no longer forces enumeration and the state `(i, remaining)` recurs, so it is the unbounded-knapsack count, `O(candidates · target)`, coins loop outside. Common wrong answer: keep backtracking and memoise the list of combinations per state, which stores the exponential output anyway.

**"Now `n` is 40 and you need every subset sum within a range."** Model answer: `2⁴⁰` is 10¹², so split into halves, enumerate `2²⁰` sums per half, sort one, and binary search or two-pointer the other: [meet in the middle](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation). Common wrong answer: "add more pruning", which cannot shrink an output-sized search.

**"N-Queens II: return the count, not the boards."** Model answer: same search, return 1 at a leaf and sum; with bitmasks the per-node cost drops but the tree is unchanged. Memoisation does not help because the state (three masks) almost never repeats. Common wrong answer: DP over rows, which loses the diagonal constraints.

**"Make it use all 16 cores" or "make it thread-safe".** Model answer: the only shared mutable state is `path` and the marks, so give each worker its own copy and split the tree at the top: one task per first choice (or per first two choices, for balance), merge the result lists at the end. No locks are needed on the hot path. In CPython use processes, or the free-threaded 3.13+ build, because the recursion is CPU-bound. Common wrong answer: one shared `path` behind a lock, which serialises the search.

**"The output is too large to hold in memory."** Model answer: turn the collector into a generator and let the caller consume it; peak memory drops from the output size to the depth. Common wrong answer: compressing the results, which still materialises them.

## What mid-level engineers get wrong

- **Recording the shared list.** Every answer ends up empty; the bug looks like a logic error and burns ten minutes.
- **Deduplicating with a set at the end.** Correct, but it walks the whole duplicate tree and signals that the source of duplicates was not understood.
- **`go(i + 1)` where reuse is allowed, or `go(i)` where it is not.** Read "each number may be used once" versus "unlimited times" and match it.
- **Pruning that is not monotone**: `break` on unsorted input, or "sum exceeds target" with negative numbers.
- **Marking cells globally in Word Search**, which turns it into flood fill and misses paths through cells visited by an earlier, failed path.
- **Not sizing the tree first.** Proposing permutations for `n = 12` (4.8 × 10⁸ leaves) without saying it will not finish in Python.
- **Undoing on success in the find-first form**, or forgetting that JavaScript's default sort is lexicographic.

## Exercises

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

```exercise
id: permutations-with-duplicates
title: Distinct permutations of a multiset
prompt: |
  `nums` may contain duplicates. Return every distinct permutation of
  `nums`, each as a list; the order of the permutations in the output does
  not matter, and no permutation may appear twice. An empty input has
  exactly one permutation, the empty list.

  Do not generate duplicates and remove them afterwards. Sort, keep a
  `used` array, and at each depth skip `nums[i]` when it equals
  `nums[i - 1]` and `nums[i - 1]` is not currently used.
languages: [python, javascript]
entry: permute_unique
starter:
  python: |
    def permute_unique(nums):
        # your code here
        return []
  javascript: |
    function permute_unique(nums) {
      // your code here (sort with (a, b) => a - b)
      return [];
    }
tests:
  - args: [[1, 1, 2]]
    expected: [[1, 1, 2], [1, 2, 1], [2, 1, 1]]
    any_order: true
  - args: [[1, 2, 3]]
    expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
    any_order: true
  - args: [[2, 2, 2]]
    expected: [[2, 2, 2]]
    label: all equal
  - args: [[]]
    expected: [[]]
    label: empty input
  - args: [[-1, 2, -1]]
    expected: [[-1, -1, 2], [-1, 2, -1], [2, -1, -1]]
    any_order: true
    label: negative values
  - args: [[3, 3, 0, 3]]
    expected: [[0, 3, 3, 3], [3, 0, 3, 3], [3, 3, 0, 3], [3, 3, 3, 0]]
    any_order: true
    hidden: true
  - args: [[1, 2, 1, 2]]
    expected: [[1, 1, 2, 2], [1, 2, 1, 2], [1, 2, 2, 1], [2, 1, 1, 2], [2, 1, 2, 1], [2, 2, 1, 1]]
    any_order: true
    hidden: true
hints:
  - "Record a copy of the path when its length equals len(nums); an empty input records one empty list."
  - "Skip index i when used[i] is true."
  - "Also skip it when i > 0, nums[i] == nums[i - 1] and used[i - 1] is false: equal copies must be placed left to right."
```

## Senior signals

- You **size the tree from the bound** before coding ("`n ≤ 10` and all orderings: about 10⁷ nodes, a second in Python") and say when the bound rules backtracking out.
- You write **choose / explore / unchoose** as visibly paired lines and can point to the line whose absence corrupts sibling branches, with a concrete failing input.
- You justify the **duplicate skip by the recursion tree** (equal siblings root identical subtrees; the first copy's subtree is a superset) and know the permutation form and why `not used[i − 1]` prunes earlier than `used[i − 1]`.
- You state the **monotonicity condition** for each prune, and why `break` needs sorted, positive candidates.
- You know **Combination Sum I and II differ by `i` versus `i + 1` and one skip line**, and say so.
- You draw the **backtracking-versus-DP line** in one sentence, and answer "count only" with DP and "`n = 40`" with meet in the middle.
- You know what the runtime costs: about 10⁷ calls per second in CPython, `itertools` in C when nothing is pruned, 1,000 frames of recursion, and that parallelising means splitting at the root, not locking the path.

## Check yourself

```quiz
- q: >-
    A subsets solution records out.append(path) instead of out.append(path[:]). What is the output for [1, 2]?
  options: ["An exception, since a list is appended to itself", "[[], [1], [1, 2], [2]], which is correct", "[[1, 2], [1, 2], [1, 2], [1, 2]], the deepest state", "[[], [], [], []], four refs to one emptied list"]
  answer: 3
  explanation: >-
    path is one shared list mutated by every append and pop. Each recorded entry is a reference to it, and after the recursion unwinds it is empty. Copying at the moment of recording snapshots the state.
- q: >-
    In Subsets II on sorted input, why is the duplicate skip written as i > start and nums[i] == nums[i - 1] rather than i > 0 and nums[i] == nums[i - 1]?
  options: ["The start version is only needed for permutations", "i > 0 is correct, and i > start is the actual bug here", "i > 0 would also skip a copy chosen deeper, losing [2, 2]", "They are equivalent once the input has been sorted"]
  answer: 2
  explanation: >-
    Equal values at one level root identical subtrees, so only the first is taken, and i > start restricts the skip to siblings. The second copy is still needed as a continuation of a branch that already took the first, which happens when i == start in the deeper call; i > 0 would skip it there and return [[], [1], [1, 2], [2]].
- q: >-
    On ten 1s and ten 2s, generating all subsets into a set of tuples makes 1,048,576 calls, while the sibling-skip version makes 121. Why is the gap so large?
  options: ["Hashing tuples is slow, and that cost dominates the run", "The skip version returns fewer subsets than the set does", "Sorting the input first is what saves most of the work", "The set walks each duplicate subtree; the skip enters none"]
  answer: 3
  explanation: >-
    Both return the same 121 distinct subsets. The set version still visits all 2^20 nodes of the unpruned tree and discards duplicates afterwards, while the skip rule refuses to enter a subtree that would only repeat an earlier sibling, so the call count equals the output size.
- q: >-
    Combination Sum sorts the candidates and uses break when c > remaining. The candidates are 2 to 40 and the target is 40. Compared with continue, break changes what?
  options: ["It skips the remaining loop iterations; calls stay the same", "It makes the search incorrect when candidates are sorted", "Nothing; the two keywords compile to identical bytecode", "It cuts the number of recursive calls by a factor of 25"]
  answer: 0
  explanation: >-
    continue already avoids the recursive call for a candidate that is too large, so both make 37,338 calls here. break additionally stops scanning the larger candidates after it, which is only sound because the list is sorted and positive; that removed about three quarters of the running time in the measurement.
- q: >-
    Word Search on board CAA / AAA / BCD returns false for the word AAB, which is present. Which bug fits that symptom?
  options: ["A failed path left its cells marked, blocking later paths", "The search should use BFS so it finds the shortest path", "The recursion should check bounds after reading the cell", "Neighbours must be tried in reading order to find it"]
  answer: 0
  explanation: >-
    Marking a cell as on the path is correct; not restoring it when the branch fails leaks the mark into every later branch and every later start cell. The first failed start leaves three A cells marked, and the valid path through them is never found. Every mark needs an unmark on the way out.
- q: >-
    The interviewer asks you to use all cores to enumerate every N-Queens solution for n = 14. What is the sound design?
  options: ["Run one thread per row, each placing its row's queen", "Memoise on the three masks so that workers share results", "Share one path and three sets behind a single mutex", "Give each worker a first-row column and its own state"]
  answer: 3
  explanation: >-
    The subtrees under different first choices are independent, so splitting at the root needs no locks: each worker owns its path and masks and returns its solutions for a final merge. A shared locked path serialises the search, the mask state almost never repeats so memoisation buys nothing, and rows are sequential decisions that cannot run in parallel.
```

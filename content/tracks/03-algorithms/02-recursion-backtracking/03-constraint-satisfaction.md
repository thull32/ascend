---
slug: constraint-satisfaction
title: "Constraint satisfaction: N-queens, sudoku and word search"
description: How pruning, choice ordering and compact state turn an exponential search into one that finishes, worked on N-queens with bitmasks, sudoku with most-constrained-first, and grid DFS with in-place marking.
minutes: 50
difficulty: hard
tags: [backtracking, pruning, n-queens, sudoku, word-search, bitmask, csp]
problems: [n-queens, sudoku-solver, word-search, palindrome-partitioning]
---
Place eight queens on a chessboard so none attacks another. Fill a sudoku grid. Find whether a word can be traced through adjacent cells of a letter grid. Schedule 40 talks into 6 rooms with no speaker in two places at once. Each of these is a search over an exponential space of assignments, and each has constraints that most assignments violate. The whole art is to detect the violation as early as possible, before you have spent time extending a partial assignment that was already doomed, and to try the choices most likely to lead somewhere first.

Backtracking without pruning on 8-queens tries $64^8 \approx 2.8 \times 10^{14}$ placements. With the obvious constraint (one queen per row) and a check only at the leaf, it visits 19,173,961 nodes. With column and diagonal checks at each placement it visits 2,057. Same problem, same template from the [previous lesson](/learn/algorithms/recursion-backtracking/generating-combinatorial-objects); the difference is entirely in what you refuse to explore, and this lesson counts it.

## Anatomy of a constraint search

A **constraint satisfaction problem** has variables (row 0's queen, cell (3,4) of the sudoku), a domain per variable (columns 0–7, digits 1–9), and constraints between variables (no shared column, no repeated digit in a box). Backtracking assigns one variable at a time and checks constraints as soon as they become checkable.

```python
def solve(assignment):
    if complete(assignment):
        return assignment
    var = choose_unassigned_variable(assignment)          # ordering heuristic
    for value in ordered_domain(var, assignment):         # ordering heuristic
        if consistent(var, value, assignment):            # pruning: check now, not at the leaf
            assignment[var] = value
            result = solve(assignment)
            if result is not None:
                return result                             # stop at first solution
            del assignment[var]
    return None
```

Four levers move the running time by orders of magnitude:

1. **Check constraints incrementally.** Reject a partial assignment the moment it breaks a rule. Checking only complete assignments is the 19-million-node version.
2. **Represent the constraint state so the check is O(1).** Sets or bitmasks of "columns used", "digits used in row r", rather than rescanning the board.
3. **Order the variables: most constrained first.** Assign the variable with the fewest remaining legal values. It either fails fast (pruning a large subtree early) or has few branches.
4. **Order the values: least constraining first,** or whichever heuristic the problem suggests. For "find any solution" problems, the order of values decides how long you search before hitting one.

None of this changes the worst case. Sudoku is NP-complete in general (on `n² × n²` boards), N-queens has exponentially many solutions to enumerate, and a bad instance can defeat any heuristic. What ordering and pruning buy you is that *typical* instances, which is what the interview and usually production hands you, finish in milliseconds instead of never.

## N-queens

Variables: one queen per row (that already encodes "no two in a row"). Domain: the column. Constraints: no shared column, no shared diagonal.

The diagonal check is the piece candidates get wrong. A cell $(r, c)$ lies on the "down-right" diagonal indexed by $r - c$ (constant along it) and the "down-left" anti-diagonal indexed by $r + c$. Two queens attack diagonally exactly when they share either index. Three sets, three O(1) checks.

```python
def solve_n_queens(n):
    solutions = []
    cols, diag, anti = set(), set(), set()
    queens = []                                # queens[r] = column of queen in row r
    def place(r):
        if r == n:
            solutions.append(queens.copy()); return
        for c in range(n):
            if c in cols or (r - c) in diag or (r + c) in anti:
                continue                       # prune: this cell is attacked
            cols.add(c); diag.add(r - c); anti.add(r + c); queens.append(c)
            place(r + 1)
            queens.pop(); anti.remove(r + c); diag.remove(r - c); cols.remove(c)
    place(0)
    return solutions
```

```viz
{"type": "recursion", "algorithm": "n-queens", "n": 4,
 "title": "4-queens: rows are levels, pruned columns never get a subtree"}
```

### The 4-queens search, step by step

Every row of this table is one column tried; the last column names the set that rejected it, or the placement it produced.

| row | column | `cols` | `r − c` in `diag`? | `r + c` in `anti`? | outcome |
|---|---|---|---|---|---|
| 0 | 0 | | | | place (0,0): `cols={0}`, `diag={0}`, `anti={0}` |
| 1 | 0 | in `cols` | | | rejected |
| 1 | 1 | | `0` in `{0}` | | rejected |
| 1 | 2 | | `−1` no | `3` no | place (1,2): `diag={0,−1}`, `anti={0,3}` |
| 2 | 0 | in `cols` | | | rejected |
| 2 | 1 | | `1` no | `3` in `{0,3}` | rejected |
| 2 | 2 | in `cols` | | | rejected |
| 2 | 3 | | `−1` in `{0,−1}` | | rejected: row 2 dead, unchoose (1,2) |
| 1 | 3 | | `−2` no | `4` no | place (1,3): `diag={0,−2}`, `anti={0,4}` |
| 2 | 0 | in `cols` | | | rejected |
| 2 | 1 | | `1` no | `3` no | place (2,1) |
| 3 | 0, 1 | in `cols` | | | rejected |
| 3 | 2 | | `1` in `{0,−2,1}` | | rejected |
| 3 | 3 | in `cols` | | | rejected: row 3 dead, unchoose (2,1) |
| 2 | 2 | | `0` in `{0,−2}` | | rejected |
| 2 | 3 | in `cols` | | | rejected: row 2 dead, unchoose (1,3), then (0,0) |
| 0 | 1 | | | | place (0,1): `cols={1}`, `diag={−1}`, `anti={1}` |
| 1 | 0 | | `1` no | `1` in `{1}` | rejected |
| 1 | 1 | in `cols` | | | rejected |
| 1 | 2 | | `−1` in `{−1}` | | rejected |
| 1 | 3 | | `−2` no | `4` no | place (1,3) |
| 2 | 0 | | `2` no | `2` no | place (2,0) |
| 3 | 0, 1 | in `cols` | | | rejected |
| 3 | 2 | | `1` no | `5` no | place (3,2): solution `[1, 3, 0, 2]` |

Seventeen calls to `place` find the first solution and, continuing, the mirror `[2, 0, 3, 1]`. Every rejection above happened at the moment the conflicting queen was proposed, one row after the queen it conflicts with, and never deeper.

### Counting what pruning buys

These are node counts (calls to `place`) measured with the code in this lesson, enumerating *all* solutions; the leaf-only counts for `n = 8` are computed as $\sum_{k=0}^{8} 8^k$ rather than run:

| pruning | 4-queens | 6-queens | 8-queens | solutions |
|---|---|---|---|---|
| one queen per row, check at the leaf | 341 | 55,987 | 19,173,961 | 2 / 4 / 92 |
| + column check at placement | 65 | 1,957 | 109,601 | same |
| + both diagonal checks at placement | 17 | 153 | 2,057 | same |
| bitmask state, same checks | 17 | 153 | 2,057 | same |

Each lever is a separate factor: the column check divides the 8-queens tree by 175, the diagonal checks divide it by another 53. Bitmasks do not change the tree at all; they change the cost per node, which the next section measures. Solution counts grow fast but the pruned search stays far below the domain size: 12-queens has 14,200 solutions and its full enumeration is still under a second in a compiled language.

### Bitmask state

For $n \le 32$ the three sets fit in three integers, with bit $c$ of `cols` meaning "column $c$ is taken". Shifting the diagonal masks by one bit per row keeps the "same diagonal" relation without computing $r - c$ at all: a queen at column $c$ in row $r$ attacks column $c + 1$ in row $r + 1$ along one diagonal and $c - 1$ along the other.

```python
def total_n_queens(n):
    full = (1 << n) - 1
    def place(cols, d1, d2):
        if cols == full:
            return 1
        count = 0
        free = full & ~(cols | d1 | d2)         # bits of columns not attacked in this row
        while free:
            bit = free & -free                  # lowest set bit: next candidate column
            free ^= bit
            count += place(cols | bit, (d1 | bit) << 1 & full, (d2 | bit) >> 1)
        return count
    return place(0, 0, 0)
```

```javascript
function totalNQueens(n) {
  const full = (1 << n) - 1;
  function place(cols, d1, d2) {
    if (cols === full) return 1;
    let count = 0, free = full & ~(cols | d1 | d2);
    while (free) {
      const bit = free & -free;
      free ^= bit;
      count += place(cols | bit, ((d1 | bit) << 1) & full, (d2 | bit) >> 1);
    }
    return count;
  }
  return place(0, 0, 0);
}
```

`d1` is the set of columns attacked in the *next* row by down-right diagonals of queens above; shifting left by one each row moves it with the diagonal. `d2` does the same for down-left. The `& full` stops bits walking off the board. The state that used to be three sets and a list is now three integers passed by value, which also means there is nothing to unchoose. This is the standard competitive-programming form of [N-Queens](/practice/n-queens).

## Sudoku: choose the most constrained cell

A sudoku solver that fills cells in reading order and tries digits 1–9 works, and on hard puzzles it takes seconds to minutes in Python. The fix is lever 3: at each step, pick the empty cell with the fewest candidates. If some cell has zero candidates the branch is dead and you find out immediately; if a cell has one candidate you place it with no branching at all. Human solvers call the second case a "naked single"; search people call the heuristic **minimum remaining values (MRV)**.

State: for each row, column and $3 \times 3$ box, a bitmask of digits used. Candidate digits for cell $(r, c)$ are the bits *not* in `rows[r] | cols[c] | boxes[b]`.

```python
def solve_sudoku(board):                      # board: 9x9 list of ints, 0 = empty
    rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
    empties = []
    for r in range(9):
        for c in range(9):
            if board[r][c]:
                bit = 1 << board[r][c]
                rows[r] |= bit; cols[c] |= bit; boxes[r // 3 * 3 + c // 3] |= bit
            else:
                empties.append((r, c))

    def candidates(r, c):
        used = rows[r] | cols[c] | boxes[r // 3 * 3 + c // 3]
        return [d for d in range(1, 10) if not used >> d & 1]

    def solve():
        if not empties:
            return True
        # MRV: the empty cell with the fewest candidates
        idx = min(range(len(empties)), key=lambda i: len(candidates(*empties[i])))
        r, c = empties[idx]
        cands = candidates(r, c)
        if not cands:
            return False                       # dead end found before branching
        empties[idx], empties[-1] = empties[-1], empties[idx]
        empties.pop()
        b = r // 3 * 3 + c // 3
        for d in cands:
            bit = 1 << d
            board[r][c] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit
            if solve():
                return True
            board[r][c] = 0; rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit
        empties.append((r, c))
        empties[idx], empties[-1] = empties[-1], empties[idx]
        return False

    return solve()
```

### Counting what ordering buys

Measured on Peter Norvig's "hard" puzzle, `4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......` (17 givens; a full search confirms it has exactly one solution), with the code above and two variants, in CPython 3.14 on one machine:

| variable ordering | nodes to the first solution | wall time |
|---|---|---|
| reading order (first empty cell), digits 1–9 | 9,727,397 | 15.4 s |
| MRV (fewest candidates first) | 964 | 0.01 s |
| MRV + naked-singles propagation before each branch | 343 | 0.01 s |
| MRV, exhaustive search to prove uniqueness | 6,393 | 0.08 s |

The `min` over all empties costs up to $81 \times 9$ candidate computations per node, more than the reading-order version spends per node, and it is still a four-orders-of-magnitude net win. That trade, more work per node for far fewer nodes, is the shape of every good pruning decision. Proving uniqueness costs 6.6× more nodes than finding the solution, because the search can no longer stop at the first leaf and must exhaust every branch.

The "naked singles" row applies the next lever: after each placement, repeatedly place any cell whose candidate set has shrunk to one, and abandon the branch if any cell's set is empty. That is **forward checking**, and the section on what happens under the hood describes its general form, arc consistency.

## Word search: DFS on an implicit graph

[Word Search](/practice/word-search) asks whether `word` can be traced through horizontally or vertically adjacent cells, each cell used at most once. The variables are "which cell is letter $i$ of the word", the domain is the four neighbours of the previous cell, and the constraints are "matches the letter" and "not already used on this path".

The grid is a graph you never build; the recursion walks it ([depth-first search](/learn/data-structures/graphs/depth-first-search)). The standard trick for the visited set is to overwrite the cell in place and restore it on backtrack, which is choose/unchoose applied to the board itself.

```python
def exist(board, word):
    R, C = len(board), len(board[0])
    def dfs(r, c, i):
        if i == len(word):
            return True
        if r < 0 or r >= R or c < 0 or c >= C or board[r][c] != word[i]:
            return False                              # prune: off-board, used, or wrong letter
        saved, board[r][c] = board[r][c], "#"         # choose: mark used
        found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1)
                 or dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))
        board[r][c] = saved                           # unchoose
        return found
    return any(dfs(r, c, 0) for r in range(R) for c in range(C))
```

The `#` marker works because no letter equals `#`, so a used cell fails the letter check on revisit; the visited set costs zero extra memory. Watch how a grid DFS marks cells and never re-enters them:

```viz
{"type": "graph", "algorithm": "grid-islands",
 "grid": [[1,1,0,0],[0,1,0,1],[0,0,0,1],[1,0,1,1]],
 "title": "Grid DFS: each visited cell is marked so the search never loops"}
```

### Complexity, honestly

From each of the $R \cdot C$ start cells, the first step has up to 4 neighbours and every later step at most 3 (the cell you came from is marked), so the bound is $O(R \cdot C \cdot 3^{L})$ for a word of length $L$. On a $6 \times 6$ board of `A`s with the word `AAAAAAAAAAAB` (eleven `A`s then a `B`), the DFS explores of the order of $36 \times 3^{10} \approx 2 \times 10^{6}$ paths before concluding that no `B` exists, and the number triples with every extra `A`. Pruning that matters:

- **Letter frequency check.** If the word needs four `E`s and the board has three, return false before searching. $O(RC + L)$, and it defeats the board-of-`A`s case outright.
- **Reverse the word if its last letter is rarer than its first.** Starting from the rare end means far fewer start cells and earlier failures. Same answer, since a path is a path in both directions.
- **Early letter check before recursing**, as above, rather than recursing and checking at the top. It halves the call count.

For many words on one board ([Word Search II](/practice/word-search-ii)), run one DFS from each cell that walks a [trie](/learn/data-structures/tries-and-string-structures/tries) of all the words at the same time: the pruning becomes "the current path is not a prefix of any word", which is far stronger than any single-word check, and words sharing a prefix are found by the same walk. Two refinements make it fast: record each found word once and remove it from the trie (delete leaf nodes as they empty) so the search never re-finds it, and stop descending when a trie node has no children left. With 10⁴ words the alternative, 10⁴ separate searches, repeats the same prefix walks thousands of times.

## Palindrome partitioning: constraints on the cut

[Palindrome Partitioning](/practice/palindrome-partitioning) asks for every way to cut a string into palindromic pieces. The choice at each level is "where does the next piece end", and the constraint is "that piece is a palindrome". The pruning is not recursing on non-palindromic pieces, and the precomputation lever is a table `is_pal[i][j]` filled once in $O(n^2)$ so the check inside the search is O(1) instead of $O(n)$. The output can be exponential (a string of identical letters has $2^{n-1}$ partitions), so the bound is again output-dominated. This one is the direct bridge to the [next lesson](/learn/algorithms/recursion-backtracking/from-backtracking-to-memoisation): if the question changes from "list all partitions" to "minimum number of cuts", the enumeration disappears and a DP over the cut position takes over.

## Under the hood

### Isolating the lowest set bit

**`free & -free` in two's complement.** Negation is complement-plus-one. Complementing `x` flips every bit; adding one then carries through the trailing 1s of the complement (which were the trailing 0s of `x`) until it reaches the first 0 of the complement, which is the lowest set bit of `x`, and turns it into a 1. So `-x` agrees with `x` on the lowest set bit and every bit below it, and is the complement of `x` above it; AND-ing keeps exactly the lowest set bit. Example: `x = 0b10100`, `~x = …01011`, `-x = …01100`, `x & -x = 0b00100`. Python integers are arbitrary precision with a conceptually infinite sign extension, so the identity holds for any `n`. JavaScript's bitwise operators work on 32-bit signed integers: `1 << 31` is negative and `(1 << 32) - 1` is 0, so the bitmask solver is safe for `n <= 30` and needs `BigInt` beyond that. More such identities are in [bit manipulation](/learn/foundations/math-for-engineers/bit-manipulation).

### Why bitmasks are faster in CPython

The set version does three `in` tests, three `add`s and three `remove`s per placement, each a method call that hashes an integer and probes a table, plus a list append and pop. The bitmask version does a handful of integer operations on small ints, which the interpreter handles on its fast path with no calls. Measured on this machine (CPython 3.14), enumerating all 724 solutions of 10-queens takes 17 ms with sets and 5 ms with bitmasks: 3.7× faster for an identical 2,057-style tree. The ratio depends on the interpreter version and is larger in compiled languages, where the bitmask version is a few instructions per node.

### Forward checking and arc consistency

Backtracking with incremental checks only notices a conflict when it tries to *assign* the conflicting value. Forward checking looks one step ahead: after assigning `X = v`, remove `v` from the domain of every unassigned variable that shares a constraint with `X`; if any domain becomes empty (a **wipe-out**), the branch is dead now, not several levels later. Arc consistency (AC-3) goes further. An *arc* is an ordered pair `(X, Y)` of variables that share a constraint; it is consistent when every value left in `X`'s domain has at least one compatible value in `Y`'s. AC-3 keeps a queue of arcs, pops one, deletes from `X`'s domain every value with no support in `Y`, and, if anything was deleted, pushes every arc `(Z, X)` back onto the queue so the neighbours re-check against the shrunken domain. It runs in $O(e \cdot d^3)$ for `e` arcs and domain size `d`; for sudoku, 81 cells with 20 peers each give 1,620 arcs and `d = 9`. [Norvig's well-known solver](https://norvig.com/sudoku.html) is forward checking plus the "hidden single" rule (a digit with only one possible cell in a unit), with MRV search on top; on his list of 95 hard puzzles it considers 64 possibilities per puzzle on average and never searches more than 16 squares. Industrial SAT and CP solvers are this machinery plus clause learning and restarts, which is why a 40-talks-into-6-rooms schedule is a solver call, not a hand-written search.

## Ordering heuristics compared

| strategy | cost per node | nodes (Norvig's hard puzzle) | when it pays |
|---|---|---|---|
| reading order, digits 1–9 | O(1) to pick the cell | 9.7 × 10⁶ | never, once MRV is available |
| MRV | O(81 · 9) candidate scans | 964 | always; the default |
| MRV + naked singles (forward checking) | one propagation sweep per placement | 343 | hard puzzles; cheap to add |
| full arc consistency (AC-3) per node | O(e · d³) worst case | often no branching at all | when domains interact strongly; the solver default |
| N-queens, sets | ~9 hash operations per node | 2,057 (n = 8) | prototype |
| N-queens, bitmasks | a few integer ops per node | 2,057 (n = 8) | production; 3.7× faster here |

## Quantified costs

- **Tree sizes for 8-queens:** 1.9 × 10⁷ nodes with leaf-only checks, 1.1 × 10⁵ with column checks, 2.1 × 10³ with column and diagonal checks. Each lever is a factor of 50–200.
- **Sudoku on a 17-clue puzzle:** 9.7 × 10⁶ nodes in reading order (15 s in CPython 3.14 here) against 964 with MRV: a factor of 10⁴ from choosing which cell to fill next.
- **Word search worst case:** $R \cdot C \cdot 3^{L}$; the 12-letter word on a $6 \times 6$ board of identical letters is of the order of $10^6$ paths, and every additional letter triples it. A letter-count pre-check costs $O(RC + L)$.
- **Bitmask N-queens memory:** three machine words per level of recursion, `n` levels; the set version holds three sets of up to `n` entries (a few hundred bytes of hash table each in CPython, which resizes a set past five entries) plus the queens list.

## Failure modes

**The solver reports no solution for an instance that has one.** Symptom: `total_n_queens(8)` returns a number below 92, or a sudoku solver returns false on a puzzle a human can solve. Diagnosis: a `return` inside the loop skipped the unchoose, or one of the three sets is not restored, so state leaks between branches and later columns look attacked. Fix: make choose and unchoose symmetric and adjacent (the same three lines in reverse), or pass state by value (the bitmask version has nothing to undo).

**Intermittent false negatives when word searches run in parallel.** Symptom: the same board and word give `true` alone and `false` under load. Diagnosis: two threads share the board and both mark cells in place with `#`; one thread's marks block the other's path. Fix: a per-search visited structure (a bitmask of `R · C` bits or a copy of the board), or never share the mutated input across threads; see [races and invariants](/learn/systems/concurrency/races-mutexes-and-invariants).

**8-queens takes 20 seconds in Python.** Symptom: the solution count is right but the search visits about 19 million nodes. Diagnosis: the diagonal and column constraints are checked at the leaf, not at placement. Fix: check at placement with O(1) state; the tree drops to 2,057 nodes.

**A word search request never returns.** Symptom: one client-supplied board hangs a worker; the board is all one letter and the word is that letter repeated followed by a different one. Diagnosis: exponential exploration of paths that cannot end. Fix: the letter-frequency pre-check, and a rare-end start; for a multi-word service, the trie-driven search.

**`RecursionError` on a long word.** Symptom: a 1,500-letter word on a 40 × 40 board crashes at depth 1,000. Diagnosis: the DFS recursion is one frame per letter and CPython's default limit is 1,000. Fix: an explicit stack of `(r, c, i, next_direction)` frames, or reject words longer than the cell count up front (a path cannot revisit cells, so `L > R · C` is impossible).

## Interviewer follow-ups

**"Your sudoku solver is fast on this puzzle. What input defeats it?"** Model answer: the problem is NP-complete in general, so for `n² × n²` boards there are instances that force exponential search regardless of ordering; on 9 × 9, puzzles with few givens and no forced moves make MRV branch early, though even the hardest published ones are hundreds to thousands of nodes with MRV. Common wrong answer: "MRV makes it polynomial".

**"Count all solutions instead of finding one. What changes?"** Model answer: remove the early return so every branch is exhausted; on the hard puzzle that is 6,393 nodes against 964, and for N-queens it is the full tree; then use symmetry: try only the first-row columns in the left half and double the count (handling the middle column separately for odd `n`). Common wrong answer: rerun the find-one solver with the found solution excluded, once per solution.

**"Find one placement of 10⁶ queens."** Model answer: search is the wrong tool; there are explicit constructive placements for every `n >= 4` (formulas based on `n mod 6`) that produce a valid board in $O(n)$, and the question is testing whether you recognise an output-sized closed form. Common wrong answer: backtracking with bitmasks, which cannot represent a 10⁶-bit board efficiently and has no guarantee of finishing.

**"Word Search II with 10⁴ words: why one trie rather than 10⁴ DFS runs?"** Model answer: shared prefixes are searched once; a DFS from each cell descends the trie and prunes the moment the path is not a prefix of any remaining word; found words are deleted from the trie so they are never re-found. Common wrong answer: build a set of words and check each path against it, which has no prefix pruning and still explores every path.

**"Is the bitmask solver correct in JavaScript for `n = 32`?"** Model answer: no; bitwise operators coerce to 32-bit signed integers, `1 << 31` is negative and `(1 << 32) - 1` is 0, so `n <= 30` is safe and beyond that you need `BigInt` or an array of words. Common wrong answer: "JavaScript numbers are 64-bit doubles, so 53 bits are available" (true for arithmetic, not for `&`, `|`, `<<`).

## What mid-level engineers get wrong

- **Checking constraints at the leaf.** Consequence: a 19-million-node tree where 2,057 would do; the code is correct and 10,000× too slow.
- **Rescanning the board for conflicts.** An $O(n)$ check per placement instead of $O(1)$ state. Consequence: another factor of `n` on every node.
- **Indexing an array by `r − c`.** It ranges over `−(n−1)..n−1`; a list of `2n − 1` needs `r − c + n − 1`. Consequence: negative indices wrap silently in Python and read the wrong diagonal.
- **Copying a visited set per call.** `visited | {cell}` allocates $O(RC)$ per node. Consequence: the search is memory-bound rather than branch-bound.
- **`return True` before the unchoose.** Consequence: correct on the first solution and wrong on every search that continues, including counting.
- **Believing MRV changes the worst case.** Consequence: promising a latency bound on an NP-complete problem.

## Exercises

```exercise
id: count-n-queens
title: Count N-queens solutions
prompt: |
  Implement `total_n_queens(n)` returning the number of ways to place `n`
  queens on an `n × n` board so that no two attack each other (`n >= 1`).

  Use one queen per row, prune on columns and both diagonals before
  recursing, and keep the attacked-column state in sets or bitmasks so
  each check is O(1). The test with `n = 8` should finish in well under
  a second.
languages: [python, javascript]
entry: total_n_queens
starter:
  python: |
    def total_n_queens(n):
        # your code here
        return 0
  javascript: |
    function total_n_queens(n) {
      // your code here
      return 0;
    }
tests:
  - args: [4]
    expected: 2
  - args: [1]
    expected: 1
    label: one queen on a 1x1 board
  - args: [3]
    expected: 0
    label: no solution exists
  - args: [5]
    expected: 10
  - args: [6]
    expected: 4
  - args: [8]
    expected: 92
    hidden: true
  - args: [7]
    expected: 40
    hidden: true
hints:
  - "Cells (r, c) on the same down-right diagonal share r - c; on the same anti-diagonal they share r + c."
  - "With bitmasks: free = full & ~(cols | d1 | d2); pick bit = free & -free; recurse with (d1 | bit) << 1 and (d2 | bit) >> 1."
  - "Return the sum of counts from each legal column in the current row; when every row is placed, return 1."
```

```exercise
id: word-search-grid
title: Word search on a letter grid
prompt: |
  Implement `exist(board, word)`: `board` is a rectangular grid given as a
  list of rows, each row a list of single-character strings; `word` is a
  non-empty string. Return `true` if `word` can be formed by a path of
  horizontally or vertically adjacent cells that uses no cell more than
  once, otherwise `false`.

  Mark cells in place while they are on the current path and restore them
  when you backtrack.
languages: [python, javascript]
entry: exist
starter:
  python: |
    def exist(board, word):
        # your code here
        return False
  javascript: |
    function exist(board, word) {
      // your code here
      return false;
    }
tests:
  - args: [[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "ABCCED"]
    expected: true
  - args: [[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "SEE"]
    expected: true
  - args: [[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "ABCB"]
    expected: false
    label: would need to reuse the B
  - args: [[["a"]], "a"]
    expected: true
    label: single cell
  - args: [[["a","b"]], "ba"]
    expected: true
    hidden: true
  - args: [[["a","a"]], "aaa"]
    expected: false
    hidden: true
    label: word longer than any simple path
hints:
  - "dfs(r, c, i) succeeds when i == len(word); fail fast when out of bounds or board[r][c] != word[i]."
  - "Overwrite board[r][c] with a marker such as '#' before recursing into neighbours and restore it after."
  - "Try every cell as a starting point; return as soon as one start succeeds."
```

## Senior signals

- You separate the four levers, **incremental checking, O(1) constraint state, variable ordering, value ordering**, you say which one you are pulling, and you can put a measured factor on each (175× and 53× for 8-queens; 10⁴× for MRV on a hard sudoku).
- You know the diagonal identities $r - c$ and $r + c$ cold, you can write the **bitmask N-queens** with shifted diagonal masks, and you can explain `free & -free` in two's complement.
- You explain **MRV** as a trade of more work per node for exponentially fewer nodes, and you can describe **forward checking and AC-3** (arc queue, support, domain wipe-out) as the next steps up.
- You use **in-place marking** for grid DFS and you can say why it is safe and when it is not (concurrent readers, immutable input).
- You are honest that the worst case is **exponential**, you can name the adversarial input and its cost, and you offer cheap global pre-checks that defeat it.
- You notice when a "find all" question turns into a "count" or "minimum" question and you switch from search to **dynamic programming**, and when a "find one" question has a **constructive closed form** and needs no search at all.

## Check yourself

```quiz
- q: >-
    In N-queens, queens at (2, 5) and (4, 3) attack each other because:
  options: ["They share the same column index c", "They do not attack each other at all", "They share r - c, a down-right diagonal", "They share r + c, a down-left diagonal"]
  answer: 3
  explanation: >-
    2 + 5 = 7 and 4 + 3 = 7: same anti-diagonal. r - c gives -3 and 1, different down-right diagonals; columns 5 and 3 differ.
- q: >-
    A sudoku solver that fills cells in reading order takes minutes on a hard puzzle. The change most likely to make it fast is:
  options: ["Always filling the empty cell with the fewest candidates first", "Replacing the used-digit sets with bitmasks per unit", "Converting the recursion to a loop with an explicit stack", "Trying the digits 9 to 1 instead of 1 to 9 in each cell"]
  answer: 0
  explanation: >-
    MRV (choosing the most constrained cell at each step) finds dead ends before branching and takes forced moves with no branching, cutting the tree from millions of nodes to under a thousand on the measured puzzle. Bitmasks and an explicit stack only change the cost per node, and digit order rarely matters much.
- q: >-
    In the word search DFS, why does overwriting board[r][c] with '#' work as a visited set?
  options: ["It is faster to compare than a visited-set lookup", "An explicit '#' test at the top rejects used cells", "It removes the cell from the implicit graph permanently", "No word letter equals '#', so revisits fail the check"]
  answer: 3
  explanation: >-
    Marking makes the cell fail the same comparison used for wrong letters, so revisits are pruned by the existing check, with no separate '#' test and zero extra memory. The removal is not permanent: restoring the letter on the way out keeps other paths correct.
- q: >-
    Word search on a 6x6 board filled with 'A' for the word 'AAAAAAAAAAAB' (11 As then a B) is slow. Which pre-check avoids the search entirely?
  options: ["Check that the word fits in the 36 board cells", "Cap the recursion depth at 6, the width of the board", "Compare the letter counts of the board and the word", "Start the DFS from the centre cell of the board"]
  answer: 2
  explanation: >-
    The board has no B, so a frequency count rejects the instance in O(R·C + L). Checking the length passes (12 cells fit in 36), and a start cell or depth cap does not remove the exponential number of A-paths the DFS explores before discovering there is never a B to finish on.
- q: >-
    The bitmask N-queens passes (d1 | bit) << 1 to the next row. What does d1 represent at the moment the next row reads it?
  options: ["Columns already holding a queen in any row above", "Columns hit in the next row along down-left diagonals", "Columns hit in the next row by down-right diagonals", "Attacks from both diagonal directions, merged"]
  answer: 2
  explanation: >-
    A queen at column c attacks column c + 1 one row down along the down-right diagonal; shifting the accumulated mask left by one moves every such attack to the next row. cols tracks columns; d2, shifted right, tracks the down-left direction, so the two diagonals stay in separate masks.
- q: >-
    Switching the 8-queens solver from three Python sets to three bitmask integers made it about 3.7× faster on one machine. What did the change do to the search tree?
  options: ["It halved the tree by exploiting the mirror symmetry of the board", "It pruned the tree further, since masks encode both diagonals at once", "It removed the leaf checks, so only interior nodes are visited", "Nothing: the same 2,057 nodes, each processed with cheaper operations"]
  answer: 3
  explanation: >-
    Bitmasks are a representation change: the same constraints are checked at the same moments, so the tree is identical, but each check is a few integer operations instead of hashed set lookups and method calls. Pruning, symmetry and leaf checks are separate levers that the representation does not touch.
```

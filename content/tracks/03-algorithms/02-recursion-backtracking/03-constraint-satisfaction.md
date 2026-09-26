---
slug: constraint-satisfaction
title: "Constraint satisfaction: N-queens, sudoku and word search"
description: How pruning, choice ordering and compact state turn an exponential search into one that finishes, worked on N-queens with bitmasks, sudoku with most-constrained-first, and grid DFS with in-place marking.
minutes: 45
difficulty: hard
tags: [backtracking, pruning, n-queens, sudoku, word-search, bitmask, csp]
problems: [n-queens, sudoku-solver, word-search, palindrome-partitioning]
---
Place eight queens on a chessboard so none attacks another. Fill a sudoku grid. Find whether a word can be traced through adjacent cells of a letter grid. Schedule 40 talks into 6 rooms with no speaker in two places at once. Each of these is a search over an exponential space of assignments, and each has constraints that most assignments violate. The whole art is to detect the violation as early as possible, before you have spent time extending a partial assignment that was already doomed, and to try the choices most likely to lead somewhere first.

Backtracking without pruning on 8-queens tries $64^8 \approx 2.8 \times 10^{14}$ placements. With the obvious constraint (one queen per row) it is $8^8 \approx 1.7 \times 10^7$. With column and diagonal checks at each placement it visits about 2,000 nodes. Same problem, same template from the [previous lesson](/learn/algorithms/recursion-backtracking/generating-combinatorial-objects); the difference is entirely in what you refuse to explore.

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

1. **Check constraints incrementally.** Reject a partial assignment the moment it breaks a rule. Checking only complete assignments is the $64^8$ version.
2. **Represent the constraint state so the check is O(1).** Sets or bitmasks of "columns used", "digits used in row r", rather than rescanning the board.
3. **Order the variables: most constrained first.** Assign the variable with the fewest remaining legal values. It either fails fast (pruning a large subtree early) or has few branches.
4. **Order the values: least constraining first,** or whichever heuristic the problem suggests. For "find any solution" problems, the order of values decides how long you search before hitting one.

None of this changes the worst case. Sudoku is NP-complete in general, N-queens has exponentially many solutions to enumerate, and a bad instance can defeat any heuristic. What ordering and pruning buy you is that *typical* instances, which is what the interview and usually production hands you, finish in milliseconds instead of never.

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

Trace $n = 4$. Row 0 tries column 0. Row 1: columns 0 (same column) and 1 (diagonal $r-c = 0$) are pruned; column 2 is placed. Row 2: column 0 is in `cols = {0, 2}`, pruned. Column 1: $r - c = 1$ is not in `diag = {0, -1}`, but $r + c = 3$ is in `anti = {0, 3}` (the queen at (1,2) has $1 + 2 = 3$): pruned. Column 2 is in `cols`. Column 3: $r - c = -1$ matches (1,2): pruned. Row 2 has no options, so row 1 backtracks to column 3, and so on. The first solution is columns `[1, 3, 0, 2]`; the second is its mirror `[2, 0, 3, 1]`.

Solution counts grow fast but the search stays feasible far beyond what the domain size suggests: $n = 8$ has 92 solutions and visits about 2,000 nodes; $n = 12$ has 14,200 solutions and takes well under a second in a compiled language.

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

`d1` is the set of columns attacked in the *next* row by down-right diagonals of queens above; shifting left by one each row moves it with the diagonal. `d2` does the same for down-left. The `& full` stops bits walking off the board. The state that used to be three sets and a list is now three integers passed by value, which also means there is nothing to unchoose. This runs several times faster than the set version and is the standard competitive-programming form of [N-Queens](/practice/n-queens).

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

The `min` over all empties costs $O(81 \cdot 9)$ per node, which is more than the reading-order version spends per node, and it is still a large net win: the number of nodes drops from hundreds of thousands to typically under a hundred on published "hard" puzzles. That trade, more work per node for far fewer nodes, is the shape of every good pruning decision.

The next level, which you should be able to describe but will not be asked to code, is **forward checking** and **constraint propagation**: after placing a digit, recompute the candidate sets of every affected cell and, if any drops to one, place it too, cascading. Peter Norvig's well-known solver does exactly this and solves almost all puzzles with no backtracking at all. The general version is arc consistency (AC-3), which is what SAT and CP solvers do at industrial scale.

## Word search: DFS on an implicit graph

[Word Search](/practice/word-search) asks whether `word` can be traced through horizontally or vertically adjacent cells, each cell used at most once. The variables are "which cell is letter $i$ of the word", the domain is the four neighbours of the previous cell, and the constraints are "matches the letter" and "not already used on this path".

The grid is a graph you never build; the recursion walks it. The standard trick for the visited set is to overwrite the cell in place and restore it on backtrack, which is choose/unchoose applied to the board itself.

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

Worst case is $O(R \cdot C \cdot 3^{L})$ for a word of length $L$: every start cell, then at most three unvisited neighbours per step after the first. Pruning that matters in practice:

- **Letter frequency check.** If the word needs four `E`s and the board has three, return false before searching. Cheap, and it defeats the adversarial test case of a board full of `A`s and a word `AAAAAAAAB`.
- **Reverse the word if its last letter is rarer than its first.** Starting from the rare end means far fewer start cells and earlier failures. Same answer, since a path is a path in both directions.
- **Early letter check before recursing**, as above, rather than recursing and checking at the top. It halves the call count.

For many words on one board ([Word Search II](/practice/word-search-ii)), the search is driven by a trie instead of a single word, so that one DFS pass discovers every word sharing a prefix; pruning becomes "this prefix is not in the trie", which is far stronger than any single-word check.

## Palindrome partitioning: constraints on the cut

[Palindrome Partitioning](/practice/palindrome-partitioning) asks for every way to cut a string into palindromic pieces. The choice at each level is "where does the next piece end", and the constraint is "that piece is a palindrome". The pruning is simply not recursing on non-palindromic pieces, and the precomputation lever is a table `is_pal[i][j]` filled once in $O(n^2)$ so the check inside the search is O(1) instead of $O(n)$. The output can be exponential (a string of identical letters has $2^{n-1}$ partitions), so the bound is again output-dominated. This one is the direct bridge to the DP module: if the question changes from "list all partitions" to "minimum number of cuts", the enumeration disappears and a DP over the cut position takes over.

## A pruning checklist

When you write a constraint search in an interview, run down this list out loud:

1. Which constraint can I check at placement time rather than at the leaf?
2. What state makes that check O(1) (sets, bitmasks, counts)?
3. Which variable should I assign next (most constrained)?
4. Is there a cheap global test that rules the instance out entirely (letter counts, parity, sum bounds)?
5. What is the worst case, honestly, and what input would trigger it?

Question 5 is the one interviewers use to separate levels. "It's exponential in the worst case, here is the input that triggers it, and here is why the typical case is far better" is a senior answer. "It's fast" is not.

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

- You separate the four levers, **incremental checking, O(1) constraint state, variable ordering, value ordering**, and you say which one you are pulling and why.
- You know the diagonal identities $r - c$ and $r + c$ cold, and you can write the **bitmask N-queens** with shifted diagonal masks.
- You explain **MRV** (most constrained variable first) as a trade of more work per node for exponentially fewer nodes, and you know that constraint propagation is the next step up.
- You use **in-place marking** for grid DFS and you can say why it is safe and when it is not (concurrent readers, immutable input).
- You are honest that the worst case is **exponential**, you can name the adversarial input, and you offer cheap global pre-checks that defeat it.
- You notice when a "find all" question turns into a "count" or "minimum" question and you switch from search to **dynamic programming**.

## Check yourself

```quiz
- q: >-
    In N-queens, queens at (2, 5) and (4, 3) attack each other because:
  options: ["They share a column", "They share r - c", "They share r + c", "They do not attack each other"]
  answer: 2
  explanation: >-
    2 + 5 = 7 and 4 + 3 = 7: same anti-diagonal. r - c gives -3 and 1, different down-right diagonals; columns 5 and 3 differ.
- q: >-
    A sudoku solver that fills cells in reading order takes minutes on a hard puzzle. The change most likely to make it fast is:
  options: ["Switching from sets to lists for the used-digit checks", "Choosing the empty cell with the fewest candidates at each step", "Trying digits 9 to 1 instead of 1 to 9", "Converting recursion to an explicit stack"]
  answer: 1
  explanation: >-
    MRV finds dead ends before branching and takes forced moves with no branching, cutting the tree from hundreds of thousands of nodes to typically under a hundred. Digit order rarely matters much; the other options change constants only.
- q: >-
    In the word search DFS, why does overwriting board[r][c] with '#' work as a visited set?
  options: ["The runner ignores '#' characters", "No letter of the word equals '#', so a revisited cell fails the letter check", "It makes the recursion tail-recursive", "It reduces the branching factor to two"]
  answer: 1
  explanation: >-
    Marking makes the cell fail the same comparison used for wrong letters, so revisits are pruned by the existing check, with zero extra memory. Restoring the letter on the way out keeps other paths correct.
- q: >-
    Word search on a 6x6 board filled with 'A' for the word 'AAAAAAAAAAAB' (11 As then a B) is slow. Which pre-check avoids the search entirely?
  options: ["Sort the board rows", "Check the board contains at least as many of each letter as the word needs", "Start the search from the centre cell", "Limit recursion depth to 6"]
  answer: 1
  explanation: >-
    The board has no B, so a frequency count rejects the instance in O(R·C + L). Without it the DFS explores an exponential number of A-paths before discovering there is never a B to finish on.
- q: >-
    The bitmask N-queens passes (d1 | bit) << 1 to the next row. What does d1 represent at the moment the next row reads it?
  options: ["The set of columns already holding queens", "The columns attacked in the next row by down-right diagonals of queens above", "The number of queens placed so far", "The mirror image of cols"]
  answer: 1
  explanation: >-
    A queen at column c attacks column c + 1 one row down along one diagonal; shifting the accumulated mask left by one moves every such attack to the next row. cols tracks columns; the two diagonal masks track the two diagonal directions.
```

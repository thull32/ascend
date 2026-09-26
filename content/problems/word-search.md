---
slug: word-search
title: Word Search
difficulty: medium
patterns: [backtracking]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 6
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Start a search from every cell whose letter matches `word[0]`. From a cell, the next letter must be in one of four neighbours that has not been used on the current path."
  - "Mark a cell as used by overwriting it (for example with `#`) before recursing and restore it afterwards. That is the backtracking step and it avoids a separate visited set."
  - "Check bounds, the used marker and the letter match at the top of the recursion so each call is short; return `True` as soon as the last letter matches."
signatures:
  python:
    name: exist
    starter: |
      def exist(board: list[list[str]], word: str) -> bool:
          pass
  javascript:
    name: exist
    starter: |
      function exist(board, word) {
      }
tests:
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "trie"]
    expected: true
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "the"]
    expected: true
    label: path turns a corner
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "trap"]
    expected: true
    label: snaking path
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "tree"]
    expected: false
    label: second e is not adjacent
  - args: [[["a"]], "a"]
    expected: true
    label: single cell
  - args: [[["a"]], "ab"]
    expected: false
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "heae"]
    expected: false
    hidden: true
    label: would need to reuse a cell
  - args: [[["a", "b"], ["c", "d"]], "abdc"]
    expected: true
    hidden: true
  - args: [[["a", "b"], ["c", "d"]], "acbd"]
    expected: false
    hidden: true
    label: no diagonal moves
  - args: [[["t", "r", "i", "e"], ["h", "e", "a", "p"], ["s", "o", "r", "t"]], "hear"]
    expected: true
    hidden: true
  - args: [[["x", "x", "x"], ["x", "y", "x"], ["x", "x", "x"]], "xxxxxxxxy"]
    expected: true
    hidden: true
    label: must walk the whole perimeter before the centre
time_limit_ms: 4000
---
Given a grid of lowercase letters `board` and a string `word`, return `true` if `word` can be spelled by starting at some cell and moving to a horizontally or vertically adjacent cell for each following letter, never using the same cell twice.

### Examples

| Input | Output | Why |
|---|---|---|
| board `[["t","r","i","e"],["h","e","a","p"],["s","o","r","t"]]`, `"trap"` | `true` | `t(2,3) → r(2,2) → a(1,2) → p(1,3)` |
| same board, `"tree"` | `false` | After `t, r, e` there is no unused `e` adjacent |
| same board, `"heae"` | `false` | The only `e` adjacent to `a` is the one already used |

### Constraints

- `1 ≤ rows, cols ≤ 6`
- `1 ≤ len(word) ≤ 15`
- Letters are lowercase English

### Follow-up

The interviewer asks: "The word is `aaaaaaaaaab` and the board is all `a`s. What happens, and what pruning helps?" Then: "Now I have a hundred thousand words to check against the same board. Do you run this a hundred thousand times?"

## Solution

### The naive approach

There is no polynomial shortcut for the general problem; it is a constrained path search. The question is whether the search is written so that dead ends are abandoned immediately and cells are never reused. A first attempt that carries a `visited` set copied at every step is correct but allocates `O(L)` per call and hides the backtracking idea.

### The insight

Depth-first search with undo. At cell `(r, c)` matching `word[i]`, mark the cell as used, try the four neighbours for `word[i + 1]`, then unmark. The marking is what enforces "no reuse" along the current path, and the unmarking is what lets other paths through the same cell. Overwriting the cell's letter with a sentinel does both jobs with no extra memory: a used cell simply never matches any letter.

### The optimal approach

```python
def exist(board: list[list[str]], word: str) -> bool:
    rows, cols = len(board), len(board[0])

    def dfs(r: int, c: int, i: int) -> bool:
        if board[r][c] != word[i]:
            return False
        if i == len(word) - 1:
            return True
        saved = board[r][c]
        board[r][c] = "#"
        found = (
            (r > 0 and dfs(r - 1, c, i + 1))
            or (r + 1 < rows and dfs(r + 1, c, i + 1))
            or (c > 0 and dfs(r, c - 1, i + 1))
            or (c + 1 < cols and dfs(r, c + 1, i + 1))
        )
        board[r][c] = saved
        return found

    return any(dfs(r, c, 0) for r in range(rows) for c in range(cols))
```

Each of the `rows · cols` starting cells begins a search with branching factor at most 3 after the first step (you never go back the way you came), so the worst case is `O(rows · cols · 3^L)`. Space `O(L)` for the recursion; the board itself is the visited set.

Two cheap prunes that matter on adversarial input: reject immediately if the board has fewer of some letter than the word needs, and if the word's first letter is more common on the board than its last letter, search for the reversed word instead so the search starts from the rarer end.

### Common mistakes

- Not restoring the cell after the recursive calls, so a failed path poisons later ones.
- Checking bounds inside the neighbour call but after indexing the board, which raises on `-1` in some languages and silently wraps in Python.
- Comparing `board[r][c] == word[i]` after marking, which never matches.

### How to discuss it

Say "DFS with undo; the board doubles as the visited set." Give the `3^L` bound honestly and then the two prunes. For the all-`a` follow-up, the letter-count check rejects the word (`b` is absent) before any search; without it the search explores every self-avoiding path of length 10, which is the exponential case. For the hundred-thousand-words follow-up, the answer is to invert the loop and search once with a trie of all words, which is Word Search II.

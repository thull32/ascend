---
slug: word-search-ii
title: Word Search II
difficulty: hard
patterns: [trie]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, uber, airbnb]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/trie-pattern
hints:
  - "Running the single-word DFS once per word repeats the same board walks for words that share a prefix. What structure lets one DFS check every word at once?"
  - "Put all the words in a trie and let the DFS walk the trie and the board in lockstep. If the current board cell has no matching trie child, that path can never produce any word, so stop."
  - "When a word is found, mark it so it is emitted once, and prune leaf nodes that can no longer lead to an unfound word. Without pruning, boards full of one letter get very slow."
signatures:
  python:
    name: find_words
    starter: |
      def find_words(board: list[list[str]], words: list[str]) -> list[str]:
          pass
  javascript:
    name: find_words
    starter: |
      function find_words(board, words) {
      }
tests:
  - args: [[["c", "a", "t", "s"], ["o", "r", "e", "p"], ["d", "o", "g", "s"]], ["cat", "cats", "dog", "dogs", "car", "cod", "cog", "step", "rat", "spot"]]
    expected: ["cat", "cats", "dog", "dogs", "car", "cod", "step", "rat"]
    any_order: true
  - args: [[["a", "a"]], ["aaa", "aa"]]
    expected: ["aa"]
    any_order: true
    label: a cell cannot be reused
  - args: [[["z"]], ["z", "zz", "a"]]
    expected: ["z"]
    any_order: true
    label: single cell
  - args: [[["a", "b"], ["c", "d"]], ["abdc", "abcd", "acdb", "dbac", "ad"]]
    expected: ["abdc", "acdb", "dbac"]
    any_order: true
    label: no diagonal moves
  - args: [[["p", "e", "n"], ["i", "l", "t"], ["c", "k", "e"]], ["pen", "pelt", "lick", "kite", "tin", "pick", "let", "net", "kilt", "lent", "tek"]]
    expected: ["pen", "pelt", "lick", "pick", "lent", "tek"]
    any_order: true
  - args: [[["a", "b", "a"], ["b", "a", "b"]], ["ab", "ba", "aba", "bab", "abab"]]
    expected: ["ab", "ba", "aba", "bab", "abab"]
    any_order: true
    hidden: true
    label: a word reachable several ways appears once
  - args: [[["a"]], []]
    expected: []
    any_order: true
    hidden: true
    label: no words
  - args: [[["x", "x", "x"], ["x", "x", "x"], ["x", "x", "x"]], ["xxxxxxxxx", "xxxxxxxxxx", "x"]]
    expected: ["xxxxxxxxx", "x"]
    any_order: true
    hidden: true
    label: repeated letters need pruning
time_limit_ms: 4000
---
You are given a grid of lowercase letters `board` and a list of distinct `words`. Return every word from the list that can be spelled by starting at some cell and moving to a horizontally or vertically adjacent cell for each following letter, never using a cell twice within one word. The result may be in any order; each found word appears once, however many paths spell it.

### Examples

| Input | Output | Why |
|---|---|---|
| board `[["c","a","t","s"],["o","r","e","p"],["d","o","g","s"]]`, words `["cat","car","cog","step"]` | `["cat","car","step"]` | `car` turns down from `a` to `r`; `cog` fails because no `g` touches an `o` reachable from `c` |
| board `[["a","a"]]`, words `["aa","aaa"]` | `["aa"]` | Only two cells exist, so `aaa` would reuse one |
| board `[["a","b"],["c","d"]]`, words `["abdc","ad"]` | `["abdc"]` | `a` and `d` are diagonal, not adjacent |

### Constraints

- `1 ≤ rows, cols ≤ 12`
- `1 ≤ len(words) ≤ 3 × 10⁴`, `1 ≤ len(words[i]) ≤ 10`, all distinct
- Letters are lowercase English

### Follow-up

The interviewer asks: "Your board is all the letter `a` and the word list is `a`, `aa`, ..., `aaaaaaaaaa`. What happens to your solution and how do you fix it?" Then: "The word list is now a full dictionary of 200,000 words and the board is 12×12. Where does the time go?"

## Solution

### The naive approach

For each word, run the single-word backtracking search from every cell. Each search is `O(rows · cols · 4^L)` in the worst case, and you repeat it for every word, so `O(W · rows · cols · 4^L)`. Words that share a prefix (`cat`, `cats`, `catch`) redo identical board walks.

### The insight

Invert the loop: instead of "for each word, walk the board", do "walk the board once, and at each step ask the dictionary which words are still possible". A trie answers that question in `O(1)` per step: if the current cell's letter is not a child of the current trie node, no word in the whole list continues along this path, so the DFS stops. A single DFS from each cell therefore finds all words simultaneously, and the trie does the pruning that the per-word approach could not.

### The optimal approach

Build the trie, storing the complete word at its terminal node so you do not have to rebuild strings. Run a DFS from each cell that carries the current trie node. On entering a cell, look up the letter; if the child exists, mark the cell used, recurse in four directions, then restore. When a node holds a word, add it to the result and clear it so it is not emitted again. After exploring a child, if it has become a leaf with no word, delete it from its parent: this is what keeps the all-`x` boards fast, because once a word is found or a branch is exhausted the trie shrinks and later DFS paths stop earlier.

```python
def find_words(board: list[list[str]], words: list[str]) -> list[str]:
    root: dict = {}
    for w in words:
        node = root
        for ch in w:
            node = node.setdefault(ch, {})
        node["$"] = w

    rows, cols = len(board), len(board[0])
    found: list[str] = []

    def dfs(r: int, c: int, parent: dict) -> None:
        ch = board[r][c]
        node = parent.get(ch)
        if node is None:
            return
        word = node.pop("$", None)
        if word is not None:
            found.append(word)
        board[r][c] = "#"
        if r > 0:
            dfs(r - 1, c, node)
        if r + 1 < rows:
            dfs(r + 1, c, node)
        if c > 0:
            dfs(r, c - 1, node)
        if c + 1 < cols:
            dfs(r, c + 1, node)
        board[r][c] = ch
        if not node:
            del parent[ch]

    for r in range(rows):
        for c in range(cols):
            dfs(r, c, root)
    return found
```

Building the trie is `O(total letters in words)`. The search is `O(rows · cols · 4^L)` in the theoretical worst case, but the trie stops each path the moment it stops matching any word, and the leaf pruning removes words as they are found, so real inputs run in a small fraction of that. Space is `O(total letters)` for the trie plus `O(L)` recursion.

### Common mistakes

- Forgetting to restore the cell after the recursive calls, which silently blocks later paths.
- Emitting a word every time its terminal node is reached instead of once; clearing the marker (`pop("$")`) fixes it.
- Skipping the leaf pruning. The solution is still correct, but the hidden all-same-letter test exists precisely to catch the exponential blow-up on repeated letters.
- Checking the four neighbours before checking whether the current letter matches the trie, which wastes a level of recursion per cell.

### How to discuss it

Say the inversion out loud: "a trie lets one DFS over the board match all the words at once, and it prunes every path that cannot complete any word." Explain the two pruning mechanisms separately: the trie child lookup (structural) and the leaf deletion after a word is found (dynamic). For the all-`a` follow-up, the answer is the leaf pruning plus, if needed, a check that the board contains enough of each letter for a word before inserting it into the trie. For the 200,000-word follow-up, time goes into the trie build and into DFS branches through common prefixes; if the board is fixed and queries arrive over time you would instead index the board (every path up to length 10 from every cell is a bounded set) and look words up against it.

---
slug: trie-pattern
title: "Trie: the tree you build when the problem is about prefixes"
description: Recognise prefix, wildcard and many-words-against-one-text problems, write the node-and-children trie from memory, and see Implement Trie, Add and Search Words and Word Search II traced node by node.
minutes: 32
difficulty: medium
tags: [trie, prefix-tree, strings, dfs, pattern:trie]
problems: [implement-trie, design-add-search-words, word-search-ii, replace-words]
---
You have a dictionary of words and the questions are about their *beginnings*: does any word start with these letters, which words share this prefix, what is the shortest root of this word, can this pattern with wildcards match anything. A hash set answers "is this exact word present" in `O(L)` and nothing else; "does any word start with `pre`" becomes a scan of the whole set. Sorting the words and binary searching helps for prefixes but not for wildcards, and it does not let you walk a text and a dictionary together.

A trie is a tree whose edges are letters and whose root-to-node paths are prefixes. Every word in the dictionary is a path from the root, and every prefix shared between words is a shared path. That sharing is the whole point: a prefix query walks one path of length `L` regardless of how many words the dictionary holds, a wildcard branches into the children at that node and nowhere else, and a grid search can ask "is there any word continuing with this letter" at every step and abandon the branch the moment the answer is no.

## The signal

Reach for a trie when the statement contains any of these:

- **"Starts with", "prefix", "autocomplete", "words beginning with"**: the defining operation. [Implement Trie](/practice/implement-trie) is the API in its pure form.
- **A search with wildcards or a pattern that can branch** ("`.` matches any letter"): [Design Add and Search Words](/practice/design-add-search-words). The branching is a DFS over children at the wildcard position.
- **Many words matched against one text, board or stream**: [Word Search II](/practice/word-search-ii), "replace each word with its shortest root" ([Replace Words](/practice/replace-words)), streaming character-by-character matching. The trie lets you advance through *all* words simultaneously with one pointer.
- **"Longest common prefix" of many strings**, "shortest unique prefix for each word", "count words with a given prefix": store a count at each node and the answer is one walk.
- **Bitwise problems phrased as "maximum XOR of two numbers"**: a binary trie over the bits, walking greedily to the opposite bit. Same structure, alphabet of size 2.

What rules it out:

- **Exact membership only.** A hash set is `O(L)` per lookup with far less memory and code. If no operation cares about prefixes, do not build a trie.
- **Substring search** (does the pattern occur *anywhere* in the text): tries index prefixes, not substrings. That is KMP, rolling hash, or a suffix structure; see [String matching](/learn/data-structures/tries-and-string-structures/string-matching).
- **Sorted-order queries** ("the 100 words after `apple` alphabetically"): a sorted array or balanced tree is simpler. A trie can do it with an in-order walk, but it is not its strength.
- **Memory is tight and the alphabet is large.** A trie node with a 26-slot array costs about 200 bytes in Python; a million nodes is a real cost. Dictionary-based children or a compressed (radix) trie reduce it, at the price of code.

The confusable pattern is "hash map keyed by prefix": insert every prefix of every word into a set, then prefix queries are `O(1)`. It works for `startsWith` and costs `O(total length²)` space in the worst case; it cannot do wildcards or grid-walking. Mention it as the quick alternative and explain why the trie generalises.

## The template

A node holds a map (or fixed array) from character to child, and a flag marking the end of a word. Insert walks and creates; search walks and checks the flag; prefix walks and checks existence.

```python
class TrieNode:
    __slots__ = ("children", "end")
    def __init__(self):
        self.children = {}          # char -> TrieNode
        self.end = False

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.end = True

    def _walk(self, s):
        node = self.root
        for ch in s:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def search(self, word):
        node = self._walk(word)
        return node is not None and node.end

    def starts_with(self, prefix):
        return self._walk(prefix) is not None
```

```javascript
class TrieNode {
  constructor() { this.children = new Map(); this.end = false; }
}

class Trie {
  constructor() { this.root = new TrieNode(); }
  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.end = true;
  }
  _walk(s) {
    let node = this.root;
    for (const ch of s) {
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }
  search(word) { const n = this._walk(word); return n !== null && n.end; }
  starts_with(prefix) { return this._walk(prefix) !== null; }
}
```

Every operation is `O(L)` in the length of the argument, independent of how many words are stored. That independence is the property to say out loud; it is what a hash set cannot give for prefixes. Space is `O(total characters)` in the worst case (no shared prefixes) and much less when words share beginnings.

The `end` flag is what separates `search` from `starts_with`: after inserting `apple`, the node for `app` exists (so `starts_with("app")` is true) but its flag is false (so `search("app")` is false). Forgetting the flag, or checking `node is not None` alone in `search`, is the most common trie bug.

Watch words share paths and diverge:

```viz
{"type": "trie", "algorithm": "insert-search", "operations": [["insert", "car"], ["insert", "card"], ["insert", "care"], ["insert", "cat"], ["search", "car"], ["search", "ca"], ["prefix", "ca"], ["search", "cart"]], "title": "Trie insert and search", "caption": "car, card and care share three nodes; search(ca) fails on the end flag while prefix(ca) succeeds."}
```

## Worked problems

### Implement Trie

[Implement Trie](/practice/implement-trie): `insert`, `search`, `startsWith`, exactly the template.

Trace a sequence on an empty trie, showing the path and the flag checked:

| operation | path walked | result and reason |
|---|---|---|
| `insert("apple")` | root → a → p → p → l → e (all created) | `e.end = True` |
| `search("apple")` | root → a → p → p → l → e | `True`: node exists and `end` is set |
| `search("app")` | root → a → p → p | `False`: node exists, `end` is false |
| `startsWith("app")` | root → a → p → p | `True`: node exists |
| `insert("app")` | root → a → p → p (all existing) | `p.end = True`, no new nodes |
| `search("app")` | root → a → p → p | `True` |
| `search("apply")` | root → a → p → p → l → y? | `False`: `l` has no child `y` |

Five nodes were created for `apple`; `app` added none. This is the sharing that makes a 100,000-word English dictionary fit in a few hundred thousand nodes rather than the sum of all word lengths.

The interviewer's follow-ups are about memory: a `dict` per node in Python is roughly 200+ bytes; an array of 26 references is fixed-size and faster for lowercase input but wastes slots on sparse nodes; a compressed trie merges chains of single-child nodes into one edge labelled with a string. Know the three and the trade-off (speed and simplicity versus memory).

### Design Add and Search Words

[Design Add and Search Words](/practice/design-add-search-words): `addWord` as before; `search(pattern)` where `.` matches any single letter.

At a literal character the walk continues as before. At a `.` the walk must try *every* child, which turns the loop into a DFS over `(node, position)`. The recursion is bounded by pattern length in depth and by the number of matching paths in breadth.

```python
class WordDictionary:
    def __init__(self):
        self.root = TrieNode()

    def add_word(self, word):
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.end = True

    def search(self, pattern):
        def dfs(node, i):
            if i == len(pattern):
                return node.end
            ch = pattern[i]
            if ch == ".":
                return any(dfs(child, i + 1) for child in node.children.values())
            nxt = node.children.get(ch)
            return nxt is not None and dfs(nxt, i + 1)
        return dfs(self.root, 0)
```

Trace after `addWord("bad")`, `addWord("dad")`, `addWord("mad")`, with `search(".ad")`:

| call `dfs(node, i)` | pattern char | action |
|---|---|---|
| (root, 0) | `.` | try children b, d, m in turn |
| (b, 1) | `a` | child `a` exists → (ba, 2) |
| (ba, 2) | `d` | child `d` exists → (bad, 3) |
| (bad, 3) | end of pattern | `bad.end` is True → **True** |

`any` short-circuits, so `d` and `m` are never tried. Now `search("b..")`: (root,0) → b; (b,1) `.` → only child `a`; (ba,2) `.` → only child `d`; (bad,3) → True. And `search(".a")`: after (b,1) → (ba,2), `i == len(pattern)` and `ba.end` is False; likewise for `da` and `ma`; return False. That last case is where a solution that forgets the `end` check goes wrong.

Time: `O(L)` for a pattern without wildcards; with wildcards, up to `O(26^k · L)` for `k` wildcards in the worst case, but in practice bounded by the number of stored words that match the literal characters. Say the worst case and the practical case both; the interviewer wants to hear that a pattern of all dots visits every node at that depth.

### Word Search II

[Word Search II](/practice/word-search-ii): a grid of letters and a list of words. Return every word that can be traced by a path of adjacent cells without reusing a cell.

Running [Word Search](/practice/word-search) once per word is `O(W · R · C · 4^L)`. The trie collapses the `W` factor: build a trie of all words, then DFS from every cell *carrying a trie node*. At each step, look for the next letter among the current node's children; if it is absent, the branch cannot lead to any word and you stop immediately. When you reach a node with `end` set, record the word. Two pruning moves make it fast enough for the hard test cases: store the whole word at its end node so you do not rebuild it, and clear the flag (or delete the leaf) once the word is found so it is never reported twice and dead branches shrink.

```python
def find_words(board, words):
    root = TrieNode()
    for w in words:                                   # build the trie once
        node = root
        for ch in w:
            node = node.children.setdefault(ch, TrieNode())
        node.word = w                                 # store the word at its end
    R, C = len(board), len(board[0])
    found = []

    def dfs(r, c, parent):
        ch = board[r][c]
        node = parent.children.get(ch)
        if node is None:
            return                                    # no word continues this way
        if getattr(node, "word", None):
            found.append(node.word)
            node.word = None                          # report once
        board[r][c] = "#"                             # mark visited
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < R and 0 <= nc < C and board[nr][nc] != "#":
                dfs(nr, nc, node)
        board[r][c] = ch                              # unmark
        if not node.children:                         # leaf now dead: prune it
            del parent.children[ch]

    for r in range(R):
        for c in range(C):
            dfs(r, c, root)
    return found
```

Trace on the board

```text
o a t
e t a
```

with words `["oat", "eat", "tea", "oaa"]`. The trie has root children `o`, `e`, `t`; `o → a → t (oat)` and `o → a → a (oaa)`, `e → a → t (eat)`, `t → e → a (tea)`.

| start cell | path attempted | trie step | outcome |
|---|---|---|---|
| (0,0) `o` | o | root has `o` | continue |
| | o → (1,0) `e` | `o` has only `a` | stop |
| | o → (0,1) `a` | `o` has `a` | continue |
| | o, a → (1,1) `t` | `a` has `t`, node stores `oat` | **record `oat`**, clear it |
| | o, a, t → (1,0) `e`, (1,2) `a` | `oat` node has no children | stop; on return the dead `t` leaf is deleted from `a` |
| | o, a → (0,2) `t` | `a` no longer has `t` | stop |
| (0,1) `a` | a | root has no `a` | stop at the first letter |
| (0,2) `t` | t → (1,2) `a`; t → (0,1) `a` | `t` has only `e` | stop |
| (1,0) `e` | e → (0,0) `o`; e → (1,1) `t` | `e` has only `a` | stop |
| (1,1) `t` | t → (1,0) `e` → (0,0) `o` | `te` has only `a` | stop |
| | t → (0,1) `a`; t → (1,2) `a` | `t` has only `e` | stop |
| (1,2) `a` | a | root has no `a` | stop |

Result `["oat"]`. `eat` is not on the board as a path (`e` at (1,0) neighbours `o` and `t`), `tea` needs `t → e → a` and the `e` at (1,0) is adjacent to no `a`, and `oaa` needs two `a`s in a row. Most start cells were rejected at the *first* letter because the root has only three children; that is the trie doing the work `W` separate searches would repeat.

Time is bounded by `O(R · C · 4 · 3^(L−1))` for the DFS, since the trie limits each step to at most one continuation per letter, plus `O(total word length)` to build the trie; in practice the pruning makes it far smaller.

### Replace Words

[Replace Words](/practice/replace-words): a dictionary of roots and a sentence; replace every word with the shortest root that is a prefix of it, if any.

Insert the roots, then for each word walk the trie and stop at the *first* node with `end` set. That gives the shortest root, because a shorter root would have set the flag on an earlier node.

```python
def replace_words(roots, sentence):
    trie = Trie()
    for r in roots:
        trie.insert(r)
    out = []
    for word in sentence.split():
        node, prefix = trie.root, ""
        for ch in word:
            node = node.children.get(ch)
            if node is None:
                break
            prefix += ch
            if node.end:
                break                                  # shortest root found
        out.append(prefix if node is not None and node.end else word)
    return " ".join(out)
```

With roots `["cat", "bat", "rat"]` and sentence `"the cattle was rattled by the battery"`: `the` → `t` is not in the trie, keep `the`; `cattle` → c, a, t and `t.end` is set, output `cat`; `was` → no `w`, keep; `rattled` → `rat`; `by` → keep; `battery` → `bat`. Output `"the cat was rat by the bat"`. Time `O(total root length + total sentence length)`.

## Variations

- **Count-per-node**: store `count` incremented on insert (and decremented on delete) at every node; "how many words start with `p`" is one walk, and deletion can prune nodes whose count hits 0.
- **Autocomplete / top-k completions**: walk to the prefix node, then DFS its subtree collecting words; for top-k by frequency, store a small sorted list of best completions at each node during insert.
- **Longest common prefix of many words**: insert all, walk from the root while the node has exactly one child and `end` is false.
- **Binary trie for maximum XOR**: insert each number's 32 bits high to low; for each query walk preferring the opposite bit at every level. `O(32)` per operation.
- **Streaming / Aho-Corasick**: for many patterns against a long text, the trie plus failure links matches every pattern in one pass. Name it; do not implement it in an interview unless asked.
- **Compressed (radix) trie**: merge single-child chains into string-labelled edges. Same API, `O(L)` operations, much less memory; used in routers and in-memory key-value stores.
- **Array children**: `[None] * 26` indexed by `ord(ch) - ord("a")` is faster than a dict for lowercase input and simpler to reason about, at 26 slots per node regardless of use.

## Pitfalls

- **Missing the `end` flag check in `search`.** Reachable is not the same as stored. `search("app")` after inserting only `apple` must be false.
- **Building the trie per query** in Word Search II, or per word. Build once; the whole point is amortising across words.
- **Not unmarking the board cell** after the DFS returns, or marking it before the trie check. Mark after confirming the letter is a valid continuation, and restore it on the way out.
- **Reporting duplicates** in Word Search II: the same word reachable from two paths. Clear the stored word at the end node when found.
- **Wildcard DFS without the end-of-pattern check**: returning true when the path exists but the pattern is exhausted at a non-terminal node.
- **Recursion depth**: the wildcard DFS is bounded by pattern length, the grid DFS by word length; both are fine. A recursive `insert` is not necessary and is slower.
- **Using a list of children and linear-scanning it.** Use a dict or a fixed array. A list is `O(alphabet)` per step and, worse, hides the intent.
- **Ignoring the alphabet.** Unicode input with a 26-slot array fails; ask what characters are possible before choosing the child representation.

## Exercise

```exercise
id: trie-with-prefix-count
title: Trie with prefix counting
prompt: |
  Implement a class `Trie` with three methods:

  - `insert(word)` adds `word` (may be called more than once with the same
    word; each call counts as another occurrence).
  - `count_prefix(prefix)` returns how many inserted words (counting
    repeats) start with `prefix`. The empty prefix counts every word.
  - `search(word)` returns `true` if `word` itself has been inserted at
    least once.

  Store a count at every node so `count_prefix` is a single walk.
languages: [python, javascript]
entry: Trie
starter:
  python: |
    class Trie:
        def __init__(self):
            # your code here
            pass

        def insert(self, word):
            pass

        def count_prefix(self, prefix):
            return 0

        def search(self, word):
            return False
  javascript: |
    class Trie {
      constructor() {
        // your code here
      }
      insert(word) {}
      count_prefix(prefix) { return 0; }
      search(word) { return false; }
    }
tests:
  - args: [["insert", "apple"], ["insert", "app"], ["count_prefix", "ap"], ["count_prefix", "app"], ["count_prefix", "apple"], ["search", "app"], ["search", "ap"]]
    expected: [null, null, 2, 2, 1, true, false]
  - args: [["count_prefix", "a"], ["search", "a"]]
    expected: [0, false]
    label: empty trie
  - args: [["insert", "a"], ["insert", "a"], ["count_prefix", "a"], ["search", "a"]]
    expected: [null, null, 2, true]
    label: repeated insert counts twice
  - args: [["insert", "car"], ["insert", "cart"], ["insert", "cat"], ["count_prefix", "ca"], ["count_prefix", "car"], ["count_prefix", "cab"], ["search", "ca"]]
    expected: [null, null, null, 3, 2, 0, false]
  - args: [["insert", "x"], ["insert", "yz"], ["count_prefix", ""]]
    expected: [null, null, 2]
    hidden: true
    label: empty prefix counts everything
  - args: [["insert", "banana"], ["count_prefix", "bananas"], ["search", "banan"], ["search", "banana"]]
    expected: [null, 0, false, true]
    hidden: true
hints:
  - "Give every node a children map, an end flag and a count; increment count on each node you pass during insert, including the final one."
  - "count_prefix walks the prefix and returns the count at the node it reaches, or 0 if the walk falls off the trie."
  - "search walks the word and returns the end flag of the node it reaches; a reachable node whose flag is false is only a prefix."
```

## Senior signals

- You say **"operations cost `O(L)` regardless of dictionary size"** and contrast it with the hash-set-of-prefixes alternative, including its space cost and its inability to do wildcards.
- You distinguish **reachable from stored** (the `end` flag) without being reminded and name the test case that catches the bug.
- In Word Search II you **carry a trie node through the DFS** and explain the pruning it gives, then add the "store the word at the node" and "delete dead leaves" optimisations before the interviewer asks about the hard test cases.
- You **quantify wildcard cost** honestly: linear without wildcards, branching at each `.`, and a pattern of all dots visiting every node at that depth.
- You can discuss **node representation** (dict, 26-array, compressed) and pick one based on alphabet and memory, and you know roughly what a node costs in your language.
- You know **which string problems a trie does not solve** (substrings, sorted ranges) and name the structure that does.

## Check yourself

```quiz
- q: >-
    After insert("apple") only, a trie's search("app") returns true. What is the bug?
  options: ["insert created the wrong nodes", "search checks only that the walk reached a node, not that the node's end flag is set; app is a prefix of a stored word but not a stored word", "The trie is case sensitive", "search should return the node, not a boolean"]
  answer: 1
  explanation: >-
    Every prefix of a stored word has a node. Only the final node of each inserted word carries the end flag, and search must test it. starts_with is the operation that ignores the flag.
- q: >-
    In Design Add and Search Words, search(".a") after adding bad, dad and mad returns:
  options: ["true, because three words match the first two letters", "false, because after matching any first letter and a, the pattern is exhausted at nodes whose end flag is false", "An error, because . must be the last character", "true only if the words are inserted in sorted order"]
  answer: 1
  explanation: >-
    The wildcard branches to b, d and m; each has an a child, but the pattern ends there and those nodes are not word ends. The end-of-pattern base case must return node.end, not true.
- q: >-
    Word Search II with 5,000 words on a 12 x 12 board. Compared with running single-word Word Search per word, what does the trie change?
  options: ["It makes each individual search faster by a constant factor", "It lets one DFS from each cell advance through all words at once and abandon a path as soon as no word continues with that letter, removing the factor of W from the running time", "It removes the need to mark visited cells", "It reduces memory"]
  answer: 1
  explanation: >-
    Carrying a trie node through the DFS means every step is a single child lookup that either continues (some word has this prefix) or stops. The 5,000 separate searches would each re-explore the same board paths.
- q: >-
    Why does storing the whole word at its end node, and clearing it once found, matter in Word Search II?
  options: ["It is purely stylistic", "It avoids rebuilding the string from the path and prevents reporting the same word twice when it is reachable from different start cells; deleting dead leaves afterwards also shrinks the trie so later DFS branches stop sooner", "It makes the trie a hash set", "It changes the asymptotic complexity to O(1)"]
  answer: 1
  explanation: >-
    Both are practical optimisations that turn a solution that times out on the large tests into one that passes. Duplicate reporting is also a correctness issue when the expected output is a set.
- q: >-
    A candidate is asked whether a pattern occurs anywhere inside a long text and proposes a trie of the text's prefixes. What is wrong?
  options: ["Nothing; tries index all substrings", "A trie indexes prefixes, and a substring is a prefix of some suffix, so you would need a trie of all suffixes (a suffix tree) or a different algorithm such as KMP or a rolling hash", "Tries only work on lowercase letters", "The text is too long for a hash map"]
  answer: 1
  explanation: >-
    Prefix structures answer starts-with questions. Substring search needs either every suffix indexed (suffix tree or array) or a linear-time matcher. Recognising the boundary of the pattern is the senior skill.
```

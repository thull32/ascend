---
slug: trie-pattern
title: "Trie: the tree you build when the problem is about prefixes"
description: Recognise prefix, wildcard and many-words-against-one-board problems, write the node-and-children trie from memory, see Implement Trie, Add and Search Words, Word Search II and Replace Words traced node by node, and know what a node costs in memory in Python and JavaScript.
minutes: 45
difficulty: medium
tags: [trie, prefix-tree, strings, dfs, pattern:trie]
problems: [implement-trie, design-add-search-words, word-search-ii, replace-words]
---
You have a dictionary of words and the questions are about their *beginnings*: does any word start with these letters, which words share this prefix, what is the shortest root of this word, can this pattern with wildcards match anything. A hash set answers "is this exact word present" in `O(L)` and nothing else; "does any word start with `pre`" becomes a scan of the whole set. Sorting and binary searching handles plain prefixes but not wildcards, and it cannot walk a board and a dictionary together.

A trie is a tree whose edges are letters and whose root-to-node paths are prefixes. Every word is a path from the root, and every prefix shared between words is a shared path. A prefix query walks one path of length `L` however many words are stored, a wildcard branches into the children at that node and nowhere else, and a grid search can ask "does any word continue with this letter?" at every step and abandon the branch the moment the answer is no. The structure itself is taught in [Tries](/learn/data-structures/tries-and-string-structures/tries); this lesson is about recognising the pattern, executing it, and knowing what it costs.

## The signal

Reach for a trie when the statement contains any of these:

- **"Starts with", "prefix", "autocomplete", "words beginning with"**: [Implement Trie](/practice/implement-trie) is the API in its pure form.
- **A pattern that can branch** ("`.` matches any letter"): [Design Add and Search Words](/practice/design-add-search-words). The branching is a DFS over children at the wildcard position.
- **Many words matched against one board, text or stream**: [Word Search II](/practice/word-search-ii), "replace each word with its shortest root" ([Replace Words](/practice/replace-words)). One trie pointer advances through *all* words at once.
- **"Longest common prefix" of many strings, "shortest unique prefix", "count words with prefix `p`"**: a count per node, one walk.
- **"Maximum XOR of two numbers"**: a binary trie over the bits, walking greedily to the opposite bit.

What rules it out:

- **Exact membership only.** A hash set is `O(L)` per lookup, measured about 5 times faster, with a fraction of the memory.
- **Substring search** (the pattern occurs *anywhere*): tries index prefixes. Use KMP, a rolling hash or a suffix structure ([String matching](/learn/data-structures/tries-and-string-structures/string-matching), [Suffix structures](/learn/data-structures/tries-and-string-structures/suffix-structures)).
- **Sorted-range queries** ("the 100 words after `apple`"): a sorted array with binary search is simpler.

Measured on CPython 3.14 over the 19,162 distinct lowercase words that appear in CPython's own standard-library source (135,203 characters):

| Structure | Prefix query | Wildcard `.` | Walks a board | Memory | Build |
|---|---|---|---|---|---|
| `set` of words | no, full scan | no, full scan | no | 0.5 MB for the table (strings shared) | fastest |
| `set` of every prefix | yes, `O(L)` hash | no | partially (prefix checks only) | 3.7 MB | fast |
| Sorted list + `bisect` | yes, `O(L log n)` | no | no | the list only | `O(n log n)` sort |
| Trie, dict children | yes, `O(L)` walk | yes, branch at `.` | yes | 10.0 to 10.9 MB | 32 to 34 ms |
| Trie, flat `array('i')` of 26 per node | yes | yes | yes | 6.0 MB | 71 ms |

The prefix set beats the trie on memory here, because the trie pays for a dict per node. The trie wins on what the set cannot do: wildcards, incremental walks against a board, and "the first stored prefix of this word" without trying every length.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Does this word exist in the dictionary?" | Trie | Hash set | No prefix operation anywhere |
| "Does this pattern occur inside the text?" | Trie of the text | KMP, rolling hash, suffix array | "Inside", not "starts with" |
| "Match 10⁴ banned words against a stream of text" | One trie walk per position | Aho–Corasick: a trie plus failure links, one pass ([Aho–Corasick](/learn/advanced-data-structures/advanced-strings/aho-corasick)) | Matches can start at every position |
| "Can the string be split into dictionary words?" | Trie | DP over positions; a trie speeds the inner loop | The question is about segmentations, not prefixes |
| "Find one word on the board" | Word Search II | Plain backtracking | One word: the trie has nothing to share |
| "Group anagrams" | Trie keyed by letters | Hash map keyed by sorted letters or counts | Order of letters is irrelevant |

## The template

A node holds a map from character to child and a flag marking the end of a word. Insert walks and creates; search walks and checks the flag; prefix walks and checks existence.

```python
class TrieNode:
    __slots__ = ("children", "end")     # no per-instance __dict__: 202 vs 242 B/node
    def __init__(self):
        self.children = {}              # char -> TrieNode
        self.end = False                # a stored word ends exactly here

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
                return None             # fell off the trie
        return node

    def search(self, word):
        node = self._walk(word)
        return node is not None and node.end    # reachable AND stored

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

`setdefault(ch, TrieNode())` constructs a throwaway node on every call, including when the child exists. It is the shortest correct line; if you are asked to optimise, test with `get` first, as the JavaScript does. For Word Search II many people write a plain dict-of-dicts, `node = node.setdefault(ch, {})` with the word stored under a sentinel key such as `"$"`; that is 187 bytes per node measured and six lines, but the sentinel must not be a character the alphabet can contain.

Watch words share paths and diverge:

```viz
{"type": "trie", "algorithm": "insert-search", "operations": [["insert", "car"], ["insert", "card"], ["insert", "care"], ["insert", "cat"], ["search", "car"], ["search", "ca"], ["prefix", "ca"], ["search", "cart"]], "title": "Trie insert and search", "caption": "car, card and care share three nodes; search(ca) fails on the end flag while prefix(ca) succeeds."}
```

## Why it is correct, and what it costs

**Invariant**: *there is a node for string `s` if and only if `s` is a prefix of some inserted word, and its `end` flag is set if and only if `s` itself was inserted.* Insert creates exactly the missing nodes along the word and sets the flag at the last one; nothing else creates nodes or sets flags. So `starts_with` (node exists) and `search` (node exists and flag set) answer their questions exactly.

**Time.** Each operation does one dictionary lookup per character: `O(L)` for a string of length `L`, independent of the number of stored words `n`. Say that independence out loud; it is the property a hash set cannot give prefixes.

**Why Word Search II may delete nodes.** A node is deleted only when it has no children and stores no unreported word. No remaining word's path passes through it, so no future search can need it; deleting it only makes later walks stop one letter sooner. The stored word is cleared at the moment it is reported, so a word reachable from two start cells is reported once.

**Space.** One node per distinct prefix, plus the root. Worst case (no shared prefixes) that is the total number of characters. On the standard-library word list above, 19,162 words and 135,203 characters produced 53,838 nodes: 0.40 nodes per character, because English-like words share beginnings.

## Worked problems

### Implement Trie

[Implement Trie](/practice/implement-trie): `insert`, `search`, `startsWith`, exactly the template. Trace on an empty trie (`*` marks a node created by this call):

| operation | path walked | new nodes | nodes in trie | result |
|---|---|---|---|---|
| `insert("apple")` | a\* p\* p\* l\* e\* | 5 | 6 | `e.end = True` |
| `search("app")` | a p p | | 6 | `False`: exists, flag unset |
| `startsWith("app")` | a p p | | 6 | `True` |
| `insert("app")` | a p p | 0 | 6 | second `p.end = True` |
| `insert("apply")` | a p p l y\* | 1 | 7 | |
| `insert("ape")` | a p e\* | 1 | 8 | |
| `insert("bat")` | b\* a\* t\* | 3 | 11 | |
| `search("appl")` | a p p l | | 11 | `False`: a prefix of two words, not a word |

Five words, 17 characters, 11 nodes (10 plus the root). At the measured 202 bytes per node, that is about 2.2 KB where the five strings themselves take about 270 bytes: tries trade memory for prefix operations.

### Design Add and Search Words

[Design Add and Search Words](/practice/design-add-search-words): `addWord` as before; `search(pattern)` where `.` matches any single letter.

At a literal the walk continues; at a `.` it must try *every* child, so the walk becomes a DFS over `(node, position)`.

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
                return node.end                  # exhausted: must be a word end
            ch = pattern[i]
            if ch == ".":
                return any(dfs(child, i + 1) for child in node.children.values())
            nxt = node.children.get(ch)
            return nxt is not None and dfs(nxt, i + 1)
        return dfs(self.root, 0)
```

After `bad`, `dad`, `mad`, trace `search(".ad")`:

| call `dfs(node, i)` | pattern char | action |
|---|---|---|
| (root, 0) | `.` | try children b, d, m in turn |
| (b, 1) | `a` | child exists → (ba, 2) |
| (ba, 2) | `d` | child exists → (bad, 3) |
| (bad, 3) | end | `bad.end` is True → **True**; `any` stops |

`search(".a")` reaches `ba`, `da`, `ma` with the pattern exhausted; all three flags are unset, so it returns False. That case catches the solution that returns `True` at the end of the pattern instead of `node.end`. Cost: `O(L)` without wildcards; with `k` dots up to `26^k` branches in the worst case, bounded by the number of stored prefixes that match the literal letters. A pattern of all dots visits every node at that depth.

### Word Search II

[Word Search II](/practice/word-search-ii): a letter grid and a word list; return every word traceable by adjacent cells without reuse.

Running [Word Search](/practice/word-search) once per word repeats the same board walks `W` times. Build one trie and DFS from every cell *carrying a trie node*: a letter absent from the node's children ends the branch for every word at once.

```python
class WNode:
    __slots__ = ("children", "word")
    def __init__(self):
        self.children = {}
        self.word = None                              # the full word, at its end node

def find_words(board, words):
    root = WNode()
    for w in words:
        node = root
        for ch in w:
            node = node.children.setdefault(ch, WNode())
        node.word = w
    R, C = len(board), len(board[0])
    found = []

    def dfs(r, c, parent):
        ch = board[r][c]
        node = parent.children.get(ch)
        if node is None:
            return                                    # no word continues this way
        if node.word is not None:
            found.append(node.word)
            node.word = None                          # report once
        board[r][c] = "#"                             # mark only after the trie check
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < R and 0 <= nc < C and board[nr][nc] != "#":
                dfs(nr, nc, node)
        board[r][c] = ch                              # unmark on the way out
        if not node.children and node.word is None:
            del parent.children[ch]                   # dead leaf: prune it

    for r in range(R):
        for c in range(C):
            dfs(r, c, root)
    return found
```

Board `[["o","a","t"],["e","t","a"]]`, words `oat`, `eat`, `tea`, `oaa`. Root children: `o`, `e`, `t`.

| start | path | trie step | outcome |
|---|---|---|---|
| (0,0) o | o → (1,0) e | `o` has only `a` | stop |
| | o → (0,1) a → (1,1) t | `oa` has `t`, stores `oat` | **record `oat`**, clear it |
| | o a t → (1,0) e, (1,2) a | `oat` has no children | stop; on return `t` is deleted from `oa` |
| | o a → (0,2) t | `oa` no longer has `t` | stop |
| (0,1) a | a | root has no `a` | stop at the first letter |
| (0,2) t | t → (1,2) a | `t` has only `e` | stop |
| (1,0) e | e → (0,0) o, (1,1) t | `e` has only `a` | stop |
| (1,1) t | t → (1,0) e → (0,0) o | `te` has only `a` | stop |
| (1,2) a | a | root has no `a` | stop |

Result `["oat"]`. Most cells die at the first letter because the root has three children. Time `O(R · C · 4 · 3^(L−1))` for maximum word length `L` (after the first step each cell has at most three unvisited neighbours), plus `O(total characters)` to build.

### Replace Words

[Replace Words](/practice/replace-words): replace each word of a sentence with the shortest dictionary root that prefixes it.

Walk each word and stop at the *first* node with the flag set; a shorter root would have set an earlier flag.

```python
def replace_words(roots, sentence):
    trie = Trie()
    for r in roots:
        trie.insert(r)
    out = []
    for word in sentence.split():
        node, i = trie.root, 0
        while i < len(word) and not node.end:
            node = node.children.get(word[i])
            if node is None:
                break
            i += 1
        out.append(word[:i] if node is not None and node.end else word)
    return " ".join(out)
```

Roots `cat`, `bat`, `rat`; sentence `"the cattle was rattled by the battery"`:

| word | letters walked | why the walk stopped | output |
|---|---|---|---|
| the | 0 | root has no `t` | `the` |
| cattle | c a t | `cat` is flagged | `cat` |
| was | 0 | root has no `w` | `was` |
| rattled | r a t | `rat` is flagged | `rat` |
| by | b | `b` has no child `y` | `by` |
| battery | b a t | `bat` is flagged | `bat` |

Output `"the cat was rat by the bat"`. The `while ... not node.end` condition is what makes it the *shortest* root: with roots `a` and `ab`, the walk for `abc` stops after `a`. `O(total root length + total sentence length)`, and each word costs at most the length of the longest root, not its own length.

## Variations

| Variant | Extra state per node | Operation | Cost |
|---|---|---|---|
| Count words with prefix | `count`, incremented on insert | walk, return `count` | `O(L)` |
| Delete a word | `count` | decrement along the path, drop nodes at 0 | `O(L)` |
| Top-k autocomplete | top-k list of completions | walk to prefix, read the list | `O(L)` query, `O(L · k)` insert |
| Longest common prefix | children count, `end` | walk while one child and not `end` | `O(LCP)` |
| Binary trie (max XOR) | two children | prefer the opposite bit at each level | `O(bits)` |
| Compressed (radix) trie | string edge labels | split an edge on insert | `O(L)`, far fewer nodes |
| Aho–Corasick | failure link | one pass over the text | `O(text + matches)` |

**Binary trie, traced.** Numbers `[3, 10, 5, 25, 2, 8]` inserted as 5-bit strings, high bit first. To find the best partner for 25 (`11001`), prefer the opposite bit at each level:

| bit | 25's bit | wanted | taken | XOR so far | numbers still on the path |
|---|---|---|---|---|---|
| 4 | 1 | 0 | 0 | `10000` | 2, 3, 5, 8, 10 |
| 3 | 1 | 0 | 0 | `11000` | 2, 3, 5 |
| 2 | 0 | 1 | 1 | `11100` | 5 |
| 1 | 0 | 1 | 0 (no 1 child) | `11100` | 5 |
| 0 | 1 | 0 | 1 (no 0 child) | `11100` | 5 |

`25 XOR 5 = 28`, the maximum over all pairs. The greedy choice is safe because a 1 at bit `b` outweighs every lower bit combined (`2^b > 2^b − 1`). Each query is `O(bits)`, so all pairs cost `O(n · 32)` instead of `O(n²)`.

```viz
{"type": "trie", "algorithm": "prefix-autocomplete", "operations": [["insert", "car"], ["insert", "card"], ["insert", "care"], ["insert", "cat"], ["insert", "dog"], ["prefix", "car"]], "title": "Autocomplete from a prefix node", "caption": "Walk to the prefix node, then collect every word in its subtree."}
```

Real systems use the compressed forms: the Linux kernel routes IPv4 with an LC-trie (longest-prefix match on address bits), Redis keeps stream IDs and some key indexes in a radix tree (`rax`), and Lucene stores its term dictionary as a finite-state transducer, a trie that also shares suffixes.

## Under the hood

**What a node costs, measured on the 53,838-node trie above.** CPython 3.14, via `tracemalloc`:

| Representation | Bytes per node | Why |
|---|---|---|
| dict of dicts | 187 | an empty dict is 64 bytes, a one-key dict 184 |
| class with `__slots__`, dict children | 202 | 48-byte object plus its dict |
| class without `__slots__` | 242 | adds a per-instance `__dict__` |
| `__slots__` plus `[None] * 26` | 312 | a 26-slot list is 264 bytes, mostly `None` |
| flat `array('i')`, 26 ints per node | 111 | 104 bytes of child ids, no objects |

The dict numbers have a mechanism. An empty CPython dict is 64 bytes and shares a global empty key table; the first insert allocates a table sized for 8 slots, of which 5 are usable, and `sys.getsizeof` jumps to 184 bytes; it stays at 184 up to five children and reaches 272 at six. A trie node pays the 184-byte step for its first child, which is why node cost barely depends on how many children a node has, and why most of a trie's memory is the table overhead of one-child nodes.

Node 24, measuring heap growth: `Map` children 230 bytes per node, a plain object as the child map 111, `new Array(26)` 296, a flat `Int32Array` about 105 plus growth slack. Most nodes have one child, which is why the fixed 26-slot array is the most expensive choice despite being "simpler".

**Lookup speed.** On the same words, a trie `search` averaged 173 ns per word against 31 ns for `word in set`, both CPython 3.14: one dict lookup per character against one hash of the whole string. The trie's advantage is never raw membership speed.

**Word Search II pruning, measured.** An 8 × 8 board of all `a` with words `a` through `aaaaaaaaaa` (lengths 1 to 10): without deleting dead leaves the DFS makes 1,216,384 calls; with the deletion, 83, because once every word is found the trie empties and each start cell dies at the root. The effect depends on words being found: add the unfindable `aaaaaaaaab` and the chain can never be pruned, so the calls fall only from 1,216,384 to 525,522 (and on a 12 × 12 board from 4.7 million to 1.9 million, 666 ms to 265 ms). Clearing the stored word alone changes nothing measurable; the deletion is what shrinks the search.

**Recursion depth** in both DFS searches is bounded by the pattern or word length, typically 10 to 20, far from CPython's 1,000-frame limit. A recursive `insert` would be bounded the same way but is slower than the loop and has no benefit.

## Failure modes

**Symptom: `search("app")` returns True after only `insert("apple")`.** Diagnosis: `search` checks that the node exists, not its flag. Fix: `return node is not None and node.end`; the test that catches it is a stored word's proper prefix.

**Symptom: uppercase or accented input returns matches that do not exist, with no exception.** Diagnosis: 26-slot array children indexed by `ord(ch) - ord("a")`. For `T` that is −13, and Python's negative indexing silently reads slot 13, the child for `n`, so `"Tea"` walks the path for `"nea"`. Fix: ask for the alphabet first; use dict or `Map` children, or normalise the input.

**Symptom: Word Search II passes small tests and times out on a board of repeated letters.** Diagnosis: no dead-leaf deletion, or a trie rebuilt per word or per start cell. Measured above: 1.2 million calls against 83. Fix: build once, store the word at its node, clear it when found, delete childless nodes on the way out.

**Symptom: Word Search II reports the same word twice, or misses words after the first start cell.** Diagnosis: the word is not cleared when found (duplicates), or the board cell is not restored after the recursion (later searches see `#`). Fix: `node.word = None` on first report; restore `board[r][c]` before returning.

**Symptom: `MemoryError` or a container killed while building a trie of 10⁶ URLs.** Diagnosis: about 200 bytes per node in CPython times tens of millions of nodes. Fix: a compressed trie, a sorted array with `bisect` for prefix ranges, or flat integer arrays at about 100 bytes per node.

## Interviewer follow-ups

**"Support `delete(word)`."** Model answer: keep a count per node; on delete walk the path, decrement, and unlink the first node whose count reaches 0 (everything below it belonged only to this word); clear the flag only if the word was present. Common wrong answer: clearing the `end` flag only, which leaves dead branches that make `starts_with` lie.

**"Return the top 3 completions by frequency for each prefix as the user types."** Model answer: store at each node the top 3 `(frequency, word)` pairs of its subtree, updated along the insert path; a keystroke then moves one node and reads a list, `O(1)` per character. Insert costs `O(L · k)`. Common wrong answer: DFS the whole subtree on each keystroke, which is the entire dictionary for a one-letter prefix.

**"Memory is too high. What would you change?"** Model answer: measure first; then compress single-child chains into string-labelled edges (radix trie), move to flat integer arrays, or drop the trie for a sorted list plus `bisect` if only prefix ranges are needed; for a static dictionary, a structure that also shares suffixes (a DAWG or FST) shrinks it further. Common wrong answer: "use a 26-slot array, it is simpler", which is the largest representation measured.

**"Now match the dictionary against a long text stream."** Model answer: restarting a trie walk at every text position is `O(text · L)`; Aho–Corasick adds failure links so the walk never restarts, `O(text + matches)`. Name it; implement it only if asked. Common wrong answer: one `str.find` per dictionary word.

**"Why not a hash set of all prefixes?"** Model answer: for `startsWith` alone it is simpler and, measured on 19,162 words, smaller (3.7 MB against 10 MB) and faster; it cannot do wildcards, cannot carry state through a board walk, and finding the shortest stored prefix needs `L` separate lookups. Common wrong answer: "the trie always uses less memory".

## What mid-level engineers get wrong

- **Treating reachable as stored** in `search` and in the wildcard base case. Every proper prefix of a stored word then reads as a word.
- **Rebuilding the trie** per query or per start cell in Word Search II, which restores the factor of `W` the trie exists to remove.
- **Marking the board cell before the trie check**, then returning early without unmarking. Later start cells see `#` and miss words; the bug appears only when two words share cells.
- **Choosing 26-slot arrays without asking about the alphabet**, which silently aliases uppercase letters in Python and costs 264 bytes per node for the list alone.
- **Quoting "tries save memory"** without numbers. In CPython a dict-children node costs about 200 bytes, and a set of all prefixes was smaller on real words.
- **Returning `True` from the wildcard DFS as soon as the pattern is exhausted**, which makes `".a"` match `"bad"`.
- **Implementing Aho–Corasick unprompted** in a 45-minute round instead of naming it and finishing the problem asked.

## Exercises

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

```exercise
id: wildcard-word-dictionary
title: Word dictionary with wildcard search
prompt: |
  Implement a class `WordDictionary` with two methods:

  - `add_word(word)` stores a lowercase word.
  - `search(pattern)` returns `true` if some stored word matches the
    pattern, where `.` matches any single letter and every other character
    matches itself. The match must use the whole word: `"b."` does not
    match `"bad"`.

  Build a trie; at a `.` try every child of the current node.
languages: [python, javascript]
entry: WordDictionary
starter:
  python: |
    class WordDictionary:
        def __init__(self):
            # your code here
            pass

        def add_word(self, word):
            pass

        def search(self, pattern):
            return False
  javascript: |
    class WordDictionary {
      constructor() {
        // your code here
      }
      add_word(word) {}
      search(pattern) { return false; }
    }
tests:
  - args: [["add_word", "bad"], ["add_word", "dad"], ["add_word", "mad"], ["search", "pad"], ["search", "bad"], ["search", ".ad"], ["search", "b.."]]
    expected: [null, null, null, false, true, true, true]
  - args: [["search", "a"], ["search", "."]]
    expected: [false, false]
    label: empty dictionary
  - args: [["add_word", "a"], ["search", "."], ["search", ".."], ["search", "a"]]
    expected: [null, true, false, true]
    label: length must match
  - args: [["add_word", "bad"], ["search", ".a"], ["search", "..."], ["search", "...."]]
    expected: [null, false, true, false]
    label: a prefix of a word is not a match
  - args: [["add_word", "at"], ["add_word", "and"], ["add_word", "an"], ["add_word", "add"], ["search", "a"], ["search", ".at"], ["add_word", "bat"], ["search", ".at"], ["search", "an."], ["search", "a.d."], ["search", "b."], ["search", "a.d"], ["search", "."]]
    expected: [null, null, null, null, false, false, null, true, true, false, false, true, false]
  - args: [["add_word", "ab"], ["add_word", "abc"], ["search", "ab."], ["search", "a."], ["search", ".b"], ["search", "a.c"]]
    expected: [null, null, true, true, true, true]
    hidden: true
    label: a word that is a prefix of another
  - args: [["add_word", "xyz"], ["search", "..."], ["search", "x.."], ["search", "..a"], ["search", "x.z."]]
    expected: [null, true, true, false, false]
    hidden: true
hints:
  - "Each node needs a children map and an end flag; add_word is the ordinary trie insert."
  - "search is a DFS over (node, index): a letter follows one child, a dot tries every child."
  - "When the index reaches the end of the pattern, return the node's end flag, not true."
```

## Senior signals

- You say **"operations cost `O(L)` regardless of dictionary size"** and contrast it with the prefix-set alternative honestly: the set is smaller and faster for `startsWith` alone.
- You distinguish **reachable from stored** without being reminded and name the test that catches it: a stored word's proper prefix.
- In Word Search II you **carry a trie node through the DFS**, then add the stored word, clearing on find and dead-leaf deletion, and you can say which of the three actually changes the running time.
- You **quantify wildcard cost**: linear without dots, branching at each dot, every node at that depth for an all-dot pattern.
- You know **what a node costs** in your language (about 200 bytes with a CPython dict, about 110 to 230 in Node depending on the child map) and pick the representation from the alphabet and memory budget.
- You name **the structure that replaces the trie** when the question changes: a hash set for membership, suffix structures for substrings, Aho–Corasick for many patterns in a stream, a radix trie or FST when memory matters.

## Check yourself

```quiz
- q: >-
    After insert("apple") only, a trie's search("app") returns true. What is the bug?
  options: ["The trie compares letters case-sensitively by default", "search walks one letter too few before checking", "search checks that the node exists, not its end flag", "insert skipped creating the node for the second p"]
  answer: 2
  explanation: >-
    Every prefix of a stored word has a node, so app is reachable even though it is not a stored word. Only the last node of each inserted word carries the end flag, and search must test it. starts_with is the operation that ignores the flag.
- q: >-
    In Design Add and Search Words, search(".a") after adding bad, dad and mad returns:
  options: ["true only if the words were inserted in sorted order", "An error, because . may only appear as the last character", "true, because three words match the first two letters", "false, since it ends on nodes whose end flag is unset"]
  answer: 3
  explanation: >-
    The wildcard branches to b, d and m; each has an a child, but the pattern is exhausted there and those nodes are not word ends. The end-of-pattern base case must return node.end, not true.
- q: >-
    A trie uses 26-slot array children indexed by ord(ch) - ord('a'). In Python, search("Tea") after insert("nea") returns:
  options: ["False, since uppercase letters are lowercased first", "True, because index -13 silently reads the n slot", "False, because T has no slot and the walk stops", "An IndexError, since -13 is outside the list"]
  answer: 1
  explanation: >-
    ord('T') - ord('a') is -13, and Python lists accept negative indices from -26 to -1, so slot -13 is slot 13, the child for n. The walk follows n, e, a and finds the flag. The fix is to ask about the alphabet and use dict or Map children, or to normalise the input.
- q: >-
    Word Search II on an 8 x 8 board of all 'a' with the ten words 'a' to 'aaaaaaaaaa'. What most reduces the DFS work?
  options: ["Deleting childless trie nodes once their words are found", "Marking visited cells with a set instead of the board", "Starting the DFS only from cells on the board edge", "Storing each word at its end node to avoid rebuilding"]
  answer: 0
  explanation: >-
    Once all ten words are found and cleared, deleting childless nodes on the way back empties the trie, so every later start cell stops at the root: measured at 83 calls against 1.2 million without deletion. Storing the word avoids string building but does not shrink the search, and a visited set changes nothing asymptotically.
- q: >-
    On 19,162 words in CPython, a set of every prefix measured 3.7 MB and a dict-based trie 10 MB. When is the trie still the right choice?
  options: ["For wildcard search or walking a board letter by letter", "Never; the prefix set is smaller and faster in every case", "Only when the words are longer than about 20 characters", "Only when the alphabet has more than 26 characters"]
  answer: 0
  explanation: >-
    A prefix set answers starts-with in one hash lookup and wins on memory, but it cannot branch on a wildcard, cannot carry a position through a board DFS, and needs one lookup per length to find the shortest stored prefix of a word. Those are the operations that justify the trie's per-node cost.
- q: >-
    A candidate is asked whether a pattern occurs anywhere inside a long text and proposes a trie of the text's prefixes. What is wrong?
  options: ["Nothing, since a trie of prefixes indexes every substring", "The text is too long to fit in a trie's hash maps", "Tries index prefixes; substrings need suffixes or KMP", "Tries only work when the text is lowercase letters"]
  answer: 2
  explanation: >-
    Prefix structures answer starts-with questions. A substring is a prefix of some suffix, so substring search needs every suffix indexed (a suffix array or tree) or a linear-time matcher such as KMP or a rolling hash.
```

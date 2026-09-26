---
slug: aho-corasick
title: "Aho-Corasick: matching thousands of patterns in one pass"
description: How a trie plus KMP-style failure links matches every pattern in a dictionary against a text in O(n + m + z), why the output links matter, and where the automaton runs in intrusion detection, WAFs and content filters.
minutes: 30
difficulty: hard
tags: [aho-corasick, trie, string-matching, kmp, automaton]
problems: [implement-trie, word-search-ii]
---
An intrusion-detection system inspects every packet against a ruleset of forty thousand byte-string signatures. Running KMP once per signature is `O(40,000 × packet length)` per packet, which is not a design, it is an outage. A hash of every substring is worse. What you want is to read each byte of the packet **once** and, at every position, know instantly which signatures end there.

Aho-Corasick does exactly that. It builds a finite automaton from the pattern set, in time linear in the total pattern length, and then runs the text through it in time linear in the text length plus the number of matches. Alfred Aho and Margaret Corasick published it in 1975 for a bibliographic search tool; it now runs inside `grep -F` with many patterns, Snort and Suricata, ClamAV, spam filters, profanity filters, and every web application firewall that matches request bodies against signature lists.

## Start with a trie

Insert the patterns `he`, `she`, `his`, `hers` into a trie.

```viz
{"type": "trie", "algorithm": "insert-search",
 "operations": [["insert","he"],["insert","she"],["insert","his"],["insert","hers"],["search","she"],["search","her"],["prefix","he"]],
 "title": "The pattern trie for {he, she, his, hers}",
 "caption": "A trie matches patterns that start at one fixed position. Aho-Corasick adds the links that let it recover after a mismatch instead of restarting."}
```

Walking the text `ushers` through this trie from position 0 fails immediately (`u` is not a child of the root). Restart at position 1: `s`, `h`, `e` reaches the node for `she`, a match. Restart at position 2: `h`, `e`, `r`, `s` reaches `hers`, another match, and on the way passed through `he`. That is `O(n × longest pattern)` in the worst case, because every position restarts from the root.

The waste is obvious once you see it: after matching `she`, the automaton is at the node for `she`, and the last two characters it consumed, `he`, are themselves the start of a pattern. It should not go back to the root; it should jump to the node for `he` and keep going.

## Failure links: KMP for a trie

KMP's failure function says, for each prefix of the pattern, "what is the longest proper suffix of this prefix that is also a prefix of the pattern". Aho-Corasick asks the same question of every trie node, across all patterns at once: for the string spelled by node `u`, what is the longest proper suffix of it that is also a node in the trie? That node is `fail(u)`.

```viz
{"type": "string", "algorithm": "kmp", "text": "ushershershe", "pattern": "hers",
 "title": "KMP on a single pattern: the failure function is Aho-Corasick with one trie branch",
 "caption": "Watch how a mismatch slides the pattern instead of restarting the text pointer. Aho-Corasick generalises the slide to a whole trie."}
```

For the four-pattern trie:

| node (string) | longest proper suffix that is in the trie | `fail` |
|---|---|---|
| `h` | `""` | root |
| `he` | `e`? not in trie; `""` | root |
| `s` | `""` | root |
| `sh` | `h` | node `h` |
| `she` | `he` | node `he` |
| `hi` | `i`? not in trie | root |
| `his` | `is`? no; `s` yes | node `s` |
| `her` | `er`? no; `r`? no | root |
| `hers` | `ers`? no; `rs`? no; `s` yes | node `s` |

Compute these with a breadth-first traversal, level by level, so that when you process node `u` with parent `p` and edge character `c`, `fail(p)` is already known. Then `fail(u)` is found by walking `p`'s failure chain until you hit a node that has a child on `c`:

```python
from collections import deque

class AhoCorasick:
    def __init__(self, patterns):
        self.children = [{}]        # node -> {char: node}
        self.fail = [0]
        self.output = [[]]          # node -> list of pattern indices ending here
        for idx, pat in enumerate(patterns):
            node = 0
            for ch in pat:
                node = self.children[node].setdefault(ch, self._new_node())
            self.output[node].append(idx)
        self._build_failure_links()

    def _new_node(self):
        self.children.append({})
        self.fail.append(0)
        self.output.append([])
        return len(self.children) - 1

    def _build_failure_links(self):
        q = deque()
        for child in self.children[0].values():   # depth-1 nodes fail to root
            self.fail[child] = 0
            q.append(child)
        while q:
            u = q.popleft()
            for ch, v in self.children[u].items():
                f = self.fail[u]
                while f and ch not in self.children[f]:
                    f = self.fail[f]
                cand = self.children[f].get(ch, 0)
                self.fail[v] = cand if cand != v else 0
                self.output[v] = self.output[v] + self.output[self.fail[v]]
                q.append(v)
```

The `cand != v` guard matters only when `u` is the root: then `f` is the root too, and the root's child on `ch` is `v` itself, which would make `v` fail to itself. The invariant that keeps everything linear is that `fail(u)` is always strictly shallower than `u`.

The last line inside the loop is the **output link** merge: if `fail(v)` is the end of some pattern, then that pattern is a suffix of the string at `v`, so it also ends wherever `v` does. Copying `fail(v)`'s output list onto `v` (transitively, because `fail(v)` was processed earlier and already absorbed its own failure chain) means that reaching a node tells you every pattern ending at this text position with no extra walking. Two cases show why it is necessary. In `ushers`, the automaton reaches the node `she` at position 3; `he` also ends at position 3, but the walk never visits the node `he`, it only passes *through* it via the failure link. Sharper still is `{abcd, bc, c}` against `abcd`: at the node for `abc`, which is not a pattern, the failure link goes to `bc`, a pattern, whose failure link goes to `c`, also a pattern. Both must be reported at position 2. Without the merged list you would have to walk the failure chain at every text position, which costs `O(depth)` per character and breaks the linear bound.

## Searching

Run the text through the automaton. At each character, follow the failure chain until a node with that child exists, then step into it and report its outputs.

```python
    def search(self, text):
        matches = []                    # (end_index, pattern_index)
        node = 0
        for i, ch in enumerate(text):
            while node and ch not in self.children[node]:
                node = self.fail[node]
            node = self.children[node].get(ch, 0)
            for idx in self.output[node]:
                matches.append((i, idx))
        return matches
```

Trace `ushers` with `{he, she, his, hers}`:

| `i` | `ch` | node before | failure walk | node after | outputs |
|---|---|---|---|---|---|
| 0 | `u` | root | none (root has no `u`) | root | |
| 1 | `s` | root | | `s` | |
| 2 | `h` | `s` | | `sh` | |
| 3 | `e` | `sh` | | `she` | `she` and, via output link, `he` |
| 4 | `r` | `she` | `she` has no `r`; fail → `he`; `he` has `r` | `her` | |
| 5 | `s` | `her` | | `hers` | `hers` (its failure link `s` is not a pattern, so nothing more) |

Three matches: `she` ending at 3, `he` ending at 3, `hers` ending at 5. Each text character was consumed once.

## Why it is linear

The search loop looks like it could be quadratic: the `while` inside the `for`. The amortised argument is the same as KMP's. Define the *depth* of the current node. Each `for` iteration increases depth by at most one (stepping into a child). Each `while` iteration strictly decreases depth (failure links point to shallower nodes). Depth starts at 0 and never goes negative, so the total number of `while` iterations across the whole text is at most the total number of depth increases, which is at most `n`. Search is `O(n + z)` where `z` is the number of matches reported. Building the trie is `O(m)` for total pattern length `m`, and building the failure links is `O(m)` by the same amortisation applied per root-to-leaf path.

The `z` term matters. With patterns `a`, `aa`, `aaa`, …, `a^k` and text `a^n`, there are about `k·n` matches, and no algorithm can report them faster than it takes to write them down. If you only need "does any pattern occur", stop at the first non-empty output and the search is `O(n)` flat.

## Making it fast for real

The dictionary-per-node representation above is fine for interviews and for pattern sets of a few thousand. Production implementations do three more things:

1. **Dense transition tables.** Precompute `goto[node][byte]` for all 256 bytes per node, folding the failure walk into the table (a *deterministic* finite automaton). Search becomes one array lookup per byte with no loop at all, at the cost of `256 × nodes` entries. Snort's Aho-Corasick variants are DFA-based for this reason, and they compress the tables (banded rows, sparse rows) because 40,000 signatures produce hundreds of thousands of states.
2. **Node layout.** States are numbered in BFS order so that states of the same depth are contiguous, which keeps the working set of the common shallow states in cache.
3. **Case folding and byte classes.** Fold ASCII case and map bytes into equivalence classes (all digits, all whitespace) before matching, which shrinks the alphabet and the table. `grep -F -i` with many patterns is essentially this.

The Rust `aho-corasick` crate, used by `ripgrep`, additionally chooses between an NFA (small tables, failure loop) and a DFA per pattern set, and falls back to SIMD "teddy" searching when the set is small; it is a good codebase to read when you want to see how far the classic algorithm is from a production one.

## Where it lives

- **Network intrusion detection** (Snort, Suricata): every packet payload against thousands of content rules. This is the headline use and the reason DFA variants exist.
- **Antivirus** (ClamAV) scans files against signature databases with Aho-Corasick as the first-pass filter.
- **Web application firewalls** match request paths, headers and bodies against injection signatures; the multi-pattern pass is the hot loop, and rule authors are told to prefer literal prefixes for exactly this reason.
- **Content moderation and DLP**: profanity lists, credential patterns, credit-card prefixes, in one pass over each message.
- **Tokenisers and log parsers**: recognising a fixed vocabulary of keywords or field names in a stream.
- **Bioinformatics**: finding many short motifs in long sequences before suffix-array methods took over for the largest cases.

## In interviews

The tell is "many patterns, one text" or "a dictionary and a stream". The junior answer is a loop of `text.find(pattern)` calls; the mid-level answer is a trie with restarts; the senior answer names Aho-Corasick, states the `O(n + m + z)` bound, and explains the failure link as KMP generalised to a trie. You will not usually be asked to write the full automaton in 45 minutes, but you may be asked to write the trie and describe the BFS that adds the links, and you will certainly be asked why the search is linear (the depth argument above).

If the interviewer flips it to "one pattern, many texts", the answer changes to preprocessing the *texts*: a suffix array or suffix automaton, which the [next lesson](/learn/advanced-data-structures/advanced-strings/suffix-arrays-and-lcp) covers. Keep the two directions straight; it is a common trap.

Warm up on [Implement Trie](/practice/implement-trie), then [Word Search II](/practice/word-search-ii), which is a trie walk over a grid and a cousin of this algorithm.

## Exercise

```exercise
id: aho-corasick-find-all
title: Find every occurrence of every pattern
prompt: |
  Implement `find_all(patterns, text)`. Return a list of `[start, pattern]`
  pairs, one per occurrence of any pattern in `text` (occurrences may
  overlap and one position may end several patterns), sorted by `start`
  ascending and then by `pattern` ascending (plain string order).

  Patterns are non-empty, distinct, lowercase strings. Build an
  Aho-Corasick automaton with failure links and merged outputs; the search
  must make a single pass over `text`. `start = end - len(pattern) + 1`.
languages: [python, javascript]
entry: find_all
starter:
  python: |
    from collections import deque

    def find_all(patterns, text):
        # 1. trie: children (list of dicts), output (list of lists of pattern indices)
        # 2. BFS to set fail[] and merge output[fail[v]] into output[v]
        # 3. single pass over text; for each output pattern idx at position i,
        #    record [i - len(patterns[idx]) + 1, patterns[idx]]
        # 4. sort by (start, pattern)
        return []
  javascript: |
    function find_all(patterns, text) {
      // 1. trie: children (array of Map/object), output (array of arrays of pattern indices)
      // 2. BFS to set fail[] and merge output[fail[v]] into output[v]
      // 3. single pass over text; for each output pattern idx at position i,
      //    record [i - patterns[idx].length + 1, patterns[idx]]
      // 4. sort by (start, pattern)
      return [];
    }
tests:
  - args: [["he", "she", "his", "hers"], "ushers"]
    expected: [[1, "she"], [2, "he"], [2, "hers"]]
  - args: [["a", "aa", "aaa"], "aaaa"]
    expected: [[0, "a"], [0, "aa"], [0, "aaa"], [1, "a"], [1, "aa"], [1, "aaa"], [2, "a"], [2, "aa"], [3, "a"]]
    label: nested patterns, overlapping matches
  - args: [["xyz"], "abc"]
    expected: []
    label: no match
  - args: [["ab", "bc", "abc"], "abcabc"]
    expected: [[0, "ab"], [0, "abc"], [1, "bc"], [3, "ab"], [3, "abc"], [4, "bc"]]
  - args: [["in", "tin", "sting"], "stinting"]
    expected: [[1, "tin"], [2, "in"], [4, "tin"], [5, "in"]]
    hidden: true
    label: failure link from the sting branch to the tin branch
  - args: [["abcd", "bc", "c"], "abcd"]
    expected: [[0, "abcd"], [1, "bc"], [2, "c"]]
    hidden: true
    label: output links must report bc and c while walking abcd
  - args: [["hello"], "hell"]
    expected: []
    hidden: true
    label: pattern longer than text
hints:
  - "Set fail for depth-1 nodes to the root before the BFS; for deeper node v reached from u by c, walk f = fail[u] down its failure chain until children[f] has c (or f is the root), then fail[v] = children[f][c] if present else root."
  - "After setting fail[v], do output[v] = output[v] + output[fail[v]] so every pattern that is a suffix of v's string is reported at v."
  - "In the search, use the same failure walk before stepping: while node is not the root and has no child on ch, node = fail[node]."
```

## Senior signals

- You describe Aho-Corasick as "a trie with KMP's failure function", and you can compute failure links for a small trie by hand.
- You explain the `O(n + m + z)` bound through the depth argument, and you know that `z` can dominate and how to short-circuit when only existence matters.
- You know why output links are needed and can give a pattern set that breaks an implementation without them.
- You distinguish "many patterns, one text" (Aho-Corasick) from "one pattern, many texts" (index the texts) and choose accordingly.
- You know that production engines convert the NFA to a dense DFA with table compression, and can say why Snort and `ripgrep` do that.
- You mention alphabet reduction and case folding as the practical levers on table size.

## Check yourself

```quiz
- q: >-
    What does the failure link of a trie node u point to?
  options: ["The parent of u", "The root, always", "The node whose string is the longest proper suffix of u's string that also appears in the trie", "The node for the lexicographically next pattern"]
  answer: 2
  explanation: >-
    Exactly KMP's failure function applied across all patterns. It tells the automaton the deepest state consistent with the text read so far after a mismatch, so no text character is reread.
- q: >-
    Why is the search loop O(n + z) despite the nested while loop over failure links?
  options: ["Failure links are cached", "Each character increases the current depth by at most 1 and each failure step decreases it by at least 1, so total failure steps ≤ n", "The trie has bounded depth", "The while loop runs at most once per character"]
  answer: 1
  explanation: >-
    The depth potential argument: depth starts at 0, rises by at most one per character, and every failure step strictly lowers it, so failure steps are bounded by the total rise, n. The while loop can run many times for one character, but not many times overall.
- q: >-
    With patterns {abcd, bc, c} and text "abcd", an implementation without merged output lists reports only "abcd". What is missing?
  options: ["A longer text", "Output links: at the node for 'abc', the failure chain passes through the pattern nodes 'bc' and 'c', which end at the same text position", "A second pass with the patterns reversed", "Case folding"]
  answer: 1
  explanation: >-
    The node for 'abc' is not itself a pattern end, but its failure link is the node 'bc' (a pattern) whose failure link is 'c' (a pattern). Merging output lists along failure links at build time reports both in O(1) per match.
- q: >-
    You have one 10 GB log file and 50,000 fixed strings to look for. Which tool?
  options: ["50,000 KMP passes", "A suffix array over the log file", "Aho-Corasick over the 50,000 strings, one pass over the file", "A regex alternation compiled to a backtracking engine"]
  answer: 2
  explanation: >-
    Many patterns, one text is the Aho-Corasick shape: O(file + patterns + matches). A suffix array indexes the text for repeated queries but costs O(file log file) to build and is the wrong direction here; backtracking regex alternation is exponential-prone.
- q: >-
    Snort compiles its Aho-Corasick automaton into a full DFA with a 256-entry row per state. What does this buy and what does it cost?
  options: ["It buys exact matching; it costs correctness on binary data", "It buys one table lookup per byte with no failure loop; it costs memory proportional to 256 × states, which needs table compression", "It buys O(1) build time; it costs O(n²) search", "Nothing; it is equivalent"]
  answer: 1
  explanation: >-
    Folding failure transitions into a dense goto table removes the inner loop entirely, which matters at line rate. The price is a large sparse table, which is why banded and sparse-row compression schemes exist.
```

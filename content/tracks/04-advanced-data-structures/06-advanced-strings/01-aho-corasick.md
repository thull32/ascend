---
slug: aho-corasick
title: "Aho-Corasick: matching thousands of patterns in one pass"
description: How a trie plus KMP-style failure links matches every pattern in a dictionary against a text in O(n + m + z), traced by hand on a real pattern set; dictionary links, the full-DFA memory arithmetic, leftmost-first semantics, and what the Rust aho-corasick crate, Snort, Suricata, Hyperscan, GNU grep and ClamAV do with it.
minutes: 45
difficulty: hard
tags: [aho-corasick, trie, string-matching, kmp, automaton, dfa, intrusion-detection]
problems: [implement-trie, word-search-ii]
---
An intrusion-detection system inspects every packet against a ruleset of forty thousand byte-string signatures. Running KMP once per signature is `O(40,000 × packet length)` per packet, which is not a design, it is an outage. What you want is to read each byte of the packet **once** and, at every position, know instantly which signatures end there.

Aho-Corasick does exactly that. It builds a finite automaton from the pattern set, in time linear in the total pattern length, and then runs the text through it in time linear in the text length plus the number of matches. Alfred Aho and Margaret Corasick published it in 1975 for a bibliographic search tool; it now runs inside GNU `grep -F` with many patterns, Snort, Suricata, ClamAV, ModSecurity's `@pm` operator, profanity filters, and the literal fast path of regex engines such as Rust's `regex` crate.

The two ingredients are the [trie](/learn/data-structures/tries-and-string-structures/tries) and [KMP's failure function](/learn/data-structures/tries-and-string-structures/string-matching). This lesson builds the automaton by hand for `{he, she, his, hers}`, traces a search, proves the linear bound by counting, computes the memory of the full-DFA form, and then looks at what production engines change.

## Start with a trie

Insert the patterns `he`, `she`, `his`, `hers` into a trie, numbering the nodes in insertion order.

```viz
{"type": "trie", "algorithm": "insert-search",
 "operations": [["insert","he"],["insert","she"],["insert","his"],["insert","hers"],["search","she"],["search","her"],["prefix","he"]],
 "title": "The pattern trie for {he, she, his, hers}",
 "caption": "A trie matches patterns that start at one fixed position. Aho-Corasick adds the links that let it recover after a mismatch instead of restarting."}
```

| node | string | depth | children | ends a pattern |
|---|---|---|---|---|
| 0 | `""` (root) | 0 | h→1, s→3 | |
| 1 | `h` | 1 | e→2, i→6 | |
| 2 | `he` | 2 | r→8 | `he` |
| 3 | `s` | 1 | h→4 | |
| 4 | `sh` | 2 | e→5 | |
| 5 | `she` | 3 | | `she` |
| 6 | `hi` | 2 | s→7 | |
| 7 | `his` | 3 | | `his` |
| 8 | `her` | 3 | s→9 | |
| 9 | `hers` | 4 | | `hers` |

Ten nodes, counting the root, for twelve pattern characters, thanks to shared prefixes. Walking the text `ushers` through this trie from position 0 fails at once (`u` is not a child of the root). Restart at position 1: `s`, `h`, `e` reaches node 5, a match. Restart at position 2: `h`, `e`, `r`, `s` reaches node 9, another match. That is `O(n × longest pattern)` in the worst case, because every position restarts from the root.

The waste: after matching `she` at node 5, the last two characters consumed, `he`, are themselves a path from the root. The automaton should jump to node 2 and keep going.

## Failure links: KMP for a trie

KMP's failure function says, for each prefix of the pattern, "what is the longest proper suffix of this prefix that is also a prefix of the pattern". Aho-Corasick asks the same question of every trie node, across all patterns at once: for the string spelled by node `u`, what is the longest proper suffix of it that is also a node in the trie? That node is `fail(u)`.

```viz
{"type": "string", "algorithm": "kmp", "text": "ushehershers", "pattern": "hers",
 "title": "KMP on a single pattern: the failure function is Aho-Corasick with one trie branch",
 "caption": "Watch how a mismatch slides the pattern instead of restarting the text pointer. Aho-Corasick generalises the slide to a whole trie."}
```

Compute the links with a breadth-first traversal, level by level, so that when you process node `v` reached from parent `u` by character `c`, `fail(u)` is already known. Start at `f = fail(u)` and walk `f`'s own failure chain until you reach a node with a child on `c` (or the root); `fail(v)` is that child, or the root if none exists. Depth-1 nodes fail to the root (their only proper suffix is the empty string).

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

## The BFS, step by step

The queue starts as `[1, 3]` (the depth-1 nodes, already failed to the root), and each step pops a node and processes one of its children:

| step | popped `u` | edge | child `v` | start at `fail(u)` | child on edge there? | `fail(v)` | outputs on `v` |
|---|---|---|---|---|---|---|---|
| 1 | 1 `h` | `e` | 2 `he` | 0 root | no | 0 root | `{he}` |
| 2 | 1 `h` | `i` | 6 `hi` | 0 root | no | 0 root | `{}` |
| 3 | 3 `s` | `h` | 4 `sh` | 0 root | yes: 1 | 1 `h` | `{}` |
| 4 | 2 `he` | `r` | 8 `her` | 0 root | no | 0 root | `{}` |
| 5 | 6 `hi` | `s` | 7 `his` | 0 root | yes: 3 | 3 `s` | `{his}` |
| 6 | 4 `sh` | `e` | 5 `she` | 1 `h` | yes: 2 | 2 `he` | `{she}` + `{he}` |
| 7 | 8 `her` | `s` | 9 `hers` | 0 root | yes: 3 | 3 `s` | `{hers}` |

Processing order was `1, 3, 2, 6, 4, 8, 7, 5, 9`, so every parent's failure link was known before its children. Step 6 is the interesting one: `sh` fails to `h`, `h` has an `e` child, so `she` fails to `he`, and because `he` is a pattern it is copied onto `she`'s output list.

The finished automaton, which you should be able to reproduce with pen and paper:

| node | string | `fail` | dictionary link | outputs reported on arrival |
|---|---|---|---|---|
| 1 | `h` | 0 | none | |
| 2 | `he` | 0 | none | `he` |
| 3 | `s` | 0 | none | |
| 4 | `sh` | 1 `h` | none | |
| 5 | `she` | 2 `he` | 2 `he` | `she`, `he` |
| 6 | `hi` | 0 | none | |
| 7 | `his` | 3 `s` | none | `his` |
| 8 | `her` | 0 | none | |
| 9 | `hers` | 3 `s` | none | `hers` |

## Dictionary links: reporting without walking the chain

The **dictionary link** (also called the output link or dictionary-suffix link) of node `v` is the nearest node on `v`'s failure chain that ends a pattern. For `she` it is `he`. For `hers` and `his` the chain is `→ s → root`, neither of which ends a pattern, so there is none.

Reaching node `v` at text position `i` means that *every* pattern which is a suffix of `v`'s string ends at `i`, and those patterns are exactly the pattern-ending nodes on `v`'s failure chain. Walking the whole chain at every text position costs `O(depth)` per character and destroys the linear bound. Two alternatives keep it:

- **Merge output lists at build time**, as the code above does (`output[v] += output[fail[v]]`). Reporting is a scan of one list, `O(1)` per match. The cost is memory: for the pattern set `a, aa, aaa, …, a^k`, the node for `a^j` holds `j` outputs, so the lists total `k(k+1)/2` entries, 500,500 for `k = 1,000`, against `k` nodes.
- **Store one dictionary link per node** and, on arrival, follow dictionary links (not failure links) until none remains. Each hop lands on a pattern end, so each hop *is* a match: the walk costs `O(matches reported)` and memory is one integer per node (1,000 for `k = 1,000`). Production engines do this.

Two cases show that some form of this is not optional. In `ushers`, the automaton reaches node 5 (`she`) at position 3; `he` also ends at position 3, but the walk never visits node 2, it only passes *through* it via the failure link. Sharper still is `{abcd, bc, c}` against `abcd`: at the node for `abc`, which is not a pattern, the failure link goes to `bc`, a pattern, whose failure link goes to `c`, also a pattern. Both end at position 2, and a walk that only reports at the node it lands on misses both.

## Searching

At each character, follow the failure chain until a node with that child exists, step into it, and report its outputs.

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

Trace `ushers`:

| `i` | `ch` | state before | failure walk | state after | depth | reported (pattern @ start) |
|---|---|---|---|---|---|---|
| 0 | `u` | 0 root | none (root has no `u`) | 0 root | 0 | |
| 1 | `s` | 0 root | | 3 `s` | 1 | |
| 2 | `h` | 3 `s` | | 4 `sh` | 2 | |
| 3 | `e` | 4 `sh` | | 5 `she` | 3 | `she` @ 1, `he` @ 2 (via the dictionary link 5 → 2) |
| 4 | `r` | 5 `she` | 5 has no `r`; fail → 2 `he`; `he` has `r` | 8 `her` | 3 | |
| 5 | `s` | 8 `her` | | 9 `hers` | 4 | `hers` @ 2 |

Three matches, each text character consumed once, one failure transition in total. The start of a match is `end − len(pattern) + 1`. For contrast, on `shex` the automaton reaches node 5 and then, on `x`, walks `5 → 2 → 0` (two failure steps: neither `he` nor the root has `x`): depth falls from 3 to 0 in one text step.

## Why it is linear: count the depth changes

The search loop looks like it could be quadratic: a `while` inside the `for`. The argument is the same as KMP's, made precise with a counter. Let `d` be the depth of the current state.

- Each `for` iteration ends with at most one downward step (into a child), so `d` rises by at most 1 per text character: **at most `n` increases** over the whole text.
- Each `while` iteration follows a failure link, which is strictly shallower, so `d` **falls by at least 1** per failure step.
- `d` starts at 0 and is never negative, so the total fall cannot exceed the total rise.

Hence the total number of failure steps is at most `n`, and the search is `O(n + z)` where `z` is the number of matches reported. In the `ushers` trace, depth rose 5 times (`0→1→2→3`, then `2→3→4`) and fell once (`3→2` on the `r`). Building the failure links is `O(m)` for total pattern length `m` by the same argument along each root-to-leaf path: every failure step during the BFS is paid for by a depth increase along that path.

The `z` term is real: patterns `a, aa, …, a^k` against `a^n` produce about `k·n` matches, and nothing reports them faster than it writes them. If you only need "does any pattern occur", stop at the first non-empty output and the search is `O(n)` flat.

## Full DFA versus NFA with failure links

The automaton above is a *nondeterministic* form: a state may need several failure steps to consume one byte. Precompute the result of every (state, byte) pair once and you get a **deterministic** goto table `δ(state, c)`, and the search becomes one array load per byte with no loop. For the four-pattern automaton, restricted to the five letters in the patterns (every other byte goes to the root):

| state | `e` | `h` | `i` | `r` | `s` |
|---|---|---|---|---|---|
| 0 root | 0 | 1 | 0 | 0 | 3 |
| 1 `h` | 2 | 1 | 6 | 0 | 3 |
| 2 `he` | 0 | 1 | 0 | 8 | 3 |
| 3 `s` | 0 | 4 | 0 | 0 | 3 |
| 4 `sh` | 5 | 1 | 6 | 0 | 3 |
| 5 `she` | 0 | 1 | 0 | 8 | 3 |
| 6 `hi` | 0 | 1 | 0 | 0 | 7 |
| 7 `his` | 0 | 4 | 0 | 0 | 3 |
| 8 `her` | 0 | 1 | 0 | 0 | 9 |
| 9 `hers` | 0 | 4 | 0 | 0 | 3 |

Read row 5 (`she`): `δ(5, r) = 8`, the failure step to `he` followed by the `r` edge, folded into one entry; `δ(5, h) = 1` because after `sheh` the longest suffix in the trie is `h`; `δ(9, h) = 4` because after `hersh` it is `sh`. Filling the table costs one failure walk per (state, byte) pair, `O(states × alphabet)` build time, and the search then never loops.

## The memory arithmetic

The price of the table is memory, and it is arithmetic you should be able to do in an interview:

| representation | memory for 10 states | memory for 5 × 10⁵ states | work per text byte |
|---|---|---|---|
| Sparse NFA (a hash map per node) | tens of bytes per transition plus map overhead; 11 transitions here | roughly the pattern bytes × a small constant | hash lookup plus failure loop |
| Full DFA, 256 columns of `u32` | `10 × 256 × 4 = 10,240` bytes | `5 × 10⁵ × 256 × 4 ≈ 488 MiB` | one load |
| Full DFA, byte classes | `10 × 6 × 4 = 240` bytes (5 letters + "other") | with ~40 classes, `5 × 10⁵ × 40 × 4 ≈ 76 MiB` | one class lookup, one load |
| Compressed DFA (banded / sparse rows) | between the two | typically 5–20× smaller than the full table, ruleset-dependent | two or three loads, branchy |

**Byte classes** are the lever: bytes that appear in no pattern are indistinguishable to the automaton, and bytes that always lead to the same states share a column. A ruleset over ASCII text with case folding rarely needs more than 30–60 classes out of 256. Five hundred thousand states is the order of magnitude a ruleset of 40,000 content strings averaging 15–20 bytes reaches after prefix sharing; it depends on how much the signatures overlap, so treat it as an estimate.

## Match semantics: overlapping, leftmost-first, leftmost-longest

The automaton as written reports **every** match, overlapping and nested ones included. That is right for "which signatures fired" and wrong for "replace each banned word", where a regex-style answer is expected. The three semantics production libraries offer, on `ushers` with patterns listed as `[she, he]`:

| semantics | reports | rule |
|---|---|---|
| Standard (all) | `she` @ 1, `he` @ 2 | everything, as the automaton arrives at each state |
| Leftmost-first | `she` @ 1 only | among matches starting earliest, the pattern listed first wins; the search resumes after the match, so `he` @ 2 is skipped |
| Leftmost-longest | `she` @ 1 only | among matches starting earliest, the longest wins |

Leftmost-first with `[he, hers]` on `hers` reports `he`, leftmost-longest reports `hers`. Leftmost semantics cannot be bolted onto the standard automaton by filtering its output, because the standard automaton commits to `he` at position 1 before it knows whether `hers` will complete; libraries build a different automaton, in which failure transitions out of a match state are pruned so the search cannot wander into a later-starting match. Decide the semantics before you build.

## Under the hood: the Rust `aho-corasick` crate and `ripgrep`

The `aho-corasick` crate (version 1.x; the `regex` crate short-circuits a large alternation of plain literals straight to it, and `ripgrep` inherits it for `-F -f patterns.txt`) is the clearest production implementation to read. It has three automaton kinds, selectable with `AhoCorasickKind`:

- **Noncontiguous NFA**: the classic build, each state owning a small list of transitions and a failure link. Cheapest to construct, slowest to search, the intermediate form for the other two.
- **Contiguous NFA**: the same automaton re-laid-out into one flat `Vec<u32>`, with dense transition rows for the states near the start (up to the builder's `dense_depth`), which the search visits most, and sparse rows for deeper ones. Still follows failure links, but every access is an array index in a cache-friendly block. The default for large pattern sets.
- **DFA**: the full goto table with byte classes, as above; memory is `states × classes × 4` bytes. The default heuristic picks it only for small pattern sets (at most 100 patterns in the current 1.x source), otherwise a contiguous NFA, falling back to the noncontiguous one if that cannot be built; the threshold is an internal constant, so check the version you ship.

Match semantics are a build option (`MatchKind::{Standard, LeftmostFirst, LeftmostLongest}`), as is ASCII case-insensitivity, implemented by adding both cases of each letter as transitions rather than by lowercasing the haystack.

The crate also ships **Teddy**, a SIMD prefilter borrowed from Hyperscan, used when the pattern set is small (dozens of patterns, not thousands; the cap is a crate constant). Teddy groups patterns into 8 or 16 buckets and, for each 16- or 32-byte block of text, uses byte-shuffle instructions (`pshufb`/`vpshufb`) as nibble-indexed table lookups to compute, in a handful of instructions, a mask of positions where some bucket's first one to three bytes might match. Only those positions are verified against the real patterns. Where matches are rare that skips the automaton for most bytes, which is why `ripgrep` with a few fixed strings runs near memory bandwidth rather than at one state transition per byte.

## Under the hood: IDS engines, `grep`, antivirus and WAFs

| system | multi-pattern engine | what to know |
|---|---|---|
| **Snort 3** | `search_engine.search_method`: `ac_bnfa` (the default, an Aho-Corasick NFA "with compacted sparse storage"), `ac_full` ("high memory, best performance") or Hyperscan | The choice exists because a full DFA over tens of thousands of content strings costs hundreds of megabytes; `ac_bnfa` trades extra loads per byte for a table that fits in cache. The matcher runs on the literal `content` parts of rules; offsets and PCRE run on its candidates |
| **Suricata** | `mpm-algo: ac` (a full state table with 16-bit entries while the automaton has fewer than 32,767 states, 32-bit above), `ac-ks` (a compact variant), `hs` (Hyperscan) | Pattern sets are split per rule group so each automaton stays small. Rule reloads build a new detection engine and swap it, because the automaton is static |
| **Hyperscan / Vectorscan** | Compiles regex *sets* to a graph of engines; literal sets use Teddy when it can be built and fall back to FDR, a separate literal matcher | Open-sourced by Intel in October 2015 (releases after 5.4 are proprietary); Vectorscan is the BSD-licensed fork that adds ARM and Power. The engine behind the `hs` options above |
| **GNU `grep`** | `kwset.c`: Boyer-Moore for one fixed string, an Aho-Corasick/Commentz-Walter trie for `-F` with several, the blend changing across releases | `grep -F -f words.txt file` is the everyday multi-pattern case; `-i` folds the patterns rather than lowercasing the file |
| **ClamAV** | Aho-Corasick over a *depth-limited* trie (engine options `CL_ENGINE_AC_MINDEPTH`/`CL_ENGINE_AC_MAXDEPTH`, defaults 2 and 3) plus Boyer-Moore for simple signatures and hashes for whole files | The trie indexes only the first few bytes of each signature; a hit triggers verification of the rest, wildcards included. Depth-limiting caps the automaton's size at the cost of more verification on common prefixes |
| **ModSecurity** | `@pm` and `@pmFromFile` operators are Aho-Corasick | The OWASP Core Rule Set uses them for scanner user-agents and LFI file-name lists: one pass over a header checks hundreds of literals |

The sizes above are orders of magnitude on purpose: they depend on the ruleset and the version.

## Production failure modes

| symptom | diagnosis | fix |
|---|---|---|
| The matcher takes hundreds of MB or fails to allocate after the pattern list grew | A full DFA: `states × 256 × 4` bytes; 5 × 10⁵ states is ~488 MiB. Confirm by printing the state count | Byte classes (often 5–8× smaller), a compressed or NFA representation, or several automata split by rule group as Suricata does |
| Memory grows quadratically with the pattern count when patterns are suffixes of each other (`a, aa, aaa, …`) | Output lists merged at build time total `k(k+1)/2` entries for a chain of `k` | One dictionary link per state, walked on arrival; cost becomes `O(matches)` |
| Every block-list change stalls the service; p99 spikes on each config push | The automaton is static: one new pattern rebuilds the trie and all failure links, `O(m)` over the whole set, seconds in Python for a few MB of patterns, tens of ms in Rust or C | Build the new automaton in the background and swap a pointer (Suricata's rule reload); or a small delta automaton for recent additions, merged on a schedule |
| Case-insensitive matches report wrong offsets, or miss `İstanbul` | The haystack was lowercased with a full Unicode mapping: `"İ".lower()` is two code points and `"ß".casefold()` is `ss`, so offsets in the folded text do not map back | Fold with a length-preserving mapping (ASCII, or Unicode simple case folding), or build both cases into the transitions as the `aho-corasick` crate does |
| A profanity filter replaces `she` and also mangles the `he` inside it; a tokeniser reports overlapping tokens | Standard semantics report every overlapping and nested match | Build with leftmost-first (or leftmost-longest) semantics; filtering the standard output afterwards does not work |
| Signatures that straddle two TCP segments or two file chunks are never detected | The search restarts at the root for each chunk | Carry the automaton *state* across chunk boundaries; it is exactly the summary of the unconsumed suffix, so no bytes are re-scanned. Report positions with a running offset |

## In interviews

The tell is "many patterns, one text" or "a dictionary and a stream". The junior answer is a loop of `text.find(pattern)` calls; the mid-level answer is a trie with restarts; the senior answer names Aho-Corasick, states the `O(n + m + z)` bound, and explains the failure link as KMP generalised to a trie. You are rarely asked to write the full automaton in 45 minutes, but you may be asked to write the trie, describe the BFS that adds the links, and argue why the search is linear.

If the interviewer flips it to "one pattern, many texts", the answer changes to preprocessing the *texts*: a suffix array or suffix automaton, which the [next lesson](/learn/advanced-data-structures/advanced-strings/suffix-arrays-and-lcp) covers. Keep the two directions straight.

Warm up on [Implement Trie](/practice/implement-trie), then [Word Search II](/practice/word-search-ii), a trie walk over a grid. The same trie appears in [search autocomplete](/learn/system-design/case-studies/search-autocomplete); autocomplete walks *down* from a prefix, Aho-Corasick walks *sideways* along failure links.

## Interviewer follow-ups

**"Why not concatenate the patterns into one regex `he|she|his|hers` and use the regex engine?"** Model answer: a backtracking engine tries each alternative at each position, `O(n × patterns × pattern length)` in the worst case; a good engine avoids that: Rust's `regex` hands a large literal alternation to Aho-Corasick, Hyperscan to Teddy or FDR, and an automaton engine such as RE2 runs a DFA whose states for an unanchored literal alternation are the Aho-Corasick states. The regex is fine *because* the engine turns it into a multi-pattern matcher like this one. Common wrong answer: "regex is always slower", or "regex is fine" without knowing why.

**"Your automaton uses 900 MB. What are your options?"** Model answer: the number is `states × alphabet × 4`, so cut the alphabet with byte classes, use a compressed or failure-link representation for the deep states, or partition the patterns into several automata; also check for suffix-chain patterns inflating output lists. Common wrong answer: "use a smaller integer type", which helps by at most 2× and breaks past 65,535 states.

**"A signature spans two packets. How do you detect it without buffering?"** Model answer: keep the automaton state per flow between packets; the state encodes the longest pattern-prefix that is a suffix of what has been seen, which is precisely what a straddling match needs. Common wrong answer: buffer the last `max pattern length − 1` bytes and re-scan them, which works but re-reads bytes and reports duplicates unless deduplicated.

**"How do you get leftmost-longest behaviour, like a tokeniser?"** Model answer: build the automaton for that semantics (failure transitions out of match states are pruned so the search cannot drift into a later-starting match) and jump past each match; or, with the standard automaton, collect matches per start position and take the longest, with care at overlaps. Common wrong answer: sort the patterns by length descending and take the first match reported, which fails because the standard automaton reports shorter matches *before* the longer one starting at the same position has finished.

**"Why is the search O(n) if there is a while loop inside the for loop?"** Model answer: depth rises at most once per character and every failure step lowers it, so failure steps are bounded by `n` overall. Common wrong answer: "the trie has bounded depth", which bounds one iteration by the longest pattern, giving `O(n × longest pattern)`, not `O(n)`.

## What mid-level engineers get wrong

- **Reporting only at the landing node.** Patterns that are suffixes of the current node's string (`he` inside `she`, `bc` and `c` inside `abcd`) are missed: the filter leaks exactly the words nested inside longer words.
- **Walking the full failure chain at every position "to be safe".** Correct output, but `O(n × depth)`; a long common prefix is the adversarial input.
- **Assuming the DFA is free.** It removes a loop, not a complexity class; the memory is `states × alphabet × 4`, which is why IDS engines ship compressed tables alongside the full one.
- **Rebuilding on every pattern change in the request path.** The build is linear in the total pattern size: fine offline, a latency spike online.
- **Lowercasing the haystack for case-insensitive search.** Unicode case mapping changes lengths; offsets no longer line up with the original text.
- **Using standard (all matches) semantics for replacement.** Overlapping matches overwrite each other and the output depends on iteration order.

## Exercises

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

```exercise
id: aho-corasick-censor
title: Censor every banned word in one pass
prompt: |
  Implement `censor(banned, text)`: return `text` with every character that
  lies inside an occurrence of any word in `banned` replaced by `*`.
  Occurrences may overlap or nest (`he` inside `she`); a character covered
  by any occurrence is censored. Characters outside every occurrence are
  unchanged. `banned` may be empty and `text` may be empty.

  Build the automaton once and make a single pass over `text`. Do not
  rewrite the string per match: record the covered ranges (a difference
  array of +1 at each start and -1 after each end works) and produce the
  output in a final pass.
languages: [python, javascript]
entry: censor
starter:
  python: |
    from collections import deque

    def censor(banned, text):
        # build the Aho-Corasick automaton over banned (reuse find_all's build)
        # single pass: at position i, for each pattern idx reported, mark
        #   start = i - len(banned[idx]) + 1 .. i as covered (difference array)
        # final pass: '*' where covered, else the original character
        return text
  javascript: |
    function censor(banned, text) {
      // build the Aho-Corasick automaton over banned (reuse find_all's build)
      // single pass: at position i, for each pattern idx reported, mark
      //   start = i - banned[idx].length + 1 .. i as covered (difference array)
      // final pass: '*' where covered, else the original character
      return text;
    }
tests:
  - args: [["he", "she", "his", "hers"], "ushers"]
    expected: "u*****"
    label: she, he and hers overlap to cover positions 1 to 5
  - args: [["ab", "bc"], "abcabc"]
    expected: "******"
  - args: [["xyz"], "abc"]
    expected: "abc"
    label: nothing banned occurs
  - args: [[], "abc"]
    expected: "abc"
    label: empty banned list
  - args: [["aa"], "aaa"]
    expected: "***"
    label: overlapping occurrences of one word
  - args: [["in", "tin", "sting"], "stinting"]
    expected: "s******g"
    hidden: true
    label: sting does not occur; tin and in do, twice each
  - args: [["cat", "at", "t"], "concatenate"]
    expected: "con***en**e"
    hidden: true
    label: at and t are reported through dictionary links, and at occurs again later
  - args: [["a"], ""]
    expected: ""
    hidden: true
    label: empty text
hints:
  - "Reuse the trie, BFS failure links and merged outputs from the previous exercise; the only new part is what you do with each reported match."
  - "Keep diff of length len(text) + 1; on a match of length L ending at i do diff[i - L + 1] += 1 and diff[i + 1] -= 1. A running sum over diff is positive exactly on covered characters."
  - "Return early when banned is empty or text is empty."
```

## Senior signals

- You describe Aho-Corasick as "a trie with KMP's failure function", and you can compute the failure links and dictionary links for a small trie by hand with the BFS.
- You explain the `O(n + m + z)` bound by counting depth increases and decreases, and you know that `z` can dominate and how to short-circuit when only existence matters.
- You know why dictionary links (or merged output lists) are needed, can give a pattern set that breaks an implementation without them, and know what merged lists cost on suffix-chain pattern sets.
- You distinguish "many patterns, one text" (Aho-Corasick) from "one pattern, many texts" (index the texts).
- You compute full-DFA memory as `states × alphabet × 4` bytes, name byte classes and compressed rows as the levers, and can say why Snort's default is a compressed NFA rather than the full table.
- You know the three match semantics, that leftmost-first needs a differently built automaton, and which one replacement or tokenising needs.
- You know the automaton state is the carry across chunk boundaries, the structure is static and rebuilt on change, and case folding must preserve lengths.

## Check yourself

```quiz
- q: >-
    What does the failure link of a trie node u point to?
  options: ["The node for the longest pattern that is a proper prefix of u's string", "The root, so every mismatch restarts matching from the empty string", "The parent of u, so a mismatch backs off by exactly one character", "The node for u's longest proper suffix that is also in the trie"]
  answer: 3
  explanation: >-
    Exactly KMP's failure function applied across all patterns: the longest proper suffix of u's string that also appears in the trie. It tells the automaton the deepest state consistent with the text read so far after a mismatch, so no text character is reread. Always failing to the root would throw away a suffix that may still be part of a match.
- q: >-
    Why is the search loop O(n + z) despite the nested while loop over failure links?
  options: ["Depth rises at most 1 per character and each failure step lowers it", "Failure targets are cached, so each node's chain is walked only once", "The while loop runs at most once for each character of the text read", "The trie's depth is bounded, so each failure chain has constant length"]
  answer: 0
  explanation: >-
    The depth-counting argument: depth starts at 0, rises by at most one per character, and every failure step strictly lowers it, so failure steps are bounded by the total rise, n. The while loop can run many times for one character, but not many times overall. Bounding by the trie depth gives only O(n × longest pattern).
- q: >-
    With patterns {abcd, bc, c} and text "abcd", an implementation that reports only at the node it lands on finds "abcd" alone. What is missing?
  options: ["Dictionary links: the failure chain from 'abc' reaches patterns 'bc' and 'c'", "Overlap support: after a match the search jumps past the matched text", "A second pass with the patterns reversed, to catch suffix matches", "Failure links from leaf nodes such as 'abcd', which the BFS skips"]
  answer: 0
  explanation: >-
    The node for 'abc' is not itself a pattern end, but its failure link is the node 'bc' (a pattern) whose failure link is 'c' (a pattern), and both end at the same text position. A dictionary link per node, or output lists merged along failure links at build time, reports both in O(1) per match. The automaton never skips text, so overlap is not the issue.
- q: >-
    A full-DFA Aho-Corasick over 500,000 states with a 256-byte alphabet and 4-byte state ids needs about how much memory, and what is the first lever to pull?
  options: ["About 500 MB; reduce the alphabet with byte classes", "About 50 MB; switch to 2-byte state ids to halve it", "About 5 GB; shard the text and run several automata", "About 2 MB; nothing, the table is already small"]
  answer: 0
  explanation: >-
    500,000 × 256 × 4 bytes is 512,000,000 bytes, roughly 488 MiB. Byte classes merge columns that behave identically (bytes appearing in no pattern share one class), often cutting 256 columns to 30–60, a 5–8× saving; 2-byte ids save at most 2× and stop working past 65,535 states. Sharding the text does not shrink the automaton.
- q: >-
    You build a profanity filter with the standard (all-matches) automaton over ["she", "he"] and replace each match with asterisks. On "ushers" what happens, and what is the fix?
  options: ["Nothing is reported, since 'u' is not in the trie; strip unknown bytes first", "The search loops forever on the failure links; add the root-guard check", "Both 'she' and the nested 'he' are reported; build with leftmost-first semantics", "Only 'she' is reported, since 'he' is nested inside it; add dictionary links"]
  answer: 2
  explanation: >-
    Standard semantics report every match, including 'he' at position 2 nested inside 'she' at position 1, so two replacements land on overlapping ranges and the result depends on the order they are applied. Leftmost-first semantics report 'she' and resume after it. Dictionary links are already what makes 'he' appear; unknown bytes are handled by staying at the root.
- q: >-
    Signatures are being missed exactly when they straddle two TCP segments. Which fix keeps the scan linear and avoids re-reading bytes?
  options: ["Rebuild the automaton per flow with the segment boundary as a pattern", "Carry the automaton state from the end of one segment into the next", "Re-scan the last max-pattern-length bytes of the previous segment", "Buffer the whole flow and scan it once the connection closes"]
  answer: 1
  explanation: >-
    The current state already summarises the longest pattern prefix that is a suffix of everything seen, which is exactly the information a straddling match needs; keeping it per flow costs one integer. Re-scanning a tail works but re-reads bytes and duplicates reports unless deduplicated, and buffering whole flows destroys the streaming property that made Aho-Corasick attractive.
```

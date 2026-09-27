---
slug: suffix-arrays-and-lcp
title: "Suffix arrays and LCP: index the text once, query forever"
description: How sorting a string's suffixes turns substring search into binary search, how prefix doubling builds the array in O(n log n) and Kasai's trick builds LCP in O(n), and why genome aligners and full-text engines reach for it.
minutes: 38
difficulty: hard
tags: [suffix-array, lcp, string-matching, binary-search, genomics, full-text-search]
problems: [longest-repeating-replacement]
---
The previous lesson preprocessed the *patterns*. Flip the problem: the text is fixed and enormous (a 3-billion-character genome, a corpus of every document your company has ever stored) and the queries arrive forever. Rebuilding an Aho-Corasick automaton per query batch is pointless; you want to spend `O(n log n)` once on the text and then answer "where does `p` occur" in time that depends on `|p|`, not `n`.

A suffix tree does this in `O(|p|)` per query but costs 20–40 bytes per text character and is notoriously fiddly to build. A **suffix array** is the same information flattened into `n` integers, built with a sort, and queried with binary search. Add the **LCP array** (longest common prefix between adjacent sorted suffixes) and you recover nearly everything the tree could do: longest repeated substring, number of distinct substrings, and the enumeration of all repeats.

## What a suffix array is

Every suffix of `banana`, by starting index:

| index | suffix |
|---|---|
| 0 | `banana` |
| 1 | `anana` |
| 2 | `nana` |
| 3 | `ana` |
| 4 | `na` |
| 5 | `a` |

Sort them lexicographically and record the starting indices:

| rank | index | suffix |
|---|---|---|
| 0 | 5 | `a` |
| 1 | 3 | `ana` |
| 2 | 1 | `anana` |
| 3 | 0 | `banana` |
| 4 | 4 | `na` |
| 5 | 2 | `nana` |

`sa = [5, 3, 1, 0, 4, 2]`. That is the whole structure: `n` integers. The inverse, `rank[i]` = position of suffix `i` in `sa`, is `[3, 2, 5, 1, 4, 0]`.

Every substring of the text is a prefix of some suffix, so every substring occurrence corresponds to a contiguous run of `sa`: the suffixes that start with `p` are adjacent in sorted order. `ana` occurs at suffixes ranked 1 and 2 (indices 3 and 1), which is exactly the two occurrences of `ana` in `banana`.

## Searching: binary search over suffixes

To find all occurrences of `p`, binary-search for the first suffix that is `≥ p` and the first that is `> p` when compared on the first `|p|` characters. Each comparison costs `O(|p|)`, so a query is `O(|p| log n)`.

```python
def occurrences(text, sa, p):
    lo, hi = 0, len(sa)
    while lo < hi:                       # first suffix >= p
        mid = (lo + hi) // 2
        if text[sa[mid]:sa[mid] + len(p)] < p:
            lo = mid + 1
        else:
            hi = mid
    start = lo
    hi = len(sa)
    while lo < hi:                       # first suffix > p (on |p| chars)
        mid = (lo + hi) // 2
        if text[sa[mid]:sa[mid] + len(p)] <= p:
            lo = mid + 1
        else:
            hi = mid
    return sorted(sa[start:lo])
```

`occurrences("banana", sa, "ana")` returns `[1, 3]`. With the LCP array and some care the `|p|` factor can be shaved to `O(|p| + log n)`, but the simple version above is what you would write in an interview and it is what many production systems ship.

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "bananabandana", "pattern": "ana",
 "title": "Contrast: Rabin-Karp scans the text per query",
 "caption": "Rolling-hash search is O(n) per query and needs no index. Once the same text is queried thousands of times, the O(n log n) index pays for itself."}
```

## Building it: prefix doubling

Sorting `n` suffixes with a comparison sort costs `O(n log n)` comparisons, each of which can take `O(n)` character comparisons, giving `O(n² log n)`; on a genome that is a heat death. Prefix doubling (Manber and Myers, 1990) sorts the suffixes by their first `1, 2, 4, 8, …` characters, reusing the previous round's ranks so that every comparison is `O(1)`.

After round `k`, `rank[i]` is the rank of suffix `i` among all suffixes when only the first `2^k` characters are compared. To go to `2^(k+1)` characters, note that the first `2^(k+1)` characters of suffix `i` are the first `2^k` of suffix `i` followed by the first `2^k` of suffix `i + 2^k`. So the sort key for suffix `i` is the pair `(rank[i], rank[i + 2^k])`, with `-1` for a suffix that runs off the end (shorter suffixes sort first).

```python
def suffix_array(s):
    n = len(s)
    sa = list(range(n))
    rank = [ord(c) for c in s]
    k = 1
    while True:
        key = lambda i: (rank[i], rank[i + k] if i + k < n else -1)
        sa.sort(key=key)
        new_rank = [0] * n
        for j in range(1, n):
            new_rank[sa[j]] = new_rank[sa[j - 1]] + (key(sa[j]) != key(sa[j - 1]))
        rank = new_rank
        if n == 0 or rank[sa[-1]] == n - 1:     # all ranks distinct: done
            break
        k *= 2
    return sa
```

Trace on `banana`:

| round | compares | keys `(rank[i], rank[i+k])` for `i = 0..5` | `sa` after sort | new ranks (by index 0..5) |
|---|---|---|---|---|
| start | 1 char | `rank = [98, 97, 110, 97, 110, 97]` (character codes) | | |
| `k=1` | 2 chars | `(98,97) (97,110) (110,97) (97,110) (110,97) (97,-1)` | `[5, 1, 3, 0, 2, 4]` | `[2, 1, 3, 1, 3, 0]` |
| `k=2` | 4 chars | `(2,3) (1,1) (3,3) (1,0) (3,-1) (0,-1)` | `[5, 3, 1, 0, 4, 2]` | `[3, 2, 5, 1, 4, 0]` |

After `k = 1`, suffixes 1 and 3 (`anana`, `ana`) still tie on `an`, as do 2 and 4 (`nana`, `na`). In round `k = 2` each key's second component is the rank two characters further on: suffix 3 continues with suffix 5 (`a`, rank 0) and suffix 1 continues with suffix 3 (`ana`, rank 1), so `ana` sorts before `anana`. All ranks are distinct after this round, so the loop stops.

Each round is one sort, `O(n log n)`, and there are `O(log n)` rounds, so `O(n log² n)` total. Replacing the comparison sort with a two-pass radix sort on the pair keys makes each round `O(n)` and the whole build `O(n log n)`. The SA-IS algorithm (2009) builds in true `O(n)` and is what libdivsufsort and most genome tools use, but prefix doubling is what you should be able to write.

## The LCP array

`lcp[i]` is the length of the longest common prefix of the suffixes at `sa[i - 1]` and `sa[i]`, with `lcp[0] = 0`. For `banana`:

| `i` | `sa[i]` | suffix | `lcp[i]` |
|---|---|---|---|
| 0 | 5 | `a` | 0 |
| 1 | 3 | `ana` | 1 (`a`) |
| 2 | 1 | `anana` | 3 (`ana`) |
| 3 | 0 | `banana` | 0 |
| 4 | 4 | `na` | 0 |
| 5 | 2 | `nana` | 2 (`na`) |

Computing each entry by direct comparison is `O(n)` per entry and `O(n²)` total. Kasai's algorithm (2001) does it in `O(n)` with one observation: if suffix `i` has LCP `h` with its predecessor in sorted order, then suffix `i + 1` has LCP **at least** `h - 1` with *its* predecessor, because dropping the first character of both strings preserves a common prefix of length `h - 1`, and suffix `i + 1`'s sorted predecessor is at least as close to it as that.

So walk the suffixes in *text* order (`i = 0, 1, 2, …`), keep a running `h`, and at each step compare from `h` onward instead of from 0. `h` increases at most `n` times in total and decreases by at most 1 per step, so the total comparison work is `O(n)`.

```python
def lcp_array(s, sa):
    n = len(s)
    rank = [0] * n
    for r, i in enumerate(sa):
        rank[i] = r
    lcp = [0] * n
    h = 0
    for i in range(n):
        if rank[i] == 0:
            h = 0
            continue
        j = sa[rank[i] - 1]              # predecessor of suffix i in sorted order
        while i + h < n and j + h < n and s[i + h] == s[j + h]:
            h += 1
        lcp[rank[i]] = h
        if h:
            h -= 1
    return lcp
```

Trace the interesting steps on `banana`: `i = 1` (`anana`, rank 2, predecessor `ana` at 3): compare from `h = 0`, match `a, n, a`, stop at `n` vs end: `h = 3`, `lcp[2] = 3`, then `h = 2`. `i = 2` (`nana`, rank 5, predecessor `na` at 4): start comparing at offset 2 (`n` vs end of `na`), immediately stop, `lcp[5] = 2`, `h = 1`. `i = 3` (`ana`, rank 1, predecessor `a` at 5): compare from offset 1, `n` vs end, stop, `lcp[1] = 1`, `h = 0`. The offsets skipped are the savings.

## What LCP unlocks

**Longest repeated substring** is `max(lcp)`. For `banana` it is 3, `ana`. For `mississippi` it is 4, `issi`. Two occurrences of a repeat are adjacent in sorted order because they share a long prefix, so the maximum LCP between neighbours finds the longest repeat in `O(n)` after the build.

**Number of distinct substrings** is `n(n+1)/2 − Σ lcp[i]`: each suffix contributes its length in prefixes, minus the ones it shares with its sorted predecessor. `banana` has `21 − 6 = 15` distinct substrings.

**Longest common substring of two strings** `A` and `B`: build the suffix array of `A + '#' + B`, then the answer is the maximum `lcp[i]` where suffixes `sa[i−1]` and `sa[i]` come from different sides of the `#`. The generalisation to `k` strings uses a sliding window over the sorted suffixes.

**Range-minimum over LCP** gives the LCP of any two suffixes, not just adjacent ones: `lcp(sa[i], sa[j]) = min(lcp[i+1..j])`. That is a static range-min query, which is the [sparse table](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition) from the range-queries module, and it turns the suffix array into a full replacement for the suffix tree's ancestor queries.

## Suffix arrays versus suffix trees versus FM-index

| Structure | Build | Space per char | Search | Notes |
|---|---|---|---|---|
| Suffix tree | `O(n)` (Ukkonen) | 20–40 bytes | `O(|p|)` | Rarely used at scale; pointer-heavy |
| Suffix array + LCP | `O(n log n)` or `O(n)` | 8–12 bytes (two int arrays) | `O(|p| log n)` | The practical default |
| FM-index (BWT + rank) | `O(n)` | 0.5–2 bytes (compressed) | `O(|p|)` | Bowtie, BWA, `bzip2`'s cousin |

The FM-index stores the Burrows-Wheeler transform of the text (which is the last column of the sorted rotations, essentially the suffix array read differently) plus rank structures, and supports backward search in `O(|p|)` using a fraction of the text's own size. It is why a human genome index fits in about 3 GB of RAM and why short-read aligners can place hundreds of millions of 150-character reads in hours.

For engineers outside genomics, the practical mapping is: Lucene and Elasticsearch use inverted indexes over *tokens*, not suffix arrays over *characters*, because word-granular queries are what users type; suffix arrays appear in "substring of any field" search, in code search (Google Code Search's original trigram index was a compromise between the two), in plagiarism detection, and in data-compression tooling where finding repeats *is* the job.

## In interviews

You will not build SA-IS on a whiteboard. What you can be asked: define the suffix array and LCP on a short string by hand (do `banana` until you can do it in your sleep), write prefix doubling with a tuple sort, write Kasai's algorithm and explain the `h − 1` argument, and use `max(lcp)` for the longest repeated substring. The senior move is to know the space numbers and to pick between Aho-Corasick (many patterns, one text), a suffix array (one text, many queries), and an inverted index (word queries over many documents) from the shape of the workload.

Contrast with [Longest Repeating Character Replacement](/practice/longest-repeating-replacement), which sounds like a suffix problem and is a sliding window; part of the skill is not reaching for the heavy tool.

## Exercises

```exercise
id: suffix-array-build
title: Build a suffix array
prompt: |
  Return the suffix array of `s`: the list of starting indices of all
  suffixes of `s`, sorted lexicographically. Use prefix doubling (sort by
  (rank[i], rank[i + k]) with k doubling each round) so the build is
  O(n log² n). Return `[]` for the empty string.
languages: [python, javascript]
entry: suffix_array
starter:
  python: |
    def suffix_array(s):
        n = len(s)
        sa = list(range(n))
        rank = [ord(c) for c in s]
        # TODO: k = 1; repeat: sort sa by (rank[i], rank[i+k] or -1), rerank, stop when all distinct
        return sa
  javascript: |
    function suffix_array(s) {
      const n = s.length;
      const sa = Array.from({ length: n }, (_, i) => i);
      let rank = Array.from(s, c => c.charCodeAt(0));
      // TODO: k = 1; repeat: sort sa by (rank[i], rank[i+k] or -1), rerank, stop when all distinct
      return sa;
    }
tests:
  - args: ["banana"]
    expected: [5, 3, 1, 0, 4, 2]
  - args: ["abaab"]
    expected: [2, 3, 0, 4, 1]
  - args: ["aaa"]
    expected: [2, 1, 0]
    label: all equal characters
  - args: ["a"]
    expected: [0]
  - args: [""]
    expected: []
    label: empty
  - args: ["mississippi"]
    expected: [10, 7, 4, 1, 0, 9, 8, 6, 3, 5, 2]
    hidden: true
  - args: ["abcabc"]
    expected: [3, 0, 4, 1, 5, 2]
    hidden: true
hints:
  - "A suffix that runs off the end gets second key -1 so that shorter suffixes sort before longer ones with the same prefix."
  - "Reranking: walk sa in order; new_rank[sa[j]] = new_rank[sa[j-1]] + (key(sa[j]) != key(sa[j-1])). Stop when rank[sa[n-1]] == n - 1."
  - "In JavaScript, sort with a comparator on the two-part key; do not compare strings."
```

```exercise
id: lcp-array-kasai
title: Build the LCP array with Kasai's algorithm
prompt: |
  Return the LCP array of `s`: `lcp[i]` is the length of the longest
  common prefix of the suffixes at `sa[i-1]` and `sa[i]` in the suffix
  array, with `lcp[0] = 0`. Build the suffix array however you like
  (reuse your previous exercise), then compute LCP in O(n) using Kasai's
  observation that `h` drops by at most 1 between consecutive text
  positions. Return `[]` for the empty string.
languages: [python, javascript]
entry: lcp_array
starter:
  python: |
    def lcp_array(s):
        # build sa, then rank = inverse of sa, then Kasai's walk in text order
        return []
  javascript: |
    function lcp_array(s) {
      // build sa, then rank = inverse of sa, then Kasai's walk in text order
      return [];
    }
tests:
  - args: ["banana"]
    expected: [0, 1, 3, 0, 0, 2]
  - args: ["aaa"]
    expected: [0, 1, 2]
  - args: ["abcabc"]
    expected: [0, 3, 0, 2, 0, 1]
  - args: ["ab"]
    expected: [0, 0]
    label: no shared prefixes
  - args: ["mississippi"]
    expected: [0, 1, 1, 4, 0, 0, 1, 0, 2, 1, 3]
    hidden: true
  - args: ["a"]
    expected: [0]
    hidden: true
  - args: [""]
    expected: []
    hidden: true
hints:
  - "rank[sa[r]] = r gives each suffix its sorted position; the predecessor of suffix i is sa[rank[i] - 1]."
  - "Walk i = 0..n-1 with a running h; when rank[i] == 0 there is no predecessor, so set h = 0 and continue; otherwise extend h by comparing s[i+h] with s[j+h], store lcp[rank[i]] = h, then decrement h if positive."
```

## Senior signals

- You can write the suffix array and LCP array of a short string by hand and explain the invariant that occurrences of any substring form a contiguous block of the array.
- You know prefix doubling and can state why each round's comparison is `O(1)` given the previous round's ranks.
- You can explain Kasai's `h − 1` argument in one sentence and why it makes LCP construction linear.
- You choose between Aho-Corasick, suffix array and inverted index from the workload shape, and you know the per-character space costs well enough to say why suffix trees lost.
- You know the FM-index exists, roughly how it relates to the suffix array, and why it is what genome aligners use.
- You use `max(lcp)` for longest repeat and `n(n+1)/2 − Σ lcp` for distinct substrings without deriving them from scratch.

## Check yourself

```quiz
- q: >-
    Why do all occurrences of a pattern p appear as a contiguous block in the suffix array?
  options: ["They do not; occurrences sit wherever their start positions fall", "The LCP array links suffixes with equal prefixes and groups them", "The array is built by scanning left to right, so matches are in order", "Each occurrence is a suffix starting with p, and those sort together"]
  answer: 3
  explanation: >-
    Lexicographic order sorts by prefix first, so all suffixes beginning with p sit together, bounded by the first suffix ≥ p and the first suffix > p. Two binary searches find the block. The array is in sorted order, not text order, which is exactly why start positions do not scatter the block.
- q: >-
    In prefix doubling, after sorting by the first 4 characters, what key sorts by the first 8?
  options: ["(rank4[i], rank4[i + 1]), with -1 past the end", "(rank4[i], rank4[i + 8]), with -1 past the end", "The first 8 characters of suffix i compared directly", "(rank4[i], rank4[i + 4]), with -1 past the end"]
  answer: 3
  explanation: >-
    The first 8 characters of suffix i are the first 4 of suffix i followed by the first 4 of suffix i + 4. Both ranks are known from the previous round, so the comparison is O(1). Using i + 8 would skip characters 5 to 8, and comparing characters directly would be O(n) per comparison.
- q: >-
    Kasai's algorithm computes LCP in O(n). What is the key observation?
  options: ["LCP values never decrease along the array, so h never has to reset", "If suffix i has LCP h, then suffix i + 1 has LCP at least h - 1", "Suffixes adjacent in the text have equal LCP with their predecessors", "Each LCP is a range minimum of earlier ones, found by a sparse table"]
  answer: 1
  explanation: >-
    Dropping the first character preserves a shared prefix of length h - 1 with the same neighbour, and the true predecessor of suffix i + 1 shares at least that much, so the comparison resumes from h - 1. The running h rises at most n times and falls at most once per step. Range minimum over LCP answers non-adjacent pairs after the array exists; it does not build it.
- q: >-
    You need the longest substring that appears at least twice in a 100 MB log. The cleanest approach is:
  options: ["A hash set of all substrings; keep the longest that repeats", "Suffix array plus LCP array; the answer is the maximum LCP entry", "Aho-Corasick over all substrings, reporting the longest seen twice", "Dynamic programming over all pairs of positions, as in LCS"]
  answer: 1
  explanation: >-
    The two occurrences of the longest repeat are adjacent in sorted suffix order, so max(lcp) finds it in O(n) after an O(n log n) build. All-substring hashing is O(n²) space; all-pairs DP is O(n²) time; Aho-Corasick needs the patterns up front, and all substrings is O(n²) of them.
- q: >-
    Why do short-read genome aligners use an FM-index rather than a plain suffix array?
  options: ["Its compressed form is a fraction of the text, so it fits in RAM", "Suffix arrays break on tiny alphabets, where most suffixes tie on rank", "It supports inserts, so newly sequenced reads join without a rebuild", "It builds in O(n), where a suffix array needs O(n² log n) to build"]
  answer: 0
  explanation: >-
    A suffix array needs 4–8 bytes per base, 12–24 GB for a human genome plus text; the FM-index over the Burrows-Wheeler transform compresses to a few GB and still answers pattern queries by O(|p|) backward search without decompressing. Build complexity and alphabet are not the constraints: prefix doubling builds a suffix array in O(n log n) on any alphabet.
```

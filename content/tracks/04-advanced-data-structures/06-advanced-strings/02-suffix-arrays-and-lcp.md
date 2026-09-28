---
slug: suffix-arrays-and-lcp
title: "Suffix arrays and LCP: index the text once, query forever"
description: Prefix doubling and Kasai's algorithm traced round by round on banana, binary search over suffixes with the bounds written out, what the LCP array unlocks (longest repeat, distinct substrings, LCP intervals), the FM-index arithmetic behind BWA and Bowtie, why Lucene uses none of this, and the ways suffix-array code fails in production.
minutes: 45
difficulty: hard
tags: [suffix-array, lcp, kasai, prefix-doubling, sa-is, fm-index, bwt, string-matching, binary-search, genomics, full-text-search]
problems: [longest-repeating-replacement]
---
The previous lesson preprocessed the *patterns*. Flip the problem: the text is fixed and enormous (a 3.1-billion-base genome, a corpus of every document your company has ever stored) and the queries arrive forever. Rebuilding an Aho-Corasick automaton per query batch is pointless; you want to spend `O(n log n)` once on the text and then answer "where does `p` occur" in time that depends on `|p|`, not `n`.

A suffix tree does this in `O(|p|)` per query but costs 40–80 bytes per text character and is fiddly to build. A **suffix array** is the same information flattened into `n` integers, built with a sort, and queried with binary search. Add the **LCP array** (longest common prefix between adjacent sorted suffixes) and you recover nearly everything the tree could do: longest repeated substring, number of distinct substrings, and the enumeration of all repeats. The [suffix structures lesson](/learn/data-structures/tries-and-string-structures/suffix-structures) introduced both and the Burrows-Wheeler transform; this lesson traces the constructions round by round, writes out the binary search bounds, does the FM-index memory arithmetic, and catalogues how the code fails.

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

Every substring of the text is a prefix of some suffix, so every substring occurrence corresponds to a contiguous run of `sa`: the suffixes that start with `p` are adjacent in sorted order. `ana` occurs at suffixes ranked 1 and 2 (indices 3 and 1), which is exactly the two occurrences of `ana` in `banana`. Note the ordering rule the sort relies on: `a` sorts before `ana` because a string that is a proper prefix of another is smaller. Every bug in the "sentinel" family below is a violation of that rule.

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

`occurrences("banana", sa, "ana")`, probe by probe:

| search | `lo` | `hi` | `mid` | `sa[mid]` | first 3 chars | test | move |
|---|---|---|---|---|---|---|---|
| lower bound | 0 | 6 | 3 | 0 `banana` | `ban` | `ban < ana`? no | `hi = 3` |
| | 0 | 3 | 1 | 3 `ana` | `ana` | `ana < ana`? no | `hi = 1` |
| | 0 | 1 | 0 | 5 `a` | `a` | `a < ana`? yes | `lo = 1` |
| upper bound | 1 | 6 | 3 | 0 `banana` | `ban` | `ban ≤ ana`? no | `hi = 3` |
| | 1 | 3 | 2 | 1 `anana` | `ana` | `ana ≤ ana`? yes | `lo = 3` |

The block is `sa[1:3] = [3, 1]`, returned as `[1, 3]`. Five probes for `n = 6`; for `n = 10⁹` it is about 30 probes per bound, each reading `sa[mid]` and then `|p|` bytes of text at a random position, so two cache misses per probe and roughly 120 for the query. A miss (`p = "x"`) drives both bounds to 6 and returns the empty block.

The `|p|` factor can be shaved to `O(|p| + log n)` (Manber and Myers, 1990): keep, for every binary-search node, the LCP of the pattern with the current `lo` and `hi` suffixes; the next comparison can start at `min(lcp_lo, lcp_hi)` instead of 0, and a precomputed table of LCPs between each `mid` and its two bounds makes the skip exact. It matters when `|p|` is thousands of characters; for interview-length patterns the simple version above is what to write and what many production systems ship.

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "bananabandana", "pattern": "ana",
 "title": "Contrast: Rabin-Karp scans the text per query",
 "caption": "Rolling-hash search is O(n) per query and needs no index. Once the same text is queried thousands of times, the O(n log n) index pays for itself."}
```

## Building it: prefix doubling

Sorting `n` suffixes with a comparison sort costs `O(n log n)` comparisons, each of which can take `O(n)` character comparisons, giving `O(n² log n)`; on a genome that is a heat death. Prefix doubling (Manber and Myers, 1990) sorts the suffixes by their first `1, 2, 4, 8, …` characters, reusing the previous round's ranks so that every comparison is `O(1)`.

After a round that compared `k` characters, `rank[i]` is the rank of suffix `i` among all suffixes when only the first `k` characters are compared (ties share a rank). To go to `2k` characters, note that the first `2k` characters of suffix `i` are the first `k` of suffix `i` followed by the first `k` of suffix `i + k`. So the sort key for suffix `i` is the pair `(rank[i], rank[i + k])`, with `−1` for a suffix that runs off the end (shorter suffixes sort first, which is the prefix rule from above).

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

Trace on `banana`, with initial ranks compressed to `a = 0, b = 1, n = 2` so the table stays readable (the code uses character codes, which sort identically):

| `i` | suffix | rank after 1 char | key for round `k = 1` | rank after 2 chars | key for round `k = 2` | rank after 4 chars |
|---|---|---|---|---|---|---|
| 0 | `banana` | 1 | `(1, 0)` | 2 | `(2, 3)` | 3 |
| 1 | `anana` | 0 | `(0, 2)` | 1 | `(1, 1)` | 2 |
| 2 | `nana` | 2 | `(2, 0)` | 3 | `(3, 3)` | 5 |
| 3 | `ana` | 0 | `(0, 2)` | 1 | `(1, 0)` | 1 |
| 4 | `na` | 2 | `(2, 0)` | 3 | `(3, −1)` | 4 |
| 5 | `a` | 0 | `(0, −1)` | 0 | `(0, −1)` | 0 |

After the `k = 1` round the order is `[5, 1, 3, 0, 2, 4]`: suffixes 1 and 3 (`anana`, `ana`) still tie on `an`, as do 2 and 4 (`nana`, `na`). In the `k = 2` round each key's second component is the rank two characters further on: suffix 3 continues with suffix 5 (`a`, rank 0) and suffix 1 continues with suffix 3 (`ana`, rank 1), so `ana` sorts before `anana`; suffix 4 runs off the end (`−1`) and sorts before suffix 2. The order is `[5, 3, 1, 0, 4, 2]`, all six ranks are distinct, and the loop stops.

## Rounds, radix sort and SA-IS

Each round is one sort, `O(n log n)`, and the number of sort rounds is `⌊log₂ L⌋ + 1` where `L` is the length of the longest repeated substring, because two suffixes stay tied exactly as long as the compared prefix fits inside their common part: `banana` (`L = 3`) needs 2 rounds. Random text over four letters needs 5 rounds at `n = 10⁵` (measured: 0.15 s in CPython 3.14 on one core); `a^n` needs 17 rounds at `n = 10⁵` (measured: 0.32 s). The worst case is `O(n log² n)`. Replacing the comparison sort with a two-pass radix sort on the pair keys makes each round `O(n)` and the whole build `O(n log n)`.

Linear-time construction exists and is what libraries ship: **SA-IS** (Nong, Zhang and Chan, 2009) classifies each suffix as S-type or L-type by comparing it with its successor, finds the "leftmost S" positions, sorts those recursively on a reduced problem of at most `n/2` size, and then *induces* the order of every other suffix from them in two linear scans. It is `O(n)` with small constants, but it is thirty to sixty lines of subtle index arithmetic. Prefix doubling is what you should be able to write from memory; SA-IS is what you should know exists and be able to name.

## The LCP array and Kasai's algorithm

`lcp[i]` is the length of the longest common prefix of the suffixes at `sa[i − 1]` and `sa[i]`, with `lcp[0] = 0`. For `banana`:

| `i` | `sa[i]` | suffix | `lcp[i]` |
|---|---|---|---|
| 0 | 5 | `a` | 0 |
| 1 | 3 | `ana` | 1 (`a`) |
| 2 | 1 | `anana` | 3 (`ana`) |
| 3 | 0 | `banana` | 0 |
| 4 | 4 | `na` | 0 |
| 5 | 2 | `nana` | 2 (`na`) |

Computing each entry by direct comparison is `O(n)` per entry and `O(n²)` total. Kasai's algorithm (2001) does it in `O(n)` with one observation: if suffix `i` has LCP `h` with its predecessor in sorted order, then suffix `i + 1` has LCP **at least `h − 1`** with *its* predecessor. Dropping the first character of both strings preserves a common prefix of length `h − 1`, and suffix `i + 1`'s sorted predecessor is at least as close to it as that.

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

The full walk on `banana`, with `rank = [3, 2, 5, 1, 4, 0]`:

| `i` | suffix | `rank[i]` | predecessor `j` | `h` on entry | character pairs compared | `lcp[rank[i]]` | `h` on exit |
|---|---|---|---|---|---|---|---|
| 0 | `banana` | 3 | 1 `anana` | 0 | `b` vs `a`: stop | 0 | 0 |
| 1 | `anana` | 2 | 3 `ana` | 0 | `a=a`, `n=n`, `a=a`, then `ana` ends: stop | 3 | 2 |
| 2 | `nana` | 5 | 4 `na` | 2 | offset 2: `na` has ended: stop at once | 2 | 1 |
| 3 | `ana` | 1 | 5 `a` | 1 | offset 1: `a` has ended: stop at once | 1 | 0 |
| 4 | `na` | 4 | 0 `banana` | 0 | `n` vs `b`: stop | 0 | 0 |
| 5 | `a` | 0 | none | | rank 0 has no predecessor; `h` reset | 0 | 0 |

Eight character comparisons (three matches and five terminating checks) for six suffixes. The savings are rows 2 and 3, which start at offsets 2 and 1 instead of 0: the `h − 1` carried over from `anana` was already known to match.

## What LCP unlocks

**Longest repeated substring** is `max(lcp)`. For `banana` it is 3, `ana`; for `mississippi` it is 4, `issi`. Two occurrences of a repeat are adjacent in sorted order because they share a long prefix, so the maximum LCP between neighbours finds the longest repeat in `O(n)` after the build.

**Number of distinct substrings** is `n(n + 1)/2 − Σ lcp[i]`: each suffix contributes its length in prefixes, minus the ones it shares with its sorted predecessor. `banana` has `21 − 6 = 15`: `a, b, n, an, ba, na, ana, ban, nan, anan, bana, nana, anana, banan, banana`. Check one row: `anana` (rank 2) has 5 prefixes, 3 of which (`a, an, ana`) it shares with `ana`, so it contributes 2 new ones (`anan`, `anana`).

**Longest common substring of two strings** `A` and `B`: build the suffix array of `A + '#' + B` with a separator that occurs in neither, then the answer is the maximum `lcp[i]` where `sa[i − 1]` and `sa[i]` come from different sides of the `#`. The generalisation to `k` strings uses a sliding window over the sorted suffixes.

**LCP intervals** are the suffix tree in disguise. An interval `[l, r]` of ranks with `min(lcp[l + 1..r]) = ℓ` and `lcp[l] < ℓ`, `lcp[r + 1] < ℓ` is an internal node of the suffix tree whose string is the first `ℓ` characters of any suffix in it. For `banana`, `lcp = [0, 1, 3, 0, 0, 2]` gives three: `[0, 2]` with `ℓ = 1` (`a`, three occurrences), `[1, 2]` with `ℓ = 3` (`ana`, two occurrences) and `[4, 5]` with `ℓ = 2` (`na`, two occurrences). A single stack-based pass over `lcp` enumerates them all in `O(n)`, which is how "every substring occurring at least `k` times" is answered without a tree (Abouelhoda, Kurtz and Ohlebusch, 2004, the *enhanced suffix array*).

**Range-minimum over LCP** gives the LCP of any two suffixes, not only adjacent ones: `lcp(sa[i], sa[j]) = min(lcp[i + 1..j])`. `LCP(3, 0)` (`ana` vs `banana`, ranks 1 and 3) is `min(lcp[2], lcp[3]) = min(3, 0) = 0`; `LCP(5, 1)` (`a` vs `anana`, ranks 0 and 2) is `min(1, 3) = 1`. That is a static range-min query, the [sparse table](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition) from the range-queries module, `O(n log n)` space and `O(1)` per query.

## Under the hood: the FM-index in BWA and Bowtie

Short-read aligners need "where does this 100–150-base read occur" against a 3.1-billion-base reference, hundreds of millions of times per run. Do the arithmetic for a plain suffix array first:

| structure | per base | for 3.1 × 10⁹ bases |
|---|---|---|
| Text, 2 bits per base | 0.25 B | 0.78 GB |
| Suffix array, 4-byte entries (only works below 2³² positions) | 4 B | 12.4 GB |
| Suffix array, 5-byte entries (40-bit, common in genome tools) | 5 B | 15.5 GB |
| Suffix array + LCP, 4 bytes each | 8 B | 24.8 GB |
| BWT, 2 bits per base | 0.25 B | 0.78 GB |
| Occurrence checkpoints every 128 bases (4 counts × 4 bytes) | 0.125 B | 0.39 GB |
| Sampled suffix array, every 32nd entry, 4 bytes | 0.125 B | 0.39 GB |

The FM-index (Ferragina and Manzini, 2000) keeps the last three rows and discards the first. Its parts: the Burrows-Wheeler transform, which is `text[sa[i] − 1]` for each rank and therefore *is* the suffix array read sideways; a count table `C[c]` of characters smaller than `c`; and **backward search**, which processes the pattern from its last character and maintains the rank interval of suffixes starting with the suffix of the pattern seen so far, one `O(1)` step per character using `occ(c, i)`, the number of `c` in the first `i` characters of the BWT. `occ` is answered from a checkpoint every 128 positions plus a popcount over the 2-bit-packed run up to `i`, which is why the BWT can stay packed.

Counting occurrences is `O(|p|)` and never touches the text. *Locating* them needs `sa[i]` for each row in the final interval, and that is what the sampling is for: from an unsampled row, apply the LF-mapping (one backward step, the same `occ` arithmetic) until a sampled row is hit, then add the number of steps. With every 32nd entry kept, a locate costs at most 31 extra steps and about 16 on average. BWA's index build stores the SA at interval 32 and occurrence counts every 128 bases; Bowtie's `--offrate` (default 5, meaning every 2⁵-th) is the same dial. The result is that a human-genome index is in the low single-digit gigabytes (BWA-MEM's is about 5 GB in RAM including its auxiliary arrays; Bowtie's original paper reported roughly 1.3 GB) against 12–16 GB for the suffix array alone, and it fits on a laptop. Treat those tool sizes as approximate: they depend on the release and the reference build.

## Under the hood: libraries, and what search engines use instead

If you need a suffix array in production, do not write one: **libdivsufsort** (Yuta Mori, 2008, `O(n log n)`, the standard for a decade), **sais** and **libsais** (SA-IS implementations; libsais, 2021, is among the fastest and can build the LCP array too), **sdsl-lite** (compressed suffix arrays, wavelet trees and FM-indexes in C++), and the Rust `suffix` crate (SA-IS). All of them build a 100 MB text in seconds on one core and store 4 bytes per character.

Lucene and Elasticsearch use none of this. Their term dictionary is a **finite-state transducer** (since Lucene 4, 2012) mapping each term to a block of postings, and queries are over *tokens*, not characters, which is what users type ([search engines](/learn/databases/nosql-and-specialised/search-engines) covers the inverted index and analysis). Wildcard and regex queries compile to an automaton intersected with the FST, which is fast for prefixes and slow for leading wildcards; Elasticsearch's `wildcard` field type (7.9, 2020) answers `*foo*` with a trigram index to find candidate documents and a stored copy of the value to verify them. That is the same design as Google Code Search and Zoekt: n-gram posting lists plus verification, because posting lists update per document and shard by document, and a suffix array does neither.

| structure | build | memory per character | substring query, `m` = pattern length | updates | what it answers |
|---|---|---|---|---|---|
| Suffix array | `O(n)` SA-IS; `O(n log² n)` doubling | 4 B (`int32`, `n < 2³¹`), 5–8 B beyond | `O(m log n)` exact | rebuild | any substring, positions |
| Suffix array + LCP | same plus `O(n)` Kasai | 8 B | `O(m + log n)` with bound LCPs | rebuild | plus repeats, distinct substrings, LCP intervals |
| FM-index | `O(n)` plus BWT | 0.5–2 B including samples | `O(m)` count; locate costs up to the sample interval | rebuild | count and locate, without the text |
| Inverted index + FST | `O(n)` | a few bytes per posting | term and prefix lookups; substring via n-grams | per document | ranked document retrieval |
| Trigram index | `O(n)` | a few bytes per position | candidate set, then verify | per document | regex and substring over many documents |

## Production failure modes

| symptom | diagnosis | fix |
|---|---|---|
| The Python build of a 100 MB corpus runs for minutes and is killed for memory | Prefix doubling at `n = 10⁸` allocates `n` tuple keys per round (each tuple ~64 bytes plus two `int` objects) and holds `sa`, `rank`, `new_rank` as lists at 8 bytes per slot plus 28-byte `int` objects; measured 0.15 s at `10⁵` and 0.4 s at `2 × 10⁵`, so extrapolate to minutes and tens of GB at `10⁸` | A library build (libsais, libdivsufsort, `pydivsufsort`) returning an `int32` NumPy array; keep the text as bytes |
| Garbage positions once the concatenated corpus exceeds about 2.1 GB | 32-bit suffix array entries wrapped past 2³¹ | 40-bit or 64-bit entries, or an FM-index over the concatenation with sampled positions |
| Two strings joined for longest-common-substring report a "common" substring that spans the join | The separator appears in one of the inputs, or the same separator is reused for `k` strings so suffixes from different strings share a prefix across the boundary | A separator outside the alphabet per string (distinct sentinels, or tag each suffix with its source and stop LCP comparison at a boundary) |
| A C++ or Java build produces a wrong order on inputs longer than ~46,000 characters | Pair keys packed as `rank[i] * (n + 1) + rank[i + k] + 1` overflow a 32-bit `int` once `(n + 1)² > 2³¹`, at `n = 46,340`; a JavaScript `Number` is exact only to 2⁵³, about `n = 9.5 × 10⁷` | Compare the pair without packing, or pack into a 64-bit integer |
| Occurrence queries on a repetitive log take far longer than `O(m log n)` predicts | The comparison in the binary search slices or compares the *whole* suffix instead of its first `m` characters, `O(n)` per probe on text with long repeats | Compare exactly `m` characters (the slice in the code above), or use the bound-LCP refinement |
| The index answers yesterday's corpus | A static structure over a changing text with no rebuild schedule | Scheduled rebuilds with the old index serving until the new one is ready, or an n-gram index for corpora that change per document |

## In interviews

You will not build SA-IS on a whiteboard. What you can be asked: define the suffix array and LCP on a short string by hand (do `banana` until you can do it in your sleep), write prefix doubling with a tuple sort, write Kasai's algorithm and explain the `h − 1` argument, and use `max(lcp)` for the longest repeated substring. The senior move is to know the space numbers and to pick between [Aho-Corasick](/learn/advanced-data-structures/advanced-strings/aho-corasick) (many patterns, one text), a suffix array (one text, many queries), and an inverted index (word queries over many documents) from the shape of the workload.

Contrast with [Longest Repeating Character Replacement](/practice/longest-repeating-replacement), which sounds like a suffix problem and is a sliding window; part of the skill is not reaching for the heavy tool.

## Interviewer follow-ups

**"Longest duplicate substring of a 10⁵-character string. Your rolling-hash solution can collide; make it exact."** Model answer: suffix array plus LCP, answer `max(lcp)`, `O(n log n)` build with doubling and exact by construction; or keep the binary search on length with hashing and *verify* each candidate by direct comparison. Common wrong answer: use a 64-bit hash "so collisions are negligible", which is a probabilistic argument offered where an exact one was asked for.

**"Why does the FM-index fit in RAM when the suffix array does not, and what does it give up?"** Model answer: it stores the BWT (2 bits per base) plus checkpoints and a sampled suffix array, roughly 1–2 bytes per base instead of 4–5; counting stays `O(|p|)`, but locating each occurrence costs up to one sample interval of LF-mapping steps, so a query with a million occurrences pays a million times that. Common wrong answer: "it compresses the text with bzip2", which conflates the BWT's use in compression with its use as an index.

**"Longest common substring of two 10 MB files?"** Model answer: concatenate with a unique separator, build the suffix array and LCP with a library, take the maximum LCP between adjacent suffixes from different files, `O(n)` after the build; watch the separator and the 32-bit limit. Common wrong answer: the `O(n × m)` DP table, which is 10¹⁴ cells here.

**"How many distinct substrings does a string have, and how do you count them in linear time after the build?"** Model answer: `n(n + 1)/2 − Σ lcp`, each suffix adds its prefixes minus those shared with its sorted predecessor; for `banana`, `21 − 6 = 15`. Common wrong answer: enumerate substrings into a hash set, `O(n²)` strings and `O(n³)` bytes.

**"Your service does substring search over user documents that change hourly. Suffix array?"** Model answer: no, the structure is static and rebuilding hourly over a concatenated corpus is a multi-GB job; use an n-gram or trigram index with per-document updates and verification, or the search engine's `wildcard` field, and keep suffix arrays for fixed reference texts. Common wrong answer: incremental suffix-array updates, which exist in research but not in any library you would ship.

## What mid-level engineers get wrong

- **Sorting the suffixes as Python strings** (`sorted(range(n), key=lambda i: s[i:])`). Correct, and it materialises `n²/2` characters: 5 GB for `n = 10⁵`.
- **Forgetting the prefix rule.** Comparing on `min(len)` characters and calling equal strings ties makes `a` and `ana` tie; the `−1` key or a sentinel smaller than every character is what breaks the tie.
- **Reusing a separator** in a generalised suffix array, so a "common substring" runs across the join.
- **Comparing whole suffixes in the binary search.** `O(n)` per probe on repetitive text; compare `|p|` characters.
- **Storing the array as a Python list of ints.** 36 bytes per entry against 4 in an `int32` array: a 100 MB text becomes 3.6 GB instead of 400 MB.
- **Reaching for a suffix array where the workload is word queries over changing documents**, the inverted index's home ground.

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

- You can write the suffix array and LCP array of a short string by hand, explain the invariant that occurrences of any substring form a contiguous block, and trace the two binary searches with their bounds.
- You know prefix doubling, can state why each round's comparison is `O(1)` given the previous round's ranks, and know that the number of rounds is about `log₂` of the longest repeat, not always `log₂ n`.
- You can explain Kasai's `h − 1` argument in one sentence, trace the running `h`, and say why it makes LCP construction linear.
- You name SA-IS as the linear-time construction, know that libsais and libdivsufsort exist, and would not write your own for production.
- You choose between Aho-Corasick, suffix array, FM-index and inverted or trigram index from the workload shape, and you can do the bytes-per-character arithmetic that explains why genome aligners use the FM-index and search engines use none of these.
- You use `max(lcp)` for the longest repeat, `n(n + 1)/2 − Σ lcp` for distinct substrings, LCP intervals for "all repeats", and range-minimum over LCP for arbitrary pairs.
- You know the failure modes: sentinel and separator bugs, 32-bit overflow in packed keys and in positions, whole-suffix comparisons, and Python lists of ints.

## Check yourself

```quiz
- q: >-
    Why do all occurrences of a pattern p appear as a contiguous block in the suffix array?
  options: ["They do not; occurrences sit wherever their start positions fall", "The array is built by scanning left to right, so matches are in order", "Each occurrence is a suffix starting with p, and those sort together", "The LCP array links suffixes with equal prefixes and groups them"]
  answer: 2
  explanation: >-
    Lexicographic order sorts by prefix first, so all suffixes beginning with p sit together, bounded by the first suffix ≥ p and the first suffix > p. Two binary searches find the block. The array is in sorted order, not text order, which is exactly why start positions do not scatter the block.
- q: >-
    In prefix doubling, after sorting by the first 4 characters, what key sorts by the first 8?
  options: ["(rank4[i], rank4[i + 4]), with -1 past the end", "(rank4[i], rank4[i + 8]), with -1 past the end", "The first 8 characters of suffix i compared directly", "(rank4[i], rank4[i + 1]), with -1 past the end"]
  answer: 0
  explanation: >-
    The first 8 characters of suffix i are the first 4 of suffix i followed by the first 4 of suffix i + 4. Both ranks are known from the previous round, so the comparison is O(1). Using i + 8 would skip characters 5 to 8, and comparing characters directly would be O(n) per comparison.
- q: >-
    Kasai's algorithm computes LCP in O(n). What is the key observation?
  options: ["Each LCP is a range minimum of earlier ones, found by a sparse table", "If suffix i has LCP h, then suffix i + 1 has LCP at least h - 1", "Suffixes adjacent in the text have equal LCP with their predecessors", "LCP values never decrease along the array, so h never has to reset"]
  answer: 1
  explanation: >-
    Dropping the first character preserves a shared prefix of length h - 1 with the same neighbour, and the true predecessor of suffix i + 1 shares at least that much, so the comparison resumes from h - 1. The running h rises at most n times and falls at most once per step. Range minimum over LCP answers non-adjacent pairs after the array exists; it does not build it.
- q: >-
    For "banana", sa = [5, 3, 1, 0, 4, 2] and lcp = [0, 1, 3, 0, 0, 2]. How many distinct substrings does it have, and why?
  options: ["21, because a string of length 6 has 6 × 7 / 2 substrings", "9, because 15 total prefixes minus 6 shared with sorted predecessors", "15, because 21 total prefixes minus 6 shared with sorted predecessors", "6, because each suffix contributes exactly one distinct substring"]
  answer: 2
  explanation: >-
    Each suffix contributes as many substrings as it has prefixes, 6 + 5 + 4 + 3 + 2 + 1 = 21, and the lcp value says how many of those it shares with its sorted predecessor and has already been counted, 0 + 1 + 3 + 0 + 0 + 2 = 6. The 15 are a, b, n, an, ba, na, ana, ban, nan, anan, bana, nana, anana, banan, banana.
- q: >-
    You need the longest substring that appears at least twice in a 100 MB log. The cleanest approach is:
  options: ["Dynamic programming over all pairs of positions, as in LCS", "Aho-Corasick over all substrings, reporting the longest seen twice", "A hash set of all substrings; keep the longest that repeats", "Suffix array plus LCP array; the answer is the maximum LCP entry"]
  answer: 3
  explanation: >-
    The two occurrences of the longest repeat are adjacent in sorted suffix order, so max(lcp) finds it in O(n) after a library build. All-substring hashing is O(n²) space; all-pairs DP is O(n²) time; Aho-Corasick needs the patterns up front, and all substrings is O(n²) of them.
- q: >-
    Why do short-read genome aligners use an FM-index rather than a plain suffix array?
  options: ["It supports inserts, so newly sequenced reads join without a rebuild", "Its BWT plus sampled array is 1–2 bytes per base, so it fits in RAM", "It builds in O(n), where a suffix array needs O(n² log n) to build", "Suffix arrays break on tiny alphabets, where most suffixes tie on rank"]
  answer: 1
  explanation: >-
    A suffix array needs 4–5 bytes per base, 12–16 GB for a human genome before the text; the FM-index keeps the 2-bit BWT, occurrence checkpoints and every 32nd suffix-array entry, a few GB in total, and still answers pattern queries by O(|p|) backward search. Locating pays up to one sample interval of LF steps per occurrence. Build complexity and alphabet are not the constraints: SA-IS builds a suffix array in O(n) on any alphabet.
```

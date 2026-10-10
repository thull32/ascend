---
slug: bloom-filters
title: "Bloom filters: membership in ten bits per key"
description: How a bit array and k hash functions answer "is this key present?" with zero false negatives, the bits traced for ten concrete keys, the false-positive formula derived and checked against the trace, how to size one from a target rate, what Guava, RocksDB (blocked Bloom and Ribbon), Cassandra and Postgres actually build, and why LSM engines and CDNs cannot live without them.
minutes: 50
difficulty: medium
tags: [bloom-filter, hashing, probabilistic, lsm-tree, caching]
---
A RocksDB or Cassandra node holds a key's value in one of dozens of sorted files on disk. A read for a key that exists must find the one file that has it; a read for a key that does *not* exist must check every file and come back empty-handed. Each check is a disk read of at least one 4 KB block. Thirty files, thirty reads, for a key that was never there. Point lookups for absent keys are common (every "insert if not exists", every cache miss, every deduplication check), so this is the dominant read cost of the whole engine.

You cannot afford to keep every key of every file in memory. What you can afford is about ten bits per key. A Bloom filter turns those ten bits into an answer of "definitely not in this file" or "probably in this file", with no false negatives and a false-positive rate you choose. The engine consults the filter first and skips the disk read for the "definitely not" files, which at a 1% false-positive rate is 99% of the useless reads. This lesson traces the bits for ten concrete keys, derives the false-positive formula and checks it against that trace, and then opens the implementations in Guava, RocksDB, Cassandra and Postgres. It assumes [hash functions](/learn/data-structures/hashing/hash-functions) and the probability in [probability for engineers](/learn/foundations/math-for-engineers/probability-for-engineers).

## The mechanism

A Bloom filter is an array of `m` bits, all initially 0, plus `k` independent hash functions, each mapping a key to a position in `[0, m)`.

- **add(key)**: compute the `k` positions and set those `k` bits to 1.
- **might_contain(key)**: compute the `k` positions. If *any* of them is 0, the key was never added, because adding it would have set that bit. If *all* are 1, answer "probably".

That asymmetry is the whole structure. A 0 bit is proof of absence. A 1 bit is not proof of presence, because some other key may have set it. There are no false negatives, and the false positives come from bits shared with other keys.

```viz
{"type": "system", "scenario": "bloom-filter",
 "title": "Adding keys and querying a Bloom filter",
 "caption": "Each insert sets k bits. A query that finds any 0 bit is a definite miss; a query that finds only 1s may be a false positive."}
```

Here is a complete implementation with `m = 64` and `k = 3`, small enough to trace by hand and the same one you will complete in the exercise:

```python
def fnv1a(s):
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h

def djb2(s):
    h = 5381
    for ch in s:
        h = (h * 33 + ord(ch)) & 0xFFFFFFFF
    return h

class BloomFilter:
    M, K = 64, 3
    def __init__(self):
        self.bits = [0] * self.M
    def _positions(self, key):
        h1, h2 = fnv1a(key), djb2(key)
        return [(h1 + i * h2) % self.M for i in range(self.K)]
    def add(self, key):
        for p in self._positions(key):
            self.bits[p] = 1
    def might_contain(self, key):
        return all(self.bits[p] for p in self._positions(key))
```

## The bits, traced for ten keys

Add ten fruit names. Each row is the three positions `(h1 + i·h2) mod 64`; the last column is how many bits the filter has set after the insert.

| Insert | Positions | New bits | Bits set after |
|---|---|---|---|
| `apple` | 63, 54, 45 | 3 | 3 |
| `banana` | 16, 54, 28 | 2 (54 already set) | 5 |
| `cherry` | 56, 10, 28 | 2 (28 already set) | 7 |
| `date` | 25, 60, 31 | 3 | 10 |
| `elderberry` | 33, 22, 11 | 3 | 13 |
| `fig` | 21, 16, 11 | 1 (16, 11 already set) | 14 |
| `grape` | 16, 4, 56 | 1 | 15 |
| `honeydew` | 24, 0, 40 | 3 | 18 |
| `kiwi` | 25, 18, 11 | 1 | 19 |
| `lemon` | **16, 16, 16** | 0 | 19 |

Ten keys, 30 hash positions, 19 bits set, a fill of 30%. Now query six keys that were never added:

| Query | Positions | Bits found | Answer | Right? |
|---|---|---|---|---|
| `mango` | 21, 12, 3 | 1, 0, 0 | definitely absent | yes |
| `orange` | 43, 12, 45 | 0, 0, 1 | definitely absent | yes |
| `lychee` | 63, 62, 61 | 1, 0, 0 | definitely absent | yes |
| `strawberry` | 28, 22, 16 | 1, 1, 1 | probably present | **false positive**: 28 from banana and cherry, 22 from elderberry, 16 from banana, fig, grape and lemon |
| `melon` | **28, 28, 28** | 1 | probably present | false positive on a single shared bit |
| `coconut` | **28, 28, 28** | 1 | probably present | false positive |

Note what `might_contain` costs: `k` hash computations and `k` random bit reads. No comparison of the key itself, no pointer chasing, no dependence on how many keys are stored. The filter never stores the key at all, which is also why you cannot enumerate its contents or remove anything from it. The rows for `lemon`, `melon` and `coconut` are a bug, not bad luck, and the hashing section below explains it.

## The false-positive rate, derived and checked

You will be asked to size a filter, so you need the formula and roughly where it comes from.

After inserting `n` keys with `k` hashes each, `kn` bits have been set (with repeats). A particular bit is left at 0 by one hash evaluation with probability `1 − 1/m`, so it is still 0 after all `kn` evaluations with probability

$$(1 - 1/m)^{kn} \approx e^{-kn/m}.$$

A query for an absent key reads `k` bits, and it is a false positive when all `k` are 1. Treating those reads as independent, the false-positive probability is

$$p \approx \left(1 - e^{-kn/m}\right)^{k}.$$

Check it against the trace: `n = 10`, `k = 3`, `m = 64` predicts a fill of `1 − e^{−30/64} = 37%` and a false-positive rate of `0.374³ = 5.2%`. The trace shows 30% fill, lower than predicted because `lemon` set one bit instead of three, and three false positives in six queries, higher than 5% because those queries were chosen to show the failure. On a filter with a good hash and thousands of random queries, the measured rate lands within a few percent of the formula.

Two consequences follow from that formula.

**There is an optimal `k`.** More hash functions make each query check more bits (good) but also fill the array faster (bad). Differentiating gives the sweet spot

$$k_{\text{opt}} = \frac{m}{n}\ln 2 \approx 0.693 \cdot \frac{m}{n},$$

at which point exactly half the bits are set and `p = (1/2)^k = 0.6185^{m/n}`.

**Bits per key determine the rate.** Solving for `m` at the optimal `k`:

$$m = -\frac{n \ln p}{(\ln 2)^2} \approx -2.08 \cdot n \ln p.$$

### A sizing example

You want to filter `n = 1,000,000` keys at a `p = 1%` false-positive rate.

- `m = −1,000,000 × ln(0.01) / (ln 2)² = 1,000,000 × 4.605 / 0.4805 = 9,585,059` bits ≈ 1.2 MB.
- `k = 9.585 × 0.693 = 6.64`, so use `k = 7`, and the achieved rate is `(1 − e^{−7/9.585})^7 = 1.004%`.

That is 9.6 bits per key, for keys that might themselves be 20–100 bytes each. The table shows how the budget moves with `p`:

| Target `p` | Bits per key | `k` |
|---|---|---|
| 10% | 4.8 | 3 |
| 1% | 9.6 | 7 |
| 0.1% | 14.4 | 10 |
| 0.01% | 19.2 | 13 |

Every factor of ten in accuracy costs about 4.8 more bits per key. RocksDB builds no filter at all unless you set one; the conventional setting is 10 bits per key (LevelDB's header calls 10 "a good value", RocksJava's `BloomFilter()` constructor defaults to it, and RocksDB's own header suggests 9.9). By the formula, 10 bits per key gives 0.82% at `k = 7`; RocksDB's cache-local filter picks 6 probes at that budget, and its source comments put the result at about 0.96%. The second exercise has you implement this sizing function.

### What happens when you overfill

The formula assumes you know `n`. If you sized for a million keys and inserted two million, `m/n` drops from 9.6 to 4.8 with `k` still 7:

$$p = \left(1 - e^{-7/4.8}\right)^7 = (1 - 0.233)^7 \approx 0.157.$$

The false-positive rate went from 1% to 16%. A Bloom filter degrades gracefully in the sense that it never lies about absence, but the "probably yes" answers become nearly useless. In production this means you either know `n` up front (an SSTable's key count is known when the file is written, which is why LSM engines love Bloom filters) or you use a *scalable* Bloom filter that adds a new, larger filter when the current one fills, querying all of them.

## Hash functions in practice

Seven independent, high-quality hash functions per query is expensive. Kirsch and Mitzenmacher showed that two are enough: compute `h1(key)` and `h2(key)` once and derive the rest as

$$g_i(\text{key}) = h_1(\text{key}) + i \cdot h_2(\text{key}) \pmod m, \quad i = 0, 1, \dots, k-1.$$

This *double hashing* gives the same asymptotic false-positive rate at a fraction of the cost, and it is what Guava, RocksDB and most libraries do (Guava splits one 128-bit MurmurHash3 output into `h1` and `h2`).

There is a trap in it, and the trace above walks straight into it. If `h2(key) mod m == 0`, every `g_i` is the same position: the key sets one bit instead of `k`, and any other key hitting that single bit is a false positive against it. `lemon` (`djb2 mod 64 = 0`) sets only bit 16; `melon` and `coconut` collapse onto bit 28, which `banana` had set, so both are false positives on the strength of one bit. With `m = 64` one key in 64 has this problem; with `m` a power of two and an even `h2` the step can also cycle through fewer than `k` distinct positions. A careful implementation forces `h2` to be odd (an odd step visits `k` distinct positions in a power-of-two table) or otherwise guards against a zero step. Production libraries mostly make the trap improbable instead: Guava's step is a 64-bit value, so a zero step modulo a large `m` is vanishingly rare, and RocksDB's cache-local filter drops the arithmetic progression altogether, multiplying its 32-bit probe hash by the constant `0x9e3779b9` before each probe. When you write a filter with small hashes or a small `m`, write the guard.

The other production concern is memory locality. A 1.2 MB filter usually sits in the CPU's L2 or L3 cache, but the filters of a whole store do not (a billion keys at 10 bits per key is 1.25 GB), and there seven random reads are seven likely DRAM misses: several hundred nanoseconds at roughly 100 ns each, depending on the machine, against a few nanoseconds of hashing. **Blocked Bloom filters** first hash the key to a single cache-line-sized block (512 bits) and then set all `k` bits within that block. One cache miss per query instead of `k`, at the cost of a slightly higher false-positive rate for the same bits per key, because keys are no longer spread uniformly: RocksDB's source comments give about 0.96% at 10 bits per key against 0.82% for a standard filter, roughly 17% more false positives.

## Under the hood: Guava, RocksDB, Cassandra, Postgres

**Guava `BloomFilter`** (`com.google.common.hash`, since Guava 11). `BloomFilter.create(funnel, expectedInsertions, fpp)` computes `m` with the formula above, truncated to a whole number of bits (`optimalNumOfBits`), and `k` rounded to the nearest integer with a minimum of 1 (`optimalNumOfHashFunctions`: `round(m/n · ln 2)` through Guava 33.3, `round(log₂(1/p))` since 33.4.0, the same number computed straight from `p`); `fpp` defaults to 3% if you omit it, which is 7.3 bits per key and 5 hash functions. The default strategy, `MURMUR128_MITZ_64`, hashes the object through its `Funnel` with 128-bit MurmurHash3, takes the two 64-bit halves as `h1` and `h2`, and computes `combined = h1 + i·h2` for each of the `k` probes, masking the sign bit before the modulus. Bits live in an `AtomicLongArray` updated by compare-and-swap, so since Guava 23.0 concurrent `put` calls are safe without a lock. `expectedFpp()` returns the *current* rate computed from the fraction of set bits, which is how you detect an overfilled filter in a running JVM, and `writeTo`/`readFrom` serialise the array so a filter built in one job can be shipped to another (the *Bloom join* pattern, where a filter of the small side's keys is broadcast and the large side is pre-filtered before the shuffle; Spark 3.3 added it to its optimizer as `spark.sql.optimizer.runtime.bloomFilter.enabled`, and Hive on Tez does it as dynamic semijoin reduction, both with their own filter code).

**RocksDB.** `BlockBasedTableOptions::filter_policy` defaults to `nullptr`, so there is no filter until you set one, usually `NewBloomFilterPolicy(10)` or the header's suggested 9.9. Three generations exist in the code: the legacy block-based filter (one filter per 2 KB of data; RocksDB 7.0 stopped writing it), the legacy *full filter* (one filter per SSTable, written below `format_version` 5), and the *fast local* Bloom that arrived with `format_version = 5` in RocksDB 6.6 (2019) and became the default in 6.19 (2021). That one is a blocked filter with 64-byte blocks: it chooses the number of probes from bits per key (6 at 10 bits per key) and splits a 64-bit hash (a preview version of XXH3) into one 32-bit half that picks the cache line and another that is re-mixed for each probe. The **Ribbon filter** arrived experimentally in 6.15 and was declared production-ready as `NewRibbonFilterPolicy` in 6.22: it reaches the same false-positive rate as a 10-bits-per-key Bloom filter in about 7 bits per key (roughly 30% less space) by solving a linear system at construction, at 3–4× the construction CPU. By default it still builds Bloom filters for memtable flushes and Ribbon filters for compaction output, so the cold, rarely rewritten levels get the smaller filter. `optimize_filters_for_memory` (on by default since 9.2) sizes filters to fit the allocator's bins. Filters live in the block cache when `cache_index_and_filter_blocks` is set, and a billion-key store at 10 bits per key needs 1.25 GB of filter memory, which is why that setting and `pin_l0_filter_and_index_blocks_in_cache` exist. A **prefix Bloom** (`prefix_extractor`) lets a seek to `user:123:` skip files with no keys under that prefix, the one case where a Bloom filter helps a range scan.

**Cassandra** stores each SSTable's filter in `Filter.db` and keeps it off-heap. `bloom_filter_fp_chance` is per table: 0.01 by default with size-tiered compaction and 0.1 with leveled, because leveled compaction already limits the files a read touches. `nodetool tablestats` reports "Bloom filter false ratio" (measured: false positives, files the filter let through that held nothing, as a fraction of all filter checks) and "Bloom filter space used"; a false ratio well above the configured chance means the filters were built for a different key count or the hash is being fed poorly distributed keys.

**Postgres** ships a `bloom` index access method: each row gets a signature of `length` bits (default 80) with `colN` bits set per indexed column (default 2), and a query with equality predicates on any subset of the columns scans the signatures, rejects rows whose bits are not all set, and rechecks the survivors against the heap. It replaces a combinatorial explosion of B-tree indexes on column subsets with one small index, at the cost of a full signature scan.

## Deletion: counting and cuckoo filters

You cannot delete from a plain Bloom filter. Clearing the `k` bits of a key also clears bits shared with other keys, and those keys would then produce false negatives, which breaks the one guarantee the structure makes. In the trace, deleting `banana` by clearing 16, 54 and 28 would make `apple` (54) and `cherry` (28) disappear.

A **counting Bloom filter** replaces each bit with a small counter (typically 4 bits). Add increments `k` counters, delete decrements them, query checks that all `k` are non-zero. It works, at three to four times the memory for the same false-positive rate (the cuckoo filter paper's estimate), and with an overflow hazard: a 4-bit counter saturates at 15, after which you must never decrement it (leave it stuck, which slightly raises false positives, rather than risk a false negative).

A **cuckoo filter** (Fan, Andersen, Kaminsky and Mitzenmacher, 2014) is the modern answer when you need deletion. It stores a short fingerprint (say 8–16 bits) of each key in one of two candidate buckets of four slots each, using cuckoo hashing to relocate fingerprints on collision. Lookup reads two buckets; delete removes one matching fingerprint. With plain fingerprints it uses *less* space than a Bloom filter only below about 0.4% false positives (at 1% it is slightly larger, as the table below shows); the paper's semi-sorted variant saves about a bit per key and moves the crossover to about 3%. It also has better locality (two bucket reads). The costs: insertion can fail when the table is nearly full (above ~95% load), and a fingerprint collision within a bucket is what produces its false positives. If your interviewer asks "and if we need to remove keys?", the cuckoo filter is the answer that signals you have looked past the textbook.

## Where Bloom filters live

**LSM storage engines.** Cassandra, ScyllaDB and HBase write a Bloom filter into every SSTable (HBase's HFiles default to a row Bloom filter); LevelDB and RocksDB do the same once you configure a filter policy. A point read checks the memtable, then consults each SSTable's filter from newest to oldest, reading only the files whose filter says "maybe". Turning the filter off on a table with many SSTables can multiply read latency by the number of files. You will see this again in [LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables).

**CDN admission.** [Maggs and Sitaraman's account of Akamai](https://people.cs.umass.edu/~ramesh/Site/PUBLICATIONS_files/CCRpaper.pdf) reports that over three-quarters of the objects in their access logs were "one-hit wonders", requested once and never again. Caching them evicts objects that will be requested again. The fix is a Bloom filter of "URLs seen recently" (two filters, rotated so that old entries age out): an object is only admitted to the cache on its *second* request. The paper's sizing example comes to about 69 MB of filter at 0.1% false positives, which fits in server memory while protecting disks many times larger. When the rule was switched on across about 47 production servers, the byte hit rate rose from around 74% to 83% and disk writes fell by 44%. The [LRU lesson](/learn/advanced-data-structures/caches-and-eviction/lru-cache) shows the same idea inside a cache.

**Browsers.** Chrome's Safe Browsing check once kept a local Bloom filter of the 32-bit hash prefixes of malicious URLs; a miss means the URL is not on the list and no network call is needed, a hit triggers an exact check with the server. Chromium later replaced it with a [`PrefixSet`](https://raw.githubusercontent.com/chromium/chromium/40.0.2214.0/chrome/browser/safe_browsing/prefix_set.h) of sorted prefixes stored as 16-bit deltas; the source comment measures about 2 bytes per prefix against the Bloom filter's 25 bits, and the sorted set has no false positives of its own. The lesson generalises: once keys are short fixed-width hashes, an exact compressed set can beat a filter.

**Recommendation and deduplication.** A per-user Bloom filter of "articles already recommended" keeps a feed from repeating itself; a false positive costs one article never being shown, which is harmless. Web crawlers keep a filter of visited URLs. Data pipelines use filters to skip joining rows whose key cannot match.

**Network and distributed systems.** Bloom filters summarise peer content in gossip protocols, keep routers from re-forwarding packets, and let a database check "might this transaction conflict with a running one?" cheaply.

The common thread: every one of these cases tolerates a false positive (an extra disk read, an extra network call, a skipped article) and needs to avoid a false negative (missing a value that exists, re-crawling forever). If your use case is the other way round, if a false positive is expensive and a false negative is cheap, a Bloom filter is the wrong tool.

## Trade-offs

| | Bloom filter | Blocked Bloom | Ribbon / XOR filter | Cuckoo filter | Hash set of keys |
|---|---|---|---|---|---|
| Bits per key at 1% FP | 9.6 | ~10.5 | ~7 (Ribbon) | ~10.5 (10-bit fingerprints, 95% load) | 64+ per key plus the key |
| Cache misses per query | `k` | 1 | 1–3 | 2 | 1–2 |
| Deletion | no | no | no (static) | yes | yes |
| Build cost | one pass | one pass | linear-algebra solve, several times slower | one pass, can fail near full | one pass |
| Grows after build | no | no | no | limited | yes |
| Where | Guava, Cassandra, Postgres `bloom` | RocksDB `format_version` ≥ 5 | RocksDB Ribbon, FastFilter library | Redis `CF.*` commands | everything small |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Measured false-positive rate is 10× the configured one; reads touch many SSTables | The filter was sized for fewer keys than it holds (overfill), or keys are being added repeatedly through a path that re-counts them | Size from the real key count (an SSTable knows it), monitor fill fraction or `expectedFpp()`, or a scalable filter |
| Two different keys collide far more often than 1% although the filter is half empty | A zero or even `h2` step collapsing probes, or a weak hash (Java `String.hashCode` on similar keys, sequential integers hashed by identity) feeding correlated positions | Force the step odd; use Murmur3 or XXH3 through a proper funnel; never hash a hash |
| A "delete" was implemented by clearing bits, and reads now miss keys that exist | Shared bits were cleared: false negatives, the one thing the structure promises never to do | Counting Bloom filter or cuckoo filter; or rebuild without the deleted keys |
| Read latency rose after the block cache was shrunk, although data hit ratio looks fine | Filter blocks were evicted and every read fetches the filter from disk before it can skip anything | `cache_index_and_filter_blocks` with pinned filters, or a block cache sized for filters plus indexes first |
| A range scan is slow even though "we have Bloom filters" | Filters answer single-key membership; a scan cannot ask about a range | Prefix Bloom filters for prefix seeks; otherwise accept the merge or restructure keys |
| A login form says "username taken" for names nobody has | A Bloom filter answering an exact question; the 1% false positives are user-visible | Exact check (hash set or database) after the filter, and never expose the filter's answer directly |

## Interviewer follow-ups

**"Size a filter for 100 million keys at 0.1% false positives and tell me the memory."** Model answer: 14.4 bits per key, so 1.44 gigabits ≈ 180 MB, with `k = 10`; if that is too much, 1% costs 120 MB and 10% costs 60 MB, and the choice depends on what a false positive costs downstream. Common wrong answer: "a few megabytes", from confusing bits with bytes or forgetting that bits scale with `n`.

**"Why does RocksDB attach a filter to every file rather than one filter for the whole store?"** Model answer: files are immutable and know their key count, so each filter is sized exactly and never overfills; a store-wide filter would need to grow, cannot forget deleted keys, and would say "maybe" for every file at once instead of skipping the specific ones. Common wrong answer: "for parallelism".

**"We need to remove keys. What changes?"** Model answer: a plain Bloom filter cannot delete without risking false negatives; use a counting filter at 4× memory with saturating counters, or a cuckoo filter at similar memory with real deletion and a load limit around 95%. Common wrong answer: "clear the bits and accept a few errors", which turns a filter with one guarantee into one with none.

**"How would you check that a filter in production is behaving?"** Model answer: measure the false-positive rate directly (queries that passed the filter and found nothing, divided by absent-key queries), compare with the configured rate, and read the fill fraction; a fill above 50% at the optimal `k` means overfill. Common wrong answer: "check that lookups of present keys succeed", which tests the guarantee that cannot fail.

**"A colleague proposes a Bloom filter in front of the user table to reject unknown usernames at login."** Model answer: fine as a pre-filter that saves a database read for most junk requests, wrong as the source of truth; every "maybe" must go to the database, and the error message must never come from the filter, or 1% of legitimate new users are told their name exists. Common wrong answer: "use a lower false-positive rate", which reduces but does not remove a user-visible error.

## What mid-level engineers get wrong

- **Sizing by intuition** ("a megabyte should be plenty") instead of from `n` and `p`; the formula is one line.
- **Not guarding the double-hash step**, then measuring false positives that the formula cannot explain.
- **Clearing bits to delete.**
- **Proposing a filter where an exact answer is required** (uniqueness checks, authorisation).
- **Forgetting that filters need to be in memory** and letting them fall out of the block cache.
- **Expecting help on range scans.**

## Exercises

```exercise
id: bloom-filter
title: Implement a Bloom filter with double hashing
prompt: |
  Implement `BloomFilter` with `M = 64` bits and `K = 3` hash positions.
  The two base hash functions `fnv1a` and `djb2` are given (32-bit
  unsigned arithmetic in both languages). Position `i` for a key is
  `(fnv1a(key) + i * djb2(key)) % M` for `i = 0, 1, 2`.

  Methods: `add(key)` returns nothing; `might_contain(key)` returns a
  boolean; `bits_set()` returns how many of the `M` bits are 1.

  The tests replay operations and compare the returned values. One test
  shows a genuine false positive produced by this filter.
languages: [python, javascript]
entry: BloomFilter
starter:
  python: |
    def fnv1a(s):
        h = 0x811C9DC5
        for ch in s:
            h ^= ord(ch)
            h = (h * 0x01000193) & 0xFFFFFFFF
        return h

    def djb2(s):
        h = 5381
        for ch in s:
            h = (h * 33 + ord(ch)) & 0xFFFFFFFF
        return h

    class BloomFilter:
        M = 64
        K = 3

        def __init__(self):
            self.bits = [0] * self.M

        def _positions(self, key):
            # TODO: return the K positions for key
            return []

        def add(self, key):
            # TODO
            pass

        def might_contain(self, key):
            # TODO
            return False

        def bits_set(self):
            # TODO
            return 0
  javascript: |
    function fnv1a(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h;
    }
    function djb2(s) {
      let h = 5381;
      for (let i = 0; i < s.length; i++) {
        h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
      }
      return h;
    }
    class BloomFilter {
      constructor() {
        this.M = 64;
        this.K = 3;
        this.bits = new Array(this.M).fill(0);
      }
      _positions(key) {
        // TODO: return the K positions for key
        return [];
      }
      add(key) {
        // TODO
      }
      might_contain(key) {
        // TODO
        return false;
      }
      bits_set() {
        // TODO
        return 0;
      }
    }
tests:
  - args: [["add","apple"],["bits_set"],["add","banana"],["bits_set"],["might_contain","apple"],["might_contain","banana"],["might_contain","cherry"]]
    expected: [null, 3, null, 5, true, true, false]
    label: apple and banana share bit 54
  - args: [["might_contain","apple"],["bits_set"]]
    expected: [false, 0]
    label: empty filter
  - args: [["add","apple"],["add","apple"],["bits_set"],["might_contain","apple"]]
    expected: [null, null, 3, true]
    label: adding twice is idempotent
  - args: [["add","apple"],["add","banana"],["add","cherry"],["add","date"],["add","elderberry"],["add","fig"],["add","grape"],["add","honeydew"],["add","kiwi"],["add","lemon"],["bits_set"],["might_contain","strawberry"],["might_contain","mango"],["might_contain","orange"]]
    expected: [null, null, null, null, null, null, null, null, null, null, 19, true, false, false]
    label: strawberry is a false positive (bits 28, 22, 16 set by other fruit)
  - args: [["add","melon"],["bits_set"],["might_contain","coconut"]]
    expected: [null, 1, true]
    hidden: true
    label: melon has h2 divisible by 64, so all three positions collapse to bit 28
  - args: [["add","apple"],["add","banana"],["add","cherry"],["add","date"],["add","elderberry"],["add","fig"],["add","grape"],["add","honeydew"],["add","kiwi"],["add","lemon"],["might_contain","date"],["might_contain","lemon"],["might_contain","lychee"]]
    expected: [null, null, null, null, null, null, null, null, null, null, true, true, false]
    hidden: true
    label: no false negatives
hints:
  - "Compute h1 = fnv1a(key) and h2 = djb2(key) once, then positions are (h1 + i * h2) % M for i in 0..K-1."
  - "might_contain is true only if every position's bit is 1; a single 0 proves absence."
  - "bits_set is the count of 1s in the array."
```

```exercise
id: bloom-sizing
title: Size a Bloom filter from n and p
prompt: |
  Implement `bloom_params(n, p)` returning `[m, k]`: the number of bits
  `m = ceil(-n * ln(p) / (ln 2)^2)` and the number of hash functions
  `k = round(m / n * ln 2)`, with a minimum of 1. These are the textbook
  formulas; Guava's `BloomFilter.create` uses the same ones except that it
  truncates `m` instead of rounding it up. `n` is a positive integer and
  `p` is a probability strictly between 0 and 1.
languages: [python, javascript]
entry: bloom_params
starter:
  python: |
    import math

    def bloom_params(n, p):
        # your code here
        return [0, 0]
  javascript: |
    function bloom_params(n, p) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [1000000, 0.01]
    expected: [9585059, 7]
    label: a million keys at 1 percent is 9.6 bits per key
  - args: [1000000, 0.001]
    expected: [14377588, 10]
    label: another factor of ten costs 4.8 bits per key
  - args: [1000, 0.1]
    expected: [4793, 3]
  - args: [1, 0.5]
    expected: [2, 1]
    label: k never drops below 1
  - args: [100000, 0.0001]
    expected: [1917012, 13]
    hidden: true
  - args: [5000000, 0.01]
    expected: [47925292, 7]
    hidden: true
    label: bits per key does not depend on n
  - args: [10, 0.01]
    expected: [96, 7]
    hidden: true
hints:
  - "Use natural logarithms: `math.log` in Python, `Math.log` in JavaScript."
  - "Compute m first, then derive k from m / n; both languages round 6.64 to 7."
```

## Senior signals

- You size a filter from a **target false-positive rate and expected `n`**, and you can quote "about 10 bits per key for 1%" and "another 4.8 bits per key per factor of ten", and check a formula against a traced filter.
- You know a Bloom filter has **no false negatives**, that deletion breaks that guarantee, and that counting or cuckoo filters are the fix.
- You explain **why LSM engines use them** (skipping SSTable reads for absent keys), can name the Cassandra or RocksDB knob, and know that RocksDB's cache-local filter and Ribbon filter trade false positives and build CPU for memory and cache misses.
- You use **double hashing**, know the zero-step trap and can show it on a concrete key, and know the cache-locality argument for blocked filters.
- You can say what Guava does on `create` (the two formulas, Murmur3 split in two, a `long[]` bit array) and how to detect an overfilled filter in production (`expectedFpp`, fill fraction, measured false ratio).
- You ask "what does a false positive cost?" before proposing one, and you reach for a plain hash set when the set is small.

## Check yourself

```quiz
- q: >-
    A Bloom filter reports "not present" for a key. What can you conclude?
  options: ["The key was definitely never added", "The key was probably never added", "Nothing without checking the backing store", "The key was added and later deleted"]
  answer: 0
  explanation: >-
    Adding a key sets all k of its bits, so if any bit is 0 the key was never added. "Probably" describes the positive answer, not the negative one. Plain Bloom filters have no deletion, so "added and later deleted" cannot happen.
- q: >-
    You sized a filter for 1M keys at 1% false positives (about 9.6 bits per key, k = 7) but inserted 2M keys. Roughly what is the false-positive rate now?
  options: ["About 16%", "About 50%", "About 1%", "About 2%"]
  answer: 0
  explanation: >-
    With m/n halved to 4.8 and k still 7, p = (1 − e^(−7/4.8))^7 ≈ 0.16. The rate does not scale linearly with n, so 2% is the tempting wrong answer; it degrades much faster once the array is more than half full.
- q: >-
    Why does RocksDB attach a Bloom filter to each SSTable?
  options: ["To compress each file's keys so fewer pages are read", "To let range scans skip files outside the scanned range", "To find which keys to merge together during compaction", "To skip files that cannot hold the key on a point lookup"]
  answer: 3
  explanation: >-
    A point read for a key must otherwise check every SSTable that might hold it. The filter answers "definitely not here" for most files without touching disk. It does not help range scans: a filter answers membership for one key, and a range scan must visit every overlapping file regardless (a prefix Bloom helps only prefix seeks).
- q: >-
    Your double-hashing implementation uses positions (h1 + i·h2) mod m. For one key h2 mod m is 0. What happens?
  options: ["Nothing, since the key still sets k distinct bits", "The key sets one bit, not k, so false positives rise", "The insert fails and the key is left out of the filter", "The filter returns a false negative for that key later"]
  answer: 1
  explanation: >-
    All k positions collapse to h1 mod m, as lemon, melon and coconut do in the lesson's trace. The key is still found (no false negative), but it occupies one bit instead of k, so any key whose positions all land on already-set bits, including that one, is a false positive far more easily. Implementations force h2 to be odd or non-zero.
- q: >-
    Why does RocksDB's cache-local Bloom filter put all of a key's bits inside one 64-byte block?
  options: ["So the false-positive rate drops, because bits are packed more densely", "So the filter can be updated in place when keys are deleted", "So a query costs one cache miss instead of k, at a slightly higher false-positive rate", "So the filter can be built without knowing the number of keys"]
  answer: 2
  explanation: >-
    With k independent positions a query touches k random cache lines, about k DRAM misses on a large filter; confining the probes to one line makes it one miss. Packing keys into blocks makes the bit distribution less uniform, so the false-positive rate rises a little for the same bits per key. Deletion and unknown n are not addressed by blocking.
- q: >-
    Which use case is a poor fit for a Bloom filter?
  options: ["Answering 'is this username taken?' exactly at signup", "Avoiding re-crawling URLs a crawler has already visited", "Admitting a URL to a CDN cache on its second request", "Skipping a disk read for keys not in an SSTable"]
  answer: 0
  explanation: >-
    Signup needs an exact answer; a false positive tells a user their name is taken when it is not. The other three tolerate a false positive (an extra read, a delayed admission, a skipped URL) and need to avoid false negatives, which is the Bloom filter's guarantee.
```

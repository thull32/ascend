---
slug: bloom-filters
title: "Bloom filters: membership in ten bits per key"
description: How a bit array and k hash functions answer "is this key present?" with zero false negatives, how to size one from a target false-positive rate, and why RocksDB, Cassandra and CDNs cannot live without them.
minutes: 40
difficulty: medium
tags: [bloom-filter, hashing, probabilistic, lsm-tree, caching]
---
A RocksDB or Cassandra node holds a key's value in one of dozens of sorted files on disk. A read for a key that exists must find the one file that has it; a read for a key that does *not* exist must check every file and come back empty-handed. Each check is a disk read of at least one 4 KB block. Thirty files, thirty reads, for a key that was never there. Point lookups for absent keys are common (every "insert if not exists", every cache miss, every deduplication check), so this is the dominant read cost of the whole engine.

You cannot afford to keep every key of every file in memory. What you can afford is about ten bits per key. A Bloom filter turns those ten bits into an answer of "definitely not in this file" or "probably in this file", with no false negatives and a false-positive rate you choose. The engine consults the filter first and skips the disk read for the "definitely not" files, which at a 1% false-positive rate is 99% of the useless reads.

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

Trace it. `"apple"` hashes to positions `[63, 54, 45]`; `"banana"` to `[16, 54, 28]`. After adding both, five bits are set (54 is shared). `"cherry"` maps to `[56, 10, 28]`: bit 28 is set by banana, but 56 and 10 are 0, so the answer is a definite no. Now add eight more fruits so that 19 of the 64 bits are set, and query `"strawberry"`, which maps to `[28, 22, 16]`. Bits 28 and 16 came from banana and 22 came from another fruit. All three are 1. The filter says "probably", and it is wrong: that is a false positive.

Note what `might_contain` costs: `k` hash computations and `k` random bit reads. No comparison of the key itself, no pointer chasing, no dependence on how many keys are stored. The filter never stores the key at all, which is also why you cannot enumerate its contents or remove anything from it.

## The false-positive rate, derived

You will be asked to size a filter, so you need the formula and roughly where it comes from.

After inserting `n` keys with `k` hashes each, `kn` bits have been set (with repeats). A particular bit is left at 0 by one hash evaluation with probability `1 − 1/m`, so it is still 0 after all `kn` evaluations with probability

$$(1 - 1/m)^{kn} \approx e^{-kn/m}.$$

A query for an absent key reads `k` bits, and it is a false positive when all `k` are 1. Treating those reads as independent, the false-positive probability is

$$p \approx \left(1 - e^{-kn/m}\right)^{k}.$$

Two consequences follow from that formula.

**There is an optimal `k`.** More hash functions make each query check more bits (good) but also fill the array faster (bad). Differentiating gives the sweet spot

$$k_{\text{opt}} = \frac{m}{n}\ln 2 \approx 0.693 \cdot \frac{m}{n},$$

at which point exactly half the bits are set and `p = (1/2)^k = 0.6185^{m/n}`.

**Bits per key determine the rate.** Solving for `m` at the optimal `k`:

$$m = -\frac{n \ln p}{(\ln 2)^2} \approx -2.08 \cdot n \ln p.$$

### A sizing example

You want to filter `n = 1,000,000` keys at a `p = 1%` false-positive rate.

- `m = −1,000,000 × ln(0.01) / (ln 2)² = 1,000,000 × 4.605 / 0.4805 ≈ 9.59 million bits ≈ 1.2 MB`.
- `k = (9.59 / 1) × 0.693 ≈ 6.6`, so use `k = 7`.

That is 9.6 bits per key, for keys that might themselves be 20–100 bytes each. The table shows how the budget moves with `p`:

| Target `p` | Bits per key | `k` |
|---|---|---|
| 10% | 4.8 | 3 |
| 1% | 9.6 | 7 |
| 0.1% | 14.4 | 10 |
| 0.01% | 19.2 | 13 |

Every factor of ten in accuracy costs about 4.8 more bits per key. RocksDB's default is 10 bits per key, which lands at roughly 1% false positives.

### What happens when you overfill

The formula assumes you know `n`. If you sized for a million keys and inserted two million, `m/n` drops from 9.6 to 4.8 with `k` still 7:

$$p = \left(1 - e^{-7/4.8}\right)^7 = (1 - 0.233)^7 \approx 0.157.$$

The false-positive rate went from 1% to 16%. A Bloom filter degrades gracefully in the sense that it never lies about absence, but the "probably yes" answers become nearly useless. In production this means you either know `n` up front (an SSTable's key count is known when the file is written, which is why LSM engines love Bloom filters) or you use a *scalable* Bloom filter that adds a new, larger filter when the current one fills, querying all of them.

## Hash functions in practice

Seven independent, high-quality hash functions per query is expensive. Kirsch and Mitzenmacher showed that two are enough: compute `h1(key)` and `h2(key)` once and derive the rest as

$$g_i(\text{key}) = h_1(\text{key}) + i \cdot h_2(\text{key}) \pmod m, \quad i = 0, 1, \dots, k-1.$$

This *double hashing* gives the same asymptotic false-positive rate at a fraction of the cost, and it is what Guava, RocksDB and most libraries do (Guava splits one 128-bit MurmurHash3 output into `h1` and `h2`).

There is a trap in it, and the small example above walks straight into it. If `h2(key) mod m == 0`, every `g_i` is the same position: the key sets one bit instead of `k`, and any other key hitting that single bit is a false positive against it. In the exercise's 64-bit filter, `"melon"` hashes to `[28, 28, 28]` for exactly this reason. Real implementations force `h2` to be odd (when `m` is a power of two, an odd step visits `k` distinct positions) or otherwise guard against a zero step. When you write one, write that guard.

The other production concern is memory locality. Seven random reads into a 1.2 MB array are seven likely cache misses. **Blocked Bloom filters** (RocksDB's newer filter format, and the standard design in high-performance libraries) first hash the key to a single cache-line-sized block (512 bits) and then set all `k` bits within that block. One cache miss per query instead of `k`, at the cost of a slightly higher false-positive rate for the same bits per key.

## Deletion: counting and cuckoo filters

You cannot delete from a plain Bloom filter. Clearing the `k` bits of a key also clears bits shared with other keys, and those keys would then produce false negatives, which breaks the one guarantee the structure makes.

A **counting Bloom filter** replaces each bit with a small counter (typically 4 bits). Add increments `k` counters, delete decrements them, query checks that all `k` are non-zero. It works, at four times the memory, and with an overflow hazard: a 4-bit counter saturates at 15, after which you must never decrement it (leave it stuck, which slightly raises false positives, rather than risk a false negative).

A **cuckoo filter** is the modern answer when you need deletion. It stores a short fingerprint (say 8–16 bits) of each key in one of two candidate buckets of four slots each, using cuckoo hashing to relocate fingerprints on collision. Lookup reads two buckets; delete removes one matching fingerprint. Below about 3% false positives it uses *less* space than a Bloom filter, and it has better locality (two bucket reads). The costs: insertion can fail when the table is nearly full (above ~95% load), and a fingerprint collision within a bucket is what produces its false positives. If your interviewer asks "and if we need to remove keys?", the cuckoo filter is the answer that signals you have looked past the textbook.

## Where Bloom filters live

**LSM storage engines.** LevelDB, RocksDB, Cassandra, HBase and ScyllaDB write a Bloom filter into every SSTable (or per block within it). A point read checks the memtable, then consults each SSTable's filter from newest to oldest, reading only the files whose filter says "maybe". Cassandra exposes the trade-off as `bloom_filter_fp_chance` per table (default 0.01 for size-tiered compaction, 0.1 for levelled). Turning the filter off on a table with many SSTables can multiply read latency by the number of files. You will see this again in [LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables).

**Bigtable and its descendants** use the same trick at the tablet level, and Postgres ships a `bloom` index access method that packs several columns into one signature index for equality queries on arbitrary column subsets, where a B-tree per column combination would be impractical.

**CDN admission.** Akamai's edge caches found that the majority of objects requested at an edge are requested exactly once ("one-hit wonders"). Caching them evicts objects that will be requested again. The fix is a Bloom filter of "URLs seen once": an object is only admitted to the cache on its *second* request. That is a few megabytes of filter protecting terabytes of disk, and it improved hit rates measurably.

**Browsers.** Chrome's Safe Browsing check historically kept a local Bloom filter (later a more compact prefix set) of malicious URL prefixes; a miss means the URL is definitely safe and no network call is needed, a hit triggers an exact check with the server.

**Recommendation and deduplication.** Medium used a Bloom filter per user of "articles already recommended" so the feed does not repeat itself; a false positive costs one article never being shown, which is harmless. Web crawlers keep a filter of visited URLs. Data pipelines use filters to skip joining rows whose key cannot match (a *Bloom join*: broadcast a filter of the small side's keys, prefilter the large side before the shuffle).

**Network and distributed systems.** Bloom filters summarise peer content in gossip protocols, keep routers from re-forwarding packets, and let a database check "might this transaction conflict with a running one?" cheaply.

The common thread: every one of these cases tolerates a false positive (an extra disk read, an extra network call, a skipped article) and needs to avoid a false negative (missing a value that exists, re-crawling forever). If your use case is the other way round, if a false positive is expensive and a false negative is cheap, a Bloom filter is the wrong tool.

## When not to use one

- **You need to enumerate or delete.** Use a hash set or a cuckoo filter.
- **The set is small.** Ten thousand 16-byte keys is 160 KB in a hash set; the exact answer is cheap, and the filter buys nothing.
- **False positives have a real cost.** A filter gating "does this user exist?" before a login form that reveals the answer is leaking information at the false-positive rate.
- **`n` is unknown and unbounded.** Use a scalable Bloom filter or a cuckoo filter, and monitor the fill ratio.

A senior answer to "should we add a Bloom filter?" starts with "what is the cost of a false positive, and how many keys do we expect?".

## Exercise

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
  - "bits_set is just the count of 1s in the array."
```

## Senior signals

- You size a filter from a **target false-positive rate and expected `n`**, and you can quote "about 10 bits per key for 1%" and "another 4.8 bits per key per factor of ten".
- You know a Bloom filter has **no false negatives**, that deletion breaks that guarantee, and that counting or cuckoo filters are the fix.
- You explain **why LSM engines use them** (skipping SSTable reads for absent keys) and can name the Cassandra or RocksDB knob.
- You use **double hashing** and know the zero-step trap and the cache-locality argument for blocked filters.
- You ask "what does a false positive cost?" before proposing one, and you reach for a plain hash set when the set is small.
- You know what happens when the filter is **overfilled** and either fix `n` up front or use a scalable filter.

## Check yourself

```quiz
- q: >-
    A Bloom filter reports "not present" for a key. What can you conclude?
  options: ["The key was probably never added", "The key was definitely never added", "The key was added and later deleted", "Nothing without checking the backing store"]
  answer: 1
  explanation: >-
    Adding a key sets all k of its bits, so if any bit is 0 the key was never added. "Probably" describes the positive answer, not the negative one. Plain Bloom filters have no deletion, so option 3 cannot happen.
- q: >-
    You sized a filter for 1M keys at 1% false positives (about 9.6 bits per key, k = 7) but inserted 2M keys. Roughly what is the false-positive rate now?
  options: ["Still about 1%", "About 2%", "About 16%", "About 50%"]
  answer: 2
  explanation: >-
    With m/n halved to 4.8 and k still 7, p = (1 − e^(−7/4.8))^7 ≈ 0.16. The rate does not scale linearly with n; it degrades much faster once the array is more than half full.
- q: >-
    Why does RocksDB attach a Bloom filter to each SSTable?
  options: ["To compress the keys on disk", "To avoid reading files that cannot contain the key on a point lookup", "To speed up range scans", "To sort keys during compaction"]
  answer: 1
  explanation: >-
    A point read for a key must otherwise check every SSTable that might hold it. The filter answers "definitely not here" for most files without touching disk. It does not help range scans, which must visit every overlapping file regardless.
- q: >-
    Your double-hashing implementation uses positions (h1 + i·h2) mod m. For one key h2 mod m is 0. What happens?
  options: ["Nothing; the key still sets k bits", "The key sets only one bit, raising the chance that other keys collide with it", "The filter reports a false negative for that key", "The insert fails"]
  answer: 1
  explanation: >-
    All k positions collapse to h1 mod m. The key is still found (no false negative), but it occupies one bit instead of k, so any key whose positions all land on already-set bits, including that one, is a false positive far more easily. Implementations force h2 to be odd or non-zero.
- q: >-
    Which use case is a poor fit for a Bloom filter?
  options: ["Skipping a disk read for keys not in an SSTable", "Deciding whether to admit a URL into a CDN cache on its second request", "Answering 'is this username taken?' exactly during signup", "Avoiding re-crawling URLs a crawler has already visited"]
  answer: 2
  explanation: >-
    Signup needs an exact answer; a false positive tells a user their name is taken when it is not. The other three tolerate a false positive (an extra read, a delayed admission, a skipped URL) and need to avoid false negatives, which is the Bloom filter's guarantee.
```

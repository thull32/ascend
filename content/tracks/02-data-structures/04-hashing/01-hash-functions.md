---
slug: hash-functions
title: Hash functions
description: What makes a hash function good (uniformity, avalanche, speed), polynomial, FNV and Fibonacci hashing traced bit by bit, hashing compound keys without the XOR trap, what CPython, Java, Rust and Go actually hash with, and why keyed hashes exist.
minutes: 50
difficulty: medium
tags: [hashing, hash-function, fnv, polynomial-hash, avalanche, hashdos, siphash, fibonacci-hashing]
problems: [encode-decode-strings, group-anagrams]
---
A hash table with a perfect collision strategy and a bad hash function is a linked list. Every claim you make about O(1) lookups, balanced shards or evenly loaded caches rests on one assumption: that the hash function spreads your actual keys evenly over the available slots. That assumption fails more often than people expect, sometimes by accident (hashing only the low-entropy part of a key) and sometimes on purpose (an attacker who knows the function and chooses the keys).

This lesson is about the function itself: what it must do, how the common ones work at the bit level with every intermediate value shown, how to hash things that are not single strings, what the runtimes you use hash with, and where the boundary between "fast hash for tables" and "cryptographic hash" lies. [Modular arithmetic and hashing math](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) covers the number theory; here the focus is engineering.

## What a hash function must do

A hash function maps a key (of any size) to a fixed-size integer, and for use in a hash table it must be:

1. **Deterministic.** Same key, same hash, always, within one process. Tables store nothing but the hash and the key; if the hash drifts, the key is lost.
2. **Fast.** It runs on every insert and lookup. For short string keys, hashing is often the *dominant* cost of a table operation: FNV-1a processes one byte per XOR-then-multiply step, and because each step waits for the previous multiply (a latency of a few cycles), that is on the order of 1 ns per byte on a 3–4 GHz core, while the probe that follows is a handful of cycles if the slot is in cache.
3. **Uniform.** Over your real keys, each output value should be about equally likely. A function that is uniform over random input can still cluster on structured input, such as keys that share a prefix or are multiples of 8.
4. **Avalanche.** Flipping one bit of the input should flip about half the output bits. Without avalanche, similar keys (`user_1000`, `user_1001`) produce similar hashes and land in nearby buckets, which turns a linear-probing table into one long cluster.

Two properties it does *not* need for tables: it need not be hard to invert, and it need not be hard to find collisions on purpose. Those are cryptographic properties, and they cost roughly 10× in speed on short inputs. The exception, covered below, is when the keys come from someone who wants your table to be slow.

## Bad hashes, and how they fail

The fastest way to build intuition is to see what breaks.

**Sum of characters.** `hash("abc") = 97 + 98 + 99 = 294`. Every anagram collides (`"abc"`, `"bca"`, `"cab"`), and all 3-letter lowercase strings land in the range 291–366: 76 possible values for 17,576 keys. Uniformity and avalanche both fail.

**String length.** All keys of the same length collide. A real bug, not a straw man: a Java `hashCode` that returns a field's length, or a Python `__hash__` returning `len(self.items)`.

**Identity on structured integers.** `hash(x) = x` is what Java's `Integer.hashCode` and CPython's `hash(int)` do, and it is fine *when the table does something to spread the bits*. With a power-of-two table that uses the low bits as the index, keys that are all multiples of 1024 (page-aligned addresses, IDs allocated in blocks, timestamps in milliseconds rounded to the second) share every low bit. Measured on CPython 3.14: a thousand keys `0, 1024, 2048, …` masked to 1,024 buckets occupy **one** bucket. Java's `HashMap` mixes with `h ^ (h >>> 16)` before indexing for exactly this reason; CPython's dict feeds the high bits into its probe sequence (the trace is in [Hash tables](/learn/data-structures/hashing/hash-tables)).

**Hashing part of a compound key.** `hash(order.customer_id)` for a key that is `(customer_id, order_id)`. Every order for the same customer collides. This is the most common real-world version, and it usually shows up as "the cache is slow for our biggest customers".

**Floating point.** `0.0` and `-0.0` compare equal but have different bit patterns; a bitwise hash violates the contract that equal keys hash equal. `NaN` is not equal to itself, so it can be inserted many times and never found. CPython hashes `-0.0` to 0 like `0.0`, makes `hash(1.0) == hash(1) == hash(True) == 1`, and since 3.10 hashes each `NaN` object by identity so that two NaNs are at least two distinct keys rather than an unfindable one. If you write your own float hash, you must handle both cases.

## Polynomial string hashing, traced

The workhorse for strings treats the string as the digits of a number in some base `B` and reduces modulo `M`:

$$h(s) = \left(s_0 B^{n-1} + s_1 B^{n-2} + \dots + s_{n-1}\right) \bmod M$$

Computed with Horner's rule, one multiply-add per character:

```python
def poly_hash(s, base=31, mod=2**32):
    h = 0
    for ch in s:
        h = (h * base + ord(ch)) % mod
    return h
```

Trace `"abc"` with `B = 31`, `M = 10⁹ + 7`:

| Step | Character | `ord` | `h × 31` | `+ ord` | `h` after |
|---|---|---|---|---|---|
| 1 | `a` | 97 | 0 | 97 | 97 |
| 2 | `b` | 98 | 3,007 | 3,105 | 3,105 |
| 3 | `c` | 99 | 96,255 | 96,354 | 96,354 |

`"cba"` gives `99 × 961 + 98 × 31 + 97 = 98,274`, a different value, which is the property the character-sum hash lacked.

Java's `String.hashCode` is exactly this with `B = 31` and `M = 2³²` (the multiplication overflows and wraps, which *is* the modulus). Why 31? It is odd (an even base loses the low bit of every earlier character on each multiply), small enough that `31 × h` compiles to `(h << 5) − h`, which mattered in 1995, and prime, which avoids short periodicities in the powers. Two weaknesses follow from the small base:

- **No avalanche.** `"user_1000"` hashes to `337474643` and `"user_1001"` to `337474644`: the last character contributes `B⁰ = 1`, so consecutive keys differ by one and share 29 of 32 bits. In a chained table with power-of-two buckets that is harmless (adjacent buckets); in a linear-probing table it manufactures a cluster.
- **Cheap collisions.** `"Aa"` and `"BB"` both hash to 2,112 (`65 × 31 + 97 = 66 × 31 + 66`), and any string built from those two-character blocks collides with every other such string: `"AaAa"`, `"AaBB"`, `"BBAa"` and `"BBBB"` all hash to 2,031,744. That is a 2ⁿ-way collision for the cost of a loop, and it is the seed of the HashDoS attack below.

For rolling-hash algorithms (Rabin–Karp) the same polynomial is used with a large prime modulus and a random base, so that a window's hash can be updated in O(1) as it slides; [String matching](/learn/data-structures/tries-and-string-structures/string-matching) covers it.

## FNV-1a, traced to the bit

Fowler–Noll–Vo is a small, fast, non-cryptographic hash used in many hash tables, Go's `hash/fnv`, and countless ad-hoc tools. FNV-1a, 32-bit:

```python
def fnv1a_32(s):
    h = 0x811c9dc5                       # offset basis
    for ch in s:
        h ^= ord(ch)                     # 1. mix the byte in
        h = (h * 0x01000193) & 0xffffffff   # 2. multiply by the FNV prime, wrap to 32 bits
    return h
```

Trace `"ab"`:

| Step | Byte | `h` before | `h ^ byte` | `× 16777619 mod 2³²` |
|---|---|---|---|---|
| 1 | `a` = 0x61 | `0x811c9dc5` | `0x811c9da4` | `0xe40c292c` (3826002220) |
| 2 | `b` = 0x62 | `0xe40c292c` | `0xe40c294e` | `0x4d2505ca` (1294271946) |

The XOR touches only the low 8 bits; the multiply by `2²⁴ + 403` copies those bits up to positions 24–31 (the `2²⁴` term) and smears them across the middle (the `403` term), so by the next byte every part of the word depends on every earlier byte. Measured avalanche on 32-bit outputs: `"hello"` → `"Hello"` (one input bit flipped) changes 16 of 32 output bits; `"abc"` → `"abd"` changes 9; `"user_1000"` → `"user_1001"` changes 15. Java's polynomial changes 11, 1 and 3 bits respectively for the same pairs. Sixteen is the ideal; nine shows FNV is decent, not great, on very short inputs where the last byte has been through only one multiply.

In JavaScript the multiplication must be done with `Math.imul` (32-bit wrapping multiply) and the result forced unsigned with `>>> 0`; ordinary `*` on products above 2⁵³ loses precision and the hash silently diverges from every other implementation. That divergence matters the moment a hash crosses a process boundary: a shard key computed in a Node service and a Go service must agree, and a Java `hashCode` is a *signed* 32-bit value, so `h % n` can be negative and must be masked before use as an index.

Faster and better-distributed non-cryptographic hashes exist: MurmurHash3 (Cassandra's partitioner, many Bloom filters), xxHash3 and wyhash (the fastest general-purpose options at the time of writing, tens of gigabytes per second on long inputs), CityHash/FarmHash (Google). They consume 8–32 bytes per step with 64-bit multiplies and add a *finaliser* (two or three XOR-shift-multiply rounds) so that even a one-byte input avalanches fully. The [xxHash project's benchmark](https://github.com/Cyan4973/xxHash) on an i7-9700K puts numbers on it: FNV64 streams 1.2 GB/s against 31.5 GB/s for XXH3 with SSE2 (59.4 GB/s with AVX2), a 26× gap for hashing megabytes (content-addressable storage, deduplication), while on small inputs its "small data velocity" score for XXH3 is only about twice FNV's. For a hash table with short keys the choice barely registers; for bulk data it dominates.

## Integer hashing and Fibonacci hashing

Integers do not need "mixing" to be unique, but they need it to be *spread*. The cheapest good mixer is multiplicative hashing: multiply by a large odd constant and take the top bits of the product.

$$h(x) = \left\lfloor \frac{(x \cdot A) \bmod 2^{64}}{2^{64 - b}} \right\rfloor$$

With `A = ⌊2⁶⁴ / φ⌋ = 11400714819323198485` (the golden ratio), this is Fibonacci hashing. Take the "all multiples of 1024" keys that collapsed into one bucket above and hash them into 8 slots (`b = 3`, so keep the top three bits of the 64-bit product):

| `x` | `x · A mod 2⁶⁴` | Top 3 bits → slot | `x & 7` (low bits) |
|---|---|---|---|
| 1024 | 15989720402518627328 | 6 | 0 |
| 2048 | 13532696731327703040 | 5 | 0 |
| 3072 | 11075673060136778752 | 4 | 0 |
| 4096 | 8618649388945854464 | 3 | 0 |
| 5120 | 6161625717754930176 | 2 | 0 |
| 6144 | 3704602046564005888 | 1 | 0 |
| 7168 | 1247578375373081600 | 0 | 0 |
| 8192 | 17237298777891708928 | 7 | 0 |

Eight keys, eight distinct slots, from one multiply and one shift. Consecutive integers `1..8` land in `4, 1, 6, 3, 0, 5, 2, 7`, also a perfect spread: multiplying by `2⁶⁴/φ` advances around the ring of outputs by the golden angle, which is the most evenly spaced sequence any single multiplier can produce (the same reason sunflower seeds pack the way they do). It costs one multiply and one shift, and it is a common way to turn a "good enough" 64-bit hash into a table index instead of `mod capacity` (a division, which costs several times a multiply's latency on x86). The Linux kernel's `hash_64` in `include/linux/hash.h` is exactly this: `val * GOLDEN_RATIO_64 >> (64 − bits)` with `GOLDEN_RATIO_64 = 0x61C8864680B583EB`, which is `2⁶⁴ − A`, the same golden-ratio spacing walked in the opposite direction.

The general principle: when the table's capacity is a power of two, the *low* bits of the hash pick the slot, so the hash function's job is to make the low bits depend on all of the key. Multiplicative hashing puts the well-mixed bits at the top and shifts them down; Java's `h ^ (h >>> 16)` copies the top bits into the bottom.

## Hashing compound keys

Keys are often tuples, structs or lists. The rule is that the combined hash must depend on *every* field and on their *order*, and it must respect equality: if two compound keys compare equal, they must hash equal.

**The XOR trap.** `hash(a) ^ hash(b)` is symmetric, so `(a, b)` and `(b, a)` collide, and `(x, x)` hashes to 0 for every `x`. Pairs of coordinates, edges in a graph, `(from, to)` in a routing table: all common, all broken by XOR. Addition has the same symmetry.

**The standard combiner.** Treat the fields as digits in a polynomial, exactly like characters in a string:

```python
def hash_combine(h, field_hash):
    return (h * 31 + field_hash) & 0xffffffffffffffff

def hash_tuple(fields):
    h = 17
    for f in fields:
        h = hash_combine(h, hash(f))
    return h
```

Boost's long-standing `hash_combine` used `seed ^= h + 0x9e3779b9 + (seed << 6) + (seed >> 2)` (the golden-ratio constant again), which mixes better than `× 31`; Boost 1.81 replaced it with `seed = hash_mix(seed + 0x9e3779b9 + h)`, where `hash_mix` is a multiply-xorshift finaliser. CPython's tuple hash is a variant of xxHash's combining step since 3.8, so `hash((1, 2))`, `hash((2, 1))` and `hash((1, 1))` are three unrelated 64-bit values. Java's `Objects.hash(a, b, c)` is the `× 31` version.

**Order-independent keys.** A set of items must hash the same regardless of iteration order. There, commutativity is what you want: sum or XOR the *element* hashes (CPython's `frozenset` XORs a per-element shuffle of each element's hash, so `frozenset({1, 2})` and `frozenset({2, 1})` agree and `{x, x}` cannot happen because a set has no duplicates). Choose symmetric combination when the key is a set, asymmetric when it is a sequence, and be explicit about which.

**Mutable keys.** A key whose hash can change after insertion corrupts the table: the entry sits in the old bucket and is never found. Python refuses to hash lists and dicts; Java lets you put a mutable object in a `HashMap` and silently lose it. Hash only immutable values, or freeze a copy at insertion.

**Equality contract.** Python: override `__eq__` and `__hash__` together, or the class becomes unhashable. Java: `equals` and `hashCode` together, or `HashSet` contains duplicates that `equals` says are the same. JavaScript's `Map` and `Set` use SameValueZero on the *reference* for objects, so two structurally identical objects are two keys; serialise to a string (`JSON.stringify` with sorted keys, or a hand-built `"x,y"`) when you need structural keys.

## Under the hood: what your runtime hashes with

| Runtime | Strings | Integers | Compound keys | Seeded? |
|---|---|---|---|---|
| CPython 3.11+ | SipHash-1-3 (SipHash-2-4 from 3.4 to 3.10), 64-bit, cached in the `str` object | `x mod (2⁶¹ − 1)`, so `hash(2⁶¹) == 1`; `hash(−1) == −2` because −1 is the C error sentinel | Tuples: xxHash-style combine (3.8+); `frozenset`: commutative XOR shuffle | Per process (`PYTHONHASHSEED`) |
| Java (HotSpot) | `s[0]·31ⁿ⁻¹ + … + s[n−1]` mod 2³², signed, cached in the `String` (plus a `hashIsZero` flag since JDK 13) | Identity; `HashMap` spreads with `h ^ (h >>> 16)` | `Objects.hash` = `× 31` combiner | No; `HashMap` treeifies long chains instead |
| Rust | `Hash` trait feeds bytes to a `Hasher`; `RandomState` is SipHash-1-3 | Same SipHash over the integer's bytes | `#[derive(Hash)]` feeds fields in order | Per thread, incremented per map |
| Go | Runtime `memhash`/`strhash`, AES-NI based on x86-64 and arm64 with hardware AES, a wyhash-derived fallback otherwise (Go 1.27) | Same family | Structs hashed field by field | Per process, plus a per-map seed |
| V8 | Seeded, cached in the string header: Jenkins one-at-a-time in V8 12.4 (Node 22) and 13.0, rapidhash in V8 13.6 (Node 24); identity hash for objects | `Map`/`Set` keys that are small integers go through an unseeded integer mixer (`ComputeUnseededHash`); integer-like strings store the index in the hash field | Objects are keyed by reference | Per isolate |

Three details from that table decide real bugs:

- **Caching.** CPython computes a string's hash once and stores it in the object (`sys.getsizeof('x')` is 42 bytes, eight of which are the hash field); Java does the same. Hashing a 1 KB string key therefore costs ~1 µs the first time and nothing afterwards for the *same object*, but a freshly built string (a `+` result, a substring) pays again. Python's dict lookup also checks pointer identity before `__eq__`, so a lookup with the same string object never compares characters at all.
- **Ints hash to themselves.** In CPython and Java a table of small integer keys never runs a hash function, and the probe sequence or the spreading step is the only protection against structured keys.
- **Seeds.** CPython, Rust, Go and V8 randomise; Java does not. Randomisation is why CPython's `set` of strings iterates in a different order every run since 3.3, and why Go randomises iteration order on purpose so that nobody can depend on it.

## HashDoS and keyed hashing

If an attacker controls the keys (HTTP parameter names, JSON object keys, form fields, header names) and knows the hash function, they can generate tens of thousands of distinct keys that all hash to the same bucket, using the `"Aa"`/`"BB"` construction or a meet-in-the-middle search. Parsing one request then costs O(n²) in the table. The December 2011 disclosure ([oCERT-2011-003](https://www.ocert.org/advisories/ocert-2011-003.html), reported by n.runs) listed Java, JRuby, PHP, Python, Rubinius, Ruby and the V8 engine, warned that crafted POST requests could hold a CPU at 100% for up to several hours with little bandwidth, and noted that the same attack had been published against Perl in 2003. It recurs whenever someone puts a fast, unkeyed hash in front of untrusted input.

The fix is a **keyed** hash: the function takes a secret seed chosen at process start, so the attacker cannot predict which keys collide.

- **SipHash** (Aumasson and Bernstein, 2012) was designed for this. It keeps four 64-bit state words initialised from a 128-bit key, absorbs the input 8 bytes at a time, and runs a *SipRound* (four add-rotate-xor steps with rotations of 13, 16, 21 and 17 bits, plus two 32-bit swaps) `c` times per block and `d` times at the end; SipHash-2-4 uses `c = 2, d = 4`, SipHash-1-3 the cheaper `c = 1, d = 3`. An 8-byte key is two blocks (the key itself, then a final block carrying the length), so SipHash-1-3 runs 2 + 3 = 5 SipRounds and SipHash-2-4 runs 4 + 4 = 8, on the order of tens of nanoseconds; FNV does the same key in a few nanoseconds. CPython (SipHash-2-4 from 3.4, SipHash-1-3 by default since 3.11) and Rust (`RandomState`, SipHash-1-3) use it, and the SipHash README lists Perl, Ruby and Redis among its users.
- Java chose a different defence: treeify long chains so the worst case is O(log n) instead of O(n).
- Go randomises the seed of its AES-based string hash per process and per map.

Per-process randomisation has a visible consequence: **iteration order of sets and dicts of strings differs between runs**. Code that depended on `set` order (test fixtures, "deterministic" output) broke when Python 3.3 turned randomisation on, and it breaks again whenever someone persists `hash(s)` to disk as a shard or cache key: the next process computes a different value and every key misses.

The trade-off is speed. SipHash is a few times slower than FNV or xxHash on short keys. Rust lets you swap in `FxHash` (a multiply-rotate mixer that the Rust compiler itself uses) or `ahash` (AES-NI based, seeded) when you control the keys, and the senior judgement call is: fast unkeyed hash for internal keys you generate, keyed hash for anything that arrives over the network.

## Cryptographic hashes are a different tool

SHA-256 and BLAKE3 provide preimage resistance (cannot find an input for a given output) and collision resistance (cannot find two inputs with the same output), at roughly 0.5–2 GB/s for SHA-256 with hardware SHA extensions and several GB/s for BLAKE3 with SIMD; on a 16-byte key the fixed cost of a full compression is tens to hundreds of nanoseconds depending on hardware support, several times SipHash. Use them for content addressing (OCI and Docker image layers are named by `sha256:` digests; git still defaults to SHA-1 object names, with SHA-256 repositories available via `git init --object-format=sha256`), integrity, signatures and passwords (with a slow KDF such as Argon2). Do not use them as hash-table functions: they are slower than they need to be and their outputs still have to be reduced `mod capacity`, which is where the table-specific spreading happens anyway. Conversely, never use FNV or MurmurHash where an attacker gains from a collision (deduplicating uploaded files by a fast hash is a way to let one user overwrite another's file).

| | FNV-1a | MurmurHash3 | xxHash3 / wyhash | SipHash-1-3 | SHA-256 / BLAKE3 |
|---|---|---|---|---|---|
| Short key (8–16 B) cost | ~5–15 ns | ~10–20 ns | ~5–10 ns | ~20–30 ns | ~50–500 ns |
| Long input throughput | ~1 GB/s (FNV64: 1.2) | ~4 GB/s | 30–60 GB/s (XXH3) | ~3 GB/s (measured for SipHash-2-4) | 0.5–5 GB/s |
| Avalanche on 1-byte inputs | Weak (one multiply) | Good (finaliser) | Good (finaliser) | Good | Perfect |
| Keyed (DoS-resistant) | No | Seed only, not secure | Seed only | Yes, 128-bit key | Keyed via HMAC |
| Output | 32/64 bits | 32/128 bits | 64/128 bits | 64 bits | 256 bits |
| Use for | Small tables, tools, config hashes | Partitioners, Bloom filters | Checksums, dedupe, fast tables | Untrusted keys in tables | Content addressing, integrity |

The nanosecond figures are orders of magnitude for a current x86-64 core and depend on the CPU, the input length and whether the code was inlined.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Cache slow for a few large tenants; one chain or cluster holds most entries | Only part of the compound key is hashed | Combine every field with an order-sensitive combiner; verify with a bucket histogram of live keys |
| A single request pins a core for seconds; profile shows time in `equals`/`__eq__` | HashDoS: attacker-chosen keys colliding under an unkeyed hash (FNV, FxHash, Java `String.hashCode` without treeify) | Keyed hash for untrusted keys; cap chain length; limit the number of parsed fields |
| After a deploy every cached item misses, or shards receive nothing | `hash(str)` was persisted or sent across processes; the seed changed (Python), or the JS multiply lost precision, or Java's signed `hashCode` went negative on one side | Use a stable, explicit hash (xxHash, Murmur3, SHA-256) with identical integer semantics on both sides; never persist a runtime's built-in hash |
| A consistent-hash ring gives one server most of the load although it has 100 virtual nodes | Weak avalanche on short similar strings (`node1#0`, `node1#1`) with FNV: the points cluster | Use a hash with a finaliser (Murmur3, xxHash) or add XOR-shift-multiply rounds to FNV's output ([Hashing at scale](/learn/data-structures/hashing/hashing-at-scale)) |
| Tests pass locally, fail in CI, pass on rerun | Code depends on `set`/`dict` iteration order of strings, which changes with the per-process seed | Sort before comparing; set `PYTHONHASHSEED` only to *reproduce*, never to "fix" |
| Entries vanish from a map; `get` returns nothing for a key that was inserted | A mutable key was changed after insertion, or `equals` and `hashCode` disagree | Immutable keys; implement both halves of the contract; a unit test that asserts `a == b ⇒ hash(a) == hash(b)` |
| Duplicate uploads overwrite each other's content in a dedup store | A fast non-cryptographic hash was used as the content address | Cryptographic hash for anything an attacker gains from colliding |

## Interviewer follow-ups

**"Why do Python and Java hash small integers to themselves? Isn't that a terrible hash?"** Model answer: it is free, it is collision-free for distinct integers, and the *table* takes responsibility for spreading (Java's `h ^ (h >>> 16)`, CPython's perturbed probe sequence); the failure case is structured keys such as multiples of a large power of two in a table that uses raw low bits, which those spreading steps exist to handle. Common wrong answer: "because integers are already random".

**"How would you hash a graph edge `(u, v)` for an undirected graph, and for a directed one?"** Model answer: directed needs order sensitivity, so combine with `h(u) × P + h(v)` or a Boost-style combiner; undirected needs symmetry, so canonicalise first (`(min, max)`) and then use the same order-sensitive combiner, which avoids XOR's `(x, x) → 0` degeneracy. Common wrong answer: XOR for both.

**"A service stores `hash(user_id_string) % 64` in the database as the user's shard. What breaks?"** Model answer: the value depends on the process's hash seed (Python, Go, Rust) and on the language, so a restart or a second service computes a different shard and every lookup misses; use an explicit, stable, language-independent hash (Murmur3 or xxHash with fixed seed, or SHA-256 truncated) and specify unsigned arithmetic. Common wrong answer: "pin `PYTHONHASHSEED`", which fixes one language and reintroduces HashDoS.

**"When is FNV the wrong choice even though the keys are trusted?"** Model answer: when the inputs are short and similar and the *positions* matter, such as virtual nodes on a consistent-hash ring or bucket selection with linear probing, because FNV's single multiply per byte leaves consecutive keys with correlated hashes; add a finaliser or use a hash that has one. Common wrong answer: "FNV is always fine for non-adversarial input".

**"What does a keyed hash cost you, and when do you pay it?"** Model answer: a few times the per-key cost of an unkeyed hash on short keys (20–30 ns versus 5–10 ns), paid on every table operation, and per-process iteration-order instability; pay it whenever the keys come from outside the trust boundary and skip it for keys you generate. Common wrong answer: "it makes lookups O(log n)".

## What mid-level engineers get wrong

- **Using XOR to combine hashes** and shipping a table where every `(x, x)` key collides at zero.
- **Persisting a runtime's built-in hash** as a shard, partition or cache key; it changes with the seed, the language and the version.
- **Fixing flaky tests by pinning `PYTHONHASHSEED`** instead of removing the dependence on set order.
- **Choosing FxHash or FNV for a request parser** because a microbenchmark won; the benchmark had no attacker.
- **Hashing a mutable object** and then mutating it, in Java or in a Python class with a custom `__hash__`.
- **Overriding `equals`/`__eq__` without `hashCode`/`__hash__`**, producing sets that hold two "equal" objects.
- **Using SHA-256 in a hash table** "to be safe"; it is 10× slower on short keys and adds no safety against collisions in a table, which are resolved by probing, not prevented.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 4, "operations": [["set", "user_1000", 1], ["set", "user_1001", 2], ["set", "user_1002", 3], ["set", "user_1003", 4], ["set", "user_1004", 5], ["set", "user_1005", 6], ["get", "user_1003"]], "title": "Similar keys in a small table: watch the chain lengths"}
```

## Exercises

```exercise
id: fnv1a-32
title: Implement FNV-1a (32-bit)
prompt: |
  Implement the 32-bit FNV-1a hash of an ASCII string: start with
  `h = 0x811c9dc5`; for each character, `h ^= code`, then
  `h = (h * 0x01000193) mod 2^32`. Return `h` as a non-negative integer.
  In JavaScript use `Math.imul` for the multiply and `>>> 0` to keep the
  result unsigned; in Python mask with `& 0xffffffff`.
languages: [python, javascript]
entry: fnv1a_32
starter:
  python: |
    def fnv1a_32(s):
        # your code here
        return 0
  javascript: |
    function fnv1a_32(s) {
      // your code here
      return 0;
    }
tests:
  - args: [""]
    expected: 2166136261
    label: empty string is the offset basis
  - args: ["a"]
    expected: 3826002220
  - args: ["foobar"]
    expected: 3214735720
  - args: ["hello"]
    expected: 1335831723
  - args: ["Hello"]
    expected: 4116459851
    hidden: true
    label: one bit of input changes everything
  - args: ["cba"]
    expected: 23959651
    hidden: true
hints:
  - "XOR first, then multiply; that order is what makes it FNV-1a rather than FNV-1."
  - "JavaScript: `h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0`."
```

```exercise
id: poly-hash
title: Polynomial string hash
prompt: |
  Return the polynomial hash of `s` using Horner's rule:
  `h = (h * base + code) mod m` for each character code in order, starting
  from 0. `base <= 256` and `m <= 2^32`, so every intermediate product fits
  in a JavaScript number without precision loss. The empty string hashes
  to 0.
languages: [python, javascript]
entry: poly_hash
starter:
  python: |
    def poly_hash(s, base, m):
        # your code here
        return 0
  javascript: |
    function poly_hash(s, base, m) {
      // your code here
      return 0;
    }
tests:
  - args: ["abc", 31, 1000000007]
    expected: 96354
  - args: ["", 31, 1000000007]
    expected: 0
    label: empty string
  - args: ["Aa", 31, 4294967296]
    expected: 2112
    label: the famous Java collision, part 1
  - args: ["BB", 31, 4294967296]
    expected: 2112
    label: the famous Java collision, part 2
  - args: ["hello", 31, 1000000007]
    expected: 99162322
    hidden: true
  - args: ["zzzz", 128, 1000]
    expected: 130
    hidden: true
    label: reduce at every step so nothing overflows
  - args: ["abc", 1, 1000]
    expected: 294
    hidden: true
    label: base 1 degenerates to the character sum
hints:
  - "Take the modulus after every multiply-add, not only at the end."
  - "Use `ord(ch)` / `charCodeAt(i)` for the character code."
```

## Senior signals

- You name the four requirements (deterministic, fast, uniform, avalanche) and know that uniformity is a property of the function *on your keys*, not in the abstract.
- You can write FNV-1a and a polynomial hash from memory, trace one step with the intermediate values, and explain what the multiply and the XOR each do.
- You can show Fibonacci hashing spreading multiples of 1024 across every slot and say why `mod` by a power of two would not.
- You know why `hash(a) ^ hash(b)` is wrong for ordered pairs and what to use instead, and when symmetric combination is right.
- You know what your runtime hashes with (SipHash-1-3 in CPython 3.11+ and Rust, `× 31` in Java, AES-based in Go), that string hashes are cached in the object, and that ints hash to themselves.
- You state the equality/hash contract and the mutable-key hazard in whichever language the interviewer is using.
- You can explain HashDoS, sketch a SipRound, say why SipHash is the default in Python and Rust, and say when it is safe to switch to a faster unkeyed hash.
- You never persist or transmit a runtime's built-in hash, and you keep cryptographic and table hashes in separate mental boxes.

## Check yourself

```quiz
- q: >-
    A hash function returns the sum of a string's character codes. Which property does it fail most badly?
  options: ["Speed, because it must touch every character of the key", "Equality, because equal strings can get different sums", "Determinism, because codes differ between encodings", "Avalanche and uniformity, because anagrams all collide"]
  answer: 3
  explanation: >-
    The sum ignores order (every permutation collides) and compresses the output into a small range determined by length. It is deterministic and as fast as any string hash, since every good one also reads every character. Multiplying by a base before adding each character, as the polynomial hash does, fixes both.
- q: >-
    Why does Java's HashMap compute `h ^ (h >>> 16)` before using the hash as an index?
  options: ["To speed up equals() by rejecting mismatches on high bits", "To make hashes unpredictable to attackers who choose keys", "To turn negative hash codes into valid non-negative indices", "Only the low bits pick the bucket, so high bits are folded in"]
  answer: 3
  explanation: >-
    The table capacity is a power of two, so only the low bits select the bucket. Integer.hashCode is the identity, and keys that differ only in high bits (multiples of large powers of two) would otherwise share a bucket. Folding the top half into the bottom half spreads them. It is not a security measure: the mix is fixed and public, so attackers can still predict it.
- q: >-
    You hash graph edges (u, v) as hash(u) XOR hash(v). What goes wrong?
  options: ["Most edges collide, because XOR discards the high bits", "(u, v) and (v, u) collide, and every (u, u) hashes to 0", "Nothing, because XOR is the standard way to combine hashes", "It only works for integer vertices, since XOR needs numbers"]
  answer: 1
  explanation: >-
    XOR is commutative and self-cancelling, so every self-loop hashes to zero and each edge collides with its reverse. It keeps all bits, so it is not a general collision factory, but for directed edges or any ordered pair use an order-sensitive combiner such as h * 31 + field. For undirected edges canonicalise to (min, max) first and then combine in order.
- q: >-
    A web service hashes JSON field names with FNV-1a into a hash map. What is the risk?
  options: ["Crafted colliding field names can make parsing O(n²)", "FNV is too slow for hashing every field of every request", "Colliding field names overwrite each other's values", "Memory use grows quadratically with the number of fields"]
  answer: 0
  explanation: >-
    FNV is unkeyed and its collisions are cheap to construct, so an attacker who knows the function can send thousands of colliding names and turn each request into a quadratic parse (HashDoS). The table still compares keys, so collisions cost time, not correctness. Untrusted keys need a keyed hash (SipHash) or a table that bounds chain length (Java's treeification). FNV is fine for keys the service generates itself.
- q: >-
    A service stores `hash(user_id) % 64` from Python's built-in `hash` in a database column as the user's shard. After a restart, lookups go to the wrong shard. Why?
  options: ["The modulus changed, because 64 is not a prime number", "Python's hash is signed, so the modulus result was negative", "The database truncated the 64-bit hash to a 32-bit column", "Python's hash of a string depends on a per-process random seed"]
  answer: 3
  explanation: >-
    Since Python 3.3, str hashes use SipHash with a seed chosen at process start, so the same string hashes differently in the next process and every persisted shard number is wrong. Python's % returns a non-negative result for a positive modulus, and the column width is irrelevant to a value below 64. Persisted or cross-service hashes must use an explicit stable function such as xxHash or Murmur3.
- q: >-
    Consecutive keys `user_1000` and `user_1001` hash under Java's String.hashCode to values that differ by exactly 1. Where does that hurt?
  options: ["In a chained table, where the two keys land in the same bucket", "In a linear-probing table, where adjacent home slots form one cluster", "Nowhere, because distinct hashes never cause collisions", "In a tree map, where the keys compare equal and one is dropped"]
  answer: 1
  explanation: >-
    The keys do not collide, so a chained table puts them in adjacent buckets and is unaffected. In a linear-probing table, adjacent home slots merge into a single run, so a sequence of such keys builds one long primary cluster and every miss walks it. A tree map does not hash at all. This is the missing-avalanche cost of a small polynomial base.
```

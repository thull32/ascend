---
slug: hash-functions
title: Hash functions
description: What makes a hash function good (uniformity, avalanche, speed), how polynomial and FNV hashes work step by step, hashing compound keys without the XOR trap, and why keyed hashes exist.
minutes: 45
difficulty: medium
tags: [hashing, hash-function, fnv, polynomial-hash, avalanche, hashdos, siphash]
problems: [encode-decode-strings, group-anagrams]
---
A hash table with a perfect collision strategy and a bad hash function is a linked list. Every claim you make about O(1) lookups, balanced shards or evenly loaded caches rests on one assumption: that the hash function spreads your actual keys evenly over the available slots. That assumption fails more often than people expect, sometimes by accident (hashing only the low-entropy part of a key) and sometimes on purpose (an attacker who knows the function and chooses the keys).

This lesson is about the function itself: what it must do, how the common ones work at the bit level, how to hash things that are not single strings, and where the boundary between "fast hash for tables" and "cryptographic hash" lies. [Modular arithmetic and hashing math](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) covers the number theory; here the focus is engineering.

## What a hash function must do

A hash function maps a key (of any size) to a fixed-size integer, and for use in a hash table it must be:

1. **Deterministic.** Same key, same hash, always, within one process. Tables store nothing but the hash and the key; if the hash drifts, the key is lost.
2. **Fast.** It runs on every insert and lookup. For short string keys, hashing is often the *dominant* cost of a table operation, more than the probe.
3. **Uniform.** Over your real keys, each output value should be about equally likely. A function that is uniform over random input can still cluster on structured input, such as keys that share a prefix or are multiples of 8.
4. **Avalanche.** Flipping one bit of the input should flip about half the output bits. Without avalanche, similar keys (`user_1000`, `user_1001`) produce similar hashes and land in nearby buckets, which defeats the table's spread.

Two properties it does *not* need for tables: it need not be hard to invert, and it need not be hard to find collisions on purpose. Those are cryptographic properties, and they cost roughly 10× in speed. The exception, covered below, is when the keys come from someone who wants your table to be slow.

## Bad hashes, and how they fail

The fastest way to build intuition is to see what breaks.

**Sum of characters.** `hash("abc") = 97 + 98 + 99 = 294`. Every anagram collides (`"abc"`, `"bca"`, `"cab"`), and all 3-letter lowercase strings land in the range 291–366: 76 possible values for 17,576 keys. Uniformity and avalanche both fail.

**String length.** All keys of the same length collide. Obviously bad, yet a real bug: a Java `hashCode` that returns a field's length, or Python's `__hash__` returning `len(self.items)`.

**Identity on structured integers.** `hash(x) = x` is what Java's `Integer.hashCode` and Python's `hash(int)` do, and it is fine *when the table does something to spread the bits*. With a power-of-two table that uses the low bits as the index, keys that are all multiples of 1024 (memory addresses, aligned IDs, timestamps rounded to the second in milliseconds) all land in bucket 0. Java's `HashMap` mixes with `h ^ (h >>> 16)` before indexing for exactly this reason; Python's dict uses the higher bits in its probe sequence.

**Hashing part of a compound key.** `hash(order.customer_id)` for a key that is `(customer_id, order_id)`. Every order for the same customer collides. This is the most common real-world version, and it usually shows up as "the cache is slow for our biggest customers".

**Floating point.** `0.0` and `-0.0` compare equal but have different bit patterns; a bitwise hash violates the contract that equal keys hash equal. `NaN` is not equal to itself, so it can be inserted many times and never found. Most languages special-case both; if you write your own float hash, you must too.

## Polynomial string hashing

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

Trace `"abc"` with `B = 31`, `M = 10⁹ + 7`: `h = 97`; `h = 97 × 31 + 98 = 3105`; `h = 3105 × 31 + 99 = 96354`. So `h("abc") = 96354`. The base multiplies earlier characters by higher powers, so order matters: `"cba"` gives `99 × 961 + 98 × 31 + 97 = 98274`, a different value, which is the property the character-sum hash lacked.

Java's `String.hashCode` is exactly this with `B = 31` and `M = 2³²` (the multiplication overflows and wraps, which *is* the modulus). Why 31? It is odd (an even base loses the low bit of every earlier character on each multiply), it is prime-ish enough to avoid trivial periodicity, and `31 × h` compiles to `(h << 5) − h`, which mattered in 1995. The known weakness: with `M = 2³²` and a small base, collisions are easy to construct. `"Aa"` and `"BB"` both hash to 2112 (`65 × 31 + 97 = 66 × 31 + 66`), and any string built from those two-character blocks in any combination collides with every other such string. That is a 2ⁿ-way collision for the cost of a loop, and it is the seed of the HashDoS attack below.

For rolling-hash algorithms (Rabin–Karp) the same polynomial is used with a large prime modulus and a random base, so that a window's hash can be updated in O(1) as it slides; [String matching](/learn/data-structures/tries-and-string-structures/string-matching) covers it.

## FNV-1a: a byte-oriented hash you can write from memory

Fowler–Noll–Vo is a small, fast, non-cryptographic hash used in many hash tables, Go's `hash/fnv`, and countless ad-hoc tools. FNV-1a, 32-bit:

```python
def fnv1a_32(s):
    h = 0x811c9dc5                       # offset basis
    for ch in s:
        h ^= ord(ch)                     # 1. mix the byte in
        h = (h * 0x01000193) & 0xffffffff   # 2. multiply by the FNV prime, wrap to 32 bits
    return h
```

The XOR folds the byte into the low bits; the multiply by the prime `16777619` smears them upward across the word. Together they give decent avalanche for so little code. `fnv1a_32("")` is the offset basis `2166136261`; `fnv1a_32("a")` is `3826002220`; `fnv1a_32("hello")` is `1335831723`. Compare with the polynomial hash: FNV over `"abc"` and `"cba"` produces `440920331` and `23959651`, values that share no visible structure, which is the avalanche property doing its job.

In JavaScript the multiplication must be done with `Math.imul` (32-bit wrapping multiply) and the result forced unsigned with `>>> 0`; ordinary `*` on numbers above 2⁵³ loses precision and the hash silently diverges from every other implementation. That divergence matters the moment a hash crosses a process boundary (a shard key computed in a Node service and a Go service must agree).

Faster and better-distributed non-cryptographic hashes exist: MurmurHash3 (Cassandra's partitioner, many Bloom filters), xxHash and wyhash (the fastest general-purpose options at the time of writing), CityHash/FarmHash (Google). They process 4–16 bytes per step and use wider multiplies. For a hash table with short keys, the difference between FNV and xxHash is small; for hashing megabytes (content-addressable storage, deduplication) it is 5–10×.

## Integer hashing and Fibonacci hashing

Integers do not need "mixing" to be unique, but they need it to be *spread*. The cheapest good mixer is multiplicative hashing: multiply by a large odd constant and take the top bits of the product.

$$h(x) = \left\lfloor \frac{(x \cdot A) \bmod 2^{64}}{2^{64 - b}} \right\rfloor$$

With `A = 2⁶⁴ / φ ≈ 11400714819323198485` (the golden ratio), this is Fibonacci hashing: consecutive integers map to slots that are spread as evenly as possible around the table, and arithmetic progressions in the input (the multiples-of-1024 problem) do not collapse. It costs one multiply and one shift, and it is what several modern tables use to turn a "good enough" 64-bit hash into a table index instead of `mod capacity` (a division, which is 20–40× slower than a multiply).

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

Boost's `hash_combine` uses `seed ^= h + 0x9e3779b9 + (seed << 6) + (seed >> 2)` (the golden-ratio constant again), which mixes better than `× 31`. Python's tuple hash is a variant of xxHash's combining step since 3.8. Java's `Objects.hash(a, b, c)` is the `× 31` version.

**Order-independent keys.** A set of items must hash the same regardless of iteration order. There, commutativity is what you want: sum or XOR the *element* hashes (Python's `frozenset` uses a mixed XOR with per-element shuffling to avoid the `(x, x) → 0` degeneracy). Choose symmetric combination when the key is a set, asymmetric when it is a sequence, and be explicit about which.

**Mutable keys.** A key whose hash can change after insertion corrupts the table: the entry sits in the old bucket and is never found. Python refuses to hash lists and dicts; Java lets you put a mutable object in a `HashMap` and silently lose it. Hash only immutable values, or freeze a copy at insertion.

**Equality contract.** Python: override `__eq__` and `__hash__` together, or the class becomes unhashable. Java: `equals` and `hashCode` together, or `HashSet` contains duplicates that `equals` says are the same. JavaScript's `Map` and `Set` use SameValueZero on the *reference* for objects, so two structurally identical objects are two keys; serialise to a string (`JSON.stringify` with sorted keys, or a hand-built `"x,y"`) when you need structural keys.

## HashDoS and keyed hashing

If an attacker controls the keys (HTTP parameter names, JSON object keys, form fields, header names) and knows the hash function, they can generate tens of thousands of distinct keys that all hash to the same bucket, using the `"Aa"`/`"BB"` construction or a meet-in-the-middle search. Parsing one request then costs O(n²) in the table: a few hundred kilobytes of crafted POST body ties up a CPU core for minutes. This was demonstrated against PHP, Python, Ruby, Java, ASP.NET and Node in 2011 (the "hash-flooding" disclosure), and it recurs whenever someone puts a fast, unkeyed hash in front of untrusted input.

The fix is a **keyed** hash: the function takes a secret seed chosen at process start, so the attacker cannot predict which keys collide.

- **SipHash** (2012) was designed for this: a small pseudo-random function that is fast on short inputs and has no known way to find collisions without the key. Python uses SipHash for `str` and `bytes` (randomised per process unless `PYTHONHASHSEED` is set); Rust's `HashMap` uses SipHash-1-3 by default; Ruby, Perl, Haskell and Redis adopted it too.
- Java chose a different defence: treeify long chains so the worst case is O(log n) instead of O(n).
- Go randomises the seed of its (AES-based on supported hardware) string hash per process.

Per-process randomisation has a visible consequence: **iteration order of sets and dicts of strings differs between runs**. Code that depended on `set` order (test fixtures, "deterministic" output) broke when Python 3.3 turned randomisation on, and Go deliberately randomises map iteration to stop people depending on it.

The trade-off is speed. SipHash is a few times slower than FNV or xxHash on short keys. Rust lets you swap in `FxHash` or `ahash` when you control the keys (compiler internals do this), and the senior judgement call is: fast unkeyed hash for internal keys you generate, keyed hash for anything that arrives over the network.

## Cryptographic hashes are a different tool

SHA-256, BLAKE3 and friends provide preimage resistance (cannot find an input for a given output) and collision resistance (cannot find two inputs with the same output), at 100 MB/s–several GB/s depending on hardware acceleration. Use them for content addressing (git, Docker layers, S3 ETags), integrity, signatures and passwords (with a slow KDF such as Argon2). Do not use them as hash-table functions: they are slower than they need to be and their outputs still have to be reduced `mod capacity`, which is where the table-specific spreading happens anyway. Conversely, never use FNV or MurmurHash where an attacker gains from a collision (deduplicating uploaded files by a fast hash is a way to let one user overwrite another's file).

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
  - "Take the modulus after every multiply-add, not just at the end."
  - "Use `ord(ch)` / `charCodeAt(i)` for the character code."
```

## Senior signals

- You name the four requirements (deterministic, fast, uniform, avalanche) and know that uniformity is a property of the function *on your keys*, not in the abstract.
- You can write FNV-1a and a polynomial hash from memory and explain what the multiply and the XOR each do.
- You know why `hash(a) ^ hash(b)` is wrong for ordered pairs and what to use instead, and when symmetric combination is right.
- You state the equality/hash contract and the mutable-key hazard in whichever language the interviewer is using.
- You can explain HashDoS, why SipHash is the default in Python and Rust, and when it is safe to switch to a faster unkeyed hash.
- You keep cryptographic and table hashes in separate mental boxes and can say why each is wrong for the other's job.

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
    XOR is commutative and self-cancelling, so every self-loop hashes to zero and each edge collides with its reverse. It keeps all bits, so it is not a general collision factory, but for directed edges or any ordered pair use an order-sensitive combiner such as h * 31 + field. For undirected edges the symmetry might even be desired.
- q: >-
    A web service hashes JSON field names with FNV-1a into a hash map. What is the risk?
  options: ["Crafted colliding field names can make parsing O(n²)", "FNV is too slow for hashing every field of every request", "Colliding field names overwrite each other's values", "Memory use grows quadratically with the number of fields"]
  answer: 0
  explanation: >-
    FNV is unkeyed and its collisions are cheap to construct, so an attacker who knows the function can send thousands of colliding names and turn each request into a quadratic parse (HashDoS). The table still compares keys, so collisions cost time, not correctness. Untrusted keys need a keyed hash (SipHash) or a table that bounds chain length (Java's treeification). FNV is fine for keys the service generates itself.
- q: >-
    Python sets of strings iterate in a different order each time a script runs. The cause is:
  options: ["Garbage collection moves objects, which reorders the buckets", "Identity hashing uses memory addresses, which differ per run", "String hashes use a random per-process seed to defeat HashDoS", "Sets are unordered, so Python shuffles them on each iteration"]
  answer: 2
  explanation: >-
    Since Python 3.3, str hashes use SipHash with a random seed (PYTHONHASHSEED). Iteration order follows bucket order, so it changes per process. Strings are hashed by content, not by address, and nothing shuffles deliberately. Code that depends on set order is relying on an implementation detail that was deliberately removed.
```

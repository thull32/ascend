---
lesson: hash-functions
source: 93c2242430e9e89d
fit: partial
desk:
  - "The polynomial hash trace of abc, and FNV-1a traced to the bit on ab"
  - "The Fibonacci hashing table: multiples of 1024 spread over eight slots"
  - "The compound-key combiner code, and the runtime table of what each language hashes with"
  - "The SipRound description and the hash comparison table: cost, throughput, avalanche, keyed"
  - "The production failure table"
  - "Exercises: implement FNV-1a, and a polynomial string hash"
---
## Introduction

A hash table with a perfect collision strategy and a bad hash function is a linked list. Every claim you make about constant-time lookups, balanced shards or evenly loaded caches rests on one assumption: that the hash function spreads your actual keys evenly over the slots.

That assumption fails more often than people expect. Sometimes by accident, by hashing only the boring part of a key. Sometimes on purpose, when an attacker who knows your function chooses the keys.

So this is about the function itself. What it must do, how the common ones fail, how to hash things that are not single strings, what your runtime actually uses, and where the line sits between a fast table hash and a cryptographic one.

## Four requirements

A hash function maps a key of any size to a fixed-size integer. For a table it must be four things.

Deterministic: same key, same hash, always, within a process. The table stores only the hash and the key; if the hash drifts, the key is lost.

Fast: it runs on every insert and every lookup. For short string keys, hashing is often the dominant cost of the whole operation. FNV-1a, a common simple hash, costs on the order of a nanosecond per byte, while the probe that follows is a handful of cycles if the slot is in cache.

Uniform: over your real keys, each output should be about equally likely. A function that is uniform on random input can still cluster on structured input, keys sharing a prefix, or keys that are all multiples of 8.

And avalanche: flipping one bit of the input should flip about half the output bits. Without it, similar keys like user 1000 and user 1001 get similar hashes and land in neighbouring buckets.

What a table hash does not need is to be hard to invert, or hard to collide on purpose. Those are cryptographic properties, and they cost roughly ten times the speed on short inputs. The exception is when the keys come from someone who wants your table to be slow.

## How bad hashes fail

The quickest intuition comes from what breaks. Sum the character codes. "abc" is 97 plus 98 plus 99, 294. Every anagram collides, and all three-letter lowercase strings land between 291 and 366: 76 possible values for 17,576 keys.

Identity on integers is subtler. Java and CPython both hash a small integer to itself, and that is fine when the table does something to spread the bits. But a power-of-two table picks the slot from the low bits. Keys that are all multiples of 1024, like page-aligned addresses or IDs allocated in blocks, share every one of those low bits. Measured on CPython: a thousand such keys, masked to 1,024 buckets, occupy exactly one bucket. That is why Java's HashMap folds the top 16 bits of the hash into the bottom 16 before indexing, and why CPython's dict feeds the high bits into its probe sequence.

The most common real-world failure is hashing part of a compound key: hashing only the customer id when the key is customer and order. Every order for one customer collides, and it shows up as "the cache is slow for our biggest customers."

## The polynomial hash, and its weaknesses

The workhorse for strings treats the characters as the digits of a number in some base, and reduces it modulo some size: multiply the running hash by the base, add the next character, repeat. Unlike the sum, order now matters: "abc" and "cba" get different values.

Java's string hash is exactly this, with base 31, wrapping at 32 bits. Why 31? It is odd, so the multiply never throws away low bits; it is small enough that multiplying by it was a shift and a subtract, which mattered in 1995; and it is prime. But the small base has two weaknesses.

No avalanche. The last character is multiplied by one, so user 1000 and user 1001 hash to values that differ by exactly one. In a chained table, that is harmless, just neighbouring buckets. In a linear-probing table, neighbouring home slots merge into one cluster.

And cheap collisions. Here is the famous one. "Capital A, small a" is 65 times 31, plus 97, which is 2,112. "Capital B, capital B" is 66 times 31, plus 66, which is also 2,112. Now chain those two-letter blocks together. Before I tell you: how many different four-letter strings built from them share one hash?

[pause]

All four of them. Every string made of those blocks collides with every other one of the same length. With n blocks, that is two to the n colliding strings, for the cost of a loop. That is the seed of the attack later.

FNV-1a mixes better. For each byte, XOR it into the hash, then multiply by a prime. The multiply copies the new bits up into the top of the word and smears them across the middle, so every part of the hash comes to depend on every earlier byte. Measured: changing "hello" to "Hello", one input bit, flips 16 of 32 output bits, the ideal. Java's polynomial flips 11. On "abc" to "abd", FNV flips 9 and Java's flips 1. FNV is decent, not great, on very short inputs. Modern hashes such as MurmurHash, xxHash and wyhash add a finaliser, a few rounds of shift, XOR and multiply, so even a one-byte input avalanches fully. On short keys the choice barely matters; on megabytes of data, xxHash3 streams over 30 gigabytes a second against about 1 for FNV.

## Spreading integers, and combining fields

Integers do not need mixing to be unique, but they need it to be spread. The cheapest good mixer is multiplicative hashing: multiply by a large odd constant and keep the top bits of the product. With a constant derived from the golden ratio, this is Fibonacci hashing. Take those multiples of 1024 that collapsed into one bucket, and hash eight of them into eight slots: eight keys, eight different slots, from one multiply and one shift. The Linux kernel's hash function for 64-bit values is exactly this. The principle: when the capacity is a power of two, the low bits pick the slot, so the hash's job is to make the low bits depend on all of the key.

Keys are often tuples. The combined hash must depend on every field and on their order, and equal keys must hash equal. Here is the trap: combining with XOR. XOR is symmetric, so the pair a, b collides with b, a. And it cancels itself, so every pair x, x hashes to zero. Graph edges, coordinates, from-and-to pairs: all common, all broken by XOR. Addition has the same symmetry.

The standard combiner treats the fields like characters in a string: multiply the running hash by 31 and add the next field's hash. When the key really is a set, symmetry is what you want, so XOR or sum the elements' hashes. Pick symmetric for sets, ordered for sequences, and say which.

Two more rules. Never let a key's hash change after insertion: the entry sits in the old bucket and is never found. Python refuses to hash lists; Java will let you lose a mutable object in a HashMap silently. And implement equality and hash together. In Java, override equals without hashCode and a HashSet holds two objects that equals says are the same.

## What your runtime hashes with

CPython hashes strings with SipHash-1-3 since 3.11, seeded per process, and caches the hash in the string object, so the same string object never pays twice. Integers hash to themselves. Java uses the base-31 polynomial, cached, with no seed; instead, its HashMap turns long chains into trees. Rust uses SipHash-1-3 too. Go uses an AES-based hash on hardware that has AES instructions, seeded per process and per map. V8 seeds per isolate.

The seed has a visible consequence. Since Python 3.3, a set of strings iterates in a different order on every run, and Go randomises map iteration order on purpose so nobody can depend on it. Code that relied on set order broke when that arrived. And it breaks again whenever someone persists a runtime's built-in hash to disk.

## HashDoS, and keyed hashing

If an attacker controls the keys, such as HTTP parameter names, JSON keys or header names, and knows your hash function, they can generate tens of thousands of distinct keys that all land in one bucket, with exactly the two-letter-block trick from before. Parsing one request becomes quadratic. The December 2011 disclosure listed Java, PHP, Python, Ruby and V8, and warned that crafted POST requests could hold a CPU at 100 percent for up to hours with little bandwidth.

The fix is a keyed hash: the function takes a secret seed chosen at process start, so the attacker cannot predict which keys collide. SipHash was designed for exactly this, and it is the default in Python and Rust. Java chose a different defence, bounding the worst chain at log n by turning it into a tree.

The cost is speed. On short keys, SipHash runs about 20 to 30 nanoseconds against 5 to 10 for a fast unkeyed hash. The senior judgement: a fast unkeyed hash for internal keys you generate, a keyed hash for anything that arrives over the network.

And cryptographic hashes, SHA-256 and BLAKE3, are a different tool. Use them for content addressing, integrity and signatures. Do not use them in a hash table: about ten times slower on short keys, and they add no safety, because table collisions are resolved by probing, not prevented. Conversely, never use FNV or Murmur where an attacker gains from a collision. Deduplicating uploaded files by a fast hash lets one user overwrite another's file.

## In the interview

The lesson's follow-up. A service stores the built-in hash of a user id string, modulo 64, in the database as the user's shard. What breaks?

[pause]

The value depends on the process's hash seed, in Python, Go and Rust, and on the language. A restart, or a second service, computes a different shard, and every lookup misses. Use an explicit, stable, language-independent hash, Murmur3 or xxHash with a fixed seed, or truncated SHA-256, and specify unsigned arithmetic, because Java's hashCode is signed. The common wrong answer is "pin the Python hash seed", which fixes one language and reintroduces HashDoS.

And: how would you hash a graph edge? Directed edges need order, so combine with multiply-and-add. Undirected edges need symmetry, so canonicalise first, smaller vertex then larger, and then use the same ordered combiner. That avoids XOR's habit of sending every self-loop to zero.

## Recap

Four things to remember. A table hash must be deterministic, fast, uniform on your keys, and avalanche; uniform in the abstract is not enough. Power-of-two tables pick slots from the low bits, so something must fold the high bits down: Java's shift-and-XOR, CPython's probe sequence, or Fibonacci hashing. Combine compound keys in order, never with XOR, unless the key is genuinely a set. And use a keyed hash like SipHash for untrusted keys, never persist a runtime's built-in hash, and keep cryptographic hashes out of your tables.

At your desk: the polynomial and FNV traces, the Fibonacci hashing table, the runtime and comparison tables, and the two exercises.

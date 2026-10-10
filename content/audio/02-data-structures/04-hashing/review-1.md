---
review: hashing
source: fcea17aef9983f81
---
## Introduction

Twelve questions from the hashing module. Answer out loud before the answer comes.

They run through the module in order: hash functions, hash tables, hash maps in interviews, ordered maps against hash maps, and hashing at scale. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

You hash graph edges, from u to v, as the hash of u XOR the hash of v. What goes wrong?

A, most edges collide, because XOR discards the high bits. B, the edge u to v collides with v to u, and every self-loop, u to u, hashes to zero. C, nothing, because XOR is the standard way to combine hashes. D, it only works for integer vertices, since XOR needs numbers.

[think]

The answer is B: an edge collides with its reverse, and every self-loop hashes to zero.

XOR is commutative and cancels itself. It keeps all the bits, so it is not a general collision factory, but for directed edges, or any ordered pair, use an order-sensitive combiner, such as multiplying the running hash by 31 and adding the next field. For undirected edges, canonicalise to smaller vertex first, then combine in order.

## Question 2

A web service hashes incoming JSON field names with FNV-1a into a hash map. What is the risk?

A, crafted colliding field names can make parsing quadratic. B, FNV is too slow for hashing every field of every request. C, colliding field names overwrite each other's values. D, memory use grows quadratically with the number of fields.

[think]

The answer is A: crafted colliding names can make parsing quadratic.

FNV is unkeyed and its collisions are cheap to construct, so an attacker who knows the function can send thousands of colliding names. That is HashDoS. The table still compares keys, so collisions cost time, not correctness. Untrusted keys need a keyed hash such as SipHash, or a table that bounds chain length, like Java's treeification. FNV is fine for keys the service generates itself.

## Question 3

A service stores Python's built-in hash of the user id, modulo 64, in a database column as the user's shard. After a restart, lookups go to the wrong shard. Why?

A, the modulus changed, because 64 is not a prime number. B, Python's hash is signed, so the modulus result was negative. C, the database truncated the 64-bit hash to a 32-bit column. D, Python's hash of a string depends on a per-process random seed.

[think]

The answer is D: the string hash depends on a per-process random seed.

Since Python 3.3, string hashes are seeded at process start, so the same string hashes differently in the next process and every stored shard number is wrong. Python's modulo is non-negative for a positive modulus, and the column width does not matter for a value below 64. Persisted or cross-service hashes need an explicit stable function, such as xxHash or Murmur3.

## Question 4

In an open-addressing table, you delete a key by setting its slot back to empty. What goes wrong?

A, lookups of the deleted key still find its old value. B, later inserts fail, because the slot stays reserved. C, lookups for keys that probed past that slot now stop early. D, nothing, because probing skips over empty slots anyway.

[think]

The answer is C: lookups for keys that probed past it now stop early.

Probing stops at the first empty slot. Keys inserted after the deleted one may have probed past it, and the new empty slot ends their search too soon, reporting them missing, exactly like pear after lime was deleted in the lesson's trace. Tombstones say "keep probing", and backward-shift deletion repairs the chain instead.

## Question 5

Why can Rust's hashbrown run at a load factor of seven eighths, when Knuth's formula gives about 32 probes for a miss at that load?

A, it compares 16 one-byte tags per step with one SIMD instruction. B, its probe sequence is random, so clusters cannot form. C, it rehashes in the background before the load gets that high. D, it stores keys sorted within each group, for binary search.

[think]

The answer is A: it compares 16 tags at once.

A SwissTable probe examines a whole group of 16 control bytes in one instruction, and compares a full key only on a 7-bit tag match, so 32 slots is two or three group loads. It still uses a deterministic probe sequence, and clusters still form; they are cheap to scan rather than prevented. Its rehashing is stop-the-world, not background.

## Question 6

In a long-running service, the 99th percentile lookup time climbs over several hours, although the map's size stays constant. What is the most likely cause?

A, garbage collection is compacting the table more often. B, the load factor rises, because deleted keys are still counted. C, the hash seed rotates, so keys drift away from their slots. D, tombstones from steady insert-and-delete churn are lengthening probes.

[think]

The answer is D: tombstones from churn are lengthening probes.

A table used like a queue accumulates tombstones, which are skipped but not counted as live, so every probe sequence grows until a rebuild clears them. The seed is fixed for the life of the process, and the live load is constant by assumption. The fix is a periodic rebuild, or a table whose deletes restore empty slots.

## Question 7

In longest consecutive sequence, what happens if you drop the check "only start counting from x when x minus 1 is absent"?

A, still correct, but n log n, from repeated set lookups. B, still correct and linear, because set lookups are constant time. C, a wrong answer, because runs are counted from their middle. D, still correct, but quadratic on long runs, from re-walking them.

[think]

The answer is D: still correct, but quadratic on long runs.

Counting upward from every element re-walks each run from every one of its members. The longest count still starts at the run's first element, so the answer is right, but the work is quadratic on sorted-like input. The check guarantees each run is walked once, from its start, which gives the linear bound.

## Question 8

A Node service counts user-supplied tags with a plain object: the count for a tag becomes its current count, or zero, plus one. A user submits the tag "constructor". What happens?

A, the service crashes, because constructor is a reserved word. B, nothing unusual, because assignment creates an own property. C, the count starts from a function, because the key is inherited from the prototype. D, the tag is rejected, because object keys must be valid identifiers.

[think]

The answer is C: the count starts from a function inherited from the prototype.

An empty object inherits constructor, toString and proto from the object prototype, so the read returns a function, and a function plus one produces a string, corrupting the count. A Map, or an object created with no prototype, has no inherited keys. The word is not reserved and the assignment itself succeeds, which is why the bug is silent.

## Question 9

Rust's standard ordered map is a B-tree rather than a red-black tree. Mainly because:

A, red-black trees cannot be written in safe Rust at all. B, wide nodes keep keys contiguous, so lookups miss the cache less. C, its worst-case height is lower than a red-black tree's. D, it uses much less memory per key, which decided the choice.

[think]

The answer is B: wide nodes keep keys contiguous, so fewer cache misses.

Both have logarithmic height. The B-tree's advantage is cache behaviour: at a million entries, 6 to 8 contiguous 192-byte nodes, instead of about 20 separately allocated ones. Memory per key is comparable or better, but locality is the decisive reason.

## Question 10

A calendar service checks each new booking against the existing ones with a linear scan over a hash map, and it is slow. What is the appropriate fix?

A, order bookings by start time, and check only the floor and the ceiling. B, use a bigger hash map, so each lookup has fewer collisions. C, cache the last overlap result, keyed by the requested range. D, sort the bookings on each request, then binary search them.

[think]

The answer is A: order bookings by start time and check only floor and ceiling.

Only the nearest booking on each side can overlap a new interval, so the floor and the ceiling of the start time are two logarithmic queries. An ordered map, a sorted array with binary search, or a B-tree index in the database answers both. Sorting on every request costs n log n every time.

## Question 11

A cache cluster places keys by hash modulo n. Growing from 9 to 10 servers moves approximately what fraction of keys?

A, none, since each key's hash value is unchanged. B, about 90 percent, since few hashes agree modulo 9 and modulo 10. C, about 10 percent, one server's fair share of the keys. D, about 50 percent, as keys shift toward the new server.

[think]

The answer is B: about 90 percent.

A key stays only if its hash modulo 9 equals its hash modulo 10, which happens for about one key in ten, so roughly n out of n plus 1, 90 percent, move. The lesson measured 90.0 percent over 100 thousand keys. The hash is unchanged, but the modulus is not. Consistent hashing cuts the movement to about 10 percent, the new server's fair share.

## Question 12

A Bloom filter reports that a key is present. What do you know?

A, it was added and not deleted, since deletes clear its bits. B, it was definitely added, since there are no false positives. C, nothing, since Bloom filters err in both directions. D, it was probably added; other keys may have set its bits.

[think]

The answer is D: it was probably added.

Bloom filters have no false negatives, so a "no" is certain, but bits are shared, so a "yes" is only probable. At 10 bits per key with 7 hashes, it is wrong about 0.8 percent of the time, rising as the filter fills past its design size. And a plain Bloom filter does not support deletion; that needs the counting variant.

## Recap

Three ideas kept coming back. Who controls the keys and where the hash lives: an unkeyed hash invites HashDoS, a seeded one must never be persisted, and a combiner must respect order unless the key is a set. Deletion and churn are where tables rot: an emptied slot breaks probe chains, and tombstones slow a table that never grows. And order and placement are separate tools: floor and ceiling need an ordered structure, and a changing set of servers needs consistent hashing, not modulo n.

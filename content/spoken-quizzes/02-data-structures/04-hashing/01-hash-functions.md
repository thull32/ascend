---
lesson: hash-functions
source: 66b5c40aeb13b78a
---
## 1

A hash function returns the sum of a string's character codes. Which property does it fail most badly?

A, speed, because it must touch every character of the key. B, equality, because equal strings can get different sums. C, determinism, because codes differ between encodings. D, avalanche and uniformity, because anagrams all collide.

[think]

The answer is D: avalanche and uniformity, because anagrams all collide.

The sum ignores order, so every permutation collides, and it squeezes the output into a small range set by the length. It is deterministic, and as fast as any string hash, since every good one also reads every character. Multiplying by a base before adding each character, as the polynomial hash does, fixes both problems.

## 2

Why does Java's hash map XOR a hash with itself shifted right by 16 bits, before using it as an index?

A, to speed up equals, by rejecting mismatches on high bits. B, to make hashes unpredictable to attackers who choose keys. C, to turn negative hash codes into valid non-negative indexes. D, only the low bits pick the bucket, so the high bits are folded in.

[think]

The answer is D: only the low bits pick the bucket, so the high bits are folded in.

The table capacity is a power of two, so only the low bits select the bucket. An integer's hash code is the integer itself, and keys that differ only in their high bits, such as multiples of large powers of two, would otherwise share a bucket. Folding the top half into the bottom half spreads them. It is not a security measure: the mix is fixed and public, so attackers can still predict it.

## 3

You hash graph edges, from u to v, as the hash of u XOR the hash of v. What goes wrong?

A, most edges collide, because XOR discards the high bits. B, the edge u to v collides with v to u, and every self-loop, u to u, hashes to zero. C, nothing, because XOR is the standard way to combine hashes. D, it only works for integer vertices, since XOR needs numbers.

[think]

The answer is B: the edge u to v collides with v to u, and every self-loop hashes to zero.

XOR is commutative and cancels itself. It keeps all the bits, so it is not a general collision factory, but for directed edges, or any ordered pair, use an order-sensitive combiner, such as multiplying the running hash by 31 and adding the next field. For undirected edges, put the smaller vertex first, then combine in order.

## 4

A web service hashes incoming JSON field names with FNV-1a into a hash map. What is the risk?

A, crafted colliding field names can make parsing quadratic. B, FNV is too slow for hashing every field of every request. C, colliding field names overwrite each other's values. D, memory use grows quadratically with the number of fields.

[think]

The answer is A: crafted colliding field names can make parsing quadratic.

FNV is unkeyed and its collisions are cheap to construct, so an attacker who knows the function can send thousands of colliding names. That is HashDoS. The table still compares keys, so collisions cost time, not correctness. Untrusted keys need a keyed hash such as SipHash, or a table that bounds chain length, like Java's treeification. FNV is fine for keys the service generates itself.

## 5

A service stores Python's built-in hash of the user id, modulo 64, in a database column as the user's shard. After a restart, lookups go to the wrong shard. Why?

A, the modulus changed, because 64 is not a prime number. B, Python's hash is signed, so the modulus result was negative. C, the database truncated the 64-bit hash to a 32-bit column. D, Python's hash of a string depends on a per-process random seed.

[think]

The answer is D: Python's hash of a string depends on a per-process random seed.

Since Python 3.3, string hashes use SipHash with a seed chosen at process start, so the same string hashes differently in the next process, and every stored shard number is wrong. Python's modulo is non-negative for a positive modulus, and the column width does not matter for a value below 64. Persisted or cross-service hashes need an explicit stable function, such as xxHash or Murmur3.

## 6

The consecutive keys user 1000 and user 1001 hash, under Java's string hash code, to values that differ by exactly 1. Where does that hurt?

A, in a chained table, where the two keys land in the same bucket. B, in a linear-probing table, where adjacent home slots form one cluster. C, nowhere, because distinct hashes never cause collisions. D, in a tree map, where the keys compare equal and one is dropped.

[think]

The answer is B: in a linear-probing table, where adjacent home slots form one cluster.

The keys do not collide, so a chained table puts them in adjacent buckets and is unaffected. In a linear-probing table, adjacent home slots merge into a single run, so a sequence of such keys builds one long primary cluster, and every miss walks it. A tree map does not hash at all. This is the cost of missing avalanche, from a small polynomial base.

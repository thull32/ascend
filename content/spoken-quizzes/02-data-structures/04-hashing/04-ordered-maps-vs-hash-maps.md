---
lesson: ordered-maps-vs-hash-maps
source: 10de11881f33d081
---
## 1

Which query can a hash map not answer efficiently?

A, remove key k and its value, if present. B, what is the largest stored key that is at most k? C, what value is currently stored for key k? D, is key k present among the stored keys?

[think]

The answer is B: what is the largest stored key that is at most k?

Hash maps place keys by hash, destroying order, so finding that floor key needs a full scan. Membership, lookup and removal are exact-key operations, and stay constant time in expectation. Floor, ceiling, range and sorted iteration need an ordered structure: a tree, a B-tree, a skip list or a sorted array.

## 2

Rust's standard ordered map is a B-tree rather than a red-black tree. What is the main reason?

A, red-black trees cannot be written in safe Rust at all. B, wide nodes keep keys contiguous, so lookups miss the cache less. C, its worst-case height is lower than a red-black tree's. D, it uses much less memory per key, which decided the choice.

[think]

The answer is B: wide nodes keep keys contiguous, so lookups miss the cache less.

Both have logarithmic height. The B-tree's advantage is cache behaviour: at a million entries, 6 to 8 contiguous 192-byte nodes, instead of about 20 separately allocated ones. Memory per key is comparable or better, but locality is the decisive reason.

## 3

In Python, you want the largest key that is at most x in a sorted list of keys. Which is correct?

A, take i from bisect right, and if i is above 0, the key at i minus 1. B, take i from bisect right, and if i is within the list, the key at i. C, take i from bisect left, and if i is within the list, the key at i. D, take i from bisect left, and if i is above 0, the key at i minus 1.

[think]

The answer is A: take i from bisect right, and if i is above 0, the key at i minus 1.

Bisect right returns the first index with a key greater than x, so the element before it is the floor; guard the case where that index is 0. Bisect left minus 1 fails when x is present, because it returns the previous key. And the key at bisect left is the ceiling, not the floor.

## 4

Redis sorted sets use a skip list alongside a hash table. Why not a red-black tree?

A, rank ranges are easy through spans, and updates are local, with no rotations. B, red-black trees cannot keep a score alongside each member. C, skip lists are faster than trees for exact score lookups. D, skip lists use less memory than any balanced tree design.

[think]

The answer is A: rank ranges are easy through spans, and updates are local, with no rotations.

Skip lists give expected logarithmic ordered operations with simple, local pointer updates, and the span stored with each forward pointer makes rank queries logarithmic, which a plain tree lacks. Exact lookups in Redis go through the companion hash table, not the skip list. Memory use is comparable, not decisively lower.

## 5

A calendar service checks each new booking against the existing ones with a linear scan over a hash map, and it is slow. What is the appropriate fix?

A, order bookings by start time, and check only the floor and the ceiling. B, use a bigger hash map, so each lookup has fewer collisions. C, cache the last overlap result, keyed by the requested range. D, sort the bookings on each request, then binary search them.

[think]

The answer is A: order bookings by start time, and check only the floor and the ceiling.

Only the nearest booking on each side can overlap a new interval, so the floor and the ceiling of the start time are two logarithmic queries. An ordered map, a sorted array with binary search, or a B-tree index in the database answers both. Sorting on every request costs n log n every time.

## 6

A loader inserts a million random keys into a Python list with insort, from the bisect module, and takes minutes. What is the cause?

A, insort re-sorts the entire list after every insertion. B, binary search over a list is linear, because lists are not arrays. C, each insert shifts up to a million pointers, so the total is quadratic. D, Python lists cannot exceed a few hundred thousand elements.

[think]

The answer is C: each insert shifts up to a million pointers, so the total is quadratic.

The search is logarithmic, but the insert moves every pointer after the insertion point, on average half the list, 4 megabytes at a million keys, so a million inserts is quadratic work. Python lists are contiguous arrays of pointers with no such size limit, and insort does not sort. Use sortedcontainers or a tree, or sort once after loading.

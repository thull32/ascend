---
lesson: hash-maps-in-interviews
source: f7e0e77fbbfe0f55
---
## 1

You key anagram groups by each word's sorted string. For n words of length k, what is the total time?

A, n log n: sorting dominates the grouping. B, n times k log k: a k-character sort per word. C, linear in n: one hash-map operation per word. D, n times k: the sort and the hash are linear in k.

[think]

The answer is B: n times k log k, a k-character sort per word.

Each key costs a comparison sort of k characters, and hashing the key is linear in k, so the sort dominates. A signature of 26 letter counts makes it n times k, but with a larger constant for short words. Neither is linear in the word count alone, because hashing a string key costs its length.

## 2

In longest consecutive sequence, what happens if you drop the check "only start counting from x when x minus 1 is absent"?

A, still correct, but n log n, from repeated set lookups. B, still correct and linear, because set lookups are constant time. C, a wrong answer, because runs are counted from their middle. D, still correct, but quadratic on long runs, from re-walking them.

[think]

The answer is D: still correct, but quadratic on long runs, from re-walking them.

Counting upward from every element re-walks each run from every one of its members. The longest count still starts at the run's first element, so the answer is right, but the work is quadratic on sorted-like input. The check guarantees each run is walked once, from its start, which gives the linear bound.

## 3

An unordered list is backed by a map from each value to its index. How do you delete an arbitrary value in constant time?

A, mark the slot as deleted, and skip it in later calls. B, pop at that index, then shift the later indexes. C, move it to the front, fix its index, then pop from the front. D, swap it with the last element, fix that element's index, and pop.

[think]

The answer is D: swap it with the last element, fix that element's index, and pop.

Removing from the middle or the front of an array is linear, but since order does not matter, one swap moves the hole to the end. The map must be updated for the element that moved, which is the step people forget. Tombstones leave holes that make the list grow, and make random sampling retry.

## 4

Which Python idiom silently inserts a key into a map during what looks like a read?

A, calling keys on a defaultdict. B, calling get on a defaultdict. C, indexing a defaultdict with square brackets. D, testing membership with in on a defaultdict.

[think]

The answer is C: indexing a defaultdict with square brackets.

A defaultdict creates the default value on any indexed access, including reads inside a condition. In long-running services, that turns queries into unbounded growth. Membership tests and get never create a value, so use them for pure lookups.

## 5

A Node service counts user-supplied tags with a plain object: the count for a tag becomes its current count, or zero, plus one. A user submits the tag "constructor". What happens?

A, the service crashes, because constructor is a reserved word. B, nothing unusual, because assignment creates an own property. C, the count starts from a function, because the key is inherited from the prototype. D, the tag is rejected, because object keys must be valid identifiers.

[think]

The answer is C: the count starts from a function, because the key is inherited from the prototype.

An empty object inherits constructor, to-string and others from the object prototype, so the read returns a function, and a function plus one produces a string, corrupting the count. A Map, or an object created with no prototype, has no inherited keys. The word is not reserved, and the assignment itself succeeds, which is why the bug is silent.

## 6

In the prefix-sum map for counting subarrays that sum to k, why must the map store counts rather than presence?

A, because negative numbers make prefix sums decrease, breaking presence. B, because the same prefix sum can occur at several indexes, each giving a subarray. C, because counts are needed to seed the map with the empty prefix. D, because presence would make the map a set, which cannot hold integers.

[think]

The answer is B: because the same prefix sum can occur at several indexes, each giving a subarray.

Every earlier index whose prefix sum is the current sum minus k ends a distinct subarray at the current index, so the answer adds the number of such indexes, not one. The seed for the empty prefix is a count too, and negatives are exactly what make repeated prefix values possible, but the reason is multiplicity. A set works only for the variant that asks whether any subarray sums to k.

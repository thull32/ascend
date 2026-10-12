---
lesson: hash-map-patterns
source: 37fc31f98a427b43
---
## 1

You write the Two Sum complement lookup so that each step first stores the current value's index in the map, and then checks whether the target minus the current value is in the map. Which input exposes the bug?

A, an input that has more than one valid pair. B, an input where the target is twice some element. C, an input where the answer uses the last element. D, an input that contains negative numbers.

[think]

The answer is B: an input where the target is twice some element.

Inserting first means the current element is already in the map when it asks for its complement. So when the complement equals the value itself, it finds itself and returns the same index twice. Query first, then insert, and every index found is strictly earlier. Negatives, several valid pairs and a last-element answer are all handled by either order.

## 2

Longest Consecutive Sequence runs on a set of 9 distinct values that form two runs, of lengths 7 and 2. How many set lookups does the head-only walk perform?

A, 18: one head check per value, plus one walk lookup per value. B, 81, since each of the 9 values can walk up to 9 steps. C, 31, since every value walks to the end of its own run. D, 11: one head check per value, plus one per run found.

[think]

The answer is A: 18.

Every value gets one head check, which is 9. Only the two heads walk, and a walk over a run of length L does L lookups, L minus 1 hits and one miss, so the walks add 7 plus 2, another 9. Walking from every value would give 28 plus 3, or 31 walk lookups: the quadratic version the head check exists to avoid.

## 3

You group a hundred thousand five-letter words by anagram class in CPython. Which key did the lesson's measurement favour, and why?

A, the count tuple, since building it is linear in the word's length, while sorting is L log L. B, neither, since the dictionary lookup dominates and both keys cost the same. C, the sorted string, since sorting five items in C beats 26 interpreted increments. D, the count tuple, since tuples hash faster than strings of equal length.

[think]

The answer is C: the sorted string, since sorting five items in C beats interpreted counting.

At five letters, the sorted key took 16 milliseconds against 25 for the count tuple. The asymptotic advantage of counting only shows once words are long: at 50 letters the count key won, 133 milliseconds against 240. Constant factors dominate at small sizes, which is the point to make in the interview.

## 4

A Python solution returns a list built from a set of the input, and a test expects the values in first-seen order. It passes on 5, 1, 3 locally, and fails on other inputs. What is the most accurate explanation?

A, sets reorder themselves after every resize of the table. B, sets keep insertion order only for integers below 256. C, sets iterate in slot order, which only sometimes matches the input. D, sets sort their contents, so any unsorted input will fail.

[think]

The answer is C: sets iterate in slot order, which only sometimes matches the input.

A set has no insertion-ordered array of entries, so it iterates in the order of its hash slots. Small non-negative integers hash to themselves, which can make the order look sorted, or look like input order, by accident: the set of 5, 3, 9 and 1 lists as 9, 3, 5, 1 on CPython 3.14. A dict, or dict from keys, keeps first-seen order by guarantee.

## 5

An interviewer says the array holds n plus 1 values, each in the range 1 to n. You must not modify it, and you may use only constant extra space. Find a duplicate. Which approach fits?

A, a hash set of the values seen, returning the first repeat. B, treating each index i as a node that points to the index stored at position i, and finding the cycle in that linked list. C, sorting the array, then comparing neighbouring values. D, counting the values with a Counter, and returning any count above 1.

[think]

The answer is B: read the array as a linked list and find its cycle.

The set and the Counter both use linear space, and sorting modifies the input. Because every value is a valid index, following i to the value at i, starting from index 0, forms a linked list that must contain a cycle, and the cycle's entrance is the duplicate. Floyd's fast and slow pointers find it in linear time and constant space.

## 6

Why can 20 thousand integer keys take over a second to insert into a CPython set, when 20 thousand other integers take a fraction of a millisecond?

A, large integers are boxed objects, and slow to allocate. B, the set resizes on every insert once it exceeds 2 to the 16 keys. C, every multiple of 2 to the 61, minus 1, hashes to 0, so each insert probes all the earlier keys. D, integer hashes are salted, so some seeds produce collisions.

[think]

The answer is C: every multiple of the prime 2 to the 61, minus 1, hashes to 0.

CPython hashes an integer to its value modulo that prime, and does not salt integer hashes. So multiples of the prime all collide, each insert compares against every earlier key, and the loop turns quadratic. String hashes are salted per process, integer hashes are not, which is why capping input size or stringifying untrusted integer keys matters.

---
lesson: hash-map-patterns
source: a5d043167edb1f8e
fit: partial
desk:
  - "The four five-line templates, complement, count, group and seen, in Python and JavaScript"
  - "The Two Sum traces, query-then-insert against insert-then-query, and the duplicates trace"
  - "The Valid Sudoku, Longest Consecutive Sequence and Top K Frequent traces and code"
  - "The near-misses table, the variants table and the duplicate-detection approaches compared"
  - "Exercises: count pairs with a given difference, and group strings by shift pattern"
---
## Introduction

Most slow solutions have the same shape. An outer loop walks the input, and an inner loop scans everything else to answer one question about the current element. Is there an earlier element that adds up to the target with me? How many times has this value appeared? Which bucket does this word belong in? Have I seen this before?

That inner loop is a query, and a hash map answers it in expected constant time, once you have chosen the right key. For 100 thousand elements, that is the difference between 5 billion comparisons, minutes in CPython, and 100 thousand lookups, about 10 milliseconds.

Reaching for a dictionary on reflex is not what gets the senior rating. What does is the choice of key, honesty about memory, the argument for why a nested loop is still linear, and spotting the problems where the map is a trap. So: how to pick one of four moves from the statement within a minute, the invariant that makes the most common one correct, three problems where the key is the whole answer, and what a lookup really costs.

## The signal

Find the inner loop you would write, and name the question it asks. The question tells you the key.

There are four moves. "Two elements that sum to", "pair", "partner": that is complement lookup, a map from value to index, asking whether my partner is among the elements before me. "How many times", "most frequent", "anagram", "can be rearranged": frequency count, element to count. "Group", "categorise", "cluster by": group by canonical key, a map from the canonical form to the list of originals. And "contains duplicate", "unique", "already seen", "consecutive": a seen set.

The constraints confirm it. Unsorted input, values with no useful bound, and a target of linear time mean the interviewer wants a map. "Constant extra space" removes the map from consideration. And values in the range 1 to n over n slots is a different signal entirely: the array can be its own map.

The near-misses cost more rounds than the signals win. Two numbers summing to a target in a sorted array, with constant space, is two pointers; the map's memory buys nothing. The number of subarrays summing to k is a prefix sum with a map, keyed by the running sum, not by an element. The longest substring with at most k distinct characters is a sliding window with a count map that needs deletes. "Smallest key at least x" needs an ordered map, because hashing destroys order. And counting distinct users in a billion-event stream on one machine is HyperLogLog: an exact set needs tens of gigabytes, a sketch needs kilobytes at about 1 percent error.

Here is the test for the prefix-sum confusion. If the answer is a pair of elements, key by element. If the answer is a range between two indices, key by a running summary of the prefix.

## The invariant, and the order of two lines

All four templates are one family: one pass, one map, and the map summarises everything processed so far. Say this before you write the loop. At the top of iteration i, the map is an exact summary of the elements before i, and contains nothing from i onwards.

For complement lookup, that gives correctness in both directions. Anything the map returns is an earlier index, so the pair is two distinct positions. And no pair is missed, because every pair is examined from its later element, and by then the earlier one is already in the map.

The invariant is why the order of two lines matters. Query first, then insert. Try it on 3, 2 and 4, with a target of 6. At the 3, you need another 3; the map is empty; insert 3. At the 2, you need a 4; not there; insert 2. At the 4, you need a 2, and it is there. Indices 1 and 2.

Now swap the lines, so you insert before you query. What happens at the very first element?

[pause]

You insert 3, then ask for a 3, and find yourself. The function returns index 0 twice. It pairs an element with itself exactly when the target is twice that element, so it passes every sample where that does not happen and survives until the hidden tests.

Two more details. With repeated values, a later index overwrites an earlier one. That is harmless for existence, but if the problem wants the smallest indices, keep the first occurrence, and if it wants all pairs, store counts or lists. And the only design decision that really matters is the key. In complement lookup the key is the value you will ask about later: store the element, query the target minus the element. In grouping, the key must be immutable and hashable: a string, a number, a tuple in Python. In JavaScript a map key must be a primitive, because two arrays with the same contents are different keys.

## Three problems where the key is the answer

Valid Sudoku. Decide whether the filled cells of a nine by nine board break any rule: no digit twice in a row, a column, or a three by three box. Nine sets per rule is the first idea. The cleaner design is one set of tagged strings. A cell holding a 7 in row 3 produces three keys: "row 3 has a 7", "its column has a 7", and "its box has a 7". A conflict is simply a key already present. The tag is what stops "row 3 has a 7" colliding with "column 3 has a 7". In the lesson's trace the conflict is in a box, which is the case candidates forget when they check rows and columns first and plan to add boxes later. The work is at most 243 inserts. If asked what you would ship to validate millions of boards, name the array-as-map version: 27 integers used as bitmasks, no hashing at all.

Longest Consecutive Sequence. Return the length of the longest run of consecutive integers in an unsorted array, in linear time. Put everything in a set, then walk upwards from a value while the next integer is present. Walking from every value is quadratic on the input 1 to n. The fix: start a walk only at a run's head, a value whose predecessor is absent. Every value belongs to exactly one run, and every run has exactly one head, so the walks together touch each value once.

That is the argument to say out loud, because the code has a loop inside a loop, and the interviewer wants to hear why it is linear. Count the lookups. One head check per value, plus one walk lookup per value. The lesson's set has nine values in two runs, a run of seven from minus 2 up to 4, and a run of two, 9 and 10. That is exactly 18 lookups, twice the size of the set. Walking from every value instead would cost 28 lookups for the long run alone, and on 100 thousand values, 5 billion lookups, around eight minutes.

Top K Frequent Elements. Counting is the hash-map half. Selecting is where you show how you think about complexity. Sorting the distinct counts is m log m. A size-k min-heap is m log k. And because every count lies between 1 and n, an array of n plus 1 buckets indexed by count is a counting sort on frequencies, linear overall. Read the buckets from the top down until you have k values, and slice, because the last bucket may overshoot.

One measured choice of key worth carrying. For Group Anagrams, the usual claim is that a count signature beats sorting the letters, because counting is linear in the word length and sorting is not. Only half right. Grouping 100 thousand five-letter words in CPython, the sorted-string key took 16 milliseconds, and the 26-slot count tuple took 25. At fifty letters it flipped: 240 against 133. So: sorted string for short words, counts once words are long, and name the length where you would measure.

## Where the map is the wrong answer

Three listed problems are there to see whether you pattern-match on the module name. Product of Array Except Self has no membership query at all; it is a prefix pass and a suffix pass. First Missing Positive has a fine three-line set solution, but the constant-space requirement plus the range 1 to n moves you to cyclic sort: put each value at its own index, then look for the first index that does not hold its value. Say the set solution first, then say why the constraint moves you off it. And Encode and Decode Strings is canonical representation, the same skill as choosing a grouping key: prefix each string with its length, because a bare delimiter is ambiguous.

## What a lookup really costs

Each lookup costs one hash plus an expected constant number of probes, as long as the load factor stays bounded, which every real table enforces by resizing. Resizing copies every entry, but capacity grows geometrically, so the total copying over n inserts is under 2 n. Amortised constant per insert, and a one-pass map algorithm is linear expected time.

Two costs hide in "expected constant". First, the key itself. Hashing a string of length L costs L, and building the key can dominate: sorting each word's letters makes Group Anagrams cost the number of words times L log L, not just the number of words.

Second, the worst case. If an adversary makes every key collide, the loop becomes quadratic. This is not hypothetical. In CPython an integer hashes to its value modulo the prime 2 to the 61 minus 1, so every multiple of that prime hashes to zero. Building a set of 20 thousand such integers took 1.27 seconds, against a quarter of a millisecond for 20 thousand small integers: about 5 thousand times slower. Python salts string hashes per process, but not integers.

Then memory, which is the cost to say without being asked. A CPython set of a million integers measured 33.6 megabytes, and a dict mapping them to indices 41.9, against 8 megabytes for the list holding the same integers. The table is four to five times the input before you count any new objects.

One more trap from under the hood. A Python dict iterates in insertion order, guaranteed. A set does not: it iterates in slot order. Small non-negative integers often look sorted because they hash to themselves, which is how "iterate the set, it is sorted" code passes a sample and fails on negatives or strings.

## In the interview

The most predictable follow-up in this family: solve it with constant extra space.

[pause]

The pattern changes. For pair problems, sort in place and use two pointers, n log n. For a dense range 1 to n, use the array as the map, with cyclic sort or negating entries. For a duplicate in a read-only array of n plus 1 values in 1 to n, use fast and slow pointers on the implicit linked list from each index to the value stored there. The common wrong answer is "a hash map is constant per operation", which confuses time per operation with total space.

And the second: what is the worst case of your solution? Quadratic, if keys collide adversarially. Python salts strings but not integers, Java turns long buckets into trees to get logarithmic operations, and a sorted approach has a guaranteed n log n. The wrong answer is "linear, hash maps are constant".

## Recap

Four things to remember. Find the inner loop, name its question, and that names the key: complement, count, group, or seen. Query, then insert, because the map must hold only the elements before you, and the swapped order pairs an element with itself. Defend a nested loop by counting lookups: walk only from a run's head, and the total is twice the set size. And say the costs unprompted: four to five times the input in memory, and quadratic under adversarial collisions.

At your desk: the four templates, the Two Sum, Sudoku, Longest Consecutive and Top K traces, the near-misses and variants tables, and the two exercises on difference pairs and shifted strings.

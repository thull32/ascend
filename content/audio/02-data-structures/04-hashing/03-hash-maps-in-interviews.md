---
lesson: hash-maps-in-interviews
source: f99f5cab73dd466c
fit: partial
desk:
  - "The seven shapes, each with its code and state-table trace: valid anagram, two sum, group anagrams, longest consecutive sequence, subarray sum equals k, longest substring without repeats, insert-delete-getRandom"
  - "The three canonical keys for anagram grouping, with build, size and hash costs"
  - "What Counter, defaultdict, setdefault, JavaScript Map and the Java idioms do underneath, with the measured costs"
  - "The production failure table"
  - "Exercises: group anagrams, and longest consecutive sequence"
---
## Introduction

A large share of coding-interview problems are solved by a hash map, and almost none of them are about hash maps. The map is the tool. The problem is deciding what the key is.

"Group these words by anagram class" is one line once you say "key by the sorted letters." "Find the longest run of consecutive integers" is one loop once you say "put everything in a set, and only start counting from numbers whose predecessor is missing." The design of the key is the algorithm.

There are seven shapes that cover most of these problems. For each: the key decision, one small example, and the line people get wrong. Then what the library types do underneath, and the costs a senior candidate says without being asked.

## Counting, and the complement

Shape one is frequency counting. The key is the item, the value is how many times you have seen it. Valid anagram, top-k frequent, majority element and first unique character are all counters.

The senior detail is the perfect-hash special case. When keys are small dense integers, like letters of a fixed alphabet, a plain array indexed by the key beats a hash map. A 26-slot array of counters is 208 bytes, four cache lines, with no hashing and no collisions. A Python Counter with 26 keys is 848 bytes, plus 26 boxed integers, and every increment hashes a string. So say: "I'll use a 26-element count array since the alphabet is fixed; a hash map if the input is Unicode." For valid anagram, increment for the first word and decrement for the second, and stop the moment a count goes negative.

Shape two is complement lookup. This is two sum. The key is a value you have seen, the value is its index, and the question for each new element is: have I already seen target minus this?

The line that matters is the order: check first, then insert. Here is why. The array is 4 and 1, and the target is 8. Before I tell you: if you insert each element before checking, what do you return?

[pause]

Index zero twice. The 4 goes into the map, then you look for 8 minus 4, find the 4 you just inserted, and pair it with itself. Check first, and the map is empty when you look, so nothing is found, correctly. And the follow-up is always "now the array is sorted." Then two pointers give constant space, and the map is the wrong tool.

## Grouping by a canonical key

Shape three. The key is a normalised form of the item, chosen so that two items belong together exactly when their forms are equal. The value is the group.

For group anagrams, "eat", "tea" and "ate" all become "a, e, t" when you sort their letters, so they share a key. The alternative key is the 26 letter counts. The senior answer names both with the crossover: sorting costs k log k per word of length k, the counts cost k plus 26. For dictionary-length words, the sorted string is faster in Python, because the sort runs in C and the count tuple means 26 allocations. For long strings, counts win.

Other canonical keys follow the same thinking. Shifted strings, where "abc" and "bcd" belong together: key by the differences between adjacent letters, modulo 26. Points on one line through the origin: key by the reduced fraction, with a sign convention. The interviewer is watching whether you can define equality, then encode it as a key.

And watch the key type. Python lists are unhashable; use a tuple. JavaScript Map compares objects and arrays by reference, so two identical arrays are two keys; serialise them to a string. Never key by raw floats, since 0.1 plus 0.2 is not 0.3: scale to integers, or use an exact fraction.

## Seen sets and prefix sums

Shape four is the seen set. Contains duplicate is a set with an early return. The interesting one is longest consecutive sequence. The array is 100, 4, 200, 1, 3, 2, and the answer is 4, for the run 1, 2, 3, 4.

Put everything in a set. For each number, check whether its predecessor is in the set. If it is, skip it: it is not the start of a run. If it is not, count upward while the next numbers are present. So 1 has no predecessor, and you walk 2, 3, 4, and stop at 5. Then 2, 3 and 4 are all skipped. 100 and 200 each count a run of one.

That predecessor check is the whole trick. Drop it, and you count from the middle of every run, and the solution goes quadratic on sorted input while still giving the right answer, so small tests pass. Keep it, and every element is walked exactly once. Iterate the set, not the array, so duplicates do not re-walk a run. And say the constant out loud: two to three hash lookups per element, so for a few thousand elements, sorting in C beats the set loop in Python.

Shape five is the prefix-sum map: count subarrays that sum to k. A subarray's sum is the difference of two prefix sums, so for each position, count how many earlier prefixes equal the current prefix minus k. Seed the map with zero, seen once, for the empty prefix. The map must store counts, not presence, because the same prefix sum can occur at several positions, and each one ends a different subarray. Change the key for the variants: prefix sum modulo m for "divisible by m", prefix XOR for "XOR equals k", and the first index of each prefix when the question is the longest subarray instead of the count.

## Index maps, and a map plus a structure

Shape six is an index map for a sliding window. Longest substring without repeating characters: map each character to the last index you saw it at. When the new character was last seen inside the window, jump the left edge to one past it.

The guard people drop is "inside the window". Take the string "abba". At the second b, the left edge jumps past the first b, so the window is just "b". Then the final a arrives. The map still says a was last seen at index zero, which is now outside the window. Without the guard, the left edge jumps backwards to index one, and you report "bba", length 3, which contains a repeat. With the guard, you ignore the stale entry, the window is "ba", and the answer is 2.

Shape seven is a map plus another structure, for design questions that want several constant-time operations no single structure gives. Insert, delete and get-random: keep the values in a list, so a random index is constant time, and a map from each value to its position in the list. Delete is the trick. Removing from the middle of a list is linear, but the list has no required order, so swap the victim with the last element, update the moved element's position in the map, and pop. Do the update before the pop, and handle the case where the victim was already last.

The same idea builds an LRU cache, a map into a doubly linked list ordered by recency, and a time-based key-value store, a map to a sorted list of timestamps searched by binary search.

## What the library types do

Python's Counter is a dict whose missing keys read as zero without being inserted. But its subtraction operator drops non-positive counts, so "subtract and check for negatives" needs the subtract method or a manual loop.

defaultdict is the dangerous one. Its missing-key handler calls the factory and inserts the result, so a plain index read like "if d of k" is a write. In a long-running service that reads more keys than it ever fills, the map grows without bound. Membership tests and get never insert.

In JavaScript, a plain object is not a safe map for user-controlled keys. It coerces every key to a string, and it inherits keys like constructor and toString from its prototype. So a counter on a plain object, given the tag "constructor", reads a function, adds one to it, and silently produces a string. Use Map, or an object with no prototype.

And the costs to say out loud. Hashing a string key costs its length, so grouping n words of length k is n times k at least, not n. A CPython dict costs about 80 to 100 bytes per entry for small string keys, so ten million entries is roughly a gigabyte. A Rust map of 64-bit integers is 20 to 40 bytes per entry. If it does not fit, the answers are an array for dense integers, sorting and a scan, or partitioning by hash across machines.

## In the interview

The lesson's follow-up. Your solution uses linear extra memory. Can you do better?

[pause]

Name what the map buys, random access to "have I seen this?", and what could replace it: sorting, at n log n time with little extra space, if order may change; two pointers if the input is sorted; a fixed-size array if the key space is small and dense; or XOR tricks for the single-number family. The wrong answer is "no, hash maps are optimal for lookups."

And: top-k frequent elements in linear time? Count with a map, then bucket the keys by count into an array indexed by count, since a count is at most n, and read buckets from the top until you have k. A heap gives n log k; sorting gives n log n. Offering "sort the counter" as linear is the wrong answer.

## Recap

Four things to remember. Say what the key is before you say "hash map": the key encodes the equality the problem needs, and a fixed array beats a map for small dense keys. Check before you insert in complement lookups, and keep the guards: the predecessor check in longest consecutive sequence, the inside-the-window check in index maps. Store counts, not presence, when the same key can recur, as in prefix sums. And know your tools: defaultdict inserts on read, a JavaScript object inherits keys, string keys cost their length, and a dict entry costs 80 to 100 bytes.

At your desk: the seven traces with their code, the anagram key comparison, the library internals with measured costs, and the two exercises.

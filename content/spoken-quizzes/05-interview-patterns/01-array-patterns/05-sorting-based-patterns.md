---
lesson: sorting-based-patterns
source: 2bd55d1fcc7a1fff
---
## 1

You sort a million department and salary records by department, then by salary descending. Measured, a key function that builds a tuple of the department and the negated salary takes 708 milliseconds and 120 megabytes. Two stable passes with itemgetter take 262 milliseconds and 24 megabytes. Why is the two-pass version cheaper?

A, it needs fewer comparisons, since each pass compares a single integer. B, it builds no tuples or negated integers, and its key is a C function. C, itemgetter caches its results across both passes, so keys are reused. D, Timsort skips the second pass, because the first leaves one sorted run.

[think]

The answer is B: it builds no tuples or negated integers, and its key is a C function.

A key function stores one key per element for the whole sort, so a tuple key allocates a tuple and a new negated integer per record, and pays for tuple comparisons. Itemgetter returns the existing integer objects without calling Python code, and stability makes the two passes produce the combined order. Each pass still does about n log n comparisons, the second pass is a real sort, and nothing is cached across passes.

## 2

A list of a million integers sorts in 145 milliseconds when it is random, but in 22 milliseconds when it was sorted and then had 10 random pairs swapped. What explains the difference?

A, Timsort finds the long existing runs and merges them, galloping through stretches. B, the swapped list reuses cached comparison results from its earlier sort. C, the specialised integer comparison is only enabled for nearly sorted input. D, nearly sorted input keeps the list in the fastest cache, removing all misses.

[think]

The answer is A: Timsort finds the long runs and merges them.

Timsort scans for ascending or strictly descending runs, so ten swaps leave about twenty long runs. Merging them costs close to one comparison per element, and galloping skips stretches where one run keeps winning. The specialised integer comparison applies to any list of all integers, nothing is cached between sorts, and a million pointers do not fit in the fastest cache either way.

## 3

Heapq nlargest of k, over a million values, takes 5.7 milliseconds for k of 10, but 984 milliseconds for k of half a million. Sorting takes about 150 milliseconds either way. Why does the heap lose at large k?

A, heapq falls back to a full sort when k exceeds a tenth of n, adding the sort to its own cost. B, nlargest compares with greater-than, which is slower than the less-than that sorting uses. C, a heap of half a million entries no longer fits in cache, while sorting stays in cache. D, n log k approaches n log n, and the heap loop pays more per step than Timsort's C loop.

[think]

The answer is D: n log k approaches n log n, and each heap step costs more than Timsort's.

With k at half of n, log k is only one less than log n, so the heap saves almost nothing asymptotically. Each heap step involves Python-level work in nlargest plus sift operations, while Timsort runs entirely in C with specialised integer comparisons. Heapq does not switch to sorting at that size, sorting a million elements does not fit in cache either, and the comparison method is not the cost.

## 4

For Largest Number, you sort the numbers as strings with a comparator that puts a before b when a followed by b forms a larger number than b followed by a. Why is that safe?

A, it compares a divided by one less than 10 to the power of a's digit count with the same quantity for b, which is a real order. B, it orders the strings lexicographically, which is transitive by definition. C, any comparator is safe in Timsort, since it never compares a pair twice. D, it is safe only when all the numbers have the same count of digits.

[think]

The answer is A: it compares a per-element quantity, so it is a real order.

The concatenation test rearranges into a comparison of that quantity for a against the same quantity for b, so the comparator sorts by a value per element and is transitive; the same value could be used as a key. Plain lexicographic order is wrong: descending, it puts 30 before 3, which forms a smaller number. Timsort does not protect you from an inconsistent comparator, and Java's implementation throws when it detects one.

## 5

In JavaScript, a colleague sorts numbers with a comparator that returns whether a is greater than b, a boolean. What happens?

A, it throws a TypeError, because comparators must return a number. B, it can leave pairs unsorted, since false reads as 0, which means equal. C, it sorts by string value, because a boolean result selects the default order. D, it sorts correctly, because true and false coerce to 1 and 0 as expected.

[think]

The answer is B: it can leave pairs unsorted, since false reads as equal.

The comparator must return a negative number, zero or a positive number. A boolean gives 1 or 0, so whenever a is smaller than b it says the two are equal, and the sort is free to leave them in any order; on 20 random values it left the array unsorted. No error is thrown, and the default string order is not used, which is why the bug reaches production.

## 6

Group Anagrams in CPython: a key of 26 letter counts is linear in the word's length L, and a key of the sorted letters is order L log L. Yet for 5-letter words the sorted key was faster, 202 nanoseconds per word against 287. Why?

A, sorting runs in C on tiny input, while the count loop is interpreted letter by letter. B, tuples of 26 integers hash slowly, since hashing them costs 26 log 26 per key. C, five-letter words fit in a single machine word, so sorting them is constant time. D, the count key collides with other anagram groups and forces extra rehashing.

[think]

The answer is A: sorting runs in C, and the count loop is interpreted.

For short strings the log factor is tiny, and sorting and joining execute in C, while building counts executes several bytecodes per character in the interpreter. The count key wins once words are long: at 200 letters, about 3,900 nanoseconds against 10,154. Tuple hashing is linear in the tuple's length, no word sorts in constant time, and count keys do not collide across different sets of letters.

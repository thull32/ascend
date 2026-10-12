---
lesson: asymptotic-notation
source: 520ebb0a4ef5daac
---
## 1

Binary search on a sorted array of n elements is correctly described by which of these?

A, Omega of n, because any algorithm must read its input. B, Theta of log n in the worst case, and big O of n is also true. C, Theta of 1, because log n is effectively constant. D, big O of log n only: calling it big O of n would be false.

[think]

The answer is B: Theta of log n in the worst case, and big O of n is also true.

The tight worst-case bound is Theta of log n. Because big O is only an upper bound, big O of n is also a true statement, just an uninformative one; treating big O as if it meant tight confuses it with Theta. Binary search does not read the whole input, so Omega of n is false. And "effectively constant" is an engineering remark, not a complexity class.

## 2

A problem states that n is between 1 and 200 thousand. Which complexity is the intended solution most likely to have?

A, n log n, or linear. B, two to the n, with memoisation. C, n cubed, with small constants. D, n squared, with a tight inner loop.

[think]

The answer is A: n log n, or linear.

N squared at 200 thousand is 40 billion operations, minutes of work, so quadratic is ruled out however tight the inner loop. N log n is about 3.6 million, which is comfortable. Exponential and cubic are far worse. The constraint is the problem setter telling you the target class.

## 3

Binary search over a 512 megabyte sorted array measured about 18 nanoseconds per probe. Over an 8 kilobyte array, it measured under 4 nanoseconds per probe. Which explanation is right?

A, the compiler vectorises searches on small arrays, but not on large ones. B, only the bottom few probes miss the cache; the top of the search tree stays resident. C, the larger array needs more probes, so each one is slower. D, every probe on the large array is a 100 nanosecond main-memory miss, averaged with loop overhead.

[think]

The answer is B: only the bottom few probes miss the cache; the top of the search tree stays resident.

Every search visits the same midpoints at the top levels, so those cache lines stay hot from one search to the next. Only the last several probes, whose positions are spread over the whole array, miss to main memory. That is why the average per probe rises to 18 nanoseconds and not to 100. The number of probes does not change the cost of each one, and a plain binary search is a chain of dependent probes that the compiler does not vectorise at any size.

## 4

A function loops over an array of n strings, and for each one checks membership in a Python list that accumulates the results so far. What is its complexity, and what one change fixes it?

A, order n squared: switch the results to a set. B, order n log n: sort the list before looping. C, order n: the loop is already linear. D, order n squared: preallocate the list up front.

[think]

The answer is A: order n squared, and you switch the results to a set.

A membership test on a list scans it, so step k costs order k, and the total is order n squared. A set turns each membership test into expected constant time, making the whole function linear. Preallocating does not change the cost of the scan, and sorting does not help a membership test that runs inside the loop.

## 5

An interviewer asks whether you can sort n arbitrary comparable objects faster than n log n. What is the senior answer?

A, yes: a hash map groups equal keys in linear time, then reads them out in order. B, no: the comparison lower bound is Omega of n log n, unless the keys allow a non-comparison sort. C, no: sorting is Theta of n log n for every algorithm, regardless of the key type. D, yes: Timsort runs in linear time on real-world data, so the bound does not apply.

[think]

The answer is B: no, the comparison lower bound is Omega of n log n, unless the keys allow a non-comparison sort.

A comparison sort is a decision tree with n factorial leaves, so its depth, the number of comparisons on some input, is at least about n log n. Counting sort and radix sort escape the bound by inspecting digits of bounded keys. A hash map has no order, and Timsort's linear best case is for already-sorted runs, not a general guarantee.

## 6

Checking whether an integer k is prime by trial division, up to the square root of k, takes order square root of k divisions. Why is this not considered a polynomial-time algorithm?

A, the input size is the bit count b, and the square root of k is 2 to the power b over 2. B, each trial division costs order k time, not constant time. C, its worst case tries every divisor up to k, not up to the square root of k. D, it is polynomial, since the square root of k is just k to the power one half.

[think]

The answer is A: the input size is the bit count b, and the square root of k is 2 to the power b over 2.

Complexity is measured against the size of the input, and a number's size is its count of digits or bits. A 64-bit number takes up to 2 to the 32 divisions, and doubling the bit count squares the work. So the square root of k is exponential in the input size, even though it looks like a small power of k. Calling it polynomial measures against the value k instead of its size.

---
lesson: comparison-sorts
source: 3f8d2658ce0b7111
---
## 1

You sort a million records by department, then by salary, and you expect records with equal salary to stay grouped by department. Which sort makes that work without a composite key?

A, an in-place sort, such as heap sort or introsort. B, any comparison sort that runs in n log n time. C, a stable sort, such as merge sort or Timsort. D, quicksort with a random pivot, to avoid bias.

[think]

The answer is C: a stable sort, such as merge sort or Timsort.

Only a stable sort preserves the department order among equal salaries. Running time says nothing about stability, and a random pivot does not help. In-place is a different property: quicksort and heap sort both work in place, yet move equal elements past each other, so the earlier ordering is destroyed.

## 2

A quicksort that uses the first element as its pivot is run on an array of n elements that is already sorted. What happens?

A, linear time, because no element ever needs to move. B, n log n time, as the recursion depth stays log n. C, n squared time, since each partition peels off one element. D, it never terminates, since the left side stays empty.

[think]

The answer is C: n squared time, since each partition peels off one element.

The first element is the minimum, so the partition puts nothing on the left and n minus 1 elements on the right. The recursion goes n deep, and the total work is n, plus n minus 1, and so on down, which is order n squared. It does terminate, because the right side still shrinks by one each call. Random or median-of-three pivots avoid this.

## 3

Heap sort has an n log n worst case and constant extra space, yet library sorts are built on quicksort or merge sort. What is the main reason?

A, building the initial heap costs n log n. B, duplicate keys degrade it to quadratic time. C, sift-down's scattered memory accesses miss the cache. D, its instability rules it out for library use.

[think]

The answer is C: sift-down's scattered accesses miss the cache.

Heap sort jumps from index i to 2i plus 1 to 4i plus 3, which defeats the cache and the prefetcher, while partition and merge scan memory in order, so heap sort's constant factor is much larger. Instability is true, but quicksort is unstable too. Building the heap is linear, and duplicates do not hurt heap sort's bound.

## 4

Lomuto partition is run on an array where every element equals the pivot. What split does it produce?

A, a three-way split, with all n elements in the equal region. B, a balanced split, with about half the elements on each side. C, undefined, since Lomuto requires distinct keys. D, a lopsided split, with n minus 1 elements on one side and none on the other.

[think]

The answer is D: lopsided, with n minus 1 on one side and none on the other.

Every element passes the test of being less than or equal to the pivot, so the scan index advances to the end and the pivot lands at the last position. The balanced split is what Hoare partition gives, since it swaps equal elements across the middle. The three-region split is what a separate three-way partition gives, handling this case in linear time.

## 5

Which statement about merge sort's memory is correct?

A, it needs n log n space, one buffer per level. B, it sorts in place, with constant extra space. C, it needs only log n space, for the stack. D, it needs linear auxiliary space for merging.

[think]

The answer is D: it needs linear auxiliary space for merging.

A straightforward merge needs an output area, and a single reusable buffer of size n, or half of n with care, is enough, so it is linear, not one buffer per level. In-place merging exists, but it pays an extra log factor in moves. The log n recursion stack comes on top of that buffer, not instead of it.

## 6

A quicksort recurses on the smaller partition and loops on the larger one, instead of recursing on both. What does this change?

A, the worst-case time drops from n squared to n log n. B, the stack depth is capped at about log n on any input. C, equal keys stop causing lopsided partitions. D, the partition step no longer needs a pivot choice.

[think]

The answer is B: the stack depth is capped at about log n on any input.

The recursive call is always on a side of at most half the elements, so nested calls cannot go deeper than log base 2 of n, even with the worst pivots. The time bound is unchanged: a bad pivot still costs n squared, which is what introsort's depth limit fixes. The pivot rule is untouched, and equal keys are a partition-scheme problem, solved by three-way partitioning.

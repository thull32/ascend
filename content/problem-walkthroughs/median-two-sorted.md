---
problem: median-two-sorted
args: [[1, 3], [2]]
frames: 27
source: 63abee25aaa7cbbb
---
@0-1
Two sorted arrays: one, three, and the single value two. Their median is two, and we want it in logarithmic time, without merging. The insight: forget the merged order and think about a cut. The median splits all the values into a left half and a right half. Any such split takes the first i values of one array and the first j of the other, and it is the right split exactly when nothing on the left is bigger than anything on the right. Because each array is sorted, that is just two comparisons across the cut, and the right i can be binary searched. We search over the shorter array, so j always stays in range. Here that means a is the array holding two, and b is one, three.

@2-6
Three values in total, so the left half holds two of them: half is two, the extra one going left for an odd total. Infinity serves as a sentinel for a cut at either end of an array. We search i from zero to one, the length of a.

@7-13
The middle of zero and one is zero. Take nothing from a, so take both values from b. Now the four values around the cut. A has nothing on its left, so its left neighbour is minus infinity; its right is two. B's left is three, and its right is past the end: infinity.

@14-16
Is the cut valid? A's left, minus infinity, is no bigger than b's right. But b's left, three, is bigger than a's right, two. Three is on the left and two is on the right, which is the wrong way round. We took too few from a, so the search moves right: low becomes one.

@17-23
Now i is one, so we take a's only value, two, and j is one, so we take b's first value, one. Around the cut: a's left is two, a's right is past the end, infinity. B's left is one, b's right is three. Two is at most three, and one is at most infinity. Both comparisons hold, so this is the cut: one and two on the left, three on the right.

@24-26
The total is odd, so the median is the largest value on the left: the larger of two and one. We return two, as a float.

For an even total, the median would be the average of the largest on the left and the smallest on the right. The search runs over the shorter array, so the time is the log of the shorter length, and the space is constant. The classic mistakes: searching the longer array, which lets j go negative or run past the end; using total over two instead of total plus one over two for half, so an odd total takes the median from the wrong side; integer division in the even case; and writing separate branches for cuts at the ends instead of using the infinity sentinels.

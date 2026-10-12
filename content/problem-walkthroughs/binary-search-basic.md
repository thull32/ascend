---
problem: binary-search-basic
args: [[-1, 0, 3, 5, 9, 12], 2]
frames: 19
source: de428100056f2915
---
@0-1
We are searching six sorted numbers, minus 1, 0, 3, 5, 9 and 12, for a 2 that is not there. The absent case is the one that shows whether a binary search is right. Hold onto one sentence, because it is the whole algorithm: if the target is in the array, it is somewhere between lo and hi, inclusive. Right now lo is 0 and hi is 5, the whole array.

@2-6
The middle is lo plus half the distance to hi, which is position 2, holding 3. Writing it as lo plus half the gap, rather than lo plus hi over two, avoids overflow in languages with fixed-size integers. Three is not 2, and it is bigger than 2. Because the array is sorted, everything from position 2 rightwards is bigger too, so hi moves to one before the middle: position 1. Position 2 has been checked, so it leaves the range.

@7-11
The range is now positions 0 to 1. The middle is position 0, holding minus 1. That is smaller than 2, so everything at or left of it is too small, and lo moves to one past the middle: position 1.

@12-16
Now lo and hi are both 1: one candidate left. The middle is position 1, holding 0. Still smaller than 2, so lo moves to 2. Now lo is 2 and hi is 1. The range is empty, and the loop condition fails.

@17-18
We return minus 1. The 2 would sit between 0 and 3, and the search has narrowed to exactly that gap: lo stopped at 2, which is where 2 would be inserted. That is the follow-up answer, so remember it. Three comparisons for six elements; each one halves what is left, so the cost is logarithmic, and the space is constant.

The classic bugs live in the shrink steps. Setting lo to mid instead of mid plus 1 can loop forever when lo and hi meet. And mixing styles, an inclusive hi with a loop that stops when lo equals hi, skips the last candidate. Pick the inclusive version, keep the invariant, and test the first index, the last index, an absent target and an empty array.

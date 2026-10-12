---
problem: search-rotated
args: [[6, 7, 8, 1, 2, 3, 4, 5], 8]
frames: 18
source: 151e6438239d6545
---
@0
We are looking for 8 in 6, 7, 8, 1, 2, 3, 4, 5: a sorted list that was rotated, so it has a seam between 8 and 1. Plain binary search breaks, because "the target is bigger than the middle" no longer means "go right": the seam might be in the way. But here is the saving property. Cut anywhere, and at least one of the two halves is a plain sorted run, because the seam can only be on one side. One comparison tells you which. A sorted half has a known range, so you can ask whether the target is in it. If yes, go there. If no, go to the other half. Either way, half is gone.

@1-3
lo is zero and hi is seven. The middle is position 3, which holds 1. Not the target.

@4-6
Is the left half sorted? That means: is the value at lo, 6, at most the middle value, 1? No, so the seam is on the left, and the right half, 1 up to 5, is the sorted one. Is 8 above 1 and at most 5? No. So 8 cannot be on the right, and hi moves to 2. Notice that a plain binary search would have seen 8 bigger than 1 and gone right, and missed it.

@7-12
Now lo is zero and hi is 2. The middle is position 1, holding 7. Is the left half sorted? 6 is at most 7, yes. Is 8 at least 6 and below 7? No, so it is not in the left half, and lo moves past the middle, to 2.

@13-17
lo and hi are both 2. The middle is position 2, which holds 8. Found it: we return 2.

Time is logarithmic and space is constant, the same as plain binary search, because each step still discards half. Interviewers grade the bounds. The left half check must use at most, not strictly less than: when lo equals mid, a one element half is sorted, and with strictly less than, a two element list like 3, 1 searching for 1 takes the wrong branch and returns minus one. And the range checks must exclude mid itself, since the equality test has already ruled it out. With duplicates, the sorted half test can no longer tell the halves apart, and the worst case degrades to linear.

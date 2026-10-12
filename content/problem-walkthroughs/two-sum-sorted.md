---
problem: two-sum-sorted
args: [[1, 3, 4, 6, 10], 10]
frames: 21
source: 1e8c38a8126b1e3f
---
@0
In the sorted list 1, 3, 4, 6, 10, which two numbers add up to 10? The answer is 4 and 6, at positions 2 and 3. A hash map would work, but it costs extra space, and the sorting lets us do better. The insight is elimination. Put one pointer at each end. If their sum is too big, the right number cannot be in any answer: its smallest possible partner, the left number, was already too much. So it is out, for good. If the sum is too small, the left number is out for the same reason. Every step throws away one number permanently.

@1-5
lo is at position zero, holding 1, and hi at position 4, holding 10. The sum is 11, too big. 10 paired with the smallest number left is already over, so 10 can never be part of the answer. hi moves left.

@6-10
1 plus 6 is 7, too small. 1 paired with the largest number left falls short, so 1 is eliminated, and lo moves right.

@11-15
3 plus 6 is 9, still too small. 3 is out, and lo moves right again.

@16-20
4 plus 6 is 10. We return positions 2 and 3.

Four checks for five numbers: each step removes one candidate, so the walk is at most n minus 1 steps. Linear time, constant space. Why can a pointer never step over its half of the answer? While hi sits on the right half of the answer, every pair it forms with an earlier left number sums to at most the target, so only lo moves, toward its partner. The same holds the other way round. That is the sentence to have ready when the interviewer asks why it cannot skip the answer. The mistakes are looping while lo is at most hi, which lets a number pair with itself, moving both pointers on a mismatch, and returning one based positions out of habit. When the follow up asks for all pairs, record each match, skip past duplicates on both sides, and carry on: that is the inner loop of three sum.

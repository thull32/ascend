---
problem: plus-one
args: [[1, 2, 9, 9]]
frames: 12
source: e0ee23a3d4b50583
---
@0
The digits are 1, 2, 9, 9: the number 1,299. Add one. You could turn the digits into an integer and back, but with a hundred digits that overflows in most languages, and it skips the one idea the problem tests. Adding one only ever changes a run of trailing nines and the digit just before them. So walk from the right: a nine rolls over to zero and passes the carry left; anything less than nine absorbs the carry, and you stop.

@1-2
We work on a copy, so the caller's list is left alone. Start at the last digit, a 9.

@3-4
It is not less than 9, so it rolls over to 0, and the carry moves one place left. The digits read 1, 2, 9, 0.

@5-7
The next digit is also a 9: it becomes 0 too. Now 1, 2, 0, 0.

@8-9
The next digit is 2, which is less than 9. It absorbs the carry and becomes 3.

@10-11
We return at once: 1, 3, 0, 0, which is 1,300. The leading 1 was never touched. The work is one step per trailing nine plus one, so on most inputs it is effectively constant, and linear only in the worst case. That worst case is all nines, where the carry falls off the front: then the answer is a 1 followed by as many zeros as there were digits, built once at the end. Forgetting it makes the single digit 9 come back as 0, and inserting at the front inside the loop costs a linear shift every time.

---
problem: find-duplicate-number
args: [[1, 3, 4, 2, 2]]
frames: 31
source: 8a1e79b2f9e0aac2
---
@0-1
The array is 1, 3, 4, 2, 2. We may not modify it, may not use extra space, and must beat quadratic time, which rules out sorting, a hash set and comparing pairs. The trick is to read the array as arrows. Every value is between 1 and 4, so every value is also a valid index. Index zero points to 1, index 1 points to 3, 3 points to 2, 2 points to 4, and 4 points back to 2. Walking from zero gives zero, 1, 3, 2, 4, 2, 4, and so on: a tail that runs into a loop. The loop's entrance has two arrows coming into it, which means two indices hold that value. The entrance is the duplicate. So this is finding where a linked list's cycle begins, with the array as the next pointers. Both pointers start at index zero.

@2-5
Phase one is the tortoise and the hare. Slow takes one step, to 1. Fast takes two, to 3.

@6-9
Slow moves to 3. Fast goes from 3 to 2 and on to 4.

@10-13
Slow moves to 2. Fast goes from 4 to 2 and back to 4. Fast is now circling the loop of 2 and 4.

@14-18
Slow moves to 4, and fast, two steps around the loop, lands on 4 again. They meet at 4. The meeting point is somewhere in the loop, not necessarily its entrance. Note the loop body moves both pointers before it compares them, since at the start they were equal at zero.

@19-22
Phase two finds the entrance. A new pointer, finder, starts at index zero, and both move one step at a time. The distance from the start to the entrance equals the distance from the meeting point onward to the entrance, plus whole laps. Finder moves to 1, slow moves to 2.

@23-28
Finder moves to 3, slow to 4. Then finder moves to 2, and slow comes round to 2. They meet at 2.

@29-30
We return 2: the loop entrance, and the duplicate. Both phases take at most a linear number of steps, the extra space is two or three integers, and the array is never touched.

The mistakes: starting the pointers at the first value instead of at index zero, which can drop you inside the loop and break phase two; and comparing before the first move, when both pointers sit at zero and look as if they have already met. And be ready to explain why the entrance is the duplicate: it is the only place with two arrows coming in. If the interviewer wants n log n without the trick, binary search on the value range, counting how many elements are at most the middle value.

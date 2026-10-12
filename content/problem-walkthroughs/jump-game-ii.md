---
problem: jump-game-ii
args: [[1, 3, 1, 1, 2, 1]]
frames: 30
source: d591a101c368f102
---
@0-3
Six positions, holding one, three, one, one, two, one. Each value is the longest jump you can make from there. What is the fewest jumps from the first position to the last? Think of it as breadth first search. Level zero is just position zero. Level one is everything reachable in one jump, level two everything newly reachable in two, and the answer is the level that contains the end. The structural fact that makes this linear: every level is a contiguous window of positions. So we need no queue, just two numbers. Window end is the last position reachable with the current number of jumps. Furthest is the furthest position reachable with one more. All three counters start at zero.

@4-5
Position zero holds one, so it reaches position one. Furthest is one.

@6-9
And position zero is the end of the current window, level zero. We have looked at everything at this level, so we commit to one more jump. Jumps is one, and the window now ends at furthest, position one. That is not the last position yet, so we carry on.

@10-11
Position one holds three, so it reaches one plus three, position four. Furthest is four.

@12-15
Position one is the end of level one. Commit: jumps is two, and the window now runs up to position four. Notice we never decided which position to jump from. The window says "somewhere in here", and that is all breadth first search needs.

@16-20
Positions two and three each hold one. They reach three and four, which is no better than four. Neither is the end of the window, so nothing happens.

@21-23
Position four holds two, so it reaches six, past the end of the array. Furthest is six. And position four is the end of the window, the last position of level two.

@24-27
So we commit to a third jump, and the window jumps to six. Six is at least the last position, five, so we break out early.

@28-29
We return three. One path is zero to one, one to four, and four to the end.

One pass, so time is linear, and space is three integers. This greedy is correct because it is exactly breadth first search, with each level stored as an interval. The classic mistakes: jumping to the position with the biggest value instead of the biggest reach, which is position plus value; adding a jump whenever furthest grows, instead of when the window runs out; and processing the last position too, which can count one jump too many.

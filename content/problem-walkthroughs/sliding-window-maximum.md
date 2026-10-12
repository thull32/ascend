---
problem: sliding-window-maximum
args: [[5, 3, 1, 4, 2], 3]
frames: 38
source: 88d83a33c6f73584
---
@0
A window of three slides over 5, 3, 1, 4, 2, and we want each window's maximum: 5, then 4, then 4. The insight is about who can never win again. If a newer element is at least as big as an older one, the older one is finished: every future window that holds it also holds the newer, bigger one. So we keep a deque of surviving candidates, as positions, not values. Each newcomer evicts the smaller ones from the back, which keeps the values decreasing from front to back. The front is always the current maximum.

@1-7
Position zero, value 5. The deque is empty, so 5 just joins it. The window is not full yet, so nothing is output.

@8-12
Position one, value 3. The back of the deque holds 5, which is bigger, so nothing is evicted. 3 joins behind it: it could still become a maximum once 5 slides out.

@13-18
Position two, value 1. It is smaller than 3, so it joins too. The deque holds positions zero, one and two, values 5, 3, 1, decreasing. The window is now full, so we output the front's value: 5.

@19-23
Position three, value 4. Now evictions. The back holds 1, which is no bigger than 4, so it goes: it can never be a maximum while 4 is around. Then 3 goes for the same reason. The back is now 5, which is bigger than 4, so the eviction stops.

@24-27
4 joins at position three. Now the other kind of removal. The front is position zero, and the window now covers positions one to three, so position zero has slid out. Its index tells us, which is why the deque stores positions rather than values. We pop it from the front.

@28-29
The front is now position three, value 4, so we output 4.

@30-35
Position four, value 2. It is smaller than 4, so it joins behind it, and the front, position three, is still inside the window. We output 4 again.

@36-37
The answer is 5, 4, 4.

Each position is pushed once and popped at most once, from one end or the other, so the inner loop is linear in total, and the whole thing runs in linear time with a deque no larger than the window. A heap with lazy deletion also works, but costs a log factor. The mistakes are storing values instead of positions, so you cannot tell when the front has expired; outputting before the first window is full; and using a plain Python list, where popping from the front is linear and quietly brings back the slow version.

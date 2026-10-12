---
problem: max-consecutive-ones-iii
args: [[0, 1, 0, 1, 1, 0, 1], 2]
frames: 41
source: 8d1d3a9c44316042
---
@0-3
The array zero, one, zero, one, one, zero, one, and you may flip at most two zeros into ones. What is the longest run of ones you can make? Reframe it, because the reframing is the solution. A run after at most two flips is just a window of the original array that contains at most two zeros. We never flip anything. We slide a window, count the zeros inside it, and shrink from the left whenever there are too many. Left edge, zero count and best all start at zero.

@4-8
Position zero is a zero. The count becomes one, which is within two, so the window, just that zero, is valid. Best is one.

@9-12
A one. No change to the count. The window is two long. Best is two.

@13-17
Another zero: the count is two, still allowed. Window zero, one, zero, three long. Best is three.

@18-25
Two ones. The window grows to five, still with two zeros. Best is five.

@26-28
Position five is a zero, and the count becomes three. That is one more than we can flip, so the window is invalid.

@29-33
Shrink from the left until it is valid again. The element at the left edge is a zero, so dropping it brings the count back to two, and left moves to one. One step was enough here. If the left edge had held a one, we would have kept going, because dropping a one does not help. The window is now positions one to five, five long.

@34-38
The last element is a one. The window runs from one to six, six long, with two zeros. Best is six.

@39-40
We return six: flip the two zeros at positions two and five, and positions one to six are all ones.

Each edge only moves forward, at most n times, so the time is linear, and the state is three integers. The while loop means the window is always valid at the moment we measure it, which makes the code easy to reason about. The common mistakes: actually flipping values in the array, which is very hard to undo as the window moves; counting ones instead of zeros and getting the condition backwards; and an off by one in the window length, which is right minus left plus one. With k equal to zero it reduces to the longest existing run of ones, and the same code handles it.

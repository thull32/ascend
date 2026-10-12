---
problem: find-min-rotated
args: [[4, 5, 6, 7, 0, 1, 2]]
frames: 16
source: 4c6ba13e9941e6f5
---
@0-1
A sorted array, rotated: 4, 5, 6, 7, then 0, 1, 2. It is two ascending runs, and the minimum is where the second run starts. Every value in the first run is bigger than every value in the second. So one comparison against a fixed end tells you which run the middle is in. Compare the middle with the value at hi. If the middle is bigger, it is in the first run and the minimum lies strictly to its right. Otherwise the middle is in the second run, and the minimum is at the middle or to its left. Lo starts at zero and hi at 6.

@2-5
The middle is position 3, holding 7. The value at hi is 2. Seven is bigger than 2, so the middle is in the first run: the drop is somewhere to its right. Lo jumps to 4, past the middle, because the middle cannot be the minimum.

@6-9
Now positions 4 to 6. The middle is position 5, holding 1. That is not bigger than the 2 at hi, so we are in the second run, and the minimum is at position 5 or before it. Hi moves to the middle itself, not one before it. The middle might be the answer, so it stays in the window.

@10-13
Positions 4 to 5. The middle is position 4, holding 0, which is not bigger than the 1 at hi. Hi moves to 4. Now lo and hi are both 4, and the loop stops.

@14-15
We return the value at position 4: zero. Each comparison halves the window, so this is logarithmic time and constant space.

Why compare with hi and not lo? If the window happens not to be rotated, say 11, 13, 15, 17, the middle is bigger than the value at lo, which looks like the first run, but the minimum is at the front. Comparing with hi gets both cases right. The other traps: moving hi to one before the middle, which throws away the minimum when the middle is it, for example on 2, 1; and looping while lo is at most hi with hi set to the middle, which never ends once they meet.

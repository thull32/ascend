---
problem: min-stack
args: [["push", -2], ["push", 0], ["push", -3], ["get_min"], ["pop"], ["top"], ["get_min"]]
frames: 24
source: 6b78d51aa2df8493
---
@0
We push minus 2, 0 and minus 3, ask for the minimum, pop, read the top, and ask for the minimum again. Every operation must take constant time, including get min. The insight: when you push a value, the minimum of the stack becomes the smaller of that value and the old minimum, and it stays that way for as long as the value is on the stack. So record the minimum at push time, right next to the value, and popping restores the old one for free.

@1-2
The constructor makes two stacks that move in lockstep: vals holds the elements, and mins holds, at each height, the minimum of everything at or below it.

@3-6
Push minus 2. It goes onto vals. The mins stack is empty, so the minimum so far is minus 2 itself, and that goes onto mins.

@7-10
Push 0. The new minimum is the smaller of 0 and the minimum on top of mins, minus 2. So mins gets minus 2 again. Values are minus 2 and 0; minimums are minus 2 and minus 2.

@11-14
Push minus 3. The smaller of minus 3 and minus 2 is minus 3, so mins gets minus 3.

@15-16
Get min just reads the top of mins: minus 3. No scan, no search.

@17-19
Pop removes the top of both stacks together. Minus 3 leaves vals, and its recorded minimum leaves mins with it. That is the whole trick: the minimum that was in force before minus 3 arrived is now on top again, without being recomputed.

@20-21
Top reads the last value: 0.

@22-23
And get min reads minus 2, the minimum restored by that pop. Every operation is constant time, at the cost of a second stack. The common mistake is a single minimum variable, which works until the minimum is popped, and then you have to rescan the whole stack to find the next one.

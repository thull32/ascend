---
problem: rotting-oranges
args: [[[2, 1, 1, 1, 2]]]
frames: 87
source: e6e7523e3a45a701
---
@0
One row of five cells: a rotten orange at each end and three fresh ones between them. Rot spreads from both ends at once, so they should meet in the middle after two minutes. The insight: the minute an orange rots is its distance to the nearest rotten orange, and breadth first search finds distances in order. Because there are several sources, we put all of them in the queue at distance zero. Each level of the search is then one minute's wave.

@1-23
First, one scan of the grid. Every rotten orange goes into the queue, and every fresh one is counted. The queue ends up holding positions zero and four, the two ends, and the fresh count is three.

@24-27
Minutes start at zero. The loop runs while the queue has oranges and fresh ones remain. The queue holds two, so this minute's wave is exactly those two. We pop the left end, position zero.

@28-36
We try its four neighbours. Up and down fall outside a one row grid. To the right, position one is fresh, so it rots now. We set it to rotten immediately, before it is ever popped, so no other orange can claim it twice. The fresh count drops to two, and position one joins the queue for the next wave. Left of position zero is outside the grid.

@37-53
Next, the right end, position four. Its only fresh neighbour is position three, to its left. It rots, the fresh count drops to one, and it joins the queue.

@54-56
The first wave is done: both ends have spread. That is one minute. The queue holds positions one and three, and one fresh orange remains.

@57-70
Second wave. Pop position one. Its right neighbour, position two in the middle, is fresh, so it rots. The fresh count drops to zero, and the middle joins the queue.

@71-83
Pop position three. Its neighbours are both rotten already, so it adds nothing: the middle was claimed by the left side a moment ago. The wave ends, and minutes become two.

@84-86
Look at the loop condition now. The queue still holds the middle orange, but the fresh count is zero, so the loop stops. Without that check, the search would run one more wave that rots nothing, and count a phantom third minute. Fresh is zero, so we return two.

Every cell enters the queue at most once, so time and space are proportional to the grid. The mistakes are running a separate search from each rotten orange, which ignores that they all spread at the same time; marking oranges when they are popped instead of when they are pushed, which lets two neighbours claim the same orange; and the off by one on the final wave. If a fresh orange can never be reached, the fresh count stays above zero, and the answer is minus one.

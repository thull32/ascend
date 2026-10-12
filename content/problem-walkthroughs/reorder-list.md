---
problem: reorder-list
args: [{"$list": [1, 2, 3, 4, 5]}]
frames: 38
source: 800734160c769321
---
@0
The list is 1 to 5, and we want it reordered as first, last, second, second-to-last, and so on: 1, 5, 2, 4, 3. In place, with no array. The awkward part is walking the back half backwards, and that is a solved problem: reverse it. Then the answer is just the two halves interleaved. So the whole problem is three routines you already know: find the middle, reverse, merge alternately.

@1-8
More than one node, so we find the middle. Slow moves one step, fast moves two, and the loop runs while fast has two nodes ahead of it. Slow goes to 2 and fast to 3, then slow to 3 and fast to 5. Fast has nothing after it, so we stop. Slow is on 3, the last node of the first half. For an odd length the middle stays in the first half, which is what puts it last in the output.

@9-11
The second half starts after slow: 4, 5. Then cut the link from 3. This cut matters: without it, the first half would still run into the second, and the interleave would build a cycle. The first half now reads 1, 2, 3.

@12-23
Reverse the second half with the usual three pointers: remember the next node, point the current node back, step forward. 4 points to nothing, then 5 points to 4. The second half reads 5, 4.

@24-28
Interleave. First is on 1, second on 5. Save both next pointers: 2 and 4. Link 1 to 5, then 5 to 2.

@29-30
The list reads 1, 5, 2, 3. Both pointers step to the saved nodes: first to 2, second to 4.

@31-34
Save 3 and nothing. Link 2 to 4, and 4 to 3. The list is now 1, 5, 2, 4, 3.

@35-37
The second half is used up, so we stop, and we return the head. The first half is never shorter than the second, so stopping when the second runs out leaves nothing behind. Three linear passes, constant space. The classic mistakes are forgetting the cut after the middle, and using the other middle-finding loop, which for even lengths puts an extra node in the second half and leaves it dangling.

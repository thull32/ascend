---
problem: kth-smallest-sorted-matrix
args: [[[2, 6, 8], [3, 7, 10], [5, 8, 11]], 5]
frames: 30
source: d91cc67626e4b44f
---
@0-5
A three by three matrix whose rows and columns are both sorted. Row zero is two, six, eight. Row one is three, seven, ten. Row two is five, eight, eleven. We want the fifth smallest value. The insight: each row is a sorted list, so the matrix is three sorted lists, and the fifth smallest is the fifth value a merge of those lists would produce. We do not have to finish the merge. Seed a min heap with the head of each row, pop the smallest, and replace it with the next value from the same row. Each heap entry is a value with its row and column. The heap starts with two from row zero, three from row one, and five from row two.

@6-11
Pop one: the smallest head is two, from row zero, column zero. That is the first smallest. Row zero has more values, so its next one, six, joins the heap. The heap is three, five and six.

@12-15
Pop two: three, from row one. Its successor in that row is seven, which joins the heap.

@16-19
Pop three: five, from row two. Its successor is eight. The heap now holds six, seven and eight: still exactly one candidate per row. That is the invariant. The heap never holds more than one value from each row, and that value is the smallest one in its row not yet popped.

@20-23
Pop four: six, from row zero, column one. Row zero's last value, eight, joins. Now there are two eights in the heap, one from row zero and one from row two. Duplicates are fine; they are separate cells.

@24-27
Pop five: seven, from row one. We push its successor, ten, though we will not need it. That was the fifth pop, so the loop ends.

@28-29
We return the value from the fifth pop: seven. Listed in order, the matrix reads two, three, five, six, seven, and seven is fifth.

Each pop and push costs log of the number of rows, so the time is k log n, and the space is one heap entry per row. For small k, most of the matrix is never touched. The alternative that ignores k is a binary search on the value, counting cells at most a guess by walking from the bottom left corner. The classic mistakes: seeding the heap with the first column as well as the first row, which double counts; and returning the heap's root after the loop instead of the value from the k-th pop, which is an off by one.

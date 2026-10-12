---
problem: k-closest-points
args: [[[0, 5], [4, 0], [1, 1], [-1, -1], [10, 10]], 3]
frames: 24
source: cd31ce48a62317a2
---
@0-1
Five points, and we want the three closest to the origin. Sorting all of them works, but it sorts points you are about to throw away. The insight: keep a candidate set of size k, and for each new point ask one question. Does it beat the worst candidate? The worst candidate is the farthest one, so keep the candidates in a max heap and you can always see it. Python's heap is a min heap, so we store each distance negated: the farthest point then has the smallest key and sits at the top. And we use the squared distance, x squared plus y squared, because the square root never changes the order.

@2-3
The first point is zero, five. Its squared distance is twenty five, stored as minus twenty five. The heap holds one candidate, which is not more than three.

@4-9
Four, zero has squared distance sixteen. One, one has two. Both go in. The heap now holds three candidates, exactly k, and minus twenty five, the farthest point, sits at the top.

@10-12
Minus one, minus one also has squared distance two. We push it, and now the heap has four candidates, one too many.

@13-14
So we pop the top, which is the farthest candidate: zero, five, at twenty five. That is the whole algorithm. A point stays only while it is among the k closest seen so far. The heap now holds four, zero at sixteen, and the two points at distance two.

@15-16
The last point is ten, ten, with squared distance two hundred. We push it, and because it is the farthest of all, it goes straight to the top. The heap has four entries again.

@17-18
We pop the top: ten, ten, gone the moment it arrived. Back to three candidates.

@19-23
We return the three survivors as coordinate pairs: four, zero; minus one, minus one; and one, one.

Each point costs one push and at most one pop on a heap that never holds more than k plus one, so time is n log k and space is k. That bounded memory is why the heap wins when the points arrive as a stream. For one batch in memory, quickselect is linear on average but quadratic in the worst case. The classic mistake is a min heap of all n points, popped k times: it works, but it keeps every point in memory and misses the point of the exercise. Pushing the coordinates as separate numbers, not a list, keeps ties comparable.

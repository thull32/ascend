---
lesson: sweep-line-and-geometry
source: 0fa47340807e036a
---
## 1

Half-open meetings from 0 to 10, from 10 to 20, and from 5 to 15 are swept with plus-one and minus-one events. Which tie rule gives the correct answer of 2 rooms, and why?

A, any order works, because the peak is taken over all events and ties cancel out. B, ends before starts at equal times, so a meeting finishing at 10 frees its room before the next begins. C, starts before ends at equal times, so a meeting beginning at 10 is counted while its predecessor is still active. D, sort by duration first, because longer meetings should claim rooms first.

[think]

The answer is B: ends before starts at equal times.

With half-open intervals, a meeting ending at 10 does not overlap one starting at 10, so the minus one must be applied first; sorting by time, then by the change, with ends as minus one, does that. Starts first reports 3 rooms for this input. The order of ties does change the peak, and duration has nothing to do with concurrency.

## 2

In the skyline sweep, a building from x 2 to 9, of height 10, is covered by a building from 5 to 12, of height 12, when it ends at x equals 9. When is it removed from the heap?

A, at x equals 7, when the taller building, of height 15, is popped and the heap is rebuilt. B, at x equals 12, when it surfaces as the heap top, and the pop loop finds its right edge has passed. C, at x equals 9, when its end event deletes it from the heap by key. D, never; it stays in the heap, ignored because it is below the top.

[think]

The answer is B: at x equals 12, when it surfaces as the top and its right edge has passed.

The heap supports no deletion by key, so an expired building stays until it reaches the top. At x equals 12 the pop loop removes the height-12 building, then finds the height-10 one on top, with its right edge at 9, already passed, and removes it too. Each building is pushed once and popped once, so lazy deletion costs nothing asymptotically.

## 3

Why is the integer cross product preferred over atan2, or slopes, to decide whether three points make a left turn?

A, it returns the turning angle directly, which atan2 only approximates. B, it works for any coordinate magnitude in every language, without overflow. C, it is exact for integer coordinates, so collinear triples are detected without any tolerance. D, it is faster because it avoids division, though it needs an epsilon for the zero case.

[think]

The answer is C: it is exact for integer coordinates, so collinear triples need no tolerance.

The cross product uses only subtraction and multiplication, so on integers its sign is exactly right, and zero means exactly collinear. It does not give an angle, and it can overflow: eight times the largest coordinate squared must fit the integer type, or 2 to the 53 in JavaScript. No epsilon is needed precisely because it is exact.

## 4

Monotone chain pops the stack while the cross product of the top two stack points and the new point is at most zero. What changes if the test becomes strictly less than zero?

A, the hull is built clockwise instead of counter-clockwise. B, collinear boundary points are kept, and duplicate points can appear on the hull twice. C, interior points can survive, because straight lines are no longer removed. D, the algorithm becomes quadratic, because fewer points are popped per step.

[think]

The answer is B: collinear boundary points are kept, and duplicates can appear twice.

A zero cross product means the middle point lies on the segment between its neighbours. With "at most zero" it is removed; with "less than zero" it stays, which is the convention some problems require, and a repeated point also gives zero, and survives unless you deduplicate first. The orientation of the output and the linear stack bound are unchanged.

## 5

In the closest-pair sweep, why does the y-range query on the active set return at most a constant number of points?

A, eviction by x keeps the active set small, so any query over it is constant time. B, the candidates lie in a d by 2 d rectangle, whose eight squares of side d over 2 each hold at most one point when all points are at least d apart. C, points closer than d have already been paired, so the query only returns unpaired points. D, the active set is sorted by y, so a binary search finds the neighbours in log time.

[think]

The answer is B: the candidates lie in a d by 2 d rectangle, whose eight half-d squares hold one point each.

Every pair of active points is at least d apart, and the query rectangle is d wide and 2 d tall. Tiling it with eight squares of side d over 2, whose diagonal is below d, shows at most eight points fit. Sorting by y makes the query cheap to locate but does not bound its size, and eviction by x alone still allows a whole column of points.

## 6

A JavaScript port of a correct Python convex hull returns wrong answers for coordinates near 100 million. What is the most likely cause?

A, JavaScript sorts numbers as strings by default, so the order of points is wrong. B, the JavaScript version uses a right-handed coordinate system. C, the cross product exceeds 2 to the 53, so the double loses low-order bits and the sign test misfires. D, popping the chain stack is linear in V8, so the chains are truncated.

[think]

The answer is C: the cross product exceeds 2 to the 53, so the sign test misfires.

Differences of 200 million give products of 4 times 10 to the 16, and a cross product of up to 8 times 10 to the 16, above the roughly 9 times 10 to the 15 where doubles stop being exact integers. Use BigInt, or translate the coordinates first. String sorting by default is a real trap, but it would break every input, not only large coordinates.

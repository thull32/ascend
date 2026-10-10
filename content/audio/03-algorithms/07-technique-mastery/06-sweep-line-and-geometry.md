---
lesson: sweep-line-and-geometry
source: 0fa15cfa1a4c54f6
fit: partial
desk:
  - "The interval event table: rooms, union length and merged intervals from one walk"
  - "The skyline trace with its heap, the heap animation, and the skyline code"
  - "The cross-product formula, the four worked orientations, and the segment-intersection and point-in-polygon tests"
  - "The monotone chain traces for the lower and upper chains, the stack animation, and the hull code"
  - "The closest-pair sweep trace on seven points, with squared distances"
  - "The floating-point counts, the library and hull implementation notes, and the cost and trade-off tables"
  - "Exercises: convex hull by monotone chain, and the skyline"
---
## Introduction

A calendar service holds 200 thousand bookings and needs the peak number of simultaneous meetings. A city planner has 50 thousand building footprints and needs the skyline. A fleet system has 100 thousand vehicle positions and needs the two that are closest.

Each has an obvious quadratic answer: compare every pair. And each has an n log n answer built from the same move. Sort the interesting coordinates, walk them once, and keep a small status structure that describes everything the walk has already passed. That move is the sweep line, and it is why "sort first" is the reflex of everyone who has done computational geometry.

Then the arithmetic underneath, where correct geometric algorithms return wrong answers: floats round, and a cross product of large coordinates overflows 32 bits, or loses bits in a JavaScript double.

## The sweep

A sweep turns a problem over a continuous axis into a problem over a finite list of events. For intervals, the events are the endpoints. For buildings, the left and right edges. For points, the points themselves in x order. Between two consecutive events nothing changes, so you only need to look at events.

Three steps. Generate the events and sort them, with a deliberate rule for ties. Walk them, maintaining a status structure whose invariant is "this describes the world at the current sweep position". And update the answer at each event. The cost is the sort, n log n, plus the status updates: constant for a counter, log n for a heap or an ordered set. For 200 thousand bookings that is 400 thousand events and about 7.6 million comparisons, on the order of a hundred milliseconds in Python.

For intervals, each start is a plus 1 and each end a minus 1. One walk over the sorted events answers three questions. The maximum running count is the number of meeting rooms you need. The lengths of the stretches where the count is above zero add up to the length of the union. And the opening and closing points of those stretches are the merged interval list. The usual meeting-rooms solution keeps a heap of end times; the sweep is the same algorithm with the heap replaced by a counter, because "how many meetings are running" does not need to know which ones.

Now the tie rule. Take three half-open meetings: 0 to 10, 10 to 20, and 5 to 15. How many rooms?

[pause]

Two. The meeting ending at 10 frees its room before the one starting at 10 needs it. So at equal times the minus 1 must come before the plus 1. Process ends first and the peak is 2. Process starts first and the count briefly hits 3, one room too many, and a hidden test catches you. Closed intervals flip the rule, so state the convention before you write the sort key.

## The skyline

Buildings are a left edge, a right edge and a height, and the skyline is the list of points where the maximum height changes. The status structure is a max-heap of buildings by height, each remembering its right edge. At a left edge, push the building. At every event, pop the top while its right edge has already passed. The current height is then the top of the heap.

The heap cannot delete by key, so a building that ends while buried under a taller one simply stays, and is thrown away later, when it surfaces already expired. In the lesson's trace, a building of height 10 ends at x equal to 9 underneath one of height 12, and nothing happens. At x equal to 12, the 12 is popped, the 10 surfaces, is found to be expired, and is popped too. That is the same lazy deletion as the stale-entry check in Dijkstra. Every building is pushed once and popped at most once, so the heap work is n log n on top of the sort.

Ties matter twice here. At equal x, starts come before ends, so there is no spurious drop to zero where one building begins as another ends. And taller starts come first, so a shorter building starting at the same x never emits a point the taller one overrides. Emit a point only when the height actually changes, which also merges adjacent buildings of equal height.

## Orientation and the convex hull

Almost every geometric predicate reduces to one question. Given three points, o, a and b, does the path from o through a to b turn left, turn right, or go straight? The answer is the sign of the two-dimensional cross product: the x step to a times the y step to b, minus the y step to a times the x step to b. Positive is a left turn, negative is right, and zero means the three points are collinear.

A tiny example. o at the origin, a at 4, 1, b at 2, 3. That is 4 times 3, minus 1 times 2: 10, a left turn. Swap a and b, and it is minus 10, a right turn. With integer coordinates, the test is exact: no square roots, no angles, no epsilon. Segment intersection, point in a convex polygon and angle sorting are all built from it.

The bit width doubles, though. Coordinates up to a billion give a cross product up to about 8 times 10 to the 18, which fits a signed 64-bit integer with little room to spare. JavaScript doubles are exact integers only up to 2 to the 53, so above about 30 million in coordinates, use BigInt.

Now the convex hull, by Andrew's monotone chain. Sort the points by x, then y. Build a lower chain left to right, then an upper chain right to left. Each chain is a stack. Before pushing the next point, pop the top while the last two stack points and the new one do not make a strict left turn, because a right turn or a straight line means the top is not a corner. The invariant: the stack always holds the convex chain of the points seen so far. In the lesson's example, eight points, four corners of a square plus interior and edge points, come out as just the four corners, counter-clockwise.

The one decision to make before you code: pop on "cross at most zero" and a point lying on an edge is removed. Pop on "strictly below zero" and collinear boundary points are kept, but then a duplicated point gives a zero cross product and stays on the hull twice, so deduplicate first. Each point is pushed once and popped at most once, so after the sort both chains are linear. And hulls are small: a million points uniform in a square give roughly 40 corners, so the sort dominates.

## Closest pair by sweep

Sort the points by x and let d be the best distance so far. Sweep left to right, keeping the points with x within d of the current point, ordered by y. For each new point, evict the points too far to the left, look up the ones whose y is within d of its own, compare, and insert it.

Why is that lookup cheap? The candidates lie in a rectangle d wide and 2d tall, and every pair of points already in the set is at least d apart. Tile the rectangle with eight squares of side d over 2. Each square's diagonal is shorter than d, so each holds at most one point. The query returns at most eight points, a constant, and the whole sweep is n log n.

Two practical notes. Compare squared distances, so everything stays in integers. And neither Python nor JavaScript has a built-in ordered set: in an interview, insert into a y-sorted list with bisect, and in production use a sorted-list library, a balanced tree, or the divide-and-conquer version. And the trap: a sweep that filters by x alone, then scans, is quadratic on a vertical column of points. The y-range query is what bounds the candidates.

## When floating point lies

The predicates are exact on integers. The moment coordinates are floats, three things go wrong.

First, rounding in the cross product. In the lesson's experiment, a point within 40 units in the last place of 0.5, 0.5 was tested against the line through 12, 12 and 24, 24. Of 6,561 such points, only 81 were exactly collinear, yet the double-precision cross product returned zero for 3,510 more. A hull built on that drops corners or keeps interior points, and an incremental hull can loop forever, each insertion fixing what the last one broke.

Second, epsilon comparisons are not an equivalence relation. A is close to B and B is close to C, but A is not close to C. A comparator built on that is inconsistent: Java's sort may throw, and Python's silently returns an unsorted order. And a fixed absolute epsilon is wrong at both ends of the scale. Near a billion, adjacent doubles are more than a ten-millionth apart, so a tolerance of a billionth is below their resolution.

Third, accumulation: harmless for a report, fatal for a predicate that asks whether a total is exactly zero.

The escape hatches, in order. Integer coordinates: if the input has a fixed number of decimal places, scale it up and work in integers. Exact rationals, only inside the predicate, because they are tens of times slower. And filtered predicates: compute in doubles, bound the error, and fall back to exact arithmetic only when the result is too close to call. Shewchuk's adaptive orientation test does this, and the library under Shapely and PostGIS runs a fast float filter with a higher-precision fallback, because plain doubles produced inconsistent hulls on real data.

## In the interview

Here is the follow-up the lesson expects. How would you test collinearity of three points with float coordinates?

[pause]

Avoid the question if you can, by scaling to integers. If the input is truly real-valued, compute the cross product with an error bound, or use a library's robust predicate, treat only a result inside the bound as ambiguous, and resolve that case exactly. The wrong answer is "absolute value of the cross product below one billionth", which is not scale-aware and turns every near-collinear triple in a large-coordinate dataset into a collinear one.

And a second. Merge Intervals is usually a sort and a running interval; why reach for plus 1 and minus 1 events? Because the event form answers "how many at time t" for every t in the same pass, and extends to weighted intervals and to union length. The wrong answer is claiming different complexities: both are an n log n sort plus a linear walk.

## Recap

Four things to remember. A sweep is events, a sort with a stated tie rule, and a status structure with an invariant: a counter for meeting rooms, a heap with lazy deletion for the skyline, a y-ordered set for closest pair. Orientation is the sign of an integer cross product, exact on integers, as long as 8 times the coordinate squared fits your type. Monotone chain pops anything that is not a strict left turn, and one comparison decides whether collinear points survive. And never compare a float cross product with zero: scale to integers, or use a filtered exact predicate.

At your desk: the interval and skyline traces, the orientation examples, the two hull chains, the closest-pair trace, the floating-point and library details, and the two exercises.

---
slug: sweep-line-and-geometry
title: "Sweep line and geometry: event sweeps, orientation tests, convex hulls and closest pair"
description: Turn interval, skyline and closest-pair problems into a sorted stream of events with a small status structure, test orientation exactly with integer cross products, build a convex hull with monotone chain, and know exactly when floating point will lie to you.
minutes: 45
difficulty: hard
tags: [sweep-line, geometry, convex-hull, intervals, closest-pair, floating-point, cross-product]
problems: [meeting-rooms-ii, merge-intervals, meeting-rooms]
---
A calendar service holds 200,000 bookings and needs the peak number of simultaneous meetings, a city planner has 50,000 building footprints and needs the skyline, a fleet system has 10⁵ vehicle positions and needs the two that are closest. Each of these has an obvious $O(n^2)$ answer (compare every pair) and each has an $O(n \log n)$ answer built from the same move: sort the interesting coordinates, walk them once, and keep a small **status structure** that describes everything the walk has already passed. That move is the sweep line, and it is the reason "sort first" is the reflex of every engineer who has done computational geometry.

The second half of the lesson is about the arithmetic underneath. Geometry problems are where correct algorithms return wrong answers, because `0.1 + 0.2 != 0.3` and because a cross product of two large coordinates overflows a 32-bit integer or loses bits in a JavaScript double. A senior engineer writes orientation tests in exact integer arithmetic, knows the coordinate bound at which that stops being possible, and can explain what the geometry libraries do about it.

## The sweep-line idea

A sweep reduces a problem over a continuous axis to a problem over a finite list of **events**. For intervals, the events are the endpoints; for buildings, the left and right edges; for points, the points themselves in `x` order. Between two consecutive events nothing changes, so the answer only needs to be examined *at* events. The algorithm is:

1. Generate the events and sort them by coordinate, with a deliberate tie order.
2. Walk the sorted events. Maintain a status structure whose invariant is "this describes the world at the current sweep position".
3. Update the answer from the status structure at each event.

The cost is the sort, $O(n \log n)$, plus the status updates, which are $O(1)$ for a counter, $O(\log n)$ for a heap or ordered set. With $n = 200{,}000$ bookings that is 400,000 events and roughly $4 \times 10^5 \times 19 \approx 7.6 \times 10^6$ comparisons in the sort; CPython sorts 400,000 small tuples in a few hundred milliseconds, and the walk is faster than the sort.

### Interval union and meeting rooms as one sweep

Take the intervals `[1,3], [2,6], [8,10], [9,12], [15,18]`. Each becomes a `+1` event at its start and a `−1` event at its end. Sorted, with the running count:

| t | event | active after | note |
|---|---|---|---|
| 1 | +1 | 1 | union segment opens at 1 |
| 2 | +1 | 2 | peak so far 2 |
| 3 | −1 | 1 | |
| 6 | −1 | 0 | segment closes: `6 − 1 = 5` covered |
| 8 | +1 | 1 | opens at 8 |
| 9 | +1 | 2 | |
| 10 | −1 | 1 | |
| 12 | −1 | 0 | closes: `12 − 8 = 4` covered, total 9 |
| 15 | +1 | 1 | opens at 15 |
| 18 | −1 | 0 | closes: `18 − 15 = 3`, total 12 |

The same walk answers three questions at once: the **maximum of `active`** is the number of meeting rooms needed (2 here), the **sum of closed segment lengths** is the length of the union (12), and the list of `(open, close)` pairs is the merged interval list `[1,6], [8,12], [15,18]`, the output of [Merge Intervals](/practice/merge-intervals). The [interval lesson](/learn/algorithms/greedy/interval-problems) presents meeting rooms with a min-heap of end times; the sweep is the same algorithm with the heap replaced by a counter, because "how many meetings are running" does not need to know *which* ones are running.

### The tie rule, and the bug it prevents

Two events at the same coordinate must be ordered on purpose. With half-open intervals `[start, end)`, a meeting ending at 10 and another starting at 10 do not overlap, so the `−1` must be processed **before** the `+1`. Sort by `(time, delta)` with `delta = −1` for ends and `+1` for starts and the tuple order does that for you. Trace `[0,10], [10,20], [5,15]`: with ends first, the count goes `1, 2, 1, 2, 1, 0` and the peak is 2; with starts first it goes `1, 2, 3, 2, 1, 0` and the answer is 3, one room too many. For closed intervals (a point that touches both counts as overlap) the rule flips: starts first. Say which convention the problem uses before you write the sort key.

## Skyline, traced event by event

Buildings are `[left, right, height]` triples and the skyline is the list of `[x, h]` points where the maximum height changes. The status structure is a **max-heap of `(height, right)`**: at a left edge push the building, and at any event pop every heap top whose `right ≤ x`, because that building has ended. The current height is the top of the heap after the pops. Popping only when the top has expired is the same **lazy deletion** as the stale-entry check in [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra): a building that ended while buried under a taller one stays in the heap until it surfaces, and is discarded the moment it does.

Event ordering matters twice. At the same `x`, starts come before ends (so a building that begins where another ends does not produce a spurious drop to zero), and among starts the taller building comes first (so a shorter building starting at the same `x` never emits a point that the taller one immediately overrides). Encoding starts as `(x, −h, right)` and ends as `(x, 0, 0)` and sorting the tuples gives exactly that order: negative heights sort before 0, and a taller building has a more negative key.

Buildings `[2,9,10], [3,7,15], [5,12,12], [15,20,10], [19,24,8]`; the heap is shown as `(h, right)` pairs, tallest first, with a sentinel `(0, ∞)` that is never popped:

| x | event | heap after push and pops | top h | output so far |
|---|---|---|---|---|
| 2 | start 10, r=9 | (10,9) (0,∞) | 10 | [2,10] |
| 3 | start 15, r=7 | (15,7) (10,9) (0,∞) | 15 | [2,10] [3,15] |
| 5 | start 12, r=12 | (15,7) (12,12) (10,9) (0,∞) | 15 | unchanged: 15 is still the top |
| 7 | end | (15,7) expired → popped; (12,12) (10,9) (0,∞) | 12 | … [7,12] |
| 9 | end | top (12,12) has r=12 > 9, nothing popped | 12 | unchanged |
| 12 | end | (12,12) popped, then (10,9) surfaces, expired, popped; (0,∞) | 0 | … [12,0] |
| 15 | start 10, r=20 | (10,20) (0,∞) | 10 | … [15,10] |
| 19 | start 8, r=24 | (10,20) (8,24) (0,∞) | 10 | unchanged |
| 20 | end | (10,20) popped; (8,24) (0,∞) | 8 | … [20,8] |
| 24 | end | (8,24) popped; (0,∞) | 0 | … [24,0] |

Result: `[2,10], [3,15], [7,12], [12,0], [15,10], [20,8], [24,0]`. Notice the event at `x = 9`: building `[2,9,10]` ended, but it was under `[5,12,12]`, so nothing happened, and it was thrown away at `x = 12` when it surfaced already expired. Notice also that a point is emitted only when the height **changes**; the check `out[-1][1] != h` is what merges two adjacent buildings of equal height into one segment.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "max",
 "title": "The skyline's status structure",
 "caption": "Heights pushed at left edges, popped lazily when the top has expired: 15 at x=7, then 12 and the buried 10 at x=12, then 10 at x=20 and 8 at x=24.",
 "operations": [["push",10],["push",15],["push",12],["pop"],["pop"],["pop"],["push",10],["push",8],["pop"],["pop"]]}
```

```python
import heapq

def skyline(buildings):
    events = []
    for left, right, h in buildings:
        events.append((left, -h, right))     # start: taller first at equal x
        events.append((right, 0, 0))         # end: sorts after every start at equal x
    events.sort()
    heap = [(0, float("inf"))]               # (-height, right); sentinel never expires
    out = []
    for x, neg_h, right in events:
        if neg_h < 0:
            heapq.heappush(heap, (neg_h, right))
        while heap[0][1] <= x:               # lazy deletion of expired buildings
            heapq.heappop(heap)
        h = -heap[0][0]
        if not out or out[-1][1] != h:
            out.append([x, h])
    return out
```

Every building is pushed once and popped at most once, so the heap work is $O(n \log n)$ on top of the sort; the heap never holds more than `n + 1` entries, 2 tuples of 3 machine words each, about 72 bytes per entry in CPython (a 2-tuple is 56 bytes plus the two int objects it references). Correctness rests on one invariant: after the pop loop at event `x`, every entry in the heap has `right > x`, so the top is the tallest building covering `x`. The push happens before the pops so that a building starting at `x` is eligible at `x`, and expired entries below the top cannot affect the answer until they surface, at which point they are removed before being read.

## Orientation: the cross product sign

Almost every geometric predicate reduces to one question: given three points `o`, `a`, `b`, does the path `o → a → b` turn left, turn right, or go straight? The answer is the sign of the 2D cross product

$$\text{cross}(o, a, b) = (a_x - o_x)(b_y - o_y) - (a_y - o_y)(b_x - o_x).$$

Positive means `b` is to the left of the directed line `o → a` (a counter-clockwise turn), negative means right, zero means the three points are collinear. The magnitude is twice the signed area of the triangle, which is why the same expression computes polygon area (the shoelace formula) when summed around the boundary.

Worked: `o = (0,0)`, `a = (4,1)`, `b = (2,3)` gives `4·3 − 1·2 = 10 > 0`, a left turn. Swap `a` and `b`: `2·1 − 3·4 = −10`, a right turn. `o = (0,0)`, `a = (2,2)`, `b = (5,5)`: `2·5 − 2·5 = 0`, collinear. With `o = (1,1)`, `a = (4,2)`, `b = (2,5)`: `3·4 − 1·1 = 11`, left. Every value here is an integer, and that is the point: with integer coordinates the test is **exact**, no square roots, no `atan2`, no epsilon.

From this one predicate you build the rest:

- **Segment intersection.** Segments `p₁p₂` and `q₁q₂` cross properly when `cross(p₁,p₂,q₁)` and `cross(p₁,p₂,q₂)` have opposite signs *and* `cross(q₁,q₂,p₁)` and `cross(q₁,q₂,p₂)` have opposite signs. If any of the four is zero you are in the collinear case and check whether the zero-cross endpoint lies within the other segment's bounding box.
- **Point in convex polygon.** With vertices in counter-clockwise order, the point is inside when `cross(vᵢ, vᵢ₊₁, p) ≥ 0` for every edge; one negative value means outside.
- **Polar-angle sort** for Graham scan compares two points by `cross(pivot, a, b)` rather than by `atan2`, which keeps the comparator exact.

The bit width doubles. Coordinates up to $10^9$ produce differences up to $2 \times 10^9$, products up to $4 \times 10^{18}$, and the difference of two products up to $8 \times 10^{18}$, which fits a signed 64-bit integer ($9.22 \times 10^{18}$) with little room to spare. In JavaScript, numbers are doubles and integers are exact only up to $2^{53} \approx 9 \times 10^{15}$, so the same bound gives $8M^2 < 2^{53}$, $M < 3.3 \times 10^7$: coordinates above about thirty million need `BigInt`. Python integers are arbitrary precision and never overflow, at the cost of about 28 bytes per small integer and a slower multiply once values exceed 2⁶⁰.

## Convex hull by monotone chain, point by point

Andrew's monotone chain builds the hull in two passes over the points sorted by `(x, y)`: a **lower chain** left to right, then an **upper chain** right to left. Each chain is a stack. Before pushing the next point `p`, pop the top while the last two stack points and `p` do not make a strict left turn (`cross ≤ 0`), because a right turn or a straight line means the current top is not a corner of the hull. The invariant is that the stack always holds the convex lower (or upper) chain of the points seen so far.

Points: `(2,2), (0,4), (4,0), (0,0), (4,4), (1,3), (3,1), (2,0)`. Sorted: `(0,0), (0,4), (1,3), (2,0), (2,2), (3,1), (4,0), (4,4)`.

Lower chain:

| add | test | action | stack after |
|---|---|---|---|
| (0,0) | | push | (0,0) |
| (0,4) | | push | (0,0) (0,4) |
| (1,3) | cross((0,0),(0,4),(1,3)) = −4 | pop (0,4), push | (0,0) (1,3) |
| (2,0) | cross((0,0),(1,3),(2,0)) = −6 | pop (1,3), push | (0,0) (2,0) |
| (2,2) | cross((0,0),(2,0),(2,2)) = 4 | push | (0,0) (2,0) (2,2) |
| (3,1) | cross((2,0),(2,2),(3,1)) = −2 | pop (2,2), push | (0,0) (2,0) (3,1) |
| (4,0) | cross((2,0),(3,1),(4,0)) = −2 | pop (3,1) | (0,0) (2,0) |
| | cross((0,0),(2,0),(4,0)) = 0 | pop (2,0), push | (0,0) (4,0) |
| (4,4) | cross((0,0),(4,0),(4,4)) = 16 | push | (0,0) (4,0) (4,4) |

The second-to-last row is the collinear case: `(2,0)` sits on the bottom edge between `(0,0)` and `(4,0)`, and the `≤ 0` test removes it. Change the test to `< 0` and collinear boundary points are kept, which some problems ask for and most do not; decide before you code, and remember that with `< 0` a duplicated point produces a zero cross and stays on the hull twice.

Upper chain, walking the sorted list backwards from `(4,4)`:

| add | test | action | stack after |
|---|---|---|---|
| (4,4) | | push | (4,4) |
| (4,0) | | push | (4,4) (4,0) |
| (3,1) | cross((4,4),(4,0),(3,1)) = −4 | pop (4,0), push | (4,4) (3,1) |
| (2,2) | cross((4,4),(3,1),(2,2)) = −4 | pop (3,1), push | (4,4) (2,2) |
| (2,0) | cross((4,4),(2,2),(2,0)) = 4 | push | (4,4) (2,2) (2,0) |
| (1,3) | cross((2,2),(2,0),(1,3)) = −2, then cross((4,4),(2,2),(1,3)) = −4 | pop twice, push | (4,4) (1,3) |
| (0,4) | cross((4,4),(1,3),(0,4)) = −4 | pop (1,3), push | (4,4) (0,4) |
| (0,0) | cross((4,4),(0,4),(0,0)) = 16 | push | (4,4) (0,4) (0,0) |

Drop the last point of each chain (it is the first point of the other) and concatenate: `(0,0), (4,0), (4,4), (0,4)`, the square, counter-clockwise from the lowest-`x` point. The four interior points and the collinear edge point never survive.

```viz
{"type": "stack-queue", "algorithm": "stack-ops",
 "title": "The lower chain as a stack",
 "caption": "Sorted-point indices 0..7 for (0,0),(0,4),(1,3),(2,0),(2,2),(3,1),(4,0),(4,4). Every pop is a cross product that is not a strict left turn.",
 "operations": [["push",0],["push",1],["pop"],["push",2],["pop"],["push",3],["push",4],["pop"],["push",5],["pop"],["pop"],["push",6],["push",7]]}
```

```python
def convex_hull(points):
    pts = sorted(set((x, y) for x, y in points))     # dedupe, then (x, y) order
    if len(pts) <= 2:
        return [list(p) for p in pts]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def chain(seq):
        stack = []
        for p in seq:
            while len(stack) >= 2 and cross(stack[-2], stack[-1], p) <= 0:
                stack.pop()
            stack.append(p)
        return stack

    lower = chain(pts)
    upper = chain(reversed(pts))
    return [list(p) for p in lower[:-1] + upper[:-1]]
```

Why it is correct: every point is pushed once and popped at most once, so the two passes are $O(n)$ after the $O(n \log n)$ sort. A point is popped only when the point after it (in `x` order) lies on or to the right of the line through the two stack points below, which means the popped point is inside or on the boundary of the triangle formed by its neighbours and cannot be a corner. A point that survives both passes has a strict left turn on both sides in its chain, which is the definition of a convex vertex.

How big is the hull? For $n$ points drawn uniformly from a square the expected hull size is about $\tfrac{8}{3} \ln n$, so a million points yield roughly 37 hull vertices; for points uniform in a disk it grows like $n^{1/3}$, on the order of a hundred for a million points. Either way the output is tiny and the sort dominates the running time, which is the reason Chan's $O(n \log h)$ output-sensitive algorithm rarely beats monotone chain outside benchmarks.

## Closest pair by sweep, with the strip argument

The [divide-and-conquer lesson](/learn/algorithms/divide-and-conquer/classic-divide-and-conquer) solves closest pair by splitting at the median `x` and merging strips. The sweep version keeps the same geometric argument and replaces the recursion with an ordered set.

Sort the points by `x` and let `d` be the best distance found so far. Sweep left to right. The status structure is the set of already-seen points with `x > x_current − d`, ordered by `y`. For each new point `p = (x, y)`:

1. Evict every point from the front of the sweep whose `x ≤ x − d`; it can never be within `d` of `p` or of anything to the right.
2. Query the active set for points with `y` in `[y − d, y + d]`. Compare `p` with each; update `d`.
3. Insert `p` into the active set.

Why step 2 is cheap: the candidates lie in a `d × 2d` rectangle (width `d` in `x` because of the eviction, height `2d` in `y` because of the range query), and every pair of already-inserted points is at distance at least `d`. Tile the rectangle with eight `d/2 × d/2` squares; each square's diagonal is $d/\sqrt{2} < d$, so it holds at most one active point, and the query returns at most eight points, a constant. With an ordered set giving $O(\log n)$ insertion, eviction and range lookup, the whole sweep is $O(n \log n)$.

Points `(1,5), (2,1), (3,4), (5,2), (6,5), (7,1), (8,4)`, comparing squared distances so everything stays in integers:

| p | d (√best) | evicted | active (by y) | candidates in y-range | best² after |
|---|---|---|---|---|---|
| (1,5) | ∞ | | | | ∞ |
| (2,1) | ∞ | | (1,5) | (1,5) → 1+16 = 17 | 17 |
| (3,4) | 4.12 | | (2,1) (1,5) | both: (2,1) → 1+9 = 10; (1,5) → 4+1 = **5** | 5 |
| (5,2) | 2.24 | (1,5), (2,1) have x ≤ 5−2.24 | (3,4) | (3,4) → 4+4 = 8 | 5 |
| (6,5) | 2.24 | (3,4) | (5,2) | none: y-range is [2.76, 7.24] | 5 |
| (7,1) | 2.24 | | (5,2) (6,5) | (5,2) → 4+1 = 5, not better | 5 |
| (8,4) | 2.24 | (5,2) | (7,1) (6,5) | (6,5) → 4+1 = 5, not better | 5 |

The answer is $\sqrt{5}$, attained by `(1,5)–(3,4)`, and a brute-force check over all 21 pairs agrees. Seven points did seven range queries with at most two candidates each; the $O(n^2)$ version does 21 comparisons and the gap widens as $n^2 / (8n)$.

The catch for Python and JavaScript: neither has a built-in ordered set. In an interview, use `bisect.insort` on a list ordered by `(y, x)`; insertion is $O(n)$ in the worst case but the memmove runs at memory bandwidth, so a $10^5$-point input finishes in well under a second. In production use `sortedcontainers.SortedList` or a balanced tree, or take the divide-and-conquer route, which needs only sorting and merging. Keep `d` as a float from `math.sqrt(best)` for the window bounds while comparing squared integer distances for the actual test; the window can be slightly generous without affecting correctness, the distance comparison cannot.

## Floating-point precision

The predicates above are exact on integers. The moment coordinates are floats, three things go wrong.

**Rounding in the cross product.** Take `b = (12, 12)` and `c = (24, 24)` and an `a` within 40 ulps of `(0.5, 0.5)`, where one ulp at 0.5 is $1.1 \times 10^{-16}$. Of the 6,561 such points, 3,510 are reported collinear by the double-precision formula when exact rational arithmetic says they are strictly to the left. A hull built on that predicate drops corners or keeps interior points, and an incremental hull can loop forever because each insertion "fixes" what the last one broke. This is the classroom example from Kettner, Mehlhorn, Pion, Schirra and Yap's paper on robustness in geometric computation, and it is why the geometry libraries described below do not trust the naive formula.

**Epsilon comparisons are not an equivalence relation.** `abs(a − b) < 1e-9` says `0 ≈ 0.6e-9` and `0.6e-9 ≈ 1.2e-9` but `0 ≉ 1.2e-9`. A sort comparator built on such a test is inconsistent; Java's TimSort detects some of these cases and throws `IllegalArgumentException: Comparison method violates its general contract!`, while CPython's sort silently returns an order that is not sorted. An absolute epsilon is also wrong at both ends of the scale: at magnitude $10^9$ the spacing between adjacent doubles is $1.2 \times 10^{-7}$, so `1e-9` is below the resolution of the numbers, and at magnitude $10^{-12}$ everything is "equal". Use a relative tolerance (`abs(a − b) <= rel * max(abs(a), abs(b))`, which is what `math.isclose` does) when you must compare floats, and prefer not to.

**Accumulation.** Summing 10⁶ areas each with relative error $2^{-53}$ can drift by $10^6 \times 1.1 \times 10^{-16} \approx 10^{-10}$ relative in the worst case, harmless for a report and fatal for a predicate that asks whether a total is exactly zero.

The senior escape hatches, in order of preference:

1. **Integer coordinates.** If the input is decimal with a fixed number of places, scale by $10^k$ and work in integers; Python's big ints and 64-bit types with the $8M^2$ bound cover almost all interview and most production inputs.
2. **Exact rationals** (`fractions.Fraction`) for the rare predicate that must be exact on float input: roughly 50–100× slower than float arithmetic, so use them only in the predicate, not in the bulk computation.
3. **Filtered predicates.** Compute in doubles, bound the rounding error, and fall back to exact arithmetic only when the result is within that bound. Shewchuk's adaptive-precision `orient2d` does this and is exact for all inputs while running at float speed for almost all of them.

## Under the hood

**Robust predicates in real libraries.** JTS and its C++ port GEOS (the engine under Shapely, PostGIS and QGIS) compute orientation in double-double arithmetic, two doubles carrying about 106 bits of significand, because plain doubles produced inconsistent hulls and overlays on real data. CGAL offers kernels parameterised by number type, and its filtered exact kernels run the fast float version first and the exact version only when the error filter cannot certify the sign. In JavaScript, the `robust-predicates` package ports Shewchuk's routines and is what Delaunator and the Mapbox stack use to triangulate without the failures above.

**Hull implementations.** `scipy.spatial.ConvexHull` wraps Qhull, which uses Quickhull, an expected $O(n \log n)$ divide-and-conquer with a different partition rule; its `QJ` option "joggles" the input by a tiny random perturbation to escape degenerate (collinear, cocircular) configurations, which tells you how much trouble exact degeneracy handling is in floating point. Monotone chain is what you write yourself because it is twenty lines, its degeneracy handling is one comparison, and it is exact on integers.

**Sweeps you have already used.** Bentley–Ottmann finds all $k$ intersections among $n$ segments in $O((n + k) \log n)$ with an event queue and a status structure ordered along the sweep line, and it is the algorithm behind polygon overlay in GIS. Fortune's algorithm builds a Voronoi diagram with a sweep in $O(n \log n)$. Database engines use an interval sweep to detect overlapping ranges in temporal tables and to build range-partition schedules; capacity planners compute concurrent-session curves the way the meeting-rooms sweep does, on tens of millions of events per day.

**The sort underneath.** CPython's `sorted` on a list of tuples calls tuple comparison, which compares element by element and short-circuits on the first difference; sorting one million `(x, y)` tuples takes on the order of a second, and sorting by a single integer key extracted with `key=` about a quarter of that. When the sweep's sort is the bottleneck, pack `(x, y)` into one integer (`x * 2**32 + y` for non-negative 32-bit coordinates) and sort integers.

## Quantified costs

| Problem | Brute force | Sweep / geometry | For n = 10⁵ (order of magnitude) |
|---|---|---|---|
| Meeting rooms / union | $O(n^2)$ pairwise | $O(n \log n)$ sort + $O(n)$ counter | 5 × 10⁹ vs 2 × 10⁶ operations |
| Skyline | $O(n \cdot W)$ over the coordinate range | $O(n \log n)$ sort + heap | unbounded in W vs 3 × 10⁶ |
| Convex hull | $O(n^3)$ edge test | $O(n \log n)$ sort + $O(n)$ stack | 10¹⁵ vs 2 × 10⁶ |
| Closest pair | $O(n^2)$ pairs | $O(n \log n)$ sweep or D&C | 5 × 10⁹ vs 2 × 10⁶ |

Memory for the sweep is one list of events (2n tuples, about 72 bytes each in CPython, so 14 MB for 10⁵ intervals) plus the status structure, which for the skyline holds at most n + 1 heap entries and for closest pair at most the points within a `d`-wide vertical band.

## Failure modes

**Symptom: meeting-rooms answer is one too high on some inputs, tests with touching intervals fail.** Diagnosis: events at the same time are processed starts-first, so `[0,10]` and `[10,20]` are counted as overlapping. Fix: sort by `(time, delta)` with `delta = −1` for ends, and state the half-open convention in the code comment.

**Symptom: skyline contains consecutive points at the same height, or a zero-height point immediately followed by a positive one at the same x.** Diagnosis: ends were sorted before starts at equal `x`, or the height-change check is missing. Fix: encode starts as `(x, −h, right)` and ends as `(x, 0, 0)`, and emit only when the height differs from the last emitted point.

**Symptom: convex hull of "obviously" convex float data has a concave dent, or the incremental hull loop never terminates.** Diagnosis: orientation computed in doubles near collinear triples returns 0 or the wrong sign. Fix: scale to integers if the input has fixed precision; otherwise use a robust predicate (`robust-predicates`, Shapely/GEOS) and never compare the naive float cross product with `== 0`.

**Symptom: hull is correct in Python, wrong in the JavaScript port for coordinates around 10⁸.** Diagnosis: the cross product exceeds $2^{53}$ and loses low-order bits, so `cross ≤ 0` misfires. Fix: `BigInt` for the products, or reduce coordinates by subtracting the minimum before computing (differences are what the formula uses, so translation is free).

**Symptom: closest-pair sweep is $O(n^2)$ on a vertical column of points.** Diagnosis: the active set is filtered by `x` only and the `y`-range query is a linear scan. Fix: the range query must use the `y` order (bisect on a `(y, x)`-sorted list or an ordered set); the eviction by `x` alone does not bound the candidates.

**Symptom: `sorted()` output is not sorted when using an epsilon-based key comparison, or Java throws from `Arrays.sort`.** Diagnosis: the tolerance comparison is not transitive, so the comparator is inconsistent. Fix: sort on exact keys (integers, or the float values themselves with a total order) and apply tolerance only when deciding equality afterwards.

## Trade-offs

| Approach | Time | Handles degeneracy | Output order | Code size | When |
|---|---|---|---|---|---|
| Monotone chain | $O(n \log n)$ | one `≤` decision | CCW from lowest x | ~20 lines | default; exact on integers |
| Graham scan | $O(n \log n)$ | polar sort ties need care | CCW from pivot | ~30 lines | when a pivot-based order is already needed |
| Jarvis march | $O(nh)$ | collinear points tricky | CCW | ~20 lines | tiny hulls, h ≪ log n |
| Quickhull (Qhull) | expected $O(n \log n)$, worst $O(n^2)$ | needs joggling in float | unordered facets | library | d > 2, float input |
| Meeting rooms: counter sweep | $O(n \log n)$ | tie rule | count over time | 10 lines | when only the count matters |
| Meeting rooms: end-time heap | $O(n \log n)$ | tie rule | room assignment | 15 lines | when rooms must be identified |
| Closest pair: sweep | $O(n \log n)$ with ordered set | integer distances | one pair | 25 lines | streaming x-sorted input |
| Closest pair: divide & conquer | $O(n \log n)$ | integer distances | one pair | 30 lines | no ordered set available |

## Interviewer follow-ups

**"Your skyline has a building that ended while a taller one covered it. When is it removed from the heap?"** Model answer: never at its own end event; it stays until it becomes the heap top, which happens after every taller building covering it has expired, and the `while heap[0].right <= x` loop pops it then. Each building is pushed once and popped once, so the laziness costs nothing asymptotically. Common wrong answer: "I remove it at its end event", which requires a heap with deletion by key, a structure Python and JavaScript do not ship.

**"How would you test collinearity of three points with float coordinates?"** Model answer: avoid the question if possible by scaling to integers; if the input is truly real-valued, compute the cross product with an error bound (or a library robust predicate) and treat only a result whose magnitude is below the bound as ambiguous, then resolve it exactly. Common wrong answer: `abs(cross) < 1e-9`, which is not scale-aware and turns every near-collinear triple in a large-coordinate dataset into a "collinear" one.

**"Why does the closest-pair sweep query only a constant number of points?"** Model answer: every point in the active set is at least `d` from every other, and the query rectangle is `d` by `2d`; eight squares of side `d/2` cover it and each square, having diagonal below `d`, holds at most one point. Common wrong answer: "because the set is sorted by y", which explains why the query is fast to *find*, not why it is small.

**"Merge Intervals is usually solved with a sort and a running interval. Why would you ever reach for +1/−1 events instead?"** Model answer: the event form answers "how many at time t" for every t in the same pass, generalises to weighted intervals (add the weight instead of 1) and to "union length", and composes with other event types in one sweep; the running-interval form is shorter when you only need the merged list. Common wrong answer: treating them as different algorithms with different complexities; both are $O(n \log n)$ sorts followed by a linear walk.

**"The hull must include collinear boundary points. What changes?"** Model answer: the pop test becomes `cross < 0`, and duplicates must be removed first because a repeated point gives a zero cross and would be kept twice; also the first and last points of each chain then need the same treatment when the whole edge is collinear. Common wrong answer: changing only the comparison and forgetting duplicates.

## What mid-level engineers get wrong

- **Sorting events without a tie rule** and discovering it in a hidden test with touching intervals. The consequence is an answer off by one in the direction the convention dictates.
- **Using `atan2` or floating slopes to compare angles** in a polar sort. The comparator is then inexact, ties between collinear points are resolved by rounding noise, and Graham scan produces a hull with a wrong vertex order.
- **Computing distances with `sqrt` and comparing floats** when squared integer distances would do; the test then depends on rounding, and `sqrt(dist2) == side` for a square check fails on perfectly valid input.
- **Treating the skyline heap as needing deletion**, and writing an $O(n)$ scan-and-remove that turns the algorithm quadratic on inputs with thousands of overlapping buildings.
- **Assuming JavaScript integers are exact** and porting a correct Python cross product into one that fails past $3 \times 10^7$ coordinates.
- **Building a closest-pair "sweep" that filters by `x` only** and calling it $O(n \log n)$; on clustered data it is quadratic.

## Exercises

```exercise
id: monotone-chain-hull
title: Convex hull by monotone chain
prompt: |
  `points` is a list of `[x, y]` integer pairs; duplicates are allowed. Return
  the vertices of the convex hull in counter-clockwise order, starting from the
  point with the smallest x (smallest y on ties), and excluding points that lie
  on a hull edge without being a corner. If there are fewer than three distinct
  points, or every point is collinear, return the distinct extreme points sorted
  by (x, y).

  Use Andrew's monotone chain: sort, build the lower chain with a stack, build
  the upper chain, concatenate. Aim for O(n log n).
languages: [python, javascript]
entry: convex_hull
starter:
  python: |
    def convex_hull(points):
        # sort distinct points by (x, y); pop while cross(stack[-2], stack[-1], p) <= 0
        return []
  javascript: |
    function convex_hull(points) {
      // dedupe, sort by x then y, then two stack passes with an integer cross product
      return [];
    }
tests:
  - args: [[[2,2],[0,4],[4,0],[0,0],[4,4],[1,3],[3,1],[2,0]]]
    expected: [[0,0],[4,0],[4,4],[0,4]]
    label: the lesson's eight points
  - args: [[[0,0],[3,0],[0,3],[1,1]]]
    expected: [[0,0],[3,0],[0,3]]
    label: triangle with an interior point
  - args: [[[0,0],[1,1],[2,2],[3,3]]]
    expected: [[0,0],[3,3]]
    label: all collinear
  - args: [[[5,5]]]
    expected: [[5,5]]
    label: single point
  - args: [[[0,0],[4,0],[4,4],[0,4],[2,0],[4,2],[2,4],[0,2]]]
    expected: [[0,0],[4,0],[4,4],[0,4]]
    label: edge midpoints are not corners
  - args: [[[1,1],[1,1],[2,2],[2,2]]]
    expected: [[1,1],[2,2]]
    hidden: true
  - args: [[[0,0],[2,0],[1,0],[1,1],[1,-1],[0,0]]]
    expected: [[0,0],[1,-1],[2,0],[1,1]]
    hidden: true
  - args: [[[-3,1],[4,-2],[0,0],[2,5],[-1,-4],[3,3],[1,1],[-2,3]]]
    expected: [[-3,1],[-1,-4],[4,-2],[3,3],[2,5],[-2,3]]
    hidden: true
hints:
  - "Deduplicate before sorting; a repeated point gives a zero cross product and would otherwise survive the `<= 0` test twice."
  - "Build the upper chain by iterating the sorted list in reverse with the same pop rule."
  - "Drop the last point of each chain before concatenating: it is the first point of the other chain."
```

```exercise
id: skyline-sweep
title: Skyline from buildings
prompt: |
  `buildings` is a list of `[left, right, height]` triples with `left < right`
  and `height > 0`, in no particular order. Return the skyline as a list of key
  points `[x, h]`: every x at which the maximum height changes, paired with the
  new height, in increasing x, ending with a height-0 point after the last
  building. Consecutive key points never share a height. Return `[]` for no
  buildings.

  Sweep the 2n edge events from left to right with a max-heap of
  (height, right) and lazy deletion. Aim for O(n log n).
languages: [python, javascript]
entry: skyline
starter:
  python: |
    import heapq

    def skyline(buildings):
        # events (x, -h, right) for starts and (x, 0, 0) for ends; heap of (-h, right)
        return []
  javascript: |
    // No built-in heap in JS: a small max-heap keyed on [height, right] is enough.
    class MaxHeap {
      constructor() { this.a = []; }
      push(x) { const a = this.a; a.push(x); let i = a.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] >= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
      pop() { const a = this.a; const top = a[0]; const last = a.pop();
        if (a.length) { a[0] = last; let i = 0;
          for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
            if (l < a.length && a[l][0] > a[m][0]) m = l;
            if (r < a.length && a[r][0] > a[m][0]) m = r;
            if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top; }
      peek() { return this.a[0]; }
      get size() { return this.a.length; }
    }

    function skyline(buildings) {
      // your code here
      return [];
    }
tests:
  - args: [[[2,9,10],[3,7,15],[5,12,12],[15,20,10],[19,24,8]]]
    expected: [[2,10],[3,15],[7,12],[12,0],[15,10],[20,8],[24,0]]
    label: the lesson's five buildings
  - args: [[[0,3,5],[3,6,5]]]
    expected: [[0,5],[6,0]]
    label: adjacent equal heights merge
  - args: [[[1,10,5],[3,4,8]]]
    expected: [[1,5],[3,8],[4,5],[10,0]]
    label: a building inside another
  - args: [[[1,5,3],[1,5,6]]]
    expected: [[1,6],[5,0]]
    label: same footprint, different heights
  - args: [[]]
    expected: []
    label: no buildings
  - args: [[[1,2,1],[2,3,1],[3,4,1]]]
    expected: [[1,1],[4,0]]
    hidden: true
  - args: [[[0,2,3],[2,5,3],[3,7,1]]]
    expected: [[0,3],[5,1],[7,0]]
    hidden: true
  - args: [[[1,4,2],[2,3,5],[6,8,1]]]
    expected: [[1,2],[2,5],[3,2],[4,0],[6,1],[8,0]]
    hidden: true
hints:
  - "Encode starts as (x, -height, right) and ends as (x, 0, 0) so that a plain sort puts starts before ends and taller starts first."
  - "Seed the heap with a sentinel (0, infinity) so the top is always defined; pop while the top's right <= x."
  - "Emit a key point only when the current top height differs from the last emitted height."
```

## Senior signals

- You describe any interval, skyline or nearest-neighbour problem as "events, a sort with a stated tie rule, and a status structure", and you name the invariant the status structure keeps.
- You solve meeting rooms with a counter and know when the heap version is needed instead (room identity), and you can say why both are $O(n \log n)$.
- You recognise the skyline heap's lazy deletion as the same technique as Dijkstra's stale entries, and you can say when each buried entry is removed.
- You write orientation as an integer cross product, state the $8M^2$ overflow bound for 64-bit integers and the $2^{53}$ bound for JavaScript, and you never compare a float cross product with zero.
- You can trace monotone chain on eight points and explain the single comparison that decides whether collinear boundary points survive.
- You reproduce the eight-square packing argument for closest pair, and you know that Python needs `bisect` or `sortedcontainers` because it has no ordered set.
- You know that GEOS, CGAL and Shewchuk's predicates exist because double-precision orientation fails on real data, and you can describe the filter-then-exact strategy they use.

## Check yourself

```quiz
- q: >-
    Half-open meetings [0,10], [10,20] and [5,15] are swept with +1/-1 events. Which tie rule gives the correct answer of 2 rooms, and why?
  options: ["Any order works, because the peak count is taken over all events and ties cancel out", "Ends before starts at equal times, so a meeting finishing at 10 frees its room before the next begins", "Starts before ends at equal times, so a meeting beginning at 10 is counted while its predecessor is still active", "Sort by duration first, because longer meetings should claim rooms before shorter ones"]
  answer: 1
  explanation: >-
    With half-open intervals a meeting ending at 10 does not overlap one starting at 10, so the -1 must be applied first; sorting by (time, delta) with delta = -1 for ends does that. Starts-first reports 3 rooms for this input. The order of ties does change the peak, and duration has nothing to do with concurrency.
- q: >-
    In the skyline sweep, building [2,9,10] is covered by [5,12,12] when it ends at x = 9. When is it removed from the heap?
  options: ["At x = 7, when the taller building [3,7,15] is popped and the heap is rebuilt", "At x = 12, when it surfaces as the heap top and the pop loop finds its right edge has passed", "At x = 9, when its end event triggers a deletion by key from the heap", "Never; it stays in the heap and is ignored because its height is below the top"]
  answer: 1
  explanation: >-
    The heap supports no deletion by key, so an expired building stays until it becomes the top. At x = 12 the pop loop removes (12,12), then finds (10,9) on top with right = 9 <= 12 and removes it too. Each building is pushed once and popped once, so lazy deletion costs nothing asymptotically.
- q: >-
    Why is the integer cross product preferred over atan2 or slopes for deciding whether three points make a left turn?
  options: ["It returns the turning angle directly, which atan2 only approximates", "It works for any coordinate magnitude in every language without overflow", "It is exact for integer coordinates, so collinear triples are detected without any tolerance", "It is faster because it avoids division, although it needs an epsilon for the zero case"]
  answer: 2
  explanation: >-
    The cross product uses only subtraction and multiplication, so on integers its sign is exactly right and zero means exactly collinear. It does not give an angle, it does overflow (8M² must fit the integer type, or 2^53 in JavaScript), and no epsilon is needed precisely because it is exact.
- q: >-
    Monotone chain pops the stack while cross(stack[-2], stack[-1], p) <= 0. What changes if the test becomes < 0?
  options: ["The hull is built clockwise instead of counter-clockwise", "Collinear boundary points are kept, and duplicate points can appear on the hull twice", "Interior points can survive on the hull because straight lines are no longer removed", "The algorithm becomes O(n²) because fewer points are popped per step"]
  answer: 1
  explanation: >-
    A zero cross product means the middle point lies on the segment between its neighbours. With <= 0 it is removed; with < 0 it stays, which is the convention some problems require, and a repeated point also produces zero and survives unless deduplicated first. Orientation of the output and the O(n) stack bound are unchanged.
- q: >-
    In the closest-pair sweep, why does the y-range query on the active set return at most a constant number of points?
  options: ["Eviction by x keeps the active set small, so any query over it is constant time", "The candidates lie in a d by 2d rectangle whose eight d/2 squares each hold at most one point at pairwise distance d or more", "Points closer than d have already been paired, so the query only returns unpaired points", "The active set is sorted by y, so a binary search locates the neighbours in logarithmic time"]
  answer: 1
  explanation: >-
    Every pair of active points is at least d apart, and the query rectangle is d wide by 2d tall; tiling it with eight squares of side d/2 (diagonal below d) shows at most eight points fit. Sorting by y makes the query cheap to locate but does not bound its size, and eviction by x alone still allows a whole column of points.
- q: >-
    A JavaScript port of a correct Python convex hull returns wrong answers for coordinates near 10⁸. What is the most likely cause?
  options: ["JavaScript sorts numbers lexicographically by default, so the (x, y) order is wrong", "The JavaScript version uses a right-handed coordinate system", "The cross product exceeds 2^53, so the double loses low-order bits and the sign test misfires", "Array.pop on the chain stack is O(n) in V8, so the chains are truncated"]
  answer: 2
  explanation: >-
    Differences of 2 × 10⁸ give products of 4 × 10¹⁶ and a cross product up to 8 × 10¹⁶, above the 9 × 10¹⁵ range where doubles are exact integers. Use BigInt or translate coordinates first. Lexicographic default sorting is a real trap but would break every input, not only large coordinates.
```

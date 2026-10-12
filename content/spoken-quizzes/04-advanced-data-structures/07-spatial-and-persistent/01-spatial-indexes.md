---
lesson: spatial-indexes
source: 66e91555c7cec1bf
---
## 1

A k-d tree nearest-neighbour search is back at a node that splits on x equals 6. The query point is at 5.5, 7.5, and the best distance so far is 0.707. What must happen?

A, search the far side, since the line x equals 6 is only 0.5 away. B, skip the far side, since the current best lies on the near side. C, search the far side only if it holds more points than the near side. D, skip the far side, since the near side was searched down to a leaf.

[think]

The answer is A: search the far side, since the splitting line is only 0.5 away.

The splitting line is 0.5 from the query, less than the best distance of 0.707, so a point on the other side of the line could be closer, and the far subtree must be searched. Where the current best point lies is irrelevant, and subtree sizes play no part in the pruning test.

## 2

Two points 208 metres apart, near London, have 8-character geohashes that share no prefix at all: one starts with g, the other with u. What does this show?

A, the encoding is wrong: points this close must share a prefix. B, geohash loses accuracy at high latitudes, so switch to S2. C, close points can share no prefix, so search the neighbouring cells too. D, precision 8 is too coarse to separate points only 208 metres apart.

[think]

The answer is C: close points can share no prefix, so search the neighbouring cells too.

The points sit on either side of the Greenwich meridian, so the very first longitude bit differs, and nothing after it can be shared. A shared prefix implies proximity, but proximity does not imply a shared prefix, which is why radius searches use the cell plus its neighbours, and then an exact-distance filter.

## 3

In Guttman's quadratic split for R-trees, which two rectangles become the seeds of the two groups?

A, the two with the largest areas, so each group starts big. B, the first two entries in the node's current order. C, the pair whose centres are closest of all the pairs. D, the pair whose joint bounding box wastes the most area.

[think]

The answer is D: the pair whose joint bounding box wastes the most area.

For every pair, the algorithm computes the area of their joint box minus both of their own areas, and the pair that would waste the most if kept together is split apart. In the lesson's trace, R1 and R3 wasted 82 and seeded the groups, and the result had no overlap. Largest-area or closest-centre choices are not the rule.

## 4

How does Redis GEO store a member added with GEOADD?

A, as a node in an R-tree kept beside the keyspace. B, as two sorted sets, one scored by latitude and one by longitude. C, as an 11-character geohash string, stored in a hash field. D, as a sorted-set member, scored by a 52-bit interleaved geohash.

[think]

The answer is D: as a sorted-set member, scored by a 52-bit interleaved geohash.

The score interleaves 26 bits of longitude with 26 bits of latitude, which a double holds exactly. A radius search turns the query's cell and its neighbours into score ranges, and filters the candidates by exact distance. The 11-character string is what the GEOHASH command computes on demand.

## 5

Why do ride-sharing systems prefer H3 hexagons to square cells for dispatch and surge pricing?

A, hexagons tile the sphere with no pentagons and no distortion at all. B, hexagons nest exactly, so parent cells are sums of their children. C, all six neighbours are the same distance away, so rings are nearly circular. D, hexagon IDs follow a Hilbert curve, so every ring is one range scan.

[think]

The answer is C: all six neighbours are equidistant, so rings are nearly circular.

Each neighbour shares an edge, at the same distance between centres, so rings of neighbours grow evenly in every direction, and smoothing across neighbours has no directional bias. H3's hierarchy is only approximate, every resolution has 12 pentagons, and Hilbert ordering is S2's property.

## 6

Half a million drivers report their positions every 4 seconds. Which index fits the driver locations best?

A, a geohash prefix index, queried with the rider's own cell only. B, a k-d tree over all drivers, rebuilt after each batch of updates. C, a PostGIS GiST index, updated in place on every position report. D, cells in memory, moving a driver only when its cell changes.

[think]

The answer is D: cells in memory, moving a driver only when its cell changes.

That is 125 thousand updates a second, which favours cells: most updates stay inside the same cell and cost nothing, and a crossing is one delete and one insert. A k-d tree must be rebuilt as points move, maintaining an on-disk index per update is expensive at this rate, and a query on one cell misses drivers just across its edge.

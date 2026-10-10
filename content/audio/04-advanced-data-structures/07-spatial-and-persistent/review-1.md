---
review: spatial-and-persistent
source: bec4576a07f0dccf
---
## Introduction

Twelve questions from the spatial-and-persistent module: six on spatial indexes, six on persistent and immutable structures. Each has four options. Answer out loud before the answer comes.

## Question 1

A k-d tree search for the nearest point is back at a node that splits on x equals 6. The query is at 5.5, 7.5, and the best distance so far is 0.707. What must happen?

A, search the far side, since the line x equals 6 is only 0.5 away. B, skip the far side, since the current best lies on the near side. C, search the far side only if it holds more points than the near side. D, skip the far side, since the near side was already searched down to a leaf.

[think]

The answer is A: search the far side. The splitting line is 0.5 from the query, less than the best distance of 0.707, so a point on the other side could be closer, and the far subtree must be searched. Where the current best lies is irrelevant, and subtree sizes play no part in the pruning test.

## Question 2

Two points 208 metres apart near London have geohashes that share no character at all: one begins g, c, p, the other u, 1, 0. What does this show?

A, the encoding is wrong: points this close must share a prefix. B, geohash loses accuracy at high latitudes, so switch to S2. C, close points can share no prefix, so search the neighbouring cells too. D, eight characters of precision is too coarse to separate points only 208 metres apart.

[think]

The answer is C. The points sit on either side of the Greenwich meridian, so the very first longitude bit differs, and nothing after it can be shared. A shared prefix implies proximity, but proximity does not imply a shared prefix, which is why radius searches use the cell plus its neighbours and then an exact distance filter.

## Question 3

In Guttman's quadratic split for R-trees, which two rectangles become the seeds of the two groups?

A, the two with the largest areas, so each group starts big. B, the first two entries in the node's current order. C, the pair whose centres are the closest of all pairs. D, the pair whose joint bounding box wastes the most area.

[think]

The answer is D. For every pair, the split computes the area of their joint box minus both of their own areas, and the pair that would waste the most if kept together is split apart. In the lesson's trace that pair wasted 82 units, and the resulting groups did not overlap at all. Largest area or closest centres are not the rule.

## Question 4

How does Redis store a member added with its geo-add command?

A, as a node in an R-tree maintained beside the keyspace. B, as two sorted sets, one scored by latitude and one by longitude. C, as an 11-character geohash string stored in a hash field. D, as a sorted-set member whose score is a 52-bit interleaved geohash.

[think]

The answer is D. The score interleaves 26 bits of longitude and 26 of latitude, which a double represents exactly. A radius search turns the query's cell and its neighbours into score ranges, then filters candidates by exact distance. The 11-character string is what the geohash command computes on demand.

## Question 5

Why do ride-sharing systems prefer H3 hexagons to square cells for dispatch and surge pricing?

A, hexagons tile the sphere with no pentagons and no distortion at all. B, hexagons nest exactly, so parent cells are sums of their children. C, all six neighbours are at the same distance, so rings are close to circular. D, hexagon IDs follow a Hilbert curve, so every ring is one range scan.

[think]

The answer is C. Each neighbour shares an edge at the same centre-to-centre distance, so rings grow evenly in every direction, and smoothing across neighbours has no directional bias. H3's hierarchy is only approximate, every resolution has 12 pentagons, and Hilbert ordering is S2's property, not H3's.

## Question 6

500,000 drivers report their positions every 4 seconds. Which index fits the driver locations best?

A, a geohash prefix index, queried with the rider's own cell only. B, a k-d tree over all drivers, rebuilt after each batch of updates. C, a PostGIS GiST index, updated in place on every position report. D, cells in memory, moving a driver only when its cell changes.

[think]

The answer is D. That is 125,000 updates a second, which favours cells: most updates stay inside the same cell and cost nothing, and a crossing is one delete and one insert. A k-d tree must be rebuilt as points move, per-update disk index maintenance is expensive at this rate, and a query on one cell misses drivers just across its edge.

## Question 7

You insert 16 with path copying into a perfect binary search tree holding 1 to 15. How many nodes does the new version allocate, and how many does it share with the old one?

A, 16 new and none shared. B, 5 new and 11 shared. C, 4 new and 12 shared. D, 1 new and 15 shared.

[think]

The answer is B: 5 new, 11 shared. The search path is 8, 12, 14, 15, and each is copied so it can point to the new child, plus the new leaf 16. The subtrees under 4, 10 and 13, eleven nodes in all, are shared. Allocating only the leaf would mean changing node 15 in place, which would alter the old version.

## Question 8

A HAMT node's bitmap has slots 9, 17, 21 and 23 set. Where in the node's compact array is the entry for slot 21?

A, at index 1, because one occupied slot lies above 21. B, at index 3, because three slots are occupied in total. C, at index 21, because the slot number is the position. D, at index 2, because two occupied slots lie below 21.

[think]

The answer is D: index 2. The compact array stores only the occupied slots, in order, so an entry's position is the population count of the bitmap's bits below its slot, which counts slots 9 and 17. Using the slot number directly would need a 32-entry array, which is exactly what the bitmap exists to avoid.

## Question 9

Compared with path copying, what do fat nodes trade?

A, faster pointer reads, in exchange for linear space on every update. B, constant space per update, in exchange for log m work on every pointer read. C, full persistence, in exchange for a cap on how many versions can exist. D, cheaper updates, in exchange for needing a tracing garbage collector.

[think]

The answer is B. Each field keeps a list of modifications tagged with versions, so an update adds one record instead of copying a path, but every read must find the right record, a binary search over m modifications. Fat nodes put no cap on versions, and the same paper extends them to full persistence with an ordered version list.

## Question 10

A Git commit changes only one file, main dot py, in the directory src slash app. Every other file is untouched. How many new objects does Git create?

A, 2: a new blob and the new commit. B, 5: a blob, three trees and the commit. C, all of them: a full snapshot per commit. D, 1: a delta against the parent's blob.

[think]

The answer is B: five. The new file content is a new blob. The app directory, the src directory and the root tree must each list a new child hash, so each gets a new tree. And the commit names the new root. Every other blob and tree is shared by hash; deltas exist only in packfile compression, below the object model.

## Question 11

Why is appending one element to a Python tuple, by adding a one-element tuple to it, not an efficient persistent update?

A, tuples are mutable, so the old version changes as well. B, it shares the old tuple, so later edits leak back into it. C, it raises a type error, because tuples cannot be extended. D, it copies all n references, so every version costs time and space proportional to n.

[think]

The answer is D. The tuple is immutable, so the old version is safe, but nothing is shared: the new tuple holds a fresh copy of every reference, 3.1 milliseconds for a million elements in the lesson's measurement. Persistence needs structural sharing as well as immutability.

## Question 12

An LMDB database file keeps growing, although the amount of live data is stable. What is the most likely cause?

A, a new meta page is appended for every committed write. B, a long-lived read transaction pins an old root and all its pages. C, the B+tree never merges pages that become half empty. D, path copying doubles the space used by every single write.

[think]

The answer is B. Pages replaced by copy-on-write can be reused only when no reader still holds a root that reaches them, so one old read transaction keeps them all alive, and new writes take fresh pages. A write copies one root-to-leaf path, not the file, and LMDB alternates between just two meta pages.

## Recap

Three ideas kept coming back. Indexes return candidates, not answers: a k-d tree must still cross a close splitting line, and a geohash search must check the neighbouring cells and then filter by exact distance. Moving data and old versions both reward sharing what did not change, whether that is a driver who stays in its cell or the eleven untouched nodes of a copied tree. And whatever keeps an old root alive, an old reader, an undo stack, a branch, keeps its memory alive too.

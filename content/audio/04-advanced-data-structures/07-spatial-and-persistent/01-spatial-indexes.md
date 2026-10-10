---
lesson: spatial-indexes
source: b862b68b47af7459
fit: partial
desk:
  - "The quadtree code and its five-point split trace"
  - "The k-d tree build table, the nearest-neighbour code and its nine-step trace"
  - "The R-tree quadratic split: the PickSeeds and PickNext tables"
  - "The geohash encoding of the Eiffel Tower bit by bit, the cell-size table and the 3 by 3 neighbour block"
  - "Redis GEO's search steps, the PostGIS index notes, and the cost, measurement and trade-off tables"
  - "Exercises: encode a geohash, and nearest neighbour with a k-d tree"
---
## Introduction

A rider opens the app in central Paris, and the dispatcher must find the ten nearest available drivers among 500,000 in the region, while every driver reports a new position every four seconds. A scan computes 500,000 distances per request. Measured in CPython on 100,000 points, a brute-force nearest-neighbour query takes 8.6 milliseconds, and a busy city issues thousands of those a second.

Spatial indexes solve this in two ways. Trees, the quadtree, the k-d tree and the R-tree, keep the geometry and prune whole regions that cannot contain an answer. Cell systems, geohash, S2 and H3, turn a location into a cell ID, so an ordinary sorted set, B-tree or hash map does the storage, and a query becomes a handful of ID lookups.

First, why the obvious index fails. Put drivers in a B-tree on latitude and ask for everyone within 500 metres of a rider. The index returns a band one kilometre tall across the whole region, and every row in it must then be filtered by longitude. With drivers spread evenly over a 30 by 30 kilometre area, that band holds a thirtieth of them: about 16,700 rows read to find about 556. A composite index on latitude then longitude is no better, because it sorts by latitude first.

## Trees that prune

A quadtree covers a square. A leaf holds a few points; when one too many arrives, it splits into four equal quadrants and pushes its points down. Density decides depth: a quiet suburb stays one big leaf, a busy station subdivides. A box query skips every square the box misses.

The maximum depth is not decoration. Insert two points within a few thousandths of a unit of an existing one, and the leaf keeps splitting until they separate: in the lesson's example, depth 14. Three copies of the same point never separate, and without a depth cap the insert recurses until the stack overflows. The right outcome is a deepest leaf that holds more than its capacity.

A k-d tree is a binary search tree whose comparison changes with depth: the root compares x, its children compare y, the next level x again. Built from a fixed set, each node is the median along its axis, so the tree is balanced.

The heart of it is nearest-neighbour search. Walk down to the region that contains the query, keeping the best distance so far. On the way back up, at every node, ask one question: is the splitting line closer to the query than the best distance? If not, nothing on the other side can win, and the whole far subtree is skipped.

Here is the case that shows why the question cannot be skipped. The query is at 5.5, 7.5. The root is the point 6, 8, which splits on x equals 6, and it is 0.707 away. That root turns out to be the answer. But the line x equals 6 is only half a unit from the query, less than 0.707, so the far side must still be searched: a point just across the line could have been closer. Only the geometry proves the answer. In the lesson's ten-point example, the search computes five distances instead of ten.

Two limits. The worst case is still linear, with every splitting line close to the query, and in high dimension that becomes the typical case. And on raw latitude and longitude a k-d tree measures degrees, not metres, so project first. Inserting after the build unbalances the tree, and production k-d trees are rebuilt, not rebalanced, because a rotation would break the alternating-axis rule.

## R-trees and PostGIS

Quadtrees and k-d trees partition space: every point belongs to exactly one region. Roads, parcels and delivery zones are shapes, and a shape can straddle any split line. The R-tree, from 1984, partitions the data instead. It is a B-tree for rectangles. Every entry stores a minimum bounding rectangle around its child's contents, and sibling rectangles may overlap. That is both the flexibility and the cost: a query descends into every child whose rectangle meets the query box, so overlap means several root-to-leaf paths.

Insertion picks, at each level, the child whose rectangle grows least to take the new one. When a node overflows, the split decides how much the halves overlap. Guttman's quadratic split seeds the two groups with the pair of rectangles that would waste the most area if kept together: the area of their joint box minus their own areas. In the lesson's trace, two small squares in opposite corners waste 82 units and become the seeds; the rest join whichever group they enlarge less, and the two resulting groups do not overlap at all. Production versions go further: the R-star tree reinserts about 30 percent of the entries on the first overflow, and bulk loading sorts a static dataset into nearly full, barely overlapping leaves in one pass.

PostGIS indexes geometry with GiST, and its 2D operator class stores a bounding box per entry and uses area enlargement as the cost of an insert. A GiST geometry index is an R-tree on disk pages. It is lossy by design: it knows boxes, not shapes. A radius or intersection query tests boxes in the index, then rechecks the exact geometry of each candidate. Filter, then refine. A classic trap: comparing a distance function against 500 cannot use the index at all. The DWithin function adds the indexable box test.

## Geohash and the edge of the cell

Geohash turns a location into a string. Halve the longitude range and the latitude range alternately, longitude first, writing 1 for the upper half and 0 for the lower, and pack every five bits into one character of a 32-letter alphabet.

Say the first two bits for the Eiffel Tower, at 48.86 degrees north and 2.29 east. Longitude 2.29 is at least zero: 1. Latitude 48.86 is at least zero: 1. Keep halving, and the first five bits make the letter u. Nine characters make a cell 4.8 metres tall and 3.1 metres wide at that latitude.

Interleaving bits traces a Z-order curve, and its useful property is the prefix. Every point inside a cell has a geohash that starts with that cell's string, so "everything in this cell" is one range scan on any B-tree or sorted set, and shorter prefixes are coarser cells.

The converse does not hold. Points that are close need not share a prefix. Take two points near London, 208 metres apart on either side of the Greenwich meridian. One encodes starting with g, c, p; the other starting with u, 1, 0. They share no character at all, because the very first bit, longitude above or below zero, differs. A shared prefix implies proximity. Proximity does not imply a shared prefix.

So a radius search picks a precision whose cell is at least as large as the radius, and searches the cell containing the query plus its 8 neighbours: nine range scans, then an exact distance filter. It over-reads. With square cells as wide as the radius, the block holds about 2.9 times the candidates you keep; with cells twice as wide, 11.5 times. Whole characters make it coarse: a 160-metre radius cannot use the 153-metre cells and falls back to cells 611 metres by 1.2 kilometres at the equator. And cell width shrinks with latitude, so a precision chosen at the equator is twice too narrow at 60 degrees.

## Redis, S2 and H3

Redis has no spatial tree. Its geo-add command stores the member in an ordinary sorted set, scored by a 52-bit interleaved geohash: 26 bits of longitude and 26 of latitude, which a double holds exactly. Latitude is limited to about 85 degrees either side of the equator, the Web Mercator bounds, and at the equator the finest cell is about 60 centimetres by 28. A radius search picks how many bits per axis make a cell at least as large as the radius, turns the query's cell and its 8 neighbours into score ranges, scans each range in the skip list, and filters by exact great-circle distance. It steps one bit per axis instead of one character, which keeps the cell side between the radius and twice the radius.

S2, Google's library, projects the sphere onto the six faces of a cube and orders each face's cells along a Hilbert curve instead of a Z. On a Hilbert curve, consecutive cells always share an edge, so a compact region maps to fewer, longer ranges. A cell ID is a 64-bit integer, and a parent's ID range contains all its descendants. A query region becomes a covering of at most 8 cells by default, of mixed sizes, so a radius search is up to eight range scans on any ordered store. CockroachDB keys its spatial indexes by S2 cells this way.

H3, which Uber open-sourced in 2018, tiles the sphere with hexagons at 16 resolutions, each about seven times finer than the last, plus exactly 12 pentagons at every resolution. Hexagons do not split exactly into seven children, so the hierarchy is approximate. Why hexagons? A square grid has two kinds of neighbour, four sharing an edge and four sharing only a corner, further away. A hexagon's six neighbours all share an edge and all sit at the same distance. So rings are nearly circles: one step out is 7 cells, two steps is 19. Surge pricing can blend each cell with its neighbours with no preferred direction. And hexagon areas at one resolution stay within about a factor of two, so "requests per cell per minute" compares across cells, which geohash's latitude-dependent widths do not allow.

## Moving points

Here is the decision the lesson's measurements make. On 100,000 static points: a scan took 8.6 milliseconds per query. The k-d tree took 4.8 microseconds. A grid of 250-metre cells in a dictionary, searching the 3 by 3 block, took 11.1 microseconds.

The grid loses on a static set and wins the moment drivers move. An update is a dictionary delete and insert when the cell changes, and nothing at all otherwise. At 10 metres a second, a driver crosses a resolution-9 hexagon, 350 to 400 metres across, in 35 to 40 seconds, so only about one four-second report in nine changes cell. Cheap updates in exchange for slightly dearer queries is why dispatch indexes moving vehicles with cells, and keeps trees for static geometry: roads, parcels, zones.

Two bugs to recognise on sight. Stores in Paris that show up in the Indian Ocean east of Somalia: latitude and longitude swapped, because Redis, GeoJSON and PostGIS all take longitude first. And nearest results that are wrong east to west but right north to south: Euclidean distance on raw degrees, when a degree of longitude at Paris's latitude is 73 kilometres against 111 for latitude.

## In the interview

The lesson's headline follow-up. Design "find the nearest 10 drivers" for 500,000 drivers updating every 4 seconds.

[pause]

That is 125,000 updates a second, which rules out rebuilding trees. Key drivers by H3 or geohash cell in memory, and move a driver only when its cell changes. Search widening rings until ten candidates lie within the proven radius, filter by exact or road distance, and shard by coarse cell, splitting hot cells such as a stadium or an airport. The wrong answer is a k-d tree over all drivers, which must be rebuilt as they move.

And a short one. Why does a k-d tree stop helping for 768-dimensional embeddings?

[pause]

In many dimensions the query ball crosses more splitting planes, and beyond roughly 10 to 20 dimensions it crosses almost all of them, so pruning fails and the search visits most nodes. Embeddings use approximate graph indexes such as HNSW, or quantisation. "Use a deeper tree" is the wrong answer.

## Recap

Five things. A one-dimensional index on latitude reads a whole band; spatial indexes either prune regions with a tree or linearise space into cells. The k-d tree's pruning test is whether the splitting line is closer than the best distance so far. R-trees store shapes as possibly overlapping rectangles, and PostGIS is an R-tree that filters on boxes and then rechecks. A shared geohash prefix implies proximity but not the reverse, so search the cell plus its 8 neighbours, then filter exactly. And use cells for moving objects, trees for static shapes.

At your desk: the quadtree, k-d tree and R-tree traces, the geohash encoding bit by bit with its cell sizes and neighbour block, the Redis and PostGIS details, the cost and trade-off tables, and the two exercises.

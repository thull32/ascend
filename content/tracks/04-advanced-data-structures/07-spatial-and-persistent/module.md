---
slug: spatial-and-persistent
title: Spatial and persistent structures
description: Quadtrees, k-d trees, R-trees and geohash/S2/H3 cells for nearest-neighbour and range queries on locations, and persistent structures (path copying, fat nodes, HAMTs, Git's object model) that keep every old version for the price of the changes.
prerequisites: [advanced-data-structures/balanced-trees]
---
A B-tree answers "which rows have a key between 10 and 20" because keys sit on a line. Locations do not: "the ten drivers nearest this rider" asks about two dimensions at once, and an index on latitude alone returns a band across the whole city. The first lesson builds the structures that make two-dimensional queries cheap. Quadtrees and k-d trees split space itself; R-trees group rectangles and let them overlap; geohash, S2 and H3 turn the plane into cell IDs so that a sorted set or a hash map can do the work. You will trace a quadtree split, a k-d tree nearest-neighbour search with its pruning, an R-tree quadratic split, and a real latitude and longitude encoded into a geohash bit by bit, and then open Redis GEO and PostGIS to see which of these they use.

The second lesson is about time rather than space. A persistent structure keeps every previous version readable after an update, and it does so without copying: an insert into a balanced tree copies the handful of nodes on one root-to-leaf path and shares the rest. You will count the copied and shared nodes of a path-copying insert, trace the bitmap-and-popcount lookup inside the hash array mapped tries of Clojure, Scala and Immutable.js, and see Git's object store as the same idea applied to directories, with the memory costs measured.

Both lessons build on [balanced search trees](/learn/advanced-data-structures/balanced-trees/avl-trees) and [tries](/learn/data-structures/tries-and-string-structures/tries), and both end in systems you already use: ride-sharing dispatch, map search, undo, snapshots and version control.

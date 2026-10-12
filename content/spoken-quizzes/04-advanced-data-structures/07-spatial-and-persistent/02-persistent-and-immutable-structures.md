---
lesson: persistent-and-immutable-structures
source: f381b452e9e26fb0
---
## 1

You insert 16, with path copying, into a perfect binary search tree holding 1 to 15. How many nodes does the new version allocate, and how many does it share with the old one?

A, 16 new, and none shared. B, 5 new, and 11 shared. C, 4 new, and 12 shared. D, 1 new, and 15 shared.

[think]

The answer is B: 5 new, and 11 shared.

The search path is 8, 12, 14 and 15; each is copied so it can point to the new child, and the new leaf, 16, is allocated: 5 nodes. The subtrees under 4, 10 and 13, 11 nodes in all, are shared. Allocating only the leaf would mean changing node 15 in place, which would alter the old version.

## 2

A HAMT node's bitmap has slots 9, 17, 21 and 23 set. Where in the node's compact array is slot 21's entry?

A, at index 1, since one occupied slot lies above 21. B, at index 3, since three slots are occupied in total. C, at index 21, since the slot number is the position. D, at index 2, since two occupied slots lie below 21.

[think]

The answer is D: at index 2, since two occupied slots lie below 21.

The compact array stores only occupied slots, in order, so an entry's position is the count of set bits below its slot, which here counts slots 9 and 17. Using the slot number directly would need a 32-entry array, which is exactly what the bitmap exists to avoid.

## 3

Compared with path copying, what do fat nodes trade?

A, faster pointer reads, for linear space on every update. B, constant space per update, for log m work on every pointer read. C, full persistence, for a cap on how many versions exist. D, cheaper updates, for needing a tracing garbage collector.

[think]

The answer is B: constant space per update, for log m work on every pointer read.

Each field keeps a list of modifications, each a version and a value, so an update adds one record instead of copying a path. But every read must find the right record, a binary search over m modifications. Fat nodes put no cap on versions, and the same paper extends them to full persistence with an ordered version list.

## 4

A commit changes only the file main dot py, inside the folder app, inside the folder src, and every other file is untouched. How many new objects does Git create?

A, 2: a new blob and the new commit. B, 5: a blob, three trees and the commit. C, all of them: a full snapshot per commit. D, 1: a delta against the parent's blob.

[think]

The answer is B: 5, a blob, three trees and the commit.

The new file content is a new blob. The app folder, the src folder and the root tree must each list a new child hash, so each gets a new tree, and the commit names the new root. Every other blob and tree is shared by hash. Deltas exist only in packfile compression, below the object model.

## 5

Why is appending to a Python tuple, by adding a one-element tuple to it, not an efficient persistent update?

A, tuples are mutable, so the old version changes as well. B, it shares the old tuple, so later edits leak back into it. C, it raises a type error, because tuples cannot be extended. D, it copies all n references, so every version costs order n.

[think]

The answer is D: it copies all n references, so every version costs order n.

The tuple is immutable, so the old version is safe, but nothing is shared: the new tuple holds a fresh copy of every reference, 3.1 milliseconds for a million elements in the lesson's measurement. Persistence needs structural sharing as well as immutability.

## 6

An LMDB database file keeps growing, although the amount of live data is stable. What is the most likely cause?

A, one new meta page is appended for every committed write. B, a long-lived read transaction pins an old root and its pages. C, the B plus tree never merges pages that become half empty. D, path copying doubles the space used by every write.

[think]

The answer is B: a long-lived read transaction pins an old root and its pages.

Pages replaced by copy-on-write can be reused only when no reader still holds a root that reaches them. One old read transaction keeps them all alive, so new writes take fresh pages. A write copies one root-to-leaf path, not the file, and LMDB alternates between two meta pages.

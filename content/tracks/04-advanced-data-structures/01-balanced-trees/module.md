---
slug: balanced-trees
title: Balanced search trees
description: AVL, red-black, B-tree and randomised structures, with the rotation mechanics, height proofs and the reasons each one won its niche in standard libraries, databases and Redis.
prerequisites: [data-structures/trees]
---
A binary search tree is only as good as its shape. Insert sorted keys and the O(log n) promise turns into a linked list. Every ordered container you use in production, from `std::map` and Java's `TreeMap` to the B+ tree behind a Postgres index and the skip list behind a Redis sorted set, is a scheme for keeping the shape under control without paying more than O(log n) per write to do it.

This module builds the four families you actually meet. AVL trees are the strictest and the cleanest to reason about, so they come first: balance factors, the four rotation cases, and why the height stays under 1.45 log n. Red-black trees relax the rule to cut rotations and are what standard libraries chose. B-trees and B+ trees widen each node to a disk page, which is why every database index is one. Treaps, skip lists and splay trees replace bookkeeping with randomness or access-driven restructuring, and one of them is inside Redis.

By the end you will be able to derive the height bound of each structure, execute a rotation on paper, explain why a database picks a B+ tree over a red-black tree with numbers, and answer the follow-up a senior interviewer asks after "use a balanced BST".

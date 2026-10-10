---
lesson: binary-search-trees
source: 74151a27f46a5012
fit: partial
desk:
  - "The eight-key example tree, and the hand trace of its eight inserts"
  - "The search, insert and delete code, with the three-delete trace and the tree after each step"
  - "Successor versus predecessor deletion, drawn side by side"
  - "The two validators as code, with their bound and inorder traces, and the duplicates rule"
  - "The ordered-query table, the successor trace and the subtree-size descent"
  - "The cache-misses-per-lookup and ordered-structure trade-off tables"
  - "Exercises: validate a BST, and build, delete and report preorder"
---
## Introduction

A hash table finds a key in constant time, but it cannot tell you the smallest key, the next key after 42, or every key between 100 and 200. A sorted array answers all of those with binary search, but inserting into it costs order n. You want both: ordered queries and cheap updates. The binary search tree gives you both at order h, the height of the tree, and the entire engineering question is what h turns out to be.

Three ideas. The invariant, stated correctly, and the validation bug that comes from stating it wrong. The three cases of delete. And why sorted input turns this whole structure into a linked list, which is why nobody ships a plain one.

## The invariant

A binary search tree is a binary tree where, for every node, every key in its left subtree is smaller than the node's key, and every key in its right subtree is larger. Not the children: the entire subtrees. That one word is the source of the most common bug, and it comes back in a moment.

Build a small one by inserting 50, 30, 70, 20 and 40, in that order. 50 becomes the root. 30 is smaller, so it goes left. 70 is larger, so it goes right. 20 goes left at 50 and left at 30. 40 goes left at 50 and right at 30. So the root is 50, with 30 on the left and 70 on the right, and under 30 sit 20 and 40.

Because of the invariant, an inorder walk, left, node, right, visits the keys in ascending order: 20, 30, 40, 50, 70. That single fact gives you sorted iteration, minimum and maximum as the leftmost and rightmost node, the k-th smallest, successor and predecessor, and range queries, all from one walk.

One decision before any code: duplicates. The invariant as stated forbids equal keys, so you need a policy. Forbid them, as every ordered map does with its keys. Keep a count per node, which gives a multiset. Or send equal keys to one side, which is cheapest to write but means insert, delete and validation must all agree on which side. In an interview, say "no duplicates, and here is the one-line change if they go right".

## Search and insert

Search compares the target with the current node and goes left or right, discarding a whole subtree each step. Search the five-node tree for 40: at 50, go left; at 30, go right; at 40, found. Three nodes. Search for 45 and you follow the same path, then step right from 40 into nothing. Absence is only discovered when you fall off the tree, never earlier.

Insert is the same walk, then attaching a new leaf where the search fell off. New keys always become leaves, and the existing structure is never rearranged. That has a consequence worth saying out loud: the first key you insert is the root forever. The insertion order decides the shape.

The recursive insert returns the subtree root, possibly a new one, and the parent reassigns its child pointer. "Return the new subtree root" is the standard way to write tree mutations without parent pointers, and delete uses it too.

## Delete, the three cases

Delete is where this code gets hard, because removing an internal node leaves a hole that must be filled without breaking the invariant. Find the node, then one of three cases.

First, a leaf: remove it, and the parent's pointer becomes empty. Second, one child: splice the node out, so its parent points straight at that child. That is safe because the child's whole subtree was already on the correct side of the parent.

Third, two children. You cannot remove the node without orphaning a subtree. So copy in the value of its in-order successor, the minimum of its right subtree, and then delete that successor from the right subtree.

Before I go on: why does that second delete never hit the two-children case again?

[pause]

Because the successor is the leftmost node of the right subtree, so by definition it has no left child. Deleting it is always case one or case two. On the five-node tree, delete the root, 50. Its right subtree is just 70, so the successor is 70. Copy 70 into the root and remove the old 70, a leaf. Now the root is 70, with 30, 20 and 40 on its left, and the inorder walk reads 20, 30, 40, 70. Still sorted, which is the check to run in your head after any mutation. The cost is order h to find the node plus order h for the successor walk.

You could equally use the in-order predecessor, the maximum of the left subtree. Always using the successor takes nodes only from right subtrees, and over a long run of random inserts and deletes that asymmetry skews the tree: Eppinger's 1983 simulations, and Culberson and Munro's later analysis, found the average depth growing over time. Alternating keeps it logarithmic. Almost nobody bothers, because almost nobody ships an unbalanced tree.

## Validation, the bug everyone writes first

"Is this a valid binary search tree?" is asked constantly, because the obvious answer is wrong. The obvious answer checks each node against its children: left child smaller, right child larger.

Picture this tree. The root is 10, with 5 on the left and 15 on the right. Under 15, on the left, sits 6. Every parent and child pair is consistent: 6 is smaller than 15. But 6 is in the right subtree of 10, and it is smaller than 10. The damage is concrete. Search for 6: at 10, 6 is smaller, go left; at 5, go right; nothing there. The tree contains 6 and cannot find it. And the inorder walk reads 5, 10, 6, 15, unsorted, so every ordered operation is wrong too.

The fix is the invariant as stated: every node must lie inside the range set by all of its ancestors. Pass a lower and an upper bound down the recursion. Going left, the upper bound becomes the current value. Going right, the lower bound does. On the bad tree, 6 arrives with a lower bound of 10 and an upper bound of 15, and fails immediately. Use an empty value for "no bound" rather than a sentinel, because a sentinel like the smallest integer fails when a key equals it.

The alternative is an inorder walk that checks each value is strictly greater than the one before, using the iterative stack so a deep tree does not overflow. On the bad tree it fails at the third visit, when 6 follows 10. Both are order n time, order h space, and stop at the first violation. With duplicates allowed on one side, the comparison on exactly that side becomes non-strict, or the validator rejects trees the insert code built.

## The degenerate tree

Everything so far is order h. Now insert 1, 2, 3 and so on, in order. Every key is larger than everything before it, so every insert goes right. Seven keys take 21 comparisons, and in general n times n minus 1, over 2. For a million sorted keys, that is 5 times 10 to the 11 comparisons, and the result is a chain of height n minus 1. Search, insert and delete are now order n, and the recursive insert overflows CPython's 1,000-frame stack long before the million.

This is not contrived. Auto-increment IDs, timestamps, log lines and sorted exports all do it to a naive tree.

Random order, on the other hand, is fine. For uniformly random insertion, the average node depth is about 2 times the natural log of n, and the height about 4.3 times it. One simulated shuffle of a million keys gave an average depth of 24 and a height of 49, against 19 for a perfectly balanced tree and 999,999 for a chain. So a random tree is only about 1.3 times deeper than optimal. The point is who controls the order. Production data is rarely random, and a tree whose speed depends on the order clients send keys is a latent incident.

Three responses. Shuffle before bulk-loading. Build from a sorted array by recursively picking the middle element, perfectly balanced in order n. Both only work offline. Or use a self-balancing tree that restructures on every insert and delete, which is the next lesson. Every standard library's ordered map is self-balancing.

## Ordered queries and real libraries

Given the invariant, the queries a hash table cannot answer are short walks. Floor, the largest key at most x: walk down, and remember the node every time you turn right. Ceiling is the mirror. The successor of a key is the minimum of its right subtree, or, if it has none, the last ancestor where you turned left. On the five-node tree, the successor of 40: turn left at 50, remembering 50, go right at 30, find 40 with no right subtree. The answer is 50.

The interview upgrade is subtree sizes. Store in each node the size of its subtree, and keep it updated. Then the k-th smallest is a single descent: if the left subtree holds s nodes, the answer is on the left when k is at most s, is this node when k is s plus 1, and otherwise is further right. Rank and range counts fall out the same way, all in order h. That is an order-statistic tree.

Where do these trees really live? Java's TreeMap and C++'s map are red-black trees with parent pointers, about 40 to 48 bytes per node, plus the key and value. Rust's BTreeMap is a B-tree on purpose: nodes of up to 11 keys, so a million-entry lookup visits 6 or 7 nodes instead of 20 or more, because memory misses, not comparisons, dominate an in-memory ordered map. Roughly, a red-black tree takes around 10 memory misses per lookup at a million keys, about a microsecond; a B-tree around 4. And in Python, with no balanced tree in the standard library, a sorted list with bisect wins below about 100 thousand elements, because its order n insert is a memory move of microseconds.

## In the interview

A follow-up the lesson expects. The k-th smallest works with an inorder walk. Now the tree changes constantly and you need it repeatedly.

[pause]

Augment each node with its subtree size, maintained on the way back up from insert and delete, and through rotations in a balanced tree. The k-th smallest and rank become order h descents. The wrong answer is caching the inorder list and rebuilding it on every change, which is order n per update.

And another: a Java TreeMap whose key's comparison uses a field you later mutate starts saying keys are missing that iteration still prints. Why? Searches turn the wrong way at nodes whose keys now break the invariant, while iteration follows pointers, not comparisons. The comparator must be a total order on immutable fields.

## Recap

Four things to remember. The invariant is about whole subtrees, not children, so validate with ancestor bounds or a strictly increasing inorder walk. Delete has three cases, and the two-children case copies the successor, which never has a left child. Every operation is order h, and sorted input makes h equal to n minus 1, so use a self-balancing tree. And reach for a search tree only when the queries are ordered: floor, ceiling, range, k-th; augment with subtree sizes for rank.

At your desk: the eight-key tree with its insert and delete traces, the code, the two validators, the ordered-query traces, the library tables, and the two exercises.

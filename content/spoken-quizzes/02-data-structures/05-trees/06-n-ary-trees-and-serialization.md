---
lesson: n-ary-trees-and-serialization
source: d97cd02cb1c1151b
---
## 1

A colleague proposes serialising a binary tree as its preorder traversal, with values only. What is the problem?

A, different trees share a preorder, so it cannot be rebuilt. B, it fails on duplicate values, but is fine for distinct ones. C, preorder costs n log n, too slow for large trees. D, preorder emits the root last, so the root cannot be found.

[think]

The answer is A: different trees share a preorder, so it cannot be rebuilt.

A root with only a left child and a root with only a right child produce the same sequence of values, even with all values distinct, so the tree cannot be rebuilt exactly. Null markers, or a second traversal, resolve the ambiguity; markers are simpler, and also survive duplicate values. Preorder is linear, and it emits the root first.

## 2

A preorder serialisation with null markers, of a binary tree with 1,000 nodes, contains how many tokens?

A, anywhere from 1,000 to 2,001, depending on shape. B, 1,000, one token per node only. C, 2,001, one per node and one per null. D, 1,999, one per node and one per edge.

[think]

The answer is C: 2,001, one per node and one per null.

Every binary tree with n nodes has exactly n plus 1 empty child pointers, whatever its shape. So the encoding has n, plus n plus 1, tokens: 2 n plus 1. The edges, n minus 1 of them, are implied by the order and never emitted.

## 3

You have 200 thousand rows, each with an id and a parent id, and you need each node's depth. Which approach is linear?

A, build children lists in one pass, then run a breadth-first search, assigning depths. B, for each node, follow parent ids up to the root and count. C, issue one database query per node, to fetch its parent's depth. D, sort by parent id, then binary search for each node's children.

[think]

The answer is A: build children lists in one pass, then run a breadth-first search, assigning depths.

Following parents from every node costs n times the depth, which is quadratic on a chain. Building the children lists, then one breadth-first search from the root, where each depth is the parent's depth plus 1, touches each node a constant number of times. Memoising the walk up also reaches linear time, but the breadth-first search is the standard form.

## 4

You check whether tree s is a subtree of tree t by testing whether the serialisation of s is a substring of the serialisation of t. What does that require?

A, the same traversal order for both, and nothing more. B, null markers, plus a delimiter before every value. C, distinct values, so each value matches at most once. D, both trees to be binary search trees, so values appear in sorted order.

[think]

The answer is B: null markers, plus a delimiter before every value.

Without markers, the shapes are ambiguous, and without delimiters, the digits of one value can match inside another, like 2 inside 12. So a shared traversal order alone is not enough. With both, the encoding of s appears as a contiguous block in the encoding of t exactly when s matches a subtree.

## 5

A directory-size tool walks the tree by name and reports a total larger than the disk. What is the most likely cause?

A, hard links: several names reach one inode, so its size is added once per name. B, the directory entry cache returns stale sizes for recently written files. C, symbolic links: the walk follows them into other directories and loops. D, path components longer than 255 bytes are counted twice by the kernel.

[think]

The answer is A: hard links, where several names reach one inode, so its size is added once per name.

The file system is a tree of directories, but a DAG of files: a hard link is a second directory entry for the same inode. A tool that sums by name counts a multiply-linked file once per link, which is why GNU du tracks the inodes it has seen and counts each once. Symbolic link loops cause hangs or errors, not inflated totals, and name length and the directory cache do not affect sizes.

## 6

A service parses JSON documents supplied by clients with a recursive-descent parser and no depth limit. What is the realistic failure?

A, deep documents parse correctly, but the resulting tree cannot be serialised back. B, a document nested 100 thousand deep, about 200 kilobytes, overflows the parser's stack and kills the worker. C, documents with duplicate keys produce an ambiguous tree that fails validation. D, deeply nested arrays take quadratic time to parse, because each level rescans the input.

[think]

The answer is B: a document nested 100 thousand deep, about 200 kilobytes, overflows the parser's stack and kills the worker.

Recursion depth equals nesting depth, which the sender chooses. CPython's JSON decoder fails at a depth in the tens of thousands, and a native parser without a limit crashes. Parsing stays linear, and duplicate keys are a question of meaning, not a crash. The fix is a nesting limit in front of the parser, as Jackson enforces by default since version 2.15, or a decoder with an explicit stack.

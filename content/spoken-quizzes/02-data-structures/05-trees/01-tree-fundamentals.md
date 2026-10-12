---
lesson: tree-fundamentals
source: 69b61c86f36a0793
---
## 1

A binary tree has 1,023 nodes. Counting height in edges, what are the minimum and maximum possible heights?

A, 9 and 511. B, 9 and 1,022. C, 10 and 1,023. D, 10 and 1,022.

[think]

The answer is B: 9 and 1,022.

1,023 is 2 to the 10, minus 1, so a perfect tree holds exactly that many nodes in 10 levels, which is a height of 9 edges. The maximum is a chain, where every node has one child: 1,022 edges. The answer of 10 and 1,023 counts nodes, not edges.

## 2

Your height function returns 0 for an empty tree, and otherwise 1 plus the larger of the two children's heights. What does it compute?

A, the depth of the shallowest leaf, counted in nodes. B, the height in edges on the longest root-to-leaf path. C, the size of the tree, counting the root as 1. D, the height in nodes on the longest root-to-leaf path.

[think]

The answer is D: the height in nodes on the longest root-to-leaf path.

With a base case of 0, a single node returns 1, so the function counts the nodes on the longest path. To count edges, the base case must be minus 1, so that a leaf returns 0. Both are valid conventions; mixing them is the bug.

## 3

You run the recursive height function on the lesson's nine-node tree, whose height is 3 edges. How many frames are on the stack at its deepest point, and how many calls are made in total?

A, 9 frames and 19 calls, one per live node. B, 4 frames and 18 calls, two per node. C, 5 frames and 19 calls, two per node plus one. D, 3 frames and 9 calls, one per node.

[think]

The answer is C: 5 frames and 19 calls, two per node plus one.

At the deepest moment, the stack holds one frame per node on the longest path, the root and three below it, plus one more for the empty child probed below the deepest leaf. Every node makes two calls, one per child pointer, including the empty ones, and the root is called once, giving 2 n plus 1, which is 19. Frames are never one per node: only the current path is alive.

## 4

Why is the level-order array layout, with the children of slot i at 2 i plus 1 and 2 i plus 2, a poor choice for a general binary tree?

A, index arithmetic is slower than following a child pointer. B, finding a node's parent needs a linear scan of the array. C, sparse or skewed trees waste exponentially many slots. D, inserting a node shifts every later index, which is linear.

[think]

The answer is C: sparse or skewed trees waste exponentially many slots.

The slot for a node at depth d is at least 2 to the d, minus 1, however few nodes exist at that depth, so a 21-node path needs about a million slots, 8 mebibytes of references in CPython. Nothing shifts on insert, and the parent is at i minus 1, halved, so the layout is ideal for complete trees, which is why heaps use it.

## 5

A recursive size function throws a recursion error in Python on a tree of 500 thousand nodes, but works on a different tree of 500 thousand nodes. What is the most likely explanation?

A, the first tree has more leaves, so more frames are live at once. B, the first tree's nodes are larger, so each frame costs more. C, the first tree is far taller, so the recursion depth passes the limit. D, the first tree is wider, so the stack must hold a whole level.

[think]

The answer is C: the first tree is far taller, so the recursion depth passes the limit.

Recursion depth equals the tree's height, not its size, leaf count or width. A balanced tree of 500 thousand nodes is about 19 deep; a chain is 499,999 deep, far past CPython's default limit of 1,000. Width matters for a breadth-first queue, not for the recursion stack. The fix is an explicit stack, or guaranteeing balance.

## 6

A Java tree node holds an int and two child references. With the JVM defaults, compressed class pointers and compressed object pointers, about how much heap does a million-node tree use, ignoring allocator rounding?

A, about 100 megabytes, since each node is an object plus a boxed value. B, about 24 megabytes, since each node is a 12-byte header plus three 4-byte fields. C, about 40 megabytes, since each node is a 16-byte header plus three 8-byte fields. D, about 12 megabytes, since each node is three 4-byte fields and nothing else.

[think]

The answer is B: about 24 megabytes, since each node is a 12-byte header plus three 4-byte fields.

The object header is 12 bytes with compressed class pointers, and with compressed object pointers each reference is 4 bytes, so a node is 24 bytes, and a million nodes is 24 megabytes. Twelve bytes per node is the figure for an arena with 32-bit indexes, which has no header. And 100 megabytes is the CPython cost, where the value is a separate boxed object.

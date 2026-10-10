---
lesson: tree-fundamentals
source: aa87c1d98f691376
fit: partial
desk:
  - "The nine-node example tree, and the terms table measured on it"
  - "The hand traces of height and size, call by call"
  - "The bytes-per-node table across CPython, Java and Rust, with its arithmetic"
  - "The representation trade-off table, the level-order decoder and the parent-array inversion code"
  - "The iterative height code with an explicit stack"
  - "Exercises: size and height from a level-order list, and count the leaves"
---
## Introduction

You have a million records and you need to find one by key. A sorted array finds it in 20 comparisons, but inserting a new record shifts half a million elements on average. A linked list inserts in constant time, but walks half a million nodes to find anything. Every structure so far has made you choose: cheap search or cheap update, never both.

A tree escapes that trade-off by giving each node more than one successor. Start at the root, and every step down throws away a whole subtree instead of a single element. If the tree is balanced, twenty steps take you from a million nodes to one. Search, insert and delete all become the same thing: walk one path from the root to a leaf. The length of that path, the height, is the number that decides whether the tree is fast or useless.

Three ideas. Why height is the only number that matters. The recursive contract every tree algorithm is built on, and what it costs in stack. And how you actually store a tree in memory, with the bytes.

## Words you must use precisely

A tree has one root. Every other node has exactly one parent and any number of children, and there are no cycles: follow parents from anywhere and you reach the root. Nodes with no children are leaves. A tree of n nodes has exactly n minus 1 edges, one per node that is not the root. A binary tree allows at most two children, left and right, and the side matters: a node with only a left child is a different tree from one with only a right child.

Interviewers use the next two words precisely, so you should too. Depth is measured from the top: the number of edges from the root down to the node. Height is measured from the bottom: the number of edges on the longest path from the node down to a leaf. The height of the tree is the height of its root.

Here is a small tree to hold in your head. The root is 8. Its left child is 3 and its right child is 10. Under 3 sit two leaves, 1 on the left and 6 on the right. Five nodes. The depth of 6 is 2. The height of 3 is 1. The height of the whole tree is 2, the path from 8 through 3 down to either leaf. The leaves are 1, 6 and 10.

One convention to pin down before you write any code. This lesson counts height in edges, so a single node has height zero and the empty tree has height minus 1. Some books count nodes instead, giving 1 and zero. Both are fine. Say which one you are using, because the base case of your recursion changes with it, and mixing them is the bug.

## Why height is the number that matters

Every operation that walks one root-to-leaf path costs order h, the height. For n nodes, the height sits between two extremes.

The minimum is the floor of log base 2 of n, a tree where every level is full except perhaps the last. A million nodes fit in height 19. The maximum is n minus 1: every node has exactly one child, a linked list wearing a tree costume. A million nodes, height 999,999.

The gap between 19 and nearly a million is the entire story of this module. Binary search trees are logarithmic only if the height stays logarithmic, and balanced trees exist to guarantee that.

So when an interviewer asks for the cost of search in a binary search tree, the answer is: order h, which is order log n if the tree is balanced, and order n if it is not. Anything shorter is a mid-level answer. Saying "log n" for a single-path operation, without saying what keeps the tree balanced, is the first thing the lesson lists as a mid-level mistake.

## The recursive contract

A binary tree is either empty, or a node with a left subtree and a right subtree, which are themselves binary trees. Because the definition is recursive, tree algorithms are recursive by default, and the pattern never changes. First, the base case: the empty tree, and the answer for nothing. Second, recurse on the left and the right subtree, and trust that those calls return correct answers. Do not trace into them while you are designing. Third, combine: this node's answer from its own value and the two sub-answers.

Height is the cleanest example. The height of nothing is minus 1. The height of a node is 1 plus the larger of its children's heights. Size is the same shape: nothing has size zero, and a node is 1 plus the size of its left plus the size of its right.

The step people skip is stating the contract in one sentence before writing the body. "Height of a node returns the number of edges on the longest path from that node down to a leaf, or minus 1 for an empty tree." If you can say that, the combine step writes itself. If you cannot, you end up with a function that half returns and half mutates a global, and the interviewer notices.

Run height on the five-node tree. The leaves 1, 6 and 10 each see two empty children, minus 1 and minus 1, and return zero. Node 3 returns 1 plus the larger of zero and zero, so 1. The root returns 1 plus the larger of 1 and zero, so 2. Correct.

Two numbers fall out of that walk, and interviewers like them. Every node makes two calls, one per child pointer, including the empty ones, and the root is called once, so there are 2n plus 1 calls in total: 11 for these five nodes. And the stack is never one frame per node, only the current path: at its deepest it holds the height plus 2 frames, one for the root and one for the empty probe below the deepest leaf. Here, four. Both functions are order n time and order h space. The full call-by-call trace on the lesson's nine-node tree is at your desk.

## How to store a tree

The default is linked nodes: each node an object with a value and two child pointers. What does a node cost? In Java, with an int and two references, it is 24 bytes: a 12-byte header and three 4-byte fields. Boxed Rust nodes are also 24. In CPython it is around 100 bytes, because every node is an object with a header and every value is a separate boxed integer. And in a Rust arena, a vector of nodes holding child indices instead of pointers, it is 12. So a million-node tree costs about 12 megabytes in an arena, 24 in Java, and 100 to 140 in CPython. The common wrong answer is "three words per node", which forgets the header and the separately allocated values.

The second layout is the level-order array. Number the nodes level by level, left to right, from zero. The children of node i sit at 2i plus 1 and 2i plus 2, and its parent at i minus 1, halved and rounded down. No pointers at all. For a complete tree, where every level is full except the last, filled from the left, this is perfect: no gaps, one contiguous block. That is why binary heaps live in arrays.

For a sparse tree it is terrible. A node at depth d needs a slot index of at least 2 to the d, minus 1, however few nodes exist at that depth. A path of just 21 nodes leaning left needs about a million slots; in CPython that is 8 mebibytes to hold 21 values. The waste grows exponentially with depth, not with size. That is the answer to a favourite question: heaps are stored in arrays and general trees are not because a heap is complete. Not because "arrays are faster".

Two more layouts. A parent array stores, for each node, the index of its parent, with minus 1 for the root. Four bytes per node, and it is how most SQL schemas hold hierarchies, as a manager ID or a parent category ID. To walk down, invert it into children lists in one pass. The trap is doing it quadratically, scanning every row for "rows whose parent is me" once per node: for a 2 million row org chart, that is 4 times 10 to the 12 comparisons. And left-child, right-sibling stores any fan-out with exactly two pointers per node: a first child, and a next sibling. It is a binary tree in disguise.

## What a pointer hop costs

A linked tree turns every step down into a dependent load: the CPU cannot fetch the child until it has read the parent's pointer. If that line is not cached, it waits for main memory, on the order of 100 nanoseconds.

Work it for a balanced tree of a million 24-byte nodes. The top 12 levels, about 4 thousand nodes and 100 kilobytes, stay in cache across repeated lookups. The bottom 8 levels are different on every lookup, so each search costs about 8 memory misses, roughly 0.8 microseconds. Binary search over a sorted array of a million integers does the same 20 probes but only about 4 to 5 misses, because its first probes always hit the same addresses and its last four land inside one cache line. A B-tree with 15 keys per node needs about 5 node visits. That is why ordered structures on disk, and most in memory, fan out wider than two. A linked tree is slow because of one memory miss per hop below the cached top, not because "pointers are slow".

## The recursion depth problem

Recursion goes as deep as the tree is tall. About 22 frames on a balanced million-node tree. A million frames on a chain, and no default configuration survives that.

The numbers. CPython stops at a recursion limit of 1,000 by default; the lesson's height survived a 998-node chain and failed at 999. A native thread on Linux gets 8 mebibytes of stack, on the order of 50 to 100 thousand small frames. The JVM gives each thread 1 mebibyte by default, on the order of 10 thousand frames. Node gives JavaScript 984 kilobytes, again around 10 thousand frames.

Deep trees do not come from test fixtures. They come from data with an order. Sorted inserts, by auto-increment ID or timestamp, into a naive binary search tree build a chain. A deeply nested JSON document is a tree whose height the sender chooses. The symptom is always the same: a service that ran for months dies on one request with a stack trace a thousand frames long.

The fix is an explicit stack: move the frames onto a heap-allocated list of node and depth pairs, bounded by memory rather than a fixed thread stack. That version computed the height of a million-node chain on the same interpreter that failed at 999. The senior habit is to ask, before choosing recursion: how tall can this tree get, and who controls that?

## In the interview

The lesson's first follow-up. Your height function is recursive. What happens on a tree of a million nodes?

[pause]

It depends on the height, not the size. A balanced tree needs about 22 frames. A chain needs a million, and overflows CPython's 1,000 limit, the JVM's 1 mebibyte stack, and Node's default. Fix it with an explicit stack of node and depth pairs, and then ask why the tree is a chain. The wrong answer is "a million nodes is fine, order n is fast", which confuses time with stack depth.

And another. You are given a parent ID for 2 million rows. How do you compute each node's subtree size?

[pause]

One pass to build children lists, then one post-order pass, iterative if the hierarchy might be deep, adding each node's size into its parent. Order n in total. In the database, a recursive common table expression, never one query per node. At a millisecond a round trip, 2 million queries is 33 minutes.

## Recap

Four things to remember. Single-path operations cost order h, and log n only follows from balance, so say what guarantees it. State the recursive contract in one sentence, choose edges or nodes for height, and match the base case to it. The level-order array is perfect for complete trees like heaps and exponential waste for sparse ones; know your bytes per node, 24 in Java, about 100 in CPython, 12 in an arena. And recursion depth equals height, which the data may control, so reach for an explicit stack when a client decides the shape.

At your desk: the nine-node tree and its terms, the hand traces of height and size, the memory and representation tables with their code, the iterative height, and the two exercises.

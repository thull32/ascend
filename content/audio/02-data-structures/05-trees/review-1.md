---
review: trees
source: b8447a5fa6ac1388
---
## Introduction

Twelve questions from the trees module. Answer out loud before the answer comes.

Two from each lesson, in order: tree fundamentals, traversals, binary search trees, balanced trees, recursion patterns, and general trees with serialisation. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A binary tree has 1,023 nodes. Counting height in edges, what are the minimum and maximum possible heights?

A, 9 and 511. B, 9 and 1,022. C, 10 and 1,023. D, 10 and 1,022.

[think]

The answer is B: 9 and 1,022.

1,023 is 2 to the 10, minus 1, so a perfect tree holds exactly that many nodes in 10 levels, which is a height of 9 edges. The maximum is a chain, where every node has one child: 1,022 edges. The answer of 10 and 1,023 counts nodes, not edges.

## Question 2

A recursive size function throws a recursion error in Python on a tree of 500 thousand nodes, but works on a different tree of 500 thousand nodes. What is the most likely explanation?

A, the first tree has more leaves, so more frames are live at once. B, the first tree's nodes are larger, so each frame costs more. C, the first tree is far taller, so the recursion depth passes the limit. D, the first tree is wider, so the stack must hold a whole level.

[think]

The answer is C: the first tree is far taller.

Recursion depth equals the tree's height, not its size, leaf count or width. A balanced tree of 500 thousand nodes is about 19 deep; a chain is 499,999 deep, far past CPython's default limit of 1,000. Width matters for a breadth-first queue, not for the recursion stack. The fix is an explicit stack, or guaranteeing balance.

## Question 3

You are implementing an interpreter for arithmetic expression trees. Which traversal evaluates them correctly?

A, preorder, because the operator must be read before its operands. B, level order, since operators at one depth are independent. C, inorder, because that is how the expression is written. D, postorder, because an operator needs both operands' values first.

[think]

The answer is D: postorder.

Information flows up: a node's value is computed from its children's values, so the children must be evaluated first. Inorder gives the human-readable form, but reaches a left operand before knowing the operator. Preorder reaches the operator before either operand has a value.

## Question 4

Which of these is a real drawback of Morris traversal?

A, it needs a parent pointer on every node to climb back up. B, it mutates the tree mid-walk, so readers can see broken links. C, it only works on binary search trees, since its threads follow the sorted order. D, it takes order n log n time, since each predecessor search is order h.

[think]

The answer is B: it mutates the tree mid-walk.

Morris threads spare right pointers back to ancestors and removes them on the second visit, so a concurrent reader, or an exception in the middle, can see a cycle. Each edge is walked at most three times, so it stays order n time and constant space. And it works on any binary tree, with no parent pointers.

## Question 5

A validator checks that every left child is smaller than its parent and every right child is larger. Every tree below has a root of 10, with 5 on the left and 15 on the right, plus one more node. Which tree does it wrongly accept?

A, 5 has a left child of 12. B, 5 has a right child of 7. C, 15 has a right child of 12. D, 15 has a left child of 6.

[think]

The answer is D: 15 with a left child of 6.

6 is smaller than its parent 15, so the parent-only check passes. But 6 sits in the right subtree of 10 and must be greater than 10; a search for 6 turns left at 10 and never finds it. Only ancestor bounds catch it. 7 under 5 is a valid placement, and the two trees with 12 fail even the parent-only check.

## Question 6

The keys 1 to 100 thousand are inserted in ascending order into a plain binary search tree. Roughly how many nodes does a search for key 100 thousand visit?

A, about 23, since the average depth is 1.39 times log base 2 of n. B, about 17, since each step halves the remaining keys. C, about 50 thousand, since a search stops halfway on average. D, about 100 thousand, since the tree is a right chain.

[think]

The answer is D: about 100 thousand.

Ascending insertion builds a right chain of height 99,999, and the largest key sits at the very bottom, so the search walks every node. A balanced tree would take about 17. The logarithmic depth figures only hold for random insertion order.

## Question 7

In an AVL tree, a node has a balance factor of plus 2, and its left child has a balance factor of minus 1. Which fix is needed?

A, a single left rotation at the node, as for right-right. B, rotate right at the right child, then left at the node, the right-left case. C, a single right rotation at the node, as for left-left. D, rotate left at the left child, then right at the node, the left-right case.

[think]

The answer is D: rotate left at the left child, then right at the node.

A left-heavy node whose left child leans right is the zig-zag left-right case, and the tell is the opposite signs. A single right rotation would just move the heavy subtree to the other side and leave the mirror-image imbalance. The first rotation straightens the shape into a left-left case, and the second fixes it.

## Question 8

Why do most standard libraries use red-black trees instead of AVL trees for their ordered maps?

A, they rebalance with a bounded number of rotations per update, but allow taller trees. B, AVL trees cannot delete without rebuilding the whole tree. C, red-black trees have smaller height, so lookups need fewer comparisons. D, red-black trees store no extra data per node, so they use less memory.

[think]

The answer is A: a bounded number of rotations per update, at the price of taller trees.

AVL keeps a tighter height, about 1.44 log n against 2 log n, but may rotate at every level during a delete. Red-black fix-ups are bounded by two rotations per insert and three per delete, and are mostly recolouring. Both store one extra field per node, a height or a colour, and it is AVL, not red-black, that has the smaller height.

## Question 9

In the maximum path sum recursion, why does each node return its own value plus the larger of its two branches, rather than its value plus both branches?

A, because a path that continues up to the parent can use only one branch. B, because adding both branches would count a negative branch twice. C, because the parent adds in the other branch by itself. D, to keep the recursion order n, rather than n squared, on a chain.

[think]

The answer is A: a path that continues up can use only one branch.

A path is a simple sequence of nodes. If the parent extends this node's path, that path enters from above and can leave through at most one child; otherwise it would visit the node twice. The both-sides value only updates the global best and is never returned. Negative branches are already handled by clamping each branch at zero.

## Question 10

The bottom-up lowest common ancestor function is called with two values, and one of them is not in the tree. What does it return?

A, the node that is present, since a lone hit propagates up. B, the root, since the search reaches it with one hit. C, an error, since one recursive branch returns nothing. D, nothing, since no node gets a hit from both children.

[think]

The answer is A: the node that is present.

A node matching either value returns itself immediately, and a lone result passes up the tree unchanged, so there is no error and no empty result. With one target absent, the function returns the present one, which is wrong if the caller assumes both exist. When presence is not guaranteed, return found flags alongside the candidate.

## Question 11

A preorder serialisation with null markers, of a binary tree with 1,000 nodes, contains how many tokens?

A, anywhere from 1,000 to 2,001, depending on shape. B, 1,000, one token per node only. C, 2,001, one per node and one per null. D, 1,999, one per node and one per edge.

[think]

The answer is C: 2,001.

Every binary tree with n nodes has exactly n plus 1 empty child pointers, whatever its shape. So the encoding has n plus n plus 1 tokens: 2n plus 1. The edges, n minus 1 of them, are implied by the order and never emitted.

## Question 12

A directory-size tool walks the tree by name and reports a total larger than the disk. What is the most likely cause?

A, hard links: several names reach one inode, so its size is added once per name. B, the directory entry cache returns stale sizes for recently written files. C, symbolic links: the walk follows them into other directories and loops. D, path components longer than 255 bytes are counted twice by the kernel.

[think]

The answer is A: hard links.

The file system is a tree of directories but a graph of files: a hard link is a second directory entry for the same inode. A tool that sums by name counts a multiply-linked file once per link, which is why GNU du tracks the inodes it has seen and counts each once. Symbolic link loops cause hangs or errors, not inflated totals.

## Recap

The questions kept returning to three ideas. Height is the number that decides everything: recursion depth, search cost, and why sorted input turns a search tree into a chain, which is what balancing exists to prevent. Invariants have to be checked against the whole structure, not just neighbours: ancestor bounds for a search tree, the sign flip in an AVL zig-zag, and a path that can use only one branch going up. And shape must be made explicit: a traversal is not a serialisation without null markers, and a file system walked by name is not a tree.

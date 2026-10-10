---
lesson: tree-dfs
source: 568337c16e07fdfc
fit: partial
desk:
  - "The bottom-up, top-down and side-channel templates in Python and JavaScript"
  - "The Diameter, Validate BST and Max Path Sum traces, call by call"
  - "The iterative in-order code for Kth Smallest, and the in-order walk visualisation"
  - "The near-misses table and the variations table of what flows down, up and to the side"
  - "Exercise: count good nodes"
---
## Introduction

Almost every tree question that is not about levels is a question about subtrees. How tall is this one? Is it balanced? Is it a valid binary search tree? What is the best path through it? Does it match that other tree? A subtree is defined by its root, and the answer for a root is built from the answers for its children. That sentence is the whole of tree depth-first search.

The recursion does the traversal for you. Your only decisions are what information flows down into a call, as parameters, and what flows up out of it, as a return value. Candidates who treat depth-first search as a single trick get stuck the moment a problem needs two pieces of information at once, or when the answer to the problem is not what the recursion should return. Candidates who see it as a data-flow question write those problems in four minutes.

Three ideas, then. The question that picks the shape. The side channel, where the return value and the answer part ways. And the traps in validating a search tree, maximum path sums, and deep trees.

## The signal

Reach for tree depth-first search when the statement is about a property defined by subtrees: height, size, diameter, balanced, symmetric, same tree, subtree of another. When it is about paths and ancestors: root-to-leaf sums, good nodes with no larger ancestor, maximum path sum. When it relies on search-tree ordering: validate, kth smallest, lowest common ancestor. When it rebuilds a tree from traversals. Or when it transforms the tree in place: invert, flatten, prune.

What rules it out: levels, rows, nearest, or width, which belong to breadth-first search. A huge degenerate tree, a chain of 100 thousand nodes, in a language with a small call stack. And a graph with cycles dressed up as a tree, which needs a visited set.

Here is the single most useful question to ask yourself: to answer for this node, what do I need to know about each child? If the answer is one number, the recursion returns that number. If it is two numbers, return a pair. If the node also needs to know something about its ancestors, that becomes a parameter.

Two near misses. "Is this tree symmetric?" looks like calling same-tree on the two children, but the mirror pairs the left of one side with the right of the other; the plain comparison returns false on a symmetric tree. And "is t a subtree of s?" looks like one bottom-up pass, but the answer at a node does not combine the children's answers. It restarts a whole comparison at every node.

## Three shapes

Bottom-up, which is post-order: recurse into both children first, then combine their answers. Height is the example. The base case is 0 for a missing node, and the combine is one plus the larger child height.

Top-down, which is pre-order: compute something from the ancestors and pass it into the children. Counting good nodes is the example. You pass down the largest value on the path so far, and a node is good if its value is at least that.

The third shape is where problems become medium: bottom-up with a side channel. The return value is what the parent needs. A separate variable outside the recursion records the answer, which may be something different.

Diameter is the canonical case. The longest path between any two nodes, in edges. The diameter through a node is the left height plus the right height. But the node's parent cannot use both arms, because a path that goes down into the left child and back up cannot also continue upward. So the recursion returns the height, one arm, and records left plus right, two arms, on the side.

Say it on a five-node tree. Root 1 has children 2 and 3. Node 2 has two leaf children, 4 and 5. The leaves return height 1. Node 2 sees one and one, records a best of 2, the path 4, 2, 5, and returns 2. Node 3 returns 1. The root sees 2 and 1, records 3, the path 4, 2, 1, 3. Notice that a best of 2 was already recorded inside the left subtree before the root was considered. The answer can live entirely inside a subtree, which is why it is recorded on the side and not computed only at the root.

Every shape is linear time, because each node is visited once with constant work, and the stack is the height of the tree. A balanced tree of a million nodes is about 20 frames. A chain of a million needs a million.

But the constant combine is only constant if it rebuilds nothing. The classic wrong diameter calls a separate height function at every node. On a chain that is about n squared over 2 visits, roughly 50 million for 10 thousand nodes, and it times out. Concatenating path lists or slicing arrays in the combine does the same damage. Compute height and the answer in one pass.

## Validate a binary search tree

The trap is checking only that the left child is smaller and the right child is larger. Picture root 5 with children 1 and 7. Node 7 has children 3 and 8. Every parent and child pair looks fine. Is it a valid search tree?

[pause]

No. Node 3 is in the right subtree of 5, so it must be greater than 5, and it is not. Its own parent, 7, is perfectly happy with it. The property is about all descendants, not just children.

The clean fix passes a range down. Every node must lie strictly between a low and a high bound, and its children inherit a tightened range: the left child gets the node's value as its new high, the right child gets it as its new low. Walk it: 5 is checked against minus infinity to infinity. 7 is checked against 5 to infinity. 3 is checked against 5 to 7, and fails. Top-down bounds encode every ancestor in two numbers.

The alternative is an in-order walk with a previous value: a search tree's in-order sequence is strictly increasing, so one comparison against the previous key finds the violation. Both are linear time with stack proportional to height. Know the in-order version too, because it generalises to kth smallest, in-order successor, and recovering a tree with two swapped nodes.

And ask about duplicates before you choose strict or loose comparisons. If equal keys are allowed on the left, loosen exactly one bound: the left side becomes inclusive, the right stays strict. Making both inclusive accepts a right child equal to its parent, which that policy forbids.

## Maximum path sum and kth smallest

Maximum path sum is the diameter's shape with two twists, because values can be negative. First, an arm with a negative sum is worse than no arm, so each child's contribution is clamped at zero. Second, the answer may be a single node when everything is negative, so the best must start at minus infinity, not zero.

The lesson's tree: root minus 10, children 9 and 20, and 20 has children 15 and 7. At node 20, the arms are 15 and 7, so the path through it is 42, and it returns 20 plus 15, which is 35, to its parent. At the root, the path through it is minus 10 plus 9 plus 35, which is 34, less than 42. The answer is 42, the path 15, 20, 7, which never touches the root.

On a tree where every value is negative, starting the best at zero returns zero, an empty path, which the problem forbids. The correct answer is the largest single value. Keep the clamp on arms, because dropping a negative arm is correct, while dropping every node is not.

Kth smallest in a search tree uses in-order order, which visits keys ascending, so the kth node visited is the answer. The point is to stop after k visits rather than build the whole sorted list. An iterative in-order with an explicit stack lets you return from the middle: walk left pushing nodes, pop one, count it, then move to its right subtree. The stack only ever holds the left spine, so it is bounded by the height. Time is height plus k, and nodes after the kth are never touched.

The follow-up is always: what if the tree is modified often and queried often? Store the size of each node's left subtree. A query then walks one root-to-node path, comparing k with the left size, so both query and update cost the height. Caching the sorted list is the wrong answer, because every change rebuilds it.

## Deep trees and smaller traps

CPython's default recursion limit is 1,000 frames. Since 3.11, raising it lets pure-Python recursion go much deeper, but each frame costs memory: the lesson measured about 145 bytes per frame for a height function, so about 140 megabytes for a chain of a million nodes. Node's default stack allows on the order of 10 thousand frames, and an online judge will not let you raise it. So raising the limit moves the failure from an exception to memory pressure. The portable fix is an explicit stack.

Path Sum Two has a classic bug: every recorded path comes out identical, usually empty. The path list is shared across the recursion, and recording it stores a reference, not a snapshot, so later pops empty it. Copy the list at the moment you record it.

Building a tree from pre-order and in-order: the first pre-order value is the root, and a value-to-index map finds it in the in-order list. Recurse on index ranges, not sliced copies, or a skewed tree costs n squared. And the map only works if values are distinct, so ask.

## In the interview

The tree is now N-ary. What changes in the diameter?

[pause]

The best path through a node uses its two tallest children. Keep the top two child heights while iterating, record their sum, and return one plus the tallest. The wrong answer sums all child heights, which counts a route through three or more children, and that is not a path.

And: subtree of another tree, in better than n times m. Serialise both trees in pre-order with null markers and a delimiter that cannot occur in values, so 12 and 2 cannot alias, then run a string search like Knuth-Morris-Pratt or a rolling hash, in n plus m. That changes the pattern from tree recursion to string matching. Hashing each subtree by its values alone is wrong, because different shapes with the same values collide.

## Recap

Four things to remember. Ask what the parent needs from each child: one number is a return value, two is a pair, something about ancestors is a parameter. When the answer differs from what the parent needs, record it on the side: diameter returns one arm and records two. Validate a search tree with bounds passed down, not children checks, and settle the duplicate policy first. Start the best at minus infinity when values can be negative, compute height and answer in one pass, and know the iterative version for deep chains.

At your desk: the three templates, the diameter, validation and path-sum traces, the iterative in-order code, the two tables, and the count-good-nodes exercise.

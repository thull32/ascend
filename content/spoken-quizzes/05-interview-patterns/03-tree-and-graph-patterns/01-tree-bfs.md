---
lesson: tree-bfs
source: 430defcd639d35ab
---
## 1

A candidate writes the breadth-first level loop in JavaScript as a for loop that runs while i is below the queue's length, and pushes children onto the queue inside it. What goes wrong?

A, the queue's length is re-read on every pass, so the levels merge together. B, the loop never terminates, since pushing keeps growing the length. C, it works, but costs n log n from the repeated length check. D, nothing; the loop ends cleanly once the queue empties.

[think]

The answer is A: the length is re-read each pass, so the levels merge.

The loop bound grows as children are pushed, so the inner loop keeps consuming into the next level, and every node ends up in one giant level. It still terminates, because the tree is finite. Capturing the size first, or building the next level in a separate array, fixes it. Python's range over the queue's length evaluates the length once, which is why the bug is language-specific.

## 2

Right Side View, on a tree whose root 1 has children 2 and 3, where node 2 has a left child, 4, and node 3 is a leaf. A solution that repeatedly follows the right child returns 1, 3. What is the correct answer?

A, 1, 4. B, 1, 3. C, 1, 3, 4. D, 1, 2, 4.

[think]

The answer is C: 1, 3, 4.

The third level contains only node 4, in the left subtree, and it is visible from the right because nothing on that level blocks it. The view is the last node of each level, not the right spine.

## 3

Why is one plus the smaller of the two children's minimum depths wrong for Minimum Depth of a binary tree, and which fix is cleanest?

A, it counts the root twice, so start the count at zero. B, a missing child counts as zero, so treat it as infinity, or use breadth-first search. C, it is correct as written, and no fix is needed at all. D, it is quadratic from repeated calls, so memoise the depths.

[think]

The answer is B: a missing child counts as zero, so treat it as infinity, or use breadth-first search.

The minimum depth of an empty child is zero, so a node with only a right child returns 1, even though it is not a leaf. Either exclude the missing side from the minimum, or search breadth-first and return at the first leaf dequeued, which also stops early. The recursion visits each node once, so memoising fixes nothing.

## 4

A binary tree is a single chain of 100 thousand nodes, each with only a right child. You need the values grouped by depth. Which traversal is the safer choice, and why?

A, recursive depth-first search, because it uses less memory than a queue on a chain. B, either one, since both use linear extra memory on a chain. C, breadth-first search, because its queue holds one node, not 100 thousand stack frames. D, neither, until the tree is converted to an array first.

[think]

The answer is C: breadth-first search, because its queue holds one node at a time.

Breadth-first memory is proportional to the widest level, which is 1 here. Recursive depth-first search goes as deep as the chain is long, and that overflows the call stack in Python and most JavaScript engines. On a wide, balanced tree the comparison flips: the queue holds about half the nodes, and the recursion only log n frames.

## 5

A breadth-first deserialiser reads the tokens 1, 2, 3, null, null, 4, 5, then four more nulls. A candidate advances the token index by one, not two, whenever a dequeued parent's first token is null. What happens?

A, only the last level of the tree is lost, and the rest is fine. B, the tokens shift by one, so later children attach to the wrong parents. C, the tree is rebuilt correctly, since a null carries no data. D, an exception is thrown as soon as the first null is read.

[think]

The answer is B: the tokens shift by one, so later children attach to the wrong parents.

Every dequeued node owns exactly two tokens. Consuming only one leaves the second null to be read by the next parent, which shifts every later token by one and misattaches all the later children. The invariant is that queue order and token pairs advance together.

## 6

The interviewer asks for every node at distance k from a given target node in a binary tree. Why does the tree breadth-first template not apply directly, and what is the fix?

A, it applies directly: run the level loop from the target and take level k. B, the tree must first be converted to a binary search tree so that distance is well defined. C, breadth-first search cannot count distance; only a recursive depth-first search can. D, distance runs through parents too, so build a parent map, then search outward with a visited set.

[think]

The answer is D: distance runs through parents, so build a parent map first.

Nodes at distance k can sit above the target, or in a sibling subtree, reachable only by an upward step that tree nodes do not provide. One depth-first pass records each node's parent. Then a breadth-first search from the target expands left, right and parent, with a visited set, because the parent edge turns the tree into a graph. A downward-only search misses every node reached through an ancestor.

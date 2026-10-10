---
lesson: tree-recursion-patterns
source: 60fa7119e07c0b4f
fit: partial
desk:
  - "The nine-node example tree with negative values, and the top-down versus bottom-up table"
  - "The good-nodes and path-sum code, with their visit-order traces"
  - "The diameter code and its per-node table, and the counted cost of the naive version"
  - "The tuple-returning is-balanced and the max-path-sum trace, row by row"
  - "The LCA code, its traces, the safe version with found flags, and the binary-lifting table"
  - "Building a tree from preorder and inorder, and the same-tree and symmetric code"
  - "Exercises: diameter of a binary tree, and lowest common ancestor"
---
## Introduction

Nearly every binary tree interview problem, and there are dozens, is solved by one recursive function. Diameter, path sums, lowest common ancestor, good nodes, symmetric trees: the problems feel different, but the code has only two shapes. The skill is recognising which shape a problem wants before you write a line. Get it right and the function is ten lines. Get it wrong and you end up with helpers calling helpers, a global counter, and order n squared runtime.

Three ideas. The two directions information can flow. Returning a tuple so one pass does the work of two, and the three rules behind every path problem. And lowest common ancestor, including the case where it silently lies.

## Two directions of information

A recursive call on a node has two sources of information: what its ancestors pass down as arguments, and what its children return up as results.

Top-down recursion passes context down. The node uses its ancestors' information to decide something about itself, then recurses. Depth, the path so far, a running maximum, the bounds in binary search tree validation. Bottom-up recursion returns a summary of each subtree, and the node combines its children's summaries with its own value. Height, size, is-balanced, diameter, maximum path sum.

So the question to ask in the first minute is: can a node answer knowing only its ancestors? Then it is top-down. Does it need facts about its descendants? Then it is bottom-up.

Here is a tree to carry through this episode. The root is minus 10. Its left child is 9, a leaf. Its right child is 20, and under 20 sit two leaves, 15 on the left and 7 on the right. Five nodes.

A top-down example: count the good nodes, those whose value is at least every value on the path from the root. Each node needs one fact from above, the maximum so far. Minus 10 is good, trivially. 9 is good, since it beats minus 10. 20 is good. 15 is not, because 20 is above it, and 7 is not either. Three good nodes. When the thing you pass down is a number, passing it is free.

When the accumulator is a path, a list, the top-down pattern becomes backtracking: append before recursing, pop after. And two classic bugs live there. Record the shared path list itself instead of a copy, and every result aliases the same list, empty by the time you look. Forget the pop, and the path grows forever. One more: with negative values, you cannot stop early just because the remaining sum went negative.

## Bottom-up, and the order n squared trap

Height is the canonical bottom-up recursion, and most bottom-up problems are "height plus one more thing".

Take the diameter: the longest path between any two nodes, in edges. The longest path that bends at a node is the height of its left subtree, plus the height of its right, plus two for the edges down into each side. So the diameter is the largest of that quantity over all nodes, computed in the same pass as height. Each call returns its height to the parent and updates a running best on the side.

Why at every node, and not only the root? Because the best path does not have to pass through the root. In the lesson's nine-node tree, the longest path is six edges and bends at a node one level below the root; the root's own candidate is only five.

Now the version people write first. At every node, call a separate height function on the children, then recurse. Height walks the whole subtree. On a chain of n nodes, the subtree sizes are n, n minus 1, down to 1, so that is about n squared over 2 visits. At 100 thousand nodes, 5 billion visits instead of 100 thousand. On a balanced tree it is only n log n, which is exactly why the naive code passes the interviewer's example and dies on the skewed test. The fix is always the same: return the helper's value from the same pass.

## Returning tuples

The diameter function returns one thing and updates another as a side effect. That is acceptable if you say it out loud, but the cleaner style, the one that generalises, is to return a tuple.

Is-balanced needs each child's height and whether that child is balanced. So return both. An empty tree returns minus 1 and true. A node returns 1 plus the larger height, and balanced only if both children are balanced and their heights differ by at most one. Once any subtree reports false, nothing above can repair it, so a production version short-circuits.

The same shape validates a binary search tree bottom-up, returning valid, minimum and maximum. Each child summarises its subtree in three numbers, so the parent never re-walks it. That is the whole reason the check is order n.

## Maximum path sum, and its three rules

Maximum path sum: any node to any node, values may be negative. Each call returns the best sum of a path that starts at this node and goes down. Run it on the five-node tree, from the leaves up.

9 returns 9, and the best so far is 9. 15 and 7 return themselves. At 20, the left offers 15 and the right offers 7. A path bending at 20 is 15 plus 20 plus 7, which is 42, so the best becomes 42. But 20 returns only 20 plus 15, which is 35. At the root, the left offers 9 and the right 35: the bend at the root is minus 10 plus 9 plus 35, which is 34. Less than 42. The answer is 42, the path 15, 20, 7, which never touches the root.

Before I name the rule, think about it. Why did 20 return 35, and not 42?

[pause]

Because a path that continues up to the parent enters 20 from above and can leave through only one child. Otherwise it would visit 20 twice. So the both-sides value only updates the running best; the return carries one side.

That is the first of three rules. The second is the clamp: a child whose best downward path is negative is worth dropping, so take the larger of zero and the child's value. Without it, a root of 2 with a single child of minus 1 reports 1 instead of 2. The third: the best must start at minus infinity, not zero. On a tree of all negative values, a zero start returns zero, when the true answer is the largest single value. If you can explain those three sentences, you have understood every path problem on a tree. Largest search subtree, house robber on a tree and tree dynamic programming are this pattern with more fields in the tuple.

## Lowest common ancestor

The lowest common ancestor of p and q is the deepest node that has both as descendants, counting a node as its own descendant. Each call returns: the answer, if both are in this subtree; otherwise whichever of p or q is here; otherwise nothing. A node that gets a hit from both children is the split point.

On the five-node tree, the ancestor of 15 and 7: 15 reports itself, 7 reports itself, and 20 gets a hit from both sides, so 20 is the answer, and the root passes it up unchanged. The ancestor of 9 and 15: the left side reports 9, the right reports 15, so the root is the split point.

Now the trap. Ask for 15 and 99, where 99 is not in the tree. 15 reports itself, 20 passes it up, the root passes it up, and the function returns 15. The caller cannot tell "15 is the ancestor of 99" from "99 is absent". When presence is not guaranteed, return found flags for p and q alongside the candidate, and check both. The price is that the search can no longer stop at the first match.

Three more variants. With parent pointers, no recursion: bring both nodes to the same depth, then walk up in lockstep until they meet, order h time and constant space. In a binary search tree it is a top-down walk: if both values are smaller go left, if both are larger go right, otherwise this node splits them. And for many queries on a static tree, 100 thousand queries on 100 thousand nodes is 10 to the 10 visits the naive way. Binary lifting precomputes each node's ancestor at every power of two, in order n log n, then answers each query in order log n.

## In the interview

One the lesson expects. Your diameter returns the height and updates a variable outside the recursion. Make it pure.

[pause]

Return a pair from every call: the height and the best so far. The parent's best is the larger of its children's bests and its own bend. Same order n, no shared state, safe to call from several threads. Moving the best into a module-level variable is the wrong answer, and worse: the second call returns a stale result.

And if the tree is a million-node chain in Python? The recursion is a million frames deep. Convert to an explicit post-order stack, about 70 megabytes of tuples, or raise the recursion limit on recent CPython, where pure Python frames live on the heap. Then ask why the tree is a chain.

## Recap

Four things to remember. Decide the shape first: if a node needs its ancestors, pass context down; if it needs its descendants, return summaries up. Never call height inside a per-node recursion; return a tuple, or n squared over 2 visits is waiting on a chain. For path problems: clamp negatives at zero, update the best with both sides, return one side, and start the best at minus infinity. And the plain lowest common ancestor returns the present node when the other is missing, so return found flags when presence is not guaranteed.

At your desk: the nine-node tree and every per-node table, the code for each pattern, the safe ancestor and binary lifting, building a tree from traversals, and the two exercises.

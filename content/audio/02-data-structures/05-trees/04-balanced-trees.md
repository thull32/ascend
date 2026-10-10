---
lesson: balanced-trees
source: 8f08876daa9ef9e6
fit: partial
desk:
  - "The rotation diagram and the rotate-right and rotate-left code"
  - "The four AVL cases on three keys, and the AVL insert code"
  - "The AVL hand trace of 10, 20, 30, 40, 50, 25, and the Fibonacci-tree delete cascade"
  - "The red-black insert fix-up cases, the 2-3-4 encoding, and the trace of 41, 38, 31, 12, 19, 8"
  - "The measured AVL versus red-black table, and the node-layout table"
  - "The trade-off table across AVL, red-black, B-tree, skip list and treap"
  - "Exercises: check the AVL balance condition, and AVL insertion with rotations"
---
## Introduction

The binary search tree lesson ended with a tree that turned into a chain because the keys arrived in order. Every guarantee it offered was conditional on the height staying logarithmic, and nothing enforced that condition.

A balanced tree is a binary search tree plus two things: a rule that bounds the height, and a repair, the rotation, that restores the rule after each insert or delete in logarithmic time. The rule and the repair are the difference between a data structure and a hope.

Four ideas. The rotation, the one move every balanced tree is built from. AVL trees, the strict rule, and its four cases. Red-black trees, the relaxed rule, and why libraries chose it. And B-trees, which balance for the memory hierarchy instead.

## Balance as a promise about height

A perfectly balanced tree is too expensive to keep: inserting one key into a perfect tree can mean rebuilding most of it. So practical schemes relax the condition just enough that repairs stay local. Here are the numbers for a million keys, height counted in edges.

A perfect tree has height 19. The worst possible AVL tree has height 27. The worst possible red-black tree, 39. A plain tree built from one random shuffle measured 49. And a plain tree built from sorted input, 999,999.

Why do those differences matter? Each level is a dependent memory load, roughly 100 nanoseconds when the node is not cached. The top 12 or so levels stay cached because every lookup passes through them, so the likely misses are about the height minus 12: around 7 for a perfect tree, 15 for the worst AVL, 27 for the worst red-black, and a million for the chain. The exact figures depend on the machine. The ordering does not.

## The rotation

A rotation rewires three pointers to change which of two adjacent nodes is on top, without changing the inorder sequence.

Picture a small tree. The root is 30. Its left child is 20, its right child is 40. Under 20 sit 10 on the left and 25 on the right. Five nodes, inorder 10, 20, 25, 30, 40. Now rotate right at 30. 20 comes up to the root. 30 becomes 20's right child, keeping 40 on its right. And 25, which sat between 20 and 30, moves across to become 30's left child. The new tree: 20 at the root, 10 on its left, 30 on its right, and under 30, 25 and 40. Inorder is still 10, 20, 25, 30, 40.

That middle subtree moving across is the whole trick: it sits between the two nodes before and after. Three pointer writes, constant time. One detail that bites people: update the heights child-first. The node that moved down must be recomputed before the node that moved up, because the new parent's height depends on it. Everything else in balanced-tree maintenance is deciding where to rotate, and which way.

## AVL trees

The AVL rule: at every node, the heights of the two children differ by at most one. Each node stores its height or its balance factor, the left height minus the right height. After a normal insert, walk back up recomputing heights. The first node whose balance factor reaches plus 2 or minus 2 is where you fix the tree, and there are four cases, named by which way the new key went from that node.

Left-left and right-right are straight lines: one rotation at the node, in the opposite direction. Insert 30, 20, 10, and 30 becomes left-heavy by two with its left child also leaning left. Rotate right at 30, and 20 sits on top with 10 and 30 below.

Left-right and right-left are zig-zags. Insert 30, then 10, then 20. 30 is left-heavy, but its left child, 10, leans right. Here is the question interviewers ask. Will one right rotation at 30 fix it?

[pause]

No. A single rotation on a zig-zag just moves the imbalance to the mirror image. The tell is the sign flip: the unbalanced node and its heavy child have balance factors of opposite sign. So the double rotation's first step straightens the line, rotating left at 10, which turns it into a left-left case, and the second, rotating right at 30, lifts the middle key. Again, 20 ends on top with 10 and 30 below.

Why is one fix per insert always enough? Because the rotation at the lowest unbalanced node brings that subtree back to exactly the height it had before the insert. Every ancestor sees the height it saw before, so no balance factor above changes, and the walk can stop. Insert is logarithmic for the descent plus constant for the fix. The classic input, 1 to 7 in order, is four right-right cases and ends as a perfect tree with 4 at the root. Sorted input costs about one rotation per insert, and never more.

Delete is different. Removing a node shortens a subtree, the repairing rotation can shorten it again, and a shorter subtree is exactly what unbalances the next ancestor. So a delete can cascade, one rotation per level, logarithmic in the worst case. On ordinary data it is rare: deleting 100 thousand keys in ascending order took half a rotation per delete, in random order about a quarter. The bound matters for tail latency, not for the average.

## Red-black trees

The red-black rules. Every node is red or black. The root is black. Empty child pointers count as black. A red node never has a red child. And every path from a node down to an empty pointer passes the same number of black nodes, called the black-height.

The last two rules bound the height, and the derivation is an interview favourite. The shortest path is all black, with length equal to the black-height. Reds cannot stack, so the longest path alternates and is at most twice that. The black nodes alone contain a perfect tree of at least 2 to the black-height, minus 1, nodes. So the black-height is at most log base 2 of n plus 1, and the height is at most twice that.

There is a deeper picture. A red-black tree is a binary encoding of a 2-3-4 tree, where nodes hold one, two or three keys and all leaves sit at the same depth. A black node together with its red children is one 2-3-4 node. A red child means "same node as my parent".

Insert colours the new node red, so only the no-two-reds rule can break. If the uncle is red, recolour: in the 2-3-4 picture, a full node splits and pushes its middle key up, and the problem moves two levels higher. If the uncle is black, rotate once or twice and stop. So an insert performs at most two rotations, and a delete at most three, mostly recolourings that touch no pointers.

What does that buy? Measured on random data, the two trees end at the same height and do similar work. On 100 thousand sorted inserts, AVL finished at height 16 and red-black at 30. What red-black buys is the worst case per update: a bounded number of pointer writes for any single operation, which a kernel or a latency-sensitive service wants. That is why Java's TreeMap, C++'s map and the Linux kernel's rbtree chose it. AVL wins when reads dominate and updates are rare.

## B-trees

A binary node holds one key. But reading a node costs the same whether it holds one key or a hundred, on disk with a page, or in memory with a 64-byte cache line. A B-tree node holds many keys and many children, so each level costs one read and divides the remaining keys by a large factor.

The node is the storage page: 8 kibibytes in PostgreSQL, 16 in InnoDB. With small keys, the fan-out is in the high hundreds. Three levels of fan-out 1,000 index a billion keys. So a point lookup on a billion-row table reads three or four pages, the top one or two already in the buffer pool. A binary tree would need 30 levels.

B-trees balance without rotations. Insert into the leaf the search reaches. If it overflows, split it at the median and push the median into the parent, which may split in turn. A split at the root adds a new root above both halves, lengthening every path at once, which is why all leaves stay at the same depth. Small example, order 4: insert 10, 20, 30 and they fill one node. Insert 40 and it splits: 20 goes up as the new root, with 10 on its left and 30 and 40 on its right.

And a 2-3-4 tree is exactly a B-tree of order 4, so the red-black recolouring is that split in disguise. Rust's BTreeMap is a B-tree in memory on purpose: nodes of 5 to 11 keys, so a million-entry lookup visits 6 or 7 nodes instead of 20 or more.

Two relatives, briefly. Skip lists get logarithmic expected time with no rotations, and an insert touches only a few links, which is why Java's concurrent skip list map is lock-free and Redis sorted sets use one. Treaps give each key a random priority, which makes the tree look as if the keys arrived in random order, whatever order they really came in.

## Choosing, and the interview

Balanced trees are the right answer to ordered operations on a changing set, and the wrong answer to almost everything else. A heap if you only need the minimum. A hash table if you only need membership. A sorted array if the set is static. Saying "I'll use a TreeMap" for a problem that only needs contains invites the question of why you are paying logarithmic time and pointer chasing for a constant-time job.

A follow-up the lesson expects. Why does an AVL insert need at most one rotation, but a delete may need one per level?

[pause]

The rotation after an insert restores the subtree's pre-insert height, so the ancestors see no change. A delete shortens a subtree, the repair may shorten it again, and that unbalances the next ancestor up. The wrong answer is "delete is insert in reverse, so it needs one too".

And: you have 10 million entries and range scans dominate. Which structure? A B-tree or B-plus-tree, because a scan reads consecutive keys from one node or from chained leaves, one miss per many keys. A pointer-linked tree costs about one miss per key. Answering "AVL, because lookups are fastest" optimises the wrong operation.

## Recap

Four things to remember. A rotation is three pointer writes that keep the inorder sequence, with heights updated child-first. AVL has four cases; a sign flip between node and heavy child means a double rotation, insert needs one fix, and delete can cascade. Red-black allows height up to twice log n in exchange for a bounded number of rotations per update, which is why libraries and kernels chose it. And B-trees balance by splitting, with nodes sized to a page or cache line, so a billion keys take three or four reads.

At your desk: the rotation diagram and code, the AVL cases and traces, the red-black fix-up and its trace, the measured comparison and node-layout tables, the trade-off table, and the two exercises.

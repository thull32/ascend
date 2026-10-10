---
lesson: avl-trees
source: 077e034de48783b5
fit: partial
desk:
  - "The rotation diagrams and the rotate and rebalance code"
  - "The four-case table, and the six-insert trace with every balance factor"
  - "The Fibonacci-tree delete trace and the balance-zero delete trace"
  - "The node-layout numbers and the AVL against red-black, B-tree, skip list and sorted array table"
  - "Exercises: build an AVL tree and return its level order; delete with cascading rebalance"
---
## Introduction

Insert the keys 1, 2, 3, up to a million, into a plain binary search tree, and you get a linked list a million nodes long. Every lookup walks it. The same happens with anything that arrives roughly sorted, which is most real input: timestamps, auto-increment IDs, log lines. In Python it fails even louder. A recursive insert of the 1,000th sorted key hits the default recursion limit and dies before the cost even matters.

The AVL tree is the oldest fix, from Adelson-Velsky and Landis in 1962, and the strictest. After every insert or delete it checks whether any node's two subtrees differ in height by more than one, and if so it repairs the shape with a few local pointer moves called rotations.

Three ideas. The invariant, and why such a small rule bounds the height. Rotations and the four cases. And the asymmetry interviewers love: insert needs at most one repair, delete can need one at every level. Then what a node really costs on a machine, which is what decides whether you should use one at all.

## The invariant and the height bound

For every node, the balance factor is the height of its left subtree minus the height of its right subtree. A single node has height 1, an empty subtree height 0. The AVL invariant is that every balance factor is minus one, zero or plus one. Nothing more.

Why does that bound the height? Ask the opposite question: what is the fewest nodes an AVL tree of height h can have? The sparsest one has a root, one subtree of height h minus 1, and the other as short as the rule allows, h minus 2. So the minimum count for height h is the minimum for h minus 1, plus the minimum for h minus 2, plus one for the root. That is the Fibonacci recurrence with an extra one, so the minimum node count grows like the golden ratio, about 1.618, to the power h. Invert it, and the height is at most about 1.44 times the base-2 log of n.

Here is the number to remember. The sparsest AVL tree of height 29 already needs 1,346,268 nodes. So a tree of a million keys cannot reach height 29: its height is at most 28. A perfect tree of a million keys has height 20, so an AVL lookup does at most 40 percent more comparisons than the theoretical best. A plain tree could do a million.

## Rotations, the only tool

A rotation rewrites two nodes and three subtrees. Picture a node y with x as its left child. A right rotation at y lifts x up, puts y down as x's right child, and hands x's old right subtree to y as its new left subtree. The in-order sequence is identical before and after, so the tree is still a valid search tree. Only three pointers change, plus two height recomputations. That is constant work, however big the subtrees hanging underneath are. A left rotation is the mirror.

One trap lives right here. After a rotation you must recompute the height of the node that moved down before the node that moved up, because the upper node's height depends on it. Swap the order and every height above the rotation is stale by one, the balance factors lie, and the tree drifts out of balance without a single assertion failing.

## The four cases

After inserting a leaf, walk back up the path. The first node whose balance becomes plus or minus two is the lowest unbalanced node; call it z. Exactly four shapes are possible, named by the path from z down to the new key: left-left, right-right, left-right, and right-left.

Left-left and right-right are fixed by one rotation at z, in the opposite direction. Insert 10, 20, 30: 30 goes right of 20, so 10 has balance minus two and its right child leans right too. That is right-right. Left-rotate at 10, and 20 becomes the root with 10 and 30 as children.

Now insert 10, 30, 20. Before I go on: does a single left rotation at 10 fix it?

[pause]

No. 20 landed on 30's left, so 10 is right-heavy but its heavy child leans left: the zig-zag, the right-left case. A single left rotation at 10 makes 30 the root with 10 on its left and 20 still hanging off 10, and the height does not change. You first right-rotate at 30, which straightens the shape into right-right, then left-rotate at 10. The result is again 20 with 10 and 30.

The rule to carry around: if the heavy child leans the same way as its parent, one rotation; if it leans the opposite way, straighten the child first. And the one trace to be able to do blind: insert 1 through 7 in order. Rotations fire after 3, 5, 6 and 7, all right-right, and you end with the perfect tree, 4 at the root, 2 and 6 below it, and 1, 3, 5 and 7 as leaves.

## Why insert stops, and delete does not

Here is the property interviewers probe. After a rotation at the lowest unbalanced node, single or double, that subtree's height goes back to exactly what it was before the insert. So no ancestor can be unbalanced, and the fix-up stops. Insert is order log n to walk down and to update heights on the way up, but only a constant number of rotations. On 100 thousand random keys, about 47 percent of inserts triggered a rebalance, split roughly evenly between single and double rotations. Sorted input is the worst case for rotation count.

Delete is different. Removing a node from the shorter side can shrink that subtree, which unbalances the parent. Fixing the parent with a rotation can shrink its subtree by one, which unbalances the grandparent, and so on up to the root.

The witness is the sparsest tree, called a Fibonacci tree, where every node leans left by exactly one. The lesson draws one with 12 nodes and height 5. Delete the only leaf on the short side of the root. Its parent goes to plus two and needs a right rotation; that subtree gets shorter, so the root goes to plus two and needs another. Two rotations in one delete, one level apart, and the whole tree got one level shorter. In general a delete can rotate at every ancestor on the way up: order log n rotations. Still order log n total, but materially more expensive than an insert. That asymmetry is one reason red-black trees exist; they cap delete at three rotations.

## The balance-zero bug

After an insert, the heavy child of the unbalanced node always leans one way or the other. After a delete, it can be perfectly balanced, with balance zero, and the code must treat that as the single-rotation case.

The small example: insert 20, 10, 30, 5 and 15, so 20 is the root, 10 has children 5 and 15, and 30 sits alone on the right. Delete 30. Now 20 is at plus two, and its left child 10 is at zero. The correct move is a single right rotation: 10 becomes the root, 5 on its left, 20 on its right with 15 under it. The height is the same as before the delete, so nothing propagates.

Now the code you find ported from insert in several tutorials: it tests whether the child's balance is greater than zero for the single rotation, and less than zero for the double. With the child at exactly zero, neither branch fires. The node stays at plus two, nothing raises, and from then on the height field and the shape disagree. The fix is "greater than or equal to zero". And the reason this survives testing: the case cannot occur after an insert, so an insert-only test suite passes a broken rebalance.

## What a node costs

The asymptotics say log n. The constants say whether the structure survives a real machine.

A C or Rust node with a 64-bit key, two child pointers and a height byte needs 25 bytes, padded to 32. The balance factor fits in two bits, which compact implementations steal from the low bits of a pointer to get a 24-byte node. In CPython, the slotted node from the lesson is about 92 bytes per key; without slots, the per-object dictionary alone is 296 bytes, which is why the slots line is there.

Now time. A lookup follows one pointer per level. Once the tree does not fit in cache, each hop is a DRAM access, about 80 to 100 nanoseconds. A million-key AVL tree at 32 bytes a node is 32 megabytes, bigger than most caches, so a cold lookup costs up to 28 misses, roughly 2 to 3 microseconds. A B-tree with 64-key nodes over the same keys is 4 levels and 4 misses. That factor of five to seven, not big O, is why Rust's BTreeMap, the Linux kernel's maple tree for memory regions since version 6.1, and every database index use wide nodes.

So where do AVL trees actually run? Standard libraries went red-black, in C++, Java, .NET and Linux, or B-tree, in Rust. AVL survives in OCaml's standard Map and Set, with a deliberately relaxed rule that only rebalances when sibling heights differ by more than two; in the Windows kernel's tree of virtual address descriptors per process; and in functional languages using path-copied trees. For a workload that is 95 percent reads, AVL beats red-black by a few percent. For anything write-heavy, red-black wins by more. And once the data outgrows the cache, both lose to the B-tree by the miss count.

## Traps in production

A few failures worth recognising by ear. Keys that silently vanish: insert returns, find fails, only for some keys. The comparator is inconsistent. Not-a-number float keys make every comparison false, so the key is treated as a duplicate of the root; or an object's less-than is not a strict ordering; or a key was mutated while it sat in the tree. A multiset use case that loses entries, because the textbook insert ignores duplicates and the caller assumed a count; store a count, or key by value plus a sequence number. And on the JVM, garbage collection pauses that grow with the map, because millions of small entry objects are a long-lived graph the collector must trace.

## In the interview

A follow-up the lesson expects. When would you choose AVL over red-black?

[pause]

A lookup-dominated workload where the data fits in cache, or a functional, persistent map where the simpler rebalancing, four cases and no colour bookkeeping across path copies, matters more than rotation count. Otherwise red-black, or for anything large, a B-tree. The wrong answer is "AVL is always faster because it is more balanced", which ignores the order log n rotations on delete and the cache argument.

And another: how would you support k-th smallest and rank in order log n? Store the subtree size in every node, update it on the way back up exactly like the height, and fix the two nodes touched by each rotation, the lower one first. Then k-th smallest descends by comparing k with the left subtree's size plus one. Not an in-order walk, which is order k.

## Recap

Four things to remember. The AVL invariant is that every balance factor is minus one, zero or plus one, and the Fibonacci argument bounds the height at about 1.44 log n: at most 28 for a million keys. Same-direction lean, one rotation; opposite lean, straighten the child first. Insert needs at most one repair because the subtree regains its old height, while delete can rotate at every level, and a heavy child with balance zero must take the single rotation. And past cache size, the miss count per level, not big O, decides the structure, which is why libraries chose red-black and B-trees.

At your desk: the rotation code, the four-case table and the six-insert trace, the two delete traces, the cost and trade-off tables, and the two exercises.

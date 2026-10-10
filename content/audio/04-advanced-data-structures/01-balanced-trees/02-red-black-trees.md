---
lesson: red-black-trees
source: 999727e6f7d2aaf8
fit: partial
desk:
  - "The 2-3-4 node drawn next to its red-black form"
  - "The six-key insert trace and the sorted one-to-seven trace, with rules and black height checked at each step"
  - "The insert fix-up code with parent pointers"
  - "The delete case table, D1 to D4, and the three delete traces"
  - "Node layouts in libstdc++, the JVM, the Linux kernel and jemalloc, and the where-they-run and trade-off tables"
  - "Exercises: red-black insert with colours, and validate the red-black rules"
---
## Introduction

C++'s map and set, Java's TreeMap and TreeSet, the overflowing buckets inside Java's HashMap, .NET's SortedDictionary, the Linux scheduler's run queue, nginx's timers, and jemalloc up to version 4. All of them use the same structure, and it is not the AVL tree you learned first. It is the red-black tree.

The reason is a trade-off. AVL keeps the tree slightly shorter, but pays with up to log n rotations on a delete. Red-black trees accept a looser height bound in exchange for at most three rotations per operation.

Three ideas. The rules, and why they bound the height at twice the log. The 2-3-4 tree hiding behind the colours, which turns a list of cases to memorise into two operations you already understand. And delete, with its three-rotation bound. Then what a node costs in the libraries that chose it.

## The rules and the height

Every node carries one bit, red or black. The root is black. The null pointers at the bottom count as black. A red node has two black children, so no two reds in a row on any path. And every path from a node down to a null passes through the same number of black nodes; that count is the node's black height.

The last two rules do all the work. The black-height rule says the tree is perfectly balanced if you only count black nodes. The no-two-reds rule says reds can at most double a path's length. Together, the longest root-to-leaf path is at most twice the shortest.

The proof in one breath: a subtree whose root has black height b holds at least 2 to the b, minus 1, nodes, by induction. And at least half the nodes on the longest path are black, so the root's black height is at least half the height. Put them together and the height is at most twice the base-2 log of n plus one.

For a million keys, that is at most 40 levels, against 28 for AVL and 20 for a perfect tree. Measured, rather than bounded: inserting 1 to 1,023 in sorted order gives a height of 18 against a bound of 20, so sorted input lands near the bound. A million random keys gave height 25, a few levels above the ideal 20.

## The 2-3-4 tree behind the colours

A 2-3-4 tree is a search tree whose nodes hold one, two or three keys, with all leaves at the same depth. You insert by adding a key to a leaf node, and when a node overflows you split it and push its middle key up. Balance is automatic, because height only grows when the root splits.

A red-black tree is that tree drawn with binary nodes. A black node together with its red children is one 2-3-4 node. No red children: a node with one key. One red child: two keys. Two red children: three keys, a full node.

Now every rule means something. The black-height rule is "all leaves at the same depth", because black nodes are the 2-3-4 nodes and reds are keys inside them. The no-two-reds rule is "at most three keys per node". And every insertion case is one of two things: add a key to a node that has room, or split a full node.

## Insertion

Insert as in any search tree, and colour the new leaf red. Before I go on: why red rather than black?

[pause]

A black leaf would add one black to exactly the paths through it and break the black-height rule everywhere at once, which cannot be repaired locally. A red leaf breaks at most the no-two-reds rule, in one place, and that can be repaired with a constant number of rotations.

So after the insert you walk up fixing a red child under a red parent. There are three cases, decided by the uncle, the parent's sibling.

Case one: the uncle is red. The grandparent with two red children is a full node, and you are adding a fourth key. Split it: colour the parent and uncle black and the grandparent red. The grandparent is now a key pushed up into its own parent's node, so you continue from there. No rotation at all, and it is the most common case.

Cases two and three: the uncle is black, so the grandparent's node has room, and a rotation settles the new key into it. If the path from grandparent to the new node bends, rotate at the parent first to straighten it; then rotate at the grandparent and swap colours. These are exactly AVL's double and single rotation shapes. At most two rotations per insert, and the recolouring walk, while order log n in the worst case, is constant amortised over a sequence of inserts.

A tiny example. Insert 10, 20, 30. The third key makes a straight red line, so one left rotation at 10 gives a black 20 with red 10 and red 30: in 2-3-4 terms, one full node holding 10, 20 and 30. Now insert 15. It lands as a red child of 10, and the uncle, 30, is red. That is the split: 10 and 30 turn black, 20 turns red, and since 20 is the root it goes back to black. The black height grows from one to two, which is the root split of the 2-3-4 tree.

Sorted 1 through 7 makes the trade-off concrete. The red-black tree does three rotations and ends at height 4, leaning right. AVL does four rotations and ends at the perfect height 3.

## Delete and the three-rotation bound

Delete starts like a search-tree delete, so the node physically removed has at most one child. If it was red, nothing changes: no path lost a black. If it was black with one red child, move the child up and colour it black, and the path gets its black back.

The hard case is removing a black node with no red child. Those paths are now one black short. Mark the spot as "double black" and look at its sibling. Four cases.

D1, the sibling is red: recolour and rotate at the parent so the hole gets a black sibling, then carry on with one of the others. D2, the sibling is black with two black children: colour the sibling red and move the problem up to the parent. In 2-3-4 terms, the sibling had no spare key to lend, so you merge and borrow from the parent. D3, the near nephew is red and the far one black: rotate at the sibling, which turns it into D4. D4, the far nephew is red: rotate at the parent, fix three colours, and you are done. That is borrowing a key from a sibling with a spare.

Here is the point. D1, D3 and D4 can each fire at most once in a single delete, so three rotations, maximum. Only D2 loops, and it only recolours. And the only way the tree loses black height is when the double black climbs all the way to the root, which absorbs it, making every path one black shorter at once.

The small example: take the tree from a moment ago after inserting 15, a black 20 over a black 10 with a red 15 to its right, and a black 30. Delete 30. Its sibling 10 is black, the near nephew 15 is red. D3 rotates at 10, then D4 rotates at 20, and you end with 15 as a black root over black 10 and black 20. Two rotations. The 2-3-4 reading: the node holding 30 had no spare key, its sibling holding 10 and 15 did, so a key moved through the parent.

Compare AVL, where one delete on a sparse tree can rotate at every ancestor on the way up. That is the whole reason write-heavy ordered containers are red-black. And honestly: no interviewer expects red-black delete from memory. They expect the rules, the height bound, a handful of inserts done correctly, the delete case names, and the three-rotation bound. If you ever must write one, write Sedgewick's 2008 left-leaning variant, which removes the mirror cases.

## What a node costs

In libstdc++, every map element is its own allocation: a colour field, parent, left and right pointers, then the key and value. A map from 64-bit integers to 64-bit integers has a 48-byte node, which with the allocator's header and alignment occupies 64 bytes: four times the payload. The C++ standard also guarantees that inserting or erasing other elements never invalidates an iterator, and that one guarantee rules out a B-tree, whose splits move keys between nodes.

In Java, a TreeMap entry is 40 bytes before the boxed key and value, and a boxed Long is 24. A million Long-to-Long entries is about 40 megabytes of entries plus 48 of boxes. Since Java 8, a HashMap bucket whose chain grows past 8 entries, in a table of at least 64 slots, becomes a red-black tree, so a hash-flooding attack degrades to log n instead of linear.

The Linux kernel's node is 24 bytes: parent, right and left, with the colour hidden in bit zero of the parent pointer. It is intrusive: embedded in the structure it indexes, so there is no separate allocation and no key in the node. The tree caches its leftmost node, which is how the scheduler picks the next task and timers find the next expiry without a descent.

And one telling change: in 6.1 the kernel moved each process's memory regions off the red-black tree to the maple tree, a wide, cache-friendly B-tree-like node. Past cache size, wide nodes win.

So when does red-black win? When you need order and arbitrary deletion, in memory, with no bad worst case. If you only need the minimum, a heap is smaller and faster. If the data outgrows the cache, a B-tree wins on memory traffic; Rust skipped red-black entirely, and Go's standard library ships no ordered map at all.

## Traps

A comparator written with less-than-or-equal instead of strict less-than, or a float key that can be not-a-number, silently corrupts both C++'s map and Java's TreeMap; it shows up weeks later as missing keys. Erasing inside a loop and then incrementing the dead iterator crashes; use the iterator that erase returns. A mutable key modified after insertion now sorts somewhere other than where it sits, and Java lets you do that. A lookup service whose 99th percentile is ten times its median with no GC pause has outgrown cache: 40 levels of DRAM misses, about 3 to 4 microseconds per cold lookup. And at 100 million entries the standard tree works, but at 6 to 9 gigabytes.

## In the interview

A follow-up the lesson expects. You need the task with the smallest deadline, and the ability to cancel any task by handle, with hard latency bounds. Heap or red-black tree?

[pause]

The red-black tree. A heap only deletes the top cheaply; cancelling an arbitrary task needs an index from handle to position, or it costs linear time. A red-black tree does minimum, insert and arbitrary delete in log n worst case, and with a cached leftmost node the minimum is constant. That is what nginx and the kernel's high-resolution timers chose. The wrong answer is "a heap, because the minimum is constant", forgetting the cancellation.

And the classic: what is the maximum number of rotations in a red-black delete? Three. The wrong answer is "log n, like AVL", which confuses the recolouring walk with rotations.

## Recap

Four things to remember. The no-two-reds rule and the equal-black-height rule bound the height at twice the log: 40 for a million keys, against AVL's 28. A red-black tree is a 2-3-4 tree in binary clothing, so insert is either "add the key to a node with room", a rotation, or "split a full node", a recolouring that moves up. Delete needs at most three rotations; only D2 loops, and it only recolours. And real implementations spend their effort on the node, a stolen colour bit, intrusive embedding, a cached minimum, because at scale the cost is memory traffic.

At your desk: the 2-3-4 picture, the insert traces and code, the delete case table with its three traces, and the node-layout and trade-off tables.

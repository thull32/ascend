---
lesson: persistent-and-immutable-structures
source: 6b9ada50cf13ea6a
fit: partial
desk:
  - "The path-copying table for inserting 16 and 0 into the 15-node tree, and the code that counts shared nodes"
  - "The fat-node modification table"
  - "The persistent vector code, and the 5-bit index split of element 777,777"
  - "The HAMT trace with FNV-1a hashes, bitmaps and popcount, and the HAMT code"
  - "The language library table, the Git object table for one commit, and the measured cost and trade-off tables"
  - "Exercises: a path-copying BST with version access, and finding a HAMT child with bitmap and popcount"
---
## Introduction

An editor keeps undo history for a document of a million elements. A Redux store keeps every state so a developer can step back through time. A database hands a long analytics query a snapshot while writes carry on. The obvious implementation copies the structure for every version. Measured in CPython, copying a list of about a million integers takes 2.2 milliseconds and 8.4 megabytes, so a thousand versions cost 8.4 gigabytes.

A persistent structure keeps every previous version readable after an update without copying it. An update creates only the nodes that differ and shares everything else with the version it came from. On the same million-element sequence, a 32-way persistent vector makes a new version in 1.6 microseconds and about 1.4 kilobytes, and a thousand versions fit in 1.4 megabytes.

Some vocabulary first. An ephemeral structure, a Python list or a Java HashMap, changes in place, and the old version is gone. Partially persistent means every version can be read, but only the newest updated: undo history, database snapshots. Fully persistent means any version can be updated, creating a branch. Confluently persistent means two versions can be merged, as in Git merges.

And immutable is not the same thing as persistent. A Python tuple is immutable, but adding one element copies the whole tuple: 3.1 milliseconds for a million elements. Persistence is immutability plus structural sharing, so an update costs what changed, not the size of the whole.

## Path copying

Take the perfect binary search tree holding the keys 1 to 15, and insert 16. Walk the search path from the root, and instead of changing any node on it, allocate a copy that points to the new child and to the old, untouched other child.

The path is 8, 12, 14, 15. Before I count: how many nodes does the new version allocate, and how many does it share?

[pause]

Five new: copies of 8, 12, 14 and 15, plus the leaf 16. Eleven shared: the whole subtree under 4, seven nodes, the subtree under 10, three nodes, and the single node 13. Both roots stay valid. Searching from the old 8 never meets 16; searching from the new one finds it. Both versions together take 20 nodes instead of 31 for two full copies.

Now insert 0 into the first version, not the second. That copies 8, 4, 2 and 1 and adds the leaf: five more nodes. The new version is a sibling of version 2, not its descendant. That is full persistence, and it costs the same five nodes.

The invariant: path copying costs one node per level, so the tree must stay shallow. A balanced tree keeps it logarithmic, because the rotations and recolourings of a red-black or AVL insert only touch nodes on or next to the search path, and those get copied too. Clojure's sorted map and Scala's TreeMap are persistent red-black trees; Haskell's Data.Map is weight-balanced. Measured, one insert into a balanced persistent tree of about a million keys allocates 21 nodes, about 1,200 bytes, in under 18 microseconds.

The trap is an unbalanced tree fed sorted keys. It degenerates into a chain, every insert copies the whole chain, and because every version stays alive, the total is about n squared over two nodes.

## Fat nodes and node copying

Path copying pays a logarithmic number of new nodes per update. Fat nodes, from Driscoll, Sarnak, Sleator and Tarjan in 1989, pay constant space instead. Nothing is copied. Every field keeps a list of modifications, each tagged with a version, and reading a field at some version finds the last modification at or before it.

The price moves to reads. A field with m modifications needs a binary search, so every pointer you follow costs log m.

Node copying, from the same paper, fixes that. Each node carries a fixed number of spare modification slots. The first change fills the slot; the next change copies the node and records the copy in its parent's slot, which may copy the parent in turn. Every copy is paid for by the slots it used up, so updates cost constant amortised time and space for partial persistence, and reads cost constant time per pointer.

Production libraries use path copying anyway, because it needs no version numbers inside the nodes, and every node is truly immutable.

## Vectors and hash tries

Clojure's persistent vector stores a sequence as a trie with 32 children per node, and the index itself is the path: each level consumes five bits of the index, most significant first. A vector of about a million elements is four levels deep. Updating one element copies one 32-slot array per level, four in all, and shares the other 33,821 of the tree's 33,825 nodes. That is where the 1.4 kilobytes and 1.6 microseconds come from. Reads pay too: a get walks four arrays, 0.28 microseconds, where a list index is one step.

Clojure adds two refinements. A tail holds the last up-to-32 elements in a separate array, so 31 of every 32 appends touch only the tail. And transients let one thread at a time mutate nodes the transient created itself during a batch build, then seal the result, turning a million-element build into in-place writes.

A hash array mapped trie, or HAMT, does the same for maps: a trie over the bits of the key's hash, five bits per level as the child index. A node with all 32 slots would waste memory in a sparse map, so each node keeps a 32-bit bitmap of which slots are occupied, plus a compact array of only the occupied ones. The array position of a slot is the number of occupied slots below it: a population count, which is one instruction on x86-64.

Say it with numbers. A node has slots 9, 17, 21 and 23 occupied. Where in the array is slot 21? Two occupied slots lie below it, 9 and 17, so index 2. Now insert a key that hashes to slot 11. The new version's node has five entries, and slot 21 has moved to index 3. The old version's node was copied, not changed, so in version 1 slot 21 is still at index 2 and the new key is absent. A million keys make the trie about four levels deep, so an update copies about four small arrays.

Scala 2.13 replaced its HAMT with CHAMP, which keeps two bitmaps per node, one for inline key-value pairs and one for children, so iteration walks contiguous data and every map has one canonical shape.

## What languages ship

Clojure has the vector, a HAMT map and a red-black sorted map, with transients for batches. Scala 2.13 has a radix-balanced vector, CHAMP and a red-black TreeMap, with builders. Immutable.js has a vector trie list and a HAMT map, with a with-mutations escape hatch. Haskell has finger trees, a HAMT and weight-balanced maps.

Python's standard library has none. A tuple copies on every change. Merging a dict with one new key copies the dict: 0.48 milliseconds at a hundred thousand keys. And the mapping proxy type is a read-only view that still sees the dict's later changes, so it is not a snapshot at all. Third-party pyrsistent provides persistent vectors and maps. CPython itself has used a HAMT internally since 3.7, to back context variables, where copying a context must be cheap, but does not expose it.

In JavaScript, a Redux reducer that spreads the state and the to-do list into new objects is path copying written by hand, and Immer builds the same path copies for you. React compares state by reference, so an unchanged subtree is the same object and is skipped in constant time. Mutate a shared node in place, push onto the list directly, and the reference does not change: the view does not update, and every version sharing that node changes with it.

## Git and copy-on-write databases

Git stores a repository as immutable objects named by the hash of their content. A blob is a file's bytes. A tree lists the names and object IDs of one directory. A commit names a root tree, its parents, the author and the message. A directory's name therefore depends on the names of everything below it: the object graph is a Merkle tree, and a commit is a version of it.

Changing a file is path copying. In the lesson's five-file repository, editing the file main dot py, two directories down in src and then app, created a new blob, a new tree for each of the three directories on its path, app, src and the root, and a new commit: five objects. The other six objects were shared by hash. A branch is a 41-byte file holding a commit ID, so creating one is constant time, and a diff skips every subtree whose hash matches, so its cost follows the changed paths, not the repository size. Git does not store commits as diffs; delta compression in packfiles is a separate, physical layer underneath.

LMDB is a copy-on-write B+tree. A write transaction copies the pages from each modified leaf up to the root into free pages, then commits by writing the new root into one of two alternating meta pages. A reader keeps the root it started with, so readers never block the writer and never see half a transaction. Btrfs and ZFS do the same for file systems: a snapshot records the current root in constant time. Postgres takes a different route: MVCC keeps whole row versions and filters them by transaction ID. That is versioning by duplication, not structural sharing.

The trap that follows: pages freed by a commit are reused only once no reader holds an older root. One long-lived read transaction pins an old root, and the LMDB file keeps growing while the live data stays the same size. Keep read transactions short.

## In the interview

A follow-up the lesson expects. Undo and redo for a document of a million elements, keeping 10,000 edits. What do you build?

[pause]

A persistent vector or rope, with history as a list of roots. Each edit costs about 1.4 kilobytes of path copies, so 10,000 versions take about 14 megabytes, where full copies would take 84 gigabytes. Undo is moving a pointer. If old versions never need to be read while editing continues, a log of inverse operations is smaller still. The wrong answer is deep-copying the document per edit.

And a subtler one. Why can amortised bounds break in a persistent structure?

[pause]

Amortisation assumes each expensive step is paid for once, by the cheap steps before it. With persistence you can go back to the version just before the expensive step and trigger it again, as often as you like. A queue built from two stacks is the example: an old version can be dequeued again and again, redoing the same linear reversal each time. Okasaki's fix is lazy evaluation with memoisation, so every version that forces the expensive work shares one result, or scheduling the work to get worst-case bounds.

## Recap

Five things. Persistence is immutability plus structural sharing; a tuple is immutable and still copies everything. Path copying allocates one node per level of the search path, five new and eleven shared for inserting 16 into the 15-node tree, so the tree must be balanced. Fat nodes trade constant space for slower reads, and node copying gets constant amortised cost, but libraries use path copying. A 32-way vector or HAMT copies about four small arrays per update at a million elements, finding children with a bitmap and popcount. And Git, LMDB, Btrfs and ZFS are path copying with old roots as snapshots, which is also why an old reader or an unbounded undo stack keeps memory alive.

At your desk: the path-copying and fat-node tables, the persistent vector and HAMT code and traces, the library, Git and cost tables, and the two exercises.

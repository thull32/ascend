---
lesson: union-find-pattern
source: 727670ad0575f25f
fit: partial
desk:
  - "The union-find class in Python and JavaScript, with path halving and union by rank"
  - "The rank-on-eight-nodes and path-halving tables"
  - "The Redundant Connection, Accounts Merge, Number of Provinces and islands-over-time traces"
  - "The weighted-relation code and the Kruskal trace"
  - "The comparison, near-misses and variations tables"
  - "Exercises: count components with union-find, and island count as land is added"
---
## Introduction

Edges arrive one at a time, and after each one you need to know whether two nodes are now connected. Or you have thousands of "these two are the same" facts, emails belonging to one person, cells in one island, cities in one province, and you need to group everything into classes. A traversal answers "connected?" in time linear in the graph. Re-running it after every edge multiplies that by the number of edges.

Union-find keeps the groups as they form. Each node points at a parent. The root of its tree names the group. Find follows parents up to the root. Union hangs one root under the other. With two optimisations that take four lines, each operation costs the inverse Ackermann function of n, which never exceeds 4 for any n you could store. Call it constant.

Coming up: the signal, the invariant and the two optimisations, the classic problems, and the three bugs that sink it in an interview.

## The signal

Reach for union-find when "are a and b connected?" is asked repeatedly while edges are added, or when the question is "which edge, when added, creates a cycle?" Edges only ever arrive. When the task is to merge groups that share an element: accounts sharing an email, synonyms, friends of friends. The relation is an equivalence and you want its classes. When you need the number of connected components and no path or distance. For Kruskal's minimum spanning tree. And for cells that become land over time.

What rules it out. You need the path itself, or distances: union-find knows membership only. Edges are removed online: sets cannot be split. The relation is directed: "a can reach b" is not symmetric. Or there is one static query on a graph you already hold: a breadth-first search costs the same and needs no new structure.

That last one is worth a near miss. Number of Islands on a fixed grid looks like union-find, but a flood fill is shorter and equally fast, because nothing arrives over time. Number of Islands where cells are added one at a time and you report the count after each: that is union-find.

## The invariant and the two optimisations

The invariant: each group is exactly one tree, and two nodes are in the same group if and only if find returns the same root for both. Union only ever points a root at a node in a different tree, so it cannot create a loop in the parent pointers.

The first optimisation is union by rank. Rank is an upper bound on a tree's height. Link the lower-rank root under the higher one, and when two equal ranks merge, the result gets one taller. Here is why that bounds height: rank goes up only when two trees of equal rank merge, so a root of rank r has at least 2 to the r nodes. Height is therefore at most log base 2 of n. On eight nodes, the deepest a node can sit is three hops.

The second is path compression. The form to type under pressure is path halving: as find walks up, point each node at its grandparent. Each find roughly halves the path it walks. It is iterative, which matters, because the recursive full-compression form recurses once per node before it compresses anything, and without rank a chain of about a thousand nodes hits CPython's recursion limit.

Each alone gives logarithmic cost. Rank keeps trees short; compression lets a chain form but flattens it the first time it is walked. Only the combination gives inverse Ackermann.

What are they worth in practice? The lesson measured an adversarial sequence that builds a chain. With neither optimisation, find walks the whole chain every time: half a second at 10 thousand nodes, quadrupling each time n doubles, so about a minute at 100 thousand. With path halving alone, rank alone, or both, a million nodes takes under a tenth of a second. The gap between none and one is minutes against milliseconds. The gap between one and both is invisible at interview sizes, and the bound is the reason to write both anyway.

## Redundant Connection

A tree on nodes 1 to n had one extra edge added. Return that edge, or, if several qualify, the one that appears last in the input.

Adding one edge to a tree creates exactly one cycle. Process the edges in order and union each pair. The first union that fails, because both endpoints already share a root, is the answer.

Say it on five nodes. The edges are 1 to 2, 2 to 3, 3 to 4, 1 to 4, and 1 to 5. Union 1 and 2: different roots, merge. Union 2 and 3: merge. 3 and 4: merge. Now nodes 1 through 4 all share root 1. Next edge, 1 to 4. What does union return?

[pause]

False. Both finds return 1, so the edge closes the cycle, and you return 1, 4. The edge 1 to 5 is never examined. And "last in the input" is automatic: every other edge on the cycle appeared before the closing one. That is linear in the edges, times inverse Ackermann, against quadratic for "traverse the edges so far before adding each one", which is the difference the problem exists to test.

Note the nodes are numbered from 1, so allocate n plus one slots. That off-by-one is common.

## Accounts Merge and islands over time

Accounts Merge: each account is a name followed by emails. Accounts that share any email belong to one person, and names can repeat across different people.

The key decision is what the nodes are. They are accounts; emails are the evidence. Keep a map from each email to the first account that showed it. When an email reappears, union the current account with that owner. At the end, group emails by their account's root and sort them. The lesson's test case has three accounts named John: the first and third share an email, so they merge; the second shares nothing and stays separate. Use names as nodes and you merge two strangers called John. Sorting the emails dominates the cost.

Number of Provinces gives a symmetric matrix of direct links. Union every linked pair from the upper triangle only, since the matrix is symmetric, and the answer is the running count of groups. Reading the matrix is already quadratic, the size of the input, so nothing beats it.

Islands added over time. Picture a three by three grid of water. Four cells become land one at a time: top middle, middle left, middle right, bottom middle. None of them touch, so after each one the island count goes up: 1, 2, 3, 4. Then the centre cell becomes land. Its count first goes up to 5, then it unions with each of its four land neighbours, and each real merge subtracts one. Four merges, and the count drops to 1. One addition, four unions, a count that a flood fill per cell would need a full grid scan to discover. Key each cell as row times width plus column, and ignore a cell that is already land, or you add a phantom island.

## The bugs and the variations

The first bug: union links nodes, not roots. Write "parent of b becomes a" without calling find. Union 1 and 2, then 2 and 3: still a valid tree by luck. Then union 3 and 1 sets the parent of 1 to 3, pointing a root at its own descendant. The pointers now loop 1, 3, 2, 1, and the next find never ends. Always compute both roots, compare them, and link one root under the other.

The second bug: decrementing the group count on every union call. With three nodes and the edge 0 to 1 given twice, the correct answer is 2 components, but an unconditional decrement returns 1. Make union return whether a merge happened, and decrement only then. That boolean is also exactly what cycle detection consumes.

The third: comparing parents instead of roots. Parents are not roots until compression has run, so connected nodes read as separate.

A few variations. Union by size instead of rank gives "size of my group" for free with the same bound, which answers "largest group after each union". Kruskal's minimum spanning tree sorts edges by weight and keeps an edge only if its endpoints are in different sets; the skipped edge is the same failed union. And weighted relations, like a over b equals 2 and b over c equals 3: store each node's ratio to its parent, multiply ratios along the path as find compresses it, and a over c comes out as 6.

At scale, merging customer records that share an email or phone number is Accounts Merge over billions of records. It no longer fits one machine, so distributed graph engines compute the same components by label propagation, where every vertex keeps the smallest identifier it has heard from a neighbour.

## In the interview

The interviewer says: now edges can also be removed. What do you do?

[pause]

Union-find cannot split a set. If all operations are known in advance and edges are only removed, process time backwards, so deletions become unions. If additions are interleaved too, use a rollback union-find, which drops path compression so each union changes one parent and one rank that a stack can undo, over a segment tree of time. If deletions arrive online, recompute per query, or name dynamic-connectivity structures and say they are well beyond interview code. The wrong answer is "set the parent of x back to x", which orphans every node below it.

And: why not depth-first search? For a static graph and one question, it is equally good, and you would use it. Union-find wins when edges arrive over time or queries interleave with additions. "Union-find is always faster" is not true.

## Recap

Four things to remember. The signal is an equivalence relation with edges that only arrive, and no need for paths or distances. Each group is one tree named by its root; link roots, never nodes, and have union return whether it merged, because counting and cycle detection both consume that. Union by rank bounds height at log n, path halving flattens what is walked, and together they make each operation effectively constant; with neither, a chain takes about a minute at 100 thousand nodes. And union-find cannot delete: offline, reverse time.

At your desk: the class in both languages, the rank and halving tables, the four problem traces, the weighted relation and Kruskal traces, the tables, and the two exercises.

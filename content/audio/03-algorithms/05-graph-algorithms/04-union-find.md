---
lesson: union-find
source: f7526db4cc29becd
fit: partial
desk:
  - "The parent-array traces: the naive chain, union by rank on eight elements, and the find before and after compression and halving"
  - "The inverse Ackermann definition and its table of values"
  - "The complete UnionFind class with size and component count"
  - "The trade-offs table: rollback, offline reversal, dynamic connectivity, label propagation"
  - "Exercises: union-find with union by size and path compression, and the earliest moment the network is connected"
---
## Introduction

Edges arrive one at a time, and after each one you need to answer: are u and v connected now? Rerunning BFS costs order V plus E per question, so a stream of E edges and E questions costs E squared. Kruskal asks that question once per edge. So does a network-partition detector, an "accounts that share an email are the same person" merger, and every "count the islands as cells appear" problem.

All of them need a structure that can merge two sets, and answer "are these in the same set", in close to constant time. It never needs to split a set. That structure is the disjoint-set union, universally called union-find. It is about fifteen lines, and its amortised bound is so close to constant that the function describing it will never exceed 4 on any input that exists.

Three ideas: the parent-pointer forest, the two optimisations and why each one helps, and the offline trick that gets around the one thing union-find cannot do.

## The representation

Every element has a parent pointer. An element that points to itself is a root, and the root of an element's tree represents its whole set. Two elements are in the same set exactly when they have the same root. Find walks parent pointers up to the root. Union finds both roots and hangs one under the other. If the roots are already equal, union does nothing and returns false.

That returned false is a whole interview problem. In Redundant Connection and Graph Valid Tree, an edge whose endpoints already share a root is the edge that closes a cycle.

The cost of find is the depth of the element in its tree, and naive union can build a single chain. Five elements, zero to four. Union 0 with 1, then 1 with 2, then 2 with 3, then 3 with 4, each time hanging the growing tree's root under the new singleton. Now 0 points to 1, 1 to 2, 2 to 3, 3 to 4. Finding 0's root walks four pointers. With n elements, n minus 1. A Kruskal that happens to see edges in that order spends order n per edge, n squared in total. Two ideas fix this, in different ways.

## Union by rank

Keep a rank on each root, an upper bound on its tree's height. When merging, hang the lower-rank root under the higher-rank one. If the ranks are equal, pick either, and the winner's rank goes up by one.

Four elements, zero to three. Union 0 and 1: equal ranks, so 1 goes under 0, and 0's rank becomes 1. Union 2 and 3: likewise, 3 under 2, rank 1. Now union 1 and 3. Their roots are 0 and 2, both rank 1, so 2 goes under 0, and 0's rank becomes 2. The tree has four nodes, and the deepest, 3, is two hops from the root.

Notice the pattern: rank 1 had two nodes, rank 2 has four. That is the invariant. A root of rank r has at least 2 to the r nodes under it, because rank only goes up when two trees of equal rank merge, each with at least half that many. So a tree of rank r needs 2 to the r nodes, rank is at most log base 2 of n, and find costs at most order log n. At most 30 hops for a billion elements.

Union by size, hanging the smaller set under the larger, gives the same bound by the same argument, and it gives you "how big is this component" for free, which "largest island" questions need.

## Path compression

The second idea: when find walks from an element to the root, every node it passes now knows the root. Point them all straight at it.

Back on the five-element chain, find 0. The walk goes 0, 1, 2, 3, 4, and learns the root is 4. A second pass rewrites 0, 1 and 2 to point at 4 directly; 3 already did. The next find on any of them is one hop.

Compression shortens trees but never updates ranks. So after compression, a root's rank can be larger than its true height. Before I say why that is fine: does the union-by-rank rule need rank to be the exact height?

[pause]

No. The rule only ever needed an upper bound. Compression only shortens trees, so height is still at most rank, and the counting argument never relied on rank being exact.

Two practical notes. The recursive find is the cleanest to read, but in production Python a chain of a thousand nodes hits the default recursion limit, so real code loops. And the one-line variant most people actually write is path halving: on every step, point the node at its grandparent and jump there. Almost as effective, and shorter.

## What the bound actually is

With neither optimisation, a find is order n. Union by rank alone: order log n. Path compression alone: order log n amortised. Both together: amortised inverse Ackermann of n, written alpha of n.

"Effectively constant" deserves a real meaning. The Ackermann-style functions grow so fast that alpha of n is 3 for anything from 8 up to 2,047 elements, and 4 for everything beyond that up to a tower of exponentials about two thousand levels high. The observable universe has around 10 to the 80 atoms, nowhere near. So alpha is at most 4 for every input that will ever exist.

But the word "amortised" matters. A single find can still cost order log n hops. It is m operations together that cost order m times alpha of n. Saying "it is order one worst case" is the wrong answer. Tarjan proved the bound in 1975, and lower bounds since have closed the story. Do not try to reproduce that proof on a whiteboard. What you should be able to reproduce is the two-to-the-r counting argument for log n, and the observation that compression only shortens paths, so it cannot make anything worse.

## The offline trick

Union-find cannot delete an edge. That sounds fatal for questions like "when did the network first become fully connected", or "were u and v connected at time t". It is not, because those questions can be answered offline: collect everything first, sort by time, and replay.

For the earliest moment everyone is connected: sort the edge log by timestamp, union in order, keep a component counter that starts at n and drops by one on every successful union, and report the timestamp of the union that brings it to 1. For per-query connectivity, sort the queries by time too, and advance the edges up to each query's timestamp before answering it.

The trick goes further. If the deletions are known in advance, run time backwards. Start from the final graph with every deleted edge removed, then walk the deletions in reverse, so each one becomes an insertion. "Components after each removal" becomes "components as edges are re-added", and union-find handles it. Change the order of the questions, not the structure.

When deletions truly arrive online, union-find is the wrong tool, and the answer is a dynamic connectivity structure at order log squared per update. In between sits union-find with rollback: union by rank without compression, plus an undo stack. Knowing that boundary is worth more than knowing those structures.

## Traps, and where it runs

Why not delete by resetting a pointer? Four nodes: 6 and 7 point to 4, and 4 points to 0. Set 4's parent to itself. Now 4 is a root, and it took 6 and 7 with it. Ask whether 6 and 0 are connected, and the answer is false, though nothing disconnected them. Compression never re-attaches them, because find stops at the first node that points to itself.

Two more classic bugs. Linking the elements instead of their roots silently splits sets, so the component count comes out too high. And decrementing the counter on every union call, including the ones that found the two already connected, makes it drift. That is why union returns a boolean.

On scale: in Python a parent list costs about 36 bytes per element, against 4 in a typed 32-bit array. Each hop on an array bigger than the cache is a cache miss of roughly 100 nanoseconds, which is why a three-hop path against a one-hop path shows up in wall-clock time long before alpha does. Type inference in OCaml, Haskell and the Rust compiler is union-find over type variables. And across a cluster, frameworks propagate minimum labels in rounds instead, because a pointer hop across machines costs milliseconds.

## In the interview

A follow-up from the lesson. Using union by size and path compression together, versus path compression with naive linking, always hanging the second root under the first. What are the two bounds?

[pause]

Size-aware linking with compression is amortised inverse Ackermann. Compression alone is amortised log n. Both are fast on typical inputs, but the guarantee differs, and interviewers ask exactly this.

And: after a million unions, can I use find of x as a stable component ID? No. Roots change with every merge, so an ID recorded earlier may no longer be a root. Run find over every element after the last union, and store that snapshot.

## Recap

Four things to remember. A union-find is a forest of parent pointers, and same root means same set. Union by rank keeps trees at most log n deep, because a rank-r root has at least 2 to the r nodes; compression flattens paths, and rank stays a valid upper bound. With both, the cost is amortised inverse Ackermann, at most 4 for anything physical, never worst-case constant. And union-find cannot delete, so sort the timeline, or run it backwards.

At your desk: the parent-array traces for the chain, the rank merges and the compressed find, the Ackermann table, the full class with size and counter, the trade-offs table, and the two exercises.

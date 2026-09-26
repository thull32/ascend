---
slug: union-find
title: "Union-find: near-constant connectivity under merges"
description: The parent-pointer forest, why union by rank bounds height at log n, what path compression does to that bound, the inverse Ackermann guarantee, and the offline-connectivity trick that turns dynamic questions into one sorted pass.
minutes: 45
difficulty: medium
tags: [graphs, union-find, disjoint-set, path-compression, union-by-rank, connectivity, kruskal]
problems: [redundant-connection, accounts-merge, number-of-provinces, graph-valid-tree]
---
Edges arrive one at a time and after each one you need to answer "are `u` and `v` connected now?". Rerunning BFS costs `O(V + E)` per question, so a stream of `E` edges and `E` questions costs `O(E²)`. Kruskal asks that question once per edge. So does a percolation simulation, a network-partition detector, an "accounts with a shared email are the same person" merger, and every "count the islands as cells appear" problem. All of them need a structure that supports *merge two sets* and *are these in the same set* in something close to constant time, and does not need to support splitting.

That structure is the disjoint-set union, universally called union-find. It is about fifteen lines, it is one of the best-analysed data structures in computer science, and its amortised bound is so close to constant that the function describing it is one you will probably never see exceed 4.

## The representation

Every element has a parent pointer. An element that points to itself is a **root**, and the root of an element's tree is the **representative** of its set. Two elements are in the same set exactly when they have the same root.

```python
parent = list(range(n))        # each element starts as its own root

def find(x):
    while parent[x] != x:
        x = parent[x]
    return x

def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb:
        return False           # already connected
    parent[ra] = rb            # hang one root under the other
    return True
```

The cost of `find` is the depth of `x` in its tree, and the naive `union` above can build a tree that is a single chain. Union 0 into 1, then 1 into 2, then 2 into 3 and so on, always hanging the taller tree under the shorter one, and `find(0)` walks `n − 1` pointers. Two ideas fix this, and they fix it in different ways.

```viz
{"type": "graph", "algorithm": "union-find", "directed": false,
 "title": "Edges as union operations; labels show parent pointers",
 "nodes": [{"id":"A","x":10,"y":25},{"id":"B","x":35,"y":25},{"id":"C","x":60,"y":25},{"id":"D","x":85,"y":25},{"id":"E","x":20,"y":80},{"id":"F","x":50,"y":80},{"id":"G","x":80,"y":80}],
 "edges": [{"from":"A","to":"B"},{"from":"C","to":"D"},{"from":"B","to":"C"},{"from":"E","to":"F"},{"from":"A","to":"D"},{"from":"F","to":"G"}]}
```

Watch the A–D edge: by then A and D already share a root, so the union does nothing and returns `false`. That returned `false` is the entire cycle-detection logic of [Redundant Connection](/practice/redundant-connection) and [Graph Valid Tree](/practice/graph-valid-tree).

## Union by rank: never hang the tall tree under the short one

Store a `rank` per root, an upper bound on the height of its tree. When merging, hang the lower-rank root under the higher-rank one; if the ranks are equal, pick either and increment the winner's rank.

```python
rank = [0] * n

def union(a, b):
    ra, rb = find(a), find(b)
    if ra == rb:
        return False
    if rank[ra] < rank[rb]:
        ra, rb = rb, ra            # ra is now the taller (or equal) root
    parent[rb] = ra
    if rank[ra] == rank[rb]:
        rank[ra] += 1
    return True
```

Why this bounds height at `log₂ n`: a root of rank `r` has at least `2^r` nodes under it. By induction, rank increases only when two rank-`(r−1)` trees merge, each with at least `2^(r−1)` nodes, giving at least `2^r`. A tree of rank `r` therefore needs `2^r ≤ n` nodes, so `r ≤ log₂ n`, and `find` is `O(log n)` worst case. Union by *size* (hang the smaller set under the larger) gives the same bound by the same argument, and has the practical advantage that you get "how big is this component" for free, which "number of islands" and "largest component" questions need.

## Path compression: make every find pay forward

When `find` walks from `x` to the root, every node on the way now knows the root. Point them all directly at it.

```python
def find(x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:       # second pass: compress
        parent[x], x = root, parent[x]
    return root
```

The recursive version, `parent[x] = find(parent[x])`, reads more cleanly and is fine in an interview; in production Python it hits the recursion limit on a chain of a thousand nodes, which is why the two-pass loop above exists. Two one-pass variants are nearly as effective and even shorter: **path halving** (`parent[x] = parent[parent[x]]` on every step, so each node skips to its grandparent) and **path splitting** (every node on the path points at its grandparent). Path halving is what most competitive programmers write because it is one line inside the loop.

Compression does not maintain `rank` as a true height (compressing shortens trees, rank never decreases), which is why `rank` is an *upper bound* on height and the union rule still works.

## What the bound actually is

| Technique | Worst-case `find` | Amortised per operation over `m` operations |
|---|---|---|
| Neither | `O(n)` | `O(n)` |
| Union by rank only | `O(log n)` | `O(log n)` |
| Path compression only | `O(n)` for one op | `O(log n)` amortised |
| Both | `O(log n)` | `O(α(n))` |

`α(n)` is the inverse Ackermann function. Its value is at most 4 for any `n` smaller than a number with more digits than there are atoms in the universe, so for engineering purposes every operation is constant time. Tarjan proved the `α` bound in 1975 and Fredman and Saks proved in 1989 that no pointer-based structure can do better, so the story is closed. When an interviewer asks "what is the complexity", "amortised inverse Ackermann, effectively constant, given both union by rank and path compression" is the full answer; the follow-up "and with only one of the two?" is answered by the table.

An intuition for why compression alone gives `O(log n)` amortised: each compression halves the depth of every node it touches, and a node can be halved at most `log n` times before it is at depth 1. The `α` bound with both techniques needs the potential-function argument from the amortised analysis lesson and is not something anyone reproduces on a whiteboard.

## A complete implementation with component counts

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.components = n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.components -= 1
        return True

    def connected(self, a, b):
        return self.find(a) == self.find(b)
```

`components` starts at `n` and drops by one on every successful merge, so [Number of Provinces](/practice/number-of-provinces) is "count successful unions, subtract from `n`", and "number of islands as cells are added" is the same counter with a union per land neighbour. When elements are strings rather than integers (emails in [Accounts Merge](/practice/accounts-merge)), map each string to an index with a dictionary first; a union-find keyed on a hash map works but is slower and easier to get wrong.

## The offline trick: sort the timeline, answer in one pass

Union-find cannot delete an edge. That sounds like a fatal restriction for questions like "at what time did the network first become fully connected" or "for each query (t, u, v), were u and v connected at time t", and it is not, because those questions can be answered **offline**: collect everything first, sort by time, and replay.

For "earliest moment everyone is connected": sort the edge log by timestamp, union in order, and report the timestamp of the union that brings `components` to 1. For per-query connectivity at a time: sort queries by time too, and advance the edge pointer up to each query's timestamp before answering it. Both are `O((E + Q) log(E + Q))` for the sorts plus `α` per operation.

The trick generalises to *deletions*: if you know the full sequence of deletions in advance, process time backwards. Start from the final graph with all deleted edges removed, then walk the deletions in reverse, each one becoming an insertion. "Number of components after removing each edge in order" becomes "number of components as edges are re-added in reverse", and union-find handles it. This reversal is a standard senior move: turn a structure's weakness into a non-issue by changing the order of the questions rather than the structure.

When the questions genuinely must be answered online with deletions, union-find is the wrong tool and the answer is a dynamic connectivity structure (Holm–de Lichtenberg–Thorup, link-cut trees), which are `O(log² n)` per operation and a few hundred lines. Knowing that boundary is worth more than knowing those structures.

## Extensions worth knowing by name

**Union-find with parity.** Store, alongside each parent pointer, the parity of the path to the parent. `find` accumulates parity along the path (and compresses it). Now you can maintain "u and v are on opposite sides" constraints and detect when a new edge makes the graph non-bipartite: it is how "can these people be split into two groups given dislikes" is solved incrementally, and the base of the 2-SAT connection in the [strongly connected components lesson](/learn/algorithms/graph-algorithms/strongly-connected-components).

**Weighted union-find.** Generalise the parity to any group: store the *ratio* `x / parent(x)` and you can answer "given a/b = 2 and b/c = 3, what is a/c" with one `find` each. Same code, different combining operation.

**Union-find on a grid.** Index cell `(r, c)` as `r * cols + c` and add virtual nodes for "top row" and "bottom row"; percolation ("does water get from top to bottom") is a single `connected(top, bottom)` after unioning open neighbours. [Surrounded Regions](/practice/surrounded-regions)-style problems use a virtual "border" node the same way.

## Exercises

```exercise
id: union-find-class
title: Union-find with union by size and path compression
prompt: |
  Implement `UnionFind` with these methods, replayed from a list of operations:

  - `init(n)`: create `n` singleton sets `0..n-1` (called first, returns nothing)
  - `union(a, b)`: merge the sets; return `true` if they were different, `false` if already the same
  - `connected(a, b)`: return whether `a` and `b` share a root
  - `components()`: return the current number of sets

  Use union by size (hang the smaller set under the larger) and path
  compression (halving or two-pass). Do not use recursion for `find`.
languages: [python, javascript]
entry: UnionFind
starter:
  python: |
    class UnionFind:
        def init(self, n):
            self.parent = list(range(n))
            self.size = [1] * n
            self.count = n

        def find(self, x):
            # walk to the root, compressing on the way
            return x

        def union(self, a, b):
            return False

        def connected(self, a, b):
            return False

        def components(self):
            return self.count
  javascript: |
    class UnionFind {
      init(n) {
        this.parent = Array.from({ length: n }, (_, i) => i);
        this.size = new Array(n).fill(1);
        this.count = n;
      }
      find(x) {
        // walk to the root, compressing on the way
        return x;
      }
      union(a, b) {
        return false;
      }
      connected(a, b) {
        return false;
      }
      components() {
        return this.count;
      }
    }
tests:
  - args: [["init",5],["union",0,1],["union",1,2],["connected",0,2],["connected",0,3],["components"]]
    expected: [null, true, true, true, false, 3]
  - args: [["init",3],["union",0,1],["union",0,1],["components"]]
    expected: [null, true, false, 2]
    label: repeated union is a no-op
  - args: [["init",1],["components"],["connected",0,0]]
    expected: [null, 1, true]
    label: single element
  - args: [["init",6],["union",0,1],["union",2,3],["union",4,5],["union",1,3],["connected",0,2],["connected",0,4],["components"],["union",5,0],["components"]]
    expected: [null, true, true, true, true, true, false, 2, true, 1]
  - args: [["init",4],["union",0,1],["union",1,2],["union",2,3],["union",3,0],["components"]]
    expected: [null, true, true, true, false, 1]
    hidden: true
    label: closing edge of a cycle
  - args: [["init",2],["connected",0,1],["union",1,0],["connected",0,1]]
    expected: [null, false, true, true]
    hidden: true
hints:
  - "In `find`, loop `while parent[x] != x`, setting `parent[x] = parent[parent[x]]` before stepping."
  - "In `union`, find both roots; if equal return false; otherwise swap so `ra` is the larger set, then `parent[rb] = ra`, add sizes, decrement the count."
  - "`connected` is just `find(a) == find(b)`."
```

```exercise
id: earliest-full-connection
title: Earliest moment the network is connected
prompt: |
  `logs` is an unsorted list of `[t, u, v]` entries meaning "at time `t`, a
  link between `u` and `v` came up" (`n >= 2` nodes, `0..n-1`; links are never
  removed; several entries may share a timestamp). Return the earliest time
  at which every node can reach every other node, or `-1` if that never
  happens.

  Sort by time and replay with union-find; the answer is the timestamp of
  the union that leaves exactly one component.
languages: [python, javascript]
entry: earliest_full_connection
starter:
  python: |
    def earliest_full_connection(n, logs):
        parent = list(range(n))
        # sort logs by t, union, stop when one component remains
        return -1
  javascript: |
    function earliest_full_connection(n, logs) {
      const parent = Array.from({ length: n }, (_, i) => i);
      // sort logs by t, union, stop when one component remains
      return -1;
    }
tests:
  - args: [4, [[20,0,1],[10,2,3],[5,1,2]]]
    expected: 20
  - args: [2, [[3,0,1]]]
    expected: 3
  - args: [3, [[1,0,1]]]
    expected: -1
    label: never fully connected
  - args: [3, [[4,0,1],[4,1,2],[2,0,2]]]
    expected: 4
    label: shared timestamps
  - args: [4, [[1,0,1],[2,0,1],[3,2,3],[4,0,1],[7,1,3],[9,0,2]]]
    expected: 7
    hidden: true
    label: redundant links do not count
  - args: [5, [[10,0,1],[9,1,2],[8,2,3],[7,3,4],[6,4,0]]]
    expected: 9
    hidden: true
hints:
  - "Sort by timestamp, then process in order; the input is not sorted."
  - "Track `components = n`; each successful union decrements it. Return the current `t` when it reaches 1."
  - "If the loop finishes with more than one component, return -1."
```

## Senior signals

- You can give the `2^r`-nodes-per-rank argument for the `log n` height bound in two sentences, and you know compression makes rank an upper bound rather than the true height.
- You quote the complexity as amortised `O(α(n))` with both optimisations, `O(log n)` with either alone, and you know `α(n) ≤ 4` for any physical input.
- You write `find` iteratively (path halving) in production because the recursive version overflows Python's stack on long chains.
- You turn "connectivity over time" and even "connectivity under deletions" into offline problems by sorting or reversing, and you know dynamic connectivity structures exist for the genuinely online case.
- You keep `size` and a component counter so that "how many islands" and "largest group" fall out with no extra traversal.
- You recognise the parity and weighted extensions ("possible bipartition", "evaluate division") as the same structure with a value on each pointer.

## Check yourself

```quiz
- q: >-
    Using union by rank without path compression, what is the worst-case cost of a single find on n elements?
  options: ["O(1)", "O(α(n))", "O(log n)", "O(n)"]
  answer: 2
  explanation: >-
    A root of rank r has at least 2^r nodes, so rank (an upper bound on height) is at most log₂ n. Path compression is needed to get down to amortised α(n); rank alone is logarithmic.
- q: >-
    After path compression, the rank stored at a root no longer equals its tree's height. Why is the union rule still correct?
  options: ["It is not; you must recompute heights after every compression", "Rank remains an upper bound on height, and the 2^rank size argument only needs an upper bound", "Compression never changes heights", "Because the rank is reset to 0 after each find"]
  answer: 1
  explanation: >-
    Compression only shortens trees, so height ≤ rank still holds, and the counting argument (a rank-r root has ≥ 2^r nodes) never relied on rank being exact. Recomputing heights would cost more than the operation it protects.
- q: >-
    You are asked: for each of Q queries (t, u, v), were u and v connected at time t, given a log of link-up events? Links are never removed. What is the right approach?
  options: ["Run BFS per query on the graph filtered by time, O(Q(V+E))", "Sort events and queries by time, advance a union-find through events, answer each query when reached", "Use Floyd-Warshall once", "Union-find cannot answer time-based questions"]
  answer: 1
  explanation: >-
    Because there are no deletions, connectivity at time t depends only on events up to t. Sorting both lists and sweeping once is O((E+Q) log(E+Q)) plus near-constant per operation; per-query BFS is the O(Q·E) approach it replaces.
- q: >-
    A stream removes edges from a graph one by one and after each removal asks for the number of connected components. All removals are known in advance. How do you use union-find?
  options: ["Support deletion by resetting parent pointers", "Process the removals in reverse as insertions, starting from the graph with all removed edges absent, and record component counts backwards", "Rebuild the union-find after each removal", "You cannot; use BFS after each removal"]
  answer: 1
  explanation: >-
    Reversing time turns each deletion into an insertion, which union-find handles. Resetting parent pointers is not a valid deletion because compression has rewired other nodes through them. Rebuilding is O(E) per step; reversal is near-linear overall.
- q: >-
    Two implementations of union differ only in that one hangs the smaller set under the larger and the other always hangs the second root under the first. Both use full path compression. Which statement is true?
  options: ["They have identical worst-case guarantees because compression dominates", "Only the size-aware one achieves amortised O(α(n)); the other is amortised O(log n)", "The size-aware one is O(log n) and the other is O(α(n))", "Neither achieves better than O(log n)"]
  answer: 1
  explanation: >-
    Path compression alone gives amortised O(log n); combining it with union by rank or size is what yields the inverse-Ackermann bound. In practice both are fast, but the guarantee differs, and interviewers ask precisely this.
```

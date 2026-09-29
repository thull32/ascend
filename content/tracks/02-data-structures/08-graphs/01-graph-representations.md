---
slug: graph-representations
title: "Graph representations: lists, matrices and implicit graphs"
description: Adjacency lists, adjacency matrices, edge lists and CSR with their real memory and time costs, directed and weighted variants and their bugs, what networkx, scipy and Neo4j do under the hood, and the implicit graphs (grids, states, words) you traverse without ever building.
minutes: 50
difficulty: easy
tags: [graphs, adjacency-list, adjacency-matrix, representation, implicit-graph]
problems: [clone-graph, number-of-islands, count-components]
---
A graph is a set of vertices and a set of edges between them. That is a mathematical object; before you can run anything on it, you have to decide how it sits in memory, and the choice decides whether "list my neighbours" costs O(degree) or O(V), whether "is there an edge from u to v" is O(1) or a scan, and whether a million-vertex graph fits in RAM at all. A graph with 10^6 vertices and 10^7 edges is 44 MB in one layout, 1.4 GB in another and 125 GB as a bit matrix. Most graph bugs in interviews are representation bugs: an adjacency list built with one direction for an undirected graph, a matrix allocated for V = 10^5, a `visited` set keyed by the wrong thing.

## Vocabulary, briefly

- **Directed** edges go one way (`u → v`); **undirected** edges go both ways and are stored as two directed edges in most representations.
- **Weighted** edges carry a number (distance, cost, capacity); unweighted edges are all equal.
- **Degree** of a vertex is its number of edges; directed graphs have in-degree and out-degree. In an undirected graph the degrees sum to 2E (every edge is counted from both ends), which is the cheapest sanity check you have on a freshly built graph.
- **Path**: a sequence of vertices with an edge between each consecutive pair. **Cycle**: a path that returns to its start. **Connected** (undirected): every vertex reachable from every other; **strongly connected** (directed): the same with direction respected.
- **Sparse** graph: E is close to V. **Dense**: E is close to V². Most real graphs are sparse: when Facebook's graph had 721 million active users (May 2011), the [median user had 99 friends](https://arxiv.org/abs/1111.4503).
- **DAG**: directed acyclic graph, the shape of every dependency system.

## One graph, four layouts

Every representation in this lesson is built from the same directed graph: 6 vertices, 8 edges, given as an edge list in input order.

```text
edges = (0,1) (0,2) (1,2) (2,0) (2,3) (3,4) (4,5) (5,3)
```

**Adjacency list.** One list per vertex; append each edge to its source's list, in input order:

```text
adj[0] = [1, 2]
adj[1] = [2]
adj[2] = [0, 3]
adj[3] = [4]
adj[4] = [5]
adj[5] = [3]
```

**Adjacency matrix.** Row = source, column = target, `m[u][v] = 1` for each edge:

```text
      0 1 2 3 4 5
  0 [ 0 1 1 0 0 0 ]
  1 [ 0 0 1 0 0 0 ]
  2 [ 1 0 0 1 0 0 ]
  3 [ 0 0 0 0 1 0 ]
  4 [ 0 0 0 0 0 1 ]
  5 [ 0 0 0 1 0 0 ]
```

Eight 1s in 36 cells: 78% of the matrix stores "no edge".

**CSR (compressed sparse row).** Two flat arrays. Build it in three passes, all O(V + E):

1. Count out-degrees: `deg = [2, 1, 2, 1, 1, 1]`.
2. Prefix-sum the degrees into `offsets` of length V + 1, starting at 0: `offsets = [0, 2, 3, 5, 6, 7, 8]`. Entry `u` is where vertex `u`'s neighbours start; the last entry is E.
3. Copy `offsets[:-1]` into a `cursor` array and place each edge `(u, v)` at `targets[cursor[u]]`, then advance `cursor[u]`. In input order the placements are: (0,1) → slot 0, (0,2) → slot 1, (1,2) → slot 2, (2,0) → slot 3, (2,3) → slot 4, (3,4) → slot 5, (4,5) → slot 6, (5,3) → slot 7.

```text
offsets = [0, 2, 3, 5, 6, 7, 8]        # V + 1 entries
targets = [1, 2, 2, 0, 3, 4, 5, 3]     # E entries, grouped by source
           ^0    ^1 ^2    ^3 ^4 ^5     # which vertex each run belongs to
```

Neighbour iteration for vertex 2 is the slice `targets[offsets[2] : offsets[3]]` = `targets[3:5]` = `[0, 3]`. Its degree is `offsets[3] − offsets[2]` = 2 without touching `targets` at all. That is the whole structure: no per-vertex allocation, contiguous neighbour scans, and any degree in one subtraction.

```python
def build_csr(n, edges):
    deg = [0] * n
    for u, _ in edges:
        deg[u] += 1
    offsets = [0] * (n + 1)
    for u in range(n):
        offsets[u + 1] = offsets[u] + deg[u]       # prefix sum
    cursor = offsets[:-1]                          # a copy: where the next neighbour of u goes
    targets = [0] * len(edges)
    for u, v in edges:
        targets[cursor[u]] = v
        cursor[u] += 1
    return offsets, targets

def neighbours(offsets, targets, u):
    return targets[offsets[u]:offsets[u + 1]]
```

The copy on the `cursor` line is not optional: without it the fill pass would advance `offsets` itself and every later slice would start one past its true position.

## Adjacency list

With vertices numbered `0..V−1`, it is a list of lists; with arbitrary ids, a dictionary from id to list.

```python
def build_adjacency(n, edges, directed=False):
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        if not directed:
            adj[v].append(u)
    return adj

adj = build_adjacency(4, [(0, 1), (1, 2), (2, 0), (2, 3)])
# adj == [[1, 2], [0, 2], [1, 0, 3], [2]]
```

Memory is O(V + E): one list header per vertex and one entry per directed edge (two per undirected edge). Iterating a vertex's neighbours is O(degree), which is exactly what BFS and DFS need, so both traversals run in O(V + E). Checking whether a specific edge exists is O(degree), or O(1) if you use a set per vertex instead of a list, at roughly double the memory (measured below).

Weighted graphs have two idioms. Tuples, `adj[u].append((v, w))`, keep every edge including parallel ones and cost one 64-byte tuple per entry in CPython. A dict of dicts, `adj[u][v] = w`, gives O(1) edge lookup and O(1) weight update but keeps exactly one weight per `(u, v)` pair: a second edge between the same vertices overwrites the first. If the input can contain two flights between the same cities and the algorithm wants the cheapest, write `adj[u][v] = min(adj[u].get(v, inf), w)` and say so; silently keeping the last one is a bug that only shows on inputs with duplicates.

For a graph with string ids, `adj = defaultdict(list)` avoids pre-declaring vertices, with the classic trap that a vertex with no outgoing edges never appears as a key; iterate over a separate vertex set, not over `adj.keys()`.

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "C", "to": "A"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}],
 "title": "Traversing an adjacency list", "caption": "Each step reads one vertex's neighbour list. The total work over a whole traversal is the sum of all list lengths: O(V + E)."}
```

## Adjacency matrix

A V × V grid where `m[u][v]` is 1 (or the weight) if the edge exists and 0 (or infinity) otherwise.

```python
def build_matrix(n, edges, directed=False):
    m = [[0] * n for _ in range(n)]      # never [[0] * n] * n: that is n references to ONE row
    for u, v in edges:
        m[u][v] = 1
        if not directed:
            m[v][u] = 1
    return m
```

Edge lookup is O(1). Everything else is worse: memory is O(V²) regardless of E, and listing a vertex's neighbours means scanning a whole row, O(V), so BFS and DFS become O(V²). For V = 10^5 the matrix has 10^10 cells: 1.25 GB as a bit-set, 10 GB as a NumPy `bool` array, 80 GB as a Python list of lists (8-byte pointers per cell; 0 and 1 are cached small ints, so no per-cell int objects), for a graph whose adjacency list at ten edges per vertex is a few tens of megabytes.

The matrix wins in three situations: the graph is genuinely dense (E ≈ V²), so the list has no memory advantage and the matrix's contiguous rows are faster to scan; the algorithm is inherently O(V²) or O(V³) anyway ([Floyd-Warshall](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall) all-pairs shortest paths, transitive closure, Prim's on dense graphs); or V is tiny (under a few hundred) and the constant-time edge test simplifies the code. Matrix multiplication also has meaning: `m^k[u][v]` counts walks of length `k` from `u` to `v`, the basis of the GraphBLAS view below.

## Edge list

The list of `(u, v)` or `(u, v, w)` tuples, O(E) memory and nothing precomputed. It is what you receive as input, what [Kruskal's algorithm](/learn/algorithms/graph-algorithms/minimum-spanning-trees) sorts by weight, what Bellman-Ford iterates V − 1 times, and what fits in a database table or a CSV. For any traversal, convert it to an adjacency list or CSR first: O(E) work, done once.

## Memory per edge, with the arithmetic

Take a graph of 10^6 vertices and 10^7 directed edges (average out-degree 10). The measured Python figures come from `tracemalloc` on a random graph of 10^4 vertices and 10^5 edges under CPython 3.14, with each neighbour parsed into a fresh int object as it would be from a file, then scaled by 100; the per-vertex overhead scales in the same ratio, so the per-edge figure already includes it. Ints outside −5..256 are separate 28-byte objects in CPython; a graph with a million vertex ids gets no help from the small-int cache.

| Layout | Per edge, where it goes | Measured or computed | Total for 10^7 edges |
|---|---|---|---|
| Python list of lists | 8-byte list slot × ~1.1–1.3 over-allocation, plus a 28-byte int object; 56-byte list header per vertex amortised over 10 edges (~6 B) | 44.5 B/edge measured | ~450 MB |
| Python `dict` of lists | as above plus one dict entry per vertex (24-byte entry + index byte, at a 2/3 load factor) | 46.6 B/edge measured | ~470 MB |
| Python `defaultdict(set)` | a set of 10 members occupies a 32-slot table of 16-byte (hash, pointer) entries plus a 216-byte header = 728 bytes, ~73 B per member, plus the 28-byte int | 102.7 B/edge measured | ~1.0 GB |
| Python dict of dict of dict (networkx's layout) | an inner dict entry (~35 B at 10 members), a 64-byte empty attribute dict per edge, the 28-byte int key | 143 B/edge measured | ~1.4 GB |
| Java `ArrayList<Integer>` per vertex | a boxed `Integer` is 16 bytes (12-byte header + 4-byte value, aligned to 8) plus a 4-byte compressed reference × 1.5 growth slack; the `Integer` cache covers only −128..127 | ~22 B/edge computed | ~220 MB, plus ~40 MB of per-vertex `ArrayList` and array headers |
| CSR, `u32` | 4 bytes per edge in `targets` plus 4 bytes per vertex in `offsets` | 4 B/edge + 4 B/vertex | 40 MB + 4 MB = 44 MB |
| CSR, `u64` | 8 + 8 | 8 B/edge + 8 B/vertex | 88 MB |
| Adjacency matrix, bits | V²/8 bytes, independent of E | 10^12 / 8 | 125 GB |
| Adjacency matrix, one byte per cell | V² bytes | 10^12 | 1 TB |

Two things to take from the table. The Python list of lists is already 10× CSR because each neighbour is a pointer to a heap-allocated integer; the dict-of-dict-of-dict layout that gives you per-edge attributes is over 30× CSR. And the matrix is not on the same axis at all: its size depends only on V, so at 10^6 vertices it sits three orders of magnitude above the sparse layouts however few edges there are.

## Under the hood

### networkx: dict of dict of dict

`networkx.Graph` stores `G._adj[u][v]` as a dictionary of edge attributes, so a vertex is an outer dict entry, each neighbour is an inner dict entry, and each edge owns an attribute dict (for an undirected edge the same attribute dict object is shared by both directions). That is why it is flexible (any hashable vertex, arbitrary attributes, O(1) edge test and removal) and why the measured cost is around 140 bytes per directed edge: three dictionary levels at a 2/3 load factor with 24-byte entries, plus the empty attribute dict. Right up to a few million edges on a laptop; wrong for a 10^9-edge web graph.

### scipy.sparse and igraph: CSR

`scipy.sparse.csr_matrix` stores exactly the three arrays you built above, named `indptr` (the offsets), `indices` (the targets) and `data` (the weights); `scipy.sparse.csgraph` runs BFS, Dijkstra and connected components straight on them. igraph's C core keeps an indexed edge list: arrays of edge endpoints plus sorted-index and offset arrays for both the out- and the in-direction, which behaves like CSR for neighbour scans in either direction at the cost of storing every edge twice. Both are immutable in the sense that matters: inserting one edge means rebuilding an O(E) array.

### Neo4j: index-free adjacency

Neo4j's record-based store formats (`aligned` is the Community Edition default; Enterprise Edition now defaults to a `block` format that inlines related data for locality) keep nodes and relationships in separate store files as fixed-size records of a few tens of bytes, so record `i` lives at offset `i × record_size` and needs no index to find. A node record points at its first relationship; each relationship record points at the previous and next relationship of both its start node and its end node, forming a doubly linked list per node threaded through the relationship store. Walking a node's relationships is pointer chasing at fixed offsets, which is what "index-free adjacency" means. The trade-off against CSR is locality: a node with 10^4 relationships has them scattered across the file and its page cache, one random read per hop, where CSR would read one contiguous 40 KB slice. The [graph databases lesson](/learn/databases/nosql-and-specialised/graph-time-series-and-vector-databases) covers when that trade is worth making.

### GraphBLAS: BFS as a matrix-vector product

Represent the current frontier as a Boolean vector `f` with a 1 for each frontier vertex. Then `f · A` over the Boolean semiring (OR instead of +, AND instead of ×) is a vector with a 1 at every vertex reachable in one step, and masking out already visited vertices gives the next frontier. On the running example from vertex 0:

```text
f0 = [1,0,0,0,0,0]                      visited = {0}
f1 = f0·A = row 0            = [0,1,1,0,0,0]    visited = {0,1,2}
f2 = f1·A = row 1 OR row 2   = [1,0,1,1,0,0] masked -> [0,0,0,1,0,0]
f3 = row 3                   = [0,0,0,0,1,0]
f4 = row 4                   = [0,0,0,0,0,1]
f5 = row 5                   = [0,0,0,1,0,0] masked -> all zero: stop
```

Levels 1 to 4 match the queue-based BFS. SuiteSparse:GraphBLAS implements this with sparse vectors and CSR/CSC matrices, and LAGraph's BFS on top of it switches each level between "push" (multiply from the frontier's rows) and "pull" (for each unvisited column, look for a frontier row); that choice is the direction-optimising BFS of the [next lesson](/learn/data-structures/graphs/breadth-first-search).

## Directed, undirected and the bugs between them

The single most common graph bug is building an undirected graph with edges in one direction only, then wondering why BFS from vertex 3 cannot reach vertex 0 when the input has an edge between them. The second most common is the reverse: adding both directions for a directed graph and finding a cycle in every DAG. Read the statement for the words "directed", "one-way", "depends on", "prerequisite", "follows" (directed) versus "friends", "connected", "adjacent", "road between" (undirected), and write the `directed` flag down before you write the loop.

Two smaller traps live in degree counts. A **self-loop** `(u, u)` in an undirected graph, built with the usual "append to both ends" code, appears twice in `adj[u]`; the handshake lemma counts it as 2, so `sum(degrees) == 2E` still holds, but a neighbour loop now visits `u` from `u` twice, and a matrix stores it once in `m[u][u]`. **Parallel edges** `(u, v)` given twice appear twice in a list, once in a matrix and once in a dict of dicts (with the last weight); `len(adj[u])` is then not "number of distinct neighbours". Decide, and write down, whether the input can contain either, and whether you deduplicate on build.

For directed graphs, two more representations come up: the **reverse graph** (every edge flipped), needed by Kosaraju's [SCC algorithm](/learn/algorithms/graph-algorithms/strongly-connected-components) and by "who depends on me" queries, and separate in-degree counts, needed by Kahn's [topological sort](/learn/data-structures/graphs/topological-sort-and-dags). Both are one O(E) pass; a reverse-graph CSR is the same three-pass build with `u` and `v` swapped.

## Implicit graphs

Many graphs are never built. The vertices and edges are defined by a rule, and the traversal generates neighbours on demand. The design question is always the same: what is a vertex, what is an edge, and how many vertices could there be.

**Grids.** A 1000 × 1000 grid has 10^6 cells and 2 × 1000 × 999 = 1,998,000 undirected 4-adjacencies, about 4 × 10^6 directed entries. Nobody builds that: the neighbour function is `for dr, dc in ((1,0),(-1,0),(0,1),(0,-1))` with a bounds check, and the "adjacency list" costs zero bytes. `number-of-islands`, `rotting-oranges`, `pacific-atlantic` and every maze problem are grid graphs.

```viz
{"type": "graph", "algorithm": "grid-islands",
 "grid": [[1, 1, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 1, 0], [1, 0, 1, 0, 0]],
 "title": "A grid as an implicit graph", "caption": "Cells are vertices, 4-adjacency defines the edges, and a traversal from each unvisited land cell discovers one island. No adjacency list is ever built."}
```

**State spaces.** The vertices are configurations and the edges are legal moves. Some sizes, so that you can say them in an interview:

| State space | Vertices | Edges per vertex | Build it? |
|---|---|---|---|
| Knight on an 8 × 8 board | 64 | up to 8 | Could, pointless |
| Word ladder, 5-letter words, 10^4-word dictionary | 10^4 | up to 5 × 25 = 125 candidates, a handful real | Generate on demand; test each candidate against a set |
| 8-puzzle (3 × 3 sliding tiles) | 9 factorial / 2 = 181,440 reachable | 2–4 | Fits, but you only touch the part you reach |
| 15-puzzle (4 × 4) | 16 factorial / 2 ≈ 1.05 × 10^13 | 2–4 | Never: at 4 bytes per edge the list would be ~10^14 bytes |
| Rubik's cube | ≈ 4.3 × 10^19 | 18 | Never |

`word-ladder`'s neighbours come from mutating each position through 25 letters and keeping the ones in the dictionary; a wildcard index (`h*llo` → matching words) precomputes that in 5 × 10^4 keys. A `visited` set keyed by the *state* is what keeps the traversal finite, and choosing what goes into the state key (position only, or position plus keys held, or position plus moves left) is the whole design problem; the [BFS lesson](/learn/data-structures/graphs/breadth-first-search) works the "obstacles removable k times" version.

**Knowledge and data.** A file system's import graph, a database's foreign keys, a Kubernetes cluster's ownership references: the "edges" are found by parsing or querying, and traversal is interleaved with I/O. Same algorithms; neighbour discovery is expensive and should be cached.

The interview signal is saying "the vertices are X, the edges are Y, and there are about Z of them" before writing code: the [modelling lesson](/learn/data-structures/graphs/graphs-in-the-real-world) in miniature.

## Vertex identity and the visited set

Every traversal needs to know which vertices it has seen; the key matters:

- Integers `0..V−1`: a boolean array, O(1) and cache-friendly.
- Strings or objects: a hash set. Do not key on the *object* when two objects can represent the same vertex; key on a canonical id.
- Grid cells: `visited[r][c]` array, or encode as `r * cols + c` into one flat array, or mark the grid in place (turn visited land into water) when you are allowed to mutate the input.
- State tuples: a set of tuples in Python, or a stringified key in JavaScript (`` `${r},${c},${mask}` ``) because JS `Set` compares arrays by reference.

The grid case has a measurable cost. In a neighbour loop, `(r + dr, c + dc) in seen` allocates a tuple, hashes two ints and probes a set on every check; `seen[r + dr][c + dc]` is two list indexings. Measured on CPython 3.14 with 4 × 10^5 checks against a 1000 × 1000 grid: about 97 ns per check for the set of tuples against 36 ns for the 2-D list, a factor of 2.7, or 0.4 s against 0.15 s of visited checks on a 10^6-cell BFS. The [hash tables lesson](/learn/data-structures/hashing/hash-tables) explains where those 97 ns go.

For `clone-graph` the visited structure doubles as the map from original node to its copy, the pattern for any traversal that builds a parallel structure.

## Trade-offs

| Axis | Adjacency list | Adjacency matrix | Edge list | CSR |
|---|---|---|---|---|
| Space | O(V + E), ~45 B/edge in CPython | O(V²), independent of E | O(E) | O(V + E), 4–8 B/edge |
| Edge (u, v) exists? | O(deg u); O(1) with sets | O(1) | O(E) | O(deg u); O(log deg) if targets sorted |
| Neighbours of u | O(deg u), pointer chasing | O(V) row scan | O(E) | O(deg u), one contiguous slice |
| Add an edge | O(1) amortised | O(1) | O(1) | O(E) rebuild |
| Remove an edge | O(deg u) | O(1) | O(E) | O(E) rebuild |
| Cache behaviour | each neighbour is a heap object; poor locality | rows contiguous; wasted bandwidth on zeros | sequential; useless for traversal | best: sequential per vertex, no pointers |
| BFS / DFS | O(V + E) | O(V²) | Convert first | O(V + E), fastest constant |
| Best for | Interviews, mutable graphs, anything sparse | Dense graphs, tiny V, O(V²) algorithms | Input, storage, Kruskal, Bellman-Ford | Analytics on static graphs, anything large |

The interview default is the adjacency list, stated with its O(V + E) cost. Reach for the matrix only with a reason (dense, tiny, or an O(V²) algorithm anyway), and mention CSR when the interviewer asks how you would store the graph at 10^9 edges. The "cache behaviour" row comes from the [memory hierarchy lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy): a neighbour scan over CSR streams through memory at prefetch speed, while the same scan over a list of lists takes a cache miss per neighbour.

## Failure modes

### Matrix allocated for a sparse graph

Symptom: `MemoryError`, or the process killed by the OOM killer, the first time the input has 10^5 vertices; smaller tests passed. Diagnosis: memory grows with V² regardless of E: 10^4 vertices was 800 MB of Python lists, 10^5 is 80 GB. Fix: adjacency list or CSR; if the algorithm truly needs O(1) edge tests, per-vertex sets.

### Every row is the same list

Symptom: setting `m[0][1] = 1` makes `m[1][1]`, `m[2][1]` and every other row's column 1 equal to 1 as well; the graph appears fully connected along columns. Diagnosis: `[[0] * n] * n` creates one inner list and n references to it; `id(m[0]) == id(m[1])` confirms. The same bug appears as a mutable default argument, `def add_edge(u, v, adj={})`, where one graph leaks into every later call. Fix: a comprehension `[[0] * n for _ in range(n)]`, and `adj=None` with `if adj is None: adj = {}`.

### The reverse edge is missing

Symptom: a component count that is too high, or a BFS that reaches `v` from `u` but not `u` from `v`. Diagnosis: for an undirected graph, check `sum(len(l) for l in adj) == 2 * E` and that `v in adj[u]` implies `u in adj[v]`; either failing means one direction was dropped. Fix: append to both endpoints, and keep the check as an assertion in tests.

### Tuple keys in a hot loop

Symptom: a grid BFS in Python over a few million cells takes seconds, and a profile shows the time in tuple allocation and set probes, not in the algorithm. Diagnosis: `(r, c) in seen` builds and hashes a tuple per neighbour check, about 100 ns each on CPython 3.14, four checks per cell. Fix: a 2-D list of booleans, a flat `bytearray` indexed by `r * cols + c`, or marking the grid in place; each removes the allocation and the hash.

## Interviewer follow-ups

**"The graph has 10^9 edges and 10^8 vertices. How do you store it on one machine?"** Model answer: CSR with 32-bit targets is 4 GB of `targets` plus 0.4 GB of `offsets`, which fits; vertex ids above 2^32 force 64-bit targets and 8 GB. Sorting each vertex's neighbours and delta-encoding them (as web-graph compressors do) brings it down to a few bits to a couple of bytes per edge depending on how clustered the ids are. Common wrong answer: a dict of sets, which is 100 bytes per edge and needs 100 GB.

**"Edge existence on an adjacency list is O(degree). What if I need it fast?"** Model answer: per-vertex sets for O(1) at about double the memory; sorted CSR targets with binary search for O(log degree) at no extra memory; a matrix only if the graph is dense enough that V² is affordable. Common wrong answer: "scanning is fine because the graph is sparse", which ignores hubs: a vertex with 10^5 neighbours makes every existence test a 10^5 scan.

**"The graph changes constantly, friend and unfriend events all day. Still CSR?"** Model answer: no; CSR is immutable and an insert is an O(E) rebuild. Keep the live graph as adjacency lists or sets and rebuild a CSR snapshot periodically for analytics. Common wrong answer: insert into CSR by shifting the `targets` array, O(E) per edge, which turns 10^6 events a day into 10^15 element moves.

**"Weighted graph with possibly parallel edges: tuples or dict of dicts?"** Model answer: dict of dicts if the algorithm needs O(1) edge lookup and one weight per pair is the right semantics, with an explicit `min` on insert when the cheapest parallel edge is wanted; tuples if every edge must survive (flow networks, multigraphs) or the graph is only ever iterated. Common wrong answer: dict of dicts always, which silently keeps the last of two parallel edges.

## What mid-level engineers get wrong

- Iterating `for u in adj:` over a `defaultdict` and never visiting vertices that only appear as targets; a sink vertex vanishes from component counts.
- Testing `v in adj[u]` on a list inside a loop over all edges: O(deg) per test, O(E × deg) total, which on a hub-heavy graph is quadratic.
- Rebuilding the adjacency list inside a function that is called once per query, turning Q queries into Q × O(E) work.
- Treating "undirected" as "store once, search both directions", which makes every neighbour scan O(E).
- Assuming a Python int is 4 bytes, and sizing a 10^7-edge graph at 40 MB when it is 450 MB.
- Picking the matrix at V = 10^4: 10^8 cells, 800 MB as Python lists, and 10^8 steps for every BFS.

## Exercises

```exercise
id: build-adjacency-list
title: Build an adjacency list from an edge list
prompt: |
  `adjacency_list(n, edges, directed)`: vertices are `0..n-1` and `edges`
  is a list of `[u, v]` pairs with no duplicates and no self-loops. Return
  a list of `n` lists where entry `u` holds the neighbours of `u` sorted
  ascending. For an undirected graph (`directed` false) each edge appears
  in both endpoints' lists; for a directed graph it appears only in `u`'s.
languages: [python, javascript]
entry: adjacency_list
starter:
  python: |
    def adjacency_list(n, edges, directed):
        adj = [[] for _ in range(n)]
        return adj
  javascript: |
    function adjacency_list(n, edges, directed) {
      const adj = Array.from({ length: n }, () => []);
      return adj;
    }
tests:
  - args: [4, [[0, 1], [1, 2], [2, 0], [2, 3]], false]
    expected: [[1, 2], [0, 2], [0, 1, 3], [2]]
  - args: [4, [[0, 1], [1, 2], [2, 0], [2, 3]], true]
    expected: [[1], [2], [0, 3], []]
    label: same edges, directed
  - args: [3, [], false]
    expected: [[], [], []]
    label: no edges
  - args: [1, [], true]
    expected: [[]]
  - args: [5, [[4, 0], [3, 4]], false]
    expected: [[4], [], [], [4], [0, 3]]
    hidden: true
  - args: [3, [[2, 0], [2, 1], [1, 0]], true]
    expected: [[], [0], [0, 1]]
    hidden: true
hints:
  - "Append v to adj[u]; if not directed, also append u to adj[v]. Sort each list at the end."
  - "In JavaScript, sort numerically: list.sort((a, b) => a - b); the default sort is lexicographic."
```

```exercise
id: build-adjacency-matrix
title: Build an adjacency matrix
prompt: |
  `adjacency_matrix(n, edges, directed)`: return an `n x n` list of lists of
  0/1 integers where `m[u][v]` is 1 exactly when there is an edge from `u`
  to `v`. Undirected edges set both `m[u][v]` and `m[v][u]`. No self-loops
  or duplicate edges are given.
languages: [python, javascript]
entry: adjacency_matrix
starter:
  python: |
    def adjacency_matrix(n, edges, directed):
        m = [[0] * n for _ in range(n)]
        return m
  javascript: |
    function adjacency_matrix(n, edges, directed) {
      const m = Array.from({ length: n }, () => new Array(n).fill(0));
      return m;
    }
tests:
  - args: [3, [[0, 1], [1, 2]], false]
    expected: [[0, 1, 0], [1, 0, 1], [0, 1, 0]]
  - args: [3, [[0, 1], [1, 2]], true]
    expected: [[0, 1, 0], [0, 0, 1], [0, 0, 0]]
    label: directed
  - args: [1, [], false]
    expected: [[0]]
    label: single vertex
  - args: [2, [[1, 0]], true]
    expected: [[0, 0], [1, 0]]
    hidden: true
  - args: [4, [[0, 3], [3, 1]], false]
    expected: [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 0], [1, 1, 0, 0]]
    hidden: true
hints:
  - "Never write [[0] * n] * n in Python: every row would be the same list object."
  - "Set m[u][v] = 1, and m[v][u] = 1 too when not directed."
```

## Senior signals

- You state the representation and its cost before the algorithm: "adjacency list, O(V + E) memory, so BFS is O(V + E)".
- You read the statement for direction words and write the `directed` flag down before building anything, and you ask whether self-loops or parallel edges can appear.
- You know a matrix is O(V²) and can name the three cases where it is the right choice anyway, and you can say what 10^5 vertices costs as bits, bytes and Python lists.
- You can build CSR by hand (degree count, prefix sum, cursor fill) and read a neighbour slice and a degree off the `offsets` array.
- You can put a number on memory per edge for the language you are using (about 45 bytes in CPython, about 22 in Java with boxing, 4 in CSR) and explain where each byte goes.
- You recognise grids, word lists and state spaces as **implicit graphs**, can say what the vertices and edges are in one sentence, and can estimate how many there are.
- You choose the visited key deliberately (array for ints, canonical id for objects, tuple or string for states), you know why a JS `Set` of arrays does not work, and you know a set of tuples costs about 3× a 2-D array in a hot loop.
- You know what networkx, scipy.sparse and a graph database each do with an edge, and you pick between mutable adjacency lists and an immutable CSR snapshot on the basis of how often the graph changes.

## Check yourself

```quiz
- q: >-
    A social graph has 500 million users and an average of 200 friends each. Storing it as an adjacency matrix of bits would need about:
  options: ["About 30 PB", "About 12.5 GB", "About 30 TB", "About 400 GB"]
  answer: 0
  explanation: >-
    V² = 2.5 × 10^17 bits ≈ 3 × 10^16 bytes, roughly 30 petabytes. The matrix size depends only on V, not on the 200 friends; 400 GB is the adjacency list (10^11 directed entries at 4 bytes each). Sparse graphs make the matrix absurd.
- q: >-
    Your BFS from vertex 3 in an undirected graph never reaches vertex 0, although the input contains the edge [0, 3]. The most likely bug is:
  options: ["The queue was a stack, so the search ran depth-first instead", "Vertex 0 has degree zero, so BFS has no edge by which to reach it", "Each edge was added to only one endpoint's adjacency list", "BFS treats edges as one-way, so it cannot cross undirected edges"]
  answer: 2
  explanation: >-
    Adding only adj[0].append(3) makes the edge traversable from 0 but not from 3. Undirected edges must be inserted in both endpoints' lists; BFS itself follows whatever lists it is given. Using a stack would change the visiting order, not which vertices are reachable.
- q: >-
    A CSR graph has offsets = [0, 2, 3, 5, 6, 7, 8] and targets = [1, 2, 2, 0, 3, 4, 5, 3]. The neighbours of vertex 2 are:
  options: ["targets[5:6], which is [4]", "targets[2:5], which is [2, 0, 3]", "targets[3:5], which is [0, 3]", "targets[2:3], which is [2]"]
  answer: 2
  explanation: >-
    Vertex u's neighbours occupy targets[offsets[u] : offsets[u + 1]]; for u = 2 that is offsets[2] = 3 to offsets[3] = 5, so the slice [0, 3], and the degree is 5 − 3 = 2. Reading the slice from position u itself, or up to offsets[u + 2], mixes in another vertex's run.
- q: >-
    In CPython, an adjacency list of 10^7 directed edges over 10^6 vertices built as a list of lists takes about 450 MB, while a u32 CSR takes 44 MB. Where do most of the extra bytes go?
  options: ["The outer list stores a 64-byte header for every vertex", "Each list is over-allocated to twice its length on every append", "Each neighbour is a pointer to a separate 28-byte int object", "Python stores every int as 8 bytes instead of CSR's 4"]
  answer: 2
  explanation: >-
    A list slot is an 8-byte pointer, and ints above 256 are heap objects of 28 bytes each, so a neighbour costs about 36 bytes before growth slack; the per-vertex header is 56 bytes but amortised over ten edges it is only ~6 bytes per edge. Over-allocation is about 12.5% plus a small constant, not 2×.
- q: >-
    In JavaScript you track visited grid cells with a Set of [r, c] arrays and the BFS never terminates. Why?
  options: ["Arrays compare by reference, so a new [r, c] never matches a stored one", "Arrays are hashed by their first element only, so whole rows collide", "Sets silently drop array values, so every add leaves the set empty", "BFS needs a Map from cell to distance; a Set cannot record visits"]
  answer: 0
  explanation: >-
    Two arrays with the same contents are different objects, so has([r, c]) on a freshly built array is always false even though the set holds a lookalike. Use a string key like r + ',' + c, a numeric key r * cols + c, or a 2D boolean array.
- q: >-
    A puzzle has about 10^12 possible states, but the solution is 20 moves from the start and each state has 4 moves. Which representation should you use?
  options: ["An adjacency matrix over all states, giving O(1) move checks", "An implicit graph: neighbours generated by applying moves on demand", "An adjacency list of every state, built once up front before searching", "An edge list of all legal moves, sorted and scanned per step"]
  answer: 1
  explanation: >-
    Only states within 20 moves are ever touched, at most 4^20 in the worst case and far fewer with a visited set of states actually reached. Building the full adjacency list is impossible at 10^12 states (and a matrix far worse); the neighbour function is the graph.
```

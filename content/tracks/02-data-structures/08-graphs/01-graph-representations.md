---
slug: graph-representations
title: "Graph representations: lists, matrices and implicit graphs"
description: Adjacency lists, adjacency matrices and edge lists with their real memory and time costs, directed and weighted variants, and the implicit graphs (grids, states, words) you traverse without ever building.
minutes: 35
difficulty: easy
tags: [graphs, adjacency-list, adjacency-matrix, representation, implicit-graph]
problems: [clone-graph, number-of-islands, count-components]
---
A graph is a set of vertices and a set of edges between them. That is a mathematical object; before you can run anything on it, you have to decide how it sits in memory, and the choice decides whether "list my neighbours" costs O(degree) or O(V), whether "is there an edge from u to v" is O(1) or a scan, and whether a million-vertex graph fits in RAM at all. Most graph bugs in interviews are representation bugs: an adjacency list built with one direction for an undirected graph, a matrix allocated for V = 10⁵, a `visited` set keyed by the wrong thing.

## Vocabulary, briefly

- **Directed** edges go one way (`u → v`); **undirected** edges go both ways and are stored as two directed edges in most representations.
- **Weighted** edges carry a number (distance, cost, capacity); unweighted edges are all equal.
- **Degree** of a vertex is its number of edges; directed graphs have in-degree and out-degree.
- **Path**: a sequence of vertices with an edge between each consecutive pair. **Cycle**: a path that returns to its start.
- **Connected** (undirected): every vertex reachable from every other. **Strongly connected** (directed): the same with direction respected.
- **Sparse** graph: E is close to V. **Dense**: E is close to V². Most real graphs are sparse: a social network with a billion users has a few hundred friends per user, not a billion.
- **DAG**: directed acyclic graph, the shape of every dependency system.

## Adjacency list

For each vertex, a list of its neighbours. With vertices numbered `0..V−1`, it is a list of lists; with arbitrary ids, a dictionary from id to list.

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

Memory is O(V + E): one list header per vertex and one entry per directed edge (two per undirected edge). Iterating a vertex's neighbours is O(degree), which is exactly what BFS and DFS need, so both traversals run in O(V + E). Checking whether a specific edge exists is O(degree), or O(1) if you use a set per vertex instead of a list, at roughly double the memory.

Weighted graphs store `(neighbour, weight)` pairs: `adj[u].append((v, w))`. For a graph with string ids, `adj = defaultdict(list)` avoids pre-declaring vertices, with the classic trap that a vertex with no outgoing edges never appears as a key; iterate over a separate vertex set, not over `adj.keys()`.

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
    m = [[0] * n for _ in range(n)]
    for u, v in edges:
        m[u][v] = 1
        if not directed:
            m[v][u] = 1
    return m
```

Edge lookup is O(1). Everything else is worse: memory is O(V²) regardless of E, and listing a vertex's neighbours means scanning a whole row, O(V), so BFS and DFS become O(V²). For V = 10⁵ the matrix is 10¹⁰ cells; even as a bit-set that is over a gigabyte, for a graph whose adjacency list might be a few megabytes.

The matrix wins in three situations: the graph is genuinely dense (E ≈ V²), so the list has no memory advantage and the matrix's contiguous rows are faster to scan; the algorithm is inherently O(V²) or O(V³) anyway (Floyd-Warshall all-pairs shortest paths, transitive closure, Prim's on dense graphs); or V is tiny (under a few hundred) and the constant-time edge test simplifies the code. Matrix multiplication also has meaning: `m^k[u][v]` counts walks of length `k` from `u` to `v`, which is the basis of some spectral and PageRank-style computations.

## Edge list

Just the list of `(u, v)` or `(u, v, w)` tuples, O(E) memory and nothing precomputed. It is what you receive as input, what Kruskal's algorithm sorts by weight, what Bellman-Ford iterates V − 1 times, and what fits in a database table (`edges(src, dst, weight)`) or a CSV. For any traversal, convert it to an adjacency list first: O(E) work that you do once.

## Choosing

| Operation | Adjacency list | Adjacency matrix | Edge list |
|---|---|---|---|
| Memory | O(V + E) | O(V²) | O(E) |
| Neighbours of u | O(deg u) | O(V) | O(E) |
| Edge (u, v) exists? | O(deg u), or O(1) with sets | O(1) | O(E) |
| Add an edge | O(1) | O(1) | O(1) |
| Remove an edge | O(deg u) | O(1) | O(E) |
| BFS / DFS | O(V + E) | O(V²) | Convert first |
| Best for | Almost everything; sparse graphs | Dense graphs, tiny V, O(V²) algorithms | Input, storage, Kruskal, Bellman-Ford |

The interview default is the adjacency list, stated with its O(V + E) cost. Say so and move on; reach for the matrix only with a reason.

### Cache-friendly layout: CSR

Production graph engines (and anything in C++ or Rust that cares about speed) do not use a list of lists. They use **compressed sparse row** (CSR): one flat array of all neighbours, concatenated vertex by vertex, plus an offsets array where vertex `u`'s neighbours occupy `neighbours[offsets[u] : offsets[u + 1]]`. Two arrays, no per-vertex allocation, sequential memory for every neighbour scan. It is immutable once built, which is fine for analytics and wrong for a graph that changes. Sparse matrix libraries, GPU graph frameworks and the graph modules of NumPy/SciPy all speak CSR.

## Directed, undirected and the bugs between them

The single most common graph bug is building an undirected graph with edges in one direction only, then wondering why BFS from vertex 3 cannot reach vertex 0 when the input clearly has an edge between them. The second most common is the reverse: adding both directions for a directed graph and finding a cycle in every DAG. Read the problem statement for the words "directed", "one-way", "depends on", "prerequisite", "follows" (directed) versus "friends", "connected", "adjacent", "road between" (undirected), and write the `directed` flag down before you write the loop.

For directed graphs, two more representations come up: the **reverse graph** (every edge flipped), needed by Kosaraju's SCC algorithm and by "who depends on me" queries, and separate in-degree counts, needed by Kahn's [topological sort](/learn/data-structures/graphs/topological-sort-and-dags). Both are one O(E) pass.

## Implicit graphs

Many graphs are never built. The vertices and edges are defined by a rule, and the traversal generates neighbours on demand.

**Grids.** A 2D grid is a graph whose vertices are cells and whose edges join 4-neighbours (or 8). Nobody builds an adjacency list for a 1000 × 1000 grid with 4 million edges; the neighbour function is `for dr, dc in ((1,0),(-1,0),(0,1),(0,-1))` with a bounds check. `number-of-islands`, `rotting-oranges`, `pacific-atlantic` and every maze problem are grid graphs.

```viz
{"type": "graph", "algorithm": "grid-islands",
 "grid": [[1, 1, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 1, 0], [1, 0, 1, 0, 0]],
 "title": "A grid as an implicit graph", "caption": "Cells are vertices, 4-adjacency defines the edges, and a traversal from each unvisited land cell discovers one island. No adjacency list is ever built."}
```

**State spaces.** The vertices are configurations (a puzzle position, a set of switches, a `(row, col, keys_held)` tuple) and the edges are legal moves. The graph may be astronomically large and you only ever touch the part reachable from the start. `word-ladder`'s vertices are words and its edges connect words differing in one letter; you generate neighbours by mutating each position. A `visited` set keyed by the *state* is what keeps the traversal finite, and choosing what goes into the state key is the whole design problem.

**Knowledge and data.** A file system's import graph, a database's foreign keys, a Kubernetes cluster's ownership references: the "edges" are found by parsing or querying, and traversal is interleaved with I/O. Same algorithms, with the added concern that neighbour discovery is expensive and should be cached.

The interview signal is recognising an implicit graph and saying "the vertices are X and the edges are Y" before writing code. That sentence is the [modelling lesson](/learn/data-structures/graphs/graphs-in-the-real-world) in miniature.

## Vertex identity and the visited set

Every traversal needs to know which vertices it has seen, and the choice of key matters:

- Integers `0..V−1`: a boolean array, O(1) and cache-friendly.
- Strings or objects: a hash set. Do not key on the *object* when two objects can represent the same vertex; key on a canonical id.
- Grid cells: `visited[r][c]` array, or encode as `r * cols + c` into one flat array, or mark the grid in place (turn visited land into water) when you are allowed to mutate the input.
- State tuples: a set of tuples in Python, or a stringified key in JavaScript (`` `${r},${c},${mask}` ``) because JS `Set` compares arrays by reference.

For `clone-graph` the visited structure doubles as the map from original node to its copy; that is the pattern for any traversal that builds a parallel structure.

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
- You read the statement for direction words and write the `directed` flag down before building anything.
- You know a matrix is O(V²) and can name the three cases where it is the right choice anyway.
- You recognise grids, word lists and state spaces as **implicit graphs** and can say what the vertices and edges are in one sentence.
- You choose the visited key deliberately (array for ints, canonical id for objects, tuple or string for states) and you know why a JS `Set` of arrays does not work.
- You know CSR exists and why analytics engines prefer two flat arrays to a list of lists.

## Check yourself

```quiz
- q: >-
    A social graph has 500 million users and an average of 200 friends each. Storing it as an adjacency matrix of bits would need about:
  options: ["About 12.5 GB", "About 30 PB (petabytes)", "About 100 GB", "About 200 GB"]
  answer: 1
  explanation: >-
    V² = 2.5 × 10^17 bits ≈ 3 × 10^16 bytes, roughly 30 petabytes. The adjacency list holds 10^11 directed entries, about 400 GB at 4 bytes each; sparse graphs make the matrix absurd.
- q: >-
    Your BFS from vertex 3 in an undirected graph never reaches vertex 0, although the input contains the edge [0, 3]. The most likely bug is:
  options: ["BFS cannot handle undirected graphs", "The adjacency list was built with each edge added in one direction only", "Vertex 0 has degree zero", "The queue was implemented with a stack"]
  answer: 1
  explanation: >-
    Adding only adj[0].append(3) makes the edge traversable from 0 but not from 3. Undirected edges must be inserted in both endpoints' lists.
- q: >-
    For which algorithm is an adjacency matrix the natural representation?
  options: ["BFS on a road network", "Floyd-Warshall all-pairs shortest paths", "Kruskal's minimum spanning tree", "Topological sort of a build graph"]
  answer: 1
  explanation: >-
    Floyd-Warshall is O(V³) and updates dist[i][j] for all pairs, so the O(V²) matrix costs nothing extra and gives O(1) access. The others are O(V + E) or O(E log E) algorithms where a matrix would dominate the cost.
- q: >-
    In JavaScript you track visited grid cells with a Set of [r, c] arrays and the BFS never terminates. Why?
  options: ["Sets cannot hold arrays", "Arrays are compared by reference, so every new [r, c] is a distinct element and nothing is ever found in the set", "The grid is too large", "BFS requires a Map, not a Set"]
  answer: 1
  explanation: >-
    Two arrays with the same contents are different objects. Use a string key like r + ',' + c, a numeric key r * cols + c, or a 2D boolean array.
- q: >-
    A puzzle has about 10^12 possible states, but the solution is 20 moves from the start and each state has 4 moves. Which representation should you use?
  options: ["An adjacency list of all states, built up front", "An adjacency matrix", "An implicit graph: generate neighbours by applying moves, with a visited set of states actually reached", "A suffix array of states"]
  answer: 2
  explanation: >-
    Only states within 20 moves are ever touched, at most 4^20 in the worst case and far fewer with a visited set. Building the full graph is impossible; the neighbour function is the graph.
```

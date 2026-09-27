---
slug: breadth-first-search
title: "Breadth-first search: levels, shortest paths and multiple sources"
description: The queue mechanics of BFS, why it finds shortest paths in unweighted graphs and exactly when it does not, level-by-level processing, multi-source BFS, grid BFS and the bidirectional and 0-1 variants.
minutes: 40
difficulty: medium
tags: [graphs, bfs, shortest-path, queue, grid, multi-source]
problems: [rotting-oranges, walls-and-gates, word-ladder, min-depth]
---
"What is the fewest number of hops from A to B?" A social network's degrees of separation, a router's hop count, the minimum number of moves to solve a puzzle, the minimum number of edits to turn one word into another: all of them are shortest paths where every edge costs the same. Breadth-first search answers them with a queue and one invariant that you should be able to prove: *vertices leave the queue in non-decreasing order of distance from the start*. Everything BFS is good for follows from that invariant, and everything it is bad for (weighted edges) follows from where the invariant breaks.

## The mechanism

Start with the source in a queue and marked visited. Repeatedly dequeue a vertex, and enqueue each unvisited neighbour after marking it visited. The queue is FIFO, so vertices at distance 1 are all processed before any at distance 2, which are processed before any at distance 3, and so on.

```python
from collections import deque

def bfs(adj, start):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        u = queue.popleft()
        for v in adj[u]:
            if v not in dist:              # visited check
                dist[v] = dist[u] + 1
                queue.append(v)
    return dist
```

Three details that are not optional:

1. **Mark visited when you enqueue, not when you dequeue.** If you mark on dequeue, a vertex with many neighbours at the same level gets enqueued once per neighbour before it is ever processed, and the queue grows to O(E) with duplicates; on a dense graph that is a real blow-up, and in the worst case (a complete graph) it turns O(V + E) into O(V · E). Marking on enqueue guarantees each vertex enters the queue exactly once.
2. **Use a real queue.** `list.pop(0)` in Python and `Array.shift()` in JavaScript are O(n); `deque.popleft()` is O(1). In JS use a head index into an array (never shrink it) or a small ring buffer.
3. **Record the distance (or parent) at enqueue time.** `dist[v] = dist[u] + 1` when `v` is first discovered is correct because of the invariant; there is no later "relaxation" step as in Dijkstra.

Cost: every vertex is enqueued and dequeued once, every adjacency list is scanned once: **O(V + E)** time. Memory is the visited set plus the queue, which can hold an entire level: O(V) worst case, and on a wide graph the queue is much larger than DFS's stack would be.

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "B", "to": "F"}],
 "title": "BFS from A", "caption": "The queue drains level by level. D is discovered via B before C gets a chance to rediscover it; its distance is fixed at 2 the moment it is enqueued."}
```

## Why the first discovery is the shortest path

Claim: when BFS dequeues `u`, `dist[u]` is the true shortest distance from the source. Sketch of the proof by induction on distance: the source is dequeued first with distance 0. Suppose all vertices at true distance `k` are dequeued with correct labels before any vertex at true distance `k + 1`. Any vertex `w` at true distance `k + 1` has a neighbour `u` at distance `k`; when `u` is dequeued, `w` is either already labelled (by some other distance-`k` vertex, hence with label `k + 1`) or gets labelled `k + 1` now. It cannot have been labelled earlier with a smaller value, because that would require a neighbour at distance less than `k`, contradicting its true distance. FIFO order ensures all distance-`k` vertices are dequeued before any distance-`k + 1` vertex, so the induction holds.

The proof uses that every edge has the same cost. Give one edge weight 5 and another weight 1, and the first discovery of a vertex is no longer the cheapest: the queue's FIFO order no longer matches the order of distances. That is exactly the gap [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) fills by replacing the queue with a priority queue keyed by distance. If the interviewer adds weights to a BFS problem, the answer is "then BFS is wrong, and I need Dijkstra", said before they have finished the sentence.

Two special cases keep BFS's speed with limited weights. **0-1 BFS**: edges cost 0 or 1; use a deque, push 0-cost neighbours to the *front* and 1-cost neighbours to the back, and the invariant survives in O(V + E). **Small integer weights**: bucket queue (Dial's algorithm), one bucket per distance value.

## Stopping early, and the level trap

When there is a single target, stop as soon as you find it; the invariant guarantees the first discovery is shortest. The efficient place to check is at **enqueue** time: the moment a neighbour `v` equals the target, `dist[u] + 1` is its distance and the rest of the current level need not be expanded. Checking at dequeue time is also correct but processes up to a whole extra level, which on a wide graph (a social network at depth 3, a word ladder) can be most of the work.

The trap in the other direction is stopping too early for a *set* of targets or for "all vertices at distance k": you must finish the level. A common bug in "nearest of several exits" is returning on the first exit *enqueued* when the problem asks for all exits at that minimum distance, or, conversely, breaking out of the inner `for` loop and leaving the queue in a state where the next pop is not actually the next-nearest vertex. The safe pattern is to finish the current level completely and then check whether it contained a target.

One more early-exit subtlety: if the start *is* the target, the answer is 0 and no traversal should run. Handling that before the loop avoids a class of off-by-one results in puzzle problems where the initial state is already solved.

## Level-by-level processing

Many problems need the *level* explicitly: "minimum depth", "how many minutes until all oranges rot", "nodes at distance exactly k". Process one level per outer iteration by recording the queue size before draining it, the same trick as tree level order:

```python
def bfs_levels(adj, start):
    seen = {start}
    frontier = [start]
    level = 0
    while frontier:
        next_frontier = []
        for u in frontier:
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    next_frontier.append(v)
        frontier = next_frontier
        level += 1
    return level - 1          # eccentricity: distance to the farthest vertex
```

The frontier-swapping form avoids the queue entirely and is often clearer. It also shows what BFS costs in memory: the frontier at its widest.

## Multi-source BFS

"For each cell, the distance to the nearest gate." "How long until every orange is rotten, given several rotten ones." The naive approach runs one BFS per source, O(sources × (V + E)). The right approach seeds the queue with *all* sources at distance 0 and runs one BFS. The invariant still holds: a vertex's first discovery is by its nearest source. It is equivalent to adding a virtual super-source connected to every real source, then running ordinary BFS from it and subtracting one.

```python
def multi_source_bfs(grid, sources):
    rows, cols = len(grid), len(grid[0])
    dist = [[-1] * cols for _ in range(rows)]
    queue = deque()
    for r, c in sources:
        dist[r][c] = 0
        queue.append((r, c))
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] != WALL and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                queue.append((nr, nc))
    return dist
```

One pass, O(cells). This is the shape of `rotting-oranges`, `walls-and-gates`, "distance to nearest 0 in a binary matrix", and of real problems like "nearest warehouse to every customer on a road grid".

## Grid BFS

A grid is an implicit graph; BFS on it is the same loop with a neighbour function that checks bounds and walls. Points that separate clean solutions from buggy ones:

- Put the direction deltas in a tuple and loop; four copy-pasted `if` blocks is where off-by-ones live.
- Bounds check *before* indexing, and check walls and visited together.
- Mark visited on enqueue. In a grid, marking on dequeue can enqueue a cell up to four times.
- If mutating the input is acceptable, marking a visited cell in place (`grid[r][c] = WALL`) saves the visited array and is a common interview shortcut; say that you are doing it.
- Diagonal adjacency (8 directions) changes the answer and is usually stated; read for it.

```viz
{"type": "graph", "algorithm": "grid-bfs",
 "grid": [[0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0]],
 "start": "0,0", "goal": "4,4",
 "title": "Shortest path through a grid", "caption": "Each ring of cells is one level. The goal's level is the shortest path length; walls simply have no edges."}
```

## Reconstructing the path

Distance is often not enough; you need the path. Store `parent[v] = u` at discovery, then walk back from the target to the source and reverse. O(path length) extra, and the parent map costs no more than the visited set you already had. For unweighted graphs the BFS tree gives a shortest path to *every* reachable vertex at once, which is why a single BFS answers "shortest path from A to everything".

## Bidirectional BFS

When you have one specific target, search from both ends and stop when the frontiers meet. If the branching factor is `b` and the distance is `d`, one-directional BFS touches about `b^d` vertices and bidirectional touches about `2 · b^(d/2)`, which for `word-ladder`-sized problems (b ≈ 25 × word length, d ≈ 5–10) is a hundredfold to a thousandfold fewer. Implementation: keep two visited sets, always expand the *smaller* frontier, and when an expansion discovers a vertex in the other side's visited set, the distance is `d₁ + d₂ + 1`. It only works when you can enumerate incoming edges from the target (undirected graphs, or a reversed adjacency list), which is usually the case.

## Where BFS is the wrong tool

- **Weighted edges**: Dijkstra, or 0-1 BFS if weights are 0 and 1.
- **Longest path or "any path"**: DFS is simpler and uses O(depth) memory instead of O(width).
- **Deep, narrow graphs** with a huge branching frontier: DFS or iterative deepening if memory is the constraint.
- **Very large implicit graphs with a good heuristic**: A*, which is BFS with the queue ordered by `distance + estimate`.

## Exercises

```exercise
id: bfs-distances
title: Shortest hop counts from a source
prompt: |
  `bfs_distances(n, adj, start)`: `adj` is an adjacency list (`adj[u]` is a
  list of neighbours; the graph may be directed) over vertices `0..n-1`.
  Return a list where entry `v` is the minimum number of edges from
  `start` to `v`, or -1 if `v` is unreachable. `start` itself is 0.

  Mark vertices visited when you enqueue them, and use an O(1) queue
  (`deque` in Python; an array with a head index in JavaScript).
languages: [python, javascript]
entry: bfs_distances
starter:
  python: |
    from collections import deque

    def bfs_distances(n, adj, start):
        dist = [-1] * n
        return dist
  javascript: |
    function bfs_distances(n, adj, start) {
      const dist = new Array(n).fill(-1);
      return dist;
    }
tests:
  - args: [5, [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], 0]
    expected: [0, 1, 1, 2, 3]
  - args: [4, [[1], [0], [3], [2]], 0]
    expected: [0, 1, -1, -1]
    label: unreachable component
  - args: [1, [[]], 0]
    expected: [0]
    label: single vertex
  - args: [3, [[1], [2], []], 2]
    expected: [-1, -1, 0]
    label: directed, start at a sink
  - args: [6, [[1, 2], [0, 3], [0, 3], [1, 2, 5], [5], [3, 4]], 4]
    expected: [4, 3, 3, 2, 0, 1]
    hidden: true
hints:
  - "dist[start] = 0 and enqueue it; when you pop u, for each v in adj[u] with dist[v] == -1 set dist[v] = dist[u] + 1 and enqueue v."
  - "The dist array doubles as the visited set."
```

```exercise
id: multi-source-grid-bfs
title: Distance to the nearest source on a grid
prompt: |
  `nearest_source_distances(grid)`: a rectangular grid of integers where
  `1` is a source, `0` is an open cell and `-1` is a wall. Return a grid of
  the same shape where each source becomes `0`, each open cell becomes the
  length of the shortest 4-directional path (through open cells or sources)
  to the nearest source, and walls and unreachable cells become `-1`.
  Return `[]` for an empty grid.

  Seed one queue with every source and run a single BFS.
languages: [python, javascript]
entry: nearest_source_distances
starter:
  python: |
    from collections import deque

    def nearest_source_distances(grid):
        if not grid:
            return []
        rows, cols = len(grid), len(grid[0])
        dist = [[-1] * cols for _ in range(rows)]
        return dist
  javascript: |
    function nearest_source_distances(grid) {
      if (grid.length === 0) return [];
      const rows = grid.length, cols = grid[0].length;
      const dist = Array.from({ length: rows }, () => new Array(cols).fill(-1));
      return dist;
    }
tests:
  - args: [[[1, 0, 0], [0, -1, 0], [0, 0, 0]]]
    expected: [[0, 1, 2], [1, -1, 3], [2, 3, 4]]
  - args: [[[1, 0, 1], [0, 0, 0]]]
    expected: [[0, 1, 0], [1, 2, 1]]
    label: two sources
  - args: [[[1, -1, 0]]]
    expected: [[0, -1, -1]]
    label: wall blocks, unreachable stays -1
  - args: [[[0, 0]]]
    expected: [[-1, -1]]
    label: no sources
  - args: [[]]
    expected: []
    label: empty grid
  - args: [[[0, 0, 0], [-1, -1, 0], [1, 0, 0]]]
    expected: [[6, 5, 4], [-1, -1, 3], [0, 1, 2]]
    hidden: true
hints:
  - "Push every (r, c) with grid[r][c] == 1 onto the queue with dist 0 before the loop starts."
  - "A neighbour is enqueued only if it is in bounds, not a wall, and dist is still -1."
```

## Senior signals

- You can state and sketch the proof of the BFS invariant, and you know it depends on equal edge weights.
- You mark visited on **enqueue**, use an O(1) queue, and can say what goes wrong otherwise.
- You seed the queue with all sources for "nearest X" problems and recognise it as a super-source.
- You know the 0-1 BFS deque trick and when it applies.
- You reach for bidirectional BFS when there is a single target and a large branching factor, and you can explain the b^(d/2) argument.
- You switch to Dijkstra the moment weights appear, and to DFS when memory or "any path" makes BFS the wrong shape.

## Check yourself

```quiz
- q: >-
    BFS marks vertices visited when they are dequeued instead of when they are enqueued. On a complete graph with V vertices, what happens?
  options: ["BFS never terminates, because vertices keep re-entering the queue forever", "Nothing changes, because each vertex is still processed only once", "Each vertex can be enqueued up to V-1 times, so the queue fills with duplicates", "Distances come out wrong, because a later duplicate overwrites the vertex's first label"]
  answer: 2
  explanation: >-
    Every vertex at level 1 is enqueued by the source; each then enqueues every other level-1 vertex again because none is marked yet, so the queue holds O(V²) entries instead of V. Distances remain correct (the first dequeue wins and later duplicates are skipped), and the search still terminates because each vertex is marked once it is dequeued; only the work multiplies. Mark on enqueue.
- q: >-
    A grid problem gives each move a cost of 1, except moving through mud, which costs 3. Which algorithm finds the cheapest route?
  options: ["DFS with pruning, because it can abandon any branch that is already costlier", "BFS, because every move on a grid is still a single step", "Dijkstra with a priority queue, because edge costs are unequal", "0-1 BFS, because a deque handles two distinct edge costs"]
  answer: 2
  explanation: >-
    BFS's first-discovery-is-shortest invariant relies on uniform costs. With costs 1 and 3, a longer path in hops can be cheaper. 0-1 BFS handles two costs only when they are exactly 0 and 1; costs of 1 and 3 break its deque ordering.
- q: >-
    You need the distance from every cell of a 2,000 × 2,000 grid to the nearest of 5,000 hospitals. Running one BFS per hospital costs about 5,000 × 4 × 10^6 cell visits. Multi-source BFS costs:
  options: ["About 4 × 10^6 × log 5,000, for a heap to pick the nearest source", "About the same, since each hospital still needs its own wavefront", "About 5,000 × log(4 × 10^6), one heap operation per hospital", "About 4 × 10^6 cell visits, as one pass seeded with every hospital"]
  answer: 3
  explanation: >-
    Seeding every hospital at distance 0 is equivalent to BFS from a virtual super-source; each cell is discovered once by its nearest hospital. One pass over the grid, and a plain FIFO queue suffices because all edges still cost 1, so no heap and no log factor is needed.
- q: >-
    Word ladder from "hit" to "cog" with a dictionary of 50,000 five-letter words. Why does bidirectional BFS help so much?
  options: ["It expands both endpoints' neighbourhoods in parallel, which halves the wall time", "Each side searches only half the distance, so ~2·b^(d/2) vertices replace b^d", "It skips building the adjacency list, so neighbours cost O(1) to generate", "It stores half as many vertices per side, so total memory is cut in half"]
  answer: 1
  explanation: >-
    With branching factor b around 100 and distance d around 6, one-directional BFS may touch b^6 = 10^12 candidates while two half-searches touch about 2 × 10^6. The saving is exponential, not a factor of two, because halving the depth takes the square root of the frontier size. The meeting point gives the shortest path when both sides expand level by level.
- q: >-
    To reconstruct the actual shortest path after BFS, the cheapest addition is:
  options: ["Record parent[v] = u when v is first discovered, then walk back from the target", "Run a second BFS from the target, then follow decreasing distance labels", "Store the full path so far in each queue entry, then return the copy held at the target", "Log the order vertices leave the queue, then read that order back as the path"]
  answer: 0
  explanation: >-
    One extra pointer per vertex, set at discovery, gives a shortest-path tree from the source. Storing whole paths per entry is O(V × path length) memory; a second BFS works but doubles the traversal for no gain; and dequeue order interleaves every branch of the search, so it is not a path at all.
```

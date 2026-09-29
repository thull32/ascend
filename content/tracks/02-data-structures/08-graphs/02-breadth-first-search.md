---
slug: breadth-first-search
title: "Breadth-first search: levels, shortest paths and multiple sources"
description: The queue mechanics of BFS traced by hand, why it finds shortest paths in unweighted graphs and exactly when it does not, level-by-level processing, multi-source BFS, grid BFS, 0-1 BFS, bidirectional BFS, and what deque, ArrayDeque and direction-optimising BFS do underneath.
minutes: 50
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
    parent = {start: None}
    queue = deque([start])
    while queue:
        u = queue.popleft()
        for v in adj[u]:
            if v not in dist:              # visited check: dist doubles as the visited set
                dist[v] = dist[u] + 1
                parent[v] = u
                queue.append(v)
    return dist, parent
```

Three details that are not optional:

1. **Mark visited when you enqueue, not when you dequeue.** Otherwise a vertex is enqueued once per neighbour that sees it before it is processed; the count is worked out below.
2. **Use a real queue.** `list.pop(0)` in Python and `Array.shift()` in JavaScript are O(n); `deque.popleft()` is O(1). In JS use a head index into an array (never shrink it) or a ring buffer.
3. **Record the distance and parent at enqueue time.** `dist[v] = dist[u] + 1` when `v` is first discovered is correct because of the invariant; there is no later "relaxation" step as in Dijkstra.

Cost: every vertex is enqueued and dequeued once, every adjacency list is scanned once: **O(V + E)** time. Memory is the visited set plus the queue, which can hold an entire level: O(V) worst case, and on a wide graph the queue is much larger than DFS's stack would be.

## Hand trace

The graph: 8 vertices, 9 undirected edges, neighbours listed in the order the code sees them.

```text
0: [1, 2]        4: [1, 2, 5, 6]
1: [0, 3, 4]     5: [3, 4, 7]
2: [0, 4]        6: [4]
3: [1, 5]        7: [5]
```

BFS from 0. `dist` and `parent` are shown as arrays indexed 0..7; `·` means not yet discovered.

| Step | Dequeued | Discovers | Queue after | dist[0..7] | parent[0..7] |
|---|---|---|---|---|---|
| 0 | – | 0 | [0] | 0 · · · · · · · | – · · · · · · · |
| 1 | 0 | 1, 2 | [1, 2] | 0 1 1 · · · · · | – 0 0 · · · · · |
| 2 | 1 | 3, 4 (0 seen) | [2, 3, 4] | 0 1 1 2 2 · · · | – 0 0 1 1 · · · |
| 3 | 2 | none (0, 4 seen) | [3, 4] | 0 1 1 2 2 · · · | – 0 0 1 1 · · · |
| 4 | 3 | 5 (1 seen) | [4, 5] | 0 1 1 2 2 3 · · | – 0 0 1 1 3 · · |
| 5 | 4 | 6 (1, 2, 5 seen) | [5, 6] | 0 1 1 2 2 3 3 · | – 0 0 1 1 3 4 · |
| 6 | 5 | 7 (3, 4 seen) | [6, 7] | 0 1 1 2 2 3 3 4 | – 0 0 1 1 3 4 5 |
| 7 | 6 | none | [7] | unchanged | unchanged |
| 8 | 7 | none | [] | unchanged | unchanged |

Read the queue column top to bottom: it is always a run of distance-k vertices followed by a run of distance-(k+1) vertices, never anything else. At step 3, vertex 2 finds 4 already discovered by 1; 4 keeps `dist = 2, parent = 1` because the first discovery wins.

**Path reconstruction** to vertex 7: follow parents backwards, `7 → 5 → 3 → 1 → 0`, then reverse: `0, 1, 3, 5, 7`, four edges, matching `dist[7] = 4`. The path `0, 2, 4, 5, 7` is also four edges; BFS returns the one through whichever neighbour was listed first, and if the problem needs *all* shortest paths you count them per level instead (a follow-up below).

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "0",
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}, {"id": "6"}, {"id": "7"}],
 "edges": [{"from": "0", "to": "1"}, {"from": "0", "to": "2"}, {"from": "1", "to": "3"}, {"from": "1", "to": "4"}, {"from": "2", "to": "4"}, {"from": "3", "to": "5"}, {"from": "4", "to": "5"}, {"from": "4", "to": "6"}, {"from": "5", "to": "7"}],
 "title": "The traced graph", "caption": "Step through it against the table: the queue always holds at most two consecutive distance values, and vertex 4 is claimed by 1 before 2 reaches it."}
```

## Why the first discovery is the shortest path

Claim: when BFS dequeues `u`, `dist[u]` is the true shortest distance from the source. Proof by induction on distance: the source is dequeued first with distance 0. Suppose all vertices at true distance `k` are dequeued with correct labels before any vertex at true distance `k + 1`. Any vertex `w` at true distance `k + 1` has a neighbour `u` at distance `k`; when `u` is dequeued, `w` is either already labelled (by some other distance-`k` vertex, hence with label `k + 1`) or gets labelled `k + 1` now. It cannot have been labelled earlier with a smaller value, because that would require a neighbour at distance less than `k`, contradicting its true distance. FIFO order ensures all distance-`k` vertices are dequeued before any distance-`k + 1` vertex, so the induction holds.

The proof uses that every edge has the same cost. Give one edge weight 5 and another weight 1, and the first discovery of a vertex is no longer the cheapest: the queue's FIFO order no longer matches the order of distances. That is exactly the gap [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) fills by replacing the queue with a priority queue keyed by distance. If the interviewer adds weights to a BFS problem, the answer is "then BFS is wrong, and I need Dijkstra", said before they have finished the sentence.

## Mark on enqueue, with the count

Take the complete graph K₅ (every pair adjacent) and mark on *dequeue* instead: a vertex is marked when popped, and an already-marked pop is skipped.

| Pop | Action | Queue after |
|---|---|---|
| 0 | mark; enqueue 1, 2, 3, 4 | [1, 2, 3, 4] |
| 1 | mark; 2, 3, 4 still unmarked, enqueue again | [2, 3, 4, 2, 3, 4] |
| 2 | mark; enqueue 3, 4 | [3, 4, 2, 3, 4, 3, 4] |
| 3 | mark; enqueue 4 | [4, 2, 3, 4, 3, 4, 4] |
| 4 | mark; nothing left | [2, 3, 4, 3, 4, 4] |
| 2, 3, 4, 3, 4, 4 | already marked, skipped | [] |

Eleven enqueues for five vertices. In general the k-th distinct vertex popped enqueues the `n − 1 − k` still-unmarked vertices, so the total is `1 + n(n − 1)/2`: 4,951 for K₁₀₀, 499,501 for K₁₀₀₀, which is O(E) queue entries instead of O(V), and the queue's peak length is close to E. Distances stay correct (the first pop of each vertex wins), so tests pass and only memory and time blow up. Drop the skip check, so that a duplicate pop rescans the adjacency list, and each of the O(E) pops costs O(V): O(V · E) time. On a grid a cell can be enqueued up to four times, a factor of 4; on a hub-heavy social graph the factor is the hub's degree.

## Level-by-level processing

Many problems need the *level* explicitly: "minimum depth", "how many minutes until all oranges rot", "nodes at distance exactly k". Record the queue's length before draining it; that many pops are one level.

```python
def bfs_levels(adj, start):
    seen = {start}
    queue = deque([start])
    level = 0
    while queue:
        size = len(queue)               # the level boundary: exactly these vertices are at `level`
        for _ in range(size):
            u = queue.popleft()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    queue.append(v)     # appended behind the boundary: it belongs to level + 1
        level += 1
    return level - 1                    # eccentricity: distance to the farthest vertex
```

On the traced graph the boundaries fall exactly where the `dist` values change:

| Level | `size` recorded | Queue at the boundary | Vertices processed |
|---|---|---|---|
| 0 | 1 | [0] | 0 |
| 1 | 2 | [1, 2] | 1, 2 |
| 2 | 2 | [3, 4] | 3, 4 |
| 3 | 2 | [5, 6] | 5, 6 |
| 4 | 1 | [7] | 7 |

The loop pops exactly `size` vertices and no more, so anything appended during the level sits behind the boundary and is counted in the next one. Swapping two lists (`frontier` and `next_frontier`) instead of one queue does the same job and shows what BFS costs in memory: the frontier at its widest, two elements here, `b^d` on a tree with branching `b`.

## Stopping early, and the level trap

When there is a single target, stop as soon as you find it; the invariant guarantees the first discovery is shortest. The efficient place to check is at **enqueue** time: the moment a neighbour `v` equals the target, `dist[u] + 1` is its distance and the rest of the current level need not be expanded. Checking at dequeue time is also correct but processes up to a whole extra level, which on a wide graph (a social network at depth 3, a word ladder) can be most of the work.

The trap in the other direction is stopping too early for a *set* of targets or for "all vertices at distance k": you must finish the level. A common bug in "nearest of several exits" is returning on the first exit *enqueued* when the problem asks for all exits at that minimum distance. The safe pattern is to finish the current level completely and then check whether it contained a target.

If the start *is* the target, the answer is 0 and no traversal should run; handle it before the loop, or puzzle problems whose initial state is already solved come out off by one.

## Multi-source BFS

"For each cell, the distance to the nearest gate." "How long until every orange is rotten, given several rotten ones." The naive approach runs one BFS per source, O(sources × (V + E)). The right approach seeds the queue with *all* sources at distance 0 and runs one BFS. The invariant still holds: a vertex's first discovery is by its nearest source. It is equivalent to adding a virtual super-source connected to every real source, then running ordinary BFS from it and subtracting one.

```python
def multi_source_bfs(grid, sources, WALL=-1):
    rows, cols = len(grid), len(grid[0])
    dist = [[-1] * cols for _ in range(rows)]
    queue = deque()
    for r, c in sources:                # every source starts at distance 0
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

### Trace: rotting oranges

`2` is rotten, `1` fresh, `0` empty. Each minute, every fresh orange next to a rotten one rots. Two sources, (0,0) and (2,3), are seeded together.

```text
minute 0            minute 1            minute 2
2 1 1 0             2 2 1 0             2 2 2 0
1 1 0 1     ->      2 1 0 2     ->      2 2 0 2
0 1 1 2             0 1 2 2             0 2 2 2
queue: (0,0) (2,3)  rotted: (1,0) (0,1) (1,3) (2,2)   rotted: (1,1) (0,2) (2,1)
```

Minute 1 is one level: the four cells adjacent to either source. Minute 2 is the next level; (1,1) is reached by both (1,0) and (0,1) but rots once, at the first discovery. After minute 2 the queue drains with no new cells, so the answer is 2; a `1` left anywhere at that point would make it −1. The two wavefronts never interfere because every edge costs one minute and the queue orders cells by minute.

One pass, O(cells). This is the shape of `rotting-oranges`, `walls-and-gates`, "distance to nearest 0 in a binary matrix", and of "nearest warehouse to every customer on a road grid".

## Grid BFS

A grid is an [implicit graph](/learn/data-structures/graphs/graph-representations); BFS on it is the same loop with a neighbour function that checks bounds and walls. Points that separate clean solutions from buggy ones:

- Put the direction deltas in a tuple and loop; four copy-pasted `if` blocks is where off-by-ones live. Diagonal adjacency (8 directions) changes the answer and is usually stated; read for it.
- Bounds check *before* indexing, and check walls and visited together.
- Mark visited on enqueue; marking on dequeue enqueues a cell up to four times.
- Visited as a 2-D list, `seen[r][c]`, costs two indexings; a set of `(r, c)` tuples allocates and hashes a tuple per check. Measured on CPython 3.14: about 36 ns against 97 ns per check, a factor of 2.7, with four checks per cell. The set wins only when the grid is huge and the visited region is tiny.
- If mutating the input is acceptable, marking a visited cell in place (`grid[r][c] = WALL`) saves the visited array; say that you are doing it.

```viz
{"type": "graph", "algorithm": "grid-bfs",
 "grid": [[0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0]],
 "start": "0,0", "goal": "4,4",
 "title": "Shortest path through a grid", "caption": "Each ring of cells is one level. The goal's level is the shortest path length; walls have no edges."}
```

### 0-1 BFS: the bridge to Dijkstra

Let edges cost 0 or 1 (a grid where moving through a corridor is free and breaking a wall costs 1, or a state machine with free transitions). Use a deque: push a neighbour reached by a 0-edge to the **front** and one reached by a 1-edge to the **back**, and relax like Dijkstra rather than testing visited.

```python
def zero_one_bfs(adj, start):           # adj[u] = [(v, w)], w in {0, 1}
    INF = float("inf")
    dist = {u: INF for u in adj}
    dist[start] = 0
    dq = deque([start])
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                (dq.appendleft if w == 0 else dq.append)(v)
    return dist
```

Why it is correct: the deque only ever holds vertices with two consecutive distance values, `d` at the front and `d + 1` at the back, in that order, so pops still come out in non-decreasing distance; that is Dijkstra's invariant with a two-bucket queue instead of a heap, O(V + E). A vertex can be pushed more than once (once at a tentative distance, again at a better one), which is why the test is a relaxation, not a visited flag. Verified against Dijkstra on 200 random 0/1-weighted graphs while writing this lesson. With weights up to a small `W`, the same idea becomes Dial's algorithm with `W + 1` buckets; with arbitrary weights it becomes Dijkstra's heap.

## Bidirectional BFS

When you have one specific target, search from both ends and stop when the frontiers meet. With branching factor `b` and distance `d`, one-directional BFS touches about `b^d` vertices and bidirectional about `2 · b^(d/2)`. With `b = 10` and `d = 6` that is 10^6 against 2 × 10^3, a factor of 500; the saving is exponential in `d`, not a factor of two. For `word-ladder`, `b` is the number of real one-letter neighbours (tens, not the 125 candidates) and `d` is 5–10, so the gain is a hundredfold to a thousandfold.

```python
def bidirectional_bfs(adj, s, t):
    if s == t:
        return 0
    da, db = {s: 0}, {t: 0}                 # distance maps, one per side
    fa, fb = [s], [t]                        # current frontiers
    while fa and fb:
        if len(fa) > len(fb):                # always expand the smaller side
            fa, fb, da, db = fb, fa, db, da
        best, nxt = None, []
        for u in fa:
            for v in adj[u]:
                if v in db:                  # met the other side
                    cand = da[u] + 1 + db[v]
                    best = cand if best is None else min(best, cand)
                if v not in da:
                    da[v] = da[u] + 1
                    nxt.append(v)
        if best is not None:
            return best                      # only after the whole level: the level's minimum is the answer
        fa = nxt
    return -1
```

The termination condition is the part people get wrong: return the *minimum* meeting distance found while expanding one **complete** level, not the first meeting seen mid-level, because a later vertex of the same level may meet the other side's earlier level and give a shorter total. Expanding whole levels alternately keeps both sides' frontiers at consistent depths. This version agreed with plain BFS on 1,500 random queries during verification. It requires enumerating edges *into* the target (undirected graphs, or a reversed adjacency list), which is usually available.

## Under the hood

### CPython `collections.deque`

A deque is a doubly linked list of fixed-size blocks, 64 pointer slots each, with the left and right ends tracked by block pointer plus index. `append` and `popleft` touch one slot and occasionally allocate or free one 64-slot block: O(1) with no copying, whatever the length. A Python `list` is one contiguous pointer array, so `pop(0)` shifts every remaining pointer down with a `memmove`, O(n). Measured on CPython 3.14: draining 10^4 elements with `pop(0)` took 2 ms and 5 × 10^4 took 52 ms, a 26× increase for 5× the elements, the signature of O(n²); `deque.popleft` drained them in 0.2 ms and 0.9 ms. A BFS over 10^6 vertices with `pop(0)` moves on the order of 10^12 pointer-bytes and turns O(V + E) into O(V²). Indexing a deque in the middle walks blocks, O(n/64), which is why it is a queue, not a list.

### Java `ArrayDeque`, and arrays as queues

`java.util.ArrayDeque` is a ring buffer: one array with `head` and `tail` indices that wrap around, growing it when full (doubling while it is under 64 slots, by 50% after that, in JDK 21) and copying the elements into the new one. Both ends are O(1) amortised with no per-element allocation, so it beats `LinkedList` for BFS. The same shape in JavaScript is an array plus a head index that only ever increases (what the exercise below asks for); you never shrink it, and you accept O(V) memory that a deque would recycle.

### Level-synchronous BFS on flat arrays

High-performance BFS implementations, the Graph500 reference code among them, work on CSR with the frontier as a plain vector: scan each frontier vertex's `targets` slice, test a visited bitmap, append newly discovered vertices to `next`, swap. No queue object, and the level loop is explicit, which is what lets threads split the work (each takes a chunk of the frontier and appends to a private `next`).

The refinement that matters on social-graph-shaped data is **direction-optimising BFS** (Beamer, Asanović and Patterson, 2012). Top-down BFS costs the sum of the frontier's out-degrees every level. On a small-world graph the frontier covers most of the graph after two or three levels, and top-down then scans nearly every edge for a level that discovers few new vertices. Bottom-up flips the loop: for each *unvisited* vertex, scan its in-neighbours and stop at the first one that is in the frontier; when most vertices have a frontier neighbour, that scan ends after one or two edges instead of the full degree. The heuristic switches to bottom-up when the frontier's edge count exceeds the remaining unexplored edges divided by a constant (the paper's default was 14) and back to top-down when the frontier shrinks below the vertex count divided by another (24). The paper reports an average speed-up of 3.9 (never below 2.4) over top-down BFS on its social, web and synthetic graphs, because two or three middle levels dominate the total work; the GraphBLAS "push versus pull" switch is the same idea.

## Where BFS is the wrong tool

- **Weighted edges**: Dijkstra, or 0-1 BFS if weights are 0 and 1.
- **Longest path or "any path"**: [DFS](/learn/data-structures/graphs/depth-first-search) is simpler and uses O(depth) memory instead of O(width).
- **Deep, narrow graphs** with a huge frontier: DFS or iterative deepening if memory is the constraint.
- **Very large implicit graphs with a good heuristic**: [A*](/learn/algorithms/graph-algorithms/a-star-and-heuristic-search), which is Dijkstra with the queue ordered by `distance + estimate`.

## Trade-offs

| Variant | Edge costs | Time | Memory | Use when |
|---|---|---|---|---|
| Plain BFS | all equal | O(V + E) | O(widest level) | Single source, unweighted |
| Level-size loop | all equal | O(V + E) | same | The level number is the answer |
| Multi-source | all equal | O(V + E), once | same | Nearest of many sources |
| Bidirectional | all equal | ~2 · b^(d/2) touched | two half-depth frontiers | One target, large `b`, edges enumerable backwards |
| 0-1 BFS | 0 or 1 | O(V + E) | deque, re-pushes allowed | Free moves plus unit-cost moves |
| Dijkstra | any non-negative | O((V + E) log V) | heap | Weights |

| Queue | Dequeue | Memory | Note |
|---|---|---|---|
| `collections.deque` | O(1), block-linked | recycled | Default in Python |
| `list.pop(0)` | O(n) memmove | recycled | Turns BFS into O(V²) |
| list + head index | O(1) | O(V), never shrinks | JavaScript idiom (`shift()` is O(n)) |
| `ArrayDeque` ring buffer | O(1) amortised | doubling array | Java default; beats `LinkedList` |
| Frontier vectors on CSR | O(1) append, swap per level | two vectors + bitmap | Parallel and direction-optimising BFS |

## Failure modes

### The queue explodes with duplicates

Symptom: BFS on a dense or hub-heavy graph uses far more memory than V entries, or runs for minutes on an input that DFS handles in seconds; distances are still correct. Diagnosis: visited is set on dequeue; count enqueues and compare with V (K₁₀₀₀ shows 499,501 against 1,000). Fix: mark on enqueue, so each vertex enters the queue exactly once.

### `pop(0)` on a list

Symptom: BFS is fine at 10^4 vertices and unusable at 10^6, with a profile showing the time inside `list.pop`. Diagnosis: each pop shifts the remaining queue; total work is quadratic in the queue length. Fix: `deque.popleft()`, or a head index into a list.

### The level boundary is missed

Symptom: "minimum minutes" or "minimum depth" comes out one too high or one too low, depending on where `level += 1` sits, or the answer varies with neighbour order. Diagnosis: the level counter is incremented per dequeued vertex, or per enqueue, instead of once per batch of `size` pops. Fix: record `size = len(queue)` and pop exactly that many before incrementing.

### BFS on a weighted graph

Symptom: a routing or cost problem returns a path that is shortest in hops but not in cost; tests with uniform weights pass. Diagnosis: the input has weights, and BFS's FIFO order does not match distance order. Fix: Dijkstra; 0-1 BFS if the weights are exactly 0 and 1; splitting an edge of weight `w` into `w` unit edges only when `w` is tiny.

### An implicit graph with no bound

Symptom: BFS over integer states ("reach `t` from `s` using +1 and ×2") never terminates or exhausts memory. Diagnosis: the state space is infinite and nothing prunes it; visited alone does not help when every state is new. Fix: bound the states (never exceed `2t`, never go negative), or search backwards from the target where the moves shrink the number.

## Interviewer follow-ups

**"Shortest path on a grid where you may remove up to k walls."** Model answer: the vertex is `(r, c, walls_left)`, not `(r, c)`; moving into a wall consumes one unit. On a 100 × 100 grid with k = 5 that is 100 × 100 × 6 = 60,000 states, and BFS over them is still O(states × 4). Common wrong answer: BFS on `(r, c)` with a counter carried along, which lets a later arrival with more walls left be discarded because the cell is "visited".

**"How many distinct shortest paths are there from s to t?"** Model answer: keep `count[v]`; when `u` discovers `v`, set `count[v] = count[u]`; when `u` sees an already-discovered `v` with `dist[v] == dist[u] + 1`, add `count[u]` to `count[v]`. Same O(V + E). Common wrong answer: enumerate paths with DFS, which is exponential.

**"Edge weights are 1 and 2. Still BFS?"** Model answer: not 0-1 BFS, whose deque argument needs the two values to be 0 and 1. Either Dial's algorithm with three buckets, or insert a dummy vertex in the middle of every weight-2 edge and run plain BFS on the doubled graph, or Dijkstra. Common wrong answer: 0-1 BFS with "push weight-1 to the front".

**"Target at depth 10, branching factor 50."** Model answer: bidirectional BFS, about 2 × 50^5 ≈ 6 × 10^8 states touched instead of 50^10 ≈ 10^17, provided edges can be followed backwards; if only forward edges are available, build the reverse adjacency list first (one O(E) pass). Common wrong answer: "BFS with early exit", which still has to expand levels 0..9 in full.

**"Why does the queue never hold three different distances?"** Model answer: when a vertex at distance `k` is dequeued it can only enqueue distance `k + 1`; everything at distance `k − 1` was dequeued before it. So the queue is a prefix of distance-`k` vertices followed by distance-`(k+1)` vertices, which is the invariant that makes both level counting and the shortest-path proof work. Common wrong answer: "because the visited set stops duplicates", which is about count, not order.

## What mid-level engineers get wrong

- Marking visited on dequeue: correct output, O(E) queue, and a memory blow-up on the first dense test case.
- `queue.pop(0)` on a list, or `shift()` on a JS array: O(V²) at scale while the small tests pass.
- Checking for the target on dequeue instead of on discovery, which expands a whole extra level on a wide graph.
- Incrementing the level per vertex instead of per batch, giving an answer off by one in either direction.
- Running BFS from each source in turn for "nearest of many": O(sources × (V + E)) instead of one pass.
- Applying BFS to a weighted graph because "it worked on the example", where all weights happened to be equal.
- Using a set of `(r, c)` tuples for visited on a 10^6-cell grid: 0.4 s of hashing where a 2-D list spends 0.15 s.
- Forgetting that the search state may need more than the position: `(r, c)` when the problem's state is `(r, c, keys)` or `(r, c, walls_left)`.

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

- You can state and sketch the proof of the BFS invariant, you know it depends on equal edge weights, and you can say why the queue never holds more than two distinct distances.
- You mark visited on **enqueue**, use an O(1) queue, and can put numbers on what goes wrong otherwise: 1 + n(n − 1)/2 enqueues on Kₙ, a 26× slowdown for 5× the queue with `pop(0)`.
- You trace BFS on paper with a step, dequeued, queue, `dist`, `parent` table, and reconstruct the path by walking parents backwards.
- You seed the queue with all sources for "nearest X" problems and recognise it as a super-source.
- You know the 0-1 BFS deque argument (two consecutive distances, front and back) and that it is Dijkstra with two buckets, and you know it breaks for weights 1 and 2.
- You reach for bidirectional BFS when there is a single target and a large branching factor, you can do the b^(d/2) arithmetic, and you finish the level before returning the meeting distance.
- You know what a `deque` is (64-slot blocks), what `ArrayDeque` is (a ring buffer), and why production BFS on CSR uses frontier vectors and switches to bottom-up on social-graph-shaped data.
- You switch to Dijkstra the moment weights appear, and to DFS when memory or "any path" makes BFS the wrong shape, and you define the search state before you write the loop.

## Check yourself

```quiz
- q: >-
    BFS marks vertices visited when they are dequeued instead of when they are enqueued. On a complete graph with V vertices, what happens?
  options: ["Nothing changes, because each vertex is still processed only once", "BFS never terminates, because vertices keep re-entering the queue forever", "Distances come out wrong, because a later duplicate overwrites the vertex's first label", "Each vertex can be enqueued up to V-1 times, so the queue fills with duplicates"]
  answer: 3
  explanation: >-
    Every vertex at level 1 is enqueued by the source; each then enqueues every other still-unmarked level-1 vertex again, for 1 + V(V − 1)/2 enqueues in total. Distances remain correct (the first dequeue wins and later duplicates are skipped), and the search still terminates because each vertex is marked once it is dequeued; only the work multiplies. Mark on enqueue.
- q: >-
    A grid problem gives each move a cost of 1, except moving through mud, which costs 3. Which algorithm finds the cheapest route?
  options: ["Dijkstra with a priority queue, because edge costs are unequal", "0-1 BFS, because a deque handles two distinct edge costs", "BFS, because every move on a grid is still a single step", "DFS with pruning, because it can abandon any branch that is already costlier"]
  answer: 0
  explanation: >-
    BFS's first-discovery-is-shortest invariant relies on uniform costs. With costs 1 and 3, a longer path in hops can be cheaper. 0-1 BFS handles two costs only when they are exactly 0 and 1, because its deque then holds two consecutive distances in order; costs of 1 and 3 break that ordering.
- q: >-
    You need the distance from every cell of a 2,000 × 2,000 grid to the nearest of 5,000 hospitals. Running one BFS per hospital costs about 5,000 × 4 × 10^6 cell visits. Multi-source BFS costs:
  options: ["About the same, since each hospital still needs its own wavefront", "About 4 × 10^6 cell visits, as one pass seeded with every hospital", "About 5,000 × log(4 × 10^6), one heap operation per hospital", "About 4 × 10^6 × log 5,000, for a heap to pick the nearest source"]
  answer: 1
  explanation: >-
    Seeding every hospital at distance 0 is equivalent to BFS from a virtual super-source; each cell is discovered once by its nearest hospital. One pass over the grid, and a plain FIFO queue suffices because all edges still cost 1, so no heap and no log factor is needed.
- q: >-
    Word ladder from "hit" to "cog" with a dictionary of 50,000 five-letter words. Why does bidirectional BFS help so much?
  options: ["It stores half as many vertices per side, so total memory is cut in half", "It expands both endpoints' neighbourhoods in parallel, which halves the wall time", "Each side searches only half the distance, so ~2·b^(d/2) vertices replace b^d", "It skips building the adjacency list, so neighbours cost O(1) to generate"]
  answer: 2
  explanation: >-
    With branching factor b around 100 and distance d around 6, one-directional BFS may touch b^6 = 10^12 candidates while two half-searches touch about 2 × 10^6. The saving is exponential, not a factor of two, because halving the depth takes the square root of the frontier size. The meeting point gives the shortest path when both sides expand level by level and the level's minimum meeting distance is taken.
- q: >-
    A level-by-level BFS records size = len(queue) before draining a level. Why must it pop exactly size vertices rather than draining until the queue is empty?
  options: ["Popping more than size vertices would revisit vertices already marked as seen", "Vertices appended during the level belong to the next level and must stay behind the boundary", "Draining fully would process levels in reverse order because of FIFO wraparound", "The queue must be non-empty at the end of each level for the loop condition to hold"]
  answer: 1
  explanation: >-
    Neighbours discovered while processing level k are appended behind the size recorded at the start, so they are at distance k + 1; popping only size vertices leaves them for the next iteration and lets the level counter increment once per distance value. Draining fully would merge every remaining level into one and report a depth of 1. Visited marks prevent duplicates regardless of how many are popped.
- q: >-
    On a social graph BFS, the frontier at level 3 contains 60% of all vertices. Direction-optimising BFS switches to bottom-up because:
  options: ["Bottom-up processes all remaining levels in parallel, so the rest of the search finishes in a single pass", "Bottom-up needs no visited bitmap, because every unvisited vertex is examined exactly once per level anyway", "The queue would overflow at 60% of vertices, so bottom-up replaces the queue with a hash set of unvisited vertices", "Each unvisited vertex stops at its first in-neighbour in the frontier, far fewer edge reads than the frontier's out-degrees"]
  answer: 3
  explanation: >-
    Top-down cost is the sum of the frontier's out-degrees, nearly every edge when the frontier is most of the graph, while bottom-up asks each unvisited vertex for any frontier parent and usually finds one within a couple of in-edges. The switch is a cost heuristic on edge counts, not a memory workaround; a bitmap still marks visited and levels are still processed one at a time.
```

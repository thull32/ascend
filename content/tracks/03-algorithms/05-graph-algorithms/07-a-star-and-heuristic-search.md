---
slug: a-star-and-heuristic-search
title: "A*: Dijkstra with a sense of direction"
description: How an admissible heuristic lets A* skip most of the graph while staying optimal, why consistency is what lets you settle each node once, which heuristics fit which graphs, and when A* is the wrong choice.
minutes: 45
difficulty: medium
tags: [graphs, a-star, heuristic, admissible, consistent, shortest-path, pathfinding]
problems: [swim-in-rising-water, word-ladder]
---
Run Dijkstra from a point in Berlin to find a route to Munich and it will settle every node within 580 km before it pops Munich, including Hamburg, Copenhagen and most of Poland. The algorithm has no idea which direction the goal is in, because the only information it uses is distance *from the start*. Every one of those northern nodes was a waste of work, and on a continent-scale road graph the waste is measured in seconds per query.

A* fixes this with one additional number per node: an estimate `h(v)` of the distance *to the goal*. The priority queue orders nodes by `g(v) + h(v)`, distance so far plus estimated distance remaining, so nodes that are heading the wrong way sink to the bottom of the queue. With a good estimate the search expands a narrow corridor between start and goal instead of a circle around the start. The remarkable part is that this is not an approximation: with the right kind of estimate, A* returns exactly the optimal path, and the proof is two paragraphs.

## The mechanism

A* is Dijkstra with the heap key changed from `g(v)` to `f(v) = g(v) + h(v)`. Everything else stays: tentative distances, relaxation, lazy deletion, settling on pop.

```python
import heapq

def a_star(adj, start, goal, h):
    g = {start: 0}
    prev = {}
    heap = [(h(start), start)]
    closed = set()
    while heap:
        f, u = heapq.heappop(heap)
        if u == goal:
            return g[u], prev                  # optimal if h is admissible
        if u in closed:
            continue
        closed.add(u)
        for v, w in adj(u):
            ng = g[u] + w
            if ng < g.get(v, float("inf")):
                g[v] = ng
                prev[v] = u
                heapq.heappush(heap, (ng + h(v), v))
    return None, prev
```

Two details to notice. The function returns when the goal is *popped*, not when it is first pushed; a pushed entry only carries a tentative `g`. And the heuristic is evaluated for every relaxed neighbour, so `h` needs to be cheap: a Manhattan distance is two subtractions, while a heuristic that runs its own search is usually a net loss.

```viz
{"type": "graph", "algorithm": "a-star", "directed": false, "start": "A", "goal": "F",
 "title": "A* from A to F; labels show h, the heuristic estimate to F",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":30,"y":20},{"id":"C","x":30,"y":80},{"id":"D","x":55,"y":50},{"id":"E","x":75,"y":15},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":4},{"from":"B","to":"D","w":4},{"from":"C","to":"D","w":4},{"from":"B","to":"E","w":5},{"from":"D","to":"F","w":5},{"from":"E","to":"F","w":5}]}
```

Watch which nodes get expanded. Dijkstra would settle every node with `g < 13` before F; A* orders by `g + h` and pops F as soon as no unexpanded node could possibly beat it.

## Admissible: never overestimate

A heuristic is **admissible** if `h(v) ≤ h*(v)` for every node, where `h*(v)` is the true cost of the cheapest path from `v` to the goal. `h = 0` is admissible (and gives you Dijkstra). Straight-line distance is admissible on a road network because no road is shorter than the straight line. Manhattan distance is admissible on a 4-connected grid, and is in fact exact on an empty grid.

Claim: with an admissible heuristic, the first time the goal is popped, `g(goal)` is optimal. Suppose not: some path `P` to the goal is cheaper than `g(goal)`. Consider the first node `y` on `P` that is not yet expanded (it exists, otherwise `P` would have been fully relaxed and `g(goal)` would be at most its cost). All of `P`'s prefix up to `y` has been relaxed, so `g(y)` is at most the prefix cost, and `f(y) = g(y) + h(y) ≤ cost(prefix) + h*(y) ≤ cost(P) < g(goal) = f(goal)` using admissibility in the middle step and `h(goal) = 0` at the end. So `y` has a strictly smaller `f` than the goal and would have been popped first. Contradiction.

That proof used only admissibility, and it says nothing about how many times a node might be expanded. That is the job of the stronger property.

## Consistent: the triangle inequality

A heuristic is **consistent** (or monotone) if for every edge `(u, v)` with weight `w`, `h(u) ≤ w + h(v)`, and `h(goal) = 0`. It is a triangle inequality: the estimate from `u` cannot exceed one step to `v` plus the estimate from `v`. Consistency implies admissibility (induct along the optimal path), and every standard geometric heuristic (Manhattan, Euclidean, Chebyshev) is consistent, because each is a true metric.

What consistency buys: along any path, `f` is non-decreasing, since `f(v) = g(u) + w + h(v) ≥ g(u) + h(u) = f(u)`. Non-decreasing `f` along paths means that when a node is popped, its `g` is already optimal, exactly as in Dijkstra, and it never needs to be reopened. The `closed` set in the code above is only correct *because* `h` is consistent. With an admissible but inconsistent heuristic, a node can be popped with a suboptimal `g`, and a later, cheaper path to it must reopen it; A* remains optimal if you allow reopening, but its running time loses its guarantee and can become exponential in pathological cases.

The distinction matters in practice when the heuristic is learned, cached or hand-tuned rather than geometric. If you ever assemble a heuristic as `max(h1, h2)` of two consistent heuristics, the result is still consistent (and stronger). If you assemble it as a weighted sum or from a lookup table with rounding, check the triangle inequality on every edge, which is a linear pass and the subject of the second exercise.

## Choosing the heuristic

| Graph | Movement | Consistent heuristic |
|---|---|---|
| Grid | 4 directions, unit cost | Manhattan: `|dx| + |dy|` |
| Grid | 8 directions, unit cost | Chebyshev: `max(|dx|, |dy|)` |
| Grid | 8 directions, diagonal costs √2 | Octile: `max + (√2 − 1)·min` |
| Road network | Edge lengths in metres | Straight-line (great-circle) distance |
| Road network | Edge costs in seconds | Straight-line distance ÷ maximum speed limit |
| Sliding puzzle | Move one tile | Sum of Manhattan distances of tiles; pattern databases |
| Word ladder | Change one letter | Number of positions where the word differs from the target |

Two heuristics are worth having as reference points. `h = 0` gives Dijkstra: no pruning, no risk. `h = h*` (the exact remaining cost) expands *only* the nodes on the optimal path, since every off-path node has `f > f(goal)`. Real heuristics sit between, and the tighter they are, the fewer nodes A* expands: a heuristic that is 90% of the truth on average prunes far more than one at 50%.

Tie-breaking matters more than people expect. Many nodes share the same `f` near the goal; preferring the one with *larger* `g` (equivalently smaller `h`) pushes the search toward the goal and can halve the expansions on an open grid. Encode it in the heap key as `(f, -g, node)`.

## A worked count

A 9 × 9 empty grid, start at the centre, goal in the corner, 4-directional moves. Dijkstra (BFS here, since costs are uniform) settles every cell at distance less than 8 before it pops the goal: about 113 cells, then the goal. A* with Manhattan distance has `f = 8` for every cell on a shortest path and `f ≥ 10` for every cell off it, so it expands only cells with `f = 8` before popping the goal: the diagonal band of cells between start and corner, roughly 25. Add a wall and the band bends around it, with expansions spilling into the "wrong" region only as far as the wall forces. That ratio, four or five to one on a small open grid and much larger on a big map, is why every game engine ships A* rather than Dijkstra.

## When A* is the wrong tool

- **Many goals or all destinations.** A* needs a single goal to aim at. "Distance from this depot to every customer" is Dijkstra; A* would need one run per customer.
- **No usable heuristic.** On an abstract graph (a dependency graph, a state machine, a social network) there is often nothing that lower-bounds the remaining distance except 0. A* with `h = 0` is Dijkstra with a heavier heap key.
- **The heuristic costs more than it saves.** A heuristic that runs a search itself, or a database lookup per node, can cost more than the nodes it prunes.
- **Overestimating heuristics.** Scaling `h` by `ε > 1` (weighted A*) makes the search greedier and often much faster, at the cost of optimality; the path is guaranteed to be within a factor `ε` of optimal. Pure greedy best-first search (`f = h`) is the extreme and has no guarantee at all. That trade-off is legitimate when you say it out loud, and a bug when you do not.
- **Memory.** A* keeps every generated node in memory. On huge implicit graphs (puzzle state spaces, planning problems) that is the bottleneck, and **IDA\*** (iterative deepening on an `f` bound) trades time for `O(depth)` memory.

For continent-scale road routing, plain A* with straight-line distance is only a few times faster than Dijkstra, because road distances exceed straight-line distances by a fairly consistent factor and the ellipse is still huge. Production routing engines use A* with **landmarks** (precomputed distances to a few dozen well-placed nodes give much tighter lower bounds via the triangle inequality) or **contraction hierarchies**, which preprocess the graph so that queries touch a few hundred nodes. Knowing that A* is the textbook answer and not the deployed one is a useful thing to say in a design interview.

## Exercises

```exercise
id: a-star-grid
title: A* on a grid with Manhattan distance
prompt: |
  Implement `a_star_grid(grid, start, goal)`. `grid` contains `0` (open) and
  `1` (wall); `start` and `goal` are `[row, col]` open cells. Moves are
  up/down/left/right with cost 1. Return the length of the shortest path,
  or `-1` if the goal is unreachable.

  Use a heap keyed on `f = g + h` with Manhattan distance as `h`, and return
  when the goal is popped (not when it is pushed).
languages: [python, javascript]
entry: a_star_grid
starter:
  python: |
    import heapq

    def a_star_grid(grid, start, goal):
        rows, cols = len(grid), len(grid[0])
        sr, sc = start
        gr, gc = goal
        h = lambda r, c: abs(r - gr) + abs(c - gc)
        # g dict, heap of (f, g, r, c), closed set
        return -1
  javascript: |
    class MinHeap {
      constructor() { this.a = []; }
      push(x) { const a = this.a; a.push(x); let i = a.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
      pop() { const a = this.a; const top = a[0]; const last = a.pop();
        if (a.length) { a[0] = last; let i = 0;
          for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top; }
      get size() { return this.a.length; }
    }

    function a_star_grid(grid, start, goal) {
      const rows = grid.length, cols = grid[0].length;
      const [gr, gc] = goal;
      const h = (r, c) => Math.abs(r - gr) + Math.abs(c - gc);
      // g map keyed by r*cols+c, heap of [f, g, r, c], closed set
      return -1;
    }
tests:
  - args: [[[0,0,0],[0,0,0],[0,0,0]], [0,0], [2,2]]
    expected: 4
    label: empty grid
  - args: [[[0,1,0],[0,1,0],[0,0,0]], [0,0], [0,2]]
    expected: 6
    label: around a wall
  - args: [[[0,1],[1,0]], [0,0], [1,1]]
    expected: -1
    label: unreachable
  - args: [[[0]], [0,0], [0,0]]
    expected: 0
    label: start is goal
  - args: [[[0,0,0,0],[1,1,1,0],[0,0,0,0],[0,1,1,1],[0,0,0,0]], [0,0], [4,3]]
    expected: 13
    hidden: true
    label: zigzag
  - args: [[[0,1],[0,0]], [1,1], [1,1]]
    expected: 0
    hidden: true
  - args: [[[0,0,0],[0,1,0],[0,0,0]], [1,0], [1,2]]
    expected: 4
    hidden: true
hints:
  - "Push `(h(start), 0, sr, sc)`; on pop, if the cell is the goal return its `g`."
  - "Skip a popped cell that is already closed; Manhattan distance is consistent, so closed cells never need reopening."
  - "Relax each in-bounds open neighbour with `ng = g + 1` and push `(ng + h(nr, nc), ng, nr, nc)` if `ng` improves it."
```

```exercise
id: check-heuristic
title: Is this heuristic admissible and consistent?
prompt: |
  Implement `check_heuristic(n, edges, goal, h)`. `edges` are directed
  `[u, v, w]` triples with `w >= 0`, `goal` is a node, and `h[v]` is a
  proposed heuristic value for every node. Return an object with two
  booleans, using exactly these keys:

  - `admissible`: `h[v] <= true distance from v to goal` for every `v` that
    can reach the goal (nodes that cannot reach it impose no constraint)
  - `consistent`: `h[goal] == 0` and `h[u] <= w + h[v]` for every edge

  Compute true distances with one Dijkstra from `goal` on the reversed graph.
languages: [python, javascript]
entry: check_heuristic
starter:
  python: |
    import heapq

    def check_heuristic(n, edges, goal, h):
        # reverse the edges, run Dijkstra from goal, then check both properties
        return {"admissible": False, "consistent": False}
  javascript: |
    function check_heuristic(n, edges, goal, h) {
      // reverse the edges, run Dijkstra from goal (a sorted array is fine at this size),
      // then check both properties
      return { admissible: false, consistent: false };
    }
tests:
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [3,2,1,0]]
    expected: {"admissible": true, "consistent": true}
    label: exact heuristic
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [4,2,1,0]]
    expected: {"admissible": false, "consistent": false}
    label: overestimates at node 0
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [0,0,0,0]]
    expected: {"admissible": true, "consistent": true}
    label: zero heuristic is Dijkstra
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [3,0,1,0]]
    expected: {"admissible": true, "consistent": false}
    label: admissible but violates the triangle inequality on 0->1
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [2,2,1,0]]
    expected: {"admissible": true, "consistent": true}
    hidden: true
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,5]], 3, [3,2,1,1]]
    expected: {"admissible": false, "consistent": false}
    hidden: true
    label: nonzero at the goal
  - args: [3, [[0,1,1]], 1, [1,0,100]]
    expected: {"admissible": true, "consistent": true}
    hidden: true
    label: a node that cannot reach the goal is unconstrained
hints:
  - "Build the reversed adjacency (`v -> u` with weight `w`) and run Dijkstra from `goal`; `dist[v]` is then the true cost from `v` to `goal`."
  - "Admissible: for every `v` with finite `dist[v]`, require `h[v] <= dist[v]`."
  - "Consistent: `h[goal] == 0` and for every original edge `[u, v, w]`, `h[u] <= w + h[v]`."
```

## Senior signals

- You describe A* as "Dijkstra with the key changed to `g + h`" and can give the two-paragraph proof that an admissible heuristic keeps it optimal.
- You distinguish admissible from consistent, know that consistency is what justifies a closed set, and check the triangle inequality when the heuristic is not a plain metric.
- You return on pop, not on push, and you break ties toward larger `g`.
- You can name the right heuristic for 4-way, 8-way and weighted-diagonal grids and for time-based road costs, and you know `max` of consistent heuristics is consistent.
- You know when A* is the wrong tool (many goals, no heuristic, expensive heuristic) and that weighted A* trades a bounded factor of optimality for speed.
- You know production routing uses landmarks or contraction hierarchies rather than plain A*, and why.

## Check yourself

```quiz
- q: >-
    A* with an admissible but inconsistent heuristic pops node X with g = 10, closes it, and later finds a path to X with g = 8. What is true?
  options: ["It can happen; X must be reopened to keep A* optimal", "It can happen only if h overestimates at some node", "Impossible; admissibility makes every popped g optimal", "It is harmless, since X cannot lie on the optimal path"]
  answer: 0
  explanation: >-
    Admissibility guarantees the goal's g is optimal when popped, not every node's. Without consistency f is not monotone along paths, so a node can be popped early with a suboptimal g, even though h never overestimates. Reopening restores optimality at the cost of the runtime guarantee, which is why consistency is preferred: it avoids the problem entirely.
- q: >-
    On an 8-directional grid where diagonal moves cost 1, which heuristic is both admissible and tightest?
  options: ["Octile distance max + (√2 − 1)·min", "Manhattan distance |dx| + |dy|", "Euclidean distance √(dx² + dy²)", "Chebyshev distance max(|dx|, |dy|)"]
  answer: 3
  explanation: >-
    With unit diagonal moves you can cover the shorter axis 'for free' while moving along the longer one, so the true distance is exactly max(|dx|, |dy|). Manhattan overestimates (inadmissible), and so does octile, which assumes diagonals cost √2; Euclidean underestimates more than necessary.
- q: >-
    You multiply a consistent heuristic by 1.5. What do you get?
  options: ["A faster search whose path is within 1.5× of optimal", "Greedy best-first search, with no bound on path cost", "A slower search, since inflated f values delay the goal", "A faster search whose path is still guaranteed optimal"]
  answer: 0
  explanation: >-
    Scaling above 1 can overestimate, so admissibility is lost and optimality with it, but weighted A* has a bounded suboptimality of the scale factor. It usually expands far fewer nodes, which is a legitimate trade-off when stated explicitly. Only pure greedy best-first (f = h) gives up the bound entirely.
- q: >-
    Which task is a poor fit for A*?
  options: ["Routing one vehicle from a depot to one customer on a road map", "Computing the delivery times from one depot to all 5,000 customers", "Moving a game character to the location the player clicked", "Solving one 15-puzzle instance from a scrambled start"]
  answer: 1
  explanation: >-
    A* needs a single goal to aim its heuristic at. One-to-all is exactly Dijkstra's shape; running A* 5,000 times would repeat most of the work. The other three are single-goal searches with good heuristics available.
- q: >-
    Two candidate nodes have the same f value. Which should A* prefer to reduce expansions, and why?
  options: ["Smaller g, since a shorter known path is more reliable", "The one discovered first, since FIFO order is stable", "Larger g, since its smaller h puts it nearer the goal", "Neither, since equal f means equal work remaining"]
  answer: 2
  explanation: >-
    Among equal-f nodes, larger g means the remaining estimate is smaller, so the search is deeper along a promising path and finishes sooner. On open grids this tie-break can halve expansions; equal f does not mean equal work remaining.
```

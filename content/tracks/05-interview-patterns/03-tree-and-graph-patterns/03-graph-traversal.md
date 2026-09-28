---
slug: graph-traversal
title: "Graph traversal: BFS, DFS and the visited set on grids and implicit graphs"
description: Recognise when a grid, a word list or a set of accounts is really a graph, choose BFS or DFS by what the question asks, and see Number of Islands, Rotting Oranges, Pacific Atlantic and Word Ladder traced with the frontier written out.
minutes: 36
difficulty: medium
tags: [graph, bfs, dfs, grid, multi-source-bfs, flood-fill, pattern:graph]
problems: [number-of-islands, clone-graph, max-area-island, pacific-atlantic, surrounded-regions, rotting-oranges, walls-and-gates, graph-valid-tree, count-components, word-ladder]
---
The problem gives you a grid of land and water, or a dictionary of words, or a list of accounts with shared emails, and asks how many groups there are, how far something spreads, or what the fewest steps are from here to there. Nothing in the statement says "graph". But every one of these is a set of things with a neighbour relation, and every question is "what is reachable" or "how far", which are the two questions graph traversal answers.

The skill this lesson teaches is seeing the graph: naming the nodes, naming the edges, and then choosing between the two traversals by what the question asks. BFS when the question involves *distance* or *fewest steps*; DFS (or BFS, they are interchangeable here) when it involves *reachability*, *components* or *filling a region*. Once the graph is named, the code is the same twenty lines every time, and the only thing left to get right is the visited set.

## The signal

Reach for graph traversal when the statement contains any of these:

- **"Connected", "groups", "regions", "islands", "components", "provinces"**: count them, measure the largest, or label them. One traversal per unvisited start node; the number of traversals is the number of components.
- **"Spreads", "rots", "infects", "fills" over time**, or **"nearest exit / gate / zero"**: multi-source BFS. Every source starts at distance 0 in the queue; the level number is the time step.
- **"Fewest steps", "shortest transformation", "minimum moves"** on unweighted moves: BFS from the start, stop on reaching the goal. The nodes are often *states* (a word, a board position, a number) and the edges are the legal moves.
- **"Surrounded", "enclosed", "can reach the border"**: traverse *from the border inward* and mark what is reachable; whatever remains unmarked is enclosed.
- **"Clone", "copy the structure"**: traverse once with a map from original node to copy.
- **"Is it a tree", "does it have a cycle"** on an undirected edge list: traverse from one node, track the parent to avoid seeing the edge you came from as a cycle, and check that every node was reached.

What rules it out:

- **Edges have weights** and the question is about minimum total cost. BFS counts edges, not weight; that is [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern).
- **The edges are dependencies** ("must come before") and you need an ordering: [Topological sort](/learn/interview-patterns/tree-and-graph-patterns/topological-sort-pattern).
- **Edges arrive over time** and you need connectivity queries between arrivals, or the only question is "same group?" for many pairs: [Union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern) does that without traversing.
- **It is a tree** given as a root with child pointers: no visited set is needed, and the previous two lessons apply.

Choosing between BFS and DFS: if the answer involves a *distance* or *the first time something happens*, BFS. If it involves *everything reachable* or a *region*, either works; DFS is shorter to write recursively, BFS avoids recursion-depth problems on a 1000×1000 grid (a snake-shaped island can recurse a million frames deep). Say that trade-off out loud and pick.

| Axis | Recursive DFS | Iterative DFS (stack) | BFS (queue) | Multi-source BFS |
|---|---|---|---|---|
| Gives distances | no | no | yes, in edge count | yes, from the nearest source |
| Memory | `O(depth)` frames, crashes past ~10³ in Python | `O(V)` stack worst case | `O(V)` queue worst case, `O(width)` typical | as BFS |
| Code length | shortest | medium | medium | medium plus seeding |
| Safe on a 10⁶-cell grid | no | yes | yes | yes |
| Natural for | regions, components, "can reach" | same, at scale | fewest steps, levels, "spreads" | "nearest X for every cell" |

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Shortest path where each cell has a cost" | Grid BFS | Dijkstra on the grid: [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern) | BFS levels are distances only when every step costs the same |
| "Shortest path, you may remove up to `k` walls" | Grid BFS with a visited set of cells | BFS over states `(r, c, walls_left)`; visited is per state | The same cell can be worth revisiting with more removals left |
| "Number of islands, cells are added one at a time and you report the count after each" | Flood fill after every addition, `O(k · R·C)` | [Union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern): each addition unions with land neighbours in near-`O(1)` | Edges arrive over time and no distances are needed |
| "Can you finish all courses" | Cycle detection with a visited set | Directed cycle detection needs three colours or Kahn's algorithm: [Topological sort](/learn/interview-patterns/tree-and-graph-patterns/topological-sort-pattern) | A visited neighbour in a directed graph is not necessarily a cycle |
| "Is the undirected graph a tree" | Cycle detection | Cycle detection *plus* connectivity plus the `n − 1` edge count | Acyclic but disconnected is a forest, not a tree |
| "Longest increasing path in a matrix" | Grid DFS | DFS with memoisation (DP on a DAG); no visited set needed because increasing values cannot cycle | The answer per cell is reused, which a plain traversal cannot do |
| "Reach the last index in the fewest jumps" | BFS over indices | Greedy over contiguous ranges, `O(n)`: [Greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern) | Every level of the BFS is a contiguous range, so the queue is two integers |

## The template

Three pieces: a way to enumerate neighbours, a visited set, and the loop. On a grid, the neighbour enumeration is the four direction offsets with a bounds check; on an adjacency list it is `adj[u]`; on an implicit graph it is "generate the legal next states".

```python
from collections import deque

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]

def bfs_grid(grid, sources):
    """Multi-source BFS. Returns a dist grid; -1 where unreachable."""
    R, C = len(grid), len(grid[0])
    dist = [[-1] * C for _ in range(R)]
    queue = deque()
    for r, c in sources:
        dist[r][c] = 0                      # mark visited when ENQUEUED
        queue.append((r, c))
    while queue:
        r, c = queue.popleft()
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] != WALL and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                queue.append((nr, nc))
    return dist


def dfs_components(n, adj):
    """Count connected components in an undirected graph given as adjacency lists."""
    seen = [False] * n
    def dfs(u):
        seen[u] = True
        for v in adj[u]:
            if not seen[v]:
                dfs(v)
    count = 0
    for u in range(n):
        if not seen[u]:
            count += 1
            dfs(u)
    return count
```

```javascript
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function bfsGrid(grid, sources, WALL) {
  const R = grid.length, C = grid[0].length;
  const dist = Array.from({ length: R }, () => Array(C).fill(-1));
  const queue = [];
  let head = 0;                              // head index instead of shift()
  for (const [r, c] of sources) { dist[r][c] = 0; queue.push([r, c]); }
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < R && nc >= 0 && nc < C && grid[nr][nc] !== WALL && dist[nr][nc] === -1) {
        dist[nr][nc] = dist[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return dist;
}

function dfsComponents(n, adj) {
  const seen = new Array(n).fill(false);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    count++;
    const stack = [s];                       // iterative: no recursion limit
    seen[s] = true;
    while (stack.length) {
      const u = stack.pop();
      for (const v of adj[u]) if (!seen[v]) { seen[v] = true; stack.push(v); }
    }
  }
  return count;
}
```

The line that matters most is where `visited` is set. In BFS, mark a node visited **when you enqueue it**, not when you dequeue it. If you mark on dequeue, the same cell can be enqueued by several neighbours before any of them is processed, and on a grid that turns `O(R·C)` into something much worse (each cell enqueued up to four times, and the duplicates each fan out again). The `dist[nr][nc] == -1` check in the template does the marking and the visited test in one line.

Both traversals are `O(V + E)`, and here is where each term comes from: the outer scan or the seeding touches every node once (`V`); each node is enqueued at most once because it is marked when enqueued, so the dequeue loop runs at most `V` times; each dequeue examines that node's edges, and summed over all nodes that is every edge once per endpoint (`2E` for an undirected graph). On an `R × C` grid each cell has at most four edges, so `E ≤ 2·R·C` and the total is `O(R·C)`; on an adjacency list built from an edge list it is `O(V + E)` plus `O(E)` to build the list. Space is `O(V)` for the visited structure plus the queue or stack, which can also reach `O(V)`: on a grid a BFS frontier is a diagonal band of at most `R + C` cells from a single corner source, but from many sources or on an open adjacency list it can hold most of the graph.

The visited structure is where the constant factors live. Measured on CPython 3.14 for a 1000 × 1000 grid: a `set` of `(r, c)` tuples costs about 121 MB (a 64-byte tuple per cell plus the set's own slots), a list of lists of booleans about 8 MB (one 8-byte pointer per cell to a shared `False`), a `bytearray` of `R·C` about 1 MB, and writing the mark into the input grid costs nothing. A BFS queue holding half the grid as tuples is another 48 MB. None of this changes the big-O; all of it decides whether a 10⁶-cell test passes a 256 MB memory limit.

Watch the flood fill count islands:

```viz
{"type": "graph", "algorithm": "grid-islands", "grid": [[1, 1, 0, 0, 0], [1, 0, 0, 1, 1], [0, 0, 1, 0, 0], [1, 0, 1, 1, 0]], "title": "Number of Islands by flood fill", "caption": "Each unvisited land cell starts one traversal that marks its whole island."}
```

## Worked problems

### Number of Islands

[Number of Islands](/practice/number-of-islands): count the groups of 4-directionally connected `1` cells in a grid of `0`s and `1`s.

Nodes are land cells; edges join orthogonal neighbours that are both land. Every traversal from an unvisited land cell marks exactly one island, so the count is the number of traversals started. The trick that saves memory is to *sink* visited land by writing `0` into the grid instead of keeping a separate visited set. Ask whether mutating the input is acceptable; if not, use a set of `(r, c)`.

```python
def num_islands(grid):
    R, C = len(grid), len(grid[0])
    def sink(r, c):
        if r < 0 or r >= R or c < 0 or c >= C or grid[r][c] != "1":
            return
        grid[r][c] = "0"                    # mark visited by sinking
        for dr, dc in DIRS:
            sink(r + dr, c + dc)
    count = 0
    for r in range(R):
        for c in range(C):
            if grid[r][c] == "1":
                count += 1
                sink(r, c)
    return count
```

Trace on

```text
1 1 0 0 0
1 0 0 1 1
0 0 1 0 0
1 0 1 1 0
```

| scan reaches | action | cells sunk by this traversal | `count` |
|---|---|---|---|
| (0,0) = 1 | new island | (0,0), (0,1), (1,0) | 1 |
| (0,1)…(1,2) | all 0 now | | 1 |
| (1,3) = 1 | new island | (1,3), (1,4) | 2 |
| (2,2) = 1 | new island | (2,2), (3,2), (3,3) | 3 |
| (3,0) = 1 | new island | (3,0) | 4 |

Answer 4. The scan visits every cell once (`O(R·C)`) and each traversal touches each land cell once, so the sinking does not add another factor; total `O(R·C)`.

Recursion depth is the practical concern: the recursive `sink` on a 1000×1000 grid that is all land recurses a million frames deep and crashes. The iterative version pushes `(r, c)` pairs on an explicit stack, marks on push, and pops in a loop. [Max Area of Island](/practice/max-area-island) is the same code returning the number of cells sunk per traversal and taking the maximum.

### Rotting Oranges

[Rotting Oranges](/practice/rotting-oranges): fresh oranges (1), rotten oranges (2) and empty cells (0). Every minute, every fresh orange adjacent to a rotten one rots. How many minutes until none are fresh, or −1 if impossible?

"Every minute, spreads to neighbours, from *all* rotten ones at once" is multi-source BFS. All initially rotten cells go in the queue at distance 0. Each BFS level is one minute. The answer is the largest distance assigned, and if any fresh orange is never reached, −1.

```python
def oranges_rotting(grid):
    R, C = len(grid), len(grid[0])
    queue, fresh = deque(), 0
    for r in range(R):
        for c in range(C):
            if grid[r][c] == 2:
                queue.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while queue and fresh:
        for _ in range(len(queue)):         # one level = one minute
            r, c = queue.popleft()
            for dr, dc in DIRS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] == 1:
                    grid[nr][nc] = 2        # rot it: this is the visited mark
                    fresh -= 1
                    queue.append((nr, nc))
        minutes += 1
    return minutes if fresh == 0 else -1
```

Trace on

```text
2 1 1
1 1 0
0 1 1
```

| minute | queue at top of level | newly rotten this level | `fresh` after |
|---|---|---|---|
| 0 | (0,0) | (0,1), (1,0) | 6 → 4 |
| 1 | (0,1), (1,0) | (0,2), (1,1) | 2 |
| 2 | (0,2), (1,1) | (2,1) | 1 |
| 3 | (2,1) | (2,2) | 0 |

The loop exits with `fresh == 0` after incrementing `minutes` to 4. Answer 4.

Two details earn the round. First, `while queue and fresh`: without the `fresh` guard, the final level of rotten oranges (which rot nothing new) still increments `minutes`, giving 5. Tracking `fresh` also handles the "already no fresh oranges" case, which returns 0 without entering the loop. Second, the level loop uses the `size` trick from [Tree BFS](/learn/interview-patterns/tree-and-graph-patterns/tree-bfs); the alternative is to carry the minute with each cell.

[Walls and Gates](/practice/walls-and-gates) is the same pattern with gates as sources and rooms receiving their distance; the multi-source BFS gives every room its nearest gate in one pass, where a BFS *from each room* would be `O((R·C)²)`.

### Pacific Atlantic Water Flow

[Pacific Atlantic](/practice/pacific-atlantic): a height grid; water flows from a cell to a neighbour of equal or lower height. The Pacific touches the top and left edges, the Atlantic the bottom and right. Which cells can flow to both oceans?

The obvious approach runs a traversal from every cell to see which oceans it reaches: `O((R·C)²)`. The insight is to reverse the direction: start *from the oceans* and climb. A cell can reach the Pacific if and only if the Pacific can reach it by moving to equal-or-*higher* neighbours. Two traversals, one per ocean, each seeded with an entire edge, and the answer is the intersection of the two reached sets.

```python
def pacific_atlantic(h):
    R, C = len(h), len(h[0])
    def climb(sources):
        seen = set(sources)
        stack = list(sources)
        while stack:
            r, c = stack.pop()
            for dr, dc in DIRS:
                nr, nc = r + dr, c + dc
                if (0 <= nr < R and 0 <= nc < C and (nr, nc) not in seen
                        and h[nr][nc] >= h[r][c]):     # reversed: climb
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        return seen
    pac = climb([(0, c) for c in range(C)] + [(r, 0) for r in range(R)])
    atl = climb([(R - 1, c) for c in range(C)] + [(r, C - 1) for r in range(R)])
    return sorted(pac & atl)
```

Trace on the 3×3 grid

```text
1 2 2
3 2 3
2 4 5
```

Pacific climb, seeded with the top row and left column `{(0,0), (0,1), (0,2), (1,0), (2,0)}`: from (0,1)=2 climb to (1,1)=2 (equal, allowed); from (1,1)=2 climb to (2,1)=4 and (1,2)=3; from (2,1)=4 climb to (2,2)=5; from (1,0)=3 nothing new. Pacific set: all nine cells except none, in fact every cell: `{(0,0),(0,1),(0,2),(1,0),(1,1),(1,2),(2,0),(2,1),(2,2)}`.

Atlantic climb, seeded with the bottom row and right column `{(2,0), (2,1), (2,2), (0,2), (1,2)}`: from (0,2)=2 climb to (0,1)=2 (equal); from (0,1)=2 climb to (1,1)=2 and (0,0)? (0,0)=1 < 2, no. From (1,1)=2 climb to (1,0)=3. From (1,2)=3 climb to... (0,2)=2 no, (1,1) already. Atlantic set: `{(0,1),(0,2),(1,0),(1,1),(1,2),(2,0),(2,1),(2,2)}`, everything except (0,0).

Intersection: eight cells, all but (0,0). Check (0,0)=1: it is on the Pacific edge, but water from it can only flow to (0,1)=2 or (1,0)=3, both higher, so it never reaches the Atlantic. Correct.

Time `O(R·C)` for two traversals. The same "traverse from the boundary" move solves [Surrounded Regions](/practice/surrounded-regions): mark every `O` reachable from the border, then flip every unmarked `O`.

### Word Ladder

[Word Ladder](/practice/word-ladder): transform `beginWord` into `endWord` one letter at a time, each intermediate word in the dictionary; return the length of the shortest chain.

There is no grid and no adjacency list, but there is a graph: nodes are words, edges join words differing in one letter. "Shortest chain" is BFS. The trick is enumerating neighbours cheaply: generating all `26 × L` one-letter edits of a word and checking membership in a set is `O(26L)` per word, far better than comparing against every dictionary word (`O(N·L)`).

```python
def ladder_length(begin, end, words):
    dictionary = set(words)
    if end not in dictionary:
        return 0
    queue = deque([(begin, 1)])
    seen = {begin}
    while queue:
        word, steps = queue.popleft()
        if word == end:
            return steps
        for i in range(len(word)):
            for ch in "abcdefghijklmnopqrstuvwxyz":
                nxt = word[:i] + ch + word[i + 1:]
                if nxt in dictionary and nxt not in seen:
                    seen.add(nxt)               # mark on enqueue
                    queue.append((nxt, steps + 1))
    return 0
```

Trace with `begin = "hit"`, `end = "cog"`, words `["hot", "dot", "dog", "lot", "log", "cog"]`:

| dequeued (word, steps) | neighbours in dictionary and unseen | enqueued |
|---|---|---|
| (hit, 1) | hot | (hot, 2) |
| (hot, 2) | dot, lot | (dot, 3), (lot, 3) |
| (dot, 3) | dog | (dog, 4) |
| (lot, 3) | log | (log, 4) |
| (dog, 4) | cog | (cog, 5) |
| (log, 4) | cog already seen | |
| (cog, 5) | equals `end`, return 5 | |

Answer 5 (hit → hot → dot → dog → cog). `O(N · 26L · L)` time for `N` words of length `L` (the `L` factor from building each candidate string), `O(N·L)` space. Building one candidate (`word[:i] + ch + word[i + 1:]` plus the set lookup) costs on the order of 100 ns in CPython 3.14 on a laptop for `L = 7`, so a 5,000-word dictionary of 7-letter words is `5,000 × 26 × 7 ≈ 9 × 10⁵` candidates, under 0.1 s; comparing every pair of words instead is `5,000² × 7 ≈ 1.75 × 10⁸` character comparisons, which is seconds in Python. The follow-up is bidirectional BFS, which grows the frontier from both ends and stops when they meet; it reduces the explored states from roughly `b^d` to `2·b^(d/2)` for branching factor `b` and distance `d`. With `b = 10` reachable neighbours and `d = 6`, that is about 10⁶ states against 2,000.

The same loop with a single source and a wall grid is "shortest path in a maze"; watch the frontier spread as a diamond and the path recovered from parent pointers:

```viz
{"type": "graph", "algorithm": "grid-bfs", "grid": [[0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0]], "title": "Grid BFS with walls", "caption": "Cells at distance d are all dequeued before any at d + 1; the first time the goal is dequeued its distance is final."}
```

## Variations

The template's four slots are: what a node is, how neighbours are enumerated, what the visited structure is, and what is carried in the queue.

| Variant | Node | Neighbours | Visited | Queue entry | Answer |
|---|---|---|---|---|---|
| Number of Islands | land cell | 4 directions, land only | sink into the grid | `(r, c)` | traversals started |
| Max Area of Island | land cell | as above | as above | `(r, c)` | max cells per traversal |
| Rotting Oranges | fresh cell | 4 directions, fresh only | rot into the grid | `(r, c)` per level | levels until `fresh == 0` |
| Walls and Gates | room | 4 directions, rooms | write the distance | `(r, c)` | distance grid |
| Pacific Atlantic | cell | equal-or-higher neighbours | one set per ocean | `(r, c)` | intersection of two sets |
| Surrounded Regions | `O` cell | 4 directions, `O` only | mark from the border | `(r, c)` | flip unmarked `O` |
| Word Ladder | word | `26·L` edits present in the set | set of words | `(word, steps)` | steps at `end` |
| Clone Graph | node object | `node.neighbors` | map original → copy | node | the copy of the start |
| Count Components / Provinces | integer | `adj[u]` | boolean array | integer | traversals started |
| Graph Valid Tree | integer | `adj[u]` minus the parent | boolean array | `(node, parent)` | all reached and `E == n − 1` |
| Bipartite | integer | `adj[u]` | colour array | integer | no same-colour edge |
| 0-1 BFS | any | weighted 0 or 1 | distance array | deque, front for 0 | distance |
| State space (locks, boards) | encoded state | legal moves | set of states | `(state, moves)` | moves at the goal |

- **Clone a graph** ([Clone Graph](/practice/clone-graph)): traverse with a dictionary `original → copy`. Create the copy when you first *see* a node (on enqueue), and wire neighbours when you *process* it. The dictionary is the visited set.
- **Count components on an edge list** ([Count Components](/practice/count-components), [Number of Provinces](/practice/number-of-provinces)): build adjacency lists first (`O(V + E)`), then the component loop. Or skip the graph entirely and use union-find.
- **Graph valid tree** ([Graph Valid Tree](/practice/graph-valid-tree)): a tree on `n` nodes has exactly `n − 1` edges and is connected. Check the edge count, traverse from node 0 with parent tracking, and check every node was reached. Skipping the parent check reports every undirected edge as a cycle.
- **Bipartite check**: BFS assigning alternating colours; an edge between same-coloured nodes means an odd cycle.
- **0-1 BFS**: edges of weight 0 or 1 (for instance "walking is free, breaking a wall costs 1"). Use a deque; push weight-0 neighbours to the front and weight-1 to the back. Same complexity as BFS, and it is the bridge to Dijkstra.
- **State-space search**: the nodes are configurations (a board, a number, a set of open locks). Encode each state as a hashable key, generate moves as neighbours, BFS for fewest moves. The visited set is what keeps it finite.
- **Grid with diagonals or knight moves**: replace `DIRS`. Everything else is unchanged; say so, and the interviewer will believe you understood the abstraction.

## Under the hood

**Why marking on enqueue is the invariant, not a micro-optimisation.** BFS correctness rests on this claim: *when a node is dequeued, its recorded distance is the shortest*. The proof is by induction on distance and needs every node to enter the queue exactly once, at the moment the first (and therefore shortest) path to it is found. Marking on dequeue lets a node be enqueued by several neighbours before its first dequeue; the first copy still carries the right distance, so answers stay correct, but the queue can hold up to `deg(v)` copies of every node, and every copy is expanded. On a grid that is a factor of up to 4 in work and memory; on a dense adjacency list it is a factor of `deg`, which can be `V`. The [BFS lesson](/learn/data-structures/graphs/breadth-first-search) carries the full proof.

**What the visited set costs per entry.** A Python `set` stores one 8-byte pointer plus an 8-byte cached hash per slot and resizes when the table passes about 60% full, so a 10⁶-entry set is roughly 32 MB of table before the keys; each `(r, c)` key is a 64-byte tuple with two small `int` objects (cached below 257, allocated above), which is where the measured 121 MB for a 1000 × 1000 grid comes from. Encoding the cell as a single integer `r * C + c` cuts the key to one 28-to-32-byte `int` and the hash to a trivial function, and a `bytearray` visited array at one byte per cell is the compact end. In JavaScript, a `Set` of strings `` `${r},${c}` `` pays for string construction and hashing on every check; a `Uint8Array(R * C)` is the equivalent of the bytearray. The choice is invisible at 100 × 100 and decisive at 3,000 × 3,000.

**Recursion depth on a grid.** A recursive DFS on a snake-shaped island recurses once per cell along the snake. CPython stops at 1,000 frames by default; a 32 × 32 all-land grid already exceeds it. Node's stack of roughly 1 MB allows on the order of 10⁴ frames, so a 100 × 100 all-land grid is at the edge and a 1000 × 1000 grid fails. The explicit stack version stores `(r, c)` tuples in a list and has no such limit; for a component of 10⁶ cells that list peaks below 10⁶ entries and, at 64 bytes per tuple plus the list slot, uses on the order of 70 MB, which is why encoding cells as single integers matters here too.

**Word Ladder's neighbour set, two ways.** Generating `26·L` candidates per word is `O(26·L²)` including the string builds. The alternative preprocesses every dictionary word into `L` wildcard patterns (`h*t`, `*ot`, `ho*`) in a map from pattern to words, so a dequeued word's neighbours are the union of `L` map lookups, `O(L²)` per word plus `O(N·L²)` once. Both pass; the pattern map wins when the alphabet is large (Unicode) and the dictionary is small, the edit enumeration wins when the dictionary is large.

## Failure modes

**Symptom: a grid BFS times out or runs out of memory on a large open grid, while small tests pass.** Diagnosis: visited is marked on dequeue, so each cell is enqueued by up to four neighbours; or the visited structure is a list and `in` is a linear scan. Count enqueues against `R·C` in a debugger; if the count is larger, it is the marking. Fix: mark when enqueuing (the `dist[nr][nc] == -1` test in the template), and use a set, a boolean grid or the input itself.

**Symptom: wrong island counts on grids where land touches the top or left edge, with no crash.** Diagnosis: the bounds check is `nr < R and nc < C` without `nr >= 0`; Python's `grid[-1]` wraps to the last row, so a traversal leaks across the top edge into the bottom row. Fix: `0 <= nr < R and 0 <= nc < C`. In JavaScript `grid[-1]` is `undefined` and the same bug crashes instead, which is the kinder failure.

**Symptom: `RecursionError` or `RangeError` on a hidden test.** Diagnosis: the recursive flood fill met a component deeper than the language's stack; a 100 × 100 all-land grid is 10⁴ frames. Fix: an explicit stack or a queue; say the number when you make the switch.

**Symptom: Graph Valid Tree reports a cycle on every graph with at least one edge.** Diagnosis: the DFS sees the node it came from as "already visited". Fix: pass the parent and skip it; when parallel edges are allowed, skip the incoming edge id instead of the parent node, because two edges between the same pair are a genuine cycle.

**Symptom: Clone Graph loops forever or produces shared nodes in the copy.** Diagnosis: the copy is created when a node is processed rather than when it is first seen, so a node reached from two neighbours is copied twice, or the map is consulted after recursing. Fix: create and record the copy at first sight, before enqueuing; the map is the visited set.

## Interviewer follow-ups

**"Return the actual shortest path, not only its length."** Model answer: record `parent[v] = u` when enqueuing `v` and walk back from the goal; the parent is set exactly once per node, at the moment of its shortest discovery, so the walk is a shortest path. Common wrong answer: carrying the whole path in each queue entry, which multiplies memory by the path length and copies a list on every enqueue.

**"The grid is 10⁵ × 10⁵. What now?"** Model answer: 10¹⁰ cells cannot be materialised; if the walls are sparse, treat the grid as implicit and store only visited cells in a hash set, with the search bounded by how far the goal is; if the question is reachability with few obstacles, compress coordinates to the rows and columns that contain obstacles and traverse the compressed grid. Common wrong answer: "use a bitset", which still needs 10¹⁰ bits, about 1.2 GB.

**"Now you may knock down up to `k` walls."** Model answer: the state is `(r, c, k_left)`, visited is per state, and BFS over the expanded state space is `O(R·C·k)`; the same cell must be revisitable with more removals remaining. This changes the pattern from a grid BFS to a state-space BFS. Common wrong answer: a greedy that removes a wall whenever the direct route is blocked.

**"Cells become land over time and you must report the island count after each addition."** Model answer: union-find; each new land cell adds one component and each successful union with a land neighbour removes one, near-`O(1)` per addition against `O(R·C)` for a flood fill after each. This changes the pattern to [union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern). Common wrong answer: re-running Number of Islands after every addition.

**"Word Ladder with a 10⁶-word dictionary and a very long ladder."** Model answer: bidirectional BFS, always expanding the smaller frontier, which cuts explored states from about `b^d` to `2·b^(d/2)`; plus the wildcard-pattern index so neighbour generation does not depend on the alphabet. Common wrong answer: "use DFS to save memory", which finds a ladder but not the shortest one.

## What mid-level engineers get wrong

- **Marking visited on dequeue instead of enqueue.** Cells get enqueued multiple times; on a grid the queue can balloon and the level counts go wrong. Mark when you enqueue.
- **Forgetting the `>= 0` half of the bounds check.** Python's negative indexing makes `grid[-1]` silently wrap to the last row, so the bug produces wrong answers rather than crashes.
- **Recursion depth on large grids.** A recursive flood fill on a 10⁶-cell island overflows. Have the iterative version ready.
- **Counting the last empty BFS level.** In Rotting Oranges, guard the loop with `fresh > 0` or subtract one at the end.
- **Treating the undirected edge you arrived by as a cycle.** Skip the parent, or the incoming edge id when multi-edges are possible.
- **Word Ladder neighbour generation by comparing all pairs.** `O(N²·L)` versus `O(N·26·L)`; on a 5,000-word dictionary that is the difference between passing and timing out.
- **Using a list as the visited structure.** `if (r, c) in visited_list` is `O(n)`. Use a set, a boolean grid, or the input itself.
- **Using a per-cell visited set when the state has another dimension.** With `k` wall removals or a set of collected keys, visited must include that dimension, or the search rejects the states that lead to the answer.

## Exercise

```exercise
id: max-area-of-island
title: Largest island
prompt: |
  Given a grid of 0s (water) and 1s (land), return the area (number of
  cells) of the largest island. Cells connect horizontally and vertically,
  not diagonally. Return 0 if there is no land, including for an empty grid.

  Use one traversal per unvisited land cell. You may mark visited cells in
  the grid or keep a separate visited set.
languages: [python, javascript]
entry: max_area_island
starter:
  python: |
    def max_area_island(grid):
        # your code here
        return 0
  javascript: |
    function max_area_island(grid) {
      // your code here
      return 0;
    }
tests:
  - args: [[[0, 1, 0, 0], [1, 1, 0, 1], [0, 0, 0, 1], [1, 0, 1, 1]]]
    expected: 4
  - args: [[[0, 0], [0, 0]]]
    expected: 0
    label: all water
  - args: [[]]
    expected: 0
    label: empty grid
  - args: [[[1]]]
    expected: 1
    label: single land cell
  - args: [[[1, 1, 1], [1, 1, 1]]]
    expected: 6
    label: everything is one island
  - args: [[[1, 0, 1], [0, 1, 0], [1, 0, 1]]]
    expected: 1
    hidden: true
    label: diagonals do not connect
  - args: [[[1, 1, 0, 0, 0], [1, 1, 0, 0, 0], [0, 0, 0, 1, 1], [0, 0, 0, 1, 1]]]
    expected: 4
    hidden: true
hints:
  - "Scan every cell; when you find an unvisited 1, run a BFS or DFS from it that counts the cells it reaches, and keep the maximum."
  - "Mark a cell visited the moment you push or enqueue it, or set grid[r][c] = 0, so no cell is counted twice."
  - "Check 0 <= r < rows and 0 <= c < cols before touching grid[r][c]; negative indices wrap around in Python."
```

## Senior signals

- You **name the graph** before writing code: "nodes are cells with value 1, edges are orthogonal adjacency", or "nodes are words, edges are one-letter edits". That sentence is what turns a puzzle into a template.
- You choose **BFS for distance and either for reachability**, and you say why: BFS levels are distances only when every edge costs the same.
- You **mark visited on enqueue** and can explain the duplicate-enqueue blow-up that marking on dequeue causes.
- You reach for **multi-source BFS** for "nearest X for every cell" problems and quantify the saving over one BFS per cell.
- You spot the **reverse-from-the-boundary** move (oceans, surrounded regions) and explain that reachability is symmetric when you flip the edge direction.
- You offer the **iterative traversal** before the interviewer mentions recursion depth, and you quantify: a million-cell island is a million frames.
- You know when **union-find replaces traversal** (dynamic edges, many connectivity queries) and when it does not (you need distances or the actual path).
- You can say what the **visited structure costs**: on a 1000 × 1000 grid, about 121 MB for a set of tuples against 8 MB for a boolean grid and 1 MB for a bytearray, and you encode cells as single integers when memory is tight.
- You recognise the follow-ups that **add a dimension to the state** (wall removals, collected keys) and put it in the visited key.

## Check yourself

```quiz
- q: >-
    In a grid BFS a candidate marks cells visited when they are dequeued rather than when they are enqueued. What is the consequence?
  options: ["None; the visit order and the cost stay exactly the same", "Cells get enqueued several times, so time and memory balloon", "The BFS never terminates, since cells keep being re-added", "Distances come out wrong, since cells land in the wrong level"]
  answer: 1
  explanation: >-
    Marking late allows a cell to be enqueued by each of its up-to-four neighbours before it is processed. The first dequeue still assigns the correct distance, so distances are fine, but every duplicate is processed and fans out to its neighbours again. The traversal still ends because processed cells are eventually marked. Mark on enqueue so each cell enters the queue once.
- q: >-
    Rotting Oranges on the grid [[2, 1, 1], [1, 1, 0], [0, 1, 1]]. The level-by-level BFS runs while the queue is non-empty and increments minutes after each level. Without a fresh-orange guard it returns:
  options: ["3, because the first level is never counted", "5, because the final empty level still counts", "4, which is the correct number of minutes", "-1, because one fresh orange is never reached"]
  answer: 1
  explanation: >-
    The last cell (2,2) rots at minute 4 and is then dequeued in a fifth level that rots nothing new but still increments the counter. Guarding the loop with fresh > 0, or subtracting one at the end, gives 4. Every fresh orange is reachable here, so -1 is not in play.
- q: >-
    Pacific Atlantic Water Flow is solved by traversing from the ocean edges inward to strictly-or-equal higher cells rather than from every cell outward. Why is that valid, and what does it save?
  options: ["Reversing edges keeps reachability; two searches replace R·C", "It saves memory, but the time stays O((R·C)²) as before", "It is an approximation that happens to be right on most grids", "It is valid only when every height in the grid is distinct"]
  answer: 0
  explanation: >-
    Flow from cell A to an ocean exists exactly when a climb from that ocean reaches A: reversing every edge preserves reachability between the same endpoints. Two traversals seeded with entire edges replace one traversal per cell, O(RC) instead of O((RC)^2), and each cell is visited at most once per ocean. Equal heights are handled by allowing equal-or-higher climbs.
- q: >-
    A 2000 x 2000 grid is a single snake-shaped island. Which Number of Islands implementation is safe, and why?
  options: ["Either one, since the whole grid fits in memory anyway", "Recursive DFS, since the runtime optimises the tail calls", "Iterative DFS or BFS, since recursion could need 4M frames", "Neither; only union-find can handle a grid of that size"]
  answer: 2
  explanation: >-
    Recursion depth equals the length of the path the DFS follows, which can be the whole island: up to four million frames. An explicit stack or queue holds the same cells on the heap without the call-stack limit. Union-find also works but is more code for no benefit here.
- q: >-
    In Word Ladder the candidate finds neighbours by comparing the current word against every dictionary word and counting differing letters. For N words of length L, what is the per-word cost, and what is the better approach?
  options: ["O(L) per word, which is already optimal for this step", "O(N·L); generate 26·L edits and look each up in a set", "O(N²) per word; sort the dictionary and binary search", "O(26^L) per word; switch to DFS to prune the search"]
  answer: 1
  explanation: >-
    Scanning the dictionary per dequeued word costs O(N * L) each and O(N^2 * L) overall. Generating the 26 * L one-letter edits and checking hash-set membership costs O(26 * L) per word, which makes the neighbour step independent of N.
- q: >-
    Checking whether an undirected edge list forms a valid tree, a candidate runs DFS and reports a cycle whenever a neighbour is already visited. On the edge list [[0,1]] with n = 2, the result is:
  options: ["true, which is the correct answer for this tree", "false, because node 1 sees its parent 0 as visited", "true, but only because the edge list is sorted", "An infinite loop, since 0 and 1 keep revisiting"]
  answer: 1
  explanation: >-
    Every undirected edge is seen from both ends, so when the DFS at node 1 looks back at node 0 it finds a visited node. The traversal must skip the node it arrived from (or the edge id, when parallel edges are allowed). Additionally check that the edge count is n - 1 and every node was reached.
```

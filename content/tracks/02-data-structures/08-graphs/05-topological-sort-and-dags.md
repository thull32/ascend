---
slug: topological-sort-and-dags
title: "Topological sort and DAGs: ordering what depends on what"
description: Kahn's algorithm and the DFS finish-order algorithm, why both are O(V + E) and what each one gives you that the other does not, DAG properties that make dynamic programming over them trivial, and how build systems and package managers use all of it.
minutes: 40
difficulty: medium
tags: [graphs, topological-sort, dag, kahn, dependencies, build-systems]
problems: [course-schedule, course-schedule-ii, alien-dictionary, minimum-height-trees]
---
A build has 4,000 targets and each one lists what it needs first. A migration tool has 300 migrations with `depends_on` fields. A spreadsheet has cells that reference other cells. A course catalogue has prerequisites. In every case you need an order in which to process the items so that nothing is processed before the things it depends on, and you need to detect when no such order exists because the dependencies loop. That is topological sorting, and it only makes sense on a directed acyclic graph: a DAG.

## What a topological order is

For a directed graph, a topological order is a sequence of all vertices such that for every edge `u → v`, `u` appears before `v`. Draw the vertices on a line with all edges pointing right.

A graph has a topological order if and only if it has no directed cycle. One direction is obvious: a cycle `a → b → a` needs `a` before `b` and `b` before `a`. The other direction is what the algorithms below prove constructively: any DAG has at least one vertex with no incoming edges (otherwise, walking backwards along in-edges forever would revisit a vertex, which is a cycle), and removing it leaves a smaller DAG.

Topological orders are rarely unique. The DAG `0 → 2, 1 → 2` has orders `0 1 2` and `1 0 2`. Problems that need a *specific* order add a tiebreak rule ("smallest index first"), which is where the priority queue in Kahn's algorithm comes from. If a DAG has exactly one topological order, it contains a Hamiltonian path: consecutive vertices in the order are joined by edges; checking that is the "is the order unique?" follow-up.

## Kahn's algorithm

Repeatedly remove a vertex with in-degree zero, and decrement the in-degrees of its neighbours; any neighbour that reaches zero is now removable.

```python
from collections import deque

def kahn(n, adj):
    indeg = [0] * n
    for u in range(n):
        for v in adj[u]:
            indeg[v] += 1
    queue = deque(u for u in range(n) if indeg[u] == 0)
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    return order if len(order) == n else None      # None: a cycle exists
```

O(V + E): computing in-degrees scans every edge, and each vertex enters the queue once and each edge is decremented once. The cycle check is the last line: if a cycle exists, no vertex on it ever reaches in-degree zero, so the order comes up short. The vertices that are missing are exactly those on or downstream of a cycle, which is useful diagnostic output ("these 12 targets cannot be built").

Trace on edges `5 → 2, 5 → 0, 4 → 0, 4 → 1, 2 → 3, 3 → 1`. In-degrees: 0:2, 1:2, 2:1, 3:1, 4:0, 5:0. Queue starts with 4, 5 (FIFO). Pop 4: 0 → 1, 1 → 1. Pop 5: 2 → 0 (enqueue), 0 → 0 (enqueue). Pop 2: 3 → 0 (enqueue). Pop 0. Pop 3: 1 → 0 (enqueue). Pop 1. Order: 4 5 2 0 3 1. With a min-heap instead of a queue the order becomes 4 5 0 2 3 1: after 5, both 0 and 2 are available and 0 is smaller.

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true,
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}],
 "edges": [{"from": "5", "to": "2"}, {"from": "5", "to": "0"}, {"from": "4", "to": "0"}, {"from": "4", "to": "1"}, {"from": "2", "to": "3"}, {"from": "3", "to": "1"}],
 "title": "Kahn's algorithm", "caption": "Vertices with in-degree zero are ready. Removing one may make its successors ready. If the queue empties before every vertex is emitted, there is a cycle."}
```

Kahn's algorithm is what real schedulers run, because it maps onto parallel execution directly: everything in the queue at the same time is independent and can run concurrently. A build system does exactly this, with the queue replaced by a worker pool: pop ready targets, run them, and on completion decrement dependants' counts. The "level" structure (all vertices with in-degree zero, then all vertices whose dependencies were in the previous level, and so on) is the critical-path view of the build.

### Kahn's with levels: the parallel schedule

Group the output by *when* each vertex became ready and you get the schedule for unlimited workers: level 0 is everything with no dependencies, level 1 is everything whose dependencies are all in level 0, and so on. The number of levels is the length of the longest chain plus one, which is the minimum number of sequential rounds no matter how many workers you have.

```python
def kahn_levels(n, adj):
    indeg = [0] * n
    for u in range(n):
        for v in adj[u]:
            indeg[v] += 1
    level = [u for u in range(n) if indeg[u] == 0]
    levels = []
    while level:
        levels.append(level)
        nxt = []
        for u in level:
            for v in adj[u]:
                indeg[v] -= 1
                if indeg[v] == 0:
                    nxt.append(v)
        level = nxt
    return levels                         # sum of lengths < n means a cycle
```

For the six-vertex example: level 0 is `[4, 5]`, level 1 is `[0, 2]`, level 2 is `[3]`, level 3 is `[1]`. Four rounds; with two workers the whole build takes four steps and a single worker takes six. "Parallel courses" and "minimum semesters" problems are this function returning `len(levels)`, and a build system's `-j` flag is this loop with a bounded pool draining each level.

## The DFS algorithm

The [DFS lesson](/learn/data-structures/graphs/depth-first-search) noted that a vertex finishes only after everything reachable from it has finished. So *reverse finish order* is a topological order: run DFS from every unvisited vertex, push each vertex onto a list when it finishes, and reverse the list.

```python
def topo_dfs(n, adj):
    WHITE, GREY, BLACK = 0, 1, 2
    colour = [WHITE] * n
    out = []
    def dfs(u):
        colour[u] = GREY
        for v in adj[u]:
            if colour[v] == GREY:
                raise ValueError("cycle")
            if colour[v] == WHITE:
                dfs(v)
        colour[u] = BLACK
        out.append(u)
    for s in range(n):
        if colour[s] == WHITE:
            dfs(s)
    return out[::-1]
```

Also O(V + E). The three colours give cycle detection at the same time, and the grey vertex tells you *where* the cycle is.

```viz
{"type": "graph", "algorithm": "topo-sort-dfs", "directed": true,
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}],
 "edges": [{"from": "5", "to": "2"}, {"from": "5", "to": "0"}, {"from": "4", "to": "0"}, {"from": "4", "to": "1"}, {"from": "2", "to": "3"}, {"from": "3", "to": "1"}],
 "title": "Topological order from DFS finish times", "caption": "Each vertex is appended when its DFS subtree completes. Reading the finish list backwards puts every vertex before its descendants."}
```

### Which one

| | Kahn's | DFS finish order |
|---|---|---|
| Cycle detection | Count check at the end; identifies the stuck vertices | Grey vertex; identifies the cycle path |
| Tiebreak control (lexicographic, priority) | Natural: swap the queue for a heap | Awkward |
| Parallel scheduling | Natural: the queue is the ready set | No |
| Recursion depth | None (iterative) | Depth of the longest chain; needs an explicit stack in production |
| Extra memory | In-degree array | Colour array plus stack |
| Typical use | Build systems, schedulers, `course-schedule-ii` | Compilers (ordering declarations), SCC algorithms, quick interview code |

In an interview, write Kahn's unless you specifically want the DFS finish order for something else. It is iterative, it produces the order and the cycle check in one loop, and adding "smallest vertex first" is one line.

## DAG properties you get to exploit

A DAG is the structure in which **dynamic programming over a graph** is easy. Process vertices in topological order and every vertex's dependencies have already been computed when you reach it: no memoisation table lookups, no cycle worries, no recursion.

**Longest path.** NP-hard on general graphs; on a DAG it is one pass. `longest[v] = max over edges u → v of longest[u] + 1` (or `+ weight`) in topological order. That is the **critical path** of a project plan or a build: the chain of dependent steps that bounds how fast the whole thing can finish no matter how many workers you have.

```python
def longest_path(n, adj, order):
    longest = [0] * n
    for u in order:
        for v in adj[u]:
            longest[v] = max(longest[v], longest[u] + 1)
    return max(longest, default=0)
```

**Counting paths** from a source: `paths[v] = Σ paths[u]` over in-edges, in topological order. **Shortest path with negative weights** on a DAG: relax edges in topological order, one pass, no Bellman-Ford needed. **Reachability sets**, **earliest and latest start times** (PERT), **level assignment for layered drawing**: all of them are "for `u` in topological order, update the successors".

The general principle: a recurrence whose dependency graph is a DAG can be evaluated bottom-up in topological order; that is what "bottom-up DP" *means*, and the [DP module](/learn/algorithms/dynamic-programming/the-dp-mindset) is largely about recognising the DAG hidden in a problem statement.

## Where it runs

- **Build systems.** Make, Bazel, Gradle, Cargo, npm: the target graph is a DAG, the scheduler is Kahn's with a worker pool, and a cycle is a hard error at graph-construction time. Bazel additionally hashes each target's inputs in topological order so that caching is exact.
- **Package managers.** Dependency resolution first (which versions), then topological install order. `pip`, `apt` and `cargo` all print a topological order when they install.
- **Database migrations, Terraform, Kubernetes operators.** Resources declare dependencies; the tool computes a DAG, applies in topological order, and destroys in *reverse* topological order.
- **Compilers.** Ordering type declarations, evaluating constant expressions, scheduling instructions within a basic block, and deciding module initialisation order. Circular imports are a topological sort failure surfaced as a language error.
- **Spreadsheets.** Cell formulas form a dependency DAG; recalculation is a topological pass over the cells affected by an edit. A circular reference is the cycle-detection error every spreadsheet user has seen.
- **Data pipelines.** Airflow, Dagster and Prefect are named after the concept: a workflow *is* a DAG of tasks, executed by Kahn's with a scheduler.

## Interview variants

- `course-schedule`: is a topological order possible (no cycle)? Kahn's, check the count.
- `course-schedule-ii`: return one order. Kahn's, return the list.
- `alien-dictionary`: derive the edges first (the first differing character between adjacent words gives one `a → b` edge), then Kahn's with a deterministic tiebreak; watch for the invalid case where a longer word precedes its own prefix.
- `minimum-height-trees`: a Kahn's-like peeling of leaves (degree-1 vertices) from an undirected tree; the last one or two vertices remaining are the centres.
- "Is the topological order unique?": during Kahn's, if the queue ever holds two or more vertices, it is not.
- "Sequence reconstruction", "parallel courses", "build order with k workers": Kahn's with levels.

## Exercises

```exercise
id: topo-order-kahn
title: Topological order with a deterministic tiebreak
prompt: |
  `topo_order(n, edges)`: vertices `0..n-1`, `edges` is a list of directed
  `[u, v]` pairs meaning `u` must come before `v`. Return a topological
  order as a list. When several vertices are available at the same time,
  emit the **smallest index first** (use a min-heap or a sorted structure
  instead of a plain queue). If the graph has a cycle return `[]`.
languages: [python, javascript]
entry: topo_order
starter:
  python: |
    import heapq

    def topo_order(n, edges):
        order = []
        return order
  javascript: |
    function topo_order(n, edges) {
      // With small n, a sorted array or a linear scan for the smallest ready vertex is acceptable.
      const order = [];
      return order;
    }
tests:
  - args: [4, [[0, 1], [0, 2], [1, 3], [2, 3]]]
    expected: [0, 1, 2, 3]
  - args: [3, [[2, 1], [1, 0]]]
    expected: [2, 1, 0]
    label: order forced by the edges
  - args: [3, [[0, 1], [1, 2], [2, 0]]]
    expected: []
    label: cycle
  - args: [3, []]
    expected: [0, 1, 2]
    label: no edges, smallest first
  - args: [6, [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]]]
    expected: [4, 5, 0, 2, 3, 1]
    hidden: true
  - args: [4, [[0, 1], [1, 2], [2, 1], [2, 3]]]
    expected: []
    hidden: true
    label: cycle not involving every vertex
hints:
  - "Compute in-degrees, push every zero-in-degree vertex onto a min-heap, pop the smallest, append it, decrement its successors, push any that reach zero."
  - "A cycle is detected when the result has fewer than n vertices."
```

```exercise
id: longest-path-dag
title: Longest path in a DAG
prompt: |
  `longest_path_dag(n, edges)`: return the number of edges on the longest
  directed path in the graph (0 for a graph with no edges, including
  `n = 1`). If the graph contains a cycle return -1.

  Compute a topological order with Kahn's algorithm, then relax edges in
  that order: `best[v] = max(best[v], best[u] + 1)`.
languages: [python, javascript]
entry: longest_path_dag
starter:
  python: |
    def longest_path_dag(n, edges):
        return 0
  javascript: |
    function longest_path_dag(n, edges) {
      return 0;
    }
tests:
  - args: [4, [[0, 1], [0, 2], [1, 3], [2, 3]]]
    expected: 2
  - args: [3, []]
    expected: 0
    label: no edges
  - args: [1, []]
    expected: 0
  - args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]]]
    expected: 4
    label: a chain
  - args: [2, [[0, 1], [1, 0]]]
    expected: -1
    label: cycle
  - args: [6, [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]]]
    expected: 3
    hidden: true
  - args: [5, [[0, 1], [1, 2], [0, 2], [3, 4]]]
    expected: 2
    hidden: true
    label: two components
hints:
  - "Run Kahn's first; if it emits fewer than n vertices, return -1."
  - "Initialise best to 0 for all vertices; process the order and update successors; the answer is max(best)."
```

## Senior signals

- You say "topological order exists iff the graph is a DAG" and can give the one-line argument for why a DAG always has an in-degree-zero vertex.
- You write Kahn's by default, know the count check is the cycle test, and can name what the missing vertices mean.
- You know DFS finish order also works, what it gives you (the cycle path) and what it costs (recursion depth).
- You see Kahn's queue as the **ready set** of a parallel scheduler and can explain critical path as longest path in a DAG.
- You recognise DP over a DAG as "process in topological order" and use it for longest path, path counting and DAG shortest paths.
- You can name three production systems that are a topological sort with a worker pool.

## Check yourself

```quiz
- q: >-
    Kahn's algorithm finishes with 47 of 50 vertices in the output. What do you know about the other 3?
  options: ["They sit in a separate component, which Kahn's never starts a search from", "They are isolated vertices, so they never entered the in-degree count", "They have the highest in-degrees, so the queue ran dry before reaching them", "Each is on a cycle or downstream of one, so it never reached in-degree zero"]
  answer: 3
  explanation: >-
    A vertex is emitted once all its predecessors are emitted. A vertex on a cycle waits on itself; anything downstream of the cycle waits on it. Reporting those vertices is how build tools name the circular dependency. Isolated vertices and other components are no problem: every in-degree-zero vertex is seeded into the queue at the start.
- q: >-
    A DAG has topological orders [0, 1, 2, 3] and [1, 0, 2, 3]. What does this imply?
  options: ["Neither 0 nor 1 reaches the other, so they could be processed in parallel", "The graph has a cycle through 0 and 1, so no single order is forced", "The graph has only two edges, so most pairs of vertices are left unordered", "Kahn's algorithm is non-deterministic, so it can emit either order"]
  answer: 0
  explanation: >-
    Two valid orders that differ only by swapping adjacent vertices mean neither depends on the other. A unique topological order requires a Hamiltonian path. A cycle would make no order valid at all, and the orders say nothing about the edge count: 0 → 2, 1 → 2, 2 → 3 fits, and so do other edge sets.
- q: >-
    Why is longest path easy on a DAG but NP-hard in general?
  options: ["DAGs have at most V - 1 edges, so the number of paths to search stays linear", "In topological order each predecessor's value is final before it is used", "DAG edges are unweighted, so longest path reduces to a BFS depth", "General graphs have no topological order, so they have no longest path"]
  answer: 1
  explanation: >-
    The DP recurrence longest[v] = max(longest[u] + w) is well-founded only when dependencies are acyclic: processing in topological order means one pass of relaxation suffices. With cycles, the simple-path constraint makes the problem combinatorial. General graphs still have longest simple paths; they are just hard to find. DAGs can have O(V²) edges and weighted edges.
- q: >-
    Terraform applies resources in topological order and destroys them in reverse topological order. Why reverse for destruction?
  options: ["Reverse order avoids the cycles that forward deletion would create", "Reverse order is faster, as leaf resources hold fewer dependencies", "Each resource must go before the resources it depends on are removed", "Order does not matter for deletion; reversing is only a convention"]
  answer: 2
  explanation: >-
    If A depends on B (edge B → A in creation order), A must be created after B and destroyed before B, otherwise the dependency is deleted while still in use. Reversing a topological order reverses every edge constraint consistently; it cannot introduce cycles, because the graph is the same DAG with its edges flipped.
- q: >-
    In alien-dictionary the input contains the adjacent words "abc" and "ab" in that order. Before running a topological sort you should:
  options: ["Ignore the pair, since words of different lengths give no ordering at all", "Report it as invalid, since no order puts a word before its own prefix", "Add an edge c → b, taken from the last letters of the two words", "Add edges from each letter of abc to each letter of ab, then sort"]
  answer: 1
  explanation: >-
    Adjacent words yield an edge only from their first differing character. When the second word is a proper prefix of the first there is no differing character and the ordering is impossible in any alphabet; the correct output is that no valid alphabet exists. Ignoring the pair would return an alphabet for input that no dictionary could produce.
```

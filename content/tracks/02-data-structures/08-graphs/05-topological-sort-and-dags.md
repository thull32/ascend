---
slug: topological-sort-and-dags
title: "Topological sort and DAGs: ordering what depends on what"
description: Kahn's algorithm and the DFS finish-order algorithm, why both are O(V + E) and what each one gives you that the other does not, DAG properties that make dynamic programming over them trivial, and how build systems and package managers use all of it.
minutes: 50
difficulty: medium
tags: [graphs, topological-sort, dag, kahn, dependencies, build-systems]
problems: [course-schedule, course-schedule-ii, alien-dictionary, minimum-height-trees]
---
A build has 4,000 targets and each one lists what it needs first. A migration tool has 300 migrations with `depends_on` fields. A spreadsheet has cells that reference other cells. A course catalogue has prerequisites. In every case you need an order in which to process the items so that nothing is processed before the things it depends on, and you need to detect when no such order exists because the dependencies loop. That is topological sorting, and it only makes sense on a directed acyclic graph: a DAG. The two algorithms are short; what separates a senior answer is knowing that they produce *different* valid orders, that one of them names the cycle and the other names the victims, that the queue in Kahn's algorithm is a parallel scheduler's ready set, and that a package manager's version resolver is not a topological sort at all.

## What a topological order is

For a directed graph, a topological order is a sequence of all vertices such that for every edge `u → v`, `u` appears before `v`. Draw the vertices on a line with all edges pointing right.

A graph has a topological order if and only if it has no directed cycle. A cycle `a → b → a` needs `a` before `b` and `b` before `a`, so no order exists; the other direction is what the algorithms below prove constructively. Topological orders are rarely unique: the DAG `0 → 2, 1 → 2` has orders `0 1 2` and `1 0 2`. Problems that need a *specific* order add a tiebreak rule ("smallest index first"), which is where the priority queue in Kahn's algorithm comes from.

## The running example: an eight-target build

Every trace in this lesson uses the same DAG. Eight targets; the manifest lists what each depends on, and the edge points from dependency to dependant, because "dependency must come first" is the edge the algorithms need:

```text
proto: []             net:  [proto, util]     api:  [net, db]     test: [api, cli]
util:  []             db:   [util]            cli:  [db]          pkg:  [cli, test]

edges (dep -> dependant), adjacency lists in alphabetical order:
proto: [net]   util: [db, net]   net: [api]   db: [api, cli]
api: [test]    cli: [pkg, test]  test: [pkg]  pkg: []
```

In-degrees, from counting arrowheads: `api 2, cli 1, db 1, net 2, pkg 2, proto 0, test 2, util 0`.

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

O(V + E): computing in-degrees scans every edge, and each vertex enters the queue once and each edge is decremented once. The cycle check is the last line: if a cycle exists, no vertex on it ever reaches in-degree zero, so the order comes up short.

### Hand trace: queue after every step

Seeding scans the vertices alphabetically and finds `proto` and `util` at in-degree zero.

| Pop | Decrements (new in-degree) | Queue after | Order so far |
|---|---|---|---|
| – | – | `[proto, util]` | |
| proto | net → 1 | `[util]` | proto |
| util | db → 0 (push), net → 0 (push) | `[db, net]` | proto util |
| db | api → 1, cli → 0 (push) | `[net, cli]` | proto util db |
| net | api → 0 (push) | `[cli, api]` | proto util db net |
| cli | pkg → 1, test → 1 | `[api]` | … cli |
| api | test → 0 (push) | `[test]` | … api |
| test | pkg → 0 (push) | `[pkg]` | … test |
| pkg | – | `[]` | proto util db net cli api test pkg |

Eight pops, ten decrements (one per edge), and `len(order) == 8`, so the graph is a DAG. Check one constraint by eye: `api` needs `net` and `db`, and both precede it.

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true,
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}],
 "edges": [{"from": "5", "to": "2"}, {"from": "5", "to": "0"}, {"from": "4", "to": "0"}, {"from": "4", "to": "1"}, {"from": "2", "to": "3"}, {"from": "3", "to": "1"}],
 "title": "Kahn's algorithm", "caption": "Vertices with in-degree zero are ready. Removing one may make its successors ready. If the queue empties before every vertex is emitted, there is a cycle."}
```

### The same run with a min-heap

Replace the deque with a heap keyed by name and the ready *set* is consulted instead of the arrival order. After `util`, the ready set is `{db, net}` and `db` pops first as before; but after `db` it is `{cli, net}`, and the heap emits `cli` before `net`, where the FIFO queue emitted `net` first because it had been waiting longer. Heap order: `proto util db cli net api test pkg`. Both are valid; the heap version is the lexicographically smallest order, at O((V + E) log V) instead of O(V + E), and it is deterministic regardless of how the adjacency lists happen to be ordered, which matters for reproducible builds.

### Kahn's on a graph with a cycle

Add one edge, `test → db` (someone decides the database layer must pass its tests before it is built). `db` now has in-degree 2.

| Pop | Decrements | Queue after |
|---|---|---|
| – | – | `[proto, util]` |
| proto | net → 1 | `[util]` |
| util | db → 1, net → 0 (push) | `[net]` |
| net | api → 1 | `[]` |

The queue empties after three of eight vertices. The five stuck vertices, with their remaining in-degrees, are `api 1, cli 1, db 1, pkg 2, test 2`. Four of them lie on cycles (`db → api → test → db` and `db → cli → test → db`); `pkg` is on no cycle at all and is stuck only because it depends on `test`. Kahn's leftover set is therefore "everything that cannot be built", which is useful diagnostic output, and it is not the cycle, which the [three-colour DFS](/learn/data-structures/graphs/connectivity-and-cycles) reports by walking the parent chain from the grey vertex.

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

For the build: `[proto, util]`, `[db, net]`, `[cli, api]`, `[test]`, `[pkg]`. Five rounds; the longest chain, `proto → net → api → test → pkg`, has four edges. With two workers the whole build takes five rounds and a single worker takes eight. "Parallel courses" and "minimum semesters" problems are this function returning `len(levels)`, and a build system's `-j` flag is this loop with a bounded pool draining each level.

## The DFS algorithm

The [DFS lesson](/learn/data-structures/graphs/depth-first-search) showed that a vertex finishes only after everything reachable from it has finished. So *reverse finish order* is a topological order: run DFS from every unvisited vertex, append each vertex when it finishes, and reverse the list.

```python
def topo_dfs(n, adj):
    WHITE, GREY, BLACK = 0, 1, 2
    colour = [WHITE] * n
    out = []
    def dfs(u):
        colour[u] = GREY
        for v in adj[u]:
            if colour[v] == GREY:
                raise ValueError("cycle")     # back edge: v is on the current path
            if colour[v] == WHITE:
                dfs(v)
        colour[u] = BLACK
        out.append(u)                         # finished: all successors already appended
    for s in range(n):
        if colour[s] == WHITE:
            dfs(s)
    return out[::-1]
```

Also O(V + E). The three colours give cycle detection at the same time, and the grey vertex tells you *where* the cycle is.

### Hand trace: finish times on the same DAG

The outer loop visits vertices alphabetically, so the first DFS starts at `api`, which is nowhere near a source. `d` is discovery time, `f` finish time.

| t | Event | Note |
|---|---|---|
| 1 | discover api | outer loop start |
| 2 | discover test | api → test |
| 3 | discover pkg | test → pkg |
| 4 | finish pkg | no out-edges; append |
| 5 | finish test | append |
| 6 | finish api | append |
| 7, 8 | discover, finish cli | cli → pkg and cli → test are black: skip |
| 9, 10 | discover, finish db | db → api, db → cli black |
| 11, 12 | discover, finish net | net → api black |
| 13, 14 | discover, finish proto | proto → net black |
| 15, 16 | discover, finish util | util → db, util → net black |

Finish order `pkg test api cli db net proto util`; reversed: `util proto net db cli api test pkg`. Every edge still points right (`util` before `db` and `net`, `net` before `api`, `cli` before `pkg`), and the order differs from both Kahn's orders: three algorithms, three valid answers, and 14 valid orders in total for this DAG (counted by a bitmask DP over subsets while writing this lesson). The DFS never had to find a source first; the reversal does that work. It works because of the white-path argument: when `api` was discovered, every vertex reachable from it was white and therefore finishes before `api` does, so nothing that depends on `api` can be appended before it.

```viz
{"type": "graph", "algorithm": "topo-sort-dfs", "directed": true,
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}],
 "edges": [{"from": "5", "to": "2"}, {"from": "5", "to": "0"}, {"from": "4", "to": "0"}, {"from": "4", "to": "1"}, {"from": "2", "to": "3"}, {"from": "3", "to": "1"}],
 "title": "Topological order from DFS finish times", "caption": "Each vertex is appended when its DFS subtree completes. Reading the finish list backwards puts every vertex before its descendants."}
```

In an interview, write Kahn's unless you specifically want the DFS finish order for something else. It is iterative, it produces the order and the cycle check in one loop, and adding "smallest vertex first" is one line.

## DAG properties, each with its proof

**A DAG has a source and a sink.** Start anywhere and walk backwards along in-edges; in a finite graph the walk either stops at a vertex with no in-edges or repeats a vertex, and a repeat is a cycle. The forward walk gives the sink. This is also why Kahn's never starts with an empty queue on a DAG.

**The order is unique iff consecutive vertices are adjacent (a Hamiltonian path).** If every consecutive pair `(vᵢ, vᵢ₊₁)` in some order is an edge, every valid order must keep each pair in that relative position, so the order is forced. If some consecutive pair is not joined by an edge, swapping the two violates no constraint (the only constraint a swap of neighbours could break is one between them), so a second valid order exists. Operationally: during Kahn's, the queue holding two or more vertices at any moment means the order is not unique.

**Longest path is O(V + E) on a DAG.** NP-hard on general graphs; on a DAG, process vertices in topological order and `longest[v] = max over edges u → v of longest[u] + weight`, because every predecessor's value is final before `v` is reached. With durations this is the **critical path** of a build or a project plan: the chain of dependent steps that bounds wall-clock time no matter how many workers you have.

### Hand trace: critical path with durations

Durations in minutes: `proto 2, util 1, net 3, db 3, api 2, cli 1, test 5, pkg 1`. Earliest finish `EF[v] = dur[v] + max EF over predecessors`, processed in the Kahn order:

| Target | Duration | Predecessors (EF) | EF | Critical predecessor |
|---|---|---|---|---|
| proto | 2 | – | 2 | – |
| util | 1 | – | 1 | – |
| net | 3 | proto 2, util 1 | 5 | proto |
| db | 3 | util 1 | 4 | util |
| api | 2 | net 5, db 4 | 7 | net |
| cli | 1 | db 4 | 5 | db |
| test | 5 | api 7, cli 5 | 12 | api |
| pkg | 1 | cli 5, test 12 | 13 | test |

The build finishes at minute 13 with unlimited workers; the sum of all durations is 18, so parallelism can save at most 5 minutes. Walking critical predecessors back from `pkg` gives `proto → net → api → test → pkg`, and speeding up `db` or `cli` changes nothing. A build system that reports "critical path: 13 min" is running this table.

```python
def critical_path(order, preds, dur):
    ef, via = {}, {}
    for v in order:                                   # topological order: preds are final
        best, bp = 0, None
        for p in preds[v]:
            if ef[p] > best:
                best, bp = ef[p], p
        ef[v], via[v] = dur[v] + best, bp
    end = max(ef, key=ef.get)
    path, x = [], end
    while x is not None:
        path.append(x); x = via[x]
    return ef[end], path[::-1]
```

**Counting paths** from the sources: `paths[v] = Σ paths[u]` over in-edges, sources start at 1, same single pass. On the build: `proto 1, util 1, net 2, db 1, api 3, cli 1, test 4, pkg 5`; there are five distinct dependency chains ending at `pkg`. **Shortest paths with negative weights** on a DAG: relax edges in topological order, one pass, no Bellman-Ford. **Lexicographically smallest order**: Kahn's with a min-heap, O((V + E) log V). The general principle: a recurrence whose dependency graph is a DAG can be evaluated bottom-up in topological order; that is what "bottom-up DP" *means*, and the [DP module](/learn/algorithms/dynamic-programming/the-dp-mindset) is largely about recognising the DAG hidden in a problem statement.

## Dependency resolution and build systems

### Make, Bazel and the reverse graph

`make` reads a DAG of rules and walks it depth-first from the goal, building prerequisites before their dependants, which is the DFS finish order; a target is rebuilt when it is missing or any prerequisite's modification time is newer than its own. A circular rule is not fatal to `make`: it prints `Circular a <- b dependency dropped` and continues without that edge, which is a topological sort that silently deletes a constraint. `make -j 8` runs up to eight ready targets at once, Kahn's with a bounded pool.

Bazel and Buck replace timestamps with content hashes. Every action (one compiler invocation) has a key that is the hash of its command line plus the digests of its inputs; a remote cache maps keys to outputs, so a clean checkout on a new machine downloads what a colleague already built. Incremental rebuilds use the **reverse** graph: when one file changes, the set of actions to rerun is everything reachable from it along reverse edges, and nothing else. Keep both adjacency directions; the reverse list is one O(E) pass to build. The graph work is not where the time goes: Kahn's over a synthetic DAG of 10^5 targets and 10^6 edges took 0.26 s in CPython 3.14 on a developer machine, while hashing 10^5 inputs of 4 KiB each with SHA-256 in the same process took 0.17 s, and real inputs are larger and must be read from disk first.

### Package managers are not topological sorts

`pip`, `cargo` and `npm` do two different things. **Version resolution** picks one version of each package such that every constraint (`requests>=2.28,<3`) is satisfied; that is constraint satisfaction, NP-hard in general, and since pip 20.3 (2020) pip's resolver is a backtracking search over candidate versions that can take minutes on conflicting constraints. Only after resolution is there a concrete DAG, and **install order** is then a topological sort of it. npm additionally flattens the resolved tree into `node_modules` by hoisting shared versions, allows cycles between packages (Node's loader tolerates them at run time), and treats peer-dependency conflicts as warnings; cargo forbids cycles among regular dependencies outright.

### Pipelines, infrastructure and migrations

Airflow's unit of work is literally a `DAG` object; a cycle is rejected when the file is parsed, and the scheduler runs a task once every upstream task has succeeded, Kahn's with a worker pool and a database as the queue. Terraform builds a resource graph, applies it with a default parallelism of 10 concurrent operations, and destroys in reverse topological order so that nothing is deleted while something still references it. Django's migration graph and Alembic's revision graph are DAGs whose sinks are "heads"; two branches that both add a migration produce two heads, and the merge migration is a new sink depending on both. Spreadsheets recalculate cells in topological order of their references, and a circular reference is the cycle error every user has seen.

## Under the hood: `graphlib.TopologicalSorter`

Python 3.9 added `graphlib.TopologicalSorter`, and its API is Kahn's algorithm exposed as a state machine so that a caller can run the ready set in parallel:

```python
from graphlib import TopologicalSorter, CycleError

deps = {"proto": set(), "util": set(), "net": {"proto", "util"}, "db": {"util"},
        "api": {"net", "db"}, "cli": {"db"}, "test": {"api", "cli"}, "pkg": {"cli", "test"}}
ts = TopologicalSorter(deps)          # node -> set of predecessors
ts.prepare()                          # checks for cycles; raises CycleError
while ts.is_active():
    ready = ts.get_ready()            # every node whose predecessors are all done
    for node in ready:                # hand these to a thread pool in real code
        build(node)
        ts.done(node)                 # decrements successors; may make new nodes ready
```

Internally each node carries an `npredecessors` count and a `successors` list; `prepare()` collects the zero-count nodes as the ready list and then runs an iterative DFS to find a cycle, raising `CycleError` whose second argument is the cycle as a list. On the build with `test → db` added it raises `CycleError('nodes are in a cycle', ['api', 'test', 'db', 'api'])`, the loop itself, not the leftover set. `get_ready()` returns the whole current level as a tuple, and `done()` decrements successors' counts and queues any that reach zero, which is why a caller can keep several nodes in flight; `static_order()` is the sequential convenience. On the running example `get_ready()` returned exactly the five levels from `kahn_levels`. Java's JDK has no topological sort (JGraphT's `TopologicalOrderIterator` and Guava's graph package fill the gap); Go's `go build` computes the package import graph itself and compiles packages in dependency order with up to `GOMAXPROCS` in flight.

## Trade-offs

| | Kahn's (FIFO) | DFS finish order | Kahn's with heap | `graphlib` |
|---|---|---|---|---|
| Detects cycles | Count check at the end | Grey vertex, immediately | Count check | `prepare()` |
| Reports the cycle | No: the stuck set | Yes: path from the grey vertex | No | Yes, in `CycleError` |
| Order determinism | Depends on adjacency order | Depends on adjacency and start order | Lexicographic, always | Insertion order of `add()` |
| Parallel-ready | Yes: the queue is a level | No | Yes | Yes: `get_ready()` / `done()` |
| Memory | In-degree array plus queue | Colour array plus stack | In-degree array plus heap | Node objects with counts and lists |
| Recursion | None | Depth of the longest chain unless made iterative | None | None (iterative DFS inside) |
| Time | O(V + E) | O(V + E) | O((V + E) log V) | O(V + E) |

## Failure modes

### The order is silently short

Symptom: a deploy tool applies 47 of 50 migrations and reports success; the three it skipped were on a cycle. Diagnosis: the `len(order) == n` check was dropped or its result ignored. Fix: treat a short order as a hard error and print the stuck set; use the three-colour DFS to print the cycle.

### A flaky build that passes on retry

Symptom: two runs of the same build produce different outputs, or a test fails only on some machines. Diagnosis: ties in the ready set are broken by hash-table iteration order (Python's `str` hashing is randomised per process unless `PYTHONHASHSEED` is set), so independent targets run in different orders and a hidden shared-state dependency shows up intermittently. Fix: a deterministic tiebreak (sort the ready set, or a heap), and then find the hidden dependency.

### Version constraints fed to a topological sort

Symptom: an installer picks versions that satisfy each package's direct constraints but not the transitive ones, or loops forever when two packages require different versions of a third. Diagnosis: the DAG was built from one arbitrary version per package before constraints were solved. Fix: resolve versions first (a backtracking search), then sort the resolved graph.

### Recursion depth in the DFS variant

Symptom: `RecursionError` on a 3,000-step migration chain or a deeply nested module graph. Diagnosis: the recursive `topo_dfs` at CPython's default limit of 1,000 frames. Fix: Kahn's, or the stack-of-iterators DFS.

### Rebuilding everything on every change

Symptom: a one-line change triggers a 40-minute build. Diagnosis: the build recomputes the whole graph instead of the reverse-reachable set from the changed inputs, or the action keys include a volatile input (a timestamp, an absolute path) so nothing ever hits the cache. Fix: reverse adjacency for invalidation; content-hash keys with hermetic inputs.

## Interview variants

- `course-schedule`: is an order possible? Kahn's, check the count. `course-schedule-ii`: return one order. Kahn's, return the list.
- `alien-dictionary`: derive the edges first, then Kahn's with a deterministic tiebreak; watch for a word followed by its own prefix.
- `minimum-height-trees`: a Kahn's-like peeling of degree-1 vertices from an undirected tree, level by level; the last one or two vertices are the centres.
- "Is the order unique?": during Kahn's, a queue ever holding two or more vertices means no.
- "Sequence reconstruction", "parallel courses", "build order with k workers": Kahn's with levels.

## Interviewer follow-ups

**"Course schedule, but print the cycle when there is one."** Model answer: three-colour DFS with a parent array; on the first back edge `u → v`, walk parents from `u` to `v` and report the path plus `v`. O(V + E). Common wrong answer: Kahn's, then printing the vertices with non-zero in-degree, which includes courses that merely depend on the cycle (`pkg` in the trace).

**"How many valid orders does this DAG have?"** Model answer: counting linear extensions is #P-complete in general, so for small `n` use DP over subsets, `ways[S] = Σ ways[S \ {v}]` for each `v` in `S` whose predecessors are all in `S \ {v}`, O(2ⁿ · n); the eight-target build has 14. For a tree-shaped DAG there is a closed form: `n` factorial divided by the product of the subtree sizes. Common wrong answer: multiplying the ready-set sizes seen during one Kahn's run, which counts only orders that share that run's level structure.

**"Alien dictionary."** Model answer: derive one edge per adjacent word pair from the first differing character; reject a word followed by its own proper prefix (no order can exist); Kahn's with a min-heap for a deterministic answer; return an empty result if fewer than the number of distinct letters are emitted. Common wrong answer: adding edges between every pair of letters in the two words, which manufactures constraints the dictionary never stated.

**"Minimum number of semesters when every course takes one semester and prerequisites must be complete first."** Model answer: the number of Kahn levels, equal to the longest path in edges plus one, five for the build DAG; with durations it becomes the critical-path DP. Common wrong answer: `n` divided by the number of courses allowed per semester, which ignores the chain constraint entirely.

## What mid-level engineers get wrong

- Returning the order without checking its length, so a cyclic input produces a plausible partial order.
- Building "depends on" edges (`api → net`) and then sorting, which yields the reverse of the install order.
- Answering "which cycle?" with Kahn's leftover set.
- Using a set for the ready vertices and getting a different order on every run.
- Calling `pip`'s resolver "a topological sort", and then being surprised that dependency resolution can take minutes or fail.
- Recursing in the DFS variant on a dependency chain thousands deep.
- Rebuilding the whole graph when one input changes, instead of the reverse-reachable subgraph.
- Treating longest path as hard because "it is NP-hard", when the input is a DAG and it is one pass.

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

- You say "topological order exists iff the graph is a DAG" and give the backwards-walk argument for why a DAG always has a source.
- You write Kahn's by default, know the count check is the cycle test, and know that the leftover set is the victims, not the cycle.
- You know DFS finish order also works, what it gives you (the cycle path) and what it costs (recursion depth), and that the two algorithms return different valid orders.
- You see Kahn's queue as the **ready set** of a parallel scheduler, can name `graphlib`'s `get_ready()`/`done()` as that API, and explain critical path as longest path in a DAG with a traced example.
- You know the order is unique iff there is a Hamiltonian path, and that a set-based ready list makes a build nondeterministic.
- You separate version resolution (constraint satisfaction, backtracking) from install order (topological sort) when someone says "pip does a topological sort".
- You know incremental rebuilds are reverse reachability and that a build system's time goes into hashing inputs, not into the graph walk.

## Check yourself

```quiz
- q: >-
    Kahn's algorithm finishes with 47 of 50 vertices in the output. What do you know about the other 3?
  options: ["They sit in a separate component, which Kahn's never starts a search from", "Each is on a cycle or downstream of one, so it never reached in-degree zero", "They have the highest in-degrees, so the queue ran dry before reaching them", "They are isolated vertices, so they never entered the in-degree count"]
  answer: 1
  explanation: >-
    A vertex is emitted once all its predecessors are emitted. A vertex on a cycle waits on itself; anything downstream of the cycle waits on it. Reporting those vertices tells the user what cannot be built, but it is not the cycle itself. Isolated vertices and other components are no problem: every in-degree-zero vertex is seeded into the queue at the start.
- q: >-
    A DAG has topological orders [0, 1, 2, 3] and [1, 0, 2, 3]. What does this imply?
  options: ["Neither 0 nor 1 reaches the other, so they could be processed in parallel", "Kahn's algorithm is non-deterministic, so it can emit either order", "The graph has a cycle through 0 and 1, so no single order is forced", "The graph has only two edges, so most pairs of vertices are left unordered"]
  answer: 0
  explanation: >-
    Two valid orders that differ only by swapping adjacent vertices mean neither depends on the other. A unique topological order requires a Hamiltonian path. A cycle would make no order valid at all, and the orders say nothing about the edge count: 0 → 2, 1 → 2, 2 → 3 fits, and so do other edge sets.
- q: >-
    Why is longest path easy on a DAG but NP-hard in general?
  options: ["DAG edges are unweighted, so longest path reduces to a BFS depth", "DAGs have at most V - 1 edges, so the number of paths to search stays linear", "General graphs have no topological order, so they have no longest path", "In topological order each predecessor's value is final before it is used"]
  answer: 3
  explanation: >-
    The DP recurrence longest[v] = max(longest[u] + w) is well-founded only when dependencies are acyclic: processing in topological order means one pass of relaxation suffices. With cycles, the simple-path constraint makes the problem combinatorial. General graphs still have longest simple paths; they are hard to find. DAGs can have O(V²) edges and weighted edges.
- q: >-
    Terraform applies resources in topological order and destroys them in reverse topological order. Why reverse for destruction?
  options: ["Reverse order avoids the cycles that forward deletion would create", "Each resource must go before the resources it depends on are removed", "Order does not matter for deletion; reversing is only a convention", "Reverse order is faster, as leaf resources hold fewer dependencies"]
  answer: 1
  explanation: >-
    If A depends on B (edge B → A in creation order), A must be created after B and destroyed before B, otherwise the dependency is deleted while still in use. Reversing a topological order reverses every edge constraint consistently; it cannot introduce cycles, because the graph is the same DAG with its edges flipped.
- q: >-
    A build ran the same DAG twice and independent targets executed in different orders, exposing a hidden shared-file dependency on the second run. The most likely cause is:
  options: ["The DFS variant was used, and its finish order changes on every run", "The ready set is a hash set, so ties break differently per process", "The DAG contained a cycle that the count check failed to detect", "Kahn's algorithm is randomised by design to balance the worker pool"]
  answer: 1
  explanation: >-
    Kahn's algorithm is deterministic given a fixed adjacency order and a FIFO queue; nondeterminism enters when ready vertices are kept in a structure whose iteration order varies per process, such as a Python set of strings under hash randomisation. A cycle would make the order short, not reordered, and the DFS variant is equally deterministic for a fixed input order. A sorted ready set or a heap makes the order reproducible.
- q: >-
    A package manager is asked to install 200 packages with version ranges. Which step is a topological sort?
  options: ["Backtracking when a chosen version leads to a dead end", "Ordering the chosen versions so dependencies install first", "Checking that no two packages require conflicting versions", "Choosing one version per package that satisfies every range"]
  answer: 1
  explanation: >-
    Selecting versions under range constraints is constraint satisfaction, which pip solves by backtracking search and which can be slow or fail; conflict checking and backtracking are parts of that search. Only after one version per package is fixed does a concrete dependency DAG exist, and ordering that DAG so each package follows its dependencies is the topological sort.
```

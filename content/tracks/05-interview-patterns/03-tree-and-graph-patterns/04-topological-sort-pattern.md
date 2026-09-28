---
slug: topological-sort-pattern
title: "Topological sort: ordering by dependencies and detecting the cycle that breaks it"
description: Recognise "must come before" as a DAG problem, run Kahn's algorithm and three-colour DFS from memory, and see Course Schedule II, Alien Dictionary and Minimum Height Trees traced with the in-degree table and queue at every step.
minutes: 45
difficulty: medium
tags: [graph, topological-sort, kahn, dag, cycle-detection, in-degree, pattern:topological-sort]
problems: [course-schedule, course-schedule-ii, alien-dictionary, minimum-height-trees]
---
Some tasks must happen before others: course B needs course A, package X imports package Y, build step `link` needs `compile`. You are asked for an order that respects every constraint, or whether one exists at all, or how many rounds it takes if independent tasks run in parallel. Trying orderings is `n!`; a traversal that ignores edge direction finds components, not orders.

Topological sort is the linear-time answer, and it comes with a cycle detector: if the constraints contradict each other (A before B, B before A), no order exists, and Kahn's algorithm discovers that by running out of tasks to start before it has placed all of them. Interviewers like it because the graph is never handed to you. You build it from pairs, from adjacent words, from an implicit "this depends on that", and the building is where the mistakes hide. The mechanics of DAGs are taught in [Topological sort and DAGs](/learn/data-structures/graphs/topological-sort-and-dags); this lesson is about recognising the pattern and executing it under a clock.

## The signal

Reach for topological sort when the statement contains any of these:

- **"Prerequisites", "dependencies", "must be taken before", "must finish before"**: the pairs are directed edges, and the output is an order.
- **"Is it possible to finish all"**: cycle detection on a directed graph. Kahn's algorithm answers it by counting how many nodes it placed.
- **"Derive the order of letters / versions / events from partial observations"** ([Alien Dictionary](/practice/alien-dictionary)): each observation is one pairwise constraint; the answer is any topological order.
- **"Minimum number of rounds / semesters if independent tasks run in parallel"**: the number of levels in Kahn's algorithm, which equals the number of nodes on the longest path.
- **"Peel the leaves", "find the centre of a tree"** ([Minimum Height Trees](/practice/minimum-height-trees)): Kahn's shape on an undirected tree, removing degree-1 nodes layer by layer.
- **"Safe states", "eventually terminal"**: reverse the edges and run Kahn's from the terminals.

What rules it out:

- **Undirected edges and a connectivity question**: [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal) or [Union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern).
- **Weights and a cheapest route**: [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern). The exception is a weighted DAG, where one pass in topological order relaxes every edge, negative weights included.
- **A limit on how many tasks run per round** ("at most `k` courses per semester"): the level-by-level answer is no longer optimal, and the problem becomes a bitmask DP for small `n` (see the follow-ups).

| Axis | Kahn's (BFS on in-degrees) | Three-colour DFS | Kahn's with a min-heap |
|---|---|---|---|
| Output | an order, directly | reversed post-order | the lexicographically smallest order |
| Cycle signal | emitted count `< n` | an edge to a grey node | emitted count `< n` |
| Can name the cycle | no, only the stuck nodes | yes, the grey stack | no |
| Levels / parallel rounds | free, with the size trick | no | no |
| Recursion risk | none | depth = longest path, unless written iteratively | none |
| Time | `O(V + E)` | `O(V + E)` | `O((V + E) log V)` |

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Can all courses be finished" solved with an undirected visited set | Graph traversal | Directed cycle detection: Kahn's count or three colours | In a directed graph, reaching a visited node is not a cycle unless it is still on the stack |
| "Minimum semesters, at most `k` courses per semester" | Level-by-level Kahn's | Bitmask DP over completed sets for `n ≤ 15`; NP-hard when `k` is part of the input | The per-round cap makes the greedy choice of *which* ready course matter |
| "Order of letters given a sorted word list" built from every pair | Topological sort, all pairs | Topological sort on **adjacent** pairs only | Non-adjacent pairs are implied by transitivity |
| "Longest path in this graph" | Topological sort + DP | Only if the graph is a DAG; on a general graph it is NP-hard | Check for "acyclic", "dependencies" or "increasing" before promising `O(V + E)` |
| "Is the undirected edge list a tree" | Kahn's on degrees | Union-find or traversal plus `E = n − 1` | Undirected edges carry no order |
| "Find the centre of a tree" | BFS from every node, `O(n²)` | Leaf peeling, `O(n)` | Removing all leaves shortens every longest path from both ends |

## The template

Kahn's algorithm: count each node's in-degree; start with every node of in-degree 0; repeatedly take one, emit it, and decrement its successors' in-degrees; a successor that hits 0 becomes available. If fewer than `n` nodes come out, the rest are on a cycle or downstream of one.

```python
from collections import deque

def topo_order(n, edges):
    """edges are (u, v) meaning u must come before v. Returns [] on a cycle."""
    adj = [[] for _ in range(n)]          # every node exists, even with no edges
    indeg = [0] * n
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1
    queue = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while queue:
        u = queue.popleft()               # deque: O(1); list.pop(0) is O(n)
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1                 # one incoming constraint satisfied
            if indeg[v] == 0:             # the last one: v is ready
                queue.append(v)
    return order if len(order) == n else []
```

```javascript
function topoOrder(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [u, v] of edges) { adj[u].push(v); indeg[v]++; }
  const queue = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  let head = 0;                              // head index: shift() is O(n)
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of adj[u]) if (--indeg[v] === 0) queue.push(v);
  }
  return queue.length === n ? queue : [];    // the queue array IS the order
}
```

The DFS alternative colours nodes white (unseen), grey (on the current path) and black (finished). A node is appended when it finishes, after everything it points to; the reversed finishing order is a topological order. In JavaScript write it iteratively, because Node's default stack overflows at a few thousand frames:

```python
WHITE, GREY, BLACK = 0, 1, 2

def topo_dfs(n, adj):
    colour = [WHITE] * n
    post = []
    def visit(u):
        colour[u] = GREY                  # u is on the current path
        for v in adj[u]:
            if colour[v] == GREY:
                return False              # back edge: v -> ... -> u -> v
            if colour[v] == WHITE and not visit(v):
                return False
        colour[u] = BLACK                 # everything below u is placed
        post.append(u)
        return True
    for u in range(n):
        if colour[u] == WHITE and not visit(u):
            return []
    return post[::-1]
```

```javascript
function topoDfs(n, adj) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Uint8Array(n);
  const post = [];
  for (let s = 0; s < n; s++) {
    if (colour[s] !== WHITE) continue;
    colour[s] = GREY;
    const stack = [[s, 0]];                  // [node, index of next neighbour]
    while (stack.length) {
      const top = stack[stack.length - 1];
      const u = top[0];
      if (top[1] < adj[u].length) {
        const v = adj[u][top[1]++];          // advance before descending
        if (colour[v] === GREY) return [];   // back edge: cycle
        if (colour[v] === WHITE) { colour[v] = GREY; stack.push([v, 0]); }
      } else {
        colour[u] = BLACK; post.push(u); stack.pop();
      }
    }
  }
  return post.reverse();
}
```

The `[node, next index]` pair is what makes the iterative version correct: a node must stay grey until *all* its neighbours are finished, so it cannot be popped when it is first expanded, as it would be in an iterative traversal that only needs reachability.

Watch the in-degrees fall and the queue refill:

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true, "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}], "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "C", "to": "F"}, {"from": "F", "to": "E"}], "title": "Kahn's algorithm", "caption": "Nodes enter the queue when their in-degree hits zero; the emitted sequence is a valid order."}
```

## Why it is correct

**Kahn's never emits a node too early.** A node enters the queue only when its in-degree reaches 0. Its in-degree drops once per incoming edge `p → v`, and only when `p` is emitted. So every predecessor of `v` is already in `order` when `v` is added.

**Kahn's emits everything if and only if there is no cycle.** If there is a cycle, each node on it keeps in-degree at least 1 from its predecessor on the cycle, which is itself waiting; none of them is ever emitted, nor is anything reachable only through them. If there is no cycle, the unemitted nodes form a sub-DAG, and every non-empty DAG has a node with in-degree 0 (walk backwards along incoming edges: with no cycle, you cannot revisit a node, so after at most `n` steps you reach a node with no incoming edge). That node has in-degree 0 in the counters too, so the queue cannot be empty while nodes remain.

**DFS finishing order works.** When DFS examines edge `u → v`: if `v` is white, it is visited and finishes before `u`; if `v` is black, it finished earlier; if `v` is grey, it is an ancestor of `u` on the current path, so `v ⇝ u → v` is a cycle. In a DAG, therefore, every edge has `finish(v) < finish(u)`, and reversing the finish order puts `u` before `v`. A black neighbour is never a cycle: the diamond `0 → 1 → 3`, `0 → 2 → 3` reaches the black node 3 from 2 without any cycle.

**Complexity.** Building the lists touches each edge once (`O(E)`) and allocates one list per node (`O(V)`). Each node is enqueued and dequeued at most once, and each dequeue walks that node's out-edges, so the loop does `O(V + E)` work. Space is `O(V + E)` for the adjacency lists. The heap variant pays `O(log V)` per push and pop, `O((V + E) log V)` in total.

## Worked problems

### Course Schedule II

[Course Schedule II](/practice/course-schedule-ii): `numCourses` courses, `prerequisites` as pairs `[a, b]` meaning "take `b` before `a`". Return any valid order, or `[]`. ([Course Schedule](/practice/course-schedule) asks only whether one exists.)

The trap is edge direction. `[a, b]` means `b → a`: from the prerequisite to the course that needs it. Read the construction line back as a sentence before moving on.

```python
def find_order(num_courses, prerequisites):
    edges = [(b, a) for a, b in prerequisites]    # b before a
    return topo_order(num_courses, edges)
```

Trace with `numCourses = 4`, `prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]`. Edges 0→1, 0→2, 1→3, 2→3; in-degrees `[0, 1, 1, 2]`.

| step | queue before | emit | decrements | in-degrees after | queue after |
|---|---|---|---|---|---|
| 1 | `[0]` | 0 | 1→0, 2→0 | `[0, 0, 0, 2]` | `[1, 2]` |
| 2 | `[1, 2]` | 1 | 3→1 | `[0, 0, 0, 1]` | `[2]` |
| 3 | `[2]` | 2 | 3→0 | `[0, 0, 0, 0]` | `[3]` |
| 4 | `[3]` | 3 | | | `[]` |

Order `[0, 1, 2, 3]`. At step 2 the queue held two nodes, which is exactly the moment the order stops being unique: `[0, 2, 1, 3]` is equally valid. Say so; the grader accepts any valid order.

Now a cyclic input: 5 nodes, edges 0→1, 1→2, 2→3, 3→1, 3→4. In-degrees `[0, 2, 1, 1, 1]`.

| step | queue before | emit | decrements | in-degrees after | queue after |
|---|---|---|---|---|---|
| 1 | `[0]` | 0 | 1→1 | `[0, 1, 1, 1, 1]` | `[]` |

One node emitted out of five, so return `[]`. The four stuck nodes are not all on the cycle: 1, 2 and 3 are, and 4 is only downstream of it. That distinction matters when the interviewer asks you to report the cycle.

The same diamond under three-colour DFS (colours written as a string for nodes 0..3):

| event | colours | stack | post-order |
|---|---|---|---|
| enter 0 | `GWWW` | `[0]` | `[]` |
| enter 1 | `GGWW` | `[0, 1]` | `[]` |
| enter 3 | `GGWG` | `[0, 1, 3]` | `[]` |
| finish 3 | `GGWB` | `[0, 1]` | `[3]` |
| finish 1 | `GBWB` | `[0]` | `[3, 1]` |
| enter 2; edge 2→3 is black, skip | `GBGB` | `[0, 2]` | `[3, 1]` |
| finish 2 | `GBBB` | `[0]` | `[3, 1, 2]` |
| finish 0 | `BBBB` | `[]` | `[3, 1, 2, 0]` |

Reversed: `[0, 2, 1, 3]`. On the cyclic graph DFS enters 0, 1, 2, 3 and then sees edge 3→1 with 1 grey; the stack from 1 upward, `[1, 2, 3]`, *is* the cycle.

```viz
{"type": "graph", "algorithm": "topo-sort-dfs", "directed": true, "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}], "edges": [{"from": "0", "to": "1"}, {"from": "0", "to": "2"}, {"from": "1", "to": "3"}, {"from": "2", "to": "3"}], "title": "Three-colour DFS on the diamond", "caption": "A node is appended when it finishes; the edge from 2 to the finished node 3 is not a cycle."}
```

### Alien Dictionary

[Alien Dictionary](/practice/alien-dictionary): words sorted by an unknown alphabet. Recover the alphabet, or `""` if the list is inconsistent.

Each *adjacent* pair `(w1, w2)` gives at most one edge: at the first differing position `i`, `w1[i] → w2[i]`. Everything after that position is unconstrained. Two edge cases decide the round: a word followed by its own proper prefix (`["abc", "ab"]`) is invalid under any alphabet, and every letter that appears anywhere must be a node, even with no edges.

```python
def alien_order(words):
    adj = {ch: set() for w in words for ch in w}      # every letter is a node
    indeg = {ch: 0 for ch in adj}
    for w1, w2 in zip(words, words[1:]):
        for a, b in zip(w1, w2):
            if a != b:
                if b not in adj[a]:                   # count each edge once
                    adj[a].add(b)
                    indeg[b] += 1
                break                                 # only the first difference
        else:                                         # no differing position
            if len(w1) > len(w2):
                return ""                             # "abc" before "ab"
    queue = deque(ch for ch in indeg if indeg[ch] == 0)
    out = []
    while queue:
        u = queue.popleft()
        out.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    return "".join(out) if len(out) == len(adj) else ""
```

Trace on `["wrt", "wrf", "er", "ett", "rftt"]`. Pairs give t→f (position 2), w→e (0), r→t (1), e→r (0).

| step | queue before | emit | in-degrees after (w r t f e) | queue after |
|---|---|---|---|---|
| start | | | 0 1 1 1 1 | `[w]` |
| 1 | `[w]` | w | 0 1 1 1 0 | `[e]` |
| 2 | `[e]` | e | 0 0 1 1 0 | `[r]` |
| 3 | `[r]` | r | 0 0 0 1 0 | `[t]` |
| 4 | `[t]` | t | 0 0 0 0 0 | `[f]` |
| 5 | `[f]` | f | | `[]` |

Output `wertf`. The `for ... else` runs its `else` only when the inner loop did not `break`, that is, when no position differed; in JavaScript use a flag. The duplicate-edge guard matters on `["ca", "cb", "da", "db"]`: both `ca/cb` and `da/db` give a→b. With a set for adjacency but an unconditional `indeg[b] += 1`, `b` needs two decrements and receives one, and the function returns `""` for a valid input whose answer is `cadb`.

Time: `O(C)` to build, where `C` is the total number of characters (each pair costs the shorter word's length), plus `O(V + E)` for the sort with `V ≤ 26`.

### Minimum Height Trees

[Minimum Height Trees](/practice/minimum-height-trees): an undirected tree of `n` nodes. Which roots minimise the height?

The answer is the tree's centre: the middle node, or the middle two, of a longest path. Stripping every leaf shortens every longest path by one at each end, so repeat until at most two nodes remain.

```python
def find_min_height_trees(n, edges):
    if n <= 2:
        return list(range(n))
    adj = [set() for _ in range(n)]
    for u, v in edges:
        adj[u].add(v)
        adj[v].add(u)
    leaves = [i for i in range(n) if len(adj[i]) == 1]
    remaining = n
    while remaining > 2:
        remaining -= len(leaves)
        new_leaves = []
        for leaf in leaves:
            nb = adj[leaf].pop()                 # a leaf has exactly one neighbour
            adj[nb].remove(leaf)                 # set removal: O(1)
            if len(adj[nb]) == 1:
                new_leaves.append(nb)
        leaves = new_leaves
    return leaves
```

Trace with `n = 7`, edges 0–1, 1–2, 2–3, 3–4, 2–5, 5–6. Degrees `[1, 2, 3, 2, 1, 2, 1]`.

| round | leaves stripped | `remaining` | degrees after | new leaves |
|---|---|---|---|---|
| 1 | 0, 4, 6 | 4 | `[0, 1, 3, 1, 0, 1, 0]` | 1, 3, 5 |
| 2 | 1, 3, 5 | 1 | all 0 | 2 |

Answer `[2]`: the longest paths (0–1–2–3–4, 0–1–2–5–6) have five nodes and one middle node. A longest path with an even number of nodes has a middle *edge*, and both its endpoints are answers, which is why there are never three. It is Kahn's with in-degree 0 replaced by degree 1, and the number of rounds is the tree's radius. `O(n)`: each node is stripped once, each edge removed once.

### Queue, heap and levels on one graph

The queue discipline decides *which* valid order you get. Take 4 nodes with edges 3→0 and 2→1; nodes 2 and 3 start ready.

| step | FIFO queue before | emit | queue after | min-heap before | emit | heap after |
|---|---|---|---|---|---|---|
| 1 | `[2, 3]` | 2 | `[3, 1]` | `[2, 3]` | 2 | `[1, 3]` |
| 2 | `[3, 1]` | 3 | `[1, 0]` | `[1, 3]` | 1 | `[3]` |
| 3 | `[1, 0]` | 1 | `[0]` | `[3]` | 3 | `[0]` |
| 4 | `[0]` | 0 | `[]` | `[0]` | 0 | `[]` |

The queue gives `[2, 3, 1, 0]`; the heap gives `[2, 1, 3, 0]`, the lexicographically smallest, because 1 becomes ready after 2 and jumps ahead of 3. Processed level by level, the ready sets are `{2, 3}` then `{0, 1}`: two rounds.

### Shortest path in a weighted DAG

Process nodes in topological order and relax each node's out-edges when its turn comes. Edges S→A (2), S→B (5), A→B (−4), B→T (1), A→T (6); the order is S, A, B, T.

| process | relaxations | `dist` (S, A, B, T) after |
|---|---|---|
| S | A = 2, B = 5 | 0, 2, 5, ∞ |
| A | B = 2 − 4 = −2, T = 8 | 0, 2, −2, 8 |
| B | T = −2 + 1 = −1 | 0, 2, −2, −1 |
| T | none | 0, 2, −2, −1 |

When B is processed, both edges into it have been relaxed, so −2 is final even with a negative weight. That is the property Dijkstra lacks and the reason "DAG" in a statement beats "weighted" when you choose the algorithm.

## Variations

| Variant | Queue structure | What is kept | Extra state | Time |
|---|---|---|---|---|
| Any order / can finish | FIFO queue | emitted list | in-degrees | `O(V + E)` |
| Lexicographically smallest order | min-heap | emitted list | in-degrees | `O((V + E) log V)` |
| Minimum rounds (unbounded parallelism) | queue, level by level | level count | in-degrees | `O(V + E)` |
| Is the order unique? | queue | whether it ever held two | in-degrees | `O(V + E)` |
| Longest / shortest path in a weighted DAG | topological order, then relax | `dist` array | weights | `O(V + E)` |
| Safe states | Kahn's on reversed edges | nodes emitted | out-degrees | `O(V + E)` |
| Tree centre | leaves, round by round | last round | degrees | `O(V)` |
| Report the cycle | three-colour DFS | grey stack | colours, stack | `O(V + E)` |

- **Unique order**: an order is unique exactly when the queue never holds two nodes at once, because two ready nodes can be emitted in either order. Equivalently, consecutive nodes in the order are joined by edges (a Hamiltonian path).
- **DAG shortest or longest path**: when a node's turn comes, every edge into it has been relaxed, so its value is final. Negative weights are fine; this is DP over the order.
- **Cycles are allowed but you need an order of the groups**: collapse each [strongly connected component](/learn/algorithms/graph-algorithms/strongly-connected-components) to one node; the condensation is always a DAG, and Kahn's orders it.
- **Build systems**, package managers and workflow schedulers (Apache Airflow, Netflix's open-source Maestro) run a step once all its upstream steps have finished, which is Kahn's algorithm with the in-degree counter replaced by an outstanding-dependencies count, and they report the cycle, which needs the DFS version.

## Under the hood

**`deque` against `list.pop(0)`.** CPython's `deque` is a doubly linked list of 64-slot blocks, so `popleft` is `O(1)`. `list.pop(0)` shifts every remaining pointer one slot left. Measured on CPython 3.14: running Kahn's over 200,000 isolated nodes (all ready at once) takes 12 ms with a `deque` and 950 ms with `list.pop(0)`; at 10⁶ nodes the `deque` takes 72 ms and the list version grows quadratically, into tens of seconds. In JavaScript `shift()` has the same shape; keep a head index instead.

**Recursion depth in the DFS version.** CPython's default recursion limit is 1,000, and on 3.14 the recursive `visit` fails on a dependency chain of 999 nodes (the calling frames use the rest). Since CPython 3.11, Python-to-Python calls do not consume the C stack, so `sys.setrecursionlimit(2_000_000)` works: a 10⁶-node chain then completes in 437 ms and grows the process by about 223 MB, roughly 220 bytes per frame. On older versions a raised limit could crash the interpreter instead of raising `RecursionError`. Node 24's default stack overflowed the DFS-shaped recursion between 5,000 and 5,500 frames in the same test, which is why the JavaScript template is iterative.

**What `n = 2 × 10⁵`, `E = 10⁶` costs.** Measured on CPython 3.14: building the adjacency lists and in-degrees takes 119 ms, Kahn's with a `deque` 180 ms, and the min-heap variant 203 ms. The heap is cheap here because it holds only the ready set, not the graph; its cost grows with the number of simultaneously ready nodes.

**Adjacency as lists or sets.** Lists are smaller and faster to build, and correct as long as each edge is counted once in both the list and the in-degree. Sets deduplicate edges for free, which is why Alien Dictionary and Minimum Height Trees use them, but then the in-degree must be incremented only when the set actually grew. Mixing a deduplicating adjacency with a non-deduplicating counter is the bug in the Alien Dictionary trace.

## Failure modes

**Symptom: orders fail the checker on chains, while every cycle test passes.** Diagnosis: the edge is built as `a → b` for `[a, b]` ("b before a"). Reversing every edge reverses every valid order but preserves every cycle, so cycle tests cannot catch it. Fix: construct `(b, a)` and read the line back as "b, then a".

**Symptom: a valid input reports a cycle (`[]` or `""`).** Diagnosis: `len(order) < n` for a reason other than a cycle. Either nodes that appear in no edge were never created (a dict built from edges only; letters that never differ in Alien Dictionary), or node labels are 1-indexed and node `n` is out of range, or duplicate edges inflated an in-degree. Print the in-degrees of the unemitted nodes: a stuck node with in-degree 1 and no emitted-but-unprocessed predecessor points at the counter. Fix: create every node up front; count an edge in the in-degree only when it is added.

**Symptom: correct on small tests, time limit on `n = 10⁵`.** Diagnosis: `queue.pop(0)` on a list, `list.remove` on adjacency lists (Minimum Height Trees on a star is `O(n²)`), or an `in` test against a list for duplicate edges. Fix: `deque`, sets, or a degree array that is decremented instead of editing adjacency.

**Symptom: `RecursionError` or `RangeError` on a hidden test with a long prerequisite chain.** Diagnosis: the DFS version recursing once per node on the chain. Fix: Kahn's, or the iterative `[node, next index]` DFS.

## Interviewer follow-ups

**"There's a cycle. Return it."** Model answer: switch to three-colour DFS and keep the stack; the back edge `u → v` to a grey `v` closes the cycle `v … u` found on the stack. Common wrong answer: "the nodes Kahn's did not emit", which also includes everything downstream of the cycle (node 4 in the trace).

**"Is the order unique?"** Model answer: run Kahn's and fail as soon as the queue holds two nodes; unique means each step has exactly one ready node. Common wrong answer: counting only the initial sources, which misses a fork in the middle, as in the diamond.

**"Give me the lexicographically smallest valid order."** Model answer: replace the queue with a min-heap, `O((V + E) log V)`. Common wrong answer: sort the output of Kahn's, which breaks the constraints.

**"At most `k` courses per semester."** Model answer: taking any `k` ready courses is no longer optimal. With `k = 2`, a chain A→B→C→D plus independent E and F: choosing {E, F} first takes 5 semesters, {A, E} first takes 4. For `n ≤ 15`, DP over bitmasks of completed courses; in general the problem is NP-hard when `k` is part of the input (the special case `k = 2` has a polynomial algorithm, Coffman–Graham, that no interviewer expects), and real schedulers use critical-path heuristics. Common wrong answer: level-by-level Kahn's, capped at `k` per level.

**"Edges arrive one at a time; reject any edge that would create a cycle."** Model answer: before adding `u → v`, search from `v` for `u`; if reachable, reject. `O(V + E)` per insertion; maintaining an order and searching only the affected range is the incremental refinement. Common wrong answer: rerunning Kahn's on the whole graph per edge without saying that it is the same cost with more work.

## What mid-level engineers get wrong

- **Treating any visited neighbour as a cycle** in the directed DFS. Black neighbours are fine; only grey ones close a cycle. The diamond gets rejected.
- **Popping a node when it is first expanded** in an iterative DFS. It turns black before its descendants finish and the post-order is wrong.
- **Comparing every pair of words** in Alien Dictionary. `O(n²)` pairs, and a non-adjacent pair can produce an edge the input does not support.
- **Missing the prefix-invalid case** (`["abc", "ab"]`), which returns an alphabet for an impossible input.
- **Answering "minimum semesters" by level count when a per-semester cap exists.** The cap changes the problem class.
- **Returning the order without comparing its length with `n`.** A partial order on a cyclic graph fails every test that expects `[]`.

## Exercises

```exercise
id: minimum-semesters
title: Minimum number of semesters
prompt: |
  There are `n` courses numbered 0 to n-1 and a list of `prereqs`, each a
  pair `[a, b]` meaning course `b` must be completed before course `a`.
  In one semester you may take any number of courses whose prerequisites
  are all complete. Return the minimum number of semesters needed to
  complete every course, or -1 if the prerequisites contain a cycle.

  Use Kahn's algorithm level by level: every course available at the start
  of a level is taken in that semester.
languages: [python, javascript]
entry: min_semesters
starter:
  python: |
    from collections import deque

    def min_semesters(n, prereqs):
        # your code here
        return 0
  javascript: |
    function min_semesters(n, prereqs) {
      // your code here
      return 0;
    }
tests:
  - args: [3, [[1, 0], [2, 1]]]
    expected: 3
  - args: [3, [[1, 0], [2, 0]]]
    expected: 2
  - args: [3, []]
    expected: 1
    label: no prerequisites, everything in one semester
  - args: [1, []]
    expected: 1
    label: single course
  - args: [2, [[0, 1], [1, 0]]]
    expected: -1
    label: two-course cycle
  - args: [4, [[1, 0], [2, 0], [3, 1], [3, 2]]]
    expected: 3
    label: diamond
  - args: [5, [[1, 0], [2, 1], [4, 3]]]
    expected: 3
    hidden: true
    label: two independent chains, the longer one decides
  - args: [3, [[1, 0], [2, 1], [0, 2]]]
    expected: -1
    hidden: true
    label: three-course cycle
hints:
  - "Build adjacency b -> a and an in-degree array; the first semester is every course with in-degree 0."
  - "Process the queue one level at a time (capture its size); each level is one semester."
  - "Count the courses you emit; if the total is less than n, there is a cycle and the answer is -1."
```

```exercise
id: unique-course-order
title: Is there exactly one valid order?
prompt: |
  There are `n` courses numbered 0 to n-1 and a list of `prereqs`, each a
  pair `[a, b]` meaning course `b` must be taken before course `a`. Return
  `true` if exactly one order of all n courses satisfies every
  prerequisite, and `false` if there are several orders or none (a cycle).

  Run Kahn's algorithm and watch the queue: two courses ready at the same
  time can be taken in either order.
languages: [python, javascript]
entry: unique_order
starter:
  python: |
    from collections import deque

    def unique_order(n, prereqs):
        # your code here
        return False
  javascript: |
    function unique_order(n, prereqs) {
      // your code here
      return false;
    }
tests:
  - args: [3, [[1, 0], [2, 1]]]
    expected: true
    label: a chain has one order
  - args: [4, [[1, 0], [2, 0], [3, 1], [3, 2]]]
    expected: false
    label: diamond, the middle two can swap
  - args: [1, []]
    expected: true
    label: single course
  - args: [2, []]
    expected: false
    label: two independent courses
  - args: [2, [[0, 1], [1, 0]]]
    expected: false
    label: a cycle has no order at all
  - args: [3, [[1, 0], [2, 1], [2, 0]]]
    expected: true
    hidden: true
    label: a redundant shortcut edge does not add freedom
  - args: [4, [[1, 0], [2, 1], [3, 1]]]
    expected: false
    hidden: true
    label: the fork is in the middle, not at the start
hints:
  - "Build adjacency b -> a and in-degrees, then seed the queue with every course of in-degree 0."
  - "If the queue ever holds two or more courses, either could go next, so the order is not unique."
  - "At the end, also check that all n courses were emitted; otherwise there was a cycle."
```

## Senior signals

- You **read the edge direction back as a sentence** ("`[a, b]` means `b` then `a`, so the edge is `b → a`") before writing the loop, and you know that cycle tests cannot catch a reversed edge.
- You explain the **cycle check** as "a node on a cycle never reaches in-degree zero" and the completeness half as "every non-empty DAG has a source".
- You distinguish **cycle nodes from stuck nodes**: Kahn's leftovers include everything downstream, and naming the cycle needs the grey stack.
- You know **both Kahn's and three-colour DFS** and choose by what the question needs: levels and no recursion, or the cycle itself.
- You offer the **variant the follow-up needs** in one line each: min-heap for lexicographic order, queue size for uniqueness, level count for rounds, and you say when a per-round cap makes it a different problem.
- You quantify **the constant-factor traps**: `list.pop(0)` at 2 × 10⁵ nodes costs about 80 times a `deque` in CPython, and Node's stack gives out at a few thousand DFS frames.
- You recognise **Minimum Height Trees as leaf-peeling Kahn's** and give the one-or-two-centres argument from the middle of a longest path.

## Check yourself

```quiz
- q: >-
    Course Schedule gives prerequisites as pairs [a, b] meaning b must be taken before a. A candidate builds the edge a -> b and runs Kahn's algorithm. On numCourses = 3, prerequisites = [[1, 0], [2, 1]] the output is:
  options: ["An empty list, since the edges now form a cycle", "[1, 0, 2], an order that satisfies one pair only", "[0, 1, 2], which is the correct order", "[2, 1, 0], the valid order exactly reversed"]
  answer: 3
  explanation: >-
    Reversing every edge reverses every valid order, so the output fails any test that checks the constraints. Cycle detection is unaffected, because a reversed cycle is still a cycle and a reversed chain is still acyclic, which is why the bug survives the cyclic test cases.
- q: >-
    Kahn's algorithm on 5 nodes with edges 0->1, 1->2, 2->3, 3->1, 3->4 emits only node 0. Which statement about the four unemitted nodes is right?
  options: ["Only node 4 is a problem, since its in-degree is 1", "All four lie on one cycle and form the answer", "1, 2 and 3 form the cycle; 4 is stuck downstream", "They are isolated nodes that the loop never reached"]
  answer: 2
  explanation: >-
    Nodes on a cycle keep an in-degree of at least one from their cycle predecessor, and anything reachable only through them also waits. Node 4 has in-degree 1 from node 3 but is not on the cycle, so Kahn's leftovers over-report the cycle; three-colour DFS finds it exactly as the grey stack [1, 2, 3].
- q: >-
    In a three-colour DFS for topological order, the search at node 2 finds an edge to node 3, which is already black. What does that mean?
  options: ["No cycle; 3 finished earlier and precedes nothing of 2", "A cycle through 2 and 3, since 3 was already visited", "Node 3 must be moved after 2 in the final output", "The DFS must restart from node 3 to recolour it"]
  answer: 0
  explanation: >-
    Black means node 3 and everything below it have finished, so 3 already sits later than 2 in the reversed post-order, which is what the edge requires. Only an edge to a grey node, which is still on the current path, closes a cycle. Treating any visited node as a cycle rejects the diamond 0->1->3, 0->2->3.
- q: >-
    How can Kahn's algorithm tell whether the topological order is unique?
  options: ["If the queue never holds more than one node", "If the DFS and Kahn orders happen to be equal", "If the graph has exactly n - 1 edges in total", "If exactly one node has in-degree 0 at the start"]
  answer: 0
  explanation: >-
    Two nodes in the queue at the same time are both ready, and either could be emitted first, which gives two different valid orders. A single source at the start is not enough: the diamond has one source and still two orders because the fork is in the middle. Edge count says nothing about order freedom.
- q: >-
    The words ["abc", "ab"] appear in that order in an Alien Dictionary input. What should happen?
  options: ["Report the input invalid, since no alphabet sorts it", "Ignore the pair, since prefixes carry no information", "Add an edge from c to an end-of-word marker", "Treat it as a cycle between the letters a and b"]
  answer: 0
  explanation: >-
    A proper prefix sorts before its extension under every alphabet. No position differs and the earlier word is longer, so the pair yields no edge and the check has to be explicit; ignoring it returns an alphabet for an impossible input.
- q: >-
    Minimum Height Trees strips leaves round by round and stops when at most two nodes remain. Why can there never be three answers?
  options: ["There can be three; returning two is only a convention", "Because every tree has an odd number of nodes in it", "A longest path has one middle node or one middle edge", "Because each round removes at least half of the nodes"]
  answer: 2
  explanation: >-
    Each round removes one node from each end of every longest path. What survives is the middle of a longest path: one node when that path has an odd number of nodes, the two ends of the middle edge when it has an even number.
```

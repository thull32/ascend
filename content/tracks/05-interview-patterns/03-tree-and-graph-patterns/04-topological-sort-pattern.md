---
slug: topological-sort-pattern
title: "Topological sort: ordering by dependencies and detecting the cycle that breaks it"
description: Recognise "must come before" as a DAG problem, run Kahn's algorithm from memory, and see Course Schedule II, Alien Dictionary and Minimum Height Trees traced with the in-degree table and queue at every step.
minutes: 32
difficulty: medium
tags: [graph, topological-sort, kahn, dag, cycle-detection, in-degree, pattern:topological-sort]
problems: [course-schedule, course-schedule-ii, alien-dictionary, minimum-height-trees]
---
Some tasks must happen before others: course B needs course A, package X imports package Y, build step `link` needs `compile`. You are asked for an order that respects every constraint, or whether one exists at all, or how many rounds it takes if independent tasks run in parallel. A brute-force search over orderings is `n!`; a DFS that ignores direction finds components, not orders.

Topological sort is the linear-time answer, and it comes with a free cycle detector: if the constraints contradict each other (A before B, B before A), no order exists, and the algorithm discovers that by running out of tasks to start before it has placed all of them. Interviewers like it because the graph is never handed to you. You have to build it from pairs, from adjacent words, from an implicit "this depends on that", and the building is where the mistakes hide.

## The signal

Reach for topological sort when the statement contains any of these:

- **"Prerequisites", "dependencies", "must be taken before", "must finish before"**: the pairs are directed edges, and the output is an order.
- **"Is it possible to finish all"**: cycle detection on a directed graph. Kahn's algorithm answers it by counting how many nodes it managed to place.
- **"Derive the order of letters / versions / events from partial observations"** ([Alien Dictionary](/practice/alien-dictionary)): the observations give you pairwise constraints; the answer is a topological order.
- **"Minimum number of rounds / semesters if independent tasks run in parallel"**: the number of BFS levels in Kahn's algorithm, which equals the longest path in the DAG plus one.
- **"Peel the leaves", "find the centre of a tree"** ([Minimum Height Trees](/practice/minimum-height-trees)): Kahn's algorithm run on an undirected tree, removing degree-1 nodes layer by layer until one or two remain.
- **"Safe states", "eventual nodes", "can reach a terminal"**: reverse the edges and topologically sort from the terminals.

What rules it out:

- The edges are **undirected** and the question is connectivity: [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal) or [Union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern).
- The question is about **weights, costs or shortest distance**: [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern). (Shortest paths *in a DAG* can be done in one topological pass, which is worth mentioning, but the pattern is DP over the order.)
- **A specific order among the valid ones** is required ("lexicographically smallest"): Kahn's algorithm with a min-heap instead of a queue. Same skeleton, one line changed, `O((V + E) log V)`.

The confusable pattern is plain DFS cycle detection with a "currently on the stack" colour. It works, and the DFS post-order reversed is a topological order. Kahn's is the one to write under pressure because it is iterative, produces the order directly, counts levels for free, and detects cycles with a single comparison at the end.

## The template

Kahn's algorithm: compute each node's in-degree; start with every node of in-degree 0; repeatedly take one, emit it, and decrement its neighbours' in-degrees; any neighbour that hits 0 becomes available. If you emit fewer than `n` nodes, the remainder are on or downstream of a cycle.

```python
from collections import deque, defaultdict

def topo_order(n, edges):
    """edges are (u, v) meaning u must come before v. Returns [] on a cycle."""
    adj = defaultdict(list)
    indeg = [0] * n
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1
    queue = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
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
  const order = [];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const v of adj[u]) if (--indeg[v] === 0) queue.push(v);
  }
  return order.length === n ? order : [];
}
```

The invariant: *every node in `order` has had all of its predecessors emitted before it*. A node enters the queue only when its in-degree reaches 0, which happens only after every incoming edge has been processed, which happens only after every predecessor was emitted. The cycle check is the observation that a node on a cycle can never reach in-degree 0, because at least one predecessor (the one before it on the cycle) is itself waiting.

Time `O(V + E)`: building the graph touches each edge once, the loop emits each node once and decrements along each edge once. Space `O(V + E)` for the adjacency list.

Watch the in-degrees fall and the queue refill:

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true, "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}], "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "C", "to": "F"}, {"from": "F", "to": "E"}], "title": "Kahn's algorithm", "caption": "Nodes enter the queue when their in-degree hits zero; the emitted sequence is a valid order."}
```

For the "how many rounds" variant, process the queue level by level with the `size` trick from [Tree BFS](/learn/interview-patterns/tree-and-graph-patterns/tree-bfs): every node available at the top of the outer loop can run in the same round.

## Worked problems

### Course Schedule II

[Course Schedule II](/practice/course-schedule-ii): `numCourses` courses, `prerequisites` given as pairs `[a, b]` meaning "take `b` before `a`". Return any valid order, or an empty list if none exists. ([Course Schedule](/practice/course-schedule) is the same problem returning only whether an order exists.)

The only trap is the edge direction. `[a, b]` means `b → a`: the edge goes from the prerequisite to the course that needs it. Reverse it and you produce the order backwards, which passes some tests and fails others, and the failure looks like a cycle bug.

```python
def find_order(num_courses, prerequisites):
    edges = [(b, a) for a, b in prerequisites]    # b before a
    return topo_order(num_courses, edges)
```

Trace with `numCourses = 4`, `prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]`. Edges: 0→1, 0→2, 1→3, 2→3. In-degrees: `[0, 1, 1, 2]`.

| step | queue at top | emit | decrements | in-degrees after | newly available |
|---|---|---|---|---|---|
| 1 | `[0]` | 0 | 1→0, 2→0 | `[0, 0, 0, 2]` | 1, 2 |
| 2 | `[1, 2]` | 1 | 3→1 | `[0, 0, 0, 1]` | |
| 3 | `[2]` | 2 | 3→0 | `[0, 0, 0, 0]` | 3 |
| 4 | `[3]` | 3 | | | |

Order `[0, 1, 2, 3]`, four nodes emitted, valid. `[0, 2, 1, 3]` would also be valid; the interviewer knows the order is not unique and will not compare against a fixed answer, but you should say it.

Now add the pair `[0, 3]` (3 before 0), creating the cycle 0→1→3→0. In-degrees become `[1, 1, 1, 2]`; no node starts at 0; the queue is empty; `order` is empty; `len(order) = 0 ≠ 4`; return `[]`. The algorithm did not have to find the cycle, it just noticed it never got to start.

With the level-by-level variant this same graph takes 3 semesters: `{0}`, `{1, 2}`, `{3}`.

### Alien Dictionary

[Alien Dictionary](/practice/alien-dictionary): a list of words sorted according to an unknown alphabet. Recover the alphabet order, or report that the list is inconsistent.

The graph is not given; you build it from *adjacent* word pairs. For each pair `(w1, w2)`, find the first position where they differ: `w1[i] → w2[i]` is an edge, and that is the *only* information the pair gives, because everything after the first difference is unconstrained. Two edge cases decide the round: if `w1` is longer than `w2` and `w2` is a prefix of `w1` (`["abc", "ab"]`), the input is invalid; and every letter that appears in any word must be a node, even letters with no edges, or they vanish from the output.

```python
def alien_order(words):
    adj = {ch: set() for w in words for ch in w}      # every letter is a node
    indeg = {ch: 0 for ch in adj}
    for w1, w2 in zip(words, words[1:]):
        for a, b in zip(w1, w2):
            if a != b:
                if b not in adj[a]:                   # ignore duplicate edges
                    adj[a].add(b)
                    indeg[b] += 1
                break
        else:                                         # no differing position
            if len(w1) > len(w2):
                return ""                             # "abc" before "ab": invalid
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

Trace on `["wrt", "wrf", "er", "ett", "rftt"]`. Letters: `w, r, t, f, e`.

| pair | first difference | edge |
|---|---|---|
| wrt, wrf | position 2: t vs f | t → f |
| wrf, er | position 0: w vs e | w → e |
| er, ett | position 1: r vs t | r → t |
| ett, rftt | position 0: e vs r | e → r |

In-degrees: `w: 0, e: 1, r: 1, t: 1, f: 1`. Queue starts `[w]`. Emit w → e becomes 0. Emit e → r becomes 0. Emit r → t becomes 0. Emit t → f becomes 0. Emit f. Output `wertf`, five letters, matches five nodes.

Notice the `for ... else` with the `break`: the `else` runs only when the inner loop finished without breaking, that is, when no differing position was found. In JavaScript, use a flag or a helper function. Also notice the duplicate-edge guard: `["ab", "ac", "ab", "ac"]` would otherwise add `b → c` twice and give `c` an in-degree of 2 that only one decrement can ever reach.

Time `O(total characters)` to build the graph (each adjacent pair costs the length of the shorter word) plus `O(V + E)` for the sort, where `V ≤ 26`.

### Minimum Height Trees

[Minimum Height Trees](/practice/minimum-height-trees): given an undirected tree of `n` nodes as an edge list, which roots minimise the tree's height?

The answer is the centre of the tree, and there are at most two centres. Rooting anywhere else puts the far side of the longest path further away. The algorithm is Kahn's shape on an undirected graph: strip every leaf (degree 1), which shortens every longest path by one from both ends; repeat; the nodes left when at most two remain are the centres.

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
            adj[nb].remove(leaf)
            if len(adj[nb]) == 1:
                new_leaves.append(nb)
        leaves = new_leaves
    return leaves
```

Trace with `n = 6`, `edges = [[3, 0], [3, 1], [3, 2], [3, 4], [5, 4]]`. Degrees: 0:1, 1:1, 2:1, 3:4, 4:2, 5:1.

| round | leaves stripped | `remaining` | degrees after | new leaves |
|---|---|---|---|---|
| 1 | 0, 1, 2, 5 | 2 | 3: 1, 4: 1 | 3, 4 |

`remaining` is now 2, the loop stops, and `[3, 4]` are the centres. Rooting at 3 gives height 2 (3 → 4 → 5); rooting at 4 gives height 2 (4 → 3 → 0); rooting at 0 gives height 3. Two centres because the longest path (0 → 3 → 4 → 5) has an even number of nodes and a middle *edge*.

Why is this Kahn's algorithm? In-degree 0 became degree 1, "emit" became "strip", and instead of collecting the order you keep the last layer. The level count is the tree's radius. `O(V + E)` total, since each node is stripped once and each edge removed once.

## Variations

- **Lexicographically smallest order**: replace the queue with a min-heap. `O((V + E) log V)`. Interviewers ask this when the first order you produce is valid but not the one in their example.
- **Parallel rounds / minimum semesters**: process the queue level by level; the number of levels is the answer. Equivalent to the longest path in the DAG plus one, which is what you say when they ask for a proof.
- **DFS version**: colour nodes white/grey/black; a grey neighbour means a cycle; append each node to the output on *finishing* and reverse at the end. Same complexity; recursive, so watch the depth. Know it so you can say "either works, I prefer Kahn's because it is iterative and gives me levels".
- **Shortest or longest path in a DAG**: relax edges in topological order, one pass, `O(V + E)`. No Dijkstra needed, and negative weights are fine.
- **All ancestors / reachability counts**: process in topological order and union each node's ancestor set with its predecessors', or count in reverse order.
- **Safe states** (nodes from which every path ends at a terminal): reverse all edges, run Kahn's from the terminals; every node emitted is safe.
- **Build systems and package managers** do exactly this, with a twist: they want *maximum parallelism*, which is the level-by-level version, and they need to report the cycle, which means running the DFS colouring to extract it.

## Pitfalls

- **Edge direction reversed.** `[a, b]` meaning "b before a" is `b → a`. Write the edge-construction line and read it back as a sentence before moving on.
- **Forgetting isolated nodes.** Nodes with no edges have in-degree 0 and must be emitted; if you only create nodes that appear in edges, they disappear from the order and `len(order) < n` reads as a cycle. In Alien Dictionary this loses letters.
- **Duplicate edges inflating in-degrees.** Deduplicate when building, or use sets for adjacency.
- **Returning the order without the cycle check.** An empty or partial order on a cyclic graph passes nothing. Compare `len(order)` with `n`.
- **Comparing every pair of words** in Alien Dictionary. Only *adjacent* pairs carry information; non-adjacent constraints are implied by transitivity and adding them explicitly is `O(n²)` and can invent contradictions.
- **Missing the prefix-invalid case** (`["abc", "ab"]`). No differing position and the first word is longer means the input is not sorted.
- **Using `list.remove` on adjacency lists** in Minimum Height Trees, which is `O(degree)` per removal and `O(n²)` in total on a star. Use sets, or track degrees in an array without editing adjacency.
- **Recursion depth in the DFS version** on a long chain of dependencies. Kahn's has no such problem, which is a reason to prefer it.

## Exercise

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
  - args: [6, [[1, 0], [2, 0], [3, 1], [3, 2], [4, 3], [5, 4]]]
    expected: 5
    hidden: true
hints:
  - "Build adjacency b -> a and an in-degree array; the first semester is every course with in-degree 0."
  - "Process the queue one level at a time (capture its size); each level is one semester."
  - "Count the courses you emit; if the total is less than n, there is a cycle and the answer is -1."
```

## Senior signals

- You **read the edge direction back as a sentence** ("`[a, b]` means `b` then `a`, so the edge is `b → a`") before writing the loop.
- You explain the **cycle check** as "a node on a cycle never reaches in-degree zero" rather than as a magic comparison.
- You **build the graph from adjacent pairs only** in Alien Dictionary and know why non-adjacent pairs add nothing.
- You point out that the order is **not unique** and ask whether a specific one is wanted, offering the heap variant if so.
- You give the **level-by-level variant** for "minimum rounds" and can say it equals the longest path plus one.
- You know **both Kahn's and DFS colouring** and can say when each is preferable (iterative and gives levels; recursive but extracts the actual cycle).
- You recognise **Minimum Height Trees as leaf-peeling Kahn's** and know the answer has one or two nodes, with a one-sentence reason.

## Check yourself

```quiz
- q: >-
    Course Schedule gives prerequisites as pairs [a, b] meaning b must be taken before a. A candidate builds the edge a -> b and runs Kahn's algorithm. On the input numCourses = 3, prerequisites = [[1, 0], [2, 1]] the output is:
  options: ["[2, 1, 0], the valid order exactly reversed", "An empty list, since the edges now form a cycle", "[0, 1, 2], which is the correct order", "[1, 0, 2], an order that satisfies one pair only"]
  answer: 0
  explanation: >-
    Reversing every edge reverses every valid order, so the output fails any test that checks prerequisites. Cycle detection is unaffected (a reversed cycle is still a cycle, and a reversed chain is still acyclic), which is why the bug survives the cyclic test cases and appears only in ordering checks.
- q: >-
    After Kahn's algorithm on a graph with n = 5 nodes, the emitted order has 3 nodes. What is true?
  options: ["Kahn's must be rerun from a different start node", "A cycle exists; the missing 2 sit on it or downstream", "Two nodes had no edges at all and were skipped", "The graph has three separate weakly connected components"]
  answer: 1
  explanation: >-
    A node is emitted once its in-degree hits zero. A node on a cycle waits on a predecessor that is itself waiting, so its in-degree never reaches zero; anything reachable only through such nodes is stuck too. Isolated nodes start at in-degree 0 and are always emitted.
- q: >-
    In Alien Dictionary, why does the candidate compare only adjacent words rather than every pair?
  options: ["Because the alphabet has at most 26 letters to order", "Because non-adjacent words can never be compared at all", "Adjacent pairs already imply the rest by transitivity", "To save memory; comparing all pairs would be equally correct"]
  answer: 2
  explanation: >-
    If w1 < w2 and w2 < w3 under the alphabet then w1 < w3 follows; the adjacent edges already encode it. Comparing non-adjacent pairs adds O(n^2) work, and deriving an edge from w1 versus w3 directly can pick a position that is only indirectly determined, so it is redundant at best and wrong at worst.
- q: >-
    The words ["abc", "ab"] appear in that order in an Alien Dictionary input. What should happen?
  options: ["Report the input invalid, since no alphabet sorts it", "Ignore the pair, since prefixes carry no information", "Add an edge from c to an end-of-word marker", "Treat it as a cycle between the letters a and b"]
  answer: 0
  explanation: >-
    A shorter prefix always sorts before its extension, regardless of alphabet. Here no position differs and the earlier word is longer, so the pair gives no edge and the check has to be explicit; ignoring it returns an order for an impossible input.
- q: >-
    Minimum Height Trees strips leaves layer by layer and stops when at most two nodes remain. Why can there never be three centres?
  options: ["Because each round removes at least half of the nodes", "There can be three; returning two is only a convention", "Because every tree has an odd number of nodes", "A longest path has one middle node or one middle edge"]
  answer: 3
  explanation: >-
    Every round removes one node from each end of every longest path. What remains at the end is the middle of the longest path: a single node when its length in nodes is odd, the two ends of the middle edge when it is even.
- q: >-
    A DAG has edge weights and the interviewer asks for the longest path from a source. Which approach is right?
  options: ["BFS from the source, counting edges per level", "None; longest path is NP-hard even on a DAG", "Relax each edge once in topological order", "Dijkstra with every edge weight negated"]
  answer: 2
  explanation: >-
    Longest path is hard on general graphs but easy on a DAG: process nodes in topological order and each node's best value is final when its turn comes, O(V + E). Negating weights for Dijkstra introduces negative edges, which Dijkstra cannot handle, and BFS ignores the weights.
```

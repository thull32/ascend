---
slug: bellman-ford-and-floyd-warshall
title: "Bellman-Ford and Floyd-Warshall: relaxation without the invariant"
description: Why V−1 rounds of relaxation are enough, how the V-th round exposes a negative cycle, the DP behind Floyd-Warshall and the loop order that breaks it, and which algorithm to pick for which graph.
minutes: 50
difficulty: medium
tags: [graphs, shortest-path, bellman-ford, floyd-warshall, negative-cycle, all-pairs, dynamic-programming]
problems: [cheapest-flights-k-stops, network-delay-time]
---
Dijkstra's proof needed one thing: extending a path never makes it cheaper. Currency exchange rates break that immediately. Convert the rate `r` into an edge weight `−log r` and the sum of weights along a path is the negative log of the product of rates, so a *negative cycle* is a sequence of trades that ends with more money than it started with. Dijkstra cannot find it; it cannot even compute correct distances when a single edge is negative. The same shape shows up in schedules with slack, in "cost minus rebate" networks, and in any problem where you have reduced costs by subtracting a potential.

Two algorithms handle this. Bellman-Ford drops the priority queue and simply relaxes every edge, `V − 1` times, then uses one more round to detect a negative cycle. Floyd-Warshall answers a different question, the shortest path between *every* pair, with a three-line dynamic program. Both are slower than Dijkstra by an amount you must be able to justify, and both are correct on graphs where Dijkstra is wrong.

## Relaxation is the only primitive

Every shortest-path algorithm in this module does exactly one thing to an edge `(u, v, w)`:

```python
if dist[u] + w < dist[v]:
    dist[v] = dist[u] + w
    prev[v] = u
```

The algorithms differ only in *which order* they apply that step and *how many times*. Dijkstra orders relaxations by tentative distance so each edge is relaxed once. Bellman-Ford gives up on ordering and relaxes every edge repeatedly. Floyd-Warshall relaxes through intermediate nodes instead of along edges. Relaxation has a property that makes all of this safe: `dist[v]` never drops below the true shortest distance, because every value it takes is the length of a real path. So repeating relaxations can only move `dist` towards the truth, never past it. The question each algorithm answers is "how many relaxations before `dist` *reaches* the truth".

## Bellman-Ford: why V − 1 rounds are enough

A shortest path that does not revisit a node uses at most `V − 1` edges. Claim: after `i` full rounds of relaxing every edge, `dist[v]` is correct for every `v` whose shortest path has at most `i` edges.

The base case is `dist[src] = 0` with zero edges. For the step, take a node `v` whose shortest path has `i` edges and let `u` be the node before `v` on that path. `u`'s shortest path has `i − 1` edges (a sub-path of a shortest path is a shortest path), so by induction `dist[u]` was correct after round `i − 1`. Round `i` relaxes `(u, v)`, which sets `dist[v]` to `dist[u] + w`, the true value. That is the whole argument, and it does not mention the sign of any weight. If there is no negative cycle, `V − 1` rounds are enough for every node.

```python
def bellman_ford(n, edges, src):
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] != INF and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break                       # early exit: nothing will change later either
    for u, v, w in edges:               # round V: any improvement means a negative cycle
        if dist[u] != INF and dist[u] + w < dist[v]:
            return None
    return dist
```

Two lines deserve attention.

**The `dist[u] != INF` guard.** In Python `inf + (-3) < inf` is `False`, so the guard looks redundant. It is not: in JavaScript `Infinity + -3 < Infinity` is also false, but in languages where you represent infinity as a large integer, `BIG + (-3) < BIG` is *true* and an unreachable node with an incoming negative edge would acquire a bogus finite distance. The guard also matters for negative-cycle detection: a negative cycle that is not reachable from `src` must not be reported, and without the guard it would be.

**The early exit.** If a full round changes nothing, no later round can change anything either, because every round sees the same `dist`. On most real graphs the algorithm converges in far fewer than `V − 1` rounds. The worst case is a path whose edges are stored in reverse order: round 1 fixes one node, round 2 the next, and you need all `V − 1` rounds. Edge order is invisible in the complexity and dominant in the running time, which is a useful thing to say out loud in an interview.

## Watch it converge

This is the standard textbook example, with a negative edge into E and a negative edge from C back to B. Note how B's distance is settled only after C's, which is only settled after D's, even though B is A's direct neighbour.

```viz
{"type": "graph", "algorithm": "bellman-ford", "directed": true, "start": "A",
 "title": "Bellman-Ford with negative edges",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":35,"y":15},{"id":"C","x":70,"y":15},{"id":"D","x":35,"y":85},{"id":"E","x":70,"y":85}],
 "edges": [{"from":"A","to":"B","w":6},{"from":"A","to":"D","w":7},{"from":"B","to":"C","w":5},{"from":"B","to":"D","w":8},{"from":"B","to":"E","w":-4},{"from":"C","to":"B","w":-2},{"from":"D","to":"C","w":-3},{"from":"D","to":"E","w":9},{"from":"E","to":"A","w":2},{"from":"E","to":"C","w":7}]}
```

The final distances are A = 0, B = 2, C = 4, D = 7, E = −2. Follow the path to E: A → D (7) → C (7 − 3 = 4) → B (4 − 2 = 2) → E (2 − 4 = −2). Dijkstra would have settled B at 6 as soon as it popped it, then discovered too late that going the long way round through D and C is cheaper.

## Detecting and extracting a negative cycle

After `V − 1` rounds every distance is final *if* there is no negative cycle. So run the relaxation loop once more: if any edge still improves, some node's "shortest path" has `V` or more edges, which means it repeats a node, which means there is a cycle with negative total weight reachable from `src`.

Reporting "there is a cycle" is usually enough. Extracting it takes one more idea: when the V-th round improves `dist[v]`, `v` is either on the cycle or downstream of it. Follow `prev` pointers from `v` exactly `V` times; after that many steps you are guaranteed to be *on* the cycle (you cannot walk `V` steps through `V` nodes without repeating one, and `prev` chains lead into the cycle). Then walk `prev` from there until you return to the same node, and that list is your cycle. This is how an arbitrage detector reports the actual sequence of trades.

A subtlety that catches people: the V-th round detects a negative cycle *reachable from `src`*. If the source cannot reach the cycle, the guard on `INF` means no edge on the cycle ever relaxes and the cycle is invisible. To find negative cycles anywhere in the graph, add a virtual source with a 0-weight edge to every node, or run Floyd-Warshall and check the diagonal.

## Where Bellman-Ford runs: distance-vector routing

RIP, the oldest routing protocol still in use, is distributed Bellman-Ford. Each router keeps its distance to every destination and periodically tells its neighbours; a neighbour relaxes its own table on receipt. There is no `V − 1` round counter because there is no central coordinator; instead, convergence happens as tables propagate. The famous failure is *count to infinity*: when a link goes down, two routers can relax through each other forever, each adding one hop per exchange, which is why RIP defines infinity as 16. The [distance-vector visualisation](/learn/networking/fundamentals/ip-addressing-and-routing) in the networking track shows this. Bellman-Ford's tolerance for arbitrary relaxation order is exactly what makes it distributable, and its slow convergence is exactly why link-state protocols (which run Dijkstra) replaced it in every large network.

## Constrained paths: k rounds means k edges

The induction above says something stronger than "V − 1 rounds is enough": after exactly `k` rounds, `dist[v]` is the cheapest path using at most `k` edges. That is the answer to [Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops): run `k + 1` rounds and read off the distance. One trap: relax against a *copy* of the previous round's distances, not in place, otherwise a single round can chain several edges and you count edges wrong. In-place relaxation is fine for plain Bellman-Ford (it only converges faster), but when the number of rounds carries meaning you need the copy.

## Floyd-Warshall: all pairs by intermediate node

When you need the distance between every pair (routing tables, the "hub" in a network, the diameter of a graph, transitive closure of a relation), you could run Dijkstra from every node: `O(V · E log V)`. On a dense graph that is `O(V³ log V)`, and Floyd-Warshall does it in `O(V³)` with three nested loops and no data structure at all.

The state is `d[k][i][j]`: the shortest path from `i` to `j` using only nodes `{0, …, k − 1}` as intermediates. To allow node `k` as well, either you do not use it, `d[k][i][j]`, or you do, in which case the path goes `i ⇝ k ⇝ j` and each half uses only smaller intermediates:

$$ d[k+1][i][j] = \min\big(d[k][i][j],\; d[k][i][k] + d[k][k][j]\big) $$

Because row `k` and column `k` do not change during iteration `k` (`d[i][k] + d[k][k]` with `d[k][k] = 0` cannot improve `d[i][k]`), you can drop the first index and update in place:

```python
def floyd_warshall(n, edges):
    INF = float("inf")
    d = [[INF] * n for _ in range(n)]
    for i in range(n):
        d[i][i] = 0
    for u, v, w in edges:
        d[u][v] = min(d[u][v], w)          # keep the cheapest parallel edge
    for k in range(n):                     # k MUST be the outer loop
        for i in range(n):
            dik = d[i][k]
            if dik == INF:
                continue
            for j in range(n):
                if dik + d[k][j] < d[i][j]:
                    d[i][j] = dik + d[k][j]
    return d
```

```viz
{"type": "graph", "algorithm": "floyd-warshall", "directed": true,
 "title": "Floyd-Warshall on a four-node graph",
 "nodes": [{"id":"A","x":10,"y":20},{"id":"B","x":90,"y":20},{"id":"C","x":90,"y":80},{"id":"D","x":10,"y":80}],
 "edges": [{"from":"A","to":"B","w":3},{"from":"B","to":"C","w":1},{"from":"A","to":"C","w":7},{"from":"C","to":"D","w":2},{"from":"D","to":"A","w":6}]}
```

Work the example by hand for one pair. `d[A][C]` starts at 7 (the direct edge). When `k = B`, the update checks `d[A][B] + d[B][C] = 3 + 1 = 4 < 7` and sets `d[A][C] = 4`. When `k = C`, `d[A][D]` becomes `d[A][C] + d[C][D] = 4 + 2 = 6`, and it uses the *already improved* `d[A][C]`, which is legal because C's row and column were finalised with respect to intermediates `{A, B}` before this iteration began.

**The loop order matters.** If `k` is the inner loop, the recurrence you are computing is "shortest path from `i` to `j` using at most one intermediate", which is wrong. Interviewers who ask you to write Floyd-Warshall are mostly checking that you know which loop goes outside and can say why: `k` is the *stage* of the DP, and every stage must complete before the next begins.

**Negative cycles.** Floyd-Warshall handles negative edges for free. After the loops, a negative value on the diagonal, `d[i][i] < 0`, means node `i` lies on a negative cycle; that is the global check Bellman-Ford could not do from a single source.

**Reconstructing paths.** Keep `nxt[i][j]`, the first hop on the best-known path from `i` to `j`, initialised to `j` for each edge. When `d[i][j]` improves through `k`, set `nxt[i][j] = nxt[i][k]`. To print the path, hop `i = nxt[i][j]` until you reach `j`.

**Same shape, different algebra.** Replace `min` and `+` with `or` and `and` and you get transitive closure (can `i` reach `j`?), which is Warshall's original algorithm and runs sixty-four times faster with bitsets. Replace them with `max` and `min` and you get the widest path between every pair. The three loops are a template for any semiring.

## Choosing the algorithm

| Situation | Algorithm | Cost |
|---|---|---|
| Non-negative weights, one source | Dijkstra | `O((V + E) log V)` |
| Negative edges possible, one source | Bellman-Ford | `O(VE)` |
| Need to detect or extract a negative cycle | Bellman-Ford (from a virtual source) or Floyd-Warshall diagonal | `O(VE)` / `O(V³)` |
| Paths limited to `k` edges | `k` rounds of Bellman-Ford with a copied array | `O(kE)` |
| All pairs, dense graph or `V ≲ 500` | Floyd-Warshall | `O(V³)` |
| All pairs, sparse graph, non-negative | Dijkstra from every node | `O(V · E log V)` |
| All pairs, sparse graph, negative edges | Johnson: one Bellman-Ford to reweight, then `V` Dijkstras | `O(V · E log V)` |

Johnson's algorithm is worth a sentence: run Bellman-Ford once from a virtual source to get a potential `h(v)` for every node, reweight each edge as `w + h(u) − h(v)` (which is provably non-negative and preserves shortest paths), then run Dijkstra from every node. It is the technique behind "reduced costs" in optimisation generally and comes up when an interviewer asks "all pairs, sparse, negative edges, faster than V³".

`O(VE)` sounds terrible next to Dijkstra, and on a large sparse graph it is: `V = 10⁶, E = 10⁷` is `10¹³` operations. In practice the early exit makes Bellman-Ford converge in a handful of rounds on graphs without adversarial edge order, and the queue-based variant (SPFA, which only re-relaxes edges out of nodes whose distance changed) is often as fast as Dijkstra, until someone feeds it a grid graph and it degrades to its `O(VE)` worst case. Do not use SPFA in anything with an SLA.

## Exercises

```exercise
id: bellman-ford-with-cycle-check
title: Bellman-Ford with negative-cycle detection
prompt: |
  Implement `bellman_ford(n, edges, src)`. Nodes are `0..n-1`; `edges` is a
  list of directed `[u, v, w]` triples where `w` may be negative.

  Return an object `{"dist": [...], "negativeCycle": false}` where `dist[v]` is
  the shortest distance from `src` (use `null`/`None` for unreachable nodes).
  If a negative cycle is reachable from `src`, return
  `{"dist": [], "negativeCycle": true}` instead. A negative cycle that `src`
  cannot reach must NOT be reported. Use the same key names in both languages.
languages: [python, javascript]
entry: bellman_ford
starter:
  python: |
    def bellman_ford(n, edges, src):
        INF = float("inf")
        dist = [INF] * n
        dist[src] = 0
        # relax all edges n-1 times, then check once more
        return {"dist": [], "negativeCycle": False}
  javascript: |
    function bellman_ford(n, edges, src) {
      const dist = new Array(n).fill(Infinity);
      dist[src] = 0;
      // relax all edges n-1 times, then check once more
      return { dist: [], negativeCycle: false };
    }
tests:
  - args: [5, [[0,1,6],[0,3,7],[1,2,5],[1,3,8],[1,4,-4],[2,1,-2],[3,2,-3],[3,4,9],[4,0,2],[4,2,7]], 0]
    expected: {"dist": [0, 2, 4, 7, -2], "negativeCycle": false}
    label: the graph from the lesson
  - args: [3, [[0,1,1],[1,2,-1],[2,1,-1]], 0]
    expected: {"dist": [], "negativeCycle": true}
    label: reachable negative cycle
  - args: [3, [[0,1,4]], 0]
    expected: {"dist": [0, 4, null], "negativeCycle": false}
    label: unreachable node
  - args: [4, [[0,1,1],[2,3,-1],[3,2,-1]], 0]
    expected: {"dist": [0, 1, null, null], "negativeCycle": false}
    label: negative cycle the source cannot reach
  - args: [1, [], 0]
    expected: {"dist": [0], "negativeCycle": false}
  - args: [4, [[0,1,5],[0,2,2],[2,1,-4],[1,3,1]], 0]
    expected: {"dist": [0, -2, 2, -1], "negativeCycle": false}
    hidden: true
  - args: [3, [[0,1,1],[1,2,0],[2,1,0]], 0]
    expected: {"dist": [0, 1, 1], "negativeCycle": false}
    hidden: true
    label: zero-weight cycle is not negative
  - args: [4, [[2,3,1],[1,2,1],[0,1,1]], 0]
    expected: {"dist": [0, 1, 2, 3], "negativeCycle": false}
    hidden: true
    label: edge order forces every round
hints:
  - "Skip an edge whose tail is still at infinity; otherwise unreachable cycles get reported."
  - "After n-1 rounds, one more pass that improves anything means a reachable negative cycle."
  - "Convert infinity to null/None only when building the result."
```

```exercise
id: floyd-warshall-matrix
title: Floyd-Warshall distance matrix
prompt: |
  Implement `floyd_warshall(n, edges)` for a directed graph without negative
  cycles (negative edges are allowed). Return an `n × n` matrix where entry
  `[i][j]` is the shortest distance from `i` to `j`, `0` on the diagonal and
  `null`/`None` when `j` is unreachable from `i`. Parallel edges may occur;
  keep the cheapest.
languages: [python, javascript]
entry: floyd_warshall
starter:
  python: |
    def floyd_warshall(n, edges):
        INF = float("inf")
        d = [[INF] * n for _ in range(n)]
        # diagonal, edges, then k / i / j
        return d
  javascript: |
    function floyd_warshall(n, edges) {
      const d = Array.from({ length: n }, () => new Array(n).fill(Infinity));
      // diagonal, edges, then k / i / j
      return d;
    }
tests:
  - args: [4, [[0,1,3],[1,2,1],[0,2,7],[2,3,2],[3,0,6]]]
    expected: [[0,3,4,6],[9,0,1,3],[8,11,0,2],[6,9,10,0]]
    label: the graph from the visualisation
  - args: [2, []]
    expected: [[0,null],[null,0]]
    label: no edges
  - args: [3, [[0,1,4],[0,2,1],[2,1,-2]]]
    expected: [[0,-1,1],[null,0,null],[null,-2,0]]
    label: negative edge
  - args: [1, []]
    expected: [[0]]
  - args: [2, [[0,1,5],[0,1,2]]]
    expected: [[0,2],[null,0]]
    hidden: true
    label: parallel edges
  - args: [3, [[0,1,1],[1,2,1],[2,0,1]]]
    expected: [[0,1,2],[2,0,1],[1,2,0]]
    hidden: true
    label: directed cycle
hints:
  - "`k` is the outer loop; `i` and `j` inside. Say why before you write it."
  - "Initialise `d[u][v] = min(d[u][v], w)` so parallel edges keep the cheapest."
  - "Skip the inner loop when `d[i][k]` is infinite; it saves time and avoids inf arithmetic."
```

## Senior signals

- You can prove the `V − 1` bound by induction on path length and notice that the proof never uses the sign of a weight.
- You know the V-th round detects only cycles *reachable from the source*, and you add a virtual source or check the Floyd-Warshall diagonal when you need a global answer.
- You relax against a copy when the round count carries meaning (k stops), and in place when it does not.
- You can explain why `k` is Floyd-Warshall's outer loop in terms of DP stages, and you see `min/+` as one instance of a semiring that also gives transitive closure and widest paths.
- You know that distance-vector routing is distributed Bellman-Ford, that count-to-infinity is its failure mode, and that link-state protocols replaced it for that reason.
- You treat SPFA as a benchmark trick with an adversarial worst case, not a production algorithm, and you can name Johnson's reweighting for the sparse all-pairs case.

## Check yourself

```quiz
- q: >-
    A graph has no negative cycle, and the shortest path from the source to node X uses 4 edges. After how many full rounds of Bellman-Ford is dist[X] guaranteed to be correct, regardless of edge order?
  options: ["V − 1 always", "4", "1", "It depends on the weights"]
  answer: 1
  explanation: >-
    Round i finalises every node whose shortest path has at most i edges, by induction on the path. V − 1 is the worst case over all nodes, not the bound for a specific one. With a lucky edge order it can be faster, but 4 rounds is the guarantee.
- q: >-
    You omit the `dist[u] != INF` guard and represent infinity as the integer 10^18. What can go wrong?
  options: ["It overflows on the first addition and crashes the program", "Only the early exit breaks, so it always runs V − 1 rounds", "Unreachable nodes can gain finite distances and phantom cycles", "Nothing; the comparison still fails for unreachable nodes"]
  answer: 2
  explanation: >-
    10^18 + (−3) < 10^18 is true, so relaxation proceeds from an unreachable node. That produces bogus finite distances and lets a negative cycle the source cannot reach trigger the V-th round check. A 64-bit integer holds about 9.2 × 10^18, so small weights do not overflow; the bug is silent. Float infinity happens to behave, which is why it hides in Python and appears in C++.
- q: >-
    Why must `k` be the outermost loop in Floyd-Warshall?
  options: ["For cache locality: the inner loop then scans a single row", "It doesn't; any loop order converges to the same distances", "Stage k must finish for all pairs before stage k+1 uses it", "So the diagonal d[k][k] is updated before any pair uses it"]
  answer: 2
  explanation: >-
    d[i][j] at stage k means the best path using only intermediates below k, and stage k+1 builds on d[i][k] and d[k][j] from that stage. If k varies innermost, you compute 'at most one intermediate' paths and miss multi-hop improvements. Locality is a real but secondary concern.
- q: >-
    You need the cheapest route with at most 3 stops between two airports. What is the right approach?
  options: ["Floyd-Warshall, then read d[src][dst] from the matrix", "4 rounds of Bellman-Ford, relaxing against a copied array", "4 rounds of Bellman-Ford, relaxing in place to save memory", "Dijkstra, stopping as soon as the destination is popped"]
  answer: 1
  explanation: >-
    Three stops means at most four flights, and k rounds against a copy of the previous round's distances computes 'cheapest using at most k edges' exactly. In-place relaxation can chain several edges within one round and violate the limit. Dijkstra's per-node 'settled' invariant fails when a cheaper path may be disqualified by edge count, and Floyd-Warshall ignores the limit entirely.
- q: >-
    After Floyd-Warshall finishes, d[3][3] = −5. What does it mean?
  options: ["The cheapest edge out of node 3 has weight −5", "A bug; the diagonal is set to 0 and can never change", "Node 3 lies on a cycle whose total weight is negative", "Node 3 cannot reach itself, so −5 marks it as unreachable"]
  answer: 2
  explanation: >-
    The diagonal starts at 0 and can only decrease if some cycle through i has negative total weight, so shortest paths through node 3 are undefined. This is the global negative-cycle check Bellman-Ford from a single source cannot provide.
```

---
slug: bellman-ford-and-floyd-warshall
title: "Bellman-Ford and Floyd-Warshall: relaxation without the invariant"
description: Why V−1 rounds of relaxation are enough, how the V-th round exposes a negative cycle, the DP behind Floyd-Warshall and the loop order that breaks it, and which algorithm to pick for which graph.
minutes: 55
difficulty: medium
tags: [graphs, shortest-path, bellman-ford, floyd-warshall, negative-cycle, all-pairs, dynamic-programming]
problems: [cheapest-flights-k-stops, network-delay-time]
---
Dijkstra's proof needed one thing: extending a path never makes it cheaper. Currency exchange rates break that immediately. Convert the rate `r` into an edge weight `−log r` and the sum of weights along a path is the negative log of the product of rates, so a *negative cycle* is a sequence of trades that ends with more money than it started with. Dijkstra cannot find it; it cannot even compute correct distances when a single edge is negative. The same shape shows up in schedules with slack, in "cost minus rebate" networks, and in any problem where you have reduced costs by subtracting a potential.

Two algorithms handle this. Bellman-Ford drops the priority queue and relaxes every edge, `V − 1` times, then uses one more round to detect a negative cycle. Floyd-Warshall answers a different question, the shortest path between *every* pair, with a three-line dynamic program. Both are slower than Dijkstra by an amount you must be able to justify, and both are correct on graphs where Dijkstra is wrong.

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

By hand, with the edges relaxed in place and in the order they are listed above (A→B, A→D, B→C, B→D, B→E, C→B, D→C, D→E, E→A, E→C). Each row is the distance vector after a full round; the last column lists the relaxations that fired.

| Round | A | B | C | D | E | Improvements in this round |
|---|---|---|---|---|---|---|
| start | 0 | ∞ | ∞ | ∞ | ∞ | |
| 1 | 0 | 6 | 4 | 7 | 2 | A→B 6, A→D 7, B→C 11, B→E 2, D→C 4 (11 → 4, later in the same round) |
| 2 | 0 | 2 | 4 | 7 | 2 | C→B 2 (4 − 2 < 6) |
| 3 | 0 | 2 | 4 | 7 | −2 | B→E −2 (2 − 4 < 2) |
| 4 | 0 | 2 | 4 | 7 | −2 | none: early exit |

Round 1 did more than "one edge per node" because relaxation is in place: D→C used the `dist[D] = 7` set moments earlier in the same round, so C reached 4 after one round even though its shortest path A→D→C has two edges. The check round (a fifth pass) fires nothing, so there is no reachable negative cycle. `prev` at the end reads B←C, C←D, D←A, E←B: the path to E is A → D (7) → C (7 − 3 = 4) → B (4 − 2 = 2) → E (2 − 4 = −2). Dijkstra would have settled B at 6 as soon as it popped it, then discovered too late that going the long way round through D and C is cheaper.

The same graph relaxed against a **copy** of the previous round's vector gives a different table, and the difference is the point of the copy:

| Round `k` | A | B | C | D | E | Meaning |
|---|---|---|---|---|---|---|
| 1 | 0 | 6 | ∞ | 7 | ∞ | cheapest using at most 1 edge |
| 2 | 0 | 6 | 4 | 7 | 2 | at most 2 edges (C via A→D→C, E via A→B→E) |
| 3 | 0 | 2 | 4 | 7 | 2 | at most 3 edges (B via A→D→C→B) |
| 4 | 0 | 2 | 4 | 7 | −2 | at most 4 edges (E via A→D→C→B→E) |

In-place relaxation converges in fewer rounds (three instead of four here) because improvements chain inside a round; the copied version converges more slowly but every row means something exact, which is what the "at most k stops" problems need.

## Detecting and extracting a negative cycle

After `V − 1` rounds every distance is final *if* there is no negative cycle. So run the relaxation loop once more: if any edge still improves, some node's "shortest path" has `V` or more edges, which means it repeats a node, which means there is a cycle with negative total weight reachable from `src`.

Reporting "there is a cycle" is usually enough. Extracting it takes one more idea: when the V-th round improves `dist[v]`, `v` is either on the cycle or downstream of it. Follow `prev` pointers from `v` exactly `V` times; after that many steps you are guaranteed to be *on* the cycle (you cannot walk `V` steps through `V` nodes without repeating one, and `prev` chains lead into the cycle). Then walk `prev` from there until you return to the same node, and that list is your cycle. This is how an arbitrage detector reports the actual sequence of trades.

Trace it on five nodes with edges 0→1 (4), 1→2 (−2), 2→3 (1), 3→1 (−1), 2→4 (3). The cycle 1→2→3→1 weighs −2, and node 4 hangs off it.

| Round | dist[0..4] | Improvements | prev[1..4] |
|---|---|---|---|
| 1 | 0, 2, 2, 3, 5 | 0→1 4, 1→2 2, 2→3 3, 3→1 2, 2→4 5 | 3, 1, 2, 2 |
| 2 | 0, 0, 0, 1, 3 | every cycle edge again, and 2→4 | 3, 1, 2, 2 |
| 3 | 0, −2, −2, −1, 1 | the same four | 3, 1, 2, 2 |
| 4 | 0, −4, −4, −3, −1 | the same four | 3, 1, 2, 2 |
| 5 (check) | 0, −6, −6, −5, −3 | still improving: negative cycle | 3, 1, 2, 2 |

Every round lowers the cycle's nodes by exactly the cycle weight, 2, which is the signature of the fault: distances that keep falling by a constant. Note that `prev` stopped changing after round 1; it already describes the cycle. Now extract it. The check round's last improvement was 2→4, so start at `v = 4` and walk `prev` five times: 4 → 2 → 1 → 3 → 2 → 1. The walk entered the cycle at the second step and the node you land on after `V` steps, 1, is on it. Walk `prev` from 1 until it comes back: 1 → 3 → 2 → 1. Reverse that and you have the cycle in edge direction, 1 → 2 → 3 → 1, weight −2 − 1 + 1 = −2. Had you started the walk at node 4 and stopped as soon as you saw a repeat, you would also have found it; walking exactly `V` steps is the version that needs no visited set.

A subtlety that catches people: the V-th round detects a negative cycle *reachable from `src`*. If the source cannot reach the cycle, the guard on `INF` means no edge on the cycle ever relaxes and the cycle is invisible. To find negative cycles anywhere in the graph, add a virtual source with a 0-weight edge to every node, or run Floyd-Warshall and check the diagonal.

## Where Bellman-Ford runs: distance-vector routing

RIP is distributed Bellman-Ford; [RFC 2453](https://www.rfc-editor.org/rfc/rfc2453.txt) notes the algorithm was routing the ARPANET by 1969. Each router keeps its distance to every destination and periodically tells its neighbours; a neighbour relaxes its own table on receipt. There is no `V − 1` round counter because there is no central coordinator; instead, convergence happens as tables propagate. The famous failure is *count to infinity*: when a link goes down, two routers can relax through each other forever, each adding one hop per exchange, which is why RIP defines infinity as 16. The [distance-vector visualisation](/learn/networking/fundamentals/ip-addressing-and-routing) in the networking track shows this. Bellman-Ford's tolerance for arbitrary relaxation order is exactly what makes it distributable, and its slow convergence is exactly why link-state protocols (which run Dijkstra) replaced it in large networks; the RFC itself scopes RIP to moderate-size ones.

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

Work the whole example by hand, one matrix per stage. Rows are sources, columns are targets, and the entries that changed at each stage are listed above the matrix.

```text
start (edges only)        k = A: D gains DB=9, DC=13
     A  B  C  D                A  B  C  D
  A  0  3  7  ∞             A  0  3  7  ∞
  B  ∞  0  1  ∞             B  ∞  0  1  ∞
  C  ∞  ∞  0  2             C  ∞  ∞  0  2
  D  6  ∞  ∞  0             D  6  9 13  0

k = B: AC=4, DC=10        k = C: AD=6, BD=3         k = D: BA=9, CA=8, CB=11
     A  B  C  D                A  B  C  D                A  B  C  D
  A  0  3  4  ∞             A  0  3  4  6             A  0  3  4  6
  B  ∞  0  1  ∞             B  ∞  0  1  3             B  9  0  1  3
  C  ∞  ∞  0  2             C  ∞  ∞  0  2             C  8 11  0  2
  D  6  9 10  0             D  6  9 10  0             D  6  9 10  0
```

Read the stages as a story. With A allowed as an intermediate, only D benefits, because D→A is the only edge into A: `d[D][B] = 6 + 3`, `d[D][C] = 6 + 7`. With B allowed, `d[A][C]` drops from the direct 7 to `3 + 1 = 4`, and `d[D][C]` improves to `9 + 1 = 10` through the `d[D][B]` computed one stage earlier. With C allowed, A and B finally reach D (`4 + 2` and `1 + 2`), using the already improved `d[A][C] = 4`, which is legal because C's row and column were finalised with respect to intermediates `{A, B}` before this stage began. With D allowed, the cycle closes: B and C can reach A through D, and C reaches B through D and A. Nine entries were finite at the start and sixteen at the end; every improvement used exactly one intermediate stage's row and column, which is the invariant the loop order protects.

**The loop order matters.** If `k` is the inner loop, the recurrence you are computing is "shortest path from `i` to `j` using at most one intermediate", which is wrong. Interviewers who ask you to write Floyd-Warshall are mostly checking that you know which loop goes outside and can say why: `k` is the *stage* of the DP, and every stage must complete before the next begins.

**Negative cycles.** Floyd-Warshall handles negative edges for free. After the loops, a negative value on the diagonal, `d[i][i] < 0`, means node `i` lies on a negative cycle; that is the global check Bellman-Ford could not do from a single source.

**Reconstructing paths.** Keep `nxt[i][j]`, the first hop on the best-known path from `i` to `j`, initialised to `j` for each edge. When `d[i][j]` improves through `k`, set `nxt[i][j] = nxt[i][k]`. To print the path, hop `i = nxt[i][j]` until you reach `j`.

**Same shape, different algebra.** Replace `min` and `+` with `or` and `and` and you get transitive closure (can `i` reach `j`?), which is Warshall's original algorithm and runs sixty-four times faster with bitsets. Replace them with `max` and `min` and you get the widest path between every pair. The three loops are a template for any semiring.

## Under the hood

**Distance-vector routing is Bellman-Ford with no round counter.** In RIP each router advertises its whole distance table to its neighbours every 30 seconds and on change; a neighbour relaxes `dist[dest] = min(dist[dest], dist[via] + 1)` for every destination. Convergence after a link failure exposes the missing invariant. Suppose A reaches X directly (cost 1) and B reaches X via A (cost 2). The A–X link dies. A now hears B advertising X at cost 2 and relaxes to 3 through B; B hears A at 3 and moves to 4; and so on, one hop per exchange, each router relaxing through the other's stale entry. That is **count to infinity**, and RIP caps it by defining 16 as unreachable, so a loop lasts at most about 15 exchanges. Two mitigations are also Bellman-Ford facts in disguise: **split horizon** (never advertise a route back over the interface you learned it from, so B stops telling A about "X via A") and **poison reverse** (advertise it back with cost 16 so the stale entry is overwritten immediately). Link-state protocols replaced this for large networks because Dijkstra on a complete topology converges in one computation instead of one hop per exchange; the [routing algorithms lesson](/learn/networking/network-algorithms/routing-algorithms) has both protocol families.

**SciPy.** `scipy.sparse.csgraph` exposes `bellman_ford`, `floyd_warshall` and `johnson` in Cython over a CSR matrix. `floyd_warshall` densifies the input into an `n × n` `float64` array and runs the three loops in C: `n = 1,000` is 8 MB and about a second of arithmetic (`10⁹` inner steps at roughly one nanosecond each, more if the matrix does not sit in cache); `n = 10,000` is 800 MB and `10¹²` steps, hours. `johnson` is the function to reach for on sparse inputs with negative weights; it raises `NegativeCycleError` when the Bellman-Ford phase detects one.

**NumPy makes Floyd-Warshall three lines.** For each `k`, the whole `i, j` update is one broadcast:

```python
import numpy as np

def floyd_warshall_np(d):
    d = d.copy()                                     # d: n × n float array, np.inf for no edge
    n = d.shape[0]
    for k in range(n):
        d = np.minimum(d, d[:, k, None] + d[None, k, :])
    return d
```

`d[:, k, None]` is column `k` as an `n × 1` array, `d[None, k, :]` is row `k` as `1 × n`, and their sum is the `n × n` matrix of "go through `k`" costs. The Python loop runs `n` times, each iteration a vectorised `n²` operation; for `n = 2,000` that is 2,000 iterations of a 4-million-element op, a few seconds, against minutes for the pure-Python triple loop. The loop over `k` cannot be vectorised away, because stage `k + 1` depends on the finished stage `k`.

**Bitsets for transitive closure.** When the question is reachability rather than distance, each row of the matrix is a bitset and the inner loop becomes `row[i] |= row[k]` whenever bit `k` of `row[i]` is set: 64 entries per machine word, so `n = 5,000` closes in `5,000 × 5,000 × 80` word operations, about `2 × 10⁹`, a couple of seconds in C or with Python's big-int `|` doing the words for you. The [bit tricks lesson](/learn/algorithms/technique-mastery/bit-tricks-in-algorithms) covers the same 64× factor elsewhere.

## Choosing the algorithm

| Situation | Algorithm | Time | Memory | Negative edges | Finds negative cycles |
|---|---|---|---|---|---|
| Non-negative weights, one source | [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) | `O((V + E) log V)` | `O(V + E)` | no | no |
| Negative edges possible, one source | Bellman-Ford | `O(VE)` | `O(V + E)` | yes | reachable ones |
| Any negative cycle anywhere | Bellman-Ford from a virtual source, or Floyd-Warshall diagonal | `O(VE)` / `O(V³)` | `O(V + E)` / `O(V²)` | yes | yes |
| Paths limited to `k` edges | `k` rounds of Bellman-Ford with a copied array | `O(kE)` | `O(V + E)` | yes | not needed |
| All pairs, dense or `V ≲ 500` | Floyd-Warshall | `O(V³)` | `O(V²)` | yes | yes |
| All pairs, sparse, non-negative | Dijkstra from every node | `O(V · E log V)` | `O(V + E)` per run | no | no |
| All pairs, sparse, negative edges | Johnson: one Bellman-Ford to reweight, then `V` Dijkstras | `O(V · E log V)` | `O(V + E)` per run | yes | yes (in the Bellman-Ford phase) |

**Johnson's reweighting** deserves more than a name. Add a virtual source `s` with a 0-weight edge to every node and run Bellman-Ford once; call the result `h(v)`. Because Bellman-Ford ends with every edge satisfying `h(v) ≤ h(u) + w(u, v)` (that is the definition of "no edge still relaxes"), the reweighted cost `w'(u, v) = w(u, v) + h(u) − h(v)` is never negative. Along any path from `a` to `b`, the `h` terms telescope: `w'(path) = w(path) + h(a) − h(b)`, a constant shift for every path between the same pair, so the cheapest path under `w'` is the cheapest under `w`. Now run Dijkstra from every node on `w'` and subtract `h(a) − h(b)` from each answer. It is the technique behind "reduced costs" in optimisation generally and comes up when an interviewer asks "all pairs, sparse, negative edges, faster than V³".

`O(VE)` sounds terrible next to Dijkstra, and on a large sparse graph it is: `V = 10⁶, E = 10⁷` is `10¹³` operations. The early exit makes Bellman-Ford converge in a handful of rounds on graphs whose edge order is not adversarial (on the five-node example, three rounds instead of four), and the queue-based variant **SPFA** (re-relax only the out-edges of nodes whose distance changed, with an in-queue flag so a node is queued at most once at a time) often runs in a small multiple of `E` on random graphs. Its worst case is still `O(VE)`: weights can be arranged so that every node's distance improves `Θ(V)` times, each improvement re-queueing it, and on such inputs SPFA is exactly Bellman-Ford with queue overhead. Do not use SPFA in anything with an SLA; use it as a fast path with Bellman-Ford's round counter as the backstop.

## When n³ is fine

Floyd-Warshall's cost is the same on every input, which makes it easy to budget. The inner step is one addition, one comparison and (sometimes) one store.

| `n` | Inner steps `n³` | Matrix (`float64`) | C, roughly | Pure Python, roughly | Verdict |
|---|---|---|---|---|---|
| 100 | `10⁶` | 80 KB | under a millisecond | half a second | fine anywhere, even per request |
| 400 | `6.4 × 10⁷` | 1.3 MB | tens of milliseconds | tens of seconds | fine offline or with NumPy |
| 2,000 | `8 × 10⁹` | 32 MB | several seconds | hours | batch only, NumPy or C |
| 10,000 | `10¹²` | 800 MB | hours | never | wrong tool: use Johnson or `V` Dijkstras |

The Python column assumes about 50–100 nanoseconds per interpreted inner step; the C column assumes one to a few nanoseconds and a matrix that fits in cache for the small sizes. Both are order-of-magnitude figures that move with the machine. The rule they give: Floyd-Warshall is the right answer up to a few hundred nodes in any language and a couple of thousand with a compiled inner loop, and above that the `n²` memory is the wall before the `n³` time is.

## Failure modes

**Symptom: an unreachable node reports a finite distance, or a negative cycle is reported that the source cannot reach.** Diagnosis: infinity is a big integer and the `dist[u] != INF` guard is missing, so `BIG + (−3) < BIG` relaxes from nowhere. Fix: keep the guard, or use a float infinity, or use a sentinel that the relaxation checks explicitly.

**Symptom: "at most k stops" returns a route with more than k flights.** Diagnosis: relaxation is in place, so a round chained several edges (the in-place table above reaches C in round 1 through a two-edge path). Fix: relax against a copy of the previous round's vector, and run exactly `k + 1` rounds.

**Symptom: Floyd-Warshall returns a matrix where some pairs are `∞` although a path exists.** Diagnosis: `k` is not the outer loop, so only paths with one intermediate were considered. Fix: `for k: for i: for j`, and add a test with a three-hop path whose intermediate nodes have larger indices than the endpoints.

**Symptom: an arbitrage detector fires on cycles with profit `10⁻¹⁵`.** Diagnosis: weights are `−log(rate)` as floats and the sum around a cycle that should be exactly zero comes out at `−2 × 10⁻¹⁶` from rounding. Fix: compare with a tolerance (`dist[u] + w < dist[v] − 1e-9`), or scale rates to fixed-point integers before taking logs, or keep the rates as exact rationals for small graphs.

**Symptom: the queue-based version is fast in tests and times out on one customer's graph.** Diagnosis: SPFA on a grid-like input; count how many times each node is dequeued and you will see numbers close to `V`. Fix: cap the per-node dequeue count at `V − 1` and fall back to reporting a negative cycle, or switch to plain Bellman-Ford with the early exit, or to Johnson when weights allow.

**Symptom: an all-pairs job is killed for memory at `n = 10⁵`.** Diagnosis: `n²` doubles is 80 GB before the algorithm starts. Fix: the question is almost never really all pairs; compute distances from the handful of sources that matter, or run Johnson with sparse Dijkstras and stream the rows out.

## Interviewer follow-ups

**"Detect arbitrage among 200 currencies given a rate table."** Model answer: weight each edge `−log(rate)`, so a cycle with product of rates above 1 has negative total weight; run Bellman-Ford from a virtual source (or Floyd-Warshall, since `200³ = 8 × 10⁶` is instant) and check for a still-improving edge or a negative diagonal; extract the cycle by walking `prev`; compare with a tolerance because the logs are floats. Common wrong answer: Dijkstra on the rates, which cannot represent "going around makes money".

**"All pairs on a sparse graph with 10⁵ nodes and 10⁶ edges, some negative."** Model answer: Johnson: one Bellman-Ford (`O(VE) = 10¹¹` worst case, far less with early exit) to compute potentials, reweight, then `V` Dijkstras at `O(E log V)` each, about `10⁵ × 10⁶ × 17`, which is still huge, so ask whether all pairs is really needed and offer per-source queries. Common wrong answer: Floyd-Warshall, which needs `10¹⁰` matrix entries.

**"Why can RIP be distributed but OSPF's Dijkstra cannot be run the same way?"** Model answer: Bellman-Ford's correctness does not depend on relaxation order, so each router can relax with whatever its neighbours send and the global result still converges; Dijkstra needs a single global priority order, so every router must hold the whole topology and run the algorithm locally. Common wrong answer: "OSPF is distributed too", which confuses distributing the topology with distributing the computation.

**"Prove that k rounds against a copy gives the cheapest path with at most k edges."** Model answer: induction on `k`; round `k` reads only round `k − 1` values, and the best path with at most `k` edges is either a path with at most `k − 1` edges or a path with at most `k − 1` edges plus one final edge, which is exactly the `min` the round computes. Common wrong answer: quoting the `V − 1` bound without noticing it is the special case `k = V − 1`.

## What mid-level engineers get wrong

- **Running Dijkstra anyway because "the negative edges are rare".** One negative edge on the shortest path is enough for a wrong answer, and the failure is silent.
- **Always running all `V − 1` rounds.** Without the early exit, Bellman-Ford on a well-ordered graph does `V − 1` full passes where three would do; on a `10⁵`-node graph that is the difference between milliseconds and minutes.
- **Reporting a negative cycle the source cannot reach as an error, or missing one it can.** Both come from the `INF` guard; understand what it protects and the two cases separate.
- **Reaching for Floyd-Warshall on a large sparse graph.** `n = 10⁴` is 800 MB and `10¹²` steps; `V` Dijkstras are `10⁴ × E log V` and stream.
- **Using SPFA in production because it was fast in the benchmark.** Its worst case is the algorithm it was meant to replace, and adversarial inputs exist.
- **Comparing float distances with `<`.** Rounding turns zero-weight cycles into "negative" ones and makes two equal paths compare unequal.

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

- You can prove the `V − 1` bound by induction on path length, notice that the proof never uses the sign of a weight, and show on a five-node table why in-place relaxation converges in fewer rounds than the copied version.
- You know the V-th round detects only cycles *reachable from the source*, and you add a virtual source or check the Floyd-Warshall diagonal when you need a global answer; you can extract the cycle by walking `prev` exactly `V` times.
- You relax against a copy when the round count carries meaning (k stops), and in place when it does not.
- You can explain why `k` is Floyd-Warshall's outer loop in terms of DP stages, write out the matrix after each stage, and see `min/+` as one instance of a semiring that also gives transitive closure and widest paths.
- You budget `n³` with numbers: a few hundred nodes anywhere, a couple of thousand with NumPy or C, and Johnson or repeated Dijkstra beyond that because the `n²` matrix runs out of memory first.
- You know that distance-vector routing is distributed Bellman-Ford, that count-to-infinity is its failure mode and split horizon and poison reverse are the patches, and that link-state protocols replaced it for that reason.
- You treat SPFA as a benchmark trick with an adversarial worst case, not a production algorithm, and you can derive Johnson's reweighting from the "no edge still relaxes" condition.
- You compare `−log(rate)` weights with a tolerance, because floating-point rounding manufactures negative cycles of `10⁻¹⁶`.

## Check yourself

```quiz
- q: >-
    A graph has no negative cycle, and the shortest path from the source to node X uses 4 edges. After how many full rounds of Bellman-Ford is dist[X] guaranteed to be correct, regardless of edge order?
  options: ["It depends on the weights", "4", "1", "V − 1 always"]
  answer: 1
  explanation: >-
    Round i finalises every node whose shortest path has at most i edges, by induction on the path. V − 1 is the worst case over all nodes, not the bound for a specific one. With a lucky edge order it can be faster, but 4 rounds is the guarantee.
- q: >-
    You omit the `dist[u] != INF` guard and represent infinity as the integer 10^18. What can go wrong?
  options: ["Unreachable nodes can gain finite distances and phantom cycles", "Only the early exit breaks, so it always runs V − 1 rounds", "Nothing; the comparison still fails for unreachable nodes", "It overflows on the first addition and crashes the program"]
  answer: 0
  explanation: >-
    10^18 + (−3) < 10^18 is true, so relaxation proceeds from an unreachable node. That produces bogus finite distances and lets a negative cycle the source cannot reach trigger the V-th round check. A 64-bit integer holds about 9.2 × 10^18, so small weights do not overflow; the bug is silent. Float infinity happens to behave, which is why it hides in Python and appears in C++.
- q: >-
    Why must `k` be the outermost loop in Floyd-Warshall?
  options: ["For cache locality: the inner loop then scans a single row", "So the diagonal d[k][k] is updated before any pair uses it", "It doesn't; any loop order converges to the same distances", "Stage k must finish for all pairs before stage k+1 uses it"]
  answer: 3
  explanation: >-
    d[i][j] at stage k means the best path using only intermediates below k, and stage k+1 builds on d[i][k] and d[k][j] from that stage. If k varies innermost, you compute 'at most one intermediate' paths and miss multi-hop improvements. Locality is a real but secondary concern.
- q: >-
    You need the cheapest route with at most 3 stops between two airports. What is the right approach?
  options: ["Floyd-Warshall, then read d[src][dst] from the matrix", "4 rounds of Bellman-Ford, relaxing in place to save memory", "Dijkstra, stopping as soon as the destination is popped", "4 rounds of Bellman-Ford, relaxing against a copied array"]
  answer: 3
  explanation: >-
    Three stops means at most four flights, and k rounds against a copy of the previous round's distances computes 'cheapest using at most k edges' exactly. In-place relaxation can chain several edges within one round and violate the limit. Dijkstra's per-node 'settled' invariant fails when a cheaper path may be disqualified by edge count, and Floyd-Warshall ignores the limit entirely.
- q: >-
    After Floyd-Warshall finishes, d[3][3] = −5. What does it mean?
  options: ["The cheapest edge out of node 3 has weight −5", "A bug; the diagonal is set to 0 and can never change", "Node 3 lies on a cycle whose total weight is negative", "Node 3 cannot reach itself, so −5 marks it as unreachable"]
  answer: 2
  explanation: >-
    The diagonal starts at 0 and can only decrease if some cycle through i has negative total weight, so shortest paths through node 3 are undefined. This is the global negative-cycle check Bellman-Ford from a single source cannot provide.
- q: >-
    Johnson's algorithm reweights every edge as w + h(u) − h(v), where h comes from one Bellman-Ford run. Why are the new weights never negative, and why are shortest paths preserved?
  options: ["Bellman-Ford ends with h(v) ≤ h(u) + w; the h terms telescope along paths", "The reweighting is a heuristic; it preserves paths only when h is admissible", "h is the shortest distance to v, so w + h(u) − h(v) is at most zero", "h is the node degree, so the shift cancels out on every cycle"]
  answer: 0
  explanation: >-
    When Bellman-Ford terminates no edge relaxes, which is exactly h(v) ≤ h(u) + w, so w + h(u) − h(v) ≥ 0. Along any path from a to b the intermediate h values cancel, leaving w(path) + h(a) − h(b), a constant shift for that pair, so the ordering of paths between a and b is unchanged. Admissibility is an A* concept and does not apply.
```


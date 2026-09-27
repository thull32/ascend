---
slug: network-delay-time
title: Network Delay Time
difficulty: medium
patterns: [shortest-path]
lists: [ascend-150]
companies: [google, amazon, meta, netflix, akamai]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/shortest-path-pattern
hints:
  - "The signal reaches each node along its fastest route, and the whole network is done when the *slowest* of those fastest routes finishes. So compute shortest times to every node and take the maximum."
  - "Edges have different, non-negative weights, so plain BFS is wrong: fewer hops is not the same as less time. This is single-source shortest paths with non-negative weights, which is Dijkstra's algorithm."
  - "Use a min-heap of (time, node). When you pop a node for the first time, its time is final. Skip stale heap entries for nodes you already finalised."
signatures:
  python:
    name: network_delay_time
    starter: |
      def network_delay_time(times: list[list[int]], n: int, k: int) -> int:
          pass
  javascript:
    name: network_delay_time
    starter: |
      function network_delay_time(times, n, k) {
      }
tests:
  - args: [[[1, 2, 4], [1, 3, 1], [3, 2, 2], [2, 4, 1]], 4, 1]
    expected: 4
    label: the two-hop route to node 2 is faster than the direct one
  - args: [[[1, 2, 3], [1, 3, 4]], 3, 2]
    expected: -1
    label: the source has no outgoing links
  - args: [[], 1, 1]
    expected: 0
    label: a single node is reached immediately
  - args: [[[1, 2, 5]], 2, 1]
    expected: 5
  - args: [[[1, 2, 1], [2, 3, 1]], 4, 1]
    expected: -1
    label: node 4 is unreachable
  - args: [[[2, 1, 3], [2, 3, 2], [3, 1, 0], [1, 4, 6], [3, 4, 10]], 4, 2]
    expected: 8
    hidden: true
    label: a zero-delay link
  - args: [[[1, 2, 9], [1, 2, 3], [2, 3, 1]], 3, 1]
    expected: 4
    hidden: true
    label: parallel links with different delays
  - args: [[[1, 2, 2], [2, 3, 2], [3, 1, 2], [3, 4, 5]], 4, 1]
    expected: 9
    hidden: true
    label: a cycle in the network
  - args: [[[1, 2, 1], [1, 3, 10], [2, 3, 1], [3, 4, 1], [2, 4, 20]], 4, 1]
    expected: 3
    hidden: true
    label: fewest hops is not fastest
time_limit_ms: 4000
---
A network has `n` nodes labelled `1` to `n`. You are given `times`, a list of **directed** links, where `times[i] = [u, v, w]` means a signal sent from `u` reaches `v` after `w` time units.

At time 0, node `k` sends a signal. Every node that receives the signal forwards it immediately along all its outgoing links. Return the time at which **every** node has received the signal. If some node never receives it, return `-1`.

### Examples

| Input | Output | Why |
|---|---|---|
| `times = [[1,2,4],[1,3,1],[3,2,2],[2,4,1]]`, `n = 4`, `k = 1` | `4` | Node 2 is reached at 3 via node 3, not at 4 directly; node 4 then at 3 + 1 = 4, the last to hear it |
| `times = [[1,2,1],[2,3,1]]`, `n = 4`, `k = 1` | `-1` | Nothing links to node 4 |
| `times = []`, `n = 1`, `k = 1` | `0` | The source is the whole network |

### Constraints

- `1 ≤ n ≤ 100`, `1 ≤ k ≤ n`
- `0 ≤ len(times) ≤ 6000`
- `0 ≤ w ≤ 100`; there may be several links between the same pair of nodes

### Follow-up

The interviewer asks: "Some links can have negative delay (a clock correction). What breaks, and what do you use instead?" And then: "This is a CDN: you need the delay from *every* origin to every edge node. Which algorithm now?"

## Solution

### The naive approach

Relax every edge repeatedly until nothing changes: for each link `u → v` with delay `w`, if `dist[u] + w < dist[v]`, lower `dist[v]`. This is Bellman-Ford, and `n - 1` rounds always suffice because a shortest path has at most `n - 1` edges. It costs `O(n·E)`: for `n = 100` and 6,000 links, 600,000 relaxations. Correct and not terrible here, but it does not exploit the fact that all delays are non-negative.

BFS is the tempting wrong answer. BFS finds routes with the fewest **hops**, and the first example is built so that the fewest-hop route to node 2 (direct, time 4) is slower than the two-hop route (time 3).

### The insight

With non-negative weights, the unvisited node with the **smallest tentative time** already has its final time. Any other route to it would have to leave the finalised region through some other unvisited node, which is at least as far away, and non-negative edges can only add time from there. That observation is Dijkstra's algorithm: repeatedly finalise the closest unfinalised node, then relax its outgoing edges.

The answer to the question is then `max(dist)` over all nodes, or `-1` if any `dist` is still infinite: the network is done when the last node hears the signal, and each node hears it along its shortest route.

### The optimal approach

1. Build an adjacency list `graph[u] = [(v, w), ...]`.
2. Push `(0, k)` on a min-heap. Keep a `dist` dict of finalised nodes.
3. Pop `(t, u)`. If `u` is already finalised, skip this stale entry. Otherwise finalise `dist[u] = t` and push `(t + w, v)` for every edge whose target is not yet finalised.
4. If `dist` has all `n` nodes, return `max(dist.values())`, else `-1`.

Trace the first example. Heap `[(0,1)]`. Pop `(0,1)`: finalise 1 at 0; push `(4,2)`, `(1,3)`. Pop `(1,3)`: finalise 3 at 1; push `(3,2)`. Pop `(3,2)`: finalise 2 at 3; push `(4,4)`. Pop `(4,2)`: stale, skip. Pop `(4,4)`: finalise 4 at 4. All four nodes done; the maximum is 4.

```python
import heapq
from collections import defaultdict

def network_delay_time(times: list[list[int]], n: int, k: int) -> int:
    graph: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for u, v, w in times:
        graph[u].append((v, w))

    dist: dict[int, int] = {}
    heap = [(0, k)]
    while heap:
        t, u = heapq.heappop(heap)
        if u in dist:
            continue                      # stale entry: u was finalised earlier
        dist[u] = t
        for v, w in graph[u]:
            if v not in dist:
                heapq.heappush(heap, (t + w, v))
    return max(dist.values()) if len(dist) == n else -1
```

Time `O(E log E)`: every edge can push one heap entry, and each push or pop is logarithmic. Since `E ≤ n²`, `log E ≤ 2 log n`, so this is the usual `O(E log V)`. Space `O(V + E)`.

This "lazy deletion" version leaves stale entries in the heap instead of decreasing keys in place. Python's `heapq` has no decrease-key, and lazy deletion is what production code does too; it costs a larger heap but keeps the code simple. For dense graphs like this one (up to 6,000 edges on 100 nodes), the `O(V²)` array version without a heap is equally good.

### Common mistakes

- **Using BFS.** Correct only when all weights are equal. The first and last tests are designed to break it.
- **Finalising on push instead of on pop.** A node's first *discovered* time is not necessarily its shortest. Only the pop order is sorted.
- **Returning the sum of times.** The signal travels in parallel; the answer is the maximum of the shortest times, not their total.
- **Forgetting stale entries.** Without the `if u in dist: continue` check, a later, larger heap entry for the same node overwrites its final time and re-relaxes its edges with that outdated value. Depending on how `dist` is written, that is either wasted work or a wrong answer.
- **Nodes are 1-indexed.** Arrays sized `n` and indexed by label miss node `n`.

### How to discuss it

Frame it in one sentence: "The network finishes when the farthest node hears the signal, so I need single-source shortest paths and then a max. Weights are non-negative, so Dijkstra." Then justify Dijkstra with the greedy argument above; an interviewer at the senior bar will ask why popping the minimum is safe, and "because the weights are non-negative" is only half the answer.

On the follow-ups: negative delays break Dijkstra because a finalised node could later be improved through a negative edge. Bellman-Ford handles them in `O(V·E)` and detects negative cycles (if an `n`-th round still relaxes something, a negative cycle is reachable). For all-pairs on a small, dense graph, Floyd-Warshall is `O(V³)` and three nested loops; for all-pairs on a large, sparse network, run Dijkstra from every origin, `O(V·E log V)`, and parallelise it, since each source is independent.

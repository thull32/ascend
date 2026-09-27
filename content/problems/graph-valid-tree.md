---
slug: graph-valid-tree
title: Graph Valid Tree
difficulty: medium
patterns: [graph]
lists: [core-75, ascend-150]
companies: [google, meta, linkedin, amazon]
order: 8
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "A tree on n nodes has two properties: it is connected, and it has no cycle. Checking either one alone is not enough."
  - "Count first. A tree on n nodes has exactly n - 1 edges. If the count is wrong you can answer immediately without looking at the structure."
  - "With exactly n - 1 edges, 'connected' and 'acyclic' imply each other. So after the count check, one traversal from node 0 that reaches all n nodes proves it is a tree."
signatures:
  python:
    name: valid_tree
    starter: |
      def valid_tree(n: int, edges: list[list[int]]) -> bool:
          pass
  javascript:
    name: valid_tree
    starter: |
      function valid_tree(n, edges) {
      }
tests:
  - args: [5, [[0, 1], [1, 2], [1, 3], [3, 4]]]
    expected: true
  - args: [5, [[0, 1], [1, 2], [2, 0], [3, 4]]]
    expected: false
    label: a cycle and a separate piece
  - args: [1, []]
    expected: true
    label: a single node is a tree
  - args: [2, []]
    expected: false
    label: two isolated nodes
  - args: [4, [[0, 1], [2, 3]]]
    expected: false
    label: too few edges
  - args: [4, [[0, 1], [1, 2], [2, 3], [3, 0]]]
    expected: false
    label: too many edges
  - args: [4, [[0, 1], [0, 2], [0, 3]]]
    expected: true
    hidden: true
    label: star
  - args: [4, [[0, 1], [1, 2], [2, 0]]]
    expected: false
    hidden: true
    label: right edge count, but a cycle leaves node 3 isolated
  - args: [6, [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5]]]
    expected: true
    hidden: true
  - args: [3, [[1, 0], [2, 0]]]
    expected: true
    hidden: true
    label: edges listed in either direction
time_limit_ms: 4000
---
You are given `n` nodes labelled `0` to `n - 1` and a list of undirected edges, where `edges[i] = [a, b]` joins nodes `a` and `b`. Decide whether these edges form a single valid **tree**: every node is reachable from every other node, and there are no cycles.

Return `true` if they do and `false` otherwise.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 5`, `edges = [[0,1],[1,2],[1,3],[3,4]]` | `true` | Connected, four edges for five nodes, no cycle |
| `n = 4`, `edges = [[0,1],[1,2],[2,0]]` | `false` | Three edges is the right count, but `0-1-2` is a cycle and node 3 is cut off |
| `n = 1`, `edges = []` | `true` | A single node is a tree with no edges |

### Constraints

- `1 ≤ n ≤ 2000`
- `0 ≤ len(edges) ≤ 5000`
- `0 ≤ a, b < n`, `a ≠ b`, and no edge is listed twice

### Follow-up

The interviewer asks: "Edges now arrive one at a time from a stream, and after each one I want to know whether the graph so far is still a forest (no cycles). What do you use?"

## Solution

### The naive approach

Check the two properties separately with brute force. For acyclicity, remove each edge in turn and test whether its endpoints are still connected; if they are, that edge closed a cycle. For connectivity, run a traversal. The acyclicity check is `O(E·(V + E))`, which is wasteful: the structure of trees gives you a much cheaper test.

### The insight

Three facts about a graph with `n` nodes, any two of which imply the third:

1. It is connected.
2. It has no cycles.
3. It has exactly `n - 1` edges.

The reasoning is short enough to say in an interview. Start from `n` isolated nodes, which is `n` components. Adding an edge either merges two components (count drops by one) or joins two nodes already in the same component (which closes a cycle and leaves the count unchanged). To end with **one** component using **only** `n - 1` edges, every edge must have merged, so none closed a cycle. Conversely, if there is no cycle, every edge merged, so `n - 1` edges leave exactly one component.

So: check `len(edges) == n - 1`, then check connectivity. You never need to hunt for cycles explicitly.

### The optimal approach

1. If `len(edges) != n - 1`, return `false`.
2. Build an adjacency list.
3. Traverse from node 0 with an explicit stack, marking nodes when pushed.
4. Return whether the traversal reached all `n` nodes.

Trace the tricky hidden case: `n = 4`, edges `[[0,1],[1,2],[2,0]]`. The count is 3 = `n - 1`, so step 1 passes. The traversal from 0 reaches `{0, 1, 2}` and stops; node 3 was never reached, so the answer is `false`. The cycle is detected indirectly: it "spent" an edge that was needed to connect node 3.

```python
def valid_tree(n: int, edges: list[list[int]]) -> bool:
    if len(edges) != n - 1:
        return False
    adj: list[list[int]] = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen = {0}
    stack = [0]
    while stack:
        u = stack.pop()
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    return len(seen) == n
```

Time `O(V + E)`, and because of the early exit `E = V - 1` whenever the traversal runs, so it is `O(V)`. Space `O(V)` for the adjacency list and the visited set.

The union-find alternative is equally good: after the edge-count check, union each edge's endpoints and return `false` if an edge joins two nodes that already share a root. It avoids building the adjacency list and is the natural answer to the streaming follow-up.

### Common mistakes

- **Checking only acyclicity.** A forest of two separate trees has no cycles but is not a tree. `n = 2, edges = []` catches this.
- **Checking only connectivity.** A connected graph with an extra edge has a cycle. The square test catches it.
- **Detecting cycles with a directed-graph algorithm.** In an undirected adjacency list, every edge appears in both directions, so a naive "have I seen this neighbour?" DFS reports a cycle on the very first edge (it sees the parent again). You need to skip the parent, which is fiddly; the counting argument sidesteps it.
- **Forgetting `n = 1`.** Zero edges, one node: a tree. The count check (`0 == 1 - 1`) handles it.

### How to discuss it

Lead with the three-properties fact and the component-counting argument for it. It turns a problem that looks like "cycle detection plus connectivity" into "count, then one traversal", and it shows you reason about invariants rather than pattern-match on "cycle means DFS with colours".

For the streaming follow-up, union-find is the right tool: each new edge is a `find` on both endpoints and a `union` if they differ; if they already share a root, the new edge closes a cycle and the graph stops being a forest from that point on. With path compression and union by size, each operation is effectively constant (inverse Ackermann), so a stream of millions of edges costs about as much as reading it. That is the same mechanism as [Redundant Connection](/practice/redundant-connection).

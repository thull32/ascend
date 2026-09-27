---
slug: minimum-height-trees
title: Minimum Height Trees
difficulty: medium
patterns: [topological-sort]
lists: [ascend-150]
companies: [google, amazon, meta, snap]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/topological-sort-pattern
hints:
  - "Computing the height from every possible root costs O(n) each, O(n²) total. Where must the best root be, intuitively?"
  - "The best root is in the 'middle' of the tree: the centre of its longest path. Leaves are never good roots (unless n ≤ 2)."
  - "Peel the tree like an onion: remove all current leaves at once, which creates new leaves, and repeat. This is Kahn's algorithm on degrees. The one or two nodes left at the end are the answer."
signatures:
  python:
    name: find_min_height_trees
    starter: |
      def find_min_height_trees(n: int, edges: list[list[int]]) -> list[int]:
          pass
  javascript:
    name: find_min_height_trees
    starter: |
      function find_min_height_trees(n, edges) {
      }
tests:
  - args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]]]
    expected: [2]
    label: odd path has one centre
  - args: [6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]]
    expected: [2, 3]
    label: even path has two centres
  - args: [1, []]
    expected: [0]
    label: single node
  - args: [2, [[0, 1]]]
    expected: [0, 1]
    label: two nodes, both are centres
  - args: [5, [[0, 1], [0, 2], [0, 3], [0, 4]]]
    expected: [0]
    label: star
  - args: [7, [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [4, 6]]]
    expected: [3]
  - args: [8, [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 7]]]
    expected: [2, 5]
    hidden: true
    label: two longest paths share the same centre
  - args: [3, [[0, 1], [0, 2]]]
    expected: [0]
    hidden: true
  - args: [4, [[3, 2], [0, 1], [2, 1]]]
    expected: [1, 2]
    hidden: true
    label: path given out of order
time_limit_ms: 4000
---
You are given an undirected **tree** with `n` nodes labelled `0` to `n - 1`, as a list of `n - 1` edges. You may pick any node as the root. The **height** of a rooted tree is the number of edges on the longest path from the root down to a leaf.

Return every node that, chosen as the root, gives the minimum possible height. Return them in **ascending** order.

### Examples

| Input | Output | Why |
|---|---|---|
| `5`, `[[0,1],[1,2],[2,3],[3,4]]` | `[2]` | Rooted at 2 the height is 2; any other root gives at least 3 |
| `6`, `[[0,1],[1,2],[2,3],[3,4],[4,5]]` | `[2,3]` | Both middle nodes give height 3 |
| `5`, `[[0,1],[0,2],[0,3],[0,4]]` | `[0]` | The hub of a star gives height 1 |

### Constraints

- `1 ≤ n ≤ 2 × 10⁴`
- `len(edges) == n - 1`, and the edges form a tree

### Follow-up

The interviewer asks: "Why can there never be three answers?" And then: "The tree is a network of servers and you want to place one coordinator to minimise the worst-case hop count. Edges now have latencies. Does your algorithm still work?"

## Solution

### The naive approach

Root the tree at each node in turn and compute its height with a BFS. Each BFS is `O(n)`, so the total is `O(n²)`: 4 × 10⁸ steps for `n = 2 × 10⁴`, which is too slow in an interview setting and wasteful because every BFS rediscovers the same structure.

### The insight

The height from root `r` is the distance from `r` to the node farthest from it. To make that as small as possible, `r` should sit in the **middle** of the tree. Precisely: take a longest path in the tree (a diameter) with `D` edges. Any root has height at least `⌈D/2⌉`, because one end of that path is at least that far away. The node or nodes at the centre of the diameter achieve exactly `⌈D/2⌉`. If `D` is even, there is one centre; if odd, there are two adjacent ones. So the answer always has one or two nodes.

You can find the centre without finding the diameter: **peel leaves**. Remove every current leaf simultaneously. The remaining graph is still a tree, every longest path has lost one node from each end, and the centre has not moved. Repeat until one or two nodes remain. This is Kahn's topological-sort loop applied to an undirected tree, with "degree 1" playing the role of "in-degree 0".

### The optimal approach

1. If `n ≤ 2`, every node is an answer.
2. Compute each node's degree. Put every leaf (degree 1) in the first layer.
3. While more than two nodes remain: remove the whole current layer (subtract its size from `remaining`), and for each removed leaf, decrement its neighbour's degree; a neighbour that drops to 1 joins the next layer.
4. The last layer is the answer.

Trace `n = 7`, edges `[[0,1],[1,2],[1,3],[3,4],[4,5],[4,6]]`. Degrees: 0:1, 1:3, 2:1, 3:2, 4:3, 5:1, 6:1. Layer 1: `[0, 2, 5, 6]`, remaining 7 → 3. Node 1 drops to 1 (joins next layer), node 4 drops to 1 (joins). Layer 2: `[1, 4]`, remaining 3 → 1. Node 3 loses **both** its neighbours in this round: its degree goes 2 → 1, at which point it joins the next layer, and then 1 → 0. Layer 3: `[3]`, and `remaining` is 1, so stop. Answer `[3]`.

```python
def find_min_height_trees(n: int, edges: list[list[int]]) -> list[int]:
    if n <= 2:
        return list(range(n))
    adj: list[list[int]] = [[] for _ in range(n)]
    degree = [0] * n
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
        degree[a] += 1
        degree[b] += 1

    layer = [v for v in range(n) if degree[v] == 1]
    remaining = n
    while remaining > 2:
        remaining -= len(layer)
        nxt = []
        for leaf in layer:
            for nb in adj[leaf]:
                degree[nb] -= 1
                if degree[nb] == 1:
                    nxt.append(nb)
        layer = nxt
    return sorted(layer)
```

Time `O(n)`: every node is peeled once and every edge is looked at twice. Space `O(n)`.

### Common mistakes

- **Stopping on an empty queue instead of on `remaining ≤ 2`.** If you peel until nothing is left you lose the answer; stop when one or two nodes remain.
- **Checking the stop condition per leaf instead of per layer.** In the star `[[0,1],[0,2],[0,3],[0,4]]`, popping leaves one at a time until two nodes remain leaves `{0, 4}`, and 4 is not a centre. A layer is only meaningful as a whole (it trims one node from both ends of every longest path at once), so the stop test belongs between layers.
- **Special-casing wrong.** For `n = 1` there are no edges and no leaves; for `n = 2` both nodes are leaves. Handle `n ≤ 2` up front.
- **Treating leaves as candidates.** A leaf is never optimal for `n ≥ 3`, because its only neighbour is strictly better.

### How to discuss it

Start from the diameter argument, because it answers the first follow-up and justifies the algorithm: "The best height is `⌈D/2⌉` where `D` is the diameter, achieved exactly at the centre of a longest path, so there are one or two answers." Then present peeling as a linear-time way to find the centre without computing `D`. Mention that it is Kahn's algorithm in disguise, which is why the problem lives next to [Course Schedule](/practice/course-schedule).

An equally good alternative: BFS from any node to find the farthest node `u`, BFS from `u` to find the farthest node `v` and record parents, then walk the `u`–`v` path to its middle. Two BFS passes, also `O(n)`.

With latencies on edges, peeling layers no longer works, since removing "one layer" removes different distances from different branches. The double-sweep still finds a weighted diameter in a tree (the farthest-node trick holds for non-negative weights), and the best root is the node on that path minimising the larger of its distances to the two ends. If the network is a general graph rather than a tree, this becomes the graph centre problem, typically solved with all-pairs shortest paths.

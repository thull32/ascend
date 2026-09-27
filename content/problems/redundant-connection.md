---
slug: redundant-connection
title: Redundant Connection
difficulty: medium
patterns: [union-find]
lists: [ascend-150]
companies: [google, amazon, meta, bloomberg]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/union-find-pattern
hints:
  - "A tree on n nodes has n - 1 edges; you have n. Exactly one cycle exists, and removing any edge on it leaves a tree. Which of the cycle's edges does the prompt want?"
  - "Process edges in input order and keep track of which nodes are already connected. The first edge whose endpoints are already connected closes the cycle."
  - "Union-find makes 'are u and v already connected?' nearly constant time. The first edge where find(u) == find(v) is the answer, and it is automatically the cycle edge that appears last in the input."
signatures:
  python:
    name: find_redundant_connection
    starter: |
      def find_redundant_connection(edges: list[list[int]]) -> list[int]:
          pass
  javascript:
    name: find_redundant_connection
    starter: |
      function find_redundant_connection(edges) {
      }
tests:
  - args: [[[1, 2], [2, 3], [3, 1]]]
    expected: [3, 1]
    label: triangle
  - args: [[[1, 3], [3, 4], [1, 2], [4, 2], [4, 5]]]
    expected: [4, 2]
    label: the cycle closes before the last edge
  - args: [[[1, 2], [1, 3], [1, 4], [1, 5], [4, 5]]]
    expected: [4, 5]
    label: cycle closed by the final edge
  - args: [[[2, 3], [3, 4], [4, 2], [1, 2], [5, 4]]]
    expected: [4, 2]
  - args: [[[2, 1], [3, 1], [2, 3]]]
    expected: [2, 3]
  - args: [[[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]]]
    expected: [6, 1]
    hidden: true
    label: one big cycle
  - args: [[[3, 4], [1, 2], [2, 4], [3, 5], [2, 5]]]
    expected: [2, 5]
    hidden: true
    label: the cycle only exists after two pieces merge
  - args: [[[1, 4], [3, 4], [1, 3], [1, 2], [4, 5]]]
    expected: [1, 3]
    hidden: true
time_limit_ms: 4000
---
A network started as a **tree** of `n` nodes labelled `1` to `n`, and then one extra undirected edge was added between two nodes that were not already directly joined. You are given all `n` edges as a list, where `edges[i] = [a, b]`.

Return an edge whose removal turns the network back into a tree on all `n` nodes. If several edges qualify, return the one that appears **last** in the input. Return it exactly as it appears in the input.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1,2],[2,3],[3,1]]` | `[3,1]` | All three edges are on the cycle; `[3,1]` is the last of them |
| `[[1,3],[3,4],[1,2],[4,2],[4,5]]` | `[4,2]` | The cycle is `1-3-4-2-1`; `[4,5]` comes later but is not on it |
| `[[1,2],[1,3],[1,4],[1,5],[4,5]]` | `[4,5]` | Cycle `1-4-5-1`; its last edge in the input is `[4,5]` |

### Constraints

- `3 ≤ n ≤ 1000`, and `len(edges) == n`
- `1 ≤ a, b ≤ n`, `a ≠ b`, and no edge is repeated
- The input is always a tree plus one edge

### Follow-up

The interviewer asks: "Now the edges are **directed**: the original was a rooted tree where every node except the root has exactly one parent, and one extra directed edge was added. Return the edge to remove." (The extra edge may create a node with two parents, a cycle, or both.)

## Solution

### The naive approach

Try removing each edge in reverse input order and check whether the remaining `n - 1` edges form a connected graph (a BFS or DFS). The first removal that leaves a tree is the answer. That is `n` traversals of `O(n)` each, `O(n²)` total. It works for `n = 1000`, but it throws away the structure of the problem.

### The insight

Imagine building the network one edge at a time, in input order. As long as edges only join nodes that were not yet connected, you are growing a forest; no cycle exists. The **first** edge whose endpoints are already connected is the one that closes the cycle.

That edge is also the one the prompt wants. The cycle's edges all appear somewhere in the input. Before the last of them is added, the others form a path, not a cycle, so none of them joins two already-connected nodes. The cycle's last edge is precisely the first edge that does. You do not need to find the cycle at all.

"Are these two already connected?" asked incrementally, while edges are only ever added, is the exact question union-find is built for.

### The optimal approach

Keep `parent[v]` (initially `v`) and `size[v]` (initially 1).

- `find(v)`: walk to the root, pointing each visited node at its grandparent as you go (path halving).
- For each edge `[a, b]` in order: if `find(a) == find(b)`, return `[a, b]`. Otherwise link the smaller tree's root under the larger's.

Trace `[[3,4],[1,2],[2,4],[3,5],[2,5]]`. `[3,4]`: different roots, merge `{3,4}`. `[1,2]`: merge `{1,2}`. `[2,4]`: roots differ, merge into `{1,2,3,4}`. `[3,5]`: merge 5 in. `[2,5]`: `find(2)` and `find(5)` share a root. Return `[2,5]`. A solution that only looked for edges touching a previously seen node would have flagged `[2,4]` wrongly: both 2 and 4 had been seen, but in different components.

```python
def find_redundant_connection(edges: list[list[int]]) -> list[int]:
    n = len(edges)
    parent = list(range(n + 1))
    size = [1] * (n + 1)

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]
        if size[ra] < size[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        size[ra] += size[rb]
    return []  # unreachable for valid input
```

Time `O(n·α(n))`, effectively linear. Space `O(n)`.

### Common mistakes

- **"Both endpoints already seen" instead of "already connected".** Seeing a node before says nothing about whether it is in the same component. The hidden test with `[2,4]` exists to catch this.
- **Returning the first cycle edge.** Detecting the cycle with a DFS and returning any of its edges, or the first one, ignores the tie-break. The union-find scan gives the last one for free; a DFS solution must collect the cycle's edges and pick the latest by input index.
- **Linking nodes instead of roots.** `parent[b] = a` without `find` breaks the forest.
- **Normalising the edge.** Return `[4,2]` if the input says `[4,2]`, not `[2,4]`.

### How to discuss it

The key sentence is "the first edge that joins two already-connected nodes is the last cycle edge in input order", with the one-line proof that before the cycle's last edge, its other edges form a path. Then introduce union-find as the data structure for incremental connectivity and state its cost honestly: `α(n)` amortised with both path compression and union by size, `O(log n)` with either one alone.

The directed follow-up is a genuinely harder problem and a favourite for senior loops. There are three cases. If some node has two parents, one of its two incoming edges must go: tentatively skip the later one and run the union-find scan on the rest; if no cycle appears, the later edge was the answer, otherwise the earlier one is. If no node has two parents, the extra edge created a cycle through the root, and the undirected scan above finds it. Laying out the cases before writing code is worth more than the code.

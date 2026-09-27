---
slug: count-components
title: Count Connected Components
difficulty: medium
patterns: [graph]
lists: [ascend-150]
companies: [linkedin, google, amazon, meta]
order: 9
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Start with every node in its own component, so the count begins at n. What happens to the count when you add an edge?"
  - "An edge between two different components merges them and lowers the count by one. An edge inside one component changes nothing."
  - "Union-find answers 'are these already in the same component?' in near-constant time. Alternatively, count how many traversals you have to start to visit every node."
signatures:
  python:
    name: count_components
    starter: |
      def count_components(n: int, edges: list[list[int]]) -> int:
          pass
  javascript:
    name: count_components
    starter: |
      function count_components(n, edges) {
      }
tests:
  - args: [5, [[0, 1], [1, 2], [3, 4]]]
    expected: 2
  - args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]]]
    expected: 1
    label: a single path
  - args: [1, []]
    expected: 1
    label: one node
  - args: [4, []]
    expected: 4
    label: no edges, every node alone
  - args: [4, [[0, 1], [1, 2], [2, 0]]]
    expected: 2
    label: a cycle plus an isolated node
  - args: [6, [[0, 1], [2, 3], [4, 5]]]
    expected: 3
    label: three separate pairs
  - args: [7, [[0, 1], [1, 2], [3, 4], [5, 6], [6, 4]]]
    expected: 2
    hidden: true
    label: a late edge joins two pieces
  - args: [5, [[4, 3], [3, 2], [2, 1], [1, 0]]]
    expected: 1
    hidden: true
    label: path listed backwards
  - args: [10, [[0, 9], [1, 8], [2, 7]]]
    expected: 7
    hidden: true
    label: mostly isolated nodes
time_limit_ms: 4000
---
You are given `n` nodes labelled `0` to `n - 1` and a list of undirected edges, where `edges[i] = [a, b]` joins `a` and `b`. A **connected component** is a maximal set of nodes in which every node can reach every other node along edges.

Return the number of connected components.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 5`, `edges = [[0,1],[1,2],[3,4]]` | `2` | `{0, 1, 2}` and `{3, 4}` |
| `n = 4`, `edges = []` | `4` | No edges, so every node is its own component |
| `n = 4`, `edges = [[0,1],[1,2],[2,0]]` | `2` | The triangle `{0, 1, 2}` and the lone node `3` |

### Constraints

- `1 ≤ n ≤ 2000`
- `0 ≤ len(edges) ≤ 5000`
- `0 ≤ a, b < n`, `a ≠ b`, and no edge is listed twice

### Follow-up

The interviewer asks: "Edges now arrive as a stream, interleaved with queries 'how many components right now?'. Then: edges can also be *deleted*. Which part of your solution survives?"

## Solution

### The naive approach

For each pair of nodes, check whether a path connects them, and group nodes into classes. That is `O(V²)` path queries, each up to `O(V + E)`. Nobody writes this in an interview, but it is worth noticing why it is slow: it asks the reachability question once per pair, when a single traversal answers it for a whole component at once.

### The insight

There are two equally correct views, and a senior candidate knows both.

**Traversal view.** Scan the nodes; each time you meet an unvisited node, start a DFS/BFS that marks its whole component, and add one to the count. The count is the number of traversals you had to start. This is exactly [Number of Islands](/practice/number-of-islands) on an explicit graph.

**Merge view.** Begin with `n` singleton components. Process edges one at a time. An edge between two nodes in *different* components merges them, so the count drops by one; an edge inside one component changes nothing. The answer is `n` minus the number of edges that merged something. Union-find (disjoint-set union) makes "are these in the same component?" nearly constant time.

The merge view has one decisive advantage: it never needs the whole graph in memory at once, and it handles edges arriving over time. That is why it is the reference solution here.

### The optimal approach

Keep a `parent` array where each node initially points to itself, and a `size` array for union by size.

- `find(x)` follows parent pointers to the root, halving the path as it goes (each visited node is pointed at its grandparent), so future finds are shorter.
- `union(a, b)` finds both roots. If they are equal, return `False`. Otherwise attach the smaller tree under the larger and return `True`.

Count starts at `n`; subtract one for each `union` that returned `True`.

Trace the hidden case `n = 7`, edges `[[0,1],[1,2],[3,4],[5,6],[6,4]]`. Start 7. `0-1` merges (6), `1-2` merges (5), `3-4` merges (4), `5-6` merges (3), `6-4` finds root of `{5,6}` and root of `{3,4}`, which differ, so merges (2). Answer 2.

```python
def count_components(n: int, edges: list[list[int]]) -> int:
    parent = list(range(n))
    size = [1] * n

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x

    components = n
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            continue                        # edge inside a component
        if size[ra] < size[rb]:
            ra, rb = rb, ra
        parent[rb] = ra                     # union by size
        size[ra] += size[rb]
        components -= 1
    return components
```

Time `O(V + E·α(V))`, where `α` is the inverse Ackermann function, which is at most 4 for any input that fits in the universe. Space `O(V)`. The traversal view is `O(V + E)` time and space, including the adjacency list; asymptotically they tie.

### Common mistakes

- **Forgetting isolated nodes.** If you only iterate over nodes that appear in `edges`, every isolated node is missed. `n = 4, edges = []` must return 4. Both views handle it if you start from `n` or scan `range(n)`.
- **Union without find.** Writing `parent[b] = a` directly, instead of linking the two *roots*, detaches `b` from its existing component and corrupts the structure.
- **Decrementing on every edge.** Only merges reduce the count. The triangle test has three edges but only two merges.
- **Skipping both optimisations and blaming union-find.** Without path compression or union by size, a path-shaped input makes `find` linear and the whole thing quadratic. Either optimisation alone gives `O(log n)` per operation; both together give `α(n)`.

### How to discuss it

Offer both views in one sentence: "Count traversal starts, or start at `n` and subtract successful unions." Pick union-find if the interviewer hints at streaming or dynamic input, and traversal if they want the simplest code. Then say what each costs: the traversal needs the full adjacency list up front; union-find needs only `O(V)` state and consumes edges in any order.

On deletions: union-find cannot split a set, so it does not survive. Fully dynamic connectivity has specialised polylogarithmic structures, but in practice the answer is usually "process offline": if you know all operations in advance, reverse time so deletions become insertions, or use a segment tree over time with a rollback-capable union-find (union by size, no path compression). Saying that union-find is insert-only, and why, is the senior signal. The same component-counting skeleton reappears in [Number of Provinces](/practice/number-of-provinces) and [Graph Valid Tree](/practice/graph-valid-tree).

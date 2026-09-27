---
slug: clone-graph
title: Clone Graph
difficulty: medium
patterns: [graph]
lists: [core-75, ascend-150]
companies: [meta, google, amazon, uber, bloomberg]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "A deep copy means every node in the result is a brand-new object. The hard part is not creating nodes, it is wiring each copy's neighbour list to other *copies*, not to the originals."
  - "Keep a dictionary from original node to its copy. It is your visited set and your lookup table at the same time: if a neighbour is already in it, reuse that copy instead of creating a second one."
  - "Create the copy the moment you first discover a node (when you push it), then fill in neighbour lists as you pop. That ordering guarantees every node is cloned exactly once, even in cycles."
signatures:
  python:
    name: clone_graph
    starter: |
      def clone_graph(node: "Node | None") -> "Node | None":
          pass
  javascript:
    name: clone_graph
    starter: |
      function clone_graph(node) {
      }
tests:
  - args: [{"$graph": [[2, 4], [1, 3], [2, 4], [1, 3]]}]
    expected: {"$graph": [[2, 4], [1, 3], [2, 4], [1, 3]]}
    label: square (a 4-cycle)
  - args: [{"$graph": [[]]}]
    expected: {"$graph": [[]]}
    label: single node, no neighbours
  - args: [{"$graph": []}]
    expected: {"$graph": []}
    label: empty graph
  - args: [{"$graph": [[2], [1]]}]
    expected: {"$graph": [[2], [1]]}
    label: two nodes, one edge
  - args: [{"$graph": [[2, 3], [1, 3], [1, 2]]}]
    expected: {"$graph": [[2, 3], [1, 3], [1, 2]]}
    label: triangle
  - args: [{"$graph": [[2, 3, 4, 5], [1], [1], [1], [1]]}]
    expected: {"$graph": [[2, 3, 4, 5], [1], [1], [1], [1]]}
    hidden: true
    label: star
  - args: [{"$graph": [[2, 3, 4], [1, 3, 4], [1, 2, 4], [1, 2, 3]]}]
    expected: {"$graph": [[2, 3, 4], [1, 3, 4], [1, 2, 4], [1, 2, 3]]}
    hidden: true
    label: complete graph on four nodes
  - args: [{"$graph": [[2], [1, 3], [2, 4], [3, 5], [4]]}]
    expected: {"$graph": [[2], [1, 3], [2, 4], [3, 5], [4]]}
    hidden: true
    label: path of five nodes
time_limit_ms: 4000
---
You are given a reference to one node of a connected, undirected graph. Every node has an integer `val` and a list `neighbors` of the nodes it is joined to. Return a **deep copy** of the whole graph: a new set of nodes with the same values and the same edge structure, sharing no node objects with the original. Return the copy of the node you were given.

If the input is `None` (`null`), return `None`.

The runner builds each graph from an adjacency list: entry `i` lists the neighbour values of the node whose value is `i + 1`, and you receive the node with value `1`. Your returned node is converted back the same way for comparison. `Node(val, neighbors)` is already defined for you.

### Examples

| Input (adjacency list) | Output | Why |
|---|---|---|
| `[[2,4],[1,3],[2,4],[1,3]]` | `[[2,4],[1,3],[2,4],[1,3]]` | Four nodes in a square. The copy has the same shape but new objects |
| `[[]]` | `[[]]` | One node with no edges; copy it alone |
| `[]` | `[]` | No graph at all; return `None` |

### Constraints

- `0 ≤ number of nodes ≤ 100`
- Node values are unique and run from `1` to `n`
- No self-loops and no repeated edges; the graph is connected

### Follow-up

The interviewer asks: "Node values are no longer unique. Does your solution still work?" And then: "The graph has ten million nodes. What breaks first in a recursive version, and what does the iterative one cost in memory?"

## Solution

### The naive approach

Copy the node you were given, then recursively copy each neighbour and attach it. Without memory of what you have already copied, this never terminates: node 1 copies node 2, which copies node 1 again, which copies node 2 again, forever around the first cycle. Even in an acyclic graph it duplicates any node reachable by two paths, so the copy has more nodes than the original. The naive approach is not slow; it is wrong.

### The insight

Cloning a graph is a traversal where "visit a node" means "make its copy". The one piece of state you need is a map from each **original** node to its **copy**. That map does two jobs at once:

1. **Visited set.** A node already in the map has been discovered, so you do not push it again. This is what makes cycles terminate.
2. **Wiring table.** When you connect `copy(u)` to its neighbours, you need `copy(v)` for each neighbour `v`. The map hands you the existing copy, so every edge points at exactly one clone per original node.

Key the map by node **identity**, not by `val`. It happens that values are unique here, but the object is what you are copying; keying by value is a bug waiting for the follow-up question.

### The optimal approach

Iterative DFS with an explicit stack:

- Clone the start node and put it in the map; push it.
- Pop a node `u`. For each neighbour `v`: if `v` is not in the map, clone it, store it, and push it. Either way, append `map[v]` to `map[u].neighbors`.

Each original node is pushed exactly once (at the moment it is first cloned), so it is popped exactly once, and each of its adjacency entries is appended exactly once. The copy therefore has the same neighbour lists, in the same order.

Trace the square `1-2-3-4-1`. Start: map `{1: 1'}`, stack `[1]`. Pop 1: neighbour 2 is new, clone and push; neighbour 4 is new, clone and push; `1'.neighbors = [2', 4']`. Pop 4: neighbour 1 is known (append `1'`), neighbour 3 is new (clone, push); `4'.neighbors = [1', 3']`. Pop 3: both 2 and 4 are known; `3'.neighbors = [2', 4']`. Pop 2: both known; `2'.neighbors = [1', 3']`. Four clones, eight directed adjacency entries, done.

```python
def clone_graph(node: "Node | None") -> "Node | None":
    if node is None:
        return None
    clones = {node: Node(node.val)}        # original -> copy, keyed by identity
    stack = [node]
    while stack:
        cur = stack.pop()
        for nb in cur.neighbors:
            if nb not in clones:
                clones[nb] = Node(nb.val)   # clone on discovery
                stack.append(nb)
            clones[cur].neighbors.append(clones[nb])
    return clones[node]
```

Time `O(V + E)`: each node is cloned and popped once, each adjacency entry is read once. Space `O(V)` for the map plus the stack, on top of the `O(V + E)` output you are required to build.

In JavaScript, use a `Map` rather than a plain object; a `Map` keys by object identity, while an object would coerce every node to the string `"[object Object]"`.

### Common mistakes

- **Wiring to originals.** Appending `nb` instead of `clones[nb]` produces a "copy" whose edges lead straight back into the input graph. Every test that only looks at values passes; the first mutation of the copy corrupts the original.
- **Cloning on pop instead of on discovery.** If the copy is only created when a node is popped, the map cannot tell you the node is already waiting on the stack, so it is pushed once per neighbour that finds it. Without an extra guard it is then cloned a second time, and the edges already wired to the first copy now point at an orphan.
- **Keying the map by `val`.** Correct only while values are unique. Say out loud that you are keying by identity.
- **Recursion on big graphs.** Recursive DFS is the shortest code, but a path-shaped graph of 10⁵ nodes blows Python's default recursion limit of 1,000. Mention it even if you write the recursive version.

### How to discuss it

Lead with "this is a traversal where visiting means cloning, and the old-to-new map is both my visited set and my wiring table." That sentence shows you understand why cycles are the whole difficulty. BFS and DFS are interchangeable here; say so rather than agonising over the choice.

For the follow-ups: non-unique values change nothing if you keyed by identity, and break everything if you keyed by value. At ten million nodes the recursive version dies on stack depth long before memory; the iterative version costs one hash-map entry per node (tens of bytes each in Python) on top of the copy itself, so plan for the map to be a meaningful fraction of the copy's size. The same "old-to-new map" idea solves copying a linked list with random pointers and deep-copying any object graph, which is how serialisation libraries handle shared references and cycles.

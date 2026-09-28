---
slug: union-find-pattern
title: "Union-find: answering 'same group?' without traversing"
description: Recognise equivalence-class and incremental-connectivity problems, write the path-compressed union-find from memory, and see Redundant Connection, Accounts Merge and Number of Provinces traced with the parent and rank arrays at every union.
minutes: 45
difficulty: medium
tags: [graph, union-find, disjoint-set, connectivity, path-compression, pattern:union-find]
problems: [redundant-connection, accounts-merge, number-of-provinces]
---
Edges arrive one at a time and after each one you need to know whether two nodes are now connected. Or you have thousands of "these two are the same" facts (emails belonging to one person, cells in one island, cities in one province) and need to group everything into equivalence classes. A traversal answers "connected?" in `O(V + E)`; re-running it after each of `E` edges is `O(E · (V + E))`.

Union-find keeps the groups *as they form*. Each node points at a parent; the root of its tree names the group; `find(x)` follows parents to the root; `union(a, b)` hangs one root under the other. With two optimisations that take four lines, a sequence of `m` operations costs `O(m · α(n))`, where `α` is the inverse Ackermann function and never exceeds 4 for any `n` you could store. The data structure and its proofs are taught in [Union-find](/learn/algorithms/graph-algorithms/union-find); this lesson is about when to reach for it in a round and how to execute it without the three bugs that sink it.

## The signal

Reach for union-find when the statement contains any of these:

- **"Are `a` and `b` connected?" asked repeatedly while edges are added**, or **"which edge, when added, creates a cycle?"** ([Redundant Connection](/practice/redundant-connection)). Edges only ever arrive.
- **"Merge groups that share an element"**: accounts sharing an email, synonyms, friends of friends ([Accounts Merge](/practice/accounts-merge), [Number of Provinces](/practice/number-of-provinces)). The relation is an equivalence (reflexive, symmetric, transitive) and you want its classes.
- **"Number of connected components"** from an edge list, when no path or distance is needed.
- **Kruskal's minimum spanning tree**: sort edges by weight, keep an edge if its endpoints are in different sets.
- **Offline threshold queries**: "is there a path using only edges below `limit`?" for many limits. Sort queries and edges, union as the threshold rises.
- **Cells that become land over time**: each new cell adds a component and each successful union with a land neighbour removes one.

What rules it out:

- **You need the path itself, or distances.** Union-find knows membership only: [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal) or [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern).
- **Edges are removed online.** Sets cannot be split. Offline, reverse time so deletions become unions.
- **The relation is directed.** "`a` can reach `b`" is not symmetric; union-find models only symmetric relations.
- **One static query** on a graph you already hold as adjacency lists: a BFS is the same cost and needs no new structure.

| Axis | Union-find | DFS / BFS components | Rebuild after each change |
|---|---|---|---|
| Edges arriving over time | `O(α(n))` per edge | `O(V + E)` per query | `O(V + E)` per change |
| Answers "same group?" | yes, two finds | yes, via labels | yes |
| Gives a path or distance | no | yes | yes |
| Supports deletion | no (offline reversal only) | yes, by recomputing | yes |
| Non-integer nodes | dict-based parent | needs an adjacency map | needs an adjacency map |
| Code under pressure | about 15 lines | about 15 lines plus graph building | trivial, too slow |

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Number of islands" on a fixed grid | Union-find | Flood fill is shorter and equally fast | Nothing arrives over time |
| "Number of islands after each added cell" | Flood fill per addition, `O(k · R·C)` | Union-find, near-`O(1)` per cell | Edges arrive and the count is asked after each |
| "Redundant connection" in a **directed** rooted tree | Undirected union-find | In-degree check for a node with two parents, then union-find | Direction matters: the extra edge may give a node two parents without an undirected cycle |
| "Shortest path between two accounts" | Union-find over shared emails | BFS over the account graph | Union-find forgets which edge joined what |
| "`a / b = 2`, `b / c = 3`, what is `a / c`?" | Plain union-find | Weighted union-find: store the ratio to the parent | The relation carries a value, not only membership |
| "Is this undirected graph a tree?" | DFS with parent tracking | Either; union-find: `n − 1` edges and no failed union | A failed union is exactly a cycle edge |

## The template

`parent` starts as the identity; `rank` (an upper bound on tree height) starts at 0. `find` uses path halving: every node on the walk is pointed at its grandparent. `union` links the lower-rank root under the higher-rank root and **returns whether a merge happened**, which is what cycle detection and component counting consume.

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))          # every node is its own root
        self.rank = [0] * n
        self.count = n                        # number of groups

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)   # always link ROOTS
        if ra == rb:
            return False                      # already together: a cycle edge
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra                  # shorter tree under taller
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1                # equal heights: the result is one taller
        self.count -= 1                       # only on a real merge
        return True
```

```javascript
class UnionFind {
  constructor(n) {
    this.parent = Int32Array.from({ length: n }, (_, i) => i);
    this.rank = new Uint8Array(n);            // rank <= log2(n) < 32
    this.count = n;
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];   // path halving
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    this.count--;
    return true;
  }
}
```

Path halving is the iterative form to type under pressure. Full compression (`parent[x] = find(parent[x])`) is recursive and hits the recursion limit on a long chain before it has had a chance to flatten it. Both give the same amortised bound. For string keys, make `parent` a dict and insert a key on first sight.

Watch parent pointers and roots evolve:

```viz
{"type": "graph", "algorithm": "union-find", "directed": false, "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}], "edges": [{"from": "A", "to": "B"}, {"from": "C", "to": "D"}, {"from": "B", "to": "C"}, {"from": "E", "to": "F"}, {"from": "A", "to": "D"}], "title": "Union-find over an edge list", "caption": "Each edge unions two roots; an edge whose endpoints already share a root closes a cycle."}
```

## Why it is correct, and why it is fast

**Invariant**: *each group is exactly one tree, and two nodes are in the same group if and only if `find` returns the same root.* `union` only ever points a root at a node in a *different* tree, so it cannot create a cycle in the parent pointers, and the two trees become one. Path halving points `x` at its grandparent, an ancestor in the same tree, so it never changes any node's root.

**Rank bounds height.** Claim: a root of rank `r` has at least `2^r` nodes. Rank increases only when two roots of equal rank `r` merge, giving at least `2^r + 2^r = 2^(r+1)` nodes. So rank, and therefore height, is at most `log₂ n`. Watch it on 8 nodes:

| union | `parent[0..7]` after | `rank[0..7]` after |
|---|---|---|
| (0, 1) | `0 0 2 3 4 5 6 7` | `1 0 0 0 0 0 0 0` |
| (2, 3) | `0 0 2 2 4 5 6 7` | `1 0 1 0 0 0 0 0` |
| (0, 2) | `0 0 0 2 4 5 6 7` | `2 0 1 0 0 0 0 0` |
| (4, 5) | `0 0 0 2 4 4 6 7` | `2 0 1 0 1 0 0 0` |
| (6, 7) | `0 0 0 2 4 4 6 6` | `2 0 1 0 1 0 1 0` |
| (4, 6) | `0 0 0 2 4 4 4 6` | `2 0 1 0 2 0 1 0` |
| (0, 4) | `0 0 0 2 0 4 4 6` | `3 0 1 0 2 0 1 0` |

The deepest node, 7, sits at depth 3 (7 → 6 → 4 → 0), which is `log₂ 8`: the worst case union by rank allows.

**Compression flattens what rank could not prevent.** Without rank, unions can build a chain `5 → 4 → 3 → 2 → 1 → 0` (`parent = [0, 0, 1, 2, 3, 4]`). Path halving on it:

| call | pointer updates | `parent[0..5]` after | hops walked |
|---|---|---|---|
| `find(5)` | `p[5] = 3`, `p[3] = 1`, `p[1] = 0` | `0 0 1 1 3 3` | 3 |
| `find(5)` | `p[5] = 1`, `p[1] = 0` | `0 0 1 1 3 1` | 2 |
| `find(4)` | `p[4] = 1`, `p[1] = 0` | `0 0 1 1 1 1` | 2 |

Each find roughly halves the path it walks. Full recursive compression on the first `find(5)` would give `[0, 0, 0, 0, 0, 0]` in one call, at the cost of recursion. With both rank and compression the amortised cost per operation is `O(α(n))` (Tarjan's 1975 analysis; path halving has the same bound). Rank alone gives `O(log n)`; compression alone gives amortised `O(log n)`; neither gives `O(n)` per `find` on a chain.

## Worked problems

### Redundant Connection

[Redundant Connection](/practice/redundant-connection): a tree on nodes 1..n had one extra edge added. Return that edge; if several answers exist, the one that appears last in the input.

Adding one edge to a tree creates exactly one cycle, and the edge that *closes* it is the first whose endpoints are already connected. Process edges in order; the first failed `union` is the answer. "Last in the input" is automatic: every other edge of the cycle appeared before the closing edge.

```python
def find_redundant_connection(edges):
    uf = UnionFind(len(edges) + 1)            # nodes are 1-indexed: slot 0 unused
    for a, b in edges:
        if not uf.union(a, b):
            return [a, b]
```

Trace on `[[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]`:

| edge | `find(a)`, `find(b)` | action | `parent[1..5]` after | `rank[1..5]` after | groups |
|---|---|---|---|---|---|
| (1, 2) | 1, 2 | equal ranks: `parent[2] = 1`, `rank[1] = 1` | `1 1 3 4 5` | `1 0 0 0 0` | 4 |
| (2, 3) | 1, 3 | rank 1 > 0: `parent[3] = 1` | `1 1 1 4 5` | `1 0 0 0 0` | 3 |
| (3, 4) | 1, 4 | `parent[4] = 1` | `1 1 1 1 5` | `1 0 0 0 0` | 2 |
| (1, 4) | 1, 1 | same root: **return `[1, 4]`** | | | |

`(1, 5)` is never examined. `O(E · α(n))` against `O(E²)` for "traverse the edges so far before adding each one", which is the difference the problem exists to test.

### Accounts Merge

[Accounts Merge](/practice/accounts-merge): each account is `[name, email1, email2, …]`. Accounts sharing any email belong to one person; names can repeat across different people. Output each person's name and sorted, deduplicated emails.

The nodes are *accounts*; emails are the evidence. Map each email to the first account that showed it; when an email reappears, union the two accounts. Then group emails by their account's root.

```python
from collections import defaultdict

def accounts_merge(accounts):
    uf = UnionFind(len(accounts))
    owner = {}                                # email -> first account index
    for i, (_, *emails) in enumerate(accounts):
        for e in emails:
            if e in owner:
                uf.union(i, owner[e])         # shared email: same person
            else:
                owner[e] = i
    groups = defaultdict(set)                 # root index -> emails
    for e, i in owner.items():
        groups[uf.find(i)].add(e)
    return [[accounts[r][0]] + sorted(es) for r, es in groups.items()]
```

Trace on `0: John a b`, `1: John c`, `2: John b d`, `3: Mary e`:

| account | email | `owner` | action | `parent[0..3]` after |
|---|---|---|---|---|
| 0 | a, b | new, new | `owner[a] = owner[b] = 0` | `0 1 2 3` |
| 1 | c | new | `owner[c] = 1` | `0 1 2 3` |
| 2 | b | seen, owner 0 | `union(2, 0)`: equal ranks, `parent[0] = 2` | `2 1 2 3` |
| 2 | d | new | `owner[d] = 2` | `2 1 2 3` |
| 3 | e | new | `owner[e] = 3` | `2 1 2 3` |

`union(2, 0)` found roots 2 and 0 with equal rank and hung the second under the first, so the root of the merged person is 2, not 0. Grouping: root 2 gets `{a, b, d}`, root 1 `{c}`, root 3 `{e}`. Output `[John, a, b, d]`, `[John, c]`, `[Mary, e]`: two Johns stay separate because no email links them. Time `O(N · α)` for the unions over `N` emails plus `O(N log N)` for sorting, which dominates.

### Number of Provinces

[Number of Provinces](/practice/number-of-provinces): an `n × n` matrix with `isConnected[i][j] = 1` for a direct link. Count the groups.

```python
def find_circle_num(is_connected):
    n = len(is_connected)
    uf = UnionFind(n)
    for i in range(n):
        for j in range(i + 1, n):             # symmetric: upper triangle only
            if is_connected[i][j]:
                uf.union(i, j)
    return uf.count
```

On the block matrix `[[1,1,0,0],[1,1,0,0],[0,0,1,1],[0,0,1,1]]` the upper triangle holds two 1s: `union(0, 1)` makes the count 3, `union(2, 3)` makes it 2. Answer 2. Reading the matrix is `O(n²)`, the input size, so nothing can beat it; the union-find version needs no visited array and no adjacency lists.

### Islands added over time

A 3 × 3 grid of water; cells `(0,1)`, `(1,0)`, `(1,2)`, `(2,1)`, `(1,1)` turn into land in that order. Key each cell as `r · 3 + c`, so the four arms are 1, 3, 5, 7 and the centre is 4.

| add | key | real merges (root → new root) | `parent` after | islands |
|---|---|---|---|---|
| (0,1) | 1 | none | `{1:1}` | 1 |
| (1,0) | 3 | none, no land neighbour | `{1:1, 3:3}` | 2 |
| (1,2) | 5 | none | `{1:1, 3:3, 5:5}` | 3 |
| (2,1) | 7 | none | `{…, 7:7}` | 4 |
| (1,1) | 4 | 7 → 4, 1 → 4, 5 → 4, 3 → 4 | all point at 4 | 4 + 1 − 4 = 1 |

One addition performed four unions and dropped the count from 4 to 1, which a per-cell flood fill would need `O(R · C)` to discover. The `parent` map holds only land, so its size is the number of additions, not the grid.

### Weighted relations: `a / b = 2`, `b / c = 3`

Store, beside each parent pointer, the ratio `x / parent[x]`. `find` compresses the path and multiplies the ratios as it goes; a union sets the ratio of one root to the other so that the new equation holds.

```python
def calc_equation(equations, values, queries):
    parent, ratio = {}, {}                  # ratio[x] = x / parent[x]
    def find(x):
        if parent[x] != x:
            root = find(parent[x])          # compress the parent first
            ratio[x] *= ratio[parent[x]]    # x/p * p/root = x/root
            parent[x] = root
        return parent[x]
    for (a, b), v in zip(equations, values):
        for x in (a, b):
            if x not in parent:
                parent[x], ratio[x] = x, 1.0
        ra, rb = find(a), find(b)
        if ra != rb:                        # ra/rb = (a/b) * (b/rb) / (a/ra)
            parent[ra] = rb
            ratio[ra] = v * ratio[b] / ratio[a]
    return [ratio[a] / ratio[b] if a in parent and b in parent and find(a) == find(b)
            else -1.0 for a, b in queries]
```

| step | `parent` | `ratio` |
|---|---|---|
| `a / b = 2` | a→b, b→b | a: 2, b: 1 |
| `b / c = 3` | a→b, b→c, c→c | a: 2, b: 3, c: 1 |
| query `a / c`: `find(a)` compresses | a→c, b→c, c→c | a: 6, b: 3, c: 1 |

`a / c = 6 / 1 = 6`, `b / a = 3 / 6 = 0.5`, and a query with an unknown variable returns −1. The recursion depth is bounded by the path length, which the compression keeps short.

## Variations

| Variant | Node | Extra state | What a successful union means | Answer |
|---|---|---|---|---|
| Components | integer | `count` | two groups became one | `count` |
| Cycle edge / valid tree | integer | none | tree edge | first failed union; tree iff `E = n − 1` and none fail |
| Largest group | integer | `size[root]` | sizes add | running maximum |
| Accounts / synonyms | account index or string | dict `parent` | same identity | groups by root |
| Islands added over time | cell `r · C + c` | set of land cells | two islands joined | `+1` per cell, `−1` per merge |
| Kruskal MST | integer | sorted edges | edge enters the tree | sum of kept weights, stop at `n − 1` |
| Threshold queries (offline) | integer | sorted queries | connectivity grows with the limit | answer each query at its limit |
| Weighted relation (`a = k · b`) | string | ratio to parent | equation recorded | product of ratios along the path |
| Rollback (offline deletions) | integer | stack of changes; no compression | undoable merge | answers per time segment |

- **Union by size** attaches the smaller tree under the larger and gives "size of my group" for free; same bound as rank.
- **Kruskal**: after sorting, each edge costs two finds, so `O(E log E)` total, dominated by the sort.
- **Rollback union-find** drops path compression (it rewrites many pointers) and keeps union by rank, so each union changes one parent and one rank, which a stack can undo. Finds cost `O(log n)`. This is how offline dynamic connectivity handles deletions.

- **At scale**, identity resolution (merging customer or device records that share an email, phone number or payment instrument) is Accounts Merge over billions of records. It no longer fits one machine's `parent` array, so distributed graph engines compute the same components by iterative label propagation, each node repeatedly adopting the smallest label among its neighbours, which trades union-find's near-constant work for one pass per diameter step. See [Graphs in the real world](/learn/data-structures/graphs/graphs-in-the-real-world).

**Kruskal, traced.** Nodes A..E, edges A–B (4), A–C (1), B–C (2), B–D (5), C–D (8), D–E (3), taken in weight order; `parent` is written as a string for A..E.

| edge (weight) | roots | action | `parent` after | `rank` A..E | total |
|---|---|---|---|---|---|
| A–C (1) | A, C | `parent[C] = A` | `A B A D E` | 1 0 0 0 0 | 1 |
| B–C (2) | B, A | rank of A is higher: `parent[B] = A` | `A A A D E` | 1 0 0 0 0 | 3 |
| D–E (3) | D, E | `parent[E] = D` | `A A A D D` | 1 0 0 1 0 | 6 |
| A–B (4) | A, A | same root: would close a cycle, skip | `A A A D D` | 1 0 0 1 0 | 6 |
| B–D (5) | A, D | equal ranks: `parent[D] = A`, rank of A becomes 2 | `A A A A D` | 2 0 0 1 0 | 11 |

Four edges kept for five nodes, so the loop stops before C–D (8) is examined; the tree weighs 11. The skipped A–B is the same "failed union" that Redundant Connection returns.

Watch Kruskal keep only the edges that join two different sets:

```viz
{"type": "graph", "algorithm": "kruskal", "directed": false, "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}], "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 1}, {"from": "B", "to": "C", "w": 2}, {"from": "B", "to": "D", "w": 5}, {"from": "C", "to": "D", "w": 8}, {"from": "D", "to": "E", "w": 3}], "title": "Kruskal with union-find", "caption": "Edges are taken in weight order; an edge whose endpoints already share a root would close a cycle and is skipped."}
```

## Under the hood

**What the optimisations are worth, measured.** CPython 3.14, the adversarial sequence `union(0, i)` for `i = 1..n` with a naive `find` (no rank, no compression) walks the whole chain each time: 538 ms at `n = 10⁴` and 2.1 s at `n = 2 × 10⁴`, quadrupling as `n` doubles, so about a minute at `10⁵`. With path halving alone, rank alone, or both, the same sequence at `n = 10⁶` takes 93, 92 and 86 ms. On 10⁶ random unions over 10⁶ nodes all three take about 0.5 s. The honest summary: the gap between none and one optimisation is minutes against milliseconds; the gap between one and both is invisible at interview sizes, and the inverse-Ackermann bound is the reason to write both anyway.

**Memory per node.** `list(range(10⁶))` plus `[0] * 10⁶` measured 48 MB: two 8 MB pointer arrays plus a 32-byte `int` object for every value above 256, which CPython does not cache. `array('i')` for parent and `array('b')` for rank measured 5.2 MB for the same data. A dict-based union-find over 10⁵ string keys measured about 77 bytes per key for the two dicts, before counting the key strings themselves. In JavaScript an `Int32Array` parent is 4 bytes per node, and 10⁶ random unions ran in 41 ms on Node 24, about a twelfth of the CPython time.

**Recursion in the full-compression `find`.** The recursive form recurses once per node on the path before any compression happens. With rank the path is at most `log₂ n` (20 at a million nodes), so it is safe; without rank a chain is `n` deep, and CPython's default limit of 1,000 frames is reached by a chain of about a thousand nodes. Path halving is iterative and has no such ceiling.

**Why `α(n)` is effectively constant.** `α` grows so slowly that `α(n) ≤ 4` for every `n` below a number with far more digits than there are atoms in the observable universe. You can quote it as "amortised constant for all practical inputs"; if pressed, say it comes from the combination of rank and compression, and neither alone achieves it.

## Failure modes

**Symptom: the program hangs on the third or fourth union.** Diagnosis: `union` links nodes, not roots (`parent[b] = a`). Pointing a root at its own descendant creates a cycle in `parent`, and the next `find` loops forever. Print `parent` and follow pointers from the hung node; you will revisit a node. Fix: compute both roots with `find`, compare them, link one root under the other.

**Symptom: the component count is too low, sometimes negative, on inputs with duplicate edges.** Diagnosis: `count -= 1` runs on every call to `union`, including calls where the endpoints already share a root. Fix: decrement only on a real merge; returning a boolean from `union` makes that the natural shape.

**Symptom: correct on small tests, time limit at `n = 10⁵`.** Diagnosis: a `find` with neither rank nor compression, turned quadratic by an input that builds a chain. Measured above, that is about a minute at `10⁵` in CPython. Fix: add path halving, which is one line.

**Symptom: `RecursionError` in `find` on a large hidden test.** Diagnosis: recursive full compression without union by rank, on a chain longer than the recursion limit. Fix: iterative path halving, or add rank so paths stay under `log₂ n`.

**Symptom: Accounts Merge merges strangers, or splits one person.** Diagnosis: names used as nodes (merges two different Johns), or emails of a later account unioned with the first account instead of with the email's owner. Fix: account indices as nodes and an `owner` map from email to the first account.

## Interviewer follow-ups

**"Edges can also be removed."** Model answer: union-find cannot split a set. If all operations are known in advance, process time backwards so deletions become unions, or use a rollback union-find over a segment tree of time; if they arrive online, recompute per query or reach for dynamic-connectivity structures and say they are well beyond interview code. Common wrong answer: "set `parent[x] = x` to remove it", which orphans every node below `x`.

**"Report the size of the largest group after each union."** Model answer: union by size, keep `size[root]`, update a running maximum on each merge; `O(α(n))` per operation. Common wrong answer: recompute group sizes by scanning `parent`, `O(n)` per query.

**"Grid cells turn into land one at a time; report the island count after each."** Model answer: key cells as `r · C + c`, add the cell (`count + 1`), union with each land neighbour (`count − 1` per real merge), ignore a repeated cell. `O(k · α)` for `k` additions against `O(k · R · C)` for a flood fill each time. Common wrong answer: forgetting the repeated-cell case, which adds a phantom island. This is the second exercise.

**"`a / b = 2.0`, `b / c = 3.0`; answer `a / c`."** Model answer: weighted union-find storing each node's ratio to its parent; `find` multiplies ratios along the path and compresses them; `a / c` is `ratio(a) / ratio(c)` when both share a root, otherwise unknown. Common wrong answer: BFS per query, which works but ignores the incremental structure the question is testing.

**"Why not DFS?"** Model answer: for a static graph and one question, DFS is equally good and I would use it; union-find wins when edges arrive over time or queries interleave with additions. Common wrong answer: "union-find is always faster", which is not true on a static graph.

## What mid-level engineers get wrong

- **Comparing `parent[a] == parent[b]`** instead of `find(a) == find(b)`. Parents are not roots until compression has run, so connected nodes read as separate.
- **Omitting both optimisations** because "the tests are small". A chain-building input turns milliseconds into a minute.
- **Off-by-one on 1-indexed nodes.** Redundant Connection's labels run 1..n; allocate `n + 1` slots.
- **Choosing names as nodes** in Accounts Merge, or emails without a way back to a name.
- **Expecting deletion to work**, or not saying "offline, reverse time" when asked.
- **Reading the whole symmetric matrix** in Number of Provinces. Correct but twice the unions; the upper triangle is enough.

## Exercises

```exercise
id: count-components-union-find
title: Count connected components with union-find
prompt: |
  Given `n` nodes labelled 0 to n-1 and an undirected edge list `edges`,
  return the number of connected components. Implement union-find with
  path compression (or halving) and union by rank or size; do not build an
  adjacency list. Edges may be duplicated.
languages: [python, javascript]
entry: count_components
starter:
  python: |
    def count_components(n, edges):
        parent = list(range(n))
        # your code here
        return n
  javascript: |
    function count_components(n, edges) {
      const parent = Array.from({ length: n }, (_, i) => i);
      // your code here
      return n;
    }
tests:
  - args: [5, [[0, 1], [1, 2], [3, 4]]]
    expected: 2
  - args: [5, []]
    expected: 5
    label: no edges, every node alone
  - args: [1, []]
    expected: 1
    label: single node
  - args: [4, [[0, 1], [1, 2], [2, 3], [3, 0]]]
    expected: 1
    label: a cycle is still one component
  - args: [3, [[0, 1], [0, 1]]]
    expected: 2
    label: duplicate edge must not double-decrement
  - args: [6, [[0, 1], [2, 3], [4, 5], [1, 2]]]
    expected: 2
    hidden: true
  - args: [7, [[0, 1], [1, 2], [3, 4], [5, 6], [6, 3]]]
    expected: 2
    hidden: true
hints:
  - "Start count = n; every union that actually merges two different roots decrements it by one."
  - "find(x) must follow parents until parent[x] == x; compress the path as you go so repeated finds are fast."
  - "Compare roots, not parents: find(a) == find(b) means already connected, so skip the decrement."
```

```exercise
id: islands-added-over-time
title: Island count as land is added
prompt: |
  A `rows x cols` grid starts as all water. `positions` is a list of
  `[r, c]` cells that turn into land, one at a time. After each addition,
  record the number of islands (groups of land connected horizontally or
  vertically). Return the list of counts. A cell may appear more than once;
  adding land that is already land changes nothing.

  Use union-find keyed by `r * cols + c`: each new cell adds one island,
  and each union with a different neighbouring island removes one.
languages: [python, javascript]
entry: num_islands_online
starter:
  python: |
    def num_islands_online(rows, cols, positions):
        # your code here
        return []
  javascript: |
    function num_islands_online(rows, cols, positions) {
      // your code here
      return [];
    }
tests:
  - args: [3, 3, [[0, 0], [0, 1], [1, 2], [2, 1]]]
    expected: [1, 1, 2, 3]
  - args: [3, 3, [[0, 0], [0, 1], [1, 2], [2, 1], [1, 1]]]
    expected: [1, 1, 2, 3, 1]
    label: the centre cell joins three islands into one
  - args: [1, 1, [[0, 0]]]
    expected: [1]
    label: single cell
  - args: [2, 2, [[0, 0], [0, 0], [1, 1], [0, 1]]]
    expected: [1, 1, 2, 1]
    label: a repeated cell adds nothing
  - args: [2, 2, []]
    expected: []
    label: no additions
  - args: [2, 2, [[0, 0], [1, 1]]]
    expected: [1, 2]
    hidden: true
    label: diagonal cells do not connect
  - args: [3, 3, [[0, 1], [1, 0], [1, 2], [2, 1], [1, 1]]]
    expected: [1, 2, 3, 4, 1]
    hidden: true
    label: four islands merged by one cell
hints:
  - "Keep a dict (or map) parent keyed by r * cols + c; a key is present only once the cell is land."
  - "For a new cell: count += 1, then for each land neighbour whose root differs from the cell's root, link the roots and count -= 1."
  - "If the cell is already land, append the current count unchanged."
```

## Senior signals

- You give the reason in one sentence: **"the relation is an equivalence and edges only arrive"**, and you name when DFS is the better fit (a static graph, or you need paths).
- You write **both optimisations** from memory, quote the bound as inverse Ackermann, and can say what each alone gives (`O(log n)`) and what none gives (a chain, measured at about a minute for 10⁵ nodes in CPython).
- You **link roots, not nodes**, and make `union` return a boolean, because cycle detection and counting consume it.
- You raise the **deletion limitation** before being asked, with the offline reverse-time and rollback answers.
- You choose the **right nodes** in Accounts Merge (accounts, with emails as evidence) and name the two-Johns test.
- You know the **memory shape**: 48 MB for list-based arrays at a million nodes in CPython against 5 MB for typed arrays.
- You connect the pattern to **Kruskal, threshold queries and weighted relations**, which shows it is more than a components counter.

## Check yourself

```quiz
- q: >-
    A candidate's union is parent[b] = a, without calling find on either argument. The sequence union(1, 2), union(2, 3), union(3, 1) is executed. What happens?
  options: ["It raises an index error on the third union call", "The third call is correctly rejected as a cycle edge", "parent[1] = 3 makes a pointer cycle; find never ends", "All three end up in one set and nothing is wrong"]
  answer: 2
  explanation: >-
    After the first two calls parent[2] = 1 and parent[3] = 2, which happens to be a valid tree. The third sets parent[1] = 3, pointing the root at its own descendant and forming the loop 1 -> 3 -> 2 -> 1, so the next find never reaches a root. Union must compute both roots, compare them and link one root under the other.
- q: >-
    Why does Redundant Connection return the first union that fails when edges are processed in input order?
  options: ["Because union-find only works on edges in sorted order", "Because the answer is always the last edge of the input", "It closes the only cycle; other cycle edges came earlier", "Because the failing union always has the smallest labels"]
  answer: 2
  explanation: >-
    One extra edge creates exactly one cycle, and the cycle is not closed until its last edge in input order is seen. That edge is the first whose endpoints are already joined; every other cycle edge appeared earlier, so the tie-break by last appearance is automatic.
- q: >-
    With union by rank but no path compression, what is the worst-case cost of a single find on n nodes?
  options: ["O(1), because each node points close to its root", "O(α(n)), since rank alone gives inverse Ackermann", "O(n), because the trees can still become chains", "O(log n), because rank bounds the tree height"]
  answer: 3
  explanation: >-
    A root of rank r has at least 2^r nodes, because rank grows only when two equal-rank trees merge, so height is at most log n. Compression alone also gives amortised O(log n). Only the combination gives inverse Ackermann, and neither alone lets chains form.
- q: >-
    A component counter decrements count on every call to union. On n = 3 with edges [[0, 1], [0, 1]] it returns:
  options: ["1, since the no-op union still decrements", "3, since the duplicate edge is ignored", "0, since each call decrements twice", "2, the correct number of components"]
  answer: 0
  explanation: >-
    The count starts at 3. The first union merges 0 and 1, leaving 2 groups. The second finds both endpoints under the same root and merges nothing, but the unconditional decrement drops the count to 1. Decrement only when the roots differ, which a boolean return from union makes natural.
- q: >-
    In Accounts Merge, a candidate uses names as union-find nodes. What breaks?
  options: ["Nothing, since names identify people in this problem", "Union-find cannot use strings as its node keys", "The output emails come out unsorted in each group", "Different people who share a name get merged together"]
  answer: 3
  explanation: >-
    Names are not identities here; shared emails are. Two accounts named John with no shared email must stay separate, and name-keyed nodes merge them. The nodes must be account indices (or emails), with the name attached to the output afterwards.
- q: >-
    Edges are added and deleted over time, with connectivity queries in between, and the whole sequence is known in advance. What is the standard approach?
  options: ["Process time backwards so deletions become unions", "Add a delete operation that splits a set in two", "Rebuild the whole structure after every deletion", "Switch to Dijkstra, which supports removing edges"]
  answer: 0
  explanation: >-
    Union-find cannot split sets. Knowing the sequence up front lets you start from the final graph and walk time in reverse, turning deletions into unions (or use a rollback union-find without path compression). Rebuilding after each deletion works but discards the near-constant cost; online deletions need different structures.
```

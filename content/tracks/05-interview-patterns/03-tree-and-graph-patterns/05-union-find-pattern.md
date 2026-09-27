---
slug: union-find-pattern
title: "Union-find: answering 'same group?' without traversing"
description: Recognise equivalence-class and incremental-connectivity problems, write the path-compressed union-find from memory, and see Redundant Connection, Accounts Merge and Number of Provinces traced with the parent array at every step.
minutes: 30
difficulty: medium
tags: [graph, union-find, disjoint-set, connectivity, path-compression, pattern:union-find]
problems: [redundant-connection, accounts-merge, number-of-provinces]
---
Edges arrive one at a time and after each one you need to know whether two nodes are now connected. Or you have thousands of "these two are the same" facts (emails belonging to one person, cells in one island, pixels of one colour) and need to group everything into equivalence classes. A traversal answers "connected?" in `O(V + E)`, and re-running it after every edge is `O(E · (V + E))`. Rebuilding groups from scratch after every fact is the same waste.

Union-find keeps the groups *as they are formed*. Each node points at a parent; the root of the tree it belongs to is the group's name; `find(x)` follows parents to the root; `union(a, b)` hangs one root under the other. With two optimisations that take four lines, each operation is amortised near-constant time, and the whole sequence of `E` unions and finds costs `O(E · α(n))`, which for any `n` you will ever see is `O(E)`.

## The signal

Reach for union-find when the statement contains any of these:

- **"Are `a` and `b` connected?" asked repeatedly while edges are added**, or **"which edge, when added, creates a cycle?"** ([Redundant Connection](/practice/redundant-connection)). The order of arrival matters and you never remove edges.
- **"Merge groups that share an element"**: accounts sharing an email, sentences with synonyms, people who are friends of friends ([Accounts Merge](/practice/accounts-merge), [Number of Provinces](/practice/number-of-provinces)). The relation is an equivalence (reflexive, symmetric, transitive) and you want its classes.
- **"Number of connected components"** when the input is an edge list and no traversal-specific information (distances, paths) is needed.
- **Kruskal's minimum spanning tree**: sort edges by weight, add each if its endpoints are in different sets ([Min Cost to Connect Points](/practice/min-cost-connect-points) can be solved this way).
- **Offline queries**: "for each query, is there a path using only edges of weight < limit?" Sort queries and edges by weight and union as you go.
- **Grids where cells become land over time** ("number of islands after each addition"): each new cell unions with its land neighbours; the count changes by `+1 − (number of successful unions)`.

What rules it out:

- You need **the path itself, or distances**. Union-find only knows membership. That is [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal) or [Shortest path](/learn/interview-patterns/tree-and-graph-patterns/shortest-path-pattern).
- **Edges are removed.** Union-find does not support splitting. The standard trick is to process deletions in reverse as additions, if all deletions are known in advance.
- The graph is **directed** and the question involves direction (reachability from `a` to `b` but not back). Union-find models symmetric relations only.
- **A single static connectivity query** on a graph you already have as an adjacency list. A BFS is the same complexity and less code.

The confusable pattern is DFS components. Both count groups in `O(V + E)`-ish time on a static edge list, and either is acceptable. The tie-breakers: union-find when edges are incremental or the nodes are not integers (emails, strings) and you would otherwise need to build an adjacency list; DFS when you also need to visit the members in some order.

## The template

Two arrays: `parent` (initially each node is its own parent) and `rank` or `size` (to keep trees shallow). `find` with path compression makes every node on the walk point directly at the root. `union` by rank attaches the shorter tree under the taller one and returns whether a merge happened, which is the signal callers need.

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.count = n                        # number of groups

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path halving
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False                      # already together: a cycle edge
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra                  # shorter tree under taller
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1
        self.count -= 1
        return True
```

```javascript
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
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

The `find` shown uses *path halving*, the iterative one-liner: on each step a node is pointed at its grandparent. It is easier to type correctly under pressure than the recursive full compression (`parent[x] = find(parent[x])`) and has the same asymptotic guarantee; the recursive version also risks stack depth on a long chain before compression has happened. Either is accepted; know which one you are writing.

The invariant: *two nodes are in the same group if and only if `find` returns the same root for both*. Union by rank keeps every tree's height `O(log n)`; path compression flattens it further on every query. Together they give amortised `O(α(n))` per operation, where `α` is the inverse Ackermann function, at most 4 for any input that fits in the universe. Without either optimisation a chain of unions makes `find` `O(n)`.

Watch the parent pointers and roots evolve:

```viz
{"type": "graph", "algorithm": "union-find", "directed": false, "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}], "edges": [{"from": "A", "to": "B"}, {"from": "C", "to": "D"}, {"from": "B", "to": "C"}, {"from": "E", "to": "F"}, {"from": "A", "to": "D"}], "title": "Union-find over an edge list", "caption": "Each edge unions two roots; an edge whose endpoints already share a root closes a cycle."}
```

## Worked problems

### Redundant Connection

[Redundant Connection](/practice/redundant-connection): a tree with `n` nodes had one extra edge added. Return that edge; if several answers are possible, return the one that appears last in the input.

A tree on `n` nodes has `n − 1` edges and no cycles. Adding one edge creates exactly one cycle, and the edge that *closes* it is the first edge whose endpoints are already connected. Process edges in order; the first `union` that returns `False` is the answer. "Last in the input" is automatic: any other edge on the cycle appears before the closing edge, otherwise it would have been the closing edge.

```python
def find_redundant_connection(edges):
    uf = UnionFind(len(edges) + 1)            # nodes are 1-indexed
    for a, b in edges:
        if not uf.union(a, b):
            return [a, b]
```

Trace on `[[1, 2], [2, 3], [3, 4], [1, 4], [1, 5]]` (nodes 1..5, `parent` shown for indices 1..5):

| edge | `find(a)`, `find(b)` | action | `parent[1..5]` after | groups |
|---|---|---|---|---|
| (1, 2) | 1, 2 | union: `parent[2] = 1`, `rank[1] = 1` | `[1, 1, 3, 4, 5]` | 4 |
| (2, 3) | 1, 3 | union: rank 1 > 0, `parent[3] = 1` | `[1, 1, 1, 4, 5]` | 3 |
| (3, 4) | 1, 4 | union: `parent[4] = 1` | `[1, 1, 1, 1, 5]` | 2 |
| (1, 4) | 1, 1 | same root: **return [1, 4]** | | |

The edge `(1, 5)` is never examined. Time `O(E · α(n))`, space `O(n)`. The DFS alternative (for each edge, check whether its endpoints are already connected by traversing the edges so far) is `O(E²)`, and that difference is what the problem is testing.

### Accounts Merge

[Accounts Merge](/practice/accounts-merge): each account is a list `[name, email1, email2, …]`. Two accounts belong to the same person if they share any email (names can repeat across different people). Merge them: output each person's name followed by their sorted, deduplicated emails.

The equivalence is "shares an email", and it is transitive: A shares with B, B shares with C, so A, B and C are one person. The nodes are *accounts* (indices), not emails; emails are the evidence for unions. Map each email to the first account index it appeared in; when an email appears again in a later account, union the two indices. Then group emails by their account's root.

```python
def accounts_merge(accounts):
    uf = UnionFind(len(accounts))
    owner = {}                                # email -> first account index
    for i, (_, *emails) in enumerate(accounts):
        for e in emails:
            if e in owner:
                uf.union(i, owner[e])
            else:
                owner[e] = i
    groups = defaultdict(set)                 # root index -> set of emails
    for e, i in owner.items():
        groups[uf.find(i)].add(e)
    return [[accounts[r][0]] + sorted(es) for r, es in groups.items()]
```

Trace on

```text
0: John  a@x  b@x
1: John  c@x
2: John  b@x  d@x
3: Mary  e@x
```

| account | email | `owner` lookup | action |
|---|---|---|---|
| 0 | a@x | new | `owner[a] = 0` |
| 0 | b@x | new | `owner[b] = 0` |
| 1 | c@x | new | `owner[c] = 1` |
| 2 | b@x | seen, owner 0 | `union(2, 0)` |
| 2 | d@x | new | `owner[d] = 2` |
| 3 | e@x | new | `owner[e] = 3` |

Roots after: `find(0) = find(2)`, and 1 and 3 are alone. Grouping: root of 0 gets `{a, b, d}` (a and b from owner 0, d from owner 2 whose root is 0); root 1 gets `{c}`; root 3 gets `{e}`. Output: `[John, a@x, b@x, d@x]`, `[John, c@x]`, `[Mary, e@x]`. The two Johns with no shared email stay separate, which is the case the problem is checking.

Time: `O(N · α)` for the unions where `N` is the total number of emails, plus `O(N log N)` for the sorting, which dominates. The alternative is a graph with emails as nodes and DFS from each unvisited email; it is the same complexity and roughly twice the code.

### Number of Provinces

[Number of Provinces](/practice/number-of-provinces): an `n × n` adjacency matrix where `isConnected[i][j] = 1` means a direct link. A province is a group of directly or indirectly connected cities. Count the provinces.

This is "count components" with the group counter that the template maintains. Union every `(i, j)` with `i < j` and a `1`; the answer is `uf.count`.

```python
def find_circle_num(is_connected):
    n = len(is_connected)
    uf = UnionFind(n)
    for i in range(n):
        for j in range(i + 1, n):             # matrix is symmetric: upper triangle
            if is_connected[i][j]:
                uf.union(i, j)
    return uf.count
```

Trace on

```text
1 1 0 0
1 1 0 0
0 0 1 1
0 0 1 1
```

Pairs examined with a `1`: (0, 1) → union, count 3; (2, 3) → union, count 2. All other upper-triangle entries are 0. Answer 2. Time `O(n² · α)` to read the matrix, which is the input size, so it cannot be beaten. DFS over the matrix is the same `O(n²)`; the union-find version is shorter and does not need a visited array.

## Variations

- **Union by size instead of rank**: store the size of each tree and attach smaller under larger. Same guarantee, and you get "size of my group" for free, which problems like "largest component" need.
- **Union-find on strings or arbitrary keys**: `parent` becomes a dictionary, with `find` inserting a key the first time it is seen. Accounts Merge can be done this way with emails as nodes.
- **Counting islands as cells are added**: start with `count = 0`; each new land cell does `count += 1`, then unions with each land neighbour, subtracting one per successful union.
- **Detecting cycles in an undirected edge list**: a successful `union` is a tree edge; a failed one is a cycle edge. Valid-tree is "`n − 1` edges and no failed union".
- **Kruskal's MST**: sort edges by weight, union in order, sum the weights of the successful unions, stop after `n − 1` of them.
- **Offline connectivity queries with thresholds**: sort queries by limit, sort edges by weight, and for each query in order union all edges below its limit before answering. `O((E + Q) log)` for the sorts, near-linear for the rest.
- **Directed "redundant connection"** (each node has at most one parent, one extra edge added): a harder variant that needs both an in-degree check and union-find. It is where candidates learn that union-find is for undirected relations.
- **Weighted union-find** ("`a` is `k` times `b`", "`a` is `d` units right of `b`"): store an offset to the parent and update it during compression. Rare in interviews, common in contests.

## Pitfalls

- **Forgetting path compression or union by rank.** Either alone gives `O(log n)` per operation; neither gives `O(n)` on a chain. A `find` written as `while parent[x] != x: x = parent[x]` with no compression is the version that times out.
- **Unioning nodes instead of roots.** `parent[b] = a` without calling `find` on both first corrupts the structure: `b`'s old root still thinks it is a root. Always union the roots.
- **Comparing `parent[a] == parent[b]`** instead of `find(a) == find(b)`. Parents are not roots until compression has run.
- **Off-by-one on 1-indexed nodes.** Redundant Connection's nodes run 1..n; allocate `n + 1` slots or subtract 1 everywhere, and be consistent.
- **Using the wrong thing as the node** in Accounts Merge. Accounts are the nodes; emails are the evidence. Making emails the nodes also works but you must then map back to a name.
- **Recursive `find` before any compression on a long chain.** Unions in a bad order can build a chain of depth `O(log n)` with rank, but without rank the chain can be `O(n)` and the recursive `find` overflows. The iterative halving version has no such issue.
- **Expecting union-find to support deletion.** It does not. Reverse-time processing is the standard workaround, and only when all deletions are known up front.
- **Reading the full symmetric matrix** in Number of Provinces and unioning each pair twice. Harmless for correctness, wasteful; iterate the upper triangle.

## Exercise

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

## Senior signals

- You say **"the relation is an equivalence and edges only ever arrive"** as the reason for union-find over DFS, and you can name the case where DFS is the better fit (you need paths or visit order).
- You write **both optimisations** from memory and quote the amortised bound as inverse Ackermann, effectively constant, and you know that with neither optimisation a chain makes `find` linear.
- You **union roots, not nodes**, and `union` returns whether a merge happened, because that boolean is what cycle detection and component counting consume.
- You know the **deletion limitation** and the reverse-time workaround, and mention it before the interviewer asks "what if edges are removed?".
- You choose the **right nodes** in Accounts Merge (accounts, with emails as evidence) and explain the name-collision trap.
- You can connect it to **Kruskal** and to offline threshold queries, which is how you show the pattern is more than a components counter.

## Check yourself

```quiz
- q: >-
    A candidate's union is parent[b] = a, without calling find on either argument. The sequence union(1, 2), union(2, 3), union(3, 1) is executed. What happens?
  options: ["parent[1] = 3 closes the loop 1→3→2→1, so find never ends", "The third call is correctly rejected as a cycle edge", "It raises an index error on the third union call", "All three end up in one set, and nothing is wrong"]
  answer: 0
  explanation: >-
    After the first two calls parent[2] = 1 and parent[3] = 2, which happens to be a valid tree. The third sets parent[1] = 3, pointing the root at a descendant and forming a cycle in the parent array, so the next find loops forever. Union must attach one root under the other: compute both roots first and compare them.
- q: >-
    Why does Redundant Connection process edges in input order and return the first union that fails?
  options: ["Because union-find only works on edges in sorted order", "Because the answer is guaranteed to be the last input edge", "Because the first failing union has the smallest node labels", "It closes the only cycle, so no cycle edge comes after it"]
  answer: 3
  explanation: >-
    Only one edge is extra, so exactly one cycle exists. The cycle is not closed until its last edge in input order is seen, and that edge is precisely the first one whose endpoints are already joined. Every other cycle edge appeared earlier, so tie-breaking by last appearance is automatic; the answer need not be the last edge of the whole input.
- q: >-
    With union by rank but no path compression, what is the worst-case cost of a single find on n nodes?
  options: ["O(1), because each node points close to its root", "O(α(n)), since rank alone gives inverse Ackermann", "O(n), because the trees can still become chains", "O(log n), because rank bounds the tree height"]
  answer: 3
  explanation: >-
    Union by rank alone guarantees a tree of height h has at least 2^h nodes, so height is at most log n. Path compression alone also gives amortised O(log n). Both together give amortised inverse Ackermann. Neither gives O(n) chains.
- q: >-
    In Accounts Merge, a candidate uses names as union-find nodes. What breaks?
  options: ["Different people who share a name get merged together", "The output emails come out unsorted in each group", "Union-find cannot use strings as its node keys", "Nothing, since names uniquely identify people here"]
  answer: 0
  explanation: >-
    Names are not identities in this problem; shared emails are. Two different people with the same name are merged, and so are two same-name accounts with no shared email, which the problem treats as separate. The nodes must be account indices (or emails), with the name attached to the output afterwards.
- q: >-
    An interviewer adds: edges are also deleted over time, and connectivity queries are interleaved with additions and deletions, all given in advance. What is the standard approach?
  options: ["Switch to Dijkstra, which supports removing edges", "Add a delete operation to union-find that splits sets", "Rebuild the union-find from scratch after each deletion", "Run time backwards so each deletion becomes a union"]
  answer: 3
  explanation: >-
    Union-find cannot split sets. Because all operations are known up front, you can start from the final graph and process time in reverse, turning deletions into unions and answering queries backwards. Rebuilding after every deletion works but throws away the near-constant cost. If the operations were online, a different structure (link-cut trees, or per-query BFS) would be needed.
```

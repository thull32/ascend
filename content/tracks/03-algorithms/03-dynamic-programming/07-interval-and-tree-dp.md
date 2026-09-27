---
slug: interval-and-tree-dp
title: "Interval, tree and bitmask DP"
description: States that are ranges (matrix chain, burst balloons), states that are subtrees (house robber III, rerooting), and states that are subsets (bitmask assignment), with the fill order each one needs.
minutes: 55
difficulty: expert
tags: [dynamic-programming, interval-dp, tree-dp, bitmask-dp, matrix-chain, burst-balloons, rerooting]
problems: [burst-balloons, longest-palindromic-substring, max-path-sum, diameter-binary-tree]
---
You multiply three matrices `A₁A₂A₃` with dimensions `10×30`, `30×5` and `5×60`. Matrix multiplication is associative, so `(A₁A₂)A₃` and `A₁(A₂A₃)` give the same result, but the first costs `10·30·5 + 10·5·60 = 1,500 + 3,000 = 4,500` scalar multiplications and the second costs `30·5·60 + 10·30·60 = 9,000 + 18,000 = 27,000`. Six times the work for the same answer. With `n` matrices there are a Catalan number of parenthesisations, about `4ⁿ / n^{1.5}`, so trying them all is out; but the best way to multiply a *range* of matrices depends only on the best ways to multiply its two halves, whichever way you split it. That is an interval DP.

This lesson covers the three DP families whose state is not a prefix: intervals (`dp[i][j]` over a contiguous range), subtrees (`dp[node]` computed bottom-up from children), and subsets (`dp[mask]` over which items have been used). Each has a signature fill order, and each has one famous problem where the obvious state is wrong and a reversed viewpoint fixes it.

## Interval DP: matrix chain multiplication

Matrices `A₁..Aₙ` where `Aᵢ` is `d[i-1] × d[i]`, so the whole chain is described by `n + 1` dimensions.

**State.** `dp[i][j]` = the minimum number of scalar multiplications to compute the product `Aᵢ…Aⱼ`.

**Transition.** The *last* multiplication performed splits the range somewhere: `(Aᵢ…Aₖ)(Aₖ₊₁…Aⱼ)` for some `k` in `[i, j)`. The left product is `d[i-1] × d[k]`, the right is `d[k] × d[j]`, so the final multiplication costs `d[i-1]·d[k]·d[j]`:

$$dp[i][j] = \min_{i \le k < j} \big( dp[i][k] + dp[k+1][j] + d_{i-1}\, d_k\, d_j \big)$$

**Order and base.** `dp[i][i] = 0` (one matrix, nothing to do). The transition reads strictly shorter intervals, so fill by **increasing length** `len = 2, 3, …, n`, and for each length every starting `i`. **Answer.** `dp[1][n]`.

Trace `d = [10, 30, 5, 60]` (`A₁ = 10×30`, `A₂ = 30×5`, `A₃ = 5×60`):

| interval | split `k` | cost | `dp` |
|---|---|---|---|
| `[1,1]`, `[2,2]`, `[3,3]` | – | – | 0 |
| `[1,2]` | 1 | `0 + 0 + 10·30·5 = 1,500` | 1,500 |
| `[2,3]` | 2 | `0 + 0 + 30·5·60 = 9,000` | 9,000 |
| `[1,3]` | 1 | `dp[1][1] + dp[2][3] + 10·30·60 = 0 + 9,000 + 18,000 = 27,000` | |
| `[1,3]` | 2 | `dp[1][2] + dp[3][3] + 10·5·60 = 1,500 + 0 + 3,000 = 4,500` | **4,500** |

`O(n²)` states, `O(n)` transition: `O(n³)`. To recover the parenthesisation, store the winning `k` per cell and recurse. The interval DP shape, "the last operation splits the range, try every split", also solves optimal BST construction, polygon triangulation, and stone merging.

```python
def matrix_chain(d: list[int]) -> int:
    n = len(d) - 1                                   # number of matrices
    dp = [[0] * (n + 1) for _ in range(n + 1)]       # 1-indexed matrices
    for length in range(2, n + 1):
        for i in range(1, n - length + 2):
            j = i + length - 1
            dp[i][j] = min(dp[i][k] + dp[k + 1][j] + d[i - 1] * d[k] * d[j]
                           for k in range(i, j))
    return dp[1][n] if n >= 1 else 0
```

Interval DP is also where [palindrome DP](/learn/algorithms/dynamic-programming/string-dp) lives: `pal[i][j]` depends on `pal[i+1][j-1]`, a shorter interval, and the fill-by-length order is the same.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "abacab", "title": "Interval fill order: length 1, then 2, then 3 …", "caption": "Every interval DP fills the table diagonal by diagonal, because a cell depends only on strictly shorter intervals inside it."}
```

## Burst balloons: when the first choice is the wrong state

Balloons `[3, 1, 5, 8]` each hold a number. Bursting balloon `i` earns `nums[i-1] · nums[i] · nums[i+1]` (treat the ends as 1), and its neighbours then become adjacent. Maximise total coins.

The obvious state, "best coins for the range `[i, j]` if you burst something *first*", fails: after bursting `k` first, the two sides `[i, k-1]` and `[k+1, j]` become adjacent and interact, so they are not independent subproblems. The fix is to think about the balloon burst **last** in the range. If `k` is the last balloon burst in `(i, j)` (open interval, `i` and `j` are the still-standing boundaries), then when it goes its neighbours are exactly `i` and `j`, and before that, the left part `(i, k)` and right part `(k, j)` were burst completely independently, each with `k` still standing as its boundary.

**State.** `dp[i][j]` = max coins from bursting every balloon strictly between `i` and `j`, with `i` and `j` intact. Pad the array with 1s at both ends.

**Transition.**
$$dp[i][j] = \max_{i < k < j} \big( dp[i][k] + dp[k][j] + nums[i]\cdot nums[k]\cdot nums[j] \big)$$

**Order.** Increasing `j − i`. **Answer.** `dp[0][n+1]` on the padded array.

Trace with padded `[1, 3, 1, 5, 8, 1]` (indices 0..5). Gap 2 (one balloon inside): `dp[0][2] = 1·3·1 = 3`, `dp[1][3] = 3·1·5 = 15`, `dp[2][4] = 1·5·8 = 40`, `dp[3][5] = 5·8·1 = 40`. Gap 3: `dp[0][3]`: last = 1 → `dp[0][1] + dp[1][3] + 1·3·5 = 0 + 15 + 15 = 30`; last = 2 → `dp[0][2] + dp[2][3] + 1·1·5 = 3 + 0 + 5 = 8`; so 30. Continue and `dp[0][5] = 167` (burst 1, then 5, then 3, then 8: `3·1·5 + 3·5·8 + 1·3·8 + 1·8·1 = 15 + 120 + 24 + 8 = 167`).

The "last operation, not first" reversal is a general interval-DP technique. It appears whenever an operation *changes the adjacency* of what remains: removing boxes, merging stones with a cost, cutting a stick at given positions (where the last cut has cost equal to the current segment length). If your interval subproblems seem to interact, ask what happened last.

## Tree DP: states on subtrees

A tree is a recursion waiting to happen: the answer for a node depends on the answers for its children, the children's subtrees are disjoint, and a post-order traversal computes everything bottom-up in `O(n)`. Tree DP is DP where the state is "the subtree rooted at `v`", sometimes with a small extra flag.

**House robber on a tree.** Nodes hold cash; you may not rob two directly connected nodes. Whether you rob `v` constrains its children, so the state needs a flag.

- `rob[v]` = best from `v`'s subtree if `v` **is** robbed = `val[v] + Σ skip[c]` over children.
- `skip[v]` = best if `v` is **not** robbed = `Σ max(rob[c], skip[c])`.
- Answer `max(rob[root], skip[root])`.

```python
def rob_tree(root) -> int:
    def dfs(node):                       # returns (rob_here, skip_here)
        if node is None:
            return 0, 0
        lr, ls = dfs(node.left)
        rr, rs = dfs(node.right)
        return node.val + ls + rs, max(lr, ls) + max(rr, rs)
    return max(dfs(root))
```

Returning a tuple per node is the tree-DP idiom: the "table" is the recursion's return values, and the fill order is post-order. **Diameter of a tree** is the same shape: each node returns its height, and the diameter through `v` is `height(left) + height(right)`, with the global answer the max over nodes. **Maximum path sum** returns "best downward path from `v`" and updates a global with `left + val + right`.

```viz
{"type": "tree", "algorithm": "diameter", "values": [1, 2, 3, 4, 5, 6, 7, 8, 9], "title": "Tree DP by post-order: each node returns its height, the diameter is combined on the way up", "caption": "The children are finished before the parent reads them. That is the tree-DP fill order."}
```

### Rerooting: an answer for every root

Sometimes you need the DP answer with *each* node as the root: "for every node, the sum of distances to all other nodes", or "the height of the tree if hung from each node". Running the `O(n)` DP `n` times is `O(n²)`. **Rerooting** does it in `O(n)` with two passes.

1. **Down pass** (post-order): compute `down[v]`, the answer for `v`'s subtree in the original rooting. For sum-of-distances: `size[v]` and `down[v] = Σ (down[c] + size[c])`.
2. **Up pass** (pre-order): compute `up[v]`, the contribution from everything *outside* `v`'s subtree, using the parent's full answer minus `v`'s own contribution. For sum-of-distances, moving the root from `p` to child `v` brings `size[v]` nodes one step closer and `n − size[v]` nodes one step further: `ans[v] = ans[p] − size[v] + (n − size[v])`.

The pattern requires the combine operation to be "subtractable" (sums, or max with a second-best kept). It is a senior-level topic; knowing that it exists and what the two passes are is what an interviewer looks for.

## Bitmask DP: states on subsets

`n` workers, `n` jobs, `cost[w][j]` to give job `j` to worker `w`; assign every job to a distinct worker at minimum cost. There are `n!` assignments. But if you assign jobs in order `0, 1, 2, …`, then after `j` jobs the only thing that matters for the future is *which workers are taken*, a subset of `n` workers, encoded as an `n`-bit integer.

**State.** `dp[mask]` = the minimum cost of assigning the first `popcount(mask)` jobs to exactly the workers in `mask`.

**Transition.** Job `j = popcount(mask)` goes to some free worker `w`:
$$dp[mask \,|\, (1 \ll w)] = \min\big(dp[mask \,|\, (1 \ll w)],\; dp[mask] + cost[w][j]\big) \quad \text{for } w \notin mask$$

**Order.** Increasing `mask` as an integer: every transition goes from `mask` to a strictly larger integer, so numeric order is a valid topological order. **Answer.** `dp[(1 << n) − 1]`.

`2ⁿ` states, `O(n)` transition: `O(n · 2ⁿ)`. For `n = 20` that is about 2 × 10⁷, fine; for `n = 30` it is 3 × 10¹⁰, not fine. Bitmask DP is the tool for `n ≤ ~20` problems that are exponential in general: travelling salesman (`dp[mask][last]`, `O(n² 2ⁿ)`), minimum-cost Hamiltonian paths, partitioning into `k` equal-sum subsets, and "shortest superstring".

```viz
{"type": "bits", "algorithm": "subset-mask", "values": [3, 5, 6], "title": "Every subset of n items is an n-bit integer; iterating masks 0..2^n-1 visits subsets in a valid DP order", "caption": "Bit w set means worker w is already assigned. A mask's DP value depends only on masks with fewer bits."}
```

```python
def min_assignment_cost(cost: list[list[int]]) -> int:
    n = len(cost)
    INF = float('inf')
    dp = [INF] * (1 << n)
    dp[0] = 0
    for mask in range(1 << n):
        if dp[mask] == INF:
            continue
        j = bin(mask).count('1')            # next job to assign
        if j == n:
            continue
        for w in range(n):
            if not mask & (1 << w):
                nxt = mask | (1 << w)
                dp[nxt] = min(dp[nxt], dp[mask] + cost[w][j])
    return dp[(1 << n) - 1]
```

Trace `cost = [[9, 2, 7], [6, 4, 3], [5, 8, 1]]` (rows are workers). `dp[0] = 0`, job 0: `dp[001] = 9`, `dp[010] = 6`, `dp[100] = 5`. Job 1 from `001` (worker 0 taken): `dp[011] = 9 + 4 = 13`, `dp[101] = 9 + 8 = 17`; from `010`: `dp[011] = min(13, 6 + 2) = 8`, `dp[110] = 6 + 8 = 14`; from `100`: `dp[101] = min(17, 5 + 2) = 7`, `dp[110] = min(14, 5 + 4) = 9`. Job 2: `dp[111] = min(dp[011] + cost[2][2], dp[101] + cost[1][2], dp[110] + cost[0][2]) = min(8 + 1, 7 + 3, 9 + 7) = 9`. Assignment: worker 1 → job 0 (6), worker 0 → job 1 (2), worker 2 → job 2 (1).

Two implementation notes a senior engineer mentions: iterate submasks of a mask with `sub = (sub - 1) & mask`, which visits each submask once and makes "sum over all submask splits" `O(3ⁿ)` total rather than `O(4ⁿ)`; and precompute `popcount` or use the language's builtin (`int.bit_count()` in recent Python, `__builtin_popcount` in C/C++) rather than `bin(x).count('1')` in the inner loop.

## Choosing the state shape

| Problem smells like | State | Fill order | Cost |
|---|---|---|---|
| "split a range", "last operation on a contiguous segment" | interval `(i, j)` | by increasing length | `O(n²)` states × `O(n)` split = `O(n³)` |
| "on a tree", "subtree", "no two adjacent nodes" | subtree of `v` (+ flag) | post-order | `O(n)` × flag count |
| "answer for every root" | subtree + outside | post-order then pre-order | `O(n)` |
| "assign / visit each of `n ≤ 20` things exactly once" | subset mask (+ last item) | increasing mask | `O(2ⁿ · n)` or `O(2ⁿ · n²)` |

Each row's fill order is the topological order of its dependency graph: shorter intervals before longer, children before parents, smaller masks before larger. Once you name the state shape, the order follows, and the transition comes from asking what the last operation was.

## Exercises

```exercise
id: matrix-chain
title: Matrix chain multiplication
prompt: |
  `dims` has length `n + 1` and describes `n` matrices: matrix `i` (1-based)
  is `dims[i-1] × dims[i]`. Return the minimum number of scalar
  multiplications needed to compute the full product. A single matrix
  (`dims` of length 2) costs 0.

  Use interval DP filled by increasing length; O(n³).
languages: [python, javascript]
entry: matrix_chain
starter:
  python: |
    def matrix_chain(dims):
        # dp[i][j] = min cost to multiply matrices i..j
        return 0
  javascript: |
    function matrix_chain(dims) {
      // dp[i][j] = min cost to multiply matrices i..j
      return 0;
    }
tests:
  - args: [[10, 30, 5, 60]]
    expected: 4500
  - args: [[40, 20, 30, 10, 30]]
    expected: 26000
  - args: [[10, 20]]
    expected: 0
    label: single matrix
  - args: [[5, 10, 3]]
    expected: 150
    label: two matrices
  - args: [[1, 2, 3, 4]]
    expected: 18
  - args: [[30, 35, 15, 5, 10, 20, 25]]
    expected: 15125
    hidden: true
  - args: [[2, 3, 4, 5, 6]]
    expected: 124
    hidden: true
hints:
  - "dp[i][j] = min over k in [i, j) of dp[i][k] + dp[k+1][j] + dims[i-1] * dims[k] * dims[j]."
  - "Loop length from 2 to n, then i from 1, with j = i + length - 1; shorter intervals must already be filled."
```

```exercise
id: min-assignment-bitmask
title: Minimum-cost assignment with a bitmask
prompt: |
  `cost` is an n × n matrix (1 ≤ n ≤ 12): `cost[w][j]` is the cost of
  giving job `j` to worker `w`. Assign every job to a distinct worker and
  return the minimum total cost.

  Use `dp[mask]` = minimum cost of assigning jobs `0..popcount(mask)-1`
  to exactly the workers in `mask`, iterating masks in increasing order.
languages: [python, javascript]
entry: min_assignment_cost
starter:
  python: |
    def min_assignment_cost(cost):
        # dp[mask]: workers in mask have taken the first popcount(mask) jobs
        return 0
  javascript: |
    function min_assignment_cost(cost) {
      // dp[mask]: workers in mask have taken the first popcount(mask) jobs
      return 0;
    }
tests:
  - args: [[[9, 2, 7], [6, 4, 3], [5, 8, 1]]]
    expected: 9
  - args: [[[5]]]
    expected: 5
    label: one worker
  - args: [[[1, 2], [2, 1]]]
    expected: 2
  - args: [[[3, 3], [3, 3]]]
    expected: 6
    label: all costs equal
  - args: [[[10, 1, 3, 4], [2, 10, 5, 7], [9, 8, 10, 1], [6, 5, 2, 10]]]
    expected: 6
    hidden: true
  - args: [[[1, 100, 100], [100, 1, 100], [100, 100, 1]]]
    expected: 3
    hidden: true
hints:
  - "The next job to assign is popcount(mask). For each worker w not in mask, relax dp[mask | (1 << w)] with dp[mask] + cost[w][job]."
  - "Iterating mask from 0 upward is a valid order because every transition increases the mask."
```

## Senior signals

- You recognise interval DP by the phrase **"the last operation splits the range"** and fill by increasing length without being told.
- You know the burst-balloons reversal (**think about the balloon burst last**) and can explain why "first" fails: the sides stop being independent.
- You write tree DP as **a post-order function returning a tuple** and you know that rerooting gives every-root answers in `O(n)` with a down pass and an up pass.
- You size bitmask DP before writing it (`2ⁿ · n` states × transition) and you say **"this is for `n ≤ 20`"** out loud.
- You know the **submask enumeration trick** `sub = (sub − 1) & mask` and its `O(3ⁿ)` total, and you use a builtin popcount.
- You state the fill order as **the topological order of the dependency graph** and derive it from the transition rather than guessing.

## Check yourself

```quiz
- q: >-
    In matrix chain multiplication, why must the table be filled by increasing interval length rather than row by row?
  options: ["dp[k+1][j] is in a later row, so row order reads it unfilled", "The matrices must be multiplied left to right, one by one", "Only length order fills the zero diagonal before it is read", "Row-by-row works too; length order is purely a convention"]
  answer: 0
  explanation: >-
    dp[i][j] depends on dp[i][k] and dp[k+1][j], shorter intervals, and dp[k+1][j] is in a later row than dp[i][j], so row-major order would read it unfilled. Increasing length (equivalently, i descending with j ascending) is a topological order of the dependencies. The zero diagonal is the base case and can be written up front in any order.
- q: >-
    For burst balloons, defining dp[i][j] as the best coins when balloon k is burst FIRST in (i, j) fails because:
  options: ["The array can then no longer be padded with ones at both ends", "The recursion never terminates, since k can be picked again later", "The answer moves to dp[1][n], which the fill never reaches", "The two sides become adjacent, so they stop being independent"]
  answer: 3
  explanation: >-
    After bursting k first, balloons i..k-1 and k+1..j become adjacent and interact. Interval DP needs the two sides of a split to be solvable separately. Bursting last keeps i and j as the neighbours of k throughout, so the sides never interact. Padding is needed in both formulations and is not the issue.
- q: >-
    House robber on a tree returns (rob, skip) per node. Why does rob[v] add skip[c] for each child rather than max(rob[c], skip[c])?
  options: ["Because rob[c] is undefined for leaves, so skip is safer", "Because a robbed node's children cannot be robbed at all", "It should be the max; the tuple is only a memory saving", "Because skip[c] is always at least as large as rob[c]"]
  answer: 1
  explanation: >-
    The constraint is on directly connected nodes. If v is robbed, its children must be skipped, so only their skip value is legal; skip[c] already includes the best choice for the grandchildren. skip[c] is not always larger (a leaf's rob value is its cash, its skip value 0). skip[v] is where the max is taken.
- q: >-
    A bitmask DP has state dp[mask][last] for a travelling-salesman style problem with n = 25 cities. Is it feasible in a typical interview time limit?
  options: ["No: about 8 × 10⁸ states, each with an O(n) transition", "Yes: only 25² states, one for each pair of cities", "Only if the graph is complete, so that every mask is valid", "Yes: memoisation visits only the reachable masks"]
  answer: 0
  explanation: >-
    2²⁵ ≈ 3.4 × 10⁷ masks times 25 ends is 8.4 × 10⁸ cells, several gigabytes for the dp array alone; the transition multiplies the work by another 25. Bitmask DP is an n ≤ ~20 tool. Memoisation does not reduce the reachable state count here, since nearly every mask is reachable.
- q: >-
    Rerooting computes a per-node answer in O(n) with two passes. What property must the combine operation have?
  options: ["It must let one child's contribution be removed again", "It must be idempotent, so a child counted twice is harmless", "It must be linear, so the answer scales with node values", "It must be commutative, so children combine in any order"]
  answer: 0
  explanation: >-
    The up pass derives the value 'excluding v's subtree' from the parent's full value, so one child's contribution must be removable. For sums you subtract; for max you keep the best and second-best child so that excluding the best still leaves an answer. Commutativity alone does not give you that. Without it, rerooting degrades to recomputing.
```

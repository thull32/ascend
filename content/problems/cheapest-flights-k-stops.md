---
slug: cheapest-flights-k-stops
title: Cheapest Flights Within K Stops
difficulty: medium
patterns: [shortest-path]
lists: [ascend-150]
companies: [airbnb, amazon, google, expedia, booking]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/shortest-path-pattern
hints:
  - "At most k stops means at most k + 1 flights. The cheapest route overall might use too many flights, so plain Dijkstra on price alone can return a route you are not allowed to take."
  - "Bellman-Ford has a useful property: after round i, every distance is the cheapest price using at most i edges. Run exactly k + 1 rounds."
  - "Relax each round from a *copy* of the previous round's prices. Otherwise a price updated earlier in the same round lets you chain two flights in one round and exceed the limit."
signatures:
  python:
    name: find_cheapest_price
    starter: |
      def find_cheapest_price(n: int, flights: list[list[int]], src: int, dst: int, k: int) -> int:
          pass
  javascript:
    name: find_cheapest_price
    starter: |
      function find_cheapest_price(n, flights, src, dst, k) {
      }
tests:
  - args: [4, [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [0, 3, 900]], 0, 3, 1]
    expected: 600
    label: one stop allowed
  - args: [4, [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [0, 3, 900]], 0, 3, 2]
    expected: 300
    label: two stops unlock the cheapest route
  - args: [4, [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [0, 3, 900]], 0, 3, 0]
    expected: 900
    label: direct flights only
  - args: [3, [[0, 1, 10]], 0, 2, 1]
    expected: -1
    label: no route at all
  - args: [5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [0, 3, 10]], 0, 4, 2]
    expected: 11
    label: the cheap route to an intermediate city uses up every allowed flight
  - args: [2, [[0, 1, 7]], 0, 1, 0]
    expected: 7
  - args: [4, [[0, 1, 1], [0, 2, 5], [1, 2, 1], [2, 3, 1]], 0, 3, 1]
    expected: 6
    hidden: true
  - args: [4, [[0, 1, 1], [0, 2, 5], [1, 2, 1], [2, 3, 1]], 0, 3, 2]
    expected: 3
    hidden: true
  - args: [3, [[0, 1, 2], [1, 0, 1], [1, 2, 5], [0, 2, 9]], 0, 2, 3]
    expected: 7
    hidden: true
    label: a cycle never helps
  - args: [4, [[0, 1, 1], [1, 2, 1], [2, 3, 1]], 0, 3, 1]
    expected: -1
    hidden: true
    label: reachable, but not within the stop limit
  - args: [5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [0, 3, 10]], 0, 4, 1]
    expected: 11
    hidden: true
    label: the cheapest route to city 3 is not even allowed
time_limit_ms: 4000
---
There are `n` cities labelled `0` to `n - 1` and a list of one-way `flights`, where `flights[i] = [from, to, price]`. Given a starting city `src`, a destination `dst` and an integer `k`, return the lowest total price of a trip from `src` to `dst` that makes **at most `k` stops** in between (so it uses at most `k + 1` flights). If no such trip exists, return `-1`.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 4`, flights `[[0,1,100],[1,2,100],[2,3,100],[0,2,500],[0,3,900]]`, `src = 0`, `dst = 3`, `k = 1` | `600` | `0 → 2 → 3`; the 300 route `0 → 1 → 2 → 3` needs two stops |
| same flights, `k = 2` | `300` | Now `0 → 1 → 2 → 3` is allowed |
| same flights, `k = 0` | `900` | Only the direct flight qualifies |

### Constraints

- `2 ≤ n ≤ 100`, `0 ≤ k < n`
- `0 ≤ len(flights) ≤ n·(n − 1) / 2`, no duplicate flights, no flight from a city to itself
- `1 ≤ price ≤ 10⁴`, `src ≠ dst`

### Follow-up

The interviewer asks: "Our search service answers this for millions of queries a day over a graph with thousands of airports and a hundred thousand flights. Which algorithm do you run per query, and what would you precompute?"

## Solution

### The naive approach

Enumerate every route from `src` with at most `k + 1` flights using DFS and keep the cheapest one that ends at `dst`. With average out-degree `d`, that explores up to `d^(k+1)` routes: exponential in `k`. Pruning branches that already cost more than the best answer helps in practice but not in the worst case.

### The insight

This is a shortest-path problem with an extra constraint on the **number of edges**, and that constraint breaks the usual Dijkstra argument. Dijkstra finalises each city at its cheapest price; but the cheapest way to reach an intermediate city may use too many flights, and a pricier way that uses fewer flights may be the only one that can still reach `dst` in time. The test with answer 11 and `k = 2` is built for this: the cheapest route to city 3 costs 3 but uses all three allowed flights, leaving none for the last hop to city 4, so the only useful way into city 3 is the direct flight for 10.

Bellman-Ford fits the constraint exactly. Its round structure has an invariant: **after round `i`, `price[v]` is the cheapest cost to reach `v` using at most `i` flights.** Run `k + 1` rounds and read off `price[dst]`.

The invariant only holds if each round extends paths by **one** flight. If you relax edges in place, a price lowered earlier in the round can be used again later in the same round, extending a path by two or more flights. So every round reads from the previous round's prices and writes into a copy.

### The optimal approach

1. `prev = [∞] * n`, `prev[src] = 0`.
2. Repeat `k + 1` times: `cur = prev.copy()`; for each flight `u → v` with price `p`, if `prev[u] + p < cur[v]`, set `cur[v] = prev[u] + p`. Then `prev = cur`.
3. Return `prev[dst]` if finite, else `-1`.

Trace the first example with `k = 1` (two rounds). Round 1 from `[0, ∞, ∞, ∞]`: city 1 → 100, city 2 → 500, city 3 → 900. Round 2 reads round 1's prices: `1 → 2` gives 200 for city 2, `2 → 3` gives 500 + 100 = 600 for city 3 (it reads the **old** 500, not the new 200). Result 600. Had you relaxed in place, this edge order would let round 1 alone chain `0 → 1 → 2 → 3` and report 300, a route with two stops.

```python
def find_cheapest_price(n: int, flights: list[list[int]], src: int, dst: int, k: int) -> int:
    INF = float("inf")
    prev = [INF] * n
    prev[src] = 0
    for _ in range(k + 1):
        cur = prev[:]                     # read last round, write this round
        for u, v, price in flights:
            if prev[u] + price < cur[v]:
                cur[v] = prev[u] + price
        prev = cur
    return prev[dst] if prev[dst] != INF else -1
```

Time `O((k + 1)·(n + E))`: each round copies the array and scans every flight. Space `O(n)`.

The Dijkstra variant also works if you make the **state** `(city, flights used)` instead of just `city`: pop `(cost, city, used)` from a heap, and do not prune a city just because it was reached before, only if it was reached before with fewer or equal flights at a lower or equal cost. Keeping `best_used[city]` and skipping a pop whose `used` is not smaller than the best seen so far is the standard pruning. It is often faster in practice, but its worst case is harder to state; Bellman-Ford's bound is exact.

### Common mistakes

- **Plain Dijkstra with a visited set.** On the answer-11 test with `k = 2`, it pops city 3 first at price 3 after three flights, cannot fly on, marks 3 as done, and then discards the direct 10 flight into 3 as already visited. It returns `-1`.
- **Relaxing in place.** Chains several flights in one round and ignores the stop limit. The first example returns 300 instead of 600.
- **Off by one on rounds.** `k` stops means `k + 1` flights, so `k + 1` rounds.
- **Stopping early when nothing changes.** Safe (if a round changes nothing, no later round will), and a nice optimisation, but only if the "changed" check compares against the previous round, not the copy you are writing.

### How to discuss it

Start by saying why Dijkstra is not enough: "the stop limit makes the state `(city, flights used)`, not just `city`, so the cheapest arrival at a city is not always the useful one." Then choose between expanding the state for Dijkstra and Bellman-Ford with `k + 1` rounds, and explain the copy. The copy is the detail that interviewers probe, because it is the difference between Bellman-Ford as "relax until stable" and Bellman-Ford as "exactly `i` edges after round `i`".

For the production follow-up, per-query Bellman-Ford over 10⁵ flights is fine for one query but wasteful at millions per day. Real flight search leans on precomputation and pruning: plausible connections between airports are computed ahead of time (respecting minimum connection times and sensible detours), popular origin-destination pairs are cached, and the expensive part is usually pricing (fare rules and seat availability) rather than the graph search itself. Saying that the algorithmic core is a constrained shortest path, and that the engineering is caching and pruning around it, is the senior answer.

---
slug: reconstruct-itinerary
title: Reconstruct Itinerary
difficulty: hard
patterns: [shortest-path]
lists: [ascend-150]
companies: [google, airbnb, uber, meta, expedia]
order: 5
lesson: interview-patterns/tree-and-graph-patterns/shortest-path-pattern
hints:
  - "Airports are nodes and tickets are directed edges, possibly repeated. You must use every edge exactly once: that is an Eulerian path, not a shortest path."
  - "Greedily taking the alphabetically smallest ticket can strand you at a dead end with tickets left over. You need a way to recover without full backtracking."
  - "Hierholzer's algorithm: walk greedily (smallest destination first) until you are stuck, then add the stuck airport to the *front* of the route and back up. Dead ends get placed last automatically. Reverse the post-order at the end."
signatures:
  python:
    name: find_itinerary
    starter: |
      def find_itinerary(tickets: list[list[str]]) -> list[str]:
          pass
  javascript:
    name: find_itinerary
    starter: |
      function find_itinerary(tickets) {
      }
tests:
  - args: [[["JFK", "SEA"], ["SEA", "LAX"], ["LAX", "JFK"], ["JFK", "ATL"]]]
    expected: ["JFK", "SEA", "LAX", "JFK", "ATL"]
    label: the smallest first choice is a dead end
  - args: [[["DEN", "ORD"], ["JFK", "DEN"]]]
    expected: ["JFK", "DEN", "ORD"]
    label: tickets given out of order
  - args: [[["JFK", "BOS"]]]
    expected: ["JFK", "BOS"]
    label: one ticket
  - args: [[["JFK", "BOS"], ["JFK", "AUS"], ["AUS", "JFK"], ["BOS", "JFK"]]]
    expected: ["JFK", "AUS", "JFK", "BOS", "JFK"]
    label: alphabetical choice when both work
  - args: [[["JFK", "MIA"], ["MIA", "JFK"], ["JFK", "MIA"], ["MIA", "JFK"]]]
    expected: ["JFK", "MIA", "JFK", "MIA", "JFK"]
    label: duplicate tickets are used separately
  - args: [[["JFK", "AAA"], ["AAA", "BBB"], ["AAA", "JFK"], ["JFK", "AAA"]]]
    expected: ["JFK", "AAA", "JFK", "AAA", "BBB"]
    hidden: true
    label: the dead end is one stop in
  - args: [[["JFK", "YYZ"], ["YYZ", "ORD"], ["ORD", "JFK"], ["JFK", "ORD"], ["ORD", "YYZ"], ["YYZ", "SFO"], ["SFO", "ORD"], ["ORD", "DEN"]]]
    expected: ["JFK", "ORD", "JFK", "YYZ", "ORD", "YYZ", "SFO", "ORD", "DEN"]
    hidden: true
  - args: [[["JFK", "LHR"], ["LHR", "CDG"], ["CDG", "JFK"], ["JFK", "CDG"], ["CDG", "LHR"], ["LHR", "AMS"]]]
    expected: ["JFK", "CDG", "JFK", "LHR", "CDG", "LHR", "AMS"]
    hidden: true
time_limit_ms: 4000
---
You found a pile of one-way plane tickets, each written as `[from, to]` with three-letter airport codes. They all belong to one traveller who started at `"JFK"` and used **every ticket exactly once**. Reconstruct the trip as the list of airports visited, in order, starting with `"JFK"`.

At least one valid trip always exists. If several do, return the one that comes first when the airport lists are compared element by element in alphabetical order. Duplicate tickets are separate tickets and must each be used.

### Examples

| Input | Output | Why |
|---|---|---|
| `[["JFK","SEA"],["SEA","LAX"],["LAX","JFK"],["JFK","ATL"]]` | `["JFK","SEA","LAX","JFK","ATL"]` | `ATL` is alphabetically first, but flying there first strands you with three tickets unused |
| `[["JFK","BOS"],["JFK","AUS"],["AUS","JFK"],["BOS","JFK"]]` | `["JFK","AUS","JFK","BOS","JFK"]` | Both orders use every ticket; `AUS` sorts before `BOS` |
| `[["DEN","ORD"],["JFK","DEN"]]` | `["JFK","DEN","ORD"]` | The pile is not in trip order |

### Constraints

- `1 ≤ len(tickets) ≤ 300`
- Airport codes are three uppercase letters
- A trip that uses every ticket exactly once, starting at `"JFK"`, exists

### Follow-up

The interviewer asks: "Drop the guarantee. How do you decide quickly, before searching, whether any valid trip exists? And what if the start airport is not given?"

## Solution

### The naive approach

Backtracking: from the current airport, try destinations in alphabetical order, mark the ticket used, recurse, and undo on failure. The first complete trip found is the answer, because choices were tried alphabetically. It is correct, and for friendly inputs it is fast, but a dead end discovered deep in the search forces it to unwind and retry, and adversarial inputs make that exponential.

### The insight

Airports are nodes, tickets are directed edges (a multigraph: repeats allowed). A trip that uses every edge exactly once is an **Eulerian path**. Finding one does not need search at all: **Hierholzer's algorithm** builds it in linear time.

The idea: walk from the start, always taking an unused edge, until you get stuck. In a graph that has an Eulerian path from `JFK`, the first walk can only get stuck at the trip's final airport (the one with more arrivals than departures, or `JFK` itself if the trip is a loop), because every other airport you enter has an unused ticket out. Now back up along your walk; at each airport that still has unused tickets, start another walk from there, which must be a cycle returning to that airport, and splice it in. The elegant implementation does the splicing with a stack and a **post-order**: an airport is appended to the route only when it has no unused tickets left, i.e. when you back out of it. Reversing the post-order gives the trip.

Why does this handle dead ends? A dead end (like `ATL`) is the one place the trip must finish. Post-order places whatever you get stuck at first **last** in the final route, which is exactly where a dead end belongs. The greedy walk may visit it too early; the post-order moves it to the end.

To get the alphabetically smallest trip, always take the smallest available destination. Informally, a smaller choice only ends up later in the final route when it led into the part of the graph that has to come last anyway, and in that case no valid trip could have taken it earlier.

### The optimal approach

1. Build `graph[from]` as a list of destinations sorted in **reverse**, so `pop()` from the end returns the smallest in `O(1)`.
2. Stack `["JFK"]`, route `[]`.
3. While the stack is non-empty: if the top airport has unused tickets, pop its smallest destination and push it. Otherwise pop the airport and append it to `route`.
4. Return `route` reversed.

Trace the first example. Graph: `JFK: [SEA, ATL]` (reversed, so `ATL` pops first), `SEA: [LAX]`, `LAX: [JFK]`. Stack `[JFK]`. JFK has tickets: push `ATL`. ATL has none: route `[ATL]`. JFK: push `SEA`, then `LAX`, then `JFK`. JFK now has none: route `[ATL, JFK]`. Then LAX, SEA, JFK are popped: route `[ATL, JFK, LAX, SEA, JFK]`. Reversed: `JFK, SEA, LAX, JFK, ATL`. The early detour to `ATL` became the ending.

```python
from collections import defaultdict

def find_itinerary(tickets: list[list[str]]) -> list[str]:
    graph: dict[str, list[str]] = defaultdict(list)
    for src, dst in sorted(tickets, reverse=True):
        graph[src].append(dst)            # reverse-sorted: pop() gives the smallest
    stack = ["JFK"]
    route: list[str] = []
    while stack:
        airport = stack[-1]
        if graph[airport]:
            stack.append(graph[airport].pop())
        else:
            route.append(stack.pop())     # post-order: stuck, so it goes last
    return route[::-1]
```

Time `O(E log E)` for sorting the tickets; the walk itself is `O(E)`, since each ticket is pushed and popped once. Space `O(E)`.

### Common mistakes

- **Pure greedy.** Always flying to the smallest destination and never backing up fails the first test: `JFK → ATL` and you are stuck with three tickets.
- **Marking airports visited.** Airports are revisited freely; it is **tickets** that are used once. A visited set on nodes breaks every test that returns to `JFK`.
- **Collapsing duplicate tickets.** Using a set of destinations loses repeated tickets. Keep a list (a multiset).
- **Appending in pre-order.** Appending an airport when you arrive, instead of when you leave it for good, reproduces the greedy walk, dead end and all.
- **Forgetting to reverse** the post-order.

### How to discuss it

Name it: "use every edge exactly once is an Eulerian path; Hierholzer finds it in linear time, and choosing the smallest destination at each step gives the lexicographically smallest one." Then explain why post-order fixes dead ends; this is the part interviewers actually probe, because the code is short enough to memorise and the reasoning is not. Also say explicitly that this is *not* a shortest-path problem even though it looks like route-finding: the constraint is coverage (every edge exactly once), not cost, so Dijkstra and BFS have nothing to offer.

For the follow-up, Euler's condition decides existence without search. A directed graph has an Eulerian path iff all nodes with edges are in one connected piece (ignoring direction) and either every node has `in = out` (then it is a cycle and can start anywhere with edges), or exactly one node has `out = in + 1` (the forced start), exactly one has `in = out + 1` (the forced end), and all others balance. So an unknown start airport is determined by the degrees; the given start is only a free choice when the trip is a closed loop.

---
slug: blast-radius
title: Blast Radius
difficulty: medium
patterns: [graph]
lists: [network-practice, ascend-150]
companies: [arista, cisco, nvidia, google]
order: 7
lesson: fabric-networking/fabric-architecture/redundancy-and-failure-domains
hints:
  - "Part 1 is plain reachability. \"Reaches some core node\" becomes one question if you add a virtual node joined to every core node. Run a BFS from it once with the failed device and once without, and compare."
  - "Repeating that BFS for every device answers part 2 in O(V · (V + E)). The devices whose loss strands anything are the cut vertices (articulation points) of the graph that separate a leaf from the virtual node, and one depth-first search finds them all."
  - "Run the DFS from the virtual node. Track each device's discovery time `disc` and `low`, the earliest discovery time its subtree can reach through a non-tree link. If a DFS child `v` of device `p` has `low[v] >= disc[p]`, nothing in `v`'s subtree can reach the virtual node except through `p`, so add the number of leaves in that subtree to `p`'s count."
signatures:
  python:
    name: blast_radius
    starter: |
      def blast_radius(links: list[list[str]], leaves: list[str], core: list[str], failed: str) -> dict:
          pass
  javascript:
    name: blast_radius
    starter: |
      function blast_radius(links, leaves, core, failed) {
      }
tests:
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf3.ams", "spine1.ams"], ["leaf3.ams", "spine2.ams"], ["leaf4.ams", "spine2.ams"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"], ["gw2.ams", "spine1.ams"], ["gw2.ams", "spine2.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], ["gw1.ams", "gw2.ams"], "spine2.ams"]
    expected: {"stranded": ["leaf4.ams"], "worst": "spine2.ams", "worst_count": 1}
    label: "a leaf cabled to only one spine"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf3.ams", "spine1.ams"], ["leaf3.ams", "spine2.ams"], ["leaf4.ams", "spine1.ams"], ["leaf4.ams", "spine2.ams"], ["rr1.ams", "spine1.ams"], ["rr2.ams", "spine1.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], ["rr1.ams", "rr2.ams"], "spine2.ams"]
    expected: {"stranded": [], "worst": "spine1.ams", "worst_count": 4}
    label: "both route reflectors behind one spine"
  - args: [[["leaf1.ams", "spine1.ams"], ["spine1.ams", "gw1.ams"], ["leaf2.ams", "gw2.ams"], ["gw2.ams", "gw1.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams"], ["gw1.ams", "gw2.ams"], "gw1.ams"]
    expected: {"stranded": ["leaf1.ams"], "worst": "gw1.ams", "worst_count": 1}
    label: "a failed core node, a three-way tie and a leaf that was never connected"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf1.ams", "spine3.ams"], ["leaf1.ams", "spine4.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf2.ams", "spine3.ams"], ["leaf2.ams", "spine4.ams"], ["leaf3.ams", "spine1.ams"], ["leaf3.ams", "spine2.ams"], ["leaf3.ams", "spine3.ams"], ["leaf3.ams", "spine4.ams"], ["leaf4.ams", "spine1.ams"], ["leaf4.ams", "spine2.ams"], ["leaf4.ams", "spine3.ams"], ["leaf4.ams", "spine4.ams"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"], ["gw1.ams", "spine3.ams"], ["gw1.ams", "spine4.ams"], ["gw2.ams", "spine1.ams"], ["gw2.ams", "spine2.ams"], ["gw2.ams", "spine3.ams"], ["gw2.ams", "spine4.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], ["gw1.ams", "gw2.ams"], "spine1.ams"]
    expected: {"stranded": [], "worst": null, "worst_count": 0}
    label: "a healthy Clos has no single point of failure"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf3.ams", "spine1.ams"], ["leaf3.ams", "spine2.ams"], ["leaf4.ams", "spine1.ams"], ["leaf4.ams", "spine2.ams"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], ["gw1.ams"], "gw1.ams"]
    expected: {"stranded": ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], "worst": "gw1.ams", "worst_count": 4}
    hidden: true
    label: "the only core node fails"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf3.ams", "spine1.ams"], ["leaf3.ams", "spine2.ams"], ["leaf4.ams", "spine2.ams"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"], ["gw2.ams", "spine1.ams"], ["gw2.ams", "spine2.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams"], ["gw1.ams", "gw2.ams"], "spine9.ams"]
    expected: {"stranded": [], "worst": "spine2.ams", "worst_count": 1}
    hidden: true
    label: "the failed device is not in the topology"
  - args: [[], ["leaf1.ams"], [], "leaf1.ams"]
    expected: {"stranded": [], "worst": null, "worst_count": 0}
    hidden: true
    label: "no links and no core nodes; the only device is a leaf and it fails"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["leaf1.sin", "spine1.sin"], ["leaf1.sin", "spine2.sin"], ["leaf2.sin", "spine1.sin"], ["leaf2.sin", "spine2.sin"], ["leaf3.sin", "spine2.sin"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"], ["gw2.ams", "spine1.ams"], ["gw2.ams", "spine2.ams"], ["spine1.ams", "spine1.sin"]], ["leaf1.ams", "leaf2.ams", "leaf1.sin", "leaf2.sin", "leaf3.sin"], ["gw1.ams", "gw2.ams"], "spine2.sin"]
    expected: {"stranded": ["leaf3.sin"], "worst": "spine1.ams", "worst_count": 3}
    hidden: true
    label: "two sites with one long-haul circuit already down"
  - args: [[["leaf1.ams", "spine1.ams"], ["spine1.ams", "leaf1.ams"], ["spine1.ams", "spine1.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["spine1.ams", "gw1.ams"], ["spine2.ams", "gw1.ams"]], ["leaf1.ams", "leaf2.ams"], ["gw1.ams"], "spine1.ams"]
    expected: {"stranded": ["leaf1.ams"], "worst": "gw1.ams", "worst_count": 2}
    hidden: true
    label: "parallel links and a self-loop do not add redundancy"
  - args: [[["spine1.ams", "gw1.ams"], ["spine1.ams", "gw2.ams"], ["leaf1.ams", "spine1.ams"], ["leaf1.ams", "leaf2.ams"], ["leaf2.ams", "leaf3.ams"], ["leaf3.ams", "leaf4.ams"], ["leaf4.ams", "leaf5.ams"], ["leaf5.ams", "leaf6.ams"], ["leaf6.ams", "leaf7.ams"], ["leaf7.ams", "leaf8.ams"]], ["leaf1.ams", "leaf2.ams", "leaf3.ams", "leaf4.ams", "leaf5.ams", "leaf6.ams", "leaf7.ams", "leaf8.ams"], ["gw1.ams", "gw2.ams"], "leaf4.ams"]
    expected: {"stranded": ["leaf5.ams", "leaf6.ams", "leaf7.ams", "leaf8.ams"], "worst": "spine1.ams", "worst_count": 8}
    hidden: true
    label: "leaves daisy-chained through each other; the failed leaf is not counted"
  - args: [[["spine7.sjc", "spine6.sjc"], ["leaf34.sjc", "spine6.sjc"], ["rail3-leaf1.sjc", "spine6.sjc"], ["gw1.sjc", "rail3-leaf1.sjc"], ["spine5.sjc", "gw1.sjc"], ["gw2.sjc", "leaf34.sjc"], ["leaf32.sjc", "gw1.sjc"], ["leaf25.sjc", "gw2.sjc"], ["leaf1.sjc", "gw1.sjc"], ["leaf33.sjc", "spine5.sjc"], ["rail2-leaf1.sjc", "leaf1.sjc"], ["rail9-leaf1.sjc", "leaf33.sjc"], ["leaf20.sjc", "leaf1.sjc"], ["leaf23.sjc", "leaf25.sjc"], ["leaf17.sjc", "leaf33.sjc"], ["leaf5.sjc", "rail9-leaf1.sjc"], ["leaf27.sjc", "leaf20.sjc"], ["rail5-leaf1.sjc", "leaf20.sjc"], ["leaf28.sjc", "rail5-leaf1.sjc"], ["rail7-leaf1.sjc", "leaf5.sjc"], ["leaf4.sjc", "rail5-leaf1.sjc"], ["rail1-leaf1.sjc", "leaf28.sjc"], ["leaf21.sjc", "leaf28.sjc"], ["rail6-leaf1.sjc", "leaf4.sjc"], ["leaf39.sjc", "leaf28.sjc"], ["leaf29.sjc", "rail1-leaf1.sjc"], ["leaf24.sjc", "rail6-leaf1.sjc"], ["rail8-leaf1.sjc", "leaf21.sjc"], ["leaf11.sjc", "leaf21.sjc"], ["leaf38.sjc", "leaf11.sjc"], ["leaf19.sjc", "rail8-leaf1.sjc"], ["leaf12.sjc", "leaf11.sjc"], ["leaf30.sjc", "leaf38.sjc"], ["leaf13.sjc", "rail8-leaf1.sjc"], ["leaf31.sjc", "leaf19.sjc"], ["rail10-leaf1.sjc", "leaf31.sjc"], ["leaf7.sjc", "leaf19.sjc"], ["leaf35.sjc", "leaf13.sjc"], ["leaf9.sjc", "leaf30.sjc"], ["leaf18.sjc", "leaf13.sjc"], ["leaf10.sjc", "leaf35.sjc"], ["leaf15.sjc", "rail10-leaf1.sjc"], ["leaf22.sjc", "leaf9.sjc"], ["leaf14.sjc", "leaf9.sjc"], ["spine8.sjc", "leaf15.sjc"], ["rail4-leaf1.sjc", "leaf14.sjc"], ["leaf16.sjc", "leaf14.sjc"], ["leaf37.sjc", "spine8.sjc"], ["leaf2.sjc", "leaf22.sjc"], ["leaf36.sjc", "leaf37.sjc"], ["spine4.sjc", "spine8.sjc"], ["spine2.sjc", "leaf2.sjc"], ["leaf8.sjc", "leaf16.sjc"], ["leaf3.sjc", "spine2.sjc"], ["spine3.sjc", "spine2.sjc"], ["leaf40.sjc", "spine4.sjc"], ["leaf26.sjc", "spine3.sjc"], ["spine1.sjc", "spine3.sjc"], ["leaf6.sjc", "spine1.sjc"], ["leaf39.sjc", "leaf9.sjc"], ["leaf36.sjc", "spine6.sjc"], ["leaf32.sjc", "spine1.sjc"], ["spine4.sjc", "leaf14.sjc"], ["gw1.sjc", "leaf34.sjc"], ["rail4-leaf1.sjc", "leaf17.sjc"], ["leaf20.sjc", "leaf15.sjc"], ["spine4.sjc", "leaf32.sjc"], ["rail10-leaf1.sjc", "leaf38.sjc"], ["leaf12.sjc", "leaf31.sjc"], ["leaf21.sjc", "leaf12.sjc"], ["leaf28.sjc", "rail3-leaf1.sjc"], ["spine2.sjc", "rail2-leaf1.sjc"], ["leaf20.sjc", "rail8-leaf1.sjc"]], ["leaf1.sjc", "leaf2.sjc", "leaf3.sjc", "leaf4.sjc", "leaf5.sjc", "leaf6.sjc", "leaf7.sjc", "leaf8.sjc", "leaf9.sjc", "leaf10.sjc", "leaf11.sjc", "leaf12.sjc", "leaf13.sjc", "leaf14.sjc", "leaf15.sjc", "leaf16.sjc", "leaf17.sjc", "leaf18.sjc", "leaf19.sjc", "leaf20.sjc", "leaf21.sjc", "leaf22.sjc", "leaf23.sjc", "leaf24.sjc", "leaf25.sjc", "leaf26.sjc", "leaf27.sjc", "leaf28.sjc", "leaf29.sjc", "leaf30.sjc", "leaf31.sjc", "leaf32.sjc", "leaf33.sjc", "leaf34.sjc", "leaf35.sjc", "leaf36.sjc", "leaf37.sjc", "leaf38.sjc", "leaf39.sjc", "leaf40.sjc", "rail1-leaf1.sjc", "rail2-leaf1.sjc", "rail3-leaf1.sjc", "rail4-leaf1.sjc", "rail5-leaf1.sjc", "rail6-leaf1.sjc", "rail7-leaf1.sjc", "rail8-leaf1.sjc", "rail9-leaf1.sjc", "rail10-leaf1.sjc"], ["gw1.sjc", "gw2.sjc"], "rail5-leaf1.sjc"]
    expected: {"stranded": ["leaf24.sjc", "leaf4.sjc", "rail6-leaf1.sjc"], "worst": "rail8-leaf1.sjc", "worst_count": 4}
    hidden: true
    label: "a 60-device irregular topology"
  - args: [[["leaf1.ams", "spine1.ams"], ["leaf1.ams", "spine2.ams"], ["leaf2.ams", "spine1.ams"], ["leaf2.ams", "spine2.ams"], ["gw1.ams", "spine1.ams"], ["gw1.ams", "spine2.ams"], ["spine1.ams", "spine1.sin"], ["leaf1.sin", "spine1.sin"], ["leaf1.sin", "spine2.sin"], ["leaf2.sin", "spine2.sin"], ["gw1.sin", "spine1.sin"], ["gw1.sin", "spine2.sin"]], ["leaf1.ams", "leaf2.ams", "leaf1.sin", "leaf2.sin"], ["gw1.ams", "gw1.sin"], "spine1.ams"]
    expected: {"stranded": [], "worst": "spine2.sin", "worst_count": 1}
    hidden: true
    label: "a cut vertex with a gateway on both sides strands nobody"
time_limit_ms: 4000
---
Before an engineer takes a switch out of service, or when one dies at 3 a.m., the first question is the same: who notices? A fabric is built so that the answer is usually "nobody", but one miscabled leaf or two "redundant" devices plugged into the same switch can turn a routine failure into an outage. This problem asks you to compute that answer from the topology, for one failure and then for every possible one.

### The networking idea in one minute

A data centre fabric is a graph. The vertices are **devices** (switches and routers) and the edges are **links** (cables between ports). Meridian's small Amsterdam fabric, used in the examples, has two kinds of switch in a leaf-spine layout ([Clos and leaf-spine](/learn/fabric-networking/fabric-architecture/clos-and-leaf-spine)): **leaves** such as `leaf1.ams`, which the servers plug into, and **spines** such as `spine1.ams`, which connect the leaves to each other. Each leaf normally has a link to every spine, so losing one spine costs capacity but cuts nobody off.

Some devices are the **core** a leaf must reach to be useful. In these examples the core is either the border gateways `gw1.ams` and `gw2.ams`, where traffic leaves for the internet (Meridian announces `203.0.113.0/24` there, a range reserved for documentation by RFC 5737), or the route reflectors `rr1.ams` and `rr2.ams`, which hand every leaf the routes it needs for the overlay ([route reflectors](/learn/fabric-networking/bgp-fundamentals/route-reflectors)). Reaching **any one** core node is enough: that is the point of having two.

A leaf is **stranded** by a failure when it is still running, its own links are still up, and yet no path from it to any surviving core node remains. Its servers are healthy and unreachable. The **blast radius** of a device is the number of leaves its failure strands. A device with a non-zero blast radius is a **single point of failure**, and finding those before they fail is a routine job for the tooling a software engineer builds for a network team ([redundancy and failure domains](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains)).

The examples use the reach of the topology alone: a path counts if the cables exist, whatever routing would prefer.

### The task

Write `blast_radius(links, leaves, core, failed)`.

- `links` is a list of `[a, b]` pairs of device names. A link is bidirectional. The list may contain the same link twice and a link from a device to itself.
- `leaves` lists the leaf devices and `core` the core devices. A leaf or core device may have no links at all. No device is both a leaf and a core node.
- The devices are every name that appears in `links`, `leaves` or `core`.
- `failed` names the device that fails. It may name a leaf, a core node, any other device, or something not in the topology at all (in which case nothing fails).

Return a dictionary (a plain object in JavaScript) with three keys:

- `"stranded"`: the leaves that can reach at least one core node in the intact topology but cannot reach any surviving core node once `failed` is removed. The failed device itself is never in the list, even if it is a leaf. Sort the names as plain strings (`"leaf10.ams"` comes before `"leaf2.ams"`).
- `"worst"`: the device whose failure would strand the most leaves, under the same rule, considering every device in the topology. Break ties by the smallest name as a plain string. If no single failure strands any leaf, return `None` (`null` in JavaScript).
- `"worst_count"`: how many leaves that worst failure strands (`0` when `worst` is `None`).

### Examples

**Example 1: a leaf cabled to only one spine.** Two spines and four leaves, every leaf linked to both spines except `leaf4.ams`, whose link to `spine1.ams` was never patched. Both gateways link to both spines. `core = ["gw1.ams", "gw2.ams"]`, `failed = "spine2.ams"`.

Output: `{"stranded": ["leaf4.ams"], "worst": "spine2.ams", "worst_count": 1}`. The other three leaves still reach both gateways through `spine1.ams`. `leaf4.ams` had one path, and it ran through `spine2.ams`. No other device strands anything: losing `spine1.ams` hurts capacity, not reachability.

**Example 2: both route reflectors behind one spine.** The same two spines and four leaves, now fully cabled. `rr1.ams` and `rr2.ams` both link only to `spine1.ams`. `core = ["rr1.ams", "rr2.ams"]`, `failed = "spine2.ams"`.

Output: `{"stranded": [], "worst": "spine1.ams", "worst_count": 4}`. The failure you were asked about is harmless. But the reflector pair is a pair in the configuration and a single device in the cabling: if `spine1.ams` fails, all four leaves lose both reflectors at once.

**Example 3: a failed core node and a tie.**

```text
links  = [["leaf1.ams", "spine1.ams"], ["spine1.ams", "gw1.ams"],
          ["leaf2.ams", "gw2.ams"], ["gw2.ams", "gw1.ams"]]
leaves = ["leaf1.ams", "leaf2.ams", "leaf3.ams"]
core   = ["gw1.ams", "gw2.ams"]
failed = "gw1.ams"
```

Output: `{"stranded": ["leaf1.ams"], "worst": "gw1.ams", "worst_count": 1}`. With `gw1.ams` gone, `leaf1.ams`'s only route out ended there. `leaf2.ams` still reaches `gw2.ams`, which is a core node in its own right, so it is fine. `leaf3.ams` has no links: it never reached the core, so no failure can strand it. Three devices each strand exactly one leaf (`gw1.ams` and `spine1.ams` strand `leaf1.ams`, `gw2.ams` strands `leaf2.ams`), and `"gw1.ams"` is the smallest name.

### Constraints

- `0 ≤ len(links) ≤ 2 × 10⁵`, and at most `10⁵` distinct devices.
- Names are non-empty ASCII strings. Names within `leaves` are distinct, and so are names within `core`. `core` may be empty.
- `failed` is any string.
- Duplicate links and self-loops may appear.

### Follow-up

"Spines are drained one at a time for software upgrades. While `spine2.ams` is drained, which device's failure strands the most leaves? Answer that for every spine you might drain. Then tell me why this graph answer is not enough to approve the maintenance."

## Solution

### The naive approach

Part 1 is a reachability question, and a breadth-first search (BFS) answers it. Start a BFS from every core node except the failed one at once, never step onto the failed device, and mark what you reach. Do it again with nothing failed. A leaf is stranded if the first BFS reached it, the second did not, and it is not the failed device. That is `O(V + E)` for `V` devices and `E` links, and it is already optimal for part 1.

For part 2 the obvious move is to run part 1 once per device: `V` searches of `O(V + E)` each, so `O(V · (V + E))`. On Meridian's full Amsterdam site (24 devices) that is instant. On a region with `10⁵` devices and `2 × 10⁵` links it is around `3 × 10¹⁰` steps, which is hours in Python. Say it, give the cost, and look for the structure.

### The insight

Two observations turn the question into one textbook algorithm.

**Merge the core into one node.** "Reaches some core node" is awkward because there are several targets. Add a virtual node `R`, joined to every core node. A device reaches a surviving core node exactly when it reaches `R` without passing the failed device, because `R`'s only neighbours are the core nodes. `R` itself never fails. Now there is one target.

**A failure strands a leaf only if the device is a cut vertex between that leaf and `R`.** A **cut vertex** (articulation point) is a vertex whose removal disconnects the graph. Tarjan's algorithm finds them all with a single depth-first search (DFS), and it can say exactly *which part* each one cuts off. Run the DFS from `R`. Give each device a discovery time `disc` and compute `low`, the smallest discovery time that the device's DFS subtree can reach using one non-tree link. For a device `p` and its DFS child `v`:

- If `low[v] < disc[p]`, some device in `v`'s subtree has a link to something discovered before `p`, which is on the way back to `R`. Removing `p` leaves that detour, and the subtree stays connected to `R`.
- If `low[v] ≥ disc[p]`, every link out of `v`'s subtree lands in the subtree or on `p`. Removing `p` disconnects the whole subtree from `R`.

So the blast radius of `p` is the sum, over its children `v` with `low[v] ≥ disc[p]`, of the number of leaves in `v`'s subtree. Leaf counts per subtree come for free as the DFS returns. Devices the DFS never reaches (not connected to any core node) strand nothing, and leaves it never reaches are never counted, which is the "was connected before" rule.

Rooting at `R` is what makes the counts right. A plain articulation-point search on the device graph would report a device that splits the graph into two halves that each contain a gateway: it is a cut vertex, but it strands nobody.

### The optimal approach

1. Collect every device name, sort them, and map each to an integer. The virtual node is the integer `n`.
2. Build adjacency lists, skipping self-loops, and join `R` to every core node.
3. Part 1: BFS from `R` with nothing removed and with `failed` removed; stranded leaves are those reached by the first and not the second, minus `failed`.
4. Part 2: one iterative DFS from `R` computing `disc`, `low`, the leaves below each device, and the blast radius of each device as its children finish.
5. Scan devices in sorted order and keep the first strict maximum, so ties go to the smallest name.

```python
from collections import deque


def _reachable(adj: list[list[int]], starts: list[int], removed: int) -> list[bool]:
    seen = [False] * len(adj)
    queue = deque()
    for s in starts:
        if s != removed and not seen[s]:
            seen[s] = True
            queue.append(s)
    while queue:
        v = queue.popleft()
        for w in adj[v]:
            if w != removed and not seen[w]:
                seen[w] = True
                queue.append(w)
    return seen


def blast_radius(links: list[list[str]], leaves: list[str], core: list[str], failed: str) -> dict:
    names = sorted(set(leaves) | set(core) | {d for link in links for d in link})
    idx = {name: i for i, name in enumerate(names)}
    n = len(names)
    root = n                                   # virtual node joined to every core node
    adj: list[list[int]] = [[] for _ in range(n + 1)]
    for a, b in links:
        if a != b:                             # a self-loop never helps reachability
            adj[idx[a]].append(idx[b])
            adj[idx[b]].append(idx[a])
    for c in core:
        adj[root].append(idx[c])
        adj[idx[c]].append(root)
    is_leaf = [False] * (n + 1)
    for leaf in leaves:
        is_leaf[idx[leaf]] = True

    # Part 1: one failure. Reachable before, unreachable after, and not the failed device.
    gone = idx.get(failed, -1)
    before = _reachable(adj, [root], -1)
    after = _reachable(adj, [root], gone)
    stranded = [name for name in leaves
                if idx[name] != gone and before[idx[name]] and not after[idx[name]]]
    stranded.sort()

    # Part 2: every failure at once. Iterative DFS from the virtual root (Tarjan).
    disc = [-1] * (n + 1)                      # discovery time
    low = [0] * (n + 1)                        # earliest discovery time reachable from the subtree
    below = [0] * (n + 1)                      # leaves in the DFS subtree
    cut_off = [0] * (n + 1)                    # leaves stranded if this device fails
    parent = [-1] * (n + 1)
    nxt = [0] * (n + 1)                        # next neighbour to look at
    disc[root] = low[root] = 0
    timer = 1
    stack = [root]
    while stack:
        v = stack[-1]
        if nxt[v] < len(adj[v]):
            w = adj[v][nxt[v]]
            nxt[v] += 1
            if disc[w] == -1:                  # tree edge: descend
                parent[w] = v
                disc[w] = low[w] = timer
                timer += 1
                below[w] = 1 if is_leaf[w] else 0
                stack.append(w)
            else:                              # back edge (or the edge to the parent)
                low[v] = min(low[v], disc[w])
        else:                                  # v is finished: report to its parent
            stack.pop()
            p = parent[v]
            if p == -1:
                continue
            low[p] = min(low[p], low[v])
            below[p] += below[v]
            if p != root and low[v] >= disc[p]:
                cut_off[p] += below[v]         # v's subtree has no way round p

    worst, worst_count = None, 0
    for i, name in enumerate(names):           # names are sorted: ties go to the smallest
        if cut_off[i] > worst_count:
            worst, worst_count = name, cut_off[i]
    return {"stranded": stranded, "worst": worst, "worst_count": worst_count}
```

The DFS is iterative on purpose. The hidden tests include leaves daisy-chained through each other, and a chain of `10⁵` devices would blow through Python's default recursion limit of 1,000 and, in JavaScript, the call stack.

Duplicate links need no special handling. For cut vertices (unlike bridges, the cut-edge version of this problem) a second link to the parent only sets `low[v]` to `disc[p]`, which still satisfies `low[v] ≥ disc[p]`: two cables to the same spine do not make that spine any less of a single point of failure.

Trace Example 3. Names sorted: `gw1`, `gw2`, `leaf1`, `leaf2`, `leaf3`, `spine1` (dropping `.ams`); `R` joins `gw1` and `gw2`. The DFS goes `R → gw1 (disc 1) → spine1 (2) → leaf1 (3)`. `leaf1`'s only link goes back to `spine1`, so it finishes with `low 2 ≥ disc[spine1] 2` and `spine1` cuts off one leaf; `spine1` finishes with `low 1 ≥ disc[gw1] 1` (its best link reaches `gw1` itself, nothing earlier), so `gw1` cuts off one leaf. Back at `gw1`, the DFS takes `gw2 (4) → leaf2 (5)`: `leaf2` gives `gw2` one leaf. `gw2` has a link to `R` (`disc 0`), so `low[gw2] = 0 < disc[gw1]`, and `gw1` does not get `gw2`'s leaf: `leaf2` survives `gw1`'s failure through `gw2`. Counts: `gw1` 1, `gw2` 1, `spine1` 1. `leaf3` is never discovered, so nothing counts it.

**Complexity.** The two BFS runs and the DFS each touch every device and link a constant number of times: `O(V + E)`. Sorting the names is `O(V log V)` (string comparisons add a factor of the name length), and sorting the stranded list is `O(k log k)` for `k` stranded leaves. Space is `O(V + E)` for the adjacency lists and the per-device arrays. The sort exists only for the tie-break and the output order; without them the whole thing is linear.

### Common mistakes

- **Counting the failed device.** If `leaf4.ams` fails, its servers are down, but the question is which *other* leaves lose their way out. The daisy-chain test fails a leaf in the middle of a chain.
- **Counting leaves that never had a path.** A leaf with no links is not stranded by anything; it was down before. Compare against the intact topology, not just the failed one.
- **Requiring every core node.** A leaf that reaches `gw2.ams` is fine when `gw1.ams` fails. Running one search per core node and demanding all of them reports false outages.
- **Starting the BFS from the failed core node.** When `failed` is a gateway, it must not seed the search.
- **Plain articulation points.** A device that splits the graph into two pieces, each with a gateway, is a cut vertex and strands nobody (one hidden test joins two sites, each with its own gateway, through a single spine-to-spine circuit). Root the DFS at the virtual node, or count only the subtrees that lose the root.
- **Counting the virtual node as a device.** `R` is a cut vertex whenever there are two core nodes in separate components, and it must never be reported.
- **Recursive DFS.** Correct on the examples, a crash on a long chain.
- **Natural sort.** `"leaf24.sjc"` comes before `"leaf4.sjc"` as plain strings. The tests check plain string order, which both `sorted()` and JavaScript's default `sort()` give.

### How to discuss it

Start with the model: devices are vertices, links are edges, "reaches the core" is reachability to any of several targets, and adding a virtual node makes it one target. Part 1 is then two BFS runs; say so and write it quickly. For part 2, give the per-device BFS and its `O(V · (V + E))` cost, then name the structure: "the devices with a non-zero blast radius are the cut vertices between a leaf and the core, and Tarjan's low-link DFS finds every one in a single pass." Explain the `low[v] ≥ disc[p]` test in one sentence before coding it, and say why the DFS is rooted at the virtual node. After coding, trace Example 3, because it exercises the case people get wrong: a core node failing while another core node is still reachable.

If the interviewer is a network engineer, connect the answer to operations early: this is the check a change system runs before a drain, and the list a dashboard shows as "single points of failure".

### Networking follow-ups

A network-org interviewer will push from the graph to the fabric.

- **"Answer the drain question."** Remove the drained spine and run the same DFS on what is left: `O(V + E)` per drained device. You only drain a handful of devices per change window, so looping over the maintenance plan is the right answer. For every pair of devices at once, the structure is the graph's 2-vertex cuts (an SPQR tree finds them in linear time), which is worth naming and rarely worth building. The common wrong answer is to approve a drain because the drained spine itself strands nothing, without asking what the *next* failure does while it is out. That is exactly when single-homed leaves appear ([safe change and maintenance](/learn/fabric-networking/operating-fabrics/safe-change-and-maintenance)).
- **"Why is reachability not enough to approve it?"** Because a leaf that keeps one uplink out of four is "connected" and may be dropping traffic. With four spines and one drained, each leaf has three quarters of its uplink capacity; if busy-hour load is above that, the drain causes congestion with no device stranded. The real check is headroom: the load on the surviving paths against their capacity ([redundancy and failure domains](/learn/fabric-networking/fabric-architecture/redundancy-and-failure-domains) works the N+1 arithmetic). Turning this problem into a capacity check means weighted edges and a max-flow or per-link load estimate under ECMP ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)).
- **"Is the cabling graph the right graph?"** Not always. Routing decides which physical paths carry traffic. In an eBGP underlay where every spine shares one AS number, a spine rejects a route that has already passed through another spine, because it sees its own AS in the path; traffic from one spine never detours through a leaf to reach another, so a path through another leaf may exist in the cables and not in the routing ([BGP as the underlay](/learn/fabric-networking/underlay/bgp-as-the-underlay)). The honest answer is to run the algorithm on the graph the routing protocol actually uses (the IS-IS adjacencies or BGP sessions that are up), or on the physical graph with transit through leaves forbidden.
- **"Where does the topology come from?"** From two sources, and the difference matters. The intended topology lives in the source of truth (the cabling plan). The actual one comes from the devices: LLDP neighbours (the link-layer discovery protocol, which switches run on every port to announce themselves to the neighbour at the other end) or the IS-IS database. Example 1's missing patch is invisible in the intended graph and obvious in the actual one. Run the check on both, and alert on the difference.
- **"Devices are not the only thing that fails."** A rack, a power feed, a software release or a trench can take several devices or links down together; that set is a shared risk group ([connecting sites and backbones](/learn/fabric-networking/fabric-architecture/connecting-sites-and-backbones) covers SRLGs for circuits). Replace "remove one device" with "remove every member of the group" and rerun part 1 per group. Example 2 is the classic case: two reflectors that share one spine, or one rack, fail together.
- **"What do you count?"** Leaves are a proxy. Operators care about servers, tenants or revenue. Give each leaf a weight (its single-homed servers, its Acme and Globex tenants) and sum weights instead of counts; the DFS is unchanged. Servers dual-homed to two leaves move the question one level down: a server is stranded only when both its leaves are.
- **"What would you show on the dashboard?"** The list of devices with a non-zero blast radius, each with the leaves it would strand, recomputed whenever the topology changes. A healthy Clos shows an empty list, so any entry is news. Pair it with the pre-change check: the change system refuses to drain a device when the drain plus any single further failure strands a leaf, unless someone overrides it on purpose.

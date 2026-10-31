---
slug: summarize-routes
title: Summarize Routes
difficulty: medium
patterns: [bit-manipulation]
lists: [network-practice, ascend-150]
companies: [cloudflare, amazon, arista, juniper]
order: 3
lesson: fabric-networking/from-zero/the-routing-table
hints:
  - "Turn each prefix into a pair (network as a 32-bit integer with the host bits cleared, length). A /L block holds 2^(32 - L) addresses and always starts on a multiple of that size."
  - "Two /L blocks merge into one /(L-1) only if they are siblings: the left one starts on a multiple of 2^(33 - L) and the right one starts exactly 2^(32 - L) later. Being next to each other is not enough."
  - "Sort by (network, length). A covering block now comes before everything it covers, and siblings end up side by side. Keep a stack of disjoint blocks: skip a block that falls inside the top, otherwise push it and keep merging the top two while they are siblings, because one merge can create a new sibling pair."
signatures:
  python:
    name: summarize_routes
    starter: |
      def summarize_routes(prefixes: list[str]) -> list[str]:
          pass
  javascript:
    name: summarize_routes
    starter: |
      function summarize_routes(prefixes) {
      }
tests:
  - args: [["198.51.100.0/26", "198.51.100.128/26", "198.51.100.64/26", "198.51.100.192/26"]]
    expected: ["198.51.100.0/24"]
    label: "four /26 blocks cascade into one /24"
  - args: [["203.0.113.0/24", "203.0.113.128/25", "203.0.113.7/32", "192.0.2.0/25"]]
    expected: ["192.0.2.0/25", "203.0.113.0/24"]
    label: "covered prefixes are dropped"
  - args: [["10.254.1.0/24", "10.254.2.0/24", "10.254.3.0/24", "10.254.4.0/24"]]
    expected: ["10.254.1.0/24", "10.254.2.0/23", "10.254.4.0/24"]
    label: "Amsterdam spine link blocks: adjacent is not enough"
  - args: [["10.255.1.11/32", "10.255.1.12/32", "10.255.1.13/32", "10.255.1.14/32", "10.255.1.15/32", "10.255.1.16/32", "10.255.1.17/32", "10.255.1.18/32", "10.255.1.19/32", "10.255.1.20/32", "10.255.1.21/32", "10.255.1.22/32", "10.255.1.23/32", "10.255.1.24/32", "10.255.1.25/32", "10.255.1.26/32"]]
    expected: ["10.255.1.11/32", "10.255.1.12/30", "10.255.1.16/29", "10.255.1.24/31", "10.255.1.26/32"]
    label: "sixteen leaf loopbacks 10.255.1.11-26"
  - args: [[]]
    expected: []
    label: "empty input"
  - args: [["10.255.3.101/32"]]
    expected: ["10.255.3.101/32"]
    label: "a single /32"
  - args: [["10.1.1.10/24", "10.1.0.77/24", "10.1.1.0/24"]]
    expected: ["10.1.0.0/23"]
    hidden: true
    label: "host bits set and duplicates"
  - args: [["0.0.0.0/0", "10.1.1.0/24", "203.0.113.0/24"]]
    expected: ["0.0.0.0/0"]
    hidden: true
    label: "the default route covers everything"
  - args: [["128.0.0.0/1", "0.0.0.0/1"]]
    expected: ["0.0.0.0/0"]
    hidden: true
    label: "two /1 halves become the default route"
  - args: [["255.255.255.255/32", "0.0.0.1/32", "255.255.255.254/32", "0.0.0.0/32", "0.0.0.2/32"]]
    expected: ["0.0.0.0/31", "0.0.0.2/32", "255.255.255.254/31"]
    hidden: true
    label: "both ends of the address space"
  - args: [["10.0.1.0/24", "10.0.0.192/26", "10.0.0.0/25", "10.0.0.128/26", "10.0.0.64/26"]]
    expected: ["10.0.0.0/23"]
    hidden: true
    label: "a merge whose result merges again, unsorted"
  - args: [["10.0.0.0/25", "10.0.0.0/24", "10.0.0.0/25", "10.0.1.0/32"]]
    expected: ["10.0.0.0/24", "10.0.1.0/32"]
    hidden: true
    label: "same start address: the shorter prefix must sort first"
  - args: [["128.0.0.0/1", "64.0.0.0/2", "32.0.0.0/3", "16.0.0.0/4", "8.0.0.0/5", "4.0.0.0/6", "2.0.0.0/7", "1.0.0.0/8", "0.128.0.0/9", "0.64.0.0/10", "0.32.0.0/11", "0.16.0.0/12", "0.8.0.0/13", "0.4.0.0/14", "0.2.0.0/15", "0.1.0.0/16", "0.0.128.0/17", "0.0.64.0/18", "0.0.32.0/19", "0.0.16.0/20", "0.0.8.0/21", "0.0.4.0/22", "0.0.2.0/23", "0.0.1.0/24", "0.0.0.128/25", "0.0.0.64/26", "0.0.0.32/27", "0.0.0.16/28", "0.0.0.8/29", "0.0.0.4/30", "0.0.0.2/31", "0.0.0.1/32", "0.0.0.0/32"]]
    expected: ["0.0.0.0/0"]
    hidden: true
    label: "a 32-level cascade from /32 to the default route"
  - args: [["198.51.100.106/32", "198.51.100.83/32", "198.51.100.57/31", "10.254.1.94/32", "10.254.1.70/32", "10.254.1.125/32", "203.0.113.63/31", "198.51.100.46/27", "198.51.100.77/29", "198.51.100.20/31", "198.51.100.4/31", "10.254.1.5/32", "203.0.113.123/30", "198.51.100.73/31", "10.254.1.73/27", "10.254.1.17/28", "10.254.1.60/30", "203.0.113.87/31", "198.51.100.18/31", "203.0.113.37/30", "10.254.1.62/27", "10.254.1.85/31", "198.51.100.102/32", "10.254.1.69/30", "198.51.100.47/27", "203.0.113.55/28", "203.0.113.112/27", "10.254.1.73/27", "198.51.100.39/28", "10.254.1.90/30", "10.254.1.99/30", "198.51.100.17/31", "198.51.100.126/28", "203.0.113.14/31", "198.51.100.51/30", "198.51.100.54/30", "203.0.113.62/27", "203.0.113.119/30", "198.51.100.10/28", "10.254.1.21/28", "203.0.113.28/32", "198.51.100.96/31", "203.0.113.56/30", "10.254.1.109/31", "203.0.113.4/30", "198.51.100.21/28", "10.254.1.14/32", "203.0.113.84/32", "203.0.113.37/32", "198.51.100.119/31", "203.0.113.113/31", "203.0.113.98/31", "198.51.100.86/32", "198.51.100.109/32", "198.51.100.53/32", "10.254.1.99/32", "203.0.113.15/31", "10.254.1.81/32", "203.0.113.57/29", "203.0.113.123/30"]]
    expected: ["10.254.1.5/32", "10.254.1.14/32", "10.254.1.16/28", "10.254.1.32/27", "10.254.1.64/27", "10.254.1.96/30", "10.254.1.108/31", "10.254.1.125/32", "198.51.100.0/26", "198.51.100.72/29", "198.51.100.83/32", "198.51.100.86/32", "198.51.100.96/31", "198.51.100.102/32", "198.51.100.106/32", "198.51.100.109/32", "198.51.100.112/28", "203.0.113.4/30", "203.0.113.14/31", "203.0.113.28/32", "203.0.113.32/27", "203.0.113.84/32", "203.0.113.86/31", "203.0.113.96/27"]
    hidden: true
    label: "60 mixed prefixes from three blocks"
time_limit_ms: 4000
---
A router that tells its neighbours about a thousand small networks makes every one of them store a thousand routes and process an update each time one of them changes. If those networks happen to tile a larger block exactly, it can say the same thing with one route. This problem asks you to compute that shortest equivalent list: **route summarisation**, also called aggregation.

### The networking idea in one minute

An IPv4 address is a 32-bit number written as four bytes in decimal, `198.51.100.64`. A **prefix** `a.b.c.d/L` names the block of every address whose first `L` bits match `a.b.c.d`; the remaining `32 - L` bits (the host bits) are free. So a `/L` block always holds `2^(32 - L)` addresses and always starts on a multiple of that size: `198.51.100.64/26` is the 64 addresses `.64` to `.127`.

Two blocks can be replaced by one shorter prefix only when they are the two halves of it. `198.51.100.0/25` and `198.51.100.128/25` are the halves of `198.51.100.0/24`: they share the first 24 bits and differ only in bit 25. Call such a pair **siblings**. Blocks that merely touch are not necessarily siblings. `10.254.1.0/24` and `10.254.2.0/24` are adjacent, but the /23 that would contain `10.254.1.0` is `10.254.0.0/23`, which covers `10.254.0.0` to `10.254.1.255` and leaves `10.254.2.0/24` outside. No single prefix covers exactly those two blocks.

A block can also sit entirely inside another: `203.0.113.128/25` is inside `203.0.113.0/24`. When all you are describing is *which addresses* you have, the inner one adds nothing, so it is **covered** and can be dropped.

The examples use Meridian's private `10.0.0.0/8` plan (fabric links in `10.254.0.0/16`, loopbacks in `10.255.<site>.<n>/32`) and the documentation ranges reserved for examples (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, RFC 5737).

### The task

Write `summarize_routes(prefixes)`.

- `prefixes` is a list of strings `"a.b.c.d/L"` with `0 ≤ L ≤ 32`. Only the first `L` bits count: `"10.1.1.10/24"` means `10.1.1.0/24`. The same block may appear more than once, and blocks may overlap.
- Return the **smallest list of prefixes that covers exactly the same set of addresses** as the input: every address covered by some input prefix, and no other address.
- Write each output prefix in canonical form (host bits zero, for example `"10.254.2.0/23"`) and sort the output by network address, lowest first. The output blocks never overlap, so this order is unambiguous.

Merge siblings into their parent repeatedly, and drop any block that another block covers.

### Examples

| Input | Output | Why |
|---|---|---|
| `["198.51.100.0/26", "198.51.100.128/26", "198.51.100.64/26", "198.51.100.192/26"]` | `["198.51.100.0/24"]` | `.0/26` and `.64/26` are siblings and become `.0/25`; `.128/26` and `.192/26` become `.128/25`; those two are siblings again and become the `/24`. Input order does not matter. |
| `["203.0.113.0/24", "203.0.113.128/25", "203.0.113.7/32", "192.0.2.0/25"]` | `["192.0.2.0/25", "203.0.113.0/24"]` | The `/25` and the `/32` sit inside `203.0.113.0/24`, so they are covered. `192.0.2.0/25` has nothing to merge with and stays. |
| `["10.254.1.0/24", "10.254.2.0/24", "10.254.3.0/24", "10.254.4.0/24"]` | `["10.254.1.0/24", "10.254.2.0/23", "10.254.4.0/24"]` | Meridian's four Amsterdam spine link blocks. Only `.2` and `.3` are siblings (`10.254.2.0/23`). `10.254.1.0/24`'s sibling is `10.254.0.0/24`, which is missing, and `10.254.4.0/24`'s is `10.254.5.0/24`. Four contiguous /24s that do not start on a multiple of 4 need three routes. |

The same alignment trap catches loopbacks. Amsterdam's 16 leaves use `10.255.1.11/32` to `10.255.1.26/32`, and because the numbering starts at 11 rather than 16, they summarise to five prefixes (`10.255.1.11/32`, `10.255.1.12/30`, `10.255.1.16/29`, `10.255.1.24/31`, `10.255.1.26/32`), not one.

### Constraints

- `0 ≤ len(prefixes) ≤ 10⁵`
- Every entry is a valid `"a.b.c.d/L"` string with `0 ≤ L ≤ 32`.
- An empty input returns an empty list. `0.0.0.0/0` covers every address.

### Follow-up

"Now every prefix carries a next hop, and the output must forward every address to exactly the same next hop as the input table under longest-prefix match. A more-specific with a different next hop is no longer redundant. What can you still merge or drop, what is the minimal table now, and how would you keep it minimal as routes are added and withdrawn a few thousand times a second?"

## Solution

### The naive approach

The direct translation of the rules is a fixpoint loop: scan every pair of blocks, delete one that is covered by another, replace a sibling pair with its parent, and repeat until a full scan changes nothing. Each scan is `O(n²)` and a merge can enable another merge one level up, so in the worst case you need many scans: roughly `O(n² · W)` with `W = 32`, or worse, depending on how the loop is written. For `n = 10⁵` that is far too slow.

The other naive idea, expanding every prefix into its addresses and rebuilding blocks from the set, dies on the first `/8` (16.7 million addresses), and `0.0.0.0/0` is 4.3 billion.

### The insight

Two blocks of addresses are either nested or disjoint; prefixes never partially overlap. So if you sort the blocks by network address, and by length (shorter first) on a tie, a block that covers others comes immediately before everything it covers, and two siblings, once the covered blocks are gone, sit next to each other.

That makes the problem a single left-to-right sweep with a stack, like merging intervals. The stack holds disjoint blocks in address order. A new block is either inside the top of the stack (drop it) or entirely after it (push it). After a push, the only place a new sibling pair can appear is the top two entries, and merging them can create a parent that is a sibling of the entry below, so you keep merging while the top two are siblings.

### The optimal approach

1. Parse each prefix to `(network, length)`, where `network` is the 32-bit address with the host bits cleared. With `size = 2^(32 - length)`, clearing the host bits is `address // size * size`.
2. Sort the pairs. Python's tuple order is exactly "by network, then shorter first".
3. Sweep. If the stack's top block contains the new one's start address, skip it. Otherwise push it, then while the top two entries have the same length `L > 0`, the left one starts on a multiple of `2 · size`, and the right one starts at `left + size`, replace them with their parent `(left, L - 1)`.
4. Format the stack back to dotted quads. It is already in address order.

```python
def _to_int(addr: str) -> int:
    a, b, c, d = (int(part) for part in addr.split("."))
    return (a << 24) | (b << 16) | (c << 8) | d


def _to_str(value: int) -> str:
    return ".".join(str((value >> shift) & 255) for shift in (24, 16, 8, 0))


def summarize_routes(prefixes: list[str]) -> list[str]:
    blocks = []
    for prefix in prefixes:
        addr, length = prefix.split("/")
        length = int(length)
        size = 1 << (32 - length)                     # addresses in the block
        blocks.append((_to_int(addr) // size * size, length))  # clear host bits
    blocks.sort()                                     # by address, shorter first on a tie

    stack: list[tuple[int, int]] = []                 # disjoint blocks, in address order
    for net, length in blocks:
        if stack:
            top_net, top_len = stack[-1]
            if net < top_net + (1 << (32 - top_len)):
                continue                              # inside the top block: covered
        stack.append((net, length))
        while len(stack) >= 2:                        # merge siblings, cascading upwards
            (a_net, a_len), (b_net, b_len) = stack[-2], stack[-1]
            size = 1 << (32 - a_len)
            if a_len != b_len or a_len == 0 or a_net % (2 * size) or b_net != a_net + size:
                break
            stack.pop()
            stack[-1] = (a_net, a_len - 1)            # the parent starts where the left half does
    return [f"{_to_str(net)}/{length}" for net, length in stack]
```

The "covered" test needs only the top of the stack. Every stacked block starts at or before the new block (the input is sorted), the stacked blocks are disjoint, and the top is the last of them, so if any stacked block contains the new start address, the top does. Containing the start address is enough: a block that contains a later block's first address contains the whole later block, because prefixes nest or are disjoint.

Trace the hidden test `["10.0.1.0/24", "10.0.0.192/26", "10.0.0.0/25", "10.0.0.128/26", "10.0.0.64/26"]`. Sorted: `0/25`, `64/26`, `128/26`, `192/26`, `1.0/24` (all in `10.0.x`). Push `0/25`. `64/26` starts inside it (0 to 127), skip. Push `128/26`; it has length 26 and `0/25` has length 25, so no merge. Push `192/26`: siblings with `128/26` (128 is a multiple of 128, and 192 = 128 + 64), merge to `128/25`; now `0/25` and `128/25` are siblings, merge to `10.0.0.0/24`. Push `10.0.1.0/24`: siblings with `10.0.0.0/24` (`10.0.0.0` starts on a multiple of 512 addresses, and `10.0.1.0` starts 256 later), merge to `10.0.0.0/23`. One sweep, three cascading merges.

**Why the result is minimal.** Call a prefix *maximal* if it lies inside the input's address set and its parent does not. Maximal prefixes are disjoint, every prefix inside the set lies inside exactly one of them, and each needs at least one output prefix of its own, so no answer has fewer entries than there are maximal prefixes. The sweep's output is exactly the maximal prefixes. Suppose some output block is not maximal, and pick the smallest such block `B`. Its parent is inside the set, so `B`'s sibling is covered by other output blocks. None of them can be the sibling itself (the merge loop would have joined them, since siblings are adjacent on the stack) or contain it (it would overlap `B`). So the sibling is tiled by output blocks strictly smaller than `B`, and their parents lie inside `B`'s parent, which is inside the set, so they are not maximal either. That contradicts the choice of `B`. The answer is also unique, which is why the tests can compare exact lists.

**Complexity.** Parsing is `O(n)`. Sorting is `O(n log n)`. The sweep is `O(n)` amortised: each block is pushed once, and each merge removes one stack entry, so there are at most `n` merges in total. Space is `O(n)` for the pairs and the stack. Because keys are 32-bit integers, a radix sort would make the whole thing `O(n)`, which is rarely worth saying unless asked.

Two other correct approaches are worth naming. **Union of ranges, then split:** turn each block into the integer range `[start, start + size)`, merge overlapping and touching ranges like Merge Intervals, then cut each range greedily into the largest aligned block that starts at the current position and fits (`start & -start` gives the alignment). It is the same `O(n log n)` and it is what Python's `ipaddress.collapse_addresses` returns; say you know the library, then write the algorithm. **Binary trie:** insert every prefix, discard subtrees below a node that is a prefix, then in post-order mark a node as a prefix when both its children are. That is `O(n · W)` with no sort, and it is the structure the follow-ups need.

### Common mistakes

- **Merging adjacent blocks that are not siblings.** `10.254.1.0/24` and `10.254.2.0/24` do not make `10.254.0.0/23`; that /23 adds `10.254.0.0/24` and loses `10.254.2.0/24`. Check alignment, not just contiguity.
- **One merge pass with no cascade.** After `.128/26` and `.192/26` become `.128/25`, it must be checked against `.0/25` straight away. A `while` loop on the stack does this; a single `if` does not.
- **Merging the default route.** `0.0.0.0/0` has no parent and no sibling. Guard `L > 0`, otherwise the parent length becomes `-1`.
- **Not clearing host bits before sorting.** `"10.1.1.10/24"` and `"10.1.1.0/24"` are the same block and must deduplicate; without masking they sort apart and neither covers the other's start.
- **Sorting strings.** `"10.1.10.0/24"` sorts before `"10.1.2.0/24"` as text. Sort the integers.
- **Sorting by length first.** A shorter covering block must come before the blocks it contains, and that happens only when the address is the primary key.
- **JavaScript integers.** `1 << 32` is `1` in JavaScript (shift counts are taken mod 32), and `a << 24` goes negative when `a ≥ 128`. Use `2 ** (32 - L)` and multiplication; every value up to `2^32` is exact in a double.

### How to discuss it

Start with the networking rule in one line: two blocks merge only if they are the halves of the same parent, and a block inside another adds nothing. Draw `10.254.1.0/24` and `10.254.2.0/24` to show that adjacency is not enough; that single example shows the interviewer you understand alignment. Mention the fixpoint loop and why it is quadratic, then say "prefixes either nest or are disjoint, so after sorting by address a stack sweep handles both covering and sibling merges, with a while loop because merges cascade." After coding, trace an input where one merge enables the next. If time allows, give the minimality argument in two sentences: the output is the set of maximal aligned blocks, and any valid answer needs one prefix per maximal block.

### Networking follow-ups

A network-org interviewer will move from the address arithmetic to what summarisation does to forwarding.

- **"Is a covered more-specific really redundant?"** Only when it forwards the same way. In a real table a `/25` inside a `/24` with a *different* next hop is an exception that longest-prefix match is designed to honour ([the routing table lesson](/learn/fabric-networking/from-zero/the-routing-table), and [BGP traffic engineering](/learn/fabric-networking/bgp-in-the-real-world/traffic-engineering-with-bgp) uses deliberate more-specifics to steer inbound traffic). The next-hop-aware version of this problem, the follow-up above, has a known optimal algorithm (ORTC, the Optimal Routing Table Constructor): build a trie, push next hops down to the leaves, compute the sets of possible next hops bottom-up, then choose top-down. The common wrong answer is to run this problem's algorithm on a forwarding table and silently change where traffic goes.
- **"What does BGP do with a summary?"** A router configured to originate an aggregate announces it once at least one more-specific inside it exists, and can suppress the more-specifics or send them alongside. The aggregate starts a new AS path at the aggregating router (optionally with an AS_SET listing the ASes it hides), ATOMIC_AGGREGATE flags that path detail was lost (it is set when no AS_SET is included), and AGGREGATOR records the AS and router ID that built the aggregate. The originator also installs a **discard route** for the summary (to a null interface): a packet for an unused part of the block is dropped there, instead of following the default route back out and looping until its TTL runs out.
- **"Where would you summarise at Meridian?"** The obvious place is the site boundary: if the underlay were split per site (today it is one IS-IS level-2 domain, which floods every loopback everywhere), Amsterdam's spines could advertise `10.255.1.0/24` to Singapore instead of every loopback. The catch is that the loopbacks are VTEP addresses and BGP next hops for the EVPN overlay ([the EVPN control plane](/learn/fabric-networking/overlays-vxlan-evpn/evpn-the-control-plane)). When `leaf3.ams` dies, its `/32` disappears, and every remote leaf invalidates the overlay routes using it within the IGP's convergence time. With only the `/24` visible, the next hop still looks reachable, and remote leaves keep encapsulating traffic toward a dead VTEP until the route reflectors' BGP sessions to `leaf3.ams` hit their hold timer (typically 90 or 180 seconds depending on the vendor, unless BFD protects them) and the reflectors withdraw its EVPN routes. Fabrics usually keep loopback `/32`s unsummarised for that reason and summarise link and tenant space instead. The signal that shows the problem is traffic black-holed for tens of seconds after a single leaf failure, while the underlay looks healthy.
- **"Why does the internet table keep growing if summarisation works?"** Because operators de-aggregate on purpose (more-specifics for traffic engineering and to defend against hijacks of their space), and because address space fragments as it is traded and sub-allocated. A `/24` is, by widespread filtering convention, the longest IPv4 prefix most networks accept from the internet, so anything longer than that must be summarised before it leaves your network.
- **"Routes change all the time. Recompute from scratch?"** No. Keep the binary trie with a count or flag per node. Adding or withdrawing one prefix can only change the summary along the path from that prefix's node to the root, so updating the trie costs `O(W)`: recompute each node's "fully covered" flag from its children walking up, which re-merges siblings or splits a parent back into the surviving half. (Emitting the changes can cost more: withdrawing a `/8` that hid many more-specifics exposes all of them again.) Then send only the summary lines that changed, because each change is a BGP update every peer has to process.
- **"Over-cover allowed?"** Sometimes an operator accepts a summary that includes a few unused addresses (with the discard route above) in exchange for a much shorter list, for example a single `10.254.0.0/21` for Amsterdam's link blocks. That turns the problem into an optimisation with a waste budget; a trie with per-node "addresses covered" counts lets you evaluate each candidate parent in `O(1)`.
- **"IPv6?"** The same algorithm on 128-bit integers. Python handles them natively; JavaScript needs `BigInt`. Real IPv6 plans are designed for clean aggregation (a site per `/48`), so the alignment trap is mostly a planning failure rather than an algorithmic one.

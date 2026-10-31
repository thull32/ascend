---
slug: longest-prefix-match
title: Longest Prefix Match
difficulty: medium
patterns: [trie]
lists: [network-practice, ascend-150]
companies: [cisco, juniper, arista, cloudflare]
order: 1
lesson: fabric-networking/from-zero/the-routing-table
hints:
  - "Turn every address into a 32-bit integer first. A prefix of length L is then a statement about the top L bits only, and everything after bit L is irrelevant."
  - "Comparing a destination against every route costs O(routes) per lookup. Store the prefixes in a binary trie: one level per bit, a left child for 0 and a right child for 1, and the next hop on the node where a prefix ends."
  - "Walk the destination's bits from the most significant down and remember the last next hop you passed. When the path runs out, that remembered value is the longest match. Check the root before the first bit, so a /0 default route counts."
signatures:
  python:
    name: longest_prefix_match
    starter: |
      def longest_prefix_match(routes: list[list[str]], destinations: list[str]) -> list[str | None]:
          pass
  javascript:
    name: longest_prefix_match
    starter: |
      function longest_prefix_match(routes, destinations) {
      }
tests:
  - args: [[["0.0.0.0/0", "gw1.ams"], ["10.1.1.0/24", "vlan100"], ["198.51.100.0/24", "gw1.ams"], ["198.51.100.128/25", "gw2.ams"], ["198.51.100.0/27", "gw2.ams"], ["10.255.1.201/32", "spine1.ams"], ["10.254.1.0/31", "spine1.ams"], ["10.254.2.0/31", "spine2.ams"]], ["198.51.100.25", "198.51.100.200", "198.51.100.40", "192.0.2.7", "10.1.1.10", "10.254.2.1"]]
    expected: ["gw2.ams", "gw2.ams", "gw1.ams", "gw1.ams", "vlan100", "spine2.ams"]
    label: "leaf1.ams table: /27, /25, /24, default, connected, /31"
  - args: [[["10.1.1.0/24", "vlan100"], ["10.1.2.0/24", "vlan200"], ["10.255.1.0/24", "spine1.ams"]], ["10.1.2.20", "10.1.3.1", "172.16.1.11"]]
    expected: ["vlan200", null, null]
    label: "no default route: a miss is null"
  - args: [[["0.0.0.0/0", "gw2.ams"]], ["203.0.113.9", "0.0.0.0", "255.255.255.255"]]
    expected: ["gw2.ams", "gw2.ams", "gw2.ams"]
    label: "only a default route"
  - args: [[["10.255.1.11/32", "leaf1.ams"], ["10.255.1.0/24", "spine2.ams"], ["10.254.1.0/31", "spine1.ams"]], ["10.255.1.11", "10.255.1.12", "10.254.1.1", "10.254.1.2"]]
    expected: ["leaf1.ams", "spine2.ams", "spine1.ams", null]
    label: "host /32 and point-to-point /31"
  - args: [[], ["10.1.1.10", "192.0.2.1"]]
    expected: [null, null]
    label: "empty table"
  - args: [[["10.1.1.0/24", "vlan100"]], []]
    expected: []
    label: "no destinations"
  - args: [[["10.1.1.10/24", "vlan100"], ["198.51.100.77/26", "gw1.sin"]], ["10.1.1.200", "198.51.100.5", "198.51.100.64"]]
    expected: ["vlan100", null, "gw1.sin"]
    hidden: true
    label: "host bits set in a prefix are ignored"
  - args: [[["10.1.1.0/24", "vlan100"], ["10.0.0.0/8", "spine1.ams"], ["10.1.1.99/24", "vlan101"], ["10.0.0.0/8", "spine2.ams"]], ["10.1.1.5", "10.9.9.9"]]
    expected: ["vlan101", "spine2.ams"]
    hidden: true
    label: "a repeated prefix: the later entry replaces the earlier"
  - args: [[["0.0.0.0/1", "gw1.ams"], ["128.0.0.0/1", "gw2.ams"], ["255.255.255.255/32", "null0"], ["0.0.0.0/32", "null0"]], ["127.255.255.255", "128.0.0.0", "255.255.255.255", "0.0.0.0", "0.0.0.1"]]
    expected: ["gw1.ams", "gw2.ams", "null0", "null0", "gw1.ams"]
    hidden: true
    label: "bit-boundary addresses and /1 halves"
  - args: [[["10.1.2.20/32", "acme-db1"], ["10.1.2.0/24", "vlan200"], ["10.1.0.0/16", "leaf3.ams"], ["10.0.0.0/8", "spine1.ams"], ["0.0.0.0/0", "gw1.ams"]], ["10.1.2.20", "10.1.2.21", "10.1.9.1", "10.200.0.1", "172.16.1.11"]]
    expected: ["acme-db1", "vlan200", "leaf3.ams", "spine1.ams", "gw1.ams"]
    hidden: true
    label: "nested chain inserted longest first"
  - args: [[["10.20.30.40/0", "gw1.ams"], ["10.1.1.10/32", "acme-web1"], ["0.0.0.0/0", "gw2.ams"], ["10.1.1.11/31", "leaf1.ams"]], ["10.1.1.10", "10.1.1.11", "10.1.1.12", "192.0.2.1"]]
    expected: ["acme-web1", "leaf1.ams", "gw2.ams", "gw2.ams"]
    hidden: true
    label: "a /0 with host bits is the default, a later default replaces it, a /32 beside its /31"
  - args: [[["10.240.253.80/12", "nh0.sjc"], ["203.0.113.10/30", "nh1.sin"], ["198.51.100.87/32", "nh2.sin"], ["10.45.62.177/16", "nh3.sjc"], ["10.86.27.111/24", "nh4.ams"], ["203.0.113.101/20", "nh5.ams"], ["203.0.113.98/32", "nh6.sjc"], ["10.172.143.183/24", "nh0.ams"], ["10.144.214.184/32", "nh1.ams"], ["10.54.238.114/31", "nh2.sin"], ["198.51.100.56/30", "nh3.ams"], ["198.51.100.209/12", "nh4.sin"], ["203.0.113.147/26", "nh5.sjc"], ["203.0.113.64/22", "nh6.ams"], ["10.127.187.16/16", "nh0.ams"], ["192.0.2.172/16", "nh1.sjc"], ["192.0.2.13/26", "nh2.sjc"], ["10.247.253.29/24", "nh3.sin"], ["192.0.2.224/30", "nh4.ams"], ["198.51.100.218/22", "nh5.sjc"], ["192.0.2.166/24", "nh6.sjc"], ["203.0.113.79/32", "nh0.sjc"], ["198.51.100.195/16", "nh1.ams"], ["203.0.113.225/24", "nh2.sjc"], ["192.0.2.145/8", "nh3.sjc"], ["198.51.100.166/12", "nh4.ams"], ["192.0.2.117/12", "nh5.sin"], ["203.0.113.17/30", "nh6.ams"], ["198.51.100.211/24", "nh0.ams"], ["10.147.173.89/22", "nh1.sin"], ["198.51.100.106/12", "nh2.ams"], ["203.0.113.100/24", "nh3.sin"], ["10.94.151.4/24", "nh4.sjc"], ["10.89.107.164/24", "nh5.sin"], ["198.51.100.203/30", "nh6.sin"], ["10.67.134.205/24", "nh0.sjc"], ["203.0.113.47/24", "nh1.sin"], ["192.0.2.57/24", "nh2.sin"], ["198.51.100.99/12", "nh3.sjc"], ["192.0.2.143/22", "nh4.sin"], ["198.51.100.113/32", "nh5.ams"], ["203.0.113.149/31", "nh6.sin"], ["192.0.2.36/32", "nh0.sin"], ["192.0.2.45/32", "nh1.sin"], ["192.0.2.170/16", "nh2.ams"], ["198.51.100.49/20", "nh3.sjc"], ["198.51.100.247/26", "nh4.ams"], ["198.51.100.226/8", "nh5.sjc"], ["192.0.2.189/24", "nh6.sjc"], ["203.0.113.175/28", "nh0.sjc"], ["10.34.90.157/30", "nh1.sin"], ["10.20.58.4/26", "nh2.sin"], ["10.213.255.56/24", "nh3.sin"], ["203.0.113.185/31", "nh4.sjc"], ["198.51.100.229/32", "nh5.ams"], ["198.51.100.213/16", "nh6.ams"], ["198.51.100.218/31", "nh0.sin"], ["198.51.100.53/31", "nh1.sjc"], ["192.0.2.27/24", "nh2.ams"], ["203.0.113.13/22", "nh3.ams"]], ["203.0.113.161", "198.51.100.135", "8.8.8.8", "192.0.2.235", "203.0.113.247", "203.0.113.247", "8.8.8.8", "192.0.2.3", "198.51.100.73", "192.0.2.139", "10.50.255.4", "192.0.2.54", "192.0.2.145", "8.8.8.8", "10.29.207.63", "198.51.100.52", "8.8.8.8", "10.228.184.2", "198.51.100.83", "198.51.100.240", "8.8.8.8", "192.0.2.52", "10.6.251.248", "8.8.8.8", "198.51.100.13", "198.51.100.17", "10.118.238.174", "198.51.100.127", "198.51.100.243", "192.0.2.94", "203.0.113.146", "203.0.113.43", "198.51.100.34", "10.87.47.82", "203.0.113.74", "8.8.8.8", "198.51.100.254", "203.0.113.251", "198.51.100.247", "203.0.113.81", "10.5.123.135", "203.0.113.33", "10.105.46.172", "203.0.113.253", "198.51.100.65", "198.51.100.207", "198.51.100.187", "203.0.113.16", "8.8.8.8", "192.0.2.174", "203.0.113.68", "192.0.2.140", "192.0.2.201", "8.8.8.8", "10.170.232.112", "203.0.113.44", "192.0.2.87", "8.8.8.8", "203.0.113.196", "203.0.113.110"]]
    expected: ["nh0.sjc", "nh0.ams", null, "nh2.ams", "nh1.sin", "nh1.sin", null, "nh2.sjc", "nh0.ams", "nh2.ams", null, "nh2.sjc", "nh2.ams", null, null, "nh1.sjc", null, null, "nh0.ams", "nh4.ams", null, "nh2.sjc", null, null, "nh0.ams", "nh0.ams", null, "nh0.ams", "nh4.ams", "nh2.ams", "nh5.sjc", "nh1.sin", "nh0.ams", null, "nh1.sin", null, "nh4.ams", "nh1.sin", "nh4.ams", "nh1.sin", null, "nh1.sin", null, "nh1.sin", "nh0.ams", "nh4.ams", "nh0.ams", "nh6.ams", null, "nh2.ams", "nh1.sin", "nh2.ams", "nh2.ams", null, null, "nh1.sin", "nh2.ams", null, "nh1.sin", "nh1.sin"]
    hidden: true
    label: "60 routes, 60 destinations"
time_limit_ms: 4000
---
A router forwards a packet by looking only at its **destination address** and asking its routing table one question: which entry is the most specific one that covers this address? This problem asks you to build that lookup.

### The networking idea in one minute

An IPv4 address is a 32-bit number, written as four bytes in decimal: `10.1.1.10`. A **prefix** such as `10.1.0.0/16` names a block of addresses: every address whose first 16 bits equal the first 16 bits of `10.1.0.0`. The number after the slash is the **prefix length**; the bits after it (the host bits) do not matter. A `/24` covers 256 addresses, a `/32` covers exactly one, and `0.0.0.0/0` covers all of them. That last one is the **default route**: the entry of last resort, used when nothing more specific matches.

A routing table maps prefixes to a **next hop**, the neighbour (or local interface) the packet is handed to. Prefixes overlap on purpose. A leaf switch may know `198.51.100.0/24` via one gateway and `198.51.100.0/27` via another; an address in the `/27` is covered by both. The rule every IP router follows is **longest-prefix match**: of all the prefixes that contain the destination, use the one with the longest length, because it describes the destination most precisely. Where an entry sits in the table plays no part.

The examples use Meridian's Amsterdam leaf `leaf1.ams` and the documentation address ranges reserved for examples (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, RFC 5737), plus Meridian's private `10.0.0.0/8` space.

### The task

Write `longest_prefix_match(routes, destinations)`.

- `routes` is a list of `[prefix, next_hop]` pairs. `prefix` is a string `"a.b.c.d/L"` with `0 ≤ L ≤ 32`; `next_hop` is a non-empty string.
- Only the first `L` bits of a prefix count. If the address part has host bits set (`"10.1.1.10/24"`), treat it as the network it names: `"10.1.1.10/24"` means `10.1.1.0/24`.
- If the same prefix appears more than once (after ignoring host bits), the later entry replaces the earlier one, as a newer route update would.
- `destinations` is a list of IPv4 addresses `"a.b.c.d"`.

Return a list with one entry per destination, in order: the next hop of the longest prefix that contains it, or `None` (`null` in JavaScript) if no prefix does. A default route `0.0.0.0/0`, when present, matches every address.

Build a binary trie over the prefix bits so that each lookup costs time proportional to the address width, not the size of the table.

### Examples

The first two examples use this slice of `leaf1.ams`'s table:

| Prefix | Next hop | What it is |
|---|---|---|
| `0.0.0.0/0` | `gw1.ams` | default route to the internet edge |
| `10.1.1.0/24` | `vlan100` | Acme's subnet, directly connected |
| `198.51.100.0/24` | `gw1.ams` | an external network |
| `198.51.100.128/25` | `gw2.ams` | its upper half, preferred via the other gateway |
| `198.51.100.0/27` | `gw2.ams` | a small block inside the lower half |
| `10.254.2.0/31` | `spine2.ams` | the point-to-point link to `spine2.ams` |

| Destinations | Output | Why |
|---|---|---|
| `["198.51.100.25", "198.51.100.200", "198.51.100.40"]` | `["gw2.ams", "gw2.ams", "gw1.ams"]` | `.25` sits in the `/27` (0–31), which beats the `/24` and the default. `.200` is in the `/25` (128–255). `.40` is outside both, so the `/24` is the longest match. |
| `["192.0.2.7", "10.1.1.10", "10.254.2.1"]` | `["gw1.ams", "vlan100", "spine2.ams"]` | Nothing specific covers `192.0.2.7`, so the default route wins with length 0. `10.254.2.1` is the far end of the `/31`. |

A table without a default route can miss:

| `routes` | `destinations` | Output |
|---|---|---|
| `[["10.1.1.0/24", "vlan100"], ["10.1.2.0/24", "vlan200"], ["10.255.1.0/24", "spine1.ams"]]` | `["10.1.2.20", "10.1.3.1", "172.16.1.11"]` | `["vlan200", None, None]` |

`10.1.3.1` shares its first 23 bits with `10.1.2.0/24`, but a prefix matches only if *all* of its bits match. A partial match is no match.

### Constraints

- `0 ≤ len(routes) ≤ 10⁵`, `0 ≤ len(destinations) ≤ 10⁵`
- Every prefix and address is a valid dotted-quad IPv4 string; `0 ≤ L ≤ 32`.
- Next hops are non-empty strings.

### Follow-up

"A full internet routing table has roughly a million IPv4 prefixes, and a router must answer a lookup for every packet, hundreds of millions of times a second. Your trie walks up to 32 nodes, one memory access each. How would you cut that to two or three accesses, what does it cost in memory, and how do you apply a burst of route updates without forwarding a single packet against a half-updated table?"

## Solution

### The naive approach

For each destination, scan every route: mask the destination with the route's prefix length, compare with the route's network, and keep the match with the greatest length. That is `O(R)` per lookup and `O(R · Q)` for `Q` destinations, 10¹⁰ comparisons at the limits. It is also what a **TCAM** (ternary content-addressable memory, the special memory in switch chips) does, except that the hardware compares every row in parallel in one clock cycle and returns the first row that matches, so the rows are kept sorted longest prefix first. Software has no such luxury, so you need a structure that avoids looking at irrelevant routes.

A second naive idea is a hash map per prefix length: 33 maps, and for each destination probe lengths 32, 31, ..., 0 and stop at the first hit. That is `O(33)` hash lookups per destination, which is correct and not bad, and worth naming. The trie does the same job with one walk and no hashing.

### The insight

A prefix is a string of `L` bits, and longest-prefix match is a "longest stored prefix of this string" question. That is exactly the question a trie answers. Use a **binary trie**: each node has a child for bit 0 and a child for bit 1, and a node stores a next hop if some prefix ends there. A `/L` prefix lives at depth `L`; the default route `/0` lives at the root.

To look up a destination, walk its 32 bits from the most significant. Every node on that path with a next hop is a prefix that contains the destination, and the deeper the node, the longer the prefix. So keep the last next hop you passed and stop when the path ends: what you hold is the longest match.

### The optimal approach

1. Convert each dotted quad to a 32-bit integer: `(a << 24) | (b << 16) | (c << 8) | d`. Bit `i` from the top is `(value >> (31 - i)) & 1`.
2. Insert each route by walking its first `L` bits, creating nodes as needed, then set the next hop on the final node. Walking only `L` bits is what makes host bits irrelevant, and overwriting the next hop is what makes the later duplicate win.
3. For each destination, start with `best = root.next_hop` (the default route or `None`), then follow its bits; after each step, if the node has a next hop, update `best`. Stop when a child is missing or after 32 bits.

```python
class _Node:
    __slots__ = ("child", "next_hop")

    def __init__(self):
        self.child = [None, None]
        self.next_hop = None


def _to_int(addr: str) -> int:
    a, b, c, d = (int(part) for part in addr.split("."))
    return (a << 24) | (b << 16) | (c << 8) | d


def longest_prefix_match(routes: list[list[str]], destinations: list[str]) -> list[str | None]:
    root = _Node()
    for prefix, next_hop in routes:
        addr, length = prefix.split("/")
        value, length = _to_int(addr), int(length)
        node = root
        for i in range(length):                      # only the first L bits matter
            bit = (value >> (31 - i)) & 1
            if node.child[bit] is None:
                node.child[bit] = _Node()
            node = node.child[bit]
        node.next_hop = next_hop                     # a repeated prefix overwrites

    answers = []
    for dst in destinations:
        value, node = _to_int(dst), root
        best = root.next_hop                         # the /0 default route, if any
        for i in range(32):
            node = node.child[(value >> (31 - i)) & 1]
            if node is None:
                break                                # fell off the trie
            if node.next_hop is not None:
                best = node.next_hop                 # a longer match than any before
        answers.append(best)
    return answers
```

Trace `198.51.100.25` against the example table. Its top 24 bits match `198.51.100.0`, so the walk passes the root (`gw1.ams`, the default), then the `/24` node at depth 24 (`gw1.ams`). The last byte, 25, is `00011001` in binary. Its top bit, the 25th bit of the address, is 0, so the walk goes left, away from the `/25`. The 26th and 27th bits are also 0, and the node at depth 27 holds `gw2.ams`. The 28th bit is 1 and no child exists there, so the walk stops with `gw2.ams`.

**Complexity.** With `W = 32` bits, building costs `O(R · W)` time and creates at most `R · W` nodes, so `O(R · W)` space. Each lookup is `O(W)`, for `O((R + Q) · W)` overall. `W` is a constant for IPv4, so this is linear in the input, and the lookup cost does not grow with the table at all, which is the property a router needs.

### Common mistakes

- **Stopping at the first match.** Walking down and returning at the first node with a next hop gives the *shortest* match, usually the default route. You must keep walking.
- **Returning `None` when the walk falls off the trie.** Falling off is normal; it ends the walk and the remembered `best` is the answer. Only a walk that never passed a next hop returns `None`.
- **Forgetting the root.** If you update `best` only after moving to a child, a `/0` route stored at the root is never seen.
- **Inserting all 32 bits of the prefix's address.** That makes `"10.1.1.10/24"` a `/32` for `10.1.1.10`. Insert exactly `L` bits.
- **Signed shifts in JavaScript.** `a << 24` is negative when `a ≥ 128`. Build the integer with `>>> 0` or with multiplication, and read bits with `>>>`.
- **Comparing strings.** `"10.1.1.0/24"` and `"10.1.1.0/25"` share a long textual prefix, and so do `10.1.1.0` and `10.1.10.0`; string prefixes of dotted quads are not bit prefixes.

### How to discuss it

Open with the networking rule: of the matching prefixes, the longest wins, and order is irrelevant. Give the `O(R)` scan, then say "a prefix is a bit string and I want the longest stored prefix of the destination's bit string, so a binary trie keyed on bits, with the next hop stored where a prefix ends." Mention the per-length hash maps as the alternative. While coding, point out the two details that carry correctness: walking only `L` bits on insert, and checking the root before the loop. Trace one address that hits a mid-depth prefix and then falls off, because that path exercises both the "keep walking" and "fall off" cases.

### Networking follow-ups

A network-org interviewer usually pushes from the algorithm into how routers actually do this.

- **"Why not just use a TCAM everywhere?"** A TCAM stores value-and-mask rows, compares all rows at once and returns the first hit, so routes are sorted longest-first. It is the fastest option and the most expensive one: it is power-hungry, takes die area, and holds far fewer entries than ordinary memory. Switch chips use it for ACLs and for part of the FIB (the forwarding table in hardware), usually alongside algorithmic LPM tables in on-chip SRAM that hold most of the routes; large-table routers and software routers use algorithmic lookups in SRAM or DRAM. The common wrong answer is that TCAMs are "just faster"; the honest answer is about capacity, power and cost.
- **"Make the lookup take fewer memory accesses."** Use a **multibit trie**: consume `k` bits per level (a stride), so each node has `2^k` children and IPv4 needs `32 / k` levels. Prefixes whose length is not a multiple of the stride are expanded into several entries (controlled prefix expansion), which costs memory. The extreme is DIR-24-8: a table indexed by the top 24 bits (16M entries) plus small second-level tables for longer prefixes, so most lookups take one memory access and none take more than two. DPDK's LPM library is built this way. Linux's kernel FIB uses a level-compressed trie instead.
- **"Path compression?"** Long chains of single-child nodes waste memory and accesses. A Patricia (radix) trie stores a skip count or the bits on the edge and jumps over them. With path compression the node count is `O(R)` instead of `O(R · W)`.
- **"IPv6?"** Addresses are 128 bits, so a binary trie can be 128 deep. Real tables are dominated by `/48` and shorter, and production designs use strides or hash tables per common length rather than one node per bit. Mention that the per-length hash approach with binary search over lengths (Waldvogel's scheme) needs `O(log W)` probes.
- **"Route updates while forwarding."** BGP can deliver thousands of updates a second. Readers must never see a half-built path. Software answers: build new nodes off to the side and publish them with one atomic pointer swap (read-copy-update in Linux), or keep two copies and flip. Hardware answers: the TCAM must be reordered so a longer prefix stays above a shorter one, which is why insert order in TCAM management matters and why large updates can be slow. A related production signal is the gap between RIB (what the routing protocols chose) and FIB (what is programmed): when the FIB lags or is full, `show ip route` says one thing and the hardware does another.
- **"What is the next hop, really?"** Here it is a label, but in a real table a BGP next hop is an address that must itself be looked up (recursive resolution), and an entry can hold several next hops for ECMP. The [routing table lesson](/learn/fabric-networking/from-zero/the-routing-table) covers both.
- **"Two tenants use 10.1.1.0/24."** Meridian's Acme and Globex both do. Each VRF (virtual routing and forwarding instance) gets its own table, so the lookup key is really `(vrf, destination)`: one trie per VRF, chosen by the interface or VNI (VXLAN network identifier, the overlay segment ID) the packet arrived on.
- **"Delete a route."** Clear the next hop on its node, then prune nodes that have no next hop and no children on the way back up, otherwise the trie only grows under churn.

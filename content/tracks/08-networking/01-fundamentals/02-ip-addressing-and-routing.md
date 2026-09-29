---
slug: ip-addressing-and-routing
title: "IP addressing and routing: from CIDR math to BGP"
description: Subnet and VLSM arithmetic worked by hand, longest-prefix match traced on a real routing table and inside the kernel's trie, a measured traceroute through three NATs, BGP's decision process traced route by route, hijacks and withdrawals that took down YouTube and Facebook, and how anycast sends one address to many places.
minutes: 45
difficulty: easy
tags: [networking, ip, ipv6, cidr, subnets, routing, longest-prefix-match, bgp, anycast, ecmp]
problems: []
---
A packet addressed to 104.20.23.154 leaves a laptop. Nothing on the laptop, or on any of the routers in between, has a route to that specific address. Each device knows only "addresses that look like this go that way", and the packet arrives because every one of those coarse decisions is consistent with the others. When they stop being consistent, the failures are spectacular: in February 2008 a Pakistani ISP announced a more specific route for part of YouTube's address space and, for about two hours, much of the internet's YouTube traffic followed it into a black hole. In October 2021 a maintenance command cut Facebook's backbone, Facebook's DNS servers withdrew their own routes as they were designed to, and Facebook disappeared from the internet for about six hours.

Both incidents are the same three mechanisms working as designed: prefixes, longest-prefix match, and a global protocol (BGP) in which networks tell each other which prefixes they can reach. This lesson works the address arithmetic by hand, traces a forwarding decision through a routing table and the kernel's data structure, traces BGP's route selection, and shows how anycast puts one address in many places. Those are the tools for reading a VPC route table, explaining why a service in one subnet cannot reach another, and answering "how does anycast work?" in an interview.

## IPv4 addresses are 32-bit integers with a prefix

An IPv4 address is a 32-bit number written as four decimal bytes. Paired with a **prefix length** it also names a network: `10.42.7.19/22` says the first 22 bits are the network part and the remaining 10 bits identify a host. This is CIDR (classless inter-domain routing) notation.

### Worked example: 10.42.7.19/22

The first two bytes are fully network bits; the third byte contributes 6 more; its last 2 bits and all of the fourth byte are host bits.

```text
10.42.7.19   = 00001010.00101010.000001|11.00010011
/22 mask     = 11111111.11111111.111111|00.00000000 = 255.255.252.0
network      = 00001010.00101010.000001|00.00000000 = 10.42.4.0
broadcast    = 00001010.00101010.000001|11.11111111 = 10.42.7.255
```

- **Netmask** 255.255.252.0 (third byte `11111100` = 252).
- **Network** 10.42.4.0, **broadcast** 10.42.7.255.
- **Usable hosts** 2¹⁰ − 2 = 1,022 on a plain LAN; a cloud VPC reserves more (AWS takes five per subnet, so 1,019).
- The shortcut: a /22 spans 2^(24−22) = 4 values of the third byte, aligned to a multiple of 4. 7 rounds down to 4, so the block is 10.42.4.x to 10.42.7.x.

```python
def subnet(addr: str, prefix: int) -> tuple[str, str, int]:
    n = int.from_bytes(bytes(int(b) for b in addr.split(".")), "big")
    mask = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF      # prefix ones, then zeros
    net, bcast = n & mask, n | (~mask & 0xFFFFFFFF)         # clear / set the host bits
    fmt = lambda x: ".".join(str((x >> s) & 255) for s in (24, 16, 8, 0))
    return fmt(net), fmt(bcast), max(0, 2 ** (32 - prefix) - 2)

print(subnet("10.42.7.19", 22))    # ('10.42.4.0', '10.42.7.255', 1022)
print(subnet("192.168.37.200", 26))  # ('192.168.37.192', '192.168.37.255', 62)
```

### Carving a block by need (VLSM), traced

You have 192.168.10.0/24 and need subnets for 100 hosts, 50 hosts and 20 hosts, plus two point-to-point links. Allocate largest first so every block stays aligned:

| Need | Smallest block that fits | Allocated | Range | Usable |
|---|---|---|---|---|
| 100 hosts | 2⁷ = 128 → /25 | 192.168.10.0/25 | .0 – .127 | 126 |
| 50 hosts | 2⁶ = 64 → /26 | 192.168.10.128/26 | .128 – .191 | 62 |
| 20 hosts | 2⁵ = 32 → /27 | 192.168.10.192/27 | .192 – .223 | 30 |
| Link 1 | 2 hosts → /30 (or /31, RFC 3021) | 192.168.10.224/30 | .224 – .227 | 2 |
| Link 2 | /30 | 192.168.10.228/30 | .228 – .231 | 2 |
| Spare | | 192.168.10.232/29 and .240/28 | .232 – .255 | |

Allocating the /27 first and the /25 second would have left the /25 nowhere to start on a multiple of 128 without a gap. The reverse operation is **summarisation**: 10.20.4.0/24 through 10.20.7.0/24 share their first 22 bits, so a router can advertise the single route 10.20.4.0/22 instead of four, which is how the global table stays at about 1.1 million IPv4 prefixes (the [CIDR Report](https://www.cidr-report.org/as2.0/)'s count in September 2026) rather than billions of addresses.

### Reserved and private ranges

| Range | Purpose |
|---|---|
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | Private (RFC 1918): never routed on the internet; every VPC and home network |
| `100.64.0.0/10` | Carrier-grade NAT shared space (RFC 6598); the traceroute below crosses it |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local; cloud metadata services live at 169.254.169.254 |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | Documentation; used in this track so nothing here is a real host |
| `224.0.0.0/4` | Multicast |

Private space is why two companies can both use 10.0.0.0/8, and why connecting them later is painful: there is no route to "the other 10.0.1.5". [NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking) traces how private hosts share a public address and how VPC ranges are planned.

## IPv6 in brief

IPv6 addresses are 128 bits written as eight groups of four hex digits, with one run of zero groups collapsible to `::`: `2001:db8:85a3::8a2e:370:7334`. Networks are almost always /64, with the host half generated by the host itself (SLAAC, often randomised for privacy); a site typically receives a /48 or /56, which is 65,536 or 256 /64 subnets. The header is a fixed 40 bytes with no checksum and no router fragmentation, which makes forwarding cheaper.

The practical differences: there is enough space that every host can have a global address and NAT becomes optional, so firewalls do the isolation that NAT used to do by accident; link-local `fe80::/10` addresses are mandatory and Neighbour Discovery over ICMPv6 replaces ARP; and dual-stack clients race both families (**Happy Eyeballs**, RFC 8305), starting IPv6 first and IPv4 after a 250 ms head start, so a broken IPv6 path costs a quarter of a second instead of a multi-second timeout. example.com publishes both, `A 104.20.23.154` and `AAAA 2606:4700:10::6814:179a`: the low 32 bits of the IPv6 address, `6814:179a`, are the same four bytes as the IPv4 one (0x68 = 104, 0x14 = 20, 0x17 = 23, 0x9a = 154), a numbering convenience of the operator, not a protocol rule.

## Getting to the next hop: ARP

IP addresses are logical; to put a frame on an Ethernet link you need the next device's MAC address. ARP asks: the host broadcasts "who has 192.168.34.1?" and the owner replies with its MAC. The answer is cached (Linux keeps an entry reachable for tens of seconds and revalidates it), so only the first packet to a neighbour waits, typically well under a millisecond on a LAN. ARP has no authentication, which is why ARP spoofing is a textbook LAN attack and why cloud networks answer ARP from a controller-managed table instead of trusting broadcasts.

```viz
{"type": "network", "scenario": "arp", "title": "ARP resolves the next hop's MAC before the first IP packet can leave"}
```

## The routing table and longest-prefix match

Every host and router holds rows of `(prefix, next hop, interface)`. To forward a packet it finds every row whose prefix contains the destination and uses the **longest** one, the most specific. This machine's table, measured with `ip route` (the Docker bridge adds a row):

```bash
$ ip route
default via 192.168.34.1 dev eth1 proto kernel metric 20
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1
192.168.34.0/24 dev eth1 proto kernel scope link metric 276
$ ip route get 104.20.23.154
104.20.23.154 via 192.168.34.1 dev eth1 src 192.168.34.197 uid 1000
$ ip route get 172.17.0.5
172.17.0.5 dev docker0 src 172.17.0.1 uid 1000
```

`scope link` means "on this link: ARP for the destination itself"; `via` means "send the frame to this router's MAC". `ip route get` shows the decision without sending anything.

A router in a data centre has more rows. Trace four destinations through this table:

| Prefix | Next hop |
|---|---|
| 0.0.0.0/0 | 192.168.34.1 (default) |
| 10.0.0.0/8 | R1 |
| 10.20.0.0/16 | R2 |
| 10.20.4.0/22 | R3 |
| 10.20.5.0/25 | R4 |
| 10.20.5.200/32 | R5 |

| Destination | Rows that contain it | Longest | Next hop |
|---|---|---|---|
| 10.20.5.5 | /0, /8, /16, /22, /25 (.0–.127) | /25 | R4 |
| 10.20.5.130 | /0, /8, /16, /22 (the /25 stops at .127) | /22 | R3 |
| 10.20.5.200 | /0, /8, /16, /22, /32 | /32 | R5 |
| 10.99.1.1 | /0, /8 | /8 | R1 |

The /32 row is the classic misconfiguration: someone adds a host route for one server through a VPN interface; it beats every other row for that address, and when the VPN is down exactly one host becomes unreachable while its neighbours work. The same rule is what made the 2008 YouTube incident possible: YouTube announced 208.65.152.0/22, the rogue announcement was 208.65.153.0/24, and every router on the internet that heard both preferred the /24 because it is longer.

### Under the hood: how the kernel finds the longest match

A linear scan is fine for six rows and hopeless for a million at hundreds of millions of lookups per second. The classic structure is a binary trie on the address bits: walk from the root following the destination's bits and remember the last node that carried a prefix; when the walk falls off the trie, that remembered prefix is the answer. For 10.20.5.130 in the table above, the walk passes the /8 node after 8 bits, the /16 after 16 and the /22 after 22, then follows bit 25 (the top bit of 130 is 1) away from the /25 node's branch and stops: the last prefix seen is the /22.

Linux uses a level-compressed version of this, the LC-trie (`fib_trie`, the only IPv4 implementation since 2.6.39), whose nodes consume several bits at once so a lookup touches a handful of cache lines. You can read it directly; on this machine `/proc/net/fib_trie` shows the main table's root node `+-- 0.0.0.0/0 3 0 5`, a node indexing 3 bits at a time, and `/proc/net/fib_triestat` reports leaves of 48 bytes and internal nodes of 40. Before the main table, Linux consults the `local` table, which holds the host's own addresses and broadcast addresses, so traffic to yourself never leaves the machine. Hardware routers do the same lookup in TCAM (ternary memory that compares every row in parallel and returns the longest match in one cycle) or in DRAM-based tries such as DPDK's DIR-24-8, which answers most lookups with one memory read indexed by the top 24 bits.

When several rows tie at the same length with the same cost, routers use **ECMP** (equal-cost multipath): they hash the 5-tuple and pick one next hop per flow, so one TCP connection always takes the same path (no reordering) while many connections spread across paths. That hash is also why one elephant flow cannot use more than one link's bandwidth.

```viz
{"type": "network", "scenario": "packet-routing", "title": "Each router makes an independent longest-prefix-match decision and decrements TTL", "caption": "No router knows the whole path. Each asks only which of its rows best matches the destination, forwards, and forgets. TTL bounds the damage of a routing loop."}
```

## A measured traceroute

`traceroute` and `tracepath` send probes with TTL 1, 2, 3, … and list the router that returned ICMP "time exceeded" at each step. From the machine this lesson was written on to example.com (`tracepath -4 -n example.com`, 2026-09-28; the ISP's public router addresses are replaced with descriptions):

```text
 1?: [LOCALHOST]                      pmtu 1500
 1:  192.168.34.1          0.468ms    first router (the host's virtual switch)
 2:  192.168.1.1           1.267ms    home router
 3:  100.64.0.1           18.482ms    carrier-grade NAT (RFC 6598 space)   asymm 4
 4:  172.16.250.134       31.454ms    ISP core, privately addressed
 5:  (ISP router)         16.173ms                                         asymm 8
 6:  (ISP router)         32.546ms
 7:  (transit router)     27.558ms
 8:  141.101.72.113       32.124ms    Cloudflare's network                 asymm 9
 9:  no reply
```

Four lessons in one trace. The laptop sits behind three layers of address translation (hops 1 to 3); the ISP numbers its own core from private space, so some routers are not reachable from the internet at all. Per-hop times are not monotonic (hop 5 at 16 ms, hop 4 at 31 ms) because a router generates ICMP on a slow control-plane path, so a traceroute's latencies describe the ICMP responder, not the forwarding path; only the last hop's time is meaningful end to end. `asymm` marks replies that came back over a path of a different length: forward and return routes are chosen independently by different networks' policies. And the destination's own edge does not answer TTL-expired probes, which is a policy choice, not a fault.

```viz
{"type": "network", "scenario": "traceroute", "title": "Traceroute: TTL 1, 2, 3 and the routers that complain", "caption": "Each probe dies one hop further along, and the router that discards it reveals itself in the ICMP time-exceeded reply."}
```

## NAT: sharing one public address

There are about 4.3 billion IPv4 addresses and far more devices, so most hosts sit behind **network address translation**. A NAT at the border rewrites each outbound packet's private source address and port to its own public address and a port it chooses, remembers the pair in a table keyed by the flow, and applies the reverse rewrite to replies. Because TCP and UDP checksums cover a pseudo-header containing both addresses, the NAT patches the transport checksum too, which makes it the standard example of a layer-3 box that must parse layer 4.

| Inside source | Outside source | Destination | Protocol |
|---|---|---|---|
| 192.168.1.10:51000 | 203.0.113.5:51000 | 104.20.23.154:443 | TCP |
| 192.168.1.11:51000 | 203.0.113.5:51001 | 104.20.23.154:443 | TCP |
| 192.168.1.10:41893 | 203.0.113.5:41893 | 8.8.8.8:53 | UDP |

```viz
{"type": "network", "scenario": "nat", "title": "NAT rewrites source address and port on the way out and reverses it on the way back"}
```

Four consequences follow from the table. Nothing outside can start a connection to 192.168.1.10, because an inbound packet needs a row that only an outbound packet creates. Rows expire when idle (an AWS NAT gateway drops idle TCP after 350 seconds; UDP rows often last 30 seconds), so idle connections through a NAT need keepalives. One public address offers about 64,000 ports per destination, so thousands of clients hammering one API can exhaust it. And the source address your service logs is often the NAT's, which matters for rate limiting and abuse blocking by IP; the traceroute above crossed three NATs before it reaches the internet. [NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking) traces the table packet by packet, with conntrack's timers and how peer-to-peer traffic gets through.

## BGP: how the world's routers learn prefixes

Inside one organisation, routers run OSPF or IS-IS and compute shortest paths ([routing algorithms](/learn/networking/network-algorithms/routing-algorithms) covers Dijkstra and Bellman-Ford). Between the roughly 80,000 autonomous systems (ASes) on the internet (the CIDR Report counted about 79,500 in September 2026), routers run **BGP**, a path-vector protocol whose currency is policy.

An AS announces "I can reach 203.0.113.0/24" to its neighbours, with an **AS path**: the list of ASes the announcement passed through, each prepending itself. A router that sees its own AS in a path discards it, which is the loop prevention. Each router picks one best route per prefix and re-announces only that one, subject to export policy. The commercial rules, known after Gao and Rexford: prefer routes learned from **customers** (they pay you) over **peers** (settlement-free) over **providers** (you pay them), and announce peer and provider routes only to customers, so nobody carries traffic between two parties who do not pay them.

```viz
{"type": "network", "scenario": "bgp-path", "title": "BGP announcements accumulate an AS path", "caption": "Each AS prepends its number and re-announces its chosen route. Selection is by policy first and path length second."}
```

### The decision process, traced

A router in AS 64500 hears three routes for 203.0.113.0/24. The operator sets `LOCAL_PREF` by relationship: 200 for customers, 150 for peers, 100 for transit providers.

| Route | Learned from | AS path | LOCAL_PREF | Origin | MED | IGP cost to next hop |
|---|---|---|---|---|---|---|
| A | Customer AS 64510 | 64510 64520 64530 64496 | 200 | IGP | 0 | 30 |
| B | Peer AS 64501 | 64501 64496 | 150 | IGP | 0 | 10 |
| C | Transit AS 64502 | 64502 64496 | 100 | IGP | 50 | 10 |

The decision process (simplified from the common Cisco and Juniper order) eliminates candidates step by step:

1. Highest `LOCAL_PREF`: A (200) survives alone. Done: the four-AS customer path beats two-AS paths.
2. If A is withdrawn: B (150) beats C (100) at step 1 again. Path length never gets a vote.
3. If the operator had two transit routes, C via AS 64502 (MED 50, IGP cost 10) and D via AS 64503 (`64503 64496`, MED 0, IGP cost 20), both with `LOCAL_PREF` 100: equal path length; equal origin; MED is compared only between routes from the *same* neighbouring AS, so C's 50 and D's 0 are not compared; both are eBGP; the lower IGP cost to the exit wins, so C ("hot-potato" routing: hand the packet off at the nearest exit).
4. Remaining ties go to the oldest route and finally the lowest router ID.

That order explains why traffic between two hosts in one city can cross another country (it follows each network's cheapest exit, not the shortest path), and why **AS-path prepending** (announcing `64496 64496 64496` on a link you want used less) is a weak tool: it only acts at the path-length step, after every neighbour's `LOCAL_PREF` has already decided.

### Hijacks, leaks and withdrawals

- **More-specific hijack.** Any AS can announce any prefix, and longest-prefix match prefers the more specific one wherever both are heard. The YouTube incident was a /24 inside a /22. The partial fix is **RPKI**: address holders publish signed Route Origin Authorisations stating which AS may originate a prefix and up to what length (`maxLength`), and routers that validate drop "invalid" announcements. It stops accidental origin hijacks; it does not stop a forged AS path.
- **Route leak.** An AS re-announces routes it learned from one provider to another, breaking the export rules above; traffic for large networks flows through a small one that cannot carry it.
- **Withdrawal.** In the Facebook outage, a maintenance command disconnected the backbone, and Facebook's DNS servers, designed to stop announcing their prefixes when they cannot reach the data centres, did exactly that. With no route to the authoritative DNS servers, every resolver's queries for facebook.com failed, and the retry storm from clients and apps raised load on public resolvers: [Cloudflare wrote](https://blog.cloudflare.com/october-2021-facebook-outage/) that resolvers worldwide were handling 30 times more queries than usual.
- **Slow convergence.** After a failure, BGP explores alternative paths one update at a time, rate-limited by a per-neighbour advertisement interval (RFC 4271 suggests 30 s for eBGP; implementations differ), so reconvergence takes tens of seconds to minutes and some destinations black-hole meanwhile.

## Anycast: one address, many places

Because several sites can announce the same prefix, one IP address can live in hundreds of data centres. Each client's packets go to whichever site is best by the BGP rules above, which correlates with geographic closeness but is not the same thing. Every large public DNS resolver (1.1.1.1, 8.8.8.8) and most CDN edges work this way. The measurement for this track saw it directly: two requests a minute apart to the same address, 104.20.23.154, were answered by Cloudflare sites in Los Angeles and Dallas (the `cf-ray` response header names the site), each with its own cache (`age: 10242` from one, `age: 5` from the other).

Anycast suits single-packet, stateless exchanges such as DNS. For TCP it needs care: if a routing change moves a client's packets to another site mid-connection, that site has no state for the flow and resets it. Route changes are rare relative to connection lifetimes for short HTTP exchanges, CDNs keep long transfers stable with consistent ECMP hashing inside each site, and QUIC's connection IDs let a connection survive a path change. [CDNs and edge](/learn/networking/application-protocols/cdns-and-edge) builds on this; [DNS](/learn/networking/fundamentals/dns) covers the alternative, steering clients by the DNS answer.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Rogue host or VPN route | One address unreachable, its neighbours fine | `ip route get <addr>` shows an unexpected /32 or more-specific via a tunnel | Remove or scope the route; add a policy so tunnels cannot install more-specifics for production ranges |
| Overlapping private ranges | Peering, VPN or a merger cannot connect two networks; some hosts reachable, others not | Both sides use 10.0.0.0/16 (or a Docker bridge's 172.17.0.0/16 shadows a corporate range) | Plan non-overlapping ranges up front; move the Docker bridge (`bip`); translate at the boundary only as a last resort |
| BGP hijack or leak | Your prefix's traffic arrives elsewhere or not at all, from parts of the internet | Public looking glasses and route collectors show a different origin AS or a more-specific | Publish RPKI ROAs with tight `maxLength`; announce your own more-specifics in an emergency; contact the upstream |
| Withdrawal of your own routes | Total outage including your DNS and your remote access | Route collectors show your prefixes withdrawn | Keep out-of-band access that does not depend on the production network; stage changes that can withdraw routes |
| ECMP polarisation | One path of a multipath group saturates while others idle | Every router hashes the same fields with the same seed, so they choose alike | Per-router hash seeds, include ports in the hash, or split elephant flows |
| Broken IPv6 path | A quarter-second extra on some connections, or hangs from old clients | `curl -6` fails where `curl -4` works | Fix the IPv6 route or stop publishing AAAA until it works; Happy Eyeballs clients mask it, old ones do not |

## Trade-offs: ways to steer traffic to a site

| | Anycast (BGP) | DNS-based steering | Explicit next hop (static routes) |
|---|---|---|---|
| Granularity | Per network region, as BGP sees it | Per resolver or client subnet | Per route |
| Failover speed | Seconds to minutes (withdraw, reconverge) | Bounded by TTLs and resolvers that ignore them | Manual or health-checked |
| Knows about load | No | Yes, if the DNS server does | No |
| TCP safety | Route changes can reset flows | Stable once connected | Stable |
| Typical use | DNS resolvers, CDN edges, DDoS absorption | Global load balancing, gradual traffic shifting | Inside a VPC or data centre |

## Interviewer follow-ups

**"Does the internet use Dijkstra?"** Model answer: inside an AS, yes, via link-state protocols such as OSPF and IS-IS; between ASes, BGP is a path-vector protocol that selects by `LOCAL_PREF` (business relationships) before path length, so the path you get is each carrier's cheapest, not the fastest for you. Common wrong answer: "BGP computes shortest paths across the internet".

**"A /24 more-specific of your /22 appears from another AS. What happens and what do you do?"** Model answer: every router that hears both prefers the /24 by longest-prefix match, so traffic for that quarter of your space goes to the other AS. Short term, announce your own /24s (the longest prefix most networks accept) to compete, and contact upstreams; long term, RPKI ROAs with `maxLength` equal to what you announce so validating networks drop the hijack. Common wrong answer: "BGP picks the shorter AS path, so our route wins".

**"How many subnets and hosts do you get splitting a /20 into /24s?"** Model answer: 2^(24−20) = 16 subnets of 256 addresses; 254 usable on a LAN, 251 in AWS, which reserves five. Common wrong answer: "four subnets", from confusing prefix bits with octets.

**"Why is anycast fine for DNS but tricky for long TCP connections?"** Model answer: a route change can deliver a flow's later packets to a site with no state for it, which resets the connection; DNS is one datagram each way. Mitigations: consistent hashing inside a site, short connections, QUIC connection IDs. Common wrong answer: "anycast only works over UDP".

## What mid-level engineers get wrong

- Treating the netmask as octet-aligned and mis-sizing anything that is not /8, /16 or /24, for example putting 300 hosts in a /24.
- Reading traceroute's per-hop times as the path's latency profile and blaming a router whose ICMP generation is slow.
- Believing a more-specific route is harmless because "the default still works"; longest-prefix match always prefers it, including a hijacker's.
- Choosing 10.0.0.0/16 for every VPC and every lab, then finding that nothing can be peered or connected by VPN.
- Assuming the internet routes on the shortest path, and being surprised by a round trip through another city.
- Letting the IPv6 path rot because "IPv4 works": Happy Eyeballs hides it in browsers, but older clients and some libraries wait for timeouts.

## Exercises

```exercise
id: longest-prefix-match
title: Longest-prefix match
prompt: |
  `routes` is a list of `[cidr, next_hop]` pairs, for example
  `["10.20.0.0/16", "R2"]`. Return the `next_hop` of the route with the
  longest prefix that contains the IPv4 address `dst`, or `None`/`null` if
  no route matches. `0.0.0.0/0` matches everything. A route's address may
  have host bits set (`"10.20.7.9/22"` means `10.20.4.0/22`). If two
  routes have the same prefix length and both match, keep the earlier one.
languages: [python, javascript]
entry: longest_prefix_match
starter:
  python: |
    def longest_prefix_match(routes, dst):
        # your code here
        return None
  javascript: |
    function longest_prefix_match(routes, dst) {
      // your code here
      return null;
    }
tests:
  - args: [[["0.0.0.0/0", "default"], ["10.0.0.0/8", "R1"], ["10.20.0.0/16", "R2"], ["10.20.4.0/22", "R3"], ["10.20.5.0/25", "R4"], ["10.20.5.200/32", "R5"]], "10.20.5.5"]
    expected: "R4"
    label: the /25 is the most specific
  - args: [[["0.0.0.0/0", "default"], ["10.0.0.0/8", "R1"], ["10.20.0.0/16", "R2"], ["10.20.4.0/22", "R3"], ["10.20.5.0/25", "R4"], ["10.20.5.200/32", "R5"]], "10.20.5.130"]
    expected: "R3"
    label: just past the end of the /25
  - args: [[["0.0.0.0/0", "default"], ["10.0.0.0/8", "R1"], ["10.20.0.0/16", "R2"], ["10.20.4.0/22", "R3"], ["10.20.5.0/25", "R4"], ["10.20.5.200/32", "R5"]], "10.20.5.200"]
    expected: "R5"
    label: a host route beats everything
  - args: [[["0.0.0.0/0", "default"], ["10.0.0.0/8", "R1"]], "8.8.8.8"]
    expected: "default"
  - args: [[["10.0.0.0/8", "R1"]], "11.0.0.1"]
    expected: null
    hidden: true
    label: no default route
  - args: [[["208.65.152.0/22", "youtube"], ["208.65.153.0/24", "hijacker"]], "208.65.153.238"]
    expected: "hijacker"
    hidden: true
    label: the 2008 more-specific
  - args: [[["10.20.7.9/22", "R3"], ["10.20.0.0/16", "R2"]], "10.20.4.1"]
    expected: "R3"
    hidden: true
    label: host bits set in the route
hints:
  - "Convert addresses to 32-bit integers. A route matches when `dst` and the route's address agree on the first `prefix` bits."
  - "In JavaScript avoid `<<` for masks (it is signed and `x << 32` is `x`); compare `Math.floor(a / 2 ** (32 - p))` for both addresses instead."
```

```exercise
id: bgp-best-path
title: BGP best-path selection
prompt: |
  Each route is an object with `id`, `local_pref`, `as_path` (a list of AS
  numbers, nearest first), `origin` (`"igp"`, `"egp"` or `"incomplete"`),
  `med`, `ebgp` (boolean), `igp_cost` and `router_id` (a dotted quad).
  Return the `id` of the best route, eliminating candidates in this order:

  1. Keep the highest `local_pref`.
  2. Keep the shortest `as_path`.
  3. Keep the best origin: igp before egp before incomplete.
  4. MED: drop a route if another remaining route with the same first AS in
     its `as_path` has a lower `med` (routes from different neighbouring
     ASes are not compared on MED).
  5. If any remaining route is eBGP, drop the iBGP ones.
  6. Keep the lowest `igp_cost`.
  7. Pick the lowest `router_id`, compared numerically as an IPv4 address.
languages: [python, javascript]
entry: bgp_best_path
starter:
  python: |
    def bgp_best_path(routes):
        candidates = list(routes)
        # your code here
        return candidates[0]["id"]
  javascript: |
    function bgp_best_path(routes) {
      let candidates = routes.slice();
      // your code here
      return candidates[0].id;
    }
tests:
  - args: [[{"id": "C", "local_pref": 100, "as_path": [64502, 64496], "origin": "igp", "med": 50, "ebgp": true, "igp_cost": 10, "router_id": "10.0.0.3"}, {"id": "B", "local_pref": 150, "as_path": [64501, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 10, "router_id": "10.0.0.2"}, {"id": "A", "local_pref": 200, "as_path": [64510, 64520, 64530, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 30, "router_id": "10.0.0.1"}]]
    expected: "A"
    label: the customer route wins despite a longer path
  - args: [[{"id": "C", "local_pref": 100, "as_path": [64502, 64496], "origin": "igp", "med": 50, "ebgp": true, "igp_cost": 10, "router_id": "10.0.0.3"}, {"id": "D", "local_pref": 100, "as_path": [64503, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 20, "router_id": "10.0.0.4"}]]
    expected: "C"
    label: MED is not compared across neighbouring ASes
  - args: [[{"id": "X", "local_pref": 100, "as_path": [64502, 64496], "origin": "igp", "med": 20, "ebgp": true, "igp_cost": 5, "router_id": "10.0.0.1"}, {"id": "Y", "local_pref": 100, "as_path": [64502, 64496], "origin": "igp", "med": 10, "ebgp": true, "igp_cost": 50, "router_id": "10.0.0.2"}]]
    expected: "Y"
    label: same neighbour, lower MED wins before IGP cost
  - args: [[{"id": "P", "local_pref": 100, "as_path": [64502, 64496], "origin": "incomplete", "med": 0, "ebgp": true, "igp_cost": 1, "router_id": "10.0.0.1"}, {"id": "Q", "local_pref": 100, "as_path": [64503, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 9, "router_id": "10.0.0.2"}]]
    expected: "Q"
    label: origin before IGP cost
  - args: [[{"id": "prepended", "local_pref": 100, "as_path": [64502, 64496, 64496, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 1, "router_id": "10.0.0.1"}, {"id": "plain", "local_pref": 100, "as_path": [64503, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 9, "router_id": "10.0.0.2"}]]
    expected: "plain"
    hidden: true
    label: prepending lengthens the path
  - args: [[{"id": "E", "local_pref": 100, "as_path": [64502, 64496], "origin": "igp", "med": 0, "ebgp": true, "igp_cost": 100, "router_id": "10.0.0.5"}, {"id": "I", "local_pref": 100, "as_path": [64503, 64496], "origin": "igp", "med": 0, "ebgp": false, "igp_cost": 1, "router_id": "10.0.0.1"}]]
    expected: "E"
    hidden: true
    label: eBGP before IGP cost
  - args: [[{"id": "ten", "local_pref": 100, "as_path": [64502], "origin": "igp", "med": 0, "ebgp": false, "igp_cost": 5, "router_id": "10.0.0.10"}, {"id": "nine", "local_pref": 100, "as_path": [64503], "origin": "igp", "med": 0, "ebgp": false, "igp_cost": 5, "router_id": "10.0.0.9"}]]
    expected: "nine"
    hidden: true
    label: router IDs compare as numbers, not strings
hints:
  - "Apply each rule as a filter over the surviving candidates; stop early is optional because later filters leave a single survivor unchanged."
  - "For MED, group by `as_path[0]` and keep only the lowest MED within each group; compare router IDs by converting the dotted quad to an integer."
```

## Senior signals

- You do subnet and VLSM arithmetic in your head: network, broadcast, host count, alignment, and cloud-reserved addresses.
- You explain forwarding as longest-prefix match at every hop with no global path knowledge, trace it on a table, and know the kernel does it in an LC-trie and hardware in TCAM.
- You read a traceroute critically: NAT layers, private cores, non-monotonic ICMP latency, asymmetric return paths.
- You trace BGP's decision process (`LOCAL_PREF`, AS path, origin, MED within one neighbour, eBGP over iBGP, IGP cost) and know why prepending is weak and why paths follow money.
- You connect the YouTube hijack to longest-prefix match, the Facebook outage to route withdrawal, and RPKI to both.
- You use anycast for DNS and CDN edges, know the TCP caveat, and choose between anycast and DNS steering on granularity and failover time.

## Check yourself

```quiz
- q: >-
    What are the network address, broadcast address and usable LAN host count for 192.168.37.200/26?
  options: ["192.168.37.192, 192.168.37.255, 62", "192.168.37.200, 192.168.37.255, 55", "192.168.37.128, 192.168.37.191, 62", "192.168.37.0, 192.168.37.255, 254"]
  answer: 0
  explanation: >-
    A /26 leaves 6 host bits, so blocks of 64 aligned to multiples of 64 in the last byte. 200 falls in the block 192 to 255, giving network .192, broadcast .255 and 64 minus 2 = 62 usable hosts. The .128 block ends at .191 and does not contain .200.
- q: >-
    A router has routes 10.20.4.0/22 via R3 and 10.20.5.0/25 via R4 plus a default. Where does a packet for 10.20.5.130 go?
  options: ["R3 and R4 alternately, because both routes match", "R3, because the /25 covers only .0 to .127", "The default, because no single route matches exactly", "R4, because the /25 is the most specific route"]
  answer: 1
  explanation: >-
    A /25 covers 128 addresses; 10.20.5.0/25 is .0 to .127, so .130 is outside it. Of the routes that do contain the destination, the /22 is the longest, so R3. Longest-prefix match never needs an exact match, and equal-cost splitting applies only to routes of the same prefix.
- q: >-
    A BGP router hears 203.0.113.0/24 via a customer with a 4-AS path and via a transit provider with a 2-AS path. LOCAL_PREF is 200 for customers and 100 for transit. Which route does it choose?
  options: ["Whichever route was received first, since BGP keeps the oldest", "Both routes, with traffic split evenly by ECMP across the two", "The customer route, since LOCAL_PREF is checked before path length", "The transit route, since BGP minimises the number of AS hops"]
  answer: 2
  explanation: >-
    LOCAL_PREF is the first comparison in the decision process and encodes business relationships; path length only breaks ties among equally preferred routes, and route age comes near the end. That is why inter-domain paths follow money rather than distance, and why prepending cannot override a neighbour's LOCAL_PREF.
- q: >-
    In 2008 an ISP announced 208.65.153.0/24 while YouTube announced 208.65.152.0/22. Why did traffic for YouTube's addresses in that /24 follow the rogue announcement?
  options: ["The /22 was withdrawn by the rogue ISP using a forged message", "Longest-prefix match prefers the /24 wherever both routes are heard", "RPKI validation marked YouTube's own announcement as invalid", "The rogue AS path was shorter, so BGP selection preferred it"]
  answer: 1
  explanation: >-
    Forwarding picks the most specific matching prefix before any BGP comparison between the two routes matters, because they are different prefixes. Nothing was withdrawn, and RPKI (which did not exist in deployable form then) would have marked the rogue origin invalid, not YouTube's. Announcing your own /24s is the emergency countermeasure.
- q: >-
    A traceroute shows hop 4 at 31 ms and hop 5 at 16 ms. What is the best explanation?
  options: ["Packets travel backwards in time between hop 4 and hop 5", "Hop 5 is closer to the destination, so the path got shorter", "Hop 4 generated its ICMP reply slowly on its control plane", "Hop 4 is congested, so every packet through it is delayed"]
  answer: 2
  explanation: >-
    Each time is the round trip to the router that generated an ICMP time-exceeded message, and routers generate those on a slow, rate-limited control path. If hop 4 delayed forwarded traffic, hop 5 and everything after would also show at least 31 ms. Only the final hop's time reflects the end-to-end path.
- q: >-
    Why is anycast a comfortable fit for DNS resolvers but needs extra care for long-lived TCP services?
  options: ["Anycast sites share no routing table, so TCP handshakes cannot finish", "TCP packets are larger than the anycast path's MTU is able to carry", "Anycast requires UDP, so TCP needs a separate unicast address", "A route change can send a TCP flow's packets to a site without its state"]
  answer: 3
  explanation: >-
    Anycast delivers each packet to the BGP-best site, which can change when routes change. A DNS exchange is one datagram each way with no connection state, so it does not care; a TCP connection whose later packets land at a different site is reset. CDNs use anycast for TCP successfully with consistent hashing inside sites and short connections, and QUIC connection IDs survive path changes.
```

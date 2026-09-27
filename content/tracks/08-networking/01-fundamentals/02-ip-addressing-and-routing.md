---
slug: ip-addressing-and-routing
title: "IP addressing and routing: from CIDR math to BGP"
description: Subnet arithmetic you can do in your head, how a routing table picks a next hop by longest prefix match, what NAT actually rewrites, and why BGP chooses policy over the shortest path.
minutes: 24
difficulty: easy
tags: [networking, ip, cidr, subnets, nat, routing, bgp, anycast]
problems: []
---
A packet addressed to 203.0.113.9 leaves your laptop. Nothing on your laptop, or on any of the twelve routers in between, has a route to that specific address. Each device knows only "addresses that look like this go that way", and the packet reaches its destination because every one of those coarse decisions is consistent with the others. Understanding how that consistency is achieved (prefixes, longest match, and a global gossip protocol between companies) is what lets you read a VPC route table, explain why a service in one subnet cannot reach another, and answer "how does anycast work" in a design interview.

## IPv4 addresses are 32-bit integers with a prefix

An IPv4 address is a 32-bit number written as four decimal bytes. `10.42.7.19` is

```text
00001010 . 00101010 . 00000111 . 00010011
   10         42         7          19
```

By itself it identifies a host. Paired with a **prefix length** it also identifies a network: `10.42.7.19/22` says "the first 22 bits are the network part, the remaining 10 bits are the host part". This is CIDR (classless inter-domain routing) notation, and the arithmetic behind it is the arithmetic you need for every subnet decision.

### Worked example: 10.42.7.19/22

Split the address at bit 22. The first two bytes (16 bits) are fixed; 6 more bits come from the third byte; the remaining 2 bits of the third byte and all 8 of the fourth are host bits.

```text
third byte 7  = 00000111
                ^^^^^^      network bits (6)
                      ^^    host bits (2)
```

- **Netmask:** 22 ones then 10 zeros: `255.255.252.0` (the third byte is `11111100` = 252).
- **Network address:** zero the host bits: third byte `00000100` = 4, so `10.42.4.0`.
- **Broadcast address:** set the host bits to one: third byte `00000111` = 7, fourth byte 255, so `10.42.7.255`.
- **Usable hosts:** 2^10 − 2 = **1,022** (network and broadcast addresses are reserved).
- **Range:** 10.42.4.0 to 10.42.7.255; any address in 10.42.4.x, 10.42.5.x, 10.42.6.x or 10.42.7.x is on this subnet.

The mental shortcut: a /22 covers 2^(24−22) = 4 third-byte values, aligned to a multiple of 4. A /24 is one class-C-sized block of 256 addresses; a /16 is 65,536; a /8 is 16,777,216. Cloud providers reserve a few extra addresses per subnet (AWS takes five), so a /24 in a VPC yields 251 usable addresses, not 254.

```python
def subnet(addr: str, prefix: int) -> tuple[str, str, int]:
    n = int.from_bytes(bytes(int(b) for b in addr.split(".")), "big")
    mask = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
    net, bcast = n & mask, n | (~mask & 0xFFFFFFFF)
    fmt = lambda x: ".".join(str((x >> s) & 255) for s in (24, 16, 8, 0))
    return fmt(net), fmt(bcast), max(0, 2 ** (32 - prefix) - 2)

print(subnet("10.42.7.19", 22))   # ('10.42.4.0', '10.42.7.255', 1022)
```

### Reserved and private ranges

| Range | Purpose |
|---|---|
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | Private (RFC 1918); never routed on the public internet; what every VPC and home network uses |
| `100.64.0.0/10` | Carrier-grade NAT shared space |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local; the cloud metadata service lives at 169.254.169.254 |
| `203.0.113.0/24`, `198.51.100.0/24`, `192.0.2.0/24` | Documentation (used in this track so nothing here is a real host) |
| `224.0.0.0/4` | Multicast |

Private space is why two companies can both use 10.0.0.0/8 and why VPC peering breaks when they do: there is no way to route to "the other 10.0.1.5".

## IPv6 in two paragraphs

IPv6 addresses are 128 bits written as eight groups of four hex digits, with one run of zero groups collapsible to `::`: `2001:db8:85a3::8a2e:370:7334`. Networks are almost always `/64` (the host half is 64 bits, often derived from the MAC or randomised), and an organisation typically gets a `/48` or `/56`. The header is a fixed 40 bytes with no checksum and no router fragmentation, which makes forwarding cheaper.

The practical differences: there is enough space that NAT is unnecessary, so every host can have a public address and firewalls do the isolation NAT used to do accidentally; link-local `fe80::/10` addresses are mandatory and used for neighbour discovery (the ARP replacement); and dual-stack hosts prefer IPv6 by default, so a broken IPv6 route causes a 1–5 second stall before the client falls back to IPv4 ("happy eyeballs" races both to avoid it). A significant share of mobile and residential traffic is IPv6 today; if your service is IPv4-only, a translation layer is in the path.

## Getting to the next hop: ARP

IP addresses are logical; to actually put a frame on an Ethernet link you need the MAC address of the next device. ARP (Address Resolution Protocol) asks: the host broadcasts "who has 10.42.4.1?" and the owner replies with its MAC. The answer is cached for a few minutes.

```viz
{"type": "network", "scenario": "arp", "title": "ARP resolves the next hop's MAC before the first IP packet can leave"}
```

The first packet to a new destination on the local link waits for that exchange, typically under a millisecond on a LAN. ARP has no authentication, which is why "ARP spoofing" is a textbook LAN attack and why cloud networks replace ARP with a controller-managed table. IPv6 uses Neighbour Discovery over ICMPv6 for the same job.

## The routing table and longest prefix match

Every host and router holds a table of `(prefix, next hop, interface)` rows. To forward a packet it finds every row whose prefix contains the destination and picks the one with the **longest** prefix (the most specific). Here is a real-looking Linux host table:

```bash
$ ip route
default via 10.42.4.1 dev eth0 proto dhcp metric 100
10.42.4.0/22 dev eth0 proto kernel scope link src 10.42.7.19
10.99.0.0/16 via 10.42.4.254 dev eth0
172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1
```

For a packet to `10.99.12.3` three rows match: `default` (/0) and `10.99.0.0/16`. The /16 is longer, so the next hop is `10.42.4.254`. For `10.42.5.9` the /22 row matches and `scope link` means "on this link; ARP for it directly". Anything else goes to the default gateway `10.42.4.1`.

`ip route get` tells you the decision without sending anything:

```bash
$ ip route get 203.0.113.9
203.0.113.9 via 10.42.4.1 dev eth0 src 10.42.7.19 uid 1000
```

Longest prefix match is the single most important rule in routing, and it is the source of the classic misconfiguration: someone adds a `/32` route for a single host to a VPN interface, that route beats every other row, and only that host becomes unreachable when the VPN is down. Cloud route tables (an AWS VPC route table, for example) work identically: `10.0.0.0/16 → local`, `0.0.0.0/0 → igw-...`, `10.1.0.0/16 → pcx-...` for a peering, longest match wins.

Routers implement this in hardware with a trie or TCAM keyed on the prefix, which is why the global routing table (roughly a million IPv4 prefixes today, order of magnitude) fits and why announcing a lot of small prefixes is frowned on.

```viz
{"type": "network", "scenario": "packet-routing", "title": "Each router makes an independent longest-prefix-match decision and decrements TTL"}
```

Note in the animation that no router knows the whole path. Each one asks only "which of my rows best matches this destination", forwards, and forgets. TTL is the safety net: if a routing loop forms (two routers each believing the other is the way), the packet dies after at most 64 hops instead of circulating forever. [Routing algorithms](/learn/networking/network-algorithms/routing-algorithms) covers how the tables get populated.

## NAT: rewriting two layers

There are about 4.3 billion IPv4 addresses and far more devices. Network address translation lets a whole private network share one public address by rewriting packets at the border.

```viz
{"type": "network", "scenario": "nat", "title": "NAT rewrites source address and port on the way out and reverses it on the way back"}
```

The NAT device keeps a mapping table keyed by the 5-tuple. A realistic snapshot:

| Inside src | Inside port | Outside src | Outside port | Destination | Proto | Last seen |
|---|---|---|---|---|---|---|
| 10.42.7.19 | 51624 | 203.0.113.50 | 40011 | 198.51.100.7:443 | TCP | 2 s ago |
| 10.42.7.19 | 51625 | 203.0.113.50 | 40012 | 198.51.100.7:443 | TCP | 2 s ago |
| 10.42.5.3 | 51624 | 203.0.113.50 | 40013 | 192.0.2.10:53 | UDP | 30 s ago |

Outbound: the NAT replaces `10.42.7.19:51624` with `203.0.113.50:40011`, fixes the IP checksum and the TCP/UDP checksum (the pseudo-header includes the address), and forwards. Inbound: a packet to `203.0.113.50:40011` is looked up and rewritten back to `10.42.7.19:51624`. Two inside hosts can use the same source port because the NAT assigns distinct outside ports.

The consequences a senior engineer expects:

- **Unsolicited inbound is impossible.** Nothing can reach `10.42.7.19` unless it first sent something out. This is why peer-to-peer and WebRTC need STUN/TURN servers to punch holes and relay.
- **Mappings expire.** Idle TCP mappings are dropped after minutes to hours (AWS NAT gateway: 350 s idle timeout, so long-lived idle connections need TCP keepalives shorter than that); UDP mappings after 30 s to a few minutes. Your database connection that "randomly resets after five minutes idle" is often this.
- **Port exhaustion is real.** One outside address offers about 64k ports per destination. A NAT gateway fronting thousands of pods all talking to one API endpoint can run out; the symptom is new connections failing while existing ones work. The fix is more outside addresses or fewer connections (pooling).
- **The TCP checksum is why NAT must parse layer 4.** NAT is the canonical layer violation described in [Layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation).

Kubernetes clusters, cloud VPCs and your home router are all NAT; the "source IP" your service logs is frequently a NAT address, which matters for rate limiting by IP.

## Between networks: BGP and why the shortest path loses

Inside one organisation, routers run OSPF or IS-IS and compute genuinely shortest paths. Between organisations, the internet runs **BGP**, and the currency is not distance but policy.

Every network that speaks BGP has an autonomous system number (AS). It announces to its neighbours "I can reach 203.0.113.0/24, and the path to get there is AS64500 AS64496" (the list of ASes the announcement passed through, with itself prepended). Each router chooses among the announcements it hears for the same prefix, then re-announces its chosen path to its own neighbours with its AS prepended. That path-vector list is both the route and the loop-detection mechanism: if a router sees its own AS in the path, it discards the announcement.

```viz
{"type": "network", "scenario": "bgp-path", "title": "BGP announcements accumulate an AS path; each AS picks by policy first, path length second"}
```

The selection order in a typical router is roughly:

1. **Local preference** (an operator-configured number: "prefer routes via the customer who pays us over the peer who does not over the transit provider we pay").
2. Shortest **AS path** length.
3. Origin type, MED, and a chain of tie-breakers ending in "lowest router ID".

Local preference comes first, so a five-AS path through a paying customer beats a two-AS path through an expensive transit link. That is why traffic between two hosts in the same city can round-trip through another country, and why an interviewer asking "does the internet use Dijkstra" expects "inside an AS yes; between ASes it is a path-vector protocol driven by business relationships, and the path you get is the cheapest for each carrier, not the fastest for you".

Two failure modes to know by name:

- **Route leaks and hijacks.** Any AS can announce any prefix. If a small ISP mistakenly announces a more specific `/24` of a large provider's `/16`, longest prefix match sends the world's traffic there. RPKI (cryptographic origin validation) is the partial fix that has been rolling out slowly.
- **Convergence is slow.** After a link fails, BGP can take tens of seconds to minutes to settle, during which some paths are black holes. Multi-region designs assume this.

## Anycast: one address, many places

Because BGP lets multiple ASes (or multiple sites of one AS) announce the same prefix, you can run the *same* IP address in twenty data centres. Each client's packets go to whichever site is closest in BGP terms, which correlates with, but is not, geographic closeness. This is how every large public DNS resolver (`1.1.1.1`, `8.8.8.8`) and most CDN edges work.

Anycast is excellent for stateless, single-packet protocols such as DNS. It is trickier for TCP: if a route change moves a client's packets to a different site mid-connection, that site has no state for the connection and resets it. In practice route flaps are rare enough, and CDNs mitigate with connection-state sharing or by using anycast only to reach the edge and then handing off. QUIC's connection IDs are explicitly designed to survive this kind of path change.

For system design, anycast is the answer to "how does the client find the nearest edge without a DNS round trip", and DNS-based steering (the next lesson, [DNS](/learn/networking/fundamentals/dns)) is the answer when you need finer control than BGP gives you.

## Reading a VPC through this lens

Put it together on a cloud network, because that is where you will use it:

- A VPC is `10.0.0.0/16`. Subnets are `/24`s carved from it, each in one availability zone, each with a route table.
- A public subnet's table has `0.0.0.0/0 → internet gateway`; a private subnet's has `0.0.0.0/0 → NAT gateway`. Longest match means `10.0.0.0/16 → local` always wins for in-VPC traffic.
- Instances in a private subnet reach the internet through NAT, so every outbound connection consumes a port on the NAT gateway's public address, and idle connections are dropped after the gateway's timeout.
- Peering another VPC that also uses `10.0.0.0/16` is impossible; the prefixes collide and there is no longest match to disambiguate. Choose non-overlapping ranges at design time; renumbering later is a migration.
- Security groups and network ACLs filter on the 5-tuple; a "connection refused" versus a "timeout" tells you whether a packet reached a host that said no (RST) or was silently dropped by a filter.

## Senior signals

- You do /22 arithmetic in your head: network, broadcast, host count, and the alignment of the block.
- You explain forwarding as longest prefix match at every hop with no global path knowledge, and you spot a rogue `/32` route as the cause of a single unreachable host.
- You know NAT rewrites address and port, fixes two checksums, expires idle mappings (and roughly when), and can exhaust ports; you connect that to pool sizing and keepalive intervals.
- You state that BGP picks by local preference before path length, so inter-AS routing is policy, not shortest path, and you know why that makes convergence slow and hijacks possible.
- You use anycast for DNS and CDN edges and know the TCP caveat and how QUIC connection IDs address it.
- You choose non-overlapping private ranges up front because peering overlapping VPCs is impossible.

## Check yourself

```quiz
- q: >-
    What are the network address, broadcast address and usable host count for 192.168.37.200/26?
  options: ["192.168.37.192, 192.168.37.255, 62", "192.168.37.200, 192.168.37.255, 55", "192.168.37.0, 192.168.37.255, 254", "192.168.37.128, 192.168.37.191, 62"]
  answer: 0
  explanation: >-
    A /26 leaves 6 host bits, so blocks of 64 aligned to multiples of 64 in the last byte. 200 falls in the block 192–255, giving network .192, broadcast .255 and 64 − 2 = 62 usable hosts.
- q: >-
    A host's routing table contains 10.0.0.0/8 via R1 and 10.20.0.0/16 via R2, plus a default via R3. Where does a packet to 10.20.5.5 go, and why?
  options: ["R3, because the default route is consulted first", "R2: its /16 is the longest matching prefix", "R1 and R2 alternately, as both prefixes match", "R1, because the /8 route was configured first"]
  answer: 1
  explanation: >-
    Forwarding uses longest prefix match. Both 10.0.0.0/8 and 10.20.0.0/16 contain the destination; the /16 is more specific and wins. Order of configuration and the default route are irrelevant when a more specific match exists.
- q: >-
    Thousands of pods in a private subnet make short-lived HTTPS calls to one external API through a single NAT gateway. New connections start failing with timeouts while existing ones keep working. What is the most likely cause?
  options: ["The private subnet ran out of IP addresses for pods", "The API is rate limiting the pods by source IP", "The API's TLS certificate expired mid-deployment", "The NAT gateway ran out of ports for that destination"]
  answer: 3
  explanation: >-
    Each outbound connection to the same destination needs a unique outside port on the NAT address, and one public address offers roughly 64k ports per destination. With enough concurrent short-lived connections (and TIME_WAIT holding ports), the gateway cannot allocate more; existing mappings are unaffected. Fixes are connection pooling or more NAT addresses. Rate limiting or an expired certificate would return errors, not silent timeouts.
- q: >-
    Two ISPs both announce a path to 203.0.113.0/24. Path A is 2 AS hops via a transit provider the router's operator pays; path B is 5 AS hops via a customer who pays the operator. Which does a typical BGP configuration choose?
  options: ["Path B, because local preference beats path length", "Path A, because BGP minimises the AS path length", "Both paths, with the traffic split evenly between them", "Whichever path was announced to the router first"]
  answer: 0
  explanation: >-
    BGP's decision process checks local preference before AS path length, and operators set local preference to prefer revenue-generating customer routes over peers over transit. Shortest path is only a tie-breaker among equally preferred routes. This is why inter-domain routing is policy, not distance.
- q: >-
    Why is anycast a comfortable fit for DNS resolvers but needs extra care for long-lived TCP services?
  options: ["TCP packets are larger than the anycast path's MTU allows", "Anycast works only for UDP traffic on port 53", "DNS keeps no state, but a route change can strand a TCP flow", "DNS runs over TCP, and anycast requires TCP to work"]
  answer: 2
  explanation: >-
    Anycast delivers each packet to the BGP-nearest site, which can change. A DNS query is typically a single request-response datagram with no connection state, so it does not care. A TCP connection whose later packets arrive at a different site, with no state for it, is reset. CDNs mitigate this and QUIC's connection IDs are designed to survive such moves.
```

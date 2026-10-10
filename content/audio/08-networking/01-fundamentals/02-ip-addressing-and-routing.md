---
lesson: ip-addressing-and-routing
source: 753bf9635b052dd9
fit: partial
desk:
  - "The worked subnet example in binary, and the VLSM allocation table"
  - "The longest-prefix-match trace table and the kernel trie walk"
  - "The measured traceroute, hop by hop"
  - "The BGP decision process traced route by route"
  - "Exercise: longest-prefix match"
  - "Exercise: BGP best-path selection"
---
## Introduction

In February 2008, a Pakistani ISP announced a more specific route for part of YouTube's address space. For about two hours, much of the internet's YouTube traffic followed it into a black hole. In October 2021, a maintenance command cut Facebook's backbone, Facebook's DNS servers withdrew their own routes exactly as they were designed to, and Facebook disappeared from the internet for about six hours.

Neither was a bug in the usual sense. Both were three mechanisms working as designed. Prefixes: addresses grouped into blocks. Longest-prefix match: the rule every router uses to forward. And BGP: the global protocol in which networks tell each other which blocks they can reach.

Here is the strange part. A packet leaves your laptop for one of example.com's addresses. Nothing on the laptop, and no router in between, has a route to that specific address. Each device only knows that addresses that look like this go that way. The packet arrives because every one of those coarse decisions agrees with the others.

So: how addresses and prefixes work, how a router picks a row, what traceroute and NAT really show you, and how BGP chooses paths by money rather than distance.

## Addresses and prefixes

An IPv4 address is a 32 bit number, written as four decimal bytes. Paired with a prefix length, it also names a network. Ten dot 42 dot 7 dot 19, slash 22, says the first 22 bits are the network, and the remaining 10 bits identify a host. That is CIDR notation.

Ten host bits means 2 to the 10th, 1,024 addresses, of which 1,022 are usable on a plain LAN, because the first is the network and the last is broadcast. A cloud VPC takes more: AWS reserves five per subnet, leaving 1,019.

The shortcut for doing it in your head: a slash 22 spans 4 values of the third byte, aligned to a multiple of 4. The third byte here is 7, which rounds down to 4. So the block runs from 10 dot 42 dot 4 dot 0 to 10 dot 42 dot 7 dot 255. A common mistake is treating masks as if only slash 8, 16 and 24 exist, and then trying to put 300 hosts in a slash 24.

When you carve one block into subnets of different sizes, allocate the largest first, so every block stays aligned. And the reverse operation, summarisation, is what keeps the internet workable: four adjacent slash 24s that share their first 22 bits can be advertised as one slash 22. That is why the global table holds about 1.1 million IPv4 prefixes rather than billions of addresses.

Three private ranges, starting 10, 172 dot 16 and 192 dot 168, are never routed on the internet. Every VPC and home network uses them. That is why two companies can both use the 10 range, and why connecting them later is painful: there is no route to "the other" 10 dot 0 dot 1 dot 5. Plan non-overlapping ranges up front.

IPv6, briefly. Addresses are 128 bits, networks are almost always a slash 64, and there is enough space that every host can have a global address, so NAT becomes optional and firewalls do the isolation NAT used to do by accident. Dual-stack clients race both families, a scheme called Happy Eyeballs: they start IPv6 first and IPv4 after a 250 millisecond head start, so a broken IPv6 path costs a quarter of a second instead of a multi-second timeout.

## Longest-prefix match

Every host and router holds rows of prefix, next hop and interface. To forward a packet, it finds every row whose prefix contains the destination, and uses the longest one: the most specific.

Picture a data centre router with a default route, a slash 22 for 10 dot 20 dot 4 dot 0 pointing to router three, and a slash 25 for 10 dot 20 dot 5 dot 0 pointing to router four. A packet for 10 dot 20 dot 5 dot 5 matches both, and the slash 25 is longer, so it goes to router four. Now a packet for 10 dot 20 dot 5 dot 130. Before I answer: which router?

[pause]

Router three. A slash 25 covers 128 addresses, so 10 dot 20 dot 5 dot 0 slash 25 ends at dot 127. The address dot 130 falls outside it, and of the rows that do contain it, the slash 22 is the longest. Longest-prefix match never needs an exact match; it needs the most specific row that contains the address.

That rule produces a classic misconfiguration. Someone adds a slash 32, a host route for a single server, through a VPN interface. It beats every other row for that address, and when the VPN goes down, exactly one host becomes unreachable while all its neighbours work.

It also explains YouTube. YouTube announced a slash 22. The rogue announcement was a slash 24 inside it. Every router on the internet that heard both preferred the slash 24, because it is longer. No BGP tie-breaker even got a vote.

How does a router do this fast? Not by scanning a million rows. The kernel walks a trie on the destination's bits, remembering the last prefix it passed, and hardware routers use memory that compares every row in parallel and returns the longest match in one cycle.

And when several rows tie at the same length and cost, routers use equal-cost multipath. They hash the connection's addresses and ports, and pick one next hop per flow. One TCP connection always takes the same path, so nothing is reordered, while many connections spread out. That same hash is why one elephant flow can never use more than one link's bandwidth.

## Traceroute and NAT

Traceroute sends probes with a TTL of 1, then 2, then 3, and lists the router that sent back an ICMP "time exceeded" at each step. The lesson's measured trace to example.com taught four things.

First, the laptop sat behind three layers of address translation, and the ISP numbered its own core from private space. Second, per-hop times were not monotonic: hop 4 at 31 milliseconds, hop 5 at 16. That is because a router generates its ICMP reply on a slow control-plane path, so a hop's time describes the router answering, not the forwarding path. If hop 4 really delayed forwarded traffic, everything after it would be at least 31 milliseconds too. Only the last hop's time is meaningful end to end. Third, some replies came back over a path of a different length, because forward and return routes are chosen independently by different networks. And fourth, the destination's edge did not answer at all, which is a policy choice, not a fault.

NAT is how 4.3 billion IPv4 addresses stretch over far more devices. A NAT at the border rewrites each outbound packet's private source address and port to its own public address and a port it chooses, remembers the pair in a table keyed by the flow, and reverses the rewrite on replies.

Four consequences follow from that table. Nothing outside can start a connection to a host inside, because an inbound packet needs a row that only an outbound packet creates. Rows expire when idle; an AWS NAT gateway drops idle TCP after 350 seconds, so idle connections need keepalives. One public address offers about 64 thousand ports per destination, so thousands of clients hammering one API can exhaust it. And the source address your service logs is often the NAT's, which matters for rate limiting by IP.

## BGP: paths follow money

Inside one organisation, routers compute shortest paths. Between the roughly 80 thousand autonomous systems on the internet, routers run BGP, and BGP's currency is policy.

An autonomous system announces "I can reach this prefix" to its neighbours, along with an AS path: the list of networks the announcement passed through, each adding itself to the front. A router that sees its own number in a path discards it, which prevents loops. Each router picks one best route per prefix and re-announces only that one.

The commercial rules: prefer routes learned from customers, who pay you, over peers, who exchange traffic for free, over providers, whom you pay. And announce peer and provider routes only to customers, so nobody carries traffic between two parties who are not paying them.

Operators encode that in a value called local preference. In the lesson's trace, a router hears the same prefix three ways: from a customer, with a four-network path and local preference 200; from a peer, with a two-network path and 150; and from a transit provider, with a two-network path and 100. Which one wins?

[pause]

The customer route, with the longer path. Local preference is checked first, and path length only breaks ties among routes that are equally preferred. If the customer route is withdrawn, the peer beats the transit route at the same first step. Path length never gets a vote. Between two otherwise equal transit routes, the router picks the one with the lowest internal cost to its exit, which is called hot-potato routing: hand the packet off at the nearest exit.

That order explains why traffic between two hosts in one city can cross another country. It follows each network's cheapest exit, not the shortest path. It also explains why AS-path prepending, repeating your own number to make a link look longer, is a weak tool. It only acts at the path-length step, after every neighbour's local preference has already decided.

## Hijacks, withdrawals and anycast

Any network can announce any prefix, and longest-prefix match prefers the more specific one wherever both are heard. The partial fix is RPKI: address holders publish signed records saying which network may originate a prefix and up to what length, and validating routers drop announcements that break them. It stops accidental origin hijacks. It does not stop a forged AS path. If it happens to you today, the emergency move is to announce your own slash 24s, the most specific most networks accept, and call your upstreams.

And the Facebook outage was a withdrawal. The backbone was cut, the DNS servers stopped announcing their prefixes because they could no longer reach the data centres, and with no route to Facebook's authoritative DNS, every resolver's lookups failed. The retry storm raised load on public resolvers; Cloudflare wrote that resolvers worldwide handled 30 times more queries than usual. The lesson: keep out-of-band access that does not depend on the production network. And there is slow convergence: after a failure, BGP explores alternatives one update at a time, so reconvergence takes tens of seconds to minutes.

Now turn the "many sites can announce the same prefix" property into a feature. That is anycast: one IP address living in hundreds of data centres, with each client reaching whichever site is best by BGP's rules, which correlates with closeness but is not the same thing. Public DNS resolvers and most CDN edges work this way. In the lesson's measurement, two requests a minute apart to the same address were answered from Los Angeles and from Dallas.

Anycast suits single-packet, stateless exchanges like DNS. For TCP it needs care: if a route change moves a client's packets to another site mid-connection, that site has no state for the flow and resets it. CDNs manage with consistent hashing inside each site and short connections, and QUIC's connection IDs let a connection survive a path change.

## In the interview

A favourite: does the internet use Dijkstra?

[pause]

Inside an autonomous system, yes, through link-state protocols such as OSPF and IS-IS. Between them, BGP is a path-vector protocol that selects by local preference, business relationships, before path length. So the path you get is each carrier's cheapest, not the fastest for you. The wrong answer is "BGP computes shortest paths across the internet".

And: a slash 24 inside your slash 22 appears from another network. What happens? Every router that hears both sends that quarter of your space to the other network, by longest-prefix match. Short term, announce your own slash 24s and contact upstreams. Long term, publish RPKI records whose maximum length matches what you announce. The wrong answer is "BGP picks the shorter path, so our route wins".

## Recap

Four things to remember. A prefix length splits an address into network and host bits; count the host bits, two to that power, minus two, and minus five in AWS. Every router forwards by longest-prefix match with no global knowledge of the path, which is exactly how a more specific hijack wins. BGP chooses by local preference before path length, so paths follow money, and prepending is weak. And anycast puts one address in many places, perfect for DNS, and needs care for long TCP connections.

At your desk: the subnet arithmetic in binary and the allocation table, the routing-table trace and the trie walk, the measured traceroute, the BGP decision trace, and the two exercises, longest-prefix match and BGP best-path selection.

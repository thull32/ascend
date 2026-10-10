---
lesson: nat-firewalls-and-cloud-networking
source: 1ebb2dfa017645a0
fit: great
desk:
  - "The PAT table traced packet by packet, and the conntrack entry format and timeouts table"
  - "The STUN, TURN and ICE trace, with candidate priorities"
  - "The security group and network ACL worked evaluation, rule by rule"
  - "The /16 into /20s subnet table and the private route table"
  - "The egress price table and the trade-offs table for reaching outside a private subnet"
  - "Exercise: simulate a PAT router"
  - "Exercise: split a VPC range into subnets"
---
## Introduction

A payments service in a private subnet calls a card processor's API through a pool of keep-alive HTTPS connections. Every morning the first requests fail with connection resets, then everything recovers. The same week, finance asks why the NAT gateway line on the cloud bill is larger than the compute it serves.

Both have one cause: every outbound packet passes through a translation table nobody on the team had looked at. The AWS NAT gateway drops a mapping after 350 seconds without traffic and answers the next packet on it with a reset, while Linux sends its first TCP keepalive after 7,200 seconds. And the gateway charges for every gigabyte it processes, including a nightly backup to S3 that could have bypassed it for free.

Clouds and home networks alike put a stateful box between your hosts and everything else. So: what that box does to each packet, how peers get past it, how cloud firewalls, subnets and gateways build on the same idea, and how the bill turns routing into a design decision.

## The translation table and its timers

What almost every home router and cloud NAT gateway actually does is port address translation. Many private hosts share one public address, and the NAT tells their flows apart by rewriting the source port too.

Picture two laptops behind one router, and both happen to pick source port 51000 to connect to the same server. The first SYN creates a mapping, and since external port 51000 is free, the router keeps it. The second laptop's SYN finds 51000 taken, so the router gives it 51001. Replies to 51000 go back to the first laptop, replies to 51001 to the second, and the server never knows there are two hosts.

Now a stranger sends a SYN to the router's public address. If it hits a port with no mapping, it is dropped. If it hits port 51000, it is still dropped, because that mapping was made for one particular server, and a well-behaved NAT checks that the packet comes from the peer the mapping was created for. That is the whole story of "why can't anyone connect to my laptop": inbound packets find a mapping only if an inside host created it by sending first.

The limit that bites is per destination. One public address holds about 64 thousand simultaneous flows to one destination address and port, such as a single API endpoint. AWS documents 55 thousand per NAT gateway address to each unique destination, with up to eight addresses. Open a new connection per request to one partner API and you find that limit at a few hundred requests a second.

On Linux this table is conntrack, and the same table backs stateful firewalls, Docker's port publishing and Kubernetes' kube-proxy. Every entry has a countdown that each matching packet resets. On the lesson's machine, an idle established TCP flow was kept for five days. A UDP flow seen in one direction only, like an unanswered DNS query, was kept for 30 seconds; seen both ways, 120.

Managed NATs keep much shorter timers, and that is the opening incident. AWS: 350 seconds for idle TCP, then a reset. Google Cloud NAT: 1,200 seconds for established TCP, 30 for UDP. Consumer routers often expire UDP mappings in 30 to 60 seconds. So anything that holds idle connections through a NAT, database pools, gRPC channels, WebSockets, VPN tunnels, needs a keepalive shorter than the smallest timer on the path. That is why WireGuard's recommended keepalive is 25 seconds.

And the table has a size, 262,144 entries on that machine. When it fills, the kernel logs "table full, dropping packet", existing connections carry on, and new ones fail, which looks like random timeouts on a busy node.

## Getting through: STUN, TURN and ICE

Whether a peer can reach you depends on two separate behaviours. Mapping: does your NAT reuse the same external port for every destination, or make a new one per destination? Filtering: which outside packets may use a mapping? Most home routers keep one mapping for all destinations and filter by exact address and port. Many enterprise firewalls and some carrier-grade NATs make a new mapping per destination. That kind is called symmetric NAT.

A video call between Alice and Bob, both behind NATs, wants a direct UDP path, and WebRTC uses three pieces. STUN: Alice asks a public server "what address and port did you see me come from?", and learns her mapping from outside. TURN: a relay with a public address that carries everything; it always works, and the operator pays for the bandwidth of the whole call. And ICE: gather every candidate address, swap them through the app's signalling server, test pairs in priority order, and pick the best that works. Direct paths are always tried before relays.

The trick is hole punching. Alice sends a check to Bob's public mapping. Bob's NAT drops it, since Bob has not sent to Alice yet, but Alice's NAT now permits Bob. Then Bob sends a check to Alice's mapping. His NAT now permits Alice, and hers already permits him, so it gets through. Both sides sent first, so both holes are open: a direct path, no relay.

Now put Alice behind a symmetric NAT. What goes wrong?

[pause]

When Alice sends to Bob, her NAT creates a new mapping with a new port, not the one STUN reported. Bob sends to the port Alice advertised, whose filter only admits the STUN server, so he is dropped; and Alice's packets come from a port Bob's NAT has never heard of. The direct checks fail and ICE falls back to the relay. With symmetric NATs on both sides, only TURN works. Corporate networks and carrier-grade NAT push up the share of calls that need a relay, which is why every production WebRTC deployment budgets TURN bandwidth.

## Security groups and network ACLs

A stateless filter judges each packet alone, against rules written for both directions. A stateful firewall keeps a conntrack-style table and judges only the first packet of a flow; replies pass because they match. AWS gives you both. A security group is stateful, attached to a network interface, allow-only, and every rule is considered. A network ACL is stateless, attached to a subnet, has allow and deny rules, and evaluates them in number order, first match wins.

Here is the worked case. A web server's security group allows inbound HTTPS from anywhere. The subnet's ACL allows inbound TCP 443 and outbound TCP 443, and denies everything else. A client connects. Do the replies get back?

[pause]

No. The SYN gets in: the ACL's inbound rule allows it, and the security group accepts it and tracks the flow. The server replies, and the security group lets the reply out as part of that flow. Then the stateless ACL looks at it: it is going to the client's ephemeral port, say 51000, not 443. No outbound rule matches, the default denies it, and the handshake times out, even though both "firewalls" allow HTTPS. The fix is an outbound rule for the whole ephemeral range, 1024 to 65535, because clients and NAT gateways use different parts of it.

The same ACL had a second trap. A deny rule for an abusive range, numbered after the allow for port 443, is never reached; first match wins. Blocking a range needs a lower number than the allow. Most teams leave ACLs permissive and do their filtering in security groups, which can reference each other, "allow 5432 from the app tier's group", instead of addresses that change.

## VPCs, routes and private paths

A VPC is a private address range you choose, laid over the provider's network. Choose it once and carefully: it must not overlap anything you will ever peer with or reach over VPN. Using 10 dot 0 dot 0 dot 0, slash 16, for every VPC works until the first peering or acquisition.

The arithmetic is worth doing in your head. Split a slash 16 into slash 20s: four more prefix bits make 16 subnets of 4,096 addresses each. AWS reserves five addresses in every subnet, the network address, the router, DNS, one for future use, and the last, so each slash 20 has 4,091 usable. A slash 24 has 251; the smallest subnet, a slash 28, has 11. Kubernetes clusters that give every pod a VPC address eat slash 20s quickly, so size for pods, not nodes.

Route tables pick the longest matching prefix, like every router. A subnet is public for exactly one reason: its default route points at an internet gateway. A private subnet's default route points at a NAT gateway, which does the translation traced earlier, and that is why it only carries flows started from inside.

There are cheaper and safer ways out. A gateway endpoint, for S3 and DynamoDB only, is just a route-table entry for the service's addresses; it is more specific than the default route, so that traffic skips the NAT gateway, with no hourly or per-gigabyte charge. PrivateLink puts a private interface in your subnet in front of one service, yours or a vendor's; overlapping ranges do not matter because nothing is routed between the networks. VPC peering routes between two whole ranges, but it is not transitive: with A peered to B and B to C, A cannot reach C through B, nor use B's gateways. Ten VPCs that all talk need 45 peerings. A transit gateway is the hub alternative, routing transitively for a per-attachment and per-gigabyte fee.

## Zero trust, and the egress bill

The perimeter model says inside the VPC, or on the office VPN, is trusted. It fails the day one inside host is compromised, because everything that trusted "the packet came from 10 dot something" trusts the attacker too. Zero trust, which Google published as BeyondCorp in 2014, drops network location as a credential. People reach internal apps through an identity-aware proxy that decides per request, with no VPN into a flat network. Services each get a short-lived certificate identity, every connection is mutual TLS, and policies name identities, not address ranges. Security groups stay, as defence in depth, not as the authorisation.

Then the money. Cloud networks charge for bytes that cross boundaries, and the prices are orders of magnitude apart. On AWS list prices: traffic in from the internet is free, and so is traffic within one zone. Between zones, about a cent a gigabyte each way. Through a NAT gateway, about 4.5 cents a gigabyte in processing, on top of transfer. Out to the internet, 5 to 9 cents. S3 through a gateway endpoint, free.

Two worked bills. The nightly backup: 10 terabytes a month through the NAT gateway is about 460 dollars a month in processing alone. One route-table entry for a gateway endpoint makes it zero. The chatty service: two services exchanging a sustained gigabit a second across zones move about 324 thousand gigabytes a month, roughly 6,500 dollars. Zone-aware routing that keeps most calls in-zone cuts most of it, at the cost of less even load. The point is that the per-gigabyte arithmetic belongs in the design, because otherwise the bill arrives a month later.

## In the interview

A follow-up from the lesson. Security group or network ACL: which would you use to block one abusive slash 24?

[pause]

A network ACL, because security groups have no deny rule. Give the deny a lower number than any allow that would match, and remember the ACL is stateless. Better still, block it at the load balancer's web application firewall, which sees the client address before it reaches the VPC. The wrong answer is "a security group deny rule", which does not exist.

And another: we peered VPC A with B, and B with C. Why can't A reach C? Peering is non-transitive by design: routes learned through B's peering are not passed on, so A's packets to C's range have nowhere to go. Peer A with C directly, or move to a transit gateway if the mesh keeps growing. Adding a route in A that points C's range at the A-to-B peering does not work; the peering will not forward it.

## Recap

A NAT is a table. Outbound packets create mappings, replies follow them back, and unsolicited inbound packets are dropped. Its idle timers are short, 350 seconds on an AWS NAT gateway against a two-hour Linux keepalive, so set keepalives and pool idle limits below the smallest timer on the path, and reuse connections to stay under the per-destination port limit.

NAT behaviour is mapping plus filtering. Hole punching works when both sides send first to a stable mapping; a NAT that makes a new port per destination defeats it, and TURN carries the call.

Security groups are stateful and allow-only; network ACLs are stateless and first-match, so they need an outbound rule for ephemeral ports. Pick non-overlapping ranges before the first peering, and remember peering does not chain.

Prefer identity over network location for authorisation, and do the per-gigabyte arithmetic before you design: a gateway endpoint for S3 can turn hundreds of dollars a month into nothing.

At your desk: the PAT and conntrack tables, the ICE trace, the ACL evaluation, the subnet and route tables, the price and trade-off tables, and the PAT and subnet exercises.

---
lesson: arp-and-the-default-gateway
source: 1e3884c4c5541aec
fit: partial
desk:
  - "The routing-table outputs and the Python next-hop decision with its byte-by-byte ARP request"
  - "The ARP field table and the packet capture"
  - "The two ARP visualisations: the healthy exchange and the no-reply run"
  - "The neighbour state table and the state machine in Python"
  - "The neighbour discovery message table and the solicitation field table"
  - "The checklist flowchart and the failed-step evidence from server and leaf"
  - "The trade-offs table and the Linux neighbour tunables"
  - "Practice problem: IP in subnet"
---
## Introduction

The routing table hands a host an answer in the wrong currency. It says: send this packet to 10.1.1.1. That is an IP address, but the network card can only send an Ethernet frame, and a frame is addressed to a MAC address, the 48-bit hardware address of an interface. Something has to turn the next hop's IP into a MAC before the first byte leaves.

On IPv4 that is ARP, the Address Resolution Protocol, from 1982; on IPv6, neighbour discovery. Both are tiny, unauthenticated, and underneath every connection you have ever opened.

Network panels ask: a server can't ping its default gateway, what do you check? The gateway is one hop away, so a good answer walks up the layers from the cable, and ARP is where most of the evidence lives.

The setting is Meridian's Amsterdam fabric. Acme's web server, acme-web1, at 10.1.1.10 slash 24, sits in VLAN 100 behind leaf1. Its default gateway, the router for every destination outside its subnet, is 10.1.1.1, and every Meridian leaf answers for it with the same anycast gateway MAC. Acme's database, acme-db1, at 10.1.2.20, is in another subnet, VLAN 200, behind leaf3.

## Same subnet or off subnet

Before ARP runs, the host decides whose MAC it needs. If the destination is inside a subnet the host is attached to, it resolves the destination itself; otherwise it resolves the gateway. "Inside" means: AND the destination with the interface's mask and compare with the interface's own network. The database, 10.1.2.20, does not match, so acme-web1 ARPs for the gateway.

In practice there is no separate test: the host does an ordinary longest-prefix match on a routing table that usually has two lines, the connected subnet, meaning resolve on this wire, and a default route via 10.1.1.1, meaning resolve this router instead.

Here is the point people miss. The gateway's IP never appears in the packet. The IP header still says 10.1.2.20; 10.1.1.1 is only a key for looking up a MAC. And the gateway must sit inside a connected subnet, because a host can only ARP on a wire it is attached to.

Give acme-web1 a slash 16 by mistake. Before I go on: when it talks to the database, whose MAC does it ask for?

[pause]

The database's own. A slash 16 makes 10.1.2.20 look local, so the host ARPs for it in VLAN 100, where acme-db1 never hears the question. Whether that fails or quietly works depends on proxy ARP. The signal is the kernel's route lookup, which shows its decision without sending anything, and a neighbour table filling with addresses that should never be resolved directly.

## The ARP exchange

ARP runs directly on Ethernet, not over IP. The request is 28 bytes: the hardware and protocol types, two address lengths, an operation, 1 for request and 2 for reply, the sender's MAC and IP, a target MAC of all zeros because that is the unknown, and the target IP, which every receiver reads to ask "is this mine?" It goes to the broadcast MAC, padded to 64 bytes on the wire.

Follow one connection. acme-web1 wants TCP to the database. Its cache has no entry for the gateway, so the kernel creates one in state INCOMPLETE and holds the SYN, the connection's first packet, in a small queue. It broadcasts the request. Leaf1 floods it to every port in VLAN 100 and hands a copy to its gateway interface, the router that lives inside the VLAN.

Every other host, acme-app1 among them, sees a target IP that is not its own and discards the frame. The leaf owns 10.1.1.1. The request carried the sender's IP and MAC, so the leaf records acme-web1 first, and never needs to ARP for it. Then it sends a unicast reply straight back: 10.1.1.1 is at the anycast gateway MAC. acme-web1 stores that as REACHABLE, releases the SYN, and the first frame leaves with the gateway's MAC and the database's IP. On a quiet leaf that takes a millisecond or less, mostly in the switch's CPU, which handles ARP in software.

ARP breaks with no reply: the wrong VLAN, a missing gateway interface, a filter. With a wrong reply: a duplicate IP, or spoofing, since nothing is authenticated. Or with too many requests, because every broadcast interrupts every host in the VLAN. The signals: the server's cache state, a capture with requests leaving and nothing returning, and the leaf's drop counters for the rate limiter guarding its CPU.

Why one gateway MAC on every leaf? A single gateway router is a single point of failure. The classic fix, VRRP, has two routers share a virtual IP and MAC; the master advertises every second, and the backup takes over after missing three, 3 to 4 seconds. An EVPN fabric makes every leaf the gateway at once, same IP, same MAC. Nothing fails over, and a server that moves to leaf5 keeps a correct cache entry.

## The cache

On Linux the cache is the neighbour table, shared by ARP and IPv6, with a state machine from IPv6.

A reply turns INCOMPLETE into REACHABLE. After a random 15 to 45 seconds without confirmation the entry becomes STALE, and a STALE entry is still used, at once. Only when a packet goes through it does it move to DELAY, which waits 5 seconds for an upper layer to vouch for the neighbour; then PROBE sends up to three unicast requests a second apart, and silence means FAILED.

Two details explain real servers. STALE is not an error: most entries on a busy server are STALE, and carry traffic without delay. And TCP confirms for ARP: an acknowledgement through a next hop tells the kernel the neighbour is alive, so a busy connection needs no ARP traffic at all.

Here is the number to remember. If the gateway never answers, the INCOMPLETE entry sends three broadcast probes a second apart, and after about 3 seconds it is FAILED and the queued packets are dropped. The error comes from the host itself: connect returns "No route to host", and ping prints "Destination Host Unreachable" from the server's own address. No packet for the destination ever left, so there is nothing to find on the routers.

Routers keep the same mapping, in hardware too, with far longer timers: 4 hours is a common router default, tens of minutes common on data centre switches. Meanwhile a switch forgets a MAC it has not heard from in 300 seconds.

That mismatch is a classic incident. Traffic for one server suddenly appears on every port in its VLAN. The router still holds a valid ARP entry, but the server's own traffic leaves by another path, so after 300 seconds the switch forgot the MAC's port and floods every frame as unknown unicast. The ARP table has the MAC; the MAC table does not. The fix: keep the ARP timeout below the MAC aging time, so each refresh re-teaches the switch the port.

## Gratuitous and proxy ARP

A gratuitous ARP is an unrequested ARP whose sender and target IP are the same address: "this IP is at this MAC", broadcast to the VLAN. It moves an address to a new MAC after a failover, detects duplicates before a host uses an address, and tells switches where a MAC now lives, which is why hypervisors send one after a live migration.

A failover. Acme runs two load balancers, lb1 and lb2, sharing the virtual IP 10.1.1.50 with keepalived, a Linux implementation of VRRP that by default keeps each box's own MAC, so failover rests entirely on gratuitous ARP. acme-web1 and leaf1 both cache 10.1.1.50 at lb1's MAC. lb1 loses power. lb2 misses three advertisements, becomes master 3 to 4 seconds later, and broadcasts the announcement, five times by default.

acme-web1 already has an entry for 10.1.1.50, so it overwrites the MAC: Linux refuses to create entries from unsolicited ARP, but updates existing ones. Leaf1 learns lb2's MAC on lb2's port and, in EVPN, advertises the new pairing to every other leaf.

Without it, acme-web1 sends to a dead MAC until its entry falls to FAILED, under a minute, and a router with a 4-hour entry could black-hole the address far longer. A policy that drops gratuitous ARP turns a 4-second failover into an outage. The same unauthenticated mechanism is the tool of ARP spoofing. The signal: MAC moves, and in EVPN the MAC mobility sequence number rising.

Proxy ARP is a router answering for an address that is not its own, with its own MAC, because it has a route there through another interface. Back to the slash 16 mistake. Without proxy ARP, nobody answers acme-web1's request for the database: FAILED after 3 seconds, while pings to the gateway work perfectly. With proxy ARP on leaf1, the leaf replies with the gateway MAC, and everything works.

Now the mistake is invisible. The server works for years, then a migration disables proxy ARP, which most data centre platforms ship off, and the server loses everything outside its slash 24. The giveaway was in its cache all along: dozens of IPs mapped to one MAC, the gateway's.

EVPN's ARP suppression is a relative, not the same thing: the leaf answers for a host on the same subnet behind another leaf, such as acme-web2 in Singapore, with that host's real MAC, so the broadcast never crosses the fabric.

## IPv6 neighbour discovery

IPv6 has no ARP. Neighbour discovery uses ICMPv6 messages: router solicitation and advertisement, neighbour solicitation and advertisement, which are ARP's request and reply, and redirect. Three choices differ.

First, multicast instead of broadcast. A solicitation goes to a solicited-node group built from the last 24 bits of the address being asked for, which network cards filter in hardware, so typically only the owner is interrupted. Dropping broadcast was a choice, made for exactly that.

Second, the gateway comes from routers: a host takes a router advertisement's source, a link-local address, as its default gateway, with a router lifetime that defaults to 1,800 seconds.

Third, a hop check: messages must arrive with hop limit 255, which only a sender on the same link can produce, so forgeries from elsewhere are discarded.

It breaks its own ways: multicast snooping dropping solicitations, so IPv6 fails while IPv4 works on the same port; rogue router advertisements, which RA guard filters; and a scan of a slash 64 filling a router's neighbour cache with INCOMPLETE entries.

## Can't ping the gateway

The gateway is one hop away, so the fault is on that hop: the server, its cable, its port, the VLAN or the gateway interface. Answering with IS-IS, BGP or the spines is the most common way to fail it.

One, scope: can other servers in VLAN 100 ping 10.1.1.1? If they can, it is this server or its port; if none can, it is the gateway or the VLAN on the leaf. Two, layer 1: link up at the expected speed, the port not error-disabled, and LLDP confirming the cable lands where the documentation says. Three, host configuration: address, mask, a gateway inside the subnet, on the interface actually cabled.

Four, the pivot: the gateway's neighbour entry. INCOMPLETE then FAILED means requests left and no reply came back: layer 2 or the gateway, the port in the wrong VLAN, the server's MAC missing from the leaf's MAC table, the gateway interface missing, down or in the wrong VRF. REACHABLE with the anycast MAC means move up. REACHABLE with an unexpected MAC means a duplicate or spoofing.

Five, ARP resolves but ping fails. A ping to the gateway's own address goes to the switch's CPU, under control-plane policing, so check filters, then ping through the gateway, to the database. A gateway that forwards but ignores pings is fine. Six, only then, size: small pings work and a 9,000-byte unfragmentable one fails means an MTU mismatch.

When step four fails in the lesson, the leaf's MAC table shows the server's frames arriving, and the VLAN 100 interface is down: nobody owns 10.1.1.1.

The follow-up: the gateway is REACHABLE with the right MAC, yet ping to it fails. What now?

[pause]

Layer 2 and ARP work, so frames reach the gateway. What remains is a host firewall, a filter, or control-plane policing, so ping through the gateway to separate forwarding from the control plane. The common wrong answer is "clear the ARP cache", which removes the one piece of evidence that was healthy. It is honest to defer to the network team on the policing classes, and ask for their drop counters beside the failed probe.

## Recap

Four things. The host's first decision is a longest-prefix match on its own table, and the gateway's IP is only a key for finding a MAC. The neighbour cache is evidence: STALE is normal, and FAILED after 3 seconds, with unreachable from the server's own address, means nothing ever left. Gratuitous ARP makes failover take seconds, proxy ARP hides a wrong mask until it is removed, and an anycast gateway removes gateway failover. And "can't ping the gateway" is one hop walked up the layers, scope first, ARP as the pivot.

At your desk: the Python decision and ARP request, the field tables and capture, the two visualisations, the state machine, the checklist flowchart and evidence, the trade-offs and tunables, and the IP-in-subnet problem.

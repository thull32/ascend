---
lesson: transport-as-the-network-sees-it
source: 4d82670396f3d5e4
fit: partial
desk:
  - "The TCP and UDP header tables, field by field, with who in the network reads each field"
  - "The ECMP hash visualisation and the header-parsing code: three connections, three fragments, and the misrouted ICMP"
  - "The fast retransmit visualisation"
  - "The fragmentation table, fragment by fragment"
  - "The path-MTU black hole visualisation, ending in MSS clamping"
  - "The MTU budget and path-MTU probing code with its output"
  - "The table comparing the five fixes, and the RoCEv2 header table"
  - "The table comparing VXLAN, RoCEv2 and QUIC"
  - "Practice problem: a flow table with idle timeouts"
---
## Introduction

Acme's nightly backup from acme-web1 to its cloud region connects, logs "upload started", then moves no bytes for fifteen minutes and fails with a timeout. Ping works. TLS worked. Small API calls to the same address work. The cause is a 50-byte difference between two numbers, and an ICMP message a firewall threw away.

Routers forward on the IP header, but the network also reaches into TCP and UDP in three ways. It hashes their fields to spread flows over paths, it tracks them in firewalls and NAT, and it limits their size with the MTU, which tunnels make smaller. Those three, then why the fabric's tunnels all ride on UDP.

## Ports and the five-tuple

The transport layer adds a second address to IP's: the port, a 16-bit number naming one socket on a host. Servers listen on well-known ports, 443 for HTTPS, 179 for BGP; a client gets an ephemeral one from its kernel. The IP header's protocol field says what follows: 6 for TCP, 17 for UDP, 1 for ICMP, the channel routers use to report errors back to a sender.

Five fields name one conversation: source IP, destination IP, protocol, source port, destination port. That is the five-tuple, and the packets that share one are a flow. Three database connections from acme-web1 differ only in source port, and to the network they are three unrelated flows.

The first reason the network cares is ECMP, equal-cost multipath. leaf1.ams has four equal uplinks, one per spine. Spraying packets round-robin would wreck TCP: packets crossing queues of different depths arrive out of order, and the sender reads the duplicate acknowledgements as loss and slows down. So the switch hashes the five-tuple and takes it modulo the number of links. Every packet of a flow takes the same link and stays in order, and over thousands of flows the load evens out. But it balances flows, not bytes, and needs entropy, many distinct tuples, which tunnels and AI traffic lack.

Before I go on: which packets have no ports where the hash looks for them?

[pause]

Three kinds. Non-first IPv4 fragments, because only the first piece carries the TCP or UDP header. Protocols without ports, like GRE, so a GRE tunnel between two routers takes one link however many flows ride in it. And ICMP errors: a "too big" message is a new packet from a router, with the offending header quoted inside, where the hash does not look. Where several servers share one address behind ECMP, which is anycast, that ICMP can land on a server that never heard of the connection.

The second reason is stateful firewalls and NAT. A stateful firewall allows a reply only if it saw the connection start, and its table is keyed by the five-tuple: a SYN creates an entry, the reply matches it mirrored, and a FIN, a reset or an idle timeout removes it. It breaks three ways. Asymmetric routing, where the reply returns through a firewall that never saw the SYN. A full table, where new connections fail at random while existing ones carry on. And idle timeouts: many firewalls and cloud NAT gateways forget idle TCP within minutes, so a quiet database connection's next packet is dropped.

## TCP as the network sees it

The network never acknowledges or retransmits. It forwards, queues, drops and marks, and TCP is the endpoints reacting to that.

The handshake is where the network decides. A firewall creates its entry, a load balancer picks a backend, and each side announces options that are never sent again. A silently filtered SYN is retried after 1, 2, 4, 8, 16 and 32 seconds, so the connect fails after about 127 seconds. A firewall that rejects sends a reset, and the client fails in one round trip.

Windows are why distance caps a single flow. A sender may have at most one window of unacknowledged bytes in flight, so one flow's throughput is the window divided by the round-trip time, whatever the link speed. Amsterdam to Singapore is about 10,500 kilometres of fibre, a round trip of at least 105 milliseconds. Filling 10 gigabits per second needs about 131 megabytes in flight, the bandwidth-delay product. Linux's default maximum receive buffer is about 6 megabytes, so one flow manages about 480 megabits per second. "The Singapore circuit is slow" is often a host buffer setting, not the network.

Only the endpoints learn of a drop. Fast retransmit resends a hole after three duplicate acknowledgements. When the tail of a burst is lost, no duplicates come back; Linux sends a probe after about two round trips, and if that fails too, it waits for its retransmission timeout, at least 200 milliseconds. Here is the number to remember: inside a site the round trip is tens of microseconds, so 200 milliseconds is ten thousand round trips of idleness. A small request whose packet is dropped takes over 200 milliseconds instead of 50 microseconds, and it shows in the application's 99th percentile, not in any network graph.

Last, the maximum segment size, the MSS: the largest TCP payload a host will accept, announced in its SYN as its interface MTU minus 40 bytes of headers. 1,460 on a 1,500-byte link. Neither side knows the links in between. It is TCP's only size hint, and the one TCP field routers rewrite. Hold that thought.

## MTU and fragmentation

The MTU, maximum transmission unit, is the largest IP packet an interface sends, not counting the Ethernet header. Standard Ethernet, and so the internet, carries 1,500 bytes. Fabrics run 9,216 so tunnels have headroom, because VXLAN adds 50 bytes.

A packet bigger than the next link's MTU meets one of three fates. If it is IPv4 with the don't-fragment bit, DF, clear, the router fragments it. If DF is set, or it is IPv6, the router drops it and sends back ICMP "fragmentation needed", carrying the next link's MTU. Or it is dropped silently: a layer-2 device, such as a switch inside a carrier's circuit, has no IP address on the path and cannot send ICMP, so it counts a giant frame and discards it.

Fragmentation, in one example. A 3,000-byte IPv4 packet of UDP meets a 1,500-byte link and becomes three fragments, and only the first carries the UDP header. Only the destination reassembles. So lose one fragment and the whole packet is gone: at 1 percent loss, a three-fragment packet dies about 3 percent of the time. The later fragments have no ports, so port-based firewall rules cannot match them, and many firewalls drop them. A 2020 RFC is titled "IP Fragmentation Considered Fragile". TCP has avoided it since 1990, by discovering the path MTU.

## The black hole

In path-MTU discovery, the sender sets DF; Linux does on all TCP. A router whose next link is too small drops the packet and returns "fragmentation needed" with the MTU, and the sender shrinks its segments and retransmits at once. The weak point: that correction comes from a router the sender has never heard of, and it must survive every filter on the way back, because nothing else in TCP will ever lower the segment size.

Now the backup, as it happened. acme-web1, MTU 1,500, connects to acme-cloud1 on port 443. The fabric runs 9,216, but gw1.ams reaches the cloud through a VXLAN tunnel across the internet: 1,500 minus 50, a tunnel MTU of 1,450. Both SYNs advertise a segment size of 1,460. The small handshake packets cross fine. Then the upload sends its first full segment: a 1,500-byte packet with DF set.

gw1.ams may not fragment it. It drops it and sends "fragmentation needed, MTU 1,450" back towards acme-web1. But acme-web1's host firewall, as hardening, drops every inbound ICMP except the echo replies that keep ping working. So TCP retransmits the same segment, its timeout doubling from 200 milliseconds. Every copy dies at the gateway, every ICMP dies at the host, and after about 15 minutes Linux gives up. That is the opening's timeout.

The signature: connects, then hangs on the first large transfer. Ping works because a default ping is 84 bytes. So test at full size with DF set: a ping that makes a 1,500-byte packet fails, and one that makes 1,450 succeeds. If a capture on the sender shows the ICMP arriving, its own firewall is discarding it. Elsewhere it dies at edge ACLs, at a router's rate limiter, or at the wrong anycast server.

Before the fixes: which one repairs this without anyone else changing anything?

[pause]

MSS clamping. The tunnel edge rewrites the segment size in every SYN it forwards, down to the tunnel MTU minus 40, so 1,410, and now 1,450-byte packets flow with no ICMP at all. It is cheap and local to the box that created the problem. But only TCP has an MSS, and only connections whose handshake crossed the box are protected. Allowing the ICMP fixes every protocol, but depends on every filter on every return path. Probing, called packetization-layer path-MTU discovery, stops trusting ICMP: the sender tries larger packets and treats a lost probe as "too big". It is off by default in Linux; QUIC does its own version. Raising the underlay MTU works only where you own every link.

Inside the fabric the check is arithmetic. VXLAN over IPv4 adds 50 bytes: outer IP 20, UDP 8, VXLAN 8, and the tenant's 14-byte Ethernet header. Over IPv6 it is 70. Host MTU plus overhead must fit the smallest link. So a tenant at 9,000 crossing an inter-site circuit sold as "9,000-byte jumbo" is too big by 50, and loses every full-size packet on that circuit only.

## UDP as the carrier for tunnels

VXLAN in the overlay, RoCEv2 in AI back-ends and QUIC on the internet are all built on UDP. It adds 8 bytes and no state, every router, firewall, NAT and ASIC already handles it at line rate, and its source port is the sender's to choose, the natural place for ECMP entropy.

VXLAN goes to port 4789, wrapping the tenant's whole Ethernet frame towards the remote leaf's loopback. Its source port is a hash of the inner headers, so each inner flow gets its own outer five-tuple and its own spine. Fix that source port, and every flow between two leaves collapses onto one spine.

RoCEv2 goes to port 4791. It carries RDMA, a NIC writing into another machine's memory with neither kernel touching the data, over UDP so it can be routed. Three things matter to the network. The RDMA MTU, usually 4,096 bytes, is fixed at setup and nothing runs path-MTU discovery, so every link must fit it, and AI fabrics run about 9,000 or more everywhere. A queue pair, one RDMA connection, is one five-tuple, and a GPU's traffic rides a handful of them carrying gigabytes each, so the hash has few flows to spread and they collide. And RoCE NICs classically resend from the lost packet onward, so one drop costs a stall. Hence lossless Ethernet, a later module.

QUIC goes to port 443 and rebuilds TCP plus TLS over UDP, encrypting nearly everything, acknowledgements included. Monitoring built on TCP headers goes blind. It has no MSS to clamp; it requires 1,200-byte datagrams and probes upward itself. And its five-tuple can change mid-connection, when a phone moves from Wi-Fi to cellular, so a load balancer routing on addresses and ports sends it to a different backend.

Three tunnels, one source port: entropy for VXLAN, too little for RoCE, a moving target for QUIC.

## In the interview

A platform should show MTU per link as intent, giant counters, retransmits per destination and conntrack tables against their maximums. And it should send full-size DF probes between tunnel endpoints, because small probes stay green through every failure here.

Now the classic question. "SSH logs in fine, then hangs as soon as a command prints a lot. What is happening?"

[pause]

Size-dependent loss. Login packets are small; the first full-size segments are dropped. Most likely a path-MTU black hole: a tunnel or smaller link on the path, its ICMP filtered on the way back. Confirm with full-size DF pings; fix it with MSS clamping at the tunnel edge and by allowing that ICMP. The common wrong answer is "the server is overloaded".

A second one: "the fabric is 9,216 everywhere. Where can MTU still bite?" At edges you don't own, like carrier circuits and cloud interconnects; tunnels inside tunnels; and one link set wrong because vendors count headers differently. The wrong answer is that jumbo frames everywhere mean MTU can't be a problem.

## Recap

The five-tuple names a flow, and ECMP, firewalls and NAT all key on it. It cannot see non-first fragments, port-less protocols or ICMP errors.

One TCP flow moves one window per round trip. Across 105 milliseconds, default buffers cap it near half a gigabit.

"Connects, then hangs on large transfers" is size-dependent loss. Test with full-size DF pings, never a default ping.

Choose fixes by scope. MSS clamping repairs TCP at one box, allowing ICMP repairs everything but depends on others, and probing needs no ICMP. Budget VXLAN at 50 bytes over IPv4 and 70 over IPv6, against the smallest link.

At your desk: the header and comparison tables, the three visualisations, the parsing, budget and probing code, and the flow table practice problem.

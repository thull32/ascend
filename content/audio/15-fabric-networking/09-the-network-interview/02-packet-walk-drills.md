---
lesson: packet-walk-drills
source: b7350cc55c16ad14
fit: great
desk:
  - "The layer table: what is read at each layer, the table it is looked up in, and the test you name"
  - "The laptop walk's time budget, step by step"
  - "The VXLAN header stack as the spine receives it, and the VXLAN encapsulation visualisation"
  - "The gateway symptom table and the ARP no-reply visualisation"
  - "The latency simulation and its output, the delay arithmetic table, and the probe localisation visualisation"
  - "The IS-IS adjacency symptom table, both ends and the counter that rises"
  - "The two-ISP traffic engineering visualisation"
  - "The six mechanisms table, the answer shapes table, and what the platform should show"
  - "Practice problems: IP in subnet, and longest-prefix match"
---
## Introduction

"A laptop opens a website." "Server one can't ping its gateway." "Latency went from 10 to 50 milliseconds." A packet-walk question is a structure test dressed as a knowledge test. The interviewer listens for three things. Do you place every step at a layer, and know which device reads which header there? Do you start with scope instead of a command? And at the edge of what you know, do you say so and turn to what you would measure?

Most wrong answers come from knowing the facts and putting them at the wrong layer: BGP at every hop, IS-IS in a one-hop ping failure, MED across two ISPs. Six drills follow, on the Meridian fabric, each with the model answer as you would speak it and the slips interviewers listen for. First, the habit they all rest on.

## Naming the layer

Say the layer before you say the step. Each layer has its own reader, table and test, so the layer tells the interviewer which box and which table you mean. Layer 1 is the signal: is the link up, and are bits arriving intact? Damage shows one layer higher, as frames failing the frame check. Layer 2 reads the destination MAC and VLAN, in the switch's MAC table and the host's ARP cache. Layer 3 reads the destination IP and the TTL, in the FIB by longest-prefix match. Layer 4 reads ports and flags, against connection state on hosts, NAT and firewalls.

The second axis is control plane versus data plane. IS-IS, BGP and EVPN run between routers ahead of time and fill those tables. No packet passes through them; the packet only meets the tables they built.

Every walk then has one skeleton. Scope first: one host or many, one site or several, since when, what changed. One user means local; everyone means real. Walk the layers in the order the packet meets them. At each step, say how it breaks and which signal shows it. Offer depth on one segment. And close with what you would build or measure, which from a software engineer is the strongest ending.

## The laptop and the tunnel

Drill one: a new laptop joins the Wi-Fi and opens Meridian's website. Ten steps, about two minutes, out of the three you are usually given. The laptop associates and the WPA handshake derives keys: a link, no address. DHCP: Discover, Offer, Request, Ack, giving an address, mask, gateway and DNS server; a self-assigned 169.254 address is the signal that nothing answered. DNS over UDP 53 returns 203.0.113.10. ARP: that address is off the subnet, so the laptop needs the gateway's MAC, not the server's. The home router's NAT rewrites the source to its public address. Then routing: every router does a longest-prefix match, rewrites the MACs, keeps the IPs, decrements the TTL. BGP chose the path, through ISP2 into Meridian's AS 64500, ahead of time, and is not consulted per packet. Then TCP, TLS 1.3, HTTP: three round trips after DNS before the first byte of HTML. Close with an offer to go deeper on routing.

Budget it, or the answer runs out on DNS: about 40 seconds go to routing, the part a network organisation is hiring for. If they take the offer, say this sentence: inside Meridian, BGP's routes are used once, at the edge that chooses the exit or builds the tunnel; every transit device forwards on underlay routes from IS-IS. The slips: every router running BGP, the first frame addressed to the server's MAC, TLS before TCP, and skipping NAT.

Drill two: a packet across your EVPN fabric. Acme's web1, 10.1.1.10 behind leaf1 in Amsterdam, sends to web2, 10.1.1.11 behind leaf2 in Singapore. Same subnet, VLAN 100, carried as VNI 10100, the segment number inside the tunnel. Web1 ARPs, and leaf1 answers from its ARP-suppression table, which EVPN filled. At leaf1, the ingress VTEP, the MAC table says web2 sits behind VTEP 10.255.2.12, learned from a type-2 route through the reflectors. Leaf1 wraps the frame: 8 bytes of VXLAN, 8 of UDP to port 4789 with a source port hashed from the inner flow, 20 of outer IP, 14 of outer Ethernet. 50 bytes. The spines read only the outer destination, a loopback IS-IS knows, and never see Acme's addresses. Leaf2 strips the 50 bytes and switches the frame out. EVPN was used once, at the ingress leaf.

Routed to another subnet, with symmetric IRB, the ingress leaf routes in Acme's VRF, inner TTL 63, sends it in L3VNI 50001, and the egress leaf routes again, 62. The spines behave identically. The slips: spines running EVPN, which would recreate the BGP black hole; VXLAN over TCP; a random source port per packet, when it is a flow hash that keeps packets in order; and forgetting the 50 bytes, so one link left at 1,500 drops every full-size tunnelled packet while small pings pass.

## The gateway that won't answer

Drill three: server one can't ping its default gateway. The gateway is one hop away, so no IS-IS, no BGP and no spine is involved. Say that.

Scope: this server or every server in the VLAN? If others reach the gateway, it is this server or its port. Then go up. Layer 1: link up, and LLDP showing the expected leaf and port. Host config: right address, right mask; a slash 30 on 10.1.1.10 leaves the gateway outside the subnet. Layer 2 is the pivot. A neighbour entry going incomplete then failed means requests leave and nothing returns: the port's VLAN, the MAC table, a missing gateway interface. An unexpected MAC means a duplicate IP.

Now: ARP resolves to the anycast gateway MAC, and the ping still fails. Is the gateway down?

[pause]

No. Layer 2 works, so it is policy. A ping to the gateway itself is punted to the leaf's CPU, and control-plane policing may drop it while the leaf forwards perfectly. So ping through the gateway, to another subnet. Last, size: small pings fine and large don't-fragment pings failing is an MTU mismatch. The order works because each step can only pass once the one below does, so the first test that fails names the layer. The slips: opening with IS-IS or the BGP summary, and calling the gateway down when ARP resolves.

## When latency jumps

Drill four: a customer's latency went from 10 to 50 milliseconds across the fabric. How do you find the cause among tens of thousands of links? Ask first what the 50 is: median or 99th percentile, for which flows, since when. Then prune with numbers.

Inside one site the round trip is tens of microseconds. Forty milliseconds is too much for queueing: a full 32-megabyte buffer at 100 gigabits per second drains in about 2.6 milliseconds, across three switches. It is too little for a detour: at 5 microseconds per kilometre one way, it needs 4,000 more kilometres, and Amsterdam to Singapore adds over 100 milliseconds. What fits is TCP recovering from loss, at least 200 milliseconds per timeout, or the host: Nagle's algorithm meeting a delayed acknowledgement costs exactly 40.

The distribution names the layer. In the lesson's simulation, a host fault moves every percentile by 40, equally on every spine: leave the fabric. One lossy link behind spine3 leaves the median at 10, sends the 99th percentile to about 210, and lifts the mean only to 17; grouped by spine, it is all spine3. Half-full queues everywhere move things under 4 milliseconds.

Then the hunt. One ping shows no loss, because ICMP has no ports and takes one path of four. TWAMP Light probes with 16 source ports spread over every spine, and only the three streams through spine3 lose about 4 percent, while round trips hold at 61 microseconds. A second leaf pair narrows it to one link, with 3.9 percent of frames failing the frame check on a weak optic lane. Costing it out clears every stream. The customer's latency was TCP recovering from loss. The slips: counters without a method, ping as proof, and blaming congestion without the buffer arithmetic.

## Adjacency down, and two ISPs

Drill five: an IS-IS adjacency went down. Scope: one adjacency is the link or the two ends' configuration; every adjacency on a router is the router; many routers at once is one change. For one, check both ends, bottom-up. The interface and LLDP. Then MTU: IS-IS pads hellos to the interface MTU, so the big end sits in Initializing while the small end shows nothing and counts oversize frames. Authentication: both ends Down with auth-failure counters. Level, then duplicate system ID. Timers last, because in IS-IS they need not match: each hello carries its own hold time. Then what went with it: a leaf that lost every adjacency lost its loopback, BGP sessions and tunnels. The slips: the BGP summary, which is a consequence; "timers must match", true in OSPF only; and checking one end.

Drill six: two ISPs, prefer ISP1 both ways, fail over to ISP2. Outbound, Meridian decides. Inbound, other networks decide. Egress: local preference 200 on ISP1's routes, compared before path length, so everyone exits via ISP1 until those routes are withdrawn. Ingress you influence, weakest to strongest. Prepending towards ISP2 loses inside ISP2, which prefers customer routes by local preference first, so add ISP2's community that lowers it. Strongest, more-specifics: two halves only to ISP1, the aggregate to both, so longest-prefix match pulls traffic to ISP1 and the aggregate carries it when ISP1 goes. Most networks drop IPv4 routes longer than a slash 24, so in practice that is two slash 24s out of a slash 23. MED doesn't help; it compares paths from one neighbouring AS. A failure that keeps the light on waits for the hold timer, 90 seconds as the standard suggests; BFD at 300 milliseconds times three cuts it to about 0.9 seconds. The slips: MED, "prepending guarantees it", and saying control for ingress.

## In the interview

Pick an answer shape deliberately. Breadth first, every step with its layer; depth after, on the segment the interviewer picks; and "I'd defer on that detail, here is what I'd measure" only after showing what you know. That measurement is your job: each drill needs a view answering it in seconds, like latency distributions grouped by path, median and tail side by side.

A follow-up the lesson expects: why does the inner TTL not drop at the spines?

[pause]

The spines never read the inner header; they decrement the outer TTL. The inner TTL drops only where the inner packet is routed: never within a subnet, once at each leaf with symmetric IRB. That is why a traceroute between subnets shows two leaves and no spines. The wrong answer: VXLAN copies the TTL across.

And another. Your probes between the two leaves show no loss and no change in delay, but the customer still says it is slow. Now what?

[pause]

The probes cover the fabric between two agents, not the customer's hosts. So collect on the customer's side: socket statistics on a slow connection for its round trip and retransmits, and a capture at both ends. A 40-millisecond gap before each acknowledgement points at Nagle and delayed ACK, which the no-delay socket option fixes. Hand back the per-path probe data as evidence, not as a verdict. The wrong answer: the network is clean, close the ticket.

## Recap

Five things to remember. Say the layer before the step, and keep IS-IS, BGP and EVPN in the control plane. Open every troubleshooting walk with scope. Prune with numbers: 5 microseconds per kilometre, a buffer draining in 2.6 milliseconds, a 200-millisecond timeout, a 40-millisecond delayed ACK, 50 bytes of VXLAN. Ask which statistic moved: a median shift points at hosts, a tail explosion at a path. And check both ends, say influence for inbound, and close with what you would measure.

At your desk: the layer table, the laptop time budget, the VXLAN header stack, the gateway and adjacency symptom tables, the latency simulation, the four visualisations, the summary tables, and the practice problems.

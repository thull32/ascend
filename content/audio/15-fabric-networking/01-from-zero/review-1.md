---
review: from-zero
source: a8fb16d2207b9a79
---
## Introduction

Twelve questions from the from-zero module of the fabric networking track. Answer out loud before the answer comes.

This is the first of two sets, and it covers the first four lessons in order: links and the Ethernet frame, switches, VLANs and loops, IP addressing and subnets, and the routing table. Each question has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A full-size frame of 1,518 bytes crosses 100 metres of fibre between two switches connected at 400 gigabits per second. On an idle link, which delay is largest for this one frame?

A, queueing, about 1 microsecond, because every frame waits in a buffer. B, propagation, about 500 nanoseconds, set by the length of the fibre. C, serialisation, about 31 nanoseconds, because the frame is full size. D, serialisation, about 120 nanoseconds, because of preamble and FEC overhead.

[think]

The answer is B: propagation, about 500 nanoseconds, set by the length of the fibre.

Light in fibre covers about 5 nanoseconds per metre, so 100 metres costs about 500 nanoseconds at any link speed. Serialising the frame at 400 gigabits takes just under 31 nanoseconds; the 120 nanosecond figure is the time at 100 gigabits. On an idle link there is no queueing. That is why a faster link barely changes latency inside a site, and not at all across sites.

## Question 2

A server is set to an MTU of 9,000 and its leaf port to 1,500. What happens?

A, every frame is fragmented by the leaf, so throughput falls slightly. B, the two ends negotiate down to 1,500 when the link comes up. C, large frames are dropped as oversize at the leaf, and small ones pass. D, the link stays operationally down until the MTUs are made equal.

[think]

The answer is C: large frames are dropped as oversize at the leaf, and small ones pass.

Ethernet does not negotiate MTU, and the link comes up normally. The leaf drops frames above its limit and counts them as oversize, or giants, with no message to the sender, so small pings and short requests work while large transfers hang. A switch does not fragment Ethernet frames, and routers fragment only IPv4 packets without the don't-fragment bit.

## Question 3

A 400 gigabit leaf-spine link reports 390 gigabits per second out and 50 in over the last minute. What should a tool conclude?

A, the link is at 55 percent overall and has plenty of headroom left. B, the link is at 110 percent of its rating, so the counters are wrong. C, the outbound direction is near saturation, and inbound is not. D, both directions share 400 gigabits, so the link is at 440.

[think]

The answer is C: the outbound direction is near saturation, and inbound is not.

Data center links are full duplex: two independent 400 gigabit channels. Outbound at 390 is 97.5 percent utilised and probably dropping during bursts, while inbound has capacity to spare. Adding or averaging the two directions hides exactly this case.

## Question 4

The peer link between an MLAG pair of switches fails, while the keepalive over the management network still works. What should happen?

A, the secondary shuts its MLAG ports, so dual-attached servers use the primary. B, the servers' bonds go down, since LACP now hears two different partners. C, both switches keep forwarding, since each still has a link to every server. D, spanning tree blocks one server link, since the pair now forms a loop.

[think]

The answer is A: the secondary shuts its MLAG ports, so dual-attached servers use the primary.

The keepalive tells the secondary that its peer is alive, so the problem is the peer link, not the peer. Without that link the two switches can no longer synchronise MAC tables or suppress duplicate floods, so the secondary steps aside; each server's bond loses one member but stays up, because the primary still sends the shared system ID. Both switches carrying on alone is split brain, which is what happens when the keepalive is lost as well.

## Question 5

After a routing change, return traffic to a server comes through a router whose ARP entry for the server is three hours old, while the server's outgoing traffic leaves through another router. Unrelated servers in the VLAN start receiving gigabits of frames not addressed to them. What is the most likely cause?

A, a native VLAN mismatch bridging two VLANs on one trunk. B, the switch aged out the silent MAC, so it floods each frame. C, a MAC flooding attack filling the switch's table with random MACs. D, a layer-2 loop circulating the server's broadcasts.

[think]

The answer is B: the switch aged out the silent MAC, so it floods each frame.

The router keeps ARP entries for hours and keeps sending unicast frames to the server's MAC, but the switch hears nothing from the server on that path and ages the MAC out after 300 seconds, so every frame for it becomes unknown unicast and is flooded. A loop would show MAC flaps and multiplying broadcasts, not steady unicast to one MAC. The fix is an ARP timeout no longer than the MAC aging time, so the router re-ARPs and the reply re-teaches the switch, or symmetric routing.

## Question 6

Why does a layer-2 loop take down a network, when a layer-3 routing loop usually does not?

A, switches forward frames more slowly than routers forward packets. B, spanning tree turns every redundant link off, which isolates hosts. C, broadcast frames are much larger than the IP packets in a loop. D, Ethernet frames have no TTL, so flooded copies circle and multiply.

[think]

The answer is D: Ethernet frames have no TTL, so flooded copies circle and multiply.

IP packets carry a TTL that each router decrements, so a looping packet dies after at most 255 hops and the damage is bounded. Ethernet has no hop count, and switches flood broadcasts out of every port, so the copies live forever and each new broadcast adds more, until links fill and switch CPUs starve. Spanning tree is the cure, not the cause, and frame size or switch speed has nothing to do with it.

## Question 7

Leaf1 in Amsterdam runs its iBGP session to the route reflector rr1 from its loopback, 10 dot 255 dot 1 dot 11, rather than from its uplink address, 10 dot 254 dot 1 dot 1. What does that buy?

A, the session gets a shorter hold timer by default. B, the session survives the loss of any one uplink. C, the session can skip the TCP handshake on port 179. D, the session needs no underlay route to the reflector.

[think]

The answer is B: the session survives the loss of any one uplink.

The uplink address lives on one interface and disappears when that link fails, taking the TCP connection and every overlay route with it, although three other uplinks still work. The loopback is reachable through any working spine, so the underlay reroutes and the session never notices. It still needs an underlay route to the reflector and still rides TCP on port 179, and the hold timer is unrelated.

## Question 8

Why can a slash 31 be used on a link between two routers, when the usual formula gives zero usable hosts?

A, routers ignore the mask on links and use the MAC instead. B, a two-ended link needs no network or broadcast address. C, the slash 31 borrows a host bit from the router's loopback. D, the broadcast is moved into the next slash 31 in the block.

[think]

The answer is B: a two-ended link needs no network or broadcast address.

The network and broadcast addresses exist to name a shared segment and to reach everyone on it. A point-to-point link has exactly two ends, so RFC 3021 lets both addresses be hosts: Meridian gives the spine the even one and the leaf the odd one. Routers still use the mask, and nothing is borrowed from the loopback or from a neighbouring block.

## Question 9

Why is an IPv6 LAN with only three hosts still given a slash 64?

A, neighbour discovery broadcasts to the whole slash 64 at once. B, IPv6 routers cannot store prefixes longer than slash 64. C, a slash 64 is the smallest block a registry can allocate. D, SLAAC appends a 64 bit interface ID to a 64 bit prefix.

[think]

The answer is D: SLAAC appends a 64 bit interface ID to a 64 bit prefix.

Stateless autoconfiguration builds each address from the advertised 64 bit prefix plus a 64 bit interface ID, so a link with a longer prefix cannot autoconfigure. Routers carry longer prefixes routinely, such as slash 127 links and slash 128 loopbacks. IPv6 has no broadcast, neighbour discovery uses multicast, and registries allocate far larger blocks, such as a slash 32 or a slash 48.

## Question 10

leaf1 learns gw2's loopback, a slash 32, from IS-IS with two equal-cost next hops, and someone adds a static route for the same slash 32 via spine1 only. With Cisco or FRRouting defaults, what happens?

A, neither is installed until an operator picks one of them. B, the static wins on distance, and ECMP falls to spine1 alone. C, both are installed, giving three next hops in one group. D, IS-IS wins on its lower metric, and both next hops stay.

[think]

The answer is B: the static wins on distance, and ECMP falls to spine1 alone.

For one prefix from two sources, administrative distance decides first: the static's 1 beats IS-IS's 115. Metrics are compared only within one protocol, so the IS-IS metric is never weighed against the static. The router installs only the static's single next hop, so traffic towards gw2 crowds onto one uplink, and the static ignores any IS-IS drain of spine1.

## Question 11

show ip route on a leaf lists 203.0.113.0 slash 24 as selected, yet packets to it are dropped on that leaf, and syslog reports a hardware table error. What is the most likely explanation?

A, the ECMP hash sends those flows to a member that has no MAC. B, the route lost on administrative distance after it was selected. C, the route is in the RIB but was never programmed into the FIB. D, the BGP session that taught the route has moved to Active.

[think]

The answer is C: the route is in the RIB but was never programmed into the FIB.

show ip route displays the RIB, the control plane's choice. The chip forwards from the FIB, and if the hardware table is full or programming failed, the route never reaches it, so traffic is dropped or punted while the RIB looks correct. A session in Active would have withdrawn the route from the RIB, and distance is settled before a route is shown as selected.

## Question 12

Why does a TCAM used for longest-prefix match store its entries sorted from the longest prefix to the shortest?

A, sorting lets it binary-search the rows in about log n steps. B, longer prefixes need fewer don't-care bits to be compared. C, its priority encoder returns the lowest-numbered matching row. D, the chip searches rows one by one and stops at the first hit.

[think]

The answer is C: its priority encoder returns the lowest-numbered matching row.

Every TCAM row compares against the key in parallel in the same cycle, and when several match, the priority encoder reports the lowest index. Placing longer prefixes first makes that first match the longest one. The search is not sequential and not a binary search; the ordering exists only for the encoder, and keeping it on every insert is why TCAM updates may move many entries.

## Recap

Three ideas kept coming back. Ethernet does not negotiate or complain: a mismatched MTU drops big frames silently, a forgotten MAC turns into flooding, and a frame with no TTL can circle forever. Addresses are chosen for what they have to do: a loopback outlives any one link, a slash 31 needs no broadcast, and a slash 64 exists because autoconfiguration needs one. And the route you see is not always the route that forwards: administrative distance decides before any metric, the RIB is only the control plane's choice, and the chip forwards from the FIB, whose TCAM finds the longest match by the order of its rows.

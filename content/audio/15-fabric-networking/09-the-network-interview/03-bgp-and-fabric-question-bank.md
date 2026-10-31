---
lesson: bgp-and-fabric-question-bank
source: c6c2959dbd65bda9
fit: great
desk:
  - "The follow-up ladder diagram"
  - "The attributes table: category, who sets each one, how far it travels, what it decides"
  - "The best-path and route-reflector visualisations"
  - "The underlay comparison table and the VXLAN, MPLS and SRv6 overhead table"
  - "The BFD convergence and DCQCN incast visualisations"
  - "The lightning-round table"
  - "The numbers script and its output"
  - "The failure-modes table, where each mechanism runs, and what the platform should show"
  - "Practice problem: BGP best path"
---
## Introduction

"Walk me through the BGP states." "Why IS-IS and not eBGP?" "What happens if both route reflectors die?" A principal network engineer asks fifteen or twenty of these in half an hour, digging one level down into each answer. The round tests whether you hold the mechanism or only the vocabulary, because vocabulary alone builds the dashboard that stays green during an outage.

Every answer has four beats: the claim, answering the question as asked; the mechanism, meaning what is on the wire, which table, which timer; one number, which shows you have watched it run; and how it breaks, with the signal that shows it. That is 60 to 90 words, about 30 seconds. Then stop.

Take "what is a route reflector?" The mechanism answer: inside one AS the AS path never changes, so it cannot catch loops, and iBGP never passes a route learned from one iBGP peer to another. So every router needs a session to every other: 120 for Amsterdam's 16 leaves. A reflector may relay routes for its clients, which brings that to 33 with a pair. It stamps an originator ID and a cluster list to close the loops relaying opens, and sits beside the spines, out of the forwarding path. That pre-empts the next three follow-ups.

Expect three rungs per question, usually "what breaks?" then "how would you know?". Keep the honest defer, "I'd defer to the network team on that, but here is what I'd measure", for the third rung, never a first answer. Nine groups follow, on Meridian.

## Sessions and attributes

First, the BGP states, each named by what is on the wire. Idle: not trying. Connect: a SYN is in flight to TCP port 179. Active: that attempt failed, so there is no TCP connection; the router listens and retries, and despite the name nothing is exchanged. OpenSent: TCP is up, and my OPEN, with AS, hold time, router ID and capabilities, has gone out. OpenConfirm: I accepted yours, and wait for the keepalive saying you accepted mine. Established: updates flow, and each update or keepalive received restarts the hold timer, 9 seconds on Meridian's fabric.

The follow-up: it has been in Active for an hour. Does the peer's AS number matter yet?

[pause]

Not while TCP never completes, because the AS number travels in the OPEN. Scope first: one peer, or every peer on the box? Then TCP: a route to the peer's loopback, the right source address, a capture showing SYNs then a reset or silence, filters on port 179. But read the last NOTIFICATION: a wrong peer AS lets TCP succeed, fails the OPEN, and loops back to Active. Next rung: Established, so healthy? Not necessarily. EVPN enabled on one end only leaves a session carrying no EVPN; check prefixes received against a baseline, and whether next hops resolve.

Second, attributes. The AS path lists the ASes crossed; each eBGP hop prepends its own, giving loop prevention and the length comparison. The next hop is where traffic goes; iBGP passes it unchanged, so the IGP must resolve it. Local preference is set by our import policy and carried to every router in our AS, never beyond: it is how we choose an exit. MED is a neighbour's hint about which of its entry points to use, compared only among that neighbour's routes.

The follow-up: an iBGP route is in the table but not used. Its next hop does not resolve. gw1.ams learns ISP1's routes with ISP1's address on the shared link as next hop, and passes them on unchanged; a leaf with no route to that link discards them at step one. The fix: next-hop-self, rewriting it to the gateway's loopback, or carrying the link subnet in IS-IS. The slip: "local preference is local to one router". That is weight, a vendor extension.

## Best path and reflectors

Third, best path: thirteen steps in four groups, stopping at the first that separates. Is the path usable: a resolving next hop, no AS loop? Our decisions: weight, local preference, routes we originate. What the path says: shortest AS path, lowest origin, lowest MED from the same neighbour. Our geometry: eBGP over iBGP, then lowest IGP cost to the next hop, which is hot-potato routing.

Say it on a case. gw1.ams has three paths to a content network. A: its own eBGP session to ISP1, three ASes long. B: iBGP from gw2.ams via ISP2, two ASes, IGP cost 20. C: iBGP from gw1.sin via ISP2, two ASes, cost 120 across the long-haul circuit. Which wins, and where?

[pause]

A falls at step five, three ASes against two. B and C tie through origin, MED and eBGP over iBGP, and B wins at step nine, IGP cost 20 against 120. So gw1.ams sends this traffic across the fabric to ISP2, and its own ISP1 link carries none of it. To send everything out through ISP1, set local preference 200 on ISP1's routes, on every gateway that peers with it: step three beats path length. Inbound you can only influence. And if A were as short as B, would its MED of 10 lose to B's 0? No: different neighbouring ASes, so MED is skipped, and A wins at step eight. The slip: "BGP picks the shortest path". The AS path counts networks, not kilometres.

Fourth, route reflectors: one fails, then both. One: nothing changes in forwarding. Every leaf already holds an identical copy of each route from the other reflector, same next hop, and no packet ever passed through a reflector. Both: within the 9-second hold time, or under a second with BFD, every leaf's reflector sessions drop and it deletes every overlay route learned over them. Tenant traffic between leaves stops while every spine and link is healthy. "Forwarding continues on the last known state" holds only until the hold timer fires.

Next rung: every client exits through the gateway nearest the reflector. The reflector advertises only its own best path, from its own IGP position; ADD-PATH, optimal route reflection or reflectors per site fix it. The signal: sessions per leaf, two expected, with an alarm when one reflector is lost, because a pair sharing a power feed or an upgrade window fails as one.

## Underlay and overlay choices

Fifth: why IS-IS and not eBGP for the underlay? Both work; the network decides. An eBGP-only fabric puts one protocol on every box: an AS per leaf, the spines sharing one. That gives per-hop policy and local failures, suiting one very large site run by one team. Meridian is three sites run as one domain, so IS-IS fits: every router holds the full map, a metric drains a device, no AS plan spans sites, and a BGP policy mistake cannot remove the loopbacks the overlay rides on.

The follow-up: why do all spines share one AS? So loop prevention rejects any path through two spines. No valley paths means no path hunting after a withdrawal, and equal-length paths through every spine let multipath install them all. Why not OSPF? IS-IS runs directly on layer 2, so a remote host cannot reach it, and new features arrived as new fields, where OSPF needed a new version for IPv6. And BGP is not too slow: with BFD it converges in about a second.

Sixth: MPLS or VXLAN? Same job, different wrapper. Both address the packet to the egress router's loopback, so transit never needs the customer's route: the fix for the BGP black hole. MPLS pushes 4-byte labels and brings traffic engineering and fast reroute, its small overhead suiting expensive long-haul circuits. VXLAN adds 50 bytes any IP fabric can carry, its UDP source port gives ECMP entropy, and a host's NIC can be the endpoint. Data centers mostly choose VXLAN with EVPN; backbones mostly MPLS.

The follow-up: why doesn't the spine need the tenant's route? It never reads it. The packet crosses addressed to leaf2.sin's loopback, which IS-IS resolves. BGP picks which leaf; the IGP gets the packet there. What does EVPN add? The control plane: routes saying where each MAC and IP lives and who wants broadcast traffic for a segment. The slip: "a label lookup beats an IP lookup". True of 1990s routers; today's ASICs do longest-prefix match at line rate.

## ECMP and BFD

Seventh, ECMP. The switch hashes each packet's 5-tuple, and the result picks one of the equal-cost next hops. A flow's packets share those five values, so a flow sticks to one path and stays in order. leaf1.ams spreads flows over four spines; lose one and 75 percent of capacity remains. ECMP balances flows, not bytes.

Three things go wrong. Elephants collide: four large flows on four uplinks all land apart only 9.4 percent of the time, and the busiest uplink carries about two. Polarisation: two tiers hashing identically, so the second only sees flows that already hashed alike. Gray failure: a member drops a fraction of packets while staying up, and keeps its share of flows. Why does VXLAN's outer source port vary? Between two leaves everything else in the outer header is constant, so the ingress VTEP derives the port from the inner flow to restore entropy. Why not spread per packet? Reordering: TCP reads three duplicate acknowledgements as loss, and RoCE's go-back-N discards everything after a gap.

Eighth, BFD. When the light goes out, the port goes down within milliseconds. BFD is for failures the port cannot see, like carrier equipment that keeps it lit after the fibre beyond is cut. Neighbours exchange small UDP packets every 300 milliseconds and declare the path down after three are missed: 900 milliseconds. Without it, IS-IS waits up to 30 seconds with 10-second hellos, and BGP up to 180 at common edge defaults.

The rest: two deliberate 50-millisecond waits, a few milliseconds of flooding and SPF, and about 15 to write the FIB. Cut to recovery: about one second and 5.1 gigabytes lost at 40 gigabits per second; without BFD, about 30 seconds and 150 gigabytes. Why not 10 milliseconds times three? A busy CPU misses its own packets and declares a healthy link dead; short timers need hardware, a fair place for the honest defer. The slip: "BFD reroutes traffic". It only detects; its client protocols act.

## RoCE congestion

Ninth: how does RoCE handle congestion? Its transport runs in the NIC with go-back-N, so one drop resends everything after it, and the fabric is built not to drop. When a switch queue passes a threshold, the switch marks the packet's ECN bits instead of dropping it. The receiving NIC answers with a congestion notification packet, at most one per queue pair every 50 microseconds or so, and the sender's DCQCN algorithm cuts that flow's rate, then climbs back. PFC is the backstop: a switch about to overflow pauses one priority on its upstream neighbour.

On rail1-leaf1 in San Jose, srv1 sends to srv3 at 400 gigabits per second. At 20 microseconds srv2 joins at line rate, since DCQCN has no slow start. The queue grows 50 kilobytes a microsecond and passes the 200-kilobyte mark-everything threshold 4 microseconds later. Both senders halve twice, 400, 200, 100; the queue drains by 97 microseconds; fast recovery brings each back to about 197 by 354.

The follow-up: isn't PFC enough? No: it is flow control, not congestion control. It stops a link, not the source. Pauses spread hop by hop and halt every flow on that priority, even ones headed nowhere near the congestion. A NIC that stops draining can pause a whole fabric until the watchdog breaks it. So many pauses with almost no ECN marks is a problem even with zero drops. What would you monitor? Both halves: ECN marks, pauses and watchdog events on the switches; notifications handled and out-of-sequence packets on the NICs; and the job's step time.

## In the interview

Between deep questions come one-liners with traps. Hold times of 9 and 90 negotiate to 9. Default local preference is 100, and higher wins. A 1,500-byte tenant packet needs a 1,550-byte underlay IP MTU.

Then the big one: a spine dies. What does every protocol do?

[pause]

The ports facing it lose light, or BFD declares it down within 900 milliseconds. IS-IS drops those adjacencies, floods and runs SPF, and every leaf drops the spine from its ECMP groups: 75 percent of capacity remains. The overlay notices nothing, because its next hops are leaf loopbacks still reachable through the other spines. The wrong answer: "BGP reconverges and traffic stops until it does."

## Recap

Five things to remember. Answer in four beats, claim, mechanism, number, signal, and stop. Name mechanisms by what is on the wire: Active means no TCP, and the reflector leaves the next hop unchanged. Derive numbers in the room: 120 sessions against 33, three quarters of capacity after a spine loss, 900 milliseconds against 30 seconds. For "X or Y", give both sides, then the fact about this network that decides it. And treat "up" as not yet healthy: an Established session can carry nothing, and an up link can drop packets.

At your desk: the follow-up ladder, the comparison and lightning-round tables, the four visualisations, the numbers script, the failure and platform tables, and the BGP best path problem.

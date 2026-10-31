---
lesson: the-bgp-black-hole
source: 73472467739f223b
fit: partial
desk:
  - "The control-plane and data-plane trace tables, and the two black hole visualisations, leaves only and the VXLAN fix"
  - "The two traceroute outputs, from the host and from the leaf's loopback"
  - "The boot race timeline, and the MPLS and VXLAN header tables with the label-switching trace"
  - "The data-plane simulator and its five runs, including the summarised loopbacks"
  - "The table of what Established proves, the failure-mode and trade-off tables, and the evidence ladder code"
  - "Exercise: find the black hole by walking a packet through every router's forwarding table"
---
## Introduction

Here is a question network interviewers love. Three routers in a row: R1, R2 and R3. All three run IS-IS. R1 and R3 run iBGP between their loopbacks, and R2 runs no BGP at all. R3 learns a customer prefix and advertises it to R1. Does the session come up? And does a customer packet from behind R1 reach the prefix?

[pause]

Yes, and no. The session comes up, because the loopbacks are reachable. The packet dies at R2, a router that never heard of the destination, while every session and adjacency on the dashboard is green.

The trap proves a rule the rest of the track relies on. BGP decides which exit a packet should leave by. Every router on the way must still forward the packet towards that exit using only what it knows itself.

Four ideas follow: the trap traced hop by hop, the two families of fix and the black hole each brings with it, next hops the IGP cannot resolve, and why "session Established" is not a health check.

## The trap, traced

On Meridian's Amsterdam fabric, R1 is leaf1.ams, with the host acme-web1 behind it. R2 is spine1.ams, the transit router: it forwards packets that neither start nor end at it. R3 is leaf3.ams, with acme-db1 at 10.1.2.20 behind it. IS-IS carries only the loopbacks and the links, never a customer subnet. And imagine a design Meridian does not use: Acme's subnets advertised by plain iBGP between the two leaves, with no tunnel.

First the control plane, where every step succeeds. IS-IS comes up and every router learns the others' loopbacks. leaf1 sends a TCP SYN from its loopback to leaf3's loopback on port 179, and the spine forwards it like any other packet, because it has a route to that loopback. The session reaches Established. leaf3 sends an update: 10.1.2.0 slash 24, with its own loopback as the next hop. The spine carries that update as TCP payload; it runs no BGP, so nothing on it could read the message. leaf1 resolves the next hop through IS-IS, finds it behind the spine, and installs the route. The line people draw between R1 and R3 is a TCP connection, not a cable.

Now the data plane. acme-web1 sends a SYN to the database at 10.1.2.20, via its gateway, leaf1. leaf1 matches the BGP route, rewrites the MACs and sends it to the spine. The spine looks up 10.1.2.20 and finds nothing. It holds four routes, two loopbacks and two links, and no default. It discards the packet and counts a no-route drop.

The packet carried only its destination address. The knowledge that the customer subnet lives behind leaf3 stayed on leaf1, the only router that read the update. Recursive resolution picked the first hop and nothing more, and every later router looks up the original destination for itself.

The drop is silent. The spine would send an ICMP unreachable back, but it has no route to the host's subnet either, so the error is discarded too. The host retransmits its SYN six times, at 1, 3, 7, 15, 31 and 63 seconds, and gives up at 127. The application reports a timeout two minutes later, not an error.

Traceroute from the host shows the gateway, then stars, just like a dead spine. Source it from leaf1's loopback instead, an address the spine can route replies to, and hop 2 answers with an exclamation mark N: network unreachable. The spine is alive and has no route. Choosing the probe's source address decides whether errors can come back.

Why does BGP allow this? Because BGP is not a forwarding protocol. It distributes reachability statements and trusts the network in between. Early BGP enforced that trust with synchronization, which meant pushing BGP routes into the IGP. It died because IS-IS has room for roughly 40,000 prefixes per router by default, against an internet table of about a million, and it floods and recomputes on every change. Turning synchronization off made the designer responsible, and the trap is what happens when nobody takes that on.

## Fix one: BGP everywhere

The first fix: give the spine iBGP sessions too. It learns the customer route from leaf3, installs it, and forwards the SYN on to leaf3, which delivers.

The session to leaf3 is required. leaf1 will not pass the route on, because iBGP's split-horizon rule forbids handing iBGP routes to other iBGP peers. Three routers need a full mesh of three sessions. Amsterdam's 4 spines and 16 leaves would need 190, which is why BGP everywhere at scale means route reflectors: two sessions per client, about 40 in total.

It also costs state: an internet transit network doing this holds about a million routes in every core router. In Meridian it is worse: Acme and Globex both use 10.1.1.0 slash 24, so every spine would need a routing table per tenant and would change whenever a tenant did.

And it brings its own black hole: the boot race. A transit router reboots. For about 40 seconds it has no adjacencies and traffic routes around it. Then IS-IS comes up at normal metric and draws traffic straight back, while BGP is still loading a full table, a batch at a time, until about four minutes after boot. Every prefix not yet installed is dropped. The IGP is fast because its state is small, BGP is slow because its state is large, and the IGP decides where packets go.

The fix keeps the router out of transit until BGP is ready: IS-IS sets the overload bit on startup, meaning "do not route through me", while the router's own addresses stay reachable. The signal is routing table against hardware route counts per transit router, and no-route drops in the minutes after a reboot.

## Fix two: encapsulate towards the exit

The other fix leaves the spine exactly as it is. leaf1 wraps the customer packet in an outer header addressed to leaf3. Now each transit router asks "where is leaf3's loopback?" instead of "where is 10.1.2.20?", and the IGP answers that everywhere. This is a BGP-free core: BGP at the edges, IGP state alone in the middle.

MPLS does it with a 4-byte label between the Ethernet header and the IP packet. A second protocol, LDP, runs beside IS-IS on every link and hands out labels. The spine has bound label 24013 to leaf3's loopback, and leaf3 told the spine to pop the label before sending it on: penultimate-hop popping. So leaf1 pushes 24013, the spine pops it and sends plain IP to leaf3, and the spine never reads the customer address.

MPLS's own black hole is the agreement between LDP and the IGP. Suppose LDP on the leaf1 to spine link is down while IS-IS on it is up. Before I tell you: what does leaf1 do with the packet?

[pause]

It still routes via the spine, because IS-IS says so, but it has no label from it. So it sends the packet unlabelled, the spine does an IP lookup on the customer address, and the original black hole is back. LDP and IGP synchronization closes it: the IGP advertises the link at maximum metric until LDP is up.

VXLAN uses a full outer header instead: Ethernet, IP from leaf1's loopback to leaf3's, UDP to port 4789, and a VXLAN header carrying a VNI that names the tenant's segment or routing table. That is 50 bytes of overhead, so the underlay MTU must exceed the tenant's by at least 50. The route that triggers it arrives over the same iBGP session, now carrying EVPN: a type-5 route for the customer subnet, next hop leaf3's loopback, VNI 50001, Acme's routing VNI.

The spine's table is the same four routes as before. Because the VNI picks the tenant's table at leaf3, Globex's identical subnet rides in VNI 50002 to a different table, a separation the spines never see. VXLAN has no label protocol to fall out of sync. Backbones pick MPLS for its small overhead and traffic engineering; data centers pick VXLAN because it runs over any IP underlay. VXLAN's black holes live in the underlay: a VTEP loopback missing from IS-IS, or an MTU without room for the 50 bytes, where small packets pass and full-size ones vanish.

## Next hops the IGP cannot resolve

Most other BGP black holes start at the next hop, in three forms.

First, the next hop is not in the IGP at all. gw1.ams learns a prefix from ISP1 with ISP1's link address as the next hop, and passes it to the leaves over iBGP unchanged. IS-IS does not carry ISP1's addresses, so every leaf holds a route marked inaccessible and never installs it. The fix is next-hop-self: the gateway rewrites the next hop to its own loopback. The signal is the count of inaccessible next hops, which in a healthy fabric is zero.

Second, the next hop drops out of the IGP, and here unresolvable is the good outcome. leaf3 loses power, and within about a second every router has withdrawn its loopback. Next-hop tracking in BGP is called back and reruns best path for every prefix using it: traffic moves to an alternative, or the route is uninstalled and packets drop visibly at the ingress leaf.

Third, the dangerous case: the next hop resolves when it should not. Suppose an operator summarised each site's loopbacks between sites, so Singapore knows Amsterdam's only as one slash 24. Meridian does not do this. leaf3 dies, its slash 32 vanishes inside Amsterdam, but the summary stays up while any Amsterdam loopback exists. leaf2.sin's next-hop tracking sees the address still covered and keeps the route. Its packets cross about 10,500 kilometres, about 52 milliseconds one way, to be dropped at spine1.ams by the summary's discard route.

If the Amsterdam reflector checks the next hop, it withdraws the route in about a second. If not, the route goes only when the reflector's session to the dead leaf times out: 6 to 9 seconds with Meridian's 9-second hold time, up to 3 minutes with a 180-second vendor default, under a second with BFD. A default route in the IGP does the same damage, which is why many operators restrict next-hop resolution to host routes. The signal: any next hop resolving through something other than a slash 32.

## Established is not a health check

Established proves that TCP between two loopbacks works, that the two OPEN messages agreed, and that the peer's BGP process sent something within the hold time. Each has a blind spot.

The session's packets go to a loopback every router knows, which says nothing about a customer address. They take one ECMP path, so a gray-failing link on another spine can drop a share of data traffic. Keepalives are 19 bytes, so missing VXLAN headroom drops only large packets. And a session proves nothing about whether routes are in hardware, or correct: a tenant's configuration copied to another leaf with its route target unchanged leaks one tenant's routes into another's table, every session stays up, and the customer is the first to notice.

The opposite coupling fails too. In Facebook's outage of 4 October 2021, DNS servers cut off from the data centers withdrew their BGP announcements as designed, and the company's names stopped resolving worldwide for about six hours. Be deliberate about which health checks may withdraw routes.

So the platform's evidence forms a ladder. Session Established. Prefix received and chosen as best. Next hop resolved through a host route. Route in the ingress switch's hardware. Every router on the path holding a route for what it must look up. And a probe with the tenant's own addresses getting an answer. The useful output is the lowest rung that fails, because every rung above it is meaningless. The leaves-only design fails at the path rung. A bad optic passes every control-plane rung and fails only the probe, which is why the probe rung exists.

## In the interview

A follow-up the lesson expects. Every BGP session is Established, but a customer cannot reach a prefix. Where do you look?

[pause]

Scope first: one source or many, one prefix or all. Then climb the ladder from the bottom: route best on the ingress leaf, next hop through a slash 32, route in hardware, a route on every hop, a probe with the customer's addresses. A traceroute from the leaf's loopback shows where it dies, and no-route drop counters on the transit devices confirm it. The wrong answer is resetting the sessions, which changes nothing about the data plane.

## Recap

Four things to remember. BGP picks the exit, but every router on the path forwards on its own table, and the next hop chooses only the first hop. Each fix has its own black hole: the boot race for BGP everywhere, which the overload bit prevents; LDP out of step with the IGP for MPLS; a missing VTEP loopback or a short MTU for VXLAN. A next hop that becomes unresolvable fails fast at the ingress, while one that keeps resolving through a summary or default fails slowly and far away. And Established is one rung of evidence, not a health check.

At your desk: the trace tables and the two black hole visualisations, the traceroute outputs, the boot race, MPLS and VXLAN tables, the data-plane simulator, the evidence ladder code, and the find-the-black-hole exercise.

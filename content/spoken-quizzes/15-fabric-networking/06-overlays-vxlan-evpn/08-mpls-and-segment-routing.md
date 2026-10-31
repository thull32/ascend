---
lesson: mpls-and-segment-routing
source: b01c89309e4f6532
---
## 1

p1.sin receives Acme's packet carrying label 24017 on top of label 92001, and forwards it towards p1.ams. Which part of the packet does p1.sin use to decide?

A, the top label, 24017, by exact match in its label table. B, the VPN label, 92001, to find the right tenant table. C, the destination address, 10.1.2.20, by longest-prefix match. D, both labels together, matched as one combined key.

[think]

The answer is A: the top label, 24017, by exact match in its label table.

A P router reads only the top label, looks it up in its label forwarding table, swaps it for 24031 and forwards. It never reads the VPN label or the IP header, which is why it needs no Acme routes, just as a spine reads only the outer header of a VXLAN packet. Only pe1.ams, which allocated 92001, interprets the VPN label.

## 2

pe1.ams advertises label 3, implicit null, to p1.ams for its own loopback. What arrives at pe1.ams on the last link?

A, a plain IPv4 packet with every label removed. B, a packet carrying only the VPN label, 92001. C, a packet carrying label 0, explicit null. D, a packet whose transport label has the value 3.

[think]

The answer is B: a packet carrying only the VPN label, 92001.

Implicit null asks the penultimate router to pop the transport label rather than swap it, so label 3 never appears in a packet. The VPN label underneath remains, because only pe1.ams can act on it. Explicit null, label 0, is a different request, used when the last link needs the label's traffic-class bits.

## 3

After a change, pe1.sin still pings pe1.ams's loopback, 10.255.1.241, but every Acme VPN route via pe1.ams shows as hidden on pe1.sin. The IGP now carries the slash 24, 10.255.1.0, instead of the loopback's own slash 32. Why?

A, the route distinguisher changed when the loopback was summarised. B, the route target no longer matches the summary prefix. C, LDP binds labels only to exact routing-table matches, so no LSP exists. D, ping uses ICMP, and VPN routes need the BGP session reset.

[think]

The answer is C: LDP binds labels only to exact routing-table matches, so no LSP exists.

A VPN route is usable only if its next hop resolves to a labelled path. With only the slash 24 in the IGP, no LSP to the slash 32 is built, so the VPN routes are held but not installed. IP reachability to the summary is unaffected, which is why ping works. Route distinguishers and route targets are configured values that summarisation does not touch.

## 4

In segment routing over MPLS, pe1.ams has prefix SID index 241, and every router uses a label block from 16000 to 23999. Then p1.ams is moved to a block from 20000 to 27999. What happens to traffic from pe1.sin to pe1.ams?

A, it falls back to LDP until all the blocks match again. B, it drops at p1.sin, which has no label 16241 any more. C, it still arrives, and every hop keeps the label 16241. D, it still arrives, with p1.sin swapping 16241 for 20241.

[think]

The answer is D: it still arrives, with p1.sin swapping 16241 for 20241.

Each router derives its neighbour's label from the neighbour's advertised block base plus the global index, so the path works. The index is global; the label value is global only while every block matches. That is why operators standardise the block, and why tools must not assume a label means the same thing everywhere.

## 5

Why do data-center fabrics usually choose VXLAN over MPLS for tenant overlays?

A, any IP fabric carries VXLAN, and hosts and SmartNICs can be endpoints. B, VXLAN has less overhead per packet than an MPLS label stack. C, MPLS cannot carry more than a few thousand tenants in one fabric. D, MPLS label lookups are too slow for today's switch chips.

[think]

The answer is A: any IP fabric carries VXLAN, and hosts and SmartNICs can be endpoints.

VXLAN needs nothing from the core but IP routing, servers, hypervisors and SmartNICs can encapsulate it, and its UDP source port gives ECMP entropy. MPLS has less overhead, 8 bytes against 50, not more, and label lookups are fast. With 20-bit labels and a VPN label per VRF, tenant count is not the constraint. The overhead matters on expensive backbone circuits, not inside jumbo-frame fabrics.

## 6

A customer's traceroute across an MPLS provider, in the uniform TTL model, shows 0.4 milliseconds at hop 1, and about 105 milliseconds at hop 2, a P router in the same city, then about 105 milliseconds for every later hop. What explains hop 2?

A, the long-haul circuit begins at the P router, so its delay shows there. B, the P router forwards its ICMP reply along the LSP to the egress PE first. C, the P router rate-limits ICMP generation, so its replies are delayed. D, the P router has a congested queue that delays every labelled packet.

[think]

The answer is B: the P router forwards its ICMP reply along the LSP to the egress PE first.

A P router has no route to the customer's address, so it sends the time-exceeded message onward down the same LSP to the egress PE, which routes it back. Every P hop therefore reports the round trip to the far end, about 105 milliseconds for 10,500 kilometres. Rate limiting or congestion would show as variable delay or loss at that hop alone, and in a plain IP network a router at the start of a long circuit replies without crossing it.

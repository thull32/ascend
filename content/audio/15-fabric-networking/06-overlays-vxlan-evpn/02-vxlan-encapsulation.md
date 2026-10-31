---
lesson: vxlan-encapsulation
source: 13796c7ca02b7823
fit: partial
desk:
  - "The VXLAN encapsulation visualisation, acme-web1 to acme-web2"
  - "The header stack table and the field-by-field tables for outer Ethernet, outer IPv4, outer UDP and VXLAN, with their bytes"
  - "The Python packet builder, its byte dump and the egress checks"
  - "The hop-by-hop table and the tcpdump capture"
  - "The MTU variants table and the one-link-at-1,500 failure table"
  - "The flood-and-learn sequence diagram and the VM-move simulation"
  - "The flood-and-learn versus EVPN table, the trade-offs table and the failure modes table"
  - "Practice problem: MAC learning switch"
---
## Introduction

Acme's web server acme-web1 sits in Amsterdam, behind leaf1. Its sibling acme-web2 sits in Singapore, behind leaf2. They share one subnet and behave as if a single switch connected them: acme-web1 ARPs for acme-web2 and sends frames straight to its MAC address. Yet between them are two leaves, two spines and about 10,500 kilometres of fibre, and every one of those devices routes on IP and has never heard of Acme.

The trick is a tunnel, and almost every data center fabric uses the same one: VXLAN, RFC 7348. It puts the tenant's whole Ethernet frame inside a UDP packet addressed from one leaf to another. Interviewers ask you to draw that packet, and the strong answer names every header, its size, and who reads it.

Coming up: the tunnel's endpoints and the tenant's name, the packet header by header, the 50 bytes and the MTU, the source port that keeps ECMP working, and why VXLAN's first way of learning hosts was not enough.

## VTEPs and the VNI

A VTEP, a VXLAN tunnel endpoint, is the device that adds the VXLAN headers or removes them. On Meridian every leaf is a VTEP, and the spines are not: they forward tunnelled packets as ordinary IP and never look inside.

VTEPs live in three places. In the switch's forwarding chip, at line rate: bridging into a tunnel arrived around 2012 to 2013 with chips like Broadcom's Trident II, and routing and encapsulating in a single pass came around 2015. In a hypervisor or server kernel, such as the Linux vxlan device or Open vSwitch, where the leaf sees only UDP. Or on a DPU such as NVIDIA BlueField, which takes that work off the host CPU.

The VTEP address is the leaf's loopback: leaf1 encapsulates from 10.255.1.11 to leaf2 in Singapore at 10.255.2.12. A loopback belongs to no single link, so it survives any uplink failing, and EVPN advertises it as the next hop for every host behind that leaf.

A VTEP holds four tables. Port and VLAN to VNI, from configuration. A MAC table per segment, saying which MACs sit behind which remote VTEP, filled by EVPN type-2 routes or by flood-and-learn. A flood list per segment, from EVPN type-3 routes or a multicast group. And the underlay forwarding table, where IS-IS puts a route to every loopback.

The VNI, the VXLAN network identifier, is the 24-bit number that names a tenant's layer-2 segment. 24 bits give about 16.7 million values, against 4,094 usable VLAN IDs. That is half of VXLAN's reason to exist. The other half is a change of scope, and here is the sentence to remember: a VLAN ID means something on one leaf only; the VNI means the same thing across the whole fabric.

At ingress the leaf maps port and VLAN to a VNI and strips the VLAN tag. At egress the far leaf maps the VNI back to its own local VLAN. Acme's VLAN 100 becomes VNI 10100. Globex also uses VLAN 100, on another Amsterdam leaf, and it becomes 10200. The two never meet, and the spines carry both without knowing either exists.

How it breaks: a template typo maps VLAN 100 to 10010 on one leaf. Its frames arrive elsewhere with a VNI nobody has, and are dropped silently. Worse, a typo that lands on another tenant's VNI bridges two tenants together. The signal: unknown-VNI drops at decapsulation, and the list of VTEPs in each VNI diffed against intent, which shows a leaf alone in a VNI, or in one it should not have.

## The packet, built and carried

Follow one packet. acme-web1 sends an ordinary 1,500-byte IP packet to acme-web2's MAC. Leaf1 finds that MAC behind 10.255.2.12 and builds the tunnel from the inside out.

First the VXLAN header, 8 bytes: a flags byte with only the I bit set, meaning the VNI is valid, then the 24-bit VNI, 10100, and the rest reserved. No length, no next-protocol field, no options, which is why 2012-era chips could parse it.

Then UDP, 8 bytes. Destination port 4789, assigned to VXLAN, which tells the far leaf what this is. Source port 58479, a hash of the inner flow; hold that thought. Checksum zero, which the standard allows over IPv4.

Then the outer IPv4 header, 20 bytes: from 10.255.1.11 to 10.255.2.12, protocol UDP, time to live 64, and on many hardware VTEPs the Don't Fragment bit set. The ECN bits are copied too, and at decapsulation a congestion mark is copied back into the inner header, which RoCE over VXLAN depends on. Last, the outer Ethernet header, 14 bytes, addressed to spine1's port. Inside sits acme-web1's frame, minus its frame checksum and any VLAN tag.

Before I go on: which headers does spine1 read?

[pause]

Only the outer Ethernet and IP headers, plus the UDP ports for its ECMP hash. Spine1 in Amsterdam and spine1 in Singapore each route on the outer destination, rewrite the outer MACs, and take the outer time to live from 64 to 63 to 62. Neither has any state for VNI 10100. The inner packet is untouched; its time to live stays 64. The circuit adds about 52 milliseconds one way; the encapsulation, nanoseconds.

Leaf2 in Singapore decapsulates only when every check passes, in order: the outer destination is its own VTEP address, the packet is UDP to its configured VXLAN port, the I flag is set, and the VNI is mapped locally. Then it looks up the inner MAC in that VNI's table and sends the frame out a local port, never back into the fabric.

One trap hides in the port. 4789 was assigned after the first implementations shipped, and the Linux vxlan driver still defaults to 8472, as does Flannel, a Kubernetes overlay. A Linux host on 8472 and leaves on 4789 cannot talk, though both configs look correct.

## Fifty bytes, and an engineered MTU

Add it up: 14 for outer Ethernet, 20 for outer IP, 8 for UDP, 8 for VXLAN. 50 bytes. Count inside the outer IP packet instead, which is what an IP MTU limits, and you get 20, 8 and 8 plus the inner frame's 14-byte Ethernet header, now payload. Also 50. So a 1,500-byte tenant packet needs an underlay IP MTU of at least 1,550. Over IPv6 it is 70 bytes, so 1,570.

Bandwidth is not the cost, about 3 percent at 1,500 bytes. The cost is that every link on every path must carry the bigger packet, and nothing will discover one that does not.

Path MTU discovery cannot help, for three reasons. The spine's "fragmentation needed" message goes to the outer source, leaf1, not acme-web1. Leaf1 is bridging, and Ethernet has no "too big" message to pass on. And VTEPs must not fragment, while hardware VTEPs discard fragments rather than reassemble them.

So the MTU is engineered. Meridian runs hosts at 1,500 or 9,000 and every fabric link and circuit at an IP MTU of 9,216, leaving 166 bytes of headroom. And vendors disagree on whether "MTU" counts the Ethernet header, so tooling must normalise every value before comparing.

Now the incident. In Amsterdam, with four spines, spine3 gets a line card replaced, and its new port facing leaf5 comes up at the default of 1,500. The IS-IS adjacency comes up fine. The report: about a quarter of connections between two racks hang once they send real data, and ping is fine. Why a quarter?

[pause]

Because small packets fit everywhere, and ECMP sends roughly one flow in four through spine3, where the 1,550-byte outer packets are dropped. A full-size ping crosses only the one spine its hash picks, so it passes or fails by luck. What finds it: MTU-exceeded counters on spine3's port, fragmentation-needed messages arriving at leaf1's loopback, and full-size probes between the two VTEP addresses with many UDP source ports, so some cross every spine. The fix is one port's MTU. The lesson is to check MTU as a property of every link against the budget, not to test one path.

## The source port

Every packet between leaf1 and leaf2 has the same outer addresses, protocol and destination port. ECMP hashes those fields to pick an uplink. If the source port were fixed too, every tenant flow between two leaves would land on one spine.

So the standard recommends the VTEP hash the inner headers into the outer source port, between 49152 and 65535; Linux uses its local port range instead, which is fine as long as the port varies per flow. Four connections from acme-web1 to acme-web2, differing only in their own source port, get outer ports 58479, 55468, 55241 and 56966: four outer flows, which the spines spread. Every packet of one inner flow gets the same port, so it stays on one path and in order.

Two details. The reply picks its own port, because leaf2 hashes the swapped headers, so the two directions may cross different spines: probe both. And fragments carry no ports, so they are hashed on addresses alone, keeping every piece of a datagram on one path.

Entropy spreads flows, not bytes: one inner elephant is still one outer flow on one spine, a problem AI fabrics solve differently. How it breaks: a software VTEP, NIC offload or gateway that writes a constant port, collapsing a VTEP pair's traffic onto one link. The signal: imbalance only in tunnelled traffic, and very few distinct outer source ports per VTEP pair in sFlow samples.

## Flood-and-learn, and why it was not enough

RFC 7348 defined the data plane and almost no control plane. VTEPs learned like a classic switch, with a tunnel standing in for a port. Each VNI maps to an underlay multicast group, built with PIM. Broadcast, unknown unicast and multicast, BUM for short, go to the group. A VTEP that decapsulates a frame records "this inner source MAC lives behind that outer source IP". Known unicast is then tunnelled directly.

It works, until something moves. acme-web2 is a virtual machine. At 60 seconds it live-migrates from leaf2 to leaf3 in Singapore and, unusually, announces nothing. MAC entries age out after 300 seconds.

At 61 seconds acme-web1 sends to it. Leaf1 still believes 10.255.2.12. Leaf2 still believes acme-web2 is on its own port, and an egress VTEP never sends back into the fabric, so the frame is lost. Same at 90 seconds. At 120 seconds acme-web2 finally sends something, leaf1 learns the new VTEP, and traffic flows. Sixty seconds of black hole. Had it stayed silent, the hole would have lasted until leaf1's entry aged out, up to 300 seconds after its last frame. Only a frame from the host can say it moved.

That gap and five others shaped EVPN. Location learned only from traffic: EVPN advertises each MAC in a type-2 route, and a move carries a higher mobility sequence number. Mandatory underlay multicast: EVPN builds flood lists from type-3 routes. Learning MACs but not IPs, so every ARP floods: type-2 routes carry both, so leaves answer ARP locally. No authentication: anything that can send UDP 4789 to a VTEP can inject frames, while EVPN installs remote MACs only from BGP, though edge filtering is still needed. One MAC on one VTEP, so a dual-attached server looks like a flapping MAC: EVPN multihoming. And no subnet routes: type-5 routes and a gateway on every leaf.

EVPN did not change a byte of the packet. It replaced how VTEPs fill their tables. VXLAN won as the simplest thing a 2012 chip could parse that any IP network would carry and spread.

## In the interview

The platform view follows from all this: full-size probes between every VTEP pair, both directions, with enough source ports to cross every spine; normalised MTU on every link against the budget; the VLAN-to-VNI map diffed against intent; decapsulation drops by reason; and scope in tenant terms, "Acme, VNI 10100, between Amsterdam and Singapore".

The classic question: why is VXLAN carried in UDP, and not directly in IP or in GRE?

[pause]

For the source port. Every fabric hashes the five-tuple for ECMP, and UDP lets the VTEP put the inner flow's entropy where every existing chip already looks, so tunnelled traffic spreads with no new hardware. The wrong answer is "UDP is faster" or "for reliability": VXLAN adds no reliability, and the inner TCP provides whatever is needed.

And do the spines need to support VXLAN? No. They route UDP between loopbacks; they need only the MTU and a hash that includes UDP ports.

## Recap

Five things to remember. A VTEP, usually the leaf, wraps the tenant's frame in outer Ethernet, IP, UDP 4789 and VXLAN, and spines route on the outer IP alone. VLANs are local; the 24-bit VNI is the tenant's identity across the fabric. 50 bytes over IPv4, 70 over IPv6, and since path MTU discovery cannot rescue a bridged tunnel, the MTU is engineered and checked on every link. The outer source port hashes the inner flow, so ECMP spreads tunnelled flows, one path each. And flood-and-learn lost hosts that moved silently; EVPN kept the packet and fixed how the tables are filled.

At your desk: the encapsulation visualisation, the header tables, the packet builder, the hop-by-hop table and capture, the MTU tables, the flood-and-learn diagram and VM-move simulation, the comparison and failure tables, and the MAC learning switch problem.

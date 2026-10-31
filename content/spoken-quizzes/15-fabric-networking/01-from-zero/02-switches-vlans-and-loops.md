---
lesson: switches-vlans-and-loops
source: 874157d2fc0aef87
---
## 1

The peer link between an MLAG pair of switches fails, while the keepalive over the management network still works. What should happen?

A, the secondary shuts its MLAG ports, so dual-attached servers use the primary. B, the servers' bonds go down, since LACP now hears two different partners. C, both switches keep forwarding, since each still has a link to every server. D, spanning tree blocks one server link, since the pair now forms a loop.

[think]

The answer is A: the secondary shuts its MLAG ports, so dual-attached servers use the primary.

The keepalive tells the secondary that its peer is alive, so the problem is the peer link, not the peer. Without it the two switches can no longer synchronise MAC tables or suppress duplicate floods, so the secondary steps aside; each server's bond loses one member but stays up, because the primary still sends the shared system ID. Hosts attached only to the secondary may be cut off. Both switches carrying on alone is split brain, which is what happens when the keepalive is lost as well.

## 2

After a routing change, return traffic to a server comes through a router whose ARP entry for the server is three hours old, while the server's outgoing traffic leaves through another router. Unrelated servers in the VLAN start receiving gigabits of frames not addressed to them. What is the most likely cause?

A, a native VLAN mismatch bridging two VLANs on one trunk. B, the switch aged out the silent MAC, so it floods each frame. C, a MAC flooding attack filling the switch's table with random MACs. D, a layer-2 loop circulating the server's broadcasts.

[think]

The answer is B: the switch aged out the silent MAC, so it floods each frame.

The router keeps ARP entries for hours and keeps sending unicast frames to the server's MAC, but the switch hears nothing from the server on that path and ages the MAC out after 300 seconds, so every frame for it becomes unknown unicast and is flooded. A loop would show MAC flaps and multiplying broadcasts, not steady unicast to one MAC. The fix is an ARP timeout no longer than the MAC aging time, so the router re-ARPs and the reply re-teaches the switch, or symmetric routing.

## 3

A frame in VLAN 200 crosses a trunk. What sits in the two bytes right after the source MAC, where an untagged frame would have its EtherType?

A, hex 8100, the 802.1Q tag protocol identifier. B, hex 88 A8, the provider tag used on every trunk. C, hex 00 C8, the VLAN ID 200 written in hexadecimal. D, hex 0800, the EtherType of the IPv4 payload.

[think]

The answer is A: hex 8100, the 802.1Q tag protocol identifier.

The 802.1Q tag is inserted after the source MAC, and its first 16 bits, hex 8100, sit where the EtherType normally is, telling the parser a tag follows. The VLAN ID 200 is in the 12-bit field after the priority and drop-eligible bits, and the original EtherType follows the tag. Hex 88 A8 is the outer tag of QinQ, used by providers stacking tags, not on ordinary trunks.

## 4

Three switches form a triangle, all links 10 gigabits per second, all priorities 32768. Their MACs end in 80 for leaf1, 81 for leaf2 and 82 for leaf3. Which port does RSTP put in the discarding state?

A, leaf2's port towards leaf3, as that link's lower bridge ID end. B, leaf3's port towards leaf1, as the root port with the higher MAC. C, leaf1's port towards leaf3, as the root's highest-numbered port. D, leaf3's port towards leaf2, as that link's non-designated end.

[think]

The answer is D: leaf3's port towards leaf2, as that link's non-designated end.

leaf1 has the lowest bridge ID and becomes root, so its ports are designated. leaf2 and leaf3 each choose the direct link to leaf1 as their root port, at a cost of 2,000 against 4,000 the long way. On the link between leaf2 and leaf3 both ends offer 2,000, so the lower bridge ID, leaf2, is designated, and leaf3's port there is an alternate port that discards. The root never blocks its own ports.

## 5

A server has an LACP bond of two 25 gigabit links, with both members bundled. A single TCP transfer runs at about 25 gigabits per second. Why?

A, LACP reserves one member as a standby for failover. B, each frame alternates members, and reordering halves the rate. C, the 802.1Q tag overhead takes half of the aggregate bandwidth. D, the bundle hashes per flow, so one flow uses one member.

[think]

The answer is D: the bundle hashes per flow, so one flow uses one member.

A link aggregation group hashes header fields so every frame of a flow takes the same member and arrives in order, so one flow never exceeds one member's speed. Several flows with different ports spread across both members. LACP in its normal mode keeps all members active, and spraying frames across members is exactly what a bundle avoids, to prevent reordering.

## 6

Why does a layer-2 loop take down a network, when a layer-3 routing loop usually does not?

A, switches forward frames more slowly than routers forward packets. B, spanning tree turns every redundant link off, which isolates hosts. C, broadcast frames are much larger than the IP packets in a loop. D, Ethernet frames have no TTL, so flooded copies circle and multiply.

[think]

The answer is D: Ethernet frames have no TTL, so flooded copies circle and multiply.

IP packets carry a TTL that each router decrements, so a looping packet dies after at most 255 hops and the damage is bounded. Ethernet has no hop count, and switches flood broadcasts out of every port, so the copies live forever and each new broadcast adds more, until links fill and switch CPUs starve. Spanning tree is the cure, not the cause, and frame size or switch speed has nothing to do with it.

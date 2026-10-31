---
lesson: the-routing-table
source: a5854441fcc2b0ac
---
## 1

leaf1 in Amsterdam holds four usable routes: a default via gw1, 198.51.100.0 slash 24 via gw1, 198.51.100.128 slash 25 via gw2, and 198.51.100.0 slash 27 via gw2. Which route carries a packet for 198.51.100.40?

A, the slash 24 via gw1, the longest prefix that contains dot 40. B, the default via gw1, since no route names dot 40 exactly. C, the slash 25 via gw2, the closest prefix above dot 40. D, the slash 27 via gw2, the longest prefix in the table.

[think]

The answer is A: the slash 24 via gw1, the longest prefix that contains dot 40.

40 in binary is 00101000. The slash 27 needs the last octet to start with three zeros, and this one starts 001, so it does not contain dot 40; the slash 25 needs a leading 1. The slash 24 and the default both contain it, and the slash 24 is longer. Being the longest prefix in the table counts for nothing unless the prefix contains the destination.

## 2

leaf1 learns gw2's loopback, a slash 32, from IS-IS with two equal-cost next hops, and someone adds a static route for the same slash 32 via spine1 only. With Cisco or FRRouting defaults, what happens?

A, neither is installed until an operator picks one of them. B, the static wins on distance, and ECMP falls to spine1 alone. C, both are installed, giving three next hops in one group. D, IS-IS wins on its lower metric, and both next hops stay.

[think]

The answer is B: the static wins on distance, and ECMP falls to spine1 alone.

For one prefix from two sources, administrative distance decides first: the static's 1 beats IS-IS's 115. Metrics are compared only within one protocol, so the IS-IS metric is never weighed against the static. The router installs only the static's single next hop, so traffic towards gw2 crowds onto one uplink, and the static ignores any IS-IS drain of spine1.

## 3

show ip route on a leaf lists 203.0.113.0 slash 24 as selected, yet packets to it are dropped on that leaf, and syslog reports a hardware table error. What is the most likely explanation?

A, the ECMP hash sends those flows to a member that has no MAC. B, the route lost on administrative distance after it was selected. C, the route is in the RIB but was never programmed into the FIB. D, the BGP session that taught the route has moved to Active.

[think]

The answer is C: the route is in the RIB but was never programmed into the FIB.

show ip route displays the RIB, the control plane's choice. The chip forwards from the FIB, and if the hardware table is full or programming failed, the route never reaches it, so traffic is dropped or punted while the RIB looks correct. A session in Active would have withdrawn the route from the RIB, and distance is settled before a route is shown as selected.

## 4

gw2's loopback disappears from IS-IS, but its BGP sessions stay up through another path. leaf1 holds the slash 27 via gw2, the slash 24 via gw1, and a default via gw1. What happens to traffic for 198.51.100.25?

A, the slash 27 becomes unusable, so it takes the slash 24 towards gw1. B, it keeps flowing to gw2 until the BGP hold timer expires. C, it is dropped, because the slash 27 is still the longest match. D, it follows the default to gw1, resolving gw2's loopback through the default route.

[think]

The answer is A: the slash 27 becomes unusable, so it takes the slash 24 towards gw1.

A BGP route whose next hop cannot be resolved stays in the RIB but is not installed, so the FIB lookup finds the next-longest match, the slash 24 via gw1. Sessions being up does not help; resolution needs an IGP route to the next hop. Implementations such as FRRouting refuse to resolve a next hop through the default route unless told to, precisely to avoid sending gw2's traffic somewhere unintended.

## 5

Why does a TCAM used for longest-prefix match store its entries sorted from the longest prefix to the shortest?

A, sorting lets it binary-search the rows in about log n steps. B, longer prefixes need fewer don't-care bits to be compared. C, its priority encoder returns the lowest-numbered matching row. D, the chip searches rows one by one and stops at the first hit.

[think]

The answer is C: its priority encoder returns the lowest-numbered matching row.

Every TCAM row compares against the key in parallel in the same cycle, and when several match, the priority encoder reports the lowest index. Placing longer prefixes first makes that first match the longest one. The search is not sequential and not a binary search; the ordering exists only for the encoder, and keeping it on every insert is why TCAM updates may move many entries.

## 6

BGP multipath gives 192.0.2.0 slash 24 two next hops, gw1 and gw2, and each gateway's loopback resolves through spine1 and spine2. How many members does leaf1's FIB entry have?

A, two: spine1 and spine2, the union after resolution. B, two: one per gateway, with the spine picked later on. C, four: each gateway paired with each of the two spines. D, one: multipath is undone when a next hop is recursive.

[think]

The answer is A: two, spine1 and spine2, the union after resolution.

The FIB stores what the leaf can act on: a neighbour and a port. Both gateways resolve to the same two spine neighbours, so the union is two members. The leaf cannot choose the gateway, because the packet carries only its destination address; the spine's own lookup decides which gateway it reaches.

---
lesson: the-routing-table
source: 6ad54f73b7ba3060
fit: partial
desk:
  - "Leaf1's nine-route table, the row fields, and the bit-by-bit match tables for five destinations"
  - "The longest-prefix match visualisation, with the recursive resolution of the BGP next hop"
  - "The administrative distance defaults for Cisco, FRRouting and Junos"
  - "The RIB to FIB pipeline diagram and the resolution trace table"
  - "The Linux ECMP route output and the trie diagram"
  - "The Python trie, selection, resolution and TCAM model, and the lookup structure comparison table"
  - "The failure modes table"
  - "Exercise: longest-prefix match with recursive resolution"
  - "Practice problems: longest-prefix-match and unresolvable-next-hops"
---
## Introduction

A leaf switch holds a few hundred routes. A border router carrying the internet holds about a million. For every packet it must pick exactly one, and usually several match: the default route matches every destination there is. One 400 gigabit port can deliver about 595 million minimum-size packets a second, and a switch chip has dozens of ports. Get the rule wrong and traffic leaves through the wrong exit. Get the data structure wrong and the router cannot keep up.

The router throughout is leaf1 in Meridian's Amsterdam site, the leaf acme-web1 plugs into, in a small example with two spines, treated as a plain IP router. Its table has nine routes. A default and the slash 24 198.51.100.0, both towards the gateway gw1. Two more-specific pieces of that block, a slash 25 and a slash 27, towards the other gateway, gw2. The two gateways' loopbacks, from IS-IS. Acme's subnet, and the two links to the spines.

The plan: longest-prefix match, where routes come from and which one wins, the RIB and the FIB, recursive next hops and ECMP, and how a chip does it in nanoseconds.

## Longest-prefix match

A route says: to reach this prefix, hand the packet to this next hop, the address of the router that should receive it next.

A packet from acme-web1 arrives for 198.51.100.25. The rule: among every route whose prefix contains the destination, use the one with the longest prefix. A slash n route matches when the destination's first n bits equal the prefix's. The default has no bits to compare, so it matches with length 0. Acme's subnet starts with 10, so it fails at the first bit, and so do the loopbacks and the links. The slash 24 matches all 24 bits. The slash 25 needs a 1 in bit 25, and 25 in binary starts with a 0, so it fails. The slash 27 needs three zeros after the slash 24's bits, and 25 starts 000. Three routes match; the slash 27 is longest; the packet heads for gw2.

Now change the last octet to 40. Before I tell you: which route wins?

[pause]

The slash 24, towards gw1. 40 in binary starts 001, so the slash 27, which needs 000, does not contain it, and the slash 25 needs a leading 1. Being the longest prefix in the table counts for nothing unless it contains the destination. For dot 200, which starts with a 1, the slash 25 wins. For 192.0.2.7, only the default matches.

Why the longest? A slash 27 names 32 addresses, a slash 24 names 256, and the default all four billion. The longest match is the most precise statement anyone made about where this destination lives.

The consequence people miss: longest-prefix match runs before any notion of best. A slash 27 over a congested 200 millisecond path beats a slash 24 over an idle 1 millisecond one. Announcing more-specifics is how an operator steers incoming traffic on purpose, and how a hijacker steals it. It breaks when a stray more-specific, a slash 32 static left after a test or a leaked slash 25, silently takes traffic from a covering route that still looks healthy. The signal is asking the router which route a destination actually uses, and the count of routes per prefix length.

## Where routes come from, and which one wins

Connected routes come from addresses on interfaces. Put an address on the link to spine1 and you get the link's slash 31, meaning anything in it is on this wire, ARP for it directly; and a local slash 32, meaning this address is mine, deliver it to my CPU. A connected route exists only while its interface is up, which is a feature: when the link fails, the route disappears, and so does everything resolved through it. A loopback has no wire, so it never goes down.

Static routes are written by an operator or automation, and stay while their next hop resolves, whatever happens beyond it. Fabrics use few: a default for the management port, in its own table; a discard route for Meridian's public block on the gateways; and floating statics, given a deliberately poor distance so they are used only when the dynamic route disappears. Statics outlive their purpose, so compare them with the source of truth.

Dynamic routes are learned by protocols. IS-IS, the underlay, supplies every loopback and link in the site, with next hops that are always directly connected. BGP carries tenant and external routes from the route reflectors, and its next hop is where traffic should leave: a gateway's loopback two hops away.

The default route is the route of last resort. It lets a leaf carry a few hundred routes instead of a million. But it hides missing routes. If leaf1 lost Acme's other subnet, that traffic would follow the default to a gateway, which may send it back, and a clean unreachable becomes a loop that burns TTL. That is why many fabrics carry no default in the underlay.

When the router holds several routes for the same prefix, the order is fixed. Administrative distance picks between sources, lower wins. The metric picks within one source, lower wins. A tie within one source becomes an ECMP route. Distance is a local number of trust that no protocol carries. Cisco and FRRouting defaults: connected 0, static 1, eBGP 20, OSPF 110, IS-IS 115, iBGP 200. An eBGP route is information you cannot get any other way; an internal prefix over iBGP is usually a copy of something the IGP knows first-hand. Junos ranks every IGP above all BGP, so in a mixed-vendor network the same route can win on one box and lose on the next. And metrics only compare inside one protocol.

Here is how a forgotten static breaks a fabric. During a migration, someone adds a static for gw2's loopback via spine1, distance 1. It beats IS-IS's 115, so all traffic towards gw2 crowds onto one uplink. Then spine1 is costed out of IS-IS for maintenance. The static ignores the drain and keeps sending traffic into the spine everyone believes is empty. The signal is the route's source, static where intent says IS-IS, and traffic still arriving on a drained device.

## RIB and FIB

The RIB, the routing information base, is the control plane's table, in the routing software's memory. It holds every candidate from every source, including backups that lost on distance and routes whose next hop cannot be reached. A RIB manager, zebra in FRRouting, merges them by distance. The FIB, the forwarding information base, holds only the winners, resolved down to an outgoing port and a neighbour, in the format the forwarding engine reads fastest.

Why two tables? The RIB is built for change and lives in the CPU's memory. The FIB is built for line-rate reads and lives in tens of megabytes on the chip. The split lets the chip keep forwarding while the routing software restarts. And programming hardware is far slower than choosing routes: think thousands to tens of thousands of changes a second, so a full internet table takes tens of seconds to minutes after a reboot.

The split breaks when the two disagree. A hardware table fills, and new routes stay in the RIB only. In August 2014 the global IPv4 table passed 512,000 routes, and routers whose hardware allocated exactly that many lost reachability to some prefixes worldwide. The signal is RIB count against FIB count against hardware capacity, per device.

## Recursive next hops and ECMP

Follow the packet for dot 25 one more step. The slash 27 says via gw2's loopback, which is on none of leaf1's links, so the leaf cannot ARP for it. BGP knows where traffic should leave and nothing of the topology between; IS-IS knows the topology and nothing of the internet. Recursive resolution joins them. Leaf1 looks the loopback up in the same table and finds the IS-IS slash 32, with two next hops, one per spine. It looks each of those up and finds a connected slash 31. A connected route ends the recursion, because only a neighbour on an attached link can be reached directly. The FIB gets the slash 27 via both spines. This happens when a route changes, not per packet. A BGP route is only as good as the IGP route under its next hop.

Now scale it. Suppose 900,000 BGP prefixes resolve through gw2, and the link from spine2 to gw2 fails. IS-IS changes one route. A flat FIB must rewrite all 900,000 entries, about 90 seconds at 10,000 updates a second, while traffic still heads for the broken path. A hierarchical FIB stores each prefix as a pointer to a shared next-hop object, rewrites that one object, and every prefix moves at once: milliseconds instead of a minute.

The classic break is an unresolvable next hop. gw2's loopback drops out of IS-IS while its BGP sessions are still held; they notice only when the hold timer expires: 9 seconds on Meridian, 90 to 180 at vendor defaults. The slash 27 stays in the RIB, marked unusable, and longest-prefix match finds the slash 24 via gw1. Traffic silently changes exit, with every session Established, and with no covering route it is unreachable. That count should be zero. Resolving through the default would be worse, sending gw2's traffic towards gw1, so FRRouting refuses it unless told otherwise. And recursion chooses only the first hop: if the spines lack the slash 27, a spine drops the packet. That is the BGP black hole, covered later in the track.

An ECMP entry, equal-cost multipath, is a route with several next hops of equal preference. In the FIB it is a next-hop group, and the chip hashes the 5-tuple to pick a member, so every packet of one TCP connection takes the same path and arrives in order. Recursion and ECMP combine: if BGP multipath gave a prefix two gateways, each resolving through both spines, the FIB entry has two members, not four. The leaf chooses only a spine. A member that is up but dropping packets still receives its full share, so watch ECMP width against what the topology promises.

## Nanoseconds: tries and TCAM

The budget: a minimum-size frame takes 84 bytes of wire time, which at 400 gigabits is 1.68 nanoseconds. A chip cannot scan a million rows.

A binary trie stores prefixes as paths: bit 0 goes left, bit 1 right, and a node carries a route if a prefix ends there. To look up an address, walk its bits and remember the last route you passed. When the walk falls off the trie, that route is the longest match, in at most 32 steps for IPv4, however many routes there are. But each step is a memory read, 28 for the slash 27, and at tens of nanoseconds a read that approaches a microsecond. So real tries consume several bits per node.

A TCAM, ternary content-addressable memory, inverts the question: give it data and it returns the row holding it. Ternary means each bit is 0, 1, or don't care, so the slash 27 is one row with 27 bits fixed and 5 wildcards. Every row compares at once, and a priority encoder returns the lowest-numbered match. Store rows longest first, and the first match is the longest, in one lookup. The cost: a TCAM cell needs about 16 transistors where an SRAM bit needs 6, every row burns power on every lookup, and keeping the order can move up to 32 rows for one insert. So data center chips keep most routes in SRAM with algorithmic longest-prefix match, pipelined into a fixed number of cycles, and keep TCAM for ACLs. That explains 2014: the TCAM held about a million entries, but the default split gave IPv4 512,000.

## In the interview

Your platform should answer which route a destination uses and why, and show RIB against FIB, unresolvable next hops and ECMP width.

A follow-up the lesson expects. A router has 10.0.0.0 slash 8 from OSPF, 10.1.0.0 slash 16 as a static, and the same slash 16 from iBGP. Where does a packet for 10.1.2.3 go?

[pause]

Longest match first, so a slash 16, never the slash 8. Between the two slash 16s, distance decides: the static's 1 beats iBGP's 200. The wrong answer is OSPF, because 110 is lower than 200, which applies distance across prefixes of different lengths.

And another: show ip route has the route, but traffic is dropped. The RIB is not the FIB. The hardware table may be full, programming may have failed or lag, or a downstream router may lack the route. The wrong answer is "it must be a firewall".

## Recap

Four things to remember. Longest-prefix match runs per packet, before any notion of best; distance and metric only choose between routes for the same prefix. A BGP next hop is an exit, resolved through the IGP to a connected neighbour, and it picks only the first hop. The RIB is not the FIB, so compare them and the hardware's capacity. And chips meet a nanosecond budget with TCAM or algorithmic lookups in SRAM, while a hierarchical FIB decides whether a failure costs milliseconds or a minute.

At your desk: the tables, the lookup visualisation, the Python model, the exercise and the two practice problems.

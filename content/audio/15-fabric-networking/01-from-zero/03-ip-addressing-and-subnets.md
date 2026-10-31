---
lesson: ip-addressing-and-subnets
source: 9ec27051c175cdfd
fit: partial
desk:
  - "The binary place-value table, the address classes and the mask octet table"
  - "The subnet math visualisation and the 19 AND 240 bit visualisation"
  - "The Python subnet calculator and the Meridian address decoder"
  - "The special ranges table, the slash 31 counts and the link numbering alternatives"
  - "The leaf's interface address output, the IPv6 address fields and the SLAAC sequence diagram"
  - "Exercise: subnet math, including slash 31 and slash 32"
  - "Practice problems: ip-in-subnet and summarize-routes"
---
## Introduction

Every time a host sends a packet, it asks one question: is the destination on my own link, or elsewhere, so I hand it to my gateway? Every router asks a second: which row of my table covers this address? Both answer with the same operation, a bitwise AND of a number and a mask. And both fail in predictable ways when a mask is off by a bit, or two ranges overlap.

Meridian, the reference operator in this track, numbers every server, every fabric link, every router's own identity, a management network, and two tenants who both use the same subnet. So: addresses and masks, subnet math by hand, the private ranges, the two prefix lengths a fabric is built on, slash 31 for links and slash 32 for loopbacks, and the IPv6 essentials.

## Addresses and masks

An IPv4 address is a 32 bit number that identifies an interface, such as a server's NIC or one port of a router. People write it as four octets of 8 bits, each a decimal from 0 to 255. Acme's web server, acme-web1, is 10 dot 1 dot 1 dot 10. Tooling should store it as one integer: integers sort correctly, ranges become comparisons, and "is this address in that block?" becomes one AND.

An address alone says nothing about where the network ends. The original 1981 design fixed that boundary by the first bits of the address, in classes, and classes failed twice over. An organisation with 2,000 hosts was too big for a class C, which held 254, so it got a class B of 65,534 and left over 63,000 addresses idle. The alternative, eight class Cs, cost every internet router eight rows instead of one.

CIDR, classless inter-domain routing, arrived in 1993 and lets the boundary fall at any bit. Slash 24 says the first 24 bits are the network part, the prefix, and the rest is the host part. Neighbouring blocks can be advertised as one shorter prefix, called aggregation, which keeps the global table at about a million IPv4 prefixes. What still breaks is anything that infers the mask from the first octet: "10 means slash 8".

A prefix length has an equivalent subnet mask: that many one bits, then zeros. A slash 24 is 255 dot 255 dot 255 dot 0. Here is what makes the arithmetic easy: at most one octet of a mask is interesting, neither 255 nor 0.

## Subnet math by hand

Four values describe a subnet. The network address is the address AND the mask: network bits pass through, host bits are cleared. The broadcast address has every host bit set, and reaches every host on the subnet. The hosts lie between the two. And the usable count is 2 to the number of host bits, minus 2, because the all-zeros value names the network and the all-ones value is the broadcast.

For acme-web1, slash 24, the boundary falls between octets, so you read it off: network dot 0, broadcast dot 255, hosts dot 1 to dot 254, 254 of them. The on-link test is the same AND on the destination. 10 dot 1 dot 1 dot 11 gives my own network, so deliver directly. 10 dot 1 dot 2 dot 20 does not, so send to the gateway.

Now the case that trips people up, and the one interviewers ask: a boundary inside an octet. Take 10 dot 254 dot 19 dot 9 slash 20. A slash 20 is two full octets plus 4 bits, so the interesting octet is the third, and its mask value is 240. The block size is 256 minus 240, which is 16, so networks start at 0, 16, 32, 48. Before I tell you: what is the network address?

[pause]

Round 19 down to a multiple of 16: the network is 10 dot 254 dot 16 dot 0. The next network starts at 32, so the broadcast is 10 dot 254 dot 31 dot 255, and twelve host bits leave 4,094 hosts. That rounding is the AND on the one octet that matters: 19 AND 240 keeps the top four bits, which is 16.

At Meridian, though, that slash 20 is not a subnet on any wire. It is a planning block, reserved for every fabric link in Singapore and carved into slash 31s. A subnet's hosts share a link; a block appears in a routing table at most as a summary, and its "4,094 hosts" mean nothing.

A mask one bit wrong does not stop a host sending. It makes the on-link test wrong for some destinations, so the symptom is always partial. Picture acme-web1 typed as slash 16. The database, 10 dot 1 dot 2 dot 20, on another VLAN, now looks on-link. The server ARPs for it, and nobody answers. It reaches the internet and its own subnet, but not the database, and its neighbour table shows the database as incomplete. Too long fails differently: a host at dot 200 slash 25 sits in the upper half, its gateway dot 1 in the lower half, so Linux refuses the default route and everything off-link fails from boot. The prevention is a check that every address on a VLAN uses the gateway's prefix length.

## Private ranges

Three ranges are private: 10 slash 8, 172 dot 16 slash 12, and 192 dot 168 slash 16. No internet router carries them, so anyone may reuse them, and must translate them with NAT to reach the internet. Note the middle one: a slash 12, running all the way to 172 dot 31. A check for addresses starting 172 dot 16 misclassifies fifteen sixteenths of it. And 100 dot 64 slash 10 is carrier-grade NAT space: reserved, but not private.

Private space exists because of scarcity: the last free slash 8s were handed out in February 2011, and public IPv4 addresses now trade at tens of dollars each.

Two consequences shape a fabric. Reuse creates overlap on purpose: Acme and Globex both use 10 dot 1 dot 1 dot 0 slash 24, kept apart by a VRF per tenant, a separate routing table, so the lookup key is the VRF and the address together. And overlap you did not plan is an outage. Docker's default bridge claims 172 dot 17 slash 16. Had Meridian's management network used that range, a monitoring host running Docker would route management traffic into its own bridge and lose every device. Meridian's 172 dot 16 escapes by luck, not by a check.

## Links and loopbacks

A fabric link connects exactly two routers. The smallest ordinary subnet with two hosts is a slash 30, four addresses, half of them spent on a network and a broadcast address a two-ended link has no use for. RFC 3021 defines the slash 31: two addresses, both usable.

Meridian computes every link address from the two device names. Each spine owns a slash 24, each leaf takes the next pair, the spine gets the even address and the leaf the odd one. Leaf1 to spine1 in Amsterdam is 10 dot 254 dot 1 dot 0 slash 31: spine dot 0, leaf dot 1. Even and odd tell you which end you are looking at, and each site's slash 20 summarises all its links in one route. It has one seam: Amsterdam's four spine blocks start at 1, not a multiple of 4, so they are not one slash 22. Alignment has to be designed in.

A slash 31 breaks when the ends disagree: the spine has a slash 31, the leaf was typed as a slash 30, and the leaf sees its peer's address as its own network address, which some stacks will not send to. The link is up, but ping fails. The check is mechanical: both ends in one slash 31, one even, one odd.

A loopback is a virtual interface attached to no cable, up whenever the router is up. Meridian gives each device one slash 32, a single address: leaf1 in Amsterdam is 10 dot 255 dot 1 dot 11. Why does every router have one? Here is the story. Leaf1 runs its iBGP session to the route reflector, rr1. Suppose it used its link address. A backhoe cuts the fibre from leaf1 to spine1. The address goes down with the link, the TCP connection under BGP dies, and every overlay route the session carried is withdrawn, while three uplinks still work perfectly.

With loopbacks at both ends, the same cut is a non-event. The underlay reroutes to the reflector through spines 2 to 4 within milliseconds to a few hundred milliseconds, TCP may retransmit a segment, and the session never notices, because its hold timer is typically 9 seconds in data center fabrics.

The loopback does three more jobs. It is the router ID, unique and stable. It is the VXLAN tunnel endpoint, so spines need routes to leaf loopbacks and to no tenant prefix. The rule that falls out: the underlay's whole job is to make every loopback reachable from everywhere.

It breaks when a loopback is configured but never advertised, so sessions to it never come up and tunnels towards it black-hole, or when a copied configuration gives two devices one loopback and traffic for one goes to the other. The signal is one number: slash 32 routes in each site's loopback range, against the devices the inventory expects.

## IPv6 essentials

IPv6 addresses are 128 bits, written as eight groups of hex, with the longest run of zero groups replaced once by a double colon. The size changes three habits: LANs are always slash 64, every interface creates an address for itself, and hosts configure themselves from what the router announces.

Why a slash 64, even for three hosts? SLAAC, stateless address autoconfiguration, builds an address by appending a 64 bit interface ID to a 64 bit prefix. Give a LAN a slash 80 and SLAAC breaks; Android, which does not support stateful DHCPv6, gets no address. Nobody counts hosts; a site's slash 48 holds 65,536 slash 64s, and that is the planning unit. Router links may use slash 127, the equivalent of a slash 31. And there is no broadcast; multicast replaces it.

Every interface also has a link-local address, starting F E 80, valid only on its own link. IPv6 routes use the neighbour's link-local address as the next hop.

Follow acme-web1 configuring itself. It forms its link-local address, marked tentative, and runs duplicate address detection: a Neighbor Solicitation for its own address, and no answer within about a second means unique. It sends a Router Solicitation. Leaf1 answers with a Router Advertisement carrying the slash 64 for VLAN 100, a flag saying "build an address from me", lifetimes and the MTU. The host appends its interface ID, checks for duplicates again, and installs a default route via leaf1's link-local address.

That is zero-configuration addressing with no server and no shared state. How it breaks: any device on the link can send a Router Advertisement. A misconfigured VM announces itself, hosts install a second default route, and IPv6 traffic from part of the VLAN vanishes. The signal is a default route via an unexpected link-local address; the fix is RA Guard on host ports. And never filter ICMPv6 wholesale: that breaks neighbour discovery and SLAAC at once.

## In the interview

In production, three failures recur: a duplicate address flipping between two MACs, an unplanned overlap such as a container bridge, and two ends of a link typed differently. All three point to one source of truth that generates every address, and a platform that decodes any address you paste: "leaf5 in Singapore, link to spine3, leaf end".

An interviewer asks: how many usable hosts in a slash 27, and in a slash 31?

[pause]

A slash 27 has 5 host bits: 32 addresses, 30 usable. A slash 31 has 2, both usable on a point-to-point link under RFC 3021, because a two-ended link needs neither a network nor a broadcast address. The wrong answer is "zero", the classic rule applied where it no longer holds.

And: a server reaches the internet but not a database in another subnet of the same data center. Scope first: one server, or all of them. Then the server's own routes and prefix length. A mask too short makes the database look on-link, so the server ARPs for it in vain, while the internet, off-link either way, works. The wrong answer is going straight to firewall rules.

## Recap

Five things to remember. The network address is the address AND the mask, and the block-size method, 256 minus the interesting mask octet, then round down, is that AND in your head. A slash 20 of links is a planning block, not a subnet. The private 172 range is a slash 12, and a reused tenant address means nothing without its VRF. Links are slash 31s because two ends need no broadcast; loopbacks are slash 32s that survive any single link failure, so every loopback reachable is the underlay's health check. And every IPv6 LAN is a slash 64 because SLAAC needs it.

At your desk: the binary and mask tables, the two bit-by-bit visualisations, the Python calculator and address decoder, the ranges and link-numbering tables, the IPv6 fields and the SLAAC sequence, the subnet exercise, and the practice problems ip-in-subnet and summarize-routes.

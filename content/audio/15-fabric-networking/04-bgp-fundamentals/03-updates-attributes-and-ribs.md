---
lesson: updates-attributes-and-ribs
source: c04048918c5dce4f
fit: partial
desk:
  - "The UPDATE field table, the prefix-packing table, and the Python that builds and parses ISP2's 70-byte UPDATE"
  - "The attribute flag table and the hex walk through each attribute"
  - "The RIB flow diagram and the RIB visualisation: one UPDATE from ISP2 through gw2.ams"
  - "The seven-step trace table and the illustrative BGP table and routing table output"
  - "The pipeline model in code and its three runs, ending in the withdrawal"
  - "The multiprotocol reach field table, the address family table and the EVPN type-2 route"
  - "The failure-mode and trade-off tables, and the export audit code"
  - "Exercise: decode an UPDATE"
---
## Introduction

An established BGP session carries nothing by itself. Routes move only in UPDATE messages, and what a router does with each one decides where traffic goes. Most BGP mysteries live in that chain: the peer sent two prefixes and the router shows one; the route is in the BGP table and traffic ignores it; a neighbour received a route nobody meant to send.

Follow one UPDATE through one router. Meridian's Amsterdam border gateway, gw2.ams, has just got its eBGP session to ISP2, AS 64502, back after maintenance. Until now it reached 192.0.2.0 slash 24, a content network's prefix in AS 64511, through gw1.sin in Singapore over iBGP. Meridian is AS 64500 and announces 203.0.113.0 slash 24. All these addresses and AS numbers come from the ranges reserved for documentation.

Four stops: inside an UPDATE, the six attributes, the tables a route passes through to the forwarding chip, and how the same message carries IPv6, VPNs and EVPN.

## Inside an UPDATE

An UPDATE does two jobs. It can withdraw prefixes the sender no longer offers, and it can announce prefixes with the path attributes that describe how to reach them. BGP calls the prefixes NLRI, network layer reachability information.

ISP2's UPDATE is 70 bytes. A 19-byte header. A length saying there are no withdrawals. Another length saying 38 bytes of attributes follow: origin, AS path, next hop, MED and communities. And in the last 9 bytes, two prefixes: the slash 24, and 192.0.2.128 slash 25.

Four rules follow. First, one set of attributes per message: those 38 bytes describe every prefix in it. With these attributes, one 4,096-byte message could carry 1,008 slash 24s. Real tables pack far worse, so a full table of about a million IPv4 prefixes takes on the order of a hundred thousand UPDATEs or more.

Second, withdrawals carry no attributes, only prefixes: ISP2 withdrawing its slash 24 sends 27 bytes. Third, a new announcement replaces the old one. BGP keeps one path per prefix per peer, so a newer path silently replaces the old: an implicit withdraw. A session going down withdraws everything learned from it. Fourth, an empty UPDATE, 23 bytes, is End-of-RIB: the initial table is complete.

Prefixes are packed tightly: one byte for the length in bits, then only as many address bytes as it needs. A slash 24 takes three. So one wrong length byte corrupts every prefix after it.

Each attribute is a small type-length-value record, and two flag bits decide what a router does with one it has never heard of. Well-known attributes every speaker understands; origin, AS path and next hop must be in every announcement. An unknown optional transitive attribute is passed on, which is how communities, once new, spread across an internet of old software. An unknown optional non-transitive one is dropped; MED is in that category.

Passing on what you cannot check has a cost. After one odd attribute reset sessions across the internet, RFC 7606 changed the response to most malformed attributes from resetting the session to treating that UPDATE's prefixes as withdrawn. The session survives, the routes vanish quietly, and only a treat-as-withdraw counter shows why.

## The six attributes

Origin is a code for how the route entered BGP: IGP, meaning it was explicitly listed to be announced, or incomplete, redistributed from elsewhere such as static routes. Lower is preferred, late in the decision process. It breaks quietly: one of two routers announcing a prefix switches to redistribution, and neighbours tied on everything earlier now prefer the other.

The AS path says where the route has been. Each AS prepends its own number when it sends a route over eBGP, so 64502 then 64511 means ISP2 heard it from the content network, which originated it. It prevents loops, since a router that sees its own AS in it discards the route, and it is a distance, counting networks, not milliseconds. Prepending your own number several times steers inbound traffic, and it has broken things: in February 2009 one small ISP's prepending error produced a path over 250 networks long that hit a bug in widely deployed router software and reset sessions far beyond it.

The next hop is the address to forward to. Over eBGP the sender writes its own address on the shared link, ISP2's 198.51.100.0. Over iBGP it passes unchanged by default, which is why Meridian's gateways rewrite it to their own loopback, next-hop-self. A route whose next hop does not resolve is kept but cannot be best: accepted, in the BGP table, invisible to forwarding.

Local preference is this AS's own opinion: higher wins, and it is the first real step of the decision process, ahead of path length. It is set on import and rides every iBGP UPDATE, so every router agrees on the exit. A question: gw2.ams sets local preference 300 on the routes it announces to ISP2, hoping ISP2 will prefer Meridian's link. What happens?

[pause]

Nothing. Local preference is never sent over eBGP, and one arriving from an eBGP peer is ignored: preference is an internal business decision. To steer a neighbour, you use MED, prepending or more-specific prefixes. Inside the AS, a missing set statement on one gateway shifts the whole AS's exit with nothing malformed to see.

MED, the multi-exit discriminator, is a neighbour's hint about which of its links to use: lower wins. It may go to iBGP peers but never on to another AS. Three rules surprise people. It is compared only between routes from the same neighbouring AS, unless always-compare is on. A route without MED counts as zero, the best value. And because it applies to some pairs of paths and not others, the winner can depend on arrival order.

Communities are tags with no built-in meaning, an AS number and a value; the AS defines the value. ISP2 tags the prefix with its own code for where it learned it, and Meridian adds 64500 colon 102, learned from ISP2 at gw2.ams. Policy elsewhere matches the tag instead of re-deriving the facts. Communities break when a provider strips them at its edge, and a customer's request to prepend towards Europe does nothing.

## Three RIBs, two policies

BGP's standard describes a router's memory as three kinds of RIB, routing information base. Adj-RIB-In, one per peer, holds routes as that peer sent them, before and after import policy. Loc-RIB holds the best path per prefix. Adj-RIB-Out, one per peer, is what this router last told that peer. Downstream sit the router's own RIB, merging every protocol, and the FIB, the copy in the forwarding chip.

Now the story. ISP2's UPDATE lands in its Adj-RIB-In, both prefixes, same attributes. Import policy runs on each route. Typical edge rules reject your own AS in the path, private ranges, your own prefixes, and anything longer than slash 24, the de facto limit for internet routes. The slash 24 passes and gets local preference 100 and Meridian's community. The slash 25 is rejected, and now exists only in the pre-policy view.

In the Loc-RIB the slash 24 has two paths, ISP2's over eBGP and gw1.sin's over iBGP. They tie on local preference, path length two, origin and MED. eBGP beats iBGP, so ISP2 wins. Its next hop resolves over the connected link, and the forwarding entry moves from Singapore, roughly 52 milliseconds away one way, to the ISP2 port.

Export policy decides what each neighbour gets. gw1.ams and gw1.sin get a 76-byte UPDATE with the next hop rewritten to gw2.ams's loopback. The AS path is unchanged, because a route gains an AS number only when it leaves the AS. ISP2 gets nothing new: only Meridian's own block goes to a provider. Sending ISP2's routes on to ISP1 would offer free transit between two providers, which is a leak.

Two fixed rules shape the output: a path learned from one iBGP peer is never sent to another, and BGP sends only differences from the Adj-RIB-Out. Then ISP2 withdraws the slash 24, and gw2.ams's best path becomes gw1.sin's, learned over iBGP. Before I tell you: what does gw2.ams now send gw1.ams?

[pause]

A withdrawal. It last told gw1.ams about ISP2's path, and its new best came from an iBGP peer it may not relay, so the diff produces a withdrawal, and gw1.ams falls back to the path it already holds from gw1.sin.

Now the rejected slash 25. Without a pre-policy copy, a prefix the peer sent and policy rejected looks exactly like one it never sent, and the ticket goes to the wrong team. Soft reconfiguration keeps the whole pre-policy table, a hundred megabytes or more per full-table peer. Route refresh asks the peer to resend with no reset. BMP, the BGP Monitoring Protocol, streams the pre-policy view to a collector.

## From best path to forwarding

The best path is BGP's proposal for forwarding, not the decision. Three gates stand between it and a packet. First, the next hop must resolve, which turns underlay trouble into BGP trouble.

Second, the RIB manager compares protocols by administrative distance, a trust ranking. Cisco and FRRouting use 20 for eBGP and 200 for iBGP, so IS-IS, at 115, beats iBGP but loses to eBGP. A static route to 192.0.2.0 slash 24 forgotten on gw2.ams has distance 1 and wins, and BGP's best is marked not installed.

Third, hardware must accept it. Programming runs at thousands to tens of thousands of routes a second, so a full table takes tens of seconds to minutes, and a write can fail when a hardware table is full.

And multipath: paths that tie down to IGP cost are installed together as equal-cost next hops, while BGP still advertises one best path.

## Multiprotocol BGP

Everything so far was IPv4. RFC 4760 extended BGP without changing the message, adding two optional non-transitive attributes: multiprotocol reach, announce these, and multiprotocol unreach, withdraw these. Each is labelled with an address family: an AFI, address family identifier, and a SAFI, subsequent address family identifier. Each side lists its families in its OPEN, and a session carries only those both listed.

When gw2.ams announces Meridian's IPv6 block, the family is AFI 2, IPv6, with SAFI 1, unicast, and the next hop and prefix travel inside the reach attribute. The same machinery carries provider VPNs, EVPN at AFI 25 and SAFI 70, and filters against attack traffic.

VPN families solve one problem. Acme and Globex both use 10.1.1.0 slash 24. Advertised plainly, those are two paths to one prefix, BGP picks one, and one tenant's traffic goes to the other. So every route is prefixed with an eight-byte route distinguisher, the leaf's loopback and a VNI, and now they are different NLRI that both survive best-path selection. The RD only separates. Who imports a route is decided by the route target, an extended community: 65000 colon 50001 goes into Acme's VRF, its own routing table, and 65000 colon 50002 into Globex's.

EVPN's NLRI is a typed record, not a prefix. The type-2 route leaf1.ams sends for acme-web1 carries a route distinguisher, a MAC address, the IP 10.1.1.10 so remote leaves can answer ARP locally, and the VNIs VXLAN will carry.

Why one protocol? Every family inherits the transport, policy, reflectors, decision process and tooling. The cost is fate sharing: a reset triggered by one family takes down every family on the session, and a family enabled on one end only leaves an established session carrying nothing for it.

## What to measure, and the interview

The core view is the per-peer, per-family funnel: received before policy, accepted after it, best, installed, advertised. Each gap names a stage: import policy, then the decision process or an unresolved next hop, then the RIB or hardware. ISP2's numbers: received 2, accepted 1, best 1.

Watch exports too, because leaks are what you send. The fastest leak detector is a set difference: what each provider was sent, against what the source of truth says to announce. An extra prefix towards a provider is a leak; a missing one is an inbound outage. Engineers need the prefix list; managers need "is anything leaking right now, yes or no".

The interview question: BGP shows the route as best, but traffic does not follow it. Why?

[pause]

Because the best path is a proposal. Another protocol may win the RIB on administrative distance, hardware may not have programmed it, multipath may spread the traffic, or the next router may choose differently. Compare BGP, RIB and FIB on the device, then walk the path. The wrong answer is "BGP best means forwarding", or blaming a firewall first.

## Recap

Five things to remember. An UPDATE is withdrawals, one attribute set and its prefixes, and a newer path from a peer replaces the old one. Local preference stays inside your AS, and MED is compared only between routes from one neighbour. A route flows from Adj-RIB-In through import policy to the Loc-RIB, then through export policy to Adj-RIB-Out, and BGP sends only the diff. The best path is a proposal that must still resolve, win the RIB and reach hardware. And multiprotocol BGP is new NLRI on the same machinery, with the RD for uniqueness and the RT for import.

At your desk: the UPDATE byte layout and parser, the RIB visualisation and trace, the pipeline model, the address family tables, and the decode-an-UPDATE exercise.

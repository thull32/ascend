---
lesson: how-the-internet-is-glued-together
source: 69c959fcc6cf7da0
fit: great
desk:
  - "The relationship table: transit, settlement-free peering, paid peering, partial transit and siblings"
  - "The peering arithmetic in Python, with the break-even at four transit prices"
  - "The exchange diagram, the packet traced across the peering LAN, and the path-hiding table"
  - "The valley-free visualisation: six networks, the export rule, then the leak that makes a valley"
  - "The valley-free simulator and its output, with three rows traced by hand"
  - "The forwarding-table fill projection and its four hardware rows"
  - "The interconnection fabric product table, the failure-modes table, and the trade-offs across seven ways to reach another network"
---
## Introduction

Meridian sends about 25 gigabits per second to the internet at its busiest, and every bit crosses a link somebody pays for. Its border gateways reach the world through two providers: ISP1, AS 64501, and ISP2, AS 64502, which both buy from a transit provider, AS 64496. Meridian itself is AS 64500. The routes BGP chooses from exist only because of contracts: who agreed to carry whose traffic, at what price, and to whom each network passes the routes it hears. Forget one line of export filter, and Meridian's links fill with strangers' traffic.

Coming up: the two contracts and the tier-1 networks at the top; internet exchanges and their route servers; the valley-free rule, with a leak that breaks it; the full table and what it does to hardware; and how clouds and interconnection fabrics plug in.

## Transit, peering and the tier-1 clique

The global table carries routes from roughly 75,000 networks, and almost every link between two of them is one of two business relationships.

Transit is reachability for sale. A provider carries a customer's traffic to and from the whole internet. It sends the customer every route it has, a full table, or just a default, and announces the customer's prefixes to everyone. The customer pays per megabit at the 95th percentile.

Peering is a swap. Two networks exchange traffic between their own customers, each sending only its own and its customers' prefixes, never the full table. Most peering is settlement-free: neither pays, because each saves the transit it would buy to reach the other. ISP1 and ISP2 peer, so a packet between their customers crosses one free link instead of climbing to the transit provider and back down through two paid ones.

The point to hold: the routes are the product, and the relationship shows in what each side sends. Who peers with whom is negotiated under a published policy, open, selective or restrictive, and PeeringDB, a public database the networks maintain themselves, lists each one's policy and locations.

Peering still costs money. Should Meridian join the Amsterdam exchange? The lesson prices it with assumed numbers: a port, a cross-connect and a router port come to 4,000 dollars a month. At 25 cents per megabit, that buys 16 gigabits of transit, and only about 12.65 gigabits would plausibly move to peering. So at that price the exchange loses about 840 dollars a month. At 50 cents, in a less competitive market, it gains about 2,300. Networks peer anyway for what the arithmetic does not price: lower latency, capacity at peak, and a path that survives a provider failure.

At the top sit fifteen to twenty tier-1 networks. A tier-1 buys no transit. It reaches everything through its customers plus settlement-free peering with every other tier-1, so they must form a complete clique.

Before I tell you why: what happens if two tier-1s stop peering?

[pause]

The internet partitions. Neither buys transit, and a third tier-1 holds each one's routes as peer routes, which it passes only to its own customers. So a customer of only the first cannot reach the second's single-homed customers. In October 2005, Level 3 ended its peering with Cogent, and for a few days single-homed customers of each could not reach the other's. Sprint and Cogent repeated it in 2008.

Below the clique, tier-2 networks buy some transit and peer widely; stub networks like Meridian only buy. And the hierarchy has flattened. Most bytes now come from a handful of content and cloud networks with their own backbones, connected straight to eyeball ISPs, the access networks full of people watching. A video stream to a home typically crosses no tier-1 at all.

## Internet exchanges and route servers

Peering with 300 networks over private cables means 300 router ports. An internet exchange replaces them with one. It is a layer-2 switching fabric, often spread across several buildings in a city, where every member router sits on one shared subnet, the peering LAN. The exchange switches frames by MAC address; it does not route, and it never appears in the AS path. Because one bad member hurts everyone, exchanges police the LAN: one MAC per port, and no proxy ARP, since a router answering for addresses it does not own attracts other members' traffic.

Follow one packet. Meridian's gateway opens a session to the content network's router across the LAN. The content network announces its prefixes with a next hop that is its own LAN address, and Meridian gives them local preference 150, as a peer, above the 100 for provider routes. A packet comes along; the gateway resolves that next hop to a MAC and sends the frame out of its exchange port, and the exchange delivers it unchanged, hop limit untouched.

Now scale it. With 800 members, a full mesh is about 320,000 sessions, each negotiated by email. So exchanges run route servers: BGP speakers every member peers with once, which collect, filter and re-announce everyone's routes. Like a route reflector, it never forwards a packet, and it is transparent: it adds no AS number to the path and does not change the next hop, so traffic still goes member to member. One consequence: members must turn off the default check that the first AS in a received path is the neighbour's, or they reject everything.

Route servers give small networks filtering for free, built from the routing registries and RPKI. And they have a trap, path hiding. Two members announce the same prefix, and the one with the shorter path tags it "not to Meridian". A route server keeping one best path for everyone picks that one, cannot send it, and sends Meridian nothing, although a second peer path exists. Meridian's traffic goes over transit. The fix is a table per member. And since one outage drops every route-server session at once, exchanges run two, on different software.

## The valley-free rule

Every export decision so far follows one rule, written down by Lixin Gao and Jennifer Rexford in 2001 from how operators already behaved. Label each neighbour your customer, your peer or your provider. Routes from customers, and your own prefixes, go to everyone. Routes from peers and providers go only to customers. And on import, prefer customer over peer over provider, whatever the path length: Meridian uses local preference 200, 150 and 100. The rule follows the money. You carry traffic only when someone pays you to, or when it reaches your own customers.

The name comes from the shape of the paths it allows. Call customer to provider "up", peer to peer "across", provider to customer "down". Every permitted path goes up, across at most once, then down. A mountain, never a valley. A valley goes down and then up again: a network carrying traffic between two of its providers, paying both and earning nothing.

Here is how one breaks. The content network buys from ISP2. ISP2 learned its prefix from a customer, so it sends it to its peer ISP1. ISP1 learned it from a peer, so it passes it down to its customer Meridian, and not up to the transit provider. ISP1's traffic goes across to ISP2 and down. A mountain.

Then Meridian's export filter toward ISP1 is lost, and Meridian announces the route it learned from ISP2 back up to ISP1. ISP1 already has a shorter path through its peer. Which one does it use?

[pause]

The leaked one. It arrives from a customer, at 200 against the peer route's 150, and local preference is compared before path length. So ISP1's traffic runs down into Meridian and back up to ISP2, across Meridian's paid links. The valley. It took two mistakes: Meridian's export, and ISP1 accepting from a customer a prefix that customer never registered. In June 2019 the same pair of mistakes degraded parts of Cloudflare and other large networks for about two hours, which the next lesson, on leaks, hijacks and RPKI, takes apart.

The rule is load-bearing for a deeper reason. With arbitrary policies, BGP can chase preferences around a circle forever. Gao and Rexford proved that if every network prefers customer routes, exports by the rule, and none is indirectly its own provider, BGP settles without coordination. A stability guarantee bought with economics. Real networks bend it, with siblings and regional deals, so a valley in an observed path is a strong leak heuristic, not proof.

The newer defence tells BGP the relationship. RFC 9234 adds a role, checked by both ends when the session opens, and an Only-to-Customer stamp: a route that has come down or across may only keep going down. With roles on both ends, one missing export line no longer leaks. Deployment is still partial, so filters stay.

## The full table

A default-free router holds every prefix on the internet: in the mid-2020s, about a million IPv4 and 230,000 IPv6. IPv4 grows about 50,000 prefixes a year, IPv6 roughly 10 to 15 percent. The table outgrows the number of networks because exhausted IPv4 now moves on a transfer market in small blocks, each a new route, and because networks announce more-specifics to steer inbound traffic. What bounds it is a convention: nobody accepts IPv4 longer than a slash 24, which is why over half of IPv4 routes are exactly that size.

Two memories hold it, and they fail differently. The RIB, every path from every peer, sits in ordinary RAM, hundreds of megabytes: the easy part. The FIB, the best route per prefix, lives in the forwarding chip's lookup memory, fixed by the silicon, where an IPv6 entry often costs two or four IPv4 slots.

On 12 August 2014 the IPv4 table passed 512,000 routes, the default hardware partition on a widely deployed generation of older routers. Routes beyond it could not be installed, and several ISPs had outages despite months of warning. The 768,000 threshold in 2019 did far less damage, because operators had re-partitioned.

That is also why a fabric never sees the full table. Leaf and spine chips hold at most hundreds of thousands of entries. Meridian takes full tables only on its two gateways; spines and leaves get a default route. When a FIB fills, new routes are silently not installed with every session still up, so watch chip utilisation against a projected fill date.

## Clouds and interconnection fabrics

Content networks peer as widely as they can, build private interconnects, dedicated cross-connects of 100 or 400 gigabits, once traffic outgrows an exchange port, and put caches inside eyeball ISPs. Clouds sell dedicated private connections built from pieces this track already covered: a port on the cloud's router, a VLAN per logical connection, and an eBGP session per VLAN, ideally with BFD. The customer announces its prefixes within a limit. AWS documents 100 per session on a private virtual interface. Advertise more and the session goes to Idle: a cliff, not a warning.

Finally, what a public interconnection fabric sells. Acme, in a colocation campus, needs three clouds, two software providers and a partner: six fibre runs, six ports, six orders, each taking days to weeks. Instead it buys one port into an operator's switching fabric, two for redundancy, and creates virtual connections through an API, each a layer-2 path at a bandwidth tier, provisioned in minutes. Underneath is exactly the fabric this track builds: leaves, an EVPN service instance per connection, a backbone between metros, a policer enforcing the tier, and automation turning an API call into configuration on two leaves. It sells time, reach, elasticity and fewer ports.

The boundary shapes how it fails. The customer's BGP to the cloud rides through, unseen by the fabric. A burst above the tier is dropped by the policer, which looks like random loss while port and session are clean. So the signals must be per virtual connection: state at both ends, policer drops per direction, and an end-to-end probe.

## In the interview

The platform should check each session's relationship against its policy, audit what you export to providers and peers, and track FIB headroom.

The follow-up the lesson expects. What is the difference between transit and peering, in BGP terms?

[pause]

A transit provider sends you every route and announces yours to everyone, and you pay. A peer sends only its own and its customers' routes, usually for free, so it never gives you a path to the rest of the internet. The routes exchanged are the contract. The common wrong answer is that peering is a direct connection and transit goes through someone else, when both can be the same cable in the same building. And never call valley-free loop prevention: the AS path check prevents loops; valley-free prevents carrying traffic nobody pays for.

## Recap

Five things to remember. Transit and peering are defined by the routes each side sends. Tier-1s must peer in a complete clique, or the internet partitions. An exchange is a layer-2 LAN, and its route servers keep the next hop and stay out of the AS path. Valley-free is export plus preference, it makes BGP converge, and one missing filter makes a valley that customer preference amplifies. And the full table lives in forwarding memory, which is why 512k day happened and why fabric switches get a default.

At your desk: the relationship, path-hiding and trade-off tables, the peering arithmetic, the valley-free visualisation and simulator, and the table-fill projection.

---
lesson: policy-and-communities
source: 5b41a503ae11c3f8
fit: great
desk:
  - "The community-policy visualisation: tags set at import, matched at export, and the no-export slash 25 held inside AS 64500"
  - "The policy flow diagram, the session summary output and the prefix-list match table"
  - "The route-map evaluation table, the ISP1 import trace, and the well-known communities table"
  - "The attribute byte tables and the code that encodes standard, extended and large communities"
  - "The edge model in Python and its three runs, with the failure-mode and trade-off tables"
  - "Exercise: run a route map over a batch of routes"
---
## Introduction

Meridian's border gateway in Amsterdam, gw1.ams, hears about a million routes from its transit provider and a handful from a customer. For each one it must answer two questions. Do I believe this? And whom do I tell?

The best-path algorithm answers neither; it only picks the best of several paths to one prefix. The answers are policy: rules an operator writes, run on every route crossing every session. A customer pays to reach the whole internet, a peer swaps its customers' traffic for yours at no charge, and a transit provider is paid to carry yours.

The setting: Meridian is AS 64500 and announces 203.0.113.0 slash 24. gw1.ams has a customer, AS 64505, with 198.51.100.0 slash 24, and the transit provider ISP1, AS 64501. The second gateway, gw2.ams, peers with a content network, AS 64511, which owns 192.0.2.0 slash 24. The gateways talk iBGP. All these numbers are reserved for documentation.

Coming up: where policy runs, how it matches, three kinds of community, four well-known ones, and the design that ties them together: tag at ingress, act at egress.

## Import and export

Policy runs at two points on every session. Import policy runs once on each route as it arrives. It accepts or rejects it and sets what the decision process reads: local preference, and communities, the tags we will meet shortly. Import is where you express preference, and a route rejected there can never be used or passed on.

Export policy runs per neighbour, on best paths only. It decides what that neighbour learns, and can prepend, set MED, or add and strip communities. Export is where you express obligation and restraint.

Routes flow one way and traffic the other. When Meridian advertises the content network's prefix to ISP1, it offers to carry ISP1's traffic for it. So export is the dangerous direction: a route sent by mistake is an offer the internet may accept within seconds. RFC 8212 now says an eBGP session with no policy sends nothing; for decades many platforms sent everything.

A healthy edge shows three numbers per session: received, accepted and advertised. The customer sent 3 routes, 2 were accepted, and it is advertised the full table, about a million, because it pays for the whole internet. ISP1 sent about a million, import dropped 17 bogons and over-long prefixes, and ISP1 is advertised exactly 2 routes: Meridian's block and the customer's. A million there would be a leak.

## Prefix lists and route maps

A prefix list is an ordered list of entries, each a block and an allowed range of prefix lengths. A route matches when its network lies inside the block and its own length falls in the range. With no range, an entry matches only that exact prefix.

Meridian's customer filter is 198.51.100.0 slash 24, lengths 24 to 25. The slash 24 matches, and so does its upper half, a slash 25. A slash 26 inside the block is too long. And 198.51.0.0 slash 16 fails too: it contains the block, it is not inside it.

Real lists are generated from the routing registries and RPKI, never typed, beside a bogon list that refuses private space and any IPv4 prefix longer than a slash 24. The classic bug is the missing range: an exact-match entry silently rejects the customer's slash 25, the session stays up, and a week later the customer reports that its traffic engineering does not work.

A route map is the program around the lists: ordered terms, each with match conditions, permit or deny, and set actions. Conditions test the prefix, communities or the AS path, and all of a term's conditions must hold. Know how evaluation ends, because platforms differ. On route maps, the first matching term decides and a route matching nothing is dropped. On Junos, a route that falls off the end reaches the BGP default, which accepts unless the RFC 8212 behaviour is on.

Trace one. Meridian's import policy from ISP1 has three terms. Term 10 denies bogons and anything inside Meridian's own block. Term 20 matches the graceful shutdown community and permits with the transit tag, 64500 colon 300, and local preference 0. Term 30 permits everything else with the same tag and local preference 100. The content network's prefix via ISP1 falls to term 30. 10.0.0.0 slash 8 is a bogon, denied. A slash 25 inside Meridian's own block, a possible hijack, is denied. And the customer's prefix arriving through ISP1 with graceful shutdown gets local preference 0, used only if nothing else exists.

Before I tell you: what happens if someone swaps terms 10 and 20?

[pause]

A bogon tagged graceful shutdown is accepted. Order is meaning.

## Communities

A prefix list classifies a route only where it arrives, but the router that later exports it is often a different one, which knows only what the route carries. Communities let a route carry a label.

The standard communities attribute, from RFC 1997, is a list of 32-bit values written as two halves: an AS number, a colon and a value. The high half says whose dictionary it belongs to: 64500 colon 100 means whatever AS 64500 says it means. The attribute is optional and transitive, so a router that does not understand it must pass it on, and communities travel to the next AS and beyond unless someone strips them. Meridian strips its internal tags on the way out and treats communities arriving from outside as untrusted input.

By convention there are informational communities, which record facts, like Meridian's "learned from a customer", and action communities, requests a neighbour promises to honour: a transit provider might let a customer send 64501 colon 70 for "set my local preference to 70", or 64501 colon 666 for "discard traffic to this prefix".

Extended communities are 8 bytes, with a type and subtype. Their main user is VPN and EVPN routing, where the route target says which tenant tables import a route; Acme's segment uses 65000 colon 10100. A route target is a community used as policy, which is why one copied by mistake from one tenant to another leaks routes between them.

Large communities exist because four-byte AS numbers broke standard ones: AS 4200000010 does not fit in a 16-bit half. RFC 8092 uses three 32-bit fields, which invites the convention AS, function, parameter. Meridian's 64500 colon 10 colon 1 means "learned in Amsterdam".

## Well-known communities

Four reserved values matter, in two pairs: two that BGP enforces, and two that are only requests.

No-export means do not advertise to any eBGP neighbour. No-advertise means do not advertise to anyone, not even iBGP peers. The router checks both before export policy, so no permissive policy overrides them. Typically the sender sets it: Meridian's customer has two links and announces its slash 25 tagged no-export beside its slash 24. Inside Meridian the slash 25 steers that half onto one link; the internet sees only the slash 24. It breaks quietly: many edges delete every community arriving from outside, and on some platforms that deletes the well-known values too, so the slash 25 escapes. The signal is the slash 25 in public route collectors such as RouteViews.

Graceful shutdown solves planned maintenance. Shutting an eBGP session withdraws its routes, and for seconds to minutes, other routers still forward towards a path that is gone. So Meridian moves the traffic first. gw1.ams re-advertises Meridian's slash 24 to ISP1 tagged graceful shutdown; ISP1's import policy sets local preference 0, and inbound traffic moves elsewhere. gw1.ams also sets local preference 0 on its ISP1 routes over iBGP, so outbound traffic moves too. Both directions move while the old path still works, and the ISP1 counters fall to near zero. Only then is the session shut, and its withdrawals change no best path. But the community is a request: if the counters do not fall, ISP1 has no matching import term, and shutting the session will drop traffic.

Blackhole is for an attack. A denial-of-service floods 203.0.113.50 with 300 gigabits per second, while Meridian's links to each ISP are 100 gigabits. Filtering on gw1.ams is too late; the links are full first. So Meridian announces that single address, a slash 32, to both ISPs with the blackhole tag plus no-export. ISP1 accepts it only because it carries the tag and lies inside Meridian's registered space, and points it at a discard next hop. The trade: that one address goes dark for everyone, and the other 255 survive. Honour such a tag from the wrong session and anyone can make you drop a victim's traffic.

## Tag at ingress, act at egress

Put the pieces together and you get the design almost every multi-homed network uses: classify each route once, on the session where it enters, with a community, and make every later decision by matching it.

The reason is mechanical. gw2.ams exports the customer route gw1.ams learned, but over iBGP it sees only a prefix, an AS path and a next hop. Whether AS 64505 is a customer or a provider is a commercial fact that is nowhere in the route unless someone wrote it there. Tags also scale: a million transit routes become one class.

Meridian's plan: customer routes get 64500 colon 100 and local preference 200; peer routes 64500 colon 200 and 150; transit 64500 colon 300 and 100. The order follows money: customers pay, peers are free, transit costs. Exports follow the same economics. Customers receive everything. Peers and transit receive only Meridian's own prefixes and its customers', because anything else means carrying traffic between two networks that pay Meridian nothing.

The lesson runs this edge as a model. As designed, the peer's and the customer's own paths beat ISP1's, so Meridian pays no transit for traffic it can deliver directly, and the bad routes die at import. Then one thing breaks: the gateways stop sending each other communities over iBGP. On several platforms a neighbour gets no communities unless told to send them, and a rebuilt template can drop that setting without an error. gw2.ams now sees the customer's routes untagged. Its export is an allow-list, permit Meridian's block and permit customer tags, so the peer stops receiving the customer's prefix. A ticket, but no leak: an allow-list fails closed.

Now keep the broken iBGP and write export the tempting shorter way: deny peer and transit tags, permit the rest. What leaks?

[pause]

Two things. gw1.ams offers ISP1 the peer's prefix, so Meridian would carry ISP1's traffic to its peer for free over a link it pays for. And gw2.ams sends the customer's slash 25 to the peer, because no-export was a community too, lost with the rest. A deny-list fails open. An independent audit that ignores tags, checking the AS path against the customer list, catches both.

That is no hypothetical. On 24 June 2019 a small US network passed one provider's routes, including tool-generated more-specifics, to a large transit network that accepted them unfiltered. For about two hours traffic for parts of Cloudflare, Amazon and others crossed a network that could not carry it.

The platform should show received, accepted and advertised per session against a baseline; for any route, the term that decided; alarms on peer or transit tags sent upstream and on untagged external routes; the tag-blind audit; and policy changes reviewed as a diff in routes, not lines.

## In the interview

What does no-export do, and what doesn't it do?

[pause]

A route carrying it goes to iBGP peers and to no eBGP neighbour, checked before export policy. You usually attach it on export, to ask a neighbour to keep a more-specific to itself. It does not stop anyone using the route, and a "delete all communities" on import can remove it. The common wrong answer is "it stops my router exporting the route I tag", when the tag constrains whoever holds the route, including the neighbour you send it to.

And a second: a customer says its new prefix is not reachable from the internet. Where do you look?

[pause]

Scope first: from where, since when. Then walk the route: received on the customer session, accepted or denied by a stale prefix list, tagged as a customer route, advertised to transit and peers. Then outside, in public collectors and the upstreams' looking glasses, because upstreams filter on registry and RPKI data too. The wrong answer is checking only that the session is Established. It is honest to defer to the network team on upstream filtering, and offer to build the screen that answers this.

## Recap

Five things to remember. Import decides what you believe; export decides what you offer to carry, and is where incidents start. A prefix list needs its length range, and in a route map, order is meaning. Communities are tags that travel with a route: standard for the internet edge, extended for route targets, large for four-byte AS numbers. No-export and no-advertise are enforced by BGP itself; graceful shutdown and blackhole are requests, so check the receiver honours them. And tag at ingress, act at egress, with export as an allow-list so a lost tag fails closed, plus an audit that ignores tags.

At your desk: the community-policy visualisation, the policy diagram and session output, the route-map and well-known tables, the community byte encodings, the edge model and its three runs, and the route-map exercise.

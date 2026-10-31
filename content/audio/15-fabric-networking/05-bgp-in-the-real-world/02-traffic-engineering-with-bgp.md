---
lesson: traffic-engineering-with-bgp
source: 69f4437be8a5e4f1
fit: great
desk:
  - "The two-ISP visualisation: local preference, prepending, the community and the more-specifics, then the failover"
  - "The topology table, the illustrative BGP table and looking-glass outputs, and the AS path and communities attribute field tables"
  - "The propagation simulation and its five steps, with AS 64504 traced by hand"
  - "The failover timeline, the failure-mode table and the tools side by side"
  - "The edge report code: route collector views, the backup check and 95th percentile billing"
---
## Introduction

"You have two ISPs. Prefer ISP1 for traffic in both directions, and fail over to ISP2 if ISP1 goes away. How?" Network organisations ask some form of this in almost every BGP interview, and the strong answer turns on one asymmetry.

Traffic leaving your network follows a decision your own routers make, so one attribute controls it exactly. Traffic arriving follows decisions made by every other network, each with its own policy. You can only change what you tell them, and measure what they do. So give each direction its own tool, say which networks each tool cannot reach, and prove the backup works before you need it.

The setting is Meridian's internet edge in Amsterdam. Meridian is AS 64500 and announces 203.0.113.0 slash 24. The border gateway gw1.ams connects to ISP1, AS 64501, gw2.ams connects to ISP2, AS 64502, and the two gateways run iBGP with each other. All these numbers come from ranges reserved for documentation.

Why prefer one ISP? Usually money. Transit is commonly billed at the 95th percentile: the provider samples the port every 5 minutes, sorts the month's 8,640 samples, throws away the top 5 percent, which is 432 samples or 36 hours, and bills the highest rate left. Meridian commits 10 gigabits per second to ISP1 at a good price and 1 gigabit to ISP2, so ISP2 must stay nearly idle except in an outage.

Without policy, traffic splits both ways. Outbound, each gateway prefers its own ISP. Inbound, three networks matter: a content network, AS 64511, on both ISPs, whose last tie-breaker happens to favour ISP2; a broadband network, AS 64503, on ISP2 only; and an enterprise, AS 64504, on both, preferring ISP2 because that port is flat-rate. Meridian pays ISP2 for traffic it wanted on ISP1.

Coming up: one tool for traffic out, four for traffic in, the failover with timings, anycast, and the edge of what you control.

## Traffic out: local preference

Local preference is an attribute set by import policy where a route enters the AS. Higher wins, the default is usually 100, and it is the first thing the decision process compares. It travels on every iBGP session, so every router in the AS sees the same value, and RFC 4271 forbids sending it to an external peer.

gw1.ams gets one rule: every route learned from ISP1 gets local preference 200. Now gw2.ams, holding two paths to the content network, stops comparing at the first step. 200 beats 100, and gw2 sends outbound traffic across the fabric to gw1, whose loopback is the next hop because gw1 sets next-hop-self on iBGP.

Two production details. gw1 has no pre-learned backup: gw2's best path is now the iBGP one, so it advertises nothing about ISP2's routes, and on failure it must first select and send them. Advertise-best-external and ADD-PATH pre-load that backup. And the leaves reach the gateways by a default route, so gw1 originates it with a better metric; otherwise half the flows reach gw2 first and cross the fabric again.

It breaks when the policy reaches one gateway and not the other, when iBGP between the gateways is down, or when the next hop does not resolve. The signal: egress bytes per ISP port against intent, and the local preference of a few canary prefixes on every border router.

## Traffic in: prepending and MED

For inbound traffic the deciders are other networks, and Meridian sets nothing in their routers. It controls three things: which prefixes it announces, to which neighbour, and with which attributes. Every ingress tool is one of those, and each acts at a different step of someone else's decision.

Here is the map, earliest step first. Longest-prefix match, before BGP compares anything: a more-specific prefix announced to one ISP acts there. The remote network's own local preference: only an upstream's published community reaches it. AS path length: prepending. MED: one neighbour with several links. The remote network's internal cost to its exit and the router ID: nothing. The earlier the step, the stronger the tool, and the more it costs other people.

Prepending repeats your own AS number in the path you send to one neighbour. gw2.ams prepends twice towards ISP2, and ISP2 adds its own number, so the content network compares a path of length 2 via ISP1 with length 4 via ISP2.

Before I tell you: of ISP2, the content network, the broadband network and the enterprise, which move to ISP1?

[pause]

Only the content network, whose preferences tie, so its comparison reaches path length. ISP2 keeps the prepended route, because it gives customer routes local preference 200 and the path via its peer ISP1 only 100, and local preference comes before length. Everything entering ISP2 follows it. The broadband network has one path. The enterprise prefers ISP2 at 120 and never reaches length.

The rule: prepending moves only networks whose local preference ties, and providers set local preference by relationship, customer over peer over provider, precisely so that length rarely decides. Each extra copy moves less, and past three or so it mostly makes your path easy for a leak or hijack to beat. The signal is inbound share per ISP, and the paths public route collectors such as RIPE RIS and RouteViews show for your prefix.

MED, the multi-exit discriminator, tells a neighbour which of several links between you it should deliver on; lower is better. The neighbour compares it only among paths from the same neighbouring AS and does not pass it on. So it cannot choose between two ISPs: their paths come from different ASes.

Where it belongs: Meridian also buys from ISP1 in Singapore. Without MED, ISP1 hands traffic to its nearest Meridian door, hot-potato routing, and traffic handed over in Singapore crosses about 10,500 kilometres to Amsterdam on Meridian's own circuit, 52 milliseconds one way. With MED 10 in Amsterdam and 100 in Singapore, ISP1 carries it on its own backbone, so many providers honour MED only by contract. Two traps: a missing MED counts as zero, the best, so one forgotten session silently wins; and comparing only within one neighbour AS can make the result depend on arrival order and oscillate forever with route reflectors.

## Communities and more-specifics

To reach the step prepending cannot, the provider's own local preference, you borrow the provider's policy. A community is a 4-byte tag on a route, and transit providers publish menus of them for customers. ISP2's says 64502 colon 70 sets this customer route's local preference to 70. AS 3356, a large transit network, documents 3356 colon 70.

Meridian tags its prepended announcement with 64502 colon 70. Now 70 is below ISP2's peer value of 100, so ISP2 delivers Meridian's traffic over its peering with ISP1, and so does everything entering ISP2: the broadband subscribers and the enterprise's preferred port all arrive at gw1.ams.

The catch for operators: while ISP1 is up, the direct path to gw2 is no longer ISP2's best, and a router advertises only its best path. So no public route collector can show that the backup exists. It lives only in ISP2's table, which you check through ISP2's looking glass, a public page showing its routers' view, or with a planned drill. And a mistyped community is silently ignored.

The strongest lever runs before any attribute: longest-prefix match. gw1.ams announces both halves of the block, two slash 25s, to ISP1 only, and the slash 24 to both. Every network that accepts the halves sends Meridian's traffic to ISP1, ISP2 included: its best path for the slash 24 still points at gw2, yet its forwarding table sends the packet by the slash 25. Best path and forwarding answer different questions. The slash 24 to both makes it failover-safe: if ISP1 fails, the halves go with it.

The catch: most networks drop IPv4 announcements longer than a slash 24, and IPv6 longer than a slash 48. A slash 25 reaches ISP1 and few networks beyond, so in production you need a block twice as large: a slash 23 to both, its two slash 24s to the preferred ISP. Every more-specific is also a row in every full-table router, where more than half of the roughly one million IPv4 routes are already slash 24s. An RPKI origin authorisation for the slash 24 with maximum length 24 makes the halves invalid, and validating networks drop them. And origination must follow health: if gw1 announces the halves statically and loses its fabric links while its ISP1 session stays up, all inbound traffic goes to a gateway that cannot deliver it.

The lesson's simulation makes it a ladder. Prepending moves only the content network, the community moves the two behind ISP2, and the more-specifics alone move everyone. With ISP1 cut, the prepended, local preference 70 route is the only one left and carries everything. Less preferred never means unusable.

## Failover, with timings

The fibre between gw1.ams and ISP1 is cut. Loss of light drops the eBGP session at once. Within about a second gw1 withdraws ISP1's routes over iBGP, gw2 selects and advertises its own, and egress is on ISP2; a full table without precomputed backups can take tens of seconds. ISP1 withdraws the halves too, and its own customers move first. Then withdrawals spread hop by hop for seconds to minutes, slowed by path hunting and advertisement timers. Inbound recovers more slowly because it waits for other networks.

The worse failure leaves the light on: ISP1's router dies behind a carrier switch. Nothing happens until the hold timer expires, 60 to 90 seconds after the failure with the suggested 90-second hold time. At Meridian's 6 gigabits per second inbound, that loses 45 to 68 gigabytes, and a 180-second default doubles it. BFD, a fast hello, at 300 milliseconds and three misses, cuts detection to about 0.9 seconds.

Failback needs care too: a flapping circuit makes Meridian's prefixes flap, and damping may suppress them for up to an hour, so wait for a stable session before re-announcing the halves.

And the bill has its own threshold. A 30-hour failover is 360 samples, inside the 432 discarded ones, and costs nothing. A 40-hour one is 480 samples and pushes ISP2's billed rate to about 3.4 gigabits per second, past its 1 gigabit commit.

## Anycast and the edge of control

Anycast announces the same prefix from several places and lets BGP deliver each sender to one. Meridian runs DNS resolvers at one address in Amsterdam, Singapore and San Jose, announcing a slash 48 from each site. The senders reaching a site are its catchment.

The catchment follows BGP, not geography: a Singapore network whose preferred provider meets Meridian only in Amsterdam sends its users over 100 milliseconds per query instead of a couple. A route change mid-connection moves a TCP flow to a site with no state, which answers with a reset. Health must drive the announcement. And a shared health dependency withdraws everything at once: in October 2021 Facebook's DNS servers withdrew their anycast prefixes when they lost the data centers, and a backbone change had cut every site at once, so the names vanished worldwide.

Name the edge of control precisely, because it is where you stop configuring and start measuring. Other networks' local preference and filters. Senders' own exits: big content networks and clouds choose by measurement, and prepending barely moves them. Congestion between other networks, which you have no counter for. And everyone's timers and return paths: asymmetric routing is normal.

So the honest design is a loop: change an announcement, measure inbound per ISP and per source network, repeat. The platform should show bytes per ISP port against intent, what you announce per session diffed against the source of truth, what route collectors see, backup readiness in ISP2's table, and the running 95th percentile with the failover hours left this month.

## In the interview

A follow-up the lesson expects. You prepended five times, and half the inbound still arrives on ISP2. Why?

[pause]

Prepending only moves networks whose local preference ties. ISP2 prefers its customer route over any peer path, its single-homed customers have no alternative, and some multihomed networks prefer ISP2 on cost. Check ISP2's looking glass, then use its community or a more-specific. Not "prepend ten times".

And another: how do you know the failover works without failing over?

[pause]

Check that the backup exists in ISP2's table, because with the community applied no collector can show it. Diff each session's announcements against intent. Then drill it in a quiet window, measuring time to shift in both directions. It is honest to defer to the network team on drill timing; the checks and measurement are what you would build. The wrong answer: "the session to ISP2 is Established".

## Recap

Five things to remember. Egress is control: local preference is exact for every router in your AS, and never leaves it. Ingress is influence: each tool acts at one step of someone else's decision. Prepending moves only networks whose preference ties, a community reaches one provider's own local preference, and more-specifics win wherever accepted, which is rarely beyond a slash 24. MED is for several links to one neighbour, never for choosing between ISPs. And keep the backup announced, less preferred but never absent, verified in the provider's table and drilled.

At your desk: the two-ISP visualisation, the tables and illustrative outputs, the propagation simulation, and the edge report with its billing code.

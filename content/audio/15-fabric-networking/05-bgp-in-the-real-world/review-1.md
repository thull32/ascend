---
review: bgp-in-the-real-world
source: 20a16b92b0edb96d
---
## Introduction

Twelve questions from the first half of the BGP in the real world module. Answer out loud before the answer comes.

They run in the order of the lessons: policy and communities, traffic engineering with BGP, and how the internet is glued together. Most of them follow Meridian, with its gateways gw1.ams and gw2.ams and its two providers, ISP1 and ISP2. Each question has four options, A to D, then a few seconds for you to commit to one.

## Question 1

gw1.ams receives the customer's 198.51.100.128 slash 25 carrying the no-export community. Which of Meridian's neighbours can learn this route from Meridian?

A, gw2.ams over iBGP, but no eBGP neighbour of Meridian. B, no neighbour at all, not even gw2.ams over iBGP. C, every neighbour, since Meridian's own export policy permits it. D, only customers, because no-export applies only to providers.

[think]

The answer is A: gw2.ams over iBGP, but no eBGP neighbour of Meridian.

No-export keeps a route inside the AS. iBGP peers such as gw2.ams receive it, and no eBGP neighbour does, whether customer, peer or provider. The check runs before export policy, so a permissive policy cannot override it, and refusing even iBGP peers is no-advertise, a different well-known community.

## Question 2

After a template change, gw1.ams and gw2.ams stop sending communities to each other over iBGP. The export policy towards the peer is: permit Meridian's own prefix, permit routes tagged 64500 colon 100, deny the rest. What happens at gw2.ams's peer?

A, the peer receives every route, because untagged routes pass. B, the peer stops receiving customer routes learned at gw1.ams. C, the peer receives transit routes, because nothing is tagged 64500 colon 300. D, nothing changes, because BGP restores tags from the AS path.

[think]

The answer is B: the peer stops receiving customer routes learned at gw1.ams.

The customer's routes reach gw2.ams untagged, so the term permitting 64500 colon 100 no longer matches, and the final deny drops them: an allow-list on tags fails closed. The peer loses Meridian's customer routes, a service problem but not a leak. A deny-list would fail open instead, and leak untagged peer and transit routes.

## Question 3

Before maintenance, gw1.ams re-advertises 203.0.113.0 slash 24 to ISP1 tagged with the graceful shutdown community, 65535 colon 0, but traffic on the ISP1 link does not fall. What is the most likely explanation?

A, ISP1 must first reset the session to apply the new tag. B, BGP ignores well-known communities on eBGP sessions. C, ISP1's import policy does not act on the community. D, the route needs no-export as well before it takes effect.

[think]

The answer is C: ISP1's import policy does not act on the community.

Graceful shutdown is a request: the receiver needs an import term that matches it and sets local preference 0. Without one, ISP1 keeps preferring the path, and shutting the session will drop traffic while routers reconverge. The community arrives in an ordinary update, and needs no reset and no no-export.

## Question 4

Under a 300 gigabit per second attack on 203.0.113.50, Meridian announces 203.0.113.50 slash 32 to ISP1 with ISP1's blackhole community. What is the result?

A, ISP1 drops all traffic to 203.0.113.50, sparing the rest of the slash 24. B, ISP1 filters out the attack and keeps legitimate traffic to the address. C, ISP1 rejects the slash 32, as it filters every prefix longer than a slash 24. D, Meridian's gateways drop the attack before it reaches the servers.

[think]

The answer is A: ISP1 drops all traffic to 203.0.113.50, sparing the rest of the slash 24.

Remote-triggered blackholing points the slash 32 at a discard next hop at ISP1's edge, so ISP1 drops every packet for that address, attack and legitimate alike, before it fills Meridian's links. Dropping at Meridian's gateways is too late, because the links are already full. ISP1 accepts this slash 32 because its policy makes an exception for blackhole-tagged routes inside Meridian's registered space.

## Question 5

Meridian's gateway gw1.ams sets local preference 200 on every route learned from ISP1. Which routers' decisions does this change?

A, every router on the internet that learns Meridian's prefix from ISP1. B, every BGP router inside Meridian's AS, but no router in ISP1 or ISP2. C, only gw1.ams, because local preference never leaves the router that set it. D, every router in Meridian's AS and in ISP1, which receives it in Meridian's updates.

[think]

The answer is B: every BGP router inside Meridian's AS, but no router in ISP1 or ISP2.

Local preference is carried on iBGP sessions, so every router in the AS compares the same value and exits via gw1.ams, and RFC 4271 forbids sending it to external peers. The router-local preference that never leaves one box is the vendor "weight". And it affects only outbound traffic: it changes Meridian's choice of exit, not other networks' choice of entry.

## Question 6

Meridian prepends its own AS number, 64500, twice on its announcement to ISP2. Which network keeps sending Meridian's traffic via ISP2?

A, ISP1, because the prepended path looks shorter from its side. B, the content network AS 64511, multihomed to both ISPs with equal preference. C, no network, because the longer path loses everywhere. D, ISP2 itself, which prefers its customer route by local preference.

[think]

The answer is D: ISP2 itself, which prefers its customer route by local preference.

ISP2 gives customer routes local preference 200 and peer routes 100, and local preference is compared before AS path length, so the prepended direct route still wins inside ISP2. The content network's preferences tie, so the length comparison is reached and it moves to ISP1. Reaching ISP2's own decision needs its local preference community or a more-specific.

## Question 7

Why does setting a lower MED on the announcement to ISP1 than on the one to ISP2 not pull traffic onto ISP1?

A, higher MED is preferred, so the values are the wrong way round. B, MED is a transitive attribute and every network resets it. C, MED is compared after the router ID, so it is never reached. D, MED is compared only between paths learned from the same neighbouring AS.

[think]

The answer is D: MED is compared only between paths learned from the same neighbouring AS.

A remote router compares MED only among paths from one neighbouring AS, unless both sides enable comparison across ASes, so ISP1's path and ISP2's path are never compared on it. Lower is better, MED is non-transitive, and it comes before IGP cost and router ID. Its real use is choosing between several links to one neighbour.

## Question 8

Meridian announces 203.0.113.0 slash 24 to both ISPs, and its two slash 25 halves to ISP1 only. The link between gw1.ams and ISP1 fails. What happens to inbound traffic?

A, it is lost, because the slash 24 is less specific than the slash 25s. B, it keeps using the slash 25s, which stay cached at remote networks. C, it is lost until an operator announces the slash 25s to ISP2. D, it moves to the slash 24 via ISP2 as the slash 25 withdrawals spread.

[think]

The answer is D: it moves to the slash 24 via ISP2 as the slash 25 withdrawals spread.

The halves were learned only through ISP1, so ISP1 withdraws them and remote networks fall back to the covering slash 24, which ISP2 has carried all along. Longest-prefix match only applies among routes a router has, and once the slash 25s are gone, the slash 24 is the longest match. No action is needed, though the move takes seconds to minutes as withdrawals propagate.

## Question 9

ISP1 learns the prefix 192.0.2.0 slash 24 from its peer, ISP2. Under the valley-free rule, to which neighbours may ISP1 export it?

A, to every neighbour, because peering routes are free. B, to its other peers, but never to its customers. C, to its transit provider, to give it a shorter path. D, to its customers only, such as Meridian.

[think]

The answer is D: to its customers only, such as Meridian.

Routes learned from a peer or a provider go only to customers. Exporting a peer's route to a provider or to another peer would offer to carry traffic between two networks that pay nothing for it, and that is a route leak. Only customer routes, and your own prefixes, go to everyone.

## Question 10

Meridian's export filter toward ISP1 is lost, and Meridian announces a route it learned from ISP2. ISP1 already has the same prefix from its peer ISP2, with a shorter AS path. Why does ISP1 switch to the leaked path?

A, it arrives from a customer, so its higher local preference wins before path length is compared. B, ISP2 withdraws the peer route as soon as the leak appears. C, the leaked path is newer, and BGP prefers the most recent route. D, Meridian's route carries a lower MED than the peer's route.

[think]

The answer is A: it arrives from a customer, so its higher local preference wins before path length is compared.

ISP1 gives customer routes a local preference of 200 and peer routes 150, and local preference is compared before AS path length, so the longer, leaked path wins. Route age is a late tie-break, and MED is only compared between routes from the same neighbouring network. This is why a provider should accept from a customer only the prefixes that customer has registered.

## Question 11

Why do Meridian's leaf and spine switches receive a default route from the border gateways, rather than the full internet table?

A, full tables would exceed the RAM available to the BGP process. B, their forwarding chips hold far fewer prefixes than the table has. C, the full table would make the interior protocol's shortest-path runs too slow. D, BGP cannot carry internet routes inside a network over iBGP.

[think]

The answer is B: their forwarding chips hold far fewer prefixes than the table has.

The limit is forwarding memory. Fabric switching chips have lookup tables sized for a fabric's thousands to tens of thousands of routes, while the internet table is over a million IPv4 prefixes, plus IPv6 entries that often take double width. Memory in RAM is the easy part, and iBGP carries external routes routinely.

## Question 12

Two tier-1 networks stop peering. Which customers lose reachability to each other?

A, customers that buy transit from only one of the two tier-1s. B, only customers that are multi-homed to both networks. C, none, because traffic reroutes through a third tier-1. D, every customer of both networks, until they agree to peer again.

[think]

The answer is A: customers that buy transit from only one of the two tier-1s.

A third tier-1 learned each network's routes as peer routes, and exports them only to its own customers, so it will not carry traffic between the two. Single-homed customers have no other path. Multi-homed customers fail over through their other provider, and customers of both keep reaching each other through either.

## Recap

Three ideas kept coming back. Local preference is compared before AS path length, so a network's own business preference, customer over peer over provider, beats any prepending, wins leaked paths, and decides who honours your requests. Communities are requests and tags, not commands: graceful shutdown and blackholing work only where the receiver's policy acts on them, and an allow-list on tags fails closed when tags go missing. And routing follows the most specific route a router actually has, which is why withdrawn more-specifics fall back cleanly to the covering slash 24, and why switches take a default route instead of a table their chips cannot hold.

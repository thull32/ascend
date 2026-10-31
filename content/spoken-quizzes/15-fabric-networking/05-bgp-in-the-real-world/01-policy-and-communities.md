---
lesson: policy-and-communities
source: a3f65fa0b5017255
---
## 1

gw1.ams receives the customer's 198.51.100.128 slash 25 carrying the no-export community. Which of Meridian's neighbours can learn this route from Meridian?

A, gw2.ams over iBGP, but no eBGP neighbour of Meridian. B, no neighbour at all, not even gw2.ams over iBGP. C, every neighbour, since Meridian's own export policy permits it. D, only customers, because no-export applies only to providers.

[think]

The answer is A: gw2.ams over iBGP, but no eBGP neighbour of Meridian.

No-export keeps a route inside the AS. iBGP peers such as gw2.ams receive it, and no eBGP neighbour does, whether customer, peer or provider. The check runs before export policy, so a permissive policy cannot override it. Refusing even iBGP peers is no-advertise, a different well-known community.

## 2

Meridian's customer import filter is a single entry: 198.51.100.0 slash 24, with lengths 24 to 25. The customer announces the slash 24 itself, 198.51.100.128 slash 25, and 198.51.100.64 slash 26. What is accepted?

A, the slash 24 and the slash 25; the slash 26 is too long. B, all three, as all lie inside 198.51.100.0 slash 24. C, only the slash 24, since entries match exact prefixes. D, the slash 25 and the slash 26, the more-specific routes.

[think]

The answer is A: the slash 24 and the slash 25; the slash 26 is too long.

An entry matches a route that lies inside the block and whose length is within the range. All three lie inside the slash 24, but the slash 26 has length 26, outside 24 to 25, so it falls to the final deny. Without the length range, the entry would match only the exact slash 24: the common bug that silently drops a customer's more-specific.

## 3

After a template change, gw1.ams and gw2.ams stop sending communities to each other over iBGP. The export policy towards the peer is: permit Meridian's own prefix, permit routes tagged 64500 colon 100, deny the rest. What happens at gw2.ams's peer?

A, the peer receives every route, because untagged routes pass. B, the peer stops receiving customer routes learned at gw1.ams. C, the peer receives transit routes, because nothing is tagged 64500 colon 300. D, nothing changes, because BGP restores tags from the AS path.

[think]

The answer is B: the peer stops receiving customer routes learned at gw1.ams.

The customer's routes reach gw2.ams untagged, so the term permitting 64500 colon 100 no longer matches, and the final deny drops them: an allow-list on tags fails closed. The peer loses Meridian's customer routes, a service problem but not a leak. A deny-list would fail open instead and leak untagged peer and transit routes. Nothing rebuilds communities from the AS path.

## 4

Why were large communities, RFC 8092, introduced?

A, routers cannot attach more than one standard community to each route. B, a four-byte AS number does not fit in a standard community's 16-bit half. C, standard communities cannot be carried across eBGP sessions at all. D, extended communities are non-transitive, so no tag could leave an AS.

[think]

The answer is B: a four-byte AS number does not fit in a standard community's 16-bit half.

A standard community is two 16-bit halves, AS number then value, so a network with a four-byte AS number such as 4200000010 cannot put its own number in the high half. Large communities use three 32-bit fields. Standard communities are transitive and a route may carry many; extended communities can be transitive or not, chosen per type.

## 5

Before maintenance, gw1.ams re-advertises 203.0.113.0 slash 24 to ISP1 tagged with the graceful shutdown community, 65535 colon 0, but traffic on the ISP1 link does not fall. What is the most likely explanation?

A, ISP1 must first reset the session to apply the new tag. B, BGP ignores well-known communities on eBGP sessions. C, ISP1's import policy does not act on the community. D, the route needs no-export as well before it takes effect.

[think]

The answer is C: ISP1's import policy does not act on the community.

Graceful shutdown is a request: the receiver needs an import term that matches it and sets local preference 0. Without one, ISP1 keeps preferring the path, and shutting the session will drop traffic while routers reconverge. The community arrives in an ordinary update and needs no reset and no no-export; well-known communities are not ignored on eBGP.

## 6

Under a 300 gigabit per second attack on 203.0.113.50, Meridian announces 203.0.113.50 slash 32 to ISP1 with ISP1's blackhole community. What is the result?

A, ISP1 drops all traffic to 203.0.113.50, sparing the rest of the slash 24. B, ISP1 filters out the attack and keeps legitimate traffic to the address. C, ISP1 rejects the slash 32, as it filters every prefix longer than a slash 24. D, Meridian's gateways drop the attack before it reaches the servers.

[think]

The answer is A: ISP1 drops all traffic to 203.0.113.50, sparing the rest of the slash 24.

Remote-triggered blackholing points the slash 32 at a discard next hop at ISP1's edge, so ISP1 drops every packet for that address, attack and legitimate alike, before it fills Meridian's links. The rest of the slash 24 survives. Dropping at Meridian's gateways is too late, because the links are already full. ISP1 accepts this slash 32 because its policy makes an exception for blackhole-tagged routes inside Meridian's registered space.

---
lesson: leaks-hijacks-and-rpki
source: 3900c36b20815f95
---
## 1

AS 64510 announces 203.0.113.0 slash 25, with an AS path three hops longer than the path to Meridian's 203.0.113.0 slash 24. At a network that accepts both, where does traffic for 203.0.113.10 go?

A, to AS 64510, because longest-prefix match prefers the slash 25. B, split between the two by equal-cost multipath, because both routes match. C, to Meridian, because the slash 24 was learned first and is older. D, to Meridian, because its AS path is three hops shorter.

[think]

The answer is A: to AS 64510, because longest-prefix match prefers the slash 25.

The slash 24 and the slash 25 are different prefixes, so BGP never compares their paths. Both are installed, and the forwarding lookup uses the longest match containing the address. Path length, route age and multipath only decide between routes for the same prefix, which is why a sub-prefix hijack reaches every network that accepts it.

## 2

Meridian's ROA is 203.0.113.0 slash 24, maximum length 24, AS 64500. AS 64510 announces 203.0.113.0 slash 24 with the AS path 64510 then 64500. What does route origin validation say?

A, Invalid, because the route arrived from AS 64510. B, NotFound, because the path holds two networks. C, Valid, because the origin and length match the ROA. D, Invalid, because the path is longer than the ROA allows.

[think]

The answer is C: Valid, because the origin and length match the ROA.

Origin validation checks only the origin, the last AS in the path, and the prefix length. Both match, so the forged path is Valid. Detecting that AS 64510 is not really adjacent to Meridian needs a path check: ASPA would mark it Invalid, because Meridian's ASPA does not list AS 64510 as a provider. A ROA has no notion of path length.

## 3

A network chooses to lower local preference on RPKI-Invalid routes instead of dropping them. Why does that fail against a sub-prefix hijack?

A, no other route for the slash 25 exists, so the Invalid one is still installed. B, local preference is not carried to external peers, so the change has no effect. C, validation runs after best-path selection, too late to change the result. D, Invalid routes have no local preference set, so the policy never matches them.

[think]

The answer is A: no other route for the slash 25 exists, so the Invalid one is still installed.

Preference only ranks routes for the same prefix. With no legitimate slash 25 to compare against, the de-preferred Invalid route is still the only, and therefore best, route for that prefix, and longest-prefix match sends traffic to it. Dropping Invalid removes it. Validation actually runs at import, before best-path selection, and local preference does apply inside the network.

## 4

Both of a network's RPKI validators have been down for four hours. What happens to BGP routes at its border routers?

A, once the RTR data expires, routes become NotFound and are accepted. B, routers keep the last data forever, so nothing changes at all. C, routers fetch and verify the ROAs themselves until a validator returns. D, every route is treated as Invalid and dropped, cutting the network off.

[think]

The answer is A: once the RTR data expires, routes become NotFound and are accepted.

Routers discard RTR data after its expire interval, two hours by default. With no validated payloads, nothing is covered, every route is NotFound, and NotFound is accepted: protection fails open while no route changes. Routers never verify certificates themselves. That is why validator data age, not process state, needs an alert.

## 5

Meridian's BGP customer, AS 64505, normally announces one prefix, and its session has a max-prefix limit of 10, set to tear down. It accidentally leaks 900,000 routes learned from another provider. What happens?

A, Meridian drops the leaked routes and keeps the one legitimate prefix. B, Meridian closes the session with a Cease notification, dropping all of AS 64505's routes. C, nothing, because max-prefix only applies to routes Meridian sends. D, Meridian accepts the first 10 routes and silently drops the rest.

[think]

The answer is B: Meridian closes the session with a Cease notification, dropping all of AS 64505's routes.

Exceeding a tear-down limit closes the session with a Cease notification, subcode 1, and holds it idle until an operator or a restart timer brings it back. Every route from the neighbour goes, including the legitimate one, so the customer is offline meanwhile: max-prefix protects the rest of the internet bluntly. Telling leaked routes from legitimate ones is the job of a prefix filter.

## 6

Which defence would have prevented Facebook's October 2021 outage?

A, max-prefix limits on the sessions between Facebook and its peers. B, RPKI route origin validation at the networks Facebook peers with. C, none of these, since Facebook's own servers withdrew the routes. D, IRR prefix filters at the transit providers serving Facebook.

[think]

The answer is C: none of these, since Facebook's own servers withdrew the routes.

Facebook's DNS sites withdrew their own anycast routes when a backbone failure made all of them fail their health check at once. The internet removed routes their legitimate origin withdrew. Origin validation, prefix filters and max-prefix all check unwanted announcements, not missing ones. The fixes were guard rails on the change tooling, health checks whose failures are independent, and out-of-band access.

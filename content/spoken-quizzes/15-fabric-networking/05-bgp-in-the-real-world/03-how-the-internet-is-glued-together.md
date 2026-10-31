---
lesson: how-the-internet-is-glued-together
source: 51a9c53492a658aa
---
## 1

ISP1 learns the prefix 192.0.2.0 slash 24 from its peer, ISP2. Under the valley-free rule, to which neighbours may ISP1 export it?

A, to every neighbour, because peering routes are free. B, to its other peers, but never to its customers. C, to its transit provider, to give it a shorter path. D, to its customers only, such as Meridian.

[think]

The answer is D: to its customers only, such as Meridian.

Routes learned from a peer or a provider go only to customers. Exporting a peer's route to a provider or to another peer would offer to carry traffic between two networks that pay nothing for it, and that is a route leak. Only customer routes, and your own prefixes, go to everyone.

## 2

Meridian's export filter toward ISP1 is lost, and Meridian announces a route it learned from ISP2. ISP1 already has the same prefix from its peer ISP2, with a shorter AS path. Why does ISP1 switch to the leaked path?

A, it arrives from a customer, so its higher local preference wins before path length is compared. B, ISP2 withdraws the peer route as soon as the leak appears. C, the leaked path is newer, and BGP prefers the most recent route. D, Meridian's route carries a lower MED than the peer's route.

[think]

The answer is A: it arrives from a customer, so its higher local preference wins before path length is compared.

ISP1 gives customer routes a local preference of 200 and peer routes 150, and local preference is compared before AS path length, so the longer, leaked path wins. Route age is a late tie-break, MED is only compared between routes from the same neighbouring network, and ISP2 withdraws nothing. This is why a provider should accept from a customer only the prefixes that customer has registered.

## 3

An internet exchange's route server passes the content network's route, from AS 64511, to Meridian. What does Meridian receive?

A, an AS path of just 64511, with the next hop set to AS 64511's own router on the peering LAN. B, an AS path of just 64511, with the next hop set to the route server's address on the peering LAN. C, the route server's AS number added to the path, and the route server as the next hop. D, the route server's AS number added to the path, and AS 64511's router as the next hop.

[think]

The answer is A: an AS path of just 64511, with the next hop set to AS 64511's own router on the peering LAN.

A route server is transparent. It neither adds its own AS number nor changes the next hop, so traffic flows member to member across the exchange LAN, and path lengths are unaffected. That is also why members must turn off the check that the first AS in a received path is the neighbour's.

## 4

Why do Meridian's leaf and spine switches receive a default route from the border gateways, rather than the full internet table?

A, full tables would exceed the RAM available to the BGP process. B, their forwarding chips hold far fewer prefixes than the table has. C, the full table would make the interior protocol's shortest-path runs too slow. D, BGP cannot carry internet routes inside a network over iBGP.

[think]

The answer is B: their forwarding chips hold far fewer prefixes than the table has.

The limit is forwarding memory. Fabric switching chips have lookup tables sized for a fabric's thousands to tens of thousands of routes, while the internet table is over a million IPv4 prefixes, plus IPv6 entries that often take double width. RIB memory in RAM is the easy part, iBGP carries external routes routinely, and BGP routes are not part of the interior protocol's shortest-path computation.

## 5

Two tier-1 networks stop peering. Which customers lose reachability to each other?

A, customers that buy transit from only one of the two tier-1s. B, only customers that are multi-homed to both networks. C, none, because traffic reroutes through a third tier-1. D, every customer of both networks, until they agree to peer again.

[think]

The answer is A: customers that buy transit from only one of the two tier-1s.

A third tier-1 learned each network's routes as peer routes, and exports them only to its own customers, so it will not carry traffic between the two. Single-homed customers have no other path. Multi-homed customers fail over through their other provider, and customers of both keep reaching each other through either.

## 6

A customer of a public interconnection fabric reports random packet loss on its virtual connection to a cloud. The physical port shows no errors, and its BGP session to the cloud stays up. What should the platform show first?

A, the number of prefixes the cloud announces on the BGP session. B, policer drops on that virtual connection, against its bandwidth tier. C, the route server's prefix count for the customer's own AS number. D, the trend of optical receive power on the customer's physical port.

[think]

The answer is B: policer drops on that virtual connection, against its bandwidth tier.

A virtual connection is rate-limited to the tier the customer bought, and traffic above it is dropped by a policer, which looks like random loss from inside while the port and the session stay healthy. Clean port counters make an optical problem unlikely, a prefix problem would affect reachability rather than cause loss, and route servers belong to exchanges, not to point-to-point virtual connections.

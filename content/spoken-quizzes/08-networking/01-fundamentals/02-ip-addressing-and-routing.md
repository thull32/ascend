---
lesson: ip-addressing-and-routing
source: 53b77771f11fabc0
---
## 1

For the address 192.168.37.200 slash 26, what are the network address, the broadcast address, and the number of usable hosts on the LAN? Every option starts 192.168.37, so only the last byte is given.

A, network 192, broadcast 255, 62 hosts. B, network 200, broadcast 255, 55 hosts. C, network 128, broadcast 191, 62 hosts. D, network 0, broadcast 255, 254 hosts.

[think]

The answer is A: network 192, broadcast 255, 62 hosts.

A slash 26 leaves 6 host bits, so the last byte splits into blocks of 64, aligned to multiples of 64. 200 falls in the block from 192 to 255, giving network 192, broadcast 255, and 64 minus 2, or 62 usable hosts. The block starting at 128 ends at 191 and does not contain 200.

## 2

A router has a route for 10.20.4.0 slash 22 via R3, a route for 10.20.5.0 slash 25 via R4, and a default. Where does a packet for 10.20.5.130 go?

A, to R3 and R4 alternately, because both routes match. B, to R3, because the slash 25 covers only addresses 0 to 127. C, to the default, because no single route matches exactly. D, to R4, because the slash 25 is the most specific route.

[think]

The answer is B: to R3, because the slash 25 covers only addresses 0 to 127.

A slash 25 covers 128 addresses, so 10.20.5.0 slash 25 runs from 0 to 127, and 130 is outside it. Of the routes that do contain the destination, the slash 22 is the longest, so the packet goes to R3. Longest-prefix match never needs an exact match, and equal-cost splitting applies only to routes with the same prefix.

## 3

A BGP router hears the same slash 24 from a customer, with a path of 4 AS hops, and from a transit provider, with a path of 2. Local preference is 200 for customers and 100 for transit. Which route does it choose?

A, whichever route was received first, since BGP keeps the oldest. B, both routes, with traffic split evenly across the two. C, the customer route, since local preference is checked before path length. D, the transit route, since BGP minimises the number of AS hops.

[think]

The answer is C: the customer route, since local preference is checked before path length.

Local preference is the first comparison in the decision process, and it encodes business relationships. Path length only breaks ties among equally preferred routes, and route age comes near the end. That is why paths between networks follow money rather than distance, and why prepending cannot override a neighbour's local preference.

## 4

In 2008, an ISP announced a slash 24 inside YouTube's address space, while YouTube itself announced the larger slash 22 that contained it. Why did traffic for YouTube's addresses in that slash 24 follow the rogue announcement?

A, the rogue ISP withdrew YouTube's slash 22 with a forged message. B, longest-prefix match prefers the slash 24 wherever both routes are heard. C, RPKI validation marked YouTube's own announcement as invalid. D, the rogue path had fewer AS hops, so BGP selection preferred it.

[think]

The answer is B: longest-prefix match prefers the slash 24 wherever both routes are heard.

Forwarding picks the most specific matching prefix before any BGP comparison between the two routes matters, because they are different prefixes. Nothing was withdrawn. And RPKI, which did not exist in deployable form then, would have marked the rogue origin invalid, not YouTube's. Announcing your own slash 24s is the emergency countermeasure.

## 5

A traceroute shows hop 4 at 31 milliseconds and hop 5 at 16 milliseconds. What is the best explanation?

A, packets travel backwards in time between hop 4 and hop 5. B, hop 5 is closer to the destination, so the path got shorter. C, hop 4 generated its ICMP reply slowly, on its control plane. D, hop 4 is congested, so every packet through it is delayed.

[think]

The answer is C: hop 4 generated its ICMP reply slowly, on its control plane.

Each time is the round trip to the router that generated a "time exceeded" message, and routers generate those on a slow, rate-limited control path. If hop 4 delayed the traffic it forwards, hop 5 and everything after it would also show at least 31 milliseconds. Only the final hop's time reflects the end-to-end path.

## 6

Why is anycast a comfortable fit for DNS resolvers, but needs extra care for long-lived TCP services?

A, anycast sites share no routing table, so TCP handshakes cannot finish. B, TCP packets are larger than the anycast path's MTU can carry. C, anycast requires UDP, so TCP needs a separate unicast address. D, a route change can send a TCP flow's packets to a site without its state.

[think]

The answer is D: a route change can send a TCP flow's packets to a site without its state.

Anycast delivers each packet to the site BGP considers best, and that can change when routes change. A DNS exchange is one datagram each way with no connection state, so it does not care. A TCP connection whose later packets land at a different site is reset. CDNs do use anycast for TCP, with consistent hashing inside sites and short connections, and QUIC connection IDs survive path changes.

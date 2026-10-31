---
lesson: arp-and-the-default-gateway
source: ccd23f9c06d3a093
---
## 1

acme-web1, at 10.1.1.10 slash 24 with gateway 10.1.1.1, opens a connection to acme-db1 at 10.1.2.20. Which MAC address does it resolve with ARP?

A, the gateway's, because 10.1.2.20 is off the host's subnet. B, acme-db1's, because the frame must reach the database. C, the broadcast MAC, because the destination is in another VLAN. D, acme-db1's, obtained from the gateway by proxy ARP.

[think]

The answer is A: the gateway's, because 10.1.2.20 is off the host's subnet.

10.1.2.20 masked with a slash 24 gives 10.1.2.0, not acme-web1's 10.1.1.0, so the default route via 10.1.1.1 matches and the host needs the gateway's MAC. The frame carries the gateway's MAC and acme-db1's IP. The broadcast MAC is used only for the ARP request itself, and proxy ARP would answer with the router's own MAC, not the database's.

## 2

A server cannot reach its gateway. Its neighbour table shows the gateway as FAILED, and ping prints "Destination Host Unreachable" from 10.1.1.10, which is the server's own address. What does this tell you?

A, ARP got no reply, so the pings never left the server. B, the gateway received the pings and refused them with ICMP. C, a router beyond the gateway has no route to the destination. D, the gateway answered ARP, but its CPU dropped the pings.

[think]

The answer is A: ARP got no reply, so the pings never left the server.

FAILED means the kernel's ARP requests went unanswered, so it dropped the queued packets and generated the error itself, which is why the message names the server's own address. Nothing reached the gateway. The next checks are layer 2 and the gateway interface: the port's VLAN, the leaf's MAC table, the gateway interface being up. A refusal or a CPU drop at the gateway needs ARP to have succeeded first.

## 3

A keepalived failover moves the virtual IP 10.1.1.50 from acme-lb1 to acme-lb2. Which message makes peers send to acme-lb2 without waiting for their cache entries to time out?

A, a proxy ARP reply from leaf1 for 10.1.1.50, carrying the gateway MAC. B, a gratuitous ARP from acme-lb2, naming 10.1.1.50 as both sender and target IP. C, an ICMP redirect from leaf1, naming acme-lb2 as the better first hop. D, an ARP request from each peer, sent as soon as its entry turns STALE.

[think]

The answer is B: a gratuitous ARP from acme-lb2, naming 10.1.1.50 as both sender and target IP.

The new owner broadcasts the announcement. Hosts that already cache 10.1.1.50 overwrite the MAC, since Linux updates existing entries even when it refuses to create new ones, and the switches learn the MAC's new port. Waiting for STALE and a probe is exactly the slow path the announcement avoids. Proxy ARP would point peers at the leaf, and redirects concern routers, not same-subnet neighbours.

## 4

A server configured as 10.1.1.10 slash 16 instead of slash 24 has reached 10.1.2.20 for years. A migration disables proxy ARP on the leaf, and the server loses everything outside 10.1.1.0 slash 24. Why did it ever work?

A, the leaf answered ARP for 10.1.2.20 with its own MAC and routed the frames. B, the database answered ARP across VLANs, because both share one leaf pair. C, the slash 16 mask is wider, so the server's packets matched the default route instead. D, EVPN ARP suppression answered with the database's real MAC, from a MAC-and-IP route.

[think]

The answer is A: the leaf answered ARP for 10.1.2.20 with its own MAC and routed the frames.

The slash 16 made 10.1.2.20 look on-link, so the server ARPed for it directly. With proxy ARP, the leaf had a route to 10.1.2.0 slash 24 through another interface and replied with its own MAC, so the frames went to the leaf anyway. ARP suppression answers only for hosts in the same subnet and VLAN, with their real MAC, and acme-db1 is in VLAN 200, which the server's broadcast never reaches.

## 5

Why does IPv6 neighbour discovery interrupt fewer hosts than ARP in a large VLAN?

A, its messages are carried over TCP, so they reach only one listener. B, its solicitations are sent only to the routers learned from advertisements. C, its solicitations go to a solicited-node multicast group that network cards filter. D, its replies are cached for longer, so misses are much rarer than in ARP.

[think]

The answer is C: its solicitations go to a solicited-node multicast group that network cards filter.

A neighbour solicitation goes to a group built from the last 24 bits of the target address, mapped to an Ethernet multicast address the network card filters in hardware, so typically only the owner processes it. ARP's broadcast reaches every host's CPU. Neighbour discovery uses the same reachability state machine as Linux's ARP, so cache lifetime is not the difference, and it runs over ICMPv6, not TCP.

## 6

On acme-web1, the neighbour table shows the gateway REACHABLE at the anycast gateway MAC, but ping to 10.1.1.1 times out, while ping to acme-db1 works. What is the most likely explanation?

A, the ARP entry is stale and must be flushed before pings can succeed. B, a routing protocol adjacency on the leaf is down, so replies are lost. C, the server's port is in the wrong VLAN, so replies go elsewhere. D, the gateway forwards, but ICMP to its own address is filtered or policed.

[think]

The answer is D: the gateway forwards, but ICMP to its own address is filtered or policed.

Pings through the gateway work, so layer 2, ARP and forwarding are fine. A ping to the gateway's own address is punted to the switch's CPU, where control-plane policing or a filter can drop it. A wrong VLAN would break ARP and the ping to acme-db1 too, flushing a REACHABLE entry throws away good evidence, and no routing protocol is involved in a directly connected hop.

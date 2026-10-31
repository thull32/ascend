---
lesson: ip-addressing-and-subnets
source: a35726f9274be761
---
## 1

What is the network address of 10 dot 254 dot 19 dot 9 slash 20?

A, 10 dot 254 dot 16 dot 0, since 19 AND 240 is 16. B, 10 dot 254 dot 0 dot 0, since a slash 20 clears the third octet. C, 10 dot 254 dot 18 dot 0, since blocks step by 2 in the third octet. D, 10 dot 254 dot 19 dot 0, since the third octet is kept.

[think]

The answer is A: 10 dot 254 dot 16 dot 0, since 19 AND 240 is 16.

A slash 20 puts the boundary inside the third octet, with mask value 240, so networks step by 256 minus 240, which is 16. 19 AND 240 keeps the top four bits and gives 16, so the network is 10 dot 254 dot 16 dot 0 and the broadcast is 10 dot 254 dot 31 dot 255. Keeping 19 would be a slash 24; clearing the whole octet would be a slash 16.

## 2

Leaf1 in Amsterdam runs its iBGP session to the route reflector rr1 from its loopback, 10 dot 255 dot 1 dot 11, rather than from its uplink address, 10 dot 254 dot 1 dot 1. What does that buy?

A, the session gets a shorter hold timer by default. B, the session survives the loss of any one uplink. C, the session can skip the TCP handshake on port 179. D, the session needs no underlay route to the reflector.

[think]

The answer is B: the session survives the loss of any one uplink.

The uplink address lives on one interface and disappears when that link fails, taking the TCP connection and every overlay route with it, although three other uplinks still work. The loopback is reachable through any working spine, so the underlay reroutes and the session never notices. It still needs an underlay route to the reflector and still rides TCP on port 179, and the hold timer is unrelated.

## 3

A host is configured as 10 dot 1 dot 1 dot 200 slash 25, with default gateway 10 dot 1 dot 1 dot 1. What happens?

A, it works normally, since the gateway is in the slash 24. B, it cannot use 10 dot 1 dot 1 dot 1, which lies outside its subnet. C, it ARPs for every destination, since a slash 25 has no gateway. D, it reaches only addresses from dot 0 to dot 127.

[think]

The answer is B: it cannot use 10 dot 1 dot 1 dot 1, which lies outside its subnet.

With a slash 25, dot 200 is in the upper half, dot 128 to dot 255. The gateway at dot 1 is in the other half, so from the host's point of view it is not on-link and cannot be a next hop, and Linux refuses the default route. Everything off the host's slash 25 fails, including the lower half of the real slash 24. The slash 24 is what the network intended, not what the host computes.

## 4

Why can a slash 31 be used on a link between two routers, when the usual formula gives zero usable hosts?

A, routers ignore the mask on links and use the MAC instead. B, a two-ended link needs no network or broadcast address. C, the slash 31 borrows a host bit from the router's loopback. D, the broadcast is moved into the next slash 31 in the block.

[think]

The answer is B: a two-ended link needs no network or broadcast address.

The network and broadcast addresses exist to name a shared segment and to reach everyone on it. A point-to-point link has exactly two ends, so RFC 3021 lets both addresses be hosts: Meridian gives the spine the even one and the leaf the odd one. Routers still use the mask, and nothing is borrowed from the loopback or from a neighbouring block.

## 5

Which address is in private, RFC 1918, space?

A, 192 dot 169 dot 1 dot 1, inside 192 dot 168 slash 16. B, 100 dot 64 dot 1 dot 1, inside 100 dot 64 slash 10. C, 172 dot 20 dot 5 dot 5, inside 172 dot 16 slash 12. D, 172 dot 32 dot 0 dot 1, inside 172 dot 16 slash 12.

[think]

The answer is C: 172 dot 20 dot 5 dot 5, inside 172 dot 16 slash 12.

The RFC 1918 block 172 dot 16 slash 12 runs up to 172 dot 31 dot 255 dot 255, so 172 dot 20 is private, and 172 dot 32, one past its end, is public. 192 dot 169 is likewise outside 192 dot 168 slash 16. And 100 dot 64 slash 10 is reserved, but as shared carrier-grade NAT space, not as RFC 1918 private space.

## 6

Why is an IPv6 LAN with only three hosts still given a slash 64?

A, neighbour discovery broadcasts to the whole slash 64 at once. B, IPv6 routers cannot store prefixes longer than slash 64. C, a slash 64 is the smallest block a registry can allocate. D, SLAAC appends a 64 bit interface ID to a 64 bit prefix.

[think]

The answer is D: SLAAC appends a 64 bit interface ID to a 64 bit prefix.

Stateless autoconfiguration builds each address from the advertised 64 bit prefix plus a 64 bit interface ID, so a link with a longer prefix cannot autoconfigure. Routers carry longer prefixes routinely, such as slash 127 links and slash 128 loopbacks. IPv6 has no broadcast, neighbour discovery uses multicast, and registries allocate far larger blocks, such as a slash 32 or a slash 48.

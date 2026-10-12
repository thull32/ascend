---
lesson: nat-firewalls-and-cloud-networking
source: 60a293b4f93e587f
---
## 1

Two hosts behind the same port-translating router, 192.168.1.10 and 192.168.1.11, both connect from source port 51000 to the same server on port 443. How does the router keep the flows apart?

A, it forwards both on port 51000, and lets TCP sequence numbers separate them. B, it asks the server to open a second listening port for the second host. C, it gives the second flow a different external source port. D, it rejects the second flow until the first one closes.

[think]

The answer is C: it gives the second flow a different external source port.

Port translation identifies flows by the translated five-tuple. The first flow keeps external port 51000, the second gets another port, such as 51001, and replies to each external port are rewritten back to the right inside host. Sequence numbers are per connection and play no part in telling flows apart, and the server never knows there are two hosts.

## 2

A service in a private subnet keeps a pool of idle connections to a partner API through an AWS NAT gateway. After quiet periods, the first requests fail with connection resets. What is the most likely cause?

A, the NAT gateway expired the idle mappings before any keepalive was sent. B, the partner's TLS session tickets expired during the quiet period. C, the pool's DNS cache kept an old address for the partner's endpoint. D, the NAT gateway ran out of ports while the pool was idle.

[think]

The answer is A: the NAT gateway expired the idle mappings before any keepalive was sent.

AWS NAT gateways drop a TCP mapping after 350 seconds of inactivity and reset the next packet on it, while Linux sends its first keepalive only after 7200 seconds by default. Set keepalives or pool idle limits below that timer. Expired tickets cost a full handshake, not a reset, and running out of ports needs many active flows, not idle ones.

## 3

Alice is behind a NAT that allocates a new external port for every destination. Why does ICE hole punching to Bob usually fail?

A, ICE only tries relay candidates when either side uses a symmetric NAT. B, symmetric NATs block every UDP packet, including those for the STUN server. C, STUN cannot report a mapping for a symmetric NAT, so no candidate exists. D, Bob sends to the port STUN reported, which Alice's NAT did not use for Bob.

[think]

The answer is D: Bob sends to the port STUN reported, which Alice's NAT did not use for Bob.

STUN learns the mapping Alice's NAT created towards the STUN server. When Alice sends to Bob, her NAT creates a different mapping with a different port, so Bob's checks go to a port whose filter only admits the STUN server, and they are dropped. ICE still tries the direct pairs first, by priority, and falls back to the TURN relay when they fail.

## 4

A subnet's network ACL allows inbound TCP on port 443 from anywhere, and outbound TCP on port 443 to anywhere, with default denies. The instance's security group allows inbound 443. Clients cannot complete HTTPS handshakes. Why?

A, the security group must also allow outbound 443 for the replies to pass. B, security groups and network ACLs cannot both apply to one subnet. C, the ACL's inbound rule needs a lower number than the default deny rule. D, the ACL is stateless, and the replies go to the clients' ephemeral ports.

[think]

The answer is D: the ACL is stateless, and the replies go to the clients' ephemeral ports.

Network ACLs judge each packet alone. The server's replies are addressed to the client's ephemeral port, somewhere from 1024 to 65535 depending on the client, which no outbound rule allows, so the default deny drops them. The security group is stateful and allows replies to tracked flows automatically, and the default rule is always evaluated last.

## 5

When 10.0.0.0 slash 16 is split into slash 20 subnets, how many subnets are there, and how many addresses can AWS use in each?

A, 16 subnets of 4091 usable addresses. B, 16 subnets of 4094 usable addresses. C, 20 subnets of 4096 usable addresses. D, 4 subnets of 16,379 usable addresses.

[think]

The answer is A: 16 subnets of 4091 usable addresses.

Going from slash 16 to slash 20 adds four prefix bits, so 2 to the 4th, or 16 subnets, each of 2 to the 12th, or 4096 addresses. AWS reserves the network address, the next three for the router, DNS and future use, and the last address, leaving 4091. 4094 is the classic count, which reserves only the network and broadcast addresses.

## 6

VPC A is peered with VPC B, and B with C. A needs to reach a database in C. What works?

A, add a route in A that sends C's range to the A-to-B peering connection. B, peer A with C directly, or attach all three to a transit gateway. C, enable transitive routing on the B-to-C peering connection in B's settings. D, route A's traffic through B's NAT gateway, which forwards it on to C.

[think]

The answer is B: peer A with C directly, or attach all three to a transit gateway.

Peering is not transitive: a peering connection only carries traffic between its two VPCs, and using the peer's gateways to go further is not allowed. A direct peering between A and C, with non-overlapping ranges, or a transit gateway, which routes between all its attachments, solves it. For one database, a PrivateLink endpoint is another option.

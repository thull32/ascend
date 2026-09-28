---
slug: nat-firewalls-and-cloud-networking
title: "NAT, firewalls and cloud networking: translation tables, traversal, VPCs and the egress bill"
description: A PAT table traced packet by packet for two clients, conntrack states and timeouts, why inbound connections fail and how STUN, TURN and ICE get through (and why symmetric NAT defeats hole punching), security groups versus network ACLs with a worked evaluation, VPC and subnet CIDR arithmetic, gateways, endpoints and peering, zero trust, and egress cost as a design constraint.
minutes: 40
difficulty: medium
tags: [networking, nat, pat, conntrack, stun, turn, ice, webrtc, firewall, security-groups, vpc, cidr, privatelink, zero-trust, egress]
problems: []
---
A payments service in a private subnet calls a card processor's API through a pool of keep-alive HTTPS connections. Every morning the first requests fail with `ECONNRESET`, then everything recovers. The same week, finance asks why the NAT gateway line on the cloud bill is larger than the compute it serves. Both have one cause: every outbound packet passes through a translation table nobody on the team had looked at. The NAT gateway drops a mapping after 350 seconds without traffic (AWS's documented idle timeout) and answers the next packet on it with a reset, while Linux sends its first TCP keepalive after 7,200 seconds (the `tcp_keepalive_time` measured on this machine). And the gateway charges for every gigabyte it processes, including the nightly 10 TB backup to S3 that could have bypassed it for free.

Clouds and home networks alike put a stateful box between your hosts and everything else. This lesson traces what it does to each packet, how peers get past it, how cloud firewalls, subnets, gateways and endpoints build on the same ideas, and how the bill turns routing into a design decision.

## NAT and PAT: the translation table, traced

**NAT** (network address translation) rewrites IP addresses as packets cross a boundary. What almost every home router and cloud NAT gateway actually does is **PAT** (port address translation, also called NAPT or masquerading): many private hosts share one public address, and the NAT tells their flows apart by rewriting the source *port* too. Private addresses come from the ranges in [IP addressing and routing](/learn/networking/fundamentals/ip-addressing-and-routing) (10/8, 172.16/12, 192.168/16, plus 100.64/10 for carrier-grade NAT), which the internet does not route.

Two laptops, A (192.168.1.10) and B (192.168.1.11), sit behind a router whose public address is 203.0.113.5. Both happen to pick source port 51000 and connect to the same server S, 104.20.23.154:443.

| # | Packet as sent | NAT action | Packet as forwarded | Table after |
|---|---|---|---|---|
| 1 | A 192.168.1.10:51000 → S:443 SYN | No entry: create one; external port 51000 is free, keep it (port preservation) | 203.0.113.5:51000 → S:443 | A:51000 ↔ :51000, peer S:443 |
| 2 | B 192.168.1.11:51000 → S:443 SYN | No entry; 51000 is taken, so allocate 51001 | 203.0.113.5:51001 → S:443 | + B:51000 ↔ :51001, peer S:443 |
| 3 | S:443 → 203.0.113.5:51001 SYN-ACK | Reply tuple matches B's entry: rewrite destination | S:443 → 192.168.1.11:51000 | B's entry becomes established |
| 4 | S:443 → 203.0.113.5:51000 SYN-ACK | Matches A's entry | S:443 → 192.168.1.10:51000 | A's entry established |
| 5 | 198.51.100.99:40000 → 203.0.113.5:51000 SYN | An entry exists for port 51000, but only for peer S:443 | Dropped | Unchanged |
| 6 | 198.51.100.99:40000 → 203.0.113.5:8080 SYN | No entry at all | Dropped | Unchanged |
| 7 | A → S FIN, S → A FIN, A → S ACK | Entry follows the close | Forwarded | A's entry expires 120 s later |

Every rewrite also patches the IP header checksum and the TCP checksum, because TCP's checksum covers a pseudo-header containing both addresses ([layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation) builds one). Rows 5 and 6 are the whole story of "why can't anyone connect to my laptop": inbound packets find a mapping only if an inside host created it by sending first, and a well-behaved NAT also checks that the packet comes from the peer the mapping was created for.

```viz
{"type": "network", "scenario": "nat", "title": "Port address translation", "caption": "Outbound packets create a mapping from private address and port to the public address and a chosen port. Replies are rewritten back using that mapping. An inbound packet that matches no mapping has nowhere to go and is dropped."}
```

The limit that bites is per destination: a mapping is unique by the full 5-tuple, so one public IP holds about 64,000 simultaneous flows to *one* destination IP and port, such as a single API endpoint. AWS documents 55,000 simultaneous connections per NAT gateway IP address to each unique destination and lets you attach up to eight addresses; beyond that, new connections fail and the `ErrorPortAllocation` metric counts them.

## Under the hood: conntrack, states and timeouts

On Linux the table is **conntrack** (`nf_conntrack`), and the same table backs stateful firewalling (`-m conntrack --ctstate`), Docker's port publishing and Kubernetes `kube-proxy` in iptables mode. Each entry stores two tuples, the original direction and the expected reply, which is how the NAT finds its way back:

```text
tcp 6 431999 ESTABLISHED src=192.168.1.10 dst=104.20.23.154 sport=51000 dport=443 src=104.20.23.154 dst=203.0.113.5 sport=443 dport=51000 [ASSURED] use=1
udp 17 27 src=192.168.1.10 dst=8.8.8.8 sport=41893 dport=53 [UNREPLIED] src=8.8.8.8 dst=203.0.113.5 sport=53 dport=41893 use=1
```

(Reading `/proc/net/nf_conntrack` needs root; the lines above show the format `conntrack -L` prints.) The third field is seconds until the entry expires; every matching packet resets it. The timeouts on this machine, read from `/proc/sys/net/netfilter/`:

| State | sysctl | Measured value | Meaning |
|---|---|---|---|
| TCP established | `nf_conntrack_tcp_timeout_established` | 432,000 s (5 days) | Idle established flows survive a long time on Linux |
| TCP SYN sent | `…_syn_sent` | 120 s | A SYN that is never answered |
| TCP TIME_WAIT | `…_time_wait` | 120 s | After the close in row 7 |
| UDP, one direction only | `nf_conntrack_udp_timeout` | 30 s | A DNS query that got no reply |
| UDP, both directions seen | `nf_conntrack_udp_timeout_stream` | 120 s | A "connection" of datagrams |
| Table size | `nf_conntrack_max` | 262,144 entries | New flows are dropped when full |

States are the firewall's vocabulary: **NEW** (first packet), **ESTABLISHED** (packets seen both ways), **RELATED** (an ICMP error or an FTP data channel belonging to a known flow) and **INVALID** (a packet that fits no flow, such as a stray ACK). A stateful firewall's first rule is usually "accept ESTABLISHED and RELATED", so only NEW packets pay for the rest of the rule set.

Managed NATs keep much shorter timers than Linux, and that is the opening incident: AWS NAT gateways drop an idle TCP mapping after 350 seconds and reset the next packet; GCP Cloud NAT defaults to 1,200 seconds for established TCP and 30 seconds for UDP; consumer routers often expire UDP mappings in 30 to 60 seconds although RFC 4787 asks for at least two minutes. Anything that holds idle connections through a NAT (database pools, gRPC channels, WebSockets, VPN tunnels) needs a keepalive shorter than the smallest timer on the path, which is why WireGuard's recommended `PersistentKeepalive` is 25 seconds.

Each entry costs a few hundred bytes of kernel memory, so 262,144 entries is on the order of 100 MB. When the table fills, the kernel logs `nf_conntrack: table full, dropping packet` and new connections fail while existing ones carry on, a failure that looks like random timeouts on a busy node.

## NAT types, and why inbound connections fail

"Why can't a peer connect to me?" depends on two independent behaviours that RFC 4787 names precisely (the older "cone" names from RFC 3489 map onto them):

| Behaviour | Endpoint-independent | Address-dependent | Address-and-port-dependent |
|---|---|---|---|
| **Mapping**: does A:50000 keep the same external port for every destination? | Yes, one mapping for all destinations | New mapping per destination IP | New mapping per destination IP and port ("symmetric NAT") |
| **Filtering**: which outside packets may use a mapping? | Anyone ("full cone") | Hosts A has sent to ("restricted cone") | Exact IP:port pairs A has sent to ("port-restricted cone") |

Most home routers are endpoint-independent mapping with address-and-port-dependent filtering. Many enterprise firewalls and some carrier-grade NATs use address-and-port-dependent mapping, the symmetric kind. NATs also stack: the traceroute in [IP addressing and routing](/learn/networking/fundamentals/ip-addressing-and-routing), measured from the machine this lesson was written on, crosses a virtual switch, a home router and the ISP's carrier-grade NAT at 100.64.0.1 before reaching the internet, and a peer-to-peer path must get through all three.

## NAT traversal: STUN, TURN and ICE, traced

A video call between Alice and Bob, both behind NATs, wants a direct UDP path. WebRTC gets one with three pieces:

- **STUN** (RFC 8489): Alice sends a Binding request to a public STUN server; the server replies with the source address and port it saw, in an `XOR-MAPPED-ADDRESS` attribute (XORed so that NATs that rewrite addresses inside payloads leave it alone). That is Alice's mapping, learned from outside.
- **TURN** (RFC 8656): a relay with a public address. Alice allocates a relayed address on it and everything goes through the relay. It always works and costs the operator bandwidth for the whole call.
- **ICE** (RFC 8445): gather every candidate address, exchange them over the signalling channel (the app's own WebSocket or HTTP server), test pairs with STUN checks in priority order, and nominate the best pair that works.

Candidate priority is `2^24 × type preference + 2^8 × local preference + (256 − component)`, with recommended type preferences of 126 for host, 110 for peer-reflexive, 100 for server-reflexive and 0 for relay. With local preference 65,535 and component 1 that gives the numbers you see in real SDP: host 2,130,706,431, server-reflexive 1,694,498,815, relay 16,777,215. Direct paths are always tried before relays.

**Both NATs endpoint-independent, port-restricted filtering:**

1. Alice (192.168.1.10:50000) sends a STUN Binding to 198.51.100.10:3478. Her NAT maps it to 203.0.113.5:62001; the reply says so. Candidates: host 192.168.1.10:50000, server-reflexive 203.0.113.5:62001, relay 198.51.100.20:49152 from a TURN Allocate.
2. Bob does the same: host 10.0.0.8:40000, server-reflexive 192.0.2.9:33333, plus a relay.
3. They exchange candidates through the signalling server. ICE pairs them and sorts pairs by priority.
4. Host-to-host pairs fail: the private addresses are on different networks.
5. Alice sends a STUN check from 50000 to Bob's 192.0.2.9:33333. Her NAT reuses mapping 62001 (endpoint-independent) and now permits packets from 192.0.2.9:33333. Bob's NAT drops the check: Bob has not sent to Alice yet.
6. Bob sends a check to 203.0.113.5:62001. His NAT now permits Alice, and Alice's NAT already permits Bob (step 5), so it arrives. Alice answers; Bob's check succeeds, and Alice's retransmitted check now passes Bob's NAT too. The pair is nominated: a direct path, no relay. This mutual opening is **hole punching**.

**Alice behind a symmetric NAT:** in step 5 her NAT creates a new mapping for the new destination, say 203.0.113.5:62002. Bob, following the candidate Alice advertised, sends to 62001, whose filter only permits the STUN server, so his packets are dropped; Alice's packets arrive from a port Bob's NAT has never been told about. Checks on the server-reflexive pairs fail, and ICE falls back to the relay pair. With one symmetric side, hole punching can sometimes still succeed when the other side's filtering is permissive or through peer-reflexive candidates; with symmetric NATs on both sides, only TURN works. The share of sessions that need a relay depends on the user population; corporate networks and carrier-grade NAT push it up, which is why every production WebRTC deployment budgets TURN bandwidth. [Real-time transports](/learn/networking/application-protocols/real-time-transports) covers where WebRTC fits among the other options.

## Stateful firewalls versus stateless ACLs

A **stateless** filter judges each packet alone, against rules written for both directions. A **stateful** firewall keeps the conntrack-style table and judges only the first packet of a flow; replies are allowed because they match the flow. AWS exposes both, and their differences are a standard interview question:

| | Security group | Network ACL |
|---|---|---|
| Attached to | An elastic network interface (an instance, a load balancer, an endpoint) | A subnet |
| State | Stateful: return traffic is allowed automatically | Stateless: return traffic needs its own rule |
| Rules | Allow only; all rules are evaluated and any match allows | Allow and deny, numbered, evaluated lowest first, first match wins |
| Default | New group denies all inbound, allows all outbound | Default ACL allows all; a new custom ACL denies all |
| Sources | CIDRs, prefix lists, or other security groups | CIDRs only |

**A worked evaluation.** A client at 203.0.113.50:51000 opens HTTPS to a web server at 10.0.1.10:443 in a public subnet. The instance's security group allows inbound TCP 443 from 0.0.0.0/0. The subnet's custom network ACL is:

| Rule # | Direction | Protocol | Ports | Source / destination | Action |
|---|---|---|---|---|---|
| 100 | Inbound | TCP | 443 | 0.0.0.0/0 | Allow |
| 110 | Inbound | All | All | 203.0.113.0/24 | Deny |
| * | Inbound | All | All | 0.0.0.0/0 | Deny |
| 100 | Outbound | TCP | 443 | 0.0.0.0/0 | Allow |
| * | Outbound | All | All | 0.0.0.0/0 | Deny |

1. The SYN arrives at the subnet. The ACL checks inbound rules in order: rule 100 matches (TCP, port 443) and allows it. Rule 110, which was meant to block that /24, is never reached because the first match wins. Blocking a range needs a deny with a lower number than the allow.
2. The security group sees a NEW flow to port 443 from an allowed source: accepted, and the flow is tracked.
3. The server replies from 10.0.1.10:443 to 203.0.113.50:51000. The security group allows it as part of a tracked flow.
4. The reply reaches the ACL outbound: its destination port is 51000, not 443. Rule 100 does not match; `*` denies it. The client's handshake times out, although both "firewalls" allow HTTPS.

The fix is an outbound rule for the ephemeral range, TCP 1024–65535, because the client could be Linux (32768–60999 by default), Windows (49152–65535) or a NAT gateway or load balancer (1024–65535). Most teams leave network ACLs at their permissive default and do all filtering in security groups, which reference each other ("allow 5432 from the app tier's group") instead of addresses that change.

Stateful has a cost. The security group's connection tracking lives on the host's network card, and instance types have a tracked-connection allowance; very high connection rates can exhaust it, visible as the `conntrack_allowance_exceeded` counter in the ENA driver's statistics.

## VPCs, subnets and CIDR arithmetic

A VPC is a private IP space you choose, laid over the provider's physical network. Pick it once and carefully: it cannot overlap with anything you will ever peer with or reach over VPN, and AWS allows primary blocks from /16 (65,536 addresses) down to /28.

Split 10.0.0.0/16 into /20s. Four more prefix bits make 2⁴ = 16 subnets of 2¹² = 4,096 addresses each, stepping by 16 in the third octet:

| Subnet | Range | AWS usable |
|---|---|---|
| 10.0.0.0/20 | 10.0.0.0 – 10.0.15.255 | 10.0.0.4 – 10.0.15.254 (4,091) |
| 10.0.16.0/20 | 10.0.16.0 – 10.0.31.255 | 10.0.16.4 – 10.0.31.254 (4,091) |
| 10.0.32.0/20 | 10.0.32.0 – 10.0.47.255 | 10.0.32.4 – 10.0.47.254 (4,091) |
| … | … | … |
| 10.0.240.0/20 | 10.0.240.0 – 10.0.255.255 | 10.0.240.4 – 10.0.255.254 (4,091) |

AWS reserves five addresses in every subnet: the network address (.0), .1 for the VPC router, .2 for the Amazon-provided DNS resolver, .3 for future use, and the last address. A /24 therefore has 251 usable addresses and the smallest subnet, a /28, has 11. Azure also reserves five; GCP reserves four. A common layout for three availability zones uses nine of the sixteen /20s (public, private and data tiers in each zone) and keeps seven for growth; Kubernetes clusters that give every pod a VPC address consume /20s quickly, so size for pods, not nodes.

**Route tables** attach to subnets and are evaluated by longest-prefix match, as every router does. A private subnet's table might read:

| Destination | Target | Why |
|---|---|---|
| 10.0.0.0/16 | local | Everything inside the VPC, always present |
| 10.1.0.0/16 | pcx-1234 (peering) | The analytics VPC |
| pl-63a5400a (S3 prefix list) | vpce-s3 (gateway endpoint) | S3 without the NAT gateway |
| 0.0.0.0/0 | nat-0abc (NAT gateway) | Everything else |

A packet to 10.0.4.7 matches the /16 local route; to an S3 address, the prefix-list route is more specific than 0.0.0.0/0; to the card processor, only the default route matches. A subnet is "public" for exactly one reason: its default route points to an **internet gateway**, which translates between an instance's private address and its public IP one-to-one and is free apart from data transfer. A private subnet's default route points to a **NAT gateway** that sits in a public subnet and does the PAT traced above, which is also why it can only carry outbound-initiated flows.

## Private connectivity: endpoints, PrivateLink and peering

- A **gateway endpoint** (S3 and DynamoDB only) is a route-table entry for the service's prefix list. Traffic stays on the provider's network, bypasses the NAT gateway and has no hourly or per-GB charge.
- An **interface endpoint** (**PrivateLink**) puts a network interface with a private IP from your subnet in front of one service, yours or a vendor's, and private DNS points the service's usual hostname at it. Connections go one way, and overlapping CIDRs do not matter because nothing is routed between the VPCs. It costs an hourly fee per zone plus about a cent per GB.
- **VPC peering** routes between two VPCs' whole address ranges. It is **non-transitive**: with A peered to B and B peered to C, A cannot reach C through B, and A cannot use B's NAT gateway, internet gateway or VPN either. The ranges must not overlap. Ten VPCs that all talk need 45 peerings.
- A **transit gateway** is the hub alternative: every VPC attaches once and routes through it, transitively, for an hourly fee per attachment plus a per-GB processing charge.

## Zero trust

The perimeter model says the network is the boundary: inside the VPC or the office VPN is trusted. It fails the day one inside host is compromised, because everything that relied on "the packet came from 10.0.0.0/8" trusts the attacker too. **Zero trust**, the approach Google published as BeyondCorp in 2014, drops network location as a credential and authenticates every request by who and what is making it:

- **For people**, an identity-aware proxy (Google IAP, Cloudflare Access, AWS Verified Access) sits in front of internal apps; each request carries a single-sign-on identity and a device posture, and the proxy decides per request. There is no VPN into a flat network.
- **For services**, every workload gets a cryptographic identity, typically an X.509 certificate with a SPIFFE ID such as `spiffe://prod.example/ns/payments/sa/api`, issued for hours rather than years and rotated automatically. Every connection is mutual TLS, and authorisation policies name identities, not IP ranges. [TLS and PKI](/learn/networking/fundamentals/tls-and-pki) covers mutual TLS; [service meshes and proxies](/learn/networking/networking-in-practice/service-meshes-and-proxies) covers the sidecars that do it without application changes.

```viz
{"type": "system", "scenario": "service-mesh", "title": "Identity instead of network location", "caption": "Sidecar proxies authenticate each other with short-lived certificates and enforce which service identity may call which, so a compromised host inside the network gains nothing from its IP address."}
```

Security groups and ACLs remain, as defence in depth rather than the authorisation mechanism.

## Egress cost as a design constraint

Cloud networks charge for bytes that cross boundaries, and the prices are orders of magnitude apart. AWS list prices at the time of writing, which vary by region and change:

| Path | Order of magnitude per GB |
|---|---|
| Into the cloud from the internet | Free |
| Within one availability zone, private IPs | Free |
| Between availability zones in a region | About $0.01 each way, so $0.02 per GB round trip |
| Through a NAT gateway (processing, on top of transfer) | About $0.045 |
| Out to the internet | About $0.05–0.09, tiered by volume |
| S3 through a gateway endpoint | Free |

Three worked bills:

- **The nightly backup.** 10 TB a month to S3 through the NAT gateway costs 10,240 GB × $0.045 ≈ $460 a month in processing alone. A gateway endpoint makes it $0, with one route-table entry.
- **The chatty service across zones.** Two services exchange a sustained 1 Gbit/s across zones: 125 MB/s × 2,592,000 s in a 30-day month ≈ 324,000 GB, × $0.02 ≈ $6,500 a month. Zone-aware routing that keeps most calls in-zone cuts most of it, at the cost of less even load.
- **Serving users.** 50 TB a month of downloads from a region, at about $0.09 for the first 10 TB and $0.085 for the next 40, is roughly $4,400 a month; through a CDN the origin serves only the misses, and the CDN's own per-GB price is typically lower. At Netflix scale the same arithmetic is one reason video is served from Open Connect appliances inside ISPs rather than from the cloud region, as [CDNs and edge](/learn/networking/application-protocols/cdns-and-edge) describes.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Idle mappings expire | The first requests after a quiet period fail with resets or hang, then recover | Pool connections idle longer than the NAT's timer (350 s on an AWS NAT gateway); the kernel's keepalive starts at 7,200 s | TCP keepalive below the timer (`tcp_keepalive_time`, or per socket `TCP_KEEPIDLE`), pool max-idle below it, or bypass the NAT with an endpoint |
| Port exhaustion to one destination | Bursts of connection failures to one API while others work; `ErrorPortAllocation` on the NAT gateway, or GCP "OUT_OF_RESOURCES" drops | Too many simultaneous flows to one destination IP:port per public address (55,000 on AWS; GCP Cloud NAT defaults to 64 ports per VM) | Reuse connections (keep-alive, pooling), add NAT addresses, raise per-VM port allocation, or use a private endpoint |
| conntrack table full | Random new-connection timeouts on a busy node or Kubernetes worker; `nf_conntrack: table full` in the kernel log | `nf_conntrack_count` at `nf_conntrack_max` | Raise the max (memory is cheap), shorten timeouts for short-lived UDP, reuse connections |
| Five-second DNS delays in Kubernetes | Some lookups take exactly 5 s | Parallel A and AAAA queries from one socket race in conntrack's insertion and one is dropped; the resolver retries after its 5-s timeout | `single-request-reopen` in `resolv.conf`, or a node-local DNS cache that avoids the DNAT |
| Asymmetric firewall rules | Handshakes time out although the security group allows the port | A network ACL allows the service port inbound but not the ephemeral range outbound (the worked evaluation) | Allow TCP 1024–65535 for return traffic, or leave ACLs permissive and filter in security groups |
| WebRTC calls fail on some networks | Calls connect at home and fail on a corporate network or a mobile carrier | ICE logs show server-reflexive pairs failing: a symmetric NAT or blocked UDP | Run TURN, including TURN over TCP and TLS on port 443 for networks that block UDP |

## Trade-offs: ways to reach something outside a private subnet

| | NAT gateway | Gateway endpoint | Interface endpoint (PrivateLink) | VPC peering | Transit gateway |
|---|---|---|---|---|---|
| Direction | Outbound only | Outbound to S3/DynamoDB | Consumer to one service | Both ways, whole ranges | Both ways, hub routed |
| Transitive | n/a | n/a | No | No | Yes |
| Overlapping CIDRs | Fine | Fine | Fine | Not allowed | Not allowed |
| Cost order | ~$0.045/GB + hourly | Free | ~$0.01/GB + hourly per zone | Transfer only | Per GB + per attachment |
| Blast radius | Anything on the internet | One AWS service | One service | Every host in both VPCs | Every attached VPC, by route table |

## Interviewer follow-ups

**"Why can't two laptops at home connect to each other directly over the internet?"** Model answer: both are behind PAT; an inbound packet needs a mapping that only an outbound packet creates, and the filter usually requires that the mapping was created towards that exact peer. Hole punching makes both sides send first, with the addresses learned via STUN; it fails when a NAT allocates a new port per destination, and then a TURN relay carries the traffic. Common wrong answer: "because private IPs are not unique", which explains why they need NAT, not why NAT blocks inbound.

**"Security group or network ACL: which would you use to block one abusive /24?"** Model answer: a network ACL, because security groups have no deny rule; give the deny a lower rule number than any allow that would match, and remember ACLs are stateless. Better still, block it at the load balancer's WAF, which sees the client address before it reaches the VPC. Common wrong answer: "a security group deny rule", which does not exist.

**"Your service in a private subnet pushes 10 TB a month to S3 and the NAT bill is high. What do you do?"** Model answer: add a gateway endpoint for S3 to the private route tables; the prefix-list route is more specific than 0.0.0.0/0, so S3 traffic leaves the NAT path and the processing charge goes to zero. Check bucket policies that require the endpoint. Common wrong answer: "compress the data", which helps a little and misses the free path.

**"We peered VPC A with B and B with C. Why can't A reach C?"** Model answer: peering is non-transitive by design; routes from B's peering are not re-advertised, and A's packets to C's range have no route. Peer A with C directly, or move to a transit gateway if the mesh is growing. Common wrong answer: "add a route in A pointing C's range at the A-B peering", which the peering will not forward.

## What mid-level engineers get wrong

- Treating "in the private subnet" as authorisation. Anything that compromises one host inherits that trust; services should authenticate each other.
- Leaving TCP keepalive at the 2-hour Linux default for connections that cross a NAT with a 350-second idle timer, then debugging "random" morning resets.
- Opening one new connection per request through a NAT to a single API, then hitting per-destination port limits at a few hundred requests per second.
- Choosing a 10.0.0.0/16 for every VPC, then discovering at the first peering or acquisition that overlapping ranges cannot be routed together.
- Writing a network ACL deny rule after the allow it was meant to override, or forgetting the ephemeral-port rule for replies.
- Designing a service that moves terabytes between zones or out of the cloud without doing the per-GB arithmetic; the bill arrives a month later.

## Exercises

```exercise
id: pat-table-simulator
title: Simulate a PAT router
prompt: |
  Simulate a NAT with public address `public_ip`. `mode` is `"cone"`
  (endpoint-independent mapping: one mapping per inside address and port,
  reused for every destination) or `"symmetric"` (a separate mapping per
  inside address, inside port, destination address and destination port).
  Filtering is address-and-port-dependent in both modes.

  `events` is a list of:
  - `["out", inside_ip, inside_port, dst_ip, dst_port]`: an outbound packet.
    Find or create its mapping. A new mapping takes external port
    `inside_port` if no mapping uses it, otherwise the smallest higher port
    that no mapping uses. Record that this mapping has sent to
    `(dst_ip, dst_port)`. Output the rewritten source, `"public_ip:port"`.
  - `["in", src_ip, src_port, external_port]`: an inbound packet. If a
    mapping owns `external_port` and has sent to exactly
    `(src_ip, src_port)`, output the inside `"ip:port"` it is forwarded to;
    otherwise output `"drop"`.

  Return the list of outputs, one per event. Mappings never expire here.
languages: [python, javascript]
entry: pat_simulate
starter:
  python: |
    def pat_simulate(public_ip, mode, events):
        out = []
        # your code here
        return out
  javascript: |
    function pat_simulate(public_ip, mode, events) {
      const out = [];
      // your code here
      return out;
    }
tests:
  - args: ["203.0.113.5", "cone", [["out", "192.168.1.10", 51000, "104.20.23.154", 443], ["out", "192.168.1.11", 51000, "104.20.23.154", 443], ["in", "104.20.23.154", 443, 51001], ["in", "104.20.23.154", 443, 51000], ["in", "198.51.100.99", 40000, 51000]]]
    expected: ["203.0.113.5:51000", "203.0.113.5:51001", "192.168.1.11:51000", "192.168.1.10:51000", "drop"]
    label: two clients with the same source port (the lesson's trace)
  - args: ["203.0.113.5", "cone", [["out", "192.168.1.10", 50000, "198.51.100.10", 3478], ["out", "192.168.1.10", 50000, "192.0.2.9", 33333], ["in", "192.0.2.9", 33333, 50000], ["in", "192.0.2.9", 33334, 50000]]]
    expected: ["203.0.113.5:50000", "203.0.113.5:50000", "192.168.1.10:50000", "drop"]
    label: endpoint-independent mapping lets hole punching work
  - args: ["203.0.113.5", "symmetric", [["out", "192.168.1.10", 50000, "198.51.100.10", 3478], ["out", "192.168.1.10", 50000, "192.0.2.9", 33333], ["in", "192.0.2.9", 33333, 50000], ["in", "192.0.2.9", 33333, 50001]]]
    expected: ["203.0.113.5:50000", "203.0.113.5:50001", "drop", "192.168.1.10:50000"]
    label: a symmetric NAT gives the peer a port STUN never saw
  - args: ["203.0.113.5", "cone", [["in", "192.0.2.9", 33333, 50000], ["out", "192.168.1.10", 50000, "192.0.2.9", 33333], ["in", "192.0.2.9", 33333, 50000]]]
    expected: ["drop", "203.0.113.5:50000", "192.168.1.10:50000"]
    label: unsolicited inbound is dropped until the inside host sends first
  - args: ["198.51.100.1", "symmetric", [["out", "10.0.0.5", 40000, "104.20.23.154", 443], ["out", "10.0.0.6", 40000, "104.20.23.154", 443], ["out", "10.0.0.5", 40000, "104.20.23.154", 80], ["out", "10.0.0.6", 40001, "104.20.23.154", 443], ["in", "104.20.23.154", 80, 40002], ["in", "104.20.23.154", 443, 40003]]]
    expected: ["198.51.100.1:40000", "198.51.100.1:40001", "198.51.100.1:40002", "198.51.100.1:40003", "10.0.0.5:40000", "10.0.0.6:40001"]
    hidden: true
    label: port collisions cascade upwards
  - args: ["203.0.113.5", "cone", [["out", "192.168.1.10", 1024, "192.0.2.1", 53], ["out", "192.168.1.10", 1024, "192.0.2.1", 53], ["in", "192.0.2.1", 53, 1024], ["in", "192.0.2.1", 53, 1025]]]
    expected: ["203.0.113.5:1024", "203.0.113.5:1024", "192.168.1.10:1024", "drop"]
    hidden: true
    label: a repeated flow reuses its mapping
hints:
  - "Keep two maps: mapping key -> external port, and external port -> (inside address, set of destinations it has sent to)."
  - "The mapping key is `(ip, port)` in cone mode and `(ip, port, dst_ip, dst_port)` in symmetric mode; filtering always checks the exact `(src_ip, src_port)`."
```

```exercise
id: vpc-subnet-calculator
title: Split a VPC range into subnets
prompt: |
  Split the IPv4 block `cidr` (for example `"10.0.0.0/16"`) into subnets of
  prefix length `new_prefix` and return the first `count` of them in address
  order (fewer if the block holds fewer). The base address may have host
  bits set; clear them first. Return `[]` if `new_prefix` is shorter than
  the block's prefix or longer than 28 (AWS's smallest subnet).

  Each subnet is `[subnet_cidr, first_usable, last_usable, usable_count]`
  using AWS's rules: the first four addresses (network, VPC router, DNS,
  reserved) and the last address are not usable.
languages: [python, javascript]
entry: split_cidr
starter:
  python: |
    def split_cidr(cidr, new_prefix, count):
        # your code here
        return []
  javascript: |
    function split_cidr(cidr, new_prefix, count) {
      // your code here
      return [];
    }
tests:
  - args: ["10.0.0.0/16", 20, 3]
    expected: [["10.0.0.0/20", "10.0.0.4", "10.0.15.254", 4091], ["10.0.16.0/20", "10.0.16.4", "10.0.31.254", 4091], ["10.0.32.0/20", "10.0.32.4", "10.0.47.254", 4091]]
    label: a /16 into /20s
  - args: ["10.0.0.0/24", 28, 2]
    expected: [["10.0.0.0/28", "10.0.0.4", "10.0.0.14", 11], ["10.0.0.16/28", "10.0.0.20", "10.0.0.30", 11]]
    label: the smallest subnet has 11 usable addresses
  - args: ["10.0.0.0/24", 16, 1]
    expected: []
    label: cannot split into a larger block
  - args: ["172.31.77.9/20", 22, 4]
    expected: [["172.31.64.0/22", "172.31.64.4", "172.31.67.254", 1019], ["172.31.68.0/22", "172.31.68.4", "172.31.71.254", 1019], ["172.31.72.0/22", "172.31.72.4", "172.31.75.254", 1019], ["172.31.76.0/22", "172.31.76.4", "172.31.79.254", 1019]]
    hidden: true
    label: host bits in the base are cleared
  - args: ["192.168.0.0/23", 24, 5]
    expected: [["192.168.0.0/24", "192.168.0.4", "192.168.0.254", 251], ["192.168.1.0/24", "192.168.1.4", "192.168.1.254", 251]]
    hidden: true
    label: asking for more subnets than exist
hints:
  - "Convert the dotted quad to an integer, clear the low `32 - prefix` bits, and step by `2 ** (32 - new_prefix)`."
  - "In JavaScript, bitwise operators work on signed 32-bit integers; use arithmetic (`* 256`, `% size`, `Math.floor`) or `>>> 0` to stay unsigned."
```

## Senior signals

- You can trace a PAT table packet by packet, including a port collision between two inside hosts and why an unsolicited inbound packet is dropped.
- You know conntrack's states and the timeouts that matter (5 days for established TCP on Linux, 30 and 120 s for UDP, 350 s on an AWS NAT gateway) and set keepalives below the smallest one on the path.
- You describe NAT behaviour as mapping plus filtering, explain why endpoint-dependent mapping defeats hole punching, and can walk through ICE's STUN checks and its TURN fallback.
- You evaluate security groups (stateful, allow-only, union) and network ACLs (stateless, ordered, first match) on a concrete flow, including the ephemeral-port rule for replies.
- You do CIDR arithmetic in your head (a /16 is sixteen /20s of 4,096, minus five reserved per subnet on AWS) and choose non-overlapping ranges before the first peering.
- You pick between NAT gateway, gateway endpoint, PrivateLink, peering and transit gateway by direction, transitivity, overlap and per-GB cost, and treat egress as a line item in the design.
- You argue for identity (mutual TLS, identity-aware proxies) over network location as the basis of authorisation.

## Check yourself

```quiz
- q: >-
    Two hosts behind the same PAT router, 192.168.1.10 and 192.168.1.11, both connect from source port 51000 to the same server on port 443. How does the router keep the flows apart?
  options: ["It forwards both on port 51000 and lets TCP sequence numbers separate them", "It asks the server to open a second listening port for the second host", "It gives the second flow a different external source port", "It rejects the second flow until the first one closes"]
  answer: 2
  explanation: >-
    PAT identifies flows by the translated 5-tuple. The first flow keeps external port 51000; the second gets another port such as 51001, and replies to each external port are rewritten back to the right inside host. Sequence numbers are per connection and play no part in demultiplexing, and the server never knows there are two hosts.
- q: >-
    A service in a private subnet keeps a pool of idle connections to a partner API through an AWS NAT gateway. After quiet periods the first requests fail with connection resets. What is the most likely cause?
  options: ["The NAT gateway expired the idle mappings before any keepalive was sent", "The partner's TLS session tickets expired during the quiet period overnight", "The pool's DNS cache kept an old address for the partner's API endpoint", "The NAT gateway ran out of ports while the pool was not being used at all"]
  answer: 0
  explanation: >-
    AWS NAT gateways drop a TCP mapping after 350 seconds of inactivity and reset the next packet on it, while Linux sends its first keepalive after 7200 seconds by default. Set keepalives or pool idle limits below the timer. Expired tickets cost a full handshake, not a reset, and port exhaustion needs many active flows, not idle ones.
- q: >-
    Alice is behind a NAT that allocates a new external port for every destination. Why does ICE hole punching to Bob usually fail?
  options: ["ICE only tries relay candidates when either side uses a symmetric NAT", "Symmetric NATs block every UDP packet, including those for the STUN server", "STUN cannot report a mapping for a symmetric NAT, so no candidate exists", "Bob sends to the port STUN reported, which Alice's NAT did not use for Bob"]
  answer: 3
  explanation: >-
    STUN learns the mapping Alice's NAT created towards the STUN server. When Alice sends to Bob, her NAT creates a different mapping with a different port, so Bob's checks go to a port whose filter only admits the STUN server and are dropped. ICE still tries the direct pairs first by priority and falls back to the TURN relay when they fail.
- q: >-
    A subnet's network ACL allows inbound TCP 443 from anywhere and outbound TCP 443 to anywhere, with default denies. The instance's security group allows inbound 443. Clients cannot complete HTTPS handshakes. Why?
  options: ["The security group must also allow outbound 443 for the replies to pass", "Security groups and network ACLs cannot both be applied to one subnet", "The ACL's inbound rule needs a lower number than the default deny rule", "The ACL is stateless, and replies go to the clients' ephemeral ports"]
  answer: 3
  explanation: >-
    Network ACLs judge each packet alone. The server's replies are addressed to the client's ephemeral port (1024 to 65535 depending on the client), which no outbound rule allows, so the default deny drops them. The security group is stateful and allows replies to tracked flows automatically, and the default rule is always evaluated last.
- q: >-
    How many AWS-usable addresses does each subnet have when 10.0.0.0/16 is split into /20s, and how many such subnets are there?
  options: ["16 subnets of 4091 usable addresses", "16 subnets of 4094 usable addresses", "20 subnets of 4096 usable addresses", "4 subnets of 16,379 usable addresses"]
  answer: 0
  explanation: >-
    Going from /16 to /20 adds four prefix bits, so 2 to the 4th = 16 subnets of 2 to the 12th = 4096 addresses. AWS reserves the network address, the next three (router, DNS, future use) and the last address, leaving 4091. 4094 is the classic count that reserves only the network and broadcast addresses.
- q: >-
    VPC A is peered with VPC B, and B with C. A needs to reach a database in C. What works?
  options: ["Add a route in A that sends C's range to the A-B peering connection", "Peer A with C directly, or attach all three to a transit gateway", "Enable transitive routing on the B-C peering connection in B's settings", "Route A's traffic through B's NAT gateway, which forwards it on to C"]
  answer: 1
  explanation: >-
    Peering is non-transitive: a peering connection only carries traffic between its two VPCs, and edge-to-edge use of the peer's gateways is not allowed. A direct A-C peering (with non-overlapping ranges) or a transit gateway, which routes transitively between attachments, solves it; for one database, a PrivateLink endpoint is another option.
```

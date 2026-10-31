---
lesson: transport-as-the-network-sees-it
source: 3d77cd3ff02f674a
---
## 1

A backup through a VPN gateway connects and completes its TLS handshake, then transfers nothing until it times out. Ping to the server works. What is the most likely cause?

A, the gateway's NAT table expired the connection after the handshake. B, the server's TCP receive window is too small for a backup. C, full-size packets with the don't-fragment bit set are dropped, and their ICMP is filtered. D, the TLS handshake picked a cipher the gateway cannot forward.

[think]

The answer is C: full-size don't-fragment packets are dropped, and their ICMP is filtered.

Small packets, the handshake, TLS and default pings, get through, and full-size ones never arrive. That is the signature of a path-MTU black hole: the tunnel's MTU is below the hosts', fragmenting is forbidden, and the ICMP that would shrink the segments is thrown away. A small window slows a transfer but does not stop it, a cipher does not affect forwarding, and a NAT would not expire seconds after the handshake.

## 2

One TCP transfer from Amsterdam to Singapore, with a round trip of 105 milliseconds, levels off near 480 megabits per second on an idle 10 gigabit circuit, with no loss. What limits it?

A, the 1,500-byte MTU caps how many bytes each packet can carry per round trip. B, ECMP splits the flow over two circuits, so each carries only part of it. C, the receive buffer caps the window, and a flow moves one window per round trip. D, the long-haul circuit's propagation delay lowers its usable line rate.

[think]

The answer is C: the receive buffer caps the window, and a flow moves one window per round trip.

One flow can have at most one window of unacknowledged bytes in flight, so its throughput is the window divided by the round trip. Linux's default 6 megabyte maximum receive buffer gives about 480 megabits per second over 105 milliseconds, while filling 10 gigabits would need about 131 megabytes in flight. The MTU sets packet size, not how many packets are in flight, ECMP never splits one flow, and delay does not change a link's line rate.

## 3

A 3,000-byte IPv4 packet, with the don't-fragment bit clear, is fragmented for a 1,500-byte link. Why can a port-based firewall rule not be applied to the second fragment?

A, its IP header has a different identification value. B, it is encrypted until the destination reassembles it. C, its protocol field is changed to show it is a fragment. D, it carries no TCP or UDP header, so it has no ports.

[think]

The answer is D: it carries no TCP or UDP header, so it has no ports.

Only the first fragment carries the transport header. The later ones share the addresses, protocol and identification, but start with arbitrary payload bytes, so there are no ports to read. That is why many firewalls drop non-first fragments, and why switching chips hash fragments on addresses only. The identification is the same in every fragment, the protocol field is unchanged, and fragmentation encrypts nothing.

## 4

A tenant's hosts use a 9,000-byte MTU, and their traffic crosses the fabric in VXLAN over IPv4. What is the smallest underlay link MTU that carries full-size packets?

A, 9,050 bytes, adding the tunnel's 50 bytes. B, 9,000 bytes, the same as the hosts. C, 9,018 bytes, adding the Ethernet header and frame checksum. D, 9,216 bytes, the jumbo maximum.

[think]

The answer is A: 9,050 bytes, adding the tunnel's 50 bytes.

VXLAN over IPv4 adds 50 bytes inside the outer IP packet: outer IP 20, UDP 8, VXLAN 8, and the inner Ethernet header 14. So a 9,000-byte inner packet needs a 9,050-byte underlay MTU, and 9,000 drops every full-size packet. The outer Ethernet header and checksum sit outside the IP MTU. 9,216 works and is a common setting, but it is not the minimum.

## 5

An operator enables MSS clamping at a tunnel edge. Which traffic does it fail to protect from the path-MTU black hole?

A, TCP connections opened after clamping was enabled. B, large UDP datagrams, such as big DNS answers. C, TLS sessions carried inside clamped TCP connections. D, TCP connections whose SYN crossed the clamping box.

[think]

The answer is B: large UDP datagrams, such as big DNS answers.

Clamping rewrites the maximum segment size in TCP SYNs, and only TCP has one. UDP datagrams still depend on the ICMP message, or on probing the path themselves, as QUIC does. New TCP connections through the box are protected, and so is anything inside them, TLS included. The only exposed TCP connections are those already open before clamping began.

## 6

Why does one RoCEv2 GPU-to-GPU transfer tend to collide with others on a single uplink, when thousands of web flows carried in VXLAN spread evenly?

A, a few queue pairs make a few huge flows, with few distinct five-tuples. B, RoCEv2 packets are too large for the ECMP hash to read. C, switches exclude UDP port 4791 from ECMP hashing by default. D, RoCEv2 uses TCP underneath, which pins one path per host.

[think]

The answer is A: a few queue pairs make a few huge flows, with few distinct five-tuples.

Each queue pair is one five-tuple, and GPU traffic travels over a handful of queue pairs carrying very large volumes, so the hash has few flows to spread and two can land on one link. VXLAN writes each inner flow's hash into its outer source port, giving thousands of distinct tuples. Packet size does not affect the hash, RoCEv2 runs over UDP rather than TCP, and port 4791 is hashed like any other.

---
slug: transport-as-the-network-sees-it
title: "Transport as the network sees it: ports, the 5-tuple, MTU and tunnels"
description: What routers, switches and firewalls read from TCP and UDP (ports, the 5-tuple that ECMP and stateful firewalls key on, the TCP fields a middlebox can see and rewrite), how MTU, fragmentation and path-MTU discovery work and how an ICMP filter turns them into a black hole, and why VXLAN, RoCEv2 and QUIC all ride on UDP.
minutes: 45
difficulty: medium
tags: [fabric-networking, tcp, udp, five-tuple, ecmp, conntrack, mtu, fragmentation, pmtud, mss-clamping, vxlan, rocev2, quic]
problems: [flow-table-ttl]
---
Acme's nightly backup from `acme-web1` to its cloud region connects, logs "upload started", moves no bytes for fifteen minutes and fails with a timeout. Ping works, TLS worked, small API calls to the same address work, and every BGP session is Established. The cause is a 50-byte difference between two numbers and an ICMP message a firewall threw away.

Routers forward on the IP header, as the [packet walk](/learn/fabric-networking/from-zero/the-packet-walk) showed. But the network also reaches one layer up, into TCP and UDP (layer 4), in three ways: it **hashes** transport fields to spread flows over equal paths, it **tracks** them in stateful firewalls and NAT, and it **limits** their size with the MTU, which tunnels make smaller. The endpoint's side (TCP's state machine, timers, congestion control) is in [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) and [congestion control](/learn/networking/fundamentals/congestion-control).

## Ports: the address of a socket

IP delivers a packet to a host; the transport layer adds a second address, the **port**, a 16-bit number naming one socket (one program's endpoint) on that host. Servers listen on well-known ports (443 for HTTPS, 5432 for PostgreSQL, 179 for BGP). A connecting client gets an **ephemeral** port from its kernel: Linux picks from 32768–60999 (`net.ipv4.ip_local_port_range`), IANA recommends 49152–65535. The IP header's **protocol** field names what follows it: 6 TCP, 17 UDP, 1 ICMP (Internet Control Message Protocol, the channel routers use to report errors back to a sender), 47 GRE and 50 IPsec ESP (two tunnelling protocols that carry no ports).

UDP, the User Datagram Protocol, is the minimum a transport can be: ports, length, checksum, data. No connection, ordering or retransmission. Its best-known fabric use is **VXLAN** (Virtual Extensible LAN), which wraps a tenant's Ethernet frame in UDP so it can cross a routed fabric; this lesson's last section covers it.

| Field | Size | Value in a VXLAN packet | What reads it |
|---|---|---|---|
| Source port | 16 bits | 54043 | Receiver (for replies); every ECMP hash on the path |
| Destination port | 16 bits | 4789 (VXLAN) | Receiver's demultiplexer; ACLs (access control lists, a switch's permit/deny rules); the ECMP hash |
| Length | 16 bits | header plus payload, in bytes | Receiver |
| Checksum | 16 bits | often 0 (allowed over IPv4: "not computed") | Receiver, if non-zero |

TCP, the Transmission Control Protocol, adds a connection with numbered bytes, acknowledgements and flow control. Its header is 20 bytes plus up to 40 of options, all of it visible to the network:

| Field | Size | Example (acme-web1 to acme-db1) | Who in the network reads it |
|---|---|---|---|
| Source port | 16 bits | 51514 | ECMP hash, firewalls, NAT (which rewrites it) |
| Destination port | 16 bits | 5432 | ECMP hash, ACLs, firewalls, load balancers |
| Sequence number | 32 bits | 1000 | Stateful firewalls (is it inside the window?); taps that count retransmissions |
| Acknowledgement number | 32 bits | 0 on a SYN | Stateful firewalls; taps that measure round-trip time |
| Data offset | 4 bits | 10 (× 4 = 40 bytes with options) | Anything that must find the payload |
| Flags | 8 bits | SYN | Firewalls create state on SYN, remove it on FIN or RST; ECE and CWR echo ECN (explicit congestion notification: a router marking a packet instead of dropping it) |
| Window | 16 bits | 64240 | Only the endpoints, but a tap can see a receiver stalling (window 0) |
| Checksum | 16 bits | covers header, data and both IP addresses | NAT and MSS clamping must patch it when they rewrite a field |
| Urgent pointer | 16 bits | 0 | Nobody |
| Options (SYN only, mostly) | up to 40 bytes | MSS 1460, window scale 7, SACK (selective acknowledgement) permitted, timestamps | MSS clamping rewrites the MSS; firewalls may strip unknown options |

## The 5-tuple: a flow's name

Five fields identify one conversation: **source IP, destination IP, protocol, source port, destination port**. That is the **5-tuple**, and the packets sharing one form a **flow**. A TCP connection is two flows with the tuple mirrored (`10.1.1.10:51514 → 10.1.2.20:5432` and back). Three database connections from `acme-web1` differ only in source port, and to the network they are three unrelated flows.

### Why ECMP keys on it

`leaf1.ams` has four equal-cost uplinks, one per spine (ECMP, equal-cost multipath, from [the routing table](/learn/fabric-networking/from-zero/the-routing-table)). Spraying packets round-robin would use the links perfectly and wreck TCP: packets crossing queues of different depth arrive out of order, and the receiver's duplicate acknowledgements make the sender retransmit and slow down. So the switch hashes the 5-tuple and takes it modulo the number of links: every packet of a flow gets the same hash and link and stays in order, and over thousands of flows the load evens out.

The scheme is stateless and order-preserving, with two weaknesses that later lessons fix: it balances **flows, not bytes**, so two "elephant" flows can share a link while another idles; and it needs **entropy**, many distinct tuples, which tunnels and AI traffic lack ([ECMP and hashing](/learn/fabric-networking/fabric-architecture/ecmp-and-hashing)).

```viz
{"type": "fabric", "scenario": "ecmp-hash", "title": "Hashing the 5-tuple: one changed port moves a flow, and a VXLAN source port carries the inner flow's entropy", "caption": "leaf1.ams with four spine uplinks. Flow A's five fields hash to 0xb6af131b, which modulo 4 picks spine4.ams; flow B differs only in source port and lands on spine3.ams; five flows spread 1/1/1/2. Then the same connections are tunnelled in VXLAN: with one fixed outer source port every flow hashes to spine4.ams, and with the inner hash written into the outer source port (54043 and 56774) they split onto spine1.ams and spine4.ams."}
```

### What the hash cannot see

The hash reads ports right behind the IP header. Three kinds of packet have none there:

- **Non-first IPv4 fragments.** Only the first piece of a fragmented packet (below) carries the TCP or UDP header, so a naive hash can send the rest down a different link. Many ASICs (switching chips) hash every fragment on addresses only, which keeps fragments together but splits a flow that is only sometimes fragmented.
- **Protocols without ports.** GRE, IPsec ESP and IP-in-IP: unless the ASIC reads inside, a GRE tunnel between two routers takes one link, however many flows ride in it.
- **ICMP errors.** An ICMP "too big" is a new packet from the router that generated it, protocol 1, no ports; the offending header is quoted inside, where the hash does not look. Where several servers share one address behind ECMP (**anycast**, used by many load balancers and front-ends), the ICMP about a connection can reach a server that never heard of it, which is why operators of such front-ends copy "too big" messages to every server in the group.

The code parses real IPv4 headers as a hash stage does and shows all three. CRC-32 stands in for the vendor hash; the DF ("don't fragment") flag it sets is explained in the MTU section.

```python
import socket
import struct
import zlib


def ipv4(src, dst, proto, payload, df=True, mf=False, offset=0):
    flags = (0x4000 if df else 0) | (0x2000 if mf else 0) | (offset // 8)
    hdr = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + len(payload), 0x1C46, flags,
                      64, proto, 0, socket.inet_aton(src), socket.inet_aton(dst))
    return hdr + payload


def l4(sport, dport, size=8):          # the start of a UDP (8 B) or TCP (20 B) header
    return struct.pack("!HH", sport, dport) + bytes(size - 4)


def flow_key(pkt, fragment_aware=False):
    """The fields an ECMP hash reads from an IPv4 packet."""
    ihl = (pkt[0] & 0x0F) * 4                      # IP header length in bytes
    proto = pkt[9]
    src, dst = socket.inet_ntoa(pkt[12:16]), socket.inet_ntoa(pkt[16:20])
    frag = struct.unpack("!H", pkt[6:8])[0]
    offset = frag & 0x1FFF                         # in 8-byte units
    more_fragments = bool(frag & 0x2000)
    if proto in (6, 17) and offset == 0 and not (fragment_aware and more_fragments):
        sport, dport = struct.unpack("!HH", pkt[ihl:ihl + 4])
        return (src, dst, proto, sport, dport)
    return (src, dst, proto)                       # no ports here, or ignored on purpose


def pick(pkt, members, fragment_aware=False):
    key = flow_key(pkt, fragment_aware)
    return members[zlib.crc32(repr(key).encode()) % len(members)], key


SPINES = ["spine1.ams", "spine2.ams", "spine3.ams", "spine4.ams"]
WEB1, DB1 = "10.1.1.10", "10.1.2.20"

print("Three TCP connections, acme-web1 -> acme-db1:5432")
for sport in (51514, 51515, 51516):
    print("  ", *pick(ipv4(WEB1, DB1, 6, l4(sport, 5432, 20)), SPINES))

print("A 3,000-byte IPv4 packet of UDP, DF clear, fragmented 1,480 + 1,480 + 20")
frags = [ipv4(WEB1, DB1, 17, l4(40001, 6000) + bytes(1472), df=False, mf=True),
         ipv4(WEB1, DB1, 17, bytes(1480), df=False, mf=True, offset=1480),
         ipv4(WEB1, DB1, 17, bytes(20), df=False, offset=2960)]
for aware in (False, True):
    print("   fragment-aware hash:" if aware else "   naive hash:")
    for i, f in enumerate(frags, 1):
        print(f"     fragment {i}:", *pick(f, SPINES, aware))

print("Four servers behind one address, 203.0.113.10, chosen by ECMP at gw1.ams")
SERVERS = ["web-a", "web-b", "web-c", "web-d"]
flow = ipv4("198.51.100.77", "203.0.113.10", 6, l4(40224, 443, 20))
too_big = ipv4("192.0.2.1", "203.0.113.10", 1, bytes([3, 4, 0, 0, 0, 0, 0x05, 0xAA]) + flow[:28])
print("   the client's connection:", *pick(flow, SERVERS))
print("   ICMP 'too big' about it:", *pick(too_big, SERVERS))
```

```text
Three TCP connections, acme-web1 -> acme-db1:5432
   spine2.ams ('10.1.1.10', '10.1.2.20', 6, 51514, 5432)
   spine4.ams ('10.1.1.10', '10.1.2.20', 6, 51515, 5432)
   spine1.ams ('10.1.1.10', '10.1.2.20', 6, 51516, 5432)
A 3,000-byte IPv4 packet of UDP, DF clear, fragmented 1,480 + 1,480 + 20
   naive hash:
     fragment 1: spine1.ams ('10.1.1.10', '10.1.2.20', 17, 40001, 6000)
     fragment 2: spine3.ams ('10.1.1.10', '10.1.2.20', 17)
     fragment 3: spine3.ams ('10.1.1.10', '10.1.2.20', 17)
   fragment-aware hash:
     fragment 1: spine3.ams ('10.1.1.10', '10.1.2.20', 17)
     fragment 2: spine3.ams ('10.1.1.10', '10.1.2.20', 17)
     fragment 3: spine3.ams ('10.1.1.10', '10.1.2.20', 17)
Four servers behind one address, 203.0.113.10, chosen by ECMP at gw1.ams
   the client's connection: web-d ('198.51.100.77', '203.0.113.10', 6, 40224, 443)
   ICMP 'too big' about it: web-a ('192.0.2.1', '203.0.113.10', 1)
```

`offset == 0` is the only proof that a transport header follows the IP header, and the ICMP's key holds the *router's* address, `192.0.2.1`, so it lands on `web-a` while the connection lives on `web-d`. The ranges `198.51.100.0/24`, `192.0.2.0/24` and `203.0.113.0/24` are reserved for documentation (RFC 5737).

### Why firewalls and NAT key on it

A **stateful firewall** allows a reply only if it saw the connection start. Its table is keyed by 5-tuple: a SYN from `acme-web1:51514` to `10.1.2.20:5432` creates an entry, the SYN-ACK matches it mirrored, and FIN, RST or an idle timeout removes it. Linux's `conntrack` does this inside every Linux router, Kubernetes node and NAT gateway. NAT ([NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking)) is such an entry that also rewrites the source address and port, reversing it on replies and patching the checksum.

- **Solves:** allowing replies without opening every port; address sharing.
- **Breaks:** asymmetric routing, where the SYN-ACK returns through a firewall that never saw the SYN ([the packet walk](/learn/fabric-networking/from-zero/the-packet-walk)); table exhaustion (new connections fail at random, existing ones carry on); idle timeouts, where a silent database connection is forgotten and its next packet dropped. Linux keeps an established TCP entry 5 days (`nf_conntrack_tcp_timeout_established`, 432,000 s) but UDP only 30 s until a reply is seen; many firewalls and cloud NAT gateways expire idle TCP within minutes.
- **Signal:** entries against `nf_conntrack_max`, the kernel log line `nf_conntrack: table full, dropping packet`, per-rule drops, and connections failing on the first packet after idling. The [flow table with idle timeouts](/practice/flow-table-ttl) problem builds this structure.

## TCP as the network sees it

The network never acknowledges or retransmits; it forwards, queues, drops and marks. Everything TCP does is the endpoints reacting to those four actions, and most of it is visible to anyone with a tap (a passive copy of the traffic).

### The handshake

SYN, SYN-ACK, ACK: one round trip before data ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive)). The network decides here: a stateful firewall creates its entry, a load balancer picks a backend, and each side announces options (MSS, window scaling, SACK, timestamps) that are never sent again, so a box that rewrites them must do it now. A tap seeing SYN and SYN-ACK measures the round trip with no agent on either host.

- **Solves:** both sides agree on starting sequence numbers and options before any data is at risk.
- **Breaks:** a silently filtered SYN is retried after 1, 2, 4, 8, 16 and 32 s, so with Linux's default `tcp_syn_retries` of 6 the connect fails after about 127 s; a rejecting firewall sends RST and the client fails in one round trip.
- **Signal:** client SYN retransmissions (`nstat` counter `TcpExtTCPSynRetrans`); connect time measured apart from time to first byte.

### Windows: why distance caps a single flow

A sender may have at most one **window** of unacknowledged bytes in flight (the smaller of the receiver's advertised window and its own congestion window), so one flow's throughput is capped at window ÷ RTT (round-trip time) whatever the link speed. The 16-bit window field is multiplied by the window-scale option, up to 2^14, so windows can reach 1 GB.

Worked on Meridian: Amsterdam to Singapore is about 10,500 km of fibre at 5 µs per km, a round trip of at least 105 ms. Filling 10 Gb/s needs 10 × 10⁹ × 0.105 = 1.05 × 10⁹ bits, about 131 MB, in flight: the **bandwidth-delay product**. Linux's default maximum receive buffer is about 6 MB (`net.ipv4.tcp_rmem`, third value 6,291,456), only part of it advertised, so one flow manages at most 6.3 MB × 8 ÷ 0.105 s ≈ 480 Mb/s. Leaf to leaf at 100 Gb/s with a 20 µs RTT the product is only 250 KB. "The Singapore circuit is slow" is often a host buffer setting, not the network ([latency, bandwidth and the math](/learn/networking/networking-in-practice/latency-bandwidth-and-math)). **Signal:** `ss -ti` on the sender reporting time spent `rwnd_limited` or `sndbuf_limited` while the link sits idle.

The window also makes TCP bursty: a host that does not pace emits a whole window back to back at line rate, and many servers doing so towards one requester at the same instant overflow its port: **incast** ([why AI traffic is different](/learn/fabric-networking/ai-fabrics/why-ai-traffic-is-different)).

### Retransmissions: the host's drop counter

Only the endpoints learn of a drop. **Fast retransmit**: later segments still arrive, each produces a duplicate ACK, and after three the sender resends the hole within about a round trip. **Tail loss**: when the last segments of a burst are lost, no duplicates come back; Linux sends a **tail loss probe** (RACK-TLP, RFC 8985) after about two round trips plus a couple of milliseconds, or about 200 ms when only one segment was outstanding. **Timeout**: if the probe fails too, the sender waits its retransmission timeout (RTO), at least 200 ms on Linux, doubling on each failure, and restarts from a congestion window of one segment.

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "Fast retransmit: three duplicate ACKs recover one lost segment without waiting for the timer", "caption": "Four segments are sent and seq=1001 is lost. The receiver keeps acknowledging 1001 as later segments arrive; the third duplicate ACK makes the sender resend 1001 at once, the cumulative ACK jumps to 4001, and the congestion window is halved (classic Reno; Linux's default CUBIC cuts it to 70%) rather than reset. A timeout instead would cost at least 200 ms."}
```

Inside a site the round trip is tens of microseconds, so 200 ms is ten thousand round trips of idleness: a one-segment request whose packet is dropped takes over 200 ms instead of 50 µs, visible in the application's p99, not in any network graph. Reordering from per-packet spraying looks like loss too, which is why adaptive-routing fabrics put packets back in order in the NIC.

- **Solves:** recovery from any drop without help from the network.
- **Breaks:** a lossy link turns into tail latency on the hosts long before any switch alarm.
- **Signal:** retransmitted segments per second (`nstat TcpRetransSegs`; per connection, `retrans:` in `ss -ti`). Grouped by destination leaf, it often reveals a lossy link no switch counter shows.

### MSS: the one TCP field routers rewrite

The **maximum segment size** is the largest TCP payload a host will receive in one segment, announced in its SYN as its interface MTU minus 40 bytes of IPv4 and TCP header (60 with IPv6): 1,460 on 1,500, 8,960 on 9,000. Each sender keeps its segments within the smaller of the *other* side's MSS and its own interface's limit; the values are not negotiated to a common one, and neither knows the links in between. Timestamps take 12 bytes per segment, hence `mss:1448` in `ss -ti` on a 1,500-byte path. Being TCP's only size hint, the MSS is what a tunnel edge rewrites in passing SYNs (the fix that closes the next section).

- **Solves:** a sender never builds segments larger than the receiver's link carries.
- **Breaks:** a smaller link mid-path is invisible to it.
- **Signal:** `mss` and `pmtu` per connection in `ss -ti`; a SYN capture showing the MSS before and after a gateway.

## MTU: the largest packet a link carries

The **MTU**, maximum transmission unit, is the largest IP packet an interface sends, counted from the IP header and excluding the Ethernet header and FCS (frame check sequence, the frame's 4-byte CRC): standard Ethernet carries 1,500 bytes of IP in a 1,518-byte frame ([links, frames and Ethernet](/learn/fabric-networking/from-zero/links-frames-and-ethernet)). **Jumbo frames** raise it: hosts commonly use 9,000, data center switches commonly support up to 9,216. Some vendors include the Ethernet header in what they call MTU, so two devices set to "9,216" can differ by 14 to 22 bytes; compare IP MTUs.

- **The internet stays at 1,500**, the common denominator nobody negotiates beyond. IPv6 guarantees only 1,280 end to end.
- **Fabrics run 9,216** so tunnels have headroom (VXLAN adds 50 bytes to a tenant's 1,500 or 9,000) and hosts and switches do less per-packet work per byte.

A packet larger than the egress MTU meets one of three fates:

1. **Fragmented** by the router, if it is IPv4 and the **DF** ("don't fragment") bit is clear.
2. **Dropped with an ICMP error**: ICMP type 3, code 4 ("fragmentation needed", carrying the next-hop MTU) for IPv4 with DF set; ICMPv6 type 2, "Packet Too Big", always for IPv6, whose routers never fragment.
3. **Dropped silently.** A layer-2 device (a switch inside a carrier's circuit, or a receiving port set smaller than its neighbour) has no IP address on the path and cannot send ICMP; it counts an oversize or "giant" frame and discards it. The [BGP session that flaps every three minutes](/learn/fabric-networking/bgp-fundamentals/bgp-sessions-and-the-fsm) is this case: small messages bring it up, and full-size UPDATE segments vanish.

IS-IS (the underlay routing protocol) refuses an MTU mismatch on purpose: it pads hellos to the full interface MTU, so the smaller side drops the larger side's hellos and the adjacency never forms ([underlay failures in production](/learn/fabric-networking/underlay/underlay-failures-in-production)): failing loudly at bring-up beats silently dropping large packets.

### IPv4 fragmentation, traced

`acme-web1` sends a 3,000-byte IPv4 packet (20 bytes of header, 2,980 of UDP) with DF clear into a 1,500-byte link. The router cuts the payload into pieces of at most 1,480 bytes, multiples of 8 because the offset field counts 8-byte units:

| Fragment | Identification | MF (more fragments) | Offset field | Bytes of payload | IP total length | Carries the UDP header? |
|---|---|---|---|---|---|---|
| 1 | 0x1c46 | 1 | 0 | 0–1,479 | 1,500 | yes |
| 2 | 0x1c46 | 1 | 185 (1,480 ÷ 8) | 1,480–2,959 | 1,500 | no |
| 3 | 0x1c46 | 0 | 370 (2,960 ÷ 8) | 2,960–2,979 | 40 | no |

Only the destination reassembles, matching on source, destination, protocol and identification, and waits up to 30 s on Linux (`net.ipv4.ipfrag_time`) for missing pieces. Every problem with fragmentation follows from that table:

- **Loss multiplies.** Lose one fragment and the whole packet is gone: at 1% loss a three-fragment packet dies about 3% of the time.
- **Fragments 2 and 3 have no ports**, so port-based firewall rules cannot match them (many drop non-first fragments) and hashes treat them differently.
- **The identification wraps.** It is 16 bits. At 1 Gb/s of 1,500-byte fragments, about 83,000 per second, IDs repeat every 0.8 s, well inside the 30 s window, so a stale fragment can be stitched into a new packet; the UDP checksum catches most, not all (RFC 4963).
- **Routers fragment slowly**: many platforms punt it to the CPU ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)).

RFC 8900 (2020), "IP Fragmentation Considered Fragile", tells protocols to avoid it. TCP has since 1990, by discovering the path MTU.

## Path-MTU discovery and its black hole

**Path-MTU discovery** (PMTUD, RFC 1191 for IPv4, RFC 8201 for IPv6) finds the path's smallest MTU without fragmenting ([layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation) introduces it). The sender sets DF (Linux does on all TCP by default); a router whose next link is too small drops the packet and returns ICMP "fragmentation needed" with the next-hop MTU; the sender's kernel records it, shrinks its segments and retransmits at once.

The weak point: the correction is an ICMP message from a router the sender has never heard of, and it must survive every filter on the way back, because nothing else in TCP will ever lower the segment size. The backup from the opening:

1. `acme-web1` (MTU 1,500) connects to `acme-cloud1` (`10.200.1.50`, port 443) in Acme's cloud region. The fabric runs 9,216, but `gw1.ams` reaches the cloud through a VXLAN tunnel across the internet: 1,500 minus 50 bytes of tunnel headers is a tunnel MTU of 1,450.
2. Both SYNs advertise MSS 1,460. The 60-byte handshake packets and TLS's early messages cross the tunnel.
3. The upload sends full segments: 1,460 bytes of data in a 1,500-byte DF packet.
4. `gw1.ams` may not fragment it, so it drops it and sends ICMP type 3, code 4, next-hop MTU 1,450, here from its loopback `10.255.1.201` (the source address a router picks for ICMP varies by platform, and is itself a cause of filtering, below).
5. `acme-web1`'s host firewall, as "hardening", drops every inbound ICMP type except the echo replies that keep ping working.
6. TCP retransmits the same segment as its RTO doubles from 200 ms (at 0.2, 0.6, 1.4 and 3.0 s, next RTO 3,200 ms); every copy dies at `gw1.ams` and every ICMP at the host.
7. Linux retries for about 15 minutes (`tcp_retries2` = 15), then gives up: the opening's timeout.

```viz
{"type": "fabric", "scenario": "pmtud-blackhole", "title": "Path-MTU black hole: the 1,500-byte DF segment dies at a 1,450-byte tunnel, the ICMP is filtered, then MSS clamping fixes it", "caption": "acme-web1 uploads to acme-cloud1 through gw1.ams's VXLAN tunnel (MTU 1,450). Both SYNs say MSS 1,460, so the handshake works; the first 1,500-byte DF segment is dropped at gw1.ams, its ICMP fragmentation-needed is dropped by acme-web1's host firewall, and retransmissions back off from 200 ms while nothing is acknowledged. Then gw1.ams clamps the MSS in both SYNs to 1,410 and 1,450-byte packets flow with no ICMP at all."}
```

The signature: **connects, then hangs on the first large transfer**. SSH logs in and freezes on a long listing; ping works because a default ping is 84 bytes. Test at full size with DF set: `ping -M do -s 1472 10.200.1.50` (1,472 of data, 8 of ICMP header, 20 of IP: 1,500) fails, `-s 1422` (1,450) succeeds. A capture on the sender shows one full-size segment retransmitted with growing gaps. If the ICMP appears in that same capture, the host's own firewall is discarding it (`tcpdump` sees inbound packets before the firewall does); if it never arrives while a capture on the gateway shows it leaving, the filter lies between the two.

### Where the ICMP gets lost

Besides host firewalls:

- **Edge ACLs and security groups** that allow TCP 443 and nothing else.
- **Generation rate limits.** The ASIC punts the dropped packet to the router's CPU to build the ICMP, behind a control-plane policer ([planes, ASICs and network operating systems](/learn/fabric-networking/from-zero/planes-asics-and-network-operating-systems)) whose rate is platform-specific, often hundreds to a few thousand packets per second per class. Under a flood of oversized packets most senders never hear back. (Linux exempts "fragmentation needed" from its own ICMP rate limits.)
- **ECMP and anycast**: the ICMP reaches the wrong server, as the code showed.
- **Source checks**: the ICMP comes from a fabric or loopback address that anti-spoofing filters at the next boundary drop.
- **Layer-2 devices**, which never send one.

### The fixes, and what each covers

**MSS clamping**, where the viz ends: the tunnel edge rewrites the MSS in every SYN and SYN-ACK it forwards down to tunnel MTU minus 40 (1,410) and patches the checksum. It is cheap and local to the box that created the problem; most VPN gateways and home routers on PPPoE links (MTU 1,492) do it by default. But only TCP has an MSS, and only connections whose handshake crossed the box are protected.

**Allowing ICMP type 3 code 4 and ICMPv6 type 2** fixes every protocol, but depends on every filter on every return path.

**Packetization-layer PMTUD** (PLPMTUD, RFC 4821; RFC 8899 for datagram protocols) stops trusting ICMP: the sender probes with larger packets and treats a lost probe as "too big". Linux's `net.ipv4.tcp_mtu_probing` is 0 (off) by default, 1 enables it once a black hole is suspected, 2 always. QUIC uses the datagram version.

**Raising the underlay MTU** is the fabric's own answer: Meridian's 9,216-byte links carry tenant packets plus VXLAN with room to spare. It works only where you own every link, so the problem moves to the edges (internet, carrier circuits, cloud interconnects).

| Fix | Repairs TCP | Repairs UDP and other protocols | Depends on ICMP arriving | Who must change | Cost |
|---|---|---|---|---|---|
| Allow ICMP "too big" | yes | yes | yes, by definition | Every filter on every return path | Policy work across teams and organisations |
| MSS clamping at the tunnel edge | yes, new connections | no | no | One box: the tunnel edge | Rewriting every SYN; slightly smaller segments |
| PLPMTUD / `tcp_mtu_probing` | yes | per protocol (QUIC: yes) | no | Every sending host | A few lost probes, slower ramp to full size |
| Raise underlay MTU | yes | yes | no | Every link you own | Only possible inside your own network |
| Fragmentation (DF clear) | yes, badly | yes, badly | no | Senders | Loss multiplication, ID wrap, CPU-path forwarding |

### The fabric's MTU budget

Inside a fabric the check is arithmetic. VXLAN over IPv4 adds 50 bytes inside the outer packet: outer IP 20, UDP 8, VXLAN 8, and the tenant's 14-byte Ethernet header, carried as payload. (Counting the outer Ethernet header instead of the inner gives the same 50.) An IPv6 outer header makes it 70; an 802.1Q tag kept on the inner frame adds 4. Host MTU plus overhead must fit the smallest link on the path:

```python
# Bytes a tunnel adds inside the outer IP MTU (the inner packet's own headers excluded).
OVERHEAD = {
    "vxlan, IPv4 outer": 20 + 8 + 8 + 14,        # outer IP, UDP, VXLAN, inner Ethernet = 50
    "vxlan, IPv6 outer": 40 + 8 + 8 + 14,        # 70
    "wireguard, IPv4 outer": 20 + 8 + 16 + 16,   # outer IP, UDP, WireGuard header, auth tag
}


def budget(host_mtu, tunnel, link_mtus):
    """Does a full-size host packet fit every link once the tunnel wraps it?"""
    need = host_mtu + OVERHEAD[tunnel]
    tightest = min(link_mtus)
    verdict = "fits" if need <= tightest else f"too big by {need - tightest}"
    return f"{host_mtu:>5} + {tunnel:<21} = {need:>5} on a {tightest:>5} path: {verdict}"


print(budget(1500, "vxlan, IPv4 outer", [9216, 9216, 9216]))
print(budget(9000, "vxlan, IPv6 outer", [9216, 9216, 9216]))
print(budget(9000, "vxlan, IPv4 outer", [9216, 9000, 9216]))   # one circuit sold as 9,000
print(budget(1500, "vxlan, IPv4 outer", [9216, 1500]))          # gw1.ams to the cloud
print(budget(1500, "wireguard, IPv4 outer", [1500]))


def path_says(size, mtus=(1500, 9216, 1450), icmp_reaches_sender=False):
    """One DF probe of `size` bytes: delivered, an ICMP with the MTU, or silence."""
    for mtu in mtus:
        if size > mtu:
            return ("icmp", mtu) if icmp_reaches_sender else ("silence", None)
    return ("ack", None)


def classic_pmtud(size=1500, tries=6, **path):
    for attempt in range(tries):
        kind, mtu = path_says(size, **path)
        if kind == "ack":
            return f"delivered at {size} bytes on try {attempt + 1}"
        if kind == "icmp":
            size = mtu                      # trust the router: shrink and resend at once
    return f"black hole: {tries} tries at {size} bytes, never acknowledged"


def probing_pmtud(lo=1024, hi=1500, **path):
    """PLPMTUD-style binary search: an unanswered probe means 'too big'."""
    probes = 0
    while lo < hi:
        mid = (lo + hi + 1) // 2
        probes += 1
        if path_says(mid, **path)[0] == "ack":
            lo = mid
        else:
            hi = mid - 1
    return f"path MTU {lo} found in {probes} probes, no ICMP needed"


print("classic, ICMP delivered:", classic_pmtud(icmp_reaches_sender=True))
print("classic, ICMP filtered: ", classic_pmtud())
print("probing, ICMP filtered: ", probing_pmtud())
```

```text
 1500 + vxlan, IPv4 outer     =  1550 on a  9216 path: fits
 9000 + vxlan, IPv6 outer     =  9070 on a  9216 path: fits
 9000 + vxlan, IPv4 outer     =  9050 on a  9000 path: too big by 50
 1500 + vxlan, IPv4 outer     =  1550 on a  1500 path: too big by 50
 1500 + wireguard, IPv4 outer =  1560 on a  1500 path: too big by 60
classic, ICMP delivered: delivered at 1450 bytes on try 2
classic, ICMP filtered:  black hole: 6 tries at 1500 bytes, never acknowledged
probing, ICMP filtered:  path MTU 1450 found in 9 probes, no ICMP needed
```

The third line is the design-review catch: an inter-site circuit sold as "9,000-byte jumbo" under a tenant's 9,000-byte VXLAN traffic drops every full-size packet on that circuit only ([connecting sites and backbones](/learn/fabric-networking/fabric-architecture/connecting-sites-and-backbones)). The last is why WireGuard defaults to MTU 1,420: 1,500 minus its worst case, 80 bytes over IPv6. `classic_pmtud` is RFC 1191 in a loop; `probing_pmtud` is what `tcp_mtu_probing` and QUIC do, paying nine probes to need nothing from the path.

## UDP as the carrier for tunnels

VXLAN in the overlay, RoCEv2 in AI back-ends and QUIC on the internet are all built on UDP. UDP adds 8 bytes and no state, every router, firewall, NAT and ASIC already handles it at line rate, and its **source port is the sender's to choose**, the natural place for ECMP entropy. A new IP protocol number (as GRE and ESP have) gets filtered by default, hashed on three fields, and dropped by NATs that understand only TCP and UDP.

### VXLAN: UDP 4789

A VTEP (VXLAN tunnel endpoint, the leaf's tunnel function, addressed by its loopback) wraps the tenant's whole Ethernet frame in an 8-byte VXLAN header (carrying the 24-bit VNI, VXLAN network identifier, that names the tenant segment), UDP and IP towards the remote leaf's loopback, always to port 4789. The source port is a hash of the inner headers, in 49152–65535 as RFC 7348 recommends, so each inner flow gets its own outer 5-tuple and spine while staying in order. The UDP checksum is normally zero over IPv4. Byte by byte in [VXLAN encapsulation](/learn/fabric-networking/overlays-vxlan-evpn/vxlan-encapsulation).

- **Solves:** a tenant's layer-2 segment stretched over a routed fabric that only forwards on the outer IP.
- **Breaks:** a fixed source port collapses every flow between two leaves onto one spine (the ECMP viz above); an underlay link below host MTU plus 50 drops only full-size tenant packets.
- **Signal:** uplink utilisation imbalance on leaves with heavy tunnel traffic; DF pings at the tenant's MTU between VTEP loopbacks.

### RoCEv2: UDP 4791

RDMA (remote direct memory access) lets a NIC write into another machine's memory without either kernel touching the data ([RDMA from zero](/learn/fabric-networking/ai-fabrics/rdma-from-zero)); RoCEv2, RDMA over Converged Ethernet version 2, carries InfiniBand's transport over UDP/IP so it can be routed ([InfiniBand and RoCE](/learn/fabric-networking/ai-fabrics/infiniband-and-roce)). As the network sees it:

| Header | Size | Value | What reads it |
|---|---|---|---|
| Ethernet | 14 bytes | MACs, EtherType IPv4 | Each link |
| IPv4 | 20 bytes | GPU NIC to GPU NIC; DSCP (the 6-bit traffic-class field) marks the lossless class; ECN bits | Every router; PFC (per-class pause) and ECN |
| UDP | 8 bytes | destination 4791; source port derived from the queue pair | The ECMP hash |
| InfiniBand base transport header (BTH) | 12 bytes | opcode, destination queue pair, packet sequence number | Only the receiving NIC |
| Payload | up to the RDMA MTU, usually 4,096 bytes | GPU memory | Only the receiving NIC |
| ICRC | 4 bytes | invariant CRC over the transport | Only the receiving NIC |

**MTU:** the RDMA MTU (256 to 4,096 bytes) is fixed per connection at setup, the NIC never fragments and nothing runs PMTUD, so a 4,096-byte payload needs at least 4,140 bytes of IP MTU (20 + 8 + 12 + 4,096 + 4, more with extension headers) on every link; AI fabrics run about 9,000 or more everywhere, because a smaller link drops every full-size packet and nothing on the RDMA path reacts to an ICMP. **Entropy:** a queue pair (QP, one RDMA connection) is one 5-tuple, and a GPU's traffic rides a handful of QPs carrying gigabytes each, so the hash has few flows to spread; libraries open several QPs per connection and fabrics add adaptive routing ([AI fabric topologies](/learn/fabric-networking/ai-fabrics/ai-fabric-topologies)). **Loss:** RoCE NICs classically resend from the lost packet onward (go-back-N; recent NICs add selective repeat), so one drop costs a burst of retransmission and a stall, hence [PFC, ECN and DCQCN](/learn/fabric-networking/ai-fabrics/lossless-ethernet-pfc-ecn-dcqcn).

### QUIC: UDP 443

QUIC ([HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3), [UDP vs TCP](/learn/networking/fundamentals/udp-vs-tcp)) rebuilds TCP's guarantees plus TLS in user space over UDP and encrypts nearly everything, packet numbers and acknowledgements included:

- **No visible sequence numbers, windows or flags.** A tap cannot count retransmissions or time the handshake (the optional "spin bit" that exposes RTT is often disabled), so monitoring built on TCP headers goes blind.
- **No MSS, so no clamping.** QUIC requires paths to carry 1,200-byte datagrams (clients pad their first packets to prove it), forbids fragmentation, and probes larger sizes itself.
- **The 5-tuple can change mid-connection.** A phone moving from Wi-Fi to cellular, or a NAT rebinding, gives the connection a new tuple and QUIC continues by connection ID; an L4 load balancer (one that routes on addresses and ports only) sends it to a different backend unless it routes on the connection ID ([load balancing](/learn/networking/application-protocols/load-balancing)).

| | VXLAN | RoCEv2 | QUIC |
|---|---|---|---|
| Destination port | 4789 | 4791 | 443 |
| Source port carries | Hash of the inner frame (entropy) | A value per queue pair (little entropy) | The client's socket, may change on migration |
| What the network can read past UDP | The VNI and the whole tenant frame | Opcode, QP, sequence number | Almost nothing: encrypted |
| Loss handling | The inner protocol's (usually TCP) | NIC go-back-N: wants a lossless fabric | QUIC's own, per stream |
| MTU handling | Underlay must fit host MTU + 50 | Fixed RDMA MTU, no PMTUD | 1,200 minimum, probes upward |
| ECMP behaviour | Spreads well | Few, huge flows collide | Normal, until a tuple changes |

## Failure modes in production

**A PMTUD black hole at a tunnel edge**, traced above. *Symptom:* connects, then hangs on large transfers through one gateway. *Diagnosis:* full-size DF ping fails, a smaller one succeeds. *Fix:* clamp MSS, allow ICMP type 3 code 4, `tcp_mtu_probing=1` behind tunnels.

**One fabric link with a smaller MTU.** *Symptom:* with four spines, about a quarter of large transfers between two leaves hang; small requests always work. *Diagnosis:* giants counted on one leaf–spine link; full-size DF pings with varied source ports fail only on tuples hashed through it ([active measurement](/learn/fabric-networking/operating-fabrics/active-measurement)). *Fix:* correct it, and lint both ends of every link against the source of truth ([network automation](/learn/fabric-networking/operating-fabrics/network-automation-and-source-of-truth)).

**Connection tracking full.** *Symptom:* on a NAT gateway or busy Linux router, some new connections time out at random while established ones work. *Diagnosis:* the "table full" kernel log line; entries at `nf_conntrack_max`, mostly short UDP flows. *Fix:* raise the maximum, shorten UDP timeouts, exempt high-rate stateless traffic from tracking.

**Fragmented UDP dropped.** *Symptom:* large DNS answers or a UDP tunnel across the internet fail intermittently. *Diagnosis:* captures show first fragments arriving and the rest missing. *Fix:* keep datagrams under the path MTU (DNS resolvers settled on a 1,232-byte EDNS buffer, the largest answer they ask for over UDP, for this reason).

## Under the hood: what Linux does with "too big"

When the ICMP arrives, the kernel finds the quoted TCP header inside and checks that its sequence number is in the connection's current window, so a forged ICMP cannot shrink an unrelated connection. It stores the MTU as an exception on the route to that destination (`ip route get 10.200.1.50` shows `mtu 1450`), expiring after 600 s (`net.ipv4.route.mtu_expires`) so a larger MTU can be rediscovered; reports below 552 bytes are raised to 552 (`net.ipv4.route.min_pmtu`). TCP recomputes its MSS and retransmits immediately.

One capture trap: segmentation and receive offloads mean `tcpdump` on a host shows "packets" far above the MTU that never existed on the wire ([how Linux sends and receives packets](/learn/fabric-networking/from-zero/how-linux-sends-and-receives-packets)); that is offload, not a giant.

## What the platform should show

- **MTU as intent, per link.** Both ends' IP MTU, normalised across vendor conventions, checked against each other and the source of truth, plus a budget check per tunnel.
- **Full-size probes.** DF probes at the tenant's MTU between every pair of VTEP loopbacks and across every inter-site circuit, source ports varied to cover every ECMP path. Small probes stay green through every case in this lesson.
- **ICMP accounting.** "Fragmentation needed" sent per interface, punt and policer drops, ICMP drops at firewalls, side by side: rising "sent" with rising "dropped" downstream is a black hole in progress.
- **Giant and oversize counters** as link alarms: a silent layer-2 drop has no other network-side symptom.
- **Host transport health.** Retransmits, SYN retransmits and timeouts per destination leaf or site, where silent drops become visible.
- **Stateful table occupancy.** Conntrack and NAT tables against their maximums on every gateway.
- **Flow entropy.** Uplink imbalance and the share of bytes in the top few 5-tuples, so a low-entropy tunnel or RoCE collision shows before it saturates a link ([telemetry and observability](/learn/fabric-networking/operating-fabrics/telemetry-and-observability)).

## Interviewer follow-ups

**"SSH logs in fine, then hangs as soon as a command prints a lot. What is happening?"** Model answer: size-dependent loss. Login packets are small; the first full-size segments are dropped, most likely a path-MTU black hole (a tunnel or smaller link on the path, its ICMP filtered on the way back). I'd confirm with DF pings at 1,472 and below and captures on both sides; the fix is MSS clamping at the tunnel edge and allowing that ICMP. Common wrong answer: "the server is overloaded".

**"Why are VXLAN, RoCEv2 and QUIC all over UDP?"** Model answer: UDP is the thinnest wrapper every router, NAT, firewall and ASIC already forwards and hashes at line rate, and its source port can carry ECMP entropy; a new IP protocol number would be filtered and hashed on three fields. Each brings its own reliability (VXLAN leaves it to the inner TCP), since a reliable tunnel under TCP would stack two retransmission timers that fight. Common wrong answer: "UDP is faster than TCP".

**"The fabric is 9,216 everywhere. Where can MTU still bite?"** Model answer: at edges you don't own (internet, carrier circuits sold smaller, cloud interconnects), tunnels inside tunnels, and one link set wrong because vendors count headers differently. I'd measure with full-size DF probes over every path rather than trust configuration; I'd defer to the network team on each platform's MTU conventions, but build the normalised per-link check. Common wrong answer: "jumbo frames everywhere means MTU can't be a problem".

## What mid-level engineers get wrong

- **Blocking all ICMP for security.** It breaks path-MTU discovery and creates exactly the black hole above; at least type 3 code 4 and ICMPv6 type 2 must pass.
- **Testing reachability with a default ping.** An 84-byte packet proves nothing about a 1,500 or 9,000-byte path; probe at full size with DF set.
- **Expecting more bandwidth to speed up a long-haul flow.** One TCP flow is capped at window ÷ RTT; across 105 ms, default buffers cap it near half a gigabit.
- **Assuming a flow's path is fixed.** Change one port and the hash moves it; QUIC can change its own tuple mid-connection.

## Senior signals

- You name the 5-tuple as the key for ECMP, firewalls, NAT and load balancers, and know what it cannot see: non-first fragments, port-less protocols, ICMP errors.
- You diagnose "connects, then hangs on large transfers" as size-dependent loss, knowing the three fates of an oversized packet and that a layer-2 drop never sends ICMP.
- You do MTU budgets in your head: host MTU plus 50 for VXLAN over IPv4, 70 over IPv6, against the smallest link on the path.
- You choose fixes by scope: MSS clamping repairs TCP at one box, allowing ICMP repairs everything but depends on others, PLPMTUD needs no ICMP at all.
- You explain UDP as the tunnel carrier by its source port: entropy for VXLAN, too little for RoCE, a moving target for QUIC.

## Check yourself

```quiz
- q: >-
    A backup through a VPN gateway connects and completes its TLS handshake, then transfers nothing until it times out. Ping to the server works. What is the most likely cause?
  options: ["The gateway's NAT table expired the connection after the handshake", "The server's TCP receive window is too small for a backup", "Full-size DF packets are dropped and their ICMP is filtered", "The TLS handshake picked a cipher the gateway cannot forward"]
  answer: 2
  explanation: >-
    Small packets (handshake, TLS, default pings) pass and full-size ones never arrive: the signature of a path-MTU black hole. The tunnel's MTU is below the hosts', DF forbids fragmenting, and the ICMP that would shrink the segments is filtered. A small window slows a transfer but does not stop it, a cipher does not affect forwarding, and a NAT expiry would not happen seconds after the handshake.
- q: >-
    One TCP transfer from Amsterdam to Singapore (round trip 105 ms) levels off near 480 Mb/s on an idle 10 Gb/s circuit, with no loss. What limits it?
  options: ["The 1,500-byte MTU caps how many bytes each packet can carry per round trip", "ECMP splits the flow over two circuits, so each carries only part of it", "The receive buffer caps the window, and a flow moves one window per round trip", "The long-haul circuit's propagation delay lowers its usable line rate"]
  answer: 2
  explanation: >-
    One flow can have at most one window of unacknowledged bytes in flight, so it moves at most window ÷ RTT. Linux's default 6 MB maximum receive buffer gives about 6.3 MB × 8 ÷ 0.105 s ≈ 480 Mb/s, while filling 10 Gb/s needs about 131 MB in flight. The MTU sets packet size, not how many packets are in flight; ECMP never splits one flow; and delay does not change a link's line rate, only how much data must be in flight to fill it.
- q: >-
    A 3,000-byte IPv4 packet with DF clear is fragmented for a 1,500-byte link. Why can a port-based firewall rule not be applied to the second fragment?
  options: ["Its IP header has a different identification value", "It is encrypted until the destination reassembles it", "Its protocol field is changed to show it is a fragment", "It carries no TCP or UDP header, so no ports"]
  answer: 3
  explanation: >-
    Only the first fragment carries the transport header; later fragments share the addresses, protocol and identification but start with arbitrary payload bytes, so there are no ports to read. That is why many firewalls drop non-first fragments and why ASICs hash fragments on addresses only. The identification is the same in every fragment, the protocol field is unchanged, and fragmentation encrypts nothing.
- q: >-
    A tenant's hosts use a 9,000-byte MTU and their traffic crosses the fabric in VXLAN over IPv4. Which underlay link MTU is the smallest that carries full-size packets?
  options: ["9,050 bytes, adding the tunnel's 50 bytes", "9,000 bytes, the same as the hosts", "9,018 bytes, adding the Ethernet header and FCS", "9,216 bytes, the jumbo maximum"]
  answer: 0
  explanation: >-
    VXLAN over IPv4 adds 50 bytes inside the outer IP packet (outer IP 20, UDP 8, VXLAN 8, inner Ethernet 14), so a 9,000-byte inner packet needs a 9,050-byte underlay IP MTU. 9,000 drops every full-size packet. The outer Ethernet header and FCS are outside the IP MTU. 9,216 works and is a common setting, but it is not the minimum.
- q: >-
    An operator enables MSS clamping at a tunnel edge. Which traffic does it fail to protect from the path-MTU black hole?
  options: ["TCP connections opened after clamping was enabled", "Large UDP datagrams such as big DNS answers", "TLS sessions carried inside clamped TCP connections", "TCP connections whose SYN crossed the clamping box"]
  answer: 1
  explanation: >-
    Clamping rewrites the MSS option in TCP SYNs, and only TCP has an MSS. UDP datagrams still depend on the ICMP message (or on probing the path themselves, as QUIC does). New TCP connections through the box are protected, and so is anything inside them, TLS included. The exposed TCP connections are only those already open before clamping began, since their SYNs were never rewritten.
- q: >-
    Why does one RoCEv2 GPU-to-GPU transfer tend to collide with others on a single uplink, where thousands of VXLAN-carried web flows spread evenly?
  options: ["A few queue pairs make a few huge flows with few distinct tuples", "RoCEv2 packets are too large for the ECMP hash to read", "Switches exclude UDP port 4791 from ECMP hashing by default", "RoCEv2 uses TCP underneath, which pins one path per host"]
  answer: 0
  explanation: >-
    Each queue pair is one 5-tuple, and GPU traffic travels over a handful of queue pairs carrying very large volumes, so the hash has few flows to spread and two can land on one link. VXLAN writes each inner flow's hash into its outer source port, giving thousands of distinct tuples. Packet size does not affect the hash, RoCEv2 runs over UDP rather than TCP, and port 4791 is hashed like any other UDP port.
```

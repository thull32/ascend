---
slug: layers-and-encapsulation
title: "Layers and encapsulation: what a packet actually looks like"
description: One HTTPS request taken apart byte by byte (Ethernet, IPv4, TCP, TLS record), the MTU and MSS arithmetic behind 1500, 1460, 1448 and 1388, fragmentation traced, what the Linux kernel and the NIC actually do on send and receive, and where the clean layer model leaks in production.
minutes: 22
difficulty: intro
tags: [networking, osi, tcp-ip, encapsulation, mtu, mss, headers, fragmentation, pmtud]
problems: []
---
You call `write(fd, buf, 4000)` on a TCP socket and 4,000 bytes leave your process. What arrives at the other side is not one thing but three segments of 1,448, 1,448 and 1,104 bytes, each wrapped in 66 bytes of headers you never wrote, each of which may take a different path and arrive in a different order. Every performance number you will quote in this track (how many bytes fit in a packet, why a request costs three round trips before the first useful byte, why a VPN makes some websites hang) comes from the way those headers nest.

A team moves a service behind a site-to-site VPN. Health checks pass, small API calls work, and every response larger than about 1.4 KB hangs until a 30-second timeout. Nobody changed any code. The tunnel's MTU is 1,420, a firewall on the path drops the ICMP message that would have told the server to send smaller packets, and the server keeps retransmitting 1,500-byte packets into a hole. Layering is the design decision that makes the internet possible and encapsulation is the mechanism; understanding both is the difference between "the network is flaky" and "path MTU discovery is black-holed on the tunnel, clamp the MSS to 1,380".

## Why layers exist

The internet is a chain of independently owned networks that must interoperate without coordination. Layering gives each piece of hardware or software a narrow contract: Ethernet moves frames between two devices on one link; IP moves packets between any two hosts across many links; TCP turns unreliable packets into a reliable byte stream; TLS makes that stream private; HTTP gives the bytes meaning.

Each layer talks only to the layer directly above and below. A router forwards IP packets and does not parse TCP. A switch forwards Ethernet frames and does not parse IP. Your application writes to a socket and never sees a packet. That contract lets any layer be replaced without touching the others: Wi-Fi replaced Ethernet on your laptop, IPv6 is replacing IPv4, QUIC is replacing TCP for a growing share of web traffic, and none of those required rewriting the layers around them.

There are two models people cite. The OSI model has seven layers and is a vocabulary; the TCP/IP model has four (five if you split the link layer) and is what runs.

| OSI layer | TCP/IP layer | Identifies | Unit | Examples |
|---|---|---|---|---|
| 7 Application | Application | The meaning of the bytes | message | HTTP, DNS, gRPC |
| 6 Presentation | (Application) | Encoding, encryption | – | TLS, JSON, protobuf |
| 5 Session | (Application) | Dialogue control | – | (mostly nothing) |
| 4 Transport | Transport | A process on a host (port) | segment / datagram | TCP, UDP, QUIC |
| 3 Network | Internet | A host anywhere (IP address) | packet | IPv4, IPv6, ICMP |
| 2 Data link | Link | A device on one link (MAC) | frame | Ethernet, Wi-Fi |
| 1 Physical | Link | Voltages, light, radio | bits | Cat6, fibre, 802.11 |

Layers 5 and 6 are where OSI is least honest. TLS sits between 4 and 7, doing presentation-like work (encryption) with session-like state (resumption tickets), and HTTP/2 does its own session multiplexing. When an interviewer asks "which layer is TLS?", the senior answer is: it runs on top of TCP and under HTTP, the OSI number is fuzzy, and what matters is that routers cannot see inside it and the load balancer that terminates it can.

## Encapsulation: each layer wraps the one above

Encapsulation is the rule that each layer prepends its own header to whatever the layer above handed it and treats that as an opaque payload. Going down the stack on the sender the packet grows; going up on the receiver, each layer strips its header, reads one field to decide who gets the rest, and hands it up.

```viz
{"type": "network", "scenario": "osi-encapsulation", "title": "Encapsulation on send, decapsulation on receive", "caption": "Each layer adds a header on the way down and removes exactly that header on the way up. One field per header (EtherType, IP protocol, port) says which layer above gets the payload."}
```

The demultiplexing keys are the whole routing mechanism inside a host:

| Header | Field | Values you will meet |
|---|---|---|
| Ethernet | EtherType (2 B) | `0x0800` IPv4, `0x86DD` IPv6, `0x0806` ARP, `0x8100` VLAN tag follows |
| IPv4 | Protocol (1 B) | 6 TCP, 17 UDP, 1 ICMP, 50 ESP (IPsec), 47 GRE |
| IPv6 | Next Header (1 B) | the same numbers; 58 is ICMPv6 |
| TCP / UDP | Destination port (2 B) | 443 HTTPS, 53 DNS, 5432 Postgres |
| TLS record | Content type (1 B) | `0x16` handshake, `0x17` application data, `0x15` alert |

A frame arriving on a network card ends up in the right `accept()`ed socket in the right process by reading five fields in that order.

## One HTTPS request, byte by byte

Here is the first data packet of `curl https://example.com/` over HTTP/1.1, after the TCP and TLS handshakes. curl's request is 74 bytes of text:

```text
GET / HTTP/1.1\r\n            16 B
Host: example.com\r\n         19 B
User-Agent: curl/8.5.0\r\n    24 B
Accept: */*\r\n               13 B
\r\n                           2 B   (blank line ends the headers)
```

TLS 1.3 encrypts it into one record, TCP puts the record in one segment, IP addresses it, and Ethernet frames it for the first hop. The script at the end of this section builds exactly this frame with correct lengths and checksums (the laptop is 192.168.1.23 on a home network; 104.20.23.154 is one of example.com's addresses, measured with `dig` on 2026-09-28). The first 77 bytes:

```text
0000  a0 b1 c2 d3 e4 f5 02 16 3e 5a 7b 9c 08 00 45 00
0010  00 94 2f 41 40 00 40 06 c9 b5 c0 a8 01 17 68 14
0020  17 9a a1 f2 01 bb 5d 3e 1a 07 9b 20 c4 f1 80 18
0030  00 40 1f 03 00 00 01 01 08 0a e9 b5 c6 b4 5e 9c
0040  20 03 17 03 03 00 5b 8e 1f 5c 02 a7 d4
```

| Offset | Bytes | Layer | Field | Value |
|---|---|---|---|---|
| 0x00 | `a0 b1 c2 d3 e4 f5` | Ethernet | Destination MAC | The home router, learned by ARP for 192.168.1.1 |
| 0x06 | `02 16 3e 5a 7b 9c` | Ethernet | Source MAC | The laptop's Wi-Fi or Ethernet adapter |
| 0x0c | `08 00` | Ethernet | EtherType | IPv4 follows |
| 0x0e | `45` | IPv4 | Version, IHL | Version 4, header length 5 × 4 = 20 bytes |
| 0x0f | `00` | IPv4 | DSCP, ECN | Best effort, not ECN-capable |
| 0x10 | `00 94` | IPv4 | Total length | 148 = 20 IP + 32 TCP + 96 TLS |
| 0x12 | `2f 41` | IPv4 | Identification | 12,097 (only matters for fragments) |
| 0x14 | `40 00` | IPv4 | Flags, fragment offset | DF set, offset 0 |
| 0x16 | `40` | IPv4 | TTL | 64, the Linux default (Windows uses 128) |
| 0x17 | `06` | IPv4 | Protocol | TCP |
| 0x18 | `c9 b5` | IPv4 | Header checksum | Ones'-complement sum of the 20 header bytes |
| 0x1a | `c0 a8 01 17` | IPv4 | Source address | 192.168.1.23 |
| 0x1e | `68 14 17 9a` | IPv4 | Destination address | 104.20.23.154 |
| 0x22 | `a1 f2` | TCP | Source port | 41,458 (ephemeral) |
| 0x24 | `01 bb` | TCP | Destination port | 443 |
| 0x26 | `5d 3e 1a 07` | TCP | Sequence number | 1,564,350,983: the stream offset of this payload's first byte, plus the random initial sequence number |
| 0x2a | `9b 20 c4 f1` | TCP | Acknowledgement | 2,602,616,049: the next byte expected from the server |
| 0x2e | `80` | TCP | Data offset | 8 × 4 = 32-byte header (20 + 12 of options) |
| 0x2f | `18` | TCP | Flags | PSH + ACK |
| 0x30 | `00 40` | TCP | Window | 64, scaled by 2¹⁰ (window scale 10 from the SYN) = 65,536 bytes |
| 0x32 | `1f 03` | TCP | Checksum | Over a pseudo-header (both IPs, protocol, length), the TCP header and the payload |
| 0x34 | `00 00` | TCP | Urgent pointer | Unused |
| 0x36 | `01 01 08 0a …` | TCP | Options | NOP, NOP, timestamps (kind 8, length 10, 4-byte value, 4-byte echo) |
| 0x42 | `17` | TLS | Content type | Application data |
| 0x43 | `03 03` | TLS | Legacy version | Always "TLS 1.2" on the wire, even for TLS 1.3 |
| 0x45 | `00 5b` | TLS | Record length | 91 = 74 plaintext + 1 inner content type + 16 AEAD tag |
| 0x47 | `8e 1f …` | TLS | Ciphertext | The encrypted HTTP request |

The frame is 162 bytes; with the 4-byte frame check sequence and 20 bytes of preamble and inter-frame gap it occupies 186 byte-times on the wire, to carry 74 bytes of HTTP. That is 40% efficiency before a single response byte flows, which is why small messages are expensive.

```python
import struct

def checksum16(data: bytes) -> int:
    """RFC 1071 Internet checksum: ones'-complement sum of 16-bit words."""
    if len(data) % 2:
        data += b"\x00"
    total = sum(struct.unpack(f"!{len(data) // 2}H", data))
    while total >> 16:                              # fold carries back into the low 16 bits
        total = (total & 0xFFFF) + (total >> 16)
    return ~total & 0xFFFF

def ip4(a): return bytes(int(x) for x in a.split("."))

http = b"GET / HTTP/1.1\r\nHost: example.com\r\nUser-Agent: curl/8.5.0\r\nAccept: */*\r\n\r\n"
cipher = bytes.fromhex("8e1f5c02a7d4") + bytes(len(http) + 1 + 16 - 6)   # stand-in ciphertext + tag
tls = struct.pack("!BHH", 0x17, 0x0303, len(cipher)) + cipher             # 5-byte record header

src, dst = "192.168.1.23", "104.20.23.154"
opts = b"\x01\x01\x08\x0a" + struct.pack("!II", 3921004212, 1587290115)  # NOP NOP timestamps
tcp = struct.pack("!HHIIBBHHH", 41458, 443, 0x5D3E1A07, 0x9B20C4F1,
                  (20 + len(opts)) // 4 << 4, 0x18, 64, 0, 0) + opts        # checksum 0 for now
pseudo = ip4(src) + ip4(dst) + struct.pack("!BBH", 0, 6, len(tcp) + len(tls))
tcp = tcp[:16] + struct.pack("!H", checksum16(pseudo + tcp + tls)) + tcp[18:]

total_len = 20 + len(tcp) + len(tls)
ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, total_len, 0x2F41, 0x4000, 64, 6, 0, ip4(src), ip4(dst))
ip = ip[:10] + struct.pack("!H", checksum16(ip)) + ip[12:]
assert checksum16(ip) == 0                          # a valid header sums to 0xFFFF, so this is 0

eth = bytes.fromhex("a0b1c2d3e4f5") + bytes.fromhex("02163e5a7b9c") + b"\x08\x00"
frame = eth + ip + tcp + tls
print(len(frame), frame[:77].hex(" "))              # 162, then the dump above
```

Three lines deserve a note. The pseudo-header is why a NAT that rewrites an IP address must also patch the TCP checksum: TCP's checksum covers the addresses although they live in the IP header. The `assert` shows how a router verifies a header: summing a correct header including its checksum yields all ones, whose complement is zero. And the TLS record header is five plaintext bytes that every middlebox can read, which is how a firewall can tell handshake records from data records without decrypting anything.

## Decapsulation on the receiver, step by step

When that frame reaches the server (after the router rewrites the Ethernet header, and possibly a NAT rewrites the source address and port), the receiving stack peels it in this order:

1. The NIC checks the frame check sequence (CRC-32) and silently drops the frame if it is wrong. Nothing tells the sender; TCP will notice the missing bytes later.
2. EtherType `0x0800`: hand the rest to IPv4.
3. IPv4 verifies the header checksum, checks the destination is a local address, and reads Protocol 6: TCP.
4. TCP verifies its checksum, then looks up the 4-tuple (104.20.23.154:443 on its side, the client's address and port on the other) in the established-connection hash table. No match and not a SYN to a listening port: reply with RST.
5. TCP compares the sequence number with the next byte it expects. In order: append to the socket's receive queue and schedule an ACK. Ahead of expectation: hold it in the out-of-order queue and send a duplicate ACK with a SACK block (the [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) traces this).
6. The TLS library reads the 5-byte record header, waits until all 91 bytes of the record are in, decrypts and authenticates them with the session key, and strips the trailing content-type byte.
7. The HTTP parser reads up to the blank line and dispatches `GET /`.

Step 6 hides a latency trap: TLS can only decrypt a whole record. A 16 KB record (the maximum plaintext size) plus 22 bytes of overhead spans 16,406 / 1,448 ≈ 12 TCP segments; if the first segment is lost, the receiver holds the other eleven and cannot give the application any of it until the retransmission arrives, one round trip later at best. Servers that care about time-to-first-byte start connections with records sized to fit one segment and grow them after the connection has warmed up. Go's `crypto/tls` does this by default (since Go 1.7), and CDNs such as Cloudflare patched it into their proxies.

## MTU and MSS arithmetic

The **MTU** (maximum transmission unit) is the largest IP packet a link carries in one frame: 1,500 bytes on Ethernet. The **MSS** (maximum segment size) is the largest TCP payload each side is willing to receive, announced in its SYN, and derived from its MTU.

| Path | Arithmetic | MSS |
|---|---|---|
| IPv4 over Ethernet | 1,500 − 20 IP − 20 TCP | 1,460 (announced in the SYN) |
| … with TCP timestamps (Linux default) | 1,460 − 12 | 1,448 payload per segment |
| IPv6 over Ethernet | 1,500 − 40 − 20 | 1,440 (1,428 with timestamps) |
| PPPoE DSL | 1,492 − 40 | 1,452 |
| WireGuard (MTU 1,420) | 1,420 − 40 | 1,380 |
| VXLAN overlay (50 B outer headers) | 1,450 − 40 | 1,410 |
| IPv6 minimum MTU | 1,280 − 40 − 20 | 1,220 |

Measured on this machine, a connection to example.com shows the negotiation from both ends. `ss -ti` reports `advmss:1448` (the laptop announced 1,460 and subtracts timestamps) and `mss:1388`: Cloudflare's SYN-ACK announced 1,400, less than Ethernet allows, and 1,400 − 12 = 1,388 is the payload the laptop may put in each segment towards it. Announcing a smaller MSS than the link permits is a common choice for providers that encapsulate traffic inside their own network and want headroom for the extra headers; it costs about 4% more packets per byte and removes a class of MTU failures.

Per-packet overhead is what makes small messages expensive:

| Encapsulation | Bytes on the wire for the payload | Efficiency |
|---|---|---|
| Ethernet + IPv4 + TCP (timestamps), 100 B payload | 100 + 66 + 4 FCS + 20 framing = 190 | 53% |
| Ethernet + IPv4 + UDP, 100 B payload | 100 + 42 + 24 = 166 | 60% |
| Ethernet + IPv4 + TCP + TLS record, 74 B HTTP request | 74 + 17 TLS + 5 + 66 + 24 = 186 | 40% |
| Ethernet + IPv4 + TCP, full 1,448 B segment | 1,448 + 66 + 24 = 1,538 | 94% |

At 10 Gbit/s, full segments mean about 810,000 packets per second; 100-byte messages sent one per packet mean about 6.6 million, and packets per second, not bytes, is usually what saturates a CPU core, a NAT gateway or a virtual NIC first.

## Fragmentation, traced

What happens when a 1,500-byte IPv4 packet reaches a link whose MTU is 1,400? The DF (Don't Fragment) bit decides.

**DF clear: the router fragments.** Fragment payloads must be multiples of 8 bytes, because the offset field counts 8-byte units. The largest multiple of 8 that fits in 1,400 − 20 is 1,376.

| Fragment | IP total length | Payload bytes | Offset field | MF flag | Carries the TCP header? |
|---|---|---|---|---|---|
| 1 | 1,396 | 0–1,375 | 0 | 1 | Yes |
| 2 | 124 | 1,376–1,479 | 172 (= 1,376 / 8) | 0 | No |

Both carry the original Identification value, and only the destination reassembles them. This works and it is awful: losing either fragment loses the whole packet and TCP must resend all 1,500 bytes; a firewall or load balancer that routes on ports cannot classify fragment 2, which has no TCP header; and the reassembly buffer is a memory-exhaustion target.

**DF set: the router drops and reports.** It discards the packet and sends ICMP type 3 code 4 ("fragmentation needed") carrying the next-hop MTU, 1,400. The sender's kernel caches that path MTU for the destination, lowers the connection's MSS and retransmits smaller segments. This is **path MTU discovery** (PMTUD), and Linux sets DF on every TCP segment, so it is the normal case. IPv6 removed router fragmentation entirely: only the sender fragments, and the ICMPv6 "Packet Too Big" message is mandatory.

Linux also has a fallback that does not trust ICMP: packetization-layer PMTUD (RFC 4821, generalised in RFC 8899), enabled with `net.ipv4.tcp_mtu_probing`. The measured default here is 0 (off); 1 turns probing on only after the kernel detects a black hole, which is what you want on hosts that talk through tunnels.

## Under the hood: what the kernel and the NIC actually do

The layer diagram suggests one header added per function call. Linux on a modern NIC does something cheaper:

1. `write()` copies your bytes into the socket's send buffer, a chain of `sk_buff` structures with headroom reserved in front so headers can be prepended without copying the payload again.
2. TCP (`tcp_sendmsg`, then `tcp_write_xmit`) builds segments as large as the congestion and receive windows allow, up to 64 KB, not 1,448 bytes. This is **GSO** (generic segmentation offload).
3. IP adds a header, looks up the route (the [IP addressing lesson](/learn/networking/fundamentals/ip-addressing-and-routing) traces longest-prefix match), and runs netfilter hooks; `POSTROUTING` is where NAT rewrites the source.
4. The neighbour subsystem resolves the next hop's MAC with ARP (cached for tens of seconds) and the queueing discipline, `fq_codel` on this machine, orders packets.
5. The driver hands the 64 KB super-packet to the NIC, which cuts it into MSS-sized segments, copies the headers onto each, fixes sequence numbers and computes every checksum (**TSO** plus checksum offload).
6. On receive, the NIC or driver merges consecutive segments of one flow back into a large buffer (**GRO**) before the stack sees them, so TCP processes one 64 KB unit instead of 45 packets.

```viz
{"type": "network", "scenario": "arp", "title": "Resolving the next hop's MAC", "caption": "IP routing picks the next hop's IP address; ARP turns it into the MAC that goes in the Ethernet header. The answer is cached, so only the first packet to a new neighbour waits for it."}
```

Two consequences surprise people. A capture on the sending host shows TCP "segments" of 30 or 60 KB and checksums flagged as incorrect, because the capture point is above the NIC that will segment and checksum them; this is normal, not corruption. And turning offloads off to "fix" those checksums (`ethtool -K eth0 tso off gso off gro off`) multiplies per-packet CPU work by tens. Linux 5.19 (IPv6) and 6.3 (IPv4) added **BIG TCP**, which lets GSO and GRO units exceed 64 KB inside the host for high-bandwidth NICs.

## Where the layers leak

The model says each layer ignores the others. Production disagrees in at least four places:

- **NAT rewrites layers 3 and 4 inside a router.** A home router or a cloud NAT gateway rewrites the source IP and the TCP/UDP source port and must patch the TCP checksum because of the pseudo-header. Protocols that embed addresses in their payload (FTP, SIP) break unless the NAT parses layer 7. [NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking) traces the translation table.
- **Middleboxes read what they should not.** Load balancers, firewalls and intrusion detection systems act on TCP options, TLS SNI and HTTP headers, and drop what they do not recognise. That ossification is why TCP extensions take a decade to deploy and why QUIC encrypts almost its entire header ([HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3)).
- **An L7 load balancer means two connections.** It terminates TLS, reads the HTTP, and opens a separate TCP and TLS session to the backend. One logical request pays two handshakes (the second usually pooled) and one extra hop.
- **Layer 2 is not one hop in a cloud.** "The same subnet" in a VPC is an overlay: your frame is encapsulated, carried across several physical routers and decapsulated on the destination host. AWS allows 9,001-byte jumbo frames inside a VPC but 1,500 through an internet gateway or VPN, so a host that negotiated a jumbo MSS with a local peer and a 1,460 MSS with the internet is correct, and a host that forces MTU 9,001 on traffic leaving through a tunnel is the black hole from the opening.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| PMTUD black hole | TCP and TLS handshakes succeed, small responses work, responses above ~1.4 KB hang until timeout; `ping` works | `ping -M do -s 1472 host` fails with "message too long, mtu=1420" or silently; a capture shows the same full-size segment retransmitted with no ICMP in return | Clamp MSS on the tunnel gateway (`iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`), set the tunnel interface MTU, allow ICMP type 3 code 4 (ICMPv6 type 2), enable `tcp_mtu_probing=1` |
| Jumbo-frame mismatch | Traffic between two hosts in the same VPC is fast; the same hosts talking across a peering, VPN or to the internet stall on large transfers | `ip link` shows MTU 9001 on the interface; `tracepath` reports a 1,500 hop; the stall appears only above 1,500 bytes | Keep the interface at 9,001 but make sure ICMP reaches the host, or set a per-route MTU (`ip route add … mtu 1500`) for off-VPC destinations |
| Fragmented UDP lost | DNS or other UDP responses above ~1,400 bytes time out intermittently, retries over TCP succeed | Captures show only the first fragment, or a firewall that drops non-initial fragments | Keep UDP payloads below the path MTU: the 2020 DNS Flag Day settled on an EDNS buffer of 1,232 bytes (1,280 − 40 − 8); QUIC never sends datagrams smaller than 1,200 bytes and never relies on fragmentation |
| "Corrupt" checksums in a capture | An engineer sees `cksum incorrect` on every outgoing packet and disables offloads; CPU per gigabit jumps | Captured on the sender, above the NIC; `ethtool -k eth0` shows `tx-checksumming: on` | Leave offloads on; verify checksums with a capture on the receiver or a tap |
| Slow first byte on lossy links | Time-to-first-byte is fine on wired clients and a round trip worse on mobile | Server sends 16 KB TLS records from the first byte; one lost segment blocks decryption of the whole record | Dynamic record sizing (records that fit one segment for the first few tens of KB), which Go and several CDNs do by default |

## Trade-offs: what MTU to run

| | 1,280 (IPv6 minimum) | 1,500 (Ethernet) | 9,000 (jumbo) |
|---|---|---|---|
| Header and framing overhead per full TCP packet | ~8% (IPv6) | ~6% | ~1% |
| Packets per second for 10 Gbit/s | ~950,000 | ~810,000 | ~140,000 |
| Works across the internet | Always | Almost always | Never; only inside one network |
| Cost of one loss | Smallest retransmit | 1.5 KB | 9 KB, and more buffer per queue |
| Where you choose it | QUIC's design floor, DNS over UDP | Default everywhere | Storage and east-west traffic inside a data centre or VPC |

## Interviewer follow-ups

**"Why does TCP use 1,460 and not 1,500?"** Model answer: 1,500 is the Ethernet MTU for the IP packet; 20 bytes of IPv4 and 20 of TCP leave 1,460, and Linux's timestamps option leaves 1,448 per segment. The peer's MSS can be lower (Cloudflare announces 1,400) and the smaller of the two applies in each direction. Common wrong answer: "the Ethernet header takes 40 bytes", which confuses the frame header (not counted in the MTU) with the IP and TCP headers.

**"Small requests work and large responses hang over a VPN. Walk me through it."** Model answer: that pattern is size-dependent loss; test with DF-set pings to find the path MTU, look for ICMP fragmentation-needed in a capture, and fix it with MSS clamping on the gateway or by allowing the ICMP. Common wrong answer: "increase timeouts" or "the server is slow on large responses".

**"Why does QUIC insist on 1,200-byte packets and refuse fragmentation?"** Model answer: IPv6 guarantees 1,280 bytes end to end, so 1,200 of UDP payload fits every legal path after IPv6 and UDP headers; fragmented UDP is dropped by many firewalls, and QUIC probes for larger sizes itself (DPLPMTUD) instead of trusting ICMP. Common wrong answer: "UDP cannot carry more than 1,200 bytes".

**"Where would you terminate TLS, and what does that choice cost?"** Model answer: at an L7 proxy if you must route on paths or headers, paying a second handshake to the backend (pooled) and trusting the proxy with plaintext; at the service if only L4 balancing is needed, keeping end-to-end encryption but losing HTTP-aware routing and retries. Common wrong answer: "TLS is layer 6, so the load balancer cannot see it either way".

## What mid-level engineers get wrong

- Quoting 1,500 as the payload size. The payload per segment is 1,448 on a stock Linux-to-Linux IPv4 path and less through tunnels, and capacity planning for small messages is off by the header ratio.
- Blocking all ICMP "for security". It breaks PMTUD and produces the black-hole outage; allow at least type 3 code 4 and ICMPv6 type 2.
- Reading a sender-side capture as the wire. GSO and TSO mean the kernel hands 64 KB units to the NIC; what the capture shows is not what the link carried.
- Measuring throughput in bytes only. A NAT gateway or virtual NIC often hits its packets-per-second limit first, and one-message-per-write chat protocols reach it at a small fraction of the link's bandwidth.
- Assuming a VPC subnet is one physical Ethernet. It is an overlay with its own MTU rules, and the 9,001 inside it does not extend outside it.

## Exercises

```exercise
id: parse-ipv4-tcp-headers
title: Parse an IPv4 + TCP header
prompt: |
  `hex_str` is a captured IPv4 packet carrying TCP, given as hex (it may
  contain spaces). The capture was truncated after the headers, so do not
  count the hex to find the payload: compute the payload length from the
  IPv4 Total Length field, the IPv4 header length (IHL x 4, which can be
  more than 20 when IP options are present) and the TCP header length
  (data offset x 4). TCP checksums in these captures are zero; ignore them.

  Return an object with these keys:
  `src`, `dst` (dotted-quad strings), `ttl`, `df` (boolean: the Don't
  Fragment bit), `sport`, `dport`, `seq`, `ack`, `window` (the raw 16-bit
  field, unscaled), `payload_len`, and `flags`: the set TCP flags as
  tcpdump prints them, letters in the order F, S, R, P, U, E, W followed
  by `.` for ACK (so SYN+ACK is `"S."`, PSH+ACK is `"P."`, a bare RST is `"R"`).
languages: [python, javascript]
entry: parse_tcp_packet
starter:
  python: |
    def parse_tcp_packet(hex_str):
        b = bytes.fromhex("".join(hex_str.split()))
        # IPv4 header starts at b[0]; the TCP header starts at the IHL offset
        return {}
  javascript: |
    function parse_tcp_packet(hex_str) {
      const h = hex_str.replace(/\s+/g, "");
      const b = [];
      for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
      // IPv4 header starts at b[0]; the TCP header starts at the IHL offset
      return {};
    }
tests:
  - args: ["450000942f4140004006c9b5c0a801176814179aa1f201bb5d3e1a079b20c4f180180040000000000101080ae9b5c6b45e9c2003"]
    expected: {"src": "192.168.1.23", "dst": "104.20.23.154", "ttl": 64, "df": true, "sport": 41458, "dport": 443, "seq": 1564350983, "ack": 2602616049, "flags": "P.", "window": 64, "payload_len": 96}
    label: the HTTPS request packet from the lesson
  - args: ["4500003c2f3f40004006ca0fc0a801176814179aa1f201bb5d3e19a200000000a002faf000000000020405b40402080ae9b5c5d6000000000103030a"]
    expected: {"src": "192.168.1.23", "dst": "104.20.23.154", "ttl": 64, "df": true, "sport": 41458, "dport": 443, "seq": 1564350882, "ack": 0, "flags": "S", "window": 64240, "payload_len": 0}
    label: a SYN with 20 bytes of options
  - args: ["45 00 00 34 00 00 40 00 39 06 00 57 68 14 17 9a c0 a8 01 17 01 bb a1 f2 9b 20 c2 6c 5d 3e 19 a3 80 12 ff ff 00 00 00 00 02 04 05 78 01 01 04 02 01 03 03 0d"]
    expected: {"src": "104.20.23.154", "dst": "192.168.1.23", "ttl": 57, "df": true, "sport": 443, "dport": 41458, "seq": 2602615404, "ack": 1564350883, "flags": "S.", "window": 65535, "payload_len": 0}
    label: a SYN-ACK written with spaces
  - args: ["4500002800000000400666c10a0000070a0000091f90cb8e00000000112233445014000000000000"]
    expected: {"src": "10.0.0.7", "dst": "10.0.0.9", "ttl": 64, "df": false, "sport": 8080, "dport": 52110, "seq": 0, "ack": 287454020, "flags": "R.", "window": 0, "payload_len": 0}
    label: RST+ACK without DF
  - args: ["450000342f4140004006ca15c0a801176814179aa1f201bb5d3e1a679b20d10180110040000000000101080ae9b5c6b45e9c2003"]
    expected: {"src": "192.168.1.23", "dst": "104.20.23.154", "ttl": 64, "df": true, "sport": 41458, "dport": 443, "seq": 1564351079, "ack": 2602619137, "flags": "F.", "window": 64, "payload_len": 0}
    hidden: true
    label: FIN+ACK closing the connection
  - args: ["460000902f41400001069d1a0a0102030a010204940400001388177000000001000000025018020000000000"]
    expected: {"src": "10.1.2.3", "dst": "10.1.2.4", "ttl": 1, "df": true, "sport": 5000, "dport": 6000, "seq": 1, "ack": 2, "flags": "P.", "window": 512, "payload_len": 100}
    hidden: true
    label: IPv4 options make the IP header 24 bytes
hints:
  - "IHL is the low nibble of byte 0 and counts 32-bit words; the TCP header starts at `ihl * 4`."
  - "Multi-byte fields are big-endian. In JavaScript, build 32-bit values with multiplication or `>>> 0`, because `<<` on a byte above 0x7f produces a negative number."
  - "Flags live in the 14th byte of the TCP header (index 13): FIN 0x01, SYN 0x02, RST 0x04, PSH 0x08, ACK 0x10, URG 0x20, ECE 0x40, CWR 0x80."
```

```exercise
id: fragment-ipv4-packet
title: Fragment an IPv4 packet (or refuse to)
prompt: |
  A router must forward an IPv4 packet of `total_length` bytes whose header
  is `header_len` bytes onto a link with MTU `mtu`. `df` is the Don't
  Fragment bit.

  - If the packet fits (`total_length <= mtu`), return one fragment
    `[[0, total_length, false]]`.
  - If it does not fit and `df` is true, return the string
    `"ICMP frag-needed mtu=<mtu>"` (for example `"ICMP frag-needed mtu=1400"`).
  - Otherwise split the payload (`total_length - header_len` bytes). Every
    fragment except the last carries the largest multiple of 8 bytes of
    payload that fits in `mtu - header_len`. Assume every fragment carries
    the same header length. Return a list of
    `[offset, fragment_total_length, more_fragments]` where `offset` is in
    8-byte units, as in the IPv4 Fragment Offset field.
languages: [python, javascript]
entry: fragment_ipv4
starter:
  python: |
    def fragment_ipv4(total_length, header_len, mtu, df):
        # your code here
        return []
  javascript: |
    function fragment_ipv4(total_length, header_len, mtu, df) {
      // your code here
      return [];
    }
tests:
  - args: [1500, 20, 1400, false]
    expected: [[0, 1396, true], [172, 124, false]]
    label: the lesson's trace
  - args: [1500, 20, 1400, true]
    expected: "ICMP frag-needed mtu=1400"
    label: DF set, so drop and report (path MTU discovery)
  - args: [1400, 20, 1400, true]
    expected: [[0, 1400, false]]
    label: an exact fit is not fragmented
  - args: [4000, 20, 1500, false]
    expected: [[0, 1500, true], [185, 1500, true], [370, 1040, false]]
  - args: [1500, 24, 576, false]
    expected: [[0, 576, true], [69, 576, true], [138, 396, false]]
    hidden: true
    label: IP options and the 576-byte legacy minimum
  - args: [1500, 20, 1280, false]
    expected: [[0, 1276, true], [157, 244, false]]
    hidden: true
    label: 1,260 is not a multiple of 8, so fragments carry 1,256
hints:
  - "Payload per fragment is `(mtu - header_len) // 8 * 8`; the offset of each fragment is the payload bytes before it divided by 8."
  - "The last fragment has `more_fragments` false and may carry fewer bytes; its length is `header_len` plus what is left."
```

## Senior signals

- You can take a hex dump of one packet apart field by field (EtherType, IHL, total length, DF, TTL, protocol, ports, sequence, data offset, flags, window, TLS content type and length) and say which layer reads each.
- You derive 1,460, 1,448, 1,440, 1,380 and 1,232 from first principles, and you know the MSS each direction uses is the smaller of the two announced (1,388 towards Cloudflare's 1,400).
- You diagnose "small requests work, large responses hang" as a PMTUD black hole and name the fixes: MSS clamping, tunnel MTU, allowing ICMP type 3 code 4, `tcp_mtu_probing`.
- You know that GSO, TSO and GRO mean the kernel processes 64 KB units and the NIC segments them, so sender-side captures and "bad checksums" are not the wire.
- You reason about overhead in packets per second as well as bytes, and batch small messages to fill segments.
- You know where the model leaks (NAT rewrites two layers, middleboxes ossified TCP, an L7 balancer means two TLS sessions, cloud subnets are overlays with their own MTU), and you size TLS records for first-byte latency.

## Check yourself

```quiz
- q: >-
    A WireGuard tunnel has an MTU of 1420. A client behind it completes TCP and TLS handshakes with a web server and receives small pages, but any response over about 1.4 KB hangs forever. ping works. What is the most likely cause?
  options: ["The TLS cipher suite produces records that cannot cross the tunnel", "The tunnel fragments packets and the client fails to reassemble them", "The server's TCP receive window is too small to carry large bodies", "ICMP fragmentation-needed is filtered, so PMTUD never shrinks the MSS"]
  answer: 3
  explanation: >-
    Handshake packets and small responses fit under 1420 and pass; full-size segments with DF set are dropped at the tunnel, and the ICMP message that would lower the server's MSS is filtered, so the server retransmits segments that never arrive. With fragmentation the transfer would be slower, not dead. The fix is MSS clamping on the gateway, a lower tunnel MTU, or allowing ICMP type 3 code 4.
- q: >-
    A router forwards a TCP segment. Why does it recompute the IPv4 header checksum but leave the TCP checksum alone?
  options: ["TCP checksums are verified only by the sender, never on the path", "It decrements TTL, and treats the TCP segment as opaque payload", "The TCP checksum is encrypted by TLS, so routers cannot read it", "Routers lack the CPU budget to recompute checksums over payloads"]
  answer: 1
  explanation: >-
    Decrementing TTL changes the IP header, so its checksum must be redone. The transport segment is opaque to a layer-3 device and is verified by the receiver. A NAT is the exception: it rewrites addresses and ports, and because the TCP checksum covers a pseudo-header with both IP addresses it must patch the TCP checksum too. TLS encrypts the payload, not the TCP header.
- q: >-
    ss -ti on a Linux client shows advmss:1448 and mss:1388 for a connection to a CDN. What explains the two numbers?
  options: ["The client's kernel reserves 60 bytes for TLS records on port 443", "The path MTU shrank to 1428 after an ICMP message from a router on the way", "The client announced 1460, and the CDN announced 1400 in its SYN-ACK", "Window scaling divides the MSS by the scale factor both sides negotiated"]
  answer: 2
  explanation: >-
    Each side announces its own MSS in its SYN; the client announced 1460 (1448 after the 12-byte timestamps option) and the CDN announced 1400, so the client sends at most 1400 minus 12 = 1388 bytes per segment towards it. The kernel knows nothing about TLS record sizes, and window scaling multiplies the window field, not the MSS.
- q: >-
    A service sends 120-byte messages, one per TCP segment, at 200,000 messages per second. Roughly what fraction of the bytes on the wire are headers and framing, and what is the cheapest improvement?
  options: ["It depends only on the bandwidth of the link used", "About 40%; batch several messages into each segment", "About 90%; move the service over to UDP datagrams", "About 5%; the headers are too small to be worth it"]
  answer: 1
  explanation: >-
    Each segment costs 66 bytes of Ethernet, IP and TCP headers with timestamps plus about 24 bytes of FCS and framing, so about 90 bytes of overhead for 120 bytes of payload, roughly 43%. Batching fills segments towards 1448 bytes and cuts packets per second by an order of magnitude; UDP saves 20 bytes per packet and gives up reliability.
- q: >-
    A 1500-byte IPv4 packet with a 20-byte header and DF clear reaches a link with MTU 1400. What does the second fragment look like?
  options: ["Offset 173, 96 payload bytes, MF clear, with a copied TCP header", "Offset 1380, 100 payload bytes, MF set, with a TCP header", "Offset 172, 104 payload bytes, MF clear, no TCP header", "Offset 0, 1480 payload bytes, MF clear, once the first piece is dropped"]
  answer: 2
  explanation: >-
    Fragment payloads must be multiples of 8 bytes, so the first carries 1376 of the 1480 payload bytes (1380 rounded down) with MF set, and the second carries the remaining 104 at offset 1376 / 8 = 172 with MF clear. Only the first fragment contains the TCP header, which is why port-based firewalls struggle with fragments and why losing either piece loses the whole packet.
- q: >-
    A capture taken on a busy Linux sender shows outgoing TCP segments of 64,000 bytes with checksums marked incorrect. What is happening?
  options: ["GSO and TSO hand large units to the NIC, which segments and checksums them", "The path MTU is 64 KB because the host is using jumbo frames end to end", "IP fragmentation is splitting the segments after the capture point", "The NIC is corrupting packets and should be replaced before data is lost"]
  answer: 0
  explanation: >-
    The capture point sits above the NIC. With segmentation offload the kernel builds large TCP units and the NIC cuts them into MSS-sized segments and fills in the checksums, so the capture shows neither the real segment sizes nor final checksums. Jumbo frames top out near 9000 bytes, and disabling offloads to make the capture look right costs a large amount of CPU.
```

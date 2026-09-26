---
slug: layers-and-encapsulation
title: "Layers and encapsulation: what a packet actually looks like"
description: How Ethernet, IP and TCP headers wrap your bytes, why 1500 becomes 1460, what MTU and fragmentation cost, and where the clean layer model leaks in production.
minutes: 22
difficulty: intro
tags: [networking, osi, tcp-ip, encapsulation, mtu, headers]
problems: []
---
You call `write(fd, buf, 4000)` on a TCP socket and 4,000 bytes leave your process. What arrives at the other side is not one thing but three packets of 1,460 bytes, 1,460 bytes and 1,080 bytes, each wrapped in 54 bytes of headers you never wrote, each of which may take a different path and arrive in a different order. Every performance number you will ever quote (how many bytes fit in a packet, why a request takes three round trips before the first useful byte, why a VPN makes some websites hang) comes from the way those headers nest.

Layering is the design decision that makes the internet possible, and encapsulation is the mechanism. Understanding both is the difference between "the network is slow" and "the MTU on the tunnel is 1,400 and path MTU discovery is being blocked by a firewall dropping ICMP".

## Why layers exist

The internet is a chain of independently owned networks that have to interoperate without coordination. Layering solves that by giving each piece of hardware or software a narrow contract: Ethernet moves frames between two devices on one link; IP moves packets between any two hosts across many links; TCP turns unreliable packets into a reliable byte stream; HTTP gives the bytes meaning.

Each layer only knows how to talk to the layer directly above and below it. A router forwards IP packets and never looks at TCP. A switch forwards Ethernet frames and never looks at IP. Your application writes to a socket and never sees a packet. The contract lets any layer be replaced without touching the others: Wi-Fi replaced Ethernet on your laptop; IPv6 is replacing IPv4; QUIC is replacing TCP for a growing share of web traffic; none of those required rewriting the layers around them.

There are two models people cite. The OSI model has seven layers and is a teaching aid; the TCP/IP model has four (or five, depending who is counting) and is what actually runs.

| OSI layer | TCP/IP layer | What it identifies | Unit | Example |
|---|---|---|---|---|
| 7 Application | Application | The meaning of the bytes | message | HTTP, DNS, gRPC |
| 6 Presentation | (Application) | Encoding, encryption | – | TLS, JSON, protobuf |
| 5 Session | (Application) | Dialogue control | – | (mostly nothing) |
| 4 Transport | Transport | A process on a host (port) | segment / datagram | TCP, UDP, QUIC |
| 3 Network | Internet | A host anywhere (IP address) | packet | IPv4, IPv6, ICMP |
| 2 Data link | Link | A device on one link (MAC) | frame | Ethernet, Wi-Fi |
| 1 Physical | Link | Voltages, light, radio | bits | Cat6, fibre, 802.11 |

Layers 5 and 6 are where the OSI model is least honest. TLS sits "between" 4 and 7 and does presentation-ish work (encryption) with session-ish state (resumption tickets), and HTTP/2 does its own session multiplexing. When an interviewer asks "which layer is TLS", the senior answer is "it runs on top of TCP and under HTTP, and the OSI numbers for that are fuzzy; what matters is that it is invisible to routers and visible to the load balancer that terminates it".

## Encapsulation: the headers nest

Encapsulation is the rule that each layer prepends its own header to whatever the layer above handed it, treating the upper layer's data as an opaque payload. Going down the stack on the sender, the packet grows; going up on the receiver, each layer strips its header, looks at one field to decide who gets the rest, and hands it up.

```viz
{"type": "network", "scenario": "osi-encapsulation", "title": "Encapsulation on send, decapsulation on receive"}
```

Watch the demultiplexing keys. Each header carries one field that says which upper-layer protocol the payload belongs to:

- Ethernet `EtherType` 0x0800 means "the payload is IPv4"; 0x86DD means IPv6; 0x0806 means ARP.
- IPv4 `Protocol` 6 means TCP; 17 means UDP; 1 means ICMP.
- TCP `destination port` 443 means "hand this to whatever process is listening on 443".

That is the whole mechanism by which a frame arriving on a network card ends up in the right `accept()`ed socket in the right process.

## The real headers, byte by byte

Numbers matter here because they set the budgets you will compute for the rest of this track.

### Ethernet II frame: 14 bytes of header

```text
 0                   6                  12      14
 +-------------------+-------------------+-------+
 | dst MAC (6 B)     | src MAC (6 B)     | type  |  payload 46–1500 B  | FCS (4 B)
 +-------------------+-------------------+-------+
```

The MAC addresses identify devices on *this* link only; they are rewritten at every router hop. The frame check sequence (FCS) is a CRC-32 over the frame; a corrupted frame is silently dropped by the receiving card, which is why TCP has to detect loss by itself (see [Error detection](/learn/networking/network-algorithms/error-detection)). The payload is capped at 1,500 bytes: that cap is the Ethernet **MTU**.

### IPv4 header: 20 bytes (without options)

```text
 0       4       8              16                            31
 +-------+-------+---------------+-----------------------------+
 |Ver=4  | IHL=5 | DSCP/ECN      | Total length (header+data)  |
 +-------+-------+---------------+-----+-----------------------+
 | Identification                |flags| Fragment offset       |
 +---------------+---------------+-----+-----------------------+
 | TTL           | Protocol      | Header checksum             |
 +---------------+---------------+-----------------------------+
 | Source address                                              |
 +-------------------------------------------------------------+
 | Destination address                                         |
 +-------------------------------------------------------------+
```

Fields you will actually use:

- **Total length** is 16 bits, so an IP packet can never exceed 65,535 bytes regardless of the link.
- **TTL** is decremented by every router; at zero the packet is discarded and an ICMP "time exceeded" goes back to the sender. Linux starts it at 64, Windows at 128. `traceroute` is nothing but sending packets with TTL 1, 2, 3, … and reading who complained.
- **Protocol** is the demux key for the transport layer.
- **Flags** contain DF (Don't Fragment) and MF (More Fragments); with **Fragment offset** and **Identification** they implement fragmentation, discussed below.
- **Header checksum** covers only the header and is recomputed at every hop because TTL changes. It does not protect your data.

### TCP header: 20 bytes (without options)

```text
 0               8               16                            31
 +---------------+---------------+-----------------------------+
 | Source port                   | Destination port            |
 +-------------------------------+-----------------------------+
 | Sequence number                                             |
 +-------------------------------------------------------------+
 | Acknowledgement number                                      |
 +-------+-------+-+-+-+-+-+-+-+-+-----------------------------+
 |Offset | rsvd  |C|E|U|A|P|R|S|F| Window                      |
 +-------+-------+-+-+-+-+-+-+-+-+-----------------------------+
 | Checksum                      | Urgent pointer              |
 +-------------------------------+-----------------------------+
 | Options (0–40 B): MSS, SACK-permitted, timestamps, wscale   |
 +-------------------------------------------------------------+
```

The sequence and acknowledgement numbers are the reliability mechanism, and the 16-bit window is the flow-control mechanism; both get a full treatment in [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive). The **checksum** here covers the header, the data, and a pseudo-header containing the IP addresses, which is why TCP notices if a NAT rewrote the address without fixing the checksum.

### Doing the arithmetic

Ethernet MTU 1,500 minus IPv4 header 20 minus TCP header 20 is **1,460 bytes**, the classic TCP **MSS** (maximum segment size) advertised in the SYN. With TCP timestamps enabled (12 more bytes of options on every segment, which Linux enables by default), the usable payload is 1,448. Over IPv6 the network header is 40 bytes, so the MSS drops to 1,440.

So your 4,000-byte `write()` became segments of 1,448, 1,448 and 1,104 bytes (with timestamps), each carried in a frame of 1,514 bytes plus a 4-byte FCS plus 20 bytes of preamble and inter-frame gap on the wire. The overhead for full-size segments is about 5%; for a 100-byte JSON message it is over 50%. That is why "send fewer, larger messages" is a real optimisation and why HTTP/2 header compression exists.

| Encapsulation | Bytes on the wire for a 100 B payload | Efficiency |
|---|---|---|
| Ethernet + IPv4 + TCP (no options) | 100 + 54 + 4 FCS + 20 framing = 178 | 56% |
| Ethernet + IPv4 + UDP | 100 + 42 + 24 = 166 | 60% |
| Ethernet + IPv4 + TCP with a 1,448 B payload | 1,448 + 66 + 24 = 1,538 | 94% |

## MTU, fragmentation and the packets that vanish

The **MTU** is the largest payload a link can carry in one frame. Ethernet says 1,500. Many data-centre networks run jumbo frames at 9,000. A VPN or an overlay network (VXLAN, WireGuard, GRE) has to fit its own headers inside the outer 1,500, so its inner MTU is smaller: 1,420 for WireGuard, 1,450 for VXLAN, and 1,400 is a common conservative choice.

What happens when a 1,500-byte IPv4 packet reaches a link whose MTU is 1,400? Two possibilities, chosen by the DF bit:

1. **DF clear:** the router fragments the packet into two IP packets sharing the same Identification field, with Fragment offset saying where each piece goes and MF set on all but the last. The destination host reassembles. This works, and it is awful: if any one fragment is lost the whole packet is lost and must be retransmitted in full, firewalls cannot inspect fragments that lack the transport header, and reassembly buffers are a denial-of-service vector.
2. **DF set:** the router drops the packet and sends back ICMP type 3 code 4, "fragmentation needed, MTU is 1400". The sender's TCP stack lowers its MSS for that connection and resends. This is **path MTU discovery** (PMTUD), and modern stacks set DF on all TCP segments, so it is the normal case.

IPv6 removed router fragmentation entirely: only the sender may fragment, and PMTUD is mandatory.

The production failure is the **PMTUD black hole**. A firewall somewhere drops all ICMP "because ICMP is a security risk". Now the router drops the big packet, the ICMP never arrives, and the sender never learns to shrink. Small packets (the TCP handshake, a `GET` for a tiny resource) get through fine; the first full-size segment of the response silently disappears; the connection hangs until a timeout. The symptom is unmistakable once you have seen it: `curl` connects, TLS completes, and then the response body never arrives, while `ping` works and small pages load.

Two fixes:

```bash
# Clamp the MSS advertised in SYNs traversing this box (the router/VPN gateway).
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu

# Or set the interface MTU explicitly on the tunnel endpoint.
ip link set dev wg0 mtu 1420
```

MSS clamping works because MSS is negotiated in the handshake and is not encrypted at the IP layer; the middlebox rewrites 1460 to 1380 and both ends behave. It is a layer violation, and it is the standard practice.

You can find the path MTU yourself:

```bash
$ ping -M do -s 1472 203.0.113.9        # 1472 + 8 ICMP + 20 IP = 1500
PING 203.0.113.9 56(84) bytes of data.
ping: local error: message too long, mtu=1420
```

Bisect the `-s` value until the ping goes through and you know the path MTU.

## Where the layers leak

The model says each layer ignores the others. Production disagrees in at least four places, and a senior engineer expects each of them.

**NAT rewrites layer 3 and 4 from inside a router.** A home router or a cloud NAT gateway is nominally a layer-3 device, but it rewrites the source IP *and* the TCP/UDP source port, and it has to recompute the TCP checksum because of the pseudo-header. Protocols that embed IP addresses in their payload (classic FTP, SIP) break unless the NAT also parses layer 7. [IP addressing and routing](/learn/networking/fundamentals/ip-addressing-and-routing) covers the mapping table.

**Middleboxes read what they should not.** Load balancers, firewalls and intrusion detection systems make decisions based on TCP options, TLS SNI, or HTTP headers. This is why TCP has effectively stopped evolving: any new option or flag gets stripped or dropped by some box in the path. QUIC encrypts almost its whole header precisely so middleboxes cannot ossify it; see [HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3).

**TLS is nowhere and everywhere.** It runs above TCP, so routers never see it; but a layer-7 load balancer terminates it, reads the HTTP inside, and opens a fresh TLS session to the backend. From your service's point of view there are two TCP connections and two TLS sessions for one logical request. That is an extra handshake and an extra hop on every latency budget.

**Layer 2 is not one hop.** In a cloud VPC, "the same subnet" is an overlay: your frame is encapsulated in VXLAN or a proprietary equivalent, carried across several physical routers, and decapsulated on the destination host. Your 1,500-byte frame fits only because the underlay runs jumbo frames. When it does not (a VPN into that VPC), you are back to the MTU problem above.

## A packet capture as a layered object

Reading a capture is reading the encapsulation in reverse. Here is one TCP segment from `tcpdump -nn -v`, annotated by layer:

```text
12:04:31.220841 IP (tos 0x0, ttl 64, id 41239, offset 0, flags [DF], proto TCP (6), length 1500)
    10.0.1.5.51624 > 203.0.113.9.443: Flags [P.], seq 1:1449, ack 1, win 502,
    options [nop,nop,TS val 3921 ecr 8841], length 1448
```

- `ttl 64, id 41239, flags [DF], proto TCP (6), length 1500`: the IPv4 header. Linux sender, don't fragment, 1,500 bytes total.
- `10.0.1.5.51624 > 203.0.113.9.443`: source address:port, destination address:port; the 4-tuple that identifies the connection.
- `Flags [P.], seq 1:1449, ack 1, win 502`: TCP header. PSH+ACK, carrying bytes 1 to 1448 (relative numbering), acknowledging byte 1 from the peer, advertising a window of 502 × 2^7 = 64,256 bytes (window scale 7 was negotiated in the SYN).
- `length 1448`: the payload, which is 1,500 − 20 − 32 (20 TCP + 12 timestamps).

If you can read that line you can read most of this track. [Debugging the network](/learn/networking/networking-in-practice/debugging-the-network) builds the full toolkit.

## How this shows up in system design

Layering is a design pattern, not just a networking fact. Interviewers ask "where would you terminate TLS" or "should the load balancer be L4 or L7" to see whether you understand that each layer sees a different identity: an L4 balancer routes on IP:port and cannot see the URL; an L7 balancer sees the URL but must terminate TLS and re-encrypt, costing CPU and a handshake. The answer depends on what you need to route on and how much you trust the network behind the balancer.

The same logic sets your message sizes. A service that sends 200-byte protobuf messages one per segment is paying more in headers than in payload; batching to fill a 1,448-byte segment is a 3× reduction in packets per second, and packets per second is often the real limit on a network card or a NAT gateway, not bytes.

## Senior signals

- You can say why 1,500 becomes 1,460 (and 1,448 with timestamps, 1,440 on IPv6), and you know which of those numbers your service's MSS actually is.
- You diagnose "small requests work, large responses hang" as a PMTUD black hole before opening a ticket, and you know MSS clamping is the fix on the tunnel gateway.
- You describe the demux keys (EtherType, IP protocol number, port) rather than saying "the packet goes up the stack".
- You know where the model leaks: NAT rewrites two layers, middleboxes ossified TCP, an L7 load balancer means two TLS sessions per request.
- You reason about overhead in packets per second, not just bytes, and you batch small messages to fill segments.
- You read a `tcpdump` line layer by layer and can name every field in it.

## Check yourself

```quiz
- q: >-
    A WireGuard tunnel has an MTU of 1420. A client behind it can complete a TLS handshake with a web server and receive small pages, but any response over about 1.4 KB hangs forever. ping works. What is the most likely cause?
  options: ["The TLS cipher suite is incompatible with the tunnel", "Path MTU discovery is failing because ICMP fragmentation-needed messages are being dropped, so the server keeps sending 1460-byte segments that never arrive", "The tunnel is fragmenting packets and the client cannot reassemble them", "The server's TCP window is too small"]
  answer: 1
  explanation: >-
    Small packets fit under 1420 and get through; full-size 1460-byte segments with DF set are dropped at the tunnel and the ICMP that would tell the server to shrink its MSS is being filtered. If fragmentation were happening the transfer would be slow, not dead. The fix is MSS clamping or a lower MTU on the endpoint.
- q: >-
    Why does a router recompute the IPv4 header checksum on every hop but never touch the TCP checksum?
  options: ["The router lacks the CPU to verify TCP", "The router changes the TTL, which is in the IP header, and never modifies the TCP segment, which it treats as opaque payload", "TCP checksums are only checked by the sender", "The TCP checksum is encrypted"]
  answer: 1
  explanation: >-
    Decrementing TTL changes the IP header, so its checksum must be redone. The transport segment is an opaque payload to a layer-3 device. NAT is the exception that proves the rule; it rewrites addresses and ports and must fix the TCP checksum because of the pseudo-header.
- q: >-
    A service sends 120-byte messages, one per TCP segment, at 200,000 messages per second. Roughly what fraction of the bytes on the wire are headers and framing, and what is the cheapest improvement?
  options: ["About 5%; nothing to improve", "About 40%; batch several messages per segment so each carries closer to 1448 bytes", "About 90%; switch to UDP", "It depends only on the link bandwidth"]
  answer: 1
  explanation: >-
    Each segment costs 54 bytes of Ethernet/IP/TCP headers plus about 24 bytes of FCS and framing, so about 78 bytes of overhead for 120 of payload, roughly 40%. Batching fills segments toward 1448 bytes and cuts packets per second by an order of magnitude; UDP saves only 12 bytes per packet and loses reliability.
- q: >-
    Which statement about the OSI model is most accurate in practice?
  options: ["TLS is precisely a layer 6 protocol and HTTP/2 multiplexing is precisely layer 5", "Routers operate at layer 3 and never examine anything above it, without exception", "The seven layers are a teaching model; real stacks have four or five, and TLS and HTTP/2 do work that spans the session and presentation layers", "IPv6 added a new layer between 3 and 4"]
  answer: 2
  explanation: >-
    OSI is a vocabulary. The TCP/IP stack that runs has link, internet, transport and application layers, with TLS and HTTP/2 doing session-like work above transport. Middleboxes and NATs routinely violate the "routers only look at layer 3" rule.
- q: >-
    An IPv4 packet is 1500 bytes with DF clear and reaches a link with MTU 1400. What happens, and why is it undesirable?
  options: ["It is dropped and an ICMP error is sent; undesirable because the sender must retry", "It is fragmented into two IP packets that the destination reassembles; undesirable because losing either fragment loses the whole packet and firewalls cannot inspect the second fragment", "It is compressed to fit; undesirable because compression costs CPU", "The link MTU is raised to 1500 automatically"]
  answer: 1
  explanation: >-
    With DF clear the router fragments. Reassembly happens only at the destination, the second fragment carries no TCP header, and one lost fragment forces retransmission of the entire original packet. That is why modern TCP sets DF and relies on path MTU discovery instead.
```

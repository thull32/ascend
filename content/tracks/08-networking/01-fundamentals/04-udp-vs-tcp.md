---
slug: udp-vs-tcp
title: "UDP versus TCP: datagrams, streams and what reliability costs"
description: What the 8-byte UDP header does and does not promise, what TCP adds and what each of those additions costs in round trips and latency, when UDP is the right answer, and how QUIC rebuilds TCP's guarantees on top of UDP.
minutes: 24
difficulty: easy
tags: [networking, udp, tcp, datagrams, streams, quic, transport]
problems: []
---
A game server sends a player's position 60 times a second. A DNS resolver sends a 40-byte question and wants a 100-byte answer. A video call ships 30 frames a second and would rather drop one than show it late. A database client sends a 2 MB query result that must arrive complete and in order or not at all. Two of these want TCP and two want UDP, and the reason is not "TCP is reliable and UDP is fast". It is that reliability is a specific set of mechanisms, each with a latency cost, and some applications cannot afford the cost or are better at providing the mechanism themselves.

The transport layer offers two products. One is a datagram: a bounded message, sent once, delivered zero or one times, in any order. The other is a byte stream: an unbounded sequence delivered exactly once, in order, with the sender slowing down when the receiver or the network says so. Everything else about the choice follows from what the second product has to do to keep its promises.

## The UDP header: eight bytes and no promises

UDP adds exactly four fields to an IP packet.

```text
 0      7 8     15 16    23 24    31
+--------+--------+--------+--------+
|     Source Port |   Dest Port     |
+--------+--------+--------+--------+
|     Length      |   Checksum      |
+--------+--------+--------+--------+
|            data (0..65,507 bytes) |
```

Ports so the receiving host can find the process. Length so the receiver can find the end of the payload. A checksum that covers the header, the payload and a pseudo-header of IP addresses (optional in IPv4, mandatory in IPv6). That is all. There is no sequence number, so the receiver cannot tell that datagram 7 arrived before datagram 6, or that datagram 6 never arrived. There is no acknowledgement, so the sender never knows either. There is no connection, so the first datagram carries data.

```viz
{"type": "network", "scenario": "udp-send", "title": "A UDP datagram: one packet out, no state kept", "caption": "The sender writes one datagram and forgets it. If it is lost, nothing on the transport layer notices; the application either tolerates the loss or implements its own retry."}
```

What you get in exchange for that absence:

- **Zero round trips to start.** A DNS query is one packet out, one packet back. TCP would need a handshake first, tripling the cost of a 1 ms lookup.
- **Message boundaries.** `recvfrom()` returns exactly one datagram. TCP's `recv()` returns "some bytes", and you write a framing layer on top to find message edges.
- **No head-of-line blocking.** Datagram 6 being lost does not delay delivery of datagram 7. The application decides what to do about the gap.
- **Multicast and broadcast.** One send, many receivers; TCP's per-connection state makes this impossible.

And what you pay:

- **Loss is yours to handle.** Between 0.01% and 1% of packets are lost on a typical internet path, more on Wi-Fi and mobile. Silence is indistinguishable from loss.
- **Reordering is yours to handle.** Two datagrams can take different routes and arrive swapped. If order matters, you need a sequence number, which means you are rebuilding a piece of TCP.
- **No congestion control.** A UDP sender that blasts 100 Mb/s into a 10 Mb/s link loses 90% of its packets and hurts every TCP flow sharing the link. TCP backs off; UDP does not know how.
- **Size is bounded.** A datagram bigger than the path MTU (1,500 bytes on Ethernet, less over tunnels) is fragmented at the IP layer, and losing any fragment loses the whole datagram. Practical UDP protocols keep payloads under about 1,200 bytes, which is why QUIC's default maximum is 1,200.
- **Middleboxes are suspicious of it.** NAT devices time out UDP "sessions" after 30 seconds or so of silence (versus hours for TCP), which is why every UDP protocol that lives behind NAT sends keepalives. Some corporate networks drop UDP that is not DNS outright.

## What TCP adds, mechanism by mechanism

TCP is not one feature. It is five or six, each costing something. [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) works through the state machine; here the point is to see each mechanism as an item on a bill.

| Promise | Mechanism | What it costs |
|---|---|---|
| Both sides agree a connection exists | Three-way handshake (SYN, SYN-ACK, ACK) | One full RTT before the first data byte |
| Every byte arrives | Sequence numbers, cumulative ACKs, retransmission timers | Lost segment costs at least one RTT, often a retransmission timeout of 200 ms or more |
| Bytes arrive in order | Receiver buffers out-of-order segments until the gap fills | Head-of-line blocking: one lost packet delays every later packet |
| Sender does not overrun receiver | Flow control via the advertised receive window | Throughput capped at window / RTT |
| Sender does not overrun the network | Congestion control (slow start, AIMD) | First few RTTs move only a few KB; throughput collapses on loss |
| Clean end | FIN/ACK in each direction, TIME_WAIT | Closing side holds state for 60 seconds |

The handshake shown as packets:

```viz
{"type": "network", "scenario": "tcp-handshake", "title": "One RTT before any data can flow", "caption": "SYN out, SYN-ACK back, ACK out. The client can send data with the third packet, but the earliest the server can answer is 1.5 RTTs after the client started."}
```

Put numbers on it. Client to server RTT is 80 ms. A UDP request-response costs 80 ms. A fresh TCP request-response costs 80 ms for the handshake plus 80 ms for the request, 160 ms. Add TLS 1.3 and it is 240 ms. Reuse the connection and the next request is back to 80 ms, which is why [connection pooling](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) matters so much more than most engineers assume.

The reliability mechanism, once data is flowing:

```viz
{"type": "network", "scenario": "tcp-data-transfer", "title": "Segments, cumulative ACKs and the receive window", "caption": "Each segment carries a sequence number; each ACK says the next byte the receiver expects. The sender may have up to one window of unacknowledged bytes in flight."}
```

### The head-of-line cost, worked

Suppose a server sends four 1,460-byte segments and the second is lost. Segments 3 and 4 arrive and are buffered, but `recv()` on the client returns only segment 1's bytes: the stream contract forbids delivering bytes 2,921 onward before bytes 1,461–2,920. The client sends duplicate ACKs for segment 2; after three of them the sender retransmits (fast retransmit), which takes one more RTT. If fewer than three duplicates arrive, the sender waits for its retransmission timeout, at least 200 ms on Linux and often closer to an RTT-scaled value of several hundred milliseconds. During all of that, the application sees nothing, even though 75% of the data is sitting in a kernel buffer.

For a file download that is fine: the bytes are useless until complete anyway. For a video call it is catastrophic: three frames arrived on time and the transport is hiding them behind a fourth that is already stale. This single property, in-order delivery, is the reason media protocols use UDP.

## Choosing: a decision table

Ask two questions. Is every byte required, and is a late byte worth as much as an on-time one? If the answer to both is yes, use TCP. If either is no, UDP with an application-level protocol on top is worth considering.

| Workload | Transport | Why |
|---|---|---|
| HTTP/1.1, HTTP/2, database wire protocols, SSH, SMTP | TCP | Complete, ordered, no fixed deadline |
| DNS | UDP (TCP fallback) | Single request and reply; a handshake would double the cost; retries are trivial |
| Real-time voice and video (RTP over UDP, WebRTC) | UDP | A frame that is 200 ms late is worthless; concealment beats retransmission |
| Multiplayer game state | UDP | Newest position supersedes old ones; retransmitting a stale position is harmful |
| Metrics and logs at high volume (StatsD, syslog) | UDP, often | Losing 0.1% of counters is acceptable; blocking the app on a slow collector is not |
| NTP | UDP | Timing measurement; TCP's buffering would corrupt the measurement |
| HTTP/3 | UDP, via QUIC | Reliability and ordering re-implemented per stream in user space |
| Anything crossing an unknown corporate firewall | TCP, or UDP with TCP fallback | UDP is blocked or rate-limited on enough networks that you must handle it |

A rule of thumb used by people who have shipped both: if you find yourself adding sequence numbers, acknowledgements and retransmission to a UDP protocol, stop and check whether you are re-implementing TCP badly. The legitimate reason to do it is that you need a different reliability policy than TCP's (partial reliability, per-message deadlines, independent streams), not that you want "TCP but faster".

## What a UDP application protocol looks like

Here is the minimum a game or telemetry protocol puts in each datagram to survive the real internet.

```python
import struct, time

HEADER = struct.Struct("!IIQ")   # seq, ack, timestamp_us (network byte order)

def build(seq: int, last_seen: int, payload: bytes) -> bytes:
    return HEADER.pack(seq, last_seen, time.monotonic_ns() // 1000) + payload

def parse(datagram: bytes):
    seq, ack, ts = HEADER.unpack_from(datagram)
    return seq, ack, ts, datagram[HEADER.size:]
```

The sequence number lets the receiver detect gaps and drop stale duplicates (`if seq <= last_seen: discard`). The `ack` field piggybacks "the highest sequence I have seen from you" so the sender can measure loss without a separate ACK stream. The timestamp gives RTT and jitter. Sixteen bytes of header, and the application now has the *information* TCP has, without being bound to TCP's *policy* of stalling on every gap. A position update protocol simply uses the newest `seq` and ignores older ones; a voice codec conceals a missing frame by interpolating.

The thing every such protocol must also do is **rate control**. A UDP sender with no feedback loop is a denial-of-service tool. WebRTC uses a congestion controller (GCC) that watches inter-arrival timing; QUIC uses the same algorithms as TCP. If you write one and skip this, your protocol works in the office and collapses on a home Wi-Fi link shared with a TCP download.

## QUIC: TCP's guarantees, rebuilt in user space

QUIC is the strongest argument that the UDP-versus-TCP choice is really a question of *where* the reliability lives, not *whether*. It runs over UDP and provides:

- Reliable, ordered delivery, but **per stream**, so a lost packet blocks only the stream whose data it carried. HTTP/3 puts each request on its own stream, which is the fix for the head-of-line problem HTTP/2 inherited from TCP.
- A combined transport and TLS 1.3 handshake in one RTT, and 0-RTT resumption for repeat connections.
- Connection IDs instead of the 4-tuple, so a phone moving from Wi-Fi to cellular keeps its connection.
- Congestion control (Cubic or BBR) and loss recovery implemented in the library, so improvements ship with the browser rather than waiting for a kernel upgrade.

The cost is that all of that runs in user space. A QUIC stack burns roughly two to three times the CPU per byte of a kernel TCP stack with offloads, because every packet crosses the user/kernel boundary individually and the NIC cannot segment or checksum for it. That is fine for a browser and expensive for a CDN edge pushing 100 Gb/s, which is why QUIC adoption at scale tracked the arrival of UDP generic segmentation offload in the kernel. [HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3) covers the protocol; the transport point here is simply that QUIC chose UDP not because UDP is fast but because UDP is *empty*, and an empty transport is the only place you can build a new one without changing every middlebox on the internet.

## Reading the sockets

The two products look different from the API too, and the difference is where beginners get bitten.

```python
# UDP: one datagram per call, boundaries preserved, no connection
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.sendto(b"hello", ("203.0.113.9", 9000))          # one packet, may be lost
data, addr = s.recvfrom(2048)                       # exactly one datagram or block

# TCP: a stream, boundaries are yours to invent
c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
c.connect(("203.0.113.9", 9000))                    # blocks for the handshake (1 RTT)
c.sendall(b"hello")                                 # may be split or merged with the next send
chunk = c.recv(2048)                                # 1..2048 bytes, any framing lost
```

Two classic bugs. First, treating TCP `recv()` as message-oriented: it works in tests on localhost, where each `send` usually becomes one segment, and breaks in production when Nagle's algorithm merges two small writes or a large one is split at the MSS. Every TCP protocol needs a length prefix or a delimiter. Second, assuming a UDP `sendto` that returned without error means the datagram arrived. It means the kernel accepted it. Nothing more.

On the wire, `tcpdump` shows the difference as the absence of everything:

```text
# UDP: no flags, no seq, no ack, just length
10:41:07.001 IP 10.0.0.5.53411 > 10.0.0.2.53: 41922+ A? api.example.com. (33)
10:41:07.002 IP 10.0.0.2.53 > 10.0.0.5.53411: 41922 2/0/1 CNAME lb.example.net., A 203.0.113.9 (98)

# TCP: flags, sequence, ack, window on every segment
10:41:07.100 IP 10.0.0.5.44120 > 203.0.113.9.443: Flags [S], seq 1187562001, win 64240, options [mss 1460,sackOK,TS val 1 ecr 0,nop,wscale 7]
10:41:07.180 IP 203.0.113.9.443 > 10.0.0.5.44120: Flags [S.], seq 2810004112, ack 1187562002, win 65160, options [mss 1460,sackOK,TS val 9 ecr 1,nop,wscale 7]
10:41:07.180 IP 10.0.0.5.44120 > 203.0.113.9.443: Flags [.], ack 1, win 502
```

The DNS exchange completed in 1 ms with two packets. The TCP connection has used three packets and 80 ms and carried zero bytes of application data.

## Senior signals

- You describe TCP as a list of mechanisms with individual costs (handshake RTT, head-of-line blocking, TIME_WAIT) rather than the single word "reliable", and you can say which of those a given application cannot afford.
- You know that UDP protocols behind NAT need keepalives and that some networks drop non-DNS UDP, so any UDP-based product ships with a TCP fallback.
- You treat a UDP sender without rate control as a bug that will hurt other traffic, and you can name what WebRTC and QUIC do about it.
- You explain QUIC as "TCP's guarantees per stream, in user space, over UDP because UDP is empty", and you know its CPU cost relative to kernel TCP.
- You frame TCP `recv()` as bytes, not messages, and you have written the length-prefix framing that every TCP protocol needs.
- Given an RTT, you can quote the cost of a fresh TCP connection versus a UDP exchange in milliseconds before anyone asks.

## Check yourself

```quiz
- q: >-
    A voice-over-IP application is built on TCP. During a burst of 1% packet loss, users report audio freezing for half a second at a time even though almost all packets arrived. Which TCP property is responsible?
  options: ["TCP's checksum rejects audio frames with minor bit errors", "The three-way handshake is repeated after every loss", "The receive window is too small for continuous audio", "In-order delivery hides arrived frames behind the lost one"]
  answer: 3
  explanation: >-
    The stream contract means bytes after a gap cannot be delivered until the gap is filled, and filling it costs at least an RTT and often a retransmission timeout, so on-time frames sit in the kernel buffer behind a stale one. The frames were there; the transport refused to hand them over. UDP with a jitter buffer delivers what arrived and conceals what did not.
- q: >-
    The client-server RTT is 100 ms. Roughly how long until the client receives the reply to a single small request over a fresh TCP connection with TLS 1.3, versus over UDP?
  options: ["300 ms versus 200 ms", "300 ms versus 100 ms", "200 ms versus 100 ms", "100 ms versus 100 ms"]
  answer: 1
  explanation: >-
    TCP handshake costs one RTT, TLS 1.3 costs one more, then the request and reply take a third: 300 ms. The handshakes do not overlap with the request on a fresh connection. UDP has no setup, so the request and reply take one RTT: 100 ms. This is why connection reuse and 0-RTT resumption exist.
- q: >-
    You design a UDP protocol for streaming sensor readings and add sequence numbers, per-packet acknowledgements and retransmission of every lost reading. What should a reviewer point out?
  options: ["Acknowledgements are not permitted over UDP at all", "UDP headers have no room to carry sequence numbers at all", "Sensor data must always be sent over TCP, never UDP", "It rebuilds TCP's policy; drop stale readings instead"]
  answer: 3
  explanation: >-
    Reliable in-order delivery of every message is exactly what TCP provides, with decades of tuning and congestion control. The reason to use UDP is to apply a different policy, such as not retransmitting old readings because only the newest matters. Rebuilding TCP's policy on UDP gives you TCP's costs plus your own bugs, and usually without rate control. Sequence numbers and ACKs in a UDP payload are perfectly legal.
- q: >-
    A UDP-based application works on the office network but its connections silently die after about 30 seconds of inactivity when users are at home. What is the most likely cause?
  options: ["The application exceeds the home link's MTU", "The home NAT expired the idle mapping", "Home routers do not support UDP traffic at all", "UDP datagrams expire after 30 seconds in flight"]
  answer: 1
  explanation: >-
    NAT devices keep UDP mappings for a short idle period, commonly around 30 seconds, versus hours for established TCP. Once the mapping expires, inbound datagrams have nowhere to go. Every production UDP protocol (WebRTC, QUIC, VPNs) sends periodic keepalives for this reason.
- q: >-
    Why did QUIC's designers build on UDP rather than defining a new IP protocol number alongside TCP (6) and UDP (17)?
  options: ["NATs and firewalls pass UDP but drop unknown IP protocols", "IP has no free protocol numbers left to assign", "UDP is faster than any new transport protocol could be", "UDP already provides the congestion control QUIC needs"]
  answer: 0
  explanation: >-
    Middleboxes only understand TCP and UDP; SCTP, which took the new-protocol route, is nearly undeployable on the public internet for that reason. UDP is deployable and contributes nothing beyond ports and a checksum, so its empty header lets QUIC implement streams, reliability, congestion control and encryption itself.
```

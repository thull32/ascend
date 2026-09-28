---
slug: udp-vs-tcp
title: "UDP versus TCP: datagrams, streams and what reliability costs"
description: What the 8-byte UDP header does and does not promise, each TCP mechanism priced in round trips and stalls, head-of-line blocking traced segment by segment, measured drops when a UDP socket buffer overflows, when UDP is the right answer, and how QUIC rebuilds TCP's guarantees per stream over UDP.
minutes: 24
difficulty: easy
tags: [networking, udp, tcp, datagrams, streams, quic, transport, head-of-line-blocking]
problems: []
---
A game server sends a player's position 60 times a second. A DNS resolver sends a 29-byte question and wants a 61-byte answer. A video call ships 30 frames a second and would rather drop one than show it late. A database client receives a 2 MB result that must arrive complete and in order or not at all. Two of these want TCP and two want UDP, and the reason is not "TCP is reliable and UDP is fast". Reliability is a specific set of mechanisms, each with a latency cost, and some applications cannot afford the cost or are better at providing the mechanism themselves.

A metrics team learns the other half of the lesson. Their StatsD collector reports 40% less traffic than the services send during peak minutes, and nothing logs an error, because nothing can: the senders' `sendto` calls all succeeded, and the datagrams were dropped by the collector's kernel when its socket buffer filled. The transport layer offers two products. One is a datagram: a bounded message, sent once, delivered zero or one times, in any order. The other is a byte stream: an unbounded sequence delivered exactly once, in order, with the sender slowing down when the receiver or the network says so. Everything else about the choice follows from what the second product must do to keep its promises, and from what the first one silently does not do.

## The UDP header: eight bytes and no promises

UDP adds four fields to an IP packet:

```text
 0      7 8     15 16    23 24    31
+--------+--------+--------+--------+
|     Source port |   Dest port     |
+--------+--------+--------+--------+
|     Length      |   Checksum      |
+--------+--------+--------+--------+
|    data (up to 65,507 bytes)      |
```

Ports so the receiving host can find the process. Length so the receiver knows where the payload ends (65,535 − 8 − 20 = 65,507 bytes of payload at most over IPv4). A checksum over the header, the payload and a pseudo-header of IP addresses, optional in IPv4 and mandatory in IPv6. There is no sequence number, so the receiver cannot tell that datagram 7 arrived before datagram 6, or that datagram 6 never arrived; no acknowledgement, so the sender never knows either; and no connection, so the first datagram carries data.

```viz
{"type": "network", "scenario": "udp-send", "title": "A UDP datagram: one packet out, no state kept", "caption": "The sender writes one datagram and forgets it. If it is lost, nothing at the transport layer notices; the application tolerates the loss or implements its own retry."}
```

What you get for that absence:

- **Zero round trips to start.** A DNS lookup is one packet each way.
- **Message boundaries.** `recvfrom()` returns exactly one datagram; TCP's `recv()` returns "some bytes".
- **No head-of-line blocking.** Losing datagram 6 does not delay datagram 7.
- **Multicast and broadcast.** One send, many receivers, which per-connection state makes impossible for TCP.

And what you pay:

- **Loss and reordering are yours.** Loss on a healthy wired path is well under 1%; Wi-Fi, mobile and congested links are worse, and silence is indistinguishable from loss.
- **No congestion control.** A UDP sender pushing 100 Mbit/s into a 10 Mbit/s link loses 90% of its packets and starves every TCP flow sharing the link.
- **Size is bounded by the path.** A datagram larger than the path MTU is fragmented at the IP layer, and losing any fragment loses the whole datagram, so real protocols keep datagrams near 1,200 bytes ([layers and encapsulation](/learn/networking/fundamentals/layers-and-encapsulation) derives the number).
- **Middleboxes distrust it.** NATs expire idle UDP mappings in about 30 seconds (versus hours or days for TCP), and some networks drop UDP that is not DNS.

## Under the hood: where UDP datagrams die

Every UDP socket has a receive queue bounded by `SO_RCVBUF`, 212,992 bytes by default on this machine (`net.core.rmem_default`). When a datagram arrives and the queue is full, the kernel drops it and increments a counter; nothing is sent back. A Python experiment on loopback sent 5,000 datagrams of 1,000 bytes, in bursts, to a socket that was not reading yet:

| Counter (`/proc/net/snmp`, `Udp:` line) | Change |
|---|---|
| `OutDatagrams` | +5,000 (every `sendto` returned success) |
| `InDatagrams` | +123 (what the application later read) |
| `RcvbufErrors` | +4,877 |

Only 123 datagrams fit, not 212, because the kernel charges each queued datagram its full buffer footprint (about 1.7 KB here for a 1,000-byte payload), not its payload size. That is the StatsD incident in miniature, and the diagnosis is the same in production: `netstat -su` or `nstat` shows "receive buffer errors" climbing. The fixes are a larger buffer (`setsockopt(SO_RCVBUF)`, capped by `net.core.rmem_max`, 4 MB here), more reader threads with `SO_REUSEPORT` so the kernel spreads datagrams across several sockets, and a consumer that does less work per datagram.

Two more kernel behaviours matter. A UDP socket on which you call `connect()` only accepts datagrams from that peer and receives ICMP errors as `ECONNREFUSED` on the next call, which is how a DNS client learns quickly that nothing listens on the port. And a single UDP flow gets none of the NIC's TCP segmentation offload, which is why QUIC stacks depend on UDP GSO (Linux 4.18) and UDP GRO (Linux 5.0) to batch datagrams through the kernel.

## What TCP adds, mechanism by mechanism

TCP is five or six mechanisms, each an item on a bill. [TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive) works through the state machine; here each is priced.

| Promise | Mechanism | What it costs |
|---|---|---|
| Both sides agree a connection exists | Three-way handshake | One RTT before the first request byte |
| Every byte arrives | Sequence numbers, cumulative ACKs, retransmission | A lost segment costs at least one RTT, or a retransmission timeout of 200 ms or more |
| Bytes arrive in order | Receiver holds out-of-order segments until the gap fills | Head-of-line blocking: one loss delays every later byte |
| Sender does not overrun the receiver | Advertised receive window | Throughput ≤ window / RTT |
| Sender does not overrun the network | Congestion control | First RTTs carry only ~14 KB; throughput halves or worse on loss |
| Clean close | FIN in each direction, then TIME_WAIT | The closing side keeps a socket for 60 s |

```viz
{"type": "network", "scenario": "tcp-handshake", "title": "One RTT before any data can flow", "caption": "SYN out, SYN-ACK back, ACK out. The client can send its request with the third packet, so the earliest reply arrives two RTTs after the client started."}
```

Measured from this machine to example.com with `curl -w`: the TCP connection completed about 50 ms after DNS, the TLS 1.3 handshake about 60 ms after that, and the first response byte about 60 ms later, three round trips of similar size before any content. A UDP request and reply would have cost one. Reusing the connection brings later requests back to one round trip, which is why [connection pooling](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive) matters more than most engineers assume.

```viz
{"type": "network", "scenario": "tcp-data-transfer", "title": "Segments, cumulative ACKs and the receive window", "caption": "Each segment carries a sequence number; each ACK names the next byte the receiver expects. The sender may have one window of unacknowledged bytes in flight."}
```

## Head-of-line blocking, traced

A server sends four 1,448-byte segments of a stream at time 0 over a path with a 50 ms RTT; segment 2 is lost.

| Time | Event at the client | Bytes the application can `recv()` |
|---|---|---|
| 25 ms | Segment 1 (bytes 1–1,448) arrives in order | 1,448 |
| 25 ms | Segment 3 (2,897–4,344) arrives: a gap. Buffered; duplicate ACK "still want 1,449" with a SACK block for 2,897–4,344 | 1,448 |
| 25 ms | Segment 4 arrives: buffered; second duplicate ACK with SACK 2,897–5,792 | 1,448 |
| 50 ms | Sender has two duplicate ACKs; classic fast retransmit wants three. Linux's RACK loss detection marks segment 2 lost about a quarter RTT after segment 4 was acknowledged | 1,448 |
| ~62 ms | Sender retransmits segment 2 | 1,448 |
| ~87 ms | Segment 2 arrives: the gap fills and the kernel releases everything | 5,792 |

For about 60 ms, three quarters of the data sat in the client's kernel and the application saw none of it. With only one or two segments in flight there are too few duplicate ACKs, and recovery waits for the retransmission timeout, 200 ms minimum on Linux. For a file download this is harmless: the bytes are useless until complete. For a video call it is fatal: three frames arrived on time and the transport hides them behind a fourth that is already stale. In-order delivery is the single property that pushes real-time media onto UDP.

## Choosing a transport

Ask two questions: is every byte required, and is a late byte worth as much as an on-time one? If both answers are yes, use TCP. If either is no, UDP with an application protocol on top is worth considering.

| Workload | Transport | Why |
|---|---|---|
| HTTP/1.1, HTTP/2, database protocols, SSH | TCP | Complete, ordered, no hard deadline |
| DNS | UDP, TCP for large answers | One request and reply; a handshake would triple the cost |
| Voice and video (RTP, WebRTC) | UDP | A frame 200 ms late is worthless; concealment beats retransmission |
| Multiplayer game state | UDP | The newest position supersedes older ones |
| High-volume metrics (StatsD) | UDP, often | Losing 0.1% of counters beats blocking the app on a slow collector |
| NTP | UDP | Buffering and retransmission would corrupt the timing measurement |
| HTTP/3 | UDP, via QUIC | Reliability per stream, in user space |
| Unknown corporate networks | TCP, or UDP with TCP fallback | UDP is blocked often enough that you must handle it |

If you find yourself adding sequence numbers, acknowledgements and retransmission of every message to a UDP protocol, you are re-implementing TCP, usually without its congestion control. The legitimate reason is a different reliability policy: partial reliability, per-message deadlines, independent streams.

## A UDP application protocol, minimally

```python
import socket, struct, time

HEADER = struct.Struct("!IIQ")        # seq, highest seq seen from peer, send time in microseconds

def build(seq: int, last_seen: int, payload: bytes) -> bytes:
    return HEADER.pack(seq, last_seen, time.monotonic_ns() // 1000) + payload

def parse(datagram: bytes):
    seq, ack, ts = HEADER.unpack_from(datagram)
    return seq, ack, ts, datagram[HEADER.size:]

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 << 20)   # ask for 4 MB; capped by rmem_max
sock.bind(("127.0.0.1", 0))
sock.sendto(build(1, 0, b"pos=12,40"), sock.getsockname())
print(parse(sock.recvfrom(2048)[0]))
```

The sequence number lets the receiver detect gaps and discard stale or duplicate datagrams (`if seq <= newest: drop`). The piggybacked `ack` tells the sender what got through, so it can measure loss without a separate acknowledgement stream. The timestamp yields RTT and jitter. Sixteen bytes give the application the information TCP has without TCP's policy of stalling on every gap; a position protocol uses the newest `seq`, a voice codec interpolates over a missing frame.

Such a protocol must also control its rate. A UDP sender with no feedback loop is a denial-of-service tool; WebRTC uses a delay-based controller (Google Congestion Control) and QUIC uses the same algorithms as TCP ([congestion control](/learn/networking/fundamentals/congestion-control)).

## QUIC: TCP's guarantees, rebuilt over UDP

QUIC (RFC 9000, 2021) is the strongest evidence that the choice is about *where* reliability lives. It runs over UDP because middleboxes pass UDP and drop unknown IP protocols, and UDP adds nothing but ports. Its design fixes several things TCP cannot change:

- **Streams.** Reliable, ordered delivery per stream; a lost packet stalls only the streams whose data it carried. A stream ID's low two bits encode who opened it and whether it is bidirectional. HTTP/3 puts each request on its own stream.
- **Packet numbers never repeat.** A retransmission carries the lost data in a new packet with a new number, so an ACK is never ambiguous about which copy it acknowledges, a problem TCP needs timestamps and Karn's rule to work around. ACK frames list up to many ranges, like an unbounded SACK, plus the receiver's ACK delay for accurate RTT samples.
- **Handshake.** Transport and TLS 1.3 handshakes run together: 1 RTT for a new connection, 0 RTT for resumption, with the replay caveats in [TLS and PKI](/learn/networking/fundamentals/tls-and-pki).
- **Encryption of almost everything.** Payload and most of the header are encrypted, and packet numbers are masked by header protection, so middleboxes cannot ossify the protocol; only the flags byte, version and connection IDs are visible.
- **Connection IDs.** A connection is identified by IDs chosen by each endpoint, not the 4-tuple, so a phone moving from Wi-Fi to mobile keeps its connection after a path validation exchange (`PATH_CHALLENGE`/`PATH_RESPONSE`).
- **Anti-amplification.** A client's first packet must be padded to at least 1,200 bytes, and a server may send at most three times what it has received from an unvalidated address, so QUIC servers cannot be used to reflect floods.

### Under the hood: a QUIC Initial packet

RFC 9001's worked example of a client's first packet begins, before header protection is applied, with these 22 bytes:

```text
c3 00 00 00 01 08 83 94 c8 f0 3e 51 57 08 00 00 44 9e 00 00 00 02
```

| Bytes | Field | Value |
|---|---|---|
| `c3` | Header form, fixed bit, type, reserved, packet-number length | `1` long header, `1` fixed, `00` Initial, `00` reserved, `11` = 4-byte packet number (these low bits are masked by header protection on the wire) |
| `00 00 00 01` | Version | QUIC version 1 |
| `08` + 8 bytes | Destination connection ID | `83 94 c8 f0 3e 51 57 08`, chosen randomly by the client; the Initial packet keys are derived from it, so anyone can decrypt Initial packets, which is why the real secrets come from the TLS handshake inside |
| `00` | Source connection ID length | 0: this client uses an empty ID |
| `00` | Token length | Variable-length integer 0: no address-validation token yet |
| `44 9e` | Length | Two-byte varint (`01` prefix): `0x049e` = 1,182 bytes of packet number plus payload |
| `00 00 00 02` | Packet number | 2 |

Header plus the 1,182 counted bytes is exactly 1,200: the client padded its first datagram to the minimum size QUIC requires, so that the server's three-times amplification budget is large enough for its reply. The length field is one of the variable-length integers the second exercise encodes.

The cost is that all of this runs in user space: each datagram crosses the system-call boundary and the NIC's TCP offloads do not apply. QUIC servers historically used a few times the CPU per byte of kernel TCP with offloads; UDP GSO/GRO and batched system calls narrowed the gap, and the remaining difference is one reason large CDNs rolled HTTP/3 out gradually. [HTTP/2 and HTTP/3](/learn/networking/application-protocols/http-2-and-http-3) covers the application side.

## The sockets API, and the framing bug

```python
import socket, threading, time

ls = socket.socket(); ls.bind(("127.0.0.1", 0)); ls.listen(1)
sizes = []
def server():
    conn, _ = ls.accept()
    time.sleep(0.05)                    # let both writes arrive before reading
    sizes.append(len(conn.recv(4096)))
    conn.close()
t = threading.Thread(target=server); t.start()
c = socket.create_connection(ls.getsockname())
c.sendall(b"a" * 100)                   # message one
c.sendall(b"b" * 100)                   # message two
t.join(); c.close()
print(sizes)                            # [200]: one recv() returned both messages
```

Run on this machine, the server's single `recv()` returned 200 bytes: two messages merged, because TCP is a byte stream and the receive queue has no memory of write boundaries. The same code can return 100 on another run, or split a large message at the MSS. Every TCP protocol therefore needs framing, a length prefix or a delimiter, and a parser that handles a message split across reads and several messages in one read; the first exercise builds one. The UDP counterpart of this bug is assuming a successful `sendto` means delivery, when it only means the kernel accepted the datagram.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| UDP receive buffer overflow | Metrics or logs undercount at peak; no errors anywhere | `RcvbufErrors` rising in `/proc/net/snmp` or `nstat` | Larger `SO_RCVBUF` (raise `rmem_max`), `SO_REUSEPORT` with more readers, less work per datagram |
| Missing TCP framing | Works in tests, corrupt or merged messages in production | Messages parsed per `recv()`; a capture shows two messages in one segment or one message across two | Length-prefix framing with a buffer that carries partial messages |
| NAT expiry for UDP | Sessions die after ~30 s of silence on home or mobile networks | Traffic resumes only after the client sends first | Keepalives every 15–25 s; QUIC and WireGuard do this |
| UDP blocked | HTTP/3 or a VPN fails on some corporate networks | Handshakes time out on UDP while TCP to the same port works | TCP fallback (browsers race HTTP/3 against HTTP/2); TURN over TCP 443 for WebRTC |
| Reflection and amplification | Your UDP service floods a victim with large responses to spoofed small requests | Outbound bandwidth spikes to sources that never completed an exchange | Rate-limit responses per source, never expose UDP services such as memcached publicly, prefer protocols with QUIC-style 3× limits |
| Head-of-line stalls on lossy links | Interactive stream freezes for a round trip or 200 ms at a time | Loss correlated with stalls; `ss -ti` shows retransmits | UDP for real-time media; QUIC streams for multiplexed requests; keep enough data in flight for fast recovery |

## Trade-offs

| | TCP | UDP | QUIC | SCTP |
|---|---|---|---|---|
| Setup cost | 1 RTT (+1 for TLS 1.3) | 0 | 1 RTT with TLS, 0 on resumption | 2 RTT (4-way handshake) |
| Head-of-line blocking | Whole connection | None | Per stream | Per stream |
| Message boundaries | No | Yes | Per stream frames | Yes |
| Congestion control | Kernel | None (application's job) | User-space library | Kernel |
| Traverses the internet | Everywhere | Mostly; some networks block | Where UDP 443 is allowed | Rarely: NATs drop it |
| Where it evolves | Kernel releases | n/a | Application releases | Kernel releases |

## Interviewer follow-ups

**"Why does HTTP/3 use UDP instead of fixing TCP?"** Model answer: TCP is implemented in kernels and inspected by middleboxes, so changing its behaviour (per-stream delivery, new handshake) would take a decade and break on boxes that drop unknown options; UDP is deployable everywhere and empty, so QUIC can implement streams, loss recovery and encryption in user space and ship with the application. Common wrong answer: "UDP is faster than TCP".

**"Your UDP-based telemetry loses 30% of data at peak. How do you find where?"** Model answer: compare send counts with `InDatagrams`, check `RcvbufErrors` on the collector (socket buffer), NIC and softnet drop counters, and the network path; most often it is the receiver's socket buffer, fixed with bigger buffers, `SO_REUSEPORT` and faster consumption. Common wrong answer: "switch to TCP", which moves the stall into the senders.

**"When is fast retransmit not triggered, and what happens instead?"** Model answer: when fewer than about three segments follow the lost one (small responses, the tail of a transfer), there are too few duplicate ACKs; the sender waits for RACK's timer or the retransmission timeout, 200 ms minimum on Linux, which is why tail losses dominate latency for short requests. Common wrong answer: "TCP always retransmits after one RTT".

**"Can you build reliable delivery on UDP?"** Model answer: yes, and QUIC is the proof, but the justification must be a different policy (per-stream ordering, deadlines, partial reliability) and it must include congestion control. Common wrong answer: "no, UDP is unreliable by definition".

## What mid-level engineers get wrong

- Treating TCP `recv()` as message-oriented because it works on localhost tests, then shipping a protocol that corrupts merged or split messages.
- Treating a successful `sendto` as delivery, and monitoring UDP pipelines only on the sending side.
- Adding per-message ACKs and retransmission to a UDP protocol without rate control, rebuilding TCP's costs without its safety.
- Forgetting NAT keepalives for long-lived UDP flows, and forgetting a TCP fallback for networks that block UDP.
- Pricing a fresh TCP plus TLS request at one round trip; it is three before the first response byte.

## Exercises

```exercise
id: tcp-length-prefix-deframer
title: Reassemble length-prefixed messages from a TCP stream
prompt: |
  A TCP stream carries messages framed as a 2-byte big-endian length
  followed by that many payload bytes. `chunks` is the sequence of byte
  strings returned by successive `recv()` calls, each given as lowercase
  hex. `recv()` may split a message (even its length prefix) across calls
  or return several messages at once.

  Return the list of complete message payloads, in order, each as a hex
  string. Bytes of an incomplete final message are not returned. A
  zero-length message is valid and is returned as `""`.
languages: [python, javascript]
entry: deframe
starter:
  python: |
    def deframe(chunks):
        messages = []
        # your code here
        return messages
  javascript: |
    function deframe(chunks) {
      const messages = [];
      // your code here
      return messages;
    }
tests:
  - args: [["000568656c6c6f0002686900"]]
    expected: ["68656c6c6f", "6869"]
    label: two messages and a partial third in one recv
  - args: [["00", "05", "68656c", "6c6f00"]]
    expected: ["68656c6c6f"]
    label: the length prefix itself is split
  - args: [["0000000161"]]
    expected: ["", "61"]
    label: a zero-length message
  - args: [["000568656c6c6f0002686900", "0161", "0003", "78797a"]]
    expected: ["68656c6c6f", "6869", "61", "78797a"]
    hidden: true
    label: a partial message completes in later chunks
  - args: [[]]
    expected: []
    hidden: true
    label: nothing received
hints:
  - "Keep one buffer across chunks. After appending each chunk, loop: if at least 2 bytes are buffered and the buffer holds 2 + length bytes, emit and remove one message."
  - "Stop the inner loop as soon as a message is incomplete; the next chunk may finish it."
```

```exercise
id: quic-varint-encode
title: QUIC variable-length integers
prompt: |
  QUIC encodes most integers (stream IDs, lengths, offsets) in 1, 2, 4 or
  8 bytes. The top two bits of the first byte give the length (`00` = 1,
  `01` = 2, `10` = 4, `11` = 8 bytes) and the remaining 6, 14, 30 or 62
  bits hold the value, big-endian.

  Return the shortest encoding of the non-negative integer `n`
  (`n < 2**53` in the tests) as a lowercase hex string. For example 37 is
  `"25"`, 15293 is `"7bbd"` and 494878333 is `"9d7f3e7d"` (these three are
  RFC 9000's own examples).
languages: [python, javascript]
entry: quic_varint
starter:
  python: |
    def quic_varint(n):
        # your code here
        return ""
  javascript: |
    function quic_varint(n) {
      // your code here
      return "";
    }
tests:
  - args: [37]
    expected: "25"
  - args: [15293]
    expected: "7bbd"
  - args: [494878333]
    expected: "9d7f3e7d"
  - args: [64]
    expected: "4040"
    label: the first value that needs two bytes
  - args: [16383]
    expected: "7fff"
    hidden: true
    label: the largest two-byte value
  - args: [1073741824]
    expected: "c000000040000000"
    hidden: true
    label: 2^30 needs eight bytes
  - args: [0]
    expected: "00"
    hidden: true
hints:
  - "Thresholds: below 2^6 one byte, below 2^14 two, below 2^30 four, otherwise eight. Add the length bits to the value (0x4000, 0x80000000, 0xc0 followed by seven bytes) and format with zero padding."
  - "In JavaScript an 8-byte value does not fit in a double; build it as two 32-bit halves (`Math.floor(n / 2**32)` and `n % 2**32`) or use BigInt."
```

## Senior signals

- You describe TCP as a list of mechanisms with individual costs (handshake RTT, head-of-line blocking, RTO, TIME_WAIT) and say which one an application cannot afford.
- You can trace a head-of-line stall segment by segment and explain when fast retransmit fires and when the RTO does.
- You know UDP drops happen silently in the receiver's socket buffer, read `RcvbufErrors`, and size buffers and readers accordingly.
- You treat a UDP sender without rate control as a bug, and every UDP product ships with keepalives and a TCP fallback.
- You explain QUIC's design choices (streams, never-reused packet numbers, encrypted headers, connection IDs, 1,200-byte and 3× limits) and its CPU cost.
- You frame TCP `recv()` as bytes, not messages, and write length-prefix framing by reflex.

## Check yourself

```quiz
- q: >-
    A voice-over-IP application is built on TCP. During a burst of 1% packet loss, users report audio freezing for a fraction of a second at a time even though almost all packets arrived. Which TCP property is responsible?
  options: ["The three-way handshake is repeated after every loss", "In-order delivery holds arrived frames behind the lost one", "The checksum rejects audio frames with minor bit errors", "The receive window is too small for continuous audio"]
  answer: 1
  explanation: >-
    Bytes after a gap cannot be delivered until the gap is filled, which costs at least a round trip and sometimes a 200 ms retransmission timeout, so on-time frames wait in the kernel behind a stale one. Checksums discard corrupted segments rather than frames, and handshakes happen once per connection. UDP with a jitter buffer plays what arrived and conceals what did not.
- q: >-
    The client-server RTT is 100 ms. Roughly how long until the client has the reply to one small request over a fresh TCP connection with TLS 1.3, versus over UDP?
  options: ["300 ms versus 200 ms", "300 ms versus 100 ms", "200 ms versus 100 ms", "100 ms versus 100 ms"]
  answer: 1
  explanation: >-
    The TCP handshake costs one RTT, TLS 1.3 one more, and the request and reply a third: 300 ms, matching the three roughly equal steps curl measured to example.com. UDP has no setup, so one RTT. Connection reuse and 0-RTT resumption exist to claw back the difference.
- q: >-
    A StatsD collector receives 40% fewer metrics than services send at peak, and no errors are logged anywhere. What should you check first?
  options: ["The collector's TLS session cache, which may be evicting clients", "TCP retransmission counters on the collector's listening connection", "The senders' sendto return values, since failures would be reported there", "RcvbufErrors on the collector, since a full socket buffer drops silently"]
  answer: 3
  explanation: >-
    When a UDP socket's receive queue is full, the kernel drops the datagram and increments RcvbufErrors; the sender's sendto has already returned success, so nothing reports the loss. In the lesson's experiment 4877 of 5000 datagrams were dropped this way. StatsD over UDP has no TCP connection or TLS session.
- q: >-
    Why can an acknowledgement in QUIC never be ambiguous about which transmission of lost data it acknowledges, while TCP's can?
  options: ["QUIC never retransmits, relying on forward error correction", "QUIC retransmits data in new packets with new packet numbers", "QUIC waits for every packet to be acknowledged before sending more", "QUIC uses a longer checksum that identifies each packet uniquely"]
  answer: 1
  explanation: >-
    TCP retransmits the same sequence numbers, so an ACK for them could refer to either copy, which corrupts RTT samples unless timestamps or Karn's rule are used. QUIC packet numbers increase monotonically and are never reused; lost frames are re-sent inside new packets. QUIC keeps many packets in flight and does retransmit.
- q: >-
    Two 100-byte messages are written to a TCP socket with two sendall calls, and the receiver's single recv(4096) returns 200 bytes. What does this show?
  options: ["Nagle's algorithm is broken and should always be disabled", "The receiver's buffer overflowed and merged the two segments", "TCP has corrupted the stream by joining two separate packets", "TCP preserves no write boundaries, so the protocol needs framing"]
  answer: 3
  explanation: >-
    TCP delivers a byte stream; the receive queue has no record of how the sender split its writes, so one recv can return several messages or part of one. Nothing is corrupted or overflowed, and disabling Nagle changes timing but not the stream semantics. A length prefix or delimiter is required in every TCP protocol.
- q: >-
    Why did QUIC's designers build on UDP rather than defining a new IP protocol number alongside TCP (6) and UDP (17)?
  options: ["NATs and firewalls pass UDP but drop unknown IP protocols", "IP has no free protocol numbers left for a new transport", "UDP datagrams are routed faster than other IP protocols are", "UDP already provides the congestion control that QUIC needs"]
  answer: 0
  explanation: >-
    Middleboxes understand TCP and UDP; SCTP, which took the new-protocol route, is nearly undeployable across the internet for that reason. UDP adds only ports and a checksum, so QUIC implements streams, reliability, congestion control and encryption itself. Routers forward by address, not by transport protocol.
```

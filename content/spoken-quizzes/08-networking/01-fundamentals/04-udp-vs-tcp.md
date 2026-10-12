---
lesson: udp-vs-tcp
source: cec41fd7d70d2003
---
## 1

A voice over IP application is built on TCP. During a burst of 1 percent packet loss, users hear the audio freeze for a fraction of a second at a time, even though almost all packets arrived. Which TCP property is responsible?

A, the three-way handshake is repeated after every loss. B, in-order delivery holds frames that arrived behind the lost one. C, the checksum rejects audio frames with minor bit errors. D, the receive window is too small for continuous audio.

[think]

The answer is B: in-order delivery holds frames that arrived behind the lost one.

Bytes after a gap cannot be delivered until the gap is filled, which costs at least a round trip, and sometimes a 200 millisecond retransmission timeout. So on-time frames wait in the kernel behind a stale one. Checksums discard corrupted segments rather than frames, and handshakes happen once per connection. UDP with a jitter buffer plays what arrived and conceals what did not.

## 2

The round trip between client and server is 100 milliseconds. Roughly how long until the client has the reply to one small request over a fresh TCP connection with TLS 1.3, compared with over UDP?

A, 300 milliseconds against 200. B, 300 milliseconds against 100. C, 200 milliseconds against 100. D, 100 milliseconds against 100.

[think]

The answer is B: 300 milliseconds against 100.

The TCP handshake costs one round trip, TLS 1.3 one more, and the request and reply a third: 300 milliseconds, matching the three roughly equal steps curl measured to example dot com. UDP has no setup, so one round trip. Connection reuse and zero round trip resumption exist to claw back the difference.

## 3

A StatsD collector receives 40 percent fewer metrics than the services send at peak, and no errors are logged anywhere. What should you check first?

A, the collector's TLS session cache, which may be evicting clients. B, TCP retransmission counters on the collector's listening connection. C, the return values of the senders' send calls, since failures would be reported there. D, the receive-buffer error counter on the collector, since a full socket buffer drops silently.

[think]

The answer is D: the receive-buffer error counter on the collector, since a full socket buffer drops silently.

When a UDP socket's receive queue is full, the kernel drops the datagram and increments that counter. The sender's send call has already returned success, so nothing reports the loss. In the lesson's experiment, 4,877 of 5,000 datagrams were dropped this way. And StatsD over UDP has no TCP connection or TLS session to inspect.

## 4

Why can an acknowledgement in QUIC never be ambiguous about which transmission of lost data it acknowledges, while one in TCP can?

A, QUIC never retransmits, relying on forward error correction. B, QUIC retransmits data in new packets, with new packet numbers. C, QUIC waits for every packet to be acknowledged before sending more. D, QUIC uses a longer checksum that identifies each packet uniquely.

[think]

The answer is B: QUIC retransmits data in new packets, with new packet numbers.

TCP retransmits the same sequence numbers, so an acknowledgement for them could refer to either copy, which corrupts round-trip samples unless timestamps or Karn's rule are used. QUIC packet numbers only ever increase and are never reused, and lost frames are re-sent inside new packets. QUIC keeps many packets in flight, and it does retransmit.

## 5

Two 100-byte messages are written to a TCP socket with two separate send calls, and the receiver's single receive call, asking for up to 4096 bytes, returns 200 bytes. What does this show?

A, Nagle's algorithm is broken and should always be disabled. B, the receiver's buffer overflowed and merged the two segments. C, TCP has corrupted the stream by joining two separate packets. D, TCP preserves no write boundaries, so the protocol needs framing.

[think]

The answer is D: TCP preserves no write boundaries, so the protocol needs framing.

TCP delivers a byte stream, and the receive queue has no record of how the sender split its writes, so one receive can return several messages, or part of one. Nothing is corrupted or overflowed, and disabling Nagle changes timing, not the stream's semantics. Every TCP protocol needs a length prefix or a delimiter.

## 6

A live stream adds one XOR parity packet for every 10 data packets, which is more than its measured 2 percent average loss. Yet viewers see artefacts at almost the same rate as without the error correction. What is the most likely cause?

A, the parity packets are too small to protect full-size video packets. B, losses come in bursts, so groups often lose two packets at once. C, XOR parity cannot rebuild a packet that arrives out of order. D, the receiver's socket buffer drops parity packets before data packets.

[think]

The answer is B: losses come in bursts, so groups often lose two packets at once.

XOR parity rebuilds one missing packet per group. Under bursty loss with the same 2 percent average, 71 percent of the groups with a loss in the lesson's simulation had a second one, and groups of 10 repaired 8 percent of losses, against 82 percent under random loss. Parity is as large as the largest packet it protects, and reordering only delays recovery. Negative acknowledgements, or interleaving that spans the burst within the deadline, fix it.

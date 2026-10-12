---
lesson: http-2-and-http-3
source: e05000e2d2e45008
---
## 1

A mobile app on a lossy cellular link moves from HTTP/1.1 over six connections to HTTP/2 over one. Median latency improves, but the 95th percentile gets worse. What is the most likely cause?

A, the server is ignoring HTTP/2's priority tree entirely. B, HTTP/2 disables TLS session resumption on each reconnect. C, one lost TCP segment now stalls every multiplexed stream. D, header decompression is limited by the phone's CPU.

[think]

The answer is C: one lost TCP segment now stalls every multiplexed stream.

All HTTP/2 streams share one ordered TCP byte stream, so a single loss blocks all of them until the retransmission arrives. With six HTTP/1.1 connections, a loss stalls only one connection's work. At 1 percent loss and 100 packets per round trip, about 63 percent of round trips contain a loss. Priorities, resumption and header compression do not produce this tail.

## 2

Curl's second request on a connection sends an HPACK header block that contains the byte hex C-zero. What does that byte mean?

A, a literal field whose name is index 64, with its value following. B, a static-table entry for the authority header's default value. C, a Huffman-coded authority value that is 64 bytes long. D, an indexed field: dynamic-table entry 64, the authority sent earlier.

[think]

The answer is D: an indexed field: dynamic-table entry 64, the authority sent earlier.

A byte with its top bit set is an indexed representation, and the low 7 bits give index 64. Indexes above 61 refer to the dynamic table, where the first request's literal authority value was inserted at 62, and then pushed to 64 by the two insertions after it. A literal with indexing starts with the bits zero one, and the static table holds the authority header as a name only.

## 3

A proxy relays downloads over HTTP/2 to clients 100 milliseconds away, and never changes the default flow-control windows. Roughly what is the maximum rate of one stream?

A, unlimited, since HTTP/2 flow control applies only to uploads. B, about 50 megabits per second, since TCP's window grows to fill the path. C, about 5 megabits per second: one 65,535-byte window per round trip. D, about 500 megabits per second, since the connection window is shared.

[think]

The answer is C: about 5 megabits per second: one 65,535-byte window per round trip.

The sender may have at most one stream window of unacknowledged data outstanding: 65,535 bytes every 100 milliseconds is about 5.2 megabits per second, whatever TCP could do underneath. HTTP/2 flow control applies in both directions, and to each stream as well as the connection. That is why clients such as curl raise the stream window to megabytes in their first settings frame.

## 4

Your gRPC service, behind a new layer 7 load balancer, answers the balancer's health checks, but real calls fail with "unexpected HTTP/1.x response". What is the probable misconfiguration?

A, the backend has HTTP/2 server push switched on. B, the balancer speaks HTTP/1.1 to the backend. C, a NAT is rewriting QUIC connection IDs in flight. D, ALPN is disabled in the gRPC client's TLS stack.

[think]

The answer is B: the balancer speaks HTTP/1.1 to the backend.

gRPC needs HTTP/2 end to end, for its streams and trailers. Balancers often terminate HTTP/2 from clients and downgrade the backend leg to HTTP/1.1 unless configured otherwise, which plain health checks tolerate and gRPC cannot. The client's ALPN evidently works, since it reaches the balancer.

## 5

Why does HTTP/3 use QPACK instead of HPACK for header compression?

A, HPACK cannot compress headers that QUIC has already encrypted. B, HPACK depends on TCP's checksum to detect corrupt header blocks. C, HPACK needs header blocks decoded in order, which QUIC streams do not provide. D, HPACK's static table is too small for HTTP/3's pseudo-headers.

[think]

The answer is C: HPACK needs header blocks decoded in order, which QUIC streams do not provide.

HPACK updates its dynamic table as each block is decoded, so both ends must see blocks in the same order, which one TCP stream guarantees. QUIC delivers streams independently, so QPACK sends table insertions on a dedicated stream, and a block that references a missing entry blocks only its own request. Compression happens before encryption, and QPACK's larger static table is a refinement, not the reason.

## 6

A server accepts a POST that charges a card as zero round trip early data, on a resumed QUIC connection. What is the risk?

A, the server cannot respond until one full round trip later. B, a captured copy can be replayed, charging the card twice. C, early data is sent without encryption over the network. D, the connection can no longer migrate between networks.

[think]

The answer is B: a captured copy can be replayed, charging the card twice.

Early data is encrypted with keys from the previous session and carries no fresh contribution from the server, so an attacker who captured it can send it again. Servers accept only idempotent requests as early data, and answer others with 425, Too Early, so the client retries after the full handshake. Migration and encryption are unaffected.

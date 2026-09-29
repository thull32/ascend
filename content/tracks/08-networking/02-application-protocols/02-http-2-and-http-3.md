---
slug: http-2-and-http-3
title: "HTTP/2 and HTTP/3: multiplexing, HPACK and moving the transport into user space"
description: HTTP/2 read from a real connection frame by frame (preface, SETTINGS, WINDOW_UPDATE, HEADERS), HPACK decoded byte by byte as a 31-byte header block shrinks to 6, stream states and flow-control window arithmetic, why push died, TCP head-of-line blocking quantified, HTTP/3 over QUIC with QPACK, 0-RTT and connection migration, discovery through ALPN, Alt-Svc and HTTPS records, and when to adopt each.
minutes: 45
difficulty: hard
tags: [http2, http3, quic, hpack, qpack, multiplexing, flow-control, head-of-line-blocking, alpn]
problems: []
---
HTTP/1.1's rule of one request at a time per connection forced every workaround in a front-end performance guide: six connections per host, domain sharding, sprite sheets, inlined CSS, concatenated JavaScript bundles. A page needing 100 resources over six connections spends about 17 serial round trips waiting in line. HTTP/2 removes the rule; HTTP/3 removes the transport that still enforced a version of it underneath.

A team turns on HTTP/2 at its edge and sees median page latency fall by a fifth, then gets a ticket from the mobile team: p95 on cellular networks is worse than before. Another team puts its gRPC services behind a new L7 load balancer and every call fails with "unexpected HTTP/1.x response". Neither protocol changes HTTP's *semantics*: methods, status codes, headers and caching mean what they meant before. What changes is framing, header compression and, in HTTP/3, the whole transport, and each of those changes has a failure mode. This lesson reads a real HTTP/2 connection byte by byte, decodes its compressed headers, prices head-of-line blocking, and follows the same request onto QUIC.

## HTTP/2 framing: binary, length-prefixed, tagged with a stream

HTTP/1.1 delimits messages with CRLF and `Content-Length`. HTTP/2 delimits them with a 9-byte binary frame header:

```text
+-----------------------------------------------+
|                 Length (24 bits)              |
+---------------+---------------+---------------+
|   Type (8)    |   Flags (8)   |
+-+-------------+---------------+-------------------------------+
|R|                 Stream Identifier (31 bits)                 |
+=+=============================================================+
|                   Frame Payload (0 to 2^24-1 bytes) ...       |
+---------------------------------------------------------------+
```

The **stream identifier** is the idea. A stream is one request/response exchange; every frame names its stream, so frames from different streams interleave on one TCP connection and are reassembled at the other end. Client-initiated streams use odd IDs (1, 3, 5, …), server-initiated ones even IDs, and stream 0 is the connection itself.

| Type (code) | Purpose |
|---|---|
| `DATA` (0) | Body bytes for a stream; the `END_STREAM` flag (0x1) marks the last |
| `HEADERS` (1) | Opens a stream with an HPACK-compressed header block; `END_HEADERS` (0x4) says the block is complete |
| `PRIORITY` (2) | The deprecated priority tree |
| `RST_STREAM` (3) | Cancels one stream, leaving the connection up |
| `SETTINGS` (4) | Connection parameters; `ACK` (0x1) acknowledges the peer's |
| `PUSH_PROMISE` (5) | Server push, now effectively dead |
| `PING` (6) | Liveness and RTT measurement |
| `GOAWAY` (7) | Graceful shutdown: "I will not process streams above ID N" |
| `WINDOW_UPDATE` (8) | Flow-control credit for a stream or the connection |
| `CONTINUATION` (9) | The rest of a header block too large for one frame |

The default maximum frame payload is 16 KiB, so a 1 MB response is at least 64 `DATA` frames, and between any two of them the server may send frames for other streams. That interleaving is **multiplexing**.

```viz
{"type": "network", "scenario": "http2-multiplexing", "title": "Three requests on one HTTP/2 connection", "caption": "Frames tagged with stream IDs interleave on a single TCP connection, so a slow response no longer blocks the others at the HTTP layer."}
```

## A real connection, frame by frame

To see what a client actually sends, a small Python server on loopback accepted cleartext HTTP/2 and logged every frame while `curl --http2-prior-knowledge` (curl 8.5.0, nghttp2 1.59) fetched `/` twice on one connection. After the 24-byte connection preface, `PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n` (chosen so that an HTTP/1.1 server fails fast on it), curl sent:

| Frame header | Decoded | Payload | Meaning |
|---|---|---|---|
| `00 00 12 04 00 00 00 00 00` | 18 bytes, SETTINGS, no flags, stream 0 | `00 03 00 00 00 64` `00 04 00 a0 00 00` `00 02 00 00 00 00` | MAX_CONCURRENT_STREAMS = 100; INITIAL_WINDOW_SIZE = 0xa00000 = 10,485,760 (10 MiB per stream); ENABLE_PUSH = 0 |
| `00 00 04 08 00 00 00 00 00` | 4 bytes, WINDOW_UPDATE, stream 0 | `3e 7f 00 01` | Connection window += 1,048,510,465, so 65,535 becomes 1,048,576,000 |
| `00 00 1f 01 05 00 00 00 01` | 31 bytes, HEADERS, flags 0x05 = END_STREAM + END_HEADERS, stream 1 | `82 86 41 8b … 53 03 2a 2f 2a` | `GET /`: the whole request in one frame, no body |
| `00 00 00 04 01 00 00 00 00` | 0 bytes, SETTINGS, ACK | none | Acknowledges the server's SETTINGS |
| `00 00 06 01 05 00 00 00 03` | 6 bytes, HEADERS, END_STREAM + END_HEADERS, stream 3 | `82 86 c0 84 bf be` | The second `GET /`: **6 bytes** of headers |

The same request written as HTTP/1.1 text is 76 bytes (curl's `size_request`). The second exercise parses exactly this byte stream.

## Streams, cancellation and shutdown

Each stream moves through a small state machine: **idle** until a `HEADERS` frame opens it, **open** while both sides may send, **half-closed** once one side has sent `END_STREAM` (a `GET` is half-closed from the client's side immediately, as above), and **closed** when both have, or when either sends `RST_STREAM`. Stream IDs only increase, so a long-lived connection eventually exhausts its 2³¹ IDs and must be replaced.

Three consequences matter in production:

- **Concurrency is negotiated.** curl advertised 100 concurrent streams; servers commonly advertise 100 to 250. A client that needs more waits, or opens a second connection.
- **Cancellation is cheap.** On HTTP/1.1, cancelling a request means closing the connection and paying a new handshake; on HTTP/2 a client that navigates away cancels 30 image streams with 30 small `RST_STREAM` frames and keeps the connection warm. gRPC's deadlines and cancellation are built on it ([gRPC and protobuf](/learn/networking/application-protocols/grpc-and-protobuf)).
- **Shutdown is graceful.** `GOAWAY` carries the highest stream ID the sender will process, so a draining server finishes in-flight streams and the client retries the rest on a new connection, knowing which ones were never touched.

Cheap cancellation also created a vulnerability. In October 2023 Google, Cloudflare and AWS disclosed "Rapid Reset" (CVE-2023-44487): clients opened streams and reset them immediately, so each stream cost the server work without ever counting against the concurrency limit, and single botnets generated hundreds of millions of requests per second (Google [reported](https://cloud.google.com/blog/products/identity-security/how-it-works-the-novel-http2-rapid-reset-ddos-attack) a peak above 398 million). Servers were patched to count and bound resets per connection and to close connections that exceed them, which is why HTTP/2 servers now carry reset-rate limits in their configuration.

## Flow control, with the numbers

Multiplexing creates a fairness problem: one fast stream could starve the others, and a slow consumer could force the sender to buffer without bound. HTTP/2 therefore has credit-based flow control per stream and per connection, above TCP's. Each receiver starts with a 65,535-byte window at both levels; every `DATA` byte consumes window; `WINDOW_UPDATE` returns credit. A sender may transmit at most the smaller of the stream's and the connection's remaining window.

The window bounds throughput exactly as TCP's receive window does ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive)):

| Window | RTT | Maximum rate per stream (window / RTT) |
|---|---|---|
| 65,535 bytes (the protocol default) | 100 ms | 5.2 Mbit/s |
| 65,535 bytes | 10 ms | 52 Mbit/s |
| 10 MiB (curl's SETTINGS above) | 100 ms | 839 Mbit/s |

That is why curl raises its stream window to 10 MiB and its connection window to about 1,000 MiB before sending a request, and why a proxy left at the defaults caps each long-distance download at about 5 Mbit/s however fast the link is. gRPC implementations raise or auto-tune the window by estimating the bandwidth-delay product with `PING` frames. The receiver's side of the bargain is to send `WINDOW_UPDATE` promptly as the application consumes data; one that forgets stalls the stream with a full window and an idle network.

## HPACK: headers in a byte or two

HTTP/1.1 sends every header in full on every request. A browser request carries 500 to 900 bytes of headers, most identical to the previous request's (`user-agent`, `accept`, cookies), and for a 300-byte JSON response the headers dominate. HPACK (RFC 7541) compresses them with three mechanisms:

1. A **static table** of 61 common header fields: `:method: GET` is index 2, `:path: /` is 4, `:scheme: http` 6, `:scheme: https` 7, `:status: 200` 8; some entries are names only, such as `:authority` (1), `accept` (19) and `user-agent` (58).
2. A **dynamic table** per connection and direction, which both ends build identically as literals marked "with incremental indexing" are sent. New entries take index 62 and push older ones up.
3. **Huffman coding** of literal strings with a static code tuned for header text.

### The captured header blocks, decoded

Curl's first request block, 31 bytes:

| Bytes | Representation | Decoded | Dynamic table after |
|---|---|---|---|
| `82` | Indexed (top bit 1), index 2 | `:method: GET` | empty |
| `86` | Indexed, index 6 | `:scheme: http` | empty |
| `41 8b` + 11 bytes | Literal with incremental indexing (`01` prefix), name index 1; value Huffman-coded (top bit of `8b`), length 11 | `:authority: 127.0.0.1:<port>` (15 characters in 11 bytes) | [62] `:authority` |
| `84` | Indexed, index 4 | `:path: /` | unchanged |
| `7a 88` + 8 bytes | Literal with indexing, name index 58 (`0x40 + 58 = 0x7a`), Huffman value, length 8 | `user-agent: curl/8.5.0` (10 characters in 8 bytes) | [62] `user-agent`, [63] `:authority` |
| `53 03 2a 2f 2a` | Literal with indexing, name index 19 (`0x40 + 19 = 0x53`), plain value, length 3 | `accept: */*` | [62] `accept`, [63] `user-agent`, [64] `:authority` |

The second request's block is `82 86 c0 84 bf be`: `:method: GET` (2), `:scheme: http` (6), `c0` = indexed 64 (`:authority`), `:path: /` (4), `bf` = 63 (`user-agent`), `be` = 62 (`accept`). Six bytes against 76 bytes of HTTP/1.1 text, a 92% reduction, and a cookie repeated on every request collapses the same way.

Each dynamic-table entry costs its name length plus value length plus 32 bytes of accounting overhead, against a default table size of 4,096 bytes that the decoder may change with `SETTINGS_HEADER_TABLE_SIZE`. The three entries above cost 41 + 52 + 57 = 150 bytes; when the table is full, the oldest entries are evicted. The integers inside these representations use HPACK's prefix encoding (the index 64 is `c0` because a 7-bit prefix holds it directly; an index of 127 or more spills into continuation bytes), which the first exercise implements.

Two properties follow. The dynamic table makes decoding **stateful and order-dependent**: both ends must process header blocks in exactly the order sent, which TCP guarantees and QUIC does not, so HTTP/3 needed QPACK. And HPACK was designed against the CRIME attack, in which general-purpose compression (DEFLATE) of headers leaked cookies through compressed lengths: HPACK only matches whole header fields, and sensitive fields can be sent as "never indexed" literals that no intermediary may add to a table.

## Priorities and push: features that did not survive

HTTP/2 shipped with a **priority tree** in which each stream declared a parent and a weight. Servers implemented it inconsistently, CDNs mostly ignored it, and browsers each built different trees. RFC 9218's Extensible Priorities replaced it with an `urgency` value from 0 to 7 and an `incremental` flag, sent as a `priority` header, which HTTP/3 uses too.

**Server push** let a server send `PUSH_PROMISE` and then a resource it predicted the client would need. The server cannot see the browser's cache, so it pushed bytes the browser already had, during the congestion-limited first round trips, and measured gains were rare. Chrome turned it off by default in version 106, in 2022; curl above disables it with `ENABLE_PUSH = 0`. The replacement is **103 Early Hints**: an interim response with `Link: </style.css>; rel=preload` sent before the final response, so the client decides whether to fetch.

## Where HTTP/2 makes things worse: TCP head-of-line blocking

HTTP/2 removes head-of-line blocking at the HTTP layer and inherits it from TCP. All streams share one ordered byte stream; a lost segment holds back every later byte, for every stream, until the retransmission arrives, even though other streams' frames sit complete in the receive buffer.

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "One lost segment stalls every HTTP/2 stream", "caption": "TCP cannot hand bytes after the gap to the application until the retransmitted segment fills it, so frames for unrelated streams wait too."}
```

Quantify it. A connection carries 100 packets per round trip for 10 equally active streams, with independent 1% loss. The chance that a round trip contains at least one loss is 1 − 0.99¹⁰⁰ ≈ 63%, and over HTTP/2 every such loss stalls **all 10** streams for at least one more round trip. With per-stream delivery, each stream's 10 packets see a loss with probability 1 − 0.99¹⁰ ≈ 9.6%, so a given stream stalls in about a tenth of round trips instead of nearly two thirds. Six HTTP/1.1 connections sit in between: a loss stalls one connection's work. Daniel Stenberg's [*HTTP/3 explained*](https://http3-explained.haxx.se/en/why-quic/why-tcphol) reports tests in which HTTP/1.1 users were usually better off than HTTP/2 users at 2% packet loss, a rate that cellular and marginal Wi-Fi links can reach; inside a data centre, with loss far below 0.01%, the effect is negligible and HTTP/2's single connection is a pure win. One more cost: one connection means one congestion window, so six HTTP/1.1 connections in slow start grow six times as fast as one HTTP/2 connection ([congestion control](/learn/networking/fundamentals/congestion-control)).

The fix is a transport that knows about streams, and TCP cannot realistically be changed, because kernels and middleboxes everywhere implement and inspect it. Hence QUIC.

## HTTP/3 and QUIC

QUIC runs over UDP in user space (in the browser, the server process or the load balancer) and provides what TCP plus TLS provide, plus streams ([UDP versus TCP](/learn/networking/fundamentals/udp-vs-tcp) takes its packet apart):

| Property | TCP + TLS 1.3 | QUIC |
|---|---|---|
| Runs over | IP, in the kernel | UDP, in user space |
| Streams | None; HTTP/2 adds them above | Native, with independent loss recovery |
| Loss recovery | Per connection; blocks everything | Per stream; only the affected streams wait |
| Handshake | 1 RTT TCP + 1 RTT TLS | 1 RTT combined; 0-RTT on resumption |
| Connection identity | The 4-tuple | Connection IDs chosen by the endpoints |
| Encryption | Payload only; TCP headers visible | Almost everything, including packet numbers |
| Congestion control | The kernel's | The implementation's, upgraded with each deploy |

- **Independent streams:** under the 1% loss above, each stream stalls in about 10% of round trips rather than 63%.
- **0-RTT:** a returning client sends its first request in its first flight. That data can be replayed by an attacker who captured it, so servers accept only idempotent requests as early data, and origins answer anything else with `425 Too Early` ([TLS and PKI](/learn/networking/fundamentals/tls-and-pki)).
- **Connection migration:** a phone moving from Wi-Fi to cellular changes address, which kills every TCP connection; a QUIC connection continues after a path validation, because the server recognises its connection ID.
- **Encrypted transport headers** stop middleboxes from ossifying QUIC and also stop operators from shaping it, which is one reason some networks block UDP 443 and every HTTP/3 client falls back to HTTP/2.
- **User space:** congestion control ships with the application, at a CPU cost per byte above kernel TCP that UDP segmentation offloads have narrowed but not removed.

### Under the hood: HTTP/3 on QUIC streams, and QPACK

HTTP/3 (RFC 9114) maps each request to a client-initiated bidirectional QUIC stream carrying HTTP/3 `HEADERS` and `DATA` frames, each a variable-length-integer type and length followed by the payload; the stream's own end replaces `END_STREAM`. Each side also opens unidirectional streams: a **control stream** for `SETTINGS` and `GOAWAY`, and a QPACK **encoder stream** and **decoder stream**.

**QPACK** (RFC 9204) keeps HPACK's static table idea (99 entries) and its dynamic table, but sends dynamic-table insertions on the encoder stream, while header blocks on request streams may reference only entries whose insertion the decoder can see. If a block references an insertion that has not arrived yet, only that one request stream blocks, and the decoder's `SETTINGS_QPACK_BLOCKED_STREAMS` bounds how many may; an encoder that never references unacknowledged entries never blocks, at some compression cost. Implementations choose a point on that trade-off, and many start with a small or empty dynamic table.

## How the version is chosen: ALPN, Alt-Svc and HTTPS records

Nothing in a URL names the protocol version. HTTP/2 is chosen inside the TLS handshake by **ALPN**: the client lists `h2, http/1.1` in its ClientHello and the server picks one. On this machine `curl -v https://example.com/` printed `ALPN: curl offers h2,http/1.1` and `ALPN: server accepted h2`. Browsers speak HTTP/2 only over TLS; cleartext `h2c`, used for the capture above, exists for servers and tools.

HTTP/3 needs UDP, so the client must learn that a server speaks it before trying:

- **Alt-Svc:** a response header on an existing connection, such as `alt-svc: h3=":443"; ma=86400`, meaning "for the next 24 hours you may reach me with h3 on UDP 443". The client tries QUIC on a later connection, usually racing it against TCP so a blocked UDP path costs little.
- **HTTPS DNS records** (RFC 9460) advertise protocols before the first connection. Measured on 28 September 2026, `dig example.com HTTPS` returned `1 . alpn="h2" ipv4hint=104.20.23.154,172.66.147.243 …`: that zone offers HTTP/2 but not HTTP/3, while `cloudflare.com` returned `alpn="h3,h2"`. The curl 8.5.0 build on this machine lacks HTTP/3 support altogether (its `curl -V` feature list has `HTTP2` and no `HTTP3`), a reminder that client support is not universal either.

## When to adopt what

- **Browser to edge:** high RTT, real loss, mobile clients changing address. HTTP/3 wins on each axis, with HTTP/2 as the fallback; you enable it at the CDN or edge proxy and the origin never sees it.
- **Edge to origin and service to service:** sub-millisecond RTT, negligible loss, long-lived connections. HTTP/2 is the right default for multiplexing over few connections and is required by gRPC; HTTP/3 buys little there and costs CPU.
- **Load balancers** terminate the client's protocol and may speak something else to backends. HTTP/3 or HTTP/2 in front with HTTP/1.1 behind is common, and it reintroduces HTTP/1.1's connection limits on the backend leg, where a slow backend now exhausts the proxy's upstream pool. For gRPC the backend leg must be HTTP/2.
- **Undo the HTTP/1.1 workarounds.** Domain sharding splits traffic over several connections, each with its own handshake, slow start and HPACK table; one giant bundle invalidates the whole cached file when one line changes.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| TCP head-of-line blocking on lossy links | Median improves after enabling HTTP/2, p95 on mobile worsens | Latency percentiles split by network type; retransmissions correlate with stalls across all streams | HTTP/3 at the edge for mobile clients |
| Downgrade to HTTP/1.1 at a proxy | gRPC fails with "unexpected HTTP/1.x response" or missing trailers | Proxy's upstream protocol setting; backend logs show HTTP/1.1 requests | Configure HTTP/2 to backends (Envoy `http2_protocol_options`, nginx `grpc_pass`) |
| Default flow-control windows | Long-distance downloads through a proxy cap near 5 Mbit/s per stream with an idle link | Stream window 65,535 bytes against a 100 ms RTT | Raise initial stream and connection windows, or enable window auto-tuning |
| Stream concurrency limit | Requests queue in the client although the server is idle | Peer's MAX_CONCURRENT_STREAMS reached (often 100) | More connections from the client, or a higher server limit |
| Reset floods (Rapid Reset) | Server CPU saturates with requests that never complete | High `RST_STREAM` rate per connection | Patched servers with reset-rate limits; close abusive connections with `GOAWAY` |
| UDP 443 blocked | HTTP/3 never used on some networks, or a slow first connection | QUIC handshakes time out while TCP succeeds | Race QUIC against TCP; keep HTTP/2 as the fallback |

## Trade-offs

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Requests per connection at once | 1 | Many (typically up to 100–250) | Many |
| Header compression | None | HPACK, stateful, needs ordered delivery | QPACK, tolerant of reordering |
| Head-of-line blocking | Per connection, at the HTTP layer | Across all streams, at the TCP layer | Per stream only |
| Setup before the first request | TCP + TLS: 2 RTT | TCP + TLS: 2 RTT | 1 RTT, or 0 with resumption |
| Survives an address change | No | No | Yes |
| Middlebox and tooling support | Universal | Near universal over TLS | Needs UDP 443 and newer tooling |
| CPU per byte | Low | Low | Higher (user space) |

## Interviewer follow-ups

**"Why did HTTP/2 not fix head-of-line blocking?"** Model answer: it fixed it at the HTTP layer by multiplexing streams, but all streams share one TCP byte stream, and TCP must deliver in order, so one lost segment stalls every stream; fixing that needed per-stream delivery in the transport, which is QUIC. Common wrong answer: "HTTP/2 has no head-of-line blocking".

**"Walk me through why the second identical request's headers are six bytes."** Model answer: the first request sent `:authority`, `user-agent` and `accept` as literals with incremental indexing, so both ends added them to the dynamic table at 62 to 64; the second sends one-byte indexed references to those entries and to the static entries for `:method`, `:scheme` and `:path`. Common wrong answer: "HPACK gzips the headers".

**"Why could HTTP/3 not reuse HPACK?"** Model answer: HPACK's dynamic table is updated in the order header blocks are decoded, which requires in-order delivery across all requests; QUIC delivers streams independently, so QPACK moves table updates to a dedicated stream and lets a block that references an unseen entry block only its own stream. Common wrong answer: "QUIC is encrypted, so HPACK cannot see the headers".

**"Should service-to-service traffic inside a data centre move to HTTP/3?"** Model answer: rarely; loss and RTT are tiny, so per-stream recovery and 0-RTT gain little, while user-space QUIC costs more CPU and loses kernel tooling; HTTP/2 with long-lived pooled connections is the usual answer, and gRPC requires it. Common wrong answer: "newer is always faster".

## What mid-level engineers get wrong

- Enabling HTTP/2 and keeping domain sharding and giant bundles, which now cost more than they save.
- Leaving flow-control windows at 64 KiB on proxies that serve distant clients, then blaming the network for slow downloads.
- Assuming the load balancer speaks HTTP/2 to backends because it speaks it to clients.
- Accepting side-effecting requests as 0-RTT early data.
- Treating HTTP/3 as always faster, without a TCP fallback for networks that block UDP.
- Reading an HTTP/2 capture without knowing the frame header, and missing that a stream was reset or a `GOAWAY` was sent.

## Exercises

```exercise
id: hpack-integer
title: HPACK prefix integers
prompt: |
  HPACK (RFC 7541, section 5.1) encodes integers in the low `prefix_bits`
  bits of a first byte, spilling into continuation bytes when they do not
  fit. Return the encoding of the non-negative integer `value` as a list of
  byte values, with the first byte's unused high bits set to 0.

  - If `value < 2**prefix_bits - 1`, it is the only byte.
  - Otherwise the first byte is `2**prefix_bits - 1` (all prefix bits set),
    and `value - (2**prefix_bits - 1)` follows in 7-bit groups, least
    significant first, with 128 added to every byte except the last.
languages: [python, javascript]
entry: hpack_int
starter:
  python: |
    def hpack_int(value, prefix_bits):
        out = []
        # your code here
        return out
  javascript: |
    function hpack_int(value, prefix_bits) {
      const out = [];
      // your code here
      return out;
    }
tests:
  - args: [10, 5]
    expected: [10]
    label: RFC 7541 example C.1.1
  - args: [1337, 5]
    expected: [31, 154, 10]
    label: RFC 7541 example C.1.2
  - args: [42, 8]
    expected: [42]
    label: RFC 7541 example C.1.3
  - args: [31, 5]
    expected: [31, 0]
    label: exactly the prefix limit needs a zero continuation byte
  - args: [64, 7]
    expected: [64]
    hidden: true
    label: the dynamic-table index 64 from the capture
  - args: [128, 7]
    expected: [127, 1]
    hidden: true
  - args: [16384, 4]
    expected: [15, 241, 127]
    hidden: true
hints:
  - "Compare against the limit `2**n - 1` with `<`, not `<=`: a value equal to the limit must use the continuation form."
  - "For the continuation bytes, the same 7-bit loop as a varint: `value % 128 + 128` while `value >= 128`, then the last `value`."
```

```exercise
id: parse-h2-frames
title: Parse HTTP/2 frame headers
prompt: |
  `hex_str` is a sequence of HTTP/2 frames (after the connection preface)
  as lowercase hex. Each frame is a 9-byte header, a 24-bit big-endian
  length, an 8-bit type, 8-bit flags, a 32-bit stream identifier whose top
  (reserved) bit must be ignored, followed by `length` payload bytes.

  Return a list of `[type_name, flags, stream_id, length]` for every
  complete frame, in order. Type names by code: 0 DATA, 1 HEADERS,
  2 PRIORITY, 3 RST_STREAM, 4 SETTINGS, 5 PUSH_PROMISE, 6 PING, 7 GOAWAY,
  8 WINDOW_UPDATE, 9 CONTINUATION; any other code is `"UNKNOWN"`. Stop at
  a trailing frame whose header or payload is incomplete.
languages: [python, javascript]
entry: parse_h2_frames
starter:
  python: |
    def parse_h2_frames(hex_str):
        b = bytes.fromhex(hex_str)
        frames = []
        # your code here
        return frames
  javascript: |
    function parse_h2_frames(hex_str) {
      const frames = [];
      // your code here
      return frames;
    }
tests:
  - args: ["000012040000000000000300000064000400a000000002000000000000040800000000003e7f000100001f0105000000018286418b089d5c0b8170dc6821007f847a8825b650c3cbb6b83f53032a2f2a0000000401000000000000060105000000038286c084bfbe"]
    expected: [["SETTINGS", 0, 0, 18], ["WINDOW_UPDATE", 0, 0, 4], ["HEADERS", 5, 1, 31], ["SETTINGS", 1, 0, 0], ["HEADERS", 5, 3, 6]]
    label: curl's frames from the lesson
  - args: ["0000080600000000000102030405060708"]
    expected: [["PING", 0, 0, 8]]
  - args: [""]
    expected: []
    label: no bytes
  - args: ["000004030000000005000000080000080700000000000000000300000000"]
    expected: [["RST_STREAM", 0, 5, 4], ["GOAWAY", 0, 0, 8]]
    hidden: true
    label: a cancelled stream, then shutdown
  - args: ["000004080080000005000000ff"]
    expected: [["WINDOW_UPDATE", 0, 5, 4]]
    hidden: true
    label: the reserved bit is ignored
  - args: ["0000000a0000000007000008060000000000010203"]
    expected: [["UNKNOWN", 0, 7, 0]]
    hidden: true
    label: an unknown type, then a truncated frame
hints:
  - "Loop while at least 9 bytes remain; read the length, and stop if the payload would run past the end."
  - "Mask the stream identifier with 0x7fffffff. In JavaScript, build it with multiplication so the top byte cannot produce a negative number."
```

## Senior signals

- You explain HTTP/2 as the same semantics with new framing, read a frame header in hex, and know the frame types, stream states, `RST_STREAM` and `GOAWAY`.
- You decode an HPACK block by hand: indexed fields, literals with incremental indexing, the dynamic table growing from index 62, and why the second request costs a few bytes.
- You compute the throughput cap of a flow-control window (65,535 bytes at 100 ms is about 5 Mbit/s) and know clients raise it in their first frames.
- You quantify HTTP/2's TCP head-of-line blocking under loss and explain why QUIC's per-stream delivery fixes it and why that forced QPACK.
- You describe QUIC by its properties (1-RTT and 0-RTT with replay limits, connection migration, encrypted headers, user-space congestion control) and plan a TCP fallback.
- You decide per hop: HTTP/3 on the last mile, HTTP/2 inside, and you check what every proxy speaks to its upstream.

## Check yourself

```quiz
- q: >-
    A mobile app on a lossy cellular link moves from HTTP/1.1 over six connections to HTTP/2 over one. Median latency improves but p95 gets worse. What is the most likely cause?
  options: ["The server is ignoring the HTTP/2 priority tree entirely", "HTTP/2 disables TLS session resumption on each reconnect", "One lost TCP segment now stalls every multiplexed stream", "HPACK decompression is CPU-bound on the phone's processor"]
  answer: 2
  explanation: >-
    All HTTP/2 streams share one ordered TCP byte stream, so a single loss blocks all of them until the retransmission arrives; with six HTTP/1.1 connections a loss stalls only one connection's work. At 1% loss and 100 packets per round trip, about 63% of round trips contain a loss. Priorities, resumption and HPACK cost do not produce this tail.
- q: >-
    Curl's second request on a connection sends the header block 82 86 c0 84 bf be. What does c0 mean?
  options: ["A literal field whose name is index 64 and whose value follows", "A static-table entry for the :authority header's default value", "A Huffman-coded :authority value that is 64 bytes long", "An indexed field: dynamic-table entry 64, the :authority sent earlier"]
  answer: 3
  explanation: >-
    A byte with the top bit set is an indexed representation; the low 7 bits give index 64. Indices above 61 refer to the dynamic table, where the first request's literal :authority was inserted at 62 and pushed to 64 by the two insertions after it. A literal with indexing starts with the bits 01, and the static table holds :authority as a name only.
- q: >-
    A proxy relays downloads to clients 100 ms away over HTTP/2 and never changes the default flow-control windows. Roughly what is the maximum rate of one stream?
  options: ["Unlimited, since HTTP/2 flow control applies only to uploads", "About 50 Mbit/s, since TCP's window grows to fill the path", "About 5 Mbit/s, one 65,535-byte window per round trip", "About 500 Mbit/s, since the connection window is shared"]
  answer: 2
  explanation: >-
    The sender may have at most one stream window of unacknowledged data outstanding: 65,535 bytes x 8 / 0.1 s is about 5.2 Mbit/s, whatever TCP could do underneath. HTTP/2 flow control applies in both directions and to each stream as well as the connection. Clients such as curl raise the stream window to megabytes in their first SETTINGS frame for this reason.
- q: >-
    Your gRPC service behind a new L7 load balancer answers the balancer's health checks but real calls fail with unexpected HTTP/1.x response. What is the probable misconfiguration?
  options: ["The backend has HTTP/2 server push switched on", "The balancer speaks HTTP/1.1 to the backend", "NAT is rewriting QUIC connection IDs in flight", "ALPN is disabled in the gRPC client's TLS stack"]
  answer: 1
  explanation: >-
    gRPC needs HTTP/2 end to end for streams and trailers. Balancers often terminate HTTP/2 from clients and downgrade the backend leg to HTTP/1.1 unless configured otherwise, which plain health checks tolerate and gRPC cannot. The client's ALPN evidently works, since it reaches the balancer.
- q: >-
    Why does HTTP/3 use QPACK instead of HPACK?
  options: ["HPACK cannot compress headers that QUIC has already encrypted", "HPACK depends on TCP's checksum to detect corrupt header blocks", "HPACK needs header blocks decoded in order, which QUIC streams do not provide", "HPACK's static table is too small for HTTP/3's pseudo-headers"]
  answer: 2
  explanation: >-
    HPACK updates its dynamic table as each block is decoded, so both ends must see blocks in the same order, which one TCP stream guarantees. QUIC delivers streams independently, so QPACK sends table insertions on a dedicated stream and lets a block that references a missing entry block only its own request. Compression happens before encryption, and QPACK's larger static table is a refinement, not the reason.
- q: >-
    A server accepts a POST that charges a card as 0-RTT early data on a resumed QUIC connection. What is the risk?
  options: ["The server cannot respond until one full round trip later", "A captured copy can be replayed, charging the card twice", "0-RTT data is sent without encryption over the network", "The connection can no longer migrate between networks"]
  answer: 1
  explanation: >-
    Early data is encrypted with keys from the previous session and carries no fresh contribution from the server, so an attacker who captured it can send it again. Servers accept only idempotent requests as early data and answer others with 425 Too Early so the client retries after the full handshake. Migration and encryption are unaffected.
```

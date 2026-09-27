---
slug: http-2-and-http-3
title: "HTTP/2 and HTTP/3: multiplexing, HPACK and moving the transport into user space"
description: How HTTP/2 frames many streams over one TCP connection, how HPACK shrinks headers to a byte or two, why HTTP/2 makes packet loss worse, and how HTTP/3 over QUIC fixes it.
minutes: 24
difficulty: hard
tags: [http2, http3, quic, hpack, multiplexing, head-of-line-blocking]
problems: []
---
HTTP/1.1's rule of one request per connection forced every workaround you have ever seen in a front-end performance guide: six connections per host, domain sharding, sprite sheets, inlined CSS, concatenated JavaScript bundles. Each of those exists to hide the fact that a page needing 100 resources would otherwise spend 17 round trips waiting in line. HTTP/2 removes the rule. HTTP/3 removes the transport that still enforced a version of it underneath.

Neither changes the *semantics* of HTTP: methods, status codes, headers and caching all mean exactly what they meant before. What changes is the framing, the compression, and, in HTTP/3, the entire transport. That is why adoption is a deployment decision rather than a rewrite, and also why it is easy to adopt HTTP/2 and get nothing from it.

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

The **stream identifier** is the whole idea. A stream is one request/response exchange. Every frame says which stream it belongs to, so frames from different streams can be interleaved on one TCP connection and reassembled at the other end. Client-initiated streams use odd IDs (1, 3, 5, ...); server-initiated ones (push) use even IDs; stream 0 is the connection itself.

The frame **types** you will see in a debugger:

| Type | Purpose |
|---|---|
| `HEADERS` | Opens a stream; carries the compressed request or response headers |
| `DATA` | Body bytes for a stream; `END_STREAM` flag marks the last one |
| `SETTINGS` | Connection parameters, exchanged at start (max concurrent streams, initial window size, header table size) |
| `WINDOW_UPDATE` | Flow-control credit, per stream or for the connection |
| `RST_STREAM` | Cancel one stream without touching the connection |
| `PING` | Liveness and RTT measurement |
| `GOAWAY` | Graceful shutdown: "I will not accept streams above ID N" |
| `PRIORITY` | Dependency and weight hints (largely ignored by modern servers) |
| `PUSH_PROMISE` | Server announces a resource it will push (deprecated in practice) |

The default max frame size is 16 KiB. A 1 MB response is at least 64 `DATA` frames, and between any two of them the server may send frames for other streams. That interleaving is **multiplexing**.

```viz
{"type": "network", "scenario": "http2-multiplexing", "title": "Three requests on one HTTP/2 connection", "caption": "Frames tagged with stream IDs interleave on a single TCP connection, so a slow response no longer blocks the others at the HTTP layer."}
```

`RST_STREAM` is an underrated feature. On HTTP/1.1, cancelling a request means closing the connection and paying a new handshake. On HTTP/2 a client that navigates away can cancel the 30 in-flight image streams with 30 tiny frames and keep the connection warm. gRPC's cancellation and deadline propagation are built on it.

### Flow control

Multiplexing creates a fairness problem: a fast stream could starve the others, and a slow consumer could force the sender to buffer without bound. HTTP/2 therefore has its own credit-based **flow control**, per stream and per connection, on top of TCP's. The initial window is 65,535 bytes; the receiver grants more with `WINDOW_UPDATE`.

This bites in practice. A proxy with a 64 KiB default window and a 100 ms RTT to the client can push at most 64 KiB per RTT per stream, which is 5 Mbit/s, regardless of the link's capacity. This is exactly the bandwidth-delay product argument from [TCP](/learn/networking/fundamentals/tcp-deep-dive), one layer up. gRPC and Envoy expose the initial window as a tunable for that reason; a service streaming large responses over a high-latency link needs it raised.

## HPACK: headers in a byte or two

HTTP/1.1 sends every header, in full ASCII, on every request. A typical browser request carries 500–900 bytes of headers, most of them identical to the previous request (`User-Agent`, `Accept`, cookies). For a request whose response is a 300-byte JSON object, headers are the majority of the bytes, and TCP's slow start means the first few round trips of a connection are limited by byte count.

HPACK compresses headers with three mechanisms:

1. A **static table** of 61 common header/value pairs baked into the spec. `:method: GET` is index 2, `:path: /` is index 4, `:status: 200` is index 8, `accept-encoding: gzip, deflate` is index 16.
2. A **dynamic table**, per direction, per connection, that both ends build identically as headers are sent. Once a header has been sent once, it is referenced by index afterwards.
3. **Huffman coding** of any literal strings, using a static code tuned for header text (about 30 % smaller).

A worked example. The first request on a connection sends `user-agent: Mozilla/5.0 (X11; Linux x86_64) ...` (110 bytes). HPACK encodes it as a literal with incremental indexing: the name `user-agent` is in the static table (index 58), so the name costs one byte; the value is Huffman-coded to roughly 80 bytes; total about 82 bytes, and the pair is added to the dynamic table at index 62. On the *second* request, the same header is encoded as a single **indexed representation**:

```text
1xxxxxxx   with xxxxxxx = 62  ->  0xBE
```

One byte. `:method: GET` from the static table is `0x82`; `:scheme: https` is `0x87`; `:path: /` is `0x84`. A repeat request with a familiar path and an unchanged cookie compresses from 700 bytes to a couple of dozen. Measured on real browser traffic, HPACK cuts request headers by roughly 85–90 %.

The design constraint that a senior engineer should notice: the dynamic table makes header compression *stateful and order-dependent*. Both sides must process `HEADERS` frames in exactly the order sent, or the tables diverge and every subsequent header decodes as garbage. That constraint is fine over TCP, which is ordered, and it is why HTTP/3 needed a different scheme (QPACK, below).

HPACK also fixed a security hole. Compressing headers with a general-purpose algorithm like DEFLATE leaked cookies through compressed length (the CRIME attack). HPACK's table lookups and static Huffman code do not leak length in the same way, and sensitive headers can be marked "never index" so they never enter the dynamic table.

## Priorities and push: two features that did not survive contact

HTTP/2 shipped with a **priority tree**: each stream could declare a parent and a weight, so a browser could say "CSS before images, and images share bandwidth 3:1 with fonts". Servers implemented it inconsistently, CDNs mostly ignored it, and browsers each built a different tree. It was replaced by a much simpler scheme (RFC 9218 Extensible Priorities, an `urgency` value 0–7 and an `incremental` flag sent as a header) that HTTP/3 uses too. If you write a server, honour `priority` headers; if you run one, do not expect the tree to do anything.

**Server push** let a server send `PUSH_PROMISE` for resources it predicted the client would need (push `style.css` alongside `index.html`). In practice the server cannot see the client's cache, so it pushed bytes the browser already had, wasting bandwidth during the most congestion-limited part of the connection. Chrome removed push support in 2022. The replacement is **103 Early Hints**: the server sends `Link: </style.css>; rel=preload` headers before the final response, and the *client* decides whether to fetch. Same latency win, no wasted bytes.

## Where HTTP/2 makes things worse: TCP head-of-line blocking

HTTP/2 solves HOL blocking at the HTTP layer and then walks straight into it one layer down. All streams share one TCP connection, and TCP delivers a strictly ordered byte stream. If one packet is lost, TCP holds back *every* subsequent byte, for *every* stream, until the retransmission arrives, even though the bytes for the other streams are sitting in the receive buffer, complete and undamaged.

```viz
{"type": "network", "scenario": "tcp-retransmit", "title": "One lost segment stalls every HTTP/2 stream", "caption": "TCP cannot hand bytes 2001+ to the application until the retransmitted segment fills the gap, so frames for unrelated streams wait too."}
```

Quantify it. On HTTP/1.1 with six connections, a 1 % packet loss stalls one connection at a time: about a sixth of the in-flight work waits one RTT plus retransmission. On HTTP/2 with one connection, the same loss stalls all of it. Measurements from Google and others found HTTP/2 slower than HTTP/1.1 once loss exceeded roughly 2 %, which is common on cellular and Wi-Fi at the edge of range. In a datacenter with loss well under 0.01 %, the problem is negligible and HTTP/2 is strictly better.

There is a second, subtler cost: a single connection has a single congestion window. Six HTTP/1.1 connections in slow start together grow six times as fast as one HTTP/2 connection. HTTP/2 is more polite to the network and, on a short-lived connection, sometimes slower for it.

The only fix is to stop sharing one ordered byte stream between independent streams. That requires a transport that knows about streams, and TCP cannot be changed (every middlebox on the internet inspects and sometimes rewrites TCP headers). Hence QUIC.

## HTTP/3 and QUIC

QUIC is a transport protocol that runs over UDP in user space (in the browser, in the server process, in the load balancer) and provides what TCP plus TLS provide, plus streams:

| Property | TCP + TLS 1.3 | QUIC |
|---|---|---|
| Runs over | IP, in the kernel | UDP, in user space |
| Streams | none (HTTP/2 adds them above) | native, with independent loss recovery |
| Loss recovery | per connection; blocks everything | per stream; only the stream with the lost packet waits |
| Handshake | 1 RTT TCP + 1 RTT TLS (0 with resumption + TFO, rarely deployed) | 1 RTT combined; 0-RTT for resumed connections |
| Connection identity | 4-tuple (src IP, src port, dst IP, dst port) | connection ID chosen by endpoints |
| Encryption | payload only; headers visible to middleboxes | almost everything, including most transport headers |
| Congestion control | kernel's (Cubic, BBR) | implementation's, upgradable per deploy |

Each property has a consequence worth knowing.

**Independent streams** mean a lost packet only delays the stream(s) whose bytes were in it. Under the 2 % loss that hurt HTTP/2, HTTP/3 keeps the other streams flowing.

**0-RTT** lets a client that has connected before send its first request in the very first packet, along with the handshake. The catch: 0-RTT data can be replayed by an attacker who captures the packet, so servers must only accept idempotent requests in 0-RTT data (GET, not POST), and most deployments reject it for anything with side effects.

**Connection IDs** instead of the 4-tuple give **connection migration**: a phone that moves from Wi-Fi to cellular changes its IP, which kills every TCP connection, but a QUIC connection continues because the server recognises the connection ID. For a video stream or a long-lived API session that is the difference between a stall and nothing.

**Encrypted transport headers** stop middleboxes from ossifying the protocol (the reason TCP could not be extended) and also stop network operators from doing the traffic shaping and "TCP acceleration" some of them do. This is why some corporate and carrier networks block UDP 443, and why every HTTP/3 client falls back to HTTP/2 over TCP if QUIC does not connect.

**User space** means the congestion controller ships with the application. Google deployed BBR to YouTube's QUIC stack without waiting for any kernel. It also means QUIC costs more CPU per byte than TCP (no kernel offloads like TSO/GRO for UDP until recently), which is why some services with datacenter-only traffic deliberately stay on HTTP/2.

### QPACK

HPACK's stateful dynamic table assumes ordered delivery, which QUIC streams do not guarantee *across* streams. QPACK keeps the same ideas but moves table updates onto a dedicated encoder stream and lets header blocks reference only entries the decoder has acknowledged. The trade-off is explicit: a header block that references a not-yet-arrived table entry blocks that one stream (reintroducing a little HOL blocking for headers), or the encoder can avoid dynamic references at some compression cost. Implementations pick a point on that spectrum.

## How the version is chosen: ALPN and Alt-Svc

Nothing in the URL says which version to use. For HTTP/2 the choice is made inside the TLS handshake with **ALPN** (Application-Layer Protocol Negotiation): the client lists `h2, http/1.1` in its ClientHello, the server picks one, and the first bytes after the handshake are already in that protocol. That is the `* ALPN: server accepted h2` line in `curl -v`. Cleartext HTTP/2 (`h2c`) exists but browsers refuse it; in practice HTTP/2 means TLS.

For HTTP/3 the server advertises on an existing connection:

```text
< alt-svc: h3=":443"; ma=86400
```

meaning "for the next 24 hours you may reach me with h3 on UDP 443". The client tries QUIC on its *next* connection and races it against TCP. A DNS `HTTPS` record can advertise h3 up front and skip the first TCP connection.

## When to adopt what

The decision is about where the loss and the latency are.

- **Browser to edge (last mile):** high RTT, non-trivial loss, mobile networks changing address. HTTP/3 wins on every axis; HTTP/2 is the fallback. Every major CDN serves it. You get it by turning it on at the edge; your origin never sees it.
- **Edge to origin, service to service (datacenter):** sub-millisecond RTT, negligible loss, long-lived connections. HTTP/2 is the right choice, mostly for multiplexing over few connections and for gRPC, which requires it. HTTP/3 buys nothing here and costs CPU.
- **Load balancers** terminate the client's protocol and speak whatever they like to backends. The common shape is h3/h2 from the browser to the LB and HTTP/1.1 to a backend pool. That works, but it silently reintroduces HTTP/1.1 connection limits and HOL blocking on the backend leg; if your backend is slow, check whether the proxy is running out of upstream connections. Envoy, nginx and the cloud LBs can all speak h2 to backends when told to.
- **gRPC** needs HTTP/2's streams and trailers. An L7 proxy that downgrades to HTTP/1.1 to the backend breaks it; see [gRPC and protobuf](/learn/networking/application-protocols/grpc-and-protobuf).

The trap to avoid: enabling HTTP/2 and keeping the HTTP/1.1 workarounds. Domain sharding now *hurts*: it splits traffic over several connections, each with its own slow start and its own HPACK table, and defeats prioritisation. Bundling everything into one 2 MB JavaScript file now hurts too, because one changed line invalidates the whole cached bundle where 50 small modules would have invalidated one. Adopting HTTP/2 well means undoing the sharding and letting the multiplexer do its job.

## Senior signals

- You explain HTTP/2 as "same semantics, new framing": stream-tagged binary frames on one connection, and you can name the frame types a debugger shows you.
- You know HPACK's static table, dynamic table and Huffman coding, and why the dynamic table's order dependence forced QPACK for HTTP/3.
- You state the failure mode honestly: HTTP/2 moves head-of-line blocking from HTTP to TCP and gets slower than HTTP/1.1 above roughly 2 % loss.
- You describe QUIC by its properties (independent streams, 0-RTT with replay caveats, connection IDs and migration, user-space congestion control, encrypted headers) and know it falls back to TCP when UDP 443 is blocked.
- You decide per hop: h3 on the last mile, h2 in the datacenter, and you check what the load balancer speaks to the backend.
- You know server push is dead, 103 Early Hints replaced it, and domain sharding is an anti-pattern once h2 is on.

## Check yourself

```quiz
- q: >-
    A mobile app on a lossy cellular link switches from HTTP/1.1 (six connections) to HTTP/2 (one connection) and median latency improves but p95 gets worse. What is the most likely cause?
  options: ["HTTP/2 disables TLS session resumption on reconnect", "One lost TCP segment now stalls every stream", "The server is ignoring the HTTP/2 priority tree", "HPACK decompression is CPU-bound on the phone"]
  answer: 1
  explanation: >-
    All streams share one ordered TCP byte stream, so a single loss blocks all of them until retransmission. With six HTTP/1.1 connections a loss stalls only one. This is the TCP head-of-line blocking that HTTP/3 was built to fix.
- q: >-
    Why can HPACK encode a repeated "user-agent" header in one byte on the second request?
  options: ["The static table lists every common browser user-agent", "Browsers omit user-agent after the first request on it", "Huffman coding shrinks the string to a single symbol", "It was added to the dynamic table, so it is sent by index"]
  answer: 3
  explanation: >-
    The first occurrence is sent as a literal with incremental indexing, which adds it to the per-connection dynamic table both ends maintain. Later occurrences are an indexed representation, a single byte. Huffman coding only shortens literals, and the static table holds only names and a few generic values.
- q: >-
    Your gRPC service behind an L7 load balancer works from the LB's own health checks but real clients get "unexpected HTTP/1.x response" errors. What is the probable misconfiguration?
  options: ["NAT is rewriting the QUIC connection IDs in flight", "The LB speaks HTTP/1.1 to the backend", "ALPN is disabled on the gRPC client's TLS stack", "The backend has HTTP/2 server push switched on"]
  answer: 1
  explanation: >-
    gRPC requires HTTP/2 end to end (streams and trailers). Load balancers commonly terminate HTTP/2 from clients and downgrade to HTTP/1.1 on the backend leg unless configured for h2 upstream, which gRPC cannot use. The client's ALPN is evidently fine, since it reaches the LB.
- q: >-
    A server accepts a POST that charges a card as 0-RTT data on a resumed QUIC connection. What is the risk?
  options: ["The connection can no longer migrate between networks", "0-RTT data is sent unencrypted over the network", "The server cannot respond until one full RTT later", "A captured packet can be replayed, charging twice"]
  answer: 3
  explanation: >-
    0-RTT data is encrypted with keys derived from the previous session and has no fresh server contribution, so an attacker who captured the packet can replay it and charge the card twice. Servers should accept only idempotent requests in 0-RTT or reject early data for side-effecting endpoints.
- q: >-
    After enabling HTTP/2 at the CDN, a team keeps its four asset hostnames (img1..img4) for parallelism. What is the effect?
  options: ["HTTP/2 is disabled, since shards cannot share a cert", "Better throughput from four separate congestion windows", "Worse: four handshakes, slow starts and HPACK tables", "No effect, because the CDN merges the hostnames"]
  answer: 2
  explanation: >-
    Domain sharding was a workaround for the one-request-per-connection rule. Under HTTP/2 a single connection multiplexes everything, so sharding only adds setup cost, splits compression state and makes prioritisation across connections impossible. The extra congestion windows are a marginal, short-lived benefit that does not outweigh this.
```

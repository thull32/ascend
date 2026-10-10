---
lesson: http-2-and-http-3
source: 3d75088438dd447a
fit: partial
desk:
  - "The frame header layout, and the captured connection read frame by frame"
  - "The HPACK header blocks decoded byte by byte, with the dynamic table after each"
  - "The flow-control window table and the head-of-line loss arithmetic"
  - "Exercises: HPACK prefix integers, and parsing HTTP/2 frame headers"
---
## Introduction

HTTP 1.1's rule of one request at a time per connection forced every workaround in a front-end performance guide: six connections per host, domain sharding, sprite sheets, inlined CSS, concatenated JavaScript bundles. A page needing 100 resources over six connections spends about 17 serial round trips waiting in line. HTTP 2 removes the rule. HTTP 3 removes the transport that still enforced a version of it underneath.

Then the tickets arrive. A team turns on HTTP 2 at its edge, and median page latency falls by a fifth. Then the mobile team reports that the 95th percentile on cellular networks is worse than before. Another team puts its gRPC services behind a new layer 7 load balancer, and every call fails with an error about an unexpected HTTP 1 response.

Neither protocol changes what HTTP means. Methods, status codes, headers and caching are the same. What changes is framing, header compression, and in HTTP 3 the whole transport, and each change has a failure mode. Four ideas: streams, header compression, the head-of-line blocking that HTTP 2 inherits from TCP, and what QUIC does about it.

## Frames and streams

HTTP 1.1 finds the end of a message by reading text. HTTP 2 puts everything in binary frames, each with a 9-byte header: a length, a type, some flags, and a stream identifier.

The stream identifier is the whole idea. A stream is one request and its response. Every frame names its stream, so frames from different streams interleave on one TCP connection and are reassembled at the other end. Streams the client opens use odd numbers, the server's use even numbers, and stream zero is the connection itself. The default maximum frame payload is 16 kilobytes, so a 1-megabyte response is at least 64 data frames, and between any two of them the server may send frames for other streams. That interleaving is multiplexing.

A few frame types matter in production. HEADERS opens a stream. DATA carries the body. SETTINGS negotiates connection parameters, such as how many streams may be open at once. Curl advertised 100, and servers commonly advertise 100 to 250. A reset frame cancels one stream and leaves the connection up. And GOAWAY is graceful shutdown: it carries the highest stream number the sender will process, so a draining server finishes in-flight streams, and the client retries the rest on a new connection, knowing which ones were never touched.

Cheap cancellation is a real win. On HTTP 1.1, cancelling a request means closing the connection and paying for a new handshake. On HTTP 2, a browser that navigates away cancels 30 image streams with 30 small reset frames and keeps the connection warm. gRPC's deadlines and cancellation are built on it.

It also created a vulnerability. In October 2023, Google, Cloudflare and AWS disclosed Rapid Reset. Clients opened streams and reset them immediately, so each stream cost the server work without ever counting against the concurrency limit. Google reported a peak above 398 million requests a second. Servers were patched to count and bound resets per connection, and to close connections that exceed them.

## Flow control

Multiplexing creates a fairness problem: one fast stream could starve the others, and a slow consumer could force the sender to buffer without limit. So HTTP 2 has its own credit-based flow control, per stream and per connection, above TCP's. Each receiver starts with a window of 65,535 bytes. Every data byte uses up window, and a window update frame hands credit back.

Here is the number to remember. A window bounds throughput exactly as TCP's receive window does: the window divided by the round trip. With the default of about 64 kilobytes and a 100-millisecond round trip, one stream tops out at about 5 megabits a second, however fast the link is. With a 10-mebibyte window, the same path allows about 839 megabits.

That is why curl raises its stream window to 10 mebibytes before it sends its first request. And it is why a proxy left at the defaults caps every long-distance download at about 5 megabits a second, while the team blames the network. The receiver has a duty too: hand credit back promptly as the application reads. One that forgets stalls the stream with a full window and an idle network.

## Header compression

HTTP 1.1 sends every header in full on every request, 500 to 900 bytes from a browser, most of it identical to the previous request. HPACK compresses headers three ways. A static table of 61 common fields, so the method GET is simply index 2. A dynamic table per connection, which both ends build identically as new headers are sent. And Huffman coding for literal strings.

Picture it with curl's real capture. The first request sends the method, the scheme and the path as single bytes pointing into the static table. It sends the authority, the user agent and the accept header as literals, and both ends add those three to the dynamic table, at entries 62, 63 and 64. That first header block is 31 bytes.

Now the second, identical request. How many bytes of headers does it cost?

[pause]

Six. One byte each: three references to the static table and three to the dynamic table. The same request written as HTTP 1.1 text is 76 bytes, so that is a 92 percent reduction, and a cookie repeated on every request collapses the same way. The wrong answer in an interview is that HPACK gzips the headers. It does not. General-purpose compression of headers leaked cookies through compressed lengths, the CRIME attack, so HPACK only matches whole header fields, and sensitive fields can be sent marked never to be indexed.

The dynamic table has one big consequence. Decoding is stateful and order-dependent: both ends must process header blocks in exactly the order they were sent. TCP guarantees that. QUIC does not. Hold onto that.

Two features of HTTP 2 did not survive. The priority tree, where every stream declared a parent and a weight, was implemented inconsistently and mostly ignored, and a simpler urgency value from 0 to 7 replaced it. Server push let a server send resources it predicted the browser would need, but the server cannot see the browser's cache, so it pushed bytes the browser already had, during the first, congestion-limited round trips. Chrome turned it off by default in 2022. The replacement is 103 Early Hints: an early interim response that says "you will probably want this stylesheet", and the client decides.

## TCP head-of-line blocking

Now the mobile ticket. HTTP 2 removes head-of-line blocking at the HTTP layer, and inherits it from TCP. All streams share one ordered byte stream. A lost segment holds back every later byte, for every stream, until the retransmission arrives, even though other streams' frames are sitting complete in the receive buffer.

Put numbers on it. A connection carries 100 packets per round trip for 10 equally busy streams, with 1 percent loss. About 63 percent of round trips contain at least one loss, and over HTTP 2 every one of those stalls all 10 streams. If each stream were delivered independently, a given stream would stall in about a tenth of round trips instead of nearly two thirds. Six HTTP 1.1 connections sit in between, since a loss stalls only one connection's work. Daniel Stenberg's HTTP 3 explained reports tests in which HTTP 1.1 users were usually better off than HTTP 2 users at 2 percent packet loss, a rate that cellular and marginal Wi-Fi links can reach. Inside a data centre, with loss far below a hundredth of a percent, the effect is negligible and HTTP 2's single connection is a pure win.

There is one more cost: one connection means one congestion window, so six HTTP 1.1 connections in slow start grow six times as fast as one HTTP 2 connection.

The fix is a transport that knows about streams, and TCP cannot realistically be changed, because kernels and middleboxes everywhere implement and inspect it. Hence QUIC.

## HTTP 3 and QUIC

QUIC runs over UDP, in user space: in the browser, the server process or the load balancer. It provides what TCP plus TLS provide, plus streams with independent loss recovery. Under that same 1 percent loss, each stream stalls in about 10 percent of round trips rather than 63.

Four more properties. First, the handshake is one round trip combined, instead of one for TCP and one for TLS, and zero round trips on resumption. That early data can be replayed by an attacker who captured it, so servers accept only idempotent requests that way and answer anything else with 425, Too Early. A POST that charges a card, accepted as early data, could be replayed and charge it twice. Second, connection migration. A phone moving from Wi-Fi to cellular changes address, which kills every TCP connection, but a QUIC connection continues, because the server recognises its connection ID. Third, almost everything is encrypted, including packet numbers. That stops middleboxes from ossifying QUIC, and it is one reason some networks block UDP port 443, so every HTTP 3 client needs a fallback to HTTP 2. Fourth, congestion control ships with the application, at a higher CPU cost per byte than kernel TCP.

Remember the ordering problem. HPACK's dynamic table needs header blocks decoded in order across all requests, and QUIC delivers streams independently. So HTTP 3 uses QPACK instead. Table insertions travel on their own dedicated stream, and a header block that references an entry that has not arrived yet blocks only its own request stream.

How does a client know which version to speak? Nothing in a URL says. HTTP 2 is chosen inside the TLS handshake by ALPN: the client offers h2 and HTTP 1.1, and the server picks one. HTTP 3 needs UDP, so the client must learn about it first: from an Alt-Svc header on an existing connection, or from an HTTPS record in DNS before the first one. Clients usually race QUIC against TCP, so a blocked UDP path costs little.

## In the interview

When to adopt what. Browser to edge means long round trips, real loss, and phones changing networks: HTTP 3 wins on each, with HTTP 2 as the fallback, and you enable it at the CDN or edge proxy so the origin never sees it. Inside the data centre is a different world.

So: should service-to-service traffic inside a data centre move to HTTP 3?

[pause]

Rarely. Loss and round trips are tiny, so per-stream recovery and zero round-trip resumption gain little, while user-space QUIC costs more CPU and loses kernel tooling. HTTP 2 with long-lived pooled connections is the usual answer, and gRPC requires it. The wrong answer is that newer is always faster. And check what every proxy speaks to its upstream. A load balancer that takes HTTP 2 from clients and speaks HTTP 1.1 to the backends is exactly the gRPC failure from the start.

## Recap

Five things. HTTP 2 keeps HTTP's meaning and changes the framing: binary frames tagged by stream, so requests interleave on one connection, cancel cheaply and shut down gracefully. A flow-control window caps a stream at window over round trip, so the 64-kilobyte default is about 5 megabits a second at 100 milliseconds. HPACK's tables shrink a repeated request's headers to six bytes, but need in-order decoding. HTTP 2 inherits head-of-line blocking from TCP, so on lossy links one loss stalls every stream, and QUIC fixes that with per-stream delivery, which in turn forced QPACK. And decide per hop: HTTP 3 on the last mile, HTTP 2 inside, with a TCP fallback.

At your desk: the captured connection frame by frame, the HPACK blocks decoded byte by byte, the window and loss arithmetic, and the two exercises on HPACK integers and frame headers.

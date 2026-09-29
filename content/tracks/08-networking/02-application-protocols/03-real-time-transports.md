---
slug: real-time-transports
title: "Real-time transports: long polling, SSE, WebSockets and WebRTC"
description: "How to push data to a browser without it asking: polling and long polling priced per client, the text/event-stream format and a spec-exact parser, WebSocket upgrade and frames byte by byte, WebTransport over HTTP/3, measured memory and keep-alive cost per held connection, what proxies do to each, WebRTC in brief, and why this app streams AI replies over SSE."
minutes: 50
difficulty: medium
tags: [sse, websockets, long-polling, webtransport, webrtc, streaming, real-time]
problems: []
---
HTTP is request-response: the client asks, the server answers, and the server has no way to say anything unprompted. That is fine for loading a page and useless for a chat message, a live price, a build log, or a language model producing a reply one token at a time. Every real-time feature is a workaround for that missing capability, and there are exactly four workarounds in wide use: polling, long polling, Server-Sent Events and WebSockets, plus WebRTC for the peer-to-peer media case.

The choice is usually made by whoever built the first prototype and then never revisited. It should be made by answering one question: **which direction does the data flow, and how often?** Server-to-client only, a few events a second, is a different problem from bidirectional, thousands of messages a second, and the transports that fit are different too.

## Polling and long polling: making request-response pretend

Plain polling sends `GET /messages?since=...` every N seconds. The cost is arithmetic. With 100,000 connected clients polling every 2 s, the server handles 50,000 requests per second, almost all of which return "nothing new". Latency is on average N/2 plus an RTT, so 1 s plus network for a 2 s interval. Halving the latency doubles the load. There is no setting of N that is both cheap and responsive.

**Long polling** fixes the wasted requests by having the server *hold* the request until it has something to say or a timeout expires (typically 20–30 s, safely under the timeouts of intermediate proxies). The client then immediately sends the next request.

```text
> GET /messages?since=8812 HTTP/1.1
  ... server holds the connection for up to 25 s ...
< HTTP/1.1 200 OK
< Content-Type: application/json
<
{"events":[{"id":8813,"text":"hi"}]}
> GET /messages?since=8813 HTTP/1.1
  ... holds again ...
```

Latency is now one RTT after the event, and idle clients cost a parked connection rather than a request stream. The remaining costs are structural:

- Every event costs a full request/response cycle with headers, plus the gap between the response arriving and the next request being sent. During that gap (one RTT), events queue on the server. Two events 10 ms apart on a 100 ms RTT link are delivered 100 ms apart.
- A held connection is a held HTTP/1.1 connection, one of the browser's six per host.
- The server must remember which events a reconnecting client already has (the `since` cursor), or it will drop or duplicate events.

Long polling is the transport of last resort: it works through every proxy ever built, because it is indistinguishable from a slow request. Use it as a fallback, not a design.

```viz
{"type": "network", "scenario": "long-polling-vs-sse", "title": "Long polling versus Server-Sent Events", "caption": "Long polling pays a request per event and leaves a gap between response and re-request. SSE holds one response open and streams events through it."}
```

## What a held connection costs

Every push transport except polling holds a connection open per client, so the capacity question becomes "what does one idle connection cost, and what does keeping it alive cost?". Three numbers, two of them measured on this machine:

- **Memory.** A Python `asyncio` server holding 3,000 idle loopback connections (with the client sockets in the same process) grew by 19 MB of resident memory, about 6.4 KB per connection counting both ends; the kernel's TCP buffer memory for all 6,000 sockets was under 4 MB (`/proc/net/sockstat`), because buffers are allocated as data arrives. Runtimes differ (a goroutine starts with a few KB of stack, a thread-per-connection server reserves megabytes of virtual stack per thread), and TLS adds its own per-connection state, but the order of magnitude for an async server is kilobytes to tens of kilobytes per idle client. A million held connections is gigabytes of RAM and a million file descriptors, which is why push servers raise `ulimit -n` (1,048,576 here) and shard clients across instances.
- **Keep-alive traffic.** A connection that carries no bytes is closed by some idle timer on the path (a load balancer at 60 s, a NAT at 350 s or less), so push servers send heartbeats. This app sends an SSE comment every 15 s. A comment is 8 bytes of text, but wrapped in a TLS record (22 bytes) and TCP/IP headers (52 or more) it costs roughly 100 bytes on the wire plus an ACK. At a million clients that is 1,000,000 / 15 ≈ 66,700 heartbeats per second, about 53 Mbit/s and 130,000 packets per second before any real event is sent.
- **Polling, for comparison.** 100,000 clients polling every 2 s is 50,000 requests per second; with 700 bytes of request headers (cookies included) and 300 of response headers, that is about 400 Mbit/s of headers to say "nothing new", and the average delay is still a second.

## Server-Sent Events: one response that never ends

SSE is the observation that HTTP already lets a server stream a response body for as long as it likes. Make the body a stream of events, agree a trivial text format, and give the browser a built-in client (`EventSource`) that parses it and reconnects automatically. It is server-to-client only, and it is plain HTTP.

The response looks like this:

```text
< HTTP/1.1 200 OK
< Content-Type: text/event-stream
< Cache-Control: no-cache
< Connection: keep-alive
<
event: delta
data: The bandwidth-delay

event: delta
data:  product is

id: 41
event: delta
data:  RTT times bandwidth.

: ping

event: done
data: {"input_tokens":812,"output_tokens":146,"stop_reason":"end_turn"}

```

The format is lines of `field: value`, and a blank line ends an event. `data:` is the payload (multiple `data:` lines are joined with newlines); `event:` names the event type so the client can dispatch on it; `id:` sets the last-event ID; `retry:` tells the client how long to wait before reconnecting, in milliseconds. A line starting with `:` is a comment and is ignored by the parser, which makes it the standard keep-alive mechanism.

The parsing rules are exact, and hand-written parsers get them wrong: a line may end in LF, CRLF or a lone CR; a field value loses one leading space (`data:  product is` carries " product is"); a line with no colon is a field name with an empty value; `id` persists across events until changed; an event with no `data` lines is not dispatched; and an event that is not terminated by a blank line when the stream ends is discarded. The first exercise implements exactly these rules.

Three properties make SSE the right default for server push:

**Reconnection is built in and resumable.** If the connection drops, `EventSource` reconnects on its own (after `retry` ms, default a few seconds) and sends the header `Last-Event-ID: 41`. The server can resume from event 42. You get at-least-once delivery for free if your event IDs are meaningful.

**It is plain HTTP.** Every load balancer, CDN, WAF, corporate proxy and service mesh that can pass a slow HTTP response can pass SSE. It uses the same TLS, the same auth cookies, the same CORS rules and the same HTTP/2 multiplexing as the rest of the API. There is no upgrade, no second protocol, no special port.

**The server side is trivial.** A handler that writes to a response body and flushes after each event is an SSE server. Compare the WebSocket state machine below.

The caveats:

- It is one-directional. Client-to-server messages go over ordinary requests, which is fine for "send a chat message" and wrong for "stream microphone audio".
- It is text. Binary payloads must be base64-encoded (33 % overhead) or use a different transport.
- Over HTTP/1.1 an open SSE stream consumes one of the browser's six connections per host. Two tabs each with three streams exhaust the budget and the seventh request hangs. Over HTTP/2 this disappears, since streams multiplex on one connection; serve SSE over HTTP/2 and this caveat is gone.
- Intermediaries that *buffer* responses (some proxies, compression middleware, nginx with `proxy_buffering on`) will hold events until the buffer fills. Send `X-Accel-Buffering: no` for nginx, disable response compression for the stream, and confirm with `curl -N` that events arrive as they are produced.

### Under the hood: how this app streams AI replies

Ascend's assistant replies are streamed to your browser over SSE. The route lives in `crates/api/src/routes/sse.rs` and is short enough to read as a design document.

```rust
pub fn respond(rx: mpsc::Receiver<StreamEvent>) -> impl IntoResponse {
    let stream = ReceiverStream::new(rx).map(|ev| {
        let event = match ev {
            StreamEvent::Delta(text) => Event::default().event("delta").data(text),
            StreamEvent::Done { usage, stop_reason } => Event::default().event("done").data(
                serde_json::json!({
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "stop_reason": stop_reason,
                })
                .to_string(),
            ),
            StreamEvent::Error(msg) => Event::default().event("error").data(msg),
        };
        Ok::<_, Infallible>(event)
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)).text("ping"))
}
```

Four decisions in that function map directly onto the properties above.

1. **Named events.** `delta` carries a text fragment, `done` carries a JSON usage summary with `input_tokens`, `output_tokens` and `stop_reason`, and `error` carries a short message written by the app ("The reply was interrupted. Try again."), never the provider's own error text, which is logged instead. The client dispatches on the event name and never has to sniff payloads. That client is not `EventSource`, though: `EventSource` can only send a GET, and each turn is a POST with a JSON body, so `web/src/lib/api.ts` reads the response with `fetch` and a short hand-written parser (split lines, skip `:` comments, collect `event:` and `data:`, dispatch on a blank line).
2. **A 15-second keep-alive comment** (`: ping`). Idle-timeout proxies and load balancers close connections that carry no bytes for 30, 60 or 90 s. A model that is thinking for 40 s before its first token would look idle. The comment line keeps bytes flowing and is invisible to any conforming parser, `EventSource` or the app's own.
3. **Persistence is decoupled from the connection.** The model stream runs in a task spawned on the app's `TaskTracker` (`state.tasks.spawn`) that owns writing the reply to the database; the HTTP response is only a consumer of a bounded `mpsc` channel (capacity 64). If you close the tab, the `Sender` sees a closed receiver, ignores the send error, and keeps consuming the model stream, so the full reply is still persisted and the call's budget hold, taken before the stream started, is settled with the tokens actually used. Reload and the reply is there. Because that task outlives the request, the route wraps it in `.instrument(tracing::Span::current())`, so its log lines still carry the request's span and request ID. The alternative, driving the model from the request handler, would abort the model call on disconnect and lose the reply. The tracker matters at shutdown, which `crates/api/src/serve.rs` bounds in two stages to fit Railway's 60-second drain window: on SIGTERM the server stops accepting connections and gives open ones up to 25 s to finish (idle keep-alive connections close at once, and a stream whose reader has stalled would otherwise hold the process forever), then `finish_tasks` waits up to 30 s for tracked tasks to finish persisting. The first version used a bare `tokio::spawn`: draining connections does not wait for a task whose browser has already gone, so a deploy could exit mid-generation and lose exactly the reply this design exists to save. `crates/api/tests/shutdown.rs` pins each behaviour over real sockets: an in-flight request finishes while new connections are refused, an idle keep-alive connection does not delay shutdown, a stalled stream is abandoned at the drain timeout, and a background task gets to finish while a hung one cannot hold the process.
4. **Bounded buffering.** The channel holds 64 events. If the browser stops reading (throttled background tab), the producer blocks on send rather than growing memory without bound: backpressure, not a leak.

Two further details show where the edges are. The router wraps every request in a 240-second `TimeoutLayer`; in `tower-http` 0.7 that middleware races only the handler's future, which resolves as soon as the response head is ready, so it does not cut a long streamed reply off at 240 s. And the client parser once split lines on `\n` only, stripping a trailing `\r`. That covered every line axum *ends*, but axum also starts a new `data:` line after a carriage return inside a payload, so a delta containing `\r` reached the browser with a stray `data: ` in the text. Reviewing this lesson against the axum source found it; the parser now lives in `web/src/lib/sse.ts`, treats CRLF, LF and a lone CR as line ends, holds a CR that ends a chunk until it knows whether an LF follows, and is tested with axum's own encoder output split at every byte offset.

Why SSE rather than WebSockets here: the data flows one way (model to browser), the client's only upstream message is the initial prompt, which is an ordinary POST; the stream must pass through the same TLS-terminating proxy and mesh as every other request with no special configuration (the app's own `CompressionLayer` from `tower-http` skips `text/event-stream` by default, so it does not hold events back); and a flaky mobile connection that drops mid-reply loses nothing, because the reply is persisted server-side and appears on reload. The app does not resume streams with `Last-Event-ID`: its events carry no IDs, and a `fetch`-based POST does not reconnect by itself. Event IDs plus a GET endpoint that replays from one would be the upgrade if mid-reply drops became common. A WebSocket would add a second protocol, a second set of proxy rules and a hand-written reconnect loop to gain bidirectionality nobody uses.

## WebSockets: a full-duplex socket that starts as HTTP

When the client needs to send as often as it receives, at low latency, with small messages (multiplayer game state, collaborative editing cursors, a trading terminal), SSE plus POSTs is a poor fit: each upstream message pays HTTP headers and a request cycle. WebSockets give you a raw bidirectional message stream over one TCP connection, bootstrapped with an HTTP request so it can traverse port 443 and reuse TLS.

### The upgrade

```text
> GET /ws HTTP/1.1
> Host: app.example.com
> Upgrade: websocket
> Connection: Upgrade
> Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
> Sec-WebSocket-Version: 13
>
< HTTP/1.1 101 Switching Protocols
< Upgrade: websocket
< Connection: Upgrade
< Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`Sec-WebSocket-Accept` is `base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`. The magic GUID is not security; it proves that the server actually understands WebSockets rather than being an HTTP cache that happened to echo the headers. After the 101, the TCP connection no longer carries HTTP at all: both sides send **frames**.

```viz
{"type": "network", "scenario": "websocket-upgrade", "title": "HTTP request upgraded to a WebSocket", "caption": "One HTTP round trip negotiates the switch; afterwards the same TCP connection carries framed messages in both directions with no headers per message."}
```

### Frames, byte by byte

After the 101, every message is one or more frames. RFC 6455's own example sends the text "Hello" (`48 65 6c 6c 6f`) from a client with the masking key `37 fa 21 3d`:

```text
81 85 37 fa 21 3d 7f 9f 4d 51 58
```

| Bytes | Bits | Meaning |
|---|---|---|
| `81` | `1000 0001` | FIN = 1 (last fragment), three reserved bits 0, opcode 1 = text |
| `85` | `1000 0101` | MASK = 1, payload length 5 |
| `37 fa 21 3d` | | The 4-byte masking key, chosen randomly per frame by the client |
| `7f 9f 4d 51 58` | | Payload XOR key: `48^37=7f`, `65^fa=9f`, `6c^21=4d`, `6c^3d=51`, `6f^37=58` (the key repeats every 4 bytes) |

The same message from a server is `81 05 48 65 6c 6c 6f`: no mask bit, no key. Lengths 0 to 125 fit in the 7-bit field; 126 means "the next 2 bytes are the length" and 127 means "the next 8 bytes are". Opcodes are 0 (continuation), 1 (text), 2 (binary), 8 (close), 9 (ping) and 10 (pong). A 20-byte message therefore costs 22 bytes from the server or 26 from the client, against roughly a kilobyte of headers for a long-poll round trip. The second exercise encodes frames.

Client-to-server frames are **masked** with a random 4-byte XOR key. This is not encryption. It defends against a cache-poisoning attack in which a malicious page crafted WebSocket payloads that looked like HTTP requests to a badly written intermediary proxy; masking guarantees the bytes on the wire are unpredictable to the page author. It is a good illustration of protocols being shaped by the worst proxies in existence.

**Ping/pong** frames are the liveness mechanism. TCP alone cannot tell you a peer is gone until you try to send and the retransmissions time out (minutes). A server that pings every 30 s and drops connections without a pong within 10 s finds dead clients in 40 s and stops holding memory for phones that lost signal. NAT and proxy idle timeouts also close silent connections; a ping interval under the shortest such timeout (commonly 60 s) keeps the mapping alive.

### What WebSockets cost you

- **Proxy support is uneven.** Every hop must understand the upgrade and then pass bytes blindly. Most modern L7 proxies do; some corporate proxies, older WAFs and some serverless platforms do not. Always deploy on port 443 with TLS (`wss://`), which hides the frames from middleboxes that would otherwise mangle them.
- **No HTTP semantics after the upgrade.** No status codes, no caching, no compression unless negotiated (`permessage-deflate`), no CORS (the `Origin` header on the upgrade is the only check; verify it server-side or any site can open sockets to you with the user's cookies).
- **Reconnection is yours to write.** `WebSocket` in the browser does not reconnect. You write the backoff, the resume protocol, the "which messages did I miss" logic that SSE gave you for free.
- **Stateful servers.** A WebSocket pins a client to one server process for its lifetime. Deploys, autoscaling and load-balancer rebalancing become visible as mass reconnects. Fan-out across servers needs a pub/sub layer (Redis, NATS, Kafka) because the message for user A may originate on a server A is not connected to.
- **HTTP/2 and HTTP/3** support exists (RFC 8441 tunnels a WebSocket inside an h2 stream) but is less widely deployed than SSE-over-h2.

## WebTransport: streams and datagrams over HTTP/3

WebSockets inherit TCP's head-of-line blocking: one lost packet stalls every message behind it, which hurts a game or live-collaboration client on a lossy mobile link. **WebTransport** is the HTTP/3-era answer. The browser opens a session with an extended `CONNECT` request on an HTTP/3 connection, and then gets three primitives over QUIC:

- **Bidirectional and unidirectional streams**, each independently ordered and reliable, so a loss stalls only the stream it hit ([UDP versus TCP](/learn/networking/fundamentals/udp-vs-tcp) covers QUIC's streams).
- **Datagrams** (HTTP Datagrams, RFC 9297): unreliable, unordered messages that are never retransmitted, the right shape for "the player's latest position".
- **The HTTP/3 connection's handshake**, TLS 1.3 and congestion control, so there is no separate security or signalling layer as in WebRTC.

The costs are maturity and reach: it needs an HTTP/3 server and every proxy on the path to support it, networks that block UDP need a WebSocket fallback, and browser support arrived in Chrome 97 in January 2022 and Firefox 114 in June 2023, while Safari waited until 26.4 in March 2026 (per [MDN's compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/WebTransport.json)), so older Apple devices still lack it. Treat it as an optimisation for clients that have it, not a replacement.

## WebRTC: when the data is media or must not go through your server

WebRTC is for peer-to-peer audio, video and arbitrary data between browsers (or a browser and a media server), with latency targets in the tens of milliseconds that TCP-based transports cannot meet under loss. It is a stack, not a protocol:

- **Signalling** is unspecified: you use your own channel (typically a WebSocket) to exchange session descriptions (SDP) and candidate addresses.
- **ICE** gathers candidate address pairs: the local IP, a **STUN**-discovered public IP (the server tells the client what address its NAT presents), and as a last resort a **TURN** relay when both peers are behind NATs that block direct traffic. The relayed share is a minority of sessions that grows on corporate networks and carrier-grade NAT, and TURN bandwidth is the main operating cost of a WebRTC product. [NAT, firewalls and cloud networking](/learn/networking/fundamentals/nat-firewalls-and-cloud-networking) traces ICE's checks and why symmetric NATs force the relay.
- **DTLS** performs the key exchange over UDP, and **SRTP** encrypts the media. **SCTP over DTLS** carries **data channels**, which can be configured reliable-and-ordered (like TCP) or unreliable-and-unordered (like UDP), per channel.

The rule of thumb: if the payload is audio or video, or you need sub-100 ms delivery of small messages between peers and can tolerate loss, WebRTC. Otherwise it is over-engineered, and the signalling server you build for it is usually a WebSocket server anyway.

## Choosing

| Need | Pick | Reason |
|---|---|---|
| Notifications, feeds, progress, token streaming | SSE | Server-to-client, plain HTTP, resumable, trivial server |
| Chat with typing indicators, collaborative editing, games | WebSockets | Frequent small messages both ways, low per-message overhead |
| Must work through any proxy, cannot control infrastructure | Long polling | Looks like ordinary requests |
| Voice, video, peer-to-peer data | WebRTC | UDP media path, NAT traversal, encryption built in |
| Service-to-service streaming | gRPC streams | HTTP/2 streams with typed messages; see [gRPC](/learn/networking/application-protocols/grpc-and-protobuf) |

Whichever you choose, the delivery guarantees are yours to design. None of these transports guarantee that a message sent is a message received; a connection can drop between the server's write and the client's read. Number your events, resume from the last acknowledged one, and make handlers idempotent. The [idempotency lesson](/learn/system-design/building-blocks/idempotency-and-retries) is the other half of this one.

## Trade-offs

| | Long polling | SSE | WebSocket | WebTransport |
|---|---|---|---|---|
| Direction | Server to client (client sends normal requests) | Server to client | Both | Both, plus unreliable datagrams |
| Overhead per server message | A full HTTP response and a new request | A few bytes of field names | 2–10 bytes of frame header | QUIC stream or datagram framing |
| Passes proxies, CDNs, meshes | Everywhere | Anywhere that streams HTTP | Needs upgrade support on every hop | Needs HTTP/3 on every hop |
| Reconnect and resume | Cursor in the URL | Built into `EventSource` (`Last-Event-ID`) | Yours to write | Yours to write |
| Head-of-line blocking | Per request | Per TCP connection (per stream on h2 only at the HTTP layer) | Per TCP connection | Per stream; none for datagrams |
| Binary payloads | Yes | No (text; base64 costs 33%) | Yes | Yes |

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Buffering intermediary | Events arrive all at once when the stream ends | `curl -N` straight to the origin streams; through the proxy it does not | Disable proxy buffering for the route (`X-Accel-Buffering: no`), exclude `text/event-stream` from compression |
| Idle timeout on the path | Streams or sockets die after exactly 60 s (or 350 s) of quiet | Disconnect times cluster at one value; no heartbeat traffic in captures | Heartbeats below the shortest idle timer (15 s here), or raise the balancer's timeout |
| HTTP/1.1 connection cap | The seventh request to the same host hangs while two tabs are open | Browser devtools show requests queued on connection limit | Serve SSE over HTTP/2 or HTTP/3; share one stream per tab |
| Reconnect storm after deploy | Every client reconnects within a second; login and history endpoints overload | Connection graph drops to zero and spikes back on each deploy | Jittered exponential backoff on the client, drain servers gradually, resume from cursors rather than refetching history |
| Cross-site WebSocket hijacking | Another site's page opens sockets with your users' cookies | Server accepts upgrades without checking `Origin` | Verify `Origin` on upgrade; authenticate with a token, not only a cookie |
| Slow consumer | Server memory grows with a few throttled clients | Per-connection queues unbounded | Bounded queues with a drop or disconnect policy, as the app's 64-slot channel does |

## Interviewer follow-ups

**"You need to push notifications to 5 million connected users. How many servers and what do you watch?"** Model answer: size by memory per held connection (tens of KB each including TLS), file descriptors and heartbeat packets per second rather than by requests; at 5 million clients and a 30 s heartbeat that is about 170,000 heartbeats a second fleet-wide. Fan out through a pub/sub layer, shard users across servers, and plan deploys as rolling drains with jittered reconnects. Common wrong answer: "one server per 10,000 requests per second", which ignores that idle connections, not requests, are the load.

**"SSE or WebSocket for a chat app?"** Model answer: either works; SSE plus POST for sending is simpler to operate and passes every proxy, and a WebSocket wins when clients send often (typing indicators, presence) enough that per-message HTTP overhead matters. Common wrong answer: "WebSocket, because it is real-time", as if SSE were not.

**"How does SSE resume after a dropped connection, and what must the server do?"** Model answer: `EventSource` reconnects after the `retry` interval and sends `Last-Event-ID`; the server must keep enough recent events, keyed by ID, to replay from that point, or send a snapshot. Clients built on `fetch`, like this app's, get neither behaviour for free. Common wrong answer: "the browser buffers missed events".

**"Why are WebSocket client frames masked but server frames not?"** Model answer: masking stops a malicious page from choosing the exact bytes that reach a broken intermediary, which could otherwise be tricked into treating them as an HTTP request and poisoning a cache; the server's bytes are not attacker-chosen by a web page. Common wrong answer: "for encryption".

## What mid-level engineers get wrong

- Picking WebSockets for one-way server push, then writing reconnection, resume and proxy configuration that SSE provides.
- Forgetting heartbeats, so long model "thinking" pauses or quiet periods are cut by idle timeouts.
- Writing an SSE parser that handles only `\n`, or treats every chunk from `read()` as a whole event.
- Leaving per-connection queues unbounded, so one slow client can exhaust server memory.
- Scaling WebSocket servers horizontally without a pub/sub layer, and without planning for every client reconnecting on each deploy.
- Checking only authentication cookies on a WebSocket upgrade and not the `Origin` header.

## Exercises

```exercise
id: parse-sse-stream
title: Parse a text/event-stream
prompt: |
  `chunks` is the list of strings a client read from an SSE response, in
  order; chunk boundaries can fall anywhere, including inside a line or
  between a CR and its LF. Return the dispatched events as a list of
  `[event_type, data, last_event_id]`, following the HTML specification:

  - Lines end with LF, CRLF or a lone CR.
  - A line starting with `:` is a comment and is ignored.
  - Otherwise split at the first `:` into field and value, removing one
    leading space from the value; a line with no `:` is a field with an
    empty value.
  - `event` sets the event type; `data` appends the value plus a newline to
    the data buffer; `id` sets the last event ID, which persists across
    events until changed. Other fields are ignored.
  - A blank line dispatches: if the data buffer is empty, dispatch nothing;
    otherwise remove one trailing newline from the data and emit
    `[type or "message", data, last_event_id]` (`""` if no id was ever
    set). Then reset the event type and data buffer.
  - An event not followed by a blank line when the stream ends is discarded.
languages: [python, javascript]
entry: parse_sse
starter:
  python: |
    def parse_sse(chunks):
        events = []
        # your code here
        return events
  javascript: |
    function parse_sse(chunks) {
      const events = [];
      // your code here
      return events;
    }
tests:
  - args: [["event: delta\ndata: The bandwidth-delay\n\nevent: delta\ndata:  product is\n\n: ping\n\nevent: done\ndata: {\"output_tokens\":146}\n\n"]]
    expected: [["delta", "The bandwidth-delay", ""], ["delta", " product is", ""], ["done", "{\"output_tokens\":146}", ""]]
    label: the app's event names, a comment and one stripped space
  - args: [["data: a\ndata: b\n\n"]]
    expected: [["message", "a\nb", ""]]
    label: multi-line data
  - args: [["event: x\r\ndata: 1\r\n\r\ndata: 2\r\r"]]
    expected: [["x", "1", ""], ["message", "2", ""]]
    label: CRLF and lone CR line endings
  - args: [["id: 41\ndata:hi\n\ndata: again\n\n"]]
    expected: [["message", "hi", "41"], ["message", "again", "41"]]
    label: the id persists
  - args: [["data: done\n\ndata: partial"]]
    expected: [["message", "done", ""]]
    hidden: true
    label: an unterminated event is discarded
  - args: [["event: ping\n\ndata: x\n\n"]]
    expected: [["message", "x", ""]]
    hidden: true
    label: no data, no dispatch, and the type resets
  - args: [["da", "ta: spl", "it\r", "\n\r", "\n"]]
    expected: [["message", "split", ""]]
    hidden: true
    label: chunks split lines and CRLF pairs
  - args: [["data\n\n"]]
    expected: [["message", "", ""]]
    hidden: true
    label: a field with no colon
hints:
  - "Join the chunks first, then split into lines yourself: treat CR followed by LF as one line ending, and a CR or LF alone as one too."
  - "Keep `event_type`, `data` and `last_id` as state; only `event_type` and `data` reset after a blank line."
```

```exercise
id: websocket-frame
title: Encode a WebSocket frame
prompt: |
  Build a single, final (FIN = 1) WebSocket frame and return it as lowercase
  hex. `opcode` is 1 (text), 2 (binary), 8 (close), 9 (ping) or 10 (pong);
  `payload_hex` is the payload as hex (possibly empty); `mask_hex` is either
  `""` (a server frame: no mask) or 4 bytes of hex (a client frame).

  - Byte 0: `0x80 | opcode`.
  - Byte 1: the MASK bit (`0x80`) if masked, OR-ed with the length: the
    length itself if under 126; 126 followed by a 2-byte big-endian length
    if under 65,536; otherwise 127 followed by an 8-byte length.
  - Then the 4-byte masking key, if masked.
  - Then the payload; if masked, byte `i` is XOR-ed with key byte `i % 4`.
languages: [python, javascript]
entry: ws_frame
starter:
  python: |
    def ws_frame(opcode, payload_hex, mask_hex):
        payload = bytes.fromhex(payload_hex)
        mask = bytes.fromhex(mask_hex)
        # your code here
        return ""
  javascript: |
    function ws_frame(opcode, payload_hex, mask_hex) {
      // your code here
      return "";
    }
tests:
  - args: [1, "48656c6c6f", ""]
    expected: "810548656c6c6f"
    label: RFC 6455's unmasked "Hello"
  - args: [1, "48656c6c6f", "37fa213d"]
    expected: "818537fa213d7f9f4d5158"
    label: RFC 6455's masked "Hello"
  - args: [9, "48656c6c6f", ""]
    expected: "890548656c6c6f"
    label: a ping
  - args: [8, "", ""]
    expected: "8800"
    hidden: true
    label: an empty close frame
  - args: [2, "abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab", ""]
    expected: "827e007eabababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab"
    hidden: true
    label: 126 bytes need the 16-bit length form
  - args: [1, "6869", "37fa213d"]
    expected: "818237fa213d5f93"
    hidden: true
hints:
  - "Build a byte list: header byte, length byte(s), optional key, then the (masked) payload; format each byte as two hex digits."
  - "The 7-bit length field can say 0 to 125 directly; 126 and 127 are markers for the extended forms."
```

## Senior signals

- You choose a transport from the direction and rate of data flow, not from familiarity, and you default to SSE for server push because it is HTTP.
- You can write the `text/event-stream` format from memory, explain `Last-Event-ID` resumption, and know that `EventSource` reconnects on its own while `WebSocket` does not.
- You know the HTTP/1.1 six-connection caveat for SSE and that serving it over HTTP/2 removes it, and you check for buffering proxies with `curl -N`.
- You can explain the WebSocket upgrade, why client frames are masked, and why ping/pong exists (dead peers and NAT timeouts), and you verify `Origin` on upgrade.
- You know WebSockets make servers stateful and require a pub/sub layer for fan-out across instances, and you plan for mass reconnects on deploy.
- You separate the producing task from the HTTP response, with a bounded channel between them, so a client disconnect neither loses work nor leaks memory.

## Check yourself

```quiz
- q: >-
    A build-log page streams lines from the server; the user never sends anything after opening the page. Which transport is the best default and why?
  options: ["WebRTC data channels, because large logs need direct peer-to-peer bandwidth", "Long polling, because build logs are bursty and each burst fits one response", "Server-Sent Events, because the flow is one-way plain HTTP with auto-reconnection", "WebSockets, because a persistent socket gives the lowest latency for log lines"]
  answer: 2
  explanation: >-
    One-directional server push is exactly SSE's case: no upgrade, auto-reconnect with Last-Event-ID, and every proxy, CDN and mesh passes it. WebSockets add bidirectionality nobody uses and a hand-written reconnect loop; their latency edge only matters when the client sends often.
- q: >-
    An SSE endpoint works with curl but in production the browser receives all events at once after the stream ends. What is the most likely cause?
  options: ["EventSource batches events by design and fires them when the stream closes", "A proxy or compression layer buffers the body until the response completes", "The server sends Content-Type text/plain, so the browser reads it as one file", "The events lack id fields, so the browser cannot tell where one event ends"]
  answer: 1
  explanation: >-
    Proxies with response buffering and compression layers hold chunks until a buffer fills or the response ends, while a curl that does not pass through them sees each event on time. EventSource dispatches each event as soon as its blank line arrives, and events are delimited by blank lines, not ids. Disable buffering for the stream (for example X-Accel-Buffering: no) and exclude it from compression.
- q: >-
    In this app, why does the model stream run in a spawned task writing to a channel rather than directly inside the SSE handler?
  options: ["Spawned tasks run faster than handlers, because each one gets its own worker thread", "So several clients watching one conversation can share a single model call", "Because axum cannot stream a response body from inside a handler future at all", "So a client disconnect does not abort the model call, and the reply is still saved"]
  answer: 3
  explanation: >-
    If the handler owned the model stream, dropping the response would cancel it and lose the reply. With the producer decoupled, the send to a closed receiver fails and the task keeps consuming and persisting.
- q: >-
    A push service holds one million idle SSE connections and sends a heartbeat comment on each every 15 seconds. Roughly what does the heartbeat alone cost?
  options: ["About 1 Gbit/s, since each heartbeat carries a full HTTP response with headers", "About 15 writes a second, since heartbeats are batched across all connections", "About 67,000 small writes a second, tens of Mbit/s with TLS and TCP overhead", "Nothing measurable, since comment lines are dropped by the kernel before sending"]
  answer: 2
  explanation: >-
    One million connections divided by 15 seconds is about 66,700 heartbeats per second, each a small TLS record in its own TCP segment, roughly 100 bytes on the wire plus an ACK, so on the order of 50 Mbit/s and over 100,000 packets per second. Comments are real bytes on the wire (that is their purpose), they ride inside the existing response rather than as new HTTP responses, and each connection needs its own write.
- q: >-
    Why does the WebSocket protocol require the client to mask every frame it sends?
  options: ["So a malicious page cannot craft bytes that a buggy proxy would parse as HTTP", "To compress repeated payloads by XOR-ing each one against a per-frame key", "To authenticate the client to the server with a per-connection secret", "To encrypt the payload so that eavesdroppers on the network path cannot read it"]
  answer: 0
  explanation: >-
    Masking makes the bytes on the wire unpredictable to the page that chose the payload. That defeats cache-poisoning attacks through intermediaries that misparse WebSocket bytes as HTTP. It is not confidentiality: the mask key travels in the frame itself, and TLS is what keeps eavesdroppers out.
- q: >-
    A WebSocket service scales from one server to ten behind a load balancer and users stop receiving some messages. What is missing?
  options: ["Sticky sessions on the load balancer, so each user returns to the same server", "HTTP/2 on the balancer, so all ten servers share one multiplexed connection", "A pub/sub layer, so a message produced on server 3 reaches users on server 7", "Larger frames, so a burst of messages is not dropped by the load balancer"]
  answer: 2
  explanation: >-
    A WebSocket pins a client to one process. Messages originating elsewhere must be fanned out through a shared broker. Sticky sessions do not help because the producer is not the client's own server.
```

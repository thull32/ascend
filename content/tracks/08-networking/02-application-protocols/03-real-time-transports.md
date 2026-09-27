---
slug: real-time-transports
title: "Real-time transports: long polling, SSE, WebSockets and WebRTC"
description: How to push data to a browser without it asking, which of long polling, Server-Sent Events and WebSockets fits a given direction of flow, what proxies do to each, and why this app streams AI replies over SSE.
minutes: 24
difficulty: medium
tags: [sse, websockets, long-polling, webrtc, streaming, real-time]
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

Three properties make SSE the right default for server push:

**Reconnection is built in and resumable.** If the connection drops, `EventSource` reconnects on its own (after `retry` ms, default a few seconds) and sends the header `Last-Event-ID: 41`. The server can resume from event 42. You get at-least-once delivery for free if your event IDs are meaningful.

**It is just HTTP.** Every load balancer, CDN, WAF, corporate proxy and service mesh that can pass a slow HTTP response can pass SSE. It uses the same TLS, the same auth cookies, the same CORS rules and the same HTTP/2 multiplexing as the rest of the API. There is no upgrade, no second protocol, no special port.

**The server side is trivial.** A handler that writes to a response body and flushes after each event is an SSE server. Compare the WebSocket state machine below.

The caveats:

- It is one-directional. Client-to-server messages go over ordinary requests, which is fine for "send a chat message" and wrong for "stream microphone audio".
- It is text. Binary payloads must be base64-encoded (33 % overhead) or use a different transport.
- Over HTTP/1.1 an open SSE stream consumes one of the browser's six connections per host. Two tabs each with three streams exhaust the budget and the seventh request hangs. Over HTTP/2 this disappears, since streams multiplex on one connection; serve SSE over HTTP/2 and this caveat is gone.
- Intermediaries that *buffer* responses (some proxies, compression middleware, nginx with `proxy_buffering on`) will hold events until the buffer fills. Send `X-Accel-Buffering: no` for nginx, disable response compression for the stream, and confirm with `curl -N` that events arrive as they are produced.

### How this app streams AI replies

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

1. **Named events.** `delta` carries a text fragment, `done` carries a JSON usage summary with `input_tokens`, `output_tokens` and `stop_reason`, and `error` carries a message. The client dispatches on the event name and never has to sniff payloads. That client is not `EventSource`, though: `EventSource` can only send a GET, and each turn is a POST with a JSON body, so `web/src/lib/api.ts` reads the response with `fetch` and a short hand-written parser (split lines, skip `:` comments, collect `event:` and `data:`, dispatch on a blank line).
2. **A 15-second keep-alive comment** (`: ping`). Idle-timeout proxies and load balancers close connections that carry no bytes for 30, 60 or 90 s. A model that is thinking for 40 s before its first token would look idle. The comment line keeps bytes flowing and is invisible to any conforming parser, `EventSource` or the app's own.
3. **Persistence is decoupled from the connection.** The model stream runs in a task spawned on the app's `TaskTracker` (`state.tasks.spawn`) that owns writing the reply to the database; the HTTP response is only a consumer of a bounded `mpsc` channel (capacity 64). If you close the tab, the `Sender` sees a closed receiver, ignores the send error, and keeps consuming the model stream so the full reply is still persisted and its token usage still counted against the budget. Reload and the reply is there. Because that task outlives the request, the route wraps it in `.instrument(tracing::Span::current())`, so its log lines still carry the request's span and request ID. The alternative, driving the model from the request handler, would abort the model call on disconnect and lose the reply. The tracker matters at shutdown: on SIGTERM the server stops accepting requests, drains open connections, then waits up to 30 seconds for tracked tasks to finish persisting. The first version used a bare `tokio::spawn`. Draining connections does not wait for a task whose browser has already gone, so a deploy could exit mid-generation and lose exactly the reply this design exists to save.
4. **Bounded buffering.** The channel holds 64 events. If the browser stops reading (throttled background tab), the producer blocks on send rather than growing memory without bound: backpressure, not a leak.

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

### Frames

A WebSocket frame has a 2-byte minimum header: FIN bit, opcode (text, binary, close, ping, pong, continuation), a MASK bit, and a 7-bit length (with 16- or 64-bit extensions for larger payloads). A 20-byte message costs 22 bytes on the wire from the server, or 26 from the client. Compare 500 bytes of HTTP headers per long-poll message.

Client-to-server frames are **masked** with a random 4-byte XOR key. This is not encryption. It defends against a cache-poisoning attack in which a malicious page crafted WebSocket payloads that looked like HTTP requests to a badly written intermediary proxy; masking guarantees the bytes on the wire are unpredictable to the page author. It is a good illustration of protocols being shaped by the worst proxies in existence.

**Ping/pong** frames are the liveness mechanism. TCP alone cannot tell you a peer is gone until you try to send and the retransmissions time out (minutes). A server that pings every 30 s and drops connections without a pong within 10 s finds dead clients in 40 s and stops holding memory for phones that lost signal. NAT and proxy idle timeouts also close silent connections; a ping interval under the shortest such timeout (commonly 60 s) keeps the mapping alive.

### What WebSockets cost you

- **Proxy support is uneven.** Every hop must understand the upgrade and then pass bytes blindly. Most modern L7 proxies do; some corporate proxies, older WAFs and some serverless platforms do not. Always deploy on port 443 with TLS (`wss://`), which hides the frames from middleboxes that would otherwise mangle them.
- **No HTTP semantics after the upgrade.** No status codes, no caching, no compression unless negotiated (`permessage-deflate`), no CORS (the `Origin` header on the upgrade is the only check; verify it server-side or any site can open sockets to you with the user's cookies).
- **Reconnection is yours to write.** `WebSocket` in the browser does not reconnect. You write the backoff, the resume protocol, the "which messages did I miss" logic that SSE gave you for free.
- **Stateful servers.** A WebSocket pins a client to one server process for its lifetime. Deploys, autoscaling and load-balancer rebalancing become visible as mass reconnects. Fan-out across servers needs a pub/sub layer (Redis, NATS, Kafka) because the message for user A may originate on a server A is not connected to.
- **HTTP/2 and HTTP/3** support exists (RFC 8441 tunnels a WebSocket inside an h2 stream) but is less widely deployed than SSE-over-h2.

## WebRTC: when the data is media or must not go through your server

WebRTC is for peer-to-peer audio, video and arbitrary data between browsers (or a browser and a media server), with latency targets in the tens of milliseconds that TCP-based transports cannot meet under loss. It is a stack, not a protocol:

- **Signalling** is unspecified: you use your own channel (typically a WebSocket) to exchange session descriptions (SDP) and candidate addresses.
- **ICE** gathers candidate address pairs: the local IP, a **STUN**-discovered public IP (the server tells the client what address its NAT presents), and as a last resort a **TURN** relay when both peers are behind NATs that block direct traffic. Roughly 10–20 % of sessions need TURN, and TURN bandwidth is the main operating cost of a WebRTC product.
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
  options: ["Long polling, because build logs are bursty and each burst fits one response", "WebSockets, because a persistent socket gives the lowest latency for log lines", "Server-Sent Events, because the flow is one-way plain HTTP with auto-reconnection", "WebRTC data channels, because large logs need direct peer-to-peer bandwidth"]
  answer: 2
  explanation: >-
    One-directional server push is exactly SSE's case: no upgrade, auto-reconnect with Last-Event-ID, and every proxy, CDN and mesh passes it. WebSockets add bidirectionality nobody uses and a hand-written reconnect loop; their latency edge only matters when the client sends often.
- q: >-
    An SSE endpoint works with curl but in production the browser receives all events at once after the stream ends. What is the most likely cause?
  options: ["A proxy or compression layer buffers the body until the response completes", "EventSource batches events by design and fires them when the stream closes", "The server sends Content-Type text/plain, so the browser reads it as one file", "The events lack id fields, so the browser cannot tell where one event ends"]
  answer: 0
  explanation: >-
    Proxies with response buffering and compression layers hold chunks until a buffer fills or the response ends, while a curl that does not pass through them sees each event on time. EventSource dispatches each event as soon as its blank line arrives, and events are delimited by blank lines, not ids. Disable buffering for the stream (for example X-Accel-Buffering: no) and exclude it from compression.
- q: >-
    In this app, why does the model stream run in a spawned task writing to a channel rather than directly inside the SSE handler?
  options: ["So several clients watching one conversation can share a single model call", "Because axum cannot stream a response body from inside a handler future at all", "Spawned tasks run faster than handlers, because each one gets its own worker thread", "So a client disconnect does not abort the model call, and the reply is still saved"]
  answer: 3
  explanation: >-
    If the handler owned the model stream, dropping the response would cancel it and lose the reply. With the producer decoupled, the send to a closed receiver simply fails and the task keeps consuming and persisting.
- q: >-
    Why does the WebSocket protocol require the client to mask every frame it sends?
  options: ["To encrypt the payload so that eavesdroppers on the network path cannot read it", "To compress repeated payloads by XOR-ing each one against a per-frame key", "So a malicious page cannot craft bytes that a buggy proxy would parse as HTTP", "To authenticate the client to the server with a per-connection secret"]
  answer: 2
  explanation: >-
    Masking makes the bytes on the wire unpredictable to the page that chose the payload. That defeats cache-poisoning attacks through intermediaries that misparse WebSocket bytes as HTTP. It is not confidentiality: the mask key travels in the frame itself, and TLS is what keeps eavesdroppers out.
- q: >-
    A WebSocket service scales from one server to ten behind a load balancer and users stop receiving some messages. What is missing?
  options: ["HTTP/2 on the balancer, so all ten servers share one multiplexed connection", "A pub/sub layer, so a message produced on server 3 reaches users on server 7", "Sticky sessions on the load balancer, so each user returns to the same server", "Larger frames, so a burst of messages is not dropped by the load balancer"]
  answer: 1
  explanation: >-
    A WebSocket pins a client to one process. Messages originating elsewhere must be fanned out through a shared broker. Sticky sessions do not help because the producer is not the client's own server.
```

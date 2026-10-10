---
lesson: real-time-transports
source: 89c1a64fbfe41d55
fit: great
desk:
  - "The SSE wire format and its exact parsing rules"
  - "The WebSocket upgrade, and the masked Hello frame decoded byte by byte"
  - "The app's SSE route in Rust, and the transport trade-off table"
  - "Exercises: parse a text/event-stream, and encode a WebSocket frame"
---
## Introduction

HTTP is request-response. The client asks, the server answers, and the server has no way to say anything unprompted. That is fine for loading a page, and useless for a chat message, a live price, a build log, or a language model producing a reply one token at a time. Every real-time feature is a workaround for that missing capability, and four are in wide use: polling, long polling, Server-Sent Events and WebSockets, plus WebRTC for peer-to-peer media.

The choice is usually made by whoever built the first prototype, and never revisited. It should be made by answering one question: which direction does the data flow, and how often? Server to client a few times a second is a different problem from both directions thousands of times a second, and the transports that fit are different too.

## Polling, and what a held connection costs

Plain polling asks for new messages every few seconds, and the cost is arithmetic. A hundred thousand clients polling every 2 seconds is 50 thousand requests a second, almost all of them answering "nothing new". With typical cookies and headers, that is about 400 megabits a second of headers, and the average delay is still a second. Halve the delay and you double the load. No interval is both cheap and responsive.

Long polling has the server hold each request until it has something to say, or until a timeout of 20 to 30 seconds expires, and the client immediately asks again. Latency drops to one round trip after the event. But every event still costs a full request cycle, events queue during the gap before the next request arrives, and the server must track a cursor for each client or it will drop or duplicate events. Its one strength: it works through every proxy ever built, because it looks like a slow request. Use it as a fallback, not a design.

Every push transport except polling holds a connection open per client, so the capacity question changes. It is no longer requests per second. It is: what does one idle connection cost, and what does keeping it alive cost?

Memory first. A Python asyncio server holding 3 thousand idle connections grew by about 6.4 kilobytes per connection, counting both ends. The order of magnitude for an async server is kilobytes to tens of kilobytes per idle client, so a million held connections is gigabytes of RAM and a million file descriptors.

Then keep-alive traffic. A connection that carries no bytes gets closed by some idle timer on the path: a load balancer at 60 seconds, a NAT at 350 or less. So push servers send heartbeats. One heartbeat is only a few bytes of text, but once TLS and TCP wrap it, it is roughly 100 bytes on the wire plus an acknowledgement. At a million clients and one heartbeat every 15 seconds, that is about 67 thousand heartbeats a second, around 53 megabits a second and 130 thousand packets a second, before a single real event is sent.

## Server-Sent Events

SSE is the observation that HTTP already lets a server stream a response body for as long as it likes. Make the body a stream of events, agree a trivial text format, and give the browser a built-in client, EventSource, that parses it and reconnects automatically. It is one-way, server to client, and it is plain HTTP.

The format is lines of a field name, a colon and a value, and a blank line ends an event. The data field is the payload. The event field names the type, so the client can dispatch on it. The id field sets the last event ID. And a line starting with a colon is a comment the parser ignores, which makes it the standard heartbeat.

Three properties make SSE the right default for server push. Reconnection is built in and resumable: if the connection drops, EventSource reconnects on its own and sends a Last-Event-ID header, say 41, and the server resumes from 42. It is plain HTTP, so every load balancer, CDN, firewall, proxy and service mesh that can pass a slow response can pass SSE, with the same TLS, cookies and CORS rules as the rest of your API. And the server side is trivial: a handler that writes an event and flushes is an SSE server.

Four caveats. It is one-way, so client messages go over ordinary requests: fine for sending a chat message, wrong for streaming microphone audio. It is text, so binary payloads cost 33 percent extra in base64. Over HTTP 1.1, each open stream takes one of the browser's six connections per host, so two tabs with three streams each make the seventh request hang. Over HTTP 2 that disappears. And intermediaries that buffer responses hold events back until the buffer fills.

That last one produces a classic symptom. An SSE endpoint works with curl, but in production the browser receives every event at once, when the stream ends. Why?

[pause]

Something on the path is buffering. A proxy with response buffering, or a compression layer, holds the body until the response completes. EventSource itself dispatches each event the moment its blank line arrives. Turn off buffering for that route, exclude event streams from compression, and confirm with curl in no-buffer mode that events arrive as they are produced.

## How this app streams AI replies

Ascend's assistant replies reach your browser over SSE, and the design is worth hearing. There are three named events. Delta carries a text fragment. Done carries a usage summary. And error carries a short message the app wrote itself, never the provider's own error text, which is logged instead. A comment line goes out every 15 seconds, because a model that thinks for 40 seconds before its first token would look idle to a proxy that cuts quiet connections after 30, 60 or 90.

The key decision is that saving the reply is decoupled from the connection. The model stream runs in its own background task, which owns writing the reply to the database. The HTTP response is only a consumer of a channel between them that holds 64 events. Close the tab, and the task's send fails; it ignores the failure and keeps consuming the model, so the full reply is still saved. Reload and it is there. Drive the model from the request handler instead, and a disconnect aborts the model call and loses the reply. The bounded channel is backpressure: if a background tab stops reading, the producer waits, rather than growing memory without limit.

There is a lesson in its history too. The first version started that task with a bare spawn, and a deploy could exit mid-generation and lose exactly the reply this design exists to save. Now shutdown runs in two stages, to fit the platform's 60-second drain window: up to 25 seconds for open connections to finish, then up to 30 for tracked tasks to finish saving.

Why not WebSockets here? The data flows one way. The client's only upstream message is the prompt, an ordinary POST. A WebSocket would add a second protocol, a second set of proxy rules and a hand-written reconnect loop, to gain bidirectionality nobody uses.

## WebSockets

When the client sends as often as it receives, with small messages at low latency, such as multiplayer game state, collaborative cursors or a trading terminal, SSE plus POSTs is a poor fit, because each upstream message pays for headers and a request cycle. A WebSocket gives you a raw two-way message stream over one TCP connection, started with an HTTP request so it can use port 443 and reuse TLS.

The client sends an upgrade request carrying a random key. The server answers 101, Switching Protocols, with a hash of that key and a fixed magic string. The magic string is not security. It proves the server actually understands WebSockets, rather than being an HTTP cache that echoed the headers back. After the 101, the connection no longer carries HTTP at all, only frames. A 20-byte message costs 22 bytes from the server and 26 from the client, against roughly a kilobyte of headers for a long-poll round trip.

Why four extra bytes from the client? Client frames are masked with a random 4-byte key. That is not encryption; the key travels in the frame. It defends against a cache-poisoning attack, in which a malicious page crafted payloads that looked like HTTP requests to a badly written proxy. Masking makes the bytes on the wire unpredictable to the page that chose them. Protocols get shaped by the worst proxies in existence.

Ping and pong frames find dead peers. TCP alone cannot tell you a peer is gone until a send times out, minutes later. Ping every 30 seconds, drop anyone who has not answered within 10, and you find dead clients in 40 seconds.

What WebSockets cost you. Proxy support is uneven, because every hop must understand the upgrade, so always use TLS on port 443. There are no HTTP semantics afterwards: no status codes, no caching, no CORS. The Origin header on the upgrade is your only check, so verify it, or any site can open sockets to you with your users' cookies. Reconnection is yours to write: the backoff, the resume, the "what did I miss". And servers become stateful. A socket pins a client to one process, so deploys show up as mass reconnects, and fan-out across servers needs a pub-sub layer such as Redis, NATS or Kafka, because the message for a user may originate on a server that user is not connected to. Scale from one server to ten without one, and users quietly stop receiving some messages.

## WebTransport and WebRTC

WebSockets inherit TCP's head-of-line blocking: one lost packet stalls every message behind it. WebTransport is the HTTP 3 answer. Over QUIC, it gives independent streams, so a loss stalls only the stream it hit, plus unreliable datagrams that are never retransmitted, the right shape for a player's latest position. The cost is reach. It needs HTTP 3 on every hop, and a WebSocket fallback for networks that block UDP, and Safari only added it in March 2026. Treat it as an optimisation for clients that have it, not a replacement.

WebRTC is for audio, video and data between peers, with latency targets in the tens of milliseconds. It is a stack, not a protocol. Signalling is yours to build, usually over a WebSocket. ICE finds a path between the peers, using STUN to learn the public address a NAT presents, and as a last resort a TURN relay, whose bandwidth is the main operating cost of a WebRTC product. The rule of thumb: if the payload is audio or video, or you need delivery under 100 milliseconds between peers and can tolerate loss, use WebRTC. Otherwise it is over-engineered.

## In the interview

A follow-up the lesson expects: you need to push notifications to 5 million connected users. How do you size it, and what do you watch?

[pause]

Size by what a held connection costs, not by requests: memory per connection, tens of kilobytes including TLS, file descriptors, and heartbeat packets per second. At 5 million clients and a 30-second heartbeat, that is about 170 thousand heartbeats a second across the fleet. Fan out through a pub-sub layer, shard users across servers, and plan deploys as rolling drains with jittered reconnects. The wrong answer is one server per 10 thousand requests a second, which ignores that idle connections, not requests, are the load.

And the quick one: SSE or WebSocket for a chat app? Either works. SSE plus POST for sending is simpler to operate and passes every proxy. A WebSocket wins when clients send often enough, with typing indicators and presence, that per-message HTTP overhead matters. The wrong answer is "WebSocket, because it is real-time", as if SSE were not.

## Recap

Four things to remember. Choose a transport from the direction and rate of data flow, and default to SSE for server push, because it is just HTTP and resumes on its own. Held connections are the load: kilobytes each, plus heartbeats below the shortest idle timer on the path. WebSockets earn their cost when clients send often, and in exchange you write reconnection, check Origin, and add pub-sub for fan-out. And none of these transports guarantees delivery, so number your events, resume from the last acknowledged one, and separate the work from the connection with a bounded queue.

At your desk: the event-stream format and its parsing rules, the WebSocket upgrade and the masked frame byte by byte, the app's SSE route, and the two exercises, parsing an event stream and encoding a WebSocket frame.

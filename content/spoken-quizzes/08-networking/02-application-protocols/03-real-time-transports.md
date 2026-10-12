---
lesson: real-time-transports
source: d47727d13986fd59
---
## 1

A build-log page streams lines from the server, and the user never sends anything after opening the page. Which transport is the best default, and why?

A, WebRTC data channels, because large logs need direct peer-to-peer bandwidth. B, long polling, because build logs are bursty and each burst fits one response. C, Server-Sent Events, because the flow is one-way plain HTTP with automatic reconnection. D, WebSockets, because a persistent socket gives the lowest latency for log lines.

[think]

The answer is C: Server-Sent Events, because the flow is one-way plain HTTP with automatic reconnection.

One-directional server push is exactly the case Server-Sent Events were made for: no upgrade, automatic reconnection that resumes from the last event ID, and every proxy, CDN and mesh passes it. WebSockets add two-way messaging nobody uses, and a hand-written reconnect loop. Their latency edge only matters when the client sends often.

## 2

A Server-Sent Events endpoint works with curl, but in production the browser receives all the events at once, after the stream ends. What is the most likely cause?

A, the browser's event source batches events by design, and fires them when the stream closes. B, a proxy or compression layer buffers the body until the response completes. C, the server sends a content type of plain text, so the browser reads it as one file. D, the events lack ID fields, so the browser cannot tell where one event ends.

[think]

The answer is B: a proxy or compression layer buffers the body until the response completes.

Proxies with response buffering, and compression layers, hold chunks until a buffer fills or the response ends, while a curl that does not pass through them sees each event on time. The browser dispatches each event as soon as its blank line arrives, and events are delimited by blank lines, not IDs. Disable buffering for the stream and exclude it from compression.

## 3

In the course's own app, a language model's reply streams to the browser over Server-Sent Events. Why does the model stream run in a spawned task that writes to a channel, rather than directly inside the handler?

A, spawned tasks run faster than handlers, because each one gets its own worker thread. B, so several clients watching one conversation can share a single model call. C, because axum cannot stream a response body from inside a handler at all. D, so a client disconnect does not abort the model call, and the reply is still saved.

[think]

The answer is D: so a client disconnect does not abort the model call, and the reply is still saved.

If the handler owned the model stream, dropping the response would cancel it and lose the reply. With the producer decoupled, a send to the closed receiver just fails, and the task keeps consuming the model's stream and saving the reply.

## 4

A push service holds one million idle Server-Sent Events connections, and sends a heartbeat comment on each one every 15 seconds. Roughly what does the heartbeat alone cost?

A, about 1 gigabit per second, since each heartbeat carries a full HTTP response with headers. B, about 15 writes a second, since heartbeats are batched across all connections. C, about 67,000 small writes a second: tens of megabits per second with TLS and TCP overhead. D, nothing measurable, since comment lines are dropped by the kernel before sending.

[think]

The answer is C: about 67,000 small writes a second: tens of megabits per second with TLS and TCP overhead.

One million connections over 15 seconds is about 66,700 heartbeats a second, each a small TLS record in its own TCP segment, roughly 100 bytes on the wire plus an acknowledgement: on the order of 50 megabits per second, and over 100,000 packets per second. Comments are real bytes on the wire, which is their purpose. They ride inside the existing response, and each connection needs its own write.

## 5

Why does the WebSocket protocol require the client to mask every frame it sends?

A, so a malicious page cannot craft bytes that a buggy proxy would parse as HTTP. B, to compress repeated payloads by combining each one with a per-frame key using XOR. C, to authenticate the client to the server with a per-connection secret. D, to encrypt the payload so eavesdroppers on the network path cannot read it.

[think]

The answer is A: so a malicious page cannot craft bytes that a buggy proxy would parse as HTTP.

Masking makes the bytes on the wire unpredictable to the page that chose the payload. That defeats cache-poisoning attacks through intermediaries that misparse WebSocket bytes as HTTP. It is not confidentiality: the mask key travels in the frame itself, and TLS is what keeps eavesdroppers out.

## 6

A WebSocket service scales from one server to ten behind a load balancer, and users stop receiving some messages. What is missing?

A, sticky sessions on the load balancer, so each user returns to the same server. B, HTTP/2 on the balancer, so all ten servers share one multiplexed connection. C, a publish-subscribe layer, so a message produced on server 3 reaches users on server 7. D, larger frames, so a burst of messages is not dropped by the load balancer.

[think]

The answer is C: a publish-subscribe layer, so a message produced on server 3 reaches users on server 7.

A WebSocket pins a client to one process. Messages that originate elsewhere must be fanned out through a shared broker. Sticky sessions do not help, because the producer is not the client's own server.

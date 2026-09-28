---
slug: application-protocols
title: Application protocols
description: HTTP/1.1 through HTTP/3, real-time transports, gRPC, API styles, CDNs and load balancers, with the bytes on the wire, measured timings and the trade-offs that decide adoption.
prerequisites: [networking/fundamentals]
---
Once TCP or QUIC delivers an ordered stream of bytes, the application protocol decides what those bytes mean, how many round trips a page costs, and which failure modes your users see. HTTP/1.1 is still the majority of traffic between services; HTTP/2 fixed head-of-line blocking at one layer and exposed it at another; HTTP/3 moved the transport into user space to fix it for good. Real-time features choose between polling, Server-Sent Events, WebSockets and WebTransport by the direction and rate of data flow and by what the proxies in the path will pass, and this app streams AI replies over SSE for exactly those reasons.

This module takes each protocol apart at the level you debug it: a chunked body decoded by hand, an HPACK-compressed header block, a WebSocket frame and a protobuf message encoded byte by byte, what a `curl -v` trace and a CDN's `Age` header reveal, what a cache key contains, and what an L4 load balancer can and cannot see. Each lesson traces its mechanisms on concrete data, prices them in round trips, bytes and connections, and lists the production failures with their diagnosis. The closing lessons on CDNs and load balancing recur in every system-design interview, with Netflix Open Connect as the worked example at scale.

By the end you can pick the right protocol for a feature, explain the cost of that choice in round trips, bytes and held connections, and name the proxy in the path that will break it.

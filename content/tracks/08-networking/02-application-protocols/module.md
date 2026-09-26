---
slug: application-protocols
title: Application protocols
description: HTTP/1.1 through HTTP/3, real-time transports, gRPC, API styles, CDNs and load balancers, with the bytes on the wire and the trade-offs that decide adoption.
prerequisites: [networking/fundamentals]
---
Once TCP or QUIC delivers an ordered stream of bytes, the application protocol decides what those bytes mean, how many round trips a page costs, and which failure modes your users see. HTTP/1.1 is still the majority of traffic between services; HTTP/2 fixed head-of-line blocking at one layer and exposed it at another; HTTP/3 moved the whole transport into user space to fix it for good. Real-time features choose between WebSockets, Server-Sent Events and polling based on direction of data flow and proxy friendliness, and this app streams AI replies over SSE for exactly those reasons.

This module covers each protocol by its wire format and its semantics: what a `curl -v` trace shows, which headers control caching and connection reuse, how HPACK compresses headers, how gRPC encodes a message, what a CDN uses as a cache key, and what an L4 load balancer can and cannot see. The closing lessons on CDNs and load balancing are the ones that recur in every system-design interview, and Netflix Open Connect is the worked example.

By the end you can pick the right protocol for a feature, explain the cost of that choice in round trips and connections, and know which proxy in the path will break it.

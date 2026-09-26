---
slug: networking
title: Networking from Wire to Web
description: Read a packet capture, budget an RTT, explain why a request is slow, and design services that survive a lossy, laggy, adversarial network.
icon: network
phase: 4
---
Every production incident you have ever debugged had a network in the middle of it. The service "was fine" but the load balancer marked it unhealthy; p99 latency doubled because a connection pool started opening TLS handshakes on every request; a retry storm took down a database that a single timeout would have protected. Mid-level engineers treat the network as a reliable pipe with an occasional 502. Senior engineers know exactly which of the seven layers is lying to them and can prove it with `tcpdump`.

This track builds the network up from the wire. The fundamentals module covers layering, addressing, DNS, TCP, congestion control and TLS with the real header fields and the real math (bandwidth-delay product, RTT budgets, handshake counts). The application protocols module takes you through HTTP/1.1, HTTP/2 and HTTP/3, WebSockets and Server-Sent Events (the transport this app uses to stream AI replies to you), gRPC, CDNs and load balancers. The algorithms module treats routing, reliable delivery, error detection, rate limiting and consistent hashing as the graph and systems problems they are, with links back to Dijkstra and Bellman-Ford. The final module is the operational craft: latency math, timeouts and backoff, connection pooling, reading `curl -v`, `dig` and packet captures, and what a service mesh is actually doing to your bytes.

The bar is the system-design interview and the on-call rotation at a company like Netflix, where the CDN, the transport and the mesh are the product. By the end you can look at a slow request and say which of DNS, TCP, TLS, HTTP or the application is responsible, and how much time each one is entitled to.

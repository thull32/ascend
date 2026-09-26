---
slug: network-algorithms
title: Network algorithms
description: Routing, reliable delivery, error detection, rate limiting and consistent hashing as the graph and systems algorithms they really are.
prerequisites: [algorithms/graph-algorithms]
---
The internet is a set of algorithms that happen to run on routers. OSPF is Dijkstra with a flooding protocol attached; RIP is Bellman-Ford with a 15-hop cap; BGP is a path-vector protocol whose "metric" is a business policy. TCP's reliability is a sliding window with cumulative and selective acknowledgements. Every rate limiter you have configured is a token bucket or a sliding window, and every service mesh routes requests with a consistent-hash ring.

This module takes each of those algorithms apart with the same rigour the algorithms track applied to Dijkstra and Bellman-Ford: the invariant, the worked example with numbers, the complexity, and the failure mode (count-to-infinity, sequence-number wraparound, CRC blind spots, burst allowances, hot shards). Two lessons include coding exercises because these algorithms show up in interviews as implementation questions ("implement a rate limiter", "design consistent hashing").

You need the graph algorithms module; Dijkstra and Bellman-Ford are assumed and only their networking consequences are re-derived here.

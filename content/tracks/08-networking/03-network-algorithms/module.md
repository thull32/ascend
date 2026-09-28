---
slug: network-algorithms
title: Network algorithms
description: Routing, reliable delivery, error detection, rate limiting and consistent hashing as the graph and systems algorithms they really are.
prerequisites: [algorithms/graph-algorithms]
---
The internet is a set of algorithms that happen to run on routers. OSPF is Dijkstra with a flooding protocol attached; RIP is Bellman-Ford with a 15-hop cap; BGP is a path-vector protocol whose "metric" is a business policy. TCP's reliability is a sliding window with cumulative and selective acknowledgements. Every rate limiter you have configured is a token bucket, a leaky bucket or a sliding window, and every service mesh that routes by key uses a hash ring or a Maglev table.

This module takes each of those algorithms apart with the same rigour the algorithms track applied to Dijkstra and Bellman-Ford: the invariant, a trace on concrete data you could reproduce with pen and paper, the numbers, and the failure mode. Link-state and distance-vector routing run on one five-router topology, so you can watch Dijkstra converge in one flood and Bellman-Ford count to infinity on the same failure. Stop-and-wait, Go-Back-N and Selective Repeat are traced under one loss pattern, and the window-size rule is proved. The Internet checksum is computed on a captured packet and CRC-32 is traced bit by bit. Six rate limiters run on one request timeline, including the one Ascend uses. Consistent hashing, rendezvous hashing, Maglev and bounded loads are traced by hand and then measured.

Where a number can be measured, it was: TCP with and without SACK under loss, checksum and CRC miss rates over 200,000 corruptions, checksum and hash throughput, ring balance by virtual-node count. Every lesson has coding exercises, because these algorithms show up in interviews as implementation questions ("implement a rate limiter", "design consistent hashing", "simulate a sliding window").

You need the graph algorithms module; Dijkstra and Bellman-Ford are assumed and only their networking consequences are re-derived here.

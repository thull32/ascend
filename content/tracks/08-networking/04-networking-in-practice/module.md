---
slug: networking-in-practice
title: Networking in practice
description: "Latency math, timeout budgets, backoff, connection pools, packet-level debugging and service meshes: the operational craft of running services on a real network."
prerequisites: [networking/fundamentals, networking/application-protocols]
---
Knowing how TCP works does not, by itself, stop you from shipping a service with a 30-second default timeout, unbounded retries and a connection pool sized by guesswork. This module is the operational half of networking: how to compute a latency budget from RTT and bandwidth, how to set timeouts that compose across a call chain, how to retry without amplifying an outage, how to size a connection pool and order its idle timeouts, and how to read `curl -w`, `dig`, `mtr`, `ss` and a `tcpdump` capture when the dashboards disagree with the users.

Every lesson checks its arithmetic against measurements taken on a real Linux machine, most of them inside an unprivileged network namespace (`unshare -rn`) with `netem` adding delay or loss, so you can reproduce them without root: the window-limited throughput of a 50 ms path, slow start counted in round trips, what Linux does with a connect that never answers, 1,000 simulated clients retrying under five backoff strategies, the cost of a fresh TLS connection against a reused one, the one-round-trip race behind the classic load-balancer 502, and packet captures of a handshake, a refusal, an overflowing accept queue and a reset on a stale pooled connection.

The closing lesson on service meshes and proxies ties the stack back together: a sidecar terminates TLS, retries at L7, applies rate limits and emits traces, and you need to know how configuration reaches it, how it intercepts traffic, what it costs in latency and memory, and what it hides from your application.

Every lesson is written from the point of view of the engineer on call who has to explain to a director what "the network was slow" means and what they are changing so it does not happen again.

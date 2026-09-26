---
slug: networking-in-practice
title: Networking in practice
description: Latency math, timeout budgets, backoff, connection pools, packet-level debugging and service meshes: the operational craft of running services on a real network.
prerequisites: [networking/fundamentals, networking/application-protocols]
---
Knowing how TCP works does not, by itself, stop you from shipping a service with a 30-second default timeout, unbounded retries and a connection pool sized by guesswork. This module is the operational half of networking: how to compute a latency budget from RTT and bandwidth, how to set timeouts that compose across a call chain, how to retry without amplifying an outage, how to size and monitor a connection pool, and how to read `curl -v`, `dig`, `mtr` and a `tcpdump` capture when the dashboards disagree with the users.

The closing lesson on service meshes and proxies ties the stack back together: a sidecar terminates TLS, retries at L7, applies rate limits and emits traces, and you need to know what that costs in latency and what it hides from your application.

Every lesson here is written from the point of view of the engineer on call who has to explain to a director what "the network was slow" means and what they are changing so it does not happen again.

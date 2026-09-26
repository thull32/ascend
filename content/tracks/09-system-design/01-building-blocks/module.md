---
slug: building-blocks
title: System design building blocks
description: The fifteen components every large system is assembled from, each taught by mechanism, numbers and failure mode rather than by name.
prerequisites: [databases/relational-fundamentals, networking/application-protocols]
---
Every system you will be asked to design is assembled from the same short list of parts: stateless services behind load balancers, caches, a database that has to be scaled past one machine, queues, an API contract, telemetry, and the patterns that keep it up when parts of it are down. Interviewers at the senior bar do not want to hear that you know the names of these parts. They want to hear how each one works, what it costs, the specific way it fails, and what you would do at 3 a.m. when it does.

This module takes the parts one at a time. It opens with the interview method itself and with back-of-envelope estimation, because every later design decision is justified with arithmetic. It then works through scaling primitives, caching, database scaling, the consistency models that decide what clients actually observe, CAP and PACELC as decision tools rather than slogans, idempotency, queues, event-driven architecture, service boundaries, API design, observability, resilience patterns and security. Each lesson has at least one steppable visualisation of the core mechanism, a Mermaid diagram, real numbers, the failure modes, and the follow-up questions a Netflix-level interviewer would ask with the answers that earn the senior signal.

By the end you should be able to take any building block, explain it from the wire up, put a number on it, and say what you would not do and why. That is the foundation for the [distributed systems](/learn/system-design/distributed-systems/time-and-ordering) module, which goes underneath these blocks to the replication, consensus and coordination they are made of.

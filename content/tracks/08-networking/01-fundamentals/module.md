---
slug: fundamentals
title: Networking fundamentals
description: Layers, IP, DNS, UDP, TCP, congestion control and TLS explained by their actual header fields, timings and failure modes.
---
Everything above the wire is built on a handful of protocols that have not changed shape since the 1980s and 1990s, and every performance number you will ever quote in a design review comes from them. Speed of light in fibre sets the RTT. TCP's handshake and slow start decide how many round trips a request costs before any useful byte moves. DNS TTLs decide how fast a failover is visible. TLS decides whether that first request costs one extra round trip or zero.

This module goes through the stack in order: layering and encapsulation, IP addressing and routing, DNS, UDP versus TCP, a deep dive on TCP's state machine, congestion control, and TLS with certificates. Each lesson shows the real bytes (header layouts, `tcpdump` lines, `dig` output), the real math, and the production consequence that a senior engineer is expected to predict before the incident rather than diagnose after it.

You do not need prior networking coursework. You need to be comfortable reading hexadecimal, thinking in round trips, and being honest about what "the network is slow" actually means.

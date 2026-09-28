---
slug: fundamentals
title: Networking fundamentals
description: Layers, IP, DNS, UDP, TCP, congestion control, TLS, NAT and cloud networking explained by their header bytes, measured timings, kernel state and failure modes.
---
Everything above the wire is built on a handful of protocols whose shapes were fixed in the 1980s and 1990s, and every performance number you will quote in a design review comes from them. The speed of light in fibre sets the round-trip time. TCP's handshake and slow start decide how many round trips a request costs before a useful byte moves. DNS TTLs, and the caches that ignore them, decide how fast a failover becomes visible. TLS decides whether the first request costs one extra round trip or none. A NAT gateway's idle timer decides whether yesterday's pooled connection still works this morning.

The module goes through the stack in order: layering and encapsulation, IP addressing and routing, DNS, UDP versus TCP, TCP's state machine and timers, congestion control, TLS and certificates, and finally NAT, firewalls and cloud networking, where all of the above meets a VPC and a bill. Each lesson takes real bytes apart (an HTTPS packet's headers, a DNS message, a TLS record, a certificate chain), uses numbers measured on a real machine (`curl` timing, `ss -ti`, kernel sysctls, a traced upload), traces each mechanism step by step, and ends with the production failures a senior engineer is expected to predict before the incident rather than diagnose after it.

You do not need prior networking coursework. You need to be comfortable reading hexadecimal, thinking in round trips, and being precise about what "the network is slow" actually means.

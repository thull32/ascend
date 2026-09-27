---
slug: system-design
title: System Design
description: "Design, defend and operate systems at Netflix scale: the building blocks, the distributed-systems theory behind them, eighteen worked case studies and the judgement that separates senior from mid-level."
icon: server
phase: 5
---
The system design round is where senior offers are won or lost. Coding rounds have a ceiling: past a certain level everyone solves the problem. Design rounds have no ceiling, and the difference between "designed a URL shortener with a cache" and "explained why the cache needs request coalescing, what happens when the shard for a hot key fills, and which of the two consistency guarantees the product can actually live without" is precisely the difference between a mid-level and a senior signal.

This track is built to close that gap. The first module gives you the building blocks with their mechanisms and failure modes: how a cache stampede actually happens, why "exactly once" is a property of the consumer and not the queue, what CAP does and does not say, what an SLO buys you that a dashboard does not. The second module goes underneath: clocks and ordering, replication and quorums, Raft and Paxos, two-phase commit and sagas, leases, fencing tokens, gossip and CRDTs. These are the ideas the building blocks are made of, and they are what interviewers probe when they want to know whether you understand the system or merely its vocabulary. The third module works eighteen full designs end to end, and the fourth teaches the senior craft of articulating trade-offs, designing for failure and presenting under time pressure.

Every lesson carries concrete numbers (latencies, throughputs, storage sizes), at least one steppable visualisation of the mechanism, a Mermaid diagram of the architecture, the ways the design fails, and the follow-up questions a Netflix-level interviewer asks along with the answers they are hoping to hear. It assumes you have been through [Databases Inside Out](/learn/databases/relational-fundamentals/the-relational-model) and [Networking from Wire to Web](/learn/networking/application-protocols/http-1-1); it connects forward to [Big Data & Streaming](/learn/big-data/batch-processing/mapreduce) and to the senior-craft track on design docs and technical leadership.

---
slug: distributed-systems
title: Distributed systems
description: The theory underneath the building blocks: clocks, replication, consensus, transactions, partitioning, failure detection, locks, exactly-once, gossip and CRDTs, with the real systems that implement them.
prerequisites: [system-design/building-blocks, systems/concurrency]
---
A distributed system is one in which a machine you have never heard of can fail and take your work down with it. Everything hard about them follows from three facts: there is no shared clock, messages can be delayed or lost, and a node that has stopped responding is indistinguishable from one that is merely slow. Replication, consensus, leases, fencing tokens, idempotent producers and CRDTs are all responses to those three facts, and the senior bar is being able to say which fact each one is answering.

This module builds the theory in the order the ideas depend on each other. Time and ordering first, because "happened before" is the foundation for every later argument. Then replication and quorums, and the moment you realise a quorum alone does not give you consensus. Raft in full, with Paxos and ZAB as the intuition behind it. Distributed transactions and why two-phase commit is both indispensable and dangerous. Partitioning and rebalancing, failure detection and leases, distributed locks and the Redlock argument, exactly-once semantics as they really exist, gossip and anti-entropy, and finally CRDTs and the collaboration systems built on them.

Each lesson names the production system that embodies the idea (etcd, ZooKeeper, Kafka, Cassandra, DynamoDB, Spanner, Google Docs), gives the numbers that matter (election timeouts, quorum sizes, replication lag), steps through the mechanism in a visualisation, shows how it fails, and ends with the follow-up questions a Netflix-level interviewer uses to find out whether you have actually run one of these things.

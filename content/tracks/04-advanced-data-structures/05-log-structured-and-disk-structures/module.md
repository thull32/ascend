---
slug: log-structured-and-disk-structures
title: Disk-oriented structures
description: Write-ahead logs, LSM trees, the B-tree versus LSM trade-off, Merkle trees and ring buffers, with the amplification numbers that decide which one your storage engine should use.
prerequisites: [advanced-data-structures/balanced-trees]
---
Everything in the previous modules assumed memory: a pointer dereference costs nanoseconds and a crash loses nothing you care about. Storage engines live in a different world. A disk write is only durable after an `fsync`, an 8 KB page can be half-written when the power goes, a random write on an SSD costs orders of magnitude more than a sequential one, and every byte you write once gets rewritten many times by the structure that stores it.

This module is about the structures that were designed for that world. The write-ahead log turns random page updates into a sequential stream and is the reason a committed transaction survives a crash. The LSM tree takes the same idea further and makes the whole database a set of sorted, immutable files that are merged in the background. The third lesson puts the LSM tree and the B-tree side by side with read, write and space amplification numbers so you can pick one for a workload instead of a brand. The last lesson covers two structures that are small on the page and everywhere in practice: the Merkle tree that lets two replicas find what differs without shipping their data, and the ring buffer that carries packets, log lines and audio frames between threads without a lock.

By the end you can explain why Postgres and RocksDB made opposite choices, size a compaction strategy for a write-heavy workload, and answer the storage-engine follow-up in a system design interview with numbers rather than names.

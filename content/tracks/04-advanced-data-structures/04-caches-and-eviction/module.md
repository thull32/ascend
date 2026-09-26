---
slug: caches-and-eviction
title: Caches and eviction policies
description: Build an O(1) LRU and LFU cache by hand, understand what Redis, Caffeine, Postgres and CDN edges actually evict, and learn the hit-ratio, TTL and stampede maths that decide whether a cache helps or hurts.
prerequisites: [data-structures/hashing, data-structures/linked-lists]
---
A cache is the most common performance fix in software and the most common source of "it worked in staging" incidents. The data structure at its core is small: a hash map for O(1) lookup, glued to something that remembers an order so you know what to throw away when the memory runs out. The choice of that "something" is the eviction policy, and it decides your hit ratio, which decides your backend load, which decides whether the service survives a traffic spike.

This module builds the two classic policies from scratch. LRU is the interview standard: a hash map plus a doubly linked list, every operation O(1), and a design you must be able to write on a whiteboard without pausing. LFU is the follow-up: O(1) too, with frequency buckets, and it is the door into the modern policies (ARC, 2Q, W-TinyLFU) that real caches use, along with what Redis and Postgres approximate instead of implementing exactly.

The last lesson steps back from the structure to the system: the arithmetic that turns a hit ratio into backend load and tail latency, how to size a cache and choose TTLs, why a single hot key expiring can take down a database, and the situations where adding a cache makes everything slower. It connects to the [caching strategies](/learn/system-design/building-blocks/caching-strategies) lesson in system design and the [caching layers](/learn/databases/data-modeling-and-evolution/caching-layers) lesson in the databases track, which cover where caches sit in an architecture; this module covers what is inside them.

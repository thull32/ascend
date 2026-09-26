---
slug: advanced-data-structures
title: Advanced Data Structures
description: The structures inside Postgres, RocksDB, Cassandra, Redis and every CDN, built by hand so you can size them, break them and defend them in a design review.
icon: box
phase: 2
---
Core data structures get you through a coding round. Advanced data structures are what you meet when you open a production system: the B+ tree behind every Postgres index, the LSM tree and bloom filters inside RocksDB and Cassandra, the skip list that orders a Redis sorted set, the LRU and LFU policies that decide what a CDN edge keeps, the write-ahead log that makes a commit durable, the Merkle tree that lets two replicas find what differs without shipping their data.

This track builds each of those from first principles, with numbers. You will implement a Fenwick tree and a segment tree, an O(1) LRU cache, a bloom filter with a sizing formula you can defend, an Aho-Corasick automaton and a suffix array. For every structure you will see the read, write and space costs, the failure mode that shows up at 3 a.m., and the question a senior interviewer asks after you give the textbook answer.

It assumes the [Core Data Structures](/learn/data-structures/trees/tree-fundamentals) track, especially trees, hashing and linked lists, and it feeds directly into the storage-engine, caching and distributed-systems lessons later in the roadmap.

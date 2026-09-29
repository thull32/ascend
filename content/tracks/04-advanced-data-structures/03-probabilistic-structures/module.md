---
slug: probabilistic-structures
title: Probabilistic data structures
description: "Bloom filters, count-min sketches, HyperLogLog and MinHash: trade a bounded, calculable error for a thousand-fold saving in memory."
prerequisites: [foundations/math-for-engineers]
---
Every structure you have built so far gives exact answers. That exactness has a price: to answer "have I seen this key?" exactly you must store every key, and to answer "how many distinct users today?" exactly you must store every user. At a billion keys that is tens of gigabytes per question, per node.

Probabilistic structures answer the same questions with a small, *calculable* error in exchange for a memory footprint that barely depends on the number of items. A Bloom filter answers membership in about 10 bits per key with a 1% false-positive rate. HyperLogLog counts a billion distinct items to within 1% in 12 KB. A count-min sketch finds the heaviest hitters in a stream of any size in a few kilobytes. MinHash compares a billion documents for near-duplicates without comparing every pair.

These are not academic curiosities. They sit in the read path of RocksDB, Cassandra and every LSM-based store, in Redis (`PFCOUNT`), in BigQuery (`APPROX_COUNT_DISTINCT`), in CDN admission policies (and, once, in Chrome's Safe Browsing check), and in the deduplication step of every large web-scale data pipeline. This module builds each one from its hash functions up, derives the error bounds you will be asked to defend, and shows where each one lives in production and where it is the wrong tool.

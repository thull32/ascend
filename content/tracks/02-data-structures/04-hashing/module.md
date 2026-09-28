---
slug: hashing
title: Hashing
description: From hash functions to hash tables to consistent hashing, traced by hand on real hash values and grounded in what CPython, Rust, Java, Go, Redis and Cassandra actually do, with the failure modes that separate senior engineers from everyone else.
prerequisites: [foundations/math-for-engineers]
---
Hashing is the most-used idea in software you did not write. It powers dictionaries, sets, caches, deduplication, sharding, load balancing, content addressing and blockchains. Interviewers expect you to reach for a hash map instinctively; senior interviewers expect you to know when the O(1) promise breaks, how adversarial input turns a hash map into a denial-of-service vector, what a table costs per entry, and how the same idea scales out across a thousand machines.

This module builds hashing up from the mathematics of a good hash function (polynomial, FNV-1a and Fibonacci hashing traced to the bit, the XOR trap, SipHash and HashDoS), through the two families of hash table and their real implementations (a probe cluster forming on real hash values, CPython's two-array dict with its byte counts, SwissTable's 16-tag SIMD probe, Java's treeified chains, Go's Swiss maps, V8's dictionary mode), into the interview pattern family with state-table traces, the ordered alternatives (red-black trees, B-trees, skip lists, `bisect`) with their per-lookup cache-miss costs, and finally consistent, rendezvous, jump and Maglev hashing for distributed systems, each traced on a small ring or table, with Bloom filters and sharding-key design.

Every lesson ends with production failure modes (symptom, diagnosis, fix), the follow-up questions a senior interviewer asks next, and one or two exercises whose tests you can reproduce from the traces in the text.

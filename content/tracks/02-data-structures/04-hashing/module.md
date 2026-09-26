---
slug: hashing
title: Hashing
description: From hash functions to hash tables to consistent hashing, with the failure modes that separate senior engineers from everyone else.
prerequisites: [foundations/math-for-engineers]
---
Hashing is the most-used idea in software you did not write. It powers dictionaries, sets, caches, deduplication, sharding, load balancing, content addressing and blockchains. Interviewers expect you to reach for a hash map instinctively; senior interviewers expect you to know when the O(1) promise breaks, how adversarial input turns a hash map into a denial-of-service vector, and how the same idea scales out across a thousand machines.

This module builds hashing up from the mathematics of a good hash function, through the two families of hash table (chaining and open addressing) and their real implementations, into the interview pattern family, ordered alternatives, and finally consistent hashing for distributed systems.

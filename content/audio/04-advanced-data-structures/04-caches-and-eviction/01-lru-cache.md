---
lesson: lru-cache
source: 4aa53462a8f088cd
fit: partial
desk:
  - "The capacity-2 trace with every pointer write, and the sentinel-based implementation"
  - "The standard-library versions: OrderedDict, LinkedHashMap, the JavaScript Map version, and why dict and Map eviction is not constant time"
  - "Inside CPython: OrderedDict's fast-nodes array, and the lru_cache root-rotation trace"
  - "The per-entry memory table and the nanoseconds-per-hit table"
  - "The trade-offs and failure-modes tables"
  - "Exercises: implement a constant-time LRU cache; LRU bounded by weight, not by count; then the LRU Cache practice problem"
---
## Introduction

You have a slow source, a database, a remote API, a disk, and a fixed amount of fast memory. You want a get that returns the cached value if it is there, a put that stores one, and both in constant time. When memory is full you have to throw something away, and it should be the thing least likely to be needed again.

Least recently used, LRU, guesses "the entry nobody has touched for the longest time". It is the default because access has temporal locality: what was used recently tends to be used again. The design problem is that "least recently used" is an ordering. Hash maps have no order, and ordered structures have no constant-time lookup.

Three ideas: how two structures compose to give you both, what that costs per entry once the cache is big, and why almost no production system actually runs textbook LRU.

## Why one structure is not enough

A hash map gives you get and put in constant time. But when it is full, finding the oldest key means scanning every entry's timestamp. Linear time.

A list ordered by recency tells you the oldest entry instantly, because it is at one end. But finding the entry for a given key means walking the list. Linear again.

Put them together. The hash map stores each key pointing to a node, and the nodes live in a doubly linked list ordered by recency, most recent at the front. A lookup goes through the map straight to the node. Moving that node to the front is constant time, and here is the sentence interviewers want to hear: it is constant because the list is doubly linked. You can unlink a node given only a pointer to it, since it knows both its neighbours. A singly linked node does not know its predecessor, and unlinking has to update the predecessor's next pointer. Evicting is "unlink the tail node, and delete its key from the map".

That is the invariant: the map and the list always hold exactly the same keys, and the list order is recency order.

## The mechanism, said aloud

Picture a cache of capacity 2. Put key 1, then key 2. The list, most recent first, is 2, then 1. Now get key 1. It is a hit; key 1 moves to the front, and the list is 1, then 2.

Now put key 3. The cache is full. Before I say it: which key gets evicted?

[pause]

Key 2. It is at the tail, because the get refreshed key 1. Unlink key 2, delete it from the map, push key 3 to the front. The list is 3, then 1. A get on key 2 now misses, and changes nothing.

Count the work on a hit: two pointer writes to unlink, four to push to the front. Six pointer writes and one or two hash operations, never more, regardless of capacity. That is what constant time means here.

Three details decide whether an implementation is correct. Use two sentinel nodes, a head and a tail that are never removed, so the list is never empty and there are no special cases for the first or last node. Store the key in the node as well as the value, because eviction finds the victim through the list, and it needs the key to delete the map entry. And a put on a key that already exists must update the value and refresh it, not insert a second node. If it inserts a second node, the map has one entry and the list has two; when the stale node reaches the tail, eviction deletes the key from the map while the fresh node is still near the front. A live entry disappears.

## What your standard library gives you

Every mainstream language has this built in, and what matters is where it stops being constant time.

Python's OrderedDict is a hash map plus a doubly linked list, written in C. Move to end is the refresh, pop item from the front is the eviction, both constant. And the LRU-cache decorator in functools is the same design wrapped around a function. Java's LinkedHashMap with access order turned on gives you an LRU cache in five lines.

The trap is using a plain Python dict or a JavaScript Map, which also remember insertion order. Refreshing is fine. But evicting by taking the first key is not constant time, because deleted entries stay as holes at the front of the internal array until the next resize, and every eviction walks past them. In CPython, that eviction took about a fifth of a microsecond at a thousand entries and nearly 12 microseconds at a hundred thousand, against roughly 50 to 75 nanoseconds for OrderedDict. So in Python use OrderedDict or the LRU-cache decorator, and in JavaScript keep an explicit node list for large caches.

One clever detail inside the pure-Python version of that decorator. When the cache is full and a new key arrives, it writes the new entry into the old root of its circular list, and empties the oldest entry to become the new root. The eviction writes no pointers at all, and allocates nothing.

And two decorator traps that show up in production. Decorate a method, and self is part of every key, so the cache keeps every instance alive; a long-running worker grows until it is killed. And the default max size is 128; if your working set is bigger, every call misses and still pays for building the key and evicting.

## What an entry really costs

Two pointers per entry sound cheap. Then the cache holds fifty million small entries.

In CPython, a hand-written node costs about 106 bytes per entry including the dict, OrderedDict about 91, and the LRU-cache decorator about 98. Java's LinkedHashMap entry is 40 bytes, before the boxed key and value. At fifty million entries, the hand-written CPython nodes alone are 3.2 gigabytes, on top of the map and the payload. Quote constant time and ignore a hundred bytes per entry, and your capacity plan is off by five times.

Speed, too. On the lesson's machine, a decorator hit cost about 21 nanoseconds, the hand-written Python class about 77. In CPython the C structures win, because every pointer assignment in Python is a descriptor store with reference counting. In Node the ranking flips: the hand-written node list was 18 nanoseconds, and the Map version 50.

That memory, plus the write every get performs to move a node, is why real systems avoid the list, or stop moving nodes on every read.

## What real systems do instead

Redis keeps no list at all; the pointers would cost 16 bytes per key. Each object carries a 24-bit clock of its last access. To evict, Redis samples five random keys by default, keeps a pool of 16 good candidates across samples, and evicts the idlest. With 10 samples, the hit ratio is nearly indistinguishable from exact LRU.

The bigger problem with pure LRU is scans. A single pass over a large dataset, an analytics query, a backup, touches every key once. LRU promotes each one to the front and evicts the entire working set for data that will never be read again. That is scan pollution, and it is the classic symptom: the hit ratio collapses every night at 2 and recovers by 8.

The defences all add a probation area. The Linux page cache keeps an inactive and an active list; a page is promoted to active only on a second touch, so a one-off scan fills and drains the inactive list and never displaces the working set. InnoDB inserts a new page about three eighths of the way from the tail, and promotes it only if it is touched again after a second has passed. memcached splits each LRU into hot, warm and cold, and bumps an item at most once a minute, so a hot item costs no list writes between bumps. Postgres skips LRU entirely for a clock sweep, and gives large sequential scans their own small ring buffer.

None of these implements the textbook list. When you propose an LRU cache in a design review, say which approximation you mean and what protects it from scans.

## In the interview

The classic follow-up: make it thread-safe.

[pause]

A single lock is correct, but it serialises every get, which is the wrong shape for a structure that exists to make reads fast; throughput stops scaling past a few threads. Shard the map into segments, each with its own lock, as Guava does. Or, like Caffeine, record reads in a lock-free buffer and drain it in batches to update the order. The order is then approximately LRU, which is fine, because LRU was only ever a heuristic. The wrong answer is wrapping get and put in a lock and stopping there.

Two more the lesson expects. Add a TTL: store an expiry in each node, treat an expired entry as a miss on get, and add a periodic sweep, because dead entries otherwise sit in memory until touched. Redis samples 20 keys with TTLs ten times a second. Not a timer per entry. And bound by bytes, not entries: track total weight, evict from the tail until the new value fits, and reject a value heavier than the whole budget rather than emptying the cache for it.

## Recap

Four things to remember. A hash map for lookup plus a doubly linked list for recency, because unlinking needs the predecessor; six pointer writes per hit. Use sentinels, store the key in the node, and update rather than duplicate on put. Constant time still costs around a hundred bytes per entry in CPython and 40 in Java, and a plain dict or Map is not a constant-time LRU. And pure LRU dies on scans, so real systems sample, like Redis, or add a probation area, like Linux, InnoDB and memcached.

At your desk: the pointer-by-pointer trace and the implementation, the library versions and their CPython internals, the memory and speed tables, the failure modes, and the two exercises, a constant-time LRU and an LRU bounded by weight, then the LRU Cache problem.

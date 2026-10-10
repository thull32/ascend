---
lesson: key-value-stores-and-redis
source: 404972c347936742
fit: great
desk:
  - "The event-loop trace of one GET, step by step"
  - "The encoding thresholds table and the hash crossing from listpack to hashtable"
  - "The sliding-window Lua script and its trace"
  - "The LFU counter table and the cluster hash-slot table with hash tags"
  - "Exercises: compute a Redis Cluster hash slot; replay a sliding-window-log rate limiter"
---
## Introduction

Your Postgres primary serves a session lookup in about a millisecond, and you need it in 50 microseconds, because it runs on every request. Your leaderboard query sorts ten million rows, and you want the top ten in constant time. Your rate limiter needs an atomic increment with an expiry, from two hundred service instances at once.

The relational engine can do each of these jobs and is good at none of them. Each one drags a disk-oriented storage layer, a query planner and multi-version bookkeeping through work that a hash map in memory simply does not need.

Redis is what you get when you keep the data structures and throw away the rest. Why that makes it fast also explains how it becomes slow, loses data, runs out of memory, and outgrows one process. Four ideas, then: the single thread and its one rule, what a key really costs in memory, how persistence trades durability for memory, and how eviction and cluster slots actually work.

## One thread, one rule

Redis executes commands on one thread, so the keyspace needs no lock. Every command runs to completion before the next one starts. That is what makes increment atomic, what makes set-if-not-exists a valid lock primitive, and what makes a Lua script an all-or-nothing unit with no transaction machinery at all.

Picture one GET going through the event loop. The loop wakes because a socket is readable, reads the bytes, parses the request, looks up the command, then hashes the key and follows one pointer to the value. That lookup is a few hundred nanoseconds. Everything else is system calls and parsing. That is why pipelining matters: a hundred commands in one packet share one read and one write. On one modern core, simple commands run at roughly 100 to 200 thousand a second without pipelining, and over a million with it.
Since Redis 6, I/O threads can spread socket reads, writes and parsing across cores. Command execution still stays on the main thread. One executor, memory only.

Here is the most important Redis rule. A command that takes 10 milliseconds blocks every client for 10 milliseconds. The KEYS command over 50 million keys walks the whole dictionary and stalls for seconds. Listing every member of a 5-million-member set serialises 5 million strings into one reply. Deleting a hash with millions of fields frees millions of allocations on the main thread, which is why UNLINK hands that work to a background thread instead.

So when the 99th percentile spikes, read the slow log first. And use the SCAN family of commands, which walk the keyspace with a cursor, instead of anything that touches everything at once.

## What a key costs

Each key carries bookkeeping before its payload: a bucket slot, a dictionary entry of three pointers, a length-prefixed key string, and a 16-byte object header. A key with a TTL gets a second entry in a separate expiry table. The allocator rounds everything up to a size class, so a short string key costs on the order of 50 to 100 bytes of overhead. For a hundred million small keys, that is 5 to 10 gigabytes before a single byte of value.

That arithmetic is why every type has a compact encoding for small values. A small hash, sorted set or list is stored as a listpack: one contiguous block of memory, scanned linearly. The thresholds to remember: a hash stays compact up to 512 fields, a sorted set up to 128 members, and either converts the moment any field or value goes over 64 bytes. A short string up to 44 bytes lives in one allocation with its header, because 16 plus 3 plus 44 plus a terminator is exactly 64 bytes, one allocator size class.

Now picture a hash with 512 short fields. It takes about 7 kilobytes. Add a 513th field, and it converts to a real hashtable, roughly 70 bytes per field instead of about 13. It is now about 36 kilobytes. That is a fivefold jump. Delete fields back down to 10, and it stays a hashtable. Hashes and sets do not convert back while the server runs; only a restart re-encodes them.

[pause]

So if memory grows fivefold after a launch and the key count did not change, suspect a threshold: a 65-byte field, a 513th hash field, a 129th sorted-set member. Instagram used this deliberately in 2011, bucketing hundreds of millions of mappings into hashes of a thousand fields, and reported roughly a fourfold memory saving over one key per mapping.

Past 128 members, a sorted set becomes a skiplist plus a dictionary from member to score. Each pointer in the skiplist records how many nodes it skips, so summing those on the way down gives a member's rank in logarithmic time. With ten million players, the top ten is a descent of about 12 levels plus ten steps. In a relational database, asking how many players are above bob is a count over every row above him.

## A rate limiter, and its two bugs

Rate limiting needs atomicity across several operations from many clients. The first version most teams write is a fixed window: increment a counter keyed by user and minute, and if this was the first increment, set an expiry.

Two bugs hide in it. First, the increment and the expiry are two round trips. If the process dies between them, the key never expires, and without the window in the key's name that user is locked out for good. Send both in one transaction, or use a script. Second, the boundary. A hundred requests at one second before the minute and a hundred more just after it are all allowed: 200 requests in a fifth of a second against a limit of 100 a minute.

The sliding-window log closes that gap. Each accepted request's timestamp goes into a sorted set, inside one Lua script: remove entries older than the window, count what is left, and add the new one only if the count is under the limit. Because the script runs on the single thread, no other client's remove, count and add can interleave.

The price is memory: up to the limit's worth of entries per user. At 100 entries of about 40 bytes and a million active users, that is about 4 gigabytes, where a token bucket in a small hash costs constant memory. And take the time from one clock only, the caller's or the server's, never both.

## Persistence: snapshots and the append-only file

Snapshots first. Redis forks a child process, which writes the whole dataset to a file while the parent keeps serving. Copy-on-write gives the child a frozen image: parent and child share every memory page until the parent writes to one, and then the kernel copies that page.

Work it for a 30 gibibyte instance whose snapshot takes 100 seconds. The fork itself copies the page tables, about 60 mebibytes, and stops the main thread for roughly 300 to 400 milliseconds. During the 100 seconds, 20 thousand writes a second land on random keys, 2 million writes. With normal 4-kilobyte pages, they touch about 1.8 million of 7.9 million pages, so the copy costs about 6.7 gibibytes of extra memory.

Now turn on transparent huge pages. Pages are 2 megabytes, and there are only about 15 thousand of them. Before I say it: how much gets copied?

[pause]

All of it. Two million random writes touch every huge page, the whole 30 gibibytes is duplicated, and the host needs 60. That is why Redis warns about huge pages at startup, why you leave 20 to 50 percent headroom, and why a 30 gibibyte Redis on a 48 gibibyte host gets killed during a snapshot. And snapshots lose everything since the last one completed: a minute to an hour of writes.

The append-only file logs every write command. Redis writes it to the file before sending replies, so an acknowledged write is at least in the kernel's page cache. A process crash, even an out-of-memory kill, loses nothing acknowledged. The fsync setting only matters for power loss or a kernel crash: "always" loses nothing acknowledged, "every second", the default, loses about a second, up to two if the disk stalls, and "no" can lose about 30 seconds.

But replication is asynchronous, so a failover can lose more than any of that. State durability in units: about a second on power loss, plus unreplicated writes on failover. The same arithmetic breaks locks: a failover that loses the lock key hands the lock to a second holder, which is why distributed locks need fencing tokens.

## Eviction, slots and hot keys

Without a memory limit, Redis grows until the kernel kills it. With one, it evicts according to a policy. The default is no eviction at all, which makes writes fail. For a cache, that is wrong; use an all-keys policy.

Redis's LRU is approximate. Instead of a linked list, each key stores a 24-bit clock. To evict, Redis samples five keys, keeps a small pool of the idlest candidates seen so far, and evicts the idlest. With ten samples it is hard to tell from exact LRU.

LFU reuses the same 24 bits as a logarithmic counter that also decays. A new key starts at 5. Each access bumps it with a falling probability: it reaches about 10 after 100 accesses, and 18 after a thousand. Every idle minute takes one off. Here is why that matters. A nightly report that reads every product key once moves a cold key from 5 to 6. The hot keys sit at 18 or more, so they survive. Under LRU, the report's keys would be the most recent, and the hot keys would be the ones thrown out.

One more trap: a million keys given the same TTL at deploy time all expire in the same second and compete with real traffic. Add jitter.

One process is bounded by one core and one machine's memory. Replicas with Sentinel give failover and read scaling, but do not shard. Redis Cluster does: the keyspace is 16,384 hash slots, and a key's slot is a checksum of the key modulo 16,384. The number is a message-size choice: every gossip heartbeat carries slot ownership as a bitmap, and 16,384 bits is 2 kilobytes.

A client that asks the wrong node gets a MOVED reply naming the owner, retries there, and caches the slot map. During a resharding, a key already moved gets an ASK reply instead: go to the new node once, but do not update the map yet.

Multi-key operations, a transaction or a script touching two keys, fail unless every key is in the same slot. Hash tags fix that: only the part of the key inside the first curly braces is hashed. Tag by the entity that must be atomic, such as one customer. Tag by type, all orders together, and every order in the system lands in one slot on one node, which turns your cluster back into one Redis.

And hot keys. A flash sale sends 500 thousand reads a second to one 2-kilobyte product key. That key lives on one primary whatever the shard count. It needs several times one core's throughput, and a gigabyte a second, most of a 10-gigabit network card. The escapes, cheapest first: client-side caching with a one-second TTL turns 500 thousand reads into a few hundred; read replicas add a core and a network card each; or store several copies and read one at random, checking the copies actually land on different nodes. Adding shards does nothing for one key.

## In the interview

Redis is single-threaded. How does it do a million operations a second, and when does it not?

[pause]

Commands touch memory only, one event loop multiplexes the sockets, pipelining amortises system calls, and I/O threads offload socket work. The ceiling is one core's command execution, and one slow command stalls everyone. The wrong answer is "it has been multi-threaded since Redis 6", which confuses I/O threads with execution.

And: can Redis be the system of record? State the loss in units: about a second on power failure with fsync every second, plus unreplicated writes on failover, which waiting for a replica acknowledgement narrows but does not close. If that is acceptable for the data, yes. Otherwise, keep the record in a database. "Yes, turn on the append-only file" ignores failover.

## Recap

Five things to remember. One thread means no locks and atomic commands, and also that any slow command stalls every client: read the slow log, use cursors. Budget 50 to 100 bytes of overhead per key, and know that crossing 512 hash fields, 128 sorted-set members or 64-byte values costs about five times the memory, one way. Do copy-on-write arithmetic with huge pages off before sizing a host. Choose LFU when scans would flush the cache. And tag cluster keys by entity, not type; adding shards never fixes one hot key.

At your desk: the event-loop trace, the encoding and slot tables, the rate-limiter script, and the two exercises, computing a hash slot and replaying the sliding-window limiter.

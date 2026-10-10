---
lesson: url-shortener
source: dc10287b11db5710
fit: great
desk:
  - "The estimates and machine-count tables, worked line by line"
  - "The base 62 encoder and the Feistel permutation code"
  - "The create-through-a-collision and click-to-dashboard traces"
  - "Exercises: a fixed-width base 62 encoder, and minting keys with bounded retries"
---
## Introduction

Design a URL shortener. It is the most common warm-up prompt in system design, and it catches experienced engineers because it looks easy: a map from a short string to a long one, a cache in front, done. At 100 million links a month, that easy answer is roughly right.

At 500 million links a month, three things break it. The link data outgrows one node over its retention period. Customers want click analytics within minutes. And one link sent in a push notification to 50 million phones can take half of all redirect traffic.

So there are three hard problems, and they are the three deep dives. Generating unique, unguessable keys without coordinating on every write. Serving 60 thousand redirects a second when one key takes 30 thousand of them. And counting every click without putting a write on the redirect path.

## Requirements and the numbers

Start with the requirements, said out loud. Create a short link, with an optional custom alias and expiry. Redirect. Show per-link clicks by day, country and referring domain, within five minutes. And disable: the owner or trust and safety can kill a malware link, and it stops redirecting everywhere within one minute. State what is out of scope, too. Editing a destination is excluded on purpose: it turns a cache with one invalidation case into a consistency problem, and it lets an attacker swap a vetted destination for a bad one.

The non-functional side. Redirects under 20 milliseconds at the 99th percentile, server-side, because a redirect is pure overhead on the way to someone else's page. Four nines of availability for redirects, about 52 minutes a year, because a broken redirect breaks every printed flyer carrying it. A returned link is never lost, never re-pointed, and its key is never reused. And keys must be unguessable, because people shorten links to private documents.

Now the numbers. 500 million links a month is about 190 creates a second on average, 600 at peak. Each link gets about 100 redirects, so that is roughly 20 thousand redirects a second on average and 60 thousand at peak. At 500 bytes a link, storage grows 3 terabytes a year: 15 terabytes over five years, 45 with three replicas. That alone rules out one database primary.

Here is the sentence that matters. The link table grows 3 terabytes a year. The click log grows 120 terabytes a year. The read-heavy system hides a write-heavy twin forty times larger. So raw clicks are kept for 30 days and daily rollups for the life of the link.

Size each tier by what binds it. Redis holds about 150 gigabytes of hot links, so it is sized by memory, not throughput: four primaries and four replicas, each primary doing about 15 thousand operations a second against a ceiling near 100 thousand. The link store is sized by bytes: six nodes, growing to about 24. The redirect fleet is 50 instances, sized so that losing one of three zones still leaves headroom. Kafka needs three brokers.

The architecture, in words. A browser hits a load balancer, then a stateless redirect service with a small in-process cache, then Redis, and the link store only on a double miss. The redirect path never waits on Kafka. Creation is a separate service behind an API gateway, its own failure domain, so a bad deploy of the create path cannot take redirects down. A safety scanner checks destinations after creation and disables what it flags. And click counts flow from the redirect fleet into Kafka, a stream aggregator, and a columnar store that the stats API reads.

## Deep dive one: the keys

Every approach ends the same way: an integer encoded as seven characters from a 62-letter alphabet, digits plus lower and upper case. The approaches differ in where the integer comes from.

First, why seven characters and not six? Over five years you mint about 30 billion keys. Seven characters give 3.5 trillion, so the space is 0.85 percent full. Six characters give 57 billion, which technically fits, but by year five the space is 53 percent full. Before I say why that is bad, think about it from both sides.

[pause]

At 53 percent, half of all random draws collide, so retries climb. And half of an attacker's guesses land on a live link. At 0.85 percent, both problems vanish. Do the key-space arithmetic in both directions: collision rate for you, hit rate for an attacker.

Now the sources. Hashing the long URL is wrong here: two people who shorten the same URL get the same key, but each link has its own owner, expiry, disable switch and analytics. Salt the hash with the owner, and you have rebuilt random keys that still need a collision check.

A global counter is unique by construction but sequential. Anyone can walk the space, and a competitor who creates one link on Monday and another on Tuesday subtracts the two and learns your daily volume.

The chosen design: random seven characters with a conditional put, an insert that only succeeds if the key is absent. A conflict's probability is just the fraction of the space in use, under 1 percent, so needing three or more attempts is about seven in a hundred thousand. In the lesson's trace, a collision in year five cost one extra 5 millisecond round trip.

The alternative worth knowing: counter ranges plus a keyed permutation. Each create instance leases 10 thousand integers at a time, then runs each through a secret-keyed scramble that is a one-to-one mapping, so outputs never repeat and never look sequential. No read before the write, and the 40-bit space lasts about 180 years at 6 billion links a year. Choose it when conditional writes are expensive, or when creation goes active-active.

One ordering detail that interviewers notice. A mobile client retries on timeout, so every create carries an idempotency key, and the service claims that key before inserting the link, not after. A retry then hits the pending claim and waits or gets a conflict, instead of minting a second link.

## Deep dive two: the redirect and the viral link

The status code decides who else caches your responses. A three-oh-one, moved permanently, is cached by browsers heuristically, often for a long time, so repeat clicks are invisible and you cannot disable the link for anyone who cached it. The disable-within-a-minute and analytics requirements rule it out. So the service returns a three-oh-two with no freshness headers. Some public shorteners pick three-oh-one for search-engine reasons and accept the analytics loss; name it as a trade-off.

Three cache layers, each for a reason. An in-process LRU of the top 100 thousand keys with a 10 to 12 second jittered TTL, for the viral link. Redis, cache-aside, a 24 hour jittered TTL, for the working set. And the store, only on a double miss. An in-process hit costs about half a millisecond server-side, a Redis hit about one, a double miss 3 to 6. All inside the 20 millisecond budget.

Now the viral link. A push notification goes to 50 million phones and 30 thousand requests a second arrive for ten minutes, 600 a second on each of 50 instances. In the first second, each instance misses once and asks Redis: 50 reads in total. For the next ten seconds, every request is an in-process hit. When entries expire at jittered times, Redis sees about five reads a second for that key. Steady.

Here is the counterfactual. Without the in-process layer, all 30 thousand reads a second land on one Redis primary, about 30 percent of its capacity, and every other key on that node queues behind it. Redis Cluster puts each key in one slot on one primary, so the size of the cluster is irrelevant for one key. Adding nodes does nothing.

Request coalescing, single-flight, matters less than it sounds at this rate, because with a half-millisecond fetch there is almost no overlap. It matters when the fetch is slow. If the hot node is saturated and a read takes 50 milliseconds, about 1,500 requests across the fleet pile onto the struggling node, and single-flight turns them into 50.

Two more pieces. Unknown keys are cached as absent for 60 seconds, so an enumeration run or a typo in a newsletter does not reach the store. And because links are immutable, invalidation is cheap: a disable writes the status, deletes the Redis key, and publishes a message every instance listens for. If that message is lost, the 12 second in-process TTL is the backstop, so "within one minute" holds with margin.

## Deep dive three: counting clicks

The naive version, incrementing a clicks column on the link row, turns 60 thousand reads a second into 60 thousand writes and serialises a viral link on one row lock. A Redis increment per day, country and referrer explodes the number of counters and loses increments on failover.

The chosen design aggregates inside each redirect instance: an in-memory map from link, minute, country and referrer to a count, flushed to Kafka every second. A link taking 30 thousand clicks a second becomes 50 messages a second, one per instance. A stream aggregator closes each minute's window once the watermark passes, with 30 seconds of allowed lateness, and upserts the result into the columnar store. In the lesson's trace, a click was visible on the dashboard 81 seconds after it happened, well inside the five-minute target.

Partition the clicks topic by producer instance, not by short key. Counting is commutative, so you need no per-key order, and keying by link would put a viral link's entire load on one partition and one consumer.

And write down the loss budget. An instance crash loses at most one second of its counts: 400 clicks at average load, 1,200 at peak, under a millionth of the 1.7 billion clicks a day. Accept it explicitly. Downstream, each closed window is an idempotent upsert, so a replay overwrites counts instead of doubling them.

## When it breaks

Four failure modes worth having ready. A cache restart: store reads jump from 3 thousand a second to between 30 and 60 thousand. Provision the store for 50 percent misses, pre-warm the top million keys from yesterday's rollups, and shed with a five-oh-three beyond the store's measured capacity.

The store unreachable in a region: the misses fail, the hits keep working. Use a 50 millisecond timeout and fail fast with a five-oh-three, never a four-oh-four, because crawlers and caches believe a four-oh-four and record the link as dead.

Kafka unavailable: analytics stall, redirects do not. Buffer about ten minutes, then drop and count the dropped clicks so the dashboard marks the gap. And a poison click message that crash-loops the aggregator: catch errors per record and park the bad one on a dead-letter topic.

How it grows. At ten times the volume, the first thing to break is key density, 8.5 percent full by year five. Mint new keys with eight characters; the old seven-character links keep working, because lookup does not care about length. At a hundred times, 6 million redirects a second is an edge problem, served from edge replicas with the origin as the source of truth.

## In the interview

A follow-up the lesson expects. Make creation active-active in three regions. What goes wrong?

[pause]

Multi-region tables in their default mode resolve concurrent writes by last-writer-wins and check the condition against the local region's copy. Two regions can mint the same random key in the same second, both local puts succeed, and replication silently overwrites one, re-pointing a link someone already shared. The fix is to partition the key space by region, with disjoint counter ranges or a region tag in the key, so a cross-region collision is impossible, not just unlikely. The wrong answer is "the conditional put guarantees uniqueness". It does, but only within a region.

And another: the hit rate drops from 95 to 70 percent overnight. At 70 percent the store sees 18 thousand reads a second at peak instead of 3 thousand. Check the four-oh-four ratio for an enumeration run, Redis's eviction counter for full memory, and recent deploys for a changed cache-key format. Do not answer "add Redis nodes" before you know which it was.

## Recap

Four things to remember. Let key-space arithmetic pick the key length: seven characters is under 1 percent full after five years, six is over half. One key lives on one cache shard, so the viral link is solved with an in-process cache, not a bigger cluster. Return a three-oh-two so disable and analytics work, and a five-oh-three, never a four-oh-four, when the store is down. And the click log is forty times the link table, so treat it as its own write-heavy system: pre-aggregate per instance, partition by producer, and state the loss budget.

At your desk: the estimate tables, the encoder and permutation code, the two traces, and the two exercises.

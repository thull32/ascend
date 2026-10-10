---
lesson: lfu-and-modern-policies
source: 2f4cee9361235fbc
fit: partial
desk:
  - "The constant-time LFU two ways: the min-freq bucket trace and code, and the 2010 frequency-node list with its trace"
  - "The comparison of the two layouts, including the CPython memory and speed numbers"
  - "The six-step halving trace, and the ARC trace through ghost hits"
  - "Caffeine's sizes read from source, the sketch layout, the admission table and the policy-choice table"
  - "Exercises: implement a constant-time LFU cache; LFU with periodic halving"
---
## Introduction

LRU has a blind spot. It treats an entry touched once, a second ago, as more valuable than an entry touched a thousand times up to two seconds ago. A one-hit wonder evicts a hot key. And web traffic, CDN requests and database pages are all heavily skewed: a small set of keys takes most of the hits, and a long tail is requested once. So "how often" predicts reuse at least as well as "how recently".

Least frequently used, LFU, evicts the entry with the smallest access count. Interviewers ask for it in constant time, and there is a neat structure for that. But the bigger lesson comes after: pure LFU has a flaw that makes it unusable, and the policies that fix it are what your cache library actually runs.

Three ideas: the constant-time LFU and its one clever integer, why counts must age, and how modern caches split admission from eviction.

## Constant-time LFU

The obvious implementations are slow. A min-heap keyed by count makes every get a logarithmic update. A map of counts makes eviction a linear scan for the minimum.

The constant-time version keeps the values, each key's count, and a set of buckets: for each count, the keys that have it, in recency order. Plus one integer: the smallest count that currently has any keys. Call it min freq.

On a get, move the key from its bucket to the next one up. If that empties the bucket min freq points at, min freq goes up by one. On a put of a new key with the cache full, evict the least recently used key from the min freq bucket, insert the new key at count 1, and set min freq to 1.

That last step is the trick, and the follow-up interviewers love. Why is min freq never searched for?

[pause]

Because a new key always has count 1, so after any insert the minimum is 1. Min freq only moves up when a promotion empties its bucket, which is one comparison, and it resets on the next insert. You never search.

Two details people get wrong. Ties: within a count, evict by recency, or the policy is not even well defined; using a plain set for the bucket makes eviction arbitrary. And deletes. If you add a delete or TTL expiry, a removal can empty the min freq bucket, and only an insert repairs it, so the next eviction points at a count with no keys. The original 2010 design avoids this: a sorted linked list of frequency nodes, where the lowest count is always the first node after the head. A count only ever moves by one, so the list stays sorted by splicing a node in next door. If your cache needs deletion or expiry, that layout keeps everything constant.

Both layouts cost about five words per entry in a compiled language. In the lesson's CPython measurements, the bucket version took 175 to 315 bytes per entry against 106 for the previous lesson's LRU, and a get took 229 nanoseconds against 78.

## Why pure LFU never forgets

Put this cache in front of a news site. Monday's top story gets a million hits. On Tuesday it gets none, but its count is still a million, and every new story starts at 1. New stories are evicted the moment the cache is full, and Monday's story stays until the process restarts. Pure LFU never forgets. It also has a cold-start problem: a new key must survive long enough to build a count, and in a full cache it is evicted before it can.

So real frequency policies age their counts. Two mechanisms. Periodic halving: every so many accesses, halve every counter, so a key that stops being used decays geometrically. That is TinyLFU. Or time decay: store the last access time with the count, and subtract the elapsed time on each read. That is Redis.

Here is the smallest example of halving changing the outcome. Capacity 2. Put a, get a twice, so a has count 3. Put b, count 1. That is the fourth access, so halve: a drops to 1, b to 0. Put c: b is lowest and goes. Now put d. Without aging, a has 3 and c has 1, so c goes, and a's old hits protect it forever. With halving, a and c are tied at 1, c is more recent, so a goes. With aging, a has to keep earning its place. Frequency now means frequency in the recent past, which is what you wanted all along.

## Probation areas and ARC

The cheapest fix for LRU's one-hit wonders is a probation area. Two-queue, or 2Q, puts first-time entries in a small first-in-first-out queue, promotes entries that show reuse into a main LRU, and keeps a ghost list of keys recently evicted from probation, so a second request shortly after eviction still counts. Segmented LRU does the same inside one list, with a probationary and a protected segment. A scan cycles through probation and never touches the protected set. Linux's page lists have this shape.

ARC, the adaptive replacement cache from IBM, goes further. It keeps one LRU list for keys seen once and another for keys seen at least twice, plus a ghost list for each, holding only the keys recently evicted from it. A target says how much of the cache the seen-once list deserves. And the ghosts drive the target. A hit in the seen-once ghost list means "we evicted from the recency side too early", so the target grows. A hit in the other ghost list shrinks it. The cache tunes itself between LRU-like and LFU-like behaviour, continuously, with no parameters. A key that comes back from a ghost list goes straight into the seen-twice list, because now it has been seen twice. ZFS uses ARC for its file cache.

## W-TinyLFU: what Caffeine runs

Caffeine, the standard Java cache, used by Cassandra, Kafka and Spring, runs Window TinyLFU. It is the policy to name when someone asks what the state of the art is, and its key move is splitting admission from eviction.

The main region, 99 percent of capacity, is a segmented LRU, 20 percent probation and 80 percent protected. It evicts by recency. The question TinyLFU answers is different: should a newcomer be admitted at all? It keeps a count-min sketch of recent access frequencies, with 4-bit counters that are all halved after ten times the cache size in increments. When a candidate wants in, compare its estimate with the estimate for the victim it would displace. Admit it only if it is more frequent. A tie keeps the victim.

Said with numbers, against a victim estimated at 3. A one-hit wonder at 1: rejected, it never displaces a warmer entry. A key seen 5 times: admitted. A formerly hot key, saturated at 15, after one halving is at 7: still admitted. After a second halving it is at 3: tied, rejected. It has aged out.

Pure admission has its own cold-start problem, so the window in the name is a small LRU, 1 percent of capacity, in front, where new keys can collect hits before facing the test. And one guard: an attacker who floods collisions onto the victim's counters could pin it at 15 so nothing ever gets in, so a candidate estimated at 6 or more is admitted anyway one time in 128.

Two numbers to keep straight. Four bits is the counter width, not the cost. For a cache of 10 thousand entries the sketch is 128 kibibytes, about 13 bytes per entry, and in general 8 to 16 bytes per entry of capacity. And reads never block: they are recorded into striped ring buffers with a single compare-and-swap, and if a stripe is full the record is simply dropped.

## Redis and Postgres

Redis's LFU reuses the same 24 bits per key as its LRU: 16 bits of last-decrement time, in minutes, and an 8-bit counter. An 8-bit counter cannot count a million hits, so it counts logarithmically: each access increments it with a probability that shrinks as the counter grows. At the default factor, that is about 10 after 100 hits, 18 after a thousand, and 255 after a million. A new key starts at 5, so it is not the first thing evicted. A cold key loses one per minute since its last decrement, applied lazily when it is next touched or sampled. Eviction samples a few keys and evicts the lowest counter. So the object frequency command is a logarithmic, decaying estimate, not a hit count.

Postgres runs a clock sweep. Each buffer has a usage count, capped at 5. A hand sweeps the ring of buffers: anything above zero is decremented and skipped, and the first buffer at zero is evicted. Busy pages keep getting topped back up to 5; a page touched once decays to zero in one sweep. Aged frequency, with no lists at all. And large sequential scans get their own small ring buffer, so they recycle their own pages instead of sweeping the pool.

## In the interview

The interview shape: say LRU, its failure mode, scans and one-hit wonders, the fix, a probation area or frequency-based admission, and one real system for each. And if they ask for frequency without a counter per key, the answer is a count-min sketch with periodic halving.

A follow-up the lesson expects. How does TinyLFU decide whether to admit a key, and what does that decision cost?

[pause]

It admits the candidate only if its sketch estimate beats the eviction victim's; ties keep the victim, apart from the one-in-128 lottery for candidates at 6 or more. Each estimate is one 64-byte block read, and the sketch costs 8 to 16 bytes per entry of capacity. The wrong answer is "it evicts the least frequent entry", which describes LFU eviction, not admission. The sketch never chooses the victim.

## Recap

Four things to remember. Constant-time LFU keeps buckets by count and a min freq integer that every insert resets to 1, evicting by recency within a count; if you need deletes, use the frequency-node list. Pure LFU never forgets, so counts must age, by halving or by time decay. ARC adapts its split between recency and frequency from ghost hits. And W-TinyLFU separates admission from eviction: a 1 percent window, a sketch that admits only the warmer key, and a segmented LRU that evicts.

At your desk: both LFU layouts with their traces and code, the halving and ARC traces, Caffeine's sizes and the policy table, and the two exercises, a constant-time LFU and LFU with periodic halving.

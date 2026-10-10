---
lesson: search-autocomplete
source: 53b0e8d46572c0eb
fit: great
desk:
  - "The API, the data model and the architecture diagram"
  - "The trie animation and the one-pass top-k build code"
  - "The memory measurements and the 100 million query extrapolation"
  - "The trending-query and keystroke traces, step by step"
  - "The failure-mode, trade-off and evolution tables"
  - "Exercise: top-k autocomplete suggestions"
---
## Introduction

Type "net" into a search box, and eight suggestions appear before your finger reaches the next key. That is roughly 100 milliseconds, end to end, for a request sent on nearly every keystroke. So the search box generates several times more traffic than search itself, every request has a budget smaller than a cross-continent round trip, and the answer depends on a pipeline that counts a billion searches a day and notices within minutes that everyone has started typing "eclipse".

The design splits into two systems that meet at a file. An offline pipeline turns search logs into a ranked, filtered index. An online service answers prefix lookups from memory. A weak answer puts a database query on the keystroke path. A strong answer precomputes everything, proves with arithmetic that the index fits in RAM, and spends its time on freshness, caching and safety.

## Requirements and the numbers

Given a prefix, return up to 8 complete queries, ranked mostly by popularity, per language and region. Long-term popularity updates daily; trending queries surface within about 10 minutes. Never suggest blocked content, and be able to remove a suggestion globally within a minute. Optionally blend in the user's own recent searches.

The targets: under 100 milliseconds at the 99th percentile at the client, and under 10 inside the service. Four nines of availability, where stale suggestions are fine and missing ones are not. No consistency between users or replicas. And a privacy rule: no query typed by only a few people is ever suggested to anyone else.

Say the consistency requirement out loud. This is an availability-first, eventually consistent read path, and that frees you to cache aggressively.

Scale: a billion searches a day, 6 suggestion requests per search, and 100 million candidate queries averaging 20 characters. That is 69 thousand suggest requests a second, 140 thousand at peak. Prefixes of up to three letters are only about 18 thousand keys per language, and they sit on the path of every search, so assume the CDN edge answers 60 percent. That leaves 56 thousand a second at the origin. Each response is about 400 bytes.

And the index, as we will see, is 6 to 8 gigabytes. So here is the sentence that matters: the whole index fits in the RAM of one ordinary server. The serving tier is 30 replicas across 5 regions, with no sharding at all, and the engineering goes into the pipeline, the edge cache and the safety filters.

## The architecture

The request is a cacheable GET with no user identity in it, and that is what lets the CDN serve it. The server normalises the prefix, folding case and collapsing whitespace, so different spellings of "net" share one cache entry. A response can say "complete", meaning this prefix has 8 or fewer candidates in total, so the client filters locally as the user types more instead of calling again. And each response carries an index version, to answer "why did I see that?" reports.

Personal suggestions come from a separate, uncached call or from history on the device, and the client merges them. Put the user's identity in the shared request and the edge hit rate falls to zero.

Behind the edge: search events flow into Kafka at about 12 thousand a second. A daily batch counts searches and distinct users per query, computes a decayed score over 30 days, drops queries below the distinct-user threshold, applies the blocklist, and builds a snapshot file. Servers download it, validate it, and swap it in atomically. Alongside, a stream processor keeps 5-minute counts and pushes a small trending overlay every minute, and a kill list reloads every few seconds. On a miss, a server walks to the prefix, reads its precomputed top 8, merges the overlay, removes kill-list entries, and returns.

## Deep dive one: the index

A trie stores each query as a path from the root, one character per edge, so every query starting with "net" lives under the node for "net". Reaching that node costs time proportional to the length of the prefix, however many queries there are.

The trap is what comes next. If you rank the subtree at query time, a short prefix is a disaster: in the lesson's measured log, 11.3 percent of all queries sit under the letter "t". At 100 million queries, that is 11 million queries to rank on one keystroke. So store the top 8 at every node, at build time. A lookup becomes a walk plus reading 8 IDs.

And the build is one pass. Here is the trick in one sentence: insert queries in descending score order, and the first 8 queries to pass through any node are exactly that node's top 8. No heaps, no re-sorting. Just break ties deterministically, by the query string, or two builds of the same data disagree.

Now, does it fit? The lesson measured it on a synthetic log of about 300 thousand queries, then extrapolated. A plain trie, one node per character, had 3.6 nodes per query. A radix trie, which collapses chains of single-child nodes into one labelled edge, had 1.25. A radix trie can never exceed two nodes per query, so that is well inside the bound.

Here is the surprise. Before I tell you: with room for 8 IDs per node, how many does the average node actually hold?

[pause]

About 2.2. Most nodes are deep, with one or two queries beneath them; only 3.3 percent of prefixes had a full list of 8. Budget 8 at every node and you overstate the top-k lists 3.6 times.

Extrapolated to 100 million queries with 16-byte node records in flat arrays: about 2 gigabytes of nodes, 1.1 of top-k IDs, under half a gigabyte of edge labels, and 2.8 of query strings. Total 6.3 gigabytes, or 8.2 at the worst-case bound. Contrast that with ordinary objects: the lesson's Python node measured 304 bytes each, about 120 gigabytes at this scale. Flat arrays are what make one machine enough. The snapshot is laid out so a node memory-maps it and serves without deserialising millions of objects.

The alternatives, briefly. A SQL LIKE query with ORDER BY score: the range for "t" is 11 million rows, on the keystroke path. A search engine's completion suggester is good at moderate scale, but at 140 thousand requests a second you run a cluster for a static lookup. The one to take seriously is a key-value store mapping every prefix to its top 8 strings. It is familiar and shards easily. But it costs about 46 gigabytes per replica, six to seven times more, plus a network hop. With a 500 gigabyte index, say per-merchant suggestions, that trade flips.

## Deep dive two: ranking and freshness

Raw all-time counts rank last year's news above today's. So decay them: a search d days old counts for one half to the power of d over the half-life. With a 7-day half-life, "world cup", searched a thousand times every day, converges to about 9,600. "eclipse", searched 50 thousand times yesterday and never before, starts at about 45 thousand, and falls below "world cup" after about 17 days. The half-life is a product decision: shorter feels current and noisier, longer is stable and stale.

But a daily batch cannot surface "eclipse" on the day. So a streaming path counts each query in 5-minute windows and compares it with a baseline: last week's count for that window, plus smoothing, so going from 1 search to 5 is not "trending". A count-min sketch gives approximate counts in fixed memory, and a heap keeps the heavy hitters. And rank on distinct users, not raw searches. A bot that types a brand name a million times is one user.

Trace it. At noon, "eclipse glasses" jumps from 20 to 30 thousand searches a minute. The window closes at 12:05 and 10 seconds: 150 thousand searches from 120 thousand distinct users, a lift of a thousand times over baseline. The overlay builder adds it at 12:05 and 40 seconds, after the classifier and the kill list. Servers pull the overlay at 12:06. So origin freshness is 6 minutes.

But short prefixes cached at the edge before 12:06 keep their old lists for up to 5 minutes, so the worst case is 11 minutes, one over the target. The fix: cut the short-prefix TTL to 4 minutes, or purge those prefixes when the overlay changes. Note that the overlay lives in its own small trie and is merged at serve time, so the 8 gigabyte index is never rebuilt more than once a day.

## Deep dive three: serving a keystroke

The request path is short, so its tail and its ordering are what go wrong. Picture three actors: the client, the edge, and one suggest server that is about to stall in a 150 millisecond garbage collection pause.

The user types "netf". The client tags the request with sequence number 4. It misses at the edge and lands on the stalled server. 70 milliseconds later, the user types "netfl", sequence 5. That one is an edge hit, and it arrives at 120 milliseconds and is rendered. Then at 220 milliseconds, the old "netf" response finally arrives.

[pause]

The client discards it, because 4 is older than the 5 it is showing. Without that check, the box would flip back to suggestions for "netf" while the user reads "netfl". Rendering in arrival order is one of the mistakes the lesson calls out.

That pause is also your 99th percentile. Two fixes: the edge hedges a miss to a second origin node after 30 milliseconds, which costs at most 5 percent more origin load if 95 percent of misses return in time. Or keep the server's heap small enough that pauses stay in single milliseconds, which memory-mapped flat arrays make easy. The lookup itself, by the way, took about 0.2 milliseconds.

Because every node holds the whole index, the load balancer needs no routing. If it ever stopped fitting, you would shard by language first, then by prefix range sized by traffic rather than alphabet, because "s" carries far more than "x". And a new snapshot is a deployment: check its size is within 10 percent of the last, check golden prefixes and blocklist matches, canary it on a few nodes comparing click-through, and keep old versions on disk so rollback is a pointer change.

## Failure modes

A bad snapshot ships empty lists or an offensive query on a common prefix: validation gates, canary, rollback by pointer. A harmful suggestion trends after a news event: the kill list is applied last, to base and overlay alike, reloaded every few seconds, with a CDN purge of every prefix of the removed query, at most a few dozen keys. Manipulation shows up as a phrase climbing with few users behind it: rank on distinct users, cap each user's contribution, require breadth before trending. If the streaming path stalls, keep serving the last overlay until it is too old, then drop it; the base index still answers. And when degraded, the service returns an empty list, never an error.

## In the interview

A follow-up the lesson expects. What stops autocomplete leaking someone's private search?

[pause]

A distinct-user threshold. Only queries searched by at least N distinct users in the window are eligible, with N set with the privacy team, in the batch and the overlay alike. Personal history is shown only to its owner and never enters the shared index. The wrong answer is "we encrypt the logs", which does nothing to stop the ranking pipeline from promoting a unique query.

And: why not just use Elasticsearch? At moderate scale, you would. At 140 thousand requests a second with a 10 millisecond budget, a static index replicated in process is 30 small servers, no cluster coordination and no network hop, for data that changes once a day plus an overlay. The reason is cost and predictability, not that it "doesn't scale".

## Recap

Four things. Split an offline ranking pipeline from an online lookup that never touches a disk. Precompute the top 8 at every trie node in one pass by inserting in score order, and size it honestly: a radix trie, flat arrays, about 2 IDs per node, 6 to 8 gigabytes, so full replicas and no shards. Pair a decayed daily score with a streaming overlay, and trace freshness all the way to the edge TTL. And keep the request anonymous and cacheable, discard out-of-order responses, and enforce the distinct-user threshold and the kill list.

At your desk: the API and diagrams, the trie build code, the memory tables, the two traces, the failure tables, and the top-k exercise.

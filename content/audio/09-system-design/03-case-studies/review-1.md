---
review: case-studies
source: e8538709d7d6f871
---
## Introduction

Twelve questions from the case-studies module, from the URL shortener to ad click aggregation. Each one comes with four options. Answer out loud before the answer comes.

## Question 1

A single short link takes 30 thousand requests a second. Your Redis cluster has 8 primaries, each good for about 100 thousand operations a second. What is the real risk, and what is the fix?

A, one primary takes all 30 thousand operations a second; cache the key in-process, with coalescing. B, Redis evicts the hottest key under memory pressure; raise the cluster's memory limit. C, none; the 8 primaries share the load, for 800 thousand operations a second of total capacity. D, the link store is overloaded by misses; add more read replicas behind the cache.

[think]

The answer is A. Cluster capacity is irrelevant for a single key, because one key maps to one slot on one node, so that primary gives up a third of its capacity and every other key on it queues. Caching the key in each of 50 redirect instances for 10 seconds turns 30 thousand Redis reads a second into about 5. The key is hot, not missing, so the store is not the bottleneck.

## Question 2

A fixed-window rate limiter allows 100 requests per minute. What is the most requests a client can get through in any two-second interval?

A, 150. B, about 103. C, 100. D, 200.

[think]

The answer is D, 200. The client sends 100 at the very end of one window and 100 at the start of the next. The counter resets at the boundary, so 200 requests land within two seconds. 100 is what the limit promises, not what fixed windows enforce, and this boundary problem is what sliding windows and token buckets avoid.

## Question 3

A key-value store keeps three replicas, with a write quorum of one and a read quorum of one. A client writes version 2, gets an acknowledgement, and immediately reads the key. What can it see?

A, both version 1 and version 2, as siblings, because the replicas disagree. B, always version 2, because the write was acknowledged before the read. C, possibly version 1, because the read may hit a replica that does not have version 2 yet. D, an error, because the read and write quorums together are not greater than the replica count.

[think]

The answer is C. The quorums add up to 2, which is not greater than 3, so the replica that acknowledged the write and the one that serves the read need not overlap. An acknowledgement only means one replica has version 2. And quorums that do not overlap are a legal, fast configuration with no overlap guarantee, not an error.

## Question 4

In the news feed, a user posts and refreshes 7 milliseconds later, before fan-out has run. How does the design guarantee they see their own post?

A, the client caches the post locally and shows it on top until fan-out lands. B, the feed service merges the viewer's own recent posts into every load. C, fan-out writes to the author's own timeline synchronously before answering. D, it can't; with asynchronous fan-out the user must wait for the lag to pass.

[think]

The answer is B. Merging your own recent posts at read time makes read-your-writes hold by construction, for one extra small partition read. A synchronous self-insert is a second write path that can fail independently, and client-only caching breaks across devices.

## Question 5

In a chat system, two members of a group send messages at nearly the same time, from phones whose clocks disagree. How does every device end up showing the same order?

A, every device sorts by the time each message arrived at that device. B, every device sorts by the sender's device timestamp carried in each message. C, each gateway assigns sequence numbers to the messages its own devices send. D, the conversation's owner assigns sequence numbers, and devices render in that order.

[think]

The answer is D. One sequencer per conversation gives a total order within the conversation, with no coordination across conversations. Device clocks disagree, and arrival order differs per device. Per-gateway numbering fails because two senders in one group are usually on different gateways, so their numbers conflict.

## Question 6

In the video streaming design, a cloud region hosting part of the control plane fails at peak. What happens to members who are already watching?

A, they must restart playback so a healthy region issues new URLs. B, they keep watching, because the bytes come from edge appliances. C, they drop to the lowest bitrate until steering can be reached. D, their streams stop, because manifests are served by that region.

[think]

The answer is B. The player already holds pre-signed appliance URLs valid for hours, so the data plane does not need the control plane mid-session. New starts move to healthy regions. The hidden risk is any in-session dependency, such as a licence renewal, that the player treats as fatal.

## Question 7

In the upload pipeline, a transcode worker is preempted after uploading its output but before reporting success, and the task is redelivered. What makes this safe?

A, the queue deduplicates the redelivery, so the task runs only once. B, the worker holds a distributed lock on the video until it reports back. C, the orchestrator deletes the partial output before it retries. D, a deterministic output key makes the retry rewrite identical bytes.

[think]

The answer is D. Queues deliver at least once, so safety comes from idempotent tasks. The output key is derived from the input hash, the chunk, the rendition and the encoder version, so the retry overwrites the same object with the same content. A lock does not help when the lock holder is the process that died.

## Question 8

Which rule most directly prevents search autocomplete from exposing one person's private search to everyone else?

A, encrypting the search logs at rest and in the ranking pipeline. B, suggesting only queries searched by at least some minimum number of distinct users. C, using a short half-life so rare queries decay out quickly. D, rate limiting the suggest endpoint per user and per IP address.

[think]

The answer is B. A distinct-user threshold ensures a query typed by one person never becomes a suggestion, however often they repeat it. Encryption protects the logs but does not stop the pipeline promoting a unique query. And a private query searched today still scores high today, whatever the half-life.

## Question 9

In the notification system, security codes and a 50 million recipient marketing campaign share one queue, and codes take 30 minutes to arrive. What fixes this?

A, add a priority field so codes are picked ahead of campaign messages. B, give critical messages their own topic, their own senders and their own share of the provider's quota. C, add partitions to the shared topic so the backlog drains faster. D, send codes synchronously from the producer, bypassing the platform.

[think]

The answer is B. Isolation needs separate lanes and a guaranteed share of the provider's rate limit. A priority field does not let a message jump a backlog that is already ahead of it in a log, and more partitions just spread the same backlog. Bypassing the platform loses preferences, auditing and fallback.

## Question 10

A metric has labels for service with 300 values, endpoint with 20, status with 5, and pod with 30. An engineer proposes adding a customer ID label with 50 thousand values. What is the most accurate objection?

A, it slows down queries but does not affect ingestion. B, it adds 50 thousand series, which the platform can absorb. C, labels with numeric values cannot be indexed by the time-series database. D, it multiplies the metric's series count by up to 50 thousand.

[think]

The answer is D. Series count is the product of the label cardinalities, so a new label multiplies rather than adds. Ingester memory, index size and query cost all scale with distinct series. The tempting "it adds 50 thousand" is exactly the mistake that causes cardinality outages.

## Question 11

In collaborative editing, a document's owner pauses for 20 seconds, its lease expires, and a new owner takes over. Then the old owner wakes and tries to append version 5001. What prevents two different operations being stored as version 5001?

A, the expired lease stops the old owner from running any more code. B, clients reject messages from the old owner's connection. C, a primary key on document and version makes the append conditional. D, nothing; the CRDT merge resolves the conflict afterwards.

[think]

The answer is C. A lease cannot stop a paused process from acting on stale beliefs. A conditional write in storage can: the log accepts one operation per version, so whichever writer comes second fails and steps down. The log position acts as the fencing token.

## Question 12

In ad click aggregation, the stream job is down for 20 minutes, then recovers and processes the backlog. If its windows use processing time, what goes wrong?

A, the backlog is counted in the recovery minute. B, the 20 minutes of clicks are dropped as too late. C, nothing; each minute's count comes out the same. D, Kafka rejects the backlog as older than its retention.

[think]

The answer is A. Processing-time windows assign events by when the job sees them, so twenty minutes of clicks land in the recovery minute: a false spike, with empty minutes before it. Nothing is dropped; it is misattributed. Event-time windows put each click in the minute it actually happened.

## Recap

Three ideas kept coming back. A hot key or a hot row is a single-node problem that cluster capacity cannot fix. Retries and redeliveries are safe only when something makes them idempotent: a deterministic key, a sequence number, or a conditional write that acts as a fence. And correctness lives in one place, a single owner or a single constraint, while everything around it is allowed to be fast and a little stale.

---
review: building-blocks
source: ff9f7d023de2b534
---
## Introduction

Twelve questions from the building-blocks module. Answer out loud before the answer comes.

They run in the order of the lessons: the interview itself, estimation, scaling, caching, databases, consistency, partitions, retries, queues, events, APIs and security. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Twelve minutes into a 45-minute interview, you are still adding boxes to the high-level diagram. What is the best move?

A, ask the interviewer to choose which component to draw next. B, keep going, because the diagram must be complete before any deep dive. C, announce the move to deep dives and pick the two hardest parts. D, restart with a simpler diagram so the remaining time is enough.

[think]

The answer is C: announce the move to deep dives and pick the two hardest parts.

The deep dive is where the senior signal lives, and it needs about a third of the time. Saying "that is the high level" and choosing the deep-dive targets yourself shows that you are driving. Asking the interviewer to choose is acceptable but weaker. A complete diagram with no depth is the most common failing pattern, and restarting spends the time you need for depth.

## Question 2

A request makes five sequential calls. Each call has a median of 2 milliseconds and a 99th percentile of 20 milliseconds. What is the best statement about the request's latency?

A, the 99th percentile is about 10 milliseconds, because five calls at 2 milliseconds each add up. B, the 99th percentile is 20 milliseconds or more, and about 5 percent of requests hit a slow call. C, the 99th percentile is under 20 milliseconds, because the tails average out over five calls. D, the 99th percentile is exactly 100 milliseconds, because five calls at 20 milliseconds each add up.

[think]

The answer is B: 20 milliseconds or more, and about 5 percent of requests hit a slow call.

With five independent calls, the chance that at least one of them lands in its slowest 1 percent is about 5 percent. So the request's tail contains at least one slow call. Budget with 99th percentiles. Summing the averages is the mistake, and summing five 99th percentiles assumes every call is slow at once.

## Question 3

Your health check verifies that the replica can query the database. The database has a 3-second hiccup. What most likely happens?

A, nothing, because a 3-second blip ends before the next check can see it. B, the load balancer marks the database unhealthy and routes around it. C, only the replicas that were in the middle of a query fail their checks and are removed. D, every replica fails its check at once, and the whole fleet is ejected.

[think]

The answer is D: every replica fails its check at once, and the whole fleet is ejected.

A deep check shares a failure domain. A blip in the dependency fails every check at the same moment, and the balancer ejects everything. The balancer knows nothing about the database; it only sees replicas failing. Use shallow liveness and local readiness checks for the balancer.

## Question 4

In cache-aside, a writer updates the database and then deletes the key. Which interleaving leaves the cache serving stale data until the TTL?

A, two readers miss together and both set the freshly written row. B, a reader hits the cache while the writer is updating the database. C, two writers update the row and both delete the key at once. D, a slow reader fetches the old row and sets it after the delete.

[think]

The answer is D: a slow reader fetches the old row and sets it after the delete.

The reader misses and reads the old row before the update. Its delayed set lands after the delete and installs the value from before the write, and nothing removes it until the TTL or the next write. Two concurrent deletes are harmless. And a hit during the update returns the old value once, which is expected.

## Question 5

A user updates their name, and the reload, served by a replica, shows the old one. Which fix keeps most reads on replicas and guarantees that the user sees their own write?

A, route every read to the primary so that no read is ever stale. B, send that user's reads to a replica that has caught up past their write's position. C, add more replicas so that each one has less lag to work through. D, add a cache in front of the replicas, with a short TTL on each key.

[think]

The answer is B: send the user's reads to a replica that is past their write's position.

Return the commit's position in the write-ahead log, and serve that user's reads only from a replica that has replayed up to it, forwarding the read otherwise. Only the reads that need freshness wait. Routing everything to the primary gives up read scaling. More replicas do not reduce lag. And a cache just adds another stale copy.

## Question 6

A service reads an inventory count from a replica, subtracts one, and writes the result to the primary. What is the likely bug?

A, a lost update, from computing on a stale replica value. B, a phantom read, from rows inserted during the transaction. C, write amplification, from updating both the primary and the replicas. D, a deadlock, from reading and writing on two different nodes.

[think]

The answer is A: a lost update, from computing on a stale replica value.

The replica's value may lag the primary, so writing a number computed from it overwrites decrements the replica had not seen yet. An atomic update on the primary, or a conditional write that only succeeds if the version is still the one you expected, prevents it. No lock spans the two nodes, so there is nothing to deadlock.

## Question 7

A three-replica system with a quorum of two suffers a partition that isolates one replica. Under a CP design, which clients are affected?

A, all clients, because the system refuses requests during any partition. B, only the clients that can reach the isolated replica alone. C, only writing clients, because reads continue everywhere. D, no clients, because a quorum of two still exists.

[think]

The answer is B: only the clients that can reach the isolated replica alone.

The majority side keeps a quorum, and serves reads and writes after at most an election. The isolated replica cannot reach a quorum, so it refuses. Linearizable reads on that minority side must refuse as well, or they could return stale data.

## Question 8

2,000 clients are disconnected at the same instant. They retry with exponential backoff but no jitter, against a server that admits 1,000 requests a second. What happens?

A, they finish in about 2 seconds, the capacity limit. B, they stay in lockstep, so each wave mostly fails again. C, they spread out naturally after the first retry. D, they finish faster than they would with jitter, since the delays are shorter.

[think]

The answer is B: they stay in lockstep, so each wave mostly fails again.

Identical, deterministic delays keep every client synchronised. Each retry wave lands in the same instant, and only that instant's capacity succeeds. In the simulation, that took 971 seconds and about 100 attempts per client. Any jitter at all broke the lockstep and finished in four to six seconds.

## Question 9

An SQS consumer takes 45 seconds to process a message, with the default 30-second visibility timeout, and then calls delete message. What happens?

A, the first consumer gets an error at 30 seconds and has to restart its work. B, SQS deletes the message at 30 seconds, because the lease has expired. C, SQS extends the lease automatically while the first consumer is still working. D, the message is redelivered at 30 seconds, and the late delete may not remove it.

[think]

The answer is D: it is redelivered at 30 seconds, and the late delete may not remove it.

The visibility timeout is a lease. When it expires, the message is delivered again with a new receipt handle, so two consumers process it. The first consumer's delete uses a stale handle, which the documentation warns may not delete the message. Extend visibility explicitly, and make processing idempotent.

## Question 10

An outbox relay produces event e1, the broker acknowledges it, and the relay crashes before marking e1 as published. What happens next?

A, the outbox row is rolled back, so e1 is never delivered. B, the broker returns the offset of e1, so the relay skips it. C, Kafka's idempotent producer drops the second copy automatically. D, the restarted relay publishes e1 again, and consumers deduplicate by ID.

[think]

The answer is D: the restarted relay publishes e1 again, and consumers deduplicate by ID.

The row is still marked unpublished, so the next relay run produces it again, and the topic holds two copies. The idempotent producer only deduplicates retries within one producer session, and the restarted relay has a new producer ID. So consumers must deduplicate on the outbox row's ID.

## Question 11

A client receives a 429 response with a Retry-After value of 30. What is the correct client behaviour?

A, wait at least 30 seconds, then retry. B, treat it as a permanent failure and stop. C, retry immediately with exponential backoff. D, switch to a different API key and retry.

[think]

The answer is A: wait at least 30 seconds, then retry.

A 429 with Retry-After is the server telling the client exactly when its quota refills, and honouring it avoids further rejections. Backoff with jitter is for a 503 from load shedding, where no exact time is known. And rotating keys to evade limits is abuse.

## Question 12

A feature fetches user-supplied URLs to render previews. What is the most important cloud-specific control?

A, rate limiting preview fetches per user and per domain. B, fetching over HTTPS only, and rejecting plain HTTP addresses. C, caching previews so that each address is fetched only once. D, blocking private and metadata IP addresses after resolving DNS.

[think]

The answer is D: block private and metadata IP addresses after resolving DNS.

Server-side request forgery against the instance metadata endpoint hands the attacker the instance's credentials. Validation must block link-local and private ranges on the resolved addresses, and on every redirect, from an isolated fetcher behind an egress proxy with no internal reach. Rate limiting helps against abuse, but not against this attack.

## Recap

Three ideas kept coming back. First, the tail and the shared failure: one slow call in five sets your 99th percentile, and one deep health check can eject the whole fleet.

Second, races between a read and a write. The slow cache-aside reader, the stale replica read before a write, and the relay that crashes after publishing all come from a gap between two steps that someone assumed was atomic.

Third, retries are a load you design. Synchronised retries without jitter stay in lockstep, an expired lease means a second delivery, and a Retry-After value is an instruction, not a hint.

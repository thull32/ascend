---
review: building-blocks
source: ff9f7d023de2b534
---
## Introduction

Twelve questions from the building-blocks module. Answer out loud before the answer comes.

None of these overlap with the first set. They follow the lessons in order, from the interview wrap-up through caching, replication, consistency, events, service boundaries, APIs, metrics, resilience and security. Four options each, A to D, then a few seconds to commit.

## Question 1

In the wrap-up, you realise the design as drawn does not meet the stated availability target of 99.99 percent. What should you do?

A, leave it out, because raising a gap unprompted costs more than it earns. B, argue that 99.9 percent is good enough for this product, and move on. C, add a second region to the diagram and move on without comment. D, say so, give the cause, and outline what closing it would cost.

[think]

The answer is D: say so, give the cause, and outline what closing it would cost.

The written feedback records what you said. Naming a gap with its cause, here a single-region primary, and the cost of closing it, is evidence of senior judgement. Silently adding a box, or hoping the gap goes unnoticed, reads as either not understanding the requirement or not being candid.

## Question 2

A nightly batch job reads a million rarely used keys through an LRU cache, and the daytime hit ratio takes an hour to recover. What fixes it most directly?

A, admit a new key only if it has been seen more often than the key it would evict. B, double the cache size so the scan fits beside the hot set. C, switch the eviction policy to random replacement. D, lower every TTL so the scanned keys expire more quickly.

[think]

The answer is A: admit new keys only if they have been seen more often than the victim.

A scan evicts the hot set because LRU admits every miss. Frequency-based admission refuses keys that have been seen only once, so the hot set survives. In the simulation, it kept a 71 percent hit ratio through scans, while LRU fell to 38 percent. Doubling the cache still would not hold a million-key scan, and TTLs do not stop admission.

## Question 3

With asynchronous replication, the primary acknowledges an order, and then its host dies before the replica receives the write-ahead log. The replica is promoted. What happens?

A, the replica fetches the missing log from the dead primary's disk. B, the promotion waits until every acknowledged commit is present. C, the order is replayed automatically from the client's retry. D, the order is lost, although the client was told it committed.

[think]

The answer is D: the order is lost, although the client was told it committed.

An asynchronous commit is acknowledged after the local flush only, so the promoted replica never saw the order. Turning synchronous commit on, with a synchronous standby, makes each commit wait for the standby's flush, at the cost of about one round trip across availability zones per commit. Nothing recovers the log from a dead host automatically.

## Question 4

Client C reads a reply to a post, then reads the post itself, and finds nothing. What is the weakest consistency model that forbids this?

A, read-your-writes. B, causal consistency. C, eventual consistency. D, linearizability.

[think]

The answer is B: causal consistency.

The reply was written by someone who had read the post, so the post happens before the reply. Causal consistency requires anyone who sees the reply to see the post as well. Linearizability also forbids it, but it is stronger than needed. Read-your-writes covers only a client's own writes, and eventual consistency allows the anomaly.

## Question 5

A team chooses AP for user settings, with the default rule of last-writer-wins. What is the most likely consequence after a 20-minute partition?

A, settings are unavailable on the minority side during the partition. B, some writes are silently discarded, with clock skew picking which ones. C, both sides' writes conflict when the partition heals, and the merge step deadlocks. D, nothing, because last-writer-wins guarantees convergence to the truly newest value.

[think]

The answer is B: some writes are silently discarded, with clock skew picking which.

Last-writer-wins does converge, but to the highest timestamp, which under clock skew may belong to the older write, and no error is raised. An AP design needs a merge rule that preserves the intent of both sides. Unavailability on the minority side is the CP outcome, not this one.

## Question 6

Two database sessions each run a select to check for an existing payment with key K. Both find none, and both then insert and charge. What prevents the double charge?

A, a unique index on the key, claimed by the insert itself. B, retrying the select until it returns the same count twice. C, running both sessions at the default read-committed isolation level. D, adding a short sleep between the select and the insert.

[think]

The answer is A: a unique index on the key, claimed by the insert itself.

Check-then-act is a race. Both selects can run before either insert, and the lesson's Postgres experiment reproduced exactly that. A unique index makes the claim atomic: the second insert waits for the first transaction, and then fails or returns no row. Sleeps and repeated selects only move the window.

## Question 7

A service inserts an order, commits, and then publishes an order-placed event to Kafka. The publish times out. What is the state of the system?

A, consumers receive a partial event that is missing the order body. B, the order is committed, but consumers never learn of it. C, Kafka retries the publish until the event is delivered. D, the order was rolled back when the publish timed out.

[think]

The answer is B: the order is committed, but consumers never learn of it.

The commit already succeeded. The publish goes to a separate system with no shared transaction, so nothing rolls back. Nothing retries the publish unless the application does, and a crash loses even that. The transactional outbox fixes it by making the event part of the commit.

## Question 8

Which of these is the strongest signal that a system is a distributed monolith?

A, it runs every service on one shared Kubernetes cluster. B, it has grown to more than ten separately deployed services. C, several services read and write the same tables. D, its services call each other over gRPC instead of REST.

[think]

The answer is C: several services read and write the same tables.

A shared database means every schema change requires coordinating every service. That removes independent deployability, the one benefit that justified the split in the first place. Protocol, service count and platform are neutral, and ten services that deploy independently are not a monolith.

## Question 9

Two clients read the same order at version 7. Each sends a patch request with an If-Match header carrying that version's ETag. What happens?

A, both fail with a 409, because the two edits conflict with each other. B, both succeed, and the later patch overwrites the earlier one. C, the first succeeds, and the second gets a 412 and must re-read. D, the second waits on a lock until the first commits, and then succeeds.

[think]

The answer is C: the first succeeds, and the second gets a 412 and must re-read.

The server applies each patch as a conditional update on the stored version. The first moves the order to version 8. The second's precondition no longer holds, so it gets 412, precondition failed, and the client re-reads, re-applies its change and retries with the new ETag. Without If-Match, both would succeed and one edit would be lost. Nothing holds a lock across two HTTP requests.

## Question 10

An engineer adds the user ID as a label on the counter of total HTTP requests. What is the likely consequence?

A, slightly higher scrape latency on each instance. B, a series explosion that overloads the metrics system. C, nothing, because labels are compressed away by the time-series database. D, more precise per-user dashboards at almost no extra cost.

[think]

The answer is B: a series explosion that overloads the metrics system.

Every unique combination of labels is a separate time series, with its own memory in the head block: one per user, per route, per status, per instance. Compression reduces the bytes per sample, not the number of series. Per-user detail belongs in trace attributes or exemplars.

## Question 11

A dependency's latency rises to 5 seconds, but only 30 percent of calls fail outright. The circuit breaker's threshold is 50 percent failures, and slow calls are not counted. What happens to the caller?

A, the load balancer removes the dependency from rotation. B, the breaker opens at once, because the latency is above the timeout. C, nothing, because 70 percent of the calls still succeed. D, the breaker stays closed while slow calls fill the caller's pool.

[think]

The answer is D: the breaker stays closed while slow calls fill the caller's pool.

Failures stay under the threshold, so the breaker never opens. Yet each call holds a thread for 5 seconds, and Little's law fills the pool. Two things catch it: counting slow calls as failures, and a bulkhead that caps the dependency's share of threads.

## Question 12

A web app uses JWT access tokens that are valid for 24 hours, with no server-side state. A user reports their laptop stolen. What can the system do?

A, rotate the signing key, which invalidates only that user's token. B, nothing before the token expires, unless each request checks a denylist. C, revoke the token immediately at the identity provider. D, force the token to expire by logging the user out everywhere.

[think]

The answer is B: nothing before expiry, unless each request checks a denylist.

Stateless verification means there is no per-request check against revocation, so there is nothing to revoke and nothing to log out on the server side. A denylist brings the lookup back. Rotating the signing key logs out every user, not only this one. Short-lived access tokens with revocable refresh tokens bound the exposure to minutes.

## Recap

Three ideas ran through this set. The first is silent loss. An asynchronous commit acknowledged and then gone, a last-writer-wins merge that keeps the wrong value, an event published after the commit that never arrives: none of them raises an error. When you choose a design, ask what it loses and who would notice.

The second is the atomic claim. A unique index on the payment key, or a conditional update with If-Match: correctness comes from letting the storage layer refuse the second writer, not from checking first and hoping.

The third, briefly: shared things couple. Shared tables make a distributed monolith, and slow calls that the breaker does not count can fill a shared thread pool.

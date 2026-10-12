---
lesson: exactly-once-semantics
source: e8454d36974d9371
---
## 1

A consumer commits its Kafka offset, and then crashes before writing the event's effect to Postgres. Which guarantee did it implement, and what is the consequence?

A, at-least-once, and the event is processed again. B, at-most-once, and the event's effect is lost. C, exactly-once, and the offset rolls back on restart. D, ordered delivery, and the event is only delayed.

[think]

The answer is B: at-most-once, and the event's effect is lost.

Committing before the effect means no replay ever happens for that offset, so the effect is lost, and nothing rolls a committed offset back. Process-then-commit gives at-least-once, and storing the offset in the same database transaction as the effect removes the window entirely.

## 2

Kafka's idempotent producer prevents which duplicate?

A, the application calling send twice for one event. B, a restarted producer resending its last batch. C, an external sink rewriting a consumer's replay. D, the client resending a batch after a lost acknowledgement.

[think]

The answer is D: the client resending a batch after a lost acknowledgement.

The partition leader recognises a resent batch by its producer ID, epoch and sequence number, within one producer session. A restarted producer has a new producer ID, so its resend is new. A second send call is a new record with a new sequence, and sinks downstream of Kafka are out of scope.

## 3

With idempotence enabled, why must the maximum number of in-flight requests per connection stay at or below 5?

A, the leader caches five batches, so older retries go unrecognised. B, the coordinator fences producers that have six open requests. C, brokers throttle any client with more than five open requests. D, sequence numbers are four bits wide, and wrap after five.

[think]

The answer is A: the leader caches five batches, so older retries go unrecognised.

A retry is answered as a duplicate only if its batch is still among the last five the leader cached for that producer and partition. With six in flight, the oldest could be evicted before its retry arrives, and the leader would reject it as out of order, rather than acknowledging it. Ordering itself is protected by the sequence check, whatever the limit.

## 4

After a rebalance, a paused old instance wakes, and produces to the output topic with the same transactional ID as its replacement. What rejects its writes?

A, the group protocol revoking its input partitions. B, the epoch its replacement bumped at initialisation. C, the output partition moving to a new leader broker. D, its expired session, which stops it producing.

[think]

The answer is B: the epoch its replacement bumped at initialisation.

When the replacement initialised, the coordinator bumped the epoch and aborted the open transaction, writing markers under the new epoch. The broker and coordinator then refuse the old epoch, fencing the old producer. The zombie never has to notice the rebalance, which is the point: a paused process has not noticed anything.

## 5

Two consumers dedupe a card capture by checking a key, then capturing, then setting the key, and customers are occasionally charged twice. What is the fix?

A, lower the key's TTL, so stale entries expire before replays arrive. B, move the check and the set into one pipeline, to cut the latency. C, replace the key store with a Bloom filter checked in memory. D, claim the key with an atomic insert-if-absent before capturing.

[think]

The answer is D: claim the key with an atomic insert-if-absent before capturing.

Check-then-act lets both consumers see a miss, and both act. An atomic set-if-not-exists, or an insert that does nothing on conflict, lets the store decide one winner before any effect. The claim still needs a lease, and ideally the event ID as the processor's idempotency key, or a crash between capturing and marking done would charge again on retry. Pipelining does not make two commands atomic.

## 6

A processor with Kafka transactions enabled calls a payment API, produces a receipt, and commits. After a crash, the customer is charged twice, but only one receipt exists. Why?

A, the idempotent producer lost its sequence on restart. B, the transaction timeout was shorter than the API call. C, the API call was outside anything the transaction could undo. D, the receipt consumer read uncommitted records.

[think]

The answer is C: the API call was outside anything the transaction could undo.

Kafka made the receipt and the offset commit exactly-once, as promised, but the capture happened between the poll and the commit, and an abort cannot roll it back. By the end-to-end argument, the endpoint performing the effect must deduplicate it: pass the event ID as the processor's idempotency key. Reader isolation only affects which Kafka records are visible.

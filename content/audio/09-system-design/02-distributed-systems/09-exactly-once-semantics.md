---
lesson: exactly-once-semantics
source: 23aa51c356e23414
fit: great
desk:
  - "The idempotent producer trace, batch by batch, with sequence numbers and log offsets"
  - "The transaction trace through the coordinator, markers and the last stable offset"
  - "The zombie-fencing timeline and the payment-processor double-charge trace"
  - "The offsets-in-the-sink program with its injected crash, and the sink strategy table"
  - "Exercise: a broker-side sequence-number deduplicator"
---
## Introduction

A payment event leaves the checkout service, travels through Kafka, and is consumed by a service that writes a ledger row in Postgres and asks a payment processor to capture the charge. Every hop can fail after the effect and before the acknowledgement. The producer times out after the broker stored the event. The consumer crashes after inserting the row and before committing its offset. The processor captures the money and loses the response. Each of those produces a duplicate on retry, and each duplicate, in a ledger, is money.

"Exactly-once" is used for two different claims, and the gap between them is where designs fail. Exactly-once delivery, the network handing a message over precisely once, is impossible. A sender that gets no acknowledgement cannot tell a lost request from a lost reply, so it must either resend and risk a duplicate, or not and risk a loss. Exactly-once processing, the effect being applied precisely once, is achievable: accept at-least-once delivery, and make the effect idempotent or transactional.

Four ideas, then. What Kafka's idempotent producer actually dedupes. What its transactions and epochs guarantee. Where that guarantee stops. And the sinks that make the whole pipeline effectively-once.

## The consumer decides

Start at the consumer, because when it commits decides which guarantee you get. Commit the offset, then process: a crash after the commit and before the effect loses the event. That is at-most-once. Process, then commit: a crash after the effect and before the commit reprocesses it. That is at-least-once, with a duplicate effect. Process idempotently, or in the same transaction as the offset, and duplicates are absorbed. That is effectively-once.

## The idempotent producer

When the producer starts, the broker gives it a producer id and an epoch. Every record sent to a partition gets a sequence number, counting from zero, and each batch carries its first sequence. For each producer and partition, the partition leader remembers the last five batches it appended.

Picture one producer and one partition leader. The producer sends batch B1, sequences 3 to 4, and the leader appends it, but the acknowledgement is lost. Thirty seconds later the producer resends B1. The leader sees that 3 to 4 matches a batch in its cache, answers with the original offset, and writes nothing. That is the duplicate that retries create, gone.

It also protects order. If one batch fails, say because leadership moved, every later batch in flight fails its sequence check too, because there is a gap. Nothing can overtake it. The client resends them in sequence order. Without idempotence, the later batch would land first and the retried one after it, reordered. That is why the old advice was one request in flight.

The five-batch cache explains a setting people ask about: with idempotence, the maximum in-flight requests per connection must be at most 5. Why not 6?

[pause]

A retry is recognised as a duplicate only while its batch is still cached. With six in flight, the oldest could be evicted before its retry arrives, and the leader would reject it as out of order instead of acknowledging it. Not "more in flight would reorder records"; idempotence already prevents that.

Be precise about scope. One producer session, one partition, retries inside the client. A restarted producer gets a new id, so its resend is a new record. The application calling send twice is two records. Nothing downstream is covered.

## Transactions and zombie fencing

A stream processor reads payments and writes receipts, and must advance its input offset only together with its output. Kafka transactions make producing the output and committing the input offset one atomic unit.

The producer has a transactional id, and a transaction coordinator, a broker, keeps its state in an internal topic. The producer registers the partitions it will write, produces records flagged as transactional, adds its consumer offsets to the transaction, and asks to commit. The coordinator writes "prepare commit". That is the commit point: once it is replicated, the outcome is decided, and a coordinator that fails over finishes the job. Then it writes commit markers into every partition touched. It is a two-phase commit whose coordinator log is replicated and whose participants are partitions that cannot vote no.

Readers in read-committed mode only see records up to the last stable offset, the start of the oldest open transaction. So they see nothing from this transaction until the markers land, and then the receipts and the offset become visible together. A commit costs tens of milliseconds, amortised over every record in the transaction, which is why Kafka Streams commits every 100 milliseconds rather than per record.

Now the epoch, which exists for one scenario: the old owner is not dead, only paused. Instance one is mid-transaction at epoch 7 when it enters a 50 second stop-the-world pause. After 45 seconds, the consumer group evicts it, and instance two is assigned its partition. Instance two initialises with the same transactional id. The coordinator bumps the epoch to 8 and aborts the open transaction. Instance two resumes from the last committed offset and carries on. At 51 seconds, instance one wakes and produces with epoch 7. The broker rejects it: producer fenced. It tries to commit; the coordinator rejects that too.

Instance one never learned about the rebalance, and it does not need to. The broker enforces the epoch. The common wrong answer to "what stops the zombie" is "the rebalance revoked its partitions", which the paused process never noticed.

## Where the guarantee stops

In 1984, Saltzer, Reed and Clark wrote the end-to-end argument. Checksums on every network hop do not guarantee the file on disk is correct, because the disk write or the application can still corrupt it. Only a check by the endpoints, which know what correct means, closes the gap.

Apply it to the processor, which also calls a payment processor to capture each payment. It polls event e42 inside a transaction. It calls capture: charge number one. It produces the receipt. Then it crashes before committing, and the transaction is aborted on timeout. The replacement re-reads e42 from the committed offset and calls capture again. How many charges, and how many receipts?

[pause]

Two charges, one receipt. Kafka kept its promise: the receipt and the offset are exactly-once. But the capture happened between poll and commit, outside anything the transaction could roll back. The fix belongs at the endpoint that performs the effect: pass e42 as the processor's idempotency key, so the second capture returns the first one's result. Stripe, Adyen and most processors accept such a key for exactly this reason. No broker setting can substitute for it.

## Dedupe stores and their race

When the endpoint offers no idempotency key, the consumer keeps its own record of processed event ids. Size it before you agree to it: keys per second, times the window, times bytes per key.

At 20 thousand events a second and a 7 day window, that is about 12 billion keys. As raw ids, 194 gigabytes. In Redis, with per-key overhead, on the order of a terabyte of RAM. The window is the cost lever.

The race is worse than the size. Two consumers, say the zombie and the new owner, both receive e42. With check-then-act, both check the store, both see a miss, both charge. Duplicate. The fix is to claim first with an atomic insert-unique, such as set-if-not-exists with a 300 second lease, so the store decides who acts. But the claim moves the problem rather than removing it. If the winner crashes after charging and before marking done, the retry charges again, unless the downstream takes an idempotency key. Without one, you choose at-most-once or at-least-once plus reconciliation, and that is a product decision you name in the design review.

## Sinks that are effectively-once

Three patterns cover most sinks, in order of preference.

First, an idempotent upsert on an event id minted at the source: the outbox row's id, not the Kafka offset, which changes if the relay republishes. Insert on conflict do nothing. No separate store, no window, no expiry, and the check is atomic with the effect.

Second, store the offset with the output in one database transaction. The consumer writes the effect and the next offset together, and on start it seeks to the offset in its own table, ignoring Kafka's. In the lesson's program, a crash mid-transaction rolls back the row and the offset together, so the restart resumes at the right place, and a republished duplicate hits the primary key and changes nothing.

Third, the transactional outbox on the producing side: the checkout service writes the payment row and an outbox row in one transaction, and a relay publishes it. The relay can publish twice, so consumers still dedupe on the outbox id.

Put together, the payment pipeline is at-least-once at every hop, and every effect is idempotent on an id minted at the source. No step needed exactly-once delivery.

## In the interview

"Can you guarantee each payment is processed exactly once?"

[pause]

Its effect, yes; its delivery, no. The event gets an id in the checkout transaction through the outbox. The producer is idempotent with all-replica acknowledgements. The ledger consumer upserts on the id, with its offset in the same Postgres transaction. And the processor call carries the id as its idempotency key. Every crash produces a replay, and every replay is a no-op. The wrong answer is "yes, we enabled Kafka exactly-once", which covers none of the Postgres or processor effects.

## Recap

Four things to remember. Exactly-once delivery is impossible; exactly-once processing is at-least-once delivery plus an idempotent or transactional effect. Kafka's idempotent producer dedupes its own retries within one session and one partition, using a five-batch cache, which is why in-flight is capped at five. Transactions tie output to input offsets, and the epoch fences a paused zombie without it noticing anything. And by the end-to-end argument, the endpoint that performs the effect must dedupe it: an upsert on a source-minted id, offsets in the same transaction, or an idempotency key, never check-then-act.

At your desk: the producer and transaction traces, the zombie and double-charge timelines, the offsets-in-the-sink program, and the deduplicator exercise.

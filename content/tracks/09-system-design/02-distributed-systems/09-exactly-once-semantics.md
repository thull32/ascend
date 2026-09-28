---
slug: exactly-once-semantics
title: "Exactly-once semantics: what Kafka's guarantee covers and what your sink must do"
description: Why exactly-once delivery is impossible and exactly-once processing is not; Kafka's idempotent producer traced batch by batch (sequence numbers, the five-batch window, OutOfOrderSequence) and its transactions traced request by request through the coordinator, markers and the last stable offset, with a zombie-fencing timeline; the end-to-end argument applied to side effects; dedupe stores sized and their races; and the sink patterns that make a payment pipeline effectively-once.
minutes: 30
difficulty: expert
tags: [system-design, distributed-systems, exactly-once, kafka, idempotent-producer, transactions, deduplication]
---
A payment event leaves the checkout service, travels through Kafka, and is consumed by a service that writes a ledger row in Postgres and asks a payment processor to capture the charge. Every hop can fail after the effect and before the acknowledgement: the producer can time out after the broker stored the event; the consumer can crash after inserting the row and before committing its offset; the processor can capture the money and lose the response. Each of those produces a duplicate on retry. Each duplicate, in a ledger, is money.

"Exactly-once" is used for two different claims, and the gap between them is where designs fail. Exactly-once *delivery*, the network handing a message over precisely once, is impossible: a sender that gets no acknowledgement cannot tell a lost request from a lost reply, so it must either resend (possible duplicate) or not (possible loss). Exactly-once *processing*, the effect being applied precisely once, is achievable, by accepting at-least-once delivery and making the effect idempotent or transactional. Kafka's exactly-once semantics (EOS) is a carefully engineered instance of that for one kind of sink. This lesson traces what it does on the wire, shows where it stops, and builds what you need beyond it.

## Delivery versus processing: the consumer decides

| Guarantee | Consumer does | Crash consequence |
|---|---|---|
| At-most-once | Commit the offset, then process | Crash after commit, before effect: lost |
| At-least-once | Process, then commit the offset | Crash after effect, before commit: reprocessed, duplicate effect |
| Effectively-once | Process idempotently, or transactionally with the offset | Duplicates are absorbed |

The broker promises that acknowledged records survive (given `acks=all` and replication, traced in [Kafka internals](/learn/big-data/streaming/kafka-internals)) and that a partition is read in order. Which row you get is decided by when your code commits. [Queues and async processing](/learn/system-design/building-blocks/queues-and-async-processing) covers the consumer loop; here the concern is the whole path, starting with the producer.

## The idempotent producer, batch by batch

On start the producer sends `InitProducerId` and receives a **producer id** (PID) and an **epoch**. Every record sent to a partition gets a per-partition **sequence number**, counting records from 0; a batch carries its first sequence and its record count. For each (PID, partition) the partition leader keeps the metadata of the **last five batches** it appended and the last sequence. Trace PID 4001, epoch 0, sending to `payments-0` with up to five requests in flight:

| Step | Producer sends | Broker's check | Result | Log offsets | Cached batches |
|---|---|---|---|---|---|
| 1 | B0: seq 0–2 | New PID, first seq is 0 | Append | 100–102 | 0–2 |
| 2 | B1: seq 3–4; the ack is lost | 3 = last (2) + 1 | Append | 103–104 | 0–2, 3–4 |
| 3 | B2: seq 5–7, in flight alongside B1 | 5 = 4 + 1 | Append, acked | 105–107 | 0–2, 3–4, 5–7 |
| 4 | B1 again, after `request.timeout.ms` (30 s default) | 3–4 matches a cached batch | Duplicate: answers offset 103, writes nothing | unchanged | unchanged |
| 5 | B3: seq 8–9 fails with `NOT_LEADER_OR_FOLLOWER`; B4: seq 10 reaches the new leader | New leader rebuilt producer state from the replicated log: last = 7; 10 ≠ 8 | B4 rejected: `OutOfOrderSequence` | unchanged | unchanged |
| 6 | Client resends B3, then B4, in sequence order | 8 = 7 + 1, then 10 = 9 + 1 | Append both | 108–110 | …, 8–9, 10 |

Step 4 removes the duplicate that retries create. Steps 5 and 6 are why **ordering survives retries**: a batch that fails makes every later batch in the window fail its sequence check, so nothing can overtake it. Without idempotence, B4 would land at 108 and the retried B3 after it, reordered, and B1 would be written twice; that is why the old advice was one request in flight.

The five-batch cache is why `max.in.flight.requests.per.connection` must be **at most 5** with idempotence (the Java client refuses a larger value when idempotence is explicitly enabled). A retried batch is recognised only if it is still in the cache; with six in flight, the oldest could be evicted before its retry arrives, and the broker would answer `OutOfOrderSequence` instead of "duplicate". The exercise below makes that edge concrete.

Scope, precisely: one producer session, one partition, retries inside the client. A restarted producer gets a new PID, so its application-level resend is a new record; so is the application calling `send` twice; nothing downstream is covered. Idempotence has been on by default in the Java client since Kafka 3.0 (KIP-679), provided `acks=all`; how it behaves when other settings conflict changed across 3.x releases, and clients built on librdkafka still default `enable.idempotence` to false, so set it explicitly.

```viz
{"type": "system", "scenario": "kafka-partitions", "nodes": 3,
 "title": "Sequence numbers per producer per partition", "caption": "Each batch carries (producer ID, epoch, first sequence). The partition leader remembers the last five batches per producer and treats a resend as already done. This dedupes the producer's own network retries and nothing else."}
```

```exercise
id: broker-sequence-dedupe
title: A broker-side sequence-number deduplicator
prompt: |
  Model one partition leader's duplicate detection. Each batch is
  `[pid, epoch, first_seq, count]`; it covers sequences `first_seq` to
  `first_seq + count - 1`. Keep, per pid, the current epoch, the last accepted
  sequence and the (first, last) ranges of the last **5** accepted batches.
  For each batch, in order, return one of:

  - `"fenced"`: the pid is known and `epoch` is lower than its current epoch.
  - `"accept"`: a pid never seen, or an epoch higher than the current one,
    starting at `first_seq == 0` (the state resets to this batch); or the same
    epoch with `first_seq == last + 1`. Record the batch (evict the oldest
    beyond 5).
  - `"duplicate"`: same epoch, and (first, last) equals a cached batch.
  - `"out-of-order"`: anything else (a gap, an overlap that is not an exact
    cached batch, a new pid or new epoch not starting at 0).

  Rejected batches never change the state.
languages: [python, javascript]
entry: broker_dedupe
starter:
  python: |
    def broker_dedupe(batches):
        state = {}  # pid -> epoch, last sequence, cached (first, last) ranges
        out = []
        return out
  javascript: |
    function broker_dedupe(batches) {
      const state = new Map(); // pid -> epoch, last sequence, cached ranges
      const out = [];
      return out;
    }
tests:
  - args: [[[7, 0, 0, 3], [7, 0, 3, 2], [7, 0, 3, 2], [7, 0, 5, 1]]]
    expected: ["accept", "accept", "duplicate", "accept"]
    label: a retry after a lost ack is a duplicate
  - args: [[[7, 0, 0, 2], [7, 0, 4, 1], [7, 0, 2, 2], [7, 0, 4, 1]]]
    expected: ["accept", "out-of-order", "accept", "accept"]
    label: a later batch cannot overtake a failed one
  - args: [[[7, 0, 0, 1], [7, 1, 0, 1], [7, 0, 1, 1]]]
    expected: ["accept", "accept", "fenced"]
    label: the old epoch is fenced
  - args: [[]]
    expected: []
    label: empty input
  - args: [[[1, 0, 0, 3], [1, 0, 1, 2]]]
    expected: ["accept", "out-of-order"]
    label: an overlapping resend is not a duplicate
  - args: [[[1, 0, 0, 1], [1, 0, 1, 1], [1, 0, 2, 1], [1, 0, 3, 1], [1, 0, 4, 1], [1, 0, 5, 1], [1, 0, 0, 1], [1, 0, 1, 1]]]
    expected: ["accept", "accept", "accept", "accept", "accept", "accept", "out-of-order", "duplicate"]
    hidden: true
    label: a batch older than the five-batch window is no longer recognised
  - args: [[[1, 0, 0, 2], [2, 0, 0, 1], [1, 0, 2, 1], [2, 3, 1, 1], [2, 3, 0, 1], [2, 0, 1, 1], [3, 0, 5, 1]]]
    expected: ["accept", "accept", "accept", "out-of-order", "accept", "fenced", "out-of-order"]
    hidden: true
    label: two producers, an epoch bump and an unknown pid
hints:
  - "Check the epoch first: lower is fenced; higher (or an unknown pid) must start at sequence 0."
  - "Within the same epoch, test the cache for an exact (first, last) match before testing for last + 1."
  - "Keep the cache as a list and drop its first element when it grows past five."
```

## Kafka transactions, request by request

A stream processor consumes `payments`, produces receipts to `receipts`, and must advance its input offset only together with its output. Transactions make **produce-to-output and commit-input-offset** one atomic unit. The producer is configured with `transactional.id = ledger-writer-0`; its **transaction coordinator** is the leader of partition `hash(id) mod 50` of the internal `__transaction_state` topic (50 partitions, replication factor 3 by default). Trace one transaction:

| Step | Request | `__transaction_state` record | Data partitions | LSO of `receipts-0` |
|---|---|---|---|---|
| 1 | `FindCoordinator(ledger-writer-0)` → broker 3 | – | – | 500 (no open txn) |
| 2 | `InitProducerId` → PID 4001, epoch 7 (was 6: bumped) | PID 4001, epoch 7, `Empty` | – | 500 |
| 3 | `AddPartitionsToTxn(receipts-0, receipts-1)` | `Ongoing`, partitions listed, timeout clock starts | – | 500 |
| 4 | `Produce` to `receipts-0` (offsets 500–502) and `receipts-1` | – | Records flagged transactional, PID 4001, epoch 7 | 500, held by the open txn |
| 5 | `AddOffsetsToTxn(group ledger)` | Adds `__consumer_offsets-12` | – | 500 |
| 6 | `TxnOffsetCommit(payments-0 → 8,121)` to the group coordinator | – | Pending offset, not yet visible | 500 |
| 7 | `EndTxn(COMMIT)` | `PrepareCommit`: the commit point | – | 500 |
| 8 | `WriteTxnMarkers` from coordinator to each leader | – | COMMIT control record at `receipts-0` offset 503, in `receipts-1` and in `__consumer_offsets-12` | 504 |
| 9 | – | `CompleteCommit` | – | 504 |

Once step 7 is replicated, the outcome is decided: a coordinator that fails over re-reads `PrepareCommit` and finishes writing markers. It is a two-phase commit whose coordinator log is replicated and whose participants are partitions that cannot vote no. The [distributed transactions lesson](/learn/system-design/distributed-systems/distributed-transactions) covers 2PC's general failure modes.

What readers see depends on isolation. A `read_committed` consumer fetches only up to the **last stable offset** (LSO), the first offset of the oldest open transaction on the partition: it sees nothing past 500 until step 8, then 500–502 (the marker at 503 is skipped). A `read_uncommitted` consumer sees 500–502 at step 4, even if the transaction later aborts. On abort, markers say ABORT and `read_committed` readers drop those records using the broker's aborted-transaction index. The consumer offsets become visible at step 8 too, so output and position move together.

Cost per commit is the `EndTxn` round trip plus one marker write per touched partition, each replicated; tens of milliseconds is a reasonable order of magnitude on a single-region cluster, and it depends on replication latency and partition count. It is amortised over every record in the transaction, which is why Kafka Streams under EOS commits every 100 ms rather than per record.

## Zombie fencing on a timeline

The epoch exists for one scenario: the old owner of an input partition is not dead, only paused. P1 and P2 share `transactional.id = ledger-writer-0`.

| Time | P1 (old instance) | P2 (replacement) | Coordinator | `receipts-0` |
|---|---|---|---|---|
| 0 s | Epoch 7; begins T, writes 500–502 | – | `Ongoing`, epoch 7 | LSO 500 |
| 1 s | Enters a 50-second stop-the-world pause | – | – | – |
| 46 s | (paused) | Group evicts P1 after `session.timeout.ms` (45 s default since Kafka 3.0); P2 is assigned `payments-0` | – | – |
| 47 s | (paused) | `InitProducerId(ledger-writer-0)`; retries `CONCURRENT_TRANSACTIONS` while the abort completes | Bumps the epoch, `PrepareAbort`, ABORT markers to T's partitions | 500–502 aborted; the leader now knows the higher epoch; LSO moves past them |
| 48 s | (paused) | Gets epoch 8; resumes `payments-0` from committed offset 8,121 (T's offsets never committed), reprocesses, commits | `CompleteCommit`, epoch 8 | New receipts at 504 onward |
| 51 s | Wakes; produces to `receipts-0` with epoch 7 | – | – | Rejected: `ProducerFenced` |
| 51 s | `commitTransaction` | – | Rejects epoch 7: `ProducerFenced` | – |

P1 never learns about the rebalance before writing, and it does not need to: the broker and the coordinator refuse epoch 7. Two limits matter. Fencing is only as good as the id mapping: with one `transactional.id` per input partition (the original design), each partition's new owner fences the old one; since Kafka 2.5 (KIP-447), `sendOffsetsToTransaction` also carries the consumer group generation, so a stale generation is rejected at offset commit and one producer per instance suffices, which is what Kafka Streams' `exactly_once_v2` uses. And the coordinator forgets an idle id after `transactional.id.expiration.ms` (7 days by default), so fencing works among instances that were active within that window.

Transactions also have timeouts: the coordinator aborts any transaction open longer than the producer's `transaction.timeout.ms` (60 s default), and a producer asking for more than the broker's `transaction.max.timeout.ms` (15 minutes default) is refused at `InitProducerId`. A stalled open transaction holds back the LSO for every `read_committed` reader of its partitions until then.

## The end-to-end argument: where the broker's guarantee stops

Saltzer, Reed and Clark's "End-to-End Arguments in System Design" (1984) used careful file transfer as the example: checksums on every network hop do not guarantee the file on disk is correct, because the disk write, the buffer copy and the application can still corrupt it; only a check performed by the endpoints, which know what "correct" means, closes the gap. Lower-layer guarantees are performance optimisations, not substitutes.

Apply it to the processor above, which also calls a payment service provider (PSP) to capture each payment:

| Step | Kafka state | PSP state |
|---|---|---|
| 1 | Poll `e42` in transaction T | – |
| 2 | – | `capture(e42)` succeeds: charge #1 |
| 3 | Receipt produced inside T | – |
| 4 | Processor crashes before `EndTxn`; T is aborted on timeout | Charge #1 stands |
| 5 | Replacement re-reads `e42` from the committed offset | – |
| 6 | – | `capture(e42)` again: **charge #2** |
| 7 | T′ commits: exactly one receipt, one offset advance | Two charges |

Kafka kept its promise: the receipt and the offset are exactly-once. The PSP call happened between poll and commit, outside anything the transaction could roll back. The end-to-end fix belongs at the endpoint that performs the effect: pass `e42` as the PSP's idempotency key, so step 6 returns charge #1's result instead of creating charge #2. Stripe, Adyen and most processors accept such a key for this reason. No broker setting can substitute for it.

## Dedupe stores: size and race conditions

When the endpoint offers no idempotency key, the consumer keeps its own record of processed event ids. Size it before agreeing to it:

$$\text{size} = \text{keys/s} \times \text{window (s)} \times \text{bytes per key}$$

At 20,000 events/s and a 7-day window, that is 20,000 × 604,800 ≈ **12.1 billion keys**. As raw 16-byte UUIDs they are 194 GB; in Redis, where each key with a TTL carries several tens of bytes of dictionary, expiry and allocator overhead (the exact figure depends on version and encoding), it is on the order of a terabyte of RAM. A Postgres table with a UUID primary key costs a similar order on disk. The window is the cost lever: one day instead of seven divides it by seven, and shortens the redelivery you can absorb.

The race is worse than the size. Two consumers (the zombie and the new owner from the timeline) receive `e42`:

| Step | Check-then-act (`GET`, act, `SET`) | Insert-unique first (claim, act, mark) |
|---|---|---|
| 1 | C1: `GET e42` → miss | C1: `SET e42 pending NX EX 300` → OK |
| 2 | C2: `GET e42` → miss | C2: `SET e42 NX` → fails; C2 skips |
| 3 | C1 charges | C1 charges, idempotency key `e42` |
| 4 | C2 charges: **duplicate** | C1: `SET e42 done` |
| 5 | Both `SET e42` | One charge |

Check-then-act is two operations, and anything can happen between them. Claiming first with an atomic insert-unique (`SET NX`, `INSERT … ON CONFLICT DO NOTHING` and reading the row count) makes the store decide who acts. The claim moves the problem rather than removing it: if C1 crashes between step 1 and step 3, the effect is lost until the 300-second lease expires and a redelivery reclaims it, and if C1 crashed *after* charging, the retry charges again unless the downstream takes an idempotency key. Without one, you choose at-most-once (never retry a stale claim) or at-least-once (retry it) and add reconciliation against the provider's records. That choice is a product decision; name it in the design review.

## Sinks that are effectively-once

Three patterns cover most sinks, in order of preference.

**Idempotent upsert on a source-minted event id.** The id is assigned when the event is created (the outbox row's id, not a Kafka offset, which changes if the relay republishes). The write is `INSERT … ON CONFLICT (event_id) DO NOTHING`, a `PUT` to a key derived from the id, or a conditional write. There is no separate store, no window and no expiry, and the check is atomic with the effect. When a replay could carry a newer version of the same entity, guard the update (`DO UPDATE … WHERE ledger.version < EXCLUDED.version`) so an old replay cannot overwrite a newer row.

**Offsets stored with the output in one database transaction.** The consumer writes the effect and the next offset in one local transaction, and on start (and on every partition assignment) seeks to the offsets in its own table, ignoring Kafka's committed offsets. The program below injects a crash mid-transaction and a duplicate publish, and ends with each event applied once:

```python
import os
import sqlite3
import tempfile

# One Kafka partition: (offset, event_id, account, amount_cents). Offset 3 is the
# outbox relay publishing evt-b a second time: same event id, new offset.
PARTITION = [(0, "evt-a", "acct-1", 500), (1, "evt-b", "acct-2", 1200),
             (2, "evt-c", "acct-1", -300), (3, "evt-b", "acct-2", 1200),
             (4, "evt-d", "acct-3", 900)]


def connect(path):
    db = sqlite3.connect(path, isolation_level=None)   # we issue BEGIN/COMMIT ourselves
    db.execute("CREATE TABLE IF NOT EXISTS ledger ("
               "event_id TEXT PRIMARY KEY, account TEXT, amount INTEGER)")
    db.execute("CREATE TABLE IF NOT EXISTS consumer_offsets ("
               "topic_partition TEXT PRIMARY KEY, next_offset INTEGER)")
    return db


def consume(db, crash_at=None):
    row = db.execute("SELECT next_offset FROM consumer_offsets "
                     "WHERE topic_partition = 'payments-0'").fetchone()
    start = row[0] if row else 0          # position comes from the sink, not from Kafka
    for offset, event_id, account, amount in PARTITION[start:]:
        db.execute("BEGIN")
        db.execute("INSERT INTO ledger VALUES (?, ?, ?) "
                   "ON CONFLICT (event_id) DO NOTHING",       # replay or duplicate: no-op
                   (event_id, account, amount))
        if offset == crash_at:
            db.close()                    # dies mid-transaction: SQLite rolls it back
            raise RuntimeError(f"crashed at offset {offset}")
        db.execute("INSERT INTO consumer_offsets VALUES ('payments-0', ?) "
                   "ON CONFLICT (topic_partition) DO UPDATE SET next_offset = excluded.next_offset",
                   (offset + 1,))
        db.execute("COMMIT")              # effect and position become durable together


path = os.path.join(tempfile.mkdtemp(), "ledger.db")
try:
    consume(connect(path), crash_at=2)
except RuntimeError as e:
    print(e)                              # crashed at offset 2
db = connect(path)                        # restart: resumes at offset 2
consume(db)
print(db.execute("SELECT COUNT(*), SUM(amount) FROM ledger").fetchone())   # (4, 2300)
print(db.execute("SELECT next_offset FROM consumer_offsets").fetchone())   # (5,)
```

The crash at offset 2 rolls back evt-c's row and its offset together, so the restart resumes at 2; the duplicate evt-b at offset 3 hits the primary key and changes nothing. Two consumers writing the same partition's offset row is the zombie problem again; an `owner_epoch` column checked in the `UPDATE` fences it.

**Transactional outbox on the producing side.** The checkout service writes the payment row and an outbox row in one transaction; a relay (often CDC) publishes the outbox row with an idempotent producer. A relay that crashes after publishing and before recording progress republishes, so consumers still dedupe on the outbox id. [Distributed transactions](/learn/system-design/distributed-systems/distributed-transactions) covers the outbox in full.

```viz
{"type": "system", "scenario": "outbox",
 "title": "The outbox makes the event as durable as the business write", "caption": "The payment row and its event commit in one local transaction. The relay publishes afterwards, at least once, so the event id minted in that transaction is what every downstream sink deduplicates on."}
```

```viz
{"type": "system", "scenario": "idempotency-key", "requests": 3,
 "title": "Event ID as the sink's idempotency key", "caption": "The same event delivered three times results in one ledger row: the first insert succeeds, the replays hit the unique constraint and do nothing. No dedupe store, no window, no clock."}
```

| Strategy | Atomic with the effect | Extra state | Expiry window | Fences a zombie | Use when |
|---|---|---|---|---|---|
| Unique constraint or upsert on event id | Yes, same statement | An index on the sink table | None | Yes: its writes are no-ops or identical | You own the sink schema |
| Offsets in the sink transaction | Yes, same transaction | One row per partition | None | With an epoch check on the offset row | Sink is a transactional database |
| Idempotency key passed to an external API | Yes, on the provider's side | None on yours | The provider's key retention (often hours to days) | Yes | The API supports keys |
| Claim-first dedupe store | No: claim and effect are separate | Keys/s × window × bytes | Yes, the TTL | Only the claim is atomic | Third-party effect with no key |
| Kafka transactions | Yes, for Kafka partitions only | Coordinator state, markers | None | Yes, by epoch | Kafka in, Kafka out |
| Flink two-phase-commit sink | Yes, at checkpoint commit | Pre-committed transactions in the checkpoint | Transaction timeout | Yes, by transactional id | Transactional sink, latency ≥ checkpoint interval |

## Worked example: the payment pipeline

Checkout → outbox → Kafka `payments` → ledger consumer → Postgres ledger and PSP.

| Failure point | Without protection | Mechanism that covers it |
|---|---|---|
| Checkout commits the payment, crashes before publishing | Event lost | Outbox row commits with the payment row |
| Relay publishes, crashes before recording progress | Event published twice | Consumers dedupe on the outbox id |
| Producer times out on a stored batch and resends | Duplicate in the partition | Idempotent producer: (PID, sequence) at the leader |
| Leader fails after acknowledging with `acks=1` | Acknowledged event lost | `acks=all`, `min.insync.replicas=2` |
| Consumer inserts the row, crashes before committing | Row inserted again on replay | Upsert on `event_id`, offset in the same transaction |
| Consumer captures at the PSP, crashes before recording it | Second capture on replay | PSP idempotency key = `event_id` |
| Rebalance leaves a paused zombie writing | Two writers for one partition | Upserts absorb it; epoch fences Kafka output |
| DLQ replay after 3 days, dedupe window 1 day | Duplicate | Permanent unique constraint, not a window |

Every hop is at-least-once and every effect is idempotent on an id minted at the source. No step needed exactly-once delivery.

## Under the hood: Kafka and Flink

- **Producer state on the broker.** Each partition's `ProducerStateManager` holds, per PID, the epoch, last sequence and five cached batches, and snapshots them to a `.snapshot` file when a segment rolls. A broker that restarts or becomes leader rebuilds the state from the snapshot plus the log after it, which is how step 5 of the producer trace knew the last sequence. Since 3.4 (KIP-854) a PID idle for `producer.id.expiration.ms` (one day by default) is forgotten; its next batch gets `UNKNOWN_PRODUCER_ID`, and since KIP-360 (2.5) the client can bump its own epoch and restart at sequence 0 instead of failing fatally.
- **Coordinator.** `__transaction_state` has 50 partitions, replication factor 3 and `min.insync.replicas` 2 by default; the coordinator for an id is the leader of its partition, so coordinator failover is ordinary partition leader election. Timed-out transactions are found by a periodic scan (every 10 seconds by default).
- **Hanging transactions.** A produce that reached a partition without its `AddPartitionsToTxn` could leave an open transaction the coordinator did not know to abort, pinning the LSO forever. KIP-890 closes this: from 3.6 the partition leader verifies with the coordinator before accepting transactional writes, and its second part (in the 4.x line) bumps the epoch on every transaction.
- **Version history.** Idempotence and transactions arrived together in 0.11 (KIP-98, 2017); group-generation fencing in 2.5 (KIP-447); idempotence by default in 3.0 (KIP-679). Check the broker and client versions you run.
- **Flink.** The `KafkaSink` with `DeliveryGuarantee.EXACTLY_ONCE` opens one transaction per checkpoint, pre-commits at the barrier and commits on checkpoint completion, with transactional ids derived from a prefix, subtask and checkpoint id so a restored job can finish a pre-committed transaction. Its producer timeout must be above checkpoint interval plus tolerated downtime and below the broker's 15-minute cap. [Stateful streaming](/learn/big-data/streaming/stateful-streaming) traces the barrier.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Offset committed before the effect | Sink counts fall short of source counts after crashes; no errors | Auto-commit on a timer, or commit before processing | Process then commit, or offsets in the sink transaction |
| EOS assumed to cover an external sink | Duplicate Postgres rows or double charges after rebalances | Side effect sits between poll and commit, outside the Kafka transaction | Upsert on event id; idempotency key to the API |
| Non-unique dedupe key | Events from one source silently missing | Two producers number events from 1 and share the keyspace | Globally unique ids (UUID, or producer id plus sequence) |
| Check-then-act dedupe | Rare duplicates clustered around rebalances | Two consumers both saw a miss for the same key | Claim with an atomic insert-unique, then act |
| Replay beyond the dedupe window | Duplicates after a DLQ or backfill replay | Replay age exceeds the TTL | Permanent unique constraint, or a window above DLQ retention |
| Transaction timeout loop | Abort rate climbs, progress stalls, `read_committed` lag grows | A slow sink keeps transactions open past `transaction.timeout.ms`; the replay repeats the same work | Smaller transactions, backpressure on `poll`, a timeout sized to the batch |
| `OutOfOrderSequence` or `UNKNOWN_PRODUCER_ID` errors | Producer errors after idle periods or leader moves | PID expired, a sequence gap from a batch that exceeded `delivery.timeout.ms`, or in-flight above 5 | Keep in-flight ≤ 5, upgrade clients with epoch-bump recovery, alert on the error rate |

## Interviewer follow-ups

**"Can you guarantee each payment is processed exactly once?"** Model answer: its effect, yes; its delivery, no. The event gets an id in the checkout transaction via the outbox, the producer is idempotent with `acks=all`, the ledger consumer upserts on the id with its offset in the same Postgres transaction, and the PSP call carries the id as its idempotency key; every crash produces a replay and every replay is a no-op. Common wrong answer: "yes, we enabled Kafka exactly-once," which covers none of the Postgres or PSP effects.

**"What does turning on Kafka EOS buy you when the sink is Postgres?"** Model answer: the idempotent producer's dedupe of broker retries and epoch fencing of zombie producers, both useful for any Kafka-to-Kafka stages; nothing for the Postgres write, which needs the upsert and offset-in-transaction. Common wrong answer: "the Postgres write joins the Kafka transaction."

**"Why can `max.in.flight.requests.per.connection` be 5 but not 6 with idempotence?"** Model answer: the leader caches the last five batches per producer and partition; a retried batch is recognised as a duplicate only while cached, so with six in flight the oldest could be evicted and its retry rejected as out of order. Common wrong answer: "more in flight would reorder records," which is what idempotence already prevents.

**"How big is your dedupe store, and what happens when it fails?"** Model answer: keys/s × window × bytes per key, about 12 billion keys and on the order of a terabyte for 20,000/s over 7 days, so I avoid it with a unique constraint or an idempotency key; if I must keep one, I claim with an atomic insert, fail closed for payments when it is down, and reconcile. Common wrong answer: "Redis with a TTL," with no size, no race analysis and no failure policy.

**"A consumer paused for 50 seconds comes back and keeps writing. What stops it?"** Model answer: for Kafka output, the replacement's `InitProducerId` bumped the epoch and the broker rejects the old epoch; for Postgres, upserts make its writes no-ops, and an epoch column on the offset row stops it from moving the position. Common wrong answer: "the rebalance revoked its partitions," which the paused process has not noticed.

## What mid-level engineers get wrong

- **Saying "Kafka gives us exactly-once" for a pipeline that ends in a database or an API.** Consequence: duplicates after the first rebalance, found by finance.
- **Deduplicating on the Kafka offset.** Consequence: a republished event gets a new offset and passes the check.
- **Using check-then-act against Redis.** Consequence: duplicates exactly when two consumers overlap, which is when they matter.
- **Choosing a dedupe TTL without comparing it with DLQ and backfill replay ages.** Consequence: a replay after the window duplicates everything in it.
- **Raising `max.in.flight.requests.per.connection` above 5 for throughput.** Consequence: the client refuses the configuration with idempotence on, or, with idempotence off, retries reorder and duplicate records.
- **Setting a Flink or application transaction timeout above the broker's cap.** Consequence: `InitProducerId` fails at deploy, or a pre-committed transaction is aborted during a long outage and its output is lost.

## Senior signals

- You separate **delivery from processing**, say "effectively-once", and attach the mechanism for each hop.
- You can trace the **idempotent producer** batch by batch, explain why ordering survives retries and why the in-flight limit is 5.
- You can trace a **transaction** through the coordinator: `InitProducerId`, `AddPartitionsToTxn`, `sendOffsetsToTransaction`, `PrepareCommit`, markers, and the **LSO** that `read_committed` readers wait behind.
- You explain **zombie fencing** as an epoch the broker enforces, not a rebalance the zombie must notice.
- You apply the **end-to-end argument**: the endpoint that performs the effect deduplicates it, with an upsert, offsets in the same transaction or an idempotency key.
- You size a **dedupe store** as keys/s × window × bytes, prefer designs without one, and claim with insert-unique when you must keep one.

## Check yourself

```quiz
- q: >-
    A consumer commits its Kafka offset and then crashes before writing the event's effect to Postgres. Which guarantee did it implement, and what is the consequence?
  options: ["At-least-once; the event is processed again", "At-most-once; the event's effect is lost", "Exactly-once; the offset rolls back on restart", "Ordered delivery; the event is only delayed"]
  answer: 1
  explanation: >-
    Committing before the effect means no replay ever happens for that offset, so the effect is lost; nothing rolls a committed offset back. Process-then-commit gives at-least-once, and storing the offset in the same database transaction as the effect removes the window entirely.
- q: >-
    Kafka's idempotent producer prevents which duplicate?
  options: ["A restarted producer resending its last batch", "An external sink rewriting a consumer's replay", "The client resending a batch after a lost ack", "The application calling send twice for one event"]
  answer: 2
  explanation: >-
    The partition leader recognises a resent batch by (producer id, epoch, sequence) within one producer session. A restarted producer has a new producer id, so its resend is new; a second send call is a new record with a new sequence; sinks downstream of Kafka are out of scope.
- q: >-
    With idempotence enabled, why must max.in.flight.requests.per.connection stay at or below 5?
  options: ["Sequence numbers are four bits wide and wrap after five", "The leader caches five batches, so older retries go unrecognised", "The coordinator fences producers that have six open requests", "Brokers throttle any client with more than five open requests"]
  answer: 1
  explanation: >-
    A retry is answered as a duplicate only if its batch is still among the last five the leader cached for that producer and partition. With six in flight the oldest could be evicted before its retry arrives, and the leader would reject it as out of order rather than acknowledging it. Ordering itself is protected by the sequence check, whatever the limit.
- q: >-
    After a rebalance, a paused old instance wakes and produces to the output topic with the same transactional.id as its replacement. What rejects its writes?
  options: ["Its expired session, which stops it producing", "The group protocol revoking its input partitions", "The epoch its replacement bumped at initialisation", "The output partition moving to a new leader broker"]
  answer: 2
  explanation: >-
    The replacement's InitProducerId made the coordinator bump the epoch and abort the open transaction, writing markers under the new epoch. The broker and coordinator then refuse the old epoch with ProducerFenced. The zombie never has to notice the rebalance, which is the point: a paused process has not noticed anything.
- q: >-
    Two consumers dedupe a card capture with GET key, then capture, then SET key, and customers are occasionally charged twice. What is the fix?
  options: ["Lower the key TTL so stale entries expire before replays arrive", "Claim the key with an atomic insert-unique before capturing", "Move the GET and SET into one pipeline to cut the latency", "Replace the key store with a Bloom filter checked in memory"]
  answer: 1
  explanation: >-
    Check-then-act lets both consumers see a miss and both act. An atomic SET NX or INSERT ... ON CONFLICT DO NOTHING lets the store decide one winner before any effect. The claim still needs a lease and, ideally, the event id as the processor's idempotency key, because a crash after capturing and before marking done would otherwise charge again on retry. Pipelining does not make two commands atomic.
- q: >-
    A processor with Kafka transactions enabled calls a payment API, produces a receipt and commits. After a crash the customer is charged twice but only one receipt exists. Why?
  options: ["The API call was outside anything the transaction could undo", "The receipt consumer used read_uncommitted isolation", "The idempotent producer lost its sequence on restart", "The transaction timeout was shorter than the API call"]
  answer: 0
  explanation: >-
    Kafka made the receipt and the offset commit exactly-once, as promised, but the capture happened between poll and commit and cannot be rolled back by an abort. By the end-to-end argument the endpoint performing the effect must deduplicate it: pass the event id as the processor's idempotency key. Reader isolation only affects which Kafka records are visible.
```

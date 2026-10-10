---
lesson: change-data-capture
source: ef0c3facf3940f08
fit: great
desk:
  - "The dual-write race traced with timestamps"
  - "The Postgres, MySQL and MongoDB comparison table"
  - "The Debezium connector configuration and the three-statement trace through search and cache"
  - "The retained-WAL table and the slot monitoring query"
  - "The outbox table and transaction, and the failure-modes table"
  - "Exercise: apply CDC events idempotently with versions"
---
## Introduction

The catalogue service updates a title's price in Postgres, then updates the Elasticsearch document, then deletes the Redis cache key. It has worked for a year. Then three incidents in a month.

A deploy restarts the service between the Postgres commit and the Elasticsearch call, and search shows the old price for nine days, until someone edits the title again. Two admins edit the same title a few milliseconds apart; Postgres applies A then B, but the search requests race and land B then A, so search permanently shows A. And a bulk SQL fix run straight against the database updates 40 thousand rows that never reach search at all, because only the service knew to propagate changes.

All three are the same bug: dual writes. When an application writes the same fact to two systems, there is no transaction spanning both, so a crash between them loses one write, and nothing orders concurrent writers across both. Change data capture, CDC, closes the hole by making the database's own commit log the single source of changes. Everything else derives from that log, in commit order, including changes made by scripts and other services.

## Dual writes, traced

Picture the race. Admin A sets the price to 1399 and commits. A millisecond later, admin B sets it to 1499 and commits. Postgres says 1499. Then A's process pauses for 20 milliseconds, a garbage collection or a slow connection. B sends its search update, 1499, and it is acknowledged. Then A wakes and sends 1399.

Both writers succeeded. Nothing failed. And the index disagrees with the database until the next edit.

So why can a retry queue not fix this?

[pause]

Because nothing errored, so there is nothing to retry. And a queue between the service and search only helps if it is ordered by commit, which the service cannot know: it never learns its commit's position relative to B's. The crash version is worse: the process that would retry is gone. Making the second write idempotent fixes duplication, not ordering or loss. Only a mechanism that reads changes after commit, in commit order, fixes both, which means the log, or a single transaction, the outbox.

## Where changes come from

Every serious database records every committed change in order, because crash recovery and replication need it. Postgres has the write-ahead log, read through logical decoding. MySQL has the binary log, read the way a replica would. MongoDB has the oplog, exposed as change streams. Each has a retention risk: MySQL expires binlogs after 30 days by default, MongoDB's oplog is a capped collection, and Postgres, as we will see, keeps WAL for you until you confirm it, which can fill the disk.

Log-based CDC beats polling an updated-at column on correctness, not speed. It sees only committed changes, in commit order, every change regardless of which code made it, and deletes, which a poll of the current table never sees.

In Postgres, a replication slot records how far the consumer has confirmed, and the server refuses to recycle any WAL the slot still needs. That is the guarantee and the hazard. Decoding sorts the interleaved WAL into one queue per transaction and only emits a transaction when its commit appears. Two consequences. A two-hour bulk transaction produces nothing for two hours and then a burst of everything. An aborted transaction produces nothing at all.

What an update carries for the old row depends on the table's replica identity. With the default, a delete carries only the primary key and an update carries no old row at all. With full replica identity, both carry the whole old row, at the cost of more WAL. And large out-of-line values, called TOAST columns, are not written to the WAL when unchanged, so without full identity Debezium emits a placeholder string for them. A naive sink writes that placeholder into the search index, and product descriptions in search start reading "debezium unavailable value".

## Debezium and the trace

Debezium runs as a Kafka Connect source. It writes one topic per table, keyed by primary key. On first start it creates the slot, takes a consistent snapshot of existing rows, and then streams from the slot, so nothing committed after the slot was created is missed. Its progress lives in Kafka Connect's offsets, not in the database.

Each event has a before image, an after image, an operation, and source metadata including the commit's log sequence number, the LSN. Take an insert, an update and a delete on one row. Because they share a key, they share a partition and arrive in commit order. A search indexer writes each one using the LSN as an external version, so the index rejects anything older than what it holds. A cache invalidator simply deletes the key each time.

Now the indexer crashes after the delete and restarts one event earlier. It replays the update. Search still remembers the delete's newer version and answers with a version conflict, which the indexer treats as "already newer" and skips. The cache replays a delete, which does nothing. Delivery was at-least-once; the effect was once.

One subtlety. Elasticsearch remembers a deleted document's version for only 60 seconds by default. A replay that arrives later finds nothing to compare against and indexes the stale upsert, and deleted titles reappear in search a day later. If deletes matter, index a soft delete, a deleted flag, instead of a hard delete, or bound how far back a restarted consumer may replay.

And ordering is per key only. A transaction touching three tables produces events on three topics that consumers see independently.

## The slot can take down your primary

A slot is a promise to keep WAL until the consumer confirms. If the connector is down, Postgres keeps every segment. At 5 megabytes a second, a moderately busy primary, that is 18 gigabytes an hour, 432 a day, and 1.1 terabytes over a long weekend. At 20 megabytes a second it is 1.7 terabytes a day. A broken connector fills the primary's disk and takes down the database CDC was supposed to observe passively.

The subtle version: a healthy connector on a quiet database. WAL is written per server, not per database. Put the captured catalogue database, which changes a few times an hour, on the same server as an orders database writing 5 megabytes a second. The connector only receives an event when the catalogue commits, so it has nothing new to confirm, and six quiet hours pin about 108 gigabytes of WAL that has nothing to do with the captured tables. The fix is heartbeats plus a regular change in the captured database itself, a heartbeat table the connector updates, so each heartbeat travels through the slot and gets confirmed.

Defences, in order. Page on retained WAL per slot. Set a maximum slot WAL size, so an over-limit slot is invalidated rather than filling the disk, accepting that the connector then must re-snapshot. Enable heartbeats. And drop the slots of decommissioned connectors, which pin WAL forever. Treat a slot as part of the primary's availability budget.

Snapshots have their own race. A 2-terabyte initial snapshot can take hours. Netflix's DBLog, and Debezium's incremental snapshots after it, interleave chunked reads with streaming, using low and high watermarks in the log to drop chunk rows that changed meanwhile. But a lagging sink can still apply an old chunk row after a newer streaming event, which is why sinks apply events conditionally on version.

## The outbox

Raw table CDC makes your internal schema a public API. A column rename breaks every consumer, and the events describe row mutations rather than business facts. The transactional outbox keeps CDC's atomicity while publishing deliberate events.

In the same transaction as the business change, say marking order 9001 placed, you insert a row into an outbox table: an aggregate type, which routes to a topic, an aggregate id, which becomes the Kafka key, an event type, and a JSON payload. Debezium's outbox event router turns each insert into one record on a topic like "outbox event order", keyed by 9001, with the payload as the value and the row's id in a header for consumer deduplication. Deletes of outbox rows are ignored, so you can delete the row in the same transaction and the table never grows. Not a cron job, and not an audit log, which would be a second copy of the stream to govern.

The rule: raw table CDC when you are replicating data, a warehouse, a search index of the same entity, a cache of the same rows. The outbox when you are integrating services. It is still at-least-once, so consumers deduplicate by the id.

## Keeping derived stores right

Each derived store is its own consumer group with its own rules. Search: upsert with the LSN as an external version, soft-delete, and never index the TOAST placeholder. Cache: prefer invalidation over writing values from events, because a replayed or reordered delete is harmless. One race survives: a reader that missed before the commit can write the old value after the invalidation, so version the cached value or delete again after a short delay. Warehouse: land raw events in a lake table, then merge.

Staleness is commit-to-apply latency, usually under a second to a few seconds, and unbounded when a consumer falls behind. Monitor lag in time per sink, from the commit timestamp in the event. And treat every schema change as an API change: a registry with compatibility checks, and expand-and-contract migrations.

## In the interview

The lesson's follow-up. How do you guarantee the search index never regresses a row?

[pause]

Version-conditional writes using the commit LSN, plus soft deletes, so a delete's version cannot be forgotten. The wrong answer is "process events in order with one consumer", which does not survive snapshot chunks or replays.

And: what does a Debezium update event's before image contain for a Postgres table? By default, nothing, because the WAL only carries the new row unless replica identity is full, which also makes unchanged TOAST columns available. "Always the full previous row" is the wrong answer.

## Recap

Four things to remember. Dual writes fail two ways, a crash loses one write and concurrent writers reorder, and only a commit-ordered log or a single transaction fixes them. A replication slot pins WAL on the primary: monitor it, cap it, heartbeat it, drop the dead ones. Every CDC sink must be idempotent and version-aware, with external versions and soft deletes in search and invalidation for caches. And use raw CDC for replication, the outbox for service integration.

At your desk: the dual-write timeline, the database comparison, the Debezium configuration and event trace, the WAL table and query, the outbox code, and the idempotent apply exercise.

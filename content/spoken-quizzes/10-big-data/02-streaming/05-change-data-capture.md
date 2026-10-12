---
lesson: change-data-capture
source: c0330a5ef0021a9c
---
## 1

A service writes to Postgres and then publishes to Kafka in the same request handler, retrying the publish on failure. What can still go wrong?

A, a crash between the two loses the event, and the order can diverge. B, nothing, because retrying the publish guarantees delivery. C, the database transaction rolls back if the publish fails. D, Kafka rejects events that arrive out of commit order.

[think]

The answer is A: a crash between the two loses the event, and the order can diverge.

A crash after the database commit and before a successful publish loses the event; retries do not help if the process dies before they happen. And nothing orders two handlers' publishes by commit order, so concurrent requests can publish in a different order than they committed. Change data capture, or an outbox, makes the database commit the only write, and derives the event from it.

## 2

A Debezium connector for a busy Postgres primary has been failing since Friday night. On Monday, the primary's disk is nearly full. Why?

A, the replication slot makes Postgres keep WAL since the last confirmed position. B, Kafka Connect keeps staging copies of tables in the database. C, repeated snapshot retries leave temporary tables behind. D, Debezium stores its offsets and history in the database.

[think]

The answer is A: the slot makes Postgres keep WAL since the last confirmed position.

A replication slot pins the write-ahead log from its restart position until the consumer confirms it, so days of WAL have piled up; at 20 megabytes a second that is 1.7 terabytes a day. Monitor retained WAL, cap it with the maximum slot WAL size setting, and page when a connector stops confirming. Debezium keeps its offsets in Kafka Connect, not in the source database.

## 3

An update event from a Postgres table with the default replica identity arrives with no before image, and one large description column holding a placeholder string. What explains both?

A, the WAL carries only the new row, and unchanged TOAST columns are not in it. B, the snapshot and the stream overlapped, and this is a snapshot read event. C, the connector crashed mid-event and emitted a partial record. D, the table has no primary key, so Debezium cannot build a before image.

[think]

The answer is A: the WAL carries only the new row, and unchanged TOAST columns are not in it.

With the default replica identity, the WAL records only the new row for an update, and the old one only if the key changed, so Debezium has no before image. An unchanged out-of-line TOAST value is not written at all, so the connector substitutes a placeholder. Setting replica identity to full fixes both, at the cost of more WAL. A missing primary key would stop update events entirely, rather than blank the before image.

## 4

During an incremental snapshot, the search index sometimes shows a price that was changed minutes ago. What sink design prevents this?

A, use the event's log position as an external version on each write. B, apply events with more consumer instances to cut lag. C, disable snapshots, and rely on streaming events alone. D, order the writes by processing time at the search indexer.

[think]

The answer is A: use the event's log position as an external version on each write.

A snapshot chunk can emit an older version of a row after a newer streaming event. Version-conditional writes, with the log position as an external version, make the index reject older writes and keep the newest version whatever the arrival order. More consumers would make the reordering worse.

## 5

Deleted titles occasionally reappear in Elasticsearch a day after a search indexer is restarted from an old offset. External versioning is in use. What is the mechanism?

A, the cache invalidator repopulated the index from a stale Redis value. B, external versions compare as strings, so a shorter log position looks newer than a longer one. C, the index forgot the delete's version after its garbage-collection window, and accepted an old upsert. D, tombstone records are replayed as creates, because their value is null.

[think]

The answer is C: the index forgot the delete's version, and accepted an old upsert.

Elasticsearch keeps a deleted document's version only for a short window, 60 seconds by default. A replay that arrives later finds no version to compare against, indexes the stale upsert, and resurrects the row. Soft deletes, or bounding how far back a restarted consumer may replay, prevent it. Tombstones carry no payload to create from, and the cache path never writes to the index.

## 6

The orders team wants other services to react when an order is placed. Why is the outbox usually better than letting consumers read change events from the orders tables directly?

A, the outbox gives consumers exactly-once delivery for free. B, it publishes versioned business events, not internal rows. C, change data capture cannot capture tables that are written this often. D, the outbox has lower latency than reading table changes.

[think]

The answer is B: it publishes versioned business events, not internal rows.

Raw change data capture exposes row-level changes to internal tables as a public contract, so a table change breaks consumers. The outbox keeps atomicity, because the event commits in the same transaction as the business change, and the event router publishes the payload under a topic and key you control. It is still at-least-once, so consumers deduplicate by the id header.

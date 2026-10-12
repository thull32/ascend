---
lesson: event-driven-architecture
source: 56db28c39a3c98e4
---
## 1

A service inserts an order, commits, then publishes an order-placed event to Kafka. The publish times out. What is the state of the system?

A, consumers receive a partial event, missing the order body. B, the order is committed, but consumers never learn of it. C, Kafka retries the publish until the event is delivered. D, the order was rolled back when the publish timed out.

[think]

The answer is B: the order is committed, but consumers never learn of it.

The commit already succeeded, and the publish is a separate system with no shared transaction, so nothing rolls back. Nothing retries it unless the application does, and a crash loses even that. The transactional outbox makes the event part of the commit.

## 2

An outbox relay produces event e1, the broker acknowledges it, and the relay crashes before marking e1 as published. What happens next?

A, the outbox row is rolled back, so e1 is never delivered. B, the broker returns the offset of e1, so the relay skips it. C, Kafka's idempotent producer drops the second copy automatically. D, the restarted relay publishes e1 again, and consumers dedupe by ID.

[think]

The answer is D: the restarted relay publishes e1 again, and consumers dedupe by ID.

The row is still unpublished, so the next relay run produces it again, and the topic holds two copies. The idempotent producer only dedupes retries within one producer session, and the restarted relay has a new producer ID. Consumers must dedupe on the outbox row's ID.

## 3

A projector reads events whose position is greater than its checkpoint, where the position is an auto-incrementing sequence, and many transactions append concurrently. What can go wrong?

A, nothing, since sequence values are always assigned in commit order. B, it can apply an event twice, because sequence values repeat. C, it can skip an event committed after a higher position was read. D, it can read uncommitted events from in-progress transactions.

[think]

The answer is C: it can skip an event committed after a higher position was read.

Sequence values are allocated at insert, not at commit. If position 101 commits before 100, the projector advances its checkpoint past 100 and never sees it. Reading below the oldest in-progress transaction, serialising appends, or tailing the WAL avoids it. Sequences do not repeat, and uncommitted rows are invisible.

## 4

Two handlers both load an account at version 6, and each appends a withdrawal at version 7. The event store has a unique constraint on the stream and version. What happens?

A, both appends succeed, and the projection merges them in order later. B, the later append overwrites the earlier one at version 7. C, both appends fail, and the account is locked until a retry. D, one succeeds, and the other fails, reloads, and rechecks the command.

[think]

The answer is D: one succeeds, and the other fails, reloads, and rechecks the command.

The unique constraint admits one row at version 7. The loser gets a violation, reloads at version 7, and re-validates the command against the new balance, which may now reject it. That is optimistic concurrency: the conflict is the invariant being enforced.

## 5

Your topic's schema registry runs in Confluent's backward compatibility mode. Which statement is true?

A, only renames are rejected, since fields are matched by name. B, consumers on the old schema can read data written with the new. C, every change must be readable in both directions, all the way back. D, consumers on the new schema can read data written with the old.

[think]

The answer is D: consumers on the new schema can read data written with the old.

Backward means new readers can read old data, so consumers upgrade first, and it permits deleting a field that old consumers may still read. Forward is the old-reader guarantee, full is both, and the transitive modes check every earlier version.

## 6

A field that consumers read is first given a default, and then deleted, and a registry in full compatibility mode accepts both changes. A consumer built against the schema with the default still reads the field. What happens?

A, it silently reads the default value for every new event. B, it receives the last value the producer wrote for the field. C, the registry blocks it from consuming until it upgrades. D, it fails to decode new events, and stops consuming them.

[think]

The answer is A: it silently reads the default value for every new event.

Avro fills a field the writer no longer sends with the reader's default, so decoding succeeds and the value is wrong, with no error anywhere. A reader whose schema has no default would fail loudly instead. Registries check schemas against schemas, not which consumers still read a field, so deletes need telemetry on readers.

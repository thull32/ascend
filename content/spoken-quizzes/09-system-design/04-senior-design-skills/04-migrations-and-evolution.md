---
lesson: migrations-and-evolution
source: 02f301d373e315db
---
## 1

During a migration, the application writes each update to the old store, and then to the new store. Two concurrent updates to the same row both succeed everywhere, with no errors. What can still go wrong?

A, the old store deadlocks on the two concurrent updates. B, the new store rejects the second write as a conflict. C, the two stores may apply them in different orders. D, nothing, since both stores received both writes successfully.

[think]

The answer is C: the two stores may apply them in different orders.

Without a shared order, the stores can apply the same two writes in different sequences, and end with different final values, permanently and silently. Receiving both writes is not enough; order matters. Feeding the new store from the old store's commit log fixes the order.

## 2

Change data capture applies a delete of row R at version 7. The backfill then delivers its copy of R, read earlier at version 5. With version-checked writes, what must the new store have kept, so that R does not reappear?

A, a lock on R until the backfill ends. B, a copy of R's last value at version 5. C, nothing, because R is already deleted. D, a tombstone for R recording version 7.

[think]

The answer is D: a tombstone for R recording version 7.

The version check compares against the stored version. If the delete removed R entirely, the store has nothing to compare with, and the version 5 copy is applied as a new row. A tombstone remembers version 7, so the stale copy is rejected. A lock would stall live writes, and still not tell the store the copy is stale.

## 3

Why start reverse replication, from the new store back to the old, at the moment writes move to the new store?

A, to double write throughput, by using both stores at once. B, because change data capture only works in one direction at a time. C, so a rollback does not lose writes made after the cutover. D, to verify the new store, by comparing it with the old.

[think]

The answer is C: so a rollback does not lose writes made after the cutover.

Without it, the old store freezes at cutover, and a rollback would discard everything written since, turning the cutover into a one-way door. With it, the old store stays current, and rollback remains a flag flip.

## 4

In a watermark-based snapshot, a chunk read between the low and high watermarks contains key 2, and a log event for key 2 also falls between the watermarks. What happens to the chunk's copy of key 2?

A, the chunk is discarded, and read again from scratch. B, it is dropped, because the log event carries the value. C, it is emitted first, and the log event follows it. D, it is emitted after the log event, replacing it.

[think]

The answer is B: it is dropped, because the log event carries the value.

Any key changed between the watermarks is removed from the in-memory chunk, because the log event is at least as new as whatever the select saw. The remaining chunk rows are emitted when the high watermark reaches the log. Emitting the chunk's copy after the event would overwrite newer data, and re-reading the chunk would never finish on a busy table.

## 5

The new store absorbs 50,000 rows a second at its SLO, and live writes peak at 20,000 a second. What happened in the lesson's simulation when the backfill ran at a fixed 40,000 rows a second?

A, the change stream fell hours behind the live writes. B, it slowed itself automatically as the store saturated. C, the store rejected the excess backfill writes with errors. D, it finished in about 21 hours, with no effect on users.

[think]

The answer is A: the change stream fell hours behind the live writes.

At peak, the demand is 60,000 rows a second, against 50,000 of capacity, so the live stream absorbed the shortfall, and its lag reached about 7.6 hours. The backfill did finish in about 21 hours, but at the cost of stale history for every user. Nothing in a fixed-rate loop slows down on its own; a budget with lag feedback does.

## 6

Shadow reads have compared 30,000 responses from the old and new stores, with zero mismatches. What can you claim?

A, the new store is identical to the old store for every key. B, the mismatch rate is below about 0.01 percent, at 95 percent confidence. C, the mismatch rate is below 0.0033 percent, with certainty. D, nothing, until at least a million reads have been compared.

[think]

The answer is B: the mismatch rate is below about 0.01 percent, at 95 percent confidence.

With zero failures in n trials, the 95 percent upper bound on the rate is about 3 over n, the rule of three: 3 over 30,000 is 0.01 percent. A sample cannot prove every key identical, and 1 over n is the observed-rate intuition, without confidence. Volume is rarely the limit; covering a full weekly cycle of traffic patterns is.

---
lesson: migrations-and-evolution
source: 1b6fb243f56491f2
fit: great
desk:
  - "The facade routing table and the six requests traced through it"
  - "The dual-write and watermark-snapshot traces, as tables"
  - "The backfill throttle simulation and the backfill loop code"
  - "The checksum query, the cutover timeline and the deprecation gates"
  - "Exercise: apply CDC and backfill events with a version check"
---
## Introduction

Viewing history lives in the monolith's MySQL database: 3 billion rows, about one and a half terabytes, 20 thousand writes a second at peak, read on every home-page load. It has to move to a new service backed by Cassandra. No downtime, no lost data, and the ability to back out at any point.

Designing the new service is the easy half. The hard half is getting there, because every step happens while users are watching, and every mistake corrupts data they will see the next time they open the app. Migrations are where senior engineers earn the title: months of work, full of traps that look fine in review.

Here is the path: why the weekend cutover fails, the race hidden in writing to both stores, how one log fixes it, a backfill that neither corrupts data nor hurts production, and how to verify, cut over, and actually finish.

## Small steps, one source of truth

The tempting plan is a weekend: stop writes, copy everything, switch, restart. It concentrates every risk into one irreversible moment. The finance report nobody mentioned breaks on Monday. The new system has never served real load. And rolling back means copying back every write since the switch, which nobody has rehearsed.

The alternative rests on four principles. Old and new coexist, sometimes for months. Every step is small, observable and reversible, usually by flipping a flag. There is exactly one source of truth at every moment, and everyone knows which. And you verify against production data before users depend on it.

Traffic moves with the strangler fig: a routing facade in front of the old system, flipping one route at a time to the new service. Reads move by cohort, chosen by a hash of the profile rather than per request, so one person does not flip between old and new state on every refresh. Routes not yet moved can shadow: served by old, read from new too, compared and discarded. Shadow reads freely, but never shadow writes with side effects. A shadowed "send receipt" sends two emails; a shadowed charge charges twice.

Data moves in seven phases: replicate new writes, backfill history, verify, shift reads, flip writes, soak, retire. The source of truth changes exactly once, at the write flip, and every phase before it can be abandoned with no user impact.

## The dual-write trap

The obvious shortcut for replication is to have the application write to both stores. It corrupts data in two ways, and neither raises an error.

Picture one row: a profile's resume position for one title. A TV sends 100 seconds; a phone sends 200, at nearly the same time. The TV's request writes the old store, then the phone's writes the old store and the new store, and then the TV's delayed write, held up by a garbage-collection pause, reaches the new store. Where do the two stores end up?

[pause]

The old store says 200. The new store says 100. Both writes succeeded everywhere, nothing was logged, and the stores disagree permanently. At 20 thousand writes a second with pauses of tens of milliseconds, this happens many times a day.

The second way is partial failure. A write to the new store times out with an unknown outcome. Skip the retry, and the new store misses a write. Retry it, and the retry can land after a newer write: the reordering bug, caused by the fix for the first bug. Either way the stores disagree, and nothing records that they do.

## One log decides the order

The fix is to stop treating the two stores as equals. The old store stays the single source of truth, and the new store is fed from the old store's own commit log, in commit order, by change data capture. In the reordering case, the log holds 100 then 200, because that is the order the old store committed them, and both stores end at 200. A connector that crashes resumes from its last confirmed log position, so a failure delays a change instead of losing it.

When log access is not available, the transactional outbox gets the same ordering from inside the application. In one transaction, update the row and insert an event into an outbox table; both exist, or neither does. A relay reads the outbox in order and forwards each event. If it crashes after sending and before checkpointing, it sends again.

That last point applies everywhere: delivery is at least once. So every path into the new store applies events with a version check. Each event carries the source's version for the row, and the new store applies it only if it is newer than what it holds. In Cassandra, you get the same effect by setting the write timestamp to the source version. And deletes must leave a tombstone carrying their version. Otherwise a stale copy arriving later has nothing to lose to, and resurrects the row.

There is one more race: historical rows are not in the log, so they are read with a select, and a select races the log. Netflix's change-capture framework solves this with watermarks: write a low watermark, read a chunk, write a high watermark, and drop from the chunk any key the log changed between the two, because the log's value is at least as new.

## The backfill

A backfill that bypasses the versioned path races live changes. At 10 o'clock the backfill reads a row at version 5. A second later, change capture applies version 6 to the new store. A second after that, the backfill writes its version 5 copy, and overwrites the newer data. With the version check, that write is simply rejected. Two rules: the backfill and the live stream use the same versioned write path, and change capture starts before the backfill, from a recorded log position, so no change falls into the gap.

Chunk by primary key, never by offset. Asking for rows after the last key you saw is an index range scan that costs the same for the last chunk as the first. An offset makes the database walk and discard every earlier row each time; over 3 million chunks, that is over a million times more rows visited.

Now the rate. The new cluster holds its write SLO up to 150 thousand replica writes a second, and each row costs three, so it absorbs 50 thousand rows a second. Live writes swing from 8 thousand in the morning to 20 thousand at the evening peak. What happens to a fixed backfill rate of 40 thousand rows a second?

[pause]

It finishes first, in about 21 hours, by leaving every user's history hours stale. At peak, demand is 60 thousand against 50 thousand of capacity; the live stream absorbs the shortfall, and its lag reached 7.6 hours. A fixed safe rate of 10 thousand takes three and a half days. A computed budget, 80 percent of the headroom, is fast but blind to capacity dips from compaction and repairs: lag reached two minutes. A controller that only watches lag keeps probing: slower, and lag still reached almost ten seconds. The winner combines them: the computed budget, halved whenever change-capture lag passes two seconds. It finished 3 billion rows in 29 hours, with lag never above 2.7 seconds.

Because writes are versioned, re-running any range is harmless. A crash, a bug fix or a verification failure means "re-run these chunks", not "start over". And parallel workers share one budget: ten workers at 3 thousand rows a second is the same 30 thousand as one.

## Verify, cut over, and finish

"The job finished without errors" is not evidence. Verify in layers, cheapest first. Counts per key range catch gross loss. Checksums per chunk, compared on both sides, find the chunks that differ. Sampled field-by-field comparison. And shadow reads, with a mismatch metric by category.

How many clean shadow reads are enough? With zero mismatches in n comparisons, the 95 percent upper bound on the mismatch rate is about three over n, the rule of three. 30 thousand clean reads bound it below a hundredth of a percent, and shadowing a slice of home-page traffic gets there in minutes. So volume is never the constraint; coverage is. Run shadow reads across a full weekly cycle. And classify every mismatch as in flight, a bug, or dirty source data. The goal is not a small mismatch rate but an explained one.

Reads shift by sticky cohort, like a canary: 1 percent, 10, 50, 100. Writes are the hard moment. At the daily trough, 8 thousand writes a second, pause writes and buffer them; wait for change capture to apply everything through the old store's current log position; flip the source of truth; start reverse replication from new to old; resume and drain the buffer. Budget two seconds, about 16 thousand buffered writes. If the wait overruns, unpause and try later; nothing has changed yet.

Reverse replication is what keeps rollback a flag flip. Without it, rolling back loses every write since cutover, and the cutover has quietly become a one-way door. Keep it through a soak of weeks. End to end, about three months, for a schema that took a week to design. Say that ratio out loud when you estimate a migration.

Live schemas evolve by the same rule: every version that can be live at once must work with every shape of data it can meet. Renaming a column is six reversible steps: add the new column, write both, backfill, move reads, stop writing the old one, drop it. APIs stay additive.

And a migration is finished when the old thing is gone. Most stall with the last 5 percent of callers keeping the old system alive at full cost. What finishes them: per-caller telemetry, deprecation and sunset headers, scheduled brownouts where the old path fails on purpose to flush out unknown callers, and an owner for the long tail, usually one forgotten batch job. Each phase starts on a metric gate, not on the calendar.

## In the interview

The classic: why not dual-write from the application? It is much simpler.

[pause]

Because it creates two sources of truth with no ordering between them. A partial failure leaves the stores disagreeing with no record, and two concurrent updates can land in opposite orders, so the stores disagree permanently without an error. Keep one source of truth and feed the new store from its log, or from an outbox written in the same transaction, with versioned writes. The wrong answer is "wrap both writes in a distributed transaction", which couples the old store's availability to the new one's, and most stores you would migrate to do not offer it.

And: mid-migration you discover a tenth of a percent of rows in the new store are corrupted. Flip reads back to the old store, still the source of truth, so users are unaffected in seconds. Fix the transformation. Find the affected chunks from the checksum data, and re-run them while change capture keeps running, which the versioned writes make safe. Do not patch the bad rows with a script; that fixes symptoms and leaves the bug writing more.

## Recap

Five things to remember. Exactly one source of truth at every moment, changed once, at a planned flip. Never dual-write from the application; feed the new store from the old store's log or an outbox. Version every write path and keep tombstones, so replays and backfills cannot overwrite or resurrect. Throttle the backfill from a computed budget with lag feedback, chunked by primary key. And verify with checksums and classified shadow reads, keep rollback cheap with reverse replication, and retire the old system through dated, gated phases with an owner.

At your desk: the facade routing table, the dual-write and snapshot traces, the throttle simulation and backfill loop, the checksum query and cutover plan, and the version-check exercise.

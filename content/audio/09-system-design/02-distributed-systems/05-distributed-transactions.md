---
lesson: distributed-transactions
source: c90a54ff94ac1af8
fit: great
desk:
  - "The two-phase commit crash table, one row per crash point"
  - "The three-phase commit partition trace and the Percolator transfer trace"
  - "The saga trace through a timeout and a compensation"
  - "The worked trip-booking design, and the comparison table"
---
## Introduction

A trip booking needs a flight, a hotel and a car, held by three services with three databases. Either all three are booked or none is. Nobody wants a hotel in a city they cannot fly to.

In one database, this is begin, a few writes, commit, and the storage engine makes it atomic. Across three databases, no engine is in charge. The naive sequence, book the flight, book the hotel, book the car, leaves a flight and a hotel booked when the car service is down.

Atomicity across systems is hard because the systems fail independently, and the network between them fails at the worst moment. There are three families of answer. A protocol that makes every participant commit or abort together: two-phase commit. A sequence of local transactions with undo steps: sagas. And a restructuring that turns "write here and also there" into "write here, and let the other system follow": the transactional outbox. The senior bar is knowing which one fits, and exactly how each one fails.

## Two-phase commit

A coordinator drives the protocol; the databases are participants. Their writes are already done, uncommitted, holding locks.

Phase one is prepare. Each participant makes sure it can commit: it writes the changes and a "prepared" record to its log, flushes to disk, keeps its locks, and votes yes. A yes vote is a promise. The participant may no longer abort on its own.

Phase two is decide. If every vote is yes, the coordinator writes "commit" to its own log and flushes. That write is the commit point. Then it tells everyone to commit. Any no vote or timeout means abort.

Now the crash that matters. The coordinator collects every yes vote, and then dies before logging a decision. What can the participants do?

[pause]

Nothing. Each one is in doubt. It cannot commit, because a vote might have been missing. It cannot abort, because the coordinator might have committed. So it holds its locks and waits for the whole outage. When the coordinator restarts and finds no decision in its log, it aborts. That convention, "no decision means abort", is called presumed abort, and most implementations use it.

The in-doubt window exists at every point after a participant votes yes and before it hears the decision. A coordinator crash inside it becomes locks held for as long as the coordinator is down. Operators can force a decision by hand, at the risk of one participant committing while another aborts.

## What two-phase commit costs

Two-phase commit adds two round trips and at least three disk flushes to the critical path, and every lock is held across all of it. So a contended row's throughput is bounded by one over the lock-hold time.

In one database, with a 1 millisecond flush, that is about a thousand transactions a second on a hot row. Participants in one region add about 3 milliseconds, so roughly 330 a second. Participants in two regions 70 milliseconds apart hold locks for about 142 milliseconds: about 7 transactions a second on that row.

Availability multiplies too. A commit needs the coordinator and every participant up. Four components at three nines each give about 99.6 percent: roughly 35 hours a year of failed or blocked commits, instead of 9.

Three-phase commit tries to remove the blocking by adding a pre-commit round: a participant that times out after pre-commit commits, and one that times out before it aborts. That works only if a timeout means a crash. Under a partition it fails. The coordinator sends pre-commit, only one participant gets it, the coordinator dies, and a partition cuts that participant off. It times out and commits. The other two find nobody pre-committed among themselves, and abort. One committed, two aborted. That is why nobody runs it.

## Two-phase commit done safely

The version that works replicates the coordinator's decision, so a coordinator crash is not an outage.

Percolator, Google's system on Bigtable and the model TiDB uses, adds multi-row transactions to a store that only offers single-row atomicity. One written row is the primary, and its lock is the whole transaction's commit point. Commit is one atomic write to the primary row; the other rows can be finished lazily.

If the client dies after committing the primary, a reader that finds a leftover lock on another row follows it to the primary, sees the commit, and rolls that row forward itself. If the primary is still locked by a dead client, the reader rolls everything back. Nothing waits on a dead client for longer than the liveness check. The price is snapshot isolation rather than serializability.

Spanner runs classic two-phase commit, but every participant and the coordinator are Paxos groups. A coordinator machine failing is a leader change, not an in-doubt outage. CockroachDB goes further with parallel commits, writing the transaction record alongside the final writes, so a commit costs one round of consensus instead of two.

## Sagas

A saga replaces one atomic transaction with a sequence of local transactions, each committed on its own, plus a compensating transaction for each that semantically undoes it. If a step fails, the saga runs the compensations in reverse. No locks are held across services.

For the trip: reserve the flight, book the hotel, reserve the car, then charge the card, and finally send the confirmation email. The charge is the pivot: after it, the saga never rolls back. Cheap-to-undo steps go first. The refund is costly, so the charge comes last among the undoable steps. The email has no undo, so it goes after the pivot and is retried until it succeeds.

The orchestrator persists its state before every step, and uses the saga id plus the step number as an idempotency key. Now trace it. The flight reserves fine. The hotel call times out. What should the orchestrator do?

[pause]

Retry the same step with the same key. A timeout is unknown, not failed: the hotel may have booked. And in the trace it had; the retry returns the original room. Then the car fails, a definite failure before the pivot, so the saga cancels the hotel, then the flight, and tells the user no trip was booked.

Treat that timeout as a failure and you compensate a booking you believe never happened, leaving a room nobody pays for. Treat it as success without retrying and you build on nothing.

Four rules for compensations. They are semantic, not physical: a refund sits beside the charge; it does not delete it. Order steps by how cheap they are to undo, with the pivot as late as possible. Make everything idempotent on saga id and step. And a compensation must succeed even if its forward step never happened.

Run sagas with an orchestrator, a persisted state machine that resumes from its table after a crash. Temporal and AWS Step Functions are engines that do this. Choreography, where services react to each other's events with no central record, makes compensation order and "where is this saga?" hard to answer.

## What sagas give up, and the outbox

Sagas give up isolation. Between the hotel step and the car step, another user's search sees the room as booked. If the saga compensates, someone else may have been told "no rooms" for nothing. Two sagas updating the same inventory counter can lose updates.

The main countermeasure is a semantic lock: the forward step writes the record as pending, readers treat pending as unavailable or show "in progress", and the pivot confirms it. Others: use increments instead of overwrites, so interleavings commute, and reread before committing to check nothing you relied on changed.

The most common "distributed transaction" of all is one database plus a broker: save the order and publish "order placed". The outbox writes the order row and an event row in the same local transaction. A relay publishes the events afterwards, at least once, and consumers deduplicate on the event id. A crash can delay an event or publish it twice, but never lose it, and never publish one for an order that rolled back. The usual relay reads the database log with change data capture, like Debezium.

Put together for the trip: an orchestrated saga whose every state change commits with an outbox event; reservations written as pending with a 15 minute expiry; payment as the pivot, with an idempotency key so a retried charge cannot charge twice; and confirmations after it, retried until they succeed. If the orchestrator is down longer than the hold window, the expiry releases the seat on its own. No lock is held across services. What you give up is isolation: for up to 15 minutes, a pending room is unavailable even if the trip will fail.

## In the interview

A follow-up the lesson expects. The order service writes the order and publishes an event. Two-phase commit between Postgres and Kafka?

[pause]

No. That makes the application server the coordinator, and its crash leaves order rows locked. The outbox gives the same atomicity with one local commit, a relay, and consumers that deduplicate. The wrong answer is "write to Postgres, then publish, and retry on failure", which loses the event when the process dies between the two.

And: why does nobody use three-phase commit? Because it avoids blocking only if a timeout reliably means a crash, and under a partition one side commits while the other aborts. Replicating the decision with consensus solves blocking without that assumption. "It is too slow" is true, but it is not the reason.

## Recap

Four things to remember. Two-phase commit's commit point is the coordinator's logged decision, and a crash after the votes leaves every participant in doubt, holding locks. Its cost is lock-hold time: about 7 transactions a second on a hot row across two regions. Use it only inside a system that replicates its coordinator, like Spanner or Percolator. A saga trades isolation for availability: put the pivot late, make every step idempotent, and treat a timeout as unknown, never as failure. And for write-plus-publish, use the outbox, after first looking for a single-writer design that needs no distributed transaction at all.

At your desk: the crash-point table, the three-phase commit and Percolator traces, the saga trace, and the worked trip design.

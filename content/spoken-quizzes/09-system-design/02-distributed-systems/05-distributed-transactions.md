---
lesson: distributed-transactions
source: bab36f506a744214
---
## 1

In two-phase commit, at what moment is the transaction irrevocably committed?

A, when every participant has voted yes to the coordinator. B, when the client receives the commit acknowledgement. C, when the first participant has committed locally. D, when the coordinator durably logs its commit decision.

[think]

The answer is D: when the coordinator durably logs its commit decision.

Yes votes are promises, not a decision, and the coordinator may still abort if another vote is missing. The logged decision is the commit point: after it, recovery always drives participants to commit. Participants commit, and the client learns of it, afterwards.

## 2

The coordinator crashes after all participants voted yes, but before it logged a decision, and restarts ten minutes later. Using presumed abort, what happened in between, and what is the outcome?

A, participants waited with their locks held, and the transaction aborts. B, participants aborted at once, and the restart finds nothing. C, participants elected a new coordinator, which committed. D, participants timed out and committed, since all had voted yes.

[think]

The answer is A: participants waited with their locks held, and the transaction aborts.

A participant that voted yes is in doubt. It cannot commit, because a vote could have been missing, or abort, because the coordinator could have committed, so it holds its locks for the whole outage. On restart, the coordinator finds no decision record, which under presumed abort means abort.

## 3

Two participants are in regions 70 milliseconds apart. Roughly how many transactions per second can update one hot row under two-phase commit?

A, about 1,000, since fsync dominates the commit time. B, unlimited, since each participant commits on its own. C, about 330, as with participants in one region. D, about 7, since the locks span two cross-region trips.

[think]

The answer is D: about 7, since the locks span two cross-region trips.

Locks are held from prepare until the commit arrives: about 2 times 70 milliseconds, plus fsyncs, roughly 142 milliseconds, so a contended row manages about 7 transactions a second. In one region, the same arithmetic gives a few milliseconds, and hundreds a second.

## 4

Under three-phase commit, a partition separates one pre-committed participant from two that are only prepared, and the coordinator crashes. What happens?

A, all three block until the coordinator comes back. B, all three abort, because the coordinator is missing. C, the pre-committed one commits, and the other two abort. D, all three commit, because everyone had voted yes.

[think]

The answer is C: the pre-committed one commits, and the other two abort.

Three-phase commit's rules assume a timeout means a crash. The isolated participant times out after pre-commit, and commits. The other two find nobody pre-committed among themselves, and abort. The outcome diverges, which is why systems replicate the coordinator's decision instead of running three-phase commit.

## 5

A saga's hotel step times out with no response. What should the orchestrator do?

A, mark the saga failed, and stop without compensating. B, run the compensations at once, treating it as a failure. C, retry the step with the same idempotency key. D, skip to the car step, treating the hotel as booked.

[think]

The answer is C: retry the step with the same idempotency key.

A timeout is an unknown outcome: the hotel may have booked. Compensating could cancel something that succeeded, or leave a room nobody pays for, and proceeding could build on nothing. An idempotent retry returns the original result if it did succeed. Only a definite failure before the pivot triggers compensation.

## 6

A Percolator transaction's client dies after committing the primary row, and before committing a secondary. What does a later reader of the secondary do?

A, it reads the secondary's uncommitted data value directly. B, it blocks until the dead client restarts and finishes. C, it rolls the whole transaction back, since it is unfinished. D, it finds the primary committed, and rolls itself forward.

[think]

The answer is D: it finds the primary committed, and rolls itself forward.

The secondary's lock points at the primary, whose single-row commit is the transaction's commit point. Finding a commit record there, the reader completes the secondary itself. Had the primary still been locked by a dead client, the reader would roll back instead, so nothing waits on the client.

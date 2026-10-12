---
lesson: idempotency-and-retries
source: 91fd87de7e201e41
---
## 1

A client sends a POST to create an order, with idempotency key K. It times out after 2 seconds, and retries at 2.1 seconds, while the first attempt is still executing. What should the server do?

A, return the stored response for K from the first attempt. B, see K marked in progress, and return 409 or wait for the first. C, reject the retry with a 400, because a key may be used only once. D, execute the second request too, since the first has not completed.

[think]

The answer is B: see K marked in progress, and return 409 or wait for the first.

The atomic claim makes the second attempt find an in-progress record, so it returns 409, with a retry-after header, or waits. Executing it would create two orders, there is no stored response yet, and reusing a key on retry is exactly what keys are for.

## 2

Two sessions each run a select to check for an existing payment with key K, find none, and then insert and charge. What prevents the double charge?

A, a unique index on the key, claimed by the insert itself. B, retrying the select until it returns the same count twice. C, running both sessions at the default read committed isolation level. D, adding a short sleep between the select and the insert.

[think]

The answer is A: a unique index on the key, claimed by the insert itself.

Check-then-act is a race: both selects can run before either insert, which the Postgres experiment reproduced. A unique index makes the claim atomic, and the second insert waits for the first transaction, then fails or returns no row. Sleeps and repeated selects only move the window.

## 3

A payment handler charges the processor, then crashes before recording the result. The client retries with the same key after the lease expires. What prevents a second charge?

A, the processor dedupes on the same key, and returns the original charge. B, the retry sees the state marked done, and replays the stored response. C, the lease blocks the retry permanently until someone intervenes. D, the database transaction around the charge is rolled back on the crash.

[think]

The answer is A: the processor dedupes on the same key, and returns the original charge.

The side effect happened outside any transaction, so nothing rolled it back, and our table still says in progress. Passing the idempotency key to the processor makes the re-driven charge return the original charge. The lease only delays the retry, and the state is not yet done.

## 4

In the simulated 10-second stall, three retries with exponential backoff and full jitter never recovered, while a deadline-aware server with no retries recovered as soon as the stall ended. What was sustaining the outage?

A, jitter spreading the retries too thinly across time. B, too few retries per request to get through the backlog. C, the server's backlog of requests whose clients had left. D, the retry budget throttling legitimate first attempts.

[think]

The answer is C: the server's backlog of requests whose clients had left.

The server kept processing requests whose 1-second deadline had passed, so every response was late, every attempt timed out and was retried, and offered load stayed near four times capacity: a metastable failure. Dropping expired requests at the server let fresh requests through immediately. Jitter made no difference, because the failures were not synchronised.

## 5

2,000 clients are disconnected at the same instant, and retry with exponential backoff but no jitter, against a server that admits 1,000 requests a second. What happens?

A, they finish in about 2 seconds, the capacity limit. B, they stay in lockstep, so each wave mostly fails again. C, they spread out naturally after the first retry. D, they finish faster than with jitter, since delays are shorter.

[think]

The answer is B: they stay in lockstep, so each wave mostly fails again.

Identical deterministic delays keep every client synchronised, so each retry wave lands in the same instant, and only that instant's capacity succeeds. In the simulation, it took 971 seconds and about 100 attempts per client. Any jitter broke the lockstep, and finished in 4 to 6 seconds.

## 6

A consumer handles each message in one transaction that inserts the event ID into a processed-events table, applies the effect, and writes an outbox row, and it acknowledges after the commit. It crashes after the commit and before the acknowledgement. What happens?

A, the effect runs twice, since the acknowledgement never reached the broker. B, the transaction rolls back, since the acknowledgement was part of it. C, the message is lost, since the broker never saw an acknowledgement. D, it is redelivered, finds its event ID, and is skipped.

[think]

The answer is D: it is redelivered, finds its event ID, and is skipped.

The broker redelivers anything unacknowledged, and the dedupe row committed together with the effect, so the redelivery finds it, skips the effect, and acknowledges. The acknowledgement is the only step outside the transaction: it cannot roll anything back, and losing it causes a redelivery rather than a loss.

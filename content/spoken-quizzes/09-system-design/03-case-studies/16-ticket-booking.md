---
lesson: ticket-booking
source: f7126927ab7829ff
---
## 1

Two requests try to hold the same available seat at the same instant, each with an update that sets seat 14 to held, where its status is available. What happens?

A, the database raises a deadlock error on both transactions. B, the second blocks, re-checks, sees held, and updates no rows. C, both succeed, because they read the row at the same time. D, whichever request has the lower user ID wins the seat.

[think]

The answer is B: the second blocks, re-checks, sees held, and updates no rows.

Row locking serialises the two updates: the second waits for the first to commit, then re-evaluates its condition against the committed row, finds it held, and updates nothing. Because check and write are one statement, there is no window for a race. A select followed by an update has that window, which the experiment reproduced as two recorded holds.

## 2

Two million users arrive for 50,000 seats, averaging 2.5 seats per order. What is the main design consequence?

A, put the seats in Redis, to handle 100,000 holds a second. B, only about 1 percent can win, so admit users at the rate seats can sell. C, raise the hold time to 30 minutes, so checkouts can finish. D, shard the seats table across 100 databases for write load.

[think]

The answer is B: only about 1 percent can win, so admit users at the rate seats can sell.

Only 20,000 orders exist, so 99 percent of the load comes from users who will fail. Admission control, with everyone else waiting cheaply at the edge, turns a write problem of 100,000 a second into about 1,250 a second. Scaling the inventory store to serve doomed requests is the expensive wrong answer.

## 3

Holds aimed at the best 2,000 seats ran at 66,600 attempts a second, while holds spread over all 50,000 seats ran at about 9,000. Why were the contended attempts faster?

A, hot rows stay in the buffer cache, so each read is quicker. B, Postgres batches updates that target the same rows together. C, the hot seats were locked, so attempts were queued and skipped. D, most matched no rows, and an update of no rows writes no WAL.

[think]

The answer is D: most matched no rows, and an update of no rows writes no WAL.

Nearly all attempts on the hot seats found them held, updated nothing, and committed without writing WAL or waiting for a flush. Successful holds pay for a durable commit. Failed attempts are the cheap ones, which is why contention on the best seats is not a throughput problem; a single hot counter row is.

## 4

Why does the hold query treat held seats whose hold has expired as claimable?

A, to let a new buyer take over a seat that is still being paid for. B, because the database has no way to run scheduled jobs. C, so that correctness does not depend on the background sweeper. D, to keep the seat map accurate between sweeper runs.

[think]

The answer is C: so that correctness does not depend on the background sweeper.

Expired holds are released lazily by the next claimant, so the sweeper only keeps the seat map accurate. A seat whose payment is pending is not matched by that clause, so a checkout in progress is never taken.

## 5

A user clicks Pay two seconds before their hold expires, and the payment provider takes three seconds. What stops another fan claiming the seats meanwhile?

A, checkout moves the seats to payment pending, which no claim matches. B, the client keeps the hold alive by polling the order status. C, the provider's authorisation locks the seats in the database. D, the sweeper skips holds whose owners have clicked Pay recently.

[think]

The answer is A: checkout moves the seats to payment pending, which no claim matches.

Checkout's conditional update succeeds only while the hold is live, and moves the seats to a state that the lazy-expiry clause does not match, extending the deadline for the payment. The provider knows nothing about seats, polling does not extend holds, and correctness does not depend on the sweeper.

## 6

A general-admission section of 80,000 tickets is one counter row, and holds were measured at 377 a second. What is the standard fix?

A, move the counter into the application server's memory. B, select the counter row for update before updating it. C, remove the capacity check, and reconcile oversells later. D, split the counter into bucket rows, and pick one at random.

[think]

The answer is D: split the counter into bucket rows, and pick one at random.

Updates to one row serialise on its lock, which is held through the commit's WAL flush, and selecting for update takes the same lock. Splitting the stock across 100 rows measured 6,610 holds a second, with each bucket still enforcing its own capacity. Removing the check oversells, and in-memory counters lose state on a crash.

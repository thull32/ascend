---
review: data-platforms
source: a06b219c159480d8
---
## Introduction

Twelve questions from the data-platforms module. Answer out loud before the answer comes.

Three from each lesson, in order: ETL and orchestration, dimensional modelling, data quality and governance, and ML data pipelines. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A daily task filters on order date equals the current date minus one, and writes with a plain insert. What goes wrong when it is retried after midnight?

A, the retry targets a different day, and appends to it. B, the orchestrator skips retries once the logical day has passed. C, nothing, because a retry repeats exactly the same query. D, the retry fails because the target table is still locked.

[think]

The answer is A: the retry targets a different day, and appends to it.

The current date moves with the clock, so the retry targets a different interval, and the insert appends to whatever is there. One day misses its rerun and another is duplicated or partial. The query text is the same, but its meaning is not. Using the run's logical date and overwriting its partition makes the retry repeat exactly the same work.

## Question 2

Two hundred poke-mode sensors wait for upstream files on a Celery fleet with 16 slots per worker, and unrelated tasks queue for hours. What is the right fix?

A, move the sensors to the default pool, which has 128 slots. B, raise the poke interval, so each sensor checks less often. C, raise parallelism, so the scheduler queues more tasks per cycle. D, use reschedule mode or deferrable sensors, so waits hold no slot.

[think]

The answer is D: reschedule mode or deferrable sensors, so waits hold no slot.

A poke-mode sensor occupies a worker slot for its whole wait, so 200 of them exhaust the fleet however often they check. Reschedule mode releases the slot between pokes, and a deferrable sensor parks the wait in the triggerer's event loop, which multiplexes thousands of waits in one process. More parallelism or a bigger pool does nothing when the workers are full of sleeping sensors.

## Question 3

A recompute uses a merge keyed on order date and country, with update and insert clauses. After a fix that moves a misattributed order from Germany to the US, the day's total is still wrong. Why?

A, merge is not idempotent, so rerunning it duplicated the US row. B, the stale Germany row was never deleted, because its key vanished from the source. C, the update clause overwrote the US row with the old Germany amount. D, merge cannot update rows that were written by an earlier run.

[think]

The answer is B: the stale Germany row was never deleted, because its key vanished from the source.

A merge with only matched and not-matched clauses touches keys present in the new source. A key that existed only in the buggy output is left as it was, so its stale row still counts. A true recompute of a partition must also remove vanished keys, with a not-matched-by-source delete, or with delete-then-insert in one transaction.

## Question 4

An analyst joins an invoice-line fact, one row per invoice line, to an invoice fact, one row per invoice, and sums the invoice-level tax. Tax comes out about 2.3 times too high. Why?

A, surrogate keys are missing, so invoices join twice. B, tax is non-additive, so it can never be summed. C, the join repeats each invoice's tax once per line. D, the tables need a snowflake schema to join correctly.

[think]

The answer is C: the join repeats each invoice's tax once per line.

Joining a coarser-grain table to a finer one repeats the coarse row for every fine row. With about 2.3 lines per invoice, invoice-level tax is summed 2.3 times. Tax is additive; the problem is a grain mismatch. Aggregate the lines to invoice grain first, or allocate the tax to lines.

## Question 5

Customer 42 moved from France to Germany on 15 March, and paid on 2 March and on 20 March. With a Type 2 dimension keyed at load time, how are the two payments reported?

A, both under Germany, the current version at query time. B, under whichever version is current when the report runs. C, 2 March under France and 20 March under Germany, permanently. D, both under France, the version that existed when the customer signed up.

[think]

The answer is C: 2 March under France and 20 March under Germany, permanently.

Each fact is keyed at load to the version whose effective range contains its payment date: the France version for 2 March, the Germany version for 20 March. The analyst joins on the surrogate key with no date logic, so the answer never changes. Joining to the current version instead would move both payments to Germany, and change again after the next move.

## Question 6

On 20 March the source reveals that a customer's move, loaded as effective 15 March, really happened on 10 March. What must change?

A, nothing, because Type 2 dimensions never modify historical rows. B, the two versions' dates, and the fact partitions for 10 to 14 March, re-keyed. C, insert a third version starting 10 March, and leave the facts alone. D, only the dimension: shift the two versions' effective dates.

[think]

The answer is B: the two versions' dates, and the fact partitions for 10 to 14 March, re-keyed.

Facts dated 10 to 14 March were keyed to the old version at load time, so correcting the dimension's dates alone leaves those facts pointing at the wrong version. The fix is two date updates on the dimension and an idempotent rerun of the affected fact partitions. Inserting a third version would create an overlapping range and double matches.

## Question 7

A schema registry subject is in backward mode, and the producer tries to register a schema that adds a required field with no default. What happens?

A, registration is rejected, because required fields are never allowed in Avro. B, registration succeeds, because old readers ignore unknown fields. C, registration succeeds, but consumers must be redeployed within a day. D, registration is rejected, because new readers could not read old records.

[think]

The answer is D: rejected, because new readers could not read old records.

Backward means a consumer on the new schema must be able to read data written with the previous one. Old records have no value for the new field, and there is no default to fill in, so the check fails and the registry returns a conflict. The change would pass in forward mode, where the guarantee runs the other way. Adding the field with a default makes it compatible in both directions.

## Question 8

Why is a check based on the median and the median absolute deviation preferred over the mean and standard deviation for daily row-count anomalies?

A, past outliers barely move it, so they cannot mask new ones. B, it needs no threshold, so it adapts to growth by itself. C, it fits normally distributed counts better than the mean does. D, it is faster to compute over long windows of history.

[think]

The answer is A: past outliers barely move it, so they cannot mask new ones.

A single bad day in the history window, say zero rows, can inflate the standard deviation enough that the next bad day looks normal. The median and the median absolute deviation are barely affected by a few outliers, so they keep flagging. Both approaches still need a threshold.

## Question 9

In a write-audit-publish flow on Iceberg, the audit of today's partition fails. What do readers of the main branch see?

A, a read error on today's partition until it is fixed. B, an empty partition for today until the audit passes. C, the new data, flagged as unaudited until the audit passes. D, the last audited data, while the new data stays on the branch.

[think]

The answer is D: the last audited data, while the new data stays on the branch.

The write went to an audit branch that readers of main do not see, and the fast-forward that publishes it never ran. Readers keep the last published, audited snapshot. The incident becomes lateness rather than wrong numbers, and nothing on main is emptied or broken.

## Question 10

A churn model's training set joins labels for 1 May to a features table on user id only, taking each user's latest row. Offline accuracy is excellent and production accuracy is poor. What is the most likely cause?

A, the model is overfitting to noise in the training month. B, the labels are imbalanced, since few users churn in May. C, the online store is too slow, so serving drops features. D, label leakage from feature rows computed after 1 May.

[think]

The answer is D: label leakage from feature rows computed after 1 May.

Without a point-in-time condition, the latest feature rows were computed after the prediction time, for example zero plays after a user churned, and they leak the label into the inputs. The model learns the leak, which does not exist at prediction time. Overfitting to noise would hurt held-out offline accuracy too, not only production.

## Question 11

Training uses a nightly batch feature computed as of midnight. Serving reads a streaming version updated every minute. Both implement the same definition correctly. Why can this still hurt the model?

A, the model learned day-old values, and now gets fresh ones. B, it cannot hurt, because the definitions are identical. C, streaming features are approximate, so the values drift apart. D, nightly jobs cannot compute the same windowed aggregates.

[think]

The answer is A: the model learned day-old values, and now gets fresh ones.

Freshness and window boundaries are part of a feature's meaning. The model learned from values whose window ended at midnight; in serving it receives values whose window ends now, with a different distribution. Identical code does not make a 12-hour-stale input and a 1-minute-stale input the same. Training on logged serving values, or computing training features at the same freshness, removes the skew.

## Question 12

The day after a deploy, the population stability index of the plays-in-the-last-seven-days feature, between training and serving, is 0.19. What should happen first?

A, compare served values with offline recomputation for the same requests. B, roll back the model, since drift means it is no longer valid. C, raise the alert threshold to 0.25, the conventional major-shift level. D, retrain the model on the last week of served data.

[think]

The answer is A: compare served values with offline recomputation for the same requests.

A PSI of 0.19 says the distribution moved, not why. If offline recomputation of the same entities and timestamps disagrees with the served values, the deploy changed the feature pipeline, and retraining would bake the bug into the next model. If it agrees, behaviour really changed, and retraining is appropriate. Neither raising the threshold nor rolling back the model addresses the feature path.

## Recap

Three ideas kept coming back. First, time must be explicit: a run's logical date instead of the clock, a dimension version valid at the event date, and features as of the prediction time, never the latest row. Second, a recompute must replace everything it owns, including keys and versions that have since vanished or moved. And third, publish only what you have checked, and diagnose before you react: audit on a branch, use robust statistics, and check for a pipeline change before retraining on drift.

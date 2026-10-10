---
lesson: etl-elt-and-orchestration
source: b582f8c20b0cf359
fit: great
desk:
  - "The ETL versus ELT table and the cost arithmetic"
  - "The Airflow task-instance state machine and the executor comparison table"
  - "The Airflow and Dagster code side by side"
  - "The row-by-row backfill table, and the overwrite, delete-then-insert and merge SQL"
  - "Exercises: compute a backfill plan with Kahn's algorithm, and replay daily runs with partition overwrite"
---
## Introduction

The daily revenue pipeline fails at 4:10 in the morning on step four of seven: a warehouse timeout. The on-call engineer clears the failed run and reruns the whole DAG from the top. By 6, the finance dashboard shows yesterday's revenue at exactly twice the real number. Step two had appended yesterday's orders to a staging table, and the rerun appended them again. The fix takes ten minutes. Explaining it to finance takes the rest of the day, and the next time a number looks odd, nobody trusts the dashboard.

Pipelines fail constantly, because they depend on upstream systems, networks, credentials and schemas that change without notice. A platform is reliable not because its jobs never fail, but because running any job again is always safe, and because the orchestrator knows which data each run is responsible for. Four parts: why modern pipelines load first and transform later, what an orchestrator really does, the rule of idempotent tasks traced row by row, and what a backfill costs.

## ETL versus ELT

ETL, extract, transform, load, transforms data on a separate compute tier before loading finished tables. It dominated when warehouse compute was expensive and fixed. ELT loads raw data first, into the lake or warehouse, and transforms it there with SQL.

The numbers. A source produces 500 gigabytes of raw order events a day. Under ETL, a fixed cluster turns that into 50 gigabytes of curated tables, and the raw data is gone once the source's own 30-day retention passes. A logic bug found in week six is unrecoverable for weeks one and two. Under ELT, the raw 500 gigabytes land in object storage first. A year of it is 182 terabytes, roughly 4 thousand dollars a month at list price by the end of year one, and a third of that if older partitions move to infrequent access. One full pass over a day's raw data on a pay-per-scan warehouse costs about 3 dollars.

ELT won for most analytical work because elastic compute made transformation cheap, and more importantly because keeping the raw data makes every mistake recoverable. The standard layering is raw, exactly what the source sent; staging, typed, deduplicated and renamed; and marts, the business entities and facts. Some teams say bronze, silver and gold. ETL still makes sense when data must be filtered before it lands, removing personal data at the edge, or when the transformation is not SQL-shaped.

## What an orchestrator does

An orchestrator runs a directed acyclic graph of tasks on a schedule, in dependency order, with retries, timeouts, alerting, and a record of every run. It is a scheduler and a bookkeeper, not a compute engine. Tasks should submit work to Spark or the warehouse and wait, not process data on the orchestrator's workers. A pandas job on an Airflow worker gets the worker killed for memory and takes every other task on it down too.

Inside Airflow 2, two processes matter. The DAG processor imports every Python file in the DAGs folder, every 30 seconds by default, with two parsing processes. Anything your file does at import time, a database query or an API call, runs on every parse. Four hundred files at 2 seconds each on two processes is 400 seconds per cycle, far above the 30-second interval. The symptom: tasks sit in scheduled for minutes while workers are idle.

The scheduler loops every 5 seconds. It creates runs, moves runnable tasks to scheduled, checks concurrency limits, and hands what fits to the executor. A running task heartbeats every 5 seconds. If it stops for 5 minutes, because the worker was killed or the node died, it is declared a zombie, marked failed, and retried. And here is the point: the task may have finished its write before the worker died. The retry runs the write again. No orchestrator guarantees a task runs once.

Concurrency has four gates: a global parallelism of 32 per scheduler, per-DAG task and run limits, and pools, which are how you say "at most 8 concurrent warehouse queries" whatever DAG wants them. Executors decide where tasks run. Celery keeps long-lived workers: sub-second start-up, but a fleet idle at night. Kubernetes runs a pod per task: per-task resources and no idle fleet, but seconds of start-up on every task.

## Sensors and data intervals

A sensor waits for a condition, a file or a partition. In the default poke mode, it holds a worker slot and sleeps between checks, for up to seven days. So, two hundred poke-mode sensors on a fleet with 16 slots per worker, and unrelated tasks queue for hours. What fixes it?

[pause]

Not a longer poke interval, and not more parallelism: the slots are full of sleeping processes either way. Reschedule mode releases the slot between pokes. Deferrable operators go further: the wait is handed to the triggerer, which multiplexes thousands of waits in one event loop, and the task holds no slot at all.

Data intervals explain a famous confusion. A daily run with logical date May 1 covers midnight May 1 to midnight May 2, and the scheduler creates it when the interval ends, on May 2. That is not a timezone bug. The data for May 1 does not exist until May 1 is over. The logical date names the interval, not the wall clock.

And catchup. With catchup on, which was the Airflow 2 default, deploying a daily DAG whose start date is four years ago creates about 1,460 runs. With max active runs at 4, four execute at a time. That is either a free backfill or a warehouse outage, depending on whether you meant it.

Dagster inverts the model. You declare assets, the tables, and their partitions, and the orchestrator derives the tasks. Because it knows the revenue partition for May 1 is built from the staging partition for May 1, it can show a downstream partition is stale after an upstream rerun, and backfill a range across the whole graph in dependency order. Netflix's Maestro, open-sourced in 2024, triggers workflows by signals that a table partition landed, rather than by a clock.

## Idempotency, row by row

A task is idempotent if running it once or five times for the same data interval leaves the same result. Three rules produce it. Each run owns an output partition and replaces it; never append. Inputs are determined by the interval, never by the clock: current date minus one means something different when retried after midnight or backfilled next month. And no side effects that cannot be repeated: emails and external calls are separated, or guarded by an idempotency key. The idempotency key of a pipeline task is its partition, the logical date.

The lesson's trace. Six orders across three days. One, for May 2, arrives three days late. The daily job sums revenue per country for the logical date and appends it. Normal runs give 30, 15 and 45 for the three days. Then a logic fix ships and someone backfills May 1 to 3 with the same append job. May 1 now shows 60. May 3 shows 90. May 2 shows 38, the old 15 plus a new 23 that includes the late order. The truth was 30, 23 and 45. Nothing failed. Every row is plausible on its own. Only counting rows per day and country reveals two rows per key.

And had the job used current date minus one instead of the logical date, all three backfill runs would have computed May 4, appended nothing, reported success, and applied the fix to nothing.

The idempotent version overwrites the run's partition, or deletes then inserts inside one transaction. Replay the same backfill and May 2 becomes 23, the correct late-data result, and the others stay put. Run it ten more times and the table does not move. One caveat: a Hive-style overwrite that removes the directory first exposes an empty partition while the job runs. A table format with an atomic commit, Iceberg or Delta, makes the replacement one visible step.

Merge has a trap. Suppose the buggy run attributed an order to Germany, and the fix moves it to the US. A merge that only updates matched keys and inserts new ones updates the US row and never touches the stale Germany row. The day's total is still wrong. A recompute must also delete keys that vanished from the source, or use delete-then-insert.

## Completeness and backfills

A job at 2 in the morning assumes yesterday is complete by then. When it is not, the job succeeds on partial data, which is worse than failing. From weakest to strongest: a later schedule with slack, cheap and fragile; sensors, but existence is not completeness; data-aware triggers that fire when the upstream asset updates; and explicit completeness signals, "event time complete up to T", the batch version of a watermark.

For late data, use a lookback window: each daily run recomputes the last N partitions with overwrite. With N of 3, that late order is picked up three days later without anyone backfilling. Then say when numbers become final, "revenue for day D is final at D plus 3", and page on a missed deadline. A late day should never silently become a partial day.

Backfill arithmetic. A year of a DAG with 35 task-minutes per run is about 213 hours of task time. A pool of 8 slots gives about 27 hours of wall time. But with max active runs at 4 and each run at least 20 minutes along its critical path, it is about 30 hours: the run limit binds, not the pool. Cost: a heavy Spark task of 27 core-hours per partition is about 9,700 core-hours for the year, on the order of 400 to 500 dollars, and then multiply by every downstream table.

Order matters. Backfill newest first: recent partitions are queried most, and if the backfill stops halfway, what is missing is old data few people read. Propagate: fixing March's revenue leaves everything built from it stale. And validate: write to a branch, compare counts and sums, then publish atomically.

## In the interview

The lesson's follow-up. A task wrote its output, then the worker was killed before it reported success. What happens?

[pause]

The scheduler sees no heartbeat for five minutes, marks the task a zombie, and retries it, so the write happens twice. That is fine only if the write is an overwrite of the task's own partition. The wrong answer is "the orchestrator guarantees each task runs once", which no orchestrator does.

And: your daily interval ends at midnight, but events keep arriving until 3. How do you get correct numbers? Separate the clock from completeness: trigger on a completeness signal, or recompute a lookback window with overwrite and publish when the day is final, or both. "Schedule it at 4" fails the first time the upstream is four hours late.

## Recap

Four things to remember. Keep the raw layer: ELT makes every logic bug recoverable. Make every task idempotent over its data interval: overwrite the partition it owns, read by logical date, and isolate side effects, because zombies and retries guarantee the second run. Never trust the clock for completeness; use signals, lookback windows, and a stated finality. And plan backfills for capacity, cost, newest-first order, downstream propagation and validation.

At your desk: the ETL and ELT table, Airflow's state machine and executors, the Airflow and Dagster code, the row-by-row backfill with its three SQL fixes, and the two exercises.

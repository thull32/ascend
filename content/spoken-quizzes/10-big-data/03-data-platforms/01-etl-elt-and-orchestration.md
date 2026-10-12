---
lesson: etl-elt-and-orchestration
source: 901a2d59cd9edf94
---
## 1

A daily task filters on order date equals the current date minus one, and writes with a plain insert. What goes wrong when it is retried after midnight?

A, the retry targets a different day, and appends to it. B, the orchestrator skips retries once the logical day has passed. C, nothing, because a retry repeats exactly the same query. D, the retry fails, because the target table is still locked.

[think]

The answer is A: the retry targets a different day, and appends to it.

The current date moves with the clock, so the retry targets a different interval, and the insert appends to whatever is there. One day misses its rerun, and another is duplicated or partial. The query text is the same, but its meaning is not. Using the run's logical date and overwriting its partition makes the retry repeat exactly the same work.

## 2

Tasks sit in the scheduled state for ten minutes while the Celery workers are idle, and the DAG processor's total parse time metric reports 240 seconds. What is the most likely cause?

A, the pool is full of sensors that are holding every slot. B, DAG files run queries or API calls at import time. C, the Celery broker has lost its connection to the workers. D, max active runs is set too low for the number of DAGs.

[think]

The answer is B: DAG files run queries or API calls at import time.

The DAG processor re-imports every file each cycle, so work at import time multiplies across files, and the parse cycle takes minutes instead of the 30-second interval. The scheduler cannot act on tasks faster than it sees freshly parsed DAGs. Idle workers rule out a broker or pool problem, and max active runs would show runs queued, not tasks stuck while capacity sits idle.

## 3

Two hundred poke-mode sensors wait for upstream files on a Celery fleet with 16 slots per worker, and unrelated tasks queue for hours. What is the right fix?

A, move the sensors to the default pool, which has 128 slots. B, raise the poke interval, so each sensor checks less often. C, add parallelism, so the scheduler queues more tasks per cycle. D, use reschedule mode or deferrable sensors, so waits hold no slot.

[think]

The answer is D: reschedule mode or deferrable sensors, so waits hold no slot.

A poke-mode sensor occupies a worker slot for its whole wait, so 200 of them exhaust the fleet however often they check. Reschedule mode releases the slot between pokes, and a deferrable sensor parks the wait in the triggerer's event loop, which multiplexes thousands of waits in one process. More parallelism or a bigger pool does nothing when the workers themselves are full of sleeping sensors.

## 4

A recompute uses a merge keyed on order date and country, with update and insert clauses. After a fix that moves a misattributed order from Germany to the US, the day's total is still wrong. Why?

A, merge is not idempotent, so rerunning it duplicated the US row. B, the stale Germany row was never deleted, because its key vanished from the source. C, the update clause overwrote the US row with the old Germany amount. D, merge cannot update rows that were written by an earlier run.

[think]

The answer is B: the stale Germany row was never deleted, because its key vanished from the source.

A merge with only matched and not-matched clauses touches keys present in the new source. A key that existed only in the buggy output is left as it was, so its stale row still counts. A true recompute of a partition must also remove vanished keys, with a not-matched-by-source delete, or with delete-then-insert in one transaction.

## 5

You must backfill 400 daily partitions of a job that takes 30 minutes per partition, without delaying the 6 a.m. production refresh. What plan is best?

A, launch all 400 runs at once, so it finishes as quickly as possible. B, run the backfill inside the production DAG, so it shares retries. C, bounded concurrency, oldest partitions first, so history fills in order. D, a separate pool, bounded concurrency, and newest partitions first.

[think]

The answer is D: a separate pool, bounded concurrency, and newest partitions first.

400 times 30 minutes is 200 hours of task time, so you need concurrency, but unbounded concurrency starves production, and a separate pool isolates it. Newest first delivers the most-used data early, and a halted backfill leaves only old, rarely read data missing. Then backfill the downstream assets, which stay stale until recomputed, and validate before publishing.

## 6

An Airflow daily DAG has a logical date of 1 May 2024, for a run that started at midnight at the start of 2 May. Which description is correct?

A, the scheduler is a day behind, and the run should be cleared. B, the timezone of the DAG is wrong by exactly twenty-four hours. C, the run covers 2 May, and the logical date is a display bug. D, the run covers 1 May, and was created once that interval ended.

[think]

The answer is D: the run covers 1 May, and was created once that interval ended.

A scheduled run has a data interval, here from midnight starting 1 May to midnight starting 2 May, and the scheduler creates the run when the interval ends, because a day's data is not complete until the day is over. The logical date names the interval, not the moment the run started, which is why the date templates resolve to 1 May.

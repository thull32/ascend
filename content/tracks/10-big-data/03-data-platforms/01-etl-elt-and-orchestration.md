---
slug: etl-elt-and-orchestration
title: "ETL, ELT and orchestration: idempotent pipelines and safe backfills"
description: Why modern platforms load raw data first and transform in the warehouse, what Airflow's scheduler, executors and task states actually do, why every task must own one partition per logical date, how a backfill double-counts row by row and how the idempotent version does not, and what a year-long backfill costs.
minutes: 25
difficulty: medium
tags: [big-data, data-engineering, etl, elt, airflow, dagster, orchestration, idempotency, backfills]
---
The daily revenue pipeline fails at 04:10 on step four of seven: a warehouse timeout. The on-call engineer clears the failed run and reruns the whole DAG from the top. By 06:00 the finance dashboard shows yesterday's revenue at exactly twice the real number. Step two appended yesterday's orders to a staging table, and the rerun appended them again. The fix takes ten minutes; explaining it to finance takes the rest of the day, and the next time a number looks odd, nobody trusts the dashboard.

Data pipelines fail constantly, because they depend on upstream systems, networks, credentials and schemas that change without notice. A platform is reliable not because its jobs never fail but because **running any job again is always safe**, and because the orchestrator knows which data each run is responsible for. This lesson covers the shape of modern pipelines (ELT), what an orchestrator does under the hood, the discipline of idempotent tasks traced row by row, and backfills, where the discipline is tested and paid for.

## ETL versus ELT

**ETL** (extract, transform, load) transforms data on a separate compute tier before loading finished tables into a warehouse. It dominated when warehouse compute was expensive and fixed: you only loaded what you had already cleaned. **ELT** loads raw data first, into the lake or warehouse, and transforms it there with SQL.

| | ETL | ELT |
|---|---|---|
| Where transforms run | A separate engine (custom code, an ETL tool, Spark) | Inside the warehouse or lakehouse engine |
| Raw data kept | Often not | Yes, immutable, in a raw layer |
| Reprocessing after a logic bug | Re-extract from sources, which may no longer have the data | Re-run SQL over the retained raw layer |
| Who writes transforms | Data engineers | Also analytics engineers, in SQL, often with dbt |
| Risk | Pipeline code becomes the bottleneck | Raw data containing sensitive fields lands broadly; warehouse cost grows unchecked |

### The cost and latency arithmetic

Put numbers on it for a source that produces 500 GB of raw order events per day. Under ETL, a fixed transformation cluster reads the source, produces 50 GB of curated tables, and loads those; the warehouse stores 50 GB per day and the raw 500 GB is gone once the source's own 30-day retention passes. A logic bug found in week six is unrecoverable for weeks one to two. Under ELT, the 500 GB lands in object storage first. At S3 Standard list price (about $0.023 per GB-month in us-east-1 at the time of writing; it depends on region and storage class) a year of raw data is 182 TB, roughly $4,000 per month by the end of year one, and a third of that if older partitions are tiered to infrequent access. Transformations run on elastic compute inside the warehouse: on a per-terabyte-scanned engine at roughly $5–6 per TB, one full pass over a day's raw data costs about $3, so ten staging models that each read it cost about $30 per day. The latency profile also differs: ETL makes nothing visible until extract, transform and load have all finished serially; ELT makes raw data queryable minutes after it lands and each downstream model independently.

ELT won for most analytical work because elastic compute made transformation cheap and, more importantly, because **keeping the raw data makes every mistake recoverable**. The standard layering is raw (exactly what the source sent, append-only) → staging (typed, deduplicated, renamed, one model per source table) → marts (business entities and facts, see [dimensional modelling](/learn/big-data/data-platforms/dimensional-modelling)). Some teams call these bronze, silver and gold. ETL still makes sense when data must be filtered before it lands (removing personal data at the edge) or when the transformation is not SQL-shaped (media processing, ML feature extraction).

## What an orchestrator does

An orchestrator runs a **directed acyclic graph** (DAG) of tasks on a schedule, in dependency order, with retries, timeouts, alerting and a record of every run. It is a scheduler and a bookkeeper, not a compute engine: tasks should submit work to Spark, the warehouse or a container platform and wait, rather than process data inside the orchestrator's workers.

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true,
 "nodes": [{"id": "RO"}, {"id": "RP"}, {"id": "SO"}, {"id": "SP"}, {"id": "FR"}, {"id": "DC"}, {"id": "DB"}],
 "edges": [{"from": "RO", "to": "SO"}, {"from": "RP", "to": "SP"}, {"from": "SO", "to": "FR"}, {"from": "SP", "to": "FR"}, {"from": "SO", "to": "DC"}, {"from": "FR", "to": "DB"}, {"from": "DC", "to": "DB"}],
 "title": "A pipeline DAG in dependency order",
 "caption": "RO/RP: raw orders and payments. SO/SP: staging models. FR: fct_revenue. DC: dim_customers. DB: the dashboard extract. A task becomes runnable when all its upstream tasks have succeeded, exactly the in-degree rule of Kahn's algorithm; tasks that are ready together can run in parallel."}
```

Every task in the DAG above must answer the same question: **which slice of data am I responsible for?** The orchestrator's job is to give each run an unambiguous answer and to run the graph in the right order.

## Under the hood: Airflow 2.x

Airflow is the most widely deployed open-source orchestrator, and the interview question "what does Airflow actually do when a DAG runs?" separates people who have operated it from people who have written DAGs. The description below is for Airflow 2.x; Airflow 3 (2025) changes the execution API and some defaults, noted where it matters.

### DAG parsing and the scheduler loop

Two processes matter. The **DAG processor** parses every Python file in the DAGs folder by importing it, every `min_file_process_interval` (default 30 s), with `parsing_processes` workers (default 2) and a per-file `dagbag_import_timeout` (default 30 s). The result is serialised into the metadata database (the `serialized_dag` table); the scheduler and web server read the serialised form, never your Python. Anything your file does at import time (a `Variable.get`, a database query, building a DAG from an API call) runs on every parse, so 400 files that each take 2 s to import on two processes cost 400 s per cycle, far above the 30 s interval, and every DAG's changes show up minutes late.

The **scheduler** loops every `scheduler_heartbeat_sec` (default 5 s): it creates a DAG run for each DAG whose next data interval has ended; for each running DAG run it evaluates task dependencies and moves runnable task instances to `scheduled`; it then checks the concurrency limits (below), moves what fits to `queued`, and hands those to the executor. Since 2.0 several schedulers can run against one database, claiming work with `SELECT ... FOR UPDATE SKIP LOCKED` (which is why Postgres or MySQL 8 is required for HA).

### The task instance state machine

| State | Meaning | Who moves it out |
|---|---|---|
| `none` | Task instance exists for a DAG run; dependencies not yet met | Scheduler |
| `scheduled` | Dependencies met; waiting for a slot | Scheduler, after pool and concurrency checks |
| `queued` | Sent to the executor; not yet started | Executor, when a worker picks it up |
| `running` | Worker process is executing it, heartbeating every `job_heartbeat_sec` (5 s) | The task itself |
| `success` / `failed` | Terminal for this try | — |
| `up_for_retry` | Failed with retries left; waits `retry_delay` | Scheduler, back to `scheduled` |
| `up_for_reschedule` | A reschedule-mode sensor released its slot between pokes | Scheduler |
| `deferred` | Handed to the triggerer; no worker slot held | Triggerer, when its trigger fires |
| `upstream_failed` / `skipped` | Never ran because of upstream state or branching | — |

A `running` task that stops heartbeating for `scheduler_zombie_task_threshold` (default 300 s), because the worker was OOM-killed or the node died, is declared a **zombie** and marked failed, then retried if retries remain. This is the at-least-once case from the opening: the task may have finished its write before the worker died, and the retry runs the write again.

### Executors, pools and concurrency

Four limits gate `scheduled` → `queued`: the global `parallelism` (default 32 running task instances per installation), `max_active_tasks_per_dag` (default 16), `max_active_runs_per_dag` (default 16) and **pools**, named sets of slots (the `default_pool` has 128) that a task claims with `pool` and `pool_slots`. Pools are how you say "at most 8 concurrent warehouse queries" regardless of which DAGs want them. The executor decides where a queued task runs:

| Executor | How a task runs | Start-up latency | Isolation | Idle cost | Fits |
|---|---|---|---|---|---|
| Local | Subprocess on the scheduler host, bounded by `parallelism` | Milliseconds | None (shared host) | One machine | Small installs, dev |
| Celery | Long-lived workers pull from a broker (Redis/RabbitMQ), `worker_concurrency` slots each (default 16) | Sub-second | Per-worker | Workers run all day | Steady, high task counts |
| Kubernetes | One pod per task instance with its own image and resources | Seconds to tens of seconds (pod scheduling, image pull) | Per-task | None | Spiky, heterogeneous tasks |

Celery gives the lowest latency at the cost of a fleet that is idle at night; Kubernetes gives per-task resource requests and no idle fleet at the cost of a pod start on every task, which matters when a DAG has 500 tiny tasks. The hybrid `CeleryKubernetesExecutor` routes per task by queue.

### Sensors and deferrable operators

A **sensor** waits for a condition (a file, a partition, another DAG's task). In the default **poke** mode it holds a worker slot and sleeps `poke_interval` (default 60 s) between checks for up to `timeout` (default 7 days). Two hundred poke-mode sensors on a 16-slot Celery fleet is a production outage: the pool is full of sleeping processes and real work sits in `queued`. **Reschedule** mode (`mode="reschedule"`) releases the slot between pokes and parks the task in `up_for_reschedule`. **Deferrable operators** (Airflow 2.2+) go further: the task hands a trigger (an asyncio coroutine) to the **triggerer** process, which multiplexes thousands of waits in one event loop, and the task instance sits in `deferred` holding no slot until the trigger fires.

### Data intervals, catchup and max_active_runs

Since 2.2 a scheduled run has a **data interval**. For a daily DAG the run with `logical_date` (formerly `execution_date`) 2024-05-01 covers `data_interval_start` = 2024-05-01 00:00 to `data_interval_end` = 2024-05-02 00:00, and the scheduler **creates it when the interval ends**, at 2024-05-02 00:00. That is the famous "the May 1 run happens on May 2": it is not a bug, the data for May 1 does not exist until May 1 is over. Templates expose `{{ ds }}` (the logical date as `YYYY-MM-DD`) and `{{ data_interval_start }}`.

With `catchup=True` (the 2.x default via `catchup_by_default`; Airflow 3 flips the default to `False`) the scheduler creates a run for every interval between `start_date` and now that has no run yet, throttled by `max_active_runs`. Deploying a DAG with `start_date=datetime(2020, 1, 1)` on a daily schedule therefore creates about 1,600 runs. `max_active_runs=4` means four of them execute at a time, in start-date order, and 1,596 sit in `queued` for the DAG run itself. That is either a free backfill or a warehouse outage, depending on whether you meant it.

## Dagster's asset model and Netflix's Maestro

**Dagster** inverts the model. Instead of tasks you declare **assets** (tables, files, models), the assets each depends on, and a `partitions_def`; the orchestrator derives the task graph. Because it knows that `fct_revenue` partition `2024-05-01` is built from `stg_orders` partition `2024-05-01`, it can show that a downstream partition is stale after an upstream rerun, backfill a partition range across the whole graph in dependency order, and attach checks to the asset rather than to a job. Airflow 2.4 added datasets (renamed assets in 3.0) so a DAG can be triggered by an upstream table being updated, which closes part of the gap but does not give Airflow partition-level staleness.

```python
from datetime import datetime, timedelta
from airflow.decorators import dag, task

@dag(schedule="@daily", start_date=datetime(2024, 1, 1), catchup=False,
     max_active_runs=4,
     default_args={"retries": 3, "retry_delay": timedelta(minutes=10)})
def revenue():
    @task(pool="warehouse", pool_slots=1)
    def build_fct_revenue(ds=None):          # ds = the run's logical date, e.g. "2024-05-01"
        warehouse.run(FCT_REVENUE_SQL, params={"ds": ds})

    build_fct_revenue()

revenue()
```

```python
from dagster import AssetExecutionContext, DailyPartitionsDefinition, asset

daily = DailyPartitionsDefinition(start_date="2024-01-01")

@asset(partitions_def=daily, deps=["stg_orders", "stg_payments"])
def fct_revenue(context: AssetExecutionContext) -> None:
    warehouse.run(FCT_REVENUE_SQL, params={"ds": context.partition_key})
```

Netflix has published two posts on **Maestro**, its workflow orchestrator, and open-sourced it in 2024. The published design points match this lesson's concerns at a larger scale: workflows are triggered by **signals** (a step publishes "this table partition landed" and downstream workflows subscribe, which is the completeness-signal pattern below rather than a clock), a **foreach** step fans a backfill out over a parameter range, each workflow has a **run strategy** (sequential, parallel with a limit, first-only, last-only) that is exactly `max_active_runs` made explicit, and the posts describe the scale as hundreds of thousands of workflows and millions of step executions per day (an order of magnitude from their material, not a figure to quote precisely).

## Idempotency: the rule that makes everything else work

A task is **idempotent** if running it once or five times for the same data interval leaves the same result. Retries, manual reruns, backfills and the zombie case above all assume it. Three rules produce it.

**1. Each run owns an output partition and replaces it.** Write with overwrite semantics scoped to the run's interval, never append.

**2. Inputs are determined by the interval, not by the clock.** `CURRENT_DATE - 1` means something different when the task is retried after midnight or backfilled next month. Use the run's logical date. The same applies to "latest" snapshots of dimension tables: a backfill of March that joins today's customer table assigns today's attributes to March's orders. Read the snapshot as of the interval, or model history explicitly with slowly changing dimensions.

**3. No side effects that cannot be repeated.** A task that sends emails, calls an external API or increments a counter must be separated from the data tasks, guarded by an idempotency key (see [idempotency and retries](/learn/system-design/building-blocks/idempotency-and-retries)), or accepted as at-least-once with downstream deduplication.

The **idempotency key of a pipeline task is its partition**: the logical date. Two runs with the same key must produce the same rows, and the output location is a pure function of the key. That is the batch version of the `idempotency-key` pattern for APIs, with the partition in place of the request id.

## The backfill that double-counts, row by row

Take a staging table `stg_orders`. `arrived_on` is the day the row landed in staging; `o6` arrives three days late.

| order_id | order_date | country | amount_usd | arrived_on |
|---|---|---|---|---|
| o1 | 05-01 | US | 10 | 05-01 |
| o2 | 05-01 | DE | 20 | 05-01 |
| o3 | 05-02 | US | 15 | 05-02 |
| o4 | 05-03 | US | 40 | 05-03 |
| o5 | 05-03 | DE | 5 | 05-03 |
| o6 | 05-02 | US | 8 | 05-05 |

The daily job computes revenue per country for the logical date and writes it to `fct_revenue`. The append version:

```sql
INSERT INTO fct_revenue (order_date, country, revenue_usd)
SELECT order_date, country, SUM(amount_usd)
FROM stg_orders WHERE order_date = :ds GROUP BY order_date, country;
```

Normal operation (each run at 02:00 the next day) writes five rows: 05-01 (US 10, DE 20), 05-02 (US 15; o6 has not arrived), 05-03 (US 40, DE 5). Dashboard totals: 30, 15, 45.

On 05-05 a logic fix ships and someone backfills 05-01 to 05-03 with the same append job:

| Backfill run | Rows appended | Partition after | SUM shown | Truth |
|---|---|---|---|---|
| 05-01 | (US 10), (DE 20) | US 10, DE 20, US 10, DE 20 | 60 | 30 |
| 05-02 | (US 23) — o3 plus the late o6 | US 15, US 23 | 38 | 23 |
| 05-03 | (US 40), (DE 5) | US 40, DE 5, US 40, DE 5 | 90 | 45 |

Nothing failed. Every row is individually plausible. Only `SELECT order_date, COUNT(*) ... GROUP BY order_date, country` shows two rows per key. If the job had used `CURRENT_DATE - 1` instead of `:ds`, all three backfill runs executed on 05-05 would have computed 05-04 (no rows), appended nothing, reported success, and applied the fix to nothing.

**A partial load** is the same bug in a smaller space. Suppose the 05-03 run wrote its US row and died before its DE row (two statements, or two files, with no atomic commit). The partition holds (US 40). A downstream job that reads now sees DE missing and publishes it. The retry appends (US 40), (DE 5): US is now 80. With the append job, partial failure plus retry is worse than either alone.

### The idempotent versions

```sql
-- Partition overwrite (Spark SQL, Hive, Iceberg): the run replaces exactly its partition.
INSERT OVERWRITE fct_revenue PARTITION (order_date = :ds)
SELECT country, SUM(amount_usd) AS revenue_usd
FROM stg_orders WHERE order_date = :ds GROUP BY country;

-- Engines without partition overwrite: delete then insert in one transaction.
BEGIN;
DELETE FROM fct_revenue WHERE order_date = :ds;
INSERT INTO fct_revenue SELECT :ds, country, SUM(amount_usd)
FROM stg_orders WHERE order_date = :ds GROUP BY country;
COMMIT;
```

Replay the same backfill: 05-01 replaces (US 10, DE 20) with (US 10, DE 20); 05-02 replaces (US 15) with (US 23), which is the correct late-data result; 05-03 replaces (US 40, DE 5) with itself. Run it ten more times and the table does not move. The partial-load retry replaces the half-written partition with the full one. What overwrite does *not* fix on its own is the window between delete and insert: a Hive-style overwrite that removes the directory before writing the new files exposes an empty partition for the duration of the job. A table format with an atomic metadata commit (Iceberg, Delta; see [columnar formats and lakehouses](/learn/big-data/batch-processing/columnar-formats-and-lakehouses)) or a write-to-staging-then-swap makes the replacement a single visible step.

`MERGE` keyed on the table's grain is the third form, and it has a trap:

```sql
MERGE INTO fct_revenue AS t
USING (SELECT :ds AS order_date, country, SUM(amount_usd) AS revenue_usd
       FROM stg_orders WHERE order_date = :ds GROUP BY country) AS s
ON t.order_date = s.order_date AND t.country = s.country
WHEN MATCHED THEN UPDATE SET revenue_usd = s.revenue_usd
WHEN NOT MATCHED THEN INSERT (order_date, country, revenue_usd)
  VALUES (s.order_date, s.country, s.revenue_usd);
```

Rerunning it is idempotent for keys that exist in the source. But if the buggy version had misattributed an order and written (05-02, DE, 3), and the fix moves it to US, the merge updates US and leaves the DE row untouched: the partition's total is still wrong. A recompute must also delete keys that vanished (`WHEN NOT MATCHED BY SOURCE AND t.order_date = :ds THEN DELETE`, in the engines that support it) or use delete-then-insert.

## Knowing when upstream data is complete

A daily job scheduled at 02:00 assumes yesterday's data is complete by 02:00. When it is not (an upstream export is late, a Kafka-to-lake sink is lagging), the job succeeds on partial data, which is worse than failing. Options, from weakest to strongest:

- **Time-based schedule with slack**: run at 04:00 instead. Cheap, fragile.
- **Sensors**: poll for a `_SUCCESS` marker or a partition's existence before running (in reschedule or deferrable mode). Better, but existence is not completeness.
- **Data-aware triggers**: run when the upstream asset is updated (Airflow datasets, Dagster asset sensors, Maestro signals), carrying completeness as metadata.
- **Explicit completeness signals**: the ingestion layer publishes "event time complete up to T", the batch analogue of the watermark in the [stream processing model](/learn/big-data/streaming/stream-processing-model), and downstream jobs wait for T to pass the interval's end.

For late-arriving data, use a **lookback window**: each daily run recomputes the last N partitions with overwrite, so events arriving up to N days late are included at N times the compute. With N = 3, `o6` above is picked up by the 05-06 run's recompute of 05-02 without anyone backfilling. Pair it with an explicit statement of when a day's numbers become final ("revenue for day D is final at D + 3"), and an SLA on the run itself: Airflow 2.x has a per-task `sla` with an `sla_miss_callback` (Airflow 3 replaces it with deadline alerts); Dagster has freshness policies. An SLA miss is the signal to page; a late day should never silently become a partial day.

## Backfill arithmetic

If tasks are idempotent and interval-scoped, a backfill is "run it for these dates". What remains is capacity, cost, ordering and propagation.

**Capacity.** A year of a DAG whose critical path is four 5-minute tasks (seven tasks, 35 task-minutes per run) is 365 × 35 = 12,775 task-minutes, about 213 hours of task time. A backfill pool of 8 slots, fully used, gives 213 / 8 ≈ 27 hours of wall time. `max_active_runs=4` gives at most four runs in flight, each at least 20 minutes long, so 365 / 4 × 20 minutes ≈ 30 hours: with these settings the run limit binds, not the pool. Raise both and the binding constraint becomes the warehouse.

**Cost.** Say the heavy task is a Spark job with 20 executors × 4 cores for 20 minutes: about 27 core-hours per partition, 9,700 core-hours for the year, on the order of $400–500 at typical on-demand cloud prices of $0.04–0.05 per vCPU-hour (depends on instance family, spot pricing and region). On a per-terabyte-scanned warehouse, 365 partitions × 200 GB of staging each is 73 TB, about $370–440 at $5–6 per TB. Then multiply by the downstream tables that must also be recomputed.

**Ordering.** Backfill in **reverse chronological** order: recent partitions are queried most, so fixing them first delivers most of the value early, and if the backfill is stopped halfway, the missing part is old data few people read.

**Propagation.** Fixing `fct_revenue` for March leaves every downstream table built from March's `fct_revenue` stale. In an asset-centric orchestrator the stale partitions are visible and can be backfilled in dependency order; in a task-centric one you clear the task and its downstream tasks for the date range, and hope the DAG boundaries match the real data dependencies. The first exercise computes exactly that set and order.

**Validation.** Write backfill output to a branch first, compare it with the old output (row counts, sums, a diff of a sample of keys), and publish atomically. Iceberg branches and write-audit-publish, covered in [data quality, lineage and governance](/learn/big-data/data-platforms/data-quality-lineage-and-governance), make the publish a single metadata operation.

## Failure modes in production

**Double-counted backfill.** Symptom: a metric is exactly 2× (or 3×) for a date range after an incident. Diagnosis: count rows per grain key in the affected partitions; duplicates per key confirm append semantics. Fix: rewrite the partitions with overwrite semantics from the retained raw layer, then change the job so the rerun is safe next time.

**The scheduler falls behind.** Symptom: tasks sit in `scheduled` for minutes while workers are idle; new DAGs appear late; `dag_processing.total_parse_time` is hundreds of seconds. Diagnosis: DAG files doing work at import time, or thousands of files on two parsing processes. Fix: move all work into tasks, raise `parsing_processes`, run a standalone DAG processor, and split the DAGs folder.

**A sensor hogs the workers.** Symptom: the pool is full but nothing is progressing; the UI shows dozens of `running` sensors. Diagnosis: poke-mode sensors with long `poke_interval`s and 7-day timeouts. Fix: reschedule mode or deferrable sensors, a short `timeout`, and a separate small pool for sensors.

**A retry that is not idempotent.** Symptom: customers receive two invoice emails; an external API shows duplicate calls. Diagnosis: the side effect ran before the step that failed, and the retry repeated it. Fix: separate side-effect tasks from data tasks, give each call an idempotency key derived from the partition and record id, and make the data task's own write an overwrite.

**A partial write that downstream read.** Symptom: a downstream table shows a country missing for one day, and it was correct by the time anyone looked at the upstream. Diagnosis: the upstream writer had no atomic commit; the downstream run started during the gap. Fix: atomic table-format commits, plus a completeness signal (or data-aware trigger) so downstream starts only after publication.

**Catchup creates a thousand runs.** Symptom: warehouse queue explodes minutes after a deploy. Diagnosis: `catchup=True` with an old `start_date`. Fix: `catchup=False` unless a backfill is intended, and a `max_active_runs` that the warehouse can absorb.

## Interviewer follow-ups

**"Your daily job's interval ends at midnight, but events for that day keep arriving until 03:00. How do you get correct numbers?"** Model answer: separate the clock from completeness. Trigger on a completeness signal (or a data-aware trigger) rather than at a fixed time; or recompute a lookback window of N partitions with overwrite and publish a "final at D + N" statement; or both. Common wrong answer: "schedule it at 04:00", which fails the first time the upstream is four hours late.

**"A task wrote its output, then the worker was killed before it reported success. What happens?"** Model answer: the scheduler sees no heartbeat for five minutes, marks the task instance a zombie, and retries it, so the write happens twice. That is fine only if the write is an overwrite of the task's own partition. Common wrong answer: "the orchestrator guarantees each task runs once", which no orchestrator does.

**"Backfill two years of a table with 40 downstream tables without missing the 06:00 SLA."** Model answer: put the backfill in its own pool with bounded concurrency, do the task-minute and cost arithmetic, run newest partitions first, write to a branch and validate before publishing, compute the downstream set in dependency order (or let an asset-based orchestrator do it), and tell consumers when each range becomes final. Common wrong answer: clear the task in the UI with "downstream" and "past" ticked and let it run.

**"Why does the Airflow run for May 1 start on May 2?"** Model answer: a scheduled run covers a data interval and is created when the interval ends, because the data for May 1 is not complete until May 1 is over; `logical_date` names the interval, not the wall clock. Common wrong answer: a timezone bug.

**"Task-centric or asset-centric?"** Model answer: assets give the orchestrator the data dependency graph and partition staleness, which makes backfills and impact analysis mechanical; tasks are simpler when the pipeline is not table-shaped (API calls, ML training). Idempotency is the author's job in both. Common wrong answer: "Dagster is Airflow with a newer UI".

## What mid-level engineers get wrong

- Using `datetime.now()` or `CURRENT_DATE` inside a task: retries after midnight and every backfill process the wrong day and report success.
- Appending in a "daily" task: the first rerun doubles the numbers, and the second rerun triples them.
- Processing data inside the orchestrator's worker (a pandas job on the Airflow worker): the worker is OOM-killed, becomes a zombie, and takes every other task on that worker with it.
- Poke-mode sensors on the default pool: worker starvation that looks like a scheduler outage.
- Deploying with `catchup=True` and an old `start_date`: a thousand unintended runs against the warehouse.
- Clearing a failed task without its downstream tasks: downstream tables stay stale but look healthy.
- Setting `depends_on_past=True` everywhere "for safety": one failed day blocks every later day until a human intervenes.

## Exercises

```exercise
id: backfill-plan
title: Which tasks does a change force you to rerun?
prompt: |
  `deps` maps every task to the list of tasks it depends on (its upstream tasks).
  `changed` lists the tasks whose logic changed.

  Return the tasks that must re-run for a backfill: every changed task plus
  everything downstream of any changed task, in a valid dependency order
  (a task appears after all of its upstream tasks that are also re-running).
  To make the order unique, whenever several tasks are ready, take the
  alphabetically smallest first (Kahn's algorithm with a sorted ready set).
languages: [python, javascript]
entry: backfill_plan
starter:
  python: |
    def backfill_plan(deps, changed):
        # your code here
        return []
  javascript: |
    function backfill_plan(deps, changed) {
      // your code here
      return [];
    }
tests:
  - args: [{"extract_orders": [], "extract_payments": [], "stg_orders": ["extract_orders"], "stg_payments": ["extract_payments"], "fct_revenue": ["stg_orders", "stg_payments"], "dim_customers": ["stg_orders"], "exec_dashboard": ["fct_revenue", "dim_customers"]}, ["stg_payments"]]
    expected: ["stg_payments", "fct_revenue", "exec_dashboard"]
  - args: [{"extract_orders": [], "extract_payments": [], "stg_orders": ["extract_orders"], "stg_payments": ["extract_payments"], "fct_revenue": ["stg_orders", "stg_payments"], "dim_customers": ["stg_orders"], "exec_dashboard": ["fct_revenue", "dim_customers"]}, ["extract_orders"]]
    expected: ["extract_orders", "stg_orders", "dim_customers", "fct_revenue", "exec_dashboard"]
    label: ties broken alphabetically
  - args: [{"extract_orders": [], "extract_payments": [], "stg_orders": ["extract_orders"], "stg_payments": ["extract_payments"], "fct_revenue": ["stg_orders", "stg_payments"], "dim_customers": ["stg_orders"], "exec_dashboard": ["fct_revenue", "dim_customers"]}, ["exec_dashboard"]]
    expected: ["exec_dashboard"]
    label: a leaf has nothing downstream
  - args: [{"extract_orders": [], "extract_payments": [], "stg_orders": ["extract_orders"], "stg_payments": ["extract_payments"], "fct_revenue": ["stg_orders", "stg_payments"], "dim_customers": ["stg_orders"], "exec_dashboard": ["fct_revenue", "dim_customers"]}, ["stg_orders", "stg_payments"]]
    expected: ["stg_orders", "dim_customers", "stg_payments", "fct_revenue", "exec_dashboard"]
    label: two changes, dependencies inside the rerun set
  - args: [{"a": [], "b": ["a"]}, []]
    expected: []
    hidden: true
    label: nothing changed
  - args: [{"a": [], "b": ["a"], "c": ["a"], "d": ["b", "c"], "e": []}, ["a", "e"]]
    expected: ["a", "b", "c", "d", "e"]
    hidden: true
    label: diamond plus an independent task
hints:
  - "Build a map from each task to its downstream tasks, then collect everything reachable from the changed tasks."
  - "Count in-degrees using only edges whose upstream task is also in the rerun set, then repeatedly take the smallest ready task."
```

```exercise
id: idempotent-backfill
title: Replay daily runs with partition overwrite
prompt: |
  Simulate a daily aggregation job that owns one output partition per logical date.

  - `source` is a list of staging rows `[order_date, country, amount, arrived_on]`.
    Dates are `"YYYY-MM-DD"` strings and amounts are integers.
  - `runs` is a list of `[run_on, logical_date]` job executions, in the order
    they happened. A logical date may appear more than once (retries, backfills).

  A run executed on `run_on` for `logical_date` sees only the source rows whose
  `order_date` equals `logical_date` and whose `arrived_on <= run_on`. It sums
  `amount` per country over those rows and replaces the whole output partition
  for `logical_date` with the result. A run that sees no rows leaves an empty
  partition (any earlier rows for that date are gone).

  Return the final output table as a list of `[order_date, country, total]`
  sorted by `order_date`, then `country`.
languages: [python, javascript]
entry: backfill_partitions
starter:
  python: |
    def backfill_partitions(source, runs):
        table = {}   # logical_date -> {country: total}
        # your code here
        return []
  javascript: |
    function backfill_partitions(source, runs) {
      const table = new Map();   // logical_date -> Map(country -> total)
      // your code here
      return [];
    }
tests:
  - args: [[["2024-05-01", "US", 10, "2024-05-01"], ["2024-05-01", "DE", 20, "2024-05-01"], ["2024-05-02", "US", 15, "2024-05-02"], ["2024-05-03", "US", 40, "2024-05-03"], ["2024-05-03", "DE", 5, "2024-05-03"], ["2024-05-02", "US", 8, "2024-05-05"]], [["2024-05-02", "2024-05-01"], ["2024-05-03", "2024-05-02"], ["2024-05-04", "2024-05-03"]]]
    expected: [["2024-05-01", "DE", 20], ["2024-05-01", "US", 10], ["2024-05-02", "US", 15], ["2024-05-03", "DE", 5], ["2024-05-03", "US", 40]]
    label: normal daily runs
  - args: [[["2024-05-01", "US", 10, "2024-05-01"], ["2024-05-01", "DE", 20, "2024-05-01"], ["2024-05-02", "US", 15, "2024-05-02"], ["2024-05-03", "US", 40, "2024-05-03"], ["2024-05-03", "DE", 5, "2024-05-03"], ["2024-05-02", "US", 8, "2024-05-05"]], [["2024-05-02", "2024-05-01"], ["2024-05-03", "2024-05-02"], ["2024-05-04", "2024-05-03"], ["2024-05-04", "2024-05-01"], ["2024-05-04", "2024-05-02"], ["2024-05-04", "2024-05-03"]]]
    expected: [["2024-05-01", "DE", 20], ["2024-05-01", "US", 10], ["2024-05-02", "US", 15], ["2024-05-03", "DE", 5], ["2024-05-03", "US", 40]]
    label: a full rerun changes nothing
  - args: [[["2024-05-01", "US", 10, "2024-05-01"], ["2024-05-01", "DE", 20, "2024-05-01"], ["2024-05-02", "US", 15, "2024-05-02"], ["2024-05-03", "US", 40, "2024-05-03"], ["2024-05-03", "DE", 5, "2024-05-03"], ["2024-05-02", "US", 8, "2024-05-05"]], [["2024-05-02", "2024-05-01"], ["2024-05-03", "2024-05-02"], ["2024-05-04", "2024-05-03"], ["2024-05-06", "2024-05-02"]]]
    expected: [["2024-05-01", "DE", 20], ["2024-05-01", "US", 10], ["2024-05-02", "US", 23], ["2024-05-03", "DE", 5], ["2024-05-03", "US", 40]]
    label: a backfill after a late row replaces the partition instead of doubling it
  - args: [[["2024-05-02", "US", 15, "2024-05-02"]], [["2024-05-01", "2024-05-02"]]]
    expected: []
    label: a run before the data arrived writes an empty partition
  - args: [[["2024-05-02", "US", 15, "2024-05-02"]], [["2024-05-01", "2024-05-02"], ["2024-05-03", "2024-05-02"]]]
    expected: [["2024-05-02", "US", 15]]
    hidden: true
    label: an empty partition is filled by a later rerun
  - args: [[["2024-06-01", "BR", 7, "2024-06-01"], ["2024-06-01", "MX", 3, "2024-06-01"], ["2024-06-01", "MX", 4, "2024-06-03"]], [["2024-06-02", "2024-06-01"], ["2024-06-04", "2024-06-01"]]]
    expected: [["2024-06-01", "BR", 7], ["2024-06-01", "MX", 7]]
    hidden: true
    label: a rerun updates only the country that received late rows
  - args: [[], [["2024-05-02", "2024-05-01"]]]
    expected: []
    hidden: true
    label: empty source
hints:
  - "For each run, build the partition from scratch: filter the source by order_date and arrived_on, sum per country, then assign it to the table under the logical date, discarding whatever was there."
  - "Sort the flattened rows by date and then by country before returning; JavaScript needs an explicit comparator for strings."
```

## Senior signals

- You design every task as **idempotent over a data interval**: overwrite the partition it owns, read inputs by logical date, isolate unrepeatable side effects, and you can trace by hand why the append version double-counts.
- You know what the orchestrator does **under the hood**: parse, serialise, schedule, queue, execute, heartbeat, zombie detection; and which of `parallelism`, pools and `max_active_runs` binds a backfill.
- You prefer **ELT with a retained raw layer** because it makes logic bugs recoverable, with the storage arithmetic to justify it, and you know when ETL is still right.
- You treat the orchestrator as a **scheduler and bookkeeper**, not a compute engine, and you understand the task-centric versus asset-centric trade-off.
- You make **completeness explicit** (signals, data-aware triggers, lookback windows, SLAs) instead of trusting the clock, and you state when a day's numbers are final.
- You plan backfills for **capacity, cost, order and propagation**: isolated pools, task-minute arithmetic, newest partitions first, downstream assets included, output validated before it is published.

## Check yourself

```quiz
- q: >-
    A daily task computes WHERE order_date = CURRENT_DATE - 1 and writes with INSERT INTO. What goes wrong when it is retried after midnight?
  options: ["The retry targets a different day and appends to it", "The orchestrator skips retries once the logical day has passed", "Nothing, because a retry repeats exactly the same query", "The retry fails because the target table is still locked"]
  answer: 0
  explanation: >-
    CURRENT_DATE moves with the clock, so the retry targets a different interval, and INSERT INTO appends to whatever is there: one day is missing its rerun and another is duplicated or partial. The query text is the same but its meaning is not. Using the run's logical date and overwriting its partition makes the retry repeat exactly the same work.
- q: >-
    Tasks sit in the scheduled state for ten minutes while Celery workers are idle, and dag_processing.total_parse_time reports 240 seconds. What is the most likely cause?
  options: ["The pool is full of sensors that are holding every slot", "DAG files run queries or API calls at import time", "The Celery broker has lost its connection to the workers", "max_active_runs is too low for the number of DAGs"]
  answer: 1
  explanation: >-
    The DAG processor re-imports every file each cycle, so work at import time multiplies across files and the parse cycle takes minutes instead of the 30-second interval; the scheduler cannot act on tasks faster than it sees fresh serialised DAGs. Idle workers rule out a broker or pool problem, and max_active_runs would show runs queued, not tasks stuck with idle capacity.
- q: >-
    Two hundred poke-mode sensors wait for upstream files on a 16-slot-per-worker Celery fleet, and unrelated tasks queue for hours. What is the right fix?
  options: ["Move the sensors to the default pool, which has 128 slots", "Raise the poke interval so each sensor checks less often", "Add parallelism so the scheduler queues more tasks per cycle", "Use reschedule mode or deferrable sensors so waits hold no slot"]
  answer: 3
  explanation: >-
    A poke-mode sensor occupies a worker slot for its whole wait, so 200 of them exhaust the fleet regardless of how often they check. Reschedule mode releases the slot between pokes, and a deferrable sensor parks the wait in the triggerer's event loop, which multiplexes thousands of waits in one process. More parallelism or a bigger pool does nothing if the workers themselves are full of sleeping sensors.
- q: >-
    A recompute uses MERGE keyed on (order_date, country) with UPDATE and INSERT clauses. After a fix that moves a misattributed order from DE to US, the day's total is still wrong. Why?
  options: ["MERGE is not idempotent, so rerunning it duplicated the US row", "The stale DE row was never deleted because its key vanished from the source", "The UPDATE clause overwrote the US row with the old DE amount", "MERGE cannot update rows that were written by an earlier run"]
  answer: 1
  explanation: >-
    A merge with only MATCHED and NOT MATCHED clauses touches keys present in the new source; a key that existed only in the buggy output is left as it was, so its stale row still counts. A true recompute of a partition must also remove vanished keys, with a NOT MATCHED BY SOURCE delete or a delete-then-insert in one transaction.
- q: >-
    You must backfill 400 daily partitions of a job that takes 30 minutes per partition, without delaying the 06:00 production refresh. What plan is best?
  options: ["Launch all 400 runs at once so it finishes as quickly as possible", "Run the backfill inside the production DAG so it shares retries", "Bounded concurrency, oldest partitions first so history fills in order", "A separate pool, bounded concurrency, newest partitions first"]
  answer: 3
  explanation: >-
    400 times 30 minutes is 200 hours of task time, so concurrency is needed, but unbounded concurrency starves production; a separate pool isolates it. Newest-first delivers the most-used data early, and a halted backfill leaves only old, rarely read data missing. Then backfill downstream assets, which are stale until they are recomputed, and validate before publishing.
- q: >-
    An Airflow daily DAG has logical_date 2024-05-01 for a run that started at 00:00 on 2024-05-02. Which description is correct?
  options: ["The scheduler is a day behind and the run should be cleared", "The timezone of the DAG is wrong by exactly twenty-four hours", "The run covers 2024-05-02 and the logical date is a display bug", "The run covers 2024-05-01 and was created once that interval ended"]
  answer: 3
  explanation: >-
    A scheduled run has a data interval, here from 2024-05-01 00:00 to 2024-05-02 00:00, and the scheduler creates it when the interval ends, because the data for a day is not complete until the day is over. The logical date names the interval, not the moment the run started, which is why templates like ds resolve to 2024-05-01.
```

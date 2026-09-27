---
slug: etl-elt-and-orchestration
title: "ETL, ELT and orchestration: idempotent pipelines and safe backfills"
description: Why modern platforms load raw data first and transform in the warehouse, how orchestrators like Airflow and Dagster model pipelines, why every task must be idempotent over a data interval, and how to backfill months of data without breaking anything.
minutes: 25
difficulty: medium
tags: [big-data, data-engineering, etl, elt, airflow, dagster, orchestration, idempotency, backfills]
---
The daily revenue pipeline fails at 04:10 on step four of seven: a warehouse timeout. The on-call engineer clears the failed run and reruns the whole DAG from the top. By 06:00 the finance dashboard shows yesterday's revenue at exactly twice the real number. Step two appended yesterday's orders to a staging table, and the rerun appended them again. The fix takes ten minutes; explaining it to finance takes the rest of the day, and the next time a number looks odd, nobody trusts the dashboard.

Data pipelines fail constantly, because they depend on upstream systems, networks, credentials and schemas that change without notice. A platform is reliable not because its jobs never fail but because **running any job again is always safe**, and because the orchestrator knows which data each run is responsible for. This lesson covers the shape of modern pipelines (ELT), what an orchestrator actually does, the discipline of idempotent tasks, and backfills, where the discipline is tested.

## ETL versus ELT

**ETL** (extract, transform, load) transforms data on a separate compute tier before loading the finished tables into a warehouse. It dominated when warehouse compute was expensive and fixed: you only loaded what you had already cleaned. **ELT** loads raw data first, into the lake or warehouse, and transforms it there with SQL.

| | ETL | ELT |
|---|---|---|
| Where transforms run | A separate engine (custom code, an ETL tool, Spark) | Inside the warehouse or lakehouse engine |
| Raw data kept | Often not | Yes, immutable, in a raw layer |
| Reprocessing after a logic bug | Re-extract from sources, which may no longer have the data | Re-run SQL over the retained raw layer |
| Who writes transforms | Data engineers | Also analytics engineers, in SQL, often with dbt |
| Risk | Pipeline code becomes the bottleneck | Raw data containing sensitive fields lands broadly; warehouse cost grows unchecked |

ELT won for most analytical work because elastic warehouse compute made transformation cheap and, more importantly, because **keeping the raw data makes every mistake recoverable**. The standard layering is some version of raw (exactly what the source sent, append-only) → staging (typed, deduplicated, renamed, one model per source table) → marts (business entities and facts, see [dimensional modelling](/learn/big-data/data-platforms/dimensional-modelling)). Some teams call these bronze, silver and gold. ETL still makes sense when data must be filtered before it lands (removing personal data at the edge) or when the transformation is not SQL-shaped (media processing, ML feature extraction).

## What an orchestrator does

An orchestrator runs a **directed acyclic graph** (DAG) of tasks on a schedule, in dependency order, with retries, timeouts, alerting and a record of every run. It is a scheduler and a bookkeeper, not a compute engine: tasks should submit work to Spark, the warehouse or a container platform and wait, rather than process data inside the orchestrator's workers.

```viz
{"type": "graph", "algorithm": "topo-sort-kahn", "directed": true,
 "nodes": [{"id": "RO"}, {"id": "RP"}, {"id": "SO"}, {"id": "SP"}, {"id": "FR"}, {"id": "DC"}, {"id": "DB"}],
 "edges": [{"from": "RO", "to": "SO"}, {"from": "RP", "to": "SP"}, {"from": "SO", "to": "FR"}, {"from": "SP", "to": "FR"}, {"from": "SO", "to": "DC"}, {"from": "FR", "to": "DB"}, {"from": "DC", "to": "DB"}],
 "title": "A pipeline DAG in dependency order",
 "caption": "RO/RP: raw orders and payments. SO/SP: staging models. FR: fct_revenue. DC: dim_customers. DB: the dashboard extract. A task becomes runnable when all its upstream tasks have succeeded, exactly the in-degree rule of Kahn's algorithm; tasks that are ready together can run in parallel."}
```

The two dominant open-source orchestrators model pipelines differently:

- **Airflow** is **task-centric**. A DAG is a set of operators with dependencies; each scheduled **DAG run** has a **data interval** (for a daily DAG, midnight to midnight of the logical date, exposed to templates as `{{ ds }}`). Tasks know which interval they process, but the orchestrator does not know which tables they produce.
- **Dagster** is **asset-centric**. You declare the tables (assets) the pipeline produces, their upstream assets and their partitions, and the orchestrator derives the task graph. Because it knows that `fct_revenue` partition `2024-05-01` depends on `stg_orders` partition `2024-05-01`, it can tell you which partitions are stale and backfill downstream assets automatically.

Netflix has open-sourced its own orchestrator, **Maestro**, built to schedule a very large number of workflows across Netflix's data and ML platform, which shows the same two concerns at the extreme: dependency management across teams and safe re-execution.

```python
from datetime import datetime, timedelta
from airflow.decorators import dag, task

@dag(schedule="@daily", start_date=datetime(2024, 1, 1), catchup=False,
     max_active_runs=4,
     default_args={"retries": 3, "retry_delay": timedelta(minutes=10)})
def revenue():
    @task
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

## Idempotency: the rule that makes everything else work

A task is **idempotent** if running it once or five times for the same data interval leaves the same result. The opening incident happened because the staging step appended. Retries, manual reruns, backfills and at-least-once scheduling (a worker dies after the task finished but before the success was recorded, so the scheduler runs it again) all assume idempotency. Three rules produce it.

**1. Each run owns an output partition and replaces it.** Write with overwrite semantics scoped to the run's interval, never append.

```sql
-- Not idempotent: every rerun adds the day again.
INSERT INTO fct_revenue
SELECT order_date, country, SUM(amount_usd) AS revenue_usd
FROM stg_orders
WHERE order_date = CURRENT_DATE - INTERVAL '1' DAY
GROUP BY order_date, country;

-- Idempotent: the run for :ds replaces exactly its own partition, atomically.
INSERT OVERWRITE fct_revenue PARTITION (order_date = :ds)
SELECT country, SUM(amount_usd) AS revenue_usd
FROM stg_orders
WHERE order_date = :ds
GROUP BY country;
```

On engines without partition overwrite, `DELETE WHERE order_date = :ds` followed by `INSERT` inside one transaction, or a `MERGE` keyed on the grain of the table, achieves the same.

**2. Inputs are determined by the interval, not by the clock.** `CURRENT_DATE - 1` means something different when the task is retried after midnight or backfilled next month. Use the run's logical date. The same applies to "latest" snapshots of dimension tables: a backfill of March that joins today's customer table assigns today's attributes to March's orders. Read the snapshot as of the interval, or model history explicitly with slowly changing dimensions.

**3. No side effects that cannot be repeated.** A task that sends emails, calls an external API or increments a counter must either be separated from the data tasks, guarded by an idempotency key, or accepted as at-least-once with downstream deduplication.

Idempotency also covers partial failure. If a job writes 300 files and dies after 200, the next run must not see the 200. That is why atomic commits matter: a table format commit, a transactional `INSERT OVERWRITE`, or a staging location that is swapped in only on success (see [columnar formats and lakehouses](/learn/big-data/batch-processing/columnar-formats-and-lakehouses)).

## Knowing when upstream data is complete

A daily job scheduled at 02:00 assumes yesterday's data is complete by 02:00. When it is not (an upstream export is late, a Kafka-to-lake sink is lagging), the job succeeds on partial data, which is worse than failing. Options, from weakest to strongest:

- **Time-based schedule with slack**: run at 04:00 instead. Cheap, fragile.
- **Sensors**: poll for a `_SUCCESS` marker or a partition's existence before running. Better, but existence is not completeness.
- **Data-aware triggers**: run when the upstream asset or dataset is updated (Airflow datasets, Dagster asset sensors), carrying completeness as metadata.
- **Explicit completeness signals**: the ingestion layer publishes "event time complete up to T" (a batch analogue of a streaming watermark), and downstream jobs wait for T to pass the interval's end.

For late-arriving data, use a **lookback window**: each daily run recomputes the last N days (for example, three), so events arriving up to three days late are included at the cost of three times the compute. Pair it with an explicit statement of when a day's numbers become final.

## Backfills

A **backfill** runs a pipeline over historical intervals: after a logic change, a new table, or a bug fix. If tasks are idempotent and interval-scoped, a backfill is just "run it for these dates". The problems are capacity, ordering and propagation.

**Capacity.** Backfilling a year of a job that takes 20 minutes per day is 365 × 20 minutes ≈ 122 hours serially. At concurrency 8 it is about 15 hours, if the warehouse can absorb 8 extra concurrent heavy queries without starving production. Run backfills in a separate resource pool or queue with its own concurrency limit (`max_active_runs`, Airflow pools, a separate warehouse cluster) so the backfill slows down, not the 06:00 finance refresh.

**Ordering.** Backfill in **reverse chronological** order: recent partitions are queried most, so fixing them first delivers most of the value early, and if the backfill is stopped halfway, the missing part is old data few people read.

**Propagation.** Fixing `fct_revenue` for March leaves every downstream table built from March's `fct_revenue` stale. In an asset-centric orchestrator the stale partitions are visible and can be backfilled in dependency order; in a task-centric one you clear the task and its downstream tasks for the date range, and hope the DAG boundaries match the real data dependencies. Cross-DAG dependencies are where backfills most often go wrong. The exercise below computes exactly the set and order of tasks a change forces you to rerun.

**Validation.** Write backfill output to a new table or branch first, compare it with the old output (row counts, sums, a diff of a sample of keys), and publish atomically. Iceberg branches and the write-audit-publish pattern, covered in [data quality, lineage and governance](/learn/big-data/data-platforms/data-quality-lineage-and-governance), make this a single metadata operation.

## Exercise

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

## Senior signals

- You design every task as **idempotent over a data interval**: overwrite the partition it owns, read inputs by logical date, and isolate unrepeatable side effects.
- You prefer **ELT with a retained raw layer** because it makes logic bugs recoverable, and you know when ETL is still right (filtering sensitive data before it lands).
- You treat the orchestrator as a **scheduler and bookkeeper**, not a compute engine, and you understand the task-centric versus asset-centric trade-off.
- You make **completeness explicit** (data-aware triggers, completeness signals, lookback windows) instead of trusting the clock.
- You plan backfills for **capacity, order and propagation**: isolated pools, newest partitions first, downstream assets included, and output validated before it is published.

## Check yourself

```quiz
- q: >-
    A daily task computes WHERE order_date = CURRENT_DATE - 1 and writes with INSERT INTO. What goes wrong when it is retried after midnight?
  options: ["The orchestrator skips retries once the logical day has passed", "The retry targets a different day and appends to it", "Nothing, because a retry repeats exactly the same query", "The retry fails because the target table is still locked"]
  answer: 1
  explanation: >-
    CURRENT_DATE moves with the clock, so the retry targets a different interval, and INSERT INTO appends to whatever is there: one day is missing its rerun and another is duplicated or partial. The query text is the same but its meaning is not. Using the run's logical date and overwriting its partition makes the retry repeat exactly the same work.
- q: >-
    Why does ELT make recovering from a transformation bug easier than classic ETL?
  options: ["ELT tools catch errors earlier, before any data is loaded", "The raw data is kept, so you fix the SQL and recompute", "ELT transforms data before it loads, so bad rows never land", "SQL transforms are declarative, so they rarely have bugs to fix"]
  answer: 1
  explanation: >-
    Keeping the raw layer in the lake or warehouse makes every transform reproducible: fix the SQL and recompute. Sources often retain only recent data or current state, so ETL pipelines that discarded raw inputs may be unable to rebuild history. Transforming before loading is ETL, not ELT.
- q: >-
    You must backfill 400 daily partitions of a job that takes 30 minutes per partition, without delaying the 06:00 production refresh. What plan is best?
  options: ["Run the backfill inside the production DAG so it shares retries", "Bounded concurrency, oldest partitions first so history fills in order", "A separate pool, bounded concurrency, newest partitions first", "Launch all 400 runs at once so it finishes as quickly as possible"]
  answer: 2
  explanation: >-
    400 × 30 minutes is 200 hours serially, so concurrency is needed, but unbounded concurrency starves production; a separate pool isolates it. Newest-first delivers the most-used data early, and a halted backfill leaves only old, rarely read data missing. Then backfill downstream assets, which are stale until they are recomputed, and validate before publishing to catch a bad fix.
- q: >-
    A backfill of March revenue by country joins orders with the current customers table. What is wrong?
  options: ["The current customers table is too large to join efficiently", "Customers who moved get March orders under today's country", "Nothing, as long as the job overwrites its partitions", "Joins in a backfill make it non-idempotent across reruns"]
  answer: 1
  explanation: >-
    Idempotent is not the same as correct. Reading dimension data as it is today, rather than as of the interval, attributes orders to customers' current country and silently rewrites history with today's attributes. Use snapshots as of the interval or a slowly changing dimension.
- q: >-
    What is the main practical advantage of an asset-centric orchestrator for backfills?
  options: ["It pushes SQL down to the warehouse, so each run is faster", "It knows partition dependencies, so it can find stale ones", "It stores the assets itself, so no separate warehouse is needed", "Its tasks are idempotent by construction, so reruns are safe"]
  answer: 1
  explanation: >-
    Declaring assets and partitions gives the orchestrator the data dependency graph, not just the task graph. After a fix, it can compute exactly which downstream partitions are stale and backfill them in dependency order, which task-centric DAGs leave to the engineer. Idempotency is still the task author's job in either model.
```

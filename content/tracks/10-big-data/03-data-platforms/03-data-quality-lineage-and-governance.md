---
slug: data-quality-lineage-and-governance
title: "Data quality, lineage and governance: trusting data at scale"
description: Why data incidents are silent, how schema registry compatibility modes decide which changes break which readers, which tests block a pipeline and which only warn, how column-level lineage finds an incident's blast radius, how write-audit-publish stops bad data before readers see it, and how a deletion request is honoured in an immutable lake.
minutes: 40
difficulty: hard
tags: [big-data, data-quality, data-contracts, lineage, governance, privacy, gdpr, write-audit-publish, iceberg]
---
The payments team ships a change that records amounts in cents instead of dollars. Their service tests pass; the database accepts integers either way; the CDC pipeline, the staging models and the revenue mart all run green. Three days later someone preparing a board deck notices that revenue for one region grew a hundredfold on Tuesday. Nothing failed. Every job succeeded. The data was wrong, and by then it had flowed into forecasts, a partner export and the training set of a churn model.

That is what makes data incidents different from service incidents: they are **silent**. A broken service returns errors; a broken pipeline returns plausible numbers. Trust in a data platform therefore has to be engineered: contracts with producers about what data means and which changes are allowed, tests that run where problems enter and that decide whether to block, a publishing step that stops bad data before anyone reads it, lineage that tells you where a problem spread, and governance that controls who may see what and makes deletion real. This lesson traces each mechanism on concrete data and says what it costs.

## What can be wrong with data

Most data incidents fall into a small number of categories, and each has a characteristic check:

| Dimension | Failure example | Check |
|---|---|---|
| Freshness | Upstream export late; table still shows yesterday | Max event time or last commit versus an SLA |
| Volume | Half the partitions missing; a duplicate load doubles rows | Row count versus recent history |
| Schema | Column renamed, type changed, new enum value | Schema diff against a contract or registry |
| Validity | Negative durations, country `"UK"` instead of `"GB"` | Accepted values, ranges, regexes |
| Uniqueness | Duplicate primary keys after an at-least-once load | `COUNT(*)` versus `COUNT(DISTINCT key)` |
| Referential integrity | Facts pointing at customers that do not exist | Anti-join between fact keys and the dimension |
| Distribution and semantics | Dollars become cents; a default value floods one bucket | Statistics against history; reconciliation with a system of record |

The last row is the hardest and the most damaging, because the schema, types and nulls are all fine. Only a check that knows what the numbers should look like, or a reconciliation against an independent source (total payments versus the ledger), catches it.

## Data contracts: schema, semantics and service level

A **data contract** is an agreement, owned by the producer, about the data they emit: the schema, what each field means (including units), and service levels (freshness, delivery guarantees). It turns "the payments team changed a column" from a surprise into a reviewed, versioned change.

```yaml
contract: payments.payment_completed
version: 3.1.0
owner: payments-platform
schema:
  payment_id:   {type: string, required: true, unique: true}
  customer_id:  {type: long,   required: true}
  amount_minor: {type: long,   required: true, description: "Amount in minor units (cents)"}
  currency:     {type: string, required: true, format: "ISO 4217"}
  completed_at: {type: timestamp, required: true, description: "Event time, UTC"}
guarantees:
  freshness: "p99 end-to-end delay under 5 minutes"
  delivery: at-least-once, deduplicate on payment_id
compatibility: backward      # new fields optional; no renames, removals or unit changes within a major version
```

What makes a contract more than documentation is **enforcement in the producer's CI**: the schema part is checked by a registry, the semantic part by a test that compares the service's output against the contract's units and ranges, and breaking changes (renames, removals, unit changes) require a new major version published alongside the old one while consumers migrate. The cents incident is a semantic breaking change that a schema check alone cannot see, which is why contracts carry units. The [outbox pattern](/learn/big-data/streaming/change-data-capture) pairs naturally with contracts: the outbox event is the contract, and internal tables are free to change.

### Under the hood: the schema registry and its compatibility modes

For events on Kafka (see [Kafka internals](/learn/big-data/streaming/kafka-internals)) the schema part is enforced by a **schema registry**. With the Confluent serialisers, each message on the wire starts with a magic byte `0x00` and a 4-byte schema id, followed by the Avro (or Protobuf, or JSON Schema) payload; the producer registers its schema under a **subject** (by default `<topic>-value`) and gets the id back, and the consumer fetches the schema for that id (cached after the first message) and resolves it against its own reader schema. Registration is where compatibility is checked: an incompatible schema is rejected with HTTP 409 before a single message is produced.

The modes, defined from the reader's point of view:

| Mode | Guarantee | Who upgrades first |
|---|---|---|
| `BACKWARD` (default) | A consumer on the new schema can read data written with the previous schema | Consumers |
| `FORWARD` | A consumer on the previous schema can read data written with the new schema | Producers |
| `FULL` | Both | Either |
| `*_TRANSITIVE` | The same, checked against every earlier version, not only the latest | As above |
| `NONE` | No check | Nobody is protected |

### Three changes traced

Trace three concrete changes to an Avro schema `{payment_id: string, amount: long, currency: string}`:

| Change | New reader, old data (`BACKWARD`) | Old reader, new data (`FORWARD`) | `FULL` |
|---|---|---|---|
| Remove `currency` | Passes: the reader ignores a writer field it does not have | Fails: the old reader needs `currency`, the record lacks it and there is no default | No |
| Add `amount_minor: long` with no default | Fails: old records have no value and the reader has no default to use | Passes: the old reader ignores the unknown field | No |
| Add `amount_minor: long` with default `0` | Passes | Passes | Yes |
| Change `amount` from `long` to `string` | Fails: no promotion from long to string | Fails | No |

A rename is a removal plus an addition, so it fails both ways unless the new field has a default and the old one is kept as an alias. The rule of thumb that falls out of the table: **add fields with defaults, never remove or retype within a major version**, and set `BACKWARD_TRANSITIVE` so that a consumer replaying six months of a topic can read every version it meets. Protobuf's rules differ in the details (field numbers are the identity, removed numbers must be `reserved`, and `int32` to `int64` passes on the wire because both are varints) but the shape is the same: the registry protects structure, and only the contract protects meaning.

## Tests at every layer

Put checks where problems enter, and decide for each check whether it **blocks** publication or only **warns**:

1. **At the producer**, through the contract and registry: the cheapest place to stop a breaking change is the pull request that introduces it.
2. **At ingestion**: validate schema and parseability, route malformed records to a quarantine table with the reason, and count them. A 0.01% quarantine rate is normal; a jump to 30% is an incident.
3. **After each transformation**: assertions on the model's outputs, declared next to the model.
4. **Before publication**: aggregate checks that compare the new partition with history and with independent sources.

Concrete thresholds and what happens when they fire, in dbt's vocabulary (Great Expectations' `mostly`, and Deequ's `hasCompleteness(col, _ >= 0.999)` express the same thing):

```yaml
sources:
  - name: payments
    loaded_at_field: completed_at
    freshness:
      warn_after:  {count: 6,  period: hour}
      error_after: {count: 12, period: hour}
models:
  - name: fct_payment
    columns:
      - name: payment_id
        tests:
          - unique:   {config: {severity: error}}
          - not_null: {config: {severity: error}}
      - name: customer_key
        tests:
          - relationships:
              to: ref('dim_customer')
              field: customer_key
              config: {severity: warn, warn_if: ">0", error_if: ">1000"}
      - name: currency
        tests:
          - accepted_values: {values: ['USD', 'EUR', 'GBP', 'BRL', 'JPY']}
```

| Check | Threshold | When it fires |
|---|---|---|
| Freshness | Warn at 6 h, error at 12 h since the newest `completed_at` | Error: downstream models are skipped; on-call paged |
| Uniqueness of `payment_id` | Zero duplicates | Error: the model's downstream is skipped (`dbt build` stops the branch) |
| Referential integrity | Orphans: warn above 0, error above 1,000 | Warn: recorded, owner notified; error: branch stops |
| Null rate of `customer_id` | At most 0.1% (`mostly: 0.999`) | Error |
| Volume | Median and MAD, k = 3, same weekday | Error before publish (next section) |
| Distribution | PSI under 0.1 against the last 28 days of `amount_minor` buckets | Warn, because drift is often real |

The decision rule for **block versus warn**: block when a downstream consumer acts on the numbers (finance, billing, a model retrain) and a stale-but-correct alternative exists; warn when the check is new (two weeks of calibration before promoting it), when the failing share is small and bounded, or when consumers need freshness more than exactness (an operations dashboard). A warn nobody owns is a test that does not exist.

### Robust anomaly checks

Static thresholds ("row count > 1,000,000") break with growth and seasonality. Compare each new value with its own recent history, and use **robust** statistics. The mean and standard deviation of the last 30 days are dragged by the very outliers you want to detect: one bad day with 0 rows inflates the standard deviation so much that the next bad day passes. The **median** and the **median absolute deviation** (MAD) ignore a few outliers:

$$ \text{flag } x \text{ if } |x - \text{median}(h)| > k \cdot \text{MAD}(h), \quad \text{MAD}(h) = \text{median}(|h_i - \text{median}(h)|) $$

With history of daily row counts in millions `[100, 102, 98, 101, 99]`, the median is 100 and the MAD is 1; with k = 3, anything outside 97 to 103 is flagged. A day with 40 is flagged; after it, the median and MAD barely move, so a following day of 250 is flagged too. Compare within the same weekday when data is weekly-seasonal, and alert on the check's own health (a check that never flags is as suspicious as one that always does). The exercise at the end implements this.

## Write-audit-publish

Tests that run after data is published only tell you how long readers saw bad data. **Write-audit-publish** (WAP) reverses the order: write the new data somewhere readers cannot see it, audit it, and publish atomically only if the audit passes. Netflix engineers described this pattern publicly years ago, and Iceberg supports it with **branches**:

```sql
-- Write: the job commits to an audit branch, invisible to readers of main.
ALTER TABLE prod.finance.fct_payment SET TBLPROPERTIES ('write.wap.enabled' = 'true');
ALTER TABLE prod.finance.fct_payment CREATE BRANCH audit_20240501;
SET spark.wap.branch = audit_20240501;
INSERT OVERWRITE prod.finance.fct_payment
SELECT * FROM staged_payments WHERE payment_date = DATE '2024-05-01';

-- Audit: run checks against the branch.
SELECT COUNT(*) AS rows, COUNT(DISTINCT payment_id) AS ids, SUM(amount_minor) AS total
FROM prod.finance.fct_payment VERSION AS OF 'audit_20240501'
WHERE payment_date = DATE '2024-05-01';

-- Publish: an atomic metadata operation, only if the audit passed.
CALL prod.system.fast_forward('finance.fct_payment', 'main', 'audit_20240501');
```

If the audit fails, readers keep seeing yesterday's correct data, the branch is kept for debugging, and the incident is "the report is late" instead of "the report was wrong." That trade (stale but correct over fresh but wrong) is almost always right for financial and executive data, and it is worth saying explicitly in a design review. The cost is latency (checks run before publication) and an audit step in the orchestrator between write and publish.

## Lineage

**Lineage** is the graph of which datasets and columns are derived from which. It answers three questions that otherwise require archaeology: **impact analysis** (downstream traversal from a changed column), **root cause** (upstream traversal from a wrong dashboard), and **privacy scoping** (downstream traversal from a column tagged as personal).

### Column-level lineage from SQL

Table-level lineage says `fct_payment` reads `stg_payment` and `dim_customer`. Column-level lineage is derived by parsing each model's SQL (libraries such as sqlglot expose this directly) into edges from output columns to the input columns they are computed from:

```sql
CREATE TABLE fct_payment AS
SELECT p.payment_id,
       p.amount / 100.0 AS amount_usd,      -- amount_usd <- stg_payment.amount
       c.customer_key,                      -- customer_key <- dim_customer.customer_key
       p.completed_at::date AS payment_date -- payment_date <- stg_payment.completed_at
FROM stg_payment AS p
JOIN dim_customer AS c ON c.customer_id = p.customer_id;   -- join columns: indirect lineage
```

| Output column | Direct inputs | Indirect inputs (filters and joins) |
|---|---|---|
| `fct_payment.amount_usd` | `stg_payment.amount` | `stg_payment.customer_id`, `dim_customer.customer_id` |
| `fct_payment.customer_key` | `dim_customer.customer_key` | the same |
| `rpt_finance.revenue_usd` | `fct_payment.amount_usd` (SUM) | `fct_payment.payment_date` |
| `rpt_active_customers.active_count` | `fct_payment.customer_key` (COUNT DISTINCT) | `fct_payment.payment_date` |

The last row is the point: `rpt_active_customers` is downstream of `fct_payment` at table level but never reads `amount_usd`. A cents bug does not reach it.

### Runtime lineage: OpenLineage events

Static parsing misses Python jobs and dynamically generated SQL. **OpenLineage** is the open standard for jobs to emit lineage as they run: a `START` event and a `COMPLETE` (or `FAIL`) event per run, each naming the job, the run id, and the input and output datasets, with optional facets such as schema and column lineage. Integrations exist for Airflow, Spark, dbt and Flink, and catalogues such as Marquez and DataHub store the graph.

```json
{
  "eventType": "COMPLETE",
  "eventTime": "2024-05-02T03:14:07Z",
  "run": {"runId": "9c2f6a1e-8b7d-4c1a-9f0e-2d3b4c5a6e7f"},
  "job": {"namespace": "airflow://prod", "name": "revenue.build_fct_payment"},
  "inputs": [{"namespace": "iceberg://prod", "name": "finance.stg_payment"},
             {"namespace": "iceberg://prod", "name": "finance.dim_customer"}],
  "outputs": [{"namespace": "iceberg://prod", "name": "finance.fct_payment",
               "facets": {"columnLineage": {"fields": {
                 "amount_usd": {"inputFields": [{"namespace": "iceberg://prod", "name": "finance.stg_payment", "field": "amount"}]},
                 "customer_key": {"inputFields": [{"namespace": "iceberg://prod", "name": "finance.dim_customer", "field": "customer_key"}]}}}}}],
  "producer": "https://github.com/OpenLineage/OpenLineage/tree/1.x/integration/airflow"
}
```

Runtime lineage catches what parsing misses; static lineage covers jobs that have not run yet. Mature platforms use both. Netflix has published a description of its lineage system: lineage collected at runtime from its Spark and Trino workloads and stored as a graph, federated with Metacat (its open-sourced metadata service), and used for impact analysis, for alerting consumers when an upstream dataset is late or wrong, and for finding unused datasets to retire.

### Tracing an incident's blast radius

Back to the cents deploy at 09:00 on Tuesday. Column-level lineage, traversed breadth-first downstream from `raw_payments.amount`:

| Level | Column reached | Via | Affected partitions |
|---|---|---|---|
| 1 | `stg_payment.amount` | pass-through | Tuesday onwards |
| 2 | `fct_payment.amount_usd` | `amount / 100.0` | Tuesday to Thursday (three daily runs) |
| 3 | `rpt_finance.revenue_usd`, `partner_export.amount`, `churn_features.spend_30d` | SUM, pass-through, windowed SUM | The same three days; the 30-day feature window is wrong for a further 27 days |
| 4 | `churn_model` (trained Wednesday) | training | The model version trained on the bad window |

Blast radius: six datasets, one model, and one external partner who received an export. Not affected: `dim_customer`, `rpt_active_customers`, and the web-events features. Table-level lineage would have listed `rpt_active_customers` too and paged a team that had nothing to fix. The remediation is now a plan rather than a search: fix the producer, backfill the three partitions of `fct_payment`, then everything downstream in dependency order (the backfill-plan exercise in the [orchestration lesson](/learn/big-data/data-platforms/etl-elt-and-orchestration)), resend the export, and retrain the model.

```viz
{"type": "graph", "algorithm": "bfs", "directed": true, "start": "PAY",
 "nodes": [{"id": "PAY"}, {"id": "STG"}, {"id": "FCT"}, {"id": "DIM"}, {"id": "RPT"}, {"id": "EXP"}, {"id": "FEAT"}, {"id": "MDL"}, {"id": "WEB"}],
 "edges": [{"from": "PAY", "to": "STG"}, {"from": "STG", "to": "FCT"}, {"from": "DIM", "to": "FCT"}, {"from": "FCT", "to": "RPT"}, {"from": "FCT", "to": "EXP"}, {"from": "FCT", "to": "FEAT"}, {"from": "FEAT", "to": "MDL"}, {"from": "WEB", "to": "FEAT"}],
 "title": "Blast radius of a bad upstream change",
 "caption": "PAY: raw payments. STG: staging. FCT: payments fact. DIM: customer dimension. RPT: finance report. EXP: partner export. FEAT: churn features. MDL: churn model. WEB: web events. A breadth-first search downstream from PAY finds every dataset the cents bug reached; DIM and WEB are untouched because edges only lead into FCT and FEAT."}
```

## Privacy at scale

Governance is the set of controls over who may use which data for what, and how long it lives.

**Classification and masking.** Tag columns by sensitivity (`pii.email`, `pii.precise_location`, `financial`), automatically where possible (pattern scanners on samples) and verified by owners. Tags propagate along column lineage, so a derived table containing `email` inherits the tag without anyone remembering to add it. Access is then granted by tag and purpose rather than table by table: a masking policy shows `email` only to roles with a need, row-level filters restrict by region, and audit logs record who read what. In Snowflake's syntax:

```sql
CREATE MASKING POLICY mask_email AS (val STRING) RETURNS STRING ->
  CASE WHEN IS_ROLE_IN_SESSION('PII_READER') THEN val
       ELSE REGEXP_REPLACE(val, '.+@', '***@') END;
ALTER TABLE dim_customer MODIFY COLUMN email SET MASKING POLICY mask_email;
```

**Pseudonymisation, done correctly.** A plain SHA-256 of an email or phone number is not anonymous: the input space is small and structured, so a dictionary of candidate values reverses it. Use a keyed hash (HMAC with a secret held outside the warehouse) or a tokenisation service, and treat the output as still personal data under most privacy regimes.

**Retention.** Every table gets a retention policy, with the arithmetic written down: 500 GB per day of raw events with personal fields at 30 days is 15 TB live; staging at 90 days; marts by business need; table snapshots at 5–7 days (Iceberg's default `history.expire.max-snapshot-age-ms` is 5 days).

### Deleting one user from an immutable lake

A deletion request must reach every table the user's data flowed into (a column-lineage traversal from the user-keyed tables) and be physically real within a deadline of about a month under the GDPR. Trace user 42 through `fct_payment`, partitioned by day in 256 MB Parquet files, where the four rows sit in three files:

| File | Rows for user 42 (positions) |
|---|---|
| `payment_date=2024-05-01/f-017.parquet` | 1,204 and 88,310 |
| `payment_date=2024-05-02/f-003.parquet` | 51 |
| `payment_date=2024-05-03/f-009.parquet` | 9,977 |

**Copy-on-write.** Rewrite the three files without those rows: read 768 MB, write about 768 MB, commit a new snapshot whose manifests point at the three new files. Cost is proportional to the bytes in the touched files, not to the rows deleted: four rows cost three quarters of a gigabyte. Ten thousand requests per day over a 500 TB table would rewrite most of the table daily, so nobody does this per request.

**Merge-on-read with delete files** (Iceberg v2). Write a **position delete** file per partition listing `(file_path, position)` pairs, three tiny files in total, and commit; a reader of `f-017` applies the delete list at scan time and skips rows 1,204 and 88,310. An **equality delete** file instead carries the predicate `customer_id = 42` (or ten thousand ids at once) and applies to every data file with a lower sequence number, which is what makes a **daily batch** of requests one small file per partition. The trade: every scan now merges delete files, so a table with thousands of them reads several times slower until **compaction** (`rewrite_data_files` and `rewrite_position_delete_files`) folds the deletes into new data files. The Iceberg v3 specification replaces position delete files with binary deletion vectors, the same idea with a cheaper read path.

**Snapshot expiry.** Both routes create a new snapshot; the old snapshot still references the old files, and time travel can still read user 42 until `expire_snapshots` removes snapshots older than the retention window and `remove_orphan_files` deletes the files. Deletion is real at that point and not before, which is why the batch, the compaction and the expiry are scheduled together and the deadline arithmetic (weekly batch + 7-day snapshot retention + compaction lag) is written down.

### Crypto-shredding, tombstones and the trade-offs

**Crypto-shredding.** For data that cannot practically be rewritten (years of archived events, backups, a third copy nobody remembers), encrypt each user's personal fields with a per-user data key, keep the keys in a key store wrapped by a KMS master key, and delete the user's key on request. Every copy of the ciphertext, in every snapshot and archive, becomes unreadable at once. The costs: encryption on write and decryption on read, no filtering or aggregation on the encrypted columns, and a key store that is now the most sensitive system you run.

**Tombstones** in a compacted Kafka topic: produce the user's key with a null value; log compaction drops earlier records for that key and removes the tombstone itself after `delete.retention.ms` (default 24 hours), so a consumer offline for longer never sees the deletion. For non-compacted topics, retention is the only deletion, which is why raw PII topics get days, not months.

| Method | Cost per deletion | Read cost afterwards | Time to physical erasure | Works on archives and backups |
|---|---|---|---|---|
| Copy-on-write rewrite | Bytes of every touched file | None | Snapshot expiry | No |
| Delete files (merge-on-read) | One small file per partition per batch | Grows with delete-file count until compaction | Compaction plus snapshot expiry | No |
| Crypto-shredding | Deleting one key | Decryption on every read of the column | Immediate, everywhere | Yes |
| Kafka tombstone | One message | None | Compaction plus `delete.retention.ms` | Compacted topics only |

## Data SLOs

Treat important datasets like services: define **service level objectives** and alert on them. "`fct_payment` for day D is published by 06:00 UTC on 99% of days", "less than 0.1% of records quarantined", "daily total within 0.5% of the ledger". SLOs turn a vague sense of trust into numbers that can be reported, prioritised and improved, and they make the stale-but-correct trade of WAP an explicit, measured choice.

## Failure modes in production

**The registry was in `NONE`.** Symptom: consumers throw deserialisation errors, or worse, a field arrives as null in every downstream table. Diagnosis: the subject's version history shows a field removed or retyped. Fix: `BACKWARD_TRANSITIVE` on every production subject, a CI check against the registry in the producer's pipeline, and a replay from the retained raw layer.

**Warn-only tests nobody owns.** Symptom: 0.3% duplicate `payment_id`s for three weeks, discovered by finance. Diagnosis: the uniqueness test fired daily at `warn` severity into a channel with no owner. Fix: `error` severity for keys and anything financial, an owner per warning, and an SLO on the share of warnings acknowledged.

**A static threshold fires every Monday.** Symptom: alert fatigue; the real incident on a Thursday is muted. Diagnosis: weekly seasonality against a fixed row-count bound. Fix: median and MAD against the same weekday, and a check on the check (no flags in 60 days is a bug).

**Deletes that never became real.** Symptom: a deleted user's rows appear in a time-travel query a month later. Diagnosis: row-level deletes committed, but snapshot expiry never ran on that table. Fix: schedule expiry and orphan-file cleanup with the deletion batch, and audit with a query that time-travels to the oldest retained snapshot.

**Delete files piled up.** Symptom: scans of `fct_payment` are four times slower than a month ago with the same data volume. Diagnosis: thousands of equality delete files that every scan merges. Fix: compaction on a schedule sized to the deletion rate, and position deletes where the writer can locate rows.

**A lineage gap.** Symptom: a partner export built by a notebook was not in the blast radius and shipped bad numbers. Diagnosis: static lineage only; the notebook's writes were invisible. Fix: runtime lineage from the job runner (OpenLineage) for every writer, and a rule that datasets without lineage cannot be published.

## Interviewer follow-ups

**"Payments wants to add a required field. The registry is in `BACKWARD` mode. What happens?"** Model answer: registration is rejected, because consumers on the new schema could not read old records that lack the field. Add the field with a default (compatible in both directions), or, if it must be required, publish a new subject as a new major version and migrate consumers first. Common wrong answer: "switch the subject to `NONE` for the deploy".

**"How do you decide whether a failing test blocks the pipeline?"** Model answer: by who acts on the data, whether a stale-but-correct alternative exists, and the check's false-positive rate; start new checks at warn, calibrate, promote to error. Common wrong answer: block on everything, which trains people to override.

**"A user requests deletion. You have 500 TB in Iceberg and two years of event archives. Walk me through it."** Model answer: column lineage from the user-keyed tables gives the table list; batched equality deletes daily; compaction and snapshot expiry on a schedule with the deadline arithmetic; crypto-shredding for archives and backups; an audit query per table as proof. Common wrong answer: "run a DELETE on each table", which leaves the rows readable through time travel.

**"What does lineage give you in an incident that logs and dashboards do not?"** Model answer: the blast radius at column level, the direction to search for root cause, and a time bound on affected partitions, so remediation is a dependency-ordered backfill rather than a search. Common wrong answer: "a diagram of the pipeline".

**"How is a data contract different from a schema?"** Model answer: a schema is structure; a contract adds semantics (units, meaning), service levels, ownership, enforcement in the producer's CI and a versioning policy. The cents bug passes every schema check. Common wrong answer: "a contract is the Avro file".

## What mid-level engineers get wrong

- Treating the schema registry as the whole contract: unit and meaning changes pass every check and reach finance.
- Testing after publication: the test tells you how long readers saw bad data instead of preventing it.
- Setting every test to warn: three weeks of duplicates in a channel nobody reads.
- Hashing personal identifiers with an unkeyed SHA-256 and calling the result anonymous: a dictionary attack reverses it.
- Running a `DELETE` on an Iceberg table and closing the ticket: the rows are readable through time travel until snapshots expire.
- Using table-level lineage for impact analysis: paging teams whose columns are untouched, and missing the notebook that was never instrumented.

## Exercise

```exercise
id: volume-anomaly-mad
title: Flag anomalous daily row counts with median and MAD
prompt: |
  `counts` is a list of daily row counts. For every day `i >= window`, let `h`
  be the previous `window` counts (`counts[i - window : i]`). Compute

  - `m = median(h)`
  - `mad = median([abs(x - m) for x in h])`

  Flag day `i` if `abs(counts[i] - m) > threshold * mad` (strictly greater).
  When `mad` is 0, this flags any day that differs from the median at all.

  The median of an even-length list is the average of its two middle values.
  Return the list of flagged indexes in increasing order.
languages: [python, javascript]
entry: volume_anomalies
starter:
  python: |
    def volume_anomalies(counts, window, threshold):
        # your code here
        return []
  javascript: |
    function volume_anomalies(counts, window, threshold) {
      // your code here (sort numbers with (a, b) => a - b)
      return [];
    }
tests:
  - args: [[100, 102, 98, 101, 99, 100, 40, 101, 250, 100], 5, 3]
    expected: [6, 8]
    label: one outlier does not mask the next
  - args: [[50, 50, 50, 50, 51], 4, 3]
    expected: [4]
    label: zero MAD flags any change
  - args: [[1, 2, 3], 5, 3]
    expected: []
    label: not enough history
  - args: [[10, 20, 30, 40, 100], 4, 2]
    expected: [4]
    hidden: true
    label: even window uses the average of the middle values
  - args: [[6, 8, 10, 12, 14, 14], 5, 2]
    expected: []
    hidden: true
    label: a deviation equal to the bound is not flagged
  - args: [[6, 8, 10, 12, 14, 15], 5, 2]
    expected: [5]
    hidden: true
hints:
  - "Write a `median` helper that sorts a copy numerically and averages the two middle values for even lengths."
  - "Recompute the median and MAD from the previous `window` values for each day; do not include the day being tested."
```

## Senior signals

- You say data incidents are **silent** and design for detection before publication, not alerting after it.
- You can trace a schema change through the registry's **compatibility modes** and say which readers break, and you know the registry protects structure while only the contract protects meaning.
- You place checks **where problems enter**, give each a threshold, and decide which ones **block** and which warn, with an owner for every warning.
- You use **column-level lineage** for blast radius, root cause and privacy scoping, collected both by parsing SQL and at runtime, and you time-bound the affected partitions.
- You use **write-audit-publish** for critical tables and state the trade-off: stale but correct beats fresh but wrong.
- You know that deletion in a lake is **delete files, compaction and snapshot expiry** with the deadline arithmetic written down, and **crypto-shredding** where rewriting is impossible.

## Check yourself

```quiz
- q: >-
    A producer changes an amount field from dollars to cents without changing its type. Which control is most likely to catch it before any consumer sees the data?
  options: ["A unit-aware producer contract plus a ledger reconciliation", "Column-level lineage from payments to the revenue mart", "A schema registry check for backward compatibility", "A not_null test on the amount column in staging"]
  answer: 0
  explanation: >-
    The schema is unchanged, so schema checks and null tests pass. A producer-owned contract that specifies units, enforced by a CI test where the change is made, plus a pre-publish reconciliation against the ledger's independent total, catches a unit change. Lineage helps measure the blast radius afterwards but does not detect it.
- q: >-
    A subject is in BACKWARD mode and the producer tries to register a schema that adds a required field with no default. What happens?
  options: ["Registration is rejected, because required fields are never allowed in Avro", "Registration succeeds, because old readers ignore unknown fields", "Registration succeeds, but consumers must be redeployed within a day", "Registration is rejected, because new readers could not read old records"]
  answer: 3
  explanation: >-
    BACKWARD means a consumer on the new schema must be able to read data written with the previous one; old records have no value for the new field and there is no default to fill in, so the check fails and the registry returns a conflict. The change would pass in FORWARD mode, where the guarantee runs the other way. Adding the field with a default makes it compatible in both directions.
- q: >-
    Why is a median-and-MAD check preferred over mean and standard deviation for daily row-count anomalies?
  options: ["Past outliers barely move it, so they cannot mask new ones", "It needs no threshold, so it adapts to growth by itself", "It fits normally distributed counts better than the mean does", "It is faster to compute over long windows of history"]
  answer: 0
  explanation: >-
    A single bad day (for example 0 rows) in the history window can inflate the standard deviation enough that the next bad day looks normal. The median and MAD are barely affected by a few outliers, so they keep flagging. Both approaches still need a threshold (k).
- q: >-
    In a write-audit-publish flow on Iceberg, the audit of today's partition fails. What do readers of the main branch see?
  options: ["A read error on today's partition until it is fixed", "An empty partition for today until the audit passes", "The new data, flagged as unaudited until the audit passes", "The last audited data; the new data stays on the branch"]
  answer: 3
  explanation: >-
    The write went to an audit branch that readers of main do not see, and the fast-forward that publishes it never ran. Readers keep the last published, audited snapshot; the incident becomes lateness rather than wrong numbers, and nothing on main is emptied or broken.
- q: >-
    A team pseudonymises emails with SHA-256 before loading them into the warehouse and declares the column non-personal. What is the problem?
  options: ["SHA-256 is too slow to run over warehouse tables of this size", "SHA-256 collisions will merge different users' rows", "Guessable emails can be hashed and matched to reverse it", "Hashed values can no longer be joined to other tables by email"]
  answer: 2
  explanation: >-
    An unkeyed hash of a low-entropy, structured identifier is reversible by dictionary attack: hash candidate addresses and match them. A keyed hash or tokenisation with a secret held elsewhere prevents that, but the output is still pseudonymous personal data, not anonymous data. Collisions in SHA-256 are not a practical concern.
- q: >-
    A user's deletion request is applied to an Iceberg table with DELETE, but the user's rows can still be read a month later. What was missed?
  options: ["Iceberg ignores row-level deletes on partitioned tables", "Old snapshots still reference the files until they expire", "The DELETE needed a WHERE clause on the user's partition", "The table must be converted to Delta Lake to honour deletes"]
  answer: 1
  explanation: >-
    Row-level deletes create a new snapshot, but time travel to older snapshots still reads the old files. Deletion is only real once compaction writes files without the rows and the snapshots referencing the old files are expired and cleaned up. Iceberg supports deletes fine; the current snapshot no longer shows the rows.
```

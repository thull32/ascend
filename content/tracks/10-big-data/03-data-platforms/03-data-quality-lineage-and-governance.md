---
slug: data-quality-lineage-and-governance
title: "Data quality, lineage and governance: trusting data at scale"
description: Why data incidents are silent, how to test data at each layer with contracts, assertions and robust anomaly checks, how write-audit-publish stops bad data before readers see it, how lineage answers "what breaks if this changes", and how privacy deletion works in an immutable lake.
minutes: 27
difficulty: hard
tags: [big-data, data-quality, data-contracts, lineage, governance, privacy, gdpr, write-audit-publish, iceberg]
---
The payments team ships a change that records amounts in cents instead of dollars. Their service tests pass; the database accepts integers either way; the CDC pipeline, the staging models and the revenue mart all run green. Three days later someone preparing a board deck notices that revenue for one region grew a hundredfold on Tuesday. Nothing failed. Every job succeeded. The data was simply wrong, and by then it had flowed into forecasts, a partner export and the training set of a churn model.

That is what makes data incidents different from service incidents: they are **silent**. A broken service returns errors; a broken pipeline returns plausible numbers. Trust in a data platform therefore has to be engineered: agreements with producers about what data means, tests that run where problems enter, a publishing step that stops bad data before anyone reads it, lineage that tells you where a problem spread, and governance that controls who may see what and makes deletion real. This lesson covers each mechanism and what it costs.

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

## Tests at every layer

Put checks where problems enter, and decide for each check whether it **blocks** publication or only **warns**:

1. **At the producer**, through contracts (next section): the cheapest place to stop a breaking change is the pull request that introduces it.
2. **At ingestion**: validate schema and parseability, route malformed records to a quarantine table with the reason, and count them. A 0.01% quarantine rate is normal; a jump to 30% is an incident.
3. **After each transformation**: assertions on the model's outputs. In dbt these are declared next to the model:

```yaml
models:
  - name: fct_payment
    columns:
      - name: payment_id
        tests: [unique, not_null]
      - name: customer_key
        tests:
          - relationships: {to: ref('dim_customer'), field: customer_key}
      - name: currency
        tests:
          - accepted_values: {values: ['USD', 'EUR', 'GBP', 'BRL', 'JPY']}
```

4. **Before publication**: aggregate checks that compare the new partition with history and with independent sources.

### Robust anomaly checks

Static thresholds ("row count > 1,000,000") break with growth and seasonality. Compare each new value with its own recent history, and use **robust** statistics. The mean and standard deviation of the last 30 days are dragged by the very outliers you want to detect: one bad day with 0 rows inflates the standard deviation so much that the next bad day passes. The **median** and the **median absolute deviation** (MAD) ignore a few outliers:

$$ \text{flag } x \text{ if } |x - \text{median}(h)| > k \cdot \text{MAD}(h), \quad \text{MAD}(h) = \text{median}(|h_i - \text{median}(h)|) $$

With history of daily row counts in millions `[100, 102, 98, 101, 99]`, the median is 100 and the MAD is 1; with k = 3, anything outside 97 to 103 is flagged. A day with 40 is flagged; after it, the median and MAD barely move, so a following day of 250 is flagged too. Compare within the same weekday when data is weekly-seasonal, and alert on the check's own health (a check that never flags is as suspicious as one that always does). The exercise at the end implements this.

## Data contracts

A **data contract** is an agreement, owned by the producer, about the data they emit: schema, semantics, and service levels. It turns "the payments team changed a column" from a surprise into a reviewed, versioned change.

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

What makes a contract more than documentation is **enforcement in the producer's CI**: a schema registry compatibility check for events, a test that compares the service's output schema with the contract, and a rule that breaking changes (renames, removals, **unit changes**) require a new major version published alongside the old one while consumers migrate. The cents incident is exactly a semantic breaking change that a schema check alone would miss, which is why contracts carry units and meaning, not just types. The [outbox pattern](/learn/big-data/streaming/change-data-capture) pairs naturally with contracts: the outbox event is the contract, and internal tables are free to change.

## Write-audit-publish

Tests that run after data is published only tell you how long readers saw bad data. **Write-audit-publish** (WAP) reverses the order: write the new data somewhere readers cannot see it, audit it, and publish atomically only if the audit passes. Netflix engineers described this pattern publicly years ago, and Iceberg now supports it with **branches**:

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

If the audit fails, readers keep seeing yesterday's correct data, the branch is kept for debugging, and the incident is "the report is late" instead of "the report was wrong." That trade (stale but correct over fresh but wrong) is almost always the right one for financial and executive data, and it is worth saying explicitly in a design review. The cost is latency (checks run before publication) and some complexity in the orchestrator, which needs an audit step between write and publish.

## Lineage

**Lineage** is the graph of which datasets (and columns) are derived from which. It answers three questions that otherwise require archaeology:

- **Impact analysis**: "if the payments team changes `amount`, what breaks?" is a traversal **downstream** from `payments.amount`.
- **Root cause**: "why is this dashboard wrong?" is a traversal **upstream** to find which input changed.
- **Privacy**: "where does `email` end up?" is a downstream traversal at column level, which scopes access reviews and deletion.

```viz
{"type": "graph", "algorithm": "bfs", "directed": true, "start": "PAY",
 "nodes": [{"id": "PAY"}, {"id": "STG"}, {"id": "FCT"}, {"id": "DIM"}, {"id": "RPT"}, {"id": "EXP"}, {"id": "FEAT"}, {"id": "MDL"}, {"id": "WEB"}],
 "edges": [{"from": "PAY", "to": "STG"}, {"from": "STG", "to": "FCT"}, {"from": "DIM", "to": "FCT"}, {"from": "FCT", "to": "RPT"}, {"from": "FCT", "to": "EXP"}, {"from": "FCT", "to": "FEAT"}, {"from": "FEAT", "to": "MDL"}, {"from": "WEB", "to": "FEAT"}],
 "title": "Blast radius of a bad upstream change",
 "caption": "PAY: raw payments. STG: staging. FCT: payments fact. DIM: customer dimension. RPT: finance report. EXP: partner export. FEAT: churn features. MDL: churn model. WEB: web events. A breadth-first search downstream from PAY finds every dataset the cents bug reached; DIM and WEB are untouched because edges only lead into FCT and FEAT."}
```

Lineage is collected in two ways. **Static** lineage parses SQL (from dbt projects or warehouse query logs) to derive table- and column-level edges. **Runtime** lineage has jobs emit events describing their inputs and outputs as they run; OpenLineage is an open standard for this, with integrations for Spark, Airflow, dbt and Flink, and catalogues such as DataHub or Marquez store and display the graph. Netflix open-sourced Metacat, its metadata service that federates table metadata across its warehouse's stores, as one piece of this layer. Runtime lineage catches what static parsing misses (Python transformations, dynamically generated SQL); static lineage covers jobs that have not run yet. Mature platforms use both.

## Governance and privacy at scale

Governance is the set of controls over who may use which data for what, and how long it lives. The mechanisms that scale:

- **Classification.** Tag columns by sensitivity (`pii.email`, `pii.precise_location`, `financial`), automatically where possible (pattern scanners on samples) and verified by owners. Tags propagate along column lineage, so a derived table that contains `email` inherits the tag.
- **Policy-based access.** Grant access by tag and purpose rather than table by table: masking policies that show `email` only to roles with a need, row-level filters by region, and audit logs of who read what.
- **Pseudonymisation, done correctly.** A plain SHA-256 of an email address or phone number is not anonymous: the input space is small and structured, so a dictionary of candidate values reverses it. Use a keyed hash (HMAC with a secret held outside the warehouse) or a tokenisation service, and treat the output as still personal data under most privacy regimes.
- **Retention.** Every table gets a retention policy; raw event data with personal fields is typically the first candidate for a short one.

**Deletion** is the hardest governance requirement in an immutable lake. A user's erasure request must reach every table their data flowed into, which is a column-lineage traversal from the tables keyed by user, and each deletion must be physically real within a deadline measured in weeks. Rewriting a 500 TB table for each request is impossible, so platforms batch requests daily or weekly, apply them as row-level deletes (merge-on-read delete files in Iceberg), and rely on scheduled compaction and **snapshot expiry** to remove the underlying files, because time-travel snapshots otherwise keep the deleted rows readable. For append-only logs that cannot practically be rewritten (years of Kafka-archived events), **crypto-shredding** encrypts each user's personal fields with a per-user key and deletes the key on request, making the data unreadable everywhere at once.

## Data SLOs

Treat important datasets like services: define **service level objectives** and alert on them. For example: "`fct_payment` for day D is published by 06:00 UTC on 99% of days", "less than 0.1% of records quarantined", "daily total within 0.5% of the ledger". SLOs turn a vague sense of trust into numbers that can be reported, prioritised and improved, and they make the stale-but-correct trade of WAP an explicit, measured choice.

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

- You say data incidents are **silent** and design for detection before publication, not just alerting after it.
- You place checks **where problems enter** (producer contracts, ingestion validation, model tests, pre-publish audits) and decide which ones block.
- You use **robust statistics** (median and MAD, seasonal comparisons) for anomaly checks, and reconcile key metrics against an independent source.
- You push for **producer-owned contracts** that include units and semantics, enforced in the producer's CI, with versioned breaking changes.
- You use **write-audit-publish** for critical tables and state the trade-off: stale but correct beats fresh but wrong.
- You treat **lineage** as the tool for impact analysis, root cause and privacy scoping, and you know deletion in a lake needs row-level deletes, compaction, snapshot expiry, and crypto-shredding for logs.

## Check yourself

```quiz
- q: >-
    A producer changes an amount field from dollars to cents without changing its type. Which control is most likely to catch it before any consumer sees the data?
  options: ["A unit-aware producer contract plus a ledger reconciliation", "Column-level lineage from payments to the revenue mart", "A schema registry check for backward compatibility", "A not_null test on the amount column in staging"]
  answer: 0
  explanation: >-
    The schema is unchanged, so schema checks and null tests pass. A producer-owned contract that specifies units, enforced by a CI test where the change is made, plus a pre-publish reconciliation against the ledger's independent total, catches a unit change. Lineage helps measure the blast radius afterwards but does not detect it.
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

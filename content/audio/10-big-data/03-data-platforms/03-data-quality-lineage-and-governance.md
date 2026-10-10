---
lesson: data-quality-lineage-and-governance
source: 1a07b06d188e6cf4
fit: great
desk:
  - "The table of data-quality dimensions and their checks"
  - "The example contract, the registry compatibility modes and the three schema changes traced"
  - "The dbt test configuration and the block-versus-warn thresholds table"
  - "The write-audit-publish SQL on Iceberg branches, and the OpenLineage event"
  - "The blast-radius traversal and the deletion-methods comparison table"
  - "Exercise: flag anomalous daily row counts with median and MAD"
---
## Introduction

The payments team ships a change that records amounts in cents instead of dollars. Their service tests pass. The database accepts integers either way. The CDC pipeline, the staging models and the revenue mart all run green. Three days later, someone preparing a board deck notices that revenue for one region grew a hundredfold on Tuesday. Nothing failed. Every job succeeded. The data was wrong, and by then it had flowed into forecasts, a partner export, and the training set of a churn model.

That is what makes data incidents different from service incidents: they are silent. A broken service returns errors; a broken pipeline returns plausible numbers. So trust has to be engineered. Contracts with producers about what data means. Tests where problems enter, with a decision about whether to block. A publishing step that stops bad data before anyone reads it. Lineage that tells you where a problem spread. And governance that controls who sees what, and makes deletion real.

## What can be wrong

Most incidents fall into a few categories, each with its check. Freshness: compare the newest event time with a deadline. Volume: row counts against recent history, which catches missing partitions and doubled loads. Schema: renamed columns and changed types. Validity: negative durations, a country code of U K instead of G B. Uniqueness: count rows against distinct keys. Referential integrity: facts pointing at customers that do not exist.

And the last, the hardest and most damaging: distribution and semantics. Dollars become cents. The schema, the types and the nulls are all fine. Only a check that knows what the numbers should look like, or a reconciliation against an independent source, total payments against the ledger, catches it.

## Contracts and the registry

A data contract is an agreement, owned by the producer, about the data they emit: the schema, what each field means including units, and service levels like freshness. What makes it more than documentation is enforcement in the producer's CI, where a breaking change, a rename, a removal or a unit change, requires a new major version published alongside the old one while consumers migrate. The cents incident is a semantic breaking change that no schema check can see, which is exactly why contracts carry units.

For Kafka events, the structure is enforced by a schema registry. Each message starts with a small schema id. The producer registers its schema and gets the id back, and registration is where compatibility is checked. An incompatible schema is rejected before a single message is produced.

The modes are defined from the reader's side. Backward, the default, means a consumer on the new schema can read data written with the previous one, so consumers upgrade first. Forward means a consumer on the old schema can read new data, so producers upgrade first. Full means both. Transitive versions check against every earlier version, not just the latest. And none protects nobody.

So, the registry is in backward mode, and payments wants to add a required field with no default. What happens?

[pause]

Registration is rejected. A consumer on the new schema reading an old record finds no value and no default to fill in. Removing a field goes the other way: it passes backward, because a new reader simply ignores a field it does not have, and fails forward, because an old reader needs it. Add the field with a default and it passes in both directions. Changing a type from long to string fails both ways. A rename is a removal plus an addition. The rule of thumb: add fields with defaults, never remove or retype within a major version, and use backward transitive so a consumer replaying six months can read every version it meets. The wrong answer is "switch the subject to none for the deploy". The registry protects structure; only the contract protects meaning.

## Tests, and block versus warn

Put checks where problems enter. At the producer, through the contract: the cheapest place to stop a breaking change is the pull request that introduces it. At ingestion: route malformed records to a quarantine table with a reason, and count them; one in ten thousand is normal, 30 percent is an incident. After each transformation: assertions declared next to the model. And before publication: compare the new partition with history and with independent sources.

Each check needs a threshold and a decision: does it block, or warn? Block when someone acts on the numbers, finance, billing, a model retrain, and a stale but correct alternative exists. Warn when the check is new and still being calibrated, when the failing share is small and bounded, or when consumers need freshness more than exactness. And a warning nobody owns is a test that does not exist. The lesson's failure story: 0.3 percent duplicate payment ids for three weeks, discovered by finance, because the uniqueness test warned daily into a channel with no owner.

Static thresholds, row count above a million, break with growth and seasonality. Compare each value with its own history, using robust statistics. The mean and standard deviation are dragged by the outliers you want to catch: one day with zero rows inflates the standard deviation so much that the next bad day passes. The median and the median absolute deviation ignore a few outliers.

A tiny example. Daily counts in millions: 100, 102, 98, 101, 99. The median is 100, and the typical distance from it is 1. With a factor of 3, anything outside 97 to 103 is flagged. A day of 40 is flagged. After it, the median and that typical distance barely move, so a following day of 250 is flagged too. Compare within the same weekday when data is weekly, and check the check: one that never flags in 60 days is as suspicious as one that always does.

## Write, audit, publish

Tests that run after publication only tell you how long readers saw bad data. Write-audit-publish reverses the order. Write the new data somewhere readers cannot see it, audit it, and publish atomically only if the audit passes. Netflix engineers described the pattern publicly in 2017, and Iceberg supports it with branches: the job commits to an audit branch, checks run against the branch, and publishing is a fast-forward of main, a single metadata operation.

If the audit fails, readers of main keep seeing yesterday's correct data. Nothing is emptied or broken, and the incident becomes "the report is late" instead of "the report was wrong". Stale but correct over fresh but wrong is almost always the right trade for financial and executive data, and it is worth saying out loud in a design review. The cost is latency, and an audit step in the orchestrator.

Treat important datasets like services, with objectives: the payments fact for day D is published by 6 in the morning on 99 percent of days, under 0.1 percent of records quarantined, the daily total within half a percent of the ledger.

## Lineage and the blast radius

Lineage is the graph of which datasets and columns derive from which. It answers impact analysis, downstream from a changed column; root cause, upstream from a wrong dashboard; and privacy scoping, downstream from a column tagged personal.

Column level is what matters. Parse each model's SQL into edges from output columns to input columns. Table-level lineage says an active-customers report is downstream of the payments fact. Column-level lineage shows it only counts distinct customer keys and never reads the amount. A cents bug does not reach it. Static parsing misses Python jobs and generated SQL, so jobs also emit lineage as they run, through the OpenLineage standard, and mature platforms use both.

Now trace the cents deploy, breadth-first downstream from the raw amount column. Staging, from Tuesday on. The fact table's amount in dollars, for three daily runs. Then the finance report, the partner export, and a churn feature summing 30 days of spend, which stays wrong for a further 27 days. Then the churn model trained on Wednesday. Blast radius: six datasets, one model, and one external partner. Not affected: the customer dimension, the active-customers report, the web-event features. Table-level lineage would have paged a team with nothing to fix. And remediation is now a plan, not a search: fix the producer, backfill three partitions, then everything downstream in dependency order, resend the export, retrain the model.

## Privacy and deletion

Tag columns by sensitivity, and let the tags propagate along column lineage, so a derived table containing email inherits the tag without anyone remembering. Grant access by tag and purpose, with masking policies and audit logs.

Pseudonymisation needs care. A plain SHA-256 of an email is not anonymous. The input space is small and structured, so hashing candidate addresses and matching them reverses it. Use a keyed hash with a secret held outside the warehouse, or a tokenisation service, and still treat the output as personal data.

Deletion in an immutable lake. A request must reach every table the user flowed into, and be physically real within the GDPR deadline: a response within one month, extendable by two for complex cases. Say user 42 has four rows in three 256-megabyte Parquet files. Copy-on-write rewrites those three files: three quarters of a gigabyte for four rows. Cost follows the bytes in the touched files, not the rows deleted, so ten thousand requests a day over a 500-terabyte table would rewrite most of it daily. Nobody does that per request.

Merge-on-read writes small delete files instead. An equality delete, customer id equals 42, or ten thousand ids at once, makes a daily batch one small file per partition. The trade: every scan merges delete files, and scans get several times slower until compaction folds them in.

And the step everyone forgets. Both routes create a new snapshot, but the old snapshot still references the old files, and time travel can still read user 42 until snapshots expire and orphan files are removed. Running a DELETE and closing the ticket leaves the rows readable. Deletion is real only after compaction and expiry, so schedule them together and write down the deadline arithmetic. For archives and backups that cannot be rewritten, crypto-shredding: encrypt each user's personal fields with a per-user key, and delete the key. Every copy becomes unreadable at once, at the price of decryption on every read and a key store that is now your most sensitive system.

## In the interview

The lesson's question. How is a data contract different from a schema?

[pause]

A schema is structure. A contract adds semantics, units and meaning, plus service levels, ownership, enforcement in the producer's CI, and a versioning policy. The cents bug passes every schema check. "A contract is the Avro file" is the wrong answer.

And: a user requests deletion; you have 500 terabytes in Iceberg and two years of archives. Column lineage from the user-keyed tables gives the table list. Batched equality deletes daily. Compaction and snapshot expiry on a schedule, with the deadline arithmetic. Crypto-shredding for archives and backups. An audit query per table as proof. "Run a DELETE on each table" leaves the rows readable through time travel.

## Recap

Four things to remember. Data incidents are silent, so detect before publication: contracts with units, tests where problems enter, each one deliberately blocking or warning, with an owner. The registry protects structure and only the contract protects meaning; add fields with defaults and use backward transitive. Write-audit-publish trades freshness for correctness, and column-level lineage turns an incident into a dependency-ordered plan. And deletion in a lake is real only after delete files, compaction and snapshot expiry, or crypto-shredding where rewriting is impossible.

At your desk: the quality dimensions table, the contract and registry traces, the test thresholds, the write-audit-publish SQL, the lineage event and blast-radius table, the deletion comparison, and the median absolute deviation exercise.

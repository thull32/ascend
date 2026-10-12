---
lesson: data-quality-lineage-and-governance
source: c8251eb142e53858
---
## 1

A producer changes an amount field from dollars to cents, without changing its type. Which control is most likely to catch it before any consumer sees the data?

A, a unit-aware producer contract, plus a ledger reconciliation. B, column-level lineage from payments to the revenue mart. C, a schema registry check for backward compatibility. D, a not-null test on the amount column in staging.

[think]

The answer is A: a unit-aware producer contract, plus a ledger reconciliation.

The schema is unchanged, so schema checks and null tests pass. A producer-owned contract that specifies units, enforced by a CI test where the change is made, plus a pre-publish reconciliation against the ledger's independent total, catches a unit change. Lineage helps measure the blast radius afterwards, but does not detect it.

## 2

A schema registry subject is in backward compatibility mode, and the producer tries to register a schema that adds a required field with no default. What happens?

A, registration is rejected, because required fields are never allowed in Avro. B, registration succeeds, because old readers ignore unknown fields. C, registration succeeds, but consumers must be redeployed within a day. D, registration is rejected, because new readers could not read old records.

[think]

The answer is D: rejected, because new readers could not read old records.

Backward mode means a consumer on the new schema must be able to read data written with the previous one. Old records have no value for the new field and there is no default to fill in, so the check fails and the registry returns a conflict. The change would pass in forward mode, where the guarantee runs the other way. Adding the field with a default makes it compatible in both directions.

## 3

Why is a check based on the median and the median absolute deviation preferred over mean and standard deviation for daily row-count anomalies?

A, past outliers barely move it, so they cannot mask new ones. B, it needs no threshold, so it adapts to growth by itself. C, it fits normally distributed counts better than the mean does. D, it is faster to compute over long windows of history.

[think]

The answer is A: past outliers barely move it, so they cannot mask new ones.

A single bad day in the history window, say a day with zero rows, can inflate the standard deviation enough that the next bad day looks normal. The median and the median absolute deviation are barely affected by a few outliers, so they keep flagging. Both approaches still need a threshold.

## 4

In a write-audit-publish flow on Iceberg, the audit of today's partition fails. What do readers of the main branch see?

A, a read error on today's partition until it is fixed. B, an empty partition for today until the audit passes. C, the new data, flagged as unaudited until the audit passes. D, the last audited data, while the new data stays on the branch.

[think]

The answer is D: the last audited data, while the new data stays on the branch.

The write went to an audit branch that readers of main do not see, and the fast-forward that publishes it never ran. Readers keep the last published, audited snapshot. The incident becomes lateness rather than wrong numbers, and nothing on main is emptied or broken.

## 5

A team pseudonymises emails with SHA-256 before loading them into the warehouse, and declares the column non-personal. What is the problem?

A, SHA-256 is too slow to run over warehouse tables of this size. B, SHA-256 collisions will merge different users' rows. C, guessable emails can be hashed and matched, which reverses it. D, hashed values can no longer be joined to other tables by email.

[think]

The answer is C: guessable emails can be hashed and matched, which reverses it.

An unkeyed hash of a low-entropy, structured identifier is reversible by a dictionary attack: hash candidate addresses and match them. A keyed hash, or tokenisation with a secret held elsewhere, prevents that, but the output is still pseudonymous personal data, not anonymous data. Collisions in SHA-256 are not a practical concern.

## 6

A user's deletion request is applied to an Iceberg table with a DELETE, but the user's rows can still be read a month later. What was missed?

A, Iceberg ignores row-level deletes on partitioned tables. B, old snapshots still reference the files until they expire. C, the delete needed a filter on the user's partition. D, the table must be converted to Delta Lake to honour deletes.

[think]

The answer is B: old snapshots still reference the files until they expire.

Row-level deletes create a new snapshot, but time travel to older snapshots still reads the old files. Deletion is only real once compaction writes files without the rows, and the snapshots referencing the old files are expired and cleaned up. Iceberg supports deletes fine; the current snapshot no longer shows the rows.

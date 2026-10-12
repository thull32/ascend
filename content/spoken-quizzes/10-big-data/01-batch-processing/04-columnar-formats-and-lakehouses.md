---
lesson: columnar-formats-and-lakehouses
source: ff4a9415726584f2
---
## 1

A 2 terabyte Parquet table is filtered on a user id equal to 12345. The reads touch almost every row group, even though only 30 rows match. What is the most likely reason, and the fix?

A, Snappy compression blocks predicate pushdown; use zstd. B, Parquet cannot prune on integer columns; convert to ORC. C, user id is unclustered; sort on it or add a Bloom filter. D, the query lacks a limit, so every row group is scanned.

[think]

The answer is C: user id is unclustered; sort on it or add a Bloom filter.

Min and max pruning only works when a row group's range can exclude the value. Random user ids give every row group a range spanning almost all ids, so every range contains 12345. Clustering by user id narrows the ranges, and a Bloom filter answers point lookups directly. Compression and file format are not the problem.

## 2

Two Spark jobs commit to the same Iceberg table at the same moment. What happens?

A, the table stays locked until an administrator releases it. B, one pointer swap wins, and the other rebases, retries, or fails. C, the later commit silently overwrites the earlier one's files. D, both succeed, and the catalog merges their metadata files.

[think]

The answer is B: one pointer swap wins, and the other rebases, retries, or fails.

Iceberg uses optimistic concurrency. The catalog swaps the metadata pointer only if it still points at the version the writer started from. The loser re-reads the new base and retries if the changes do not conflict, or fails on a real conflict. Nothing is silently lost, the catalog never merges metadata, and there is no global lock.

## 3

An Iceberg table is partitioned by the day of its event timestamp. Why do queries not need to filter on a separate event date column?

A, hidden partitioning disables pruning, so filters do not matter. B, the partition spec derives the day partitions from the event timestamp itself. C, Iceberg stores exactly one data file for each day. D, Iceberg sorts every data file by the event timestamp on write.

[think]

The answer is B: the partition spec derives the day partitions from the event timestamp itself.

Hidden partitioning keeps the transform in the table's partition spec, so the planner turns a range predicate on the timestamp into a range of day partitions. With Hive-style partitioning, the query must name the derived partition column, or it scans everything. Pruning still happens; it just no longer depends on the query naming a date column.

## 4

A GDPR process deletes a user's rows with a DELETE on a merge-on-read Iceberg table. When are the user's bytes actually gone from storage?

A, immediately, as soon as the delete transaction commits. B, never, because Parquet data files are immutable. C, after the next schema change rewrites the data files. D, after compaction, and expiry of the older snapshots.

[think]

The answer is D: after compaction, and expiry of the older snapshots.

The delete commit only adds delete files. The original data files still exist, and older snapshots still reference them for time travel. Compaction produces files without the rows, and snapshot expiry removes the old files; privacy deletion needs both. Immutability means files are replaced, not that bytes can never be removed.

## 5

A streaming job commits a new Iceberg snapshot every 10 seconds, with 64 small files each time. After a month, queries are slow to plan and to run. What is the root cause?

A, the catalog's pointer swap is too slow at this commit rate. B, small files and snapshots piled up without maintenance. C, each file's Parquet footer has grown too large to read. D, Iceberg is not designed to accept streaming writes.

[think]

The answer is B: small files and snapshots piled up without maintenance.

64 files every 10 seconds is over 16 million files a month, plus a snapshot and manifests for every commit. Planning and reading both scale with this debris. Scheduled compaction, manifest rewrites and snapshot expiry keep the table healthy; the format itself supports streaming writes.

## 6

A reader on S3 answers a one-hour range query over a 512 megabyte Parquet file, sorted by event timestamp, using about six requests and 2 megabytes of data. Which two structures made that possible?

A, the footer's row-group statistics, and the page index. B, the Iceberg manifest list, and the catalog pointer. C, the dictionary pages, and a Bloom filter on the timestamp. D, Snappy compression, and the 128 megabyte row-group size.

[think]

The answer is A: the footer's row-group statistics, and the page index.

The footer's per-chunk min and max let the reader skip three of the four row groups without reading them. Then the column and offset indexes narrowed the remaining chunk to the pages covering the hour, giving exact byte ranges for ranged reads. Bloom filters serve equality on unclustered columns, compression changes bytes but not requests, and table-format metadata prunes files, not bytes within one.

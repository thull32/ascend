---
lesson: columnar-formats-and-lakehouses
source: 44aaa4472c32f198
fit: great
desk:
  - "The Parquet layout diagram and the row group worked out in bytes, per encoding"
  - "Nested data: definition and repetition levels"
  - "The Iceberg metadata tree, the commit trace and the Iceberg, Delta and Hudi table"
  - "Exercise: min and max pruning of row groups"
---
## Introduction

An analyst asks for total watch hours by country for May. The events table has 60 columns and about 50 billion rows a year, roughly 400 bytes a row. Stored row by row, as CSV, JSON or Avro, the query must read every byte of every row in May, about 1.7 terabytes, to use three of the sixty columns. Stored in a columnar format and partitioned by day, it reads three compressed columns for 31 days: on the order of 20 gigabytes. Same data, same answer, about 80 times fewer bytes. And on object storage, bytes read is time and money.

That is half the story. The other half is what goes wrong once you have millions of those files in S3 and call a directory of them a table. Readers see half-written data. Planning a query means listing a hundred thousand directories. Two writers corrupt each other. Renaming a column silently breaks old files. Table formats, Apache Iceberg, which began at Netflix, plus Delta Lake and Apache Hudi, fix that with a metadata layer and atomic commits. Open columnar files, a table format and object storage together are what people mean by a lakehouse.

Three ideas, then. How a reader skips almost all of a file. Why sort order decides whether that skipping works. And how a table format turns a pile of files into a table.

## Rows versus columns

A row-oriented file stores each record's fields together, then the next record. That is ideal for writing one event or reading a whole record. A column-oriented file stores all the timestamps together, then all the user ids, and so on. Three things follow.

First, column pruning: a query that touches three of sixty columns reads roughly three sixtieths of the bytes. Second, better compression, because a column holds one type with similar values. Third, vectorised execution: an engine can process a batch of about 4 thousand values of one column in a tight loop, instead of interpreting one row at a time. The OLAP lesson builds on that.

The encodings are worth knowing by name, because they explain why sort order matters. Dictionary encoding stores each distinct value once and a small id per row: a country column with about 190 values costs one byte a row instead of about ten. Run-length encoding stores a value and how many times it repeats: a million sorted country ids collapse to about 190 runs. Delta encoding stores the differences between consecutive values, so sorted timestamps become tiny numbers that pack into a few bits. Put together, a sorted or clustered column often shrinks 10 to 50 times. The same column in random order may shrink three times.

## Inside a Parquet file

A Parquet file is divided into row groups, about 128 megabytes each by default. Inside a row group, each column is stored contiguously as a column chunk, split into pages of about a megabyte. At the very end of the file sits the footer: the schema, and for every column chunk its byte offset and its statistics, the minimum, the maximum and the null count. Optional page indexes keep a minimum and maximum per page, and optional Bloom filters answer one question per chunk: is this exact value definitely absent?

Now watch a reader use all of that. The query sums durations where country is Brazil and the timestamp is between ten and eleven in the morning. The file is 512 megabytes on S3, with four row groups, and it was written sorted by timestamp.

The reader first asks for the last 8 bytes, which give the footer's length. Then it fetches the footer, about 100 kilobytes. Now it knows every chunk's offset and range. The four row groups cover midnight to about six, six to about noon, noon to about half past six, and the rest of the evening. Only the second can contain ten to eleven, so three row groups are skipped without being read. Within that row group, it needs three of sixty column chunks. Within the timestamp chunk, the page index says only pages three and four of twelve cover that hour. Three or four ranged reads fetch about 2 megabytes. Five or six requests, 2 megabytes moved, out of 512.

Now the question. Take the same rows, shuffle them into random order, and write the same 512-megabyte file. What does the reader fetch for the same query?

[pause]

Every row group now spans the whole day, so row-group pruning skips nothing, and the page index skips nothing. The reader fetches all three column chunks from all four row groups: about 20 megabytes, ten times more. Same query, same file size, different physical order.

## Sort order decides pushdown

Comparing a filter with each row group's minimum and maximum, and skipping the ones that cannot match, is called predicate pushdown, or min-max pruning. It is only as good as the data's clustering. Written in event-time order, each row group covers a narrow slice of time, and a one-hour filter over a month touches about one seven-hundred-and-twentieth of the row groups. In random order, every row group's minimum is near the start of the month and its maximum near the end, and everything might match.

That is why writers sort within partitions by the columns most often filtered on. When there are two or three such columns, Z-ordering interleaves the bits of all of them into one sort key. It trades perfect locality on one column for decent locality on several.

Min and max cannot help everywhere. A lookup for one specific user id, on a high-cardinality column that is not clustered, falls inside every row group's range. That is what the Bloom filters are for: a negative answer is certain, so the chunk is skipped.

ORC, the other common format, has the same shape under different names: stripes of 64 megabytes instead of row groups, and an index entry every 10 thousand rows. Both are fine; the engines on your platform decide.

## From directories to Iceberg

The first data lakes, including Netflix's Hive warehouse on S3, defined a table as a directory tree, with one subdirectory per date and the files inside it whatever a listing returned. That design has five chronic problems. No atomic commits: a job writing 500 files is visible file by file, and a failed job leaves debris. Listing is planning: a hundred thousand partitions means a hundred thousand or more list requests before reading a byte. No isolation: two jobs overwriting a partition can leave a mix of both. Partitioning leaks into queries: forget to filter on the derived date column and you scan the whole table. And schema evolution is fragile: rename a column and old files read it as null, or worse, as another column's data.

Iceberg replaces "the files in these directories" with an explicit, versioned tree of metadata. Data files are ordinary Parquet, never modified after writing. Manifests list data files with their partition values and column statistics. A manifest list names the manifests in one snapshot. A metadata file holds the schema, the partition spec and the list of snapshots. And the catalog stores one thing per table: a pointer to the current metadata file.

A commit, then. The table is at version 42. A job writes 200 new data files, a manifest listing them, a manifest list naming the new manifest plus all the old ones, and metadata version 43. Finally it asks the catalog to swap the pointer from 42 to 43, only if it still says 42. That compare-and-swap is the only step that needs atomicity.

Meanwhile a second writer, also starting from 42, has rewritten file 17 to delete some rows. Its swap fails, because the pointer now says 43. It re-reads 43, checks that the files it rewrote are still there and unchanged, which they are because the first commit only appended, and swaps to 44. Had the first commit compacted file 17 away, the check would fail and the second writer would report a conflict instead of silently deleting rows from a file that no longer exists. This is optimistic concurrency. It works well when commits are rare relative to how long they take. Hundreds of streaming writers committing every few seconds to one table will spend their time retrying.

What falls out of the design: readers pin one snapshot and see exactly its files, which also gives you time travel. Planning reads a few metadata files instead of listing directories. Partitioning is hidden: the spec says days of the timestamp, queries filter on the timestamp itself, and the spec can change from days to hours without rewriting old data. And every column has a permanent id, so renames and drops are safe metadata changes.

Delta Lake reaches the same place with a different shape: a log of numbered commit files, each listing files added and removed, a checkpoint every tenth commit, and a commit that succeeds by creating the next numbered file only if it does not exist. Pick between the formats by the engines you need and the write pattern, not by benchmark claims.

## Deletes and maintenance

Files are immutable, so a delete has two strategies. Copy-on-write rewrites every file that contains an affected row: reads stay fast, but a one-row delete rewrites a whole 512-megabyte file. Merge-on-read writes small delete files that mark rows as removed, and readers apply them at query time: writes are cheap, and reads slow down as delete files pile up. Sequence numbers on each snapshot make sure a delete never removes rows appended after it. Use copy-on-write for rare, large batch updates, and merge-on-read for frequent small ones, like change-data-capture upserts or privacy deletions.

Either way, the table needs maintenance: compaction of small files, expiry of old snapshots, and removal of orphaned files from failed writes. Skip it and the table decays. A streaming job that commits every 10 seconds with 64 files each time makes over 16 million small files a month, and queries spend a minute just planning.

## In the interview

Here is a follow-up the lesson expects. How do you delete one user's rows from a petabyte lake, for a privacy request?

[pause]

A merge-on-read delete to record it, then compaction to rewrite the affected files without those rows, then snapshot expiry to drop the old versions, with a retention window shorter than your deletion deadline. Until the old snapshots expire, time travel can still read the user's rows. The wrong answer is "run delete from, and it's gone": the delete only added delete files.

And a quick one: why not just gzip the CSV? Because gzip is not splittable, so one file is one task, and there is no column pruning, no types, no statistics, and parsing text costs more CPU than decoding packed integers. The compression ratio is not the point; the access pattern is.

## Recap

Four things to remember. Estimate a query in bytes read after pruning: columns touched, partitions matched, row groups and pages skipped. Sort order decides whether statistics prune anything, so sort or Z-order at write time, and use Bloom filters for point lookups on unclustered columns. A directory is not a table: a table format gives you atomic commits through one compare-and-swap of a metadata pointer, snapshots, hidden partitioning and safe schema changes, with optimistic concurrency that punishes many frequent writers. And a delete is not gone until compaction and snapshot expiry, so maintenance is part of the table.

At your desk: the Parquet layout in bytes, the nested-data levels, the Iceberg metadata tree and commit trace, and the row-group pruning exercise.

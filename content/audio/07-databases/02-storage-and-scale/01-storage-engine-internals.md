---
lesson: storage-engine-internals
source: 3f3108f5d92aa775
fit: great
desk:
  - "The page layout diagram and the rows-per-page formula"
  - "The pg_buffercache query showing the 32-buffer ring"
  - "The checkpoint settings table and the commit sequence diagram"
  - "Exercise: how many rows fit on a heap page"
---
## Introduction

A query that touches 12 thousand pages takes 8 milliseconds one minute and 53 the next, with the same plan. A single-row update right after a checkpoint writes 33 kilobytes of log instead of 300 bytes. A machine loses power mid-transaction and comes back with every committed row intact and every uncommitted row gone.

None of that is explained by SQL. It is explained by the storage engine: the layer that turns rows into bytes on disk, decides which bytes stay in memory, and orders its writes so that a crash at any instant is recoverable.

Four mechanisms are enough to reason about it: the page, the buffer pool, the write-ahead log, and the checkpoint. Each one comes with a measured cost, taken on Postgres 17 with tables of 2 million orders and 4 million order lines, and contrasted along the way with how InnoDB, MySQL's engine, makes the opposite choices.

## Pages, the unit of everything

Postgres stores a table as a heap file: a sequence of 8 kilobyte pages, with no ordering between rows. Every read is a whole page, every buffer is a page, and the cost of a query is roughly the number of pages it touches.

A page has three regions. A 24-byte header at the front. Then an array of line pointers, 4 bytes each, growing forwards. And the rows themselves, called tuples, growing backwards from the end of the page, with free space in between.

The orders table fits 120 rows to a page. Each tuple is 64 bytes: a 24-byte tuple header, 36 bytes of data, padded to an 8-byte boundary. Add the 4-byte line pointer and 120 rows fill the page with 8 bytes to spare. Two million rows need 16,667 pages, which is exactly what Postgres reports. Leave 10 percent free for future updates, with a fillfactor of 90, and the arithmetic predicts 108 rows a page and 18,519 pages. A copy of the table built that way measured exactly 18,519.

The line pointers matter because a row's physical address is its page and its slot number, not a byte offset. Indexes point at that address. So vacuum can compact a page, moving tuples around inside it, without touching a single index.

One more rule: a tuple cannot span pages. A row wider than about 2 kilobytes, a quarter of a page, has its large values compressed, and if they are still too big, moved into a separate TOAST table in chunks, leaving a small pointer behind.

Here is what that costs. A table of 20 thousand documents, each with a body of about 10 kilobytes that does not compress. Summing the length of the titles took 1.3 milliseconds and touched 148 buffers. Summing the length of the bodies took 457 milliseconds and touched over 80 thousand. Same table, about 340 times the cost. That is why select star on a table with a large text or JSON column is so much slower than selecting the three columns you need, with the very same plan.

## Heap versus clustered

InnoDB makes the opposite layout choice. The table is its primary-key B-tree: the leaf pages, 16 kilobytes by default, hold the full rows in primary-key order. A secondary index stores the indexed columns plus the primary key, not a physical address.

Trace a lookup by a secondary column on a 100-million-row table, where each tree is three or four levels deep. In Postgres: descend the secondary index, about 4 pages, then follow the address to one heap page. About 5 pages. In InnoDB: descend the secondary index, about 4 pages, take the primary key out of the entry, then descend the clustered index, about 4 more. About 8.

Since the upper levels are cached in both engines, the real difference is one heap page against one leaf page, plus some CPU. The structural consequences matter more.

A primary-key range scan in InnoDB reads contiguous leaf pages; in Postgres the rows are scattered across the heap unless the table was recently reordered. A wide primary key in InnoDB is copied into every secondary index. And random primary keys, like version 4 UUIDs, hurt only the primary-key index in Postgres, but in InnoDB they hurt the whole table, because rows land in random leaves, which split.

That is why MySQL schemas care so much about short, ascending primary keys, and why a Postgres table's physical order drifts away from any index over time.

## The buffer pool

Every page read goes through the buffer pool, called shared buffers in Postgres. A hit costs a hash lookup and a pin, well under a microsecond. A miss costs a read system call, which the operating system may serve from its own page cache, or from the device.

Here is the experiment behind the opening number. A scan touching 12,261 pages, with none of them in the buffer pool but all of them in the operating system's cache, took 52.7 milliseconds. Run again immediately, all hits, it took 8.3. That is about 3.6 microseconds extra per page for the system call and copy.

Now, before I say it: what if those pages had come from an NVMe drive, at roughly 100 microseconds per random read?

[pause]

Over a second. From network block storage, several seconds. Same plan, same page count, three orders of magnitude of latency. So the three numbers to carry are well under a microsecond for a buffer hit, a few microseconds from the operating system's cache, and about 100 from the drive.

Notice that Postgres caches twice. Shared buffers sit above the kernel's page cache instead of replacing it, which is why the convention is about 25 percent of memory for shared buffers: the other 75 percent is doing useful work as operating system cache. InnoDB normally bypasses the operating system's cache, and the MySQL manual suggests up to 80 percent of a dedicated server's memory for its buffer pool. Size them the same way and you get one of them wrong.

Eviction is a clock sweep, an approximation of LRU without a global lock. Each buffer has a usage count, raised on access and capped at 5. A clock hand walks the buffers, decrementing counts, and evicts the first unpinned one it finds at zero.

And a large sequential scan does not flush the pool. A scan of a table bigger than a quarter of shared buffers uses a private ring of 32 buffers, 256 kilobytes, and recycles it. After counting every row of the 224 megabyte order lines table, exactly 32 of its pages were left in the pool. So a nightly report that scans a big table does not wipe out your working set. A report that walks a big index does, because index scans do not use the ring.

If the buffer chosen for eviction is dirty, it must be written first, and a query that has to do that itself stalls on a write it did not cause.

## The write-ahead log

The durability problem. A transaction changes three rows on three pages. Writing those pages at commit means three random writes, and a power cut after the second leaves a half-applied transaction with no record of the third.

The write-ahead log replaces that with one rule: before a modified page reaches disk, the log record describing the change must be on disk. Commit becomes "append a commit record and flush the log". The pages themselves can stay dirty in memory for minutes.

Every log record has a log sequence number, an LSN: a byte position in the log. Every page header stores the LSN of the last record that changed it. That is how the buffer manager enforces the rule, flushing the log up to the page's LSN before writing the page. It is how recovery decides what to replay. And it is the unit of replication: a replica is at an LSN, and lag is a difference of LSNs.

A simple money transfer writes about 296 bytes of log. The flush at commit cost about 1.4 milliseconds on the lab's disk, and group commit shares it: with 16 concurrent clients, each flush carried about 8 commits.

Now the surprise from the opening. An 8 kilobyte page write is not atomic on most devices. Power can fail halfway, leaving a torn page that a small log record cannot repair. So the first change to each page after a checkpoint logs the whole page. These are full-page writes.

The cost is large. Updating about 10 thousand random rows of a million-row table, right after a checkpoint, wrote 56 megabytes of log. The same update again, with no checkpoint in between, wrote 2.3. Twenty-four times the log for the same logical change, because the rows were spread across about 4 thousand heap pages plus their index pages, each needing an image. Turning on WAL compression brought the first run down to 13 megabytes, for a little CPU.

Log-structured engines like RocksDB and Cassandra invert all of this. There, the log and the sorted files written from it are the database, and compaction rewrites data in the background. They win on sustained writes and SSD endurance; B-trees win on point reads and range scans that must be fast the first time.

## Checkpoints and crash recovery

The log cannot grow forever, and recovery cannot replay a week of it. A checkpoint writes every dirty buffer to disk and records the position recovery would have to start from: the REDO point.

Checkpoints start every 5 minutes, or when 1 gigabyte of log has piled up since the last one, and the writes are spread over 90 percent of the interval to avoid an I/O spike. Because of that spreading, the REDO point can sit well behind the checkpoint record. In the lab snapshot it was 477 megabytes behind.

So the checkpoint interval is a trade-off with three sides. Short intervals mean many full-page images and quick recovery. Long ones, say 30 minutes and 16 gigabytes, mean few images and smooth I/O, but recovery may replay many gigabytes and take minutes. And if most of your checkpoints are being forced early by the log size limit, raise that limit, or every early checkpoint starts a new wave of page images.

Recovery itself, after a power cut. Read the REDO location, then replay every record from there to the end of valid log, in order. If a record carries a full-page image, restore it. Otherwise compare the page's LSN with the record's: if the page is already at or past it, skip; if not, apply the change. Stop at the first record that is incomplete or fails its checksum. That is the torn end of the log, and nothing after it was ever acknowledged.

Transactions without a commit record are never undone. Their rows are simply invisible to every reader, and vacuum removes them later. Postgres has no undo phase. InnoDB, which updates in place, must roll uncommitted changes back from its undo log after redo.

Recovery time is proportional to the log since the REDO point, at a speed set by how many replayed pages must be read from disk. A full-page image needs no read. A small change to an uncached page needs one random read, about 100 microseconds. That is what the checkpoint settings really control: not durability, which the commit flush already gave you, but log volume against recovery time.

## In the interview

A classic follow-up. Why does commit not write the table?

[pause]

Because durability comes from flushing the write-ahead log: one sequential write that group commit shares between transactions. The dirty pages are written later by checkpoints, and after a crash they can be rebuilt from the log. The wrong answer is "Postgres writes the rows and then the log", which inverts the rule.

And a second. You see WAL volume spike every few minutes. Why? Full-page writes: the first change to each page after a checkpoint logs a whole image of it, so torn pages can be repaired. The lab saw 56 megabytes against 2.3 for the same updates. Do not say the checkpoint itself writes to the log; the checkpoint record is tiny. The levers are a larger maximum log size and WAL compression.

## Recap

Five things to remember. Cost is pages touched, and where they came from: a buffer hit is under a microsecond, the operating system's cache a few microseconds, the drive about 100. Postgres keeps rows in an unordered heap and points at them; InnoDB keeps them in the primary-key tree, which is why its primary keys should be short and ascending. Big sequential scans use a 256 kilobyte ring and do not flush the pool, but index-driven reports do. Commit is a log flush, and the first touch of a page after a checkpoint logs the whole page. And checkpoints trade log volume against recovery time, not durability.

At your desk: the page layout and the rows-per-page formula, the buffer cache query showing the ring, the checkpoint settings table and the commit sequence diagram, and the heap page exercise.

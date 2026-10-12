---
lesson: storage-engine-internals
source: a4de54c470b211f0
---
## 1

A query touching about 12 thousand pages takes 52.7 milliseconds when none of them are in shared buffers, and 8.3 milliseconds when all of them are hits, with the same plan. What accounts for the difference?

A, planning ran again on the first execution, but was cached for the second. B, the first run's read calls were served from the operating system's page cache. C, the first run had to set hint bits on every page, which forced writes to disk. D, the second run used an index-only scan once the visibility map was loaded.

[think]

The answer is B: the first run's reads were served from the operating system's page cache.

Every miss in shared buffers costs a system call and a copy, about 3.6 microseconds per page here, because the operating system still had the pages cached. From an NVMe drive it would be around 100 microseconds each, and the query would take over a second. Planning takes well under a millisecond, and the plan and page count were identical.

## 2

Why does Postgres log the whole 8 kilobyte page the first time it is modified after a checkpoint?

A, the buffer pool does not track which bytes of a page changed since the last read. B, a crash can tear a page write, and a small redo record cannot repair a torn page. C, full images compress better than deltas, so the write-ahead log ends up smaller overall. D, replicas can only apply whole pages, never byte-level changes from the primary.

[think]

The answer is B: a crash can tear a page write, and a small redo record cannot repair it.

Devices do not guarantee atomic 8 kilobyte writes. If a crash tears a page, recovery restores the logged image and then replays the later deltas on top. The cost is real: 56 megabytes of log against 2.3 for the same updates without a checkpoint just before them. Replicas apply the same records recovery does, deltas included.

## 3

A count of every row reads all of the roughly 29 thousand pages of a 224 megabyte table. Afterwards, the buffer cache shows only 32 of its pages cached. Why?

A, the clock sweep evicted the pages at once, because each had a usage count of zero. B, the table's values are stored out of line, so only its pointer pages are kept in shared buffers. C, the scan ran in parallel workers, and their buffers are freed when they exit. D, big sequential scans use a 32-buffer ring, to protect the working set.

[think]

The answer is D: big sequential scans use a 32-buffer ring.

A sequential scan of a table larger than a quarter of shared buffers uses a private ring of 256 kilobytes and recycles it, so a one-off scan cannot evict everyone else's hot pages. Index scans do not use the ring. The table had no large values, and parallelism was not involved.

## 4

On a write-heavy database, you raise the checkpoint timeout from 5 minutes to 60, and the maximum log size to match. What should you expect?

A, fewer full-page images and smoother disk writes, but longer crash recovery. B, a lower buffer hit ratio, because dirty pages crowd out clean ones. C, more write-ahead log, because each page is logged in full more often than before. D, commits become less durable, because pages reach disk less often.

[think]

The answer is A: fewer full-page images and smoother disk writes, but longer crash recovery.

Durability comes from the log flush at commit, not from checkpoints. Fewer checkpoints mean fewer first-touch page images and less bursty disk writes. But recovery must replay everything since the last checkpoint's redo point, which can now be many gigabytes. The hit ratio is unaffected.

## 5

A lookup through a secondary index returns one row from a 100 million row table. Which statement compares Postgres and InnoDB correctly?

A, Postgres reads the index, then one heap page; InnoDB descends a second B-tree. B, InnoDB reads fewer pages, since its secondary index entries contain full rows. C, Postgres must descend the primary-key index as well, since it holds the rows. D, both engines read the same pages, since secondary indexes store heap addresses.

[think]

The answer is A: Postgres reads the index then one heap page, and InnoDB descends a second B-tree.

Postgres index entries hold a tuple pointer to a heap page. InnoDB secondary entries hold the primary key, so the lookup continues through the clustered primary-key B-tree to the leaf that holds the row. InnoDB secondary indexes do not hold full rows, and Postgres heaps are not organised by primary key.

## 6

After a crash, how does Postgres decide whether a write-ahead log record still needs to be applied to a page?

A, it reads the checkpoint record, which lists every flushed page. B, it checks the commit log, and replays only committed transactions' records. C, it replays every record unconditionally, since redo is idempotent. D, it compares the page's LSN with the record's, and skips the record if the page is newer.

[think]

The answer is D: it compares the page's LSN with the record's.

Each page header stores the LSN of the last record applied to it. If the page on disk already reflects the record, its LSN is at or beyond the record's, and the record is skipped. Records from uncommitted transactions are replayed too; multiversioning makes their tuples invisible. The checkpoint record holds the redo position, not a list of pages.

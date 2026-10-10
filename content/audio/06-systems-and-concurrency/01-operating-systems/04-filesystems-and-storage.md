---
lesson: filesystems-and-storage
source: 948317c3fe962ffd
fit: great
desk:
  - "The atomic replace code, and its crash-point table"
  - "The inode listing, iostat output and the ext4 journaling modes table"
  - "The SSD versus disk and RAID comparison tables"
  - "Exercises: count the block reads to reach a byte, and size a RAID array"
---
## Introduction

Your service keeps its state in a small JSON file. On every change it opens the file, truncating it, writes the new contents and closes it. It has worked for two years. Then a host loses power, and when it comes back the file exists, has the right name, and is zero bytes long. The write returned success. The close returned success. The data was never on disk.

The gap between "the call succeeded" and "the bytes survive a crash" is where filesystems live, and it is wider than most engineers assume. Closing it takes about ten lines of code. Knowing why those lines are needed is what lets you reason about databases, logs and queues instead of trusting them.

Four ideas: names are not files, a write only reaches memory, what fsync does and does not promise, and what the hardware underneath changes. The numbers come from ext4 under WSL2, a virtual machine whose disk is a file on the Windows host.

## Names are not files

A disk presents itself to the kernel as an array of numbered blocks. It has no idea what a file is. The filesystem builds files on top.

Every file is an inode: a fixed-size record holding the type, permissions, owner, size, timestamps, a link count, and the map of where the data lives. The inode has a number but no name. Names live in directories, which are just files mapping names to inode numbers. Two names for one inode is a hard link.

Separating names from files explains three behaviours that otherwise look like bugs.

Deleting a file removes a name. The inode and its blocks are freed only when no names remain and no process has it open. So a log deleted by a rotation script while the service still writes to it keeps consuming space invisibly. The disk-free command says the disk is full, and disk-usage cannot find the space, because disk-usage walks names and the file has none. The command lsof with plus L1 lists open files with no links.

Rename within one filesystem is atomic. Other processes see the old file or the new one under that name, never neither, never a mix. Every safe file-replacement scheme rests on it.

And inodes can run out. ext4 fixes their number when the filesystem is created, one per 16 kibibytes of space by default. Millions of tiny files, like sessions or cache entries, can exhaust them with blocks to spare, and writes fail with "no space left on device" while the disk looks half empty.

## The page cache

A write does not write to disk. It copies your bytes into the page cache, marks those pages dirty, and returns: about 2 microseconds for a 4 kibibyte append. Kernel threads write dirty pages out later, when they are older than 30 seconds, or when dirty memory passes 10 percent of available memory.

That buffering hides two surprises. First, writes can suddenly block. When dirty memory reaches 20 percent, the kernel throttles every writing process inside its write call until the flushers catch up. A service that logs heavily to a slow volume sees normally instant writes take hundreds of milliseconds, and the stall shows up in request latency, not in any disk metric the service owns.

Second, nothing is durable until it is flushed. If power fails, every dirty page is gone. And ext4 delays even choosing disk blocks for new data until write-back. That is the opening incident: truncating freed the old blocks as a metadata change committed within seconds, while the new data had no blocks yet.

## What fsync promises

fsync writes the file's dirty data and metadata to the device and then asks the device to flush its own volatile cache. When it returns successfully, the file's contents are on stable storage. Its cousin fdatasync skips metadata that isn't needed to read the data back, like the modification time.

Here is what neither does. Neither makes the file's name durable: a new or renamed file's name is an entry in its directory, which is a different file, so you must fsync the directory too. Close does not call fsync; dirty pages stay dirty. And a successful write promises only that the kernel has your bytes.

The cost, measured. An append with no sync: about 2 microseconds. An append with fsync: about 4.3 milliseconds. Durability costs three orders of magnitude.

Here is a surprise from the same measurement. fdatasync on an append was no faster than fsync. Before I tell you why: what metadata does an append change that you need to read the data back?

[pause]

The file size. An append changes the size, so ext4 must commit a journal transaction either way. Overwriting blocks that were already allocated needs no metadata at all, just the data write and one flush: 2 milliseconds, half the time. That is why write-ahead logs preallocate their segment files.

On real hardware, a spinning disk takes milliseconds per flush. A consumer NVMe drive without power-loss protection, hundreds of microseconds to milliseconds. An enterprise SSD whose capacitors guarantee its cache, tens of microseconds.

Now the recipe for replacing a file atomically and durably. Write a temporary file in the same directory. Fsync it. Rename it over the target. Fsync the directory. Walk the crash points. Crash during the writes, or before the rename: the old contents, untouched. Crash after the rename but before the directory fsync: old or new, never a mix. After the directory fsync: new. And if you skip the first fsync and crash after the rename, you can get an empty or partial file, because the name can reach disk before the data. ext4 added a heuristic in 2009 to narrow that window, but it does not close it. The full recipe cost 15 milliseconds per replacement on this machine, so batch updates into one replacement.

## Group commit, and when fsync fails

One fsync per record caps you at one over the flush latency. With 100-byte records and a flush after every record: 237 records a second. A flush every 10 records: about 2,300. Every 100: about 20 thousand. Every 1,000: about 180 thousand. Almost linear, because a flush costs the same whether it carries 100 bytes or 100 kilobytes. Databases call this group commit: transactions that arrive during one flush wait and share the next.

And a warning. An fsync error means data may be lost. In 2018, PostgreSQL developers found, in what became known as fsyncgate, that when write-back fails on Linux the kernel reports the error once and may mark the pages clean. A retried fsync then succeeds, although the data never reached the disk. PostgreSQL's fix was to treat an fsync failure as fatal and recover from its write-ahead log. Code that retries and carries on can silently lose writes.

Platforms differ too. On macOS, fsync does not force the drive to flush its cache; a separate full-sync call does.

## Journaling

Appending one block changes the free-block bitmap, the inode's size and block map, and the data block itself. The device may persist those in any order, and power can fail between any two. Before journaling, the only remedy was a full scan at boot that took hours on large disks.

A journal is a write-ahead log for metadata. In ext4's default ordered mode, an fsync on an append goes like this. Blocks are allocated. The data blocks are written to their final locations first; that ordering is what "ordered" means. Then the changed metadata goes into the journal, followed by a commit block, with a cache flush so the commit only reaches storage after everything it vouches for. Later the metadata is written to its real home.

Crash before the commit lands: recovery ignores the transaction, and the file has its old size. Crash after: recovery replays it. Recovery takes seconds, proportional to the journal, not the disk.

Two limits for a design review. Journaling protects the filesystem's consistency, not your application's: a half-written record inside your file is still half-written, which is what your own log and fsync discipline are for. And it cannot detect a disk returning wrong data. Copy-on-write filesystems like ZFS and btrfs never overwrite in place, switch a root pointer atomically, and checksum every block.

## SSDs, disks and RAID

A spinning disk's cost is mechanical: a random read waits for the arm to seek and the platter to come around, 5 to 10 milliseconds, a hundred or two random reads a second. Random versus sequential throughput differs by hundreds of times, and that gap shaped a generation of designs: append-only logs, LSM trees and Kafka's segment files all turn random writes into sequential ones.

Flash has its own physics. It is written in small pages but erased only in blocks of several mebibytes, and a page cannot be rewritten until its block is erased. So the drive writes every update to a fresh page and garbage-collects later. That gives write amplification, latency spikes under sustained writes when garbage collection falls behind, and one rule that matters most: parallelism is the path to rated throughput. Operations per second equal requests in flight divided by latency.

In the cloud, most volumes are network-attached, so every I/O is a round trip, with provisioned limits and sometimes burst credits that run out mid-incident. Local NVMe is an order of magnitude faster and disappears when the instance stops.

RAID combines disks. Take eight disks doing 150 random operations a second each, 1,200 in total. RAID 10, a stripe of mirrors, costs two writes per small write: about 600 write operations a second. RAID 5, single parity, costs four: read old data and old parity, write both. About 300. RAID 5 also has a dangerous rebuild: replacing a failed 20 terabyte disk reads every survivor end to end for a day or more, with no redundancy left. And RAID is not a backup. It replicates deletions, corruption and ransomware to every disk instantly.

## In the interview

A follow-up the lesson expects. A single thread gets 12 thousand operations a second from an NVMe drive rated at 800 thousand. Is the drive faulty?

[pause]

No. With one request in flight at about 80 microseconds, the ceiling is 12,500 a second. Rated numbers need dozens of requests in flight, from many threads or asynchronous submission. The wrong answer is "the drive is throttling".

And: what does ordered mode guarantee? Only metadata is journaled, but data blocks are written before the metadata that references them commits, so a crash never exposes another file's stale blocks. It does not make your data durable without fsync. The wrong answer is that ordered mode journals the data too.

## Recap

Four things to remember. Names are directory entries and files are inodes, which explains the deleted-but-open log, inode exhaustion, and why rename is the atomic primitive. A write reaches the page cache only, and close flushes nothing. The durable replace is write a temp file, fsync it, rename, fsync the directory; and an fsync error is data loss, not something to retry. And throughput comes from batching and depth: group commit takes 237 records a second to 180 thousand, and a drive's rated speed needs many requests in flight.

At your desk: the atomic replace code and its crash table, the inode and journaling tables, the disk and RAID comparisons, and the two exercises on inode block reads and RAID sizing.

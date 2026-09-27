---
slug: filesystems-and-storage
title: "Filesystems and storage: inodes, journaling and what fsync promises"
description: How files map to inodes and blocks, what the page cache does with your writes, exactly what fsync does and does not guarantee, how journaling keeps a filesystem consistent, how SSDs differ from disks, and what RAID buys you.
minutes: 35
difficulty: medium
tags: [operating-systems, filesystems, fsync, journaling, ssd, raid, durability, storage]
---
Your service keeps its state in a small JSON file. On every change it opens the file with `O_TRUNC`, writes the new contents and closes it. It has worked for two years. Then a host loses power, and when it comes back the file exists, has the right name and is zero bytes long. Nothing in the code is wrong in the sense of throwing an error. `write` returned success. `close` returned success. The data was never on disk.

The gap between "the call succeeded" and "the bytes survive a crash" is where filesystems live, and it is wider than most engineers assume. Closing that gap correctly takes about ten lines of code, and knowing *why* those ten lines are needed (inodes, the page cache, `fsync`, directory entries, journaling, and what the drive itself does) is what lets you reason about databases, logs and queues instead of trusting them.

## From blocks to files

A disk, SSD or cloud volume presents itself to the kernel as a **block device**: an array of fixed-size blocks (512 bytes or 4 KiB) addressed by number. It has no idea what a file is. The filesystem's job is to turn `(path, offset)` into block numbers, to track which blocks are free, and to store metadata such as owners, permissions and timestamps, all in a way that survives crashes.

## Inodes and directories

Every file is an **inode**: a fixed-size record holding the file's type, permissions, owner, size, timestamps, link count and the map of where its data lives. The inode has a number but no name. Names live in **directories**, which are just files whose contents map names to inode numbers.

```text
$ stat app.log
  File: app.log
  Size: 52428800   Blocks: 102400     IO Block: 4096   regular file
Device: 259,2      Inode: 1835021     Links: 1
Access: (0644/-rw-r--r--)  Uid: ( 1000/     app)   Gid: ( 1000/     app)
Modify: 2026-09-20 10:14:41.902114532 +0000
Change: 2026-09-20 10:14:41.902114532 +0000
```

Separating names from files explains several behaviours that otherwise look like bugs:

- **Hard links** are two directory entries pointing at one inode; `Links: 2`. A symbolic link is a separate small file containing a path.
- **Deleting a file removes a name.** `unlink` decrements the link count; the inode and its blocks are freed only when the count is zero *and* no process has the file open. A log file deleted by a rotation script while the service still writes to it keeps consuming space invisibly: `df` says the disk is full and `du` cannot find the space. `lsof +L1` lists open files with no links; restarting the writer (or rotating with a signal that makes it reopen) frees the space.
- **`rename` within a filesystem is atomic.** Other processes see either the old file or the new one under that name, never a mix. That property is the foundation of every safe file-replacement scheme. Across filesystems it fails with `EXDEV`, and "move" becomes copy-then-delete.
- **Inodes can run out.** Most filesystems allocate a fixed number of inodes at creation time. Millions of tiny files (session files, cache directories, container image layers) can exhaust them with plenty of free space left, and writes fail with `ENOSPC`. `df -i` shows inode usage.

The inode's map from file offsets to disk blocks has evolved. The classic Unix design (ext2 and ext3) stores 12 **direct** block pointers, then one **single-indirect** pointer to a block full of pointers, one **double-indirect** and one **triple-indirect**. With 4 KiB blocks and 4-byte pointers, an indirect block holds 1,024 pointers, so the first 48 KiB of a file needs no extra reads, the next 4 MiB needs one indirect block, the next 4 GiB needs two levels and everything up to roughly 4 TiB needs three. It is a very flat tree, which is why seeking into a large file is cheap, and it is the same fan-out idea as a [B-tree](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees).

Modern filesystems (ext4, XFS, btrfs) store **extents** instead: "logical blocks 0 to 32,767 live at physical blocks 81,920 onward". An ext4 extent covers up to 32,768 blocks (128 MiB), so a 1 GiB file written sequentially needs about eight entries instead of 262,144 pointers. Extents are why preallocating a file (`fallocate`) and writing it sequentially keeps it fast to read.

## The page cache and write-back

`write` does not write to disk. It copies your bytes into the **page cache**, the kernel's cache of file pages in RAM, marks those pages dirty and returns, typically in microseconds. Kernel flusher threads write dirty pages to the device later: when they are older than `vm.dirty_expire_centisecs` (30 seconds by default), or when dirty memory exceeds `vm.dirty_background_ratio` (10% of available memory by default).

That buffering is why writes are fast, and it hides two production surprises:

- **Writes can suddenly block.** When dirty memory reaches `vm.dirty_ratio` (20% by default), the kernel throttles every process that is writing, inside `write`, until the flushers catch up. A service that logs heavily to a slow volume sees normally instant `write` calls occasionally take hundreds of milliseconds, and the stall shows up in request latency, not in any I/O metric the service owns.
- **Nothing is durable until it is flushed.** If power fails, every dirty page is gone. In the opening example, `O_TRUNC` freed the old contents as a metadata change that the filesystem committed promptly, while the new data sat in the page cache waiting for write-back.

Reads go through the same cache. A hit is a memory copy; a miss reads from the device, and the kernel's **readahead** detects sequential access and fetches the next chunk before you ask. Databases that manage their own buffer pool (InnoDB, ScyllaDB) open data files with `O_DIRECT` to bypass the page cache and avoid caching every page twice; PostgreSQL traditionally relies on the page cache, which is why its own `shared_buffers` is usually set to a fraction of RAM.

To see what the device is doing, use `iostat -x 1` (columns trimmed here):

```text
Device      r/s     rkB/s  r_await     w/s     wkB/s  w_await  aqu-sz  %util
nvme0n1  1520.0   97280.0     0.21   310.0   24800.0     0.05    0.34   38.4
sda       180.0     720.0    38.50    95.0    3800.0    61.20   12.75   99.6
```

`r_await` and `w_await` are the average milliseconds per request including queueing; `aqu-sz` is the average number of requests in flight, which is just throughput times latency (Little's law: 180 × 0.0385 + 95 × 0.0612 ≈ 12.7). The `sda` line is a spinning disk doing small random I/O (4 KiB reads) at its physical limit of a few hundred operations per second, with each request waiting roughly 40–60 ms, mostly in the queue. The `%util` column means "the device had at least one request outstanding", which is meaningful for a single-actuator disk and nearly meaningless for an NVMe drive that serves dozens of requests in parallel: an NVMe device at 100% `%util` may have most of its capacity unused.

## What fsync promises, and what it does not

`fsync(fd)` writes the file's dirty data and metadata to the device and then asks the device to flush its own volatile write cache. When it returns successfully, the file's contents are on stable storage. `fdatasync` does the same but skips metadata that is not needed to read the data back (such as the modification time), which saves a journal write.

What it does *not* do is just as important:

- **It does not make the file's name durable.** A newly created or renamed file's name is an entry in its directory, which is a different file. After creating or renaming, you must `fsync` the directory too.
- **`close` does not flush.** It releases the descriptor. Dirty pages remain dirty.
- **A successful `write` promises nothing about durability**, only that the kernel has your bytes.

So the correct way to replace a file's contents atomically and durably is:

```python
import os

def atomic_write(path: str, data: bytes) -> None:
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        view = memoryview(data)
        while view:                      # write may be partial; loop until done
            view = view[os.write(fd, view):]
        os.fsync(fd)                     # 1. new contents are on stable storage
    finally:
        os.close(fd)
    os.rename(tmp, path)                 # 2. atomic swap (same filesystem only)
    dfd = os.open(os.path.dirname(path) or ".", os.O_RDONLY)
    try:
        os.fsync(dfd)                    # 3. the rename itself is durable
    finally:
        os.close(dfd)
```

After a crash, the name points at either the complete old file or the complete new one. Skip step 1 and the rename can reach disk before the data, giving you exactly the zero-length file from the opening; ext4 added heuristics after 2009 to paper over this for the common truncate-and-rewrite and rename patterns, but applications that depend on them are relying on luck. Skip step 3 and the rename itself may be lost.

Three sharper edges that senior engineers know:

**An `fsync` error means data may be lost.** In 2018 PostgreSQL developers found ("fsyncgate") that when write-back fails on Linux, the kernel reports the error to one `fsync` caller and may then mark the pages clean, so a retried `fsync` succeeds even though the data never reached the disk. PostgreSQL's fix was to treat an `fsync` failure as fatal and recover from its write-ahead log. If your code retries `fsync` and carries on, it can silently lose writes.

**Platforms differ.** On macOS, `fsync` does not force the drive to flush its cache; you need `fcntl(fd, F_FULLFSYNC)`, which is why SQLite and PostgreSQL have settings for it.

**`fsync` is expensive, and how expensive depends on hardware.** A spinning disk needs milliseconds (a seek and a rotation). A consumer NVMe drive without power-loss protection must flush its volatile cache to flash, from hundreds of microseconds to several milliseconds. An enterprise SSD with power-loss protection (capacitors that guarantee the cache can be written out) acknowledges flushes from its DRAM in tens of microseconds. A cloud network volume adds a network round trip. One `fsync` per request on a consumer-grade disk caps you at hundreds to low thousands of requests per second per disk, which is why databases use **group commit**: many transactions' log records, one `fsync`. The [write-ahead log lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/write-ahead-logs) covers the pattern.

## Journaling: keeping the filesystem itself consistent

Appending one block to a file changes several things on disk: the free-block bitmap, the inode's size and block map, and the data block. The device may persist those writes in any order, and power can fail between any two. A crash can leave an inode pointing at a block the bitmap says is free (so it will be handed to another file), or a block marked used that nothing references. Before journaling, the only remedy was `fsck`: scan every inode and bitmap on the disk at boot, which on large disks took hours.

A **journal** is a write-ahead log for filesystem metadata. The filesystem first writes the intended changes to a dedicated journal region, then a commit record, and only then writes the changes to their home locations (**checkpointing**). After a crash it replays committed transactions from the journal and discards uncommitted ones. Recovery takes seconds and depends on the journal's size, not the disk's.

```viz
{"type": "system", "algorithm": "wal",
 "title": "The journal is a write-ahead log",
 "caption": "Log the change and flush it, then update the real location lazily. After a crash, replay the log. Filesystem journals, database WALs and Kafka partitions are the same idea."}
```

ext4 offers three modes: `data=journal` (data and metadata both journaled, so everything is written twice), `data=ordered` (the default: only metadata is journaled, but a file's data blocks are written before the metadata that points to them commits, so a crash never exposes garbage), and `data=writeback` (metadata only, no ordering, so a crashed file can contain stale blocks). XFS journals metadata only.

Two limits of journaling are worth stating in a design review. First, it protects the *filesystem's* consistency, not your application's: a half-written record inside your file is still half-written, which is what your own WAL and `fsync` discipline are for. Second, it cannot detect a disk that returns wrong data. **Copy-on-write** filesystems (ZFS, btrfs) never overwrite blocks in place: they write new blocks and atomically switch a root pointer, so there is no torn state, and they checksum every block so silent corruption is detected on read.

## SSDs versus spinning disks

| | HDD (7,200 rpm) | SATA SSD | NVMe SSD |
|---|---|---|---|
| Random 4 KiB read | ~5–10 ms | ~100 µs | ~10–100 µs |
| Random read IOPS | ~100–200 | tens of thousands | hundreds of thousands to over a million |
| Sequential throughput | ~150–250 MB/s | ~500 MB/s | several GB/s |
| Parallelism | One actuator | One queue, 32 commands | Many queues, deep |

A spinning disk's cost is mechanical. A random read waits for the arm to seek (several milliseconds) and then for the platter to bring the sector around (half a rotation at 7,200 rpm is 4.2 ms). Sequential reads pay that once. The resulting gap between random and sequential throughput, hundreds of times, shaped a generation of storage design: append-only logs, [LSM trees](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) and Kafka's segment files all turn random writes into sequential ones.

Flash has no moving parts, but it has its own physics. NAND is written in pages of roughly 4–16 KiB and can only be erased in much larger blocks of several MiB, and a page cannot be overwritten until its whole block is erased. The drive's **flash translation layer** therefore writes every update to a fresh page, remaps the logical block and later **garbage-collects** blocks full of stale pages by copying their live pages elsewhere and erasing them. Consequences for your software:

- **Write amplification.** The drive writes more than you asked, and each cell survives a limited number of erase cycles, so endurance is rated in total bytes written. `TRIM` (discard) tells the drive which blocks are free so it can skip copying them.
- **Latency spikes under sustained writes.** When garbage collection falls behind, write latency can jump by an order of magnitude. Consumer drives also absorb bursts in a fast cache region and slow down sharply once it fills, so a 10-second benchmark flatters them.
- **Parallelism is how you reach the IOPS on the box.** Little's law again: IOPS = requests in flight ÷ latency. One thread issuing synchronous 4 KiB reads at 80 µs each gets 12,500 IOPS from a drive rated for 800,000; reaching 500,000 needs about 40 requests in flight, which means many threads or async I/O such as `io_uring` ([I/O and system calls](/learn/systems/operating-systems/io-and-syscalls)).

Random reads are cheap enough on SSDs that B-trees are perfectly happy; random *writes* still cost write amplification, which is why write-heavy stores still prefer log-structured designs.

In the cloud, most block volumes are network-attached: every I/O is a network round trip (sub-millisecond to a few milliseconds) and the volume enforces a provisioned IOPS and throughput cap, sometimes with burst credits that run out mid-incident. Local instance NVMe is an order of magnitude faster and disappears when the instance stops, so it suits caches and replicated data, not the only copy of anything.

## RAID basics

RAID combines disks into one logical device for capacity, speed or survival. For $n$ disks of size $S$:

| Level | Usable capacity | Failures survived | I/Os per small random write | Notes |
|---|---|---|---|---|
| RAID 0 (stripe) | $nS$ | 0 | 1 | Fast; one failure loses everything |
| RAID 1 (mirror, 2 disks) | $S$ | 1 | 2 | Reads can use either copy |
| RAID 5 (single parity) | $(n-1)S$ | 1 | 4 | Read old data and parity, write new data and parity |
| RAID 6 (double parity) | $(n-2)S$ | 2 | 6 | Survives a failure during rebuild |
| RAID 10 (stripe of mirrors) | $nS/2$ | 1 per mirror pair | 2 | Fast rebuild; the database favourite |

The column people forget is the write penalty. A RAID 5 array of eight disks at 150 IOPS each reads at about 1,200 IOPS, but a random-write workload gets roughly a quarter of that, because each small write becomes four I/Os.

The failure mode people forget is the rebuild. Replacing a failed 20 TB disk in RAID 5 means reading every surviving disk end to end, for a day or more, with no redundancy left. Spec-sheet unrecoverable-read-error rates for consumer drives (one per $10^{14}$ bits, about 12.5 TB) are pessimistic bounds, but they are why RAID 5 on large spinning disks is widely considered unsafe and RAID 6 or RAID 10 is preferred. RAID 5 also has a **write hole**: a crash between writing data and writing parity leaves them inconsistent, which hardware controllers cover with battery-backed caches and ZFS avoids with copy-on-write.

And RAID is not a backup. It replicates deletions, corruption and ransomware to every disk instantly.

At scale, the same ideas move up a layer. Distributed stores replicate across machines (three copies in HDFS or Cassandra) or use **erasure coding**, a generalisation of RAID 6 parity across machines that tolerates several failures at far less than 3× storage cost; object stores rely on it. The [distributed file systems lesson](/learn/big-data/batch-processing/distributed-file-systems) picks this up.

## Exercise

```exercise
id: inode-block-reads
title: How many reads to reach a byte?
prompt: |
  A classic Unix inode has 12 direct block pointers, then one single-indirect,
  one double-indirect and one triple-indirect pointer. An indirect block holds
  `block_size / ptr_size` pointers.

  Assume the inode is already in memory and nothing else is cached. Return how
  many block reads are needed to fetch the data block containing byte `offset`:
  1 for a direct block, 2 via the single-indirect block, 3 via double-indirect,
  4 via triple-indirect. Return -1 if `offset` is beyond the largest file this
  layout can address.
languages: [python, javascript]
entry: inode_reads
starter:
  python: |
    def inode_reads(offset, block_size, ptr_size):
        # your code here
        return 0
  javascript: |
    function inode_reads(offset, block_size, ptr_size) {
      // your code here
      return 0;
    }
tests:
  - args: [0, 4096, 4]
    expected: 1
  - args: [49151, 4096, 4]
    expected: 1
    label: last byte of the 12th direct block
  - args: [49152, 4096, 4]
    expected: 2
    label: first byte behind the single-indirect block
  - args: [4243456, 4096, 4]
    expected: 3
    label: first double-indirect block
  - args: [4299210752, 4096, 4]
    expected: 4
    label: first triple-indirect block
  - args: [12288, 1024, 4]
    expected: 2
    label: 1 KiB blocks, 256 pointers per indirect block
  - args: [274432, 1024, 4]
    expected: 3
    hidden: true
  - args: [17247252480, 1024, 4]
    expected: -1
    hidden: true
    label: one byte past the maximum file size
hints:
  - "Convert the byte offset to a block index: offset // block_size (Math.floor in JavaScript)."
  - "Let k = block_size / ptr_size. Blocks 0..11 are direct; the next k are single-indirect; the next k*k double; the next k*k*k triple."
  - "Subtract each range's size as you pass it, and return -1 if the index is still too large after the triple-indirect range."
```

## Senior signals

- You separate names (directory entries) from files (inodes), and can explain the deleted-but-open log file, inode exhaustion and why `rename` is the atomic primitive.
- You know `write` only reaches the page cache, what `vm.dirty_ratio` throttling looks like, and that `close` does not flush.
- You can write the durable atomic-replace sequence from memory, including the directory `fsync`, and you treat an `fsync` error as data loss rather than something to retry.
- You quote `fsync` cost by hardware class (HDD milliseconds, enterprise SSD with power-loss protection tens of microseconds, cloud volumes a network round trip) and reach for group commit.
- You explain SSD garbage collection, write amplification and why queue depth, not the spec sheet, determines the IOPS a single thread sees.
- You can compare RAID levels by capacity, write penalty and rebuild risk, and you say "RAID is not a backup" before anyone else does.

## Check yourself

```quiz
- q: >-
    A service writes its state to state.json.tmp, calls fsync on it, renames it over state.json and returns success. After a power failure, state.json holds the old contents. Which step was missing?
  options: ["An fsync of state.json after the rename", "Opening the file with O_APPEND", "Calling close before rename", "An fsync of the containing directory after the rename"]
  answer: 3
  explanation: >-
    The rename changes the directory, which is a separate file with its own dirty pages. Without fsyncing the directory, the new name mapping may never reach disk, so after the crash the old entry is still there. fsyncing state.json again would only flush the inode's data, which was already durable.
- q: >-
    df reports a volume 100% full, but du over the whole filesystem accounts for only 40% of it. What is the most likely cause?
  options: ["Filesystem journal overhead", "A large file was deleted while a process still holds it open, so its blocks cannot be freed", "Inode exhaustion", "The page cache is holding dirty pages"]
  answer: 1
  explanation: >-
    du walks directory entries; an unlinked file has none, but its inode and blocks live until the last descriptor closes. lsof +L1 finds it. Inode exhaustion shows in df -i, not as used blocks, and dirty pages do not consume disk space.
- q: >-
    Postgres developers discovered that retrying a failed fsync on Linux could return success even though data was lost. What is the correct application response to an fsync error?
  options: ["Treat it as possible data loss: crash or fail the operation and recover from a durable log", "Retry fsync until it succeeds", "Switch to fdatasync", "Call sync() for the whole system instead"]
  answer: 0
  explanation: >-
    After a write-back failure the kernel may mark the affected pages clean, so a later fsync has nothing to flush and succeeds. The only safe assumption is that the unflushed data is gone, which is why PostgreSQL now panics and replays its WAL.
- q: >-
    A single-threaded tool reads random 4 KiB blocks synchronously from an NVMe drive rated at 800,000 random-read IOPS and measures about 12,000 IOPS at roughly 80 µs per read. What limits it?
  options: ["The drive is faulty", "The page cache is too small", "Only one request is in flight at a time; by Little's law throughput is 1 / 80 µs, and reaching the rated IOPS needs dozens of concurrent requests", "4 KiB is below the drive's minimum block size"]
  answer: 2
  explanation: >-
    IOPS equals requests in flight divided by latency. With one outstanding request at 80 µs the ceiling is 12,500 per second. NVMe drives reach their ratings with deep queues, via many threads or asynchronous submission such as io_uring.
- q: >-
    An 8-disk array of 150-IOPS drives serves a random small-write workload. Roughly how many write IOPS can RAID 5 sustain compared with RAID 10?
  options: ["RAID 5 about 1,200, RAID 10 about 600", "RAID 5 about 300, RAID 10 about 600", "Both about 1,200", "RAID 5 about 600, RAID 10 about 300"]
  answer: 1
  explanation: >-
    The array has 1,200 raw IOPS. Each small RAID 5 write costs 4 I/Os (read data, read parity, write both), giving about 300. Each RAID 10 write costs 2 I/Os (both mirrors), giving about 600. RAID 5's capacity advantage comes with a large write penalty.
```

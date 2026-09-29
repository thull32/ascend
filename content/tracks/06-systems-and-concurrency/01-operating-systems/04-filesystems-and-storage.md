---
slug: filesystems-and-storage
title: "Filesystems and storage: inodes, journaling and what fsync promises"
description: How files map to inodes and extents, what the page cache does with your writes, exactly what fsync and rename do and do not guarantee (with the write-rename-fsync recipe traced crash point by crash point), how journaling modes differ, measured fsync and group-commit costs, SSDs versus disks, and RAID.
minutes: 50
difficulty: medium
tags: [operating-systems, filesystems, fsync, journaling, ssd, raid, durability, storage]
---
Your service keeps its state in a small JSON file. On every change it opens the file with `O_TRUNC`, writes the new contents and closes it. It has worked for two years. Then a host loses power, and when it comes back the file exists, has the right name and is zero bytes long. `write` returned success. `close` returned success. The data was never on disk.

The gap between "the call succeeded" and "the bytes survive a crash" is where filesystems live, and it is wider than most engineers assume. Closing it correctly takes about ten lines of code, and knowing *why* those lines are needed (inodes, the page cache, `fsync`, directory entries, journaling and what the drive itself does) is what lets you reason about databases, logs and queues instead of trusting them. Numbers below were measured on ext4 (`data=ordered`) on a Ryzen 9 9950X3D under WSL2, whose "disk" is a virtual disk file on the Windows host; the lesson says where that changes the answer.

## From blocks to files

A disk, SSD or cloud volume presents itself to the kernel as a **block device**: an array of fixed-size blocks (512 bytes or 4 KiB) addressed by number. It has no idea what a file is. The filesystem turns `(path, offset)` into block numbers, tracks which blocks are free and stores metadata such as owners, permissions and timestamps, all in a way that must survive a crash at any instant.

## Inodes and directories

Every file is an **inode**: a fixed-size record holding the type, permissions, owner, size, timestamps, link count and the map of where the data lives. The inode has a number but no name. Names live in **directories**, which are files whose contents map names to inode numbers. On this machine:

```text
$ head -c 1000000 /dev/zero > a.txt; ln a.txt b.txt; ln -s a.txt c.txt
$ stat -c "%n inode=%i links=%h size=%s" a.txt b.txt c.txt
a.txt inode=592966 links=2 size=1000000
b.txt inode=592966 links=2 size=1000000
c.txt inode=592967 links=1 size=5
```

`a.txt` and `b.txt` are two directory entries for one inode (a **hard link**, link count 2). `c.txt` is a separate inode whose 5 bytes of content are the path `a.txt` (a **symbolic link**). Separating names from files explains several behaviours that otherwise look like bugs:

- **Deleting a file removes a name.** `unlink` decrements the link count; the inode and its blocks are freed only when the count is zero *and* no process has the file open. A Python process that opened `gone.log` and then unlinked it saw `os.fstat(fd).st_nlink == 0`, and `/proc/self/fd/3` pointed at `.../gone.log (deleted)`. A log deleted by a rotation script while the service still writes to it keeps consuming space invisibly: `df` says the disk is full and `du` cannot find the space. `lsof +L1` lists open files with no links.
- **`rename` within a filesystem is atomic.** Other processes see the old file or the new one under that name, never neither and never a mix. Every safe file-replacement scheme rests on it. Across filesystems it fails with `EXDEV`, and "move" becomes copy-then-delete.
- **Inodes can run out.** ext4 fixes the inode count at creation: `df -i /` here shows 67,108,864 inodes on a 1 TiB filesystem, one per 16 KiB of space (the `inode_ratio` default in `mke2fs.conf`). Millions of tiny files (sessions, caches, container layers) can exhaust them with blocks to spare, and writes fail with `ENOSPC`.

### From offsets to blocks: pointers and extents

The classic Unix inode (ext2 and ext3) stores 12 **direct** block pointers, then one **single-indirect** pointer to a block full of pointers, one **double-indirect** and one **triple-indirect**. With 4 KiB blocks and 4-byte pointers an indirect block holds 1,024 pointers, so the first 48 KiB needs no extra read, the next 4 MiB needs one, the next 4 GiB two, and everything up to about 4 TiB three. It is a very flat tree, the same fan-out idea as a [B-tree](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees), and the exercise below asks you to compute the reads for an offset.

ext4, XFS and btrfs store **extents** instead: "logical blocks 0 to 32,767 live at physical blocks 81,920 onward". An ext4 extent describes at most 32,768 blocks (128 MiB). Writing a 1 GiB file sequentially here and running `filefrag -v` showed two physically contiguous runs, 6,144 and 256,000 blocks long, instead of 262,144 pointers. Preallocating (`fallocate`) and writing sequentially keeps files in few extents and fast to read.

## The page cache and write-back

`write` does not write to disk. It copies your bytes into the **page cache**, marks those pages dirty and returns: 2.3 µs for a 4 KiB append measured here. Kernel flusher threads write dirty pages to the device later: when they are older than `vm.dirty_expire_centisecs` (3,000, so 30 seconds, on this machine and by default) or when dirty memory exceeds `vm.dirty_background_ratio` (10% of available memory).

That buffering hides two production surprises:

- **Writes can suddenly block.** When dirty memory reaches `vm.dirty_ratio` (20%), the kernel throttles every process that is writing, inside `write`, until the flushers catch up. A service that logs heavily to a slow volume sees normally instant writes occasionally take hundreds of milliseconds, and the stall shows up in request latency, not in any I/O metric the service owns.
- **Nothing is durable until it is flushed.** If power fails, every dirty page is gone. ext4 also uses **delayed allocation**: it does not even choose disk blocks for new data until write-back. In the opening example, `O_TRUNC` freed the old blocks as a metadata change committed within seconds, while the new data had no blocks yet.

Reads go through the same cache. A hit is a memory copy (0.54 µs for a random 4 KiB `pread` here); a miss reads from the device, and **readahead** fetches the next chunk when it detects sequential access. Databases with their own buffer pool open data files with `O_DIRECT` to avoid caching every page twice: ScyllaDB always, InnoDB by default on Linux since MySQL 8.4 (`innodb_flush_method`; 8.0 defaulted to `fsync`); PostgreSQL relies on the page cache, which is why its `shared_buffers` is usually a fraction of RAM.

To see what the device is doing, use `iostat -x 1` (columns trimmed):

```text
Device      r/s     rkB/s  r_await     w/s     wkB/s  w_await  aqu-sz  %util
nvme0n1  1520.0   97280.0     0.21   310.0   24800.0     0.05    0.34   38.4
sda       180.0     720.0    38.50    95.0    3800.0    61.20   12.75   99.6
```

`r_await` and `w_await` are milliseconds per request including queueing; `aqu-sz` is the average number in flight, which is throughput times latency (Little's law: 180 × 0.0385 + 95 × 0.0612 ≈ 12.7). The `sda` line is a spinning disk at its physical limit for small random I/O. `%util` means "at least one request was outstanding", which is meaningful for a single-actuator disk and nearly meaningless for an NVMe drive that serves dozens of requests in parallel.

## What fsync promises, and what it does not

`fsync(fd)` writes the file's dirty data and metadata to the device and then asks the device to flush its volatile write cache. When it returns successfully, the file's contents are on stable storage. `fdatasync` skips metadata not needed to read the data back (such as the modification time). What neither does:

- **Make the file's name durable.** A new or renamed file's name is an entry in its directory, a different file. You must `fsync` the directory too.
- **Get called by `close`.** `close` releases the descriptor; dirty pages stay dirty.
- **Follow from a successful `write`**, which promises only that the kernel has your bytes.

Measured with 500 iterations each (4 KiB per operation):

| Operation | p50 | p99 |
|---|---|---|
| Append, no sync | 2.0 µs | 6.9 µs |
| Overwrite in place + `fdatasync` | 2.0 ms | 2.2 ms |
| Append + `fdatasync` | 4.5 ms | 6.1 ms |
| Append + `fsync` | 4.3 ms | 5.8 ms |

Two readings. Durability costs three orders of magnitude over a buffered write. And `fdatasync` saved nothing on appends, because an append changes the file size, which *is* needed to read the data back, so ext4 must commit a journal transaction either way: data write, cache flush, journal write, flush. Overwriting preallocated blocks needs only the data write and one flush, half the time. That is why write-ahead logs preallocate their segment files. The absolute numbers reflect this VM, where each flush crosses Hyper-V to the host's disk. As orders of magnitude by hardware class: a spinning disk needs milliseconds (a seek plus half a rotation, 4.2 ms at 7,200 rpm); a consumer NVMe drive without power-loss protection, hundreds of microseconds to milliseconds; an enterprise SSD whose capacitors guarantee its cache, tens of microseconds; a cloud network volume adds a network round trip.

## The atomic replace recipe, traced

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

Suppose the machine loses power at each point. What does `path` hold after reboot?

| Crash happens | `path` after recovery | Why |
|---|---|---|
| During the writes to `tmp` | Old contents | `path` was never touched; `tmp` may be partial or missing |
| After `fsync(tmp)`, before `rename` | Old contents | `tmp` is complete and durable; delete it at start-up |
| After `rename`, before `fsync(dir)` | Old **or** new, never a mix | The rename sits in an uncommitted journal transaction |
| After `fsync(dir)` returns | New contents | Data and name are both on stable storage |
| Recipe without step 1, crash after `rename` | Possibly an empty or partial new file | The name can reach disk before the data blocks |

The last row is the opening incident in another form. ext4 added heuristics in 2009 (Linux 2.6.30, the `auto_da_alloc` mount option, on by default) that detect replace-via-truncate and replace-via-rename and force the new data's blocks to be allocated, so that in `data=ordered` mode the data reaches disk no later than the journal commit that records the rename. The trace of that heuristic is visible even here, where the unsafe `O_TRUNC`-and-rewrite loop cost 197 µs per iteration instead of a few microseconds because `close` started write-back. It narrows the window without closing it: `close` starts the I/O and waits for nothing, a journal commit that lands between the truncate and the rewrite still records an empty file, and nothing is durable until a commit you never waited for.

The safe recipe costs two flushes: measured here at 15 ms per replacement (about 4.7 ms for the temporary file's `fsync`, 32 µs for `rename`, 4 ms for the directory `fsync`, plus inode allocation for the new file). That is the price of durability on this VM, and the reason to batch many updates into one replacement rather than replace per update.

## Group commit

One `fsync` per record caps you at the inverse of the flush latency. Measured with 100-byte appended records and one `fdatasync` every k records:

| Records per `fdatasync` | Records per second |
|---|---|
| 1 | 237 |
| 10 | 2,308 |
| 100 | 20,618 |
| 1,000 | 180,701 |

Throughput scales almost linearly with the batch, because the flush costs the same whether it carries 100 bytes or 100 KB. Databases call this **group commit**: transactions that arrive during one flush wait and share the next, trading a little latency for a lot of throughput. The [write-ahead log lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/write-ahead-logs) covers the pattern, and Kafka's `acks` and flush settings are the same trade expressed as configuration.

### When fsync fails

**An `fsync` error means data may be lost.** In 2018 PostgreSQL developers found ("fsyncgate") that when write-back fails on Linux, the kernel reports the error once and may mark the pages clean, so a retried `fsync` succeeds although the data never reached the disk. PostgreSQL's fix was to treat an `fsync` failure as fatal and recover from its write-ahead log. Code that retries `fsync` and carries on can silently lose writes.

**Platforms differ.** On macOS `fsync` does not force the drive to flush its cache; `fcntl(fd, F_FULLFSYNC)` does, which is why SQLite and PostgreSQL have settings for it.

## Journaling: keeping the filesystem itself consistent

Appending one block to a file changes the free-block bitmap, the inode's size and extent tree, and the data block. The device may persist those writes in any order, and power can fail between any two. A crash can leave an inode pointing at a block the bitmap says is free (so it will be handed to another file), or a block marked used that nothing references. Before journaling the only remedy was `fsck`, a scan of every inode and bitmap at boot that took hours on large disks.

A **journal** is a write-ahead log for metadata. Trace an append followed by `fsync` in ext4's default `data=ordered` mode:

1. `write` copies the bytes into the page cache; with delayed allocation no block is chosen yet.
2. `fsync` (or write-back) allocates blocks: the bitmap, the inode's extent tree and the size change in memory, joining the running journal transaction.
3. The **data** blocks are written to their final locations first. This ordering is what `ordered` means.
4. The journal thread (`jbd2`) writes the changed metadata blocks into the journal area, then a **commit block**, with a cache flush before it and a forced write on it so the commit reaches stable storage only after everything it vouches for.
5. `fsync` returns.
6. Later, **checkpointing** writes the metadata to its home locations and frees the journal space.

Crash before step 4 completes: recovery ignores the uncommitted transaction; the file has its old size, and any data written in step 3 sits in blocks nothing references (harmless). Crash after step 4: recovery replays the transaction from the journal. Recovery takes seconds, proportional to the journal, not the disk. Without `fsync`, `jbd2` commits every 5 seconds by default (the `commit=` mount option), which is why metadata changes such as the opening's truncate reach disk quickly while delayed-allocation data can lag.

```viz
{"type": "system", "algorithm": "wal",
 "title": "The journal is a write-ahead log",
 "caption": "Log the change and flush it, then update the real location lazily. After a crash, replay the log. Filesystem journals, database WALs and Kafka partitions are the same idea."}
```

### Modes and limits

| ext4 mode | What is journaled | After a crash | Cost |
|---|---|---|---|
| `data=journal` | Data and metadata | Metadata and data consistent | Every data block written twice |
| `data=ordered` (default) | Metadata; data written before its metadata commits | No stale or garbage blocks exposed; recent data may be missing | Moderate |
| `data=writeback` | Metadata only, no ordering | A file can contain stale blocks from a deleted file | Lowest |

XFS journals metadata only. Two limits belong in a design review. Journaling protects the *filesystem's* consistency, not your application's: a half-written record inside your file is still half-written, which is what your own write-ahead log and `fsync` discipline are for. And it cannot detect a disk that returns wrong data. **Copy-on-write** filesystems (ZFS, btrfs) never overwrite blocks in place: they write new blocks and atomically switch a root pointer, so there is no torn state, and they checksum every block so silent corruption is caught on read.

## SSDs versus spinning disks

| | HDD (7,200 rpm) | SATA SSD | NVMe SSD |
|---|---|---|---|
| Random 4 KiB read | ~5–10 ms | ~100 µs | ~10–100 µs |
| Random read IOPS | ~100–200 | tens of thousands | hundreds of thousands to over a million |
| Sequential throughput | ~150–250 MB/s | ~500 MB/s | several GB/s |
| Parallelism | One actuator | One queue, 32 commands | Many queues, deep |

A spinning disk's cost is mechanical: a random read waits for the arm to seek and then for the platter to bring the sector around. The gap between random and sequential throughput, hundreds of times, shaped a generation of storage design: append-only logs, [LSM trees](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) and Kafka's segment files all turn random writes into sequential ones.

Flash has its own physics. NAND is written in pages of roughly 4–16 KiB and erased only in blocks of several MiB, and a page cannot be rewritten until its block is erased. The drive's **flash translation layer** writes every update to a fresh page, remaps the logical block and later **garbage-collects** blocks full of stale pages. Consequences: **write amplification** (the drive writes more than you asked, and endurance is rated in total bytes written; `TRIM`, which this filesystem enables with the `discard` mount option, tells the drive which blocks are free), **latency spikes under sustained writes** when garbage collection falls behind or a consumer drive's fast cache region fills, and **parallelism as the path to rated IOPS**. IOPS = requests in flight ÷ latency: the [I/O lesson](/learn/systems/operating-systems/io-and-syscalls) measured this VM's disk at 4,234 random-read IOPS with one request in flight and 102,781 with 64.

In the cloud, most block volumes are network-attached: every I/O is a network round trip, and the volume enforces provisioned IOPS and throughput, sometimes with burst credits that run out mid-incident. Local instance NVMe is an order of magnitude faster and disappears when the instance stops, so it suits caches and replicated data, not the only copy of anything.

## RAID basics

RAID combines disks into one logical device for capacity, speed or survival. For $n$ disks of size $S$ and $I$ random IOPS each:

| Level | Usable capacity | Failures survived | I/Os per small random write | Random write IOPS |
|---|---|---|---|---|
| RAID 0 (stripe) | $nS$ | 0 | 1 | $nI$ |
| RAID 1 ($n$-way mirror) | $S$ | $n-1$ | $n$ | $I$ |
| RAID 5 (single parity) | $(n-1)S$ | 1 | 4 | $nI/4$ |
| RAID 6 (double parity) | $(n-2)S$ | 2 | 6 | $nI/6$ |
| RAID 10 (stripe of mirrors) | $nS/2$ | 1 per mirror pair | 2 | $nI/2$ |

A RAID 5 small write reads the old data and old parity, computes the new parity (XOR), and writes both: four I/Os. Eight 150-IOPS disks read at about 1,200 IOPS but write randomly at about 300. The failure mode people forget is the rebuild: replacing a failed 20 TB disk in RAID 5 reads every surviving disk end to end, for a day or more, with no redundancy left, and spec-sheet unrecoverable-read-error rates for consumer drives (one per $10^{14}$ bits, about 12.5 TB) are why RAID 5 on large disks is considered unsafe. RAID 5 also has a **write hole**: a crash between writing data and parity leaves them inconsistent, which controllers cover with battery-backed caches and ZFS avoids with copy-on-write. And RAID is not a backup: it replicates deletions, corruption and ransomware to every disk instantly.

At scale the same ideas move up a layer: replication across machines (three copies in HDFS or Cassandra) or **erasure coding**, a generalisation of RAID 6 parity that tolerates several failures at far less than 3× storage. The [distributed file systems lesson](/learn/big-data/batch-processing/distributed-file-systems) picks this up.

## Choosing a durability strategy

| Strategy | Survives process crash | Survives power loss | Measured throughput here | Used by |
|---|---|---|---|---|
| `write` only | Yes (data is in the kernel) | No: up to 30 s of writes lost | ~400,000 appends/s | Logs you can afford to lose |
| `fsync` per record | Yes | Yes | 237 records/s | Small, rare, critical updates |
| Group commit (`fsync` per batch) | Yes | Yes, for acknowledged batches | 180,701 records/s at 1,000 per batch | PostgreSQL, MySQL |
| Replicate before acknowledging, no `fsync` | Yes | Yes, unless every replica loses power together | Network-bound | Kafka with `acks=all`, many distributed stores |
| Atomic replace (tmp, `fsync`, `rename`, dir `fsync`) | Yes | Yes, all-or-nothing | 15 ms per replacement | Config and state files |

## Failure modes in production

**Symptom: after a power loss, a state or config file exists with the right name and zero bytes.** Diagnosis: the writer truncates and rewrites in place, or renames without `fsync`ing the temporary file first. Fix: the full atomic replace recipe, with `fsync` of the file and of the directory.

**Symptom: `df` reports the volume full while `du` accounts for 40% of it.** Diagnosis: `lsof +L1` shows a deleted log still held open by the service. Fix: have the service reopen logs on a signal (`copytruncate` or `postrotate` in logrotate), or restart it.

**Symptom: writes fail with `ENOSPC` while `df -h` shows free space.** Diagnosis: `df -i` shows 100% of inodes used, usually by millions of tiny files in a cache or session directory. Fix: clean up and change the design (fewer, larger files), or recreate the filesystem with a lower bytes-per-inode ratio.

**Symptom: occasional 200–800 ms latency spikes in a service that logs heavily, with no I/O metric of its own changing.** Diagnosis: dirty memory hitting `vm.dirty_ratio`; `grep -E 'Dirty|Writeback' /proc/meminfo` climbs before each spike and the service's threads sit in `balance_dirty_pages`. Fix: lower `vm.dirty_background_bytes` so write-back starts earlier, log asynchronously, or move logs to a faster volume.

**Symptom: after a disk error, the application reports success but later reads return old data.** Diagnosis: an `fsync` error was logged and retried, and the retry succeeded against pages the kernel had already marked clean. Fix: treat `fsync` failure as fatal and recover from a durable log.

## Interviewer follow-ups

**"How do you replace a file atomically and durably?"** Model answer: write a temporary file in the same directory, `fsync` it, `rename` it over the target, `fsync` the directory; after any crash the name points at the complete old or complete new file. Common wrong answer: "open with `O_TRUNC`, write, close", or the recipe without the directory `fsync`.

**"Why is `fdatasync` no faster than `fsync` for an append-only log, and what do databases do about it?"** Model answer: appends change the size, which `fdatasync` must persist, so both commit a journal transaction; logs preallocate segments (`fallocate` and zero-fill) so appends become in-place overwrites needing one flush, measured here at 2.0 ms against 4.5 ms. Common wrong answer: "`fdatasync` never touches metadata".

**"What does `data=ordered` guarantee?"** Model answer: only metadata is journaled, but data blocks are written before the metadata that references them commits, so a crash never exposes another file's stale blocks; it does not make your data durable without `fsync`. Common wrong answer: "ordered mode journals the data too".

**"A single thread gets 12,000 IOPS from an NVMe drive rated at 800,000. Is the drive faulty?"** Model answer: no; with one request in flight at about 80 µs the ceiling is 12,500 per second; rated IOPS need dozens of requests in flight, from many threads or asynchronous submission. Common wrong answer: "the drive is throttling".

## What mid-level engineers get wrong

- **Treating a successful `write` or `close` as durable.** Consequence: data loss on the first power failure.
- **Forgetting the directory `fsync` after `rename` or file creation.** Consequence: files that vanish, or revert, after a crash.
- **Calling `fsync` per record in a hot path.** Consequence: a few hundred writes per second where group commit gives hundreds of thousands.
- **Retrying a failed `fsync`.** Consequence: silently lost writes.
- **Reading NVMe `%util` as saturation.** Consequence: scaling out a disk that was mostly idle.
- **Choosing RAID 5 for a write-heavy database on large disks.** Consequence: a quarter of the raw write IOPS and a dangerous rebuild window.

## Exercises

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

```exercise
id: raid-profile
title: Size a RAID array
prompt: |
  Given a RAID `level` ("0", "1", "5", "6" or "10"), `n` identical disks of
  `size_tb` terabytes and `iops` random IOPS each, return
  `{"usable_tb": ..., "failures": ..., "write_iops": ...}` using the lesson's
  table: usable capacity, the number of disk failures always survived, and
  random small-write IOPS (total raw IOPS divided by the I/Os each small write
  costs, rounded down).

  RAID 1 is an n-way mirror (every write goes to all n disks). For RAID 10,
  `failures` is 1 (a second failure can hit the same mirror pair). Return
  `null`/`None` if `n` is too small for the level (RAID 1 and 10 need 2 and
  an even count for 10, RAID 5 needs 3, RAID 6 needs 4, RAID 0 needs 1).
languages: [python, javascript]
entry: raid_profile
starter:
  python: |
    def raid_profile(level, n, size_tb, iops):
        # your code here
        return None
  javascript: |
    function raid_profile(level, n, size_tb, iops) {
      // your code here
      return null;
    }
tests:
  - args: ["5", 8, 10, 150]
    expected: {"usable_tb": 70, "failures": 1, "write_iops": 300}
    label: the lesson's RAID 5 example
  - args: ["10", 8, 10, 150]
    expected: {"usable_tb": 40, "failures": 1, "write_iops": 600}
  - args: ["0", 4, 2, 1000]
    expected: {"usable_tb": 8, "failures": 0, "write_iops": 4000}
  - args: ["6", 3, 10, 150]
    expected: null
    label: too few disks for RAID 6
  - args: ["1", 3, 4, 200]
    expected: {"usable_tb": 4, "failures": 2, "write_iops": 200}
    hidden: true
    label: three-way mirror
  - args: ["6", 12, 20, 180]
    expected: {"usable_tb": 200, "failures": 2, "write_iops": 360}
    hidden: true
  - args: ["10", 5, 10, 150]
    expected: null
    hidden: true
    label: odd disk count for RAID 10
hints:
  - "Write out usable capacity, failures and the write cost in I/Os for each level first; the rest is arithmetic."
  - "Write IOPS is floor(n * iops / cost), with cost 1, n, 4, 6 and 2 for RAID 0, 1, 5, 6 and 10."
```

## Senior signals

- You separate names (directory entries) from files (inodes) and can explain the deleted-but-open log, inode exhaustion and why `rename` is the atomic primitive.
- You know `write` only reaches the page cache, what `vm.dirty_ratio` throttling looks like, and that `close` does not flush.
- You write the durable atomic-replace sequence from memory, can say what survives a crash at each step, and treat an `fsync` error as data loss rather than something to retry.
- You quote `fsync` cost by hardware class, explain why appends need a journal commit and preallocated overwrites do not, and reach for group commit.
- You can narrate an ordered-mode journal commit (data first, then metadata and a commit block with flushes) and say what journaling does not protect.
- You explain SSD garbage collection, write amplification and why queue depth determines the IOPS a thread sees; you compare RAID levels by capacity, write penalty and rebuild risk, and say "RAID is not a backup".

## Check yourself

```quiz
- q: >-
    A service writes state.json.tmp, fsyncs it, renames it over state.json and returns success. After a power failure, state.json holds the old contents. Which step was missing?
  options: ["Calling close on state.json.tmp before the rename", "An fsync of state.json itself once the rename completes", "An fsync of the parent directory after the rename", "Opening state.json.tmp with O_APPEND instead of O_TRUNC"]
  answer: 2
  explanation: >-
    The rename changes the directory, a separate file with its own dirty state. Without fsyncing the directory the new name mapping may never reach disk, so after the crash the old entry is still there. fsyncing state.json again would only flush data that was already durable, and close does not flush anything.
- q: >-
    Measured on ext4, fdatasync after a 4 KiB append took about 4.5 ms, the same as fsync, while fdatasync after overwriting preallocated blocks took 2.0 ms. Why?
  options: ["An append changes the file size, so a journal commit is required", "Appends must first read the old block from disk before writing it", "fdatasync is an alias of fsync on ext4, so the two are identical", "Overwrites skip the device cache flush, which appends always need"]
  answer: 0
  explanation: >-
    fdatasync may skip metadata that is not needed to read the data back, but the size is needed, so an append forces a journal transaction (data, flush, journal and commit block) just like fsync. An in-place overwrite changes no needed metadata and costs one data write plus one flush. Both paths flush the device cache, and a full-block append reads nothing.
- q: >-
    df reports a volume 100% full, but du over the whole filesystem accounts for only 40% of it. What is the most likely cause?
  options: ["Journal overhead that du ignores but df counts", "Dirty pages that already reserve space on disk", "A deleted but still-open file holding its blocks", "Inode exhaustion, which df reports as used space"]
  answer: 2
  explanation: >-
    du walks directory entries; an unlinked file has none, but its inode and blocks live until the last descriptor closes, so df still counts them, and lsof +L1 finds it. The journal is a small fixed region, inode exhaustion shows in df -i rather than as used blocks, and dirty pages do not consume disk space.
- q: >-
    A crash happens after rename(tmp, path) but before the directory fsync, in the recipe that fsyncs tmp first. What can path contain after recovery?
  options: ["Nothing, since the old name was removed before the new one", "The complete old contents or the complete new contents", "A mix of old and new blocks, since rename is not durable", "Only the new contents, since the rename already returned"]
  answer: 1
  explanation: >-
    rename is atomic in the namespace, so the directory holds either the old entry or the new one; whether the change was committed is the only uncertainty, which is exactly what the directory fsync resolves. Because tmp was fsynced first, the new file is complete if its name survives. There is never a moment with neither name or a blend of blocks.
- q: >-
    A logging pipeline calls fdatasync after every 100-byte record and reaches about 240 records per second. What change gives the largest gain while keeping power-loss durability for acknowledged records?
  options: ["Switch from fdatasync to fsync to avoid metadata writes", "Call sync() once per second instead of per-record flushes", "Acknowledge records only after a shared fdatasync per batch", "Open the log with O_DIRECT so writes skip the page cache"]
  answer: 2
  explanation: >-
    The flush costs the same for 100 bytes or 100 KB, so group commit scales almost linearly: measured here, 1,000 records per fdatasync reached about 180,000 per second. fsync does at least as much work, O_DIRECT still needs a flush for durability, and a periodic sync() acknowledges records before they are durable.
- q: >-
    An 8-disk array of 150-IOPS drives serves a random small-write workload. Roughly how many write IOPS can RAID 5 sustain compared with RAID 10?
  options: ["RAID 5 about 600, RAID 10 about 300", "RAID 5 about 1,200, RAID 10 about 600", "RAID 5 and RAID 10 both about 1,200", "RAID 5 about 300, RAID 10 about 600"]
  answer: 3
  explanation: >-
    The array has 1,200 raw IOPS. Each small RAID 5 write costs 4 I/Os (read data and parity, write both), giving about 300; each RAID 10 write costs 2 (both mirrors), giving about 600. RAID 5's capacity advantage comes with a large write penalty.
```

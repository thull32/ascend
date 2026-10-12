---
lesson: filesystems-and-storage
source: 45fff2e29e96aba9
---
## 1

A service writes a temporary state file, fsyncs it, renames it over the real state file, and returns success. After a power failure, the state file holds the old contents. Which step was missing?

A, calling close on the temporary file before the rename. B, an fsync of the state file itself once the rename completes. C, an fsync of the parent directory after the rename. D, opening the temporary file in append mode instead of truncating it.

[think]

The answer is C: an fsync of the parent directory after the rename.

The rename changes the directory, which is a separate file with its own dirty state. Without fsyncing the directory, the new name mapping may never reach disk, so after the crash the old entry is still there. Fsyncing the state file again would only flush data that was already durable, and close does not flush anything.

## 2

Measured on ext4, fdatasync after a 4 kibibyte append took about 4.5 milliseconds, the same as fsync, while fdatasync after overwriting preallocated blocks took 2. Why?

A, an append changes the file size, so a journal commit is required. B, appends must first read the old block from disk before writing it. C, fdatasync is just another name for fsync on ext4, so the two are identical. D, overwrites skip the device cache flush, which appends always need.

[think]

The answer is A: an append changes the file size, so a journal commit is required.

Fdatasync may skip metadata that is not needed to read the data back, but the size is needed. So an append forces a journal transaction, data, flush, journal and commit block, just like fsync. An in-place overwrite changes no needed metadata, and costs one data write plus one flush. Both paths flush the device cache, and a full-block append reads nothing.

## 3

The df tool reports a volume 100 percent full, but du over the whole filesystem accounts for only 40 percent of it. What is the most likely cause?

A, journal overhead that du ignores but df counts. B, dirty pages that already reserve space on disk. C, a deleted but still-open file holding its blocks. D, inode exhaustion, which df reports as used space.

[think]

The answer is C: a deleted but still-open file holding its blocks.

Du walks directory entries. An unlinked file has none, but its inode and blocks live until the last descriptor closes, so df still counts them, and lsof can list such files. The journal is a small fixed region, inode exhaustion shows in df's inode view rather than as used blocks, and dirty pages do not consume disk space.

## 4

In the recipe that fsyncs the temporary file first, a crash happens after the rename over the real path, but before the directory fsync. What can the path contain after recovery?

A, nothing, since the old name was removed before the new one. B, the complete old contents, or the complete new contents. C, a mix of old and new blocks, since rename is not durable. D, only the new contents, since the rename already returned.

[think]

The answer is B: the complete old contents or the complete new contents.

Rename is atomic in the namespace, so the directory holds either the old entry or the new one. Whether the change was committed is the only uncertainty, which is exactly what the directory fsync resolves. Because the temporary file was fsynced first, the new file is complete if its name survives. There is never a moment with neither name, or a blend of blocks.

## 5

A logging pipeline calls fdatasync after every 100-byte record and reaches about 240 records a second. Which change gives the largest gain while keeping power-loss durability for acknowledged records?

A, switch from fdatasync to fsync, to avoid metadata writes. B, call sync once a second, instead of flushing per record. C, acknowledge records only after a shared fdatasync per batch. D, open the log with direct input-output, so writes skip the page cache.

[think]

The answer is C: acknowledge records only after a shared fdatasync per batch.

A flush costs the same for 100 bytes or 100 kilobytes, so group commit scales almost linearly: measured, a thousand records per fdatasync reached about 180 thousand a second. Fsync does at least as much work. Direct input-output still needs a flush for durability. And a periodic sync would acknowledge records before they are durable.

## 6

An array of 8 disks, each good for 150 IOPS, serves a random small-write workload. Roughly how many write IOPS can RAID 5 sustain, compared with RAID 10?

A, RAID 5 about 600, RAID 10 about 300. B, RAID 5 about 1,200, RAID 10 about 600. C, RAID 5 and RAID 10 both about 1,200. D, RAID 5 about 300, RAID 10 about 600.

[think]

The answer is D: RAID 5 about 300, RAID 10 about 600.

The array has 1,200 raw IOPS. Each small RAID 5 write costs 4 disk operations, reading the data and the parity, then writing both, which gives about 300. Each RAID 10 write costs 2, one per mirror, which gives about 600. RAID 5's capacity advantage comes with a large write penalty.

---
lesson: virtual-memory
source: caa7c150e173bd6d
---
## 1

On a Linux host with 4 gibibytes of RAM, no swap and default overcommit settings, a program calls malloc for 3 gibibytes, and the call succeeds. What happens next?

A, malloc zeroed all 3 gibibytes up front, evicting the page cache. B, nothing more; the kernel has already reserved 3 gibibytes of frames. C, the next malloc returns null because the host is overcommitted. D, frames are assigned on first touch, and the OOM killer acts if they run out.

[think]

The answer is D: frames are assigned on first touch, and the OOM killer acts if they run out.

Under default overcommit, a successful malloc reserves address space only. No frames are reserved or zeroed. Frames arrive through minor faults on first touch. When touched memory exceeds what reclaim can free, a fault cannot be satisfied, and there is no error path for a plain store, so the OOM killer sends SIGKILL to the highest-scoring process, which may not even be this one.

## 2

During a page-table walk for a user address, the page-directory entry has bit 7, the page-size bit, set. What happens?

A, the walk stops; the entry maps a 2 mebibyte page, and 21 offset bits remain. B, the walk continues to the last level, which is skipped only for 1 gibibyte pages. C, the entry is ignored, and the TLB is refilled from the previous level. D, the MMU raises a page fault, since bit 7 marks the entry invalid.

[think]

The answer is A: the walk stops, and the entry maps a 2 mebibyte page.

Bit 7 in a page-directory entry means the entry maps a 2 mebibyte page directly, so there is no last-level table, and the low 21 bits of the address are the offset. That shorter walk, plus 512 times the TLB reach, is the whole benefit of huge pages. The same bit at the level above maps a 1 gibibyte page. It is not an invalid marker.

## 3

A service does random lookups over a 16 gibibyte in-memory index. Switching the index to 2 mebibyte huge pages makes it noticeably faster. What mostly improved?

A, the L1 cache hit rate, because each page is now contiguous. B, the hardware now prefetches each huge page on first access. C, the index now fits in RAM, because its page tables shrank. D, TLB reach, so most loads no longer pay for a page walk.

[think]

The answer is D: TLB reach, so most loads no longer pay for a page walk.

Huge pages do not change which cache lines are fetched, and there is no whole-page prefetch. They change how much memory the TLB covers, from megabytes to gigabytes, removing most page walks on random access. Measured over 4 gibibytes, loads fell from 166 nanoseconds to 108. Page tables do shrink, but the index already fitted in RAM.

## 4

A JVM in a 2 gibibyte container runs with a maximum heap of 1.5 gibibytes, reports 900 mebibytes of heap used, and is repeatedly OOM-killed with exit code 137. Which diagnosis is most accurate?

A, Kubernetes counts virtual size, which is well above 2 gibibytes. B, heap plus non-heap resident memory exceeds the cgroup limit. C, the heap is leaking, and will throw an out-of-memory error soon. D, exit code 137 means the JVM itself crashed with a segfault.

[think]

The answer is B: heap plus non-heap resident memory exceeds the cgroup limit.

Heap used is a collector statistic. The cgroup charges resident anonymous memory: committed heap pages, metaspace, thread stacks, direct buffers, garbage collector structures and malloc arenas, which together pass 2 gibibytes. 137 is 128 plus 9, the OOM killer's SIGKILL; a segfault gives 139. And virtual size is not charged.

## 5

A service on a swapless Kubernetes node shows a steady 300 major page faults per second. Where are those faults coming from?

A, anonymous heap pages read back in from a swap device. B, evicted file-backed pages, such as code, being re-read. C, first touches of heap memory the service just allocated. D, copy-on-write breaks in child processes of the service.

[think]

The answer is B: evicted file-backed pages, such as code, being re-read.

Without swap, anonymous pages cannot be evicted, so nothing comes back from swap. First touches and copy-on-write breaks are minor faults. So major faults mean file pages, the binary's code, libraries or mapped files, are being dropped and read again: a sign the cgroup or node is close to its memory limit.

## 6

Why do most databases avoid memory-mapping their main, mutable data files?

A, mmap cannot map a data file larger than physical RAM. B, mmap requires huge pages, which database hosts disable. C, reads through mmap copy each page twice via the page cache. D, the kernel controls eviction, write-back order and stalls.

[think]

The answer is D: the kernel controls eviction, write-back order and stalls.

Mmap maps files larger than RAM, needs no huge pages, and avoids copies. The problem is control. Write-ahead logging needs pages to reach disk only after their log records, faults block threads invisibly, and input-output errors arrive as a SIGBUS signal. The database can manage none of that when the kernel services faults and write-back on its own schedule.

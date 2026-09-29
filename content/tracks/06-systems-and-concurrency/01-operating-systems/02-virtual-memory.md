---
slug: virtual-memory
title: "Virtual memory: page tables, the TLB, page faults and the OOM killer"
description: How every pointer is translated through a four-level page table (traced for a real address), what the TLB and huge pages buy you, what minor and major page faults cost on a real machine, how mmap works, and why a container is OOM-killed while its heap looks half empty.
minutes: 50
difficulty: medium
tags: [operating-systems, virtual-memory, paging, tlb, page-faults, mmap, oom]
problems: [lru-cache]
---
Your Java service runs in a container with a 2 GiB memory limit and `-Xmx1536m`. The JVM's metrics say the heap holds 900 MiB. Twice a day Kubernetes restarts it with `OOMKilled` and exit code 137, and there is no `OutOfMemoryError` in the logs, because the JVM never got the chance to throw one. On the same fleet, `ps` reports that a Go sidecar has a virtual size of 34 GiB on a 16 GiB machine, and nothing bad ever happens to it.

Both puzzles have one explanation: the numbers you are looking at measure different layers of virtual memory. An address space is mostly promises. Physical memory is handed out one 4 KiB page at a time, on first touch, by a page fault. And the kernel kills processes based on pages actually backed by RAM, which include far more than your heap. The same mechanism explains huge pages, `mmap`, cold-start latency and why most databases refuse to let the kernel manage their data pages. Numbers below were measured on a Ryzen 9 9950X3D running Linux 6.18 under WSL2, and the lesson says where the virtual machine changes them.

## Every address you have ever printed is virtual

When your program dereferences a pointer, the CPU's memory management unit (MMU) translates the virtual address into a physical address before the load reaches the cache. The translation works in **pages**, 4 KiB on x86-64 and most ARM servers. The low 12 bits of an address are the offset inside the page and pass through unchanged; the high bits are the **virtual page number**, which the MMU maps to a **physical frame number** (PFN).

That indirection buys four things: **isolation** (the same address in two processes is two different bytes of RAM), **laziness** (a mapping can say "not present", so reserving memory is nearly free), **sharing** (one frame can appear in many address spaces: libc's code, copy-on-write pages after `fork`) and **files as memory** (a mapping can be backed by a file).

Each line of `/proc/<pid>/maps` is a **VMA** (virtual memory area): a range, its permissions and what backs it.

```text
55d4c8a00000-55d4c8a2c000 r--p 00000000 103:02 1835021   /usr/bin/myapp
55d4c8a2c000-55d4c8b91000 r-xp 0002c000 103:02 1835021   /usr/bin/myapp
55d4ca1f3000-55d4ca214000 rw-p 00000000 00:00 0         [heap]
7f3a1c000000-7f3a20000000 rw-p 00000000 00:00 0
7f3a2c1e0000-7f3a2c208000 r--p 00000000 103:02 2621560   /usr/lib/x86_64-linux-gnu/libc.so.6
7ffd5a3a2000-7ffd5a3c3000 rw-p 00000000 00:00 0         [stack]
```

`VSZ` in `ps` is the sum of these ranges. `RSS` (resident set size) is the number of pages in them that currently have a physical frame. Go and the JVM reserve large ranges up front and touch them gradually, so a 34 GiB VSZ with a 300 MiB RSS is normal. VSZ tells you almost nothing about memory pressure.

## The page-table walk, traced

x86-64 uses 48-bit virtual addresses (57-bit with five-level paging on recent CPUs, enabled only for processes that ask for high addresses). The 36 bits above the offset are split into four 9-bit indices, one per level of a tree. Each table is one 4 KiB page of 512 eight-byte entries, which is why each level consumes 9 bits: $2^9 = 512$.

Take the address `0x7f3a1c2b5e48`, somewhere in the anonymous mapping above:

```text
bits:     47..39     38..30     29..21     20..12      11..0
        011111110  011101000  011100001  010110101  111001001000
index:     254        232        225        181       3656 (0xe48)
level:     PML4       PDPT        PD         PT       offset
```

Now walk it. The physical addresses below are illustrative (Linux hides real frame numbers in `/proc/self/pagemap` from unprivileged users), but every step is the arithmetic the MMU performs:

1. `CR3` holds the physical address of this process's top-level table: `0x1a3c000`.
2. Entry 254 is at `0x1a3c000 + 254 × 8 = 0x1a3c7f0`. It reads `0x2b4d067`: flags `0x067` (present, writable, user, accessed, dirty) and the next table at `0x2b4d000`.
3. Entry 232 of that table is at `0x2b4d000 + 0x740 = 0x2b4d740`, reading `0x3e12067`: the page directory is at `0x3e12000`.
4. Entry 225 is at `0x3e12000 + 0x708 = 0x3e12708`, reading `0x5f07067`. Bit 7 (page size) is clear, so this points at a last-level table at `0x5f07000`.
5. Entry 181 is at `0x5f07000 + 0x5a8 = 0x5f075a8`, reading `0x800000001388b067`: bit 63 (no-execute) set, frame `0x1388b`.
6. Physical address = `0x1388b000 + 0xe48 = 0x1388be48`. The load finally goes to the cache.

### What the walk tells you

Four dependent memory reads before the one you wanted. If step 4 had found bit 7 set, the entry would describe a 2 MiB page: the walk stops there and the low 21 bits of the address (`0x0b5e48`) become the offset into it. That is all a huge page is: a walk one level shorter.

The flag bits are how the kernel implements the rest of this module: **present** (lazy allocation and swap), **writable** (copy-on-write is a writable region mapped read-only), **user** (kernel memory is invisible to user code), **accessed** and **dirty** (set by hardware, read by the kernel to choose what to evict and what to write back) and **no-execute** (why the heap cannot run shellcode).

The tree is sparse, but not free. Touching 1 GiB with 4 KiB pages grew this process's `VmPTE` (in `/proc/<pid>/status`) by 2,056 KiB: 262,144 leaf entries × 8 bytes, plus the upper levels. Page tables are per process, so PostgreSQL recommends huge pages for large `shared_buffers`: hundreds of backends each mapping the same 64 GiB buffer pool can spend gigabytes on page tables.

## The TLB, and why huge pages exist

Walking four levels on every access would make memory several times slower, so the CPU caches translations in the **TLB** (translation lookaside buffer). Current x86 cores have a first-level data TLB of tens of entries and a second-level TLB of a few thousand. A hit is effectively free; a miss triggers a hardware walk costing tens of cycles if the page-table entries are cached and hundreds if not.

The number to reason with is **TLB reach**: entries × page size. A 2,048-entry TLB covers 8 MiB of 4 KiB pages and 4 GiB of 2 MiB pages. To measure the difference, a C program chased pointers through a random cyclic permutation (every load depends on the previous one, so latency cannot overlap):

| Working set | 4 KiB pages | 2 MiB pages (THP) |
|---|---|---|
| 64 MiB | 86 ns per load | 84 ns per load |
| 4 GiB | 166 ns per load | 108 ns per load |

At 64 MiB the page-table entries themselves stay in cache, so walks are cheap. At 4 GiB almost every load misses the TLB and the walk misses cache too; huge pages remove 58 ns from every load. The gap is inflated here: under WSL2 the guest's page tables are translated again by the hypervisor's own tables (AMD nested paging), so a TLB miss can cost up to 24 memory references instead of 4. On bare metal the same test shows a smaller but still large gap.

### Explicit and transparent huge pages

Linux offers huge pages two ways:

| | Explicit (hugetlbfs) | Transparent huge pages (THP) |
|---|---|---|
| How | Reserved via `vm.nr_hugepages`; app asks with `MAP_HUGETLB` | Kernel backs aligned 2 MiB regions automatically, or when asked with `madvise(MADV_HUGEPAGE)` |
| Who uses it | PostgreSQL `huge_pages=on`, JVM `-XX:+UseLargePages`, DPDK | Anything, silently, when set to `always` |
| Risk | Reserved memory is unavailable to anyone else | Compaction stalls, memory bloat, 2 MiB copy-on-write copies |

THP is the one that bites. To create a 2 MiB page the kernel may have to compact memory first, which can stall an allocation for milliseconds. A 2 MiB page backing 8 KiB of real data wastes the rest. After `fork`, one write to a huge page copies 2 MiB instead of 4 KiB. Redis, on finding THP set to `always`, turns it off for its own process with `prctl(PR_SET_THP_DISABLE)` (its `disable-thp yes` setting) and logs a warning only if that fails, and many database vendors recommend `madvise` or `never`. This machine uses `madvise`, the default many distributions ship:

```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
# always [madvise] never
```

### Switches and shootdowns

Two more TLB effects matter in production. Threads of one process share page tables, so switching between them keeps the TLB; switching processes loads a new `CR3`, and only tagged entries (PCID on x86) survive. And when a multithreaded process unmaps or re-protects memory, every other core running one of its threads must drop stale entries: on bare metal the kernel sends inter-processor interrupts, a **TLB shootdown**, visible in the `TLB` row of `/proc/interrupts`. On this Hyper-V guest that row stays at zero because the kernel asks the hypervisor to flush remote TLBs with a hypercall instead. Allocators that return memory to the OS aggressively can generate thousands of shootdowns per second.

## Page faults: minor, major and invalid

When the MMU finds a not-present entry or a permission violation, it raises a page fault and the kernel decides what it meant:

| Fault | What happened | Measured here |
|---|---|---|
| **Minor** | Satisfied without I/O: first touch of anonymous memory, a page already in the page cache, a copy-on-write break | 1.1 µs per 4 KiB page (2.2 µs the first time the VM touched that RAM) |
| **Major** | Must read from storage: swapped out, or a file page not in the page cache | 137–183 µs per fault on this VM's virtual disk; a few ms on a spinning disk |
| **Invalid** | No VMA covers the address, or the access violates its permissions | `SIGSEGV`, or `SIGBUS` for a mapped file that shrank or hit an I/O error |

Laziness is easy to demonstrate:

```c
#include <stdlib.h>

int main(void) {
    size_t n = 1UL << 30;            /* 1 GiB */
    char *p = malloc(n);             /* returns in microseconds: only address space */
    for (size_t i = 0; i < n; i += 4096)
        p[i] = 1;                    /* every first touch is a minor fault */
    return p[12345];
}
```

Measured with `getrusage`: 262,144 minor faults (1 GiB / 4 KiB), 285 ms, all paid in the loop and none in `malloc`. A second pass over the same, now resident, pages took 7.6 ns per page. With `madvise(MADV_HUGEPAGE)` the same loop took 512 faults and 42 ms, each fault zeroing a whole 2 MiB page. The very first run was twice as slow (568 ms) because Hyper-V was also backing the VM's memory for the first time: a fault inside a fault, invisible to the guest.

### Under the hood: what the kernel does on a fault

1. The CPU pushes an error code (read or write, user or kernel, present or not) and jumps to the fault handler with the faulting address in `CR2`.
2. `handle_mm_fault` looks up the VMA containing the address in the process's tree of regions. None, or wrong permissions: signal the process.
3. Anonymous, first touch, **read**: map the shared, read-only **zero page**. No memory is allocated. A later write takes a copy-on-write fault.
4. Anonymous, first touch, **write**: allocate a frame, zero it (the kernel must not leak another process's data), install a writable entry.
5. File-backed: look the page up in the page cache. Present: map it (a minor fault), usually together with neighbouring cached pages ("fault-around"). Absent: allocate a page, start the read plus readahead, sleep until the I/O completes (a major fault), then map it.
6. Return; the CPU re-executes the faulting instruction, which now succeeds.

Three production consequences follow. **Cold starts are partly page faults**: a fresh process faults in its heap, stacks and code, and code pages are major faults if the binary is not in the page cache, which is why the first deploy to a new node is slower. **You can pay up front instead**: `-XX:+AlwaysPreTouch`, `MAP_POPULATE` (241 ms to populate 1 GiB here, all inside `mmap`) and `mlock` move the faults out of the request path. **Steady major faults are a red flag**: a swapless service with `majflt/s` above zero in `sar -B` is re-reading file pages the kernel evicted under pressure.

## Choosing what to evict

When the kernel needs a free frame, it evicts one. The two animations play the same reference string through three and then four frames under FIFO eviction.

```viz
{"type": "memory", "algorithm": "virtual-memory-paging", "values": [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], "n": 3,
 "title": "Page faults with 3 frames and FIFO eviction",
 "caption": "Twelve accesses, nine faults. Note which page FIFO throws out: the oldest loaded, even when it was just used."}
```

```viz
{"type": "memory", "algorithm": "virtual-memory-paging", "values": [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], "n": 4,
 "title": "The same reference string with 4 frames",
 "caption": "Ten faults. More memory, more faults: Belady's anomaly, which FIFO suffers and LRU cannot."}
```

Trace the four-frame run: 1, 2, 3, 4 fault and fill the frames; 1 and 2 hit; 5 evicts 1 (the oldest load, though it was just used); then 1 evicts 2, 2 evicts 3, 3 evicts 4, 4 evicts 5 and 5 evicts 1. Six more faults, ten in total, against nine with three frames. That is **Belady's anomaly**. LRU is a *stack algorithm*: the pages it holds with $k$ frames are always a subset of those it holds with $k + 1$, so more memory never hurts it.

Exact LRU would mean updating a list on every memory access, which no hardware does. The kernel samples the **accessed bit** the MMU sets instead: the classic **clock** algorithm sweeps frames, clears the bit on pages that have it and evicts the first page found with it already clear. Linux keeps active and inactive lists per page type, and recent kernels use a multi-generational variant (MGLRU). The [LRU cache lesson](/learn/advanced-data-structures/caches-and-eviction/lru-cache) builds the exact version; the page cache is the most heavily used LRU approximation in your fleet.

## When physical memory runs out

**File-backed pages** (the page cache, executable code, mapped files) have a copy on disk: a clean one can be dropped instantly, a dirty one must be written back first. **Anonymous pages** (heap, stacks) have no file behind them; the only way to reclaim one is to write it to swap. On a host with no swap, the usual Kubernetes node configuration, anonymous memory cannot be reclaimed at all.

When the working set exceeds RAM and swap exists, the result is **thrashing**: nearly every access is a major fault and the machine appears hung. `vmstat 1` shows it:

```text
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1 14 3912044  81232   1024  60120 9812 11420 10244 11800 4120 6100  2  6  8 84  0
```

Fourteen threads blocked (`b`), 84% of CPU time waiting on I/O (`wa`), megabytes per second through swap (`si`/`so`). Many fleets run without swap because a process killed and restarted quickly beats a node that takes ten minutes to die.

Two reading rules for memory graphs. In `free -h`, `free` is supposed to be small (idle RAM is wasted, so the kernel fills it with page cache); `available` is the number that says how much could be handed out. And RSS double-counts shared pages: twenty prefork workers sharing 200 MiB each report it. **PSS** (proportional set size, in `/proc/<pid>/smaps_rollup`) divides shared pages among their sharers and is the number to add up.

## mmap: files as memory

`mmap` on a file creates a VMA backed by that file. The first access to each page faults; the kernel finds the page in the page cache (reading it if needed) and maps that same frame into your address space. No `read()` call and no copy into a user buffer: your process and the page cache share the frame.

```python
import mmap

with open("events.bin", "rb") as f, \
     mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as m:
    header = m[:16]              # a page fault, not a read() call
    pos = m.find(b"\x00\xff")    # scans the file as if it were bytes in RAM
```

Measured on a 1 GiB file here: mapping it while cached cost 916 minor faults, about 1 MiB mapped per fault on average (fault-around maps up to 64 KiB of cached neighbours by default, and a 2 MiB page-cache folio can be mapped whole with one page-directory entry), so 10 ns per page amortised; a cached 4 KiB `pread` cost 0.54 µs; an uncached one 118 µs; and a random-access mapped read that missed the cache, 137–183 µs, all of it invisible to the code that did it. These disk numbers come from a virtual disk file on the Windows host and can be flattered by the host's own cache; a local NVMe SSD typically answers a random 4 KiB read in tens of microseconds to about 100 µs, depending on the drive and its queue depth.

### Why databases refuse it

Lucene's `MMapDirectory`, LMDB, Kafka's index files, Prometheus TSDB blocks and model loaders such as llama.cpp rely on `mmap`. Most databases still refuse it for their main mutable data, for reasons that come from the mechanism:

- **Faults block invisibly.** A memory access can take a disk read's time, and there is no way to make it asynchronous. An event-loop thread that touches a cold page stalls every connection it owns.
- **The kernel decides eviction and write-back.** It may write a dirty page before the write-ahead log record that describes it, and correct logging needs that order under the database's control.
- **Errors become signals.** An I/O error on a mapped page arrives as `SIGBUS`.
- **Eviction in a multithreaded process means TLB shootdowns.**

The 2022 CIDR paper "Are You Sure You Want to Use MMAP in Your Database Management System?" makes the case in detail, and MongoDB replaced its mmap-based engine with WiredTiger.

| | `read`/`pread` into a buffer | `mmap` | `O_DIRECT` with own cache |
|---|---|---|---|
| Copies | One, page cache to buffer | None | None (DMA into your buffer) |
| Cache miss visible to code | Yes, a slow call you can time or offload | No, a stall on a load | Yes |
| Eviction control | Kernel, plus `fadvise` hints | Kernel, plus `madvise` hints | Yours |
| Write ordering | `write` then `fsync` in your order | Kernel may write back any time | Yours |
| I/O errors | Return codes | `SIGBUS` | Return codes |
| Good for | General files | Immutable, read-mostly files | Databases with a buffer pool |

Anonymous `mmap` is how allocators get memory in the first place. glibc `malloc` gives each allocation above a threshold (128 KiB initially, raised dynamically as such blocks are freed) its own mapping and unmaps it on `free`, so a service that allocates and frees 1 MiB buffers repeatedly pays a system call, 256 minor faults and a possible shootdown each time. Pooling buffers avoids it.

## Overcommit and the OOM killer

Linux **overcommits**. With `vm.overcommit_memory = 0` (the default, and this machine's setting) `malloc` and `mmap` succeed for any request that is not absurd relative to RAM plus swap; `1` never refuses; `2` enforces a strict commit limit. The bill arrives at page-fault time. If a fault needs a frame and reclaim finds none, there is no error path for `p[i] = 1`, so the kernel invokes the **OOM killer**, which picks the process with the highest `oom_score` (roughly its resident footprint, adjusted by `oom_score_adj` from −1000 to 1000) and sends `SIGKILL`. Exit code 137 is 128 + 9.

In a container the limit is a memory cgroup (`memory.max` in cgroup v2), charged for anonymous memory, the page cache the cgroup brought in, and some kernel memory such as socket buffers. At the limit the kernel reclaims the cgroup's page cache first, then kills a process *inside the cgroup*. Reproduced here with `systemd-run --user --scope -p MemoryMax=200M -p MemorySwapMax=0` around a Python loop appending 10 MiB `bytearray`s: the last line printed was 150 MiB, the exit status was 137 with no Python traceback, and the cgroup's `memory.events` read `max 36`, `oom 1`, `oom_kill 1` (the limit was hit 36 times and reclaim coped 35 of them).

Now return to the opening. The kernel does not know what a heap is. The container's anonymous RSS is the Java heap (up to the full 1,536 MiB once the collector has touched it; "used: 900 MiB" is a collector statistic, and committed pages stay resident), plus metaspace and the JIT code cache, thread stacks, GC bookkeeping (often 5–10% of the heap), direct `ByteBuffer`s used by Netty and gRPC, and glibc malloc arenas for native libraries (up to eight per core, each retaining freed memory). That sum crosses 2 GiB without a leak. Budget it: heap as a fraction of the limit (`-XX:MaxRAMPercentage=60` to `75`), cap direct memory, `MALLOC_ARENA_MAX=2`, measure the rest with Native Memory Tracking, and alert on the cgroup's `anon` in `memory.stat`, not on heap used. Go's `GOMEMLIMIT` and Node's `--max-old-space-size` likewise bound only what the language runtime manages.

## Failure modes in production

**Symptom: `OOMKilled`, exit 137, no language-level out-of-memory error.** Diagnosis: `memory.events` shows `oom_kill`; compare `anon` in `memory.stat` against the heap metric; the gap is native memory. Fix: budget the non-heap components against the limit, as above.

**Symptom: random multi-millisecond latency spikes in a service that allocates a lot, worse after days of uptime.** Diagnosis: `/proc/vmstat` shows `compact_stall` and `thp_fault_alloc` rising; THP is `always` and the kernel is compacting fragmented memory inside page faults. Fix: THP to `madvise` (or `never` for the database), `defrag` to `defer`.

**Symptom: a swapless pod's latency degrades as it approaches its memory limit, with steady major faults.** Diagnosis: `memory.stat` shows `workingset_refault_file` climbing: the cgroup keeps evicting and re-reading its own code and mapped files. Fix: raise the limit or cut anonymous memory; the kernel can only squeeze file pages.

**Symptom: `mmap` fails with `ENOMEM` ("Cannot allocate memory") while gigabytes are free.** Diagnosis: `wc -l /proc/<pid>/maps` is near `vm.max_map_count` (the kernel default is 65,530; Elasticsearch's current documentation asks for 1,048,576, and 7.x asked for 262,144): every mapping counts, including each thread's stack. Fix: raise the sysctl or use fewer, larger mappings.

**Symptom: high system CPU on a many-threaded allocator-heavy service, `TLB` interrupts climbing on bare metal.** Diagnosis: the allocator returns memory with `madvise(MADV_DONTNEED)` or `munmap` at a high rate, forcing shootdowns on every core running the process. Fix: raise the allocator's decay time (jemalloc `dirty_decay_ms`), pool large buffers.

## Interviewer follow-ups

**"Walk me through what happens on `p[0] = 1` right after `malloc(1 GiB)`."** Model answer: the address is in a VMA but has no page-table entry; the MMU faults, the kernel finds the VMA, allocates and zeroes a frame, installs a writable entry and restarts the instruction; about a microsecond, and the next 262,143 pages each do the same on first touch. Common wrong answer: "malloc already allocated the memory, so the store just writes to RAM".

**"Why do huge pages speed up a large in-memory index?"** Model answer: they multiply TLB reach by 512 and shorten the walk by a level, so random access stops paying a page walk per load (166 ns versus 108 ns per load measured over 4 GiB here); they do not change which cache lines are fetched. Common wrong answer: "the data becomes contiguous, so the cache works better".

**"Should a database use `mmap` for its data files?"** Model answer: for immutable or read-mostly files it is simple and zero-copy; for mutable data it hands eviction, write-back order, stalls and error reporting to the kernel, which breaks write-ahead logging guarantees and makes cold reads invisible. Common wrong answer: "yes, it avoids copies so it is always faster".

**"A process's RSS is 3 GiB and its heap is 1 GiB. Where is the rest?"** Model answer: check `smaps_rollup` for anonymous versus file and shared pages; the rest is code and mapped files (possibly shared, so use PSS), thread stacks, allocator arenas and retained free memory, runtime metadata and native buffers. Common wrong answer: "a memory leak in the heap".

## What mid-level engineers get wrong

- **Alerting on heap used instead of cgroup `anon`.** Consequence: OOM kills that arrive with no warning on the dashboard.
- **Adding up RSS across processes that share memory.** Consequence: capacity plans that double-count shared code and copy-on-write pages; use PSS.
- **Treating a successful `malloc` as a reservation.** Consequence: an OOM kill at first touch, possibly of a different process.
- **Leaving THP on `always` for Redis or a database.** Consequence: compaction stalls and 2 MiB copy-on-write copies during snapshots.
- **Using `mmap` for mutable data and assuming writes are ordered.** Consequence: pages written back before their log records, and `SIGBUS` on I/O errors.
- **Reading `free` instead of `available`.** Consequence: panicking about a healthy host whose RAM is page cache.

## Exercises

```exercise
id: page-table-indices
title: Split an address into page-table indices
prompt: |
  On x86-64 with 4-level paging and 4 KiB pages, a 48-bit virtual address is
  split into four 9-bit table indices and a 12-bit page offset:

  bits 47..39 = PML4 index, 38..30 = PDPT index, 29..21 = PD index,
  20..12 = PT index, 11..0 = offset.

  Return `[pml4, pdpt, pd, pt, offset]` for the non-negative integer `addr`
  (always below 2^48).

  JavaScript note: bitwise operators work on 32-bit integers, so `addr >> 39`
  silently gives the wrong answer for real addresses. Use `Math.floor` and `%`
  (or `BigInt`).
languages: [python, javascript]
entry: page_table_indices
starter:
  python: |
    def page_table_indices(addr):
        # your code here
        return [0, 0, 0, 0, 0]
  javascript: |
    function page_table_indices(addr) {
      // your code here
      return [0, 0, 0, 0, 0];
    }
tests:
  - args: [0]
    expected: [0, 0, 0, 0, 0]
    label: address zero
  - args: [4096]
    expected: [0, 0, 0, 1, 0]
    label: second page
  - args: [2097152]
    expected: [0, 0, 1, 0, 0]
    label: 2 MiB boundary
  - args: [139887557434952]
    expected: [254, 232, 225, 181, 3656]
    label: 0x7f3a1c2b5e48 from the lesson
  - args: [140737488355327]
    expected: [255, 511, 511, 511, 4095]
    label: top of user space
  - args: [140726117343032]
    expected: [255, 501, 209, 449, 3896]
    hidden: true
  - args: [94372387361332]
    expected: [171, 339, 69, 1, 564]
    hidden: true
hints:
  - "The offset is addr mod 4096. The page number is addr divided by 4096 (integer division)."
  - "Each index is (page number divided by 512^k) mod 512 for k = 3, 2, 1, 0."
  - "In Python, (addr >> 39) & 511 works. In JavaScript use Math.floor(addr / 2 ** 39) % 512."
```

```exercise
id: count-page-faults
title: FIFO versus LRU page replacement
prompt: |
  Simulate a machine with `frames` physical frames, initially empty, running
  the page reference string `refs`. Every reference to a page that is not
  resident is a fault; if all frames are full, evict one page first.

  `policy` is `"fifo"` (evict the page that was loaded earliest; hits do not
  change the order) or `"lru"` (evict the page whose most recent use is
  oldest; every hit refreshes the page).

  Return the number of faults. The tests include Belady's anomaly.
languages: [python, javascript]
entry: count_page_faults
starter:
  python: |
    def count_page_faults(refs, frames, policy):
        # your code here
        return 0
  javascript: |
    function count_page_faults(refs, frames, policy) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 3, "fifo"]
    expected: 9
  - args: [[1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 4, "fifo"]
    expected: 10
    label: Belady's anomaly, more frames and more faults
  - args: [[1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 3, "lru"]
    expected: 10
  - args: [[1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], 4, "lru"]
    expected: 8
    label: LRU never gets worse with more frames
  - args: [[], 3, "lru"]
    expected: 0
    label: empty reference string
  - args: [[7, 7, 7], 1, "fifo"]
    expected: 1
  - args: [[7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2], 3, "fifo"]
    expected: 10
    hidden: true
  - args: [[7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2], 3, "lru"]
    expected: 9
    hidden: true
hints:
  - "Keep the resident pages in a list ordered from 'evict next' to 'evict last'."
  - "On a hit under LRU, move the page to the 'evict last' end; under FIFO, leave the order alone."
  - "On a fault, if the list already holds `frames` pages, remove the first one, then append the new page."
```

## Senior signals

- You read VSZ as reserved address space, RSS as resident pages and PSS as the fair share, and you never add up RSS across processes that share memory.
- You can walk a four-level translation by hand, entry address by entry address, and say where a 2 MiB page ends the walk early.
- You state TLB reach for 4 KiB versus 2 MiB pages, cite a measured page-walk penalty, and know virtualisation (nested paging) makes TLB misses dearer.
- You quote a minor fault at about a microsecond and a major fault at a storage read, watch `majflt` on swapless services, and pre-fault memory when first-request latency matters.
- You can argue both sides of `mmap`: zero copies for immutable files, invisible blocking and lost write ordering for mutable pages.
- You explain an `OOMKilled` container as a cgroup charge for anonymous memory plus page cache, read `memory.events`, and budget heap, direct buffers, stacks, metaspace and allocator arenas against the limit.

## Check yourself

```quiz
- q: >-
    On a Linux host with 4 GiB of RAM, no swap and default overcommit settings, a program calls malloc for 3 GiB and the call succeeds. What happens next?
  options: ["malloc zeroed all 3 GiB up front, evicting the page cache", "Nothing more; the kernel has already reserved 3 GiB of frames", "The next malloc returns NULL because the host is overcommitted", "Frames are assigned on first touch; the OOM killer acts if they run out"]
  answer: 3
  explanation: >-
    Under the default heuristic overcommit, a successful malloc reserves address space only; no frames are reserved or zeroed. Frames are assigned by minor faults on first touch. When touched memory exceeds what reclaim can free, a fault cannot be satisfied and there is no error path for a store, so the OOM killer sends SIGKILL to the highest-scoring process, which may not be this one.
- q: >-
    During a page-table walk for a user address, the page-directory entry has bit 7 (page size) set. What happens?
  options: ["The walk stops; the entry maps a 2 MiB page and 21 offset bits remain", "The walk continues to the last level, which is skipped only for 1 GiB pages", "The entry is ignored and the TLB is refilled from the previous level", "The MMU raises a page fault, since bit 7 marks the entry invalid"]
  answer: 0
  explanation: >-
    Bit 7 in a page-directory entry means the entry maps a 2 MiB page directly, so there is no last-level table and the low 21 bits of the address are the offset. That shorter walk plus 512 times the TLB reach is the whole benefit of huge pages. The same bit at the level above maps a 1 GiB page. It is not an invalid marker.
- q: >-
    A service does random lookups over a 16 GiB in-memory index. Switching the index to 2 MiB huge pages makes it noticeably faster. What mostly improved?
  options: ["The L1 cache hit rate, because each page is now contiguous", "The hardware now prefetches each 2 MiB page on first access", "The index now fits in RAM because its page tables shrank", "TLB reach, so most loads no longer pay for a page walk"]
  answer: 3
  explanation: >-
    Huge pages do not change which cache lines are fetched, and there is no whole-page prefetch. They change how much memory the TLB covers, from megabytes to gigabytes, removing most page walks on random access; measured here over 4 GiB, loads fell from 166 ns to 108 ns. Page tables do shrink, but the index already fitted in RAM.
- q: >-
    A JVM in a 2 GiB container runs with -Xmx1536m, reports 900 MiB of heap used, and is repeatedly OOMKilled with exit code 137. Which is the most accurate diagnosis?
  options: ["Kubernetes counts virtual size, which is well above 2 GiB", "Heap plus non-heap resident memory exceeds the cgroup limit", "The heap is leaking and will throw OutOfMemoryError soon", "Exit code 137 means the JVM itself crashed with a segfault"]
  answer: 1
  explanation: >-
    Used heap is a collector statistic. The cgroup charges resident anonymous memory: committed heap pages, metaspace, stacks, direct buffers, GC structures and malloc arenas, which together pass 2 GiB. 137 is 128 plus SIGKILL, the OOM killer's signal; a segfault gives 139. Virtual size is not charged.
- q: >-
    A service on a swapless Kubernetes node shows a steady 300 major page faults per second. Where are those faults coming from?
  options: ["Anonymous heap pages read back in from a swap device", "Evicted file-backed pages, such as code, being re-read", "First touches of heap memory the service just allocated", "Copy-on-write breaks in child processes of the service"]
  answer: 1
  explanation: >-
    Without swap, anonymous pages cannot be evicted, so nothing comes back from swap; first touches and copy-on-write breaks are minor faults. Major faults therefore mean file pages (the binary's code, libraries or mapped files) are being dropped and re-read, a sign the cgroup or node is close to its memory limit.
- q: >-
    Why do most databases avoid mmap for their main, mutable data files?
  options: ["mmap cannot map a data file larger than physical RAM", "mmap requires huge pages, which database hosts disable", "Reads through mmap copy each page twice via the page cache", "The kernel controls eviction, write-back order and stalls"]
  answer: 3
  explanation: >-
    mmap maps files larger than RAM, needs no huge pages and avoids copies. The problem is control: write-ahead logging needs pages to reach disk only after their log records, faults block threads invisibly, and I/O errors arrive as SIGBUS, none of which the database can manage when the kernel services faults and write-back on its own schedule.
```

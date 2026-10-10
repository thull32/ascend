---
lesson: virtual-memory
source: 7ded6f9f105bc94c
fit: partial
desk:
  - "The page-table walk for a real address, entry by entry, and the maps file listing"
  - "The FIFO animations showing Belady's anomaly"
  - "The mmap versus read versus direct I/O comparison table"
  - "Exercises: split an address into page-table indices, and count page faults under FIFO and LRU"
---
## Introduction

Your Java service runs in a container with a 2 gibibyte memory limit and a maximum heap of 1.5 gibibytes. The JVM's metrics say the heap holds 900 mebibytes. Twice a day Kubernetes kills it, exit code 137, and there is no out-of-memory error in the logs, because the JVM never got the chance to throw one. On the same fleet, a Go sidecar reports a virtual size of 34 gibibytes on a 16 gibibyte machine, and nothing bad ever happens to it.

Both puzzles have one explanation. The numbers you are looking at measure different layers of virtual memory. An address space is mostly promises. Physical memory is handed out one 4 kibibyte page at a time, on first touch, by a page fault. And the kernel kills processes based on pages actually backed by RAM, which include far more than your heap.

Four ideas, then: how an address is translated and why huge pages help, what a page fault costs, why databases distrust memory-mapped files, and what really gets a container killed. The numbers were measured on one machine running Linux under WSL2, a virtual machine, and you will hear where that matters.

## Every address is virtual

When your program follows a pointer, the CPU's memory management unit translates the virtual address into a physical one before the load reaches the cache. It works in pages, 4 kibibytes on most servers. The low 12 bits of an address are the offset inside the page and pass through unchanged. The high bits are the page number, which maps to a physical frame.

That indirection buys four things. Isolation: the same address in two processes is two different bytes of RAM. Laziness: a mapping can say "not present", so reserving memory is nearly free. Sharing: one physical frame can appear in many address spaces, like the C library's code. And files as memory: a mapping can be backed by a file.

This explains the Go sidecar. Virtual size is the sum of all the ranges a process has reserved. Resident set size is the number of pages that currently have a physical frame behind them. Go and the JVM reserve huge ranges up front and touch them gradually, so 34 gibibytes virtual and 300 mebibytes resident is normal. Virtual size tells you almost nothing about memory pressure.

## The walk and the TLB

How does the translation actually happen? On x86, the page number is split into four 9-bit indexes, one per level of a tree. Each table in the tree is exactly one 4 kibibyte page holding 512 eight-byte entries, and that is why each level consumes 9 bits: 2 to the 9th is 512. The hardware starts at the top-level table, uses the first index to pick an entry, which points to the next table, and so on, four levels down to the physical frame.

Four dependent memory reads before the one you wanted. Each entry also carries flag bits, and those flags are how the kernel implements everything else: present, which gives laziness and swap; writable, which gives copy-on-write; user, which hides kernel memory; accessed and dirty, set by hardware so the kernel can choose what to evict; and no-execute.

Walking four levels on every access would make memory several times slower, so the CPU caches translations in the TLB, the translation lookaside buffer. A hit is effectively free. A miss costs a walk: tens of cycles if the table entries are in cache, hundreds if not.

Here is the number to reason with: TLB reach, which is entries times page size. A 2,048-entry TLB covers 8 mebibytes of 4 kibibyte pages, and 4 gibibytes of 2 mebibyte pages.

And here is what a huge page is. If the walk finds a particular bit set at the third level, that entry maps a whole 2 mebibyte page and the walk stops early. That is all a huge page is: a walk one level shorter, and 512 times the TLB reach.

The lesson measured it with a pointer chase, each load depending on the last. Over 64 mebibytes, 4 kibibyte and 2 mebibyte pages were about the same, around 85 nanoseconds a load. Over 4 gibibytes, small pages cost 166 nanoseconds a load and huge pages 108. Huge pages removed 58 nanoseconds from every single load. The gap is inflated under a virtual machine, where a TLB miss is translated twice, but on bare metal it is still large.

Linux offers huge pages two ways. Explicit ones, reserved up front, used by PostgreSQL and the JVM when you ask. And transparent huge pages, which the kernel creates on its own. The transparent ones are what bite. To build a 2 mebibyte page the kernel may have to compact memory first, which can stall an allocation for milliseconds. A huge page backing 8 kibibytes of real data wastes the rest. And after a fork, one write to a huge page copies 2 mebibytes instead of 4 kibibytes. Redis turns them off for its own process, and many database vendors recommend the setting called madvise, or never.

## Page faults

When the hardware finds a not-present entry or a permission violation, it raises a page fault, and the kernel decides what it meant. There are three kinds.

A minor fault is satisfied without I/O: the first touch of fresh memory, a file page already in the page cache, a copy-on-write break. About 1.1 microseconds per page here. A major fault must read from storage: a swapped-out page, or a file page not in the cache. 137 to 183 microseconds on this virtual disk, a few milliseconds on a spinning disk. And an invalid fault, an address nothing covers, becomes a segmentation fault.

Laziness is easy to demonstrate. Malloc 1 gibibyte: it returns in microseconds, because it only reserved address space. Then write one byte to every page. Before I tell you: where does the time go?

[pause]

All of it goes into the loop. 262 thousand minor faults, one per page, 285 milliseconds in total, and nothing at all in malloc. A second pass over the same, now resident, pages took under 8 nanoseconds per page. With huge pages requested, the same loop took 512 faults and 42 milliseconds.

On a fresh anonymous page, the kernel allocates a frame and zeroes it, because it must not leak another process's data. A first read of fresh memory doesn't even allocate; it maps a shared, read-only page of zeros.

Three production consequences. Cold starts are partly page faults, which is why the first deploy to a new node is slower. You can pay up front instead, by pre-touching the heap or populating a mapping when you create it, which moves the faults out of the request path. And steady major faults on a service with no swap are a red flag: the kernel is evicting and re-reading file pages, like your own code, under memory pressure.

## Eviction and running out

When the kernel needs a free frame, it evicts one. Exact LRU would mean updating a list on every memory access, which no hardware does. So the kernel samples the accessed bit instead. The classic clock algorithm sweeps the frames, clears the bit on pages that have it, and evicts the first page it finds with the bit already clear.

The lesson also shows a strange result for FIFO eviction: the same sequence of page accesses causes nine faults with three frames and ten with four. More memory, more faults. That is Belady's anomaly. LRU cannot suffer it, because the pages it holds with k frames are always a subset of those it holds with one more frame. The animations are worth watching at your desk.

What can be reclaimed? File-backed pages, like the page cache and code, have a copy on disk, so a clean one can be dropped instantly. Anonymous pages, the heap and stacks, have nothing behind them except swap. On a node with no swap, the usual Kubernetes setup, anonymous memory cannot be reclaimed at all.

Two reading rules for memory graphs. In the free command, "free" is supposed to be small, since idle RAM is wasted and the kernel fills it with page cache; "available" is the number that matters. And resident size double-counts shared pages. Twenty worker processes sharing 200 mebibytes each report all 200. The proportional set size divides shared pages among their sharers and is the number to add up.

## mmap, and why databases refuse it

Memory-mapping a file creates a region backed by that file. The first access to each page faults, the kernel finds the page in the page cache, and maps that same frame into your address space. No read call, no copy into a buffer. Your process and the page cache share the frame.

Lucene, LMDB, Kafka's index files and model loaders rely on it. But most databases refuse it for their main mutable data, and every reason comes from the mechanism. Faults block invisibly: an ordinary memory access can take a disk read's time, and you cannot make it asynchronous, so an event-loop thread touching a cold page stalls every connection it owns. The kernel decides eviction and write-back, so it may write a dirty page before the write-ahead log record that describes it, and correct logging needs that order under the database's control. I/O errors arrive as a signal, not a return code. And eviction in a multithreaded process forces every core running it to flush translations.

The rule: memory mapping is great for immutable, read-mostly files. For mutable data, a database wants its own buffer pool.

## The OOM killer

Linux overcommits. By default, malloc succeeds for any request that is not absurd, and the bill arrives at page-fault time. If a fault needs a frame and reclaim finds none, there is no error path for an ordinary store into memory. So the kernel invokes the OOM killer, which picks the process with the highest score, roughly its resident footprint, and sends SIGKILL. Exit code 137 is 128 plus 9, the number of SIGKILL.

In a container, the limit is a memory cgroup, charged for anonymous memory, the page cache the cgroup brought in, and some kernel memory like socket buffers. At the limit the kernel reclaims the cgroup's page cache first, then kills a process inside the cgroup.

Now back to the Java service. The kernel does not know what a heap is. The container's anonymous memory is the heap, up to the full 1.5 gibibytes once the collector has touched it, because "900 used" is a collector statistic and committed pages stay resident. Plus metaspace and compiled code. Plus thread stacks. Plus garbage collector bookkeeping, often 5 to 10 percent of the heap. Plus direct buffers used by networking libraries. Plus malloc arenas for native code, up to eight per core. That sum crosses 2 gibibytes without a leak.

The fix is a budget. Set the heap as a fraction of the limit, 60 to 75 percent. Cap direct memory. Limit malloc arenas to 2. Measure the rest with the JVM's native memory tracking. And alert on the cgroup's anonymous memory, not on heap used. Go's and Node's memory limits likewise bound only what the language runtime manages.

## In the interview

Here is a follow-up the lesson expects. Walk me through what happens on the first write to memory right after a 1 gibibyte malloc.

[pause]

The address is inside a reserved region but has no page-table entry. The hardware faults, the kernel finds the region, allocates and zeroes a frame, installs a writable entry, and restarts the instruction. About a microsecond. And the next 262 thousand pages each do the same on first touch. The wrong answer is that malloc already allocated the memory, so the store just writes to RAM.

And: why do huge pages speed up a large in-memory index? They multiply TLB reach by 512 and shorten the walk by a level, so random access stops paying a page walk per load. They do not change which cache lines are fetched. The wrong answer is that the data becomes contiguous, so the cache works better.

## Recap

Four things to remember. Virtual size is reserved address space and means little; resident size is real frames; proportional size is the fair share to add up. Huge pages matter because of TLB reach: 512 times more memory covered, and one level less to walk. Memory is assigned on first touch by a minor fault of about a microsecond, and major faults on a swapless service mean file pages are being re-read under pressure. And a container is killed for heap plus everything else that is resident, so budget the non-heap parts and alert on the cgroup, not the heap.

At your desk: the page-table walk for a real address, the FIFO animations, the mmap comparison table, and the two exercises on page-table indices and page-fault counting.

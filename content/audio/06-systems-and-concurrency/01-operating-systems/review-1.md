---
review: operating-systems
source: 122c6c1ad9c1436f
---
## Introduction

Twelve questions from the operating-systems module. Answer out loud before the answer comes.

Three from each lesson, in order: processes and threads, virtual memory, I/O and system calls, and filesystems and storage. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Strace shows a new task created with clone3, with four flags: share the address space, share the file descriptors, share the signal handlers, and join the caller's thread group. What was created?

A, a thread sharing memory and descriptors. B, a container with its own process ID namespace. C, a vfork child that borrows memory until it calls exec. D, a process with a copy-on-write address space.

[think]

The answer is A: a thread sharing memory and descriptors.

Those flags share the address space, the descriptor table and the handlers, and put the task in the caller's thread group, so getpid returns the same value. That is what creating a pthread does. Fork passes none of these flags and copies everything. A container adds the new-namespace flags. And vfork shares the address space with a different flag, not the thread-group one.

## Question 2

A process with 1 gibibyte of memory forks a child that exits immediately. Measured, that takes about 31 milliseconds, while posix spawn from the same parent takes about half a millisecond. Where does fork spend the time?

A, writing the parent's dirty pages to swap first. B, copying 1 gibibyte of memory into the child's new frames. C, copying page-table entries for every resident page. D, flushing every CPU's TLB for the parent's pages.

[think]

The answer is C: copying page-table entries for every resident page.

Fork duplicates the page tables and bumps a reference count per resident page, about 120 nanoseconds for each of 262 thousand pages. No data is copied until someone writes; that is copy-on-write. Posix spawn lends the child the parent's address space, so there are no page tables to copy. Swap is not involved, and the TLB work is small next to the per-page walk.

## Question 3

A Python service runs in a container with a CPU limit of 2, on a 32-core host. It uses a process pool executor with its default worker count. Latency spikes with a flat top near 100 milliseconds, while average CPU looks fine. Why?

A, the GIL serialises the 32 worker processes onto one core. B, Python sees 32 CPUs, so 32 busy workers burn the quota early. C, the kernel swaps the idle workers out between requests. D, each worker's fork copies the parent's page tables on every request.

[think]

The answer is B: Python sees 32 CPUs, so 32 busy workers burn the quota early.

CPython's CPU count ignores the cgroup quota, so the pool starts 32 processes. Together they burn the 200 milliseconds of CPU allowed per 100 millisecond period within a few milliseconds, and the whole cgroup is throttled until the period ends. Processes don't share a GIL, the quota doesn't swap anything out, and a pool forks once at start-up, not per request.

## Question 4

On a Linux host with 4 gibibytes of RAM, no swap and default overcommit settings, a program calls malloc for 3 gibibytes, and the call succeeds. What happens next?

A, malloc zeroed all 3 gibibytes up front, evicting the page cache. B, nothing more; the kernel has already reserved 3 gibibytes of frames. C, the next malloc returns null because the host is overcommitted. D, frames are assigned on first touch, and the OOM killer acts if they run out.

[think]

The answer is D: frames are assigned on first touch, and the OOM killer acts if they run out.

Under default overcommit, a successful malloc reserves address space only. No frames are reserved or zeroed. Frames arrive through minor faults, one page at a time, on first touch. When touched memory exceeds what reclaim can free, there is no error path for a plain store, so the OOM killer sends SIGKILL to the highest-scoring process, which may not even be this one.

## Question 5

A JVM in a 2 gibibyte container runs with a maximum heap of 1.5 gibibytes, reports 900 mebibytes of heap used, and is repeatedly OOM-killed with exit code 137. Which diagnosis is most accurate?

A, Kubernetes counts virtual size, which is well above 2 gibibytes. B, heap plus non-heap resident memory exceeds the cgroup limit. C, the heap is leaking and will throw an out-of-memory error soon. D, exit code 137 means the JVM itself crashed with a segfault.

[think]

The answer is B: heap plus non-heap resident memory exceeds the cgroup limit.

Heap used is a collector statistic. The cgroup charges resident anonymous memory: committed heap pages, metaspace, thread stacks, direct buffers, garbage collector structures and malloc arenas, which together pass 2 gibibytes. 137 is 128 plus 9, the OOM killer's SIGKILL; a segfault gives 139. And virtual size is not charged.

## Question 6

A service on a swapless Kubernetes node shows a steady 300 major page faults per second. Where are those faults coming from?

A, anonymous heap pages read back in from a swap device. B, evicted file-backed pages, such as code, being re-read. C, first touches of heap memory the service just allocated. D, copy-on-write breaks in child processes of the service.

[think]

The answer is B: evicted file-backed pages, such as code, being re-read.

Without swap, anonymous pages can't be evicted, so nothing comes back from swap. First touches and copy-on-write breaks are minor faults, with no I/O. So major faults mean file pages, the binary's code, libraries or mapped files, are being dropped and read again: a sign the cgroup or node is close to its memory limit.

## Question 7

Why does epoll wait cost about the same with 50 thousand idle descriptors as with 10, when poll grows to milliseconds?

A, epoll keeps descriptors in a hash table with constant-time lookups. B, a wait-queue callback fills a ready list that epoll wait drains. C, epoll runs a kernel thread that polls every socket continuously. D, poll is capped at 1,024 descriptors, so it rescans in blocks.

[think]

The answer is B: a wait-queue callback fills a ready list that epoll wait drains.

Poll copies in and scans the whole array on every call, about 45 nanoseconds per descriptor. Epoll registers each socket once, hooking a callback onto its wait queue. When data arrives, the callback appends that socket to the ready list, and epoll wait only copies the list out. The 1,024 cap belongs to select, and epoll's interest set is a red-black tree, not a hash table.

## Question 8

A server uses edge-triggered epoll and makes one 4 kibibyte read per notification. A client sends a 10 thousand byte request and waits for the reply. What happens?

A, the receive buffer truncates the request to 4 kibibytes. B, the kernel drops the bytes that do not fit in one read. C, epoll reports the socket again until it is fully drained. D, 5,904 bytes stay unread until the client sends more.

[think]

The answer is D: 5,904 bytes stay unread until the client sends more.

The whole arrival is one edge. After one read, edge-triggered mode does not re-queue the socket, so no notification comes until new data arrives, and the client is waiting for a reply, so that may be never. Nothing is dropped or truncated, and level-triggered mode would have reported it again. The fix is to read until the call says "try again".

## Question 9

A Node service with low CPU usage shows rising latency on endpoints that read small files and resolve hostnames with dns lookup. What is the likely bottleneck?

A, libuv's 4-thread pool, shared by file calls and getaddrinfo. B, TCP congestion control throttling the DNS replies. C, the epoll ready list growing faster than it drains. D, garbage collection pausing the event-loop thread.

[think]

The answer is A: libuv's 4-thread pool, shared by file calls and getaddrinfo.

Regular files and the blocking resolver cannot use readiness-based I/O, so Node's libuv runs them on a pool of 4 threads by default. When those are busy, new file and DNS work queues behind them while the main thread sits idle. Garbage collection pauses would show up as CPU time. Raising the pool size, or using the asynchronous resolver, helps.

## Question 10

A service writes a temporary state file, fsyncs it, renames it over the real state file, and returns success. After a power failure, the state file holds the old contents. Which step was missing?

A, calling close on the temporary file before the rename. B, an fsync of the state file itself once the rename completes. C, an fsync of the parent directory after the rename. D, opening the temporary file in append mode instead of truncating it.

[think]

The answer is C: an fsync of the parent directory after the rename.

The rename changes the directory, which is a separate file with its own dirty state. Without fsyncing the directory, the new name may never reach disk, so after the crash the old entry is still there. Fsyncing the state file again would only flush data that was already durable, and close doesn't flush anything.

## Question 11

Measured on ext4, fdatasync after a 4 kibibyte append took about 4.5 milliseconds, the same as fsync, while fdatasync after overwriting preallocated blocks took 2. Why?

A, an append changes the file size, so a journal commit is required. B, appends must first read the old block from disk before writing it. C, fdatasync is just another name for fsync on ext4. D, overwrites skip the device cache flush, which appends always need.

[think]

The answer is A: an append changes the file size, so a journal commit is required.

Fdatasync may skip metadata that isn't needed to read the data back, but the size is needed. So an append forces a journal transaction, data, flush, journal and commit block, just like fsync. An in-place overwrite changes no needed metadata, and costs one data write plus one flush. Both paths flush the device cache, and a full-block append reads nothing.

## Question 12

A logging pipeline calls fdatasync after every 100-byte record and reaches about 240 records a second. Which change gives the largest gain while keeping power-loss durability for acknowledged records?

A, switch from fdatasync to fsync to avoid metadata writes. B, call sync once a second instead of flushing per record. C, acknowledge records only after a shared fdatasync per batch. D, open the log with direct I/O so writes skip the page cache.

[think]

The answer is C: acknowledge records only after a shared fdatasync per batch.

A flush costs the same for 100 bytes or 100 kilobytes, so group commit scales almost linearly: measured, a thousand records per flush reached about 180 thousand a second. Fsync does at least as much work. Direct I/O still needs a flush for durability. And a periodic sync would acknowledge records before they are durable.

## Recap

Three ideas kept coming back. First, the kernel is lazy on purpose: fork copies page tables, not memory; malloc reserves addresses, not frames; and a write reaches the page cache, not the disk. Second, the numbers you watch can measure the wrong layer: heap used versus resident memory, host CPU versus a container's quota, a successful rename versus a durable one. And third, cost scales with what you touch or batch: page tables with resident memory, poll with every watched descriptor, and fsync throughput with how many records share each flush.

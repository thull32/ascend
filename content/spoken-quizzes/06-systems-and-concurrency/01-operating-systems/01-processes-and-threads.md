---
lesson: processes-and-threads
source: bcb94393c38c4ea8
---
## 1

Strace shows a new task created with clone3, with four flags: share the address space, share the file descriptors, share the signal handlers, and join the caller's thread group. What was created?

A, a thread sharing memory and descriptors. B, a container with its own process ID namespace. C, a vfork child that borrows memory until it calls exec. D, a process with a copy-on-write address space.

[think]

The answer is A: a thread sharing memory and descriptors.

Those flags share the address space, the descriptor table and the handlers, and put the task in the caller's thread group, so getpid returns the same value. That is what creating a pthread does. Fork passes none of these flags and copies everything. A container adds the new-namespace flags. And vfork shares the address space with a different flag, not the thread-group one.

## 2

A process with 1 gibibyte of memory forks a child that exits immediately. Measured, that takes about 31 milliseconds, while posix spawn from the same parent takes about half a millisecond. Where does fork spend the time?

A, writing the parent's dirty pages to swap first. B, copying 1 gibibyte of memory into the child's new frames. C, copying page-table entries for every resident page. D, flushing every CPU's TLB for the parent's pages.

[think]

The answer is C: copying page-table entries for every resident page.

Fork duplicates the page tables and bumps a reference count per resident page, about 120 nanoseconds for each of 262 thousand pages. No data is copied until someone writes; that is copy-on-write. Posix spawn lends the child the parent's address space, so there are no page tables to copy. Swap is not involved, and the TLB work is small next to the per-page walk.

## 3

A service runs 300 threads on an 8-core host, and each thread blocks on a downstream call roughly every 200 microseconds. What is the most likely dominant cost?

A, context switches, and the cache misses that follow them. B, run-queue insertion, which is linear in the thread count. C, stack memory, with 300 threads each committing 8 mebibytes. D, page-table copies on every switch between the threads.

[think]

The answer is A: context switches and the cache misses that follow them.

Thousands of switches per core per second cost about 2 microseconds each directly, and more in cold caches. Stacks are reserved virtually and committed lazily, so they do not commit 8 mebibytes each. Threads of one process share page tables, so nothing is copied on a switch. And run-queue operations are logarithmic, and cheap at this scale.

## 4

A Python service runs in a container with a CPU limit of 2, on a 32-core host. It uses a process pool executor with its default worker count. Latency spikes with a flat top near 100 milliseconds, while average CPU looks fine. Why?

A, the GIL serialises the 32 worker processes onto one core. B, Python sees 32 CPUs, so 32 busy workers burn the quota early. C, the kernel swaps the idle workers out between requests. D, each worker's fork copies the parent's page tables on every request.

[think]

The answer is B: Python sees 32 CPUs, so 32 busy workers burn the quota early.

CPython's CPU count ignores the cgroup quota, so the pool starts 32 processes. Together they burn the 200 milliseconds of CPU allowed per 100 millisecond period within a few milliseconds, and the whole cgroup is throttled until the period ends. Processes do not share a GIL, the quota does not swap anything out, and a pool forks once at start-up, not per request.

## 5

Task A, with weight 1024, and task C, with weight 526, are both CPU-bound on one core under a fair scheduler. Why does C run less often?

A, C is only picked when A blocks, or its slice expires early. B, C gets a slice about half as long each time it is picked. C, C's virtual runtime grows about 1.95 times faster per millisecond of CPU. D, C is placed at the back of a first-in, first-out queue after each slice.

[think]

The answer is C: C's virtual runtime grows about 1.95 times faster.

Virtual runtime grows by the real runtime times 1024, divided by the weight. So for a 3 millisecond slice, C's virtual clock advances 5.84, against A's 3. The scheduler picks the smallest virtual runtime, so C is chosen about half as often, and gets about a third of the core against A's two thirds. Slices are not halved, and there is no first-in, first-out order or strict priority.

## 6

Why is a goroutine switch around 90 nanoseconds, when an OS thread switch on the same core is around 2 microseconds?

A, goroutine switches skip saving only the floating-point registers. B, Go pins every goroutine to a core, so caches stay warm. C, goroutines share one stack, so no registers are saved. D, the Go runtime switches it in user space, with no kernel entry.

[think]

The answer is D: the Go runtime switches it in user space, with no kernel entry.

Goroutines are user-space threads. The runtime saves a few registers and swaps stack pointers inside the process, with no system call, no scheduler entry and no page-table work. Each goroutine has its own small, growable stack, and goroutines migrate between OS threads freely. A kernel switch's cost is dominated by the kernel entry, the wake-up and the scheduling, not by floating-point state alone.

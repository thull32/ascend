---
lesson: processes-and-threads
source: 0347934ae1638bf5
fit: great
desk:
  - "The clone3 strace line, read flag by flag, and the task struct field table"
  - "The fork and context-switch measurement tables"
  - "The vruntime hand trace, and the exercise: implement the fair scheduler's pick-the-minimum loop"
---
## Introduction

Your API server handles 2 thousand requests a second on an 8-core box at 40 percent CPU. You double the traffic. CPU goes to 95 percent, but throughput only reaches 3,100 requests a second, and the 99th percentile latency triples. Nothing in your code got slower.

What changed is that the kernel now spends a real fraction of every core deciding which of your 400 threads runs next. And every one of those decisions throws away the cache state the previous thread had built up.

The precise model is short. One kernel structure. A handful of flags that say what is shared. A page-table trick that makes fork cheap until it is not. And a scheduler whose fairness rule you can follow in your head. Every number here was measured on one machine, a Ryzen desktop running Linux under WSL2, a virtual machine, and you will hear where the virtual machine changes the answer.

## One structure, many flags

Start with the definitions. A process is the kernel's unit of isolation. It owns an address space, which is a private mapping from virtual addresses to physical memory, so two processes can use the same address and mean different bytes of RAM. It owns a table of file descriptors, its credentials, signal handlers, limits, namespaces and a cgroup. And it owns one or more threads.

A thread is the kernel's unit of execution. It has its own user stack, 8 mebibytes of reserved address space by default, backed by real memory only as it is touched. It has a small kernel stack, its registers, and its scheduling state. Everything else, most importantly the heap and the globals, is shared with every other thread in the process. That is the reason threads exist, and the reason they are dangerous.

Here is the part most people get wrong. Linux has no separate process object and thread object. It has one structure per schedulable thing, the task struct. Its important fields are pointers to separately reference-counted resources: the address space, the file descriptor table, the signal handlers, the credentials, the namespaces.

Creating a task is a system call named clone, and its flags decide, pointer by pointer, whether the child shares the parent's structure or gets a copy. Starting a thread passes flags that share the address space, the descriptor table and the signal handlers, and one more that puts the child in the parent's thread group, so both report the same process ID. Fork passes none of those flags. Every resource is copied. Container runtimes use the same call with a third set of flags that give the child new namespaces.

So the difference between a process and a thread is not a different kind of object. It is which resources are shared.

One subtle consequence. After a fork the descriptor table is copied, but each entry still points at the same kernel open file description. Parent and child share file offsets.

## What fork really copies

Fork has to give the child a private copy of a possibly huge address space, and copying gigabytes would take seconds. So the kernel copies the page tables instead, and marks the pages read-only in both parent and child. No data moves.

Follow one page. The child writes to it. The hardware sees a write to a read-only page and raises a fault. The kernel recognises a copy-on-write fault, sees that two address spaces still share the physical frame, allocates a new one, copies 4 kibibytes, and gives the child a writable entry. Later the parent writes the same page. Another fault, but now only one address space uses the frame, so the kernel just flips the writable bit and copies nothing.

Now the costs, measured. Fork, exit and wait for a small process: about 200 microseconds. The same from a parent with 1 gibibyte of touched memory: 31 milliseconds. That is the page-table copy, about 120 nanoseconds per page across 262 thousand pages. If the child then writes every page, 530 milliseconds, about 2 microseconds per copy-on-write fault. And posix spawn from that same 1 gibibyte parent: under half a millisecond, because it lends the child the parent's address space and copies no page tables at all.

The rule: launch programs from a large process with posix spawn or a subprocess library, not raw fork.

Redis is the textbook victim. Its background snapshot forks. At the rate measured here, a 25 gibibyte dataset spends about three quarters of a second in fork with the main thread stopped, and a write-heavy workload during the snapshot can push memory use toward double.

The other trap is locks. Fork copies only the thread that called it. But it copies memory, including any lock another thread was holding at that instant. If that was the malloc lock or a logging lock, the child inherits a held lock with no thread left to release it, and the child's first allocation or log line hangs forever, at 0 percent CPU. That is why POSIX restricts what a multithreaded program may do between fork and exec, why CPython 3.12 warns when you fork a process that has threads, and why CPython 3.14 changed multiprocessing's default on Linux from fork to forkserver.

## What a context switch costs

The scheduler runs a thread until it blocks, until a waking thread should preempt it, or until its slice expires. Then it saves registers, picks the next task, switches the page-table root if the next task is in another address space, switches kernel stacks, and returns to user space.

Measured with two tasks bouncing a byte through pipes. A plain system call: about 130 nanoseconds. A switch between two threads on one core: about 2 microseconds, including the two system calls. Between two processes on one core: about 2.3, only 10 percent more, because the CPU tags its address-translation cache by address space and does not need to flush it. Across two CPUs: 25 microseconds, and that one is the virtual machine talking, waking a halted virtual CPU through the hypervisor. On bare metal it is typically single-digit microseconds. And a switch between two goroutines: about 90 nanoseconds, 20 times cheaper, because it never enters the kernel.

The indirect cost is bigger than any of these. The incoming thread starts with cold caches. A request that takes 200 microseconds hot may take 300 after being switched in.

Now redo the opening's arithmetic. 400 threads on 8 cores, each blocking every few hundred microseconds, is tens of thousands of switches per second per core. At 20 thousand switches a second and 2 microseconds each, 4 percent of the core goes to switching directly, and more to the cache misses that follow.

## The fair scheduler

Linux's fair scheduler gives each runnable task CPU in proportion to its weight. Nice zero is weight 1024, and each nice step changes the weight by about one and a quarter times. Nice 3 is 526.

The mechanism is a virtual clock per task, its vruntime. When a task runs, its vruntime grows by the time it ran, times 1024 divided by its weight. The scheduler always picks the runnable task with the smallest vruntime. A heavy task's clock runs slowly, so it keeps being the smallest and gets picked more often.

Picture three CPU-bound tasks on one core with 3 millisecond slices. A and B are at nice zero, so each slice adds 3 to their clocks. C is at nice 3, weight 526, so each slice adds almost 6. Before I tell you: over a long run, what share of the core does C get?

[pause]

About 20 percent: 526 out of the total weight of 2,574. A and B get about 40 percent each. In the trace, the order goes A, B, C, A, B, C, and then A and B run twice before C's clock is the smallest again.

Two more details. A task that wakes after a long sleep is placed near the current minimum, not at its old small value, so it cannot monopolise the core on return. And the base slice works out to 2.8 milliseconds on any machine with eight or more CPUs.

Three consequences for a service owner. Load average is a queue length, not a CPU percentage: it counts tasks that are runnable or stuck waiting on disk, so a load of 24 on 8 cores means about 16 tasks waiting at any moment, and that waiting is added to latency. Wake-up latency is real, which is why trading systems pin a thread to a core and spin. And the slice is not the latency: a CPU-bound neighbour can delay your thread by a whole slice per wake-up when the core is contended.

## Containers and CPU quotas

A container with a CPU limit of 2 does not get two cores. Its cgroup gets 200 milliseconds of CPU time per 100 millisecond period, spent on any cores.

The lesson ran spinning threads under that limit. With 2 threads, the longest stall was 3 milliseconds. With 32 threads, the quota was gone after about 6 milliseconds of each period, and every thread froze for the remaining 94. The worst stall was 290 milliseconds. Average CPU sat exactly at the limit and looked healthy. The symptom at the request level is a 99th percentile with a flat top near the period length, about 100 milliseconds.

The fix is to size concurrency to the quota, and runtimes disagree about what the quota is. Under a limit of 2 on a 32-CPU machine, Go and Node's available parallelism report 2. Python's CPU count reports 32. So a default process pool starts 32 workers to share two CPUs' worth of time. The fixes: an explicit worker count, a higher limit, or no CPU limit at all with a request-based share.

What is a container, then? An ordinary process tree with namespaces, which are separate views of process IDs, mounts, network and so on; cgroups for limits; and a root filesystem assembled from image layers. Container threads are just threads. And the memory limit is a cgroup number the out-of-memory killer enforces even when the host has 200 gibibytes free.

One more container trap. PID 1 in a namespace only receives signals it has installed a handler for. An application running as PID 1 with no SIGTERM handler ignores the stop request, never reaps orphans, and every deploy waits out the 30 second grace period. Handle SIGTERM, or run a minimal init like tini as PID 1.

## Green threads

Goroutines, Java virtual threads and Tokio tasks are user-space threads. The language runtime multiplexes many of them onto roughly one OS thread per core. A goroutine hop is about 90 nanoseconds, spawning one about 100, and a parked one holds about 2 kibibytes of stack. The kernel equivalents: 2 microseconds, 78 microseconds, and 8 mebibytes reserved.

The catch is that the kernel cannot see them. When a goroutine makes a blocking system call, its OS thread blocks. Go's scheduler detaches that thread's logical processor, with its queue of runnable goroutines, and hands it to another OS thread so everything else keeps running.

So when do you pick which? Threads or goroutines when work shares state and needs cheap coordination. Processes when a crash must be contained, when code is untrusted or leaks, or when the runtime cannot run threads in parallel. PostgreSQL and nginx are process-per-worker for isolation. The JVM and Go put everything in one process for sharing.

## In the interview

A classic follow-up. A service at 30 percent average CPU in Kubernetes has 100 millisecond latency spikes. What do you check first?

[pause]

CPU throttling in the container's cpu stat file, the pool sizes against the quota, and whether the runtime derived its worker count from the host's cores. The common wrong answer is garbage collection, which does not produce a ceiling at the period length.

And: is a process context switch much slower than a thread switch? Directly, only a little on modern CPUs, 2.26 against 2.07 microseconds here. The real difference is the cache and address-translation state the next task has to rebuild, which grows with its working set. The wrong answer is that processes flush the whole cache on every switch.

## Recap

Four things to remember. A process and a thread are the same kernel structure; clone's flags decide what is shared. Fork copies page tables, not memory, and costs about 31 milliseconds per gibibyte resident, so spawn programs with posix spawn, and never fork a process that already has threads. A same-core context switch costs about 2 microseconds directly and more in cold caches; a goroutine switch about 90 nanoseconds. And a container's CPU limit is a quota per 100 millisecond period, so a flat-topped 99th percentile means check throttling and size your pools to the quota.

At your desk: the clone line from strace and the task struct table, the fork and switch measurements, and the vruntime trace with its scheduler exercise.

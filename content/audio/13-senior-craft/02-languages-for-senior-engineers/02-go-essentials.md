---
lesson: go-essentials
source: a4fe81bd5e2f2266
fit: partial
desk:
  - "The schedtrace output and its field-by-field reading"
  - "The channel state table, and the worker pool with its WaitGroup coordinator"
  - "The fan-out with context and the buffered results channel"
  - "The nil-interface program and its output"
  - "The escape-analysis output and its allocation table"
  - "The gctrace line decoded, and the GOGC and GOMEMLIMIT comparison table"
  - "The slice aliasing example, and the interview idiom table"
  - "Exercise: simulate a Go channel in one goroutine"
---
## Introduction

A request to your API must call 20 downstream services, return whatever has arrived within 150 milliseconds, and stop waiting for the stragglers. With a thread per call, that is 20 threads per request, a pool to bound them, futures, and careful timeout plumbing. In Go it is about 25 lines: a goroutine per call, a channel for results, and a context for the deadline.

That fit, cheap concurrency with a boring deployment story of one static binary, is why so much of the infrastructure you run is written in Go: Docker, Kubernetes, etcd, Prometheus and Terraform among them.

But Go is deliberately small, and its minimalism hides sharp edges: goroutines that leak, nil errors that are not nil, slices that silently share memory, maps that crash the process, and a heap that doubles before it is collected. Knowing the mechanism behind each separates "I have used Go" from "I have run Go in production". We will take them in order: what a goroutine costs, the scheduler, channels and the leak, interfaces, and the garbage collector.

## What a goroutine costs, and who schedules it

A goroutine is a function scheduled by the Go runtime, not the operating system. It starts with a small stack that grows by copying itself to a bigger allocation when needed. Measured: about 2 to 3 kibibytes each, and about 1.4 microseconds to create. An operating system thread reserves megabytes of stack, and spawning one took about 96 microseconds on the same machine. A factor of roughly 70. That is why Go code starts a goroutine per request or per downstream call without a second thought.

Cheap is not free, though. A million goroutines is almost 3 gigabytes. And a goroutine that never exits leaks its stack plus everything it references. That is the most common Go production bug.

The runtime multiplexes goroutines onto threads with three actors, G, M and P. G is a goroutine. M is an operating system thread, a "machine". P is a processor context with a local run queue of up to 256 goroutines. There are GOMAXPROCS of them, and a thread must hold a P to run Go code. Idle Ps steal half of a busy P's queue.

GOMAXPROCS defaults to the number of CPUs, and since Go 1.25 it also respects a container's CPU limit. Before that, a service in a 2-CPU container on a 64-core host created 64 Ps, burned its quota in a fraction of each period, and the kernel throttled it. The symptom was 99th percentile spikes on an older Go service in Kubernetes.

Now a question. One P, one goroutine spinning in an empty loop forever, and main sleeps for one millisecond. Does main ever wake?

[pause]

Yes, after about 11 milliseconds. Since Go 1.14, a background thread called sysmon signals any goroutine that has run for 10 milliseconds, and the runtime switches it out. Before 1.14, main would never have woken. Node and Tokio have no such preemption: a long synchronous computation there blocks everything sharing its thread.

Blocking is where the model earns its keep. A goroutine waiting on a network read is parked with the netpoller, which is epoll on Linux, and holds no thread at all. A goroutine stuck in a system call, like a file read, keeps its thread, so sysmon hands its P to another thread and the CPUs stay busy. You write plain, straight-line blocking code, and you get the efficiency of an event loop.

## Channels, and the goroutine leak

A channel is a typed, synchronised queue: a ring buffer, a lock, and two queues of parked goroutines, waiting senders and waiting receivers. Three of its states panic: sending on a closed channel, closing a closed channel, and closing a nil channel. Sending or receiving on a nil channel blocks forever. Receiving from a closed channel drains the buffer, then returns the zero value with a flag saying it is closed.

An unbuffered channel is a rendezvous: the sender waits until a receiver takes the value. A buffered channel of capacity n lets the sender run n values ahead, then blocks. It delays backpressure; it does not remove it.

The ownership rule that prevents the panics: only the sender closes, and only when no more sends can happen. With several senders, a coordinator waits on a wait group and then closes.

Channels are not for protecting a counter. With 8 goroutines incrementing a shared counter, a mutex cost 32 nanoseconds per increment, an atomic about 5, and funnelling increments through a channel to an owner goroutine 36. Use channels to hand over ownership and to signal; use a mutex or an atomic to protect state.

Now back to the fan-out from the opening. Results go to a channel, and the collector returns early when the context times out. The decisive detail is the buffer size. Make the results channel unbuffered, and what happens to a straggler that finishes after the timeout?

[pause]

It blocks forever on its send, because nobody will ever receive. Measured: a four-way fan-out with two slow calls, run 1,000 times unbuffered, left exactly 2,000 goroutines behind. Buffered with one slot per sender: zero. The runtime's deadlock detector does not help, because in a server something is always running. At 1,000 requests a second with 5 percent hitting that path, you leak 100 goroutines a second, 8.6 million a day, and the service dies of memory with nothing in the logs.

Three habits prevent it. Give every goroutine a guaranteed exit: a buffered channel, a case on the context's done channel, or a closed input. Export the goroutine count as a metric, because a leak is a line that only goes up. And run a leak checker such as goleak in tests. The context goes first in every signature, is never stored in a struct, and every cancel is deferred, so a deadline set at the edge bounds the whole call tree.

Shared memory still has its place. A cache is a map behind a read-write lock. And maps are not safe for concurrent writes: two goroutines writing one map without a lock killed the process with "concurrent map writes" on the first run. It is a fatal error, not a panic, so recover cannot catch it. It shows up under load, never in single-threaded tests. The race detector belongs in CI.

## Interfaces and the nil trap

A type satisfies an interface just by having its methods; there is no "implements". So the consumer declares the small interface it needs. The reader interface has one method, and files, sockets, gzip streams and HTTP bodies all satisfy it. Accept interfaces, return structs.

Under the hood, an interface value is two words: a pointer to the concrete type and its method table, and a pointer to the data. And the value is nil only when both words are nil. That gives you Go's most famous bug.

A find function declares its error variable as a pointer to a not-found error type, leaves it nil on success, and returns it as a plain error. The caller checks "error not equal to nil", and it is true. The type word is filled, the data word is nil. So the caller treats success as failure, and the log prints "nil", hiding the cause. Return the literal nil on success, and never declare an error variable with a concrete pointer type.

Errors in Go are values: returned last, checked by the caller, wrapped to keep the cause. One difference from Rust matters in review. Go has no sum types, so nothing forces a switch over error kinds to handle a new one; the default case silently absorbs it, where Rust's exhaustive match fails the build. And a panic in a goroutine you started yourself terminates the whole process, so one nil dereference in a background goroutine kills every in-flight request.

## Slices and escape analysis

A slice is a three-word header, pointer, length and capacity, over a backing array, and append reallocates only when capacity runs out. Picture a slice of length 3 and capacity 4. Append 1 to it to make b. Append 2 to the same original to make c. Both appends fit in the spare slot, so they write the same slot of the same array, and b's last element is now 2. With a full slice, both appends reallocate and you get 1 and 2. Whether two slices alias depends on a run-time number, so clone any slice you did not allocate before appending to it. And a 10-byte sub-slice of a 10 megabyte buffer keeps the whole 10 megabytes alive.

Escape analysis decides stack or heap. The compiler puts a value on the stack unless a pointer to it can outlive the function, and a compiler flag prints every decision. Return a pointer to a local: heap. Return a struct by value: stack. Pass a value to print, which converts it to an interface: heap. A closure capturing a counter: two allocations.

The version-sensitive one: older guidance says any make with a non-constant size escapes. On Go 1.27, a non-escaping byte slice of size n uses a small stack buffer up to 32 bytes and allocates only above that. So measure allocations with a benchmark rather than trusting a rule from an older version.

## The garbage collector and its pacer

Go's collector is concurrent, non-generational and non-moving: a tri-colour mark and sweep that runs alongside your goroutines with two short stop-the-world phases per cycle. Goroutines that allocate faster than marking can keep up are made to assist, and that is where garbage collection shows up in latency.

The pacer decides when to start. Roughly, the heap goal is the live heap plus GOGC percent of it. With the default of 100, that is twice the live heap. In the lesson's trace, 258 megabytes were live, so the goal was about 515.

Here is the comparison that matters. The same program under four settings. Pauses stayed under a millisecond in every case. What moved was how often the collector ran and how much memory the process held. GOGC at 50 ran 32 cycles; at 200, 8 cycles but about 800 mebibytes held. GOGC is proportional: halve it and cycles roughly double.

GOMEMLIMIT is different: a ceiling. Near the limit, the pacer ignores GOGC and collects as often as needed; with a 400 mebibyte limit, the process stayed under 400. To avoid a death spiral, garbage collection CPU is capped at 50 percent over a short window, after which the heap may pass the soft limit. Set it to roughly 90 percent of the container's limit.

## In the interview

A follow-up the lesson expects. Your service is killed for running out of memory at 1 gibibyte with 600 mebibytes live. What do you change?

[pause]

The default pacer targets about twice the live heap, about 1.2 gibibytes, which is over the limit. Set GOMEMLIMIT near 900 mebibytes so the collector works harder near the ceiling, and confirm with the GC trace. The common wrong answer is "set GOGC to 50", which costs CPU on every cycle to fix a problem that only exists at the peak. And do not read a saw-tooth memory graph as a leak; the troughs rising is the leak signal.

Another: how does Go run 100,000 goroutines on 8 cores? Eight Ps with local run queues and work stealing; goroutines parked on the netpoller hold no thread; blocking system calls hand the P to another thread; sysmon preempts after 10 milliseconds; and each parked goroutine costs 2 to 3 kibibytes. The wrong answer is "green threads the OS schedules", which misses both the netpoller and the P.

When does Go win? Network services, proxies, infrastructure tools and Kubernetes operators. It is weak for rich domain models with many states, because there is no exhaustive matching, and for data science, where Python's ecosystem wins.

## Recap

Five things to remember. Goroutines are cheap, about 2 to 3 kibibytes, but every one needs a guaranteed exit, and an unbuffered result channel in a timed fan-out leaks one per straggler. The scheduler is G, M and P, with the netpoller holding parked goroutines and preemption after 10 milliseconds. Channels for ownership and signalling, mutexes or atomics for state. An interface is nil only when both its words are, so return literal nil. And the pacer targets about twice the live heap, so in containers set GOMEMLIMIT near 90 percent of the limit.

At your desk: the scheduler trace, the channel table and worker pool, the fan-out code, the nil-interface program, the escape-analysis output, the GC settings table, and the channel simulation exercise.

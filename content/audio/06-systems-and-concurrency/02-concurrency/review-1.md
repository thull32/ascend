---
review: concurrency
source: 4d36146f1ad12366
---
## Introduction

Twelve questions from the concurrency module. Answer out loud before the answer comes.

They run through the module in order: races and mutexes, deadlock, condition variables, atomics, thread pools, event loops, actors and channels, and the interview problems. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Four C threads each increment a plain, non-atomic global counter 10 million times. Compiled with optimisation, the result is exactly 40 million. What does that show?

A, the compiler collapsed each loop into one addition, hiding the race. B, the threads ran one after another because the loop was short. C, x86 makes aligned 64-bit increments atomic, so no race exists. D, the C library adds a lock prefix to shared globals automatically.

[think]

The answer is A: the compiler collapsed each loop into one addition, hiding the race.

Because a data race is undefined behaviour in C, the compiler may assume no other thread touches the variable, and it turned ten million increments into a single addition of 10 million. Four such additions rarely overlap. The race is still there, as the volatile version shows by losing 72 percent of its updates. And x86 increments without a lock prefix are not atomic.

## Question 2

A bank class locks correctly inside its transfer method. A new total method reads all the balances without the lock, because it only reads. What can go wrong?

A, it can deadlock with transfer when both run together. B, nothing, because reads alone cannot corrupt shared data. C, it can see a transfer halfway through and report a false total. D, balances can go negative when it races with transfer.

[think]

The answer is C: it can see a transfer halfway through and report a false total.

Between the debit and the credit, the invariant, that the sum is constant, is false. A reader outside the lock can see that intermediate state and report a sum that was never true. Nothing is corrupted, but locks exist to hide broken invariants from every observer, readers included. And a reader that takes no lock cannot deadlock.

## Question 3

A Go HTTP service has two goroutines deadlocked on each other's mutexes, but the runtime never reports that all goroutines are asleep. Why?

A, Go detects deadlocks on channels only, never on mutexes. B, deadlock detection is off unless a debug setting enables it. C, the check needs every goroutine blocked, and the listener is not. D, the race detector is disabled, and it is what reports deadlocks.

[think]

The answer is C: the check needs every goroutine blocked, and the listener is not.

The built-in check is global. It fires only when no goroutine can ever run again. Any healthy goroutine, such as the HTTP listener waiting for connections, means the process is not globally deadlocked, so partial deadlocks are silent, whether they involve mutexes or channels. Dump the goroutine stacks to find them.

## Question 4

In a wait-for graph, T4 waits for T1, T1 waits for T2, T2 waits for T3, and T3 waits for T2. A detector must abort one thread. Which choices actually resolve the deadlock?

A, none; the detector has to abort all four threads. B, only T2 or T3, the two members of the cycle. C, T1 or T4, because they have waited the longest. D, any of the four, since all of them are stuck.

[think]

The answer is B: only T2 or T3, the two members of the cycle.

The cycle is T2 and T3. Aborting T1 or T4 releases their locks but leaves the cycle intact, so T2 and T3, and whoever waits behind them, stay stuck. Aborting either member of the cycle lets the other proceed, and the threads behind it follow.

## Question 5

A bounded buffer uses one condition variable for both producers and consumers, and calls notify after every put and every take. It occasionally hangs, with every thread waiting and the buffer not full. Why?

A, a spurious wake-up left one thread holding the mutex forever. B, one condition variable cannot legally serve two predicates. C, the capacity is too small for the number of waiting threads. D, notify can wake the wrong kind of waiter, which goes back to sleep.

[think]

The answer is D: notify can wake the wrong kind of waiter, which goes back to sleep.

A consumer's notify, intended for a producer, can wake another consumer instead. That consumer finds the buffer empty and waits again, swallowing the only wake-up, and the producer is never woken. Two condition variables, not-full and not-empty, or notify all, fix it. Sharing one condition variable is legal, which is exactly why this bug compiles and runs.

## Question 6

A producer writes 42 into a data variable, then sets a ready flag to true, both with relaxed ordering. A consumer loads the flag with relaxed ordering and, if it is true, reads the data. What can the consumer see?

A, 42 or zero on x86, but always 42 on ARM. B, 42 or zero, on ARM or after compiler reordering. C, always 42, because each store is atomic. D, 42, or a torn mix of the old and new bytes.

[think]

The answer is B: 42 or zero, on ARM or after compiler reordering.

Relaxed gives atomicity, so no torn values, but no ordering between the two variables. The flag can become visible before the data on weakly ordered hardware such as ARM, or when the compiler reorders. On x86, relaxed and release stores compile to the same instruction, so it passes there by accident. A release store paired with an acquire load guarantees 42.

## Question 7

A service uses epoch-based reclamation for a lock-free map, and its memory grows steadily while one worker thread is blocked on a slow downstream call. What is the likely cause?

A, the hazard pointer scan threshold is set too low for this workload. B, blocked threads double every node's reference count while they wait. C, the blocked thread is still pinned, so the global epoch cannot advance. D, epoch reclamation frees nodes only when the whole process is idle.

[think]

The answer is C: the blocked thread is still pinned, so the global epoch cannot advance.

Garbage retired in one epoch is freed only after the global epoch has moved on twice, and the epoch advances only when every pinned thread has observed the current one. A thread blocked while pinned freezes the epoch, so every retired node accumulates. Hazard pointers keep memory bounded in this situation, at the cost of a fence per protected load. Epochs use no reference counts.

## Question 8

An 8-core service spends 5 milliseconds of CPU and 45 milliseconds waiting on the database per request. The database connection pool has 20 connections. What limits throughput?

A, nothing yet; add threads until latency starts to rise. B, the connection pool: 20 divided by 45 milliseconds is about 444 a second. C, CPU: 8 cores at 5 milliseconds each cap it at 1,600 a second. D, threads: 80 threads by the formula give 1,600 a second.

[think]

The answer is B: the connection pool, at about 444 requests a second.

The sizing formula gives 80 threads and a CPU ceiling of 1,600 a second. But only 20 requests can hold a database connection at once, each for 45 milliseconds, so throughput tops out near 444 a second. Extra threads only queue for connections. Size from the tightest resource.

## Question 9

An asyncio handler serialises a large object to JSON and stalls the event loop for 80 milliseconds. Moving the call into a worker thread with asyncio's to-thread leaves the stall unchanged. Why?

A, the JSON dump is one C call that holds the GIL until it returns. B, the thread pool has only one worker, and it is always busy. C, to-thread runs the function on the loop thread when it is idle. D, asyncio suspends timers while any worker thread is running.

[think]

The answer is A: the JSON dump is one C call that holds the GIL until it returns.

A pure-Python function in another thread gives up the GIL every 5 milliseconds, so the loop keeps running; the lesson measured a 10 millisecond worst lag. The JSON dump is implemented in C and does not release the GIL while it serialises, so the loop thread cannot run Python until it finishes: 85 milliseconds of lag. Use a process pool, a library that releases the GIL, or chunked output.

## Question 10

An Erlang system gives every chat room its own process. One room with a celebrity guest becomes slow, and its node's memory climbs. What is happening?

A, the supervisor keeps restarting the crashed room process. B, messages from different senders arrive out of order. C, stop-the-world garbage collection is pausing the node. D, one process serialises the room, and its mailbox grows.

[think]

The answer is D: one process serialises the room, and its mailbox grows.

An actor is a serialisation point by design: the room's process handles messages one at a time. A hot entity receives more messages than one process can handle, and because sends go asynchronously into unbounded mailboxes, the backlog piles up in memory. Shard the hot entity, or add flow control. Garbage collection on the BEAM is per process, not stop-the-world.

## Question 11

A readers-writers lock lets readers in whenever no writer is inside. Reads are frequent and overlap. What goes wrong?

A, readers can see a write that is only partly done. B, nothing; this is the standard, fair readers-writers lock. C, overlapping readers can deadlock with each other. D, writers starve, because the reader count never reaches zero.

[think]

The answer is D: writers starve, because the reader count never reaches zero.

With overlapping readers there is always at least one inside, so a writer waits forever. Making a waiting writer block new readers fixes it. And admitting the queued readers when a writer finishes, as Go does, keeps readers from starving in turn.

## Question 12

A token bucket rate limiter uses the wall clock to compute refills. What can go wrong in production?

A, clock jumps remove tokens or grant an unearned burst. B, the wall clock is not thread-safe, so refills can race. C, nothing, since the wall clock is accurate to microseconds. D, the clock call makes the lock hold time far too long.

[think]

The answer is A: clock jumps remove tokens or grant an unearned burst.

Wall-clock time can jump in either direction. A correction backwards produces a negative elapsed time and removes tokens; a jump forwards grants a burst nobody earned. Precision is not the issue. Durations should come from a monotonic clock, which only moves forward.

## Recap

Three ideas kept coming back. A lock protects an invariant, not a variable, so readers take it too, and a single notify is only safe when any waiter can use the change. Contention lives in shared state, whether that is a lock, a cache line, a connection pool or one actor's mailbox, and adding threads does not remove it. And the tools only see part of the problem: race detectors find data races, Go reports only total deadlock, and a detector has to abort a thread on the cycle, not behind it.

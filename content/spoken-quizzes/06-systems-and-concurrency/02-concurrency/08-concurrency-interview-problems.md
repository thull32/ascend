---
lesson: concurrency-interview-problems
source: 67f6dbef78440b40
---
## 1

In the print-in-order problem, why is a threading event, or a semaphore starting at zero, a better fit than a mutex?

A, the signal crosses threads, and is latched if it is set before the wait. B, an event gives mutual exclusion as well as a signal to the waiter. C, a mutex cannot coordinate more than two threads at the same time. D, events are faster, because waiting on one never enters the kernel.

[think]

The answer is A: the signal crosses threads, and is latched if set before the wait.

The problem is ordering across threads, not exclusion. An event is latched: setting it before the wait still lets the waiter through, and the setter and the waiter are different threads. A mutex is meant to be released by the thread that acquired it, and provides no ordering by itself. An event provides no exclusion at all.

## 2

A bounded blocking queue's close method sets a closed flag, and calls notify once on each condition variable. Three consumers are blocked in take. What happens?

A, all three wake up, see the flag, and raise Closed. B, one wakes and raises Closed, and the other two stay blocked. C, all three wake and return None, since the queue is empty. D, none wake, because notify needs a state change first.

[think]

The answer is B: one wakes and raises Closed, and the other two stay blocked.

Notify wakes at most one waiter, so one consumer raises Closed, and the other two sleep forever. Closing changes the condition for every waiter, so it must use notify all. This is the standard follow-up that separates a memorised solution from an understood one.

## 3

A readers-writers lock lets readers in whenever no writer is inside. Reads are frequent and overlap. What goes wrong?

A, readers can see a write that is only partly done. B, nothing; this is the standard, fair readers-writers lock. C, overlapping readers can deadlock with each other. D, writers starve, because the reader count never reaches zero.

[think]

The answer is D: writers starve, because the reader count never reaches zero.

With overlapping readers there is always at least one inside, so a writer waits forever. Making a waiting writer block new readers fixes it. And admitting the queued readers when a writer finishes, as Go does, keeps readers from starving in turn.

## 4

Eight goroutines share read-mostly data, with 1 percent writes. Switching from Go's mutex to its read-write mutex raised throughput only about 1.6 times, not 8 times. Why so little?

A, the read-write mutex serialises readers internally, exactly like a mutex. B, the race detector was enabled, which serialises every lock call. C, every read lock updates one shared counter, and each write drains the readers. D, Go runs only one goroutine at a time unless GOMAXPROCS is raised.

[think]

The answer is C: every read lock updates one shared counter, and writes drain the readers.

Readers do run in parallel, but every read lock and read unlock is an atomic update of the same reader count, whose cache line bounces between cores. And each write, 1 percent of operations, must wait for all readers and block new ones. GOMAXPROCS defaults to the CPU count, and the measurement ran without the race detector. Snapshots or seqlocks avoid the shared write.

## 5

In dining philosophers with five philosophers, a waiter semaphore of 4 permits is acquired before picking up the forks. Why can this not deadlock?

A, it breaks the mutual exclusion condition on the forks. B, the semaphore makes taking both forks one atomic step. C, four diners and five forks: someone can always get two. D, it forces the philosophers to eat in a fixed rotation.

[think]

The answer is C: four diners and five forks, so someone can always get two.

Deadlock needs every competitor holding one fork and waiting for another held by a neighbour, which requires all five forks held by five philosophers. With at most four competitors, each holding at most one fork, a free fork always sits next to someone, so the cycle cannot close. Each fork is still exclusive and taken separately; circular wait is what is broken.

## 6

A token bucket rate limiter uses the wall clock to compute refills. What can go wrong in production?

A, clock jumps remove tokens, or grant an unearned burst. B, the wall clock is not thread-safe, so refills can race. C, nothing, since the wall clock is accurate to microseconds. D, the clock call makes the lock hold time far too long.

[think]

The answer is A: clock jumps remove tokens, or grant an unearned burst.

Wall-clock time can jump in either direction. An NTP correction backwards produces a negative elapsed time and removes tokens; a jump forwards grants a burst nobody earned. Precision is not the issue. Durations should come from a monotonic clock, which only moves forward.

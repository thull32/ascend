---
lesson: races-mutexes-and-invariants
source: 44cb407c30d5cdfc
fit: partial
desk:
  - "The register-by-register lost-update trace, and the four-version C measurement table"
  - "The futex lock and unlock code, with its five-step contention trace"
  - "The Python, Go and Rust counter code, and the cache that holds its lock across a database call"
  - "Exercise: replay a schedule and count lost updates"
  - "Exercise: count a futex mutex's system calls"
---
## Introduction

Your service keeps an in-memory count of active sessions. Request threads add one on login and subtract one on logout. After a day of traffic the dashboard shows minus 1,312 active sessions. No request failed, nothing was logged, and the code is two lines long.

Every one of those lost updates came from the same place. Adding one to a counter is not one operation, and two threads did it at the same time. And a race is not a rare event you can wait out. At a million increments a second, an interleaving with a one-in-a-million chance happens every second.

The fix is not "add a lock" as a reflex. The fix is knowing what the lock protects, and that is almost never a single variable. Four ideas: why the update is lost, the difference between a data race and a race condition, what a mutex actually does, and what contention costs.

## Three instructions, not one

Adding one to a counter reads like a single action. It compiles to three: load the value into a register, add one to the register, store the register back. The register is private to each thread. Memory is shared.

Here is the smallest picture of the bug. Two threads, A and B, and a counter at 41. A loads 41. Before A stores, B also loads 41. A adds and stores 42. B adds and stores 42. Two increments ran, and one survived. That is the lost update.

And there is no floor of "off by a little". If A loads zero and stalls while B completes 999 increments, A's store of 1 erases all 999 at once.

The lesson measured it. Four C threads, each incrementing a shared counter 10 million times, so the right answer is 40 million. A version marked volatile, so the compiler cannot optimise it away, ended at about 11 million. It lost 72 percent of its updates.

The most instructive version is the plain one, compiled with optimisation. It ended at exactly 40 million, and it is still wrong. Because a data race is undefined behaviour in C, the compiler assumed no other thread touches the variable, collapsed ten million increments into a single addition of 10 million, and the four additions happened not to overlap. The race is still there, hidden by an optimisation that is only legal because the program is wrong.

For comparison, the correct versions: an atomic add costs about 5.7 nanoseconds per increment in that test, and a mutex around the increment about 26.

## Data races versus race conditions

Two terms that people use interchangeably, and should not.

A data race is a property of memory accesses. Two threads touch the same location, at least one writes, and nothing orders them: no lock, no atomic, no channel operation establishes that one happens before the other.

A race condition is a property of logic. Correctness depends on the relative timing of operations. And you can have a race condition with no data race at all.

Picture a bank account where reading the balance takes a lock, and setting the balance takes the same lock. Every access is locked, so a race detector stays silent. Now a withdraw function checks whether the balance covers the amount, then sets the balance to the old value minus the amount. Two threads each withdraw 80 from 100.

[pause]

Both pass the check before either acts. Both succeed, 160 is paid out, and the balance ends at 20, or at minus 60 with a different interleaving. The lock protected each access. Nothing protected the decision. That pattern is check-then-act, and the counter bug is its cousin, read-modify-write.

What a data race means also depends on the language. In C and C plus plus it is undefined behaviour. In safe Rust it is a compile error. In Go it is detectable at runtime with the race detector, and races on multi-word values like interfaces and slices can produce torn values no thread wrote. In Java it is defined but weak. In CPython with the global interpreter lock, a single bytecode is atomic, but sequences of bytecodes race.

The rule to keep: race detectors find data races. Race conditions need you to find them, by naming the invariant.

## A lock protects an invariant

An invariant is a statement about your data that must hold whenever another thread might look. "The session count equals the number of live sessions." "Every key in the map has exactly one node in the LRU list." Invariants usually span several variables, and every update breaks them briefly. The critical section is the stretch of code during which the invariant may be false.

Here is the rule that separates correct locking from decorative locking. Every access to the data an invariant covers, reads included, goes through the same lock, and the lock is held for the whole span in which the invariant is broken.

Take a transfer of 100 from account A, holding 500, to account B, holding 300. The invariant is that they sum to 800. Inside the lock, A is debited first, and for a moment the total is 700. Then B is credited and it is 800 again. If a total method skipped the lock "because it only reads", an auditor thread could land between those two lines and report 700. Nothing is corrupted, but your reconciliation job has just paged someone.

And the balance check sits inside the same critical section as the debit. That is what fixes the withdraw bug: the decision and the update are one atomic step from every other thread's point of view.

## What a mutex does

A mutex is a word of memory plus a promise from the kernel. On Linux the design is the futex, the fast userspace mutex, and its point is to keep the common case out of the kernel.

The word has three states: zero for unlocked, one for locked, two for locked with someone possibly waiting. To lock, a thread tries one atomic compare-and-swap from zero to one. If that succeeds, it owns the lock without any system call. If it fails, the thread sets the word to two, to announce a waiter, and asks the kernel to put it to sleep. To unlock, the holder sets the word to zero, and only if the old value was two does it make a system call to wake someone.

There is one subtle point, and it is the kind interviewers like. Thread B sets the word to two and is about to call the kernel to sleep, but just before the call, the holder unlocks. Why does B not sleep forever? Because the kernel re-checks the word under its own lock before sleeping. It sleeps only if the word still equals two. After the unlock it is zero, so the call returns immediately and B retries. A wake-up can never be lost.

Three consequences. An uncontended lock never enters the kernel: one compare-and-swap to lock, one exchange to unlock. Glibc's mutex, Rust's standard mutex and Go's mutex all have this shape. Second, contention is what costs: a sleep and a wake are system calls, a context switch, and a wake-up that waits for a core. Go's mutex spins briefly, then parks, and switches to a first-in first-out starvation mode once a waiter has waited more than a millisecond. Third, a mutex orders memory. Everything the previous holder wrote before unlocking is visible to the next holder after locking. A hand-rolled boolean flag gives you neither exclusion nor visibility.

## What locking costs

Uncontended locks are cheap. A lock and unlock on one thread measured about 8 nanoseconds in C and in Go. Python's lock statement around nothing was 53 nanoseconds.

Contended locks are not cheap, and adding threads can reduce throughput. In the lesson's test, each thread takes the mutex, does about 50 nanoseconds of work inside and 50 outside. One thread managed 9.3 million operations a second. Sixteen threads managed 2.9 million. Sixteen threads did a third of the work of one.

Every handoff moves the lock's cache line, and the data it protects, between cores. As waiters pile up, more of them fall to the slow path and sleep. At sixteen threads, one operation in ten involved a context switch. That collapse is a lock convoy, and it is why adding threads makes a lock-bound service slower.

Here is the arithmetic for design reviews. A lock held for 2 microseconds per request caps throughput at 500 thousand requests a second, on any number of cores, and handoff costs push the real ceiling lower.

## Python, Go and Rust

Python first. The default build has a global interpreter lock, the GIL, and in CPython 3.14 the running thread only gives it up at calls and loop back-edges. So four threads adding one to a counter a million times each ended at exactly 4 million in every run. People run that experiment, see the right answer, and conclude it is safe. It is not. Put a function call inside the increment and the window opens: 2.74 million out of 4 million. And the free-threaded build removes the illusion entirely. Single operations on built-in containers, like one append or one dictionary assignment, stay safe. Compound operations, like check-then-insert, never were.

Go puts the mutex next to the data it guards, and ships a race detector. It slows execution roughly 2 to 20 times, and it only reports races that actually execute. A clean run over tests that never run things concurrently proves nothing.

Rust makes the mutex own the data. You can only reach the data through the guard the lock returns, so "this lock protects this data", a comment in Go and Python, is part of the type. But Rust does not prevent race conditions. The withdraw bug compiles fine if each step locks separately.

## Granularity

A lock is correct when it covers the invariant, and fast when it is rarely contended. Correctness first, then contention. The techniques, in the order to reach for them: shrink the critical section; stripe the lock across several locks chosen by hashing the key; shard the data per thread and sum on read; publish immutable snapshots and swap a reference; or do not share at all, with one owner thread and messages in.

The most common granularity bug is a cache that holds its lock across a database call, so every other request waits 20 milliseconds for this one's query. The fix is to check under the lock, do the slow work outside it, and publish under it. If the duplicate database work matters, use single-flight: the first caller registers an in-flight result, and later callers wait on it.

## In the interview

A follow-up the lesson expects. Two threads each add one to a counter n times, with no lock. What is the minimum possible final value?

[pause]

Two. The tempting answer is at least n, because each thread's own increments must survive. They do not. A store of a stale value erases every increment made since that load. Thread A loads zero and stalls, B does all but one of its increments, A stores 1 and wipes them out. Then B loads 1 and stalls, A finishes its run, and B's final store writes 2.

And another. A lock is held for 10 microseconds per request. What is the maximum throughput, and how do you raise it? 100 thousand a second regardless of cores, and lower once handoffs are counted. The wrong answer is more threads or more cores. The right one: shrink the critical section, stripe it, shard the data, or remove sharing.

## Recap

Four things to remember. Adding one is load, add, store, and one stale store can erase any number of increments. A data race is unordered memory access that tools can find; a race condition is timing-dependent logic that only naming the invariant finds. A lock protects an invariant, readers take it too, and the check and the act live in one critical section. And an uncontended lock costs nanoseconds while contention costs microseconds, so a lock's hold time sets a hard ceiling on throughput.

At your desk: the register trace and the C measurements, the futex code and its trace, the counter in three languages, and the two exercises on replaying schedules and counting futex system calls.

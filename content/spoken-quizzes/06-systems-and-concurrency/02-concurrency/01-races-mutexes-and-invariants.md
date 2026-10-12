---
lesson: races-mutexes-and-invariants
source: 357ee331ec9c5ec3
---
## 1

Two threads each increment x by one, a thousand times, on a free-threaded Python build, with x starting at 0 and no lock. Which range of final values is possible?

A, anywhere from 2 to 2,000. B, exactly 2,000 every time. C, anywhere from 0 to 2,000. D, anywhere from 1,000 to 2,000.

[think]

The answer is A: anywhere from 2 to 2,000.

A thousand is the tempting floor, but a single stale store can erase many increments. Thread A loads 0 and stalls while B completes 999 increments. A stores 1. B loads that 1 and stalls while A completes its remaining 999. Then B stores 2. The floor is 2, because every store writes a loaded value plus one, and each thread's final load comes after its own earlier stores.

## 2

Four C threads each increment a plain, non-atomic global counter 10 million times. Compiled with optimisation, the result is exactly 40 million. What does that show?

A, the compiler collapsed each loop into one addition, hiding the race. B, the threads ran one after another because the loop was short. C, x86 makes aligned 64-bit increments atomic, so no race exists. D, the C library adds a lock prefix to shared globals automatically.

[think]

The answer is A: the compiler collapsed each loop into one addition, hiding the race.

Because a data race is undefined behaviour in C, the compiler may assume no other thread touches the variable, and it turned ten million increments into a single addition of 10 million. Four such additions rarely overlap. The race is still there, as the volatile version shows by losing 72 percent of its updates. And x86 increments without a lock prefix are not atomic.

## 3

In a futex-based mutex, thread B finds the lock held, sets the state to 2, and calls futex wait, expecting the value 2. Just before that system call, the holder unlocks. Why does B not sleep forever?

A, the holder's wake is queued until B finishes going to sleep. B, futex wait re-checks the word under the hash bucket's lock, and returns. C, B spins for a millisecond before sleeping, so it sees the unlock. D, the kernel wakes every sleeper on any futex whenever one unlocks.

[think]

The answer is B: futex wait re-checks the word under the bucket lock, and returns.

The kernel sleeps only if the word still equals the expected value, and it checks that atomically with queueing the thread, under the hash bucket's lock. After the unlock the word is 0, so futex wait returns at once and B retries the exchange. Wake-ups are not queued for future sleepers, spinning is optional and bounded, and wakes target one address.

## 4

A lock-protected section takes about 50 nanoseconds. Measured throughput is 9.3 million operations a second with one thread, and 2.9 million with 16. What is the main cause?

A, the mutex switches to a slower algorithm above 8 threads. B, handoffs move the lock's cache line between cores, and more waiters fall asleep. C, each thread's stack no longer fits in the level 1 data cache. D, the scheduler time-slices the 16 threads onto one core.

[think]

The answer is B: handoffs move the lock's cache line, and more waiters sleep.

Every acquisition by a different core pulls the lock and the protected data across the interconnect. As waiters pile up, more of them fall to the futex slow path, about one context switch for every ten operations at 16 threads here. That is a lock convoy. The threads run on different cores, the algorithm does not change, and stacks are irrelevant.

## 5

A bank class locks correctly inside its transfer method. A new total method reads all the balances without the lock, because it only reads. What can go wrong?

A, it can deadlock with transfer when both run together. B, nothing, because reads alone cannot corrupt shared data. C, it can see a transfer halfway through and report a false total. D, balances can go negative when it races with transfer.

[think]

The answer is C: it can see a transfer halfway through and report a false total.

Between the debit and the credit, the invariant, that the sum is constant, is false. A reader outside the lock can see that intermediate state and report a sum that was never true. Nothing is corrupted, but locks exist to hide broken invariants from every observer, readers included. And a reader that takes no lock cannot deadlock.

## 6

Your Go service's tests pass with the race detector turned on. What have you learned?

A, the program has no data races and no race conditions. B, no data race occurred in the interleavings the tests actually ran. C, the program has no data races on any possible code path. D, the program has no data races and cannot deadlock.

[think]

The answer is B: no data race occurred in the interleavings the tests ran.

The race detector is dynamic. It tracks happens-before for the accesses that really happen during the run, so a clean run only says that no data race occurred on the paths and interleavings those tests executed. It says nothing about race conditions that involve no data race, or about deadlocks.

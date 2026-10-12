---
lesson: deadlock
source: c1037e8793f62a33
---
## 1

Thread 1 locks A, then B. Thread 2 locks B, then A. Which change removes the possibility of deadlock?

A, have both threads lock A first, then B. B, add a short sleep between the two locks. C, raise thread 1's scheduling priority. D, replace both locks with reentrant locks.

[think]

The answer is A: have both threads lock A first, then B.

A single global order makes circular wait impossible. Reentrant locks only let the same thread re-acquire a lock it already holds; they do nothing for a cycle between two threads. A sleep widens the deadlock window rather than closing it, and priority does not force anyone to release a lock.

## 2

A Go HTTP service has two goroutines deadlocked on each other's mutexes, but the runtime never reports that all goroutines are asleep. Why?

A, Go detects deadlocks on channels only, never on mutexes. B, deadlock detection is off unless a debug setting enables it. C, the check needs every goroutine blocked, and the listener is not. D, the race detector is disabled, and it is what reports deadlocks.

[think]

The answer is C: the check needs every goroutine blocked, and the listener is not.

The built-in check is global. It fires only when no goroutine can ever run again. Any healthy goroutine, such as the HTTP listener waiting for connections, means the process is not globally deadlocked, so partial deadlocks are silent, whether they involve mutexes or channels. Dump the goroutine stacks to find them.

## 3

Two threads use try-lock, with a fixed 10 millisecond retry delay, to acquire two locks in opposite orders. Monitoring shows the CPU at 100 percent and zero completed operations. What is this, and what fixes it?

A, a data race; guard the retry loop with a mutex. B, livelock; add random jitter to the retry delay. C, deadlock; impose a global lock acquisition order. D, starvation; switch to a fair, first-in first-out lock.

[think]

The answer is B: livelock, fixed by random jitter on the retry delay.

Nobody is blocked forever. Both threads are actively retrying in lock-step, which is livelock. Randomised backoff breaks the symmetry, so one thread eventually gets both locks. A lock order would also fix it, but the symptom, busy with no progress, is livelock, not deadlock, which shows near-zero CPU.

## 4

The Linux kernel's lockdep reports a possible deadlock between locks A and B, on a kernel that has never actually hung. What did it observe?

A, lock A was released by a thread that never acquired it. B, two threads were blocked on A and B at the same instant. C, both locks were held longer than the hung-task timeout. D, one path took B while holding A, and another took A while holding B.

[think]

The answer is D: one path took B while holding A, and another took A while holding B.

It records an edge from each held lock class to each acquired class the first time the pair is seen, and reports when a new edge closes a cycle. The two orders may have run hours apart on different CPUs; the report means some interleaving can deadlock, not that one happened. Long hold times, simultaneous blocking and wrong-owner releases are different checks.

## 5

A payment transaction fails in production with PostgreSQL's deadlock detected error. What is the right response in the application?

A, retry it, and always update rows in a consistent order. B, raise the deadlock timeout, so the database waits longer first. C, switch the transaction to read uncommitted isolation. D, report the payment as failed to the user, and move on.

[think]

The answer is A: retry it, and update rows in a consistent order.

PostgreSQL has already broken the cycle by aborting this transaction, and the other one proceeded. Retrying is correct and expected, and a consistent row order makes recurrences rare. A longer deadlock timeout only delays detection, the isolation level does not remove row-lock cycles, and failing the payment turns a transient condition into a user error.

## 6

In a wait-for graph, T4 waits for T1, T1 waits for T2, T2 waits for T3, and T3 waits for T2. A detector must abort one thread. Which choices actually resolve the deadlock?

A, none; the detector has to abort all four threads. B, only T2 or T3, the two members of the cycle. C, T1 or T4, because they have waited the longest. D, any of the four, since all of them are stuck.

[think]

The answer is B: only T2 or T3, the two members of the cycle.

The cycle is T2 and T3. Aborting T1 or T4 releases their locks but leaves the cycle intact, so T2 and T3, and whoever waits behind them, stay stuck. Aborting either member of the cycle lets the other proceed, and the threads behind it follow.

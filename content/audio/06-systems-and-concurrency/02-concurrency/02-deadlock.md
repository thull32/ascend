---
lesson: deadlock
source: 36f8a19511b7e488
fit: great
desk:
  - "The Go transfer code and its four-step deadlock trace, then the ordered version"
  - "The Rust match-scrutinee self-deadlock and its one-line fix"
  - "The wait-for graph with one cycle and two threads blocked behind it"
  - "The prevention, avoidance and detection comparison table"
  - "Exercise: find the deadlocked threads in a lock table"
  - "Exercise: find potential deadlocks the way lockdep does"
---
## Introduction

Once a week, usually in the small hours, your order service stops responding. CPU drops to zero. Health checks time out, the orchestrator restarts the pod, and everything is fine for another week. When someone finally captures a thread dump before the restart, it shows two threads, each parked inside a lock call, each holding the lock the other one wants.

Nobody will ever release anything, because releasing is the next line of code after an acquisition that will never return. That is a deadlock: a set of threads, each waiting for something only another member of the set can provide.

It has two siblings that look different on a dashboard but share a root cause. Livelock, where everyone is busy and nobody progresses. And starvation, where somebody never gets a turn. Coming up: the four conditions a deadlock needs, the lock order that removes it from your code, how databases detect it instead, and how the retry loop that fixes deadlock turns into livelock.

## Two threads, two locks

The textbook version is also the production version. A transfer function locks the source account, then the destination. One goroutine transfers from Alice to Bob. Another, at the same moment, transfers from Bob to Alice.

Four steps. The first goroutine locks Alice. The second locks Bob. The first now tries to lock Bob, and blocks. The second tries to lock Alice, and blocks. Each holds what the other wants, and each one's unlock only runs after a lock that will never return.

How small is the window? Both goroutines must be between their first and second lock at the same moment, a window of tens of nanoseconds. Yet in the lesson's test, two goroutines doing nothing but opposite-direction transfers in a loop deadlocked after somewhere between about 2 thousand and 4 thousand transfers. With Python threads it never took more than 31 milliseconds.

A hot loop hits a tiny window in milliseconds. In production only a few transfers a second run in opposite directions at the same instant, which is why it takes a week. And the rate grows with traffic, with core count, and with anything that widens the window, like a log line between the two locks. Deadlocks that never happen in staging are deadlocks whose window staging traffic has not hit yet.

## The four conditions

In 1971, Coffman and colleagues showed that a deadlock needs four conditions at once. Remove any one and deadlock is impossible.

Mutual exclusion: a resource can be held by only one thread. Hold and wait: a thread holds one resource while waiting for another. No preemption: nobody can take a resource away from its holder. And circular wait: a cycle of threads, each waiting on the next.

Here is what makes the list useful rather than trivia. Application code breaks circular wait, with a lock order. Databases break no preemption: they let the deadlock happen, detect it, and abort a victim. Retry designs break hold and wait. Knowing which condition a fix attacks is what lets you predict how that fix fails. Ordering needs discipline across the codebase. Try-lock needs jitter. Abort needs rollback.

There is also avoidance, Dijkstra's banker's algorithm, which checks before every grant that some order still lets every thread finish. Almost nobody uses it, because nobody knows their maximum lock needs in advance, and the check is expensive per grant.

## Lock ordering

Give every lock a rank, and always acquire locks in increasing rank. For the bank, the account ID is a natural rank: whichever account has the lower ID is locked first, regardless of which direction the money flows.

Why can this never deadlock? Before I say it, try to put it in one sentence yourself.

[pause]

Suppose a cycle of waiting threads existed. Each thread waits for a lock ranked higher than every lock it holds, including the one the previous thread in the cycle wants. So walking around the cycle, the ranks strictly increase at every step, and yet you arrive back where you started. A strictly increasing sequence cannot return to its start. So there is no cycle.

Two details separate a correct implementation from a nearly correct one. Equal ranks: a transfer from an account to itself locks one non-reentrant mutex twice, and deadlocks the thread with itself, so check for it first. And unstable ranks: ordering by memory address works in C and Go, where heap objects do not move, but not under a compacting collector, and never by a hash, since two objects can hash equally. Use a stable, unique ID.

In a big codebase, ranks become a lock hierarchy: the session lock is level one, the cache lock level two, take two while holding one, never the reverse. Write it next to the locks, and let a tool check it.

## Finding deadlocks before they happen

The Linux kernel's lockdep is the model. It groups locks into classes, and the first time it sees a thread acquire class Y while holding class X, it records an edge from X to Y. When a new edge closes a cycle in that graph, it reports both acquisition stacks, even if the two paths ran hours apart on different CPUs and never actually deadlocked. ThreadSanitizer in C and C plus plus reports lock-order inversions the same way. Java's thread dump prints the cycle when it finds one.

Go is the trap. Its runtime only detects total deadlock, when every goroutine is asleep. A server with an idle HTTP listener never qualifies, so a partial deadlock is completely silent. You find it by dumping every goroutine's stack and looking for goroutines blocked on each other's mutexes.

The simplest deadlock needs one thread. Python's lock, Go's mutex and Rust's mutex are all non-reentrant: lock it twice from the same thread and you wait for yourself forever. It usually happens when one locking method calls another. The convention is to lock only in public methods and have private helpers assume the lock is held. A reentrant lock hides the problem, because it lets a method run while its own invariant is half-updated, which is why Go deliberately does not provide one. Rust has its own version of this trap, where a guard lives longer than it looks; that one is at your desk.

## Deadlock without mutexes

Anything that makes a thread wait for another can close a cycle. Two goroutines that each send on an unbuffered channel the other only reads after its own send. A pool of 4 threads whose tasks submit subtasks to the same pool and wait for them: with 4 such tasks running, every worker waits for subtasks that sit in the queue with nobody to run them. Two database transactions, one updating row 17 then 42, the other 42 then 17.

And callbacks under a lock. An object notifies listeners while holding its lock, and a listener calls back into it. The rule is called open calls: never call code you do not control while holding a lock. Copy what you need, release, then call.

There is also priority inversion. A low-priority task holds a mutex a high-priority task needs, and medium-priority tasks keep the low one from running. The Mars Pathfinder lander hit this in 1997 and kept resetting until engineers enabled priority inheritance, which temporarily raises the holder to the waiter's priority.

## Detection in databases

When you do not control the acquisition order, as in a database running arbitrary transactions, you let deadlocks happen and detect them. Build a wait-for graph: one node per transaction, and an edge from T to U when T is blocked on something U holds. A deadlock exists exactly when the graph has a cycle.

Here is the subtle part. Four threads: T4 waits for T1, T1 waits for T2, T2 waits for T3, and T3 waits for T2. All four are stuck. Which one do you abort?

[pause]

Only T2 or T3. They are the cycle. T1 and T4 are blocked behind it, not on it. Abort T1, and T4 proceeds, but T2 and T3 stay stuck. A detector has to break the cycle itself.

PostgreSQL does not check on every wait, because a consistent snapshot of the lock table is expensive and most waits resolve quickly. A waiting backend sets a timer, and after the deadlock timeout, one second by default, it walks the graph from itself and aborts itself if it is on a cycle. MySQL's InnoDB checks immediately, and rolls back the transaction that has changed the fewest rows. Under very high concurrency that check becomes a bottleneck, so it can be turned off, falling back to a lock wait timeout of 50 seconds.

The application side: a deadlock error from the database is normal and expected. Retry it. And update rows in a consistent order, sorted by primary key, so retries stay rare.

## Livelock and starvation

The other way out is to refuse to wait while holding something. Take the first lock, try the second with a short timeout, and if that fails, release everything and start again. This cannot deadlock. It can livelock.

Picture two threads transferring in opposite directions with a fixed retry delay. Both take their first lock, both fail on the second, both release, both retry at the same instant, forever. CPU is at 100 percent, every thread is running, and nothing completes. It is two people in a corridor stepping aside in the same direction. Random backoff breaks the symmetry, so the jitter is not optional.

The best production use of timeouts is diagnostic: an acquisition with a 30-second timeout that raises with a stack trace turns a silent hang into an alert.

Starvation is subtler. The system makes progress and the averages look fine; only the tail is broken. The usual cause is an unfair lock. A thread that releases a mutex and immediately takes it again is already running with a hot cache, while the waiter it woke still has to be scheduled, so the running thread wins almost every time. That is called barging: great for throughput, terrible for the waiter. Go's mutex allows barging until a waiter has waited more than a millisecond, then hands the lock over in arrival order. Java's fair lock does that always, and is noticeably slower under contention.

To tell the three apart from a CPU graph: deadlock sits near zero. Livelock is high, with nothing completing. Starvation looks normal, with some requests that never finish.

## In the interview

The lesson's classic follow-up. Prove that ordering locks by ID prevents deadlock.

[pause]

In any supposed cycle, each thread waits for a lock ranked higher than the one the previous thread wants, so the ranks strictly increase around a closed loop, which is a contradiction. The weak answer is "because threads always take locks in the same order", which only restates the rule.

And one more. How would you find potential deadlocks before production? Record lock-order edges at runtime, from the held lock's class to the acquired one, and fail on a cycle, as lockdep and ThreadSanitizer do, in CI and staging. "Load-test until it deadlocks" is the wrong answer.

## Recap

Four things to remember. A deadlock needs four conditions at once, and every fix breaks exactly one: ordering breaks circular wait, try-lock breaks hold and wait, abort breaks no preemption. In your own code, use a global lock order on a stable, unique ID, handle the equal-key case, and enforce it with a checker. In databases, deadlock errors are normal: retry them and touch rows in primary key order. And deadlock shows near-zero CPU, livelock shows full CPU with no progress, and starvation hides in the tail.

At your desk: the transfer code and its trace, the Rust scrutinee trap, the wait-for graph, the strategy table, and the two exercises on finding cycles in a lock table and in lock-order edges.

---
lesson: condition-variables-and-semaphores
source: e24881f2b3e21918
fit: partial
desk:
  - "The polling versus condition variable measurement table"
  - "The lost wake-up trace, and CPython's private-lock trace that fixes it"
  - "The capacity-one bounded buffer hang with one shared condition variable, step by step"
  - "The bounded queue in Python and Rust, the semaphore buffer, and the Go semaphore idiom"
  - "The waiting-primitive comparison tables, by property and by language"
  - "Exercises: replay a blocking bounded buffer, and replay a counting semaphore"
---
## Introduction

A background worker pulls jobs from an in-memory queue. The first version loops: while the queue is empty, sleep 10 milliseconds. It works, but every idle worker wakes a hundred times a second, and a job that arrives waits up to 10 milliseconds for no reason. Someone fixes the latency by removing the sleep, and forty idle workers pin forty cores at 100 percent.

The second version replaces the sleep with a flag and a lock. And once every few days, a worker sleeps forever with a job sitting in the queue.

Waiting for a lock and waiting for a condition are different problems. A mutex lets you wait until nobody else is in the critical section. It cannot make you wait until "the queue is non-empty". That needs a primitive that puts a thread to sleep until another thread changes shared state, without ever missing the change. Four ideas: the lost wake-up, the condition variable's contract, why the wait goes in a while loop, and what a semaphore counts that a condition variable does not.

## What polling costs

The lesson measured it with 40 idle workers. Polling with a 10 millisecond sleep cost about 5 percent of a core while idle, and a hand-off waits half the interval at the median, about 5 milliseconds. Cut the sleep to one millisecond, and idle CPU went up while the median hand-off was still about half a millisecond.

A condition variable cost nothing while idle, and handed off in 33 microseconds at the median.

So polling trades CPU for latency and gets neither. Halve the interval and you double the idle cost to halve the delay.

## The lost wake-up

Here is the naive design. The consumer takes the lock, checks the queue, and if it is empty, releases the lock and goes to sleep. The producer takes the lock, appends a job, releases it, and wakes anyone sleeping.

Two actors, four steps. The consumer locks, sees an empty queue, unlocks. Now, before it sleeps, the producer locks, appends a job, unlocks, and wakes all sleepers. Nobody is asleep yet. Then the consumer goes to sleep.

[pause]

The signal arrived before anyone was listening, and vanished. The consumer sleeps until the next job, possibly forever, with a job sitting right there. That is the lost wake-up. The fix is to make "release the lock" and "go to sleep" a single atomic step with respect to notifications. And that is the contract of a condition variable.

## The condition variable contract

A condition variable is a wait queue attached to a mutex, with three operations. Wait: atomically release the mutex and sleep, and when woken, reacquire the mutex before returning. Notify: wake one sleeping thread, if there is one. Notify all: wake every sleeping thread.

Notifications are not stored. A notify with nobody waiting does nothing. And that is fine, because the condition variable is not the condition. The condition is a predicate over your shared data, like "the queue is non-empty", protected by the mutex, and the thread always checks it itself. The condition variable only says "something may have changed; look again".

The pattern, in words. On the waiting side: take the lock, and while the predicate is false, wait. Then act, holding the lock, knowing the predicate is true. On the changing side: take the lock, make the predicate true, notify.

How is "release and sleep atomically" actually built? No implementation does it in one instruction. Each one makes the wake-up stick even if it arrives before the sleep. CPython's version is the clearest. Before releasing the outer lock, the waiter creates a private lock, acquires it, and adds it to the condition's list of waiters. Then it releases the outer lock and tries to acquire its private lock a second time, which blocks. Notify simply releases a waiter's private lock. So if the notify lands in the gap, the private lock is already unlocked, and the waiter's second acquire returns at once. The wake-up was stored in that lock's state. Registering before releasing is the whole trick.

Rust on Linux uses a sequence counter in a futex instead: the waiter reads the counter while holding the mutex, and the kernel only sleeps it if the counter has not changed since.

## Why while, never if

A thread returning from wait knows only that it was woken, not that the predicate is true. There are three separate reasons it might not be.

The first is stolen wake-ups. Almost every real condition variable uses what are called Mesa semantics: notify makes a waiter runnable, but it still has to reacquire the mutex, and any thread can get there first. Two consumers, an empty queue. Consumer one waits. The producer adds an item and notifies; consumer one becomes runnable but has not run yet. Consumer two arrives, takes the mutex, sees the item without ever waiting, and removes it. Consumer one finally gets the mutex, and the queue is empty.

With an if around the wait, consumer one now removes from an empty queue and crashes. The lesson measured four consumers draining 200 thousand items: with if, 4 errors. With while, zero. Four in 200 thousand is exactly the rate that passes every test and fails in production.

The second reason is spurious wake-ups. POSIX allows a wait to return when nobody signalled, and Java, Rust and C plus plus document the same. The third is a shared condition variable: if several predicates share one, or someone used notify all, you may have been woken for someone else's change.

The loop is so universal that libraries offer it directly: Python's wait-for, Rust's wait-while, C plus plus's wait with a predicate. Prefer them. They make the wrong version impossible to write.

## Notify one, or notify all

Notify all is always correct and sometimes slow. The lesson measured 64 waiting consumers and 20 thousand items published one at a time. With notify, about 96 microseconds per item. With notify all, about 1,600 microseconds per item, and over half a million wasted wake-ups, each thread waking, reacquiring the mutex, finding nothing, and sleeping again. That is a thundering herd: about 29 wasted wake-ups and 17 times the latency per item.

But notify one is only safe when every waiter waits for the same predicate, and any single waiter can consume the change. The classic violation is a bounded buffer with one condition variable shared by producers, waiting for "not full", and consumers, waiting for "not empty". With a capacity of one, the lesson traces a sequence where a consumer's notify, meant for the producer, wakes the other consumer instead. That consumer finds the buffer empty and goes back to sleep, swallowing the only wake-up. Everyone ends up asleep, the buffer has room, and the one thread that could fill it was never told.

The standard answer is two condition variables sharing one mutex: not-full for producers, not-empty for consumers, each notified only when its predicate may have become true.

Should you notify inside or outside the lock? Both are correct, as long as the state change happens under the lock. Default to inside, and move it only if a profile says so.

## Semaphores

A semaphore is an integer count with two atomic operations. Acquire decrements if the count is positive, and otherwise blocks until it is. Release increments and wakes one waiter.

The crucial difference from a condition variable: a semaphore remembers. A release with nobody waiting raises the count, and the next acquire goes straight through. A lost wake-up is impossible by construction, because the count is the state.

Two uses. Bounding concurrency: N permits admit at most N threads, like 10 database connections or 20 in-flight calls to a partner API. And signalling: a semaphore starting at zero lets one thread wait until another releases it, even though the releasing thread never acquired anything.

You can build a bounded buffer from two semaphores, one counting empty slots and one counting items, plus a mutex for the queue itself. And it has an ordering trap. A producer must wait for an empty slot before taking the mutex. Do it the other way round, and the first time the buffer fills, a producer sleeps holding the mutex, while the consumer that would free a slot needs that mutex to take an item. The general rule: never block waiting for another thread while holding a lock that thread needs.

And a binary semaphore, with one permit, is not a mutex. It has no owner. Any thread can release it. So there is no priority inheritance, no detection of an unlock by the wrong thread, and no protection against a double release, which raises the count to two and lets two threads into your critical section. Python's bounded semaphore raises an error on an over-release for exactly this reason.

In Go you rarely write any of this: a buffered channel is a bounded blocking queue, and its capacity works as a permit count.

## In the interview

A follow-up the lesson expects. Why does wait need the mutex at all?

[pause]

Because the predicate is shared state, so it must be checked under the mutex, and wait must release that mutex and start sleeping without a gap in which a notify could be lost. Implementations close the gap by registering the waiter before releasing: Python's private lock, Rust's sequence counter. The wrong answer is "to make notify thread-safe".

And: when is notify one safe instead of notify all? When all waiters wait on the same predicate and any one of them can consume the change. Otherwise, use separate condition variables or broadcast. "Notify one is always fine because the waiters loop" is the wrong answer; the loop does not wake the thread that was never told.

## Recap

Four things to remember. Polling buys latency with CPU and is bad at both; a condition variable costs nothing while idle. Notifications are not stored, so the predicate lives in your data, under the mutex, and wait releases and sleeps without a gap. Always wait in a while loop, because of stolen wake-ups, spurious wake-ups and shared condition variables; with if, the lesson saw 4 failures in 200 thousand. And use one condition variable per predicate, a semaphore to count, a mutex to exclude, and never block on another thread while holding a lock it needs.

At your desk: the polling measurements, the lost wake-up and private-lock traces, the shared-condition-variable hang, the queue code in Python, Rust and Go, the comparison tables, and the two replay exercises.

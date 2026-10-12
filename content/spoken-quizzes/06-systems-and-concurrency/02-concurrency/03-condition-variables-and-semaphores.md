---
lesson: condition-variables-and-semaphores
source: e4635c984f23e36b
---
## 1

Why must a condition variable's wait release the mutex and go to sleep as one atomic step?

A, so the waiting thread keeps its cache warm while it sleeps. B, a notify in that gap is lost, so the thread may sleep forever. C, because a sleeping thread has no way to release a held mutex. D, so that woken threads are guaranteed to run in first-in first-out order.

[think]

The answer is B: a notify in that gap is lost, so the thread may sleep forever.

Notifications are not stored. If the state changes and notify runs after the waiter unlocked but before it slept, nobody is on the wait queue to receive it, and the thread may sleep forever. Implementations close the gap by registering the waiter before releasing. It has nothing to do with caches or wake-up order.

## 2

In CPython, a condition's wait registers a private, already-acquired lock in the condition's waiter list, releases the outer lock, then tries to acquire the private lock again. Why is a notify that runs before that second acquire not lost?

A, the outer lock is still held, so notify cannot run in that gap. B, notify retries in a loop until it sees the waiter asleep. C, notify releases the private lock, so the acquire returns at once. D, the GIL prevents notify from running before the waiter blocks.

[think]

The answer is C: notify releases the private lock, so the acquire returns at once.

The private lock stores the wake-up. Notify releases it whether or not the waiter has blocked yet, and the waiter's second acquire then succeeds immediately. Notify does not loop or check whether anyone sleeps, the GIL can switch threads at the acquire call, and the outer lock has already been released at that point.

## 3

A consumer takes the condition's lock, waits once if the queue is empty, using an if rather than a loop, and then pops from the front of the queue. Under load it occasionally raises an IndexError. What is the cause?

A, another consumer took the item first, or the wake-up was spurious. B, the producer appended the item to the wrong end of the deque. C, the deque is not thread-safe, so the pop races with the append. D, notify was called without holding the lock, so it misfired.

[think]

The answer is A: another consumer took the item first, or the wake-up was spurious.

Under Mesa semantics, a woken thread must reacquire the mutex, and another consumer can get there first and empty the queue. Spurious wake-ups have the same effect. Measured here, 4 of 200 thousand items hit it. Rechecking the condition in a while loop fixes both. Every deque access here is under the lock, and Python raises a RuntimeError, not an IndexError, for an unlocked notify.

## 4

A bounded buffer uses one condition variable for both producers and consumers, and calls notify after every put and every take. It occasionally hangs, with every thread waiting and the buffer not full. Why?

A, a spurious wake-up left one thread holding the mutex forever. B, one condition variable cannot legally serve two predicates. C, the capacity is too small for the number of waiting threads. D, notify can wake the wrong kind of waiter, which goes back to sleep.

[think]

The answer is D: notify can wake the wrong kind of waiter, which goes back to sleep.

A consumer's notify, intended for a producer, can wake another consumer instead. That consumer finds the buffer empty and waits again, swallowing the only wake-up, and the producer is never woken. Two condition variables, not-full and not-empty, or notify all, fix it. Sharing one condition variable is legal, which is exactly why this bug compiles and runs.

## 5

64 consumers wait on one condition variable, and the producer calls notify all for every item. Compared with a single notify, what did the measurement show?

A, identical cost, since only one consumer can win the mutex. B, about 17 times the latency, with 29 futile wake-ups per item. C, lower latency, since the fastest consumer always wins the item. D, a deadlock, since woken consumers block each other on the mutex.

[think]

The answer is B: about 17 times the latency, with 29 futile wake-ups per item.

Every notify all woke all the waiters. Each reacquired the mutex in turn, found the queue empty, and slept again: over half a million futile wake-ups for 20 thousand items. Latency per item rose from 96 microseconds to about 1.6 milliseconds. Only one can win, but all of them pay to find out. There is no deadlock, only wasted work.

## 6

200 worker threads call a partner API that allows at most 20 concurrent requests. Which primitive fits best?

A, a condition variable with notify all. B, a counting semaphore holding 20 permits. C, a mutex held around each API call. D, an event that is set whenever the API is free.

[think]

The answer is B: a counting semaphore holding 20 permits.

Bounding concurrency to some number is exactly what a counting semaphore does: 20 permits, acquire before the call, and release after it in a finally block. A mutex allows only one call at a time. Building a counter from a condition variable reimplements a semaphore with more room for bugs, and an event cannot count.

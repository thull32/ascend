---
lesson: concurrency-interview-problems
source: efad121bd81470b2
fit: partial
desk:
  - "The full Python and Go solutions to all five problems"
  - "The print-in-order, queue shutdown, writer-preference and token bucket traces"
  - "The dining philosophers wait table, and the RWMutex against Mutex measurements"
  - "The choosing-the-primitive table, and the rest of the problem family"
  - "Exercises: replay a token bucket, and the grant order of a Go-style readers-writers lock"
---
## Introduction

The concurrency round is a different game from the algorithms round. Nobody asks for n log n. The interviewer asks for a thread-safe bounded blocking queue, watches you write it, and then asks what happens with two producers, what happens when the queue is shut down while a consumer is waiting, whether a writer can starve, and how you would test any of it. The code is short. The judgement is the interview.

Almost every problem in this family reduces to the same four moves, and saying them out loud is half the signal. One: name the shared state and its invariant. "The queue holds between zero and capacity items." Two: pick the primitive by what threads wait for. Waiting on a predicate over state means a mutex and a condition variable. Counting permits or signalling "done" means a semaphore or an event. Handing values over means a channel. Three: write every wait as a loop. Four: attack your own design, by walking the interleaving that would break it, then shutdown, fairness and testing.

Five problems come up most: print in order, the bounded blocking queue, the readers-writers lock, dining philosophers, and a thread-safe rate limiter. The code is at your desk. Here is the reasoning, and the follow-ups.

## Print in order

Three methods, first, second and third, are called by three threads in an unpredictable order. Make the output always come out first, second, third.

The insight is that nothing is shared except ordering, so no mutex is needed. Each method waits for a one-time signal from its predecessor. Second waits for "first done", prints, and sets "second done". Third waits for "second done". A one-shot signal is an event, a semaphore that starts at zero, or in Go, a closed channel, which every current and future receiver sees.

The worst start order is third, then second, then first. Third waits, second waits, first prints and sets its signal, second wakes, prints and sets its signal, and third wakes and prints. Correct in every order.

The follow-up: why not a lock? A mutex should be unlocked by the thread that locked it. Here the signal crosses threads, which is what events and semaphores are for. And an event is latched: if first sets it before second even starts waiting, second still goes straight through.

## The bounded blocking queue

A fixed-capacity queue where put blocks while full and take blocks while empty, safe for any number of producers and consumers. The senior version adds timeouts and shutdown.

Two predicates, "not full" for producers and "not empty" for consumers, so two condition variables over one mutex. Each wait is a while loop. A put notifies one consumer; a take notifies one producer.

Now shutdown, which is where the interview really is. Close sets a closed flag. Waiting producers fail at once. Consumers drain whatever is left, and only then are told the queue is closed. That is a choice, and you should say you made it.

Here is the follow-up that separates a memorised solution from an understood one. Close sets the flag and calls notify once on each condition variable. Three consumers are blocked in take. What happens?

[pause]

One consumer wakes and sees the queue is closed. The other two sleep forever. Notify wakes at most one waiter. A put makes exactly one item available, so waking one consumer is right. But closing changes the predicate for every waiter, so close must use notify all.

Capacity changes the cost more than language does. Four producers and four consumers moving 100 thousand items took 210 nanoseconds per item in Go at capacity one, and 68 at capacity 64. At capacity one, every item forces a hand-off between a producer and a consumer; a bigger buffer lets each side run a batch. And in production, a Go buffered channel is the whole implementation, and in Python, the standard queue with a max size.

## The readers-writers lock

Many threads read a shared structure, and a few update it. Allow any number of concurrent readers, give writers exclusive access, and make sure writers are not starved.

The invariant: if a writer is inside, there are no readers. The naive version lets readers in whenever no writer is inside. With frequent, overlapping reads, there is always at least one reader inside, the count never reaches zero, and the writer waits forever.

The fix is to let a waiting writer block new readers. Picture reader one inside. A writer arrives and waits. Reader three arrives; a writer is waiting, so reader three may not overtake it. Reader one leaves, the writer goes in alone, and when it finishes, reader three is let in.

The follow-up: can readers starve now? Yes. With writer preference, a steady stream of writers keeps readers out. Go's read-write mutex takes the middle road: a pending writer blocks new readers, and a finishing writer admits the readers queued behind it before the next writer, so batches alternate.

And the follow-up that catches people: is a readers-writers lock faster than a mutex for read-heavy data? Less than you would think. Eight goroutines, 1 percent writes: Go's read-write mutex was about 1.6 times faster than a plain mutex, not the 8 times that "readers run in parallel" suggests. Every read lock is an atomic update of one shared reader count, whose cache line bounces between cores, and every write drains all the readers. For read-mostly data, publishing immutable snapshots, or a seqlock, where readers write nothing and retry if a sequence number changed, scale further. Measure before reaching for one.

## Dining philosophers

Five philosophers sit around a table with one fork between each pair. Each needs both adjacent forks to eat. Design it so nobody deadlocks.

If everyone picks up the left fork first, each philosopher holds one fork and waits for the next philosopher's. A cycle. Measured with five goroutines and no thinking time, the table deadlocked within 100 milliseconds every time, after somewhere between about 700 and 3,600 meals.

Solution one is resource ordering, which breaks circular wait. Number the forks and always take the lower number first. The last philosopher sits between fork four and fork zero, so she reaches for fork zero first. If her neighbour holds it, she waits holding nothing, fork four stays free, and the philosopher on her other side can eat. The Go version served 100 thousand meals in 3 milliseconds.

Solution two is the waiter: a semaphore that lets only four of the five philosophers reach for forks at once. Why does that make deadlock impossible?

[pause]

Four philosophers, five forks. By the pigeonhole principle, at least one of them can always get both, so the chain of waits can never close. Each fork is still exclusive; it is circular wait that is broken.

The follow-up is fairness. Neither solution is fair: a philosopher whose neighbours keep alternating can wait indefinitely, because mutexes make no first-in, first-out promise. And why does anyone care about philosophers? Because "two resources, taken in different orders" is how real deadlocks happen.

## The rate limiter

An allow method that says whether a caller may proceed, permitting bursts of up to B requests and a sustained rate of R per second, safe from many threads.

A token bucket. It holds up to B tokens, refills at R per second, and each request spends one. The trick is to refill lazily: when a request arrives, compute the tokens earned since the last request from the elapsed time, cap at B, then try to spend one. No background thread, and all state lives under one short lock.

A tiny example: 10 tokens a second, burst of 2. Three requests at time zero: yes, yes, no. After 750 idle milliseconds the bucket has earned seven and a half tokens, but the cap keeps two. Capacity is the burst allowance; the rate is the long-run limit.

The follow-ups. Why a monotonic clock? Because the wall clock can jump either way: backwards removes tokens, forwards grants a burst nobody earned. Blocking instead of rejecting? Compute the wait under the lock, reserve the tokens by letting the balance go negative, and sleep outside the lock. Sleeping inside it serialises every caller behind the sleeper. Per-user limits? A map of buckets, a lock striped by key, and evict buckets that are full and idle, since a full bucket is the same as a fresh one. Across servers? Centralise the bucket, for example with a Redis script that makes the read-modify-write atomic, or give each of N instances a share of the rate and accept imprecision.

## Testing it

Interviewers increasingly ask how you would test this, and "run it a lot and see if it hangs" is not a senior answer.

Separate policy from threading. Which request wins, when a bucket refills, who gets the lock: all of that can be tested deterministically with an injected clock and scripted events. Then stress-test the threading with many threads and the smallest capacity, because capacity one is the most hostile, and assert invariants rather than outputs: every item consumed exactly once, the count never above capacity, no reader overlapping a writer. Use the tools: Go's race detector, ThreadSanitizer, Rust's loom, which explores every interleaving of a small test. Test close while threads are blocked on both sides. And say what a pass means: a passing stress test is evidence, not proof.

## In the interview

One more, from the lesson. How do you make the token bucket blocking without holding the lock while sleeping?

[pause]

Compute the delay under the lock, reserve the tokens by letting the balance go negative, release the lock, and sleep. Later callers see the debt and wait longer. The wrong answer is sleeping inside the lock until a token appears.

## Recap

Four things to remember. Open with the invariant and what threads wait for, and choose the primitive from that, not from habit. Every wait is a while loop, and any change that affects every waiter, like close, uses notify all. Fairness is part of the answer: writer preference starves readers, mutexes make no ordering promise, and a readers-writers lock gave 1.6 times, not 8. And break deadlock by ordering resources or limiting competitors, and measure time with a monotonic clock.

At your desk: the five solutions in Python and Go, their traces, the measurements, the primitive table, and the two replay exercises.

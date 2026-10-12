---
lesson: thread-pools-and-work-stealing
source: dc2c558dd33f3849
---
## 1

An 8-core service spends 5 milliseconds of CPU and 45 milliseconds waiting on the database per request. The database connection pool has 20 connections. What limits throughput?

A, nothing yet; add threads until latency starts to rise. B, the connection pool: 20 divided by 45 milliseconds is about 444 a second. C, CPU: 8 cores at 5 milliseconds each cap it at 1,600 a second. D, threads: 80 threads by the formula give 1,600 a second.

[think]

The answer is B: the connection pool, at about 444 requests a second.

The sizing formula gives 80 threads and a CPU ceiling of 1,600 a second. But only 20 requests can hold a database connection at once, each for 45 milliseconds, so throughput tops out near 444 a second. Extra threads only queue for connections. Size from the tightest resource.

## 2

A single-server pool runs at 90 percent utilisation, with a mean service time of 20 milliseconds. Roughly how long does a task wait in the queue on average, and what about the 99th percentile?

A, about 180 milliseconds on average, with the 99th percentile near 900. B, about 2 milliseconds on average, with the 99th percentile near 20. C, about 20 milliseconds on average, with the 99th percentile near 40. D, about 18 milliseconds on average, with the 99th percentile near 180.

[think]

The answer is A: about 180 milliseconds on average, and near 900 at the 99th percentile.

The mean wait is utilisation over one minus utilisation, times the service time: 0.9 over 0.1 is 9, times 20 milliseconds, which is 180. The simulation put the 99th percentile at about 45 service times, roughly 900 milliseconds. At 50 percent utilisation the mean would be 20 milliseconds. That curve is why the last 10 to 20 percent of utilisation is so expensive for latency.

## 3

A Java ThreadPoolExecutor has a core pool size of 10, a maximum pool size of 100, and an unbounded linked blocking queue. Under heavy load, how many threads run?

A, one per queued task, up to the 100-thread maximum. B, 10, because the unbounded queue never rejects a task. C, between 10 and 100, depending on CPU utilisation. D, 100, once the load is high enough to need them.

[think]

The answer is B: 10, because the unbounded queue never rejects a task.

ThreadPoolExecutor prefers queueing to growing. Beyond the core size, it creates a thread only when offering the task to the queue fails. With an unbounded queue that never happens, so the pool stays at 10 threads, and the queue grows without limit.

## 4

A request handler running on a shared executor with 8 threads submits 3 subtasks to that same executor, and blocks on their results. Under load, the service hangs. What is happening?

A, livelock, as the handlers keep resubmitting their subtasks. B, a lock-ordering deadlock between the handler threads. C, every worker waits on queued subtasks that no free worker can run. D, the executor's queue is too small to hold the subtasks.

[think]

The answer is C: every worker waits on queued subtasks that no free worker can run.

This is thread-starvation deadlock. When all 8 workers are handlers waiting on their own subtasks, the subtasks sit in the queue and can never be scheduled; the lesson's two-worker version hung five times out of five. Separate pools per stage, asynchronous composition, or a fork-join pool whose join helps run queued work avoid it. A bigger queue does not.

## 5

In a Chase-Lev work-stealing deque, when does the owner's pop need a compare-and-swap?

A, only for the last element, which a thief may also take. B, on every pop, because thieves may modify the bottom index. C, never, because only thieves ever write to the shared array. D, only when the deque is full and must be resized first.

[think]

The answer is A: only for the last element, which a thief may also take.

The owner alone writes the bottom index, and thieves advance the top index by compare-and-swap, so the two ends conflict only when one element remains. Then the owner uses a compare-and-swap on the top to claim it, and a concurrent thief's attempt fails. Ordinary pops use plain loads and stores with a fence. Resizing is a separate concern.

## 6

800 tasks run on 8 workers, and the first 100 are 20 times heavier than the rest. Static contiguous partitioning gave a 1.3 times speedup; a shared queue gave 7.4 times. Why?

A, the shared queue let tasks run faster by using SIMD. B, contiguous blocks cause false sharing between the workers. C, worker 0 received all the heavy tasks, which were most of the total work. D, static partitioning disables Go's goroutine preemption.

[think]

The answer is C: worker 0 received all the heavy tasks, most of the total work.

The heavy tasks were 2,000 of the 2,700 units of work, and all of them fell in worker 0's block, so the others finished early and sat idle. The best static speedup was 2,700 over 2,000, about 1.35 times. Dynamic assignment lets free workers keep taking tasks. False sharing, SIMD and preemption are unrelated.

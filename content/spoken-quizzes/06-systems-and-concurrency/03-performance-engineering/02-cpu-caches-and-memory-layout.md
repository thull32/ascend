---
lesson: cpu-caches-and-memory-layout
source: 57b2deea676f3477
---
## 1

Eight threads each increment their own element of a shared, 64-byte-aligned array of eight 8-byte counters, with no locks. Adding threads makes total throughput drop below what one thread manages. What is the mechanism?

A, all eight counters share a single cache line that bounces between cores. B, the scheduler keeps migrating threads between cores. C, the array of counters is too large to fit in the first-level cache. D, the threads race and corrupt each other's counters.

[think]

The answer is A: all eight counters share a single cache line that bounces between cores.

Each thread writes only its own counter, so there is no data race. But coherence works on whole 64-byte lines, and these eight counters fill exactly one, so every write needs the line in the modified state and invalidates every other copy. Padding each counter to its own line, or counting in thread-local variables, removes the traffic.

## 2

A first-level data cache is 48 kibibytes, 12-way set associative, with 64-byte lines. A loop repeatedly reads 16 values spaced exactly 4,096 bytes apart. What happens?

A, every access misses because the values straddle two lines. B, all 16 lines fit in the cache, so every pass after the first hits. C, all 16 lines share one 12-way set, so the loop keeps missing. D, the prefetcher hides the misses because the stride is constant.

[think]

The answer is C: all 16 lines share one 12-way set, so the loop keeps missing.

48 kibibytes of 64-byte lines in 12 ways is 64 sets, so the set index repeats every 4,096 bytes, and all 16 lines compete for 12 ways. These are conflict misses in a cache that is almost empty. Measured on such a cache, 12 lines at this stride hit in 0.9 nanoseconds, and 16 lines miss to the next level at 2.7. A stride of 4,160 bytes spreads them across the sets.

## 3

Under the MOESI protocol, core 0 holds a line in the modified state, and core 1 issues a plain read of it. What are the two states afterwards?

A, core 0 modified and core 1 invalid, as the read is refused. B, both shared, after a write-back to main memory. C, core 0 invalid and core 1 modified, as ownership moves. D, core 0 owned and core 1 shared, with no write-back yet.

[think]

The answer is D: core 0 owned and core 1 shared, with no write-back yet.

The owned state lets a dirty line be shared: core 0 forwards the data, and stays responsible for writing it back later. Plain MESI would write the line back and leave both copies shared. Ownership moves to core 1 only when it writes, which is a read for ownership, not a plain read.

## 4

An analytics loop averages one 4-byte field across 50 million records of a 64-byte struct. Which change is likely to give the largest speed-up?

A, pad the struct so every field is 8-byte aligned. B, add a branch that skips records whose value is zero. C, link the records in a list so inserts become cheap. D, store each field in its own contiguous array.

[think]

The answer is D: store each field in its own contiguous array.

The loop needs 4 bytes of each 64-byte record, but an array of structs pulls whole lines through the cache. A struct of arrays streams only that one column, measured at about 12 times faster for 10 million records, and lets the compiler vectorise. Padding adds bytes, a data-dependent branch may mispredict, and a linked list adds dependent misses.

## 5

Chasing pointers through 512 mebibytes costs about 100 nanoseconds per hop in random order, but about 1.5 nanoseconds per hop when the nodes are linked in address order. Each hop is a dependent load in both cases. What explains the gap?

A, random order executes more instructions per hop. B, the branch predictor learns the sequential loop. C, the prefetcher sees the stride and fetches ahead. D, sequential order fits the working set into the last-level cache.

[think]

The answer is C: the prefetcher sees the stride and fetches ahead.

The address stream is a constant stride, so the hardware prefetchers issue the upcoming lines before the loads need them. The working set is the same 512 mebibytes either way, the loop's instructions are identical, and the loop branch is equally predictable in both orders. In random order no prefetcher can guess the next address, so every hop waits a full main-memory latency.

## 6

Summing the elements above a threshold is 12 times faster on sorted data than on random data in one build, but equally fast on both with optimisation turned on. What is the most likely explanation?

A, optimised builds turn off the CPU's branch predictor. B, sorting the data warms the cache for the summing loop. C, the compiler replaced the branch with a conditional move or SIMD code. D, the optimised build skips the loop as dead code.

[think]

The answer is C: the compiler replaced the branch with a conditional move or SIMD code.

Sorting helps only by making the branch predictable. When the compiler turns the branch into a conditional move, or vectorises it, there is nothing to mispredict, and both inputs cost the same. The loop still runs, and the predictor is never switched off. Reading the assembly, or the branch-miss counters, tells you which case you are in.

---
lesson: cpu-caches-and-memory-layout
source: 4a17bf8f739d80d4
fit: great
desk:
  - "The memory hierarchy table and the power-of-two stride table"
  - "The MESI and MOESI trace, step by step, and the false-sharing Rust program"
  - "The row-major and column-major cache animations, and the cmov assembly"
  - "Exercises: simulate a set-associative LRU cache, and compute struct padding"
---
## Introduction

You parallelise a hot loop. Eight threads each increment their own slot in a shared array of eight 64-bit atomic counters. No locks, no shared data in the program's sense: thread 3 only ever touches counter 3. One thread alone manages about 277 million increments a second. Eight threads together manage 145 to 182 million. Fewer than one thread.

Then you change one line, aligning each counter to 64 bytes, and the eight threads do around 2 billion a second. About twelve times more, from a change that adds no instructions.

Nothing in the source or the complexity analysis predicts either result. The hardware does not move variables. It moves 64-byte cache lines, and it keeps those lines consistent between cores by passing ownership back and forth. The eight counters occupy exactly one line, so every increment on any core steals the line from the others. Once you think in lines rather than variables, a family of mysteries becomes one idea applied several ways. All the numbers come from one 16-core Ryzen desktop running Linux under WSL2.

## The hierarchy, measured

A pointer-chasing program measures each level: every load depends on the previous one, in random order, so nothing can guess the next address. The first-level cache answers in about 0.9 nanoseconds, five cycles. The second level in about 3. The shared third level in 9 to 16. And main memory in 75 to 100 nanoseconds, about 560 cycles. One trip to DRAM costs as much as hundreds of simple instructions.

Now the surprise. The same dependent chase through 512 mebibytes, but with the nodes linked in address order: 1.46 nanoseconds per hop, 70 times faster than random. Hardware prefetchers watch the stream of misses, detect the stride, and fetch lines before the load asks for them.

Here is the bridge between those two numbers: Little's law, things in flight equals rate times latency. Streaming records from memory on one core reached 54 gigabytes a second. With about 90 nanoseconds of latency, that needs around 76 lines in flight at once, and the prefetchers generate most of them. A random pointer chase has exactly one request in flight, because the next address is inside the line still on its way. It moved under a gigabyte a second, 85 times less than the scan. Same memory, same number of misses. One pattern pays bandwidth per line; the other pays latency per line.

That is the whole reason linked lists, pointer-based trees and object graphs are slow on large data even when their complexity is fine. A binary tree lookup over 10 million nodes is 23 dependent loads, and past the third-level cache each can be a DRAM round trip: up to about 2 microseconds per lookup. A B-tree node holding 16 keys in one or two lines turns four dependent misses into one.

## How a cache finds a line

A cache is a hash table in hardware. Part of the address picks a set, the bucket, and each set holds a fixed number of lines, called ways. A line can only live in its own set.

The first-level cache here is 48 kibibytes, 12 ways, so 64 sets. With 64 sets of 64-byte lines, addresses that differ by a multiple of 4,096 bytes land in the same set.

So here is a question. A loop repeatedly reads 16 values spaced exactly 4,096 bytes apart. That's 1 kibibyte of data in a 48 kibibyte cache. What happens?

[pause]

All 16 lines compete for one set with 12 ways, so the loop keeps missing. Twelve lines at that stride hit in 0.9 nanoseconds; sixteen miss to the next level at 2.7. The cache is 98 percent empty and still missing. These are conflict misses. Spacing the values 4,160 bytes apart, one extra line per row, spreads them over all the sets and the misses vanish. Walking down a column of a matrix with power-of-two row widths is exactly this pattern. Power-of-two array widths are a classic trap.

## Coherence and false sharing

Each core has private caches, so two cores can hold copies of one line. A coherence protocol gives every copy a state. Modified: the only copy, dirty. Exclusive: the only copy, clean. Shared: read-only copies may exist elsewhere. Invalid. AMD adds Owned, a dirty line other cores may read without writing it back to memory first. To write, a core must hold the line Modified or Exclusive, so it first asks for ownership, which invalidates every other copy.

Now picture two counters, a and b, in one line. Core 0 increments a: it takes the line, Modified. Core 1 increments b: it misses, and core 0 must forward its dirty copy and invalidate its own. Core 0 increments a again: the same transfer, reversed. Every increment is a round trip between cores instead of a one-cycle hit. Put a and b on different lines, and each core takes its line once and never gives it up.

Real sharing should bounce; a single contended counter is expected to move. False sharing is the same traffic for data that is never shared, only co-located.

Measured with threads pinned to separate cores. One thread doing atomic increments: about 3.9 nanoseconds each. Eight threads on one line: 48.6 nanoseconds each. Eight threads, each on its own line: 4.1. Twelve times slower for atomics, and 18 times slower for plain stores, which is what a non-atomic increment compiles to. Padding to 64 bytes fixes it on this AMD part; a common Rust library pads to 128 on x86 because Intel's prefetcher pulls lines in adjacent pairs.

False sharing hides in arrays of per-thread statistics, a lock word next to the hot field it protects, and a queue's head and tail indexes written by producer and consumer. The tool perf c2c finds it, reporting lines with heavy cross-core traffic. And the best fix is often not padding but not sharing: count in thread-local variables and merge at the end.

## Layout: padding, and structs of arrays

A field of size k must start at a multiple of k, and the struct's size rounds up to a multiple of its largest field. So a struct of a char, a double, a char and a double is 32 bytes in declaration order, and 24 if you put the doubles first. C and Go keep your order. Rust's default layout reorders fields for you. On a struct allocated 100 million times, 8 bytes of padding is 800 megabytes.

Python has no inline fields at all. A list of a million floats is 8 megabytes of pointers plus 24 megabytes of separate float objects, where a typed array holds the same values contiguously in 8. Layout, as much as the interpreter, is why numeric Python needs NumPy.

The bigger layout choice is array of structs versus struct of arrays. Ten million particles, each a 64-byte struct of sixteen fields. In an array of structs, a loop over one field drags whole lines through the cache and uses 4 bytes of every 64. In a struct of arrays, each field is its own contiguous array. Summing one field: 12 milliseconds against about 1, a 12 times speed-up. Updating position from velocity: about 15 times. It also hands the compiler contiguous runs it can vectorise.

When does the array of structs win? When you touch most fields of one entity at a time, at random: fetch a user by ID and read the whole record. That is the row store versus column store debate. PostgreSQL and MySQL store rows because transactions read whole records; Parquet and ClickHouse store columns because analytics scan a few columns of billions of rows.

## Prefetching and branches

The prefetcher effect survives an interpreter. In Python, summing a list of 5 million floats created in order took 13 milliseconds. Summing the same objects after shuffling the list took 108, eight times slower. Shuffling turned a sequential walk through memory into a random one.

The mitigations all restore sequential access or independent loads. Allocate nodes in arrays and link them by index. Use wide nodes, like B-trees and open-addressing hash tables. Batch independent lookups so their misses overlap. And use huge pages for large random-access heaps: the 512 mebibyte chase dropped from about 103 nanoseconds per hop to about 93.

Last, branches. A core runs well ahead of the instruction it retires, guessing every branch, and a wrong guess throws the speculative work away. The classic demo sums the values of 128 and above from a million random integers between 0 and 255, and sorting the data is supposed to make it many times faster. Measured here, at the usual optimisation level, sorted and random ran at exactly the same speed. Why?

[pause]

The compiler had replaced the branch with a conditional move, an instruction that picks a value with no branch at all, so there was nothing to mispredict. Only with that conversion disabled did the textbook result appear: 12 times slower on random data, about 5 nanoseconds per misprediction. And a predictable branch was faster still than the conditional move, because the move makes every iteration depend on the compare. Branch-free code wins only when the branch is unpredictable. So read the assembly, or the branch-miss counters, before building a theory on a branch.

One more effect on big servers: NUMA. Memory attached to the other socket costs roughly one and a half to two times the latency, and Linux places a page on the node of the thread that first touches it. Bind one process or shard per socket.

## In the interview

A follow-up the lesson expects. Why is iterating a linked list slower than an array when both are linear?

[pause]

Each node's address is inside the previous node, so loads are dependent, the prefetcher is blind, and only one miss is in flight. Past the third-level cache that's about 100 nanoseconds per node, against about 1.5 for a sequential walk. The wrong answer is "the list has more pointer arithmetic", which costs a cycle, not a hundred nanoseconds.

And: two threads increment separate counters and it's slower than one thread. Why? The counters share a 64-byte line, and coherence works per line, so each write steals the line from the other core. Fix it with 64-byte alignment, or thread-local counters merged at the end. The wrong answer is "it's a race condition, add a lock", which adds a second contended line.

## Recap

Four things to remember. Think in 64-byte lines: dependent random misses pay about 100 nanoseconds each, while sequential access lets the prefetcher stream at full bandwidth. Power-of-two strides cause conflict misses in a nearly empty cache. Coherence works per line, so counters that share a line bounce between cores; pad them, or better, don't share. And choose layout from the access pattern: struct of arrays for scanning a few fields, array of structs for whole records, and check the assembly before you credit a branch.

At your desk: the hierarchy and stride tables, the coherence trace and the false-sharing program, the cache animations and the conditional-move assembly, and the exercises on cache simulation and struct padding.

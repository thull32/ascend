---
slug: systems
title: Operating Systems & Concurrency
description: Understand what the kernel, the scheduler, the memory hierarchy and your threads are actually doing, so you can write code that is correct under contention and fast under load.
icon: cpu
phase: 4
---
Every service you have shipped runs on top of a scheduler, a virtual memory system, a set of file descriptors and a cache hierarchy that you probably never think about. That works until it doesn't: a p99 that doubles under load, a deadlock that appears once a week, a container killed by the OOM killer, a "thread-safe" cache that loses writes. Mid-level engineers treat these as bad luck. Senior engineers can explain the mechanism, reproduce it and design it out.

This track builds that understanding from the bottom up. The first module covers the operating system as your code experiences it: processes and threads, the page tables and TLB behind every pointer dereference, how a read from a socket actually reaches your program, and what `fsync` really promises. The second module is concurrency proper: races, mutexes, deadlock, condition variables, atomics, thread pools, event loops and message passing, with the same problem shown in Python, Go and Rust wherever the language's model changes the answer, and a final lesson of the concurrency problems interviewers actually ask. The third module is performance engineering: how to measure before you guess, why the memory layout of a struct can be a 10x difference, how to tell I/O-bound from CPU-bound, and why most benchmarks are wrong.

It connects forward to [Databases Inside Out](/learn/databases/relational-fundamentals/mvcc-and-locking), where MVCC and row locks reuse the same concurrency ideas, and to [Distributed Systems](/learn/system-design/distributed-systems/time-and-ordering), where a single machine's ordering problems become a cluster's.

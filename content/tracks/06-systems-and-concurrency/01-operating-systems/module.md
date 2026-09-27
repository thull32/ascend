---
slug: operating-systems
title: Operating systems essentials
description: The kernel as your code experiences it, from processes and page tables to epoll and fsync, with the failure modes that show up in production.
prerequisites: [foundations/how-code-runs]
---
Your service is a process. It has threads the scheduler moves on and off cores, an address space the kernel fills in lazily one page fault at a time, a table of file descriptors through which every byte of network and disk I/O passes, and a filesystem that makes promises about durability that are weaker than most engineers assume. None of that is visible in your code, and all of it is visible in your latency graphs.

This module covers the four parts of the operating system that a senior engineer needs to reason about without looking anything up: how processes and threads are scheduled and why a context switch costs what it costs; how virtual memory turns a pointer into a physical address and what happens when the page is not there; how a blocking `read` becomes an `epoll` loop becomes `io_uring`; and what the filesystem actually guarantees when `write` returns.

Each lesson opens with a production symptom (a container killed by the OOM killer, a p99 that doubles at 60% CPU, a database that lost committed data on power loss) and works down to the mechanism. The [Concurrency](/learn/systems/concurrency/races-mutexes-and-invariants) module builds directly on the thread and scheduling model here, and [Performance engineering](/learn/systems/performance-engineering/profiling-and-measurement) builds on the memory hierarchy.

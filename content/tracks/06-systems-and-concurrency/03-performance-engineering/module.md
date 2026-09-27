---
slug: performance-engineering
title: Performance engineering
description: Measure before you guess, read a flame graph, make data fit the cache, find the real bottleneck and benchmark without fooling yourself.
---
Most performance work fails before it starts, because it begins with a guess. Someone rewrites the loop they find ugliest, adds a cache in front of the query they distrust, or scales out the service whose CPU graph looks busy, and the p99 does not move. The senior move is duller and far more effective: measure the distribution, find where the time actually goes, change one thing and measure again.

This module teaches that discipline and the hardware knowledge that makes it pay off. It starts with measurement itself: latency percentiles, on-CPU versus off-CPU time, sampling profilers, flame graphs and Amdahl's law. It then goes down to the memory hierarchy, where cache lines, false sharing, struct layout and branch prediction routinely produce 5–10× differences that no complexity analysis predicts. It comes back up to the system level with the question every slow service raises (is it CPU-bound, I/O-bound or waiting on a pool?) and the scaling strategy each answer implies. It ends with benchmarking: warm-up and JITs, noise, the statistics you need to trust a 3% result, coordinated omission in load tests, and how to keep performance from regressing in CI.

It builds on the [operating systems module](/learn/systems/operating-systems/processes-and-threads) (page faults, syscalls, the page cache) and on the introduction to caches and benchmarking in [Engineering Foundations](/learn/foundations/complexity/benchmarking-reality). Every lesson uses real tools (`perf`, `vmstat`, `iostat`, `pprof`, `py-spy`, criterion, JMH) with the output you will actually see.

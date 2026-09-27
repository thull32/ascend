---
slug: concurrency
title: Concurrency and parallelism
description: Races, locks, deadlock, condition variables, atomics, thread pools, event loops and message passing, explained by mechanism and shown in Python, Go and Rust.
prerequisites: [systems/operating-systems]
---
Concurrency is about structure: several things in progress at once, interleaved in ways you do not control. Parallelism is about execution: several things running at the same instant on different cores. A single-threaded Node process is concurrent but not parallel; a Rayon parallel map is parallel with almost no interesting concurrency. Most production bugs live in the first category, and most performance work lives in the second. You need both vocabularies, and you need to know which one a problem belongs to before you pick a tool.

This module builds from the smallest unit of trouble upwards. It starts with the lost update (`counter += 1` executed by two threads) and the idea that a lock protects an *invariant*, not a variable. It then covers the ways locking goes wrong (deadlock, livelock, starvation), how threads wait for each other correctly (condition variables and semaphores), what the hardware actually offers underneath (atomic instructions, memory ordering, cache coherence), and how real systems organise work (thread pools, work stealing, event loops, channels and actors). The last lesson applies all of it to the concurrency problems interviewers ask, with complete solutions.

Wherever a language changes the answer, the same problem is shown in Python, Go and Rust. Python is the case study for a runtime that historically serialised threads with a global interpreter lock and is now removing it. Go is the case study for cheap goroutines, channels and a dynamic race detector. Rust is the case study for a type system (`Send`, `Sync`, ownership) that rejects data races at compile time and still lets you write a deadlock. Seeing the three side by side is the fastest way to learn which guarantees come from the language and which you still owe the reader of your code.

Every lesson has a step-through visualisation of the mechanism, and most have an exercise that simulates a schedule deterministically (browsers do not give you real threads), so you can test your understanding of an interleaving rather than hope a race shows up. The module assumes the thread and scheduling model from [Processes and threads](/learn/systems/operating-systems/processes-and-threads) and the readiness model from [I/O and system calls](/learn/systems/operating-systems/io-and-syscalls).

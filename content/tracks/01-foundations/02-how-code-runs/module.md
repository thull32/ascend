---
slug: how-code-runs
title: How your code actually runs
description: Follow a function call through stack frames, heap allocations, garbage collection, integer and string representations, and the compiler or interpreter that executes it.
prerequisites: [foundations/complexity]
---
A mid-level engineer knows that recursion can overflow the stack, that mutating a shared list causes surprising bugs, that 0.1 + 0.2 is not 0.3, and that Python is slower than Go. A senior engineer knows *why* each of those is true, which means they can predict the next surprise instead of debugging it after it ships.

This module follows your code from source text to executing instructions. You will see what a stack frame contains and why the stack is a fixed-size region while the heap is not; what a variable actually holds in Python, JavaScript, Go and Rust and how that produces aliasing bugs and hidden copy costs; how tracing and generational garbage collectors, reference counting and Rust's ownership model each answer the question "when can this memory be reused?"; how integers, floats and strings are represented in memory and where those representations break; and what compilers, interpreters and JITs do that makes one language ten times faster than another for the same loop.

None of this is trivia. Stack depth limits shape how you write recursive tree code. Value-versus-reference semantics decide whether a function argument is cheap or a hidden O(n) copy. GC behaviour shows up on your p99 latency graph. Integer overflow and float precision are behind real production incidents. Every later track, from concurrency to system design, assumes this mental model.

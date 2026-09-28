---
slug: languages-for-senior-engineers
title: Languages
description: Read and reason about Rust, Go, TypeScript, Python and the JVM by their runtime mechanics, measured, and choose an interview language on evidence.
prerequisites: [foundations/how-code-runs]
---
Senior engineers are rarely hired for one language, but they are expected to read several fluently, review code in them, and reason about what each runtime does under load: who frees memory and when, how concurrency is scheduled, what the type system can and cannot promise. The gap between "I have used Go" and "I have run Go in production" is a handful of mechanisms and the failure modes each one causes.

Each lesson teaches a language through those mechanisms, with the runtime's own evidence rather than assertions: real compiler errors traced line by line (a borrow-checker error and a non-`Send` future in Rust, variance errors in TypeScript), the runtime's diagnostic output decoded field by field (Go's `schedtrace`, `gctrace` and `-gcflags=-m`, the JVM's GC logs, `PrintCompilation` and Native Memory Tracking), and costs measured on current versions (CPython 3.14, Node 24, Go 1.27, Rust 1.98, JDK 21). Rust and TypeScript are read through this app's own backend and frontend, so every concept comes with code you can open. Go and the JVM are taught through the production bugs experienced engineers learn to spot (goroutine leaks, nil interfaces, GC pacing, humongous objects, pinned virtual threads, thread pools that never grow), and Python through the standard-library idioms and hidden costs that decide coding interviews.

Every lesson has exercises that run in the browser in Python and JavaScript and make a mechanism concrete: a borrow checker, a Go channel, an SSE parser, a `ThreadPoolExecutor`. The module ends with the practical question every candidate faces: which language to interview in, answered with one problem implemented in six languages and measured for runtime and lines of code.

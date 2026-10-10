---
lesson: from-source-to-execution
source: 541f1859e07d0af8
fit: great
desk:
  - "The two-line function traced through tokens, syntax tree, CPython bytecode and its specialised form"
  - "V8's Ignition bytecode and the trace of its compiler tiers, and the Go and Rust machine code"
  - "The side-by-side pipeline table and the two timing tables"
  - "Exercise: tokenise an expression"
---
## Introduction

The same loop, summing ten million integers, takes 108 milliseconds in plain CPython 3.14, 5 in Node, 1.8 in Go and 1.3 in Rust, all measured on one machine. The loop is identical. The difference is entirely in what stands between your source text and the processor: an interpreter walking bytecode one instruction at a time, a just-in-time compiler that watched the loop run and then compiled it, or an ahead-of-time compiler that turned the loop into a handful of vector instructions before the program started.

"Python is slow" and "Rust is fast" are folklore until you can say why. And the why has consequences you will meet at work: warm-up that makes the first requests after a deploy slow, a Python service that cannot use its second core, a JavaScript function that runs fast for an hour and then five times slower because someone passed it a string.

Four ideas: the pipeline every language shares, why an interpreter pays on every operation, how a JIT speculates and what happens when it is wrong, and how to choose a runtime by the shape of the workload.

## The pipeline every language shares

Whatever the language, source text goes through the same stages. A lexer turns characters into tokens. A parser turns tokens into a syntax tree. A compiler turns the tree into an intermediate form, bytecode or something similar. Then either an interpreter executes that form directly, or an optimiser and code generator turn it into machine code.

Where a language stops and starts executing is what separates the three designs. An ahead-of-time compiler runs every stage before the program starts and ships machine code. An interpreter stops at the bytecode and runs it with a loop: read one instruction, do it, read the next. A just-in-time compiler, a JIT, starts as an interpreter, watches which code runs often and with which types, and compiles that code to machine code while the program runs, using what it observed.

Take a two-line function that returns total plus x. CPython compiles it to four bytecode instructions: load both arguments, add them, return. V8 compiles it to three, and the add instruction carries a feedback slot that records the types it sees. Go and Rust compile it ahead of time to an add instruction and a return: four bytes of machine code in Go, five in Rust.

## Why an interpreter pays

Here is what CPython does for one generic addition in a loop. Read the opcode and jump to its handler, a branch the processor often mispredicts. Pop two object pointers off its value stack. Look up the left operand's type and find its add implementation. Check both are integers small enough for the fast path. Allocate a brand new integer object for the result, because only the numbers from minus 5 to 256 are cached. Adjust reference counts on the operands. Push the result.

Since Python 3.11, CPython has a specialising interpreter. Call that function a hundred times with integers, and the generic add instruction rewrites itself in place into an integer-only add, which checks one thing, are both exact integers, and skips the type dispatch. Call it a hundred times with strings, and it becomes a string add. Mix the two, and it gives up and goes back to generic. The bytecode is the profile.

But specialising only removes the lookup. The dispatch, the allocation and the reference counting remain. Measured on the ten-million-element sum: about 11 nanoseconds per iteration in a Python for loop, against roughly 0.13 to 0.5 compiled. That ratio, roughly 20 to 80 times, is the whole story of "Python is slow" for tight numeric loops. It is not the syntax. Every operation must rediscover at run time what the types are, and must allocate its result.

[pause]

So what is the escape? Not rewriting the service. Move the loop into compiled code. The built-in sum over a list runs the loop in C and got down to about 2.3 nanoseconds per element. NumPy, a C extension, or a Rust module go further. A Python service that spends its time in JSON parsing, regular expressions, database drivers and NumPy is already mostly running C.

CPython 3.14 also ships an experimental JIT, off by default. On this loop, enabled, it was no faster than the interpreter: it removes dispatch but not boxing or reference counting.

## How a JIT speculates

V8, the engine behind Node and Chrome, runs code through tiers. Ignition interprets bytecode and collects type feedback. Sparkplug compiles bytecode to machine code almost instantly, with no optimisation. Maglev produces reasonably optimised code in a fraction of a millisecond. TurboFan runs the full optimiser and speculates on the feedback: "this add has only ever seen small integers, so emit an integer add with an overflow check, and a bail-out if that ever fails". A hot loop can even be compiled while it is running, with the interpreter's frame swapped out mid-iteration. That is called on-stack replacement.

Two mechanisms make the speculation pay. Hidden classes and inline caches: objects built the same way share a layout, and a property read that keeps seeing the same layout becomes a single load at a fixed offset, like a struct field in C. And inlining across the profile: because the JIT sees which function a call actually reaches, it can inline through calls that an ahead-of-time compiler must leave as calls. That is the one structural advantage a JIT has. It optimises for what the program does, not for what the type system allows.

The price is deoptimisation. In the summing loop, the running total crossed two to the 31, stopped fitting V8's small-integer representation, and the optimised code was thrown away and rebuilt with wider arithmetic. Worse: a function whose add had only seen integers ran in 0.47 milliseconds. After one call with an array of strings, the next integer call took 11 milliseconds to deoptimise and recompile, and every call after that took 2.35 milliseconds. Five times slower, for the life of the process. Feedback only ever widens. Once a site has seen strings, the generic path stays. That is the "fast for an hour, then slow" bug.

The JVM follows the same design, with a quick tier and a heavily optimising tier. Because Java has static types, its speculation is mostly about which implementation of an interface is actually live.

## What ahead-of-time compilation buys and gives up

Go compiles to machine code ahead of time, with a compiler designed for fast builds: a large service builds in seconds. Static types mean every addition is one instruction. Its optimiser is deliberately simpler: in the summing loop, Go does not vectorise, which is why it measured 0.18 nanoseconds per element against Rust's 0.13.

Rust compiles through LLVM with the full optimiser. Generics are monomorphised: each concrete use becomes its own specialised copy. That is why Rust iterators compile to the same code as a hand-written loop, and why a sum over a slice vectorises. It is also why Rust builds are slow and binaries large.

What ahead-of-time compilation gives up is runtime knowledge. It cannot see which branch is hot or which interface implementation is live, so it generates code correct for all of them. Profile-guided optimisation feeds a recorded profile back into a second compile; Go reports gains of around 2 to 14 percent.

## What the pipeline does to production

Warm-up. A JIT service is slow for its first seconds to minutes, interpreting until profiled, then compiling. In Node, the summing loop's first call was 6.6 times its steady state. A canary judged in its first minute looks worse than the stable fleet and gets rolled back. Pre-warm with mirrored traffic, or start the comparison after warm-up.

The GIL. CPython's global interpreter lock lets only one thread execute bytecode at a time. So a CPU-bound Python job rewritten with eight threads gets no faster, with one core at 100 percent. Threads still help for I/O, or when the work is in C code that releases the lock, as NumPy does. For pure-Python CPU work, use processes, or the separate free-threaded build once your dependencies support it. Python threads are real operating-system threads, serialised by a lock.

And start-up against peak. Hello-world cold starts measured 1.6 milliseconds for a Rust binary, 2.4 for Go, about 8 for Python and about 16 for Node. A JVM is typically tens of milliseconds, and seconds for a framework-heavy service. So a serverless function that does 100 milliseconds of work, cold-started often, wants a native binary: on a JVM, start-up would outweigh the work itself, and the JIT would never pay off. A handler that runs for days wants a JIT or ahead-of-time code. A 200 millisecond script is fine on an interpreter.

## In the interview

A follow-up the lesson expects: what does a JIT do that an ahead-of-time compiler cannot?

[pause]

It optimises for observed behaviour. It inlines through call sites whose targets it has actually seen, specialises arithmetic on the types that actually flowed, and lays out code for the branches that were hot. Ahead-of-time compilers can only approximate this with profile-guided optimisation. The cost is warm-up, and deoptimisation when the observation stops holding. The wrong answer is "JITs are faster because they compile to machine code", which ahead-of-time compilers also do.

And: why is total plus x 20 to 80 times slower in a CPython loop than in Go? Because CPython dispatches a bytecode, checks the operand types, allocates a result object and adjusts reference counts on every execution, while Go's compiler knew both were 64-bit integers and emitted one add. The wrong answer is "Python re-parses the source each time". It does not; bytecode is compiled once and cached.

## Recap

Four things to remember. Every language lexes, parses and compiles to an intermediate form; the difference is whether it interprets that form, compiles it at run time, or compiled it before the program started. CPython is slow on tight loops because each operation dispatches, allocates and reference-counts, so move the hot loop into compiled code rather than rewriting the service. A JIT speculates on observed types and pays in warm-up and deoptimisation, and feedback only widens, so keep hot call sites to one type. And choose by workload shape: native binaries for cold starts, JITs or ahead-of-time code for long-running services, processes rather than threads for CPU-bound Python.

At your desk: the function traced through tokens, syntax tree and bytecode, V8's tiers and the machine code, the pipeline and timing tables, and the tokeniser exercise.

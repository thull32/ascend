---
lesson: from-source-to-execution
source: 64d6a931f95ad99b
---
## 1

Why is adding x to a running total roughly 20 to 80 times slower in a CPython loop than in compiled Go?

A, Go spreads the additions across multiple processor cores. B, Python stores integers as strings and converts them on each add. C, CPython checks the operand types, allocates a result, and adjusts reference counts on each add. D, Python re-parses the loop's source text on every iteration.

[think]

The answer is C: CPython checks the operand types, allocates a result, and adjusts reference counts on each add.

CPython must dispatch the bytecode, guard the operand types, allocate a result object and adjust reference counts. Go emits a single add instruction on values whose types were fixed at compile time. Parsing happens once, there is no parallelism involved, and Python integers are arrays of binary digits, not strings.

## 2

After calling a two-argument add function a hundred times with small integers, CPython's adaptive disassembly shows an integer-only add instruction where the original bytecode had the generic add. What happened?

A, the adaptive interpreter rewrote the instruction in place for the types it observed. B, Python re-parsed the function with type hints inferred from the calls. C, the JIT compiled the function to machine code, and the disassembler shows its name. D, the cached bytecode file on disk was regenerated with a faster opcode.

[think]

The answer is A: the adaptive interpreter rewrote the instruction in place for the types it observed.

The specialising interpreter keeps a counter in each instruction's inline cache, and when it fires, replaces the generic opcode with a version that guards only on the types it saw. It is still interpreted bytecode, not machine code. Nothing is re-parsed, and the cached file on disk still holds the generic form.

## 3

A Node service runs at a median latency of 2 milliseconds for an hour, then jumps to 10 milliseconds and stays there, with no deploy. Which explanation fits best?

A, the event loop exhausted its pool of JavaScript threads. B, the JIT finished warming up and moved to its final tier. C, the garbage collector switched to a slower, persistent mode. D, a hot site saw a new type and was recompiled with the generic path.

[think]

The answer is D: a hot site saw a new type and was recompiled with the generic path.

A sustained slowdown after a change in input shape is the deoptimisation signature. Feedback only widens, so once a site has seen a second type, the optimiser keeps the generic path, measured at 5 times slower for a polluted add site. Warm-up makes things faster over time, not slower. The collector has no persistent modes like this, and JavaScript runs on a single event-loop thread, so there is no pool of threads to exhaust.

## 4

Which is a structural advantage a JIT has over an ahead-of-time compiler?

A, smaller binaries, since only hot code is compiled. B, it optimises for the types and call targets it observes. C, faster start-up, since no ahead-of-time build is needed. D, it never needs to deoptimise once code is compiled.

[think]

The answer is B: it optimises for the types and call targets it observes.

Run-time profile information is the JIT's edge: it can inline through calls that an ahead-of-time compiler must leave indirect, and specialise on the types that actually flowed. Ahead-of-time compilers can only approximate that with profile-guided optimisation. JITs start slower, because they must profile and compile first, they need the runtime shipped alongside, and they deoptimise when a speculation fails.

## 5

A CPU-bound Python job is rewritten to use eight threads, and it gets no faster. What is the most likely reason?

A, Python threads are green threads confined to one core. B, the job turns out to be I/O bound, not CPU bound. C, creating and switching Python threads is too slow. D, the global interpreter lock lets only one thread run bytecode at a time.

[think]

The answer is D: the global interpreter lock lets only one thread run bytecode at a time.

Python threads are real operating-system threads, but the interpreter lock serialises bytecode execution, so pure-Python CPU work does not spread across cores. Use processes, move the work into C code that releases the lock, as NumPy does, or use a free-threaded build.

## 6

You are choosing a runtime for a serverless function that runs for about 100 milliseconds per invocation, thousands of times an hour, and is cold-started often. Which consideration dominates?

A, binary compatibility across different processor families. B, start-up time, since it can outweigh the work itself. C, garbage collector pause times during each request. D, peak throughput once the hot loop is fully optimised.

[think]

The answer is B: start-up time, since it can outweigh the work itself.

With 100 milliseconds of work per invocation, a JVM cold start of hundreds of milliseconds to seconds, for class loading plus JIT warm-up, dominates, and the JIT never pays off. A Go or Rust binary starts in a couple of milliseconds, measured at 2.4 and 1.6 for a hello-world, and Python in about 8. Peak throughput and collector pauses matter for long-running processes, not this shape.

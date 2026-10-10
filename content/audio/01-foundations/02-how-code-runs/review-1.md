---
review: how-code-runs
source: e50e699a6a9a45a0
---
## Introduction

Twelve questions from the how-code-runs module. Answer out loud before the answer comes.

They run through the module in order: the stack and the heap, values and references, memory management, numbers and strings, and the path from source code to execution. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

In CPython 3.12 or later, you raise the recursion limit to one million, then run a pure-Python recursion 500 thousand levels deep. What is most likely to happen?

A, it raises a recursion error anyway, since CPython caps the limit. B, it segfaults, since every Python call also consumes C stack. C, it works, but it can still crash if the recursion passes through C code. D, CPython's tail-call optimisation turns it into a loop.

[think]

The answer is C: it works, but it can still crash if the recursion passes through C code.

Since 3.11, Python-to-Python calls do not consume C stack, so a raised counter is honoured for pure-Python recursion. Any path through C, such as comparison methods, deep copy or a C-implemented decoder, is guarded by a separate limit and can still overflow the real machine stack. "Every call consumes C stack" describes versions before 3.11, and CPython deliberately does no tail-call optimisation.

## Question 2

Why can a Go program recurse a million levels deep, while a Rust program with the same recursion aborts?

A, Rust allocates frames on the heap, which fills up sooner. B, Go performs tail-call elimination on recursive calls. C, Go's stacks grow by copying, while Rust's stacks are fixed in size. D, Go's compiler emits much smaller frames, so more of them fit.

[think]

The answer is C: Go's stacks grow by copying, while Rust's stacks are fixed in size.

Every Go function's prologue checks whether the goroutine's stack is about to overflow. If so, the runtime allocates a stack twice as large and copies the frames across, fixing up pointers using the compiler's maps of the stack. Rust, like C, reserves a fixed region per thread and runs into a guard page. Neither language guarantees tail-call elimination.

## Question 3

A native service dies with a segmentation fault. The kernel log shows the faulting address 16 bytes below the reported stack pointer, and the debugger shows the same function 40 thousand times. What happened?

A, a null pointer dereference inside the recursive function. B, the stack pointer ran into the guard page below the stack. C, the kernel's out-of-memory killer terminated the process. D, the heap allocator corrupted a chunk header during the recursion.

[think]

The answer is B: the stack pointer ran into the guard page below the stack.

A fault address right next to the stack pointer, plus a very deep, repetitive backtrace, is the signature of a stack overflow: the next frame's store landed in the unmapped guard region. A null dereference faults at a tiny address. Heap corruption usually surfaces inside the allocator's own functions. And the out-of-memory killer sends a kill signal, not a segmentation fault.

## Question 4

A Go function receives a slice s, made with length 2 and capacity 8. It appends a 9 to get a new slice t, then sets the first element of t to 5. What does the caller's s look like afterwards?

A, 5, 0, 9: the caller's length grew as well. B, 5, 0: the append reused the backing array of s. C, 0, 0: append always copies to a new array. D, 0, 0: s was passed by value, so it is safe.

[think]

The answer is B: 5, 0, because the append reused the backing array of s.

Capacity 8 with length 2 means the append writes into the existing array and returns a header with length 3 over the same memory. So the write to t's first element is visible through s. Passing a slice copies only its header, not the array behind it, so "passed by value" does not protect it. And the caller's length stays 2, so it cannot see the 9.

## Question 5

Which of these makes a deep copy?

A, JavaScript's structured clone. B, in Go, assigning one slice variable to another. C, in Python, calling list on a list, or slicing the whole of it. D, in JavaScript, object assign into a new empty object.

[think]

The answer is A: JavaScript's structured clone.

Object assign, the list constructor and slicing all create a new outer container but share every element inside it. Assigning a Go slice copies only its 24-byte header. Structured clone recursively copies the whole reachable graph, although it drops functions and prototypes.

## Question 6

A Go service's memory graph rises to about 2 gigabytes, drops to 1, and repeats every few seconds under steady load. Latency is fine. What is the most likely explanation?

A, goroutine stacks growing and shrinking under steady load. B, the kernel reclaiming page cache every few seconds. C, normal GOGC 100 collection cycles around a live heap of about 1 gigabyte. D, a leak that the garbage collector is only partly fixing.

[think]

The answer is C: normal GOGC 100 cycles around a live heap of about 1 gigabyte.

Go starts a collection when the heap has grown 100 percent beyond the live heap measured after the previous cycle, which produces exactly this saw-tooth around a 1 gigabyte live set. A leak would show the troughs rising over time. If the container is tight, GOMEMLIMIT caps the peaks.

## Question 7

A Node process's heap grows steadily for days until it is killed for running out of memory. Which of these is the least likely cause?

A, an event listener added per request and never removed. B, a module-level map keyed by request ID, never cleared. C, a repeating timer capturing a large object, never cleared. D, short-lived request objects that reference each other in cycles.

[think]

The answer is D: short-lived request objects that reference each other in cycles.

V8 is a tracing collector, so unreachable cycles are collected with no special handling. The other three keep objects reachable from a root, and reachable but unwanted is exactly what a leak looks like in a garbage-collected language.

## Question 8

A Java method computes the midpoint of a binary search as lo plus hi, divided by 2, in 32-bit integers, over an array of 1.5 billion elements. What goes wrong, and when?

A, it fails at once, since Java arrays are capped at 1 billion elements. B, lo plus hi overflows when the search reaches the upper half, so the midpoint goes negative. C, nothing: integers are 32-bit and 1.5 billion fits. D, the division truncates, so the search skips the last element.

[think]

The answer is B: lo plus hi overflows when the search reaches the upper half, so the midpoint goes negative.

1.5 billion fits in a 32-bit integer, but lo plus hi can reach 3 billion once the search range is in the upper part of the array. That exceeds about 2.1 billion and wraps to a negative index. Write lo plus half of hi minus lo instead. The truncating division is normal and harmless.

## Question 9

The exact sum of the doubles 0.1 and 0.2 lies exactly halfway between two representable doubles. Which one does the hardware return, and why?

A, the upper one, because ties round to the even significand. B, whichever is closer to the decimal 0.3, which is the lower one. C, the upper one, because the hardware always rounds up on ties. D, the lower one, because ties round toward zero.

[think]

The answer is A: the upper one, because ties round to the even significand.

The default rounding mode in the floating-point standard is round half to even: on an exact tie, pick the neighbour whose significand is even. The upper neighbour's is even, and the lower one's, the double nearest 0.3, is odd, so the result lands one unit in the last place above 0.3. Rounding toward zero and always rounding up are other modes, not the default, and the decimal value 0.3 plays no part in the decision.

## Question 10

In JavaScript, the length of a thumbs-up emoji with a skin-tone modifier is 4, but spreading it into an array gives an array of length 2. Why?

A, the first counts UTF-8 bytes, and the second counts characters. B, the first double-counts the emoji because of a V8 bug. C, the first counts code points, and the second counts grapheme clusters. D, the first counts UTF-16 units, and the second counts code points.

[think]

The answer is D: the first counts UTF-16 units, and the second counts code points.

Length counts UTF-16 units, and each of the two code points, the thumbs-up and the skin-tone modifier, lies above the basic range and needs a surrogate pair. Spreading iterates by code point, giving 2. The UTF-8 encoding would be 8 bytes, not 4. A human sees one grapheme cluster, and only a segmentation library counts that.

## Question 11

After calling a two-argument add function a hundred times with small integers, CPython's adaptive disassembly shows an integer-only add instruction where the original bytecode had the generic add. What happened?

A, the adaptive interpreter rewrote the instruction in place for the types it observed. B, Python re-parsed the function with type hints inferred from the calls. C, the JIT compiled the function to machine code, and the disassembler shows its name. D, the cached bytecode file on disk was regenerated with a faster opcode.

[think]

The answer is A: the adaptive interpreter rewrote the instruction in place for the types it observed.

The specialising interpreter keeps a counter in each instruction's inline cache, and when it fires, replaces the generic opcode with a version that guards only on the types it saw. It is still interpreted bytecode, not machine code. Nothing is re-parsed, and the cached file on disk still holds the generic form.

## Question 12

A CPU-bound Python job is rewritten to use eight threads, and it gets no faster. What is the most likely reason?

A, Python threads are green threads confined to one core. B, the job turns out to be I/O bound, not CPU bound. C, creating and switching Python threads is too slow. D, the global interpreter lock lets only one thread run bytecode at a time.

[think]

The answer is D: the global interpreter lock lets only one thread run bytecode at a time.

Python threads are real operating-system threads, but the interpreter lock serialises bytecode execution, so pure-Python CPU work does not spread across cores. Use processes, move the work into C code that releases the lock, as NumPy does, or use a free-threaded build.

## Recap

Three ideas kept coming back. Know where the bookkeeping lives: a fixed stack that segfaults into a guard page, a growable one in Go, a counter in CPython, and a heap that a collector reclaims only when nothing can reach it. Know when two names share one piece of memory: a Go slice with spare capacity, a shallow copy, a listener that keeps its closure alive. And know what the machine really stores and runs: 32-bit sums that wrap, doubles that round ties to even, strings with four lengths, and bytecode that specialises itself while one lock keeps the threads in line.

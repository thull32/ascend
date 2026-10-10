---
review: languages-for-senior-engineers
source: 0a02fb0c22a28736
---
## Introduction

Twelve questions from the languages-for-senior-engineers module: two each on Rust, Go, TypeScript, Python, the JVM, and choosing an interview language. Answer out loud before the answer comes.

## Question 1

You call the Argon2 password hash, which takes tens of milliseconds of CPU, directly inside an async handler, on a Tokio runtime with 8 worker threads. What happens under 8 simultaneous logins?

A, it fails to compile, because async code cannot call synchronous functions. B, all 8 workers are stuck hashing, so every other request waits. C, Tokio's 128-operation budget preempts the hashing and makes it yield. D, Tokio detects the blocking call and moves it to the blocking pool.

[think]

The answer is B: all 8 workers are stuck hashing, so every other request waits. Scheduling is cooperative: a task yields only by returning pending. The budget counts operations on Tokio's own resources, so a pure computation never touches it and holds its worker the whole time. Calling a synchronous function from async code compiles fine, which is why this bug reaches production; spawn blocking plus a bound on concurrency is the fix.

## Question 2

A teammate adds a payment-required variant to the app's error enum, with its error message attribute and nothing else. The function that gives each error its code, and the mapping to an HTTP status, both match on every variant with no wildcard. What happens?

A, the build fails at the code function and at the status match until each one handles it. B, it compiles, because the error-derive library works out an HTTP status from the message. C, it compiles, and the new variant falls into a default 500 arm at run time. D, it compiles, then panics the first time a handler returns the variant.

[think]

The answer is A: the build fails at both sites until each one handles it. Both matches are exhaustive with no wildcard, so the compiler lists every place that must decide a machine code and a status. A wildcard would have silently produced a default. The error-derive library only generates the display text and conversions; it knows nothing about HTTP.

## Question 3

On Go 1.27, with GOMAXPROCS set to one, one goroutine spins in an empty for loop forever, and main calls sleep for one millisecond. What happens?

A, main wakes after about 10 milliseconds, when the spinner is preempted. B, main never wakes, because the spinner never yields the only processor. C, main wakes after 1 millisecond, because timers run on their own thread. D, the runtime detects the loop and kills the spinning goroutine.

[think]

The answer is A: main wakes after about 10 milliseconds, when the spinner is preempted. Since Go 1.14, the sysmon thread asynchronously preempts a goroutine that has run for 10 milliseconds, so the sleeping goroutine gets the processor back; it was measured waking after 11 milliseconds. Before 1.14, a loop with no function calls could starve it forever. Timers fire on a processor, not a separate thread, which is why the one-millisecond sleep took 11.

## Question 4

A fan-out sends results on an unbuffered channel and returns early when the context expires. After 1,000 calls, each with two slow backends, the goroutine count is 2,000 higher. Why?

A, each straggler blocks forever on a send that nobody will receive. B, the runtime's deadlock detector is disabled inside a server. C, goroutines are pooled and reused, so the count never falls. D, the garbage collector has not yet run to reclaim the goroutines.

[think]

The answer is A: each straggler blocks forever on a send nobody will receive. A goroutine blocked on a send is reachable from the channel's wait queue and is never collected, so it lives until the process dies. Buffering the channel with one slot per sender left zero behind. The deadlock detector only fires when every goroutine is blocked, and goroutines are not pooled.

## Question 5

In TypeScript, an object literal with an ID of minus one and a kind of "status", but no message field, fails to compile when written with "satisfies" the runner response type, yet compiles when written with "as" the runner response type. Why?

A, satisfies runs a check at run time, while as is erased before running. B, as is checked by the linter instead of the compiler, so it passes the type check. C, satisfies requires the literal to conform, while as only requires the types to overlap. D, as widens the literal to the whole union, so nothing is checked at all.

[think]

The answer is C: satisfies requires conformance, and as only requires overlap. An object missing its message still overlaps the status response, which is enough for an assertion; satisfies demands the literal actually conform and reports the missing property. Both are erased entirely from the emitted JavaScript, so neither does anything at run time.

## Question 6

Node 24 can run a TypeScript file directly by stripping its types. Which file does it reject with an "unsupported TypeScript syntax" error?

A, one that declares a generic interface called Box. B, one that casts a string value to a branded user ID type with as. C, one that declares an enum called Level, with Low and High. D, one that uses satisfies on an object literal.

[think]

The answer is C: the file that declares an enum. Type stripping deletes type syntax and leaves JavaScript. Casts, interfaces, generics and satisfies erase cleanly, but an enum must generate a runtime object, so strip-only mode rejects it. TypeScript 5.8's erasable-syntax-only flag reports the same constructs at compile time.

## Question 7

In Python, Counter over the words "the cat is the is dog", asked for its two most common, returned "the" with 2, then "is" with 2. The problem wants ties broken alphabetically. Why is it wrong, and what fixes it?

A, most common sorts ties in reverse alphabetical order. B, Counter hashes strings, so its order is random. C, ties keep first-seen order, so key on negative count, then the word. D, most common drops ties, so call it with a larger k.

[think]

The answer is C: ties keep first-seen order, so key on negative count, then the word. Most common keys on the count alone, so equal counts come out in the order the words were first counted, which dict insertion order preserves. A key of negative count and then word, with nsmallest or sorted, gives count descending and word ascending. The order is deterministic, not random, and nothing is dropped.

## Question 8

In one Python script, assigning 257 to a and 257 to b, then asking "a is b", prints True. But asking whether the integer parsed from the string "257" is 257 gives False. Why?

A, the is operator compares values for literals and identities for computed integers. B, literals in one code object share a constant, while integers above 256 computed at run time are new objects. C, Python caches every integer below 1,000, but only for values created from literals. D, the int function always returns a copy, while assignment always shares the cached object.

[think]

The answer is B: literals in one code object share a constant, and run-time integers above 256 are new objects. The compiler stores one constant for equal literals in a code object, so both names refer to it. Only minus 5 to 256 are preallocated singletons. "Is" always compares identity, which is why double equals is the only safe equality for numbers.

## Question 9

A Java thread pool has a core size of 2, a maximum of 4, and a bounded array queue holding 2. Seven long tasks arrive at once. How does it respond?

A, four threads at once, two queued, then one rejection. B, four threads, three queued, since the maximum is reached first. C, two threads, two queued, two more threads, then one rejection. D, two threads, then five tasks queued, with no rejection.

[think]

The answer is C: two threads, two queued, two more threads, then one rejection. Execute starts threads up to the core size, then queues, and only starts threads beyond the core when the queue refuses the task; at the maximum with a full queue, it rejects. The JDK reported exactly this sequence. With an unbounded queue, the pool would never grow past two threads, which is the fixed-pool trap.

## Question 10

A Java worker loops on a plain boolean field that another thread sets to false. Measured, it was still spinning three seconds later, but it stopped at once with the JIT disabled. What explains the difference?

A, the write stays in the other thread's cache until that thread terminates. B, compiled loops run too fast for the operating system to deliver the update. C, the interpreter flushes CPU caches on every bytecode, which compiled code skips. D, the JIT hoisted the read out of the loop, and no happens-before edge forbade it.

[think]

The answer is D: the JIT hoisted the read out of the loop, and no happens-before edge forbade it. Without volatile, a lock or another happens-before edge, C2 may read the field once and keep it in a register, so the loop never sees the write; the interpreter happens to re-read the field each iteration. Hardware cache coherence would deliver the write; the problem is that compiled code never loads it again. Declaring the field volatile fixed it.

## Question 11

You have written Java daily for five years but solved only a handful of problems in Python. Your onsite is in three weeks, and nothing mandates a language. What is the strongest choice?

A, whichever language the interviewer uses, so they can follow. B, Java, because fluency outweighs Python's brevity on this timeline. C, Python, because its shorter solutions leave more time for testing. D, Rust, because an unusual choice signals depth and stands out.

[think]

The answer is B: Java, because fluency outweighs brevity on this timeline. Brevity only pays when the idioms are automatic. Three weeks is not enough to make Python fluent, while the tree map, the priority queue and the array deque are already in your fingers. The interviewer's own language does not matter for general rounds, and an unfamiliar language adds risk rather than signal.

## Question 12

In the six-language benchmark, Go's scheduler solution ran about three times slower than Rust's, with the same algorithm. Which mechanism explains most of the gap?

A, Go cannot sort slices without first copying them into a new array. B, Go's garbage collector pauses the program for each heap operation. C, Go compiles without optimisation unless a release flag is passed. D, Go's heap package takes values of the empty interface type, so each push boxes into an interface.

[think]

The answer is D: the heap package takes the empty interface type, so each push boxes into an interface. Each push converts the item to an interface value, which allocates, and every comparison is an indirect call through the interface, while Rust's binary heap stores pairs inline and compares with inlined code. Go's garbage collection pauses are sub-millisecond, and it optimises by default.

## Recap

Three ideas kept returning. The runtime underneath decides behaviour the code does not show: cooperative scheduling in Tokio, preemption and parked goroutines in Go, the JIT hoisting a read in Java. Types and compilers give guarantees only where you let them: exhaustive matches and satisfies catch mistakes, while casts, wildcards and erased types do not. And the costs that hurt are hidden ones: identity instead of equality, first-seen tie order, boxing into interfaces, and fluency lost to an unfamiliar language.

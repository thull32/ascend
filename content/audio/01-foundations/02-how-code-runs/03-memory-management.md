---
lesson: memory-management
source: 22b46bbe00e7178d
fit: great
desk:
  - "The reference-count trace that ends in a cycle, and the cycle collector's subtraction trick"
  - "The mark-sweep walk on a seven-object graph"
  - "The Go escape analysis listing, read decision by decision"
  - "The runtime trade-off table"
  - "Exercise: find the garbage with mark and sweep"
---
## Introduction

A Go service shows a saw-tooth on its memory graph and a latency spike every time the tooth drops. A Node worker's heap grows a few megabytes an hour until the container is killed for running out of memory on day three, even though JavaScript has garbage collection. A Python batch job that builds a large graph of objects takes twice as long as expected, and the profiler blames the garbage collector. A Rust program has none of these problems, and instead has a compile error you have spent forty minutes on.

All four are the same problem from different sides. Heap memory has to be reclaimed, someone has to decide when that is safe, and every strategy for deciding has a cost you pay somewhere. Knowing which strategy your runtime uses tells you where the cost will appear, and what a leak looks like in a language that supposedly cannot have one.

## The question every strategy answers

Memory is safe to reuse when no live code can reach it. The root set is everything the program reaches directly: local variables on every thread's stack, globals, registers. Anything reachable from a root by following pointers is live. Everything else is garbage.

Three families of answer. Reference counting: every object counts the references to it, and when the count hits zero, free it right away. Tracing: every so often, start from the roots, follow every pointer, and free whatever was not visited. And ownership: prove at compile time exactly when each value's single owner goes out of scope, and free it there, with no runtime bookkeeping at all.

CPython uses counting, with a tracing collector as a backup. V8, the JVM and Go trace. Rust uses ownership, with counting available as an opt-in.

## Reference counting and its blind spot

Every CPython object carries its count in its header. Every operation that creates or drops a pointer adjusts it, and the instant it reaches zero, the object is freed.

Here is the blind spot. Make two nodes, a and b. Point a at b, and b at a. Each now has a count of 2: its own name, plus the other node's pointer. Delete the name a: its count drops to 1, still held by b. Delete the name b: its count drops to 1, still held by a.

[pause]

Is anything reachable? No. Is either count zero? Also no. As far as counting is concerned, they keep each other alive forever. And cycles are common: doubly linked lists, trees with parent pointers, an exception that holds a traceback that holds the frame that holds the exception.

So CPython runs a cycle collector, with a neat subtraction trick. For every tracked container, copy its count into a scratch field. Then walk every container's outgoing pointers and subtract one from the scratch count of whatever they point at. What remains is the number of references coming from outside the group. For our two nodes, each started at 1, and each loses 1 to the other's pointer: both reach zero. Anything left above zero is reachable from outside and kept, along with everything it points to. The rest is garbage.

That collector is generational, and its pause grows with the number of tracked containers. That is why building millions of small objects shows the collector in a profile. The standard mitigations: disable it around a bulk-build phase, or freeze a large static dataset once it is loaded, so the collector stops rescanning it.

## Tracing, and why most objects die young

A tracing collector ignores counts. It marks everything reachable from the roots, then sweeps the heap, freeing everything unmarked. Two nodes that point only at each other are freed anyway, because reachability, not counting, is the test. Cycles cost nothing. And the mark phase costs in proportion to the live data, not the garbage: garbage is free to find, and only costs in the sweep.

The most important optimisation rests on an observation: most objects die young. A temporary string, a loop's tuple, a request's parsed body: garbage within microseconds. So collectors split the heap into a small young generation, collected very often, and a large old generation, collected rarely. A young collection only touches the few survivors, copies them, and declares the rest of the space empty in one step. Objects that survive a couple of young collections are promoted and mostly left alone.

One subtlety makes it work. An old object can point at a young one, say when you append a fresh item to a long-lived list. A young collection must not miss that pointer, and it cannot afford to scan the whole old generation. So the runtime inserts a write barrier on every pointer store, recording old-to-young pointers in a remembered set. That is a small tax on every field write, invisible in your source.

How the big runtimes differ. V8's young collection is on the order of a millisecond, its cost proportional to survivors. Its old-generation marking runs concurrently on helper threads. The JVM's default collector aims at a pause target of 200 milliseconds by default, while its low-latency collector keeps pauses typically under a millisecond, even on terabyte heaps, paying in throughput and memory instead.

## Go's choices

Go's collector is concurrent, non-generational and non-compacting. It runs alongside your program, with two stop-the-world pauses per cycle, each typically tens of microseconds. The cost moves elsewhere: during a cycle, it takes a quarter of your processors, and if your code allocates faster than marking keeps up, your goroutines are made to assist. That is where the collector shows up in a latency profile.

The main knob is GOGC. At its default of 100, the next cycle starts when the heap has grown 100 percent over the live heap measured at the end of the last one. With 1 gigabyte live, the trigger is near 2 gigabytes, the collection drops it back to 1, and the graph is a saw-tooth between those lines. That saw-tooth is normal. A leak is when the troughs rise over time. And if the container is tight, set GOMEMLIMIT a little under the container's limit, so the collector runs earlier as it approaches, rather than lowering GOGC, which costs CPU.

Why not generational? Because it needs a write barrier that is always on, and Go's escape analysis already keeps many short-lived values on the stack. The compiler decides per variable. A struct whose address is returned is moved to the heap, because the frame holding it dies at the return. A slice a function only reads from stays on the caller's stack. And passing a value through an interface, as every print call does, usually costs a heap allocation. So in a hot loop: return values rather than pointers to small structs, and avoid interface conversions.

## Ownership: Rust

Rust has no collector and no counts by default. Every value has exactly one owner, and when the owner goes out of scope, the value is dropped, recursively. The compiler inserts those drops, so the cost is exactly C's free, placed automatically, and impossible to forget or double.

What you give up is two owners, and that is where counting comes back. Rc gives shared ownership with a plain increment; Arc does the same across threads with an atomic one, which costs tens of cycles and bounces a cache line between cores when it is hot. Neither detects cycles, so a parent pointer in a tree must be a weak reference. The trade is compile-time effort for zero pauses, which is why Rust is chosen for latency-critical paths. And because nothing compacts, a long-running process can fragment, the one memory advantage a compacting collector like the JVM's still holds.

Across all of these, one rule: allocation rate is the knob. A tracing collector's total work grows with how often it runs, and that grows with how fast you allocate. A Go handler allocating 10 megabytes per request at a thousand requests a second forces several cycles a second. Reusing buffers might bring that to once a minute.

## Leaks in garbage-collected languages

A collector frees what is unreachable. It cannot free what is reachable but unwanted, and that is what a leak looks like in Python, JavaScript, Java and Go: not a missing free, but a reference somebody forgot to drop. The method is the same everywhere: take two heap snapshots minutes apart under steady load, and look at what grew.

The usual suspects. A cache or registry keyed by request or session ID with no eviction, which grows by definition; bound it. An event listener registered per request on a long-lived emitter and never removed, holding every closure it captured. In V8, closures created in one scope share one context object, so if any of them references a big buffer, all of them keep it alive. In Go, goroutines blocked forever on a channel with no partner, each holding its stack; give every goroutine a context it can be cancelled through. In Python, an unbounded LRU cache on a method, which keys on the instance and so keeps every instance alive. And in Java, thread-locals set per request on pooled threads, which outlive the request.

## In the interview

A follow-up the lesson expects: what does GOGC of 100 mean, and what would you change if a Go service was killed at 2 gigabytes with a 1 gigabyte live heap?

[pause]

The next cycle starts when the heap reaches twice the live size, so 1 gigabyte live legitimately peaks near 2. Set GOMEMLIMIT a little under the container's limit, so the collector runs earlier as it approaches, and only then consider a lower GOGC, which costs CPU. The wrong answer is "lower GOGC to 50", which halves the peak at the price of twice as many cycles, when the limit knob was designed for exactly this.

And another: why does CPython need a cycle collector if it already counts references? Because two objects pointing at each other hold each other's count at one after every outside reference is gone. The wrong answer is that the collector is for objects Python forgot to count. Every reference is counted.

## Recap

Four things to remember. Counting frees immediately but cannot see cycles; tracing handles cycles for free and costs in proportion to live data; ownership pays at compile time with no pauses. Most objects die young, so generational collectors scan a small nursery often, at the cost of a write barrier. A saw-tooth memory graph is normal; rising troughs are a leak, and allocation rate, not heap size, is the knob. And leaks in garbage-collected languages are reachable but unwanted: unbounded maps, listeners, shared closures, blocked goroutines.

At your desk: the cycle trace and the subtraction trick, the mark-sweep walk, the escape analysis listing, the trade-off table, and the mark-and-sweep exercise.

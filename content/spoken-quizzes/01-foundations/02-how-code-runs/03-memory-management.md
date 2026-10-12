---
lesson: memory-management
source: a782769b6a8390a8
---
## 1

Two CPython objects reference each other, and nothing else references them. What happens?

A, they are never freed, because reference counting cannot see cycles. B, they are kept at a count of 1 until the cyclic collector finds them. C, they are freed at once, when the last outside reference is dropped. D, they are rejected, because CPython raises an error on cycles.

[think]

The answer is B: they are kept at a count of 1 until the cyclic collector finds them.

Reference counting alone cannot see that the cycle is unreachable, because each object still has a count of 1, so nothing is freed immediately. The cyclic collector subtracts the internal references from the counts, finds both objects at zero, breaks the cycle, and lets reference counting free them.

## 2

A Go service's memory graph rises to about 2 gigabytes, drops to 1, and repeats every few seconds under steady load. Latency is fine. What is the most likely explanation?

A, goroutine stacks growing and shrinking under steady load. B, the kernel reclaiming page cache every few seconds. C, normal GOGC 100 collection cycles around a live heap of about 1 gigabyte. D, a leak that the garbage collector is only partly fixing.

[think]

The answer is C: normal GOGC 100 cycles around a live heap of about 1 gigabyte.

Go starts a collection when the heap has grown 100 percent beyond the live heap measured after the previous cycle, which produces exactly this saw-tooth around a 1 gigabyte live set. A leak would show the troughs rising over time. If the container is tight, GOMEMLIMIT caps the peaks.

## 3

Why do generational garbage collectors need a write barrier on pointer stores?

A, to trigger compaction of the young generation on write. B, to prevent data races between threads that store pointers. C, to remember old-to-young pointers for young collections. D, to count the references held by old-generation objects.

[think]

The answer is C: to remember old-to-young pointers for young collections.

A young collection traces only the young generation plus the roots, so an old object pointing at a young one would otherwise be missed, and the young object wrongly freed. The barrier records those old-to-young pointers in a remembered set, so the young collection finds them without scanning the whole old generation. It is bookkeeping for reachability, not reference counting.

## 4

A Node process's heap grows steadily for days until it is killed for running out of memory. Which of these is the least likely cause?

A, an event listener added per request and never removed. B, a module-level map keyed by request ID, never cleared. C, a repeating timer capturing a large object, never cleared. D, short-lived request objects that reference each other in cycles.

[think]

The answer is D: short-lived request objects that reference each other in cycles.

V8 is a tracing collector, so unreachable cycles are collected with no special handling. The other three keep objects reachable from a root, and that is exactly what a leak looks like in a garbage-collected language.

## 5

Go's escape analysis report says a local struct p was moved to the heap, in a function that returns the address of p. Why did the compiler decide that?

A, the address outlives the frame, so the value cannot stay there. B, the struct is larger than the 64 kibibyte stack allocation limit. C, taking any address in Go forces a heap allocation. D, structs in Go are always allocated on the heap.

[think]

The answer is A: the address outlives the frame, so the value cannot stay there.

Escape analysis moves a value to the heap when a pointer to it can survive the function, and a returned address does. Taking an address that stays inside the function does not escape, and small structs normally live on the stack. The 64 kibibyte rule applies to constant-size make calls, not to a small struct.

## 6

Which statement about Rust's memory management is accurate?

A, Rust reference-counts every value, preventing data races. B, Rust frees each value once, at a point fixed at compile time. C, Rust compacts its heap periodically to avoid fragmentation. D, Rust runs a lightweight garbage collector at each scope exit.

[think]

The answer is B: Rust frees each value once, at a point fixed at compile time.

Drops are inserted at compile time based on ownership, so there are no collection pauses, and nothing runs at scope exit except the inserted drop. Reference counting is opt-in, through Rc and Arc, for shared-ownership graphs. Rust's allocator does not compact, so fragmentation is possible in long-running processes.

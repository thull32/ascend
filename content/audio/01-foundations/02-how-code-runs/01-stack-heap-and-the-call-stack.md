---
lesson: stack-heap-and-the-call-stack
source: 850abcf7bd137509
fit: partial
desk:
  - "The byte-by-byte frame layout for a small C function"
  - "The three-frame factorial trace with stack pointer addresses"
  - "The glibc malloc steps and the struct padding examples"
  - "The recursion-limit table by runtime"
  - "The iterative pre-order and post-order code with a state marker"
  - "Exercise: compute a struct's size with alignment padding"
---
## Introduction

You write a clean recursive depth-first search over a tree. It passes every unit test. Then production feeds it a tree that is really a 50 thousand node chain. Python raises a recursion error. Node says the maximum call stack size was exceeded. A C++ service segfaults with no message at all. Go keeps going, because its stacks grow.

Same algorithm, four different outcomes. The difference is not the algorithm. It is where each runtime puts the bookkeeping for a function call.

Every variable lives in one of two places. The stack: a fixed-size region that grows and shrinks with function calls. Or the heap: an open-ended region managed by an allocator or a garbage collector. Which one your value lands in decides how fast it is to create, how long it lives, and whether a deep recursion will crash. Four ideas: why the stack is nearly free, what a frame holds, how each runtime fails when it runs out, and what you do about it.

## Two regions, two lifetimes

The stack is one contiguous block, 8 mebibytes for the main thread on Linux by default, with a single register, the stack pointer, marking the top. Calling a function moves the pointer down to reserve space. Returning moves it back up. That is the whole allocation strategy. Reserving 32 bytes of locals is one subtraction; freeing them is one addition. There is nothing to track, because whatever was allocated last is always freed first.

The heap has no such ordering. Objects are created and destroyed in any order, so something has to track which bytes are free: an allocator with free lists sorted by size, and in managed languages a garbage collector deciding when a block is dead. A heap allocation costs tens of nanoseconds on the fast path, and microseconds when the allocator has to ask the kernel for fresh pages. A stack allocation costs one instruction.

Lifetime is the other half. A stack value dies when its function returns. That is not a policy; it is a consequence of the pointer moving back up. So a value that must outlive the call that created it, or be shared by two callers, has to go on the heap. That one rule explains most of what each language does.

## What a frame holds

Picture a frame from the top down. At the top, the return address, pushed by the caller's call instruction: where to resume when this function finishes. Below it, the caller's saved frame pointer, so debuggers can walk back. Then the locals, each placed at an address divisible by its own size, with padding between them. And the whole frame is rounded so the stack pointer stays a multiple of 16 at every call.

Three details matter. The compiler owns the layout: with optimisation on, a small function may have no frame at all, so frame size is a property of the binary, not the source. The return address sits at a known offset just above the locals, so writing past the end of a local array overwrites it and lets an attacker choose where the function "returns". Stack canaries and address randomisation exist because of exactly this layout. And frames add up: an unoptimised recursive factorial in C uses 32 bytes per frame, so an 8 mebibyte stack holds about 262 thousand of them. Frame size times depth against the stack limit is the calculation to make before writing anything recursive over user-sized input.

The same alignment rules explain struct sizes. A struct of a one-byte char, then an 8-byte long, then a 4-byte int, is 24 bytes, because the long has to start at offset 8 and the end is padded to a multiple of 8. Put the long first, then the int, then the char, and it is 16. On a struct allocated ten million times, those 8 bytes are 80 megabytes. Rust reorders fields for you. C and Go keep your order.

## What each language puts on the stack

That picture is C. The languages you use daily bend it.

In C, C++ and Rust, locals of known size go on the stack. A Rust vector is three words on the stack, a pointer, a length and a capacity, and its elements live on the heap.

Go starts every local as a stack candidate and runs escape analysis. If a pointer to it could outlive the function, by being returned, captured by a goroutine, or stored somewhere that escapes, the value moves to the heap.

In Python, every value is a heap object, with a reference count and a type pointer. The interpreter's "stack" holds references to those objects. JavaScript is similar in spirit, although V8 stores small integers directly in the reference without allocating.

So in Python and JavaScript, "is this on the stack or the heap?" is the wrong question about a value. The right question is: how many objects does this line allocate? Every allocation is heap work and garbage-collector pressure.

## How recursion really fails

Four runtimes, four failure modes.

CPython counts Python frames and stops at 1,000 by default, with a recursion error you can catch. Node runs out of a stack of just under a mebibyte, usually somewhere around ten thousand frames, and throws a catchable range error. Go starts each goroutine at 2 kibibytes and doubles by copying whenever it runs out, up to a gigabyte, and past that it dies with a fatal error you cannot recover from. C, C++ and Rust have a fixed stack per thread: 8 mebibytes on the Linux main thread, 2 for threads Rust spawns. Run past it, and the process dies with a segmentation fault.

That last one is a page fault, not a counter. Below the stack sits a guard region with nothing mapped. The first store into it faults, the kernel has nowhere to send it, and you get a segfault. The signature is recognisable: the faulting address is right next to the stack pointer, and the backtrace shows the same function thousands of times. Rust catches that signal and prints that the thread has overflowed its stack before aborting.

The CPython limit is the one people misunderstand. Before 3.11, every Python call also used C stack, so raising the recursion limit to a million turned a clean error into a segfault. Since 3.11, pure Python-to-Python calls no longer use C stack, so a raised limit is honoured there. But any recursion that passes through C, an equality method on nested objects, deep copy, a C-accelerated decoder, can still overflow the real machine stack.

[pause]

So, does raising the recursion limit fix deep recursion? No. It moves the crash. On a path through C, it turns a catchable error into a segfault with no Python traceback.

And tail calls will not save you. A call that is the very last thing a function does could reuse its frame, and C compilers do this when they can. But CPython refuses on purpose, preferring real tracebacks, and V8 does not do it either. A tail-recursive sum in Node overflows at about ten thousand levels. If you need a loop, write a loop.

## Converting recursion to an explicit stack

Whenever the input can be deep, chain-shaped trees, long dependency paths, user-controlled nesting, the senior move is to carry the stack yourself, on the heap, where the only limit is memory.

For a pre-order walk that is easy. Keep a list of nodes. Pop one, visit it, push its children in reverse so the leftmost comes off first. It produces the same order as the recursive version, and handles a chain of ten million nodes with ten million list entries, where the recursive one dies at 1,000.

The harder case is recursion that does work after the call returns, like computing a tree's height as one plus the larger of its children's heights. Now the explicit stack must remember where you were in each frame. The standard trick: push each node with a flag saying whether its children are done. The first time you pop it, push it back with the flag set, then push its children. The second time, its children's results are ready, so compute its own. That flag is the return address. You have re-implemented the call stack by hand. It is uglier than the recursion; say so in an interview, while explaining why you are writing it anyway.

The same bug appears in parsers. A JSON document that is just a hundred thousand opening brackets is a few hundred kilobytes, and in a naive recursive-descent parser it is a stack overflow that takes down the process. Mature parsers cap nesting depth. Cap yours too.

## When this bites in production

A worker crashes on one specific input, and a retry fails identically. The traceback shows the same function hundreds of times; the input is a degenerate shape. Convert to an explicit stack, or cap the depth and reject the input with a clear error.

A program works on Ubuntu and segfaults inside an Alpine container on a path with a big local array. Alpine's C library gives threads 128 kibibyte stacks against glibc's 8 mebibytes, so a half-megabyte buffer on the stack overflows. Put large buffers on the heap.

A Java or native service cannot create threads while the machine has free memory. Each thread stack is a mapping plus a guard, and the process hits the kernel's mapping-count limit at roughly 32 thousand threads. Shrink stacks, cap the pool, or move to an async or goroutine model, where a task costs a few hundred bytes to a few kilobytes instead of megabytes of reservation.

## In the interview

A classic follow-up: why is stack allocation faster than heap allocation?

[pause]

Because lifetimes are nested, so the last thing allocated is always the first freed. Allocation is one subtraction and freeing is one addition: no free list, no header, no size-class lookup, no locking, and the top of the stack is almost always in the fastest cache. Heap allocation must find a free block of the right size, write a header, and eventually prove the block dead. The wrong answer is "stack memory is a faster kind of memory". It is the same RAM. The speed comes from the discipline, not the hardware.

And another: why do goroutines start with 2 kibibyte stacks when a thread gets 8 mebibytes? Because Go can grow a stack by copying it, fixing up pointers with the compiler's maps of which stack words are pointers. So it starts tiny and pays for a doubling only when needed, and a million goroutines cost gigabytes rather than terabytes of reservation. C cannot do that, because it does not know which words on its stack are pointers.

## Recap

Four things to remember. The stack is fast because of its discipline, last in first out, and anything that must outlive its call goes on the heap. A frame holds the return address, the saved frame pointer and aligned locals, and depth capacity is the stack size divided by the frame size. Each runtime fails differently: a catchable error at 1,000 frames in CPython, a segfault into a guard page in C and Rust, a growable stack in Go. And for deep or user-controlled input, carry an explicit stack, with a done flag for post-order, rather than raising the limit.

At your desk: the frame layout and the factorial trace, the allocator steps and struct padding, the recursion-limit table, the iterative traversal code, and the struct-size exercise.

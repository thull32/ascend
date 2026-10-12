---
lesson: stack-heap-and-the-call-stack
source: 697dad8c9b368006
---
## 1

A recursive C function has one local array of 8 kibibytes and no other significant locals. On a Linux main thread with the default 8 mebibyte stack, roughly how deep can it recurse before it overflows?

A, there is no limit: the array goes on the heap. B, around 1,000 frames deep. C, around 100 thousand frames deep. D, around 100 frames deep.

[think]

The answer is B: around 1,000 frames deep.

Each frame is a little over 8 kibibytes, so 8 mebibytes holds about 1,000 of them. A fixed-size local array in C, C plus plus or Rust lives in the frame itself. Only Python and JavaScript would put it on the heap.

## 2

In CPython 3.12 or later, you raise the recursion limit to one million, then run a pure-Python recursion 500 thousand levels deep. What is most likely to happen?

A, it raises a recursion error anyway, since CPython caps the limit. B, it segfaults, since every Python call also consumes C stack. C, it works, but it can still crash if the recursion passes through C code. D, CPython's tail-call optimisation turns it into a loop.

[think]

The answer is C: it works, but it can still crash if the recursion passes through C code.

Since 3.11, Python-to-Python calls do not consume C stack, so a raised counter is honoured for pure-Python recursion. Any path through C, such as special methods, deep copy or a C-implemented decoder, is guarded by a separate limit and can still overflow the real stack. "Every call consumes C stack" describes versions before 3.11, and CPython deliberately does no tail-call optimisation.

## 3

Why can a Go program recurse a million levels deep, while a Rust program with the same recursion aborts?

A, Rust allocates frames on the heap, which fills up sooner. B, Go performs tail-call elimination on recursive calls. C, Go's stacks grow by copying, while Rust's stacks are fixed in size. D, Go's compiler emits much smaller frames, so more of them fit.

[think]

The answer is C: Go's stacks grow by copying, while Rust's stacks are fixed in size.

Every Go function's prologue checks whether the goroutine's stack is about to overflow. If so, the runtime allocates a stack twice as large and copies the frames across, fixing up pointers using the compiler's stack maps. Rust, like C, reserves a fixed region per thread and runs into a guard page. Neither language guarantees tail-call elimination.

## 4

You are converting a recursive post-order tree traversal into an iterative one. What must the explicit stack store that a pre-order conversion does not need?

A, nothing extra: post-order is pre-order reversed. B, the parent pointer of every node along the current path. C, the depth of each node, to know when to unwind. D, a flag saying whether the node's children are already done.

[think]

The answer is D: a flag saying whether the node's children are already done.

Post-order does its work after the recursive calls return, so each stack entry has to record whether it is being visited for the first time or resumed. That marker plays the role of the return address. Reversing pre-order gives a post-order only for a binary tree with no side effects during the visit, which is a trick, not the general transformation.

## 5

On x86-64, a C struct holds a char c, then a long n, then an int i, in that order. What is its size, and why?

A, 13 bytes, the sum of the three field sizes. B, 32 bytes, with each field in its own 8-byte slot. C, 16 bytes, rounded up to two machine words. D, 24 bytes, with padding after c and after i.

[think]

The answer is D: 24 bytes, with padding after c and after i.

The long must start at an offset divisible by 8, so 7 bytes of padding follow the char. The int sits at offset 16, and then the struct is padded to a multiple of 8 so that arrays of it stay aligned, giving 24. Reordering the fields to long, int, char gives 16, because only 3 trailing bytes are needed. Fields are not each given a full word.

## 6

A native service dies with a segmentation fault. The kernel log shows the faulting address 16 bytes below the reported stack pointer, and the debugger shows the same function 40 thousand times. What happened?

A, a null pointer dereference inside the recursive function. B, the stack pointer ran into the guard page below the stack. C, the kernel's out-of-memory killer terminated the process. D, the heap allocator corrupted a chunk header during the recursion.

[think]

The answer is B: the stack pointer ran into the guard page below the stack.

A fault address right next to the stack pointer, plus a very deep, repetitive backtrace, is the signature of a stack overflow: the next frame's store landed in the unmapped guard region. A null dereference faults at a tiny address. Heap corruption usually surfaces inside the allocator's own functions. And the out-of-memory killer sends a kill signal, not a segmentation fault.

---
lesson: space-complexity-and-memory-hierarchy
source: a853f4a439bcbed4
fit: partial
desk:
  - "The three Fibonacci versions and the call-stack trace for fib of 4"
  - "The stack-limit table by runtime"
  - "The CPython object-size and million-element memory tables"
  - "The array versus linked list measurements, and the layout and loop-order code"
  - "Exercises: Fibonacci in constant space, and move zeroes in place"
---
## Introduction

A candidate writes a clean recursive solution and announces: "order n time, constant space". The interviewer asks how deep the recursion goes. It goes n deep. Every frame is on the stack, the stack is memory, and the answer was order n space all along.

That is the mild version of the problem. The stronger one comes from hardware. Two algorithms, both order n time and order n space: one walks an array, the other a linked list. On ten million elements, measured on one desktop machine, the array takes 2 milliseconds and the linked list takes 890. Nothing in the complexity analysis predicts a factor of 460.

Two halves, then. Counting space correctly, including the bytes the model does not see. And knowing when the count is not the cost: the memory hierarchy, arrays against linked lists, and layout.

## Counting space

Total space is everything the algorithm touches, including the input. Auxiliary space is the extra beyond the input. When someone asks for "the space complexity", they almost always mean auxiliary: it is what separates an in-place algorithm from one that copies.

Three things get counted. Explicit allocations: arrays, maps, strings you create. A frequency map over n elements with k distinct values is order k, which is constant if the values come from a fixed alphabet like 26 letters. Implicit copies: slicing a Python list allocates a new list; sorted returns a copy, while sort in place does not. And the third, the one people miss: the call stack. Every active call holds a frame. A recursion d deep uses order d stack.

For a balanced tree, that depth is log n. For a linked list or a degenerate tree, it is n. And here is a subtle one: naive recursive Fibonacci makes an exponential number of calls, but only one path from the root to a leaf is live at a time. Computing Fibonacci of 4 makes nine calls, yet never has more than four frames on the stack at once. The number of calls is the time. The peak depth is the space.

The fix for Fibonacci is the iterative version that keeps just the last two values: linear time, constant space. Keeping a whole table and only ever reading its last two entries, then shrinking it to two variables, is a standard space optimisation you will meet throughout dynamic programming.

## How deep can you go

The stack is finite, and its size is a runtime decision. CPython stops at 1,000 frames by default and raises a recursion error. Node and Java allow roughly ten thousand frames or so for a small function. C and Rust get 8 megabytes on the main thread, and past it the process dies. Go grows each goroutine's stack by copying, up to a gigabyte.

So a recursive walk over a linked list of 100 thousand nodes works in Go and fails at the defaults in CPython, Node and Java. That is why the iterative version with an explicit stack is the production form of every deep recursion. And raising the recursion limit only moves the crash to a deeper input.

Two more traps when you report space. Output does not count as auxiliary if the problem requires you to produce it: generating all subsets needs space for all subsets, and the interesting question is what you use beyond that. And "in place" on a mutable input is constant auxiliary space, but say whether you are allowed to destroy the caller's data.

## What a word of space really costs

The model counts words. CPython counts objects, and every object carries a header. A small integer is 28 bytes. A float is 24. An empty list is 56. A dictionary with three keys is 184 bytes before you count its values.

The number to carry: a Python object costs 16 bytes of header before it holds anything, a pointer to it costs another 8, and the allocator rounds every request up to a multiple of 16. So a list of a million distinct small integers takes about 40 megabytes, while a typed array of the same values takes 8. That five times gap is how "a million small records" becomes 2 gigabytes. Go and Rust have no per-value header: a million 64-bit integers is 8 megabytes.

## The memory hierarchy

The RAM model says every access costs one unit. Real machines have a hierarchy, and the cost of a read depends on where the data lives right now. The ratios are what to remember. The first-level cache, a few tens of kilobytes per core, answers in about a nanosecond. The last-level cache, tens of megabytes shared, in roughly 10 to 20. Main memory in about 100. An SSD in tens of microseconds. A miss to main memory costs as much as a few hundred arithmetic instructions.

Data moves between levels in cache lines, 64 bytes at a time on most current processors. When you read one byte, you get its 63 neighbours for free. If the next thing you need is one of them, it is already there. On top of that, the hardware prefetcher notices sequential patterns and fetches the next lines before you ask, so a linear scan rarely waits for memory at all.

That gives you the one principle that explains most performance surprises: locality. Code that accesses memory near what it just touched, or the same memory again soon, runs near cache speed. Code that jumps around runs at main-memory speed.

## Arrays versus linked lists, honestly

The textbook says a linked list has constant-time insertion while an array has linear, so lists win when you insert a lot. On modern hardware, arrays win almost every benchmark.

Here is why. An array of ten million integers is 80 megabytes of contiguous memory, and a scan touches each cache line once with the prefetcher running ahead. A linked list of ten million nodes is ten million separate allocations, each rounded up to 32 bytes, wherever the allocator put them. Walking it is a chain of dependent loads: you cannot fetch the next node until you have read the current one's pointer. The prefetcher cannot help, and every hop can be a full miss.

Now the measurements, in C, summing ten million integers. The array: about 2 milliseconds. A linked list whose nodes were allocated in order, in a fresh process: about 7, less than four times slower, because the addresses still advance predictably. The same list with its nodes scattered, which is what any long-running process has after allocations and frees interleave: 888 milliseconds. That is 460 times slower than the array. All of these are Theta of n.

[pause]

Which of those numbers would a quick micro-benchmark show you? The fresh one, at four times slower. That is exactly the misleading case.

So when do linked lists genuinely win? When you already hold a reference to the node and need to unlink it or move it to the front in constant time, as in an LRU cache, where a hash map hands you the node directly. When addresses must stay stable across insertions. And in lock-free queues, where linking a node with one atomic swap is the whole point. Inserting at an index is not on that list: you must first walk to the position, and the array's bulk shift of contiguous memory, at tens of gigabytes a second, usually wins. Rust's own documentation says it is almost always better to use a vector or a double-ended queue.

## Layout within an array

Locality is about bytes, not elements. Picture four million particle records, each 64 bytes, holding position, velocity, mass and colour, and a loop that only updates positions. Stored as an array of whole records, the loop drags mass and colour through the cache for nothing: it uses 16 bytes of every 64. Stored as separate arrays, one per field, it touches only what it needs. Measured in C, that is about 10 milliseconds against under 2: almost six times faster, for identical arithmetic. This is why numerical libraries, game engines and columnar databases all store fields in separate arrays.

Two-dimensional arrays have the same trap. A matrix stored row by row should be walked row by row. Walking it column by column touches a new cache line on every step. Summing a 256 megabyte matrix took 12 milliseconds by rows and 271 by columns: 23 times slower, same complexity, same arithmetic. Swapping the loop order is a free win.

And the model misses virtual memory. Pages are mapped lazily, so touching a fresh page costs a fault of about a microsecond. If your working set exceeds physical memory, a memory access becomes a disk access. Your working set, not your address space, is what must fit in RAM.

## In the interview

A follow-up the lesson expects. Both versions are order n. Why is the linked list a hundred times slower?

[pause]

The list traversal is a chain of dependent loads. Each next pointer must arrive before the following address is known, so neither the prefetcher nor out-of-order execution can overlap the misses, and after allocator churn most hops are 100 nanosecond main-memory accesses. The array streams sequentially at under a nanosecond per element. The wrong answer is "pointer dereferences are slower than indexing", which is true by a factor of one or two, not a hundred.

And another: a million records at about 100 bytes each should be 100 megabytes, so why is the process at 2 gigabytes? In Python each record is a dictionary with its own table, and its values are boxed objects with headers and allocator rounding, so five to fifteen times inflation is normal. The fix is a typed or columnar layout, or slots classes. The wrong answer is "a memory leak", diagnosed without measuring one record.

## Recap

Four things to remember. Count the call stack as space, unprompted: log n for a balanced tree, n for a list, and know where your runtime overflows, 1,000 frames in CPython. In a managed language, count objects, not values: 16 bytes of header before anything is stored. The hierarchy runs from about 1 nanosecond in the first-level cache to about 100 in main memory, so two order n algorithms can differ by 50 to 500 times. And arrays beat linked lists because sequential access prefetches and dependent loads cannot, unless you already hold the node.

At your desk: the Fibonacci versions and stack trace, the stack-limit and object-size tables, the array and list measurements with the layout code, and the two exercises.

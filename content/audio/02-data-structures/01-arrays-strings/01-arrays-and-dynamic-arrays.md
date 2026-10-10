---
lesson: arrays-and-dynamic-arrays
source: 76533945c3e987ee
fit: partial
desk:
  - "The doubling table through five appends, and the growth visualiser"
  - "CPython's over-allocation trace, resize by resize, with the getsizeof values"
  - "The five-runtime table of growth rules, headers and bytes per element"
  - "The remove-duplicates write-pointer visualiser"
  - "The three ways to build a list, as code, and the production failure table"
  - "Exercises: implement a doubling dynamic array, and reproduce CPython's capacities"
---
## Introduction

You call append on a list a million times, and it takes about 30 milliseconds. You call insert at the front a million times, and it takes tens of seconds, possibly minutes. Both are "add one element to a list". The difference is not the language or the library. It is what contiguous memory allows and what it forbids, and every list, vector, buffer and string you have ever used inherits those rules.

Three ideas. How an index becomes a memory address, and why that makes scanning fast. Why append is constant time only on average, and what each runtime does about it. And what it really costs, in bytes, to insert anywhere but the end.

## An index is an address

A fixed array of n elements, each s bytes wide, is one run of consecutive bytes. Element i lives at the base address plus i times s. That is one multiply and one add, whatever n is. Reading element 500 thousand costs the same as reading element zero: at most one cache miss, roughly 100 nanoseconds from main memory, or about one nanosecond if it is already in the fastest cache.

Contiguity buys a second thing, which matters even more in practice: locality. The CPU fetches memory in 64-byte cache lines, so reading the first four-byte integer pulls the next fifteen in with it. And the hardware prefetcher notices a sequential walk and fetches ahead. Scanning 10 million integers in an array runs close to memory bandwidth.

Scanning 10 million linked list nodes costs a cache miss per node. Both scans are order n. The array is 10 to 50 times faster, depending on how scattered the nodes are. Hold onto that: the asymptotic cost is identical, and the constant factor is all memory access.

## What a dynamic array is

A fixed block cannot grow, because the bytes after it belong to someone else. So a dynamic array, whether it is Python's list, Rust's Vec, Java's ArrayList or a JavaScript array, is three things: a pointer to a block, the number of elements in use, called the length, and the size of the block, called the capacity.

Append writes into the slot at position length, and bumps the length. Constant time, unless length equals capacity. Then it allocates a bigger block, copies every element across, frees the old block, and only then appends. That one append is order n.

Here is the smallest example, said aloud. Start empty and double whenever you are full. The first append allocates one slot and copies nothing. The second grows to two and copies one element. The third grows to four and copies two. The fourth fits. The fifth grows to eight and copies four. Five appends, seven copies in total.

Continue that to a million appends and you get 21 resizes, and just over a million copies in total. Fewer than one copy per append, on top of the one write each append does anyway. That is what "constant time amortised" means concretely. The average append costs under two element moves, even though one particular append, number 524 thousand and change, copies more than half a million elements on its own.

Before I tell you, think about the alternative. What if you grow by a fixed 10 slots each time instead of doubling?

[pause]

Then there are n over 10 resizes, and each one copies everything so far: 10, then 20, then 30, all the way up to n. That adds up to about n squared over 20. A million appends copy 50 billion elements, and your "constant time append" is now linear. Geometric growth is what makes the number of resizes logarithmic and the total copying linear.

## How runtimes actually grow

CPython does not double. Its rule is: the new length, plus one eighth of it, plus 6, rounded down to a multiple of 4. Appending from empty, the capacities go 4, 8, 16, 24, 32, 40, 52, 64. For large lists that is a growth factor of about 1.125.

So CPython resizes far more often. A million appends cost 86 resizes instead of doubling's 21. In exchange, the final list has only about 5.6 percent spare slots, where a doubling array can be half empty right after a resize. It gets away with the extra resizes because reallocating a block above glibc's mmap threshold uses a call named mremap, which moves page table entries rather than bytes. Many of those 86 copies copy nothing.

Other runtimes pick other points. Java's ArrayList grows by half again, starting at 10. Rust's Vec doubles, starting at 4. Go doubles below 256 elements, then eases toward 1.25 times. V8 takes the length needed, adds half of it, and adds 16.

Why not grow four times? Memory. Right after a resize, a four-times array is 75 percent empty, a doubling array 50 percent, a 1.5 array a third. And there is a subtler argument, the one Facebook's folly library makes for choosing 1.5. With doubling, the blocks you freed earlier never add up to the next request, so the allocator can never reuse them. With 1.5, they can, after four reallocations.

The habit that falls out of this: if you know n, pre-size. In Rust, Go and Java, that skips every copy and every allocation pause that would otherwise land somewhere unpredictable in your latency histogram. In CPython, it changes nothing you can measure. The lesson built a million-element list three ways: append took 31 milliseconds, a pre-sized list filled by index took 39, and the built-in list of a range took 23. The 86 cheap reallocations are noise under a million interpreted loop iterations. Being able to explain why pre-sizing matters in Go and not in Python is a senior signal.

## The cost of the front

Everything that is not at the end has to move memory. Insert at position i shifts everything after i one slot to the right. Insert at the front, or pop from the front, shifts everything.

Put bytes on it. A CPython list of a million elements is a million 8-byte pointers. One insert at the front moves 8 megabytes: 125 thousand cache lines read and 125 thousand written, about 16 megabytes of memory traffic, for one call. On the author's machine, with the whole block in cache, that took about 70 microseconds. On a list too big for any cache, it ran at main memory bandwidth, and one call took about 4.6 milliseconds.

Now do it in a loop. The shifts add up to n squared over 2. The lesson drained lists with pop from the front: 25 thousand elements in 13 milliseconds, 50 thousand in 52, 100 thousand in 207. Each time n doubles, the time quadruples. That is the signature of quadratic work. A deque drained the same 100 thousand elements in 2.2 milliseconds.

This is the most common accidental quadratic in production code: a queue built from a list, drained with pop zero in Python or shift in JavaScript. It looks like one cheap line. Its latency grows with load, and you find it in production instead of in review. The fix is a deque, a ring buffer, or a head index you advance instead of shifting.

## What a list really holds

Here is the trap that surprises people most. A Python list of numbers is not a block of numbers. It is a block of pointers, and each integer is a separate object, 28 bytes for a small int, somewhere else on the heap. That is about 36 bytes per element, and every step of a scan dereferences a pointer.

Java's ArrayList of Integer has the same shape: a 4-byte reference plus a 16-byte boxed Integer per value, about five times a plain int array. The honest contiguous arrays are Python's array module, NumPy, JavaScript's typed arrays, and Rust and Go, which store values inline.

Two more traps from other runtimes. In V8, an array has an elements kind, such as packed small integers or packed doubles, and it only ever moves toward a more general kind. Write past the end of an array, or create one with new Array of n and never fill it, and it becomes holey: every access now checks whether the slot exists, forever. And in Go, a slice is a view. Take a sub-slice, append to it inside a helper, and if there is spare capacity, the append writes straight into the caller's backing array. The caller's data changes with no visible write.

One more cost, about memory limits. A copying resize needs the old block and the new block alive at the same time. A Go slice or Java array growing from 1.2 gigabytes to 2.4 peaks at 3.6, and a container gets killed while its live data sits at 60 percent of the limit.

## When a plain array wins

A senior reflex is often not to reach for anything fancier. Keys that are small dense integers, like bytes or HTTP status codes, make an array a perfect hash table with zero hashing. Below roughly 50 elements, a linear scan of a contiguous array beats a hash lookup: a few cache lines, no hashing, no probing, no allocation. Sorting, binary search and scanning all want contiguity. And an array of n fixed-size records is exactly n times s bytes, with no per-node overhead.

The array loses in three specific cases. Many insertions or deletions far from the end. Elements that must keep a stable address while others move, because a resize invalidates every pointer into the block. And removing an arbitrary element in constant time given only a handle to it. That is the linked list's territory.

## In the interview

A follow-up the lesson expects. Is append constant time?

[pause]

Constant time amortised. One individual append can be linear when it triggers a resize, and in a latency-sensitive loop that one call is a visible spike. If the spike matters, pre-size, or use a structure that never copies, like a chunked deque. The common wrong answer is "yes, always".

And another. A list of 10 million Python ints uses about 360 megabytes. Why, and what would you do? It is 8 bytes of pointer plus 28 bytes of int object, about 36 bytes per element. A NumPy array of 64-bit ints, or Python's array module, stores them at 8 bytes each, 80 megabytes, and a NumPy reduction runs in compiled code at memory bandwidth. The wrong answer is "ints are 8 bytes, so 80 megabytes".

And if you hold a pointer into an array and then push to it? If the push resized, the old block was freed and your pointer dangles. Store indices, not pointers, into growable arrays.

## Recap

Four things to remember. An index is an address, base plus i times the element size, and contiguity gives you cache lines and prefetching, which is why an array scan beats a linked list scan by 10 to 50 times at the same order n. Append is constant time amortised because growth is geometric; grow by a constant and it becomes quadratic. Anything not at the end moves memory: one front insert on a million pointers is 8 megabytes, and a loop of them is n squared over 2, the queue-as-a-list bug. And a Python list or a Java list of boxed integers is an array of pointers, four to five times the memory of the raw values.

At your desk: the doubling and CPython growth traces, the five-runtime table, the write-pointer visualiser, the three-ways code, and the two exercises, a doubling dynamic array and CPython's capacities.
